/**
 * Batch Verification Routes
 *
 * Enterprise API for processing multiple verifications at once.
 * All endpoints are API-key authenticated and scoped to the developer.
 */

import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateAPIKey, checkSandboxMode } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import {
  createBatch,
  processBatch,
  getBatchStatus,
  getBatchResults,
  cancelBatch,
  listBatches,
  type BatchItemInput,
} from '@/services/batchVerification.js';

const router = express.Router();

/**
 * POST /api/v2/batch/upload
 * Create a new batch verification job.
 */
router.post('/upload',
  authenticateAPIKey,
  checkSandboxMode,
  [
    body('items')
      .isArray({ min: 1, max: 1000 })
      .withMessage('Items must be an array with 1-1000 entries'),
    body('items.*.user_id')
      .isUUID()
      .withMessage('Each item must have a valid user_id UUID'),
    body('items.*.document_type')
      .optional()
      .isIn(['passport', 'drivers_license', 'national_id'])
      .withMessage('Invalid document type'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developerId = (req as any).developer.id;
    const items: BatchItemInput[] = req.body.items;

    const job = await createBatch(developerId, items);

    // Start async processing (fire-and-forget)
    processBatch(job.id, async (item: BatchItemInput) => {
      // Each batch item creates a verification via the internal service.
      // For now, we initialize a verification record — actual document
      // processing requires uploaded files (URLs in input_data).
      const { supabase } = await import('@/config/database.js');
      const { data, error } = await supabase
        .from('verification_requests')
        .insert({
          user_id: item.user_id,
          developer_id: developerId,
          status: 'pending',
          document_type: item.document_type || 'drivers_license',
          is_sandbox: req.isSandbox || false,
        })
        .select('id')
        .single();

      if (error || !data) throw new Error('Failed to create verification');
      return data.id;
    }).catch(err => {
      logger.error(`Batch ${job.id} processing error:`, err);
    });

    res.status(201).json({
      success: true,
      batch_id: job.id,
      status: 'pending',
      total_items: job.total_items,
      message: 'Batch created and processing started',
    });
  })
);

/**
 * GET /api/v2/batch/:id/status
 * Get batch job progress.
 */
router.get('/:id/status',
  authenticateAPIKey,
  [
    param('id').isUUID().withMessage('Batch ID must be a valid UUID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developerId = (req as any).developer.id;
    const job = await getBatchStatus(req.params.id, developerId);

    if (!job) {
      throw new NotFoundError('Batch job');
    }

    res.json({
      batch_id: job.id,
      status: job.status,
      total_items: job.total_items,
      processed_items: job.processed_items,
      succeeded_items: job.succeeded_items,
      failed_items: job.failed_items,
      progress_percentage: job.total_items > 0
        ? Math.round((job.processed_items / job.total_items) * 100)
        : 0,
      created_at: job.created_at,
      completed_at: job.completed_at,
    });
  })
);

/**
 * GET /api/v2/batch/:id/results
 * Get individual item results for a batch job.
 */
router.get('/:id/results',
  authenticateAPIKey,
  [
    param('id').isUUID().withMessage('Batch ID must be a valid UUID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developerId = (req as any).developer.id;
    const results = await getBatchResults(req.params.id, developerId);

    if (results.length === 0) {
      // Check if job exists
      const job = await getBatchStatus(req.params.id, developerId);
      if (!job) throw new NotFoundError('Batch job');
    }

    res.json({ results });
  })
);

/**
 * POST /api/v2/batch/:id/cancel
 * Cancel a batch job. Completed items are unaffected.
 */
router.post('/:id/cancel',
  authenticateAPIKey,
  [
    param('id').isUUID().withMessage('Batch ID must be a valid UUID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developerId = (req as any).developer.id;
    const cancelled = await cancelBatch(req.params.id, developerId);

    if (!cancelled) {
      const job = await getBatchStatus(req.params.id, developerId);
      if (!job) throw new NotFoundError('Batch job');
      return res.status(400).json({
        error: 'Cannot cancel batch',
        message: `Batch is already ${job.status}`,
      });
    }

    res.json({
      success: true,
      message: 'Batch cancellation initiated',
    });
  })
);

/**
 * GET /api/v2/batch
 * List developer's batch jobs.
 */
router.get('/',
  authenticateAPIKey,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developerId = (req as any).developer.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const { jobs, total } = await listBatches(developerId, page, limit);

    res.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

export default router;
