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

import 'dotenv/config';
import express from 'express';
import { logger } from '@/utils/logger.js';
import { configureSharedLogger } from '@idswyft/shared';
import extractRouter from '@/routes/extract.js';

const app = express();

// Wire shared-package logger to engine's logger instance
configureSharedLogger(logger);
const PORT = parseInt(process.env.PORT || '3002');

// JSON body parsing (for metadata fields)
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'idswyft-engine', uptime: process.uptime() });
});

// Extraction routes
app.use('/extract', extractRouter);

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

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Engine worker listening on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

export default app;
