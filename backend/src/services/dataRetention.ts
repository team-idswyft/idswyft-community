import { supabase } from '@/config/database.js';
import { StorageService } from './storage.js';
import { logger } from '@/utils/logger.js';

/**
 * How long past session expiry runAbandonedCaptureCleanup waits before
 * purging, so an upload that started just before expiry can finish first.
 */
export const ABANDONED_CAPTURE_GRACE_MINUTES = 15;

/** Ids of rows whose file was deleted but whose verification had a failure. */
function rowIdsFor(
  rows: Array<{ id: string; verification_request_id: string }>,
  deletedIds: Set<string>,
  failedIds: Set<string>,
): string[] {
  return rows
    .filter((row) => failedIds.has(row.verification_request_id) && deletedIds.has(row.id))
    .map((row) => row.id);
}

/**
 * DataRetentionService handles GDPR right-to-erasure requests and automated
 * data retention enforcement.
 *
 * Deletion strategy:
 * - Physical files (documents, selfies) are deleted from storage.
 * - Database records are anonymised (PII nulled) rather than hard-deleted so
 *   the verification audit trail is preserved for compliance reporting.
 */
export class DataRetentionService {
  private storageService = new StorageService();

  async deleteUserData(userId: string, reason: string): Promise<void> {
    logger.info('Starting GDPR data deletion', { userId, reason });

    // 1. Fetch all verification records with their associated file paths
    const { data: verifications } = await supabase
      .from('verification_requests')
      .select('id, documents(file_path), selfies(file_path)')
      .eq('user_id', userId);

    // 2. Delete physical files from storage (best-effort — never block on failure)
    for (const v of verifications ?? []) {
      for (const doc of (v as any).documents ?? []) {
        await this.storageService.deleteFile(doc.file_path).catch(() => {});
      }
      for (const selfie of (v as any).selfies ?? []) {
        await this.storageService.deleteFile(selfie.file_path).catch(() => {});
      }
    }

    const verificationIds = (verifications ?? []).map((v: any) => v.id);

    // 3. Delete document and selfie DB records + related data
    if (verificationIds.length > 0) {
      await supabase.from('documents')
        .delete()
        .in('verification_request_id', verificationIds);

      await supabase.from('selfies')
        .delete()
        .in('verification_request_id', verificationIds);

      // Delete verification contexts (session state with potential biometric data)
      await supabase.from('verification_contexts')
        .delete()
        .in('verification_id', verificationIds);

      // Delete risk scores
      await supabase.from('verification_risk_scores')
        .delete()
        .in('verification_request_id', verificationIds);

      // Delete expiry alerts and monitoring schedules
      await supabase.from('expiry_alerts')
        .delete()
        .in('verification_request_id', verificationIds);

      await supabase.from('reverification_schedules')
        .delete()
        .in('verification_request_id', verificationIds);

      // Delete phone OTP codes and rate limits
      await supabase.from('phone_otp_codes')
        .delete()
        .in('verification_request_id', verificationIds);

      await supabase.from('phone_otp_rate_limits')
        .delete()
        .in('verification_request_id', verificationIds);

      // Delete duplicate detection fingerprints
      await supabase.from('dedup_fingerprints')
        .delete()
        .in('verification_request_id', verificationIds);

      // Delete AML/PEP screening records — these contain screened name + DOB
      // and full match details, which are PII tied to the verification.
      await supabase.from('aml_screenings')
        .delete()
        .in('verification_request_id', verificationIds);

      // Nullify webhook delivery payloads (preserve delivery audit trail, remove PII)
      await supabase.from('webhook_deliveries')
        .update({ payload: null })
        .in('verification_request_id', verificationIds);
    }

    // 4. Anonymise verification requests (keep for audit, remove PII)
    await supabase.from('verification_requests')
      .update({ user_id: null, manual_review_reason: '[GDPR deleted]' })
      .eq('user_id', userId);

    // 5. Anonymise user record
    await supabase.from('users')
      .update({
        email: null,
        first_name: null,
        last_name: null,
        phone: null,
      })
      .eq('id', userId);

    logger.info('GDPR data deletion complete', { userId, reason });
  }

  async runRetentionCleanup(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const { data: old } = await supabase
      .from('verification_requests')
      .select('user_id')
      .lt('created_at', cutoff.toISOString())
      .not('user_id', 'is', null);

    for (const record of old ?? []) {
      await this.deleteUserData(record.user_id, `retention-policy-${retentionDays}d`);
    }

    return (old ?? []).length;
  }

  /**
   * Hard-delete demo verification data older than `retentionHours`.
   * Demo data has no audit requirements — full deletion is appropriate.
   * Files may already be null (ephemeral cleanup deletes them after extraction),
   * but we clean up any stragglers here.
   */
  async runDemoCleanup(retentionHours: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - retentionHours);

