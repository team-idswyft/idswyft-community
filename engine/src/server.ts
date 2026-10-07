/**
 * Idswyft Engine Worker — ML Verification Extraction Service
 *
 * Standalone Express server handling the 3 heavy ML extraction operations:
 *   POST /extract/front  — OCR + face detection + tamper analysis
 *   POST /extract/back   — Barcode/PDF417 + MRZ detection
 *   POST /extract/live   — Face detection + liveness + deepfake analysis
 *
 * Designed to run as a separate container from the core API,
 * keeping the API image lightweight (~250MB) while this worker
 * carries the heavy ML dependencies (~1.5GB).
 */

import './instrument.js';
import crypto from 'node:crypto';
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import { logger } from '@/utils/logger.js';
import { configureSharedLogger } from '@idswyft/shared';
import extractRouter from '@/routes/extract.js';

const app = express();

// Wire shared-package logger to engine's logger instance
configureSharedLogger(logger);
const PORT = parseInt(process.env.PORT || '3002');
const HOST = process.env.HOST || '127.0.0.1';
const SERVICE_TOKEN = process.env.ENGINE_SERVICE_TOKEN || '';
if (!SERVICE_TOKEN) throw new Error('ENGINE_SERVICE_TOKEN is required for the native identity engine');

// JSON body parsing (for metadata fields)
app.use(express.json({ limit: '1mb' }));

// The ML engine is an internal trust boundary. It is never exposed directly
// to browsers; only the Testagram API may call extraction endpoints.
app.use('/extract', (req, res, next) => {
  const supplied = req.header('X-Engine-Service-Token') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(SERVICE_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: 'Unauthorized engine client' });
  }
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'testagram-identity-engine', uptime: process.uptime() });
});

// Extraction routes
app.use('/extract', extractRouter);

// Sentry error handler — must be registered before any other error middleware
Sentry.setupExpressErrorHandler(app);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled engine error', {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    success: false,
    error: 'Internal engine error',
    message: err.message,
  });
});

app.listen(PORT, HOST, () => {
  logger.info(`Engine worker listening on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

export default app;
