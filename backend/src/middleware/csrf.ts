import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';
import config from '@/config/index.js';

const isProd = config.nodeEnv === 'production';

export const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.jwtSecret,
  // __Host- prefix requires Secure flag — only usable over HTTPS (production)
  cookieName: isProd ? '__Host-psifi.x-csrf-token' : '_csrf',
  cookieOptions: {
    sameSite: 'strict',
    secure: isProd,
    httpOnly: true,
    path: '/',
  },
  size: 64,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

/**
 * Conditional CSRF middleware — only enforces when an auth cookie is present.
 * This allows unauthenticated routes (registration, OTP login) to pass through
 * while protecting all cookie-authenticated mutations from cross-site forgery.
 */
export function conditionalCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.cookies?.idswyft_token) {
    doubleCsrfProtection(req, res, next);
    return;
  }
  next();
}

export { doubleCsrfProtection as csrfProtection };
