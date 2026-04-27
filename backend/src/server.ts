import './instrument.js';
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { buildCorsOptions } from './middleware/cors.js';
import { conditionalCsrf } from './middleware/csrf.js';
import { serveLocalFile, servePublicAsset } from './middleware/fileServing.js';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { connectDB, supabase } from './config/database.js';
import { verifyApiKeySecretStability } from './config/apiKeySecretGuard.js';
import { generateAPIKey, authenticateAPIKey } from './middleware/auth.js';
import { apiActivityLogger } from './middleware/apiLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { createGracefulShutdown } from './utils/gracefulShutdown.js';
import { configureSharedLogger } from '@idswyft/shared';
import newVerificationRoutes from './routes/newVerification.js';
import developerRoutes from './routes/developer/index.js';
import adminRoutes from './routes/admin.js';
import adminThresholdsRoutes from './routes/admin-thresholds.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhooks.js';
import vaasRoutes from './routes/vaas.js';
import handoffRoutes from './routes/handoff.js';
import batchRoutes from './routes/batch.js';
import addressVerificationRoutes from './routes/addressVerification.js';
import monitoringRoutes from './routes/monitoring.js';
import statusRoutes from './routes/status.js';
import setupRoutes from './routes/setup.js';
import pageConfigRoutes from './routes/pageConfig.js';
import credentialRoutes from './routes/credentials.js';
import complianceRoutes from './routes/compliance.js';
import wellKnownRoutes from './routes/well-known.js';
import vaultRoutes from './routes/vault.js';
import { getApiDocsMarkdown } from './api-docs/apiDocsMarkdown.js';
import systemRoutes from './routes/system.js';
import { APP_VERSION } from './utils/version.js';

const app = express();

// Wire shared-package logger to backend's Winston instance
configureSharedLogger(logger);

// Trust proxy for production deployment (Railway, etc.)
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Allow inline scripts only in development (for Vite HMR)
        ...(config.nodeEnv === 'development' ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
      ],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles used by Tailwind/Recharts
      imgSrc: ["'self'", "data:", "blob:"],    // blob: for canvas face detection
      connectSrc: [
        "'self'",
        // Allow Supabase storage and configured frontend origins
        ...[config.supabase.url, ...config.corsOrigins].filter(Boolean),
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],           // blob: for live capture video
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],          // Web workers for TF.js
      ...(config.nodeEnv === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
    // Report-only in local dev only; enforce in staging + production
    reportOnly: config.nodeEnv === 'development',
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// Prevent CDN (Railway/Fastly) from caching preflight responses.
// Must run BEFORE cors() because cors() ends OPTIONS responses immediately.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// CORS — explicit allowlist only, no wildcard pattern matching
app.use(cors(buildCorsOptions(config)));

// Basic middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequestsPerDev,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// API activity logging middleware
app.use('/api', apiActivityLogger);

// Mount API routes
app.use('/api/v2/verify', newVerificationRoutes);
app.use('/api/verify/handoff', handoffRoutes);
// Cookie-authenticated route groups — enforce CSRF on mutations when auth cookie present
app.use('/api/developer', conditionalCsrf, developerRoutes);
app.use('/api/admin', conditionalCsrf, adminRoutes);
app.use('/api/admin/thresholds', conditionalCsrf, adminThresholdsRoutes);
app.use('/api/auth', conditionalCsrf, authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/vaas', vaasRoutes);
app.use('/api/v2/batch', batchRoutes);
app.use('/api/v2/verify', addressVerificationRoutes);
app.use('/api/v2/verify', pageConfigRoutes);
app.use('/api/v2/monitoring', monitoringRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/v2/verify', credentialRoutes);
app.use('/api/v2', credentialRoutes);
app.use('/api/v2/compliance', conditionalCsrf, complianceRoutes);
app.use('/api/v2/vault', vaultRoutes);
app.use('/.well-known', wellKnownRoutes);
app.use('/api/system', conditionalCsrf, systemRoutes);

// Public asset serving (branding logos, avatars) — no auth, folder-scoped in handler
// For local: serves directly from filesystem. For S3: proxies via download.
if (config.storage.provider === 'local' || config.storage.provider === 's3') {
  app.get('/api/public/assets/*', servePublicAsset);
}

// Local file serving — authenticated with API key, path traversal blocked in serveLocalFile
if (config.storage.provider === 'local') {
  app.get('/api/files/*', authenticateAPIKey, serveLocalFile);
}

// Health check endpoint (bare /health for Railway health checks + /api/health for API consumers)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: config.nodeEnv
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: config.nodeEnv
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Idswyft Identity Verification API',
    version: APP_VERSION,
    status: 'running',
    environment: config.nodeEnv,
    documentation: '/api/docs',
    health: '/api/health'
  });
});

