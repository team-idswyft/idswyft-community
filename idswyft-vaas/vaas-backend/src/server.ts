import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './config/index.js';
import { connectVaasDB, vaasSupabase } from './config/database.js';
import { sessionExpirationService } from './services/sessionExpirationService.js';
import { seedPlatformAdmin } from './scripts/seedPlatformAdmin.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { logger } from './utils/logger.js';

// Import routes
console.log('📦 Importing route modules...');
import organizationRoutes from './routes/organizations.js';
import organizationMainApiRoutes from './routes/organization-main-api.js';
import apiKeysRoutes from './routes/api-keys.js';
import auditLogsRoutes from './routes/audit-logs.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import verificationRoutes from './routes/verifications.js';
import webhookRoutes from './routes/webhooks.js';
import adminSecretRoutes from './routes/admin-secrets.js';
import adminThresholdsRoutes from './routes/admin-thresholds.js';
import assetsRoutes from './routes/assets.js';
import publicRoutes from './routes/public.js';
import platformAuthRoutes from './routes/platformAuth.js';
import platformOrgRoutes from './routes/platformOrganizations.js';
import platformEmailRoutes from './routes/platformEmail.js';
import platformBrandingRoutes from './routes/platformBranding.js';
import platformSessionsRoutes from './routes/platformSessions.js';
import platformProviderMetricsRoutes from './routes/platformProviderMetrics.js';
import platformAuditLogsRoutes from './routes/platformAuditLogs.js';
import samlRoutes from './routes/saml.js';
import notificationRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import providerMetricsRoutes from './routes/admin-provider-metrics.js';

console.log('📧 Importing email routes...');
import emailUtilRoutes from './routes/email-utils.js';
console.log('✅ Email routes imported:', !!emailUtilRoutes);

const app = express();

// Trust proxy for production deployment (Railway)
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
const supabaseHost = (() => {
  try { return new URL(config.vaasDatabase.url).host; }
  catch { return 'placeholder.supabase.co'; }
})();

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", `https://${supabaseHost}`],
      connectSrc: ["'self'", `https://${supabaseHost}`],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    }
  }
}));

// CORS configuration for VaaS domains
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, server-to-server)
    if (!origin) {
      console.log(`CORS: No origin header, allowing request`);
      return callback(null, true);
    }
    
    console.log(`CORS request from origin: ${origin}, NODE_ENV: ${config.nodeEnv}`);
    console.log(`Configured origins: ${config.corsOrigins.join(', ')}`);
    
    // In development, allow all localhost and local network origins
    if (config.nodeEnv === 'development') {
      if (origin.startsWith('http://localhost:') || 
          origin.startsWith('http://127.0.0.1:') ||
          origin.match(/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/)) {
        console.log(`✅ CORS: Allowing development origin: ${origin}`);
        return callback(null, origin); // Return the actual origin instead of true
      }
    }
    
    // Check against configured VaaS origins
    if (config.corsOrigins.indexOf(origin) !== -1) {
      console.log(`✅ CORS: Allowing configured origin: ${origin}`);
      return callback(null, origin); // Return the actual origin instead of true
    }
    
    // Allow Railway-generated domains for VaaS services
    if (origin.match(/^https:\/\/.*\.up\.railway\.app$/)) {
      // Only allow VaaS-related Railway domains
      if (origin.match(/vaas|admin|customer|enterprise/i)) {
        console.log(`✅ CORS: Allowing Railway VaaS origin: ${origin}`);
        return callback(null, origin);
      }
    }
    
    console.log(`❌ CORS: Rejecting origin: ${origin}`);
    return callback(new Error(`Not allowed by CORS: ${origin}`), false);
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With', 'Idempotency-Key', 'X-Sandbox-Mode']
}));

// Debug middleware to log all requests in development
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`\n=== ${req.method} ${req.originalUrl} ===`);
    console.log(`Origin: ${req.headers.origin || 'No origin header'}`);
    console.log(`User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`);
    console.log(`Content-Type: ${req.headers['content-type'] || 'Not set'}`);
    console.log(`Authorization: ${req.headers.authorization ? 'Present' : 'Not present'}`);
    console.log(`X-API-Key: ${req.headers['x-api-key'] ? 'Present' : 'Not present'}`);
    
    // Log response headers after they're set
    const originalSend = res.send;
    res.send = function(body) {
      console.log(`Response Status: ${res.statusCode}`);
      console.log(`Access-Control-Allow-Origin: ${res.get('Access-Control-Allow-Origin') || 'Not set'}`);
      console.log(`=== END REQUEST ===\n`);
      return originalSend.call(this, body);
    };
    
    next();
  });
}

// Stripe webhook — must be registered BEFORE express.json() so we receive the raw Buffer
// for HMAC signature verification (express.json() would parse the body and break the sig check)
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const { BillingService } = await import('./services/billingService.js');
      const billing = new BillingService();
      const event = await billing.handleWebhook(req.body as Buffer, req.headers['stripe-signature'] as string);

      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          // Update org subscription status in DB (handled by webhookService)
          break;
        }
        case 'invoice.payment_succeeded': {
          // Record successful payment (can extend to increment usage credits)
          break;
        }
      }

      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
);

