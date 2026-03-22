import { vaasSupabase } from '../config/database.js';
import { cronRegistry } from './cronRegistryService.js';

export class SessionExpirationService {
  private static instance: SessionExpirationService;
  private expirationIntervalId: ReturnType<typeof setInterval> | null = null;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  public static getInstance(): SessionExpirationService {
    if (!SessionExpirationService.instance) {
      SessionExpirationService.instance = new SessionExpirationService();
    }
    return SessionExpirationService.instance;
  }

  /**
   * Mark expired sessions as expired status
   */
  async expireExpiredSessions(): Promise<number> {
    try {
      const now = new Date().toISOString();
      
      // Find all sessions that have passed their expiration time but are not yet marked as expired
      const { data: expiredSessions, error: findError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .select('id, session_token, organization_id')
        .lt('expires_at', now)
        .not('status', 'in', '(expired,terminated)');
        
      if (findError) {
        console.error('[SessionExpiration] Error finding expired sessions:', findError);
        return 0;
      }

      if (!expiredSessions || expiredSessions.length === 0) {
        console.log('[SessionExpiration] No sessions to expire');
        return 0;
      }

      // Update all expired sessions to expired status
      const sessionIds = expiredSessions.map(session => session.id);
      const { error: updateError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .update({
          status: 'expired',
          updated_at: now
        })
        .in('id', sessionIds);

      if (updateError) {
        console.error('[SessionExpiration] Error updating expired sessions:', updateError);
        return 0;
      }

      console.log(`[SessionExpiration] Marked ${expiredSessions.length} sessions as expired`);
      return expiredSessions.length;
    } catch (error) {
      console.error('[SessionExpiration] Unexpected error during session expiration:', error);
      return 0;
    }
  }

  /**
   * Clean up old expired and terminated sessions
   * Remove sessions that have been expired/terminated for more than the retention period
   */
  async cleanupOldSessions(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffISO = cutoffDate.toISOString();
      
      // Find sessions that have been expired or terminated for longer than retention period
      const { data: oldSessions, error: findError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .select('id, session_token')
        .in('status', ['expired', 'terminated'])
        .or(`updated_at.lt.${cutoffISO},terminated_at.lt.${cutoffISO}`);
        
      if (findError) {
        console.error('[SessionExpiration] Error finding old sessions:', findError);
        return 0;
      }

      if (!oldSessions || oldSessions.length === 0) {
        console.log('[SessionExpiration] No old sessions to clean up');
        return 0;
      }

      // Delete old sessions
      const sessionIds = oldSessions.map(session => session.id);
      const { error: deleteError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .delete()
        .in('id', sessionIds);

      if (deleteError) {
        console.error('[SessionExpiration] Error deleting old sessions:', deleteError);
        return 0;
      }

      console.log(`[SessionExpiration] Cleaned up ${oldSessions.length} old sessions`);
      return oldSessions.length;
    } catch (error) {
      console.error('[SessionExpiration] Unexpected error during session cleanup:', error);
      return 0;
    }
  }

  /**
   * Get statistics about session expiration status
   */
  async getExpirationStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    terminated: number;
    expiringSoon: number; // expires in next hour
  }> {
    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const nowISO = now.toISOString();

      // Get total count by status
      const { data: statusCounts, error: statusError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .select('status')
        .neq('status', 'deleted');

      if (statusError) {
        throw statusError;
      }

      // Get sessions expiring soon
      const { data: expiringSoon, error: expiringSoonError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .select('id')
        .gt('expires_at', nowISO)
        .lt('expires_at', oneHourFromNow)
        .not('status', 'in', '(expired,terminated)');

      if (expiringSoonError) {
        throw expiringSoonError;
      }

      // Calculate stats
      const stats = {
        total: statusCounts?.length || 0,
        active: 0,
        expired: 0,
        terminated: 0,
        expiringSoon: expiringSoon?.length || 0
      };

      statusCounts?.forEach((session: any) => {
        if (session.status === 'expired') {
          stats.expired++;
        } else if (session.status === 'terminated') {
          stats.terminated++;
        } else {
          stats.active++;
        }
      });

      return stats;
    } catch (error) {
      console.error('[SessionExpiration] Error getting expiration stats:', error);
      return {
        total: 0,
        active: 0,
        expired: 0,
        terminated: 0,
        expiringSoon: 0
      };
    }
  }

  /**
   * Start the background job to regularly expire sessions
   */
  startExpirationJob(intervalMinutes: number = 5): void {
    if (this.expirationIntervalId) return; // already running
    console.log(`[SessionExpiration] Starting session expiration job (every ${intervalMinutes} minutes)`);

    // Run immediately
    this.expireExpiredSessions();

    // Then run on schedule
    this.expirationIntervalId = setInterval(async () => {
      try {
        await this.expireExpiredSessions();
        cronRegistry.reportRun('session-expiration', 'success');
      } catch (err: any) {
        cronRegistry.reportRun('session-expiration', 'error', err.message);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /** Stop the session expiration background job. */
  stopExpirationJob(): void {
    if (this.expirationIntervalId) {
      clearInterval(this.expirationIntervalId);
      this.expirationIntervalId = null;
    }
  }

  /**
   * Start the background job to regularly clean up old sessions
   */
  startCleanupJob(intervalHours: number = 24, retentionDays: number = 30): void {
    if (this.cleanupIntervalId) return; // already running
    console.log(`[SessionExpiration] Starting session cleanup job (every ${intervalHours} hours, ${retentionDays} day retention)`);

    // Run immediately
    this.cleanupOldSessions(retentionDays);

    // Then run on schedule
    this.cleanupIntervalId = setInterval(async () => {
      try {
        await this.cleanupOldSessions(retentionDays);
        cronRegistry.reportRun('session-cleanup', 'success');
      } catch (err: any) {
        cronRegistry.reportRun('session-cleanup', 'error', err.message);
      }
    }, intervalHours * 60 * 60 * 1000);
  }

  /** Stop the session cleanup background job. */
  stopCleanupJob(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

export const sessionExpirationService = SessionExpirationService.getInstance();