// LLM-friendly markdown documentation — self-hosted deployments see their own domain
app.get('/api/docs/markdown', (req, res) => {
  let baseUrl = 'https://api.idswyft.app';
  const rawProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(rawProto) ? rawProto[0] : rawProto)?.split(',')[0]?.trim() || req.protocol;
  const rawHost = req.headers['x-forwarded-host'] || req.headers['host'];
  const hostStr = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  if (hostStr && (proto === 'http' || proto === 'https') && /^[a-zA-Z0-9._-]+(:\d+)?$/.test(hostStr)) {
    baseUrl = `${proto}://${hostStr}`;
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(getApiDocsMarkdown(baseUrl));
});

// API documentation endpoint - clean, user-facing routes
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Idswyft API Documentation',
    version: APP_VERSION,
    generated: new Date().toISOString(),
    endpoints: {
      health: {
        'GET /api/health': 'Health check endpoint'
      },
      verification: {
        'POST /api/v2/verify/initialize': 'Start a new verification session',
        'POST /api/v2/verify/:id/front-document': 'Upload front of ID document for OCR extraction',
        'POST /api/v2/verify/:id/back-document': 'Upload back of ID for barcode/MRZ extraction + auto cross-validation',
        'POST /api/v2/verify/:id/live-capture': 'Upload selfie for liveness detection + auto face matching',
        'GET /api/v2/verify/:id/status': 'Get complete verification status and results',
      },
      handoff: {
        'POST /api/verify/handoff/create': 'Create mobile handoff session',
        'GET /api/verify/handoff/session/:token': 'Retrieve handoff session by token',
        'PATCH /api/verify/handoff/complete/:token': 'Mark handoff session as complete',
        'GET /api/verify/handoff/status/:handoffId': 'Poll handoff completion status',
      },
      developer: {
        'POST /api/developer/register': 'Register as a developer',
        'POST /api/developer/api-key': 'Create new API key',
        'GET /api/developer/api-keys': 'List API keys',
        'DELETE /api/developer/api-key/:id': 'Delete API key',
        'GET /api/developer/stats': 'Get usage statistics',
        'GET /api/developer/activity': 'Get API activity logs'
      },
      admin: {
        'GET /api/admin/verifications': 'List all verifications (admin)',
        'GET /api/admin/verification/:id': 'Get verification details (admin)',
        'PUT /api/admin/verification/:id/review': 'Update verification review (admin)',
        'GET /api/admin/stats': 'Get admin statistics'
      },
      webhooks: {
        'POST /api/webhooks/register': 'Register webhook URL',
        'GET /api/webhooks': 'List registered webhooks',
        'DELETE /api/webhooks/:id': 'Delete webhook',
        'POST /api/webhooks/:id/test': 'Test webhook delivery'
      },
      auth: {
        'POST /api/auth/login': 'Admin login',
        'POST /api/auth/logout': 'Admin logout',
        'GET /api/auth/me': 'Get current user info'
      }
    },
    authentication: {
      'API Key': 'Include X-API-Key header with your API key',
      'Admin': 'Include Authorization header with Bearer token'
    },
    notes: {
      'Rate Limiting': 'All endpoints are rate limited',
      'CORS': 'Cross-origin requests are supported',
      'Verification Flow': '5-step pipeline: front-document → back-document (auto cross-validation) → live-capture (auto face-match) → status',
      'Hard Rejection': 'Any gate failure produces an immediate hard rejection — the session cannot proceed'
    }
  });
});



// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: '/api/docs'
  });
});

// Sentry error handler — must be registered before any other error middleware
Sentry.setupExpressErrorHandler(app);

