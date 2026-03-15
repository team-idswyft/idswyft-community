import { VerificationEventEmitter } from '../src/events';
import type { VerificationResult, VerificationStatus } from '../src/index';

// ─── Helpers ────────────────────────────────────────────

function makeResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    success: true,
    verification_id: 'test-id',
    status: 'AWAITING_FRONT' as VerificationStatus,
    current_step: 1,
    ...overrides,
  };
}

function createPollFn(responses: VerificationResult[]) {
  let callIndex = 0;
  return jest.fn(async () => {
    const result = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return result;
  });
}

// ─── Tests ──────────────────────────────────────────────

describe('VerificationEventEmitter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits status_changed when status transitions', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'AWAITING_BACK', current_step: 2 }),
    ]);

    const handler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('status_changed', handler);

    // First poll (immediate) — sets initial state
    await jest.advanceTimersByTimeAsync(0);
    expect(handler).not.toHaveBeenCalled();

    // Second poll — status changes
    await jest.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('status_changed');
    expect(handler.mock.calls[0][0].status).toBe('AWAITING_BACK');

    emitter.destroy();
  });

  it('emits step_completed when step number increases', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'AWAITING_BACK', current_step: 2 }),
    ]);

    const handler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('step_completed', handler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('step_completed');

    emitter.destroy();
  });

  it('emits verification_complete and auto-destroys on COMPLETE', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_LIVE', current_step: 3 }),
      makeResult({ status: 'COMPLETE', current_step: 5, final_result: 'verified' }),
    ]);

    const completeHandler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('verification_complete', completeHandler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);

    expect(completeHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler.mock.calls[0][0].data.final_result).toBe('verified');
    expect(emitter.isActive).toBe(false);
  });

  it('emits verification_failed on HARD_REJECTED', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'HARD_REJECTED', current_step: 2, rejection_reason: 'LIVENESS_FAILED' }),
    ]);

    const failHandler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('verification_failed', failHandler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);

    expect(failHandler).toHaveBeenCalledTimes(1);
    expect(emitter.isActive).toBe(false);
  });

  it('once() fires once then is removed', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'AWAITING_BACK', current_step: 2 }),
      makeResult({ status: 'AWAITING_LIVE', current_step: 3 }),
    ]);

    const handler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.once('status_changed', handler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(100);
    // Should NOT fire again
    expect(handler).toHaveBeenCalledTimes(1);

    emitter.destroy();
  });

  it('destroy() stops polling and clears listeners', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'AWAITING_BACK', current_step: 2 }),
    ]);

    const handler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('status_changed', handler);
    emitter.destroy();

    expect(emitter.isActive).toBe(false);

    await jest.advanceTimersByTimeAsync(500);
    // No events should fire after destroy
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits error when pollFn throws', async () => {
    let callCount = 0;
    const pollFn = jest.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Network error');
      return makeResult({ status: 'AWAITING_FRONT', current_step: 1 });
    });

    const errorHandler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('error', errorHandler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0][0].type).toBe('error');

    emitter.destroy();
  });

  it('wildcard listener receives all events', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
      makeResult({ status: 'COMPLETE', current_step: 5 }),
    ]);

    const handler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 10,
    });

    emitter.on('*', handler);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);

    // Should have received status_changed, step_completed, and verification_complete
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-stops after maxAttempts', async () => {
    const pollFn = createPollFn([
      makeResult({ status: 'AWAITING_FRONT', current_step: 1 }),
    ]);

    const errorHandler = jest.fn();
    const emitter = new VerificationEventEmitter('test-id', pollFn, {
      interval: 100,
      maxAttempts: 3,
    });

    emitter.on('error', errorHandler);

    // Immediate + 3 intervals = 4 polls, maxAttempts = 3 so 4th should trigger error
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);

    expect(errorHandler).toHaveBeenCalled();
    expect(emitter.isActive).toBe(false);
  });
});
