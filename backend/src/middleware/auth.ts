import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { AuthenticationError, AuthorizationError, catchAsync } from './errorHandler.js';
import { logger } from '@/utils/logger.js';
import { APIKey, Developer, User, AdminUser, Reviewer } from '@/types/index.js';

// Service token authentication for service-to-service communication
export const authenticateServiceToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const serviceToken = req.headers['x-service-token'] as string;
  
  if (!serviceToken) {
    throw new AuthenticationError('Service token is required. Include X-Service-Token header.');
  }
  
  // Validate service token (you can make this more sophisticated later)
  const expectedToken = process.env.SERVICE_TOKEN || config.serviceToken;
  
  if (!expectedToken) {
    logger.error('SERVICE_TOKEN not configured in environment');
    throw new AuthenticationError('Service authentication not configured');
  }
  
  // Use timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(serviceToken);
  const expectedBuffer = Buffer.from(expectedToken);
  
  if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    logger.warn('Invalid service token attempted', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      tokenPrefix: serviceToken.substring(0, 8)
    });
    throw new AuthenticationError('Invalid service token');
  }
  
  // Mark request as authenticated service
  req.serviceAuthenticated = true;
  req.isSandbox = false; // Service tokens are always production
  
  logger.info('Service token authenticated', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next();
});

// API Key authentication middleware
export const authenticateAPIKey = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    throw new AuthenticationError('API key is required. Include X-API-Key header.');
  }
  
  // Extract key prefix and hash the full key
  const keyPrefix = apiKey.substring(0, 8);

  const keyHash = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(apiKey)
    .digest('hex');

  try {
    // Find API key in database
    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select(`
        *,
        developer:developers(*)
      `)
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyError || !apiKeyRecord) {
      logger.warn('Invalid API key attempted', {
        keyPrefix,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      throw new AuthenticationError('Invalid API key');
    }
    
    // Check if key is expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      throw new AuthenticationError('API key has expired');
    }
    
    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyRecord.id);
    
    // Attach API key and developer to request
    req.apiKey = apiKeyRecord as APIKey;
    req.developer = apiKeyRecord.developer as Developer;

    // Check if developer account is suspended
    if (req.developer?.status === 'suspended') {
      throw new AuthorizationError('Developer account suspended');
    }

    logger.info('API key authenticated', {
      developerId: apiKeyRecord.developer_id,
      keyPrefix,
      isSandbox: apiKeyRecord.is_sandbox
    });
    
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    logger.error('API key authentication error:', error);
    throw new AuthenticationError('Authentication failed');
  }
});

// JWT authentication for admin users
export const authenticateJWT = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new AuthenticationError('Access token is required');
  }
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-admin',
    }) as any;

    // Get admin user from database
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', decoded.id)
      .single();
    
    if (error || !adminUser) {
      throw new AuthenticationError('Invalid token');
    }
    
    req.user = {
      ...adminUser,
      updated_at: adminUser.updated_at || adminUser.created_at
    } as AdminUser;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    throw error;
  }
});

// User authentication (for verification endpoints)
export const authenticateUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // For verification endpoints, we'll use user_id from request body/params
  // and validate against the API key's permissions
  
  if (!req.apiKey || !req.developer) {
    throw new AuthenticationError('API key authentication required');
  }
  
  const userId = req.body.user_id || req.params.user_id;
  
  if (!userId) {
    throw new AuthenticationError('User ID is required');
  }
  
  try {
    // Get or create user
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create them
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ id: userId })
        .select('*')
        .single();

      if (createError) {
        // Handle race condition: another request created the user concurrently
        if (createError.code === '23505') {
          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
          if (existingUser) {
            user = existingUser;
          } else {
            throw new AuthenticationError('Failed to authenticate user');
          }
        } else {
          logger.error('Failed to create user:', createError);
          throw new AuthenticationError('Failed to authenticate user');
        }
      } else {
        user = newUser;
        logger.info('New user created', { userId, developerId: req.developer.id });
      }
    } else if (error) {
      logger.error('User authentication error:', error);
      throw new AuthenticationError('Failed to authenticate user');
    }
    
    req.user = user as User;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    logger.error('User authentication error:', error);
    throw new AuthenticationError('Authentication failed');
  }
});

