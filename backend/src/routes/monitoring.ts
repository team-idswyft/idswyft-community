/**
 * Monitoring Routes
 *
 * Developer-facing endpoints for managing re-verification schedules
 * and viewing document expiry alerts.
 *
 * All endpoints require API key authentication (X-API-Key header).
 */

import express, { Request, Response } from 'express';
import { param, body, query, validationResult } from 'express-validator';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { verificationRateLimit } from '@/middleware/rateLimit.js';
import { catchAsync, ValidationError, NotFoundError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import {
  createSchedule,
  listSchedules,
  getSchedule,
  cancelSchedule,
  getExpiringDocuments,
} from '@/services/monitoringService.js';

const router = express.Router();

// ─── Re-verification Schedules ───────────────────────────

/**
 * POST /api/v2/monitoring/schedules
 * Create a re-verification schedule for a user.
 */
router.post(
  '/schedules',
  authenticateAPIKey,
  verificationRateLimit,
  [
    body('user_id').isUUID().withMessage('user_id must be a valid UUID'),
    body('interval_days')
      .isInt({ min: 30, max: 730 })
      .withMessage('interval_days must be between 30 and 730'),
    body('verification_request_id').optional().isUUID(),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = (req as any).developer;
    const { user_id, interval_days, verification_request_id } = req.body;

    const schedule = await createSchedule({
      developer_id: developer.id,
      user_id,
      interval_days: parseInt(interval_days),
      verification_request_id,
    });

    logger.info('Re-verification schedule created via API', {
      schedule_id: schedule.id,
      developer_id: developer.id,
      user_id,
    });

    res.status(201).json({
      success: true,
      schedule: {
        id: schedule.id,
        user_id: schedule.user_id,
        interval_days: schedule.interval_days,
        next_verification_at: schedule.next_verification_at,
        status: schedule.status,
        created_at: schedule.created_at,
      },
    });
  }),
);

/**
 * GET /api/v2/monitoring/schedules
 * List re-verification schedules for the current developer.
 */
router.get(
  '/schedules',
  authenticateAPIKey,
  [
    query('status').optional().isIn(['active', 'paused', 'cancelled']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = (req as any).developer;
    const { schedules, total } = await listSchedules(developer.id, {
      status: req.query.status as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });

    res.json({
      schedules: schedules.map((s) => ({
        id: s.id,
        user_id: s.user_id,
        interval_days: s.interval_days,
        next_verification_at: s.next_verification_at,
        last_verification_at: s.last_verification_at,
        status: s.status,
        created_at: s.created_at,
      })),
      total,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
  }),
);

/**
 * DELETE /api/v2/monitoring/schedules/:schedule_id
 * Cancel a re-verification schedule.
 */
router.delete(
  '/schedules/:schedule_id',
  authenticateAPIKey,
  [param('schedule_id').isUUID()],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = (req as any).developer;
    const { schedule_id } = req.params;

    const cancelled = await cancelSchedule(schedule_id, developer.id);

    if (!cancelled) {
      throw new NotFoundError('Schedule');
    }

    logger.info('Re-verification schedule cancelled', {
      schedule_id,
      developer_id: developer.id,
    });

    res.json({
      success: true,
      message: 'Schedule cancelled',
    });
  }),
);

// ─── Expiring Documents ──────────────────────────────────

/**
 * GET /api/v2/monitoring/expiring-documents
 * List documents approaching expiry for the current developer.
 */
router.get(
  '/expiring-documents',
  authenticateAPIKey,
  [
    query('days_ahead').optional().isInt({ min: 1, max: 365 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = (req as any).developer;
    const { alerts, total } = await getExpiringDocuments(developer.id, {
      days_ahead: req.query.days_ahead ? parseInt(req.query.days_ahead as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });

    res.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        verification_request_id: a.verification_request_id,
        user_id: a.user_id,
        expiry_date: a.expiry_date,
        alert_type: a.alert_type,
        webhook_sent: a.webhook_sent,
        created_at: a.created_at,
      })),
      total,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
  }),
);

export default router;
