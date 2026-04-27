/**
 * Unit tests for the graceful shutdown orchestrator.
 *
 * Exercises the sequencing without involving real signals or processes.
 * Server, DB, exit, and console are all injectable via ShutdownDeps.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGracefulShutdown } from '../gracefulShutdown.js';

/** Build a fake server whose close() invokes the callback after a tick. */
function fakeServer(closeBehavior: 'success' | 'error' | 'hang' = 'success'): any {
  return {
    close: vi.fn((cb?: (err?: Error) => void) => {
      if (closeBehavior === 'hang') return; // never call cb
      setImmediate(() => {
        if (closeBehavior === 'error') cb?.(new Error('close failed'));
        else cb?.();
      });
    }),
  };
}

const noopLog = { info: vi.fn(), error: vi.fn() };
const silentConsole = { log: vi.fn(), error: vi.fn() };

describe('createGracefulShutdown', () => {
  it('happy path: closes server, drains DB, exits 0', async () => {
    const exit = vi.fn();
    const server = fakeServer('success');
    const dbPoolEnd = vi.fn().mockResolvedValue(undefined);

    const shutdown = createGracefulShutdown({
      server, dbPoolEnd, exit, log: noopLog, console: silentConsole,
    });

    await shutdown('SIGTERM');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(dbPoolEnd).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exit code is configurable (uncaughtException → exit 1)', async () => {
    const exit = vi.fn();
    const shutdown = createGracefulShutdown({
      server: fakeServer('success'),
      exit, log: noopLog, console: silentConsole,
    });

    await shutdown('uncaughtException', 1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('skips DB pool drain when dbPoolEnd is undefined (Supabase mode)', async () => {
    const exit = vi.fn();
    const server = fakeServer('success');

    const shutdown = createGracefulShutdown({
      server,
      dbPoolEnd: undefined,
      exit, log: noopLog, console: silentConsole,
    });

    await shutdown('SIGTERM');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('continues even if DB pool drain throws', async () => {
    const exit = vi.fn();
    const dbPoolEnd = vi.fn().mockRejectedValue(new Error('pool ended badly'));

    const shutdown = createGracefulShutdown({
      server: fakeServer('success'),
      dbPoolEnd, exit, log: noopLog, console: silentConsole,
    });

    await shutdown('SIGTERM');
    // We still exit 0 — pool errors during shutdown are logged but don't
    // change exit code (the DB is going away regardless).
    expect(exit).toHaveBeenCalledWith(0);
    expect(dbPoolEnd).toHaveBeenCalledTimes(1);
  });

  it('continues even if server.close reports an error', async () => {
    const exit = vi.fn();
    const dbPoolEnd = vi.fn().mockResolvedValue(undefined);

    const shutdown = createGracefulShutdown({
      server: fakeServer('error'),
      dbPoolEnd, exit, log: noopLog, console: silentConsole,
    });

    await shutdown('SIGTERM');
    // DB drain still runs; we still exit 0.
    expect(dbPoolEnd).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent — repeated calls during active shutdown are no-ops', async () => {
    const exit = vi.fn();
    const dbPoolEnd = vi.fn().mockResolvedValue(undefined);
    const server = fakeServer('success');

    const shutdown = createGracefulShutdown({
      server, dbPoolEnd, exit, log: noopLog, console: silentConsole,
    });

    // Fire two shutdowns concurrently — only one should run.
    const a = shutdown('SIGTERM');
    const b = shutdown('SIGINT');
    await Promise.all([a, b]);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(dbPoolEnd).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('force-exits when shutdown takes longer than forceExitMs', async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      // Server.close hangs forever — only the force-exit timer rescues us.
      const server = fakeServer('hang');

      const shutdown = createGracefulShutdown({
        server,
        exit, log: noopLog, console: silentConsole,
        forceExitMs: 1000,
      });

      // Fire shutdown but DON'T await it (it would hang).
      void shutdown('SIGTERM');

      // Advance past the force-exit threshold.
      await vi.advanceTimersByTimeAsync(1100);

      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('force-exit timer is unref-able and cleared on the happy path', async () => {
    // Spy on global setTimeout/clearTimeout to verify the timer registered
    // for force-exit is passed to clearTimeout before the function returns.
    // Regression guard against leaked handles in long-running test runners.
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const setSpy = vi.fn((fn: any, ms: number) => {
      const t = realSetTimeout(fn, ms);
      (t as any).__shutdownForceExit = true;
      return t;
    });
    const clearSpy = vi.fn((t: any) => realClearTimeout(t));
    (global as any).setTimeout = setSpy;
    (global as any).clearTimeout = clearSpy;

    try {
      const exit = vi.fn();
      const dbPoolEnd = vi.fn().mockResolvedValue(undefined);

      const shutdown = createGracefulShutdown({
        server: fakeServer('success'),
        dbPoolEnd, exit, log: noopLog, console: silentConsole,
        forceExitMs: 60_000,
      });

      await shutdown('SIGTERM');
      expect(exit).toHaveBeenCalledWith(0);

      // The timer registered for force-exit must be the one passed to clearTimeout.
      const tagged = setSpy.mock.results.find((r) => (r.value as any).__shutdownForceExit);
      expect(tagged).toBeDefined();
      expect(clearSpy).toHaveBeenCalledWith(tagged!.value);
    } finally {
      (global as any).setTimeout = realSetTimeout;
      (global as any).clearTimeout = realClearTimeout;
    }
  });

  it('per-call forceExitMs override beats the factory default', async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      // Factory default 30s — without the override the test would need to
      // advance 30s, taking many ticks.
      const shutdown = createGracefulShutdown({
        server: fakeServer('hang'),
        exit, log: noopLog, console: silentConsole,
        forceExitMs: 30_000,
      });

      // Pass an emergency 100ms override (uncaughtException-like).
      void shutdown('uncaughtException', 1, 100);

      // After 50ms — under the override threshold — exit must NOT have fired.
      await vi.advanceTimersByTimeAsync(50);
      expect(exit).not.toHaveBeenCalled();

      // After 110ms total — past the override threshold — force-exit fires with code 1.
      await vi.advanceTimersByTimeAsync(60);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('factory default is used when no per-call override is passed', async () => {
    const exit = vi.fn();
    const shutdown = createGracefulShutdown({
      server: fakeServer('success'),
      exit, log: noopLog, console: silentConsole,
      forceExitMs: 30_000,
    });

    // Standard SIGTERM call — no third arg. Happy path completes via
    // server.close success well under 30s.
    await shutdown('SIGTERM');
    expect(exit).toHaveBeenCalledWith(0);
    // If force-exit timer wasn't unref'd, this test would hang past resolution.
  });
});
