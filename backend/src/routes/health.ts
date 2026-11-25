import express, { Request, Response } from 'express';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { APP_VERSION } from '@/utils/version.js';

const router = express.Router();

// Basic health check
router.get('/', catchAsync(async (req: Request, res: Response) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: APP_VERSION
  };
  
  res.status(200).json(healthcheck);
}));

// Detailed health check with database
router.get('/detailed', catchAsync(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check database connection
  let dbStatus = 'down';
  let dbLatency = 0;
  
  try {
    const dbStart = Date.now();
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (!error) {
      dbStatus = 'up';
      dbLatency = Date.now() - dbStart;
    }
  } catch (error) {
    dbStatus = 'error';
  }
  
  // Check external services (if configured)
  const externalServices = {
    tesseract: config.ocr.tesseractPath ? 'configured' : 'not_configured',
    persona: config.externalApis.persona ? 'configured' : 'not_configured',
    onfido: config.externalApis.onfido ? 'configured' : 'not_configured'
  };
  
  const healthcheck = {
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: APP_VERSION,
    responseTime: Date.now() - startTime,
    services: {
      database: {
        status: dbStatus,
        latency: dbLatency
      },
      storage: {
        provider: config.storage.provider,
        status: 'unknown' // Would need specific checks per provider
      },
      externalServices
    },
    features: {
      sandboxMode: config.sandbox.enabled,
      mockVerification: config.sandbox.mockVerification,
      gdprCompliance: config.compliance.gdprCompliance,
      rateLimiting: true
    },
    memory: {
      used: process.memoryUsage().heapUsed / 1024 / 1024,
      total: process.memoryUsage().heapTotal / 1024 / 1024,
      external: process.memoryUsage().external / 1024 / 1024
    }
  };
  
  const statusCode = healthcheck.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthcheck);
}));

// Ready check (for Kubernetes readiness probe)
router.get('/ready', catchAsync(async (req: Request, res: Response) => {
  try {
    // Quick database check
    await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: 'Database not available' });
  }
}));

// Live check (for Kubernetes liveness probe)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

export default router;