// Basic middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for VaaS API
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequestsPerOrg,
  message: 'Too many requests from this organization, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limiting for authentication endpoints (brute-force protection)
app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/refresh', authRateLimit);
app.use('/api/platform/auth/login', authRateLimit);

// Health check endpoint — probes DB connectivity, returns diagnostics in non-production
app.get('/health', async (req, res) => {
  let dbStatus: 'connected' | 'error' = 'error';
  let dbLatencyMs: number | null = null;

  try {
    const start = Date.now();
    const { count, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('*', { count: 'exact', head: true });
    dbLatencyMs = Date.now() - start;
    dbStatus = error ? 'error' : 'connected';
  } catch {
    dbStatus = 'error';
  }

  const healthy = dbStatus === 'connected';
  const base = {
    status: healthy ? 'healthy' : 'degraded',
    service: 'idswyft-vaas-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  };

  // In production, only expose status — no memory/latency fingerprinting
  if (config.nodeEnv === 'production') {
    return res.status(healthy ? 200 : 503).json(base);
  }

  const mem = process.memoryUsage();
  res.status(healthy ? 200 : 503).json({
    ...base,
    environment: config.nodeEnv,
    uptime_seconds: Math.floor(process.uptime()),
    db: { status: dbStatus, latency_ms: dbLatencyMs },
    memory: {
      rss_mb: Math.round(mem.rss / 1048576),
      heap_used_mb: Math.round(mem.heapUsed / 1048576),
      heap_total_mb: Math.round(mem.heapTotal / 1048576),
    },
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Idswyft VaaS (Verification as a Service) API',
    service: 'idswyft-vaas-backend',
    version: '1.0.0',
    status: 'running',
    environment: config.nodeEnv,
    documentation: '/api/docs',
    health: '/health'
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Idswyft VaaS API Documentation',
    version: '1.0.0',
    description: 'Verification as a Service - Enterprise identity verification platform',
    generated: new Date().toISOString(),
    domains: {
      'api-vaas.idswyft.app': 'VaaS Backend API',
      'app.idswyft.app': 'Business Admin Dashboard',
      'customer.idswyft.app': 'End-user Verification Portal',
      'enterprise.idswyft.app': 'VaaS Marketing Site'
    },
    endpoints: {
      health: {
        'GET /health': 'Health check endpoint'
      },
      organizations: {
        'POST /api/organizations': 'Create new organization',
        'GET /api/organizations/:id': 'Get organization details',
        'PUT /api/organizations/:id': 'Update organization',
        'DELETE /api/organizations/:id': 'Delete organization',
        'GET /api/organizations/main-api-keys': 'List organization main API keys',
        'POST /api/organizations/main-api-keys': 'Create main API key for verification',
        'DELETE /api/organizations/main-api-keys/:keyId': 'Revoke main API key'
      },
      'vaas-api-keys': {
        'GET /api/api-keys': 'List VaaS API keys for organization',
        'POST /api/api-keys': 'Create new VaaS API key',
        'GET /api/api-keys/:keyId': 'Get specific VaaS API key',
        'PUT /api/api-keys/:keyId': 'Update VaaS API key',
        'DELETE /api/api-keys/:keyId': 'Delete VaaS API key',
        'POST /api/api-keys/:keyId/rotate': 'Rotate VaaS API key',
        'GET /api/api-keys/:keyId/usage': 'Get API key usage statistics'
      },
      'audit-logs': {
        'GET /api/organizations/:orgId/audit-logs': 'List audit logs for organization',
        'GET /api/organizations/:orgId/audit-logs/stats': 'Get audit log statistics',
        'POST /api/organizations/:orgId/audit-logs': 'Create new audit log entry',
        'GET /api/organizations/:orgId/audit-logs/export': 'Export audit logs (CSV/JSON)'
      },
      admins: {
        'POST /api/auth/login': 'Admin login',
        'POST /api/auth/logout': 'Admin logout', 
        'GET /api/auth/me': 'Get current admin info',
        'POST /api/admins': 'Create admin user',
        'GET /api/admins': 'List organization admins',
        'PUT /api/admins/:id': 'Update admin user',
        'DELETE /api/admins/:id': 'Delete admin user'
      },
      verifications: {
        'POST /api/verifications/start': 'Start verification session',
        'GET /api/verifications': 'List verifications',
        'GET /api/verifications/:id': 'Get verification details',
        'PUT /api/verifications/:id/review': 'Manual review verification',
        'POST /api/verifications/:id/approve': 'Approve verification',
        'POST /api/verifications/:id/reject': 'Reject verification'
      },
      users: {
        'POST /api/users': 'Create end user',
        'GET /api/users': 'List end users',
        'GET /api/users/:id': 'Get user details',
        'PUT /api/users/:id': 'Update user',
        'DELETE /api/users/:id': 'Delete user'
      },
      webhooks: {
        'POST /api/webhooks': 'Create webhook',
        'GET /api/webhooks': 'List webhooks',
        'PUT /api/webhooks/:id': 'Update webhook',
        'DELETE /api/webhooks/:id': 'Delete webhook',
        'POST /api/webhooks/:id/test': 'Test webhook delivery'
      },
      analytics: {
        'GET /api/analytics/dashboard': 'Dashboard analytics',
        'GET /api/analytics/usage': 'Usage analytics',
        'GET /api/analytics/performance': 'Performance metrics',
        'GET /api/analytics/export': 'Export analytics data'
      },
      billing: {
        'GET /api/billing/usage': 'Current usage',
        'GET /api/billing/invoices': 'List invoices',
        'GET /api/billing/subscription': 'Subscription details',
        'POST /api/billing/upgrade': 'Upgrade subscription'
      }
    },
    authentication: {
      'JWT Bearer Token': 'Include Authorization: Bearer <token> header',
      'API Key': 'Include X-API-Key header (for webhook/integration endpoints)'
    },
    pricing: {
      starter: '$299/month + $2 per verification (up to 500)',
      professional: '$799/month + $1.50 per verification (up to 2000)', 
      enterprise: '$2499/month + $1 per verification (unlimited)'
    },
    notes: {
      'Multi-tenancy': 'All data is isolated per organization',
      'Rate Limiting': 'API requests are rate limited per organization',
      'Webhooks': 'Real-time event notifications with automatic retries',
      'Integration': 'Uses main Idswyft API for verification processing'
    }
  });
});

// Mount API routes with debug logging
console.log('🔗 Mounting API routes...');
// Mount specific routes before parameterized routes to avoid conflicts
app.use('/api/organizations', organizationMainApiRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/organizations', auditLogsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminSecretRoutes);
app.use('/api/admin/thresholds', adminThresholdsRoutes);
app.use('/api/admin/provider-metrics', providerMetricsRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);

// Mount public routes for customer portal (no authentication required)
console.log('🌐 Mounting public routes...');
app.use('/api/public', publicRoutes);
console.log('✅ Public routes mounted successfully');

console.log('📧 Mounting email routes...');
try {
  app.use('/api/email', emailUtilRoutes);
  console.log('✅ Email routes mounted successfully');
} catch (error) {
  console.error('❌ Failed to mount email routes:', error);
}

// Mount SAML SSO routes (public + protected)
app.use('/api/auth/saml', samlRoutes);

// Mount platform admin routes (separate auth domain)
console.log('🏗️ Mounting platform admin routes...');
app.use('/api/platform/auth', platformAuthRoutes);
app.use('/api/platform/organizations', platformOrgRoutes);
app.use('/api/platform/email', platformEmailRoutes);
app.use('/api/platform/branding', platformBrandingRoutes);
app.use('/api/platform/sessions', platformSessionsRoutes);
app.use('/api/platform/provider-metrics', platformProviderMetricsRoutes);
app.use('/api/platform/audit-logs', platformAuditLogsRoutes);
console.log('✅ Platform admin routes mounted');

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    data: {
      availableEndpoints: '/api/docs'
    }
  });
});

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('VaaS API Error', { error: err.message, stack: err.stack, path: req.originalUrl });
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details || []
      }
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication credentials'
      }
    });
  }
  
  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
        details: err.detail
      }
    });
  }
  
  // Default error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.nodeEnv === 'development' ? err.message : 'Something went wrong'
    }
  });
});

