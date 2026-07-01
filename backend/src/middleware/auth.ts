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
  
  // HMAC-normalize both tokens so timingSafeEqual always compares equal-length
  // digests — prevents leaking the expected token's length through timing.
  const hmacKey = crypto.randomBytes(32);
  const hmac = (v: string) => crypto.createHmac('sha256', hmacKey).update(v).digest();
  if (!crypto.timingSafeEqual(hmac(serviceToken), hmac(expectedToken))) {
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
    req.isService = apiKeyRecord.is_service === true;

    // Check if developer account is suspended.
    // Service keys reference shadow developer rows that are always 'active' —
    // the suspended check is effectively dead code for service keys but
    // remains as a safety net.
    if (req.developer?.status === 'suspended') {
      throw new AuthorizationError('Developer account suspended');
    }

    logger.info('API key authenticated', {
      developerId: apiKeyRecord.developer_id,
      keyPrefix,
      isSandbox: apiKeyRecord.is_sandbox,
      isService: req.isService,
      ...(req.isService && {
        serviceProduct: apiKeyRecord.service_product,
        serviceEnvironment: apiKeyRecord.service_environment,
      }),
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

// Handoff token authentication — mobile devices use X-Handoff-Token instead of X-API-Key.
// The token resolves to an api_key + developer via the mobile_handoff_sessions table.
// Tokens are HMAC-SHA256 hashed before DB lookup (same pattern as API keys).
export const authenticateHandoffToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const handoffToken = req.headers['x-handoff-token'] as string;

  if (!handoffToken) {
    throw new AuthenticationError('Handoff token is required. Include X-Handoff-Token header.');
  }

  // Validate format: 64 hex chars
  if (!/^[0-9a-f]{64}$/.test(handoffToken)) {
    throw new AuthenticationError('Invalid handoff token format');
  }

  // Hash the token before DB lookup — raw token never stored
  const tokenHash = hashHandoffToken(handoffToken);

  try {
    // Look up session (flat query — no nested joins for PgClient compatibility)
    const { data: session, error: sessionError } = await supabase
      .from('mobile_handoff_sessions')
      .select('id, token, api_key_id, user_id, status, expires_at')
      .eq('token', tokenHash)
      .single();

    if (sessionError || !session) {
      throw new AuthenticationError('Invalid handoff token');
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      throw new AuthenticationError('Handoff session has expired');
    }

    // Allow 'pending' and 'completed' sessions — the status tracks handoff
    // lifecycle (desktop notification), not authorization. Rejecting 'completed'
    // would cause a race condition when the mobile's PATCH /complete fires while
    // a polling API call is still in-flight.
    // 'failed' sessions are only allowed for the restart endpoint so the mobile
    // user can retry after a failed verification. All other endpoints reject it.
    if (session.status === 'expired') {
      throw new AuthenticationError('Handoff session is no longer active');
    }
    if (session.status === 'failed' && !req.path.endsWith('/restart')) {
      throw new AuthenticationError('Handoff session is no longer active');
    }

    // Resolve api_key and developer via separate lookups (avoids 2-level nested join)
    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', session.api_key_id)
      .single();

    if (keyError || !apiKeyRecord || !apiKeyRecord.is_active) {
      throw new AuthenticationError('Associated API key is no longer active');
    }

    // Check if key is expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      throw new AuthenticationError('Associated API key has expired');
    }

    const { data: developer, error: devError } = await supabase
      .from('developers')
      .select('*')
      .eq('id', apiKeyRecord.developer_id)
      .single();

    if (devError || !developer) {
      throw new AuthenticationError('Associated developer not found');
    }

    // Update last used timestamp on the API key
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyRecord.id);

    // Attach API key and developer to request (same shape as authenticateAPIKey)
    req.apiKey = { ...apiKeyRecord, developer } as APIKey;
    req.developer = developer as Developer;

    // Check if developer account is suspended
    if (req.developer?.status === 'suspended') {
      throw new AuthorizationError('Developer account suspended');
    }

    logger.info('Handoff token authenticated', {
      developerId: apiKeyRecord.developer_id,
      handoffSessionId: session.id,
      isSandbox: apiKeyRecord.is_sandbox,
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      throw error;
    }

    logger.error('Handoff token authentication error:', error);
    throw new AuthenticationError('Authentication failed');
  }
});

