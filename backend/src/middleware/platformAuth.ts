/**
 * Platform service-token authentication.
 *
 * Validates the X-Platform-Service-Token header against
 * IDSWYFT_PLATFORM_SERVICE_TOKEN. Used by /api/platform/* routes
 * (service key mint/list/rotate/revoke) — typically called by
 * vaas-backend acting as a proxy for the platform-admin UI.
 *
 * Cloud-only feature: this file is stripped from the community
 * mirror via .community-ignore. The import in server.ts is wrapped
 * in a dynamic `import()` + try/catch so community builds skip the
 * registration silently when the file isn't present.
 *
 * Security:
 * - Uses crypto.timingSafeEqual to prevent timing-attack discovery
 *   of valid tokens
 * - Refuses to start (throws 503 on first request) if the token
 *   env var is not set in cloud — fail-closed posture
 * - Token is never logged in plaintext
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';
import { logger } from '@/utils/logger.js';

const HEADER_NAME = 'x-platform-service-token';

/**
 * Constant-time comparison of two strings.
 * Returns false if lengths differ (without revealing where).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authenticate a platform-service caller via X-Platform-Service-Token.
 * On success, sets req.isPlatformService = true. Does NOT set
 * req.apiKey, req.developer, or req.isService — those belong to
 * end-user verification calls, not platform-management calls.
 */
export const authenticatePlatformServiceToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const expected = process.env.IDSWYFT_PLATFORM_SERVICE_TOKEN;

  if (!expected || expected.length === 0) {
    logger.error(
      'IDSWYFT_PLATFORM_SERVICE_TOKEN not set — refusing platform request',
    );
    throw new AuthorizationError(
      'Platform service token not configured on server',
    );
  }

  const provided = req.headers[HEADER_NAME] as string | undefined;
  if (!provided) {
    throw new AuthenticationError(
      `Platform service token required. Include ${HEADER_NAME} header.`,
    );
  }

  if (!timingSafeStringEqual(provided, expected)) {
    logger.warn('Invalid platform service token attempted', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
    });
    throw new AuthenticationError('Invalid platform service token');
  }

  (req as any).isPlatformService = true;
  next();
};

declare global {
  namespace Express {
    interface Request {
      // True when authenticated via X-Platform-Service-Token (platform-admin
      // proxy calls). Disjoint from req.isService (which is for service-key
      // verification calls).
      isPlatformService?: boolean;
    }
  }
}