// Error handling middleware — delegates to full handler in middleware/errorHandler.ts
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await connectDB();

    // Verify API_KEY_SECRET hasn't changed (would break all existing API keys)
    await verifyApiKeySecretStability(config.apiKeySecret);

    // Ensure source-separated storage buckets exist (vaas-documents, demo-documents)
    try {
      const { StorageService } = await import('./services/storage.js');
      await new StorageService().ensureBucketsExist();
      console.log('🪣 Source-separated storage buckets verified');
    } catch (err) {
      logger.warn('Failed to verify storage buckets (non-blocking):', err);
    }

    // Start HTTP server
    const server = app.listen(config.port, async () => {
      console.log(`🚀 Idswyft API server running on port ${config.port}`);
      console.log(`📚 API Documentation: http://localhost:${config.port}/api/docs`);
      console.log(`💻 Environment: ${config.nodeEnv}`);
      console.log(`🔒 CORS: ${config.corsOrigins.length} origin(s) configured`);
      
      if (config.sandbox.enabled) {
        console.log('🧪 Sandbox mode enabled');
      }
      
      // Start consistency monitor in production
      if (config.nodeEnv === 'production') {
        const { consistencyMonitor } = await import('@/services/consistencyMonitor.js');
        consistencyMonitor.start(300000); // 5 minute intervals
        console.log('🔍 Verification consistency monitor started');
      }

      // Temp file cleanup — runs every 15 minutes, deletes files older than 1 hour
      const { TempCleanupService } = await import('./services/tempCleanup.js');
      const tempCleaner = new TempCleanupService();
      setInterval(async () => {
        await tempCleaner.cleanup({ maxAgeMs: 60 * 60 * 1000 });
      }, 15 * 60 * 1000);

      // Data retention cron — enforces DATA_RETENTION_DAYS in production
      if (config.nodeEnv === 'production' && config.compliance.dataRetentionDays > 0) {
        const cron = await import('node-cron');
        const { DataRetentionService } = await import('@/services/dataRetention.js');
        const retentionService = new DataRetentionService();

        cron.schedule('0 2 * * *', async () => {
          logger.info('Running data retention cleanup', {
            retentionDays: config.compliance.dataRetentionDays,
          });
          try {
            const count = await retentionService.runRetentionCleanup(
              config.compliance.dataRetentionDays
            );
            logger.info(`Data retention cleanup complete: ${count} users cleaned`);
          } catch (err) {
            logger.error('Data retention cleanup failed', { error: err });
          }
        });

        logger.info('Data retention scheduler started', {
          retentionDays: config.compliance.dataRetentionDays,
          schedule: '0 2 * * * (daily at 2 AM UTC)',
        });
      }

      // Demo data cleanup cron — runs hourly, deletes ephemeral demo verifications
      {
        const cron = await import('node-cron');
        const { DataRetentionService } = await import('@/services/dataRetention.js');
        const demoRetentionService = new DataRetentionService();

        cron.schedule('0 * * * *', async () => {
          try {
            const count = await demoRetentionService.runDemoCleanup(
              config.sandbox.retentionHours
            );
            if (count > 0) {
              logger.info(`Demo cleanup: ${count} verifications deleted`);
            }
          } catch (err) {
            logger.error('Demo cleanup cron failed', { error: err });
          }
        });

        logger.info('Demo cleanup scheduler started', {
          retentionHours: config.sandbox.retentionHours,
          schedule: '0 * * * * (hourly)',
        });
      }

      // Activity log cleanup — runs daily at 1 AM UTC, deletes logs older than 7 days
      {
        const cron = await import('node-cron');
        const { DataRetentionService } = await import('@/services/dataRetention.js');
        const activityRetentionService = new DataRetentionService();

        cron.schedule('0 1 * * *', async () => {
          try {
            await activityRetentionService.runActivityLogCleanup(7);
          } catch (err) {
            logger.error('Activity log cleanup cron failed', { error: err });
          }
        });

        logger.info('Activity log cleanup scheduler started', {
          retentionDays: 7,
          schedule: '0 1 * * * (daily at 1 AM UTC)',
        });
      }

      // Webhook payload cleanup — daily at 3:30 AM UTC, nullifies PII from deliveries older than 30 days
      {
        const cron = await import('node-cron');
        const { DataRetentionService } = await import('@/services/dataRetention.js');
        const webhookRetentionService = new DataRetentionService();

        cron.schedule('30 3 * * *', async () => {
          try {
            const count = await webhookRetentionService.runWebhookPayloadCleanup(30);
            if (count > 0) {
              logger.info(`Webhook payload cleanup: ${count} deliveries scrubbed`);
            }
          } catch (err) {
            logger.error('Webhook payload cleanup cron failed', { error: err });
          }
        });

        logger.info('Webhook payload cleanup scheduler started', {
          retentionDays: 30,
          schedule: '30 3 * * * (daily at 3:30 AM UTC)',
        });
      }

      // Monitoring cron — daily at 3 AM UTC: check expiring documents + process due re-verifications
      if (config.nodeEnv === 'production') {
        const cron = await import('node-cron');
        const {
          checkExpiringDocuments,
          processScheduledReverifications,
        } = await import('@/services/monitoringService.js');

        cron.schedule('0 3 * * *', async () => {
          logger.info('Running document expiry check');
          try {
            const expiryResult = await checkExpiringDocuments();
            logger.info('Document expiry check complete', expiryResult);
          } catch (err) {
            logger.error('Document expiry check failed', { error: err });
          }

          logger.info('Running scheduled re-verification processing');
          try {
            const reVerResult = await processScheduledReverifications();
            logger.info('Scheduled re-verification processing complete', reVerResult);
          } catch (err) {
            logger.error('Scheduled re-verification processing failed', { error: err });
          }
        });

        logger.info('Monitoring scheduler started', {
          schedule: '0 3 * * * (daily at 3 AM UTC)',
        });
      }
    });

    // ─── Graceful shutdown (S2.7) ─────────────────────────────────
    // Railway sends SIGTERM and gives 30s before SIGKILL. We aim for 25s
    // (the createGracefulShutdown default) so there's a small buffer. The
    // factory handles the drain sequence and idempotency; see
    // utils/gracefulShutdown.ts for the orchestration logic.
    const sb = supabase as any;
    const dbPoolEnd =
      sb?.pool?.end && typeof sb.pool.end === 'function'
        ? () => sb.pool.end()
        : undefined;

    const gracefulShutdown = createGracefulShutdown({
      server,
      dbPoolEnd,
      exit: (code) => process.exit(code),
      log: logger,
    });

    process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
    process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

    // uncaughtException: process state is undefined after this — V8 heap
    // may be corrupt, in-flight requests could be reading stale globals or
    // committing half-state. We still call server.close() to stop NEW
    // connections (and finish the small set of in-flight requests that
    // can complete cleanly), but cap the wait at 2s instead of the
    // 25s SIGTERM budget — much shorter than the 25s SIGTERM budget so
    // we don't continue shipping potentially-corrupt responses to live
    // users while we wait.
    const UNCAUGHT_FORCE_EXIT_MS = 2000;
    process.on('uncaughtException', (err) => {
      console.error('uncaughtException:', err);
      logger.error('uncaughtException', {
        message: err.message,
        stack: err.stack,
      });
      void gracefulShutdown('uncaughtException', 1, UNCAUGHT_FORCE_EXIT_MS);
    });

    // unhandledRejection: policy configurable via env var. Default 'log' to
    // match the conservative posture this codebase has historically held —
    // many fire-and-forget background jobs produce these and crashing on
    // them would kill the API. Operators who prefer Node's modern default
    // (crash on unhandled rejection) can set UNHANDLED_REJECTION_POLICY=crash.
    const unhandledRejectionPolicy = (process.env.UNHANDLED_REJECTION_POLICY ?? 'log').toLowerCase();
    process.on('unhandledRejection', (reason) => {
      console.error('unhandledRejection:', reason);
      logger.error('unhandledRejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        policy: unhandledRejectionPolicy,
      });
      if (unhandledRejectionPolicy === 'crash') {
        // Same emergency-shutdown semantics as uncaughtException.
        void gracefulShutdown('unhandledRejection', 1, UNCAUGHT_FORCE_EXIT_MS);
      }
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;