// Session token authentication — end-user verification pages use X-Session-Token
// instead of X-API-Key. The token resolves to a verification_request, then to
// developer + api_key. Tokens are HMAC-SHA256 hashed before DB lookup.
export const authenticateSessionToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.headers['x-session-token'] as string;

  if (!sessionToken) {
    throw new AuthenticationError('Session token is required. Include X-Session-Token header.');
  }

  // Validate format: 64 hex chars
  if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
    throw new AuthenticationError('Invalid session token format');
  }

  // Hash the token before DB lookup — raw token never stored
  const tokenHash = hashHandoffToken(sessionToken);

  try {
    // Look up verification_request by session_token_hash
    const { data: verification, error: verError } = await supabase
      .from('verification_requests')
      .select('id, developer_id, session_token_expires_at, session_api_key_id')
      .eq('session_token_hash', tokenHash)
      .single();

    if (verError || !verification) {
      throw new AuthenticationError('Invalid session token');
    }

    // Check expiry
    if (!verification.session_token_expires_at || new Date(verification.session_token_expires_at) < new Date()) {
      throw new AuthenticationError('Session token has expired');
    }

    // Resolve developer
    const { data: developer, error: devError } = await supabase
      .from('developers')
      .select('*')
      .eq('id', verification.developer_id)
      .single();

    if (devError || !developer) {
      throw new AuthenticationError('Associated developer not found');
    }

    // Resolve the exact API key that was used during initialization
    let apiKeyRecord = null;
    if (verification.session_api_key_id) {
      const { data } = await supabase
        .from('api_keys')
        .select('*')
        .eq('id', verification.session_api_key_id)
        .single();
      apiKeyRecord = data;
    }

    // Attach API key and developer to request (same shape as authenticateAPIKey)
    req.apiKey = apiKeyRecord ? { ...apiKeyRecord, developer } as APIKey : undefined;
    req.developer = developer as Developer;

    // Bind this token to its specific verification — enforced by requireOwnedVerification
    req.sessionVerificationId = verification.id;

    // Check if developer account is suspended
    if (req.developer?.status === 'suspended') {
      throw new AuthorizationError('Developer account suspended');
    }

    logger.info('Session token authenticated', {
      developerId: verification.developer_id,
      verificationId: verification.id,
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      throw error;
    }

    logger.error('Session token authentication error:', error);
    throw new AuthenticationError('Authentication failed');
  }
});

// Flexible middleware: accepts API key, handoff token, or session token.
// If X-API-Key header is present → delegate to authenticateAPIKey.
// If X-Handoff-Token header is present → delegate to authenticateHandoffToken.
// If X-Session-Token header is present → delegate to authenticateSessionToken.
export const authenticateAPIKeyOrHandoff = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-api-key']) {
    return authenticateAPIKey(req, res, next);
  }
  if (req.headers['x-handoff-token']) {
    return authenticateHandoffToken(req, res, next);
  }
  if (req.headers['x-session-token']) {
    return authenticateSessionToken(req, res, next);
  }
  throw new AuthenticationError('API key, handoff token, or session token is required. Include X-API-Key, X-Handoff-Token, or X-Session-Token header.');
});

// JWT authentication for admin users
export const authenticateJWT = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;

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

// Require org admin (reviewer with role='admin') or platform admin (admin_users)
export const requireOrgAdminOrPlatformAdmin = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user) return next();                        // platform admin
    if (req.reviewer?.role === 'admin') return next();  // org admin
    throw new AuthorizationError('Organization admin privileges required');
  }
);

// Sandbox mode check
export const checkSandboxMode = (req: Request, res: Response, next: NextFunction) => {
  // Service keys (isk_*) bypass sandbox/production validation entirely.
  // They're internal-product calls scoped via service_environment, not the
  // is_sandbox boolean. Treat as production-equivalent regardless of NODE_ENV.
  if (req.apiKey?.is_service) {
    req.isSandbox = false;
    return next();
  }

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
  // Service keys (isk_*) are treated as the internal principal — full access
  // to all features regardless of plan tier. This is the spec's
  // "treat as internal principal with full access" behavior.
  if (req.apiKey?.is_service) {
    req.isPremium = true;
    return next();
  }

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
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;

  if (!token) {
    throw new AuthenticationError('Access token is required');
  }
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-developer',
    }) as any;

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

// Flexible middleware for webhook self-management: accepts EITHER a developer
// portal JWT (idswyft_token cookie / Bearer) OR a SERVICE API key (isk_*) via
// the X-API-Key header.
//
// Why: a keyless server-to-server integration authenticates only with an isk_*
// service key — it has no portal session — so it otherwise can't list, create,
// or read the signing secret for its own webhook. This middleware opens that
// door on the webhook-management routes without touching the JWT-portal flow.
//
// Scope rules enforced here:
//   - X-API-Key present → must resolve to a SERVICE key (is_service === true).
//     Regular ik_* developer keys are rejected: they already have portal access,
//     and accepting them would let a leaked dev key read/set webhook signing
//     secrets it otherwise cannot. Direct callers to the portal instead.
//   - No X-API-Key → fall back to the developer JWT.
//
// Per-KEY isolation (api_key_id scoping) is enforced in the route handlers, not
// here: many service keys share one shadow developer row, so developer_id alone
// is not a tenant boundary between keys.
export const authenticateDeveloperJWTOrServiceKey = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-api-key']) {
      // Delegate to the existing API-key auth, then gate on is_service.
      return authenticateAPIKey(req, res, (err?: any) => {
        if (err) return next(err);
        if (!req.apiKey?.is_service) {
          return next(
            new AuthorizationError(
              'This endpoint accepts the developer portal session or a service API key (isk_*). ' +
                'Regular API keys must manage webhooks via the developer portal.',
            ),
          );
        }
        return next();
      });
    }
    return authenticateDeveloperJWT(req, res, next);
  },
);