// Start server
const startVaasServer = async () => {
  try {
    // Test VaaS database connection
    await connectVaasDB();

    // Seed first platform admin if table is empty
    await seedPlatformAdmin();

    // Start session expiration background jobs
    console.log('⏰ Starting session expiration service...');
    sessionExpirationService.startExpirationJob(5); // Check every 5 minutes
    sessionExpirationService.startCleanupJob(24, 30); // Clean up daily, 30-day retention
    console.log('✅ Session expiration service started');
    
    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`🚀 Idswyft VaaS API server running on port ${config.port}`);
      console.log(`📚 API Documentation: http://localhost:${config.port}/api/docs`);
      console.log(`💻 Environment: ${config.nodeEnv}`);
      console.log(`🔒 CORS Origins: ${config.corsOrigins.join(', ')}`);
      console.log(`🏢 Service: Verification as a Service (VaaS)`);
      
      if (config.nodeEnv === 'development') {
        console.log('🧪 Development mode enabled');
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`Received ${signal}. Starting graceful VaaS server shutdown...`);
      server.close(() => {
        console.log('VaaS HTTP server closed');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    return server;
  } catch (error) {
    logger.error('Failed to start VaaS server', { error });
    process.exit(1);
  }
};

// Start the VaaS server
startVaasServer();

export default app;