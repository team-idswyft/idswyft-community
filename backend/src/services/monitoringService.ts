/**
 * Monitoring Service
 *
 * Handles ongoing monitoring for identity verification:
 * - Document expiry detection (30/60/90-day warnings + expired alerts)
 * - Scheduled re-verification management
 * - Webhook notifications for monitoring events
 *
 * Designed for daily cron execution — idempotent and failure-tolerant.
 */

import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { WebhookService } from './webhook.js';

// ─── Types ───────────────────────────────────────────────

export interface ReverificationSchedule {
  id: string;
  developer_id: string;
  user_id: string;
  verification_request_id: string | null;
  interval_days: number;
  next_verification_at: string;
  last_verification_at: string | null;
  status: 'active' | 'paused' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface ExpiryAlert {
  id: string;
  verification_request_id: string;
  developer_id: string;
  user_id: string | null;
  document_id: string | null;
  expiry_date: string;
  alert_type: '90_day' | '60_day' | '30_day' | 'expired';
  webhook_sent: boolean;
  created_at: string;
}

export interface CreateScheduleInput {
  developer_id: string;
  user_id: string;
  verification_request_id?: string;
  interval_days: number;
}

export interface MonitoringJobResult {
  expiry_alerts_created: number;
  webhooks_sent: number;
  errors: number;
}

export interface ReverificationJobResult {
  due_schedules: number;
  webhooks_sent: number;
  errors: number;
}

// ─── Alert thresholds (days before expiry) ───────────────

const ALERT_THRESHOLDS: { days: number; type: ExpiryAlert['alert_type'] }[] = [
  { days: 90, type: '90_day' },
  { days: 60, type: '60_day' },
  { days: 30, type: '30_day' },
  { days: 0, type: 'expired' },
];

// ─── Service ─────────────────────────────────────────────

// Lazy-initialized to avoid module-load side effects in test contexts.
let _webhookService: WebhookService | undefined;
function getWebhookService(): WebhookService {
  if (!_webhookService) _webhookService = new WebhookService();
  return _webhookService;
}

// ─── Schedule CRUD ───────────────────────────────────────

/**
 * Create a re-verification schedule for a user.
 * Only one active schedule per developer+user is allowed (DB unique constraint).
 */
export async function createSchedule(input: CreateScheduleInput): Promise<ReverificationSchedule> {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + input.interval_days);

  const { data, error } = await supabase
    .from('reverification_schedules')
    .insert({
      developer_id: input.developer_id,
      user_id: input.user_id,
      verification_request_id: input.verification_request_id || null,
      interval_days: input.interval_days,
      next_verification_at: nextDate.toISOString(),
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    logger.error('Failed to create reverification schedule', { error: error.message, input });
    throw new Error(`Failed to create schedule: ${error.message}`);
  }

  logger.info('Reverification schedule created', {
    schedule_id: data.id,
    user_id: input.user_id,
    interval_days: input.interval_days,
    next_at: nextDate.toISOString(),
  });

  return data as ReverificationSchedule;
}

/**
 * List schedules for a developer, optionally filtered by status.
 */
export async function listSchedules(
  developerId: string,
  options: { status?: string; page?: number; limit?: number } = {},
): Promise<{ schedules: ReverificationSchedule[]; total: number }> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 100);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('reverification_schedules')
    .select('*', { count: 'exact' })
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to list reverification schedules', { error: error.message });
    throw new Error('Failed to list schedules');
  }

  return {
    schedules: (data ?? []) as ReverificationSchedule[],
    total: count ?? 0,
  };
}

/**
 * Get a single schedule by ID (developer-scoped).
 */
export async function getSchedule(
  scheduleId: string,
  developerId: string,
): Promise<ReverificationSchedule | null> {
  const { data, error } = await supabase
    .from('reverification_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('developer_id', developerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    logger.error('Failed to get schedule', { error: error.message });
    throw new Error('Failed to get schedule');
  }

  return data as ReverificationSchedule;
}

/**
 * Cancel an active schedule.
 */
