import { supabase } from '@/config/database.js';
import { StorageService } from './storage.js';
import { logger } from '@/utils/logger.js';

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