    const { data: old } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('source', 'demo')
      .lt('created_at', cutoff.toISOString());

    if (!old?.length) return 0;
    const ids = old.map((v: any) => v.id);

    // Delete any remaining files (in case ephemeral cleanup missed some)
    const { data: docs } = await supabase
      .from('documents').select('file_path')
      .in('verification_request_id', ids)
      .not('file_path', 'is', null);

    for (const doc of docs ?? []) {
      await this.storageService.deleteFile(doc.file_path).catch(() => {});
    }

    const { data: selfies } = await supabase
      .from('selfies').select('file_path')
      .in('verification_request_id', ids)
      .not('file_path', 'is', null);

    for (const s of selfies ?? []) {
      await this.storageService.deleteFile(s.file_path).catch(() => {});
    }

    // Hard-delete all DB records (demo data, no audit requirement)
    await supabase.from('documents').delete().in('verification_request_id', ids);
    await supabase.from('selfies').delete().in('verification_request_id', ids);
    await supabase.from('verification_contexts').delete().in('verification_id', ids);
    await supabase.from('verification_risk_scores').delete().in('verification_request_id', ids);
    await supabase.from('expiry_alerts').delete().in('verification_request_id', ids);
    await supabase.from('reverification_schedules').delete().in('verification_request_id', ids);
    await supabase.from('phone_otp_codes').delete().in('verification_request_id', ids);
    await supabase.from('phone_otp_rate_limits').delete().in('verification_request_id', ids);
    await supabase.from('dedup_fingerprints').delete().in('verification_request_id', ids);
    await supabase.from('aml_screenings').delete().in('verification_request_id', ids);
    await supabase.from('verification_requests').delete().in('id', ids);

    logger.info(`Demo cleanup: ${ids.length} verifications deleted`, {
      count: ids.length,
      cutoffHours: retentionHours,
    });

