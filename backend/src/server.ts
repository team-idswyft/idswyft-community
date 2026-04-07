import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { buildCorsOptions } from './middleware/cors.js';
import { conditionalCsrf } from './middleware/csrf.js';
import { serveLocalFile } from './middleware/fileServing.js';
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
import { API_DOCS_MARKDOWN } from './api-docs/apiDocsMarkdown.js';

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
app.use('/api/v2/compliance', complianceRoutes);
app.use('/.well-known', wellKnownRoutes);

// Local file serving — authenticated with API key, path traversal blocked in serveLocalFile
if (config.storage.provider === 'local') {
  app.get('/api/files/*', authenticateAPIKey, serveLocalFile);
}

// Health check endpoint (bare /health for Railway health checks + /api/health for API consumers)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Idswyft Identity Verification API',
    version: '1.0.0',
    status: 'running',
    environment: config.nodeEnv,
    documentation: '/api/docs',
    health: '/api/health'
  });
});

// LLM-friendly markdown documentation
app.get('/api/docs/markdown', (_req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(API_DOCS_MARKDOWN);
});

// API documentation endpoint - clean, user-facing routes
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Idswyft API Documentation',
    version: '1.0.0',
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

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`Received ${signal}. Starting graceful shutdown...`);
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;