// HMAC-SHA256 hash a handoff token — same secret as API keys.
// Used by handoff routes (storage/lookup) and authenticateHandoffToken (auth).
export const hashHandoffToken = (token: string): string => {
  return crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(token)
    .digest('hex');
};

/**
 * Mint an API key with the given prefix.
 *
 * Generates 32 random bytes (256-bit entropy), formats as
 * `<prefix>_<hex>`, and returns the plaintext key, its HMAC-SHA256
 * hash (using config.apiKeySecret), and the 8-char prefix used in
 * logs and admin UI.
 *
 * Used by:
 * - generateAPIKey() for ik_* developer keys
 * - service-key minting endpoint for isk_* keys (Phase 5)
 */
export const generatePrefixedAPIKey = (
  prefix: 'ik' | 'isk',
): { key: string; hash: string; prefix: string } => {
  const key = `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(key)
    .digest('hex');
  const keyPrefix = key.substring(0, 8);
  return { key, hash, prefix: keyPrefix };
};

// Generate API key (developer ik_*)
export const generateAPIKey = (): { key: string; hash: string; prefix: string } => {
  return generatePrefixedAPIKey('ik');
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
export const generateReviewerToken = (reviewer: { id: string; email: string; developer_id: string; role?: string }): string => {
  return jwt.sign(
    {
      id: reviewer.id,
      email: reviewer.email,
      developer_id: reviewer.developer_id,
      role: reviewer.role || 'reviewer',
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
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;

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

// ─── Service-operator session (Phase 2) ──────────────────────────────────────
// A human bound to a single service key via api_keys.operator_email logs in by
// email OTP and receives this api_key_id-scoped session. The dashboard + review
// endpoints (Phase 3+) accept it and scope all queries to req.operatorKeyId.

export const generateServiceOperatorToken = (p: {
  apiKeyId: string;
  email: string;
  developerId: string;
  serviceProduct?: string | null;
  serviceEnvironment?: string | null;
}): string => {
  return jwt.sign(
    {
      api_key_id: p.apiKeyId,
      email: p.email,
      developer_id: p.developerId,
      service_product: p.serviceProduct ?? null,
      service_environment: p.serviceEnvironment ?? null,
      type: 'service-operator',
    },
    config.jwtSecret,
    { expiresIn: '7d', issuer: 'idswyft-api', audience: 'idswyft-service-operator' },
  );
};

// Short-lived token issued when one email operates >1 key, so the picker can
// finalize a key choice without a second OTP.
export const generateServiceOperatorSelectionToken = (email: string): string => {
  return jwt.sign(
    { email, type: 'service-operator-select' },
    config.jwtSecret,
    { expiresIn: '10m', issuer: 'idswyft-api', audience: 'idswyft-service-operator-select' },
  );
};

export const verifyServiceOperatorSelectionToken = (token: string): string => {
  let decoded: { email: string; type: string };
  try {
    decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'idswyft-api',
      audience: 'idswyft-service-operator-select',
    }) as { email: string; type: string };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Selection token has expired');
    }
    throw new AuthenticationError('Invalid selection token');
  }
  if (decoded.type !== 'service-operator-select') {
    throw new AuthenticationError('Invalid selection token');
  }
  return decoded.email;
};

export const authenticateServiceOperatorJWT = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;
    if (!token) {
      throw new AuthenticationError('Access token is required');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret, {
        issuer: 'idswyft-api',
        audience: 'idswyft-service-operator',
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token has expired');
      }
      throw new AuthenticationError('Invalid token');
    }

    if (decoded.type !== 'service-operator') {
      throw new AuthenticationError('Invalid service operator token');
    }

    // Reload the key every request: revocation / re-bind takes effect immediately.
    const { data: apiKeyRecord, error } = await supabase
      .from('api_keys')
      .select('*, developer:developers(*)')
      .eq('id', decoded.api_key_id)
      .eq('is_service', true)
      .eq('is_active', true)
      .single();

    if (error || !apiKeyRecord) {
      throw new AuthenticationError('Service key is no longer active');
    }
    if (!decoded.email || (apiKeyRecord.operator_email ?? null) !== decoded.email) {
      throw new AuthenticationError('Operator is no longer bound to this service key');
    }

    req.apiKey = apiKeyRecord as APIKey;
    req.developer = apiKeyRecord.developer as Developer;
    req.operatorKeyId = apiKeyRecord.id;
    req.operatorEmail = decoded.email;

    logger.info('Service operator authenticated', {
      operatorEmail: decoded.email,
      apiKeyId: apiKeyRecord.id,
      serviceProduct: apiKeyRecord.service_product,
    });

    next();
  },
);

// Flexible auth for the reused developer dashboard: accepts a developer portal
// JWT, a service-operator cookie, OR a service key (X-API-Key). A cookie/bearer
// is routed to the correct verifier by its UNVERIFIED audience (jwt.decode) —
// the chosen verifier then cryptographically verifies it. The decoded audience
// is used only for routing, never as a trusted claim.
export const authenticateDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-api-key']) {
      return authenticateAPIKey(req, res, (err?: any) => {
        if (err) return next(err);
        if (!req.apiKey?.is_service) {
          return next(new AuthorizationError(
            'This endpoint accepts the developer portal session or a service principal. ' +
            'Regular API keys must use the developer portal.',
          ));
        }
        return next();
      });
    }

    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;
    if (!token) {
      throw new AuthenticationError('Access token is required');
    }

    let aud: string | undefined;
    try {
      aud = (jwt.decode(token) as any)?.aud;
    } catch {
      aud = undefined;
    }

    if (aud === 'idswyft-service-operator') {
      return authenticateServiceOperatorJWT(req, res, next);
    }
    return authenticateDeveloperJWT(req, res, next);
  },
);

// Ownership scope for a dashboard request. apiKeyId is set ONLY for principals
// that must be isolated to one key (service operators, service keys); it is null
// for developer-portal sessions, which keeps their queries identical to today.
// Every operator-scoped query MUST apply `.eq('api_key_id', apiKeyId)` when set —
// the shared shadow developer is not a tenant boundary; api_key_id is.
export function scopeForRequest(req: Request): { developerId: string; apiKeyId: string | null } {
  const developer = req.developer;
  if (!developer) {
    throw new AuthenticationError('Authentication required');
  }
  if (req.operatorKeyId) {
    return { developerId: developer.id, apiKeyId: req.operatorKeyId };
  }
  if (req.apiKey?.is_service) {
    return { developerId: developer.id, apiKeyId: req.apiKey.id };
  }
  return { developerId: developer.id, apiKeyId: null };
}

// Flexible middleware: accepts admin JWT OR reviewer JWT
// Sets req.user (admin) or req.reviewer (reviewer with developer_id scope)
export const authenticateAdminOrReviewer = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;

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

// Flexible middleware for the REVIEW SURFACE ONLY (queue, dashboard, detail,
// review action). Accepts the same admin/reviewer principals as
// authenticateAdminOrReviewer, PLUS the service-operator cookie/bearer.
//
// This is deliberately SEPARATE from authenticateAdminOrReviewer: that
// middleware also gates audit-export and GDPR-erasure routes, which operators
// must never reach. Applying a distinct middleware only to the review routes
// keeps operator access fail-safe (opt-in per route) rather than fail-open.
export const authenticateReviewPrincipal = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.idswyft_token;

    let aud: string | undefined;
    if (token) {
      try {
        aud = (jwt.decode(token) as any)?.aud;
      } catch {
        aud = undefined;
      }
    }

    if (aud === 'idswyft-service-operator') {
      return authenticateServiceOperatorJWT(req, res, next);
    }
    return authenticateAdminOrReviewer(req, res, next);
  },
);

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
      operatorKeyId?: string;
      operatorEmail?: string;
    }
  }
}

export default {
  authenticateServiceToken,
  authenticateAPIKey,
  authenticateHandoffToken,
  authenticateSessionToken,
  authenticateAPIKeyOrHandoff,
  authenticateJWT,
  authenticateDeveloperJWT,
  authenticateDeveloperJWTOrServiceKey,
  authenticateReviewerJWT,
  authenticateServiceOperatorJWT,
  authenticateDashboard,
  scopeForRequest,
  generateServiceOperatorToken,
  generateServiceOperatorSelectionToken,
  verifyServiceOperatorSelectionToken,
  authenticateAdminOrReviewer,
  authenticateReviewPrincipal,
  authenticateUser,
  requireAdminRole,
  requireOrgAdminOrPlatformAdmin,
  checkSandboxMode,
  checkPremiumAccess,
  generateAdminToken,
  generateDeveloperToken,
  generateReviewerToken,
  generateRegistrationToken,
  verifyRegistrationToken,
  generateAPIKey,
  hashHandoffToken,
  logAuthEvent
};