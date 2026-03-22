import { statusDb } from '../config/database.js';
import config from '../config/index.js';
import { cronReporter } from './cronReporter.js';

class DataCleanupService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  async runCleanup(): Promise<{ checksDeleted: number; incidentsDeleted: number }> {
    const checksCutoff = new Date();
    checksCutoff.setDate(checksCutoff.getDate() - config.retentionDays);

    const incidentsCutoff = new Date();
    incidentsCutoff.setDate(incidentsCutoff.getDate() - config.incidentRetentionDays);

    // Delete old service checks (direct delete avoids Supabase 1000-row select limit)
    const { count: checksDeleted, error: checksErr } = await statusDb
      .from('service_checks')
      .delete({ count: 'exact' })
      .lt('checked_at', checksCutoff.toISOString());

    if (checksErr) console.error('[DataCleanup] checks error:', checksErr.message);

    // Delete old resolved incidents (cascade deletes updates)
    const { count: incidentsDeleted, error: incErr } = await statusDb
      .from('incidents')
      .delete({ count: 'exact' })
      .eq('status', 'resolved')
      .lt('resolved_at', incidentsCutoff.toISOString());

    if (incErr) console.error('[DataCleanup] incidents error:', incErr.message);

    const cDel = checksDeleted ?? 0;
    const iDel = incidentsDeleted ?? 0;
    console.log(`[DataCleanup] Deleted ${cDel} checks, ${iDel} incidents`);
    return { checksDeleted: cDel, incidentsDeleted: iDel };
  }

  start(): void {
    if (this.intervalId) return;
    console.log(`[DataCleanup] Starting (every ${config.cleanupIntervalHours}h)`);

    // Run on startup
    this.runCleanup()
      .then(() => cronReporter.report('status-data-cleanup', 'success'))
      .catch((err) => cronReporter.report('status-data-cleanup', 'error', err.message));

    this.intervalId = setInterval(async () => {
      try {
        await this.runCleanup();
        cronReporter.report('status-data-cleanup', 'success');
      } catch (err: any) {
        cronReporter.report('status-data-cleanup', 'error', err.message);
      }
    }, config.cleanupIntervalHours * 60 * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const dataCleanup = new DataCleanupService();
