// ─── Inline types to avoid circular dependency with index.ts ──

/** Verification status — mirrors index.ts VerificationStatus */
type VerificationStatus =
  | 'AWAITING_FRONT'
  | 'FRONT_PROCESSING'
  | 'AWAITING_BACK'
  | 'BACK_PROCESSING'
  | 'CROSS_VALIDATING'
  | 'AWAITING_LIVE'
  | 'LIVE_PROCESSING'
  | 'FACE_MATCHING'
  | 'COMPLETE'
  | 'HARD_REJECTED';

/** Minimal verification result shape needed by events */
interface VerificationResult {
  success: boolean;
  verification_id: string;
  status: VerificationStatus;
  current_step: number;
  final_result?: string | null;
  rejection_reason?: string | null;
  [key: string]: any;
}

// ─── Event Types ────────────────────────────────────────

export type VerificationEventType =
  | 'status_changed'
  | 'step_completed'
  | 'verification_complete'
  | 'verification_failed'
  | 'error';

export interface VerificationEvent {
  type: VerificationEventType;
  verificationId: string;
  status: VerificationStatus;
  data: VerificationResult;
  timestamp: string;
}

export type VerificationEventHandler = (event: VerificationEvent) => void;

export type WatchTransport = 'polling' | 'realtime';

export interface WatchOptions {
  /** Polling interval in milliseconds (default: 2000) */
  interval?: number;
  /** Maximum number of poll attempts before auto-stopping (default: 300 = 10 min at 2s) */
  maxAttempts?: number;
  /**
   * Transport mode (default: 'polling').
   * - 'polling' — HTTP polling at configurable interval
   * - 'realtime' — Supabase Realtime subscription with polling fallback
   *
   * Note: 'realtime' requires @supabase/supabase-js as a peer dependency
   * and SUPABASE_URL/SUPABASE_ANON_KEY to be provided in the SDK config.
   */
  transport?: WatchTransport;
}

// ─── Terminal states where polling should stop ──────────

const TERMINAL_STATUSES: Set<VerificationStatus> = new Set([
  'COMPLETE',
  'HARD_REJECTED',
]);

// ─── Event Emitter ──────────────────────────────────────

/**
 * VerificationEventEmitter provides real-time status updates for a
 * verification session by polling the status endpoint at a configurable
 * interval.
 *
 * Events emitted:
 * - `status_changed` — any status transition
 * - `step_completed` — current_step incremented
 * - `verification_complete` — terminal success (COMPLETE)
 * - `verification_failed` — terminal failure (HARD_REJECTED)
 * - `error` — polling or network error
 *
 * Usage:
 * ```ts
 * const watcher = sdk.watch(verificationId);
 * watcher.on('verification_complete', (event) => {
 *   console.log('Verified!', event.data.final_result);
 * });
 * // Later: watcher.destroy();
 * ```
 */
export class VerificationEventEmitter {
  private listeners: Map<VerificationEventType | '*', Set<VerificationEventHandler>> = new Map();
  private onceListeners: Map<VerificationEventType, Set<VerificationEventHandler>> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastStatus: VerificationStatus | null = null;
  private lastStep: number | null = null;
  private attempts = 0;
  private destroyed = false;

  constructor(
    private readonly verificationId: string,
    private readonly pollFn: (id: string) => Promise<VerificationResult>,
    private readonly options: Required<WatchOptions>,
  ) {
    this.start();
  }

  /** Register a handler for an event type. Returns `this` for chaining. */
  on(event: VerificationEventType | '*', handler: VerificationEventHandler): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return this;
  }

  /** Register a one-time handler that fires once then auto-removes. */
  once(event: VerificationEventType, handler: VerificationEventHandler): this {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(handler);
    return this;
  }

  /** Remove a specific handler. */
  off(event: VerificationEventType | '*', handler: VerificationEventHandler): this {
    this.listeners.get(event)?.delete(handler);
    this.onceListeners.get(event as VerificationEventType)?.delete(handler);
    return this;
  }

  /** Stop polling and remove all listeners. */
  destroy(): void {
    this.destroyed = true;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
    this.onceListeners.clear();
  }

  /** Whether this watcher is still active. */
  get isActive(): boolean {
    return !this.destroyed;
  }

  // ── Internal ──────────────────────────────────────────

  private start(): void {
    // Do an immediate first poll, then schedule recurring
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.options.interval);
  }

  private async poll(): Promise<void> {
    if (this.destroyed) return;

    this.attempts++;
    if (this.attempts > this.options.maxAttempts) {
      this.emit('error', {
        type: 'error',
        verificationId: this.verificationId,
        status: this.lastStatus || 'AWAITING_FRONT',
        data: {} as VerificationResult,
        timestamp: new Date().toISOString(),
      });
      this.destroy();
      return;
    }

    try {
      const result = await this.pollFn(this.verificationId);
      const currentStatus = result.status;
      const currentStep = result.current_step ?? 0;

      // Detect status change
      if (this.lastStatus !== null && currentStatus !== this.lastStatus) {
        this.emit('status_changed', {
          type: 'status_changed',
          verificationId: this.verificationId,
          status: currentStatus,
          data: result,
          timestamp: new Date().toISOString(),
        });
      }

      // Detect step completion
      if (this.lastStep !== null && currentStep > this.lastStep) {
        this.emit('step_completed', {
          type: 'step_completed',
          verificationId: this.verificationId,
          status: currentStatus,
          data: result,
          timestamp: new Date().toISOString(),
        });
      }

      // Terminal states
      if (TERMINAL_STATUSES.has(currentStatus)) {
        const eventType: VerificationEventType =
          currentStatus === 'COMPLETE' ? 'verification_complete' : 'verification_failed';

        this.emit(eventType, {
          type: eventType,
          verificationId: this.verificationId,
          status: currentStatus,
          data: result,
          timestamp: new Date().toISOString(),
        });

        this.destroy();
        return;
      }

      this.lastStatus = currentStatus;
      this.lastStep = currentStep;
    } catch (err: any) {
      this.emit('error', {
        type: 'error',
        verificationId: this.verificationId,
        status: this.lastStatus || 'AWAITING_FRONT',
        data: {} as VerificationResult,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private emit(type: VerificationEventType, event: VerificationEvent): void {
    // Typed listeners
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event); } catch { /* consumer error — don't crash polling */ }
      }
    }

    // Wildcard listeners
    const wildcardHandlers = this.listeners.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try { handler(event); } catch { /* consumer error */ }
      }
    }

    // Once listeners
    const onceHandlers = this.onceListeners.get(type);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try { handler(event); } catch { /* consumer error */ }
      }
      this.onceListeners.delete(type);
    }
  }
}