// Authorization middleware for admin roles
export const requireAdminRole = (allowedRoles: string[] = ['admin', 'reviewer']) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    const adminUser = req.user as AdminUser;
    
    if (!allowedRoles.includes(adminUser.role)) {
      logger.warn('Unauthorized admin access attempt', {
        userId: adminUser.id,
        role: adminUser.role,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl
      });
      throw new AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    
    next();
  });
};

// Sandbox mode check
export const checkSandboxMode = (req: Request, res: Response, next: NextFunction) => {
  const isSandboxRequest = req.body.sandbox === true || req.query.sandbox === 'true';
  const isProductionEnv = config.nodeEnv === 'production';
  
  if (req.apiKey) {
    const isSandboxKey = req.apiKey.is_sandbox;

    // Sandbox keys cannot be used in production
    if (isProductionEnv && isSandboxKey) {
      throw new AuthorizationError('Sandbox API keys cannot be used in production environment');
    }

    // Production keys cannot make explicit sandbox requests
    if (!isSandboxKey && isSandboxRequest) {
      throw new AuthorizationError('Production API keys cannot make sandbox requests');
    }
  }

  // Auto-infer sandbox mode from key type — SDK widgets (e.g. EndUserVerification)
  // don't need to explicitly pass sandbox:true; the key itself declares its mode.
  req.isSandbox = req.apiKey?.is_sandbox || isSandboxRequest || false;
  
  next();
};

// Rate limiting bypass for premium developers (future feature)
export const checkPremiumAccess = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.developer) {
    return next();
  }
  
  // For now, all developers have the same access level
  // This can be extended to check for premium subscriptions
  req.isPremium = false;
  
  next();
});

// Generate JWT token for admin users
export const generateAdminToken = (adminUser: AdminUser): string => {
  return jwt.sign(
    {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role
    },
    config.jwtSecret,
    {
      expiresIn: '24h',
      issuer: 'idswyft-api',
      audience: 'idswyft-admin'
    }
  );
};

// Generate JWT token for developers
export const generateDeveloperToken = (developer: Developer): string => {
  return jwt.sign(
    {
      id: developer.id,
      email: developer.email,
      type: 'developer'
    },
    config.jwtSecret,
    {
      expiresIn: '7d',
      issuer: 'idswyft-api',
      audience: 'idswyft-developer'
    }
  );
};

// JWT authentication for developers
export const authenticateDeveloperJWT = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new AuthenticationError('Access token is required');
  }
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    
    // Verify it's a developer token
    if (decoded.type !== 'developer') {
      throw new AuthenticationError('Invalid developer token');
    }
    
    // Get developer from database
    const { data: developer, error } = await supabase
      .from('developers')
      .select('*')
      .eq('id', decoded.id)
      .eq('is_verified', true)
      .single();
    
    if (error || !developer) {
      throw new AuthenticationError('Invalid token or developer not found');
    }

    // Check if developer account is suspended
    if (developer.status === 'suspended') {
      throw new AuthorizationError('Your account has been suspended');
    }

    req.developer = developer as Developer;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    throw error;
  }
});