    return ids.length;
  }

  /**
   * Purge document/selfie images (and session/biometric state) for a capture
   * abandoned mid-flow, once its session token has been expired for longer
   * than ABANDONED_CAPTURE_GRACE_MINUTES. Only touches pending/processing
   * verifications; the verification_requests row itself is left alone.
   *
   * The grace period keeps an upload that started just before the session
   * expired from having its files purged while it is still running.
   *
   * A file that fails to delete keeps its row, and its verification keeps
   * its session state, so the next run retries it instead of losing track
   * of the file. Returns the number of verifications fully purged.
   */
  async runAbandonedCaptureCleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - ABANDONED_CAPTURE_GRACE_MINUTES * 60 * 1000);
    const { data: abandoned } = await supabase
      .from('verification_requests')
      .select('id')
      .in('status', ['pending', 'processing'])
      .not('session_token_expires_at', 'is', null)
      .lt('session_token_expires_at', cutoff.toISOString());

    if (!abandoned?.length) return 0;
    const ids: string[] = abandoned.map((v: any) => v.id);

    const { data: docs } = await supabase
      .from('documents').select('id, verification_request_id, file_path')
      .in('verification_request_id', ids)
      .not('file_path', 'is', null);

    const { data: selfies } = await supabase
      .from('selfies').select('id, verification_request_id, file_path')
      .in('verification_request_id', ids)
      .not('file_path', 'is', null);

    const failedIds = new Set<string>();
    const deletedDocIds = await this.deleteStoredFiles('documents', docs ?? [], failedIds);
    const deletedSelfieIds = await this.deleteStoredFiles('selfies', selfies ?? [], failedIds);

    const purgedIds = ids.filter((id) => !failedIds.has(id));
    if (purgedIds.length > 0) {
      await supabase.from('documents').delete().in('verification_request_id', purgedIds);
      await supabase.from('selfies').delete().in('verification_request_id', purgedIds);
      await supabase.from('verification_contexts').delete().in('verification_id', purgedIds);
    }

    // For a verification with a failed delete, drop only the rows whose
    // file is already gone; the failed rows and the session state stay.
    const retryDocIds = rowIdsFor(docs ?? [], deletedDocIds, failedIds);
    const retrySelfieIds = rowIdsFor(selfies ?? [], deletedSelfieIds, failedIds);
    if (retryDocIds.length > 0) {
      await supabase.from('documents').delete().in('id', retryDocIds);
    }
    if (retrySelfieIds.length > 0) {
      await supabase.from('selfies').delete().in('id', retrySelfieIds);
    }

    logger.info(`Abandoned capture cleanup: ${purgedIds.length} verifications purged`, {
      count: purgedIds.length,
      retryCount: failedIds.size,
    });

    return purgedIds.length;
  }

  /**
   * Deletes each row's file from storage. Returns the ids of the rows whose
   * file was deleted; a failure is logged and its verification id added to
   * failedIds.
   */
  private async deleteStoredFiles(
    table: 'documents' | 'selfies',
    rows: Array<{ id: string; verification_request_id: string; file_path: string }>,
    failedIds: Set<string>,
  ): Promise<Set<string>> {
    const deleted = new Set<string>();
    for (const row of rows) {
      try {
        await this.storageService.deleteFile(row.file_path);
        deleted.add(row.id);
      } catch (error) {
        failedIds.add(row.verification_request_id);
        logger.warn('Abandoned capture cleanup: failed to delete file, keeping its row for the next run', {
          table,
          verificationId: row.verification_request_id,
          filePath: row.file_path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return deleted;
  }

  /**
   * Nullify PII in webhook_deliveries payloads older than `retentionDays`.
   * Preserves the delivery audit trail (status, timestamps, attempts) but
   * removes OCR data, names, DOB, and document numbers from the payload.
   */
  async runWebhookPayloadCleanup(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // Count affected rows first
    const { count } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoff.toISOString())
      .not('payload', 'is', null);

    const toClean = count ?? 0;
    if (toClean === 0) return 0;

    const { error } = await supabase
      .from('webhook_deliveries')
      .update({ payload: null })
      .lt('created_at', cutoff.toISOString())
      .not('payload', 'is', null);

    if (error) {
      logger.error('Webhook payload cleanup failed', { error });
      return 0;
    }

    logger.info(`Webhook payload cleanup: ${toClean} deliveries scrubbed`, {
      retentionDays,
      cutoff: cutoff.toISOString(),
    });

    return toClean;
  }

  /**
   * Delete api_activity_logs older than `retentionDays`.
   * These are high-volume analytics rows (one per API call) with no audit
   * requirement — safe to hard-delete after the retention window.
   */
  /**
   * Delete expiry_alerts older than `retentionDays` where webhook was already sent.
   * Alerts that haven't been delivered are preserved regardless of age.
   */
  async runExpiryAlertCleanup(retentionDays: number = 180): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const { count } = await supabase
      .from('expiry_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('webhook_sent', true)
      .lt('created_at', cutoff.toISOString());

    const toDelete = count ?? 0;
    if (toDelete === 0) return 0;

    const { error } = await supabase
      .from('expiry_alerts')
      .delete()
      .eq('webhook_sent', true)
      .lt('created_at', cutoff.toISOString());

    if (error) {
      logger.error('Expiry alert cleanup failed', { error });
      return 0;
    }

    logger.info(`Expiry alert cleanup: ${toDelete} alerts deleted`, {
      retentionDays,
      cutoff: cutoff.toISOString(),
    });

    return toDelete;
  }

  /**
   * Delete `idempotency_keys` rows whose `expires_at` has passed.
   *
   * The table's PK is (key, developer_id) and `expires_at` is indexed
   * (`idx_idempotency_expires`). Rows default to a 24h TTL, but no
   * cleanup ran prior to this — the table grew unbounded. This cron
   * handles natural decay; nothing in the application logic blocks
   * inserts when the table is large, so missing the cron only matters
   * for storage cost, never for correctness.
   *
   * Safe to run any cadence ≤ TTL. We schedule daily.
   */
  async runIdempotencyKeyCleanup(): Promise<number> {
    const nowIso = new Date().toISOString();

    const { count } = await supabase
      .from('idempotency_keys')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', nowIso);

    const toDelete = count ?? 0;
    if (toDelete === 0) return 0;

    const { error } = await supabase
      .from('idempotency_keys')
      .delete()
      .lt('expires_at', nowIso);

    if (error) {
      logger.error('Idempotency key cleanup failed', { error });
      return 0;
    }

    logger.info(`Idempotency key cleanup: ${toDelete} rows deleted`, {
      cutoff: nowIso,
    });

    return toDelete;
  }

  async runActivityLogCleanup(retentionDays: number = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // Count first, then delete — Supabase doesn't return count on delete reliably
    const { count } = await supabase
      .from('api_activity_logs')
      .select('*', { count: 'exact', head: true })
      .lt('timestamp', cutoff.toISOString());

    const toDelete = count ?? 0;
    if (toDelete === 0) return 0;

    const { error } = await supabase
      .from('api_activity_logs')
      .delete()
      .lt('timestamp', cutoff.toISOString());

    if (error) {
      logger.error('Activity log cleanup failed', { error });
      return 0;
    }

    logger.info(`Activity log cleanup: ${toDelete} rows deleted`, {
      retentionDays,
      cutoff: cutoff.toISOString(),
    });

    return toDelete;
  }
}
