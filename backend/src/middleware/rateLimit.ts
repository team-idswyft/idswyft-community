import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { RateLimitError, catchAsync } from './errorHandler.js';
import { logger } from '@/utils/logger.js';

// Basic rate limiting using express-rate-limit
export const basicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Advanced rate limiting with database tracking
export const rateLimitMiddleware = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (!config.rateLimiting.enabled) return next();

  const windowMs = config.rateLimiting.windowMs;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  
  // Determine identifier and limits based on request type
  let identifier: string;
  let identifierType: 'user' | 'developer' | 'ip';
  let maxRequests: number;
  
  if (req.apiKey) {
    identifier = req.apiKey.developer_id;
    identifierType = 'developer';
    maxRequests = config.rateLimiting.maxRequestsPerDev;
  } else if (req.user) {
    identifier = req.user.id;
    identifierType = 'user';
    maxRequests = config.rateLimiting.maxRequestsPerUser;
  } else {
    identifier = req.ip || 'unknown';
    identifierType = 'ip';
    maxRequests = 100; // Default for unauthenticated requests
  }
  
  try {
    // Check if currently blocked
    const { data: blockedRecord, error: blockedError } = await supabase
      .from('rate_limits')
      .select('blocked_until')
      .eq('identifier', identifier)
      .eq('identifier_type', identifierType)
      .gte('blocked_until', now.toISOString())
      .single();
    
    if (blockedRecord && !blockedError) {
      const blockedUntil = new Date(blockedRecord.blocked_until);
      const retryAfter = Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000);
      
      res.set({
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': blockedUntil.toISOString()
      });
      
      throw new RateLimitError(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    }
    
    // Get or create rate limit record for current window
    const { data: rateLimitRecord, error: selectError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', identifier)
      .eq('identifier_type', identifierType)
      .gte('window_start', windowStart.toISOString())
      .single();
    
    let currentCount = 0;
    let recordId: string;
    
    if (rateLimitRecord && !selectError) {
      // Update existing record
      currentCount = rateLimitRecord.request_count + 1;
      recordId = rateLimitRecord.id;
      
      const { error: updateError } = await supabase
        .from('rate_limits')
        .update({ 
          request_count: currentCount,
          blocked_until: currentCount > maxRequests ? 
            new Date(now.getTime() + windowMs).toISOString() : null
        })
        .eq('id', recordId);
      
      if (updateError) {
        logger.error('Failed to update rate limit record:', updateError);
      }
    } else {
      // Create new record
      currentCount = 1;
      
      const { data: newRecord, error: insertError } = await supabase
        .from('rate_limits')
        .insert({
          identifier,
          identifier_type: identifierType,
          request_count: currentCount,
          window_start: now.toISOString()
        })
        .select('id')
        .single();
      
      if (insertError) {
        logger.error('Failed to create rate limit record:', insertError);
      } else if (newRecord) {
        recordId = newRecord.id;
      }
    }
    
    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - currentCount);
    const resetTime = new Date(now.getTime() + windowMs);
    
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toISOString(),
      'X-RateLimit-Window': Math.floor(windowMs / 1000).toString()
    });
    
    // Check if limit exceeded
    if (currentCount > maxRequests) {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.set('Retry-After', retryAfter.toString());
      
      logger.warn('Rate limit exceeded', {
        identifier,
        identifierType,
        currentCount,
        maxRequests,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl
      });
      
      throw new RateLimitError(`Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.floor(windowMs / 60000)} minutes.`);
    }
    
    // Log rate limit info for monitoring
    if (currentCount > maxRequests * 0.8) { // Warn at 80% of limit
      logger.warn('Approaching rate limit', {
        identifier,
        identifierType,
        currentCount,
        maxRequests,
        remaining
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    
    // On database errors, fall back to basic rate limiting
    logger.error('Rate limit middleware error, falling back to basic limiting:', error);
    basicRateLimit(req, res, next);
  }
});

// Cleanup old rate limit records (call this periodically)
export const cleanupRateLimitRecords = async () => {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 24); // Keep 24 hours of data
  
  try {
    const { error } = await supabase
      .from('rate_limits')
      .delete()
      .lt('window_start', cutoffDate.toISOString())
      .is('blocked_until', null);
    
    if (error) {
      logger.error('Failed to cleanup rate limit records:', error);
    } else {
      logger.info('Rate limit records cleaned up successfully');
    }
  } catch (error) {
    logger.error('Error during rate limit cleanup:', error);
  }
};

// Verification-specific rate limiting
export const verificationRateLimit = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (!config.rateLimiting.enabled) return next();

  // Fall back to developer scope when req.user is not set (API-key authenticated requests)
  const userId = req.user?.id || (req as any).apiKey?.developer_id;
  if (!userId) {
    return next();
  }
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  try {
    // Count verification attempts in the last 24 hours
    const { count, error } = await supabase
      .from('verification_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo.toISOString());
    
    if (error) {
      logger.error('Failed to check verification rate limit:', error);
      return next();
    }
    
    const maxVerificationsPerDay = config.rateLimiting.maxRequestsPerUser;
    
    if (count && count >= maxVerificationsPerDay) {
      res.set({
        'X-Verification-Limit': maxVerificationsPerDay.toString(),
        'X-Verification-Count': count.toString(),
        'X-Verification-Reset': new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      });
      
      throw new RateLimitError(`Daily verification limit exceeded. Maximum ${maxVerificationsPerDay} verifications per 24 hours.`);
    }
    
    res.set({
      'X-Verification-Limit': maxVerificationsPerDay.toString(),
      'X-Verification-Remaining': (maxVerificationsPerDay - (count || 0)).toString()
    });
    
    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    logger.error('Verification rate limit error:', error);
    next();
  }
});

export default rateLimitMiddleware;