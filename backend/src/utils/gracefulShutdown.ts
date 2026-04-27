/**
 * Graceful shutdown orchestration. Extracted from server.ts so the
 * sequencing (close server → drain DB → exit) can be unit-tested
 * without spawning a subprocess.
 */

export interface ShutdownDeps {
  /** HTTP server with an async-style close. */
  server: { close: (cb?: (err?: Error) => void) => void };
  /** Optional DB pool to drain. Pass undefined for Supabase JS (no pool). */
  dbPoolEnd?: () => Promise<void>;
  /** Process exit (injectable so tests don't actually exit). */
  exit: (code: number) => void;
  /** Logger interface — minimal subset of winston. */
  log: {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
  /** Force-exit threshold in ms. Defaults to 25s (Railway sends SIGKILL at 30s). */
  forceExitMs?: number;
  /** Console for stdout/stderr — injectable for tests. */
  console?: { log: (msg: string) => void; error: (msg: string) => void };
}

export interface ShutdownHandler {
  /** Trigger shutdown with the given signal/reason. Idempotent — repeat calls no-op. */
  (signal: string, exitCode?: number): Promise<void>;
}

/**
 * Build a shutdown handler bound to the given dependencies.
 * The returned function is idempotent: subsequent invocations during an
 * active shutdown log and return without re-running the sequence.
 */
export function createGracefulShutdown(deps: ShutdownDeps): ShutdownHandler {
  const forceExitMs = deps.forceExitMs ?? 25_000;
  const con = deps.console ?? console;
  let inProgress = false;

  return async function shutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (inProgress) {
      con.log(`${signal} received during shutdown, ignoring`);
      return;
    }
    inProgress = true;
    con.log(`Received ${signal}. Starting graceful shutdown (max ${forceExitMs}ms)...`);
    deps.log.info('Graceful shutdown initiated', { signal, exitCode });

    const forceExitTimer = setTimeout(() => {
      con.error(`Graceful shutdown exceeded ${forceExitMs}ms; force-exiting`);
      deps.log.error('Force-exit during shutdown', { signal });
      deps.exit(1);
    }, forceExitMs);
    forceExitTimer.unref();

    // 1+2: close HTTP server (waits for in-flight to finish).
    await new Promise<void>((resolve) => {
      deps.server.close((err) => {
        if (err) {
          con.error(`server.close error: ${err.message}`);
          deps.log.error('server.close error', { error: err.message });
        } else {
          con.log('HTTP server closed');
        }
        resolve();
      });
    });

    // 3: close DB pool if available.
    if (deps.dbPoolEnd) {
      try {
        await deps.dbPoolEnd();
        con.log('DB pool closed');
      } catch (err) {
        con.error(`Error closing DB pool: ${err}`);
        deps.log.error('DB pool close error', { error: String(err) });
      }
    }

    clearTimeout(forceExitTimer);
    con.log('Graceful shutdown complete');
    deps.log.info('Graceful shutdown complete', { signal });
    deps.exit(exitCode);
  };
}
