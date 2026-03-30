export interface SharedLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

const consoleLogger: SharedLogger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ?? ''),
};

let _logger: SharedLogger = consoleLogger;

export function configureSharedLogger(l: SharedLogger): void {
  _logger = l;
}

export const logger = new Proxy({} as SharedLogger, {
  get: (_target, prop: string) => (...args: unknown[]) => (_logger as any)[prop](...args),
});
