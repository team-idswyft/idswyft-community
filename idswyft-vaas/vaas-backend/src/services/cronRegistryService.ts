/**
 * Cron Job Registry Service
 *
 * Centralized singleton that all background jobs register with.
 * Tracks runtime state (running/stopped), last execution result,
 * and provides pause/resume/trigger controls for VaaS jobs.
 * Main API jobs are registered as static view-only entries.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CronJobEntry {
  id: string;
  name: string;
  service: string;
  backend: 'vaas' | 'main' | 'status';
  schedule: string;
  status: 'running' | 'stopped';
  lastRunAt: string | null;
  lastResult: 'success' | 'error' | null;
  lastError: string | null;
  controllable: boolean;
  envGate: string | null;
  description: string;
}

interface CronJobCallbacks {
  startFn: (() => void) | null;
  stopFn: (() => void) | null;
  triggerFn: (() => Promise<void>) | null;
}

interface InternalEntry extends CronJobEntry {
  callbacks: CronJobCallbacks;
}

// ── Service ──────────────────────────────────────────────────────────────────

class CronRegistryService {
  private static instance: CronRegistryService;
  private jobs: Map<string, InternalEntry> = new Map();

  static getInstance(): CronRegistryService {
    if (!CronRegistryService.instance) {
      CronRegistryService.instance = new CronRegistryService();
    }
    return CronRegistryService.instance;
  }

  /**
   * Register a cron job with the registry.
   * For controllable VaaS jobs, provide start/stop/trigger callbacks.
   * For view-only Main API jobs, omit callbacks.
   */
  register(
    id: string,
    entry: Omit<CronJobEntry, 'id' | 'lastRunAt' | 'lastResult' | 'lastError'>,
    callbacks?: Partial<CronJobCallbacks>,
  ): void {
    this.jobs.set(id, {
      ...entry,
      id,
      lastRunAt: null,
      lastResult: null,
      lastError: null,
      callbacks: {
        startFn: callbacks?.startFn ?? null,
        stopFn: callbacks?.stopFn ?? null,
        triggerFn: callbacks?.triggerFn ?? null,
      },
    });
  }

  /**
   * Called by services after each execution to update runtime state.
   */
  reportRun(id: string, result: 'success' | 'error', error?: string, timestamp?: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.lastRunAt = timestamp || new Date().toISOString();
    job.lastResult = result;
    job.lastError = result === 'error' ? (error ?? 'Unknown error') : null;
  }

  /**
   * Pause a controllable job. Calls its stop callback.
   */
  pause(id: string): CronJobEntry | null {
    const job = this.jobs.get(id);
    if (!job || !job.controllable || job.status === 'stopped') return null;

    if (job.callbacks.stopFn) {
      job.callbacks.stopFn();
    }
    job.status = 'stopped';
    return this.toPublic(job);
  }

  /**
   * Resume a paused controllable job. Calls its start callback.
   */
  resume(id: string): CronJobEntry | null {
    const job = this.jobs.get(id);
    if (!job || !job.controllable || job.status === 'running') return null;

    if (job.callbacks.startFn) {
      job.callbacks.startFn();
    }
    job.status = 'running';
    return this.toPublic(job);
  }

  /**
   * Trigger an immediate run of a controllable job.
   */
  async trigger(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || !job.controllable || !job.callbacks.triggerFn) return false;

    await job.callbacks.triggerFn();
    return true;
  }

  /**
   * Get all registered jobs (public view — no callbacks exposed).
   */
  getAll(): CronJobEntry[] {
    return Array.from(this.jobs.values()).map((j) => this.toPublic(j));
  }

  /**
   * Get a single job by ID.
   */
  get(id: string): CronJobEntry | null {
    const job = this.jobs.get(id);
    return job ? this.toPublic(job) : null;
  }

  private toPublic(job: InternalEntry): CronJobEntry {
    const { callbacks, ...entry } = job;
    return entry;
  }
}

export const cronRegistry = CronRegistryService.getInstance();
