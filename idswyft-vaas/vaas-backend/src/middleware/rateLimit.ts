import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import { vaasSupabase } from '../config/database.js';
import { VaasApiResponse } from '../types/index.js';

// Auth-specific rate limit (stricter — prevents brute-force login attempts)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-API-key rate limiting middleware
// Applied after requireApiKey so (req as any).apiKey is populated
export const apiKeyRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = (req as any).apiKey;
  if (!apiKey) {
    return next(); // No API key auth on this route, skip
  }

  const keyId: string = apiKey.id;
  const orgId: string = apiKey.organization_id;
  const limitPerHour: number = apiKey.rate_limit_per_hour || config.rateLimiting.maxRequestsPerOrg;

  try {
    // Count requests from this key in the current hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { data: usageRows, error } = await vaasSupabase
      .from('vaas_api_key_usage')
      .select('request_count')
      .eq('api_key_id', keyId)
      .gte('usage_date', oneHourAgo.toISOString().split('T')[0]);

    if (error && error.code !== 'PGRST116') {
      console.error('[RateLimit] Failed to check usage:', error.message);
      return next(); // Fail open — don't block requests if DB is down
    }

    const totalRequests = (usageRows || []).reduce((sum, row) => sum + (row.request_count || 0), 0);

    // Set standard rate limit headers
    const remaining = Math.max(0, limitPerHour - totalRequests);
    res.set({
      'X-RateLimit-Limit': limitPerHour.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    if (totalRequests >= limitPerHour) {
      // Track rate limit hit
      Promise.resolve(vaasSupabase.rpc('increment_api_key_usage', {
        p_api_key_id: keyId,
        p_organization_id: orgId,
        p_is_success: false,
      })).catch(() => {}); // Fire-and-forget

      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `API key rate limit exceeded. Maximum ${limitPerHour} requests per hour.`
        }
      };
      return res.status(429).json(response);
    }

    next();
  } catch (err: any) {
    console.error('[RateLimit] Middleware error:', err.message);
    next(); // Fail open
  }
};
