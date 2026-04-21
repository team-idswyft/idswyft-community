export interface CorsConfig {
  nodeEnv: string;
  corsOrigins: string[];
  railwayAllowedOrigins?: string[];
}

/**
 * Determines whether an origin is allowed to make cross-origin requests.
 *
 * Uses an explicit allowlist only — NO pattern matching or wildcard subdomains.
 * The previous implementation used origin.match(/customer|portal|vaas/i) which
 * would pass for attacker-portal.up.railway.app. This function fixes that.
 */
export function isCorsAllowed(origin: string, config: CorsConfig): boolean {
  // 1. Check the configured origin allowlist (exact match)
  if (config.corsOrigins.includes(origin)) return true;

  // 2. Check the explicit Railway deployment allowlist (exact match, no wildcards)
  if (config.railwayAllowedOrigins?.includes(origin)) return true;

  // 3. In development only, allow localhost, loopback, and RFC-1918 LAN addresses
  //    so that phones on the same network can reach the dev backend.
  if (config.nodeEnv === 'development') {
    if (origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('https://127.0.0.1:')) {
      return true;
    }
    try {
      const { hostname, protocol } = new URL(origin);
      if ((protocol === 'http:' || protocol === 'https:') &&
          (/^10\./.test(hostname) ||
           /^192\.168\./.test(hostname) ||
           /^172\.(1[6-9]|2\d|3[01])\./.test(hostname))) {
        return true;
      }
    } catch { /* unparseable origin — deny */ }
  }

  return false;
}

export function buildCorsOptions(config: CorsConfig) {
  return {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Allow server-to-server requests (no Origin header)
      if (!origin) return callback(null, true);
      if (isCorsAllowed(origin, config)) return callback(null, true);
      // Silently deny — omit CORS headers so the browser blocks the request.
      // Using callback(null, false) instead of callback(new Error(...)) avoids
      // bubbling an unhandled error into Sentry for every bot/scanner hit.
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 200,
    // Prevent CDN (Railway/Fastly) from caching preflight responses.
    // Cached preflights with mismatched Origin cause CORS failures.
    preflightContinue: false,
    maxAge: 600, // browser may cache preflight for 10 min, but CDN must not
  };
}
