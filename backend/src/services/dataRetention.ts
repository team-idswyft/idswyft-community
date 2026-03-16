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

    // 3. Delete document and selfie DB records
    if (verificationIds.length > 0) {
      await supabase.from('documents')
        .delete()
        .in('verification_request_id', verificationIds);

      await supabase.from('selfies')
        .delete()
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
    await supabase.from('verification_requests').delete().in('id', ids);

    logger.info(`Demo cleanup: ${ids.length} verifications deleted`, {
      count: ids.length,
      cutoffHours: retentionHours,
    });

    return ids.length;
  }
}