// Generate API key
export const generateAPIKey = (): { key: string; hash: string; prefix: string } => {
  const key = `ik_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(key)
    .digest('hex');
  const prefix = key.substring(0, 8);
  
  return { key, hash, prefix };
};

// Generate a short-lived registration token (15 min) for new developers who verified OTP
export const generateRegistrationToken = (email: string): string => {
  return jwt.sign(
    { email, type: 'registration' },
    config.jwtSecret,
    { expiresIn: '15m', issuer: 'idswyft-api', audience: 'idswyft-registration' }
  );
};

// Verify a registration token — returns the email or throws
export const verifyRegistrationToken = (token: string): string => {
  const decoded = jwt.verify(token, config.jwtSecret, {
    issuer: 'idswyft-api',
    audience: 'idswyft-registration',
  }) as { email: string; type: string };

  if (decoded.type !== 'registration') {
    throw new AuthenticationError('Invalid registration token');
  }

  return decoded.email;
};

// Generate JWT token for reviewers (24h, scoped to developer)
export const generateReviewerToken = (reviewer: { id: string; email: string; developer_id: string }): string => {
  return jwt.sign(
    {
      id: reviewer.id,
      email: reviewer.email,
      developer_id: reviewer.developer_id,
      type: 'reviewer',
    },
    config.jwtSecret,
    {
      expiresIn: '24h',
      issuer: 'idswyft-api',
      audience: 'idswyft-reviewer',
    }
  );
};

// JWT authentication for reviewers
export const authenticateReviewerJWT = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AuthenticationError('Access token is required');
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-reviewer',
    }) as any;

    if (decoded.type !== 'reviewer') {
      throw new AuthenticationError('Invalid reviewer token');
    }

    // Look up reviewer in DB — must not be revoked, must match developer_id from JWT
    const { data: reviewer, error } = await supabase
      .from('verification_reviewers')
      .select('*')
      .eq('id', decoded.id)
      .eq('developer_id', decoded.developer_id)
      .neq('status', 'revoked')
      .single();

    if (error || !reviewer) {
      throw new AuthenticationError('Reviewer account not found or revoked');
    }

    req.reviewer = reviewer as Reviewer;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    throw error;
  }
});

// Flexible middleware: accepts admin JWT OR reviewer JWT
// Sets req.user (admin) or req.reviewer (reviewer with developer_id scope)
export const authenticateAdminOrReviewer = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AuthenticationError('Access token is required');
  }

  // Try admin token first (audience: idswyft-admin)
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-admin',
    }) as any;

    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (!error && adminUser) {
      req.user = {
        ...adminUser,
        updated_at: adminUser.updated_at || adminUser.created_at,
      } as AdminUser;
      return next();
    }
  } catch {
    // Not a valid admin token — try reviewer next
  }

  // Try reviewer token (audience: idswyft-reviewer)
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-reviewer',
    }) as any;

    if (decoded.type !== 'reviewer') {
      throw new AuthenticationError('Invalid token');
    }

    const { data: reviewer, error } = await supabase
      .from('verification_reviewers')
      .select('*')
      .eq('id', decoded.id)
      .eq('developer_id', decoded.developer_id)
      .neq('status', 'revoked')
      .single();

    if (!error && reviewer) {
      req.reviewer = reviewer as Reviewer;
      return next();
    }
  } catch {
    // Not a valid reviewer token either
  }

  throw new AuthenticationError('Invalid or expired token');
});

// Middleware to log authentication events
export const logAuthEvent = (event: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.info(`Auth event: ${event}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      developerId: req.developer?.id,
      userId: req.user?.id,
      apiKeyPrefix: req.apiKey?.key_prefix
    });
    next();
  };
};

declare global {
  namespace Express {
    interface Request {
      isSandbox?: boolean;
      isPremium?: boolean;
      serviceAuthenticated?: boolean;
    }
  }
}

export default {
  authenticateServiceToken,
  authenticateAPIKey,
  authenticateJWT,
  authenticateDeveloperJWT,
  authenticateReviewerJWT,
  authenticateAdminOrReviewer,
  authenticateUser,
  requireAdminRole,
  checkSandboxMode,
  checkPremiumAccess,
  generateAdminToken,
  generateDeveloperToken,
  generateReviewerToken,
  generateRegistrationToken,
  verifyRegistrationToken,
  generateAPIKey,
  logAuthEvent
};