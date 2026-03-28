import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
 * Conditional CSRF middleware — only enforces when a *valid* auth cookie is present.
 * A stale/expired cookie (e.g. from a previous session) is ignored so that
 * pre-auth flows like OTP send/verify are not blocked by CSRF enforcement.
 */
export function conditionalCsrf(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.idswyft_token;
  if (token) {
    try {
      jwt.verify(token, config.jwtSecret);
      doubleCsrfProtection(req, res, next);
      return;
    } catch {
      // Token expired/invalid — treat as unauthenticated, skip CSRF
    }
  }
  next();
}

export { doubleCsrfProtection as csrfProtection };