export async function cancelSchedule(
  scheduleId: string,
  developerId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from('reverification_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', scheduleId)
    .eq('developer_id', developerId)
    .eq('status', 'active');

  if (error) {
    logger.error('Failed to cancel schedule', { error: error.message });
    throw new Error('Failed to cancel schedule');
  }

  return (count ?? 0) > 0;
}

// ─── Document Expiry Monitoring ──────────────────────────

/**
 * Check all verified documents for upcoming expiry dates.
 * Creates expiry_alerts records and fires webhooks.
 *
 * Designed for daily cron execution — the unique constraint on
 * (verification_request_id, alert_type) makes this idempotent.
 */
export async function checkExpiringDocuments(): Promise<MonitoringJobResult> {
  const result: MonitoringJobResult = { expiry_alerts_created: 0, webhooks_sent: 0, errors: 0 };

  // Fetch verified verifications with document OCR data containing expiry dates
  const { data: verifications, error } = await supabase
    .from('verification_requests')
    .select(`
      id,
      user_id,
      developer_id,
      status,
      documents (
        id,
        ocr_data
      )
    `)
    .eq('status', 'verified')
    .not('documents', 'is', null);

  if (error) {
    logger.error('Failed to fetch verifications for expiry check', { error: error.message });
    return result;
  }

  const now = new Date();

  for (const v of verifications ?? []) {
    const docs = (v as any).documents ?? [];

    for (const doc of docs) {
      const ocrData = doc.ocr_data;
      if (!ocrData) continue;

      // Look for expiry date in OCR data
      const expiryStr = ocrData.expiry_date || ocrData.expiration_date;
      if (!expiryStr) continue;

      const expiryDate = parseExpiryDate(expiryStr);
      if (!expiryDate) continue;

      const daysUntilExpiry = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Check each threshold
      for (const threshold of ALERT_THRESHOLDS) {
        if (daysUntilExpiry <= threshold.days) {
          try {
            const created = await createExpiryAlert({
              verification_request_id: v.id,
              developer_id: v.developer_id,
              user_id: v.user_id,
              document_id: doc.id,
              expiry_date: expiryDate.toISOString().split('T')[0],
              alert_type: threshold.type,
            });

            if (created) {
              result.expiry_alerts_created++;

              // Fire webhook
              const sent = await fireExpiryWebhook(
                v.developer_id,
                v.id,
                v.user_id,
                threshold.type,
                expiryDate,
              );
              if (sent) result.webhooks_sent++;
            }
          } catch (err) {
            result.errors++;
            logger.error('Error processing expiry alert', {
              verification_id: v.id,
              alert_type: threshold.type,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          // Once we match the tightest threshold, stop checking looser ones
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Get expiring documents for a developer (API endpoint helper).
 */
export async function getExpiringDocuments(
  developerId: string,
  options: { days_ahead?: number; page?: number; limit?: number } = {},
): Promise<{ alerts: ExpiryAlert[]; total: number }> {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 100);
  const offset = (page - 1) * limit;

  const daysAhead = options.days_ahead || 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  const { data, error, count } = await supabase
    .from('expiry_alerts')
    .select('*', { count: 'exact' })
    .eq('developer_id', developerId)
    .lte('expiry_date', cutoffDate.toISOString().split('T')[0])
    .order('expiry_date', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('Failed to fetch expiring documents', { error: error.message });
    throw new Error('Failed to fetch expiring documents');
  }

  return {
    alerts: (data ?? []) as ExpiryAlert[],
    total: count ?? 0,
  };
}

// ─── Scheduled Re-verification Processing ────────────────

/**
 * Process all due re-verification schedules.
 * Fires webhooks to notify developers that re-verification is due.
 *
 * Designed for daily cron execution.
 */
export async function processScheduledReverifications(): Promise<ReverificationJobResult> {
  const result: ReverificationJobResult = { due_schedules: 0, webhooks_sent: 0, errors: 0 };

  const now = new Date().toISOString();

  // Fetch active schedules that are due
  const { data: dueSchedules, error } = await supabase
    .from('reverification_schedules')
    .select('*')
    .eq('status', 'active')
    .lte('next_verification_at', now)
    .limit(100); // Process in batches

  if (error) {
    logger.error('Failed to fetch due reverification schedules', { error: error.message });
    return result;
  }

  result.due_schedules = dueSchedules?.length ?? 0;

  for (const schedule of dueSchedules ?? []) {
    try {
      // Fire webhook to notify developer
      const sent = await fireReverificationWebhook(schedule as ReverificationSchedule);
      if (sent) result.webhooks_sent++;

      // Advance schedule to next cycle
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + schedule.interval_days);

      await supabase
        .from('reverification_schedules')
        .update({
          next_verification_at: nextDate.toISOString(),
          last_verification_at: now,
          updated_at: now,
        })
        .eq('id', schedule.id);
    } catch (err) {
      result.errors++;
      logger.error('Error processing reverification schedule', {
        schedule_id: schedule.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ─── Internal helpers ────────────────────────────────────

/**
 * Parse various expiry date formats from OCR data.
 */
function parseExpiryDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO format: "2025-01-15"
  const iso = Date.parse(dateStr);
  if (!isNaN(iso)) return new Date(iso);

  // Try "01/15/2025" or "01-15-2025"
  const mdyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    return new Date(parseInt(mdyMatch[3]), parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]));
  }

  // Try "15/01/2025" (day first, common in EU)
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1]);
    const month = parseInt(dmyMatch[2]);
    if (day > 12) {
      return new Date(parseInt(dmyMatch[3]), month - 1, day);
    }
  }

  return null;
}

/**
 * Create an expiry alert, handling the unique constraint gracefully.
 * Returns true if the alert was newly created, false if it already existed.
 */
async function createExpiryAlert(alert: {
  verification_request_id: string;
  developer_id: string;
  user_id: string;
  document_id: string;
  expiry_date: string;
  alert_type: ExpiryAlert['alert_type'];
}): Promise<boolean> {
  const { error } = await supabase
    .from('expiry_alerts')
    .insert(alert);

  if (error) {
    // Unique constraint violation = alert already exists
    if (error.code === '23505') return false;
    throw error;
  }

  return true;
}

/**
 * Fire a webhook for document expiry notification.
 */
async function fireExpiryWebhook(
  developerId: string,
  verificationId: string,
  userId: string,
  alertType: string,
  expiryDate: Date,
): Promise<boolean> {
  try {
    const webhooks = await getWebhookService().getActiveWebhooksForDeveloper(developerId, false);
    if (webhooks.length === 0) return false;

    const payload = {
      user_id: userId,
      verification_id: verificationId,
      status: 'verified' as const,
      timestamp: new Date().toISOString(),
      data: {
        event: 'document.expiry_warning',
        alert_type: alertType,
        expiry_date: expiryDate.toISOString().split('T')[0],
        days_until_expiry: Math.floor(
          (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      },
    };

    for (const webhook of webhooks) {
      getWebhookService().sendWebhook(webhook, verificationId, payload as any).catch((err) => {
        logger.error('Failed to send expiry webhook', {
          webhook_id: webhook.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return true;
  } catch (err) {
    logger.error('Error firing expiry webhook', { error: err });
    return false;
  }
}

/**
 * Fire a webhook for re-verification due notification.
 */
async function fireReverificationWebhook(schedule: ReverificationSchedule): Promise<boolean> {
  try {
    const webhooks = await getWebhookService().getActiveWebhooksForDeveloper(schedule.developer_id, false);
    if (webhooks.length === 0) return false;

    const payload = {
      user_id: schedule.user_id,
      verification_id: schedule.verification_request_id || schedule.id,
      status: 'verified' as const,
      timestamp: new Date().toISOString(),
      data: {
        event: 'verification.reverification_due',
        schedule_id: schedule.id,
        interval_days: schedule.interval_days,
        last_verification_at: schedule.last_verification_at,
      },
    };

    for (const webhook of webhooks) {
      getWebhookService().sendWebhook(
        webhook,
        schedule.verification_request_id || schedule.id,
        payload as any,
      ).catch((err) => {
        logger.error('Failed to send reverification webhook', {
          webhook_id: webhook.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return true;
  } catch (err) {
    logger.error('Error firing reverification webhook', { error: err });
    return false;
  }
}
