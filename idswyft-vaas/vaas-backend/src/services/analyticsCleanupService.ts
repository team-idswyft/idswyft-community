/**
 * Analytics Cleanup Service
 *
 * Purges webhook deliveries older than RETENTION_DAYS (30).
 * Verification sessions are NOT deleted here — they are compliance-relevant
 * audit records. The sessionExpirationService handles cleanup of expired/
 * terminated sessions separately.
 *
 * Runs once on startup, then every 24 hours.
 */

import { vaasSupabase } from '../config/database.js';

class AnalyticsCleanupService {
  private static instance: AnalyticsCleanupService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly RETENTION_DAYS = 30;
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  static getInstance(): AnalyticsCleanupService {
    if (!AnalyticsCleanupService.instance) {
      AnalyticsCleanupService.instance = new AnalyticsCleanupService();
    }
    return AnalyticsCleanupService.instance;
  }

  start(): void {
    console.log(`🧹 Analytics cleanup service started (${this.RETENTION_DAYS}-day retention, 24h interval)`);
    this.runCleanup().catch(err => console.error('[Cleanup] Initial run failed:', err.message));
    this.intervalId = setInterval(() => this.runCleanup(), this.CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.RETENTION_DAYS * 86_400_000).toISOString();

    try {
      // Delete old webhook deliveries (ephemeral delivery logs)
      const { data: deletedDeliveries, error: deliveriesError } = await vaasSupabase
        .from('vaas_webhook_deliveries')
        .delete()
        .lt('created_at', cutoff)
        .select('id');

      if (deliveriesError) {
        console.error('[Cleanup] Failed to delete old deliveries:', deliveriesError.message);
      }

      const deliveryCount = deletedDeliveries?.length ?? 0;

      if (deliveryCount > 0) {
        console.log(`[Cleanup] Deleted ${deliveryCount} webhook deliveries older than ${this.RETENTION_DAYS} days`);
      }
    } catch (err: any) {
      console.error('[Cleanup] Unexpected error during analytics cleanup:', err.message);
    }
  }
}

export const analyticsCleanupService = AnalyticsCleanupService.getInstance();
