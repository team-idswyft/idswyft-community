/**
 * Batch Verification Routes
 *
 * Enterprise API for processing multiple verifications at once.
 * All endpoints are API-key authenticated and scoped to the developer.
 *
 * Unlike single verifications, batch items cannot perform live capture
 * (head-turn liveness challenge). Processed items therefore always end
 * at `manual_review` status, requiring a human to approve or reject.
 */

import express, { Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateAPIKey, checkSandboxMode } from '@/middleware/auth.js';
import { catchAsync, NotFoundError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
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
import { supabase } from '@/config/database.js';
import { StorageService } from '@/services/storage.js';
import { VerificationService } from '@/services/verification.js';
import engineClient from '@/services/engineClient.js';
import { VerificationSession } from '@/verification/session/VerificationSession.js';
import { VerificationStatus } from '@idswyft/shared';
import type { FrontExtractionResult, BackExtractionResult, SessionState } from '@idswyft/shared';
import { computeFaceMatch } from '@/verification/face/faceMatchService.js';
import { getFaceMatchingThresholdSync } from '@/config/verificationThresholds.js';
import { validateDownloadUrl } from '@/utils/validateUrl.js';

const router = express.Router();
const storageService = new StorageService();
const verificationService = new VerificationService();

// ─── Batch item processing ──────────────────────────────────

const DOWNLOAD_TIMEOUT = 30_000; // 30 seconds
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Download a file from a URL and return its buffer. */
async function downloadFile(url: string): Promise<Buffer> {
  validateDownloadUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_SIZE) throw new Error('File exceeds 10MB limit');
    const ab = await response.arrayBuffer();
    if (ab.byteLength > MAX_FILE_SIZE) throw new Error('File exceeds 10MB limit');
    return Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
  }
}

/** Save session state to verification_contexts table. */
async function saveSessionState(verificationId: string, state: Readonly<SessionState>): Promise<void> {
  // Strip biometric data (GDPR Article 9) — embeddings only needed in-memory for face match
  const sanitized: any = JSON.parse(JSON.stringify(state));
  if (sanitized.front_extraction) sanitized.front_extraction.face_embedding = null;
  if (sanitized.live_capture) sanitized.live_capture.face_embedding = null;

  await supabase.from('verification_contexts').upsert({
    verification_id: verificationId,
    context: JSON.stringify(sanitized),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'verification_id' });
}

/**
 * Process a single batch item through the verification pipeline.
 *
 * Flow: create record → download docs → engine extraction → gates + cross-validation → manual_review
 * If any gate hard-rejects, the item is marked as 'failed' (which is correct — bad documents fail).
 */
async function processBatchItem(
  item: BatchItemInput,
  developerId: string,
  isSandbox: boolean,
): Promise<string> {
  // 1. Create verification record
  const record = await verificationService.createVerificationRequest({
    user_id: item.user_id,
    developer_id: developerId,
    is_sandbox: isSandbox,
    source: 'api',
  });
  const vId = record.id;

  try {
    let frontResult: FrontExtractionResult | null = null;
    let backResult: BackExtractionResult | null = null;

    // 2. Download + process front document
    if (item.front_document_url) {
      const buffer = await downloadFile(item.front_document_url);
      const docPath = await storageService.storeDocument(
        buffer, 'front_document.jpg', 'image/jpeg', vId,
      );
      const doc = await verificationService.createDocument({
        verification_request_id: vId,
        file_path: docPath,
        file_name: 'front_document.jpg',
        file_size: buffer.length,
        mime_type: 'image/jpeg',
        document_type: item.document_type || 'drivers_license',
      });
      await supabase.from('verification_requests').update({ document_id: doc.id }).eq('id', vId);

      if (engineClient.isEnabled()) {
        frontResult = await engineClient.extractFront(buffer, {
          documentId: doc.id,
          documentType: item.document_type || 'drivers_license',
          verificationId: vId,
        });
      }
    }

    // 3. Download + process back document
    if (item.back_document_url) {
      const buffer = await downloadFile(item.back_document_url);
      const docPath = await storageService.storeDocument(
        buffer, 'back_document.jpg', 'image/jpeg', vId,
      );
      await verificationService.createDocument({
        verification_request_id: vId,
        file_path: docPath,
        file_name: 'back_document.jpg',
        file_size: buffer.length,
        mime_type: 'image/jpeg',
        document_type: 'other',
        is_back_of_id: true,
      });

      if (engineClient.isEnabled()) {
        backResult = await engineClient.extractBack(buffer);
      }
    }

    // 4. Run verification session (gates + cross-validation) if we have results
    if (frontResult) {
      const deps = {
        extractFront: async () => frontResult!,
        extractBack: async () => backResult!,
        processLiveCapture: async () => { throw new Error('Not available in batch mode'); },
        computeFaceMatch,
        faceMatchThreshold: getFaceMatchingThresholdSync(isSandbox),
      };
      const session = new VerificationSession(deps, { session_id: vId });

      // Submit front → Gate 1
      await session.submitFront(Buffer.alloc(0));

      // Submit back → Gate 2 + auto cross-validation → Gate 3
      if (backResult) {
        await session.submitBack(Buffer.alloc(0));
      }

      await saveSessionState(vId, session.getState());

      // If gates hard-rejected, mark as failed and return
      const state = session.getState();
      if (state.current_step === VerificationStatus.HARD_REJECTED) {
        await supabase.from('verification_requests').update({
          status: 'failed',
          failure_reason: state.rejection_detail || 'Rejected by quality gates',
        }).eq('id', vId);
        return vId;
      }
    }

    // 5. Final status → manual_review (no live capture possible in batch)
    await supabase.from('verification_requests').update({
      status: 'manual_review',
    }).eq('id', vId);

    return vId;
  } catch (err: any) {
    // Mark the verification as failed on unexpected errors
    await supabase.from('verification_requests').update({
      status: 'failed',
      failure_reason: err.message || 'Batch processing error',
    }).eq('id', vId);
    throw err;
  }
}

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
    body('items.*.front_document_url')
      .optional()
      .isURL()
      .withMessage('front_document_url must be a valid URL'),
    body('items.*.back_document_url')
      .optional()
      .isURL()
      .withMessage('back_document_url must be a valid URL'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const items: BatchItemInput[] = req.body.items;

    const job = await createBatch(developerId, items);

    const isSandbox = req.isSandbox || false;

    // Start async processing (fire-and-forget)
    // Each item goes through: download → engine extraction → gates → manual_review
    processBatch(job.id, async (item: BatchItemInput) => {
      return processBatchItem(item, developerId, isSandbox);
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
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
