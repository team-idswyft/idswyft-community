import config from '../config/index.js';

class CronReporter {
  async report(jobId: string, result: 'success' | 'error', error?: string): Promise<void> {
    if (!config.vaas.apiUrl) return;
    try {
      await fetch(`${config.vaas.apiUrl}/api/platform/cron-jobs/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': config.vaas.serviceToken,
        },
        body: JSON.stringify({
          id: jobId,
          lastRunAt: new Date().toISOString(),
          lastResult: result,
          lastError: error || null,
        }),
      });
    } catch (err) {
      // Fire-and-forget — VaaS being unreachable must not affect status service
      console.error(`[CronReporter] Failed to report ${jobId}:`, (err as Error).message);
    }
  }
}

export const cronReporter = new CronReporter();
