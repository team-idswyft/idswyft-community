import express, { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import validator from 'validator';
import { supabase } from '@/config/database.js';
import { generateAPIKey, authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { getRecentActivities } from '@/middleware/apiLogger.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { loadSessionState, mapStatusForResponse, fetchRiskScore } from '@/verification/statusReader.js';
import { WEBHOOK_EVENT_NAMES } from '@/constants/webhookEvents.js';
import { WebhookService, createWebhookSignature } from '@/services/webhook.js';
import axios from 'axios';

const webhookService = new WebhookService();

const router = express.Router();

// Rate limiting for developer registration
const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 registration attempts per windowMs
  message: {
    error: 'Too many registration attempts from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for API key operations
const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 API key operations per minute (increased for development)
  message: {
    error: 'Too many API key operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});


// Register as developer
router.post('/register',
  registrationRateLimit,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('name')
      .trim()
      .escape()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('company')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters'),
    body('webhook_url')
      .optional()
      .isURL({ protocols: ['https'] })
      .withMessage('Webhook URL must be a valid HTTPS URL')
  ],
  catchAsync(async (req: Request, res: Response) => {
    console.log('🎯 REGISTRATION ENDPOINT CALLED', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { email, name, company, webhook_url } = req.body;
    
    // Check if developer already exists
    const { data: existingDev, error: checkError } = await supabase
      .from('developers')
      .select('id')
      .eq('email', email)
      .single();
    
    // If no error and data exists, developer already exists
    if (existingDev && !checkError) {
      throw new ValidationError('Developer with this email already exists', 'email', email);
    }
    
    // Create developer
    const { data: developer, error } = await supabase
      .from('developers')
      .insert({
        email,
        name,
        company,
        webhook_url,
        is_verified: true // Auto-verify for MVP
      })
      .select('*')
      .single();
    
    if (error) {
      console.error('🚨 Developer creation failed:', error);
      logger.error('Database error:', error);
      
      // Handle specific duplicate email error
      if (error.code === '23505' && error.details?.includes('email')) {
        throw new ValidationError('Developer with this email already exists', 'email', email);
      }
      
      throw new Error('Failed to create developer account');
    }
    
    console.log('✅ Developer created successfully:', developer.id);
    console.log('📋 Developer object:', developer);
    
    // Create initial API key
    console.log('🔑 About to generate API key...');
    console.log('🔑 Generating API key for developer:', developer.id);
    const { key, hash, prefix } = generateAPIKey();
    console.log('🔑 Generated API key parts:', { keyLength: key.length, prefix, hashLength: hash.length });
    
    // Set appropriate sandbox mode based on environment
    const isProductionEnv = process.env.NODE_ENV === 'production';
    const defaultIsSandbox = !isProductionEnv; // Sandbox in dev, production in prod
    
    console.log('🔑 Inserting API key into database...');
    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert({
        developer_id: developer.id,
        key_hash: hash,
        key_prefix: prefix,
        name: 'Default API Key',
        is_sandbox: defaultIsSandbox
      })
      .select('id, name, is_sandbox, created_at')
      .single();
    
    console.log('🔑 API key insertion result:', { data: !!apiKey, error: keyError });
    
    if (keyError) {
      console.error('🚨 API key creation failed:', keyError);
      logger.error('Failed to create API key:', keyError);
      // Still return developer info even if API key creation fails
      return res.status(201).json({
        developer: {
          id: developer.id,
          email: developer.email,
          name: developer.name,
          company: developer.company,
          is_verified: developer.is_verified,
          created_at: developer.created_at
        },
        message: 'Developer account created successfully, but API key creation failed. Please create one manually.',
        error: 'API key creation failed'
      });
    }
    
    console.log('✅ API key created successfully:', apiKey);
    
    logger.info('New developer registered', {
      developerId: developer.id,
      email: developer.email,
      company: developer.company,
      apiKeyId: apiKey.id
    });
    
    res.status(201).json({
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        is_verified: developer.is_verified,
        created_at: developer.created_at
      },
      api_key: {
        key, // Only returned once
        id: apiKey.id,
        name: apiKey.name,
        is_sandbox: apiKey.is_sandbox,
        created_at: apiKey.created_at
      },
      message: 'Developer account created successfully. Store your API key securely - it will not be shown again.'
    });
  })
);

// Create API key (requires developer authentication)
router.post('/api-key',
  apiKeyRateLimit,
  [
    body('name')
      .trim()
      .escape()
      .isLength({ min: 1, max: 100 })
      .withMessage('API key name is required and must be less than 100 characters'),
    body('is_sandbox')
      .optional()
      .isBoolean()
      .withMessage('is_sandbox must be a boolean'),
    body('expires_in_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('expires_in_days must be between 1 and 365')
  ],
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { name, is_sandbox = false, expires_in_days } = req.body;
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }
    
    // Debug logging for API key creation
    console.log('🔑 API Key Creation Debug:', {
      originalRequest: { name, is_sandbox, expires_in_days },
      environment: process.env.NODE_ENV,
      developerEmail: developer.email,
      requestBody: req.body
    });
    
    // Environment-based API key restrictions
    const isProductionEnv = process.env.NODE_ENV === 'production';
    
    if (isProductionEnv && is_sandbox) {
      throw new ValidationError(
        'Sandbox API keys cannot be created in production environment. Use production keys only.',
        'is_sandbox',
        'Production environment requires production keys only'
      );
    }
    
    if (!isProductionEnv && !is_sandbox) {
      throw new ValidationError(
        'Production API keys cannot be created in development/local environment. Use sandbox keys only.',
        'is_sandbox',
        'Development environment requires sandbox keys only'
      );
    }
    
    // Check if developer has reached API key limit
    const { count: existingKeysCount, error: countError } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('developer_id', developer.id)
      .eq('is_active', true);
    
    if (countError) {
      logger.error('Failed to count API keys:', countError);
      throw new Error('Failed to check API key limits');
    }
    
    const maxKeys = is_sandbox ? 10 : 3; // Stricter limit for production keys
    if (existingKeysCount && existingKeysCount >= maxKeys) {
      const keyType = is_sandbox ? 'sandbox' : 'production';
      const actionMsg = is_sandbox 
        ? 'Please revoke unused sandbox keys from your developer dashboard.' 
        : 'Production keys are limited for security. Please revoke unused keys or contact support if you need more.';
      
      throw new ValidationError(
        `You have reached the maximum limit of ${maxKeys} ${keyType} API keys. ${actionMsg}`,
        'api_key_limit_exceeded',
        {
          current_count: existingKeysCount,
          max_allowed: maxKeys,
          key_type: keyType,
          suggested_action: is_sandbox ? 'revoke_unused_keys' : 'contact_support_or_revoke'
        }
      );
    }
    
    // Generate API key with enhanced security
    console.log('🔑 Generating API key...');
    const { key, hash, prefix } = generateAPIKey();
    const keyId = crypto.randomUUID();
    console.log('🔑 API key generated:', { prefix, keyId });
    
    // Calculate expiration date
    let expiresAt = null;
    if (expires_in_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }
    
    // Create API key record with enhanced security
    console.log('🔑 Inserting API key into database...');
    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert({
        id: keyId,
        developer_id: developer.id,
        key_hash: hash,
        key_prefix: prefix,
        name,
        is_sandbox: is_sandbox, // Explicitly set the value
        expires_at: expiresAt?.toISOString(),
        created_at: new Date().toISOString()
      })
      .select('id, name, is_sandbox, created_at, expires_at')
      .single();
    
    if (keyError) {
      console.error('🚨 API Key Creation Error:', keyError);
      logger.error('Failed to create API key:', keyError);
      throw new Error(`Failed to create API key: ${keyError.message || keyError.code || 'Unknown database error'}`);
    }
    
    // Debug logging for created API key
    console.log('🔑 API Key Created Successfully:', {
      savedKey: { 
        id: apiKey.id, 
        name: apiKey.name, 
        is_sandbox: apiKey.is_sandbox 
      },
      requestedSandbox: is_sandbox,
      actualSandbox: apiKey.is_sandbox,
      sandboxMismatch: is_sandbox !== apiKey.is_sandbox
    });
    
    logger.info('API key created', {
      developerId: developer.id,
      keyId: apiKey.id,
      isSandbox: is_sandbox,
      expiresAt
    });
    
    res.status(201).json({
      api_key: key, // Only returned once
      key_id: apiKey.id,
      name: apiKey.name,
      is_sandbox: apiKey.is_sandbox,
      created_at: apiKey.created_at,
      expires_at: apiKey.expires_at,
      key_prefix: prefix,
      security_info: {
        store_securely: 'This API key will not be shown again. Store it in a secure location.',
        environment_variable: 'Consider storing in an environment variable like IDSWYFT_API_KEY',
        revocation: 'You can revoke this key at any time from your developer dashboard'
      },
      message: 'API key created successfully. Store it securely - it will not be shown again.'
    });
  })
);

// List API keys for developer
router.get('/api-keys',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }
    
    // Get API keys with additional security info (only active keys)
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, key_prefix, name, is_sandbox, is_active, last_used_at, created_at, expires_at')
      .eq('developer_id', developer.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error('Failed to get API keys:', error);
      throw new Error('Failed to get API keys');
    }
    
    res.json({
      api_keys: apiKeys.map(key => {
        const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
        const daysSinceLastUse = key.last_used_at 
          ? Math.floor((Date.now() - new Date(key.last_used_at).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        return {
          id: key.id,
          name: key.name,
          key_preview: `${key.key_prefix}...`,
          is_sandbox: key.is_sandbox,
          is_active: key.is_active && !isExpired,
          last_used_at: key.last_used_at,
          created_at: key.created_at,
          expires_at: key.expires_at,
          status: !key.is_active ? 'revoked' : isExpired ? 'expired' : 'active',
          security_status: {
            days_since_last_use: daysSinceLastUse,
            needs_rotation: daysSinceLastUse && daysSinceLastUse > 90,
            expires_soon: key.expires_at && new Date(key.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
          }
        };
      }),
      total_keys: apiKeys.length,
      active_keys: apiKeys.filter(k => k.is_active && (!k.expires_at || new Date(k.expires_at) >= new Date())).length,
      security_recommendations: {
        rotate_unused_keys: 'Consider rotating API keys that haven\'t been used in 90+ days',
        monitor_usage: 'Regularly monitor API key usage and revoke unused keys',
        use_environment_variables: 'Store API keys in environment variables, not in code'
      }
    });
  })
);

// Revoke API key
router.delete('/api-key/:keyId',
  apiKeyRateLimit,
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format')
  ],
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { keyId } = req.params;
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }
    
    // Debug logging
    console.log('🗑️ Deleting API key:', { keyId, developerId: developer.id });
    
    // First, check if the key exists and belongs to the developer
    const { data: existingKey, error: checkError } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, is_active')
      .eq('id', keyId)
      .eq('developer_id', developer.id)
      .single();
    
    console.log('🗑️ Existing key check:', { existingKey, checkError });
    
    if (checkError || !existingKey) {
      console.log('🗑️ API key not found:', { keyId, developerId: developer.id, checkError });
      throw new NotFoundError('API key not found or does not belong to this developer');
    }
    
    // Deactivate API key
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .update({ 
        is_active: false
      })
      .eq('id', keyId)
      .eq('developer_id', developer.id)
      .select('id, name, key_prefix')
      .single();
    
    console.log('🗑️ Update result:', { apiKey, error });
    
    if (error || !apiKey) {
      console.log('🗑️ Failed to update API key:', error);
      throw new Error(`Failed to deactivate API key: ${error?.message || 'Unknown error'}`);
    }
    
    logger.info('API key revoked', {
      developerId: developer.id,
      keyId: apiKey.id,
      keyName: apiKey.name
    });
    
    res.json({
      message: 'API key revoked successfully',
      revoked_key: {
        id: apiKey.id,
        name: apiKey.name,
        key_preview: `${apiKey.key_prefix}...`
      },
      security_info: {
        immediate_effect: 'This API key is immediately invalid for all requests',
        cleanup_recommendation: 'Remove this key from your applications and environment variables',
        regeneration: 'Generate a new API key if you need continued access'
      }
    });
  })
);

// Get developer usage statistics
router.get('/stats',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get verification request stats
    const { data: stats, error } = await supabase
      .from('verification_requests')
      .select('status, created_at')
      .eq('developer_id', developer.id)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) {
      logger.error('Failed to get developer stats:', error);
      throw new Error('Failed to get usage statistics');
    }

    const totalRequests = stats.length;
    const successfulRequests = stats.filter(s => s.status === 'verified').length;
    const failedRequests = stats.filter(s => s.status === 'failed').length;
    const pendingRequests = stats.filter(s => s.status === 'pending').length;
    const manualReviewRequests = stats.filter(s => s.status === 'manual_review').length;

    res.json({
      period: '30_days',
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      pending_requests: pendingRequests,
      manual_review_requests: manualReviewRequests,
      success_rate: totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) + '%' : '0%',
      monthly_limit: 1000,
      monthly_usage: totalRequests,
      remaining_quota: Math.max(0, 1000 - totalRequests),
      quota_reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
    });
  })
);

// List webhooks for developer (JWT-authenticated developer portal)
router.get('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('id, url, is_sandbox, is_active, created_at, events, secret_key, api_key_id, api_key:api_keys!api_key_id(key_prefix, name)')
      .eq('developer_id', developer.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list webhooks:', error);
      throw new Error('Failed to list webhooks');
    }

    // Mask secret keys and flatten api_key join
    const masked = (webhooks || []).map((w: any) => ({
      ...w,
      secret_key: w.secret_key
        ? `${w.secret_key.slice(0, 6)}${'*'.repeat(8)}${w.secret_key.slice(-4)}`
        : null,
      api_key_preview: w.api_key ? `${w.api_key.key_prefix}...` : null,
      api_key_name: w.api_key?.name ?? null,
      api_key: undefined,
    }));

    res.json({ webhooks: masked });
  })
);

// Create webhook for developer (JWT-authenticated developer portal)
router.post('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    body('url')
      .isURL({ protocols: ['https'] })
      .withMessage('Valid HTTPS webhook URL is required'),
    body('is_sandbox')
      .optional()
      .isBoolean()
      .withMessage('is_sandbox must be a boolean'),
    body('events')
      .optional()
      .isArray()
      .withMessage('events must be an array'),
    body('secret')
      .optional()
      .isString()
      .withMessage('secret must be a string'),
    body('api_key_id')
      .optional({ values: 'null' })
      .isUUID()
      .withMessage('api_key_id must be a valid UUID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { url, is_sandbox = false, events, secret, api_key_id } = req.body;

    // If api_key_id is provided, validate it belongs to this developer
    if (api_key_id) {
      const { data: ownedKey, error: keyError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', api_key_id)
        .eq('developer_id', developer.id)
        .eq('is_active', true)
        .single();

      if (keyError || !ownedKey) {
        throw new ValidationError('API key not found or does not belong to this developer', 'api_key_id', api_key_id);
      }
    }

    // Validate events are from the allowed set
    if (events && events.length > 0) {
      const invalid = events.filter((e: string) => !WEBHOOK_EVENT_NAMES.includes(e));
      if (invalid.length > 0) {
        throw new ValidationError('Invalid webhook events', 'events', invalid);
      }
    }

    // Check for duplicate: same URL + sandbox mode + API key scope
    let dupQuery = supabase
      .from('webhooks')
      .select('id')
      .eq('developer_id', developer.id)
      .eq('url', url)
      .eq('is_sandbox', is_sandbox);

    if (api_key_id) {
      dupQuery = dupQuery.eq('api_key_id', api_key_id);
    } else {
      dupQuery = dupQuery.is('api_key_id', null);
    }

    const { data: existing, error: existingError } = await dupQuery.single();

    if (existingError && existingError.code !== 'PGRST116') {
      logger.error('Failed to check existing webhook:', existingError);
      throw new Error('Failed to validate webhook');
    }

    if (existing) {
      throw new ValidationError('Webhook already exists for this URL and scope', 'url', url);
    }

    // Auto-generate signing secret if not provided
    const secretKey = secret || `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .insert({
        developer_id: developer.id,
        url,
        is_sandbox,
        events: events && events.length > 0 ? events : WEBHOOK_EVENT_NAMES,
        secret_key: secretKey,
        api_key_id: api_key_id || null,
      })
      .select('id, url, is_sandbox, is_active, created_at, events, secret_key, api_key_id')
      .single();

    if (error || !webhook) {
      logger.error('Failed to create webhook:', error);
      throw new Error('Failed to create webhook');
    }

    res.status(201).json({
      webhook: {
        ...webhook,
        secret_key: secretKey, // Return full secret on creation only
      },
      message: 'Webhook created successfully. Store your signing secret securely.'
    });
  })
);

// Reveal full webhook signing secret
router.get('/webhooks/:webhookId/secret',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('id, secret_key')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (error || !webhook) {
      throw new NotFoundError('Webhook');
    }

    logger.info('Webhook secret revealed', {
      developerId: developer.id,
      webhookId,
    });

    res.json({ secret_key: webhook.secret_key });
  })
);

// List recent webhook deliveries for a specific webhook
router.get('/webhooks/:webhookId/deliveries',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    // Verify webhook belongs to this developer
    const { data: webhook, error: whError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (whError || !webhook) {
      throw new NotFoundError('Webhook');
    }

    const { deliveries, total } = await webhookService.getWebhookDeliveries(webhookId, 1, 25);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d.id,
        event: (d.payload as any)?.event ?? null,
        status: d.status,
        response_status: d.response_status,
        attempts: d.attempts,
        created_at: d.created_at,
        delivered_at: d.delivered_at,
      })),
      total,
    });
  })
);

// Send a test webhook delivery
router.post('/webhooks/:webhookId/test',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    const { data: webhook, error: whError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (whError || !webhook) {
      throw new NotFoundError('Webhook');
    }

    const testPayload = {
      user_id: 'test_user_000',
      verification_id: 'test_000',
      status: 'verified' as const,
      timestamp: new Date().toISOString(),
      data: {},
    };

    // Fire directly — no DB record, avoids FK constraint on webhook_deliveries
    try {
      const body = JSON.stringify(testPayload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Idswyft-Webhooks/1.0',
        'X-Idswyft-Test': 'true',
      };

      const signingSecret = webhook.secret_key || webhook.secret_token;
      if (signingSecret) {
        headers['X-Idswyft-Signature'] = createWebhookSignature(body, signingSecret);
      }

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 8000);

      const response = await axios.post(webhook.url, testPayload, {
        headers,
        timeout: 10000,
        signal: controller.signal,
        validateStatus: () => true,
      });

      clearTimeout(abortTimer);

      res.json({
        success: response.status < 500,
        status_code: response.status,
      });
    } catch (err: any) {
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED'
        || err.message?.includes('timeout') || err.message?.includes('aborted');
      logger.error('Webhook test failed:', { url: webhook.url, code: err.code, message: err.message });
      res.json({
        success: false,
        status_code: null,
        error: isTimeout
          ? 'Connection timed out — verify the webhook URL is reachable'
          : (err.message || 'Test delivery failed'),
      });
    }
  })
);

// Delete webhook for developer (JWT-authenticated developer portal)
router.delete('/webhooks/:webhookId',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    const { data: existingWebhook, error: checkError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (checkError || !existingWebhook) {
      throw new NotFoundError('Webhook');
    }

    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('developer_id', developer.id);

    if (error) {
      logger.error('Failed to delete webhook:', error);
      throw new Error('Failed to delete webhook');
    }

    res.json({ message: 'Webhook deleted successfully' });
  })
);

// Get API activity logs
router.get('/activity',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const apiKeyIdParam = typeof req.query.api_key_id === 'string' ? req.query.api_key_id : undefined;

    // If filtering by key, verify it belongs to the authenticated developer
    if (apiKeyIdParam) {
      if (!validator.isUUID(apiKeyIdParam)) {
        throw new ValidationError('Invalid API key ID format', 'api_key_id', apiKeyIdParam);
      }

      const { data: ownedKey, error: keyError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', apiKeyIdParam)
        .eq('developer_id', developer.id)
        .eq('is_active', true)
        .single();

      if (keyError || !ownedKey) {
        throw new NotFoundError('API key not found or does not belong to this developer');
      }
    }

    // Get recent activities from memory (fast) and optionally filter by API key
    const recentActivities = getRecentActivities(developer.id)
      .filter(activity => !apiKeyIdParam || activity.api_key_id === apiKeyIdParam);
    
    // Debug logging for activities
    console.log(`🔍 Developer ${developer.id} activity check:`, {
      activitiesFound: recentActivities.length,
      recentActivities: recentActivities.slice(0, 3).map(a => ({
        method: a.method,
        endpoint: a.endpoint,
        timestamp: a.timestamp
      }))
    });
    
    // Get verification statistics from database
    const { data: verificationStats, error: statsError } = await supabase
      .from('verification_requests')
      .select('status')
      .eq('developer_id', developer.id);
    
    if (statsError) {
      logger.error('Failed to get verification stats:', statsError);
    }

    // Calculate statistics
    const stats = {
      total_requests: verificationStats?.length || 0,
      successful_requests: verificationStats?.filter(v => v.status === 'verified').length || 0,
      failed_requests: verificationStats?.filter(v => v.status === 'failed').length || 0,
      pending_requests: verificationStats?.filter(v => v.status === 'pending').length || 0,
      manual_review_requests: verificationStats?.filter(v => v.status === 'manual_review').length || 0
    };

    // Format recent activities for frontend
    const formattedActivities = recentActivities.slice(0, 50).map(activity => ({
      api_key_id: activity.api_key_id,
      timestamp: activity.timestamp || new Date(),
      method: activity.method,
      endpoint: activity.endpoint,
      status_code: activity.status_code,
      response_time_ms: activity.response_time_ms,
      user_agent: activity.user_agent,
      ip_address: activity.ip_address,
      error_message: activity.error_message
    }));

    // Derive session IDs from endpoint paths and fetch true verification outcomes.
    const sessionIdRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
    const sessionIds = Array.from(
      new Set(
        formattedActivities.flatMap(activity => {
          const matches = activity.endpoint?.match(sessionIdRegex) || [];
          return matches;
        })
      )
    );

    let sessionOutcomes: Record<string, string> = {};
    if (sessionIds.length > 0) {
      const { data: verificationRows, error: sessionError } = await supabase
        .from('verification_requests')
        .select('id, status')
        .eq('developer_id', developer.id)
        .in('id', sessionIds);

      if (sessionError) {
        logger.error('Failed to fetch session outcomes:', sessionError);
      } else {
        sessionOutcomes = (verificationRows || []).reduce((acc: Record<string, string>, row: any) => {
          if (row?.id && row?.status) acc[row.id] = row.status;
          return acc;
        }, {});
      }
    }

    res.json({
      statistics: stats,
      recent_activities: formattedActivities,
      total_activities: recentActivities.length,
      session_outcomes: sessionOutcomes
    });
  })
);

// POST /api/developer/api-key/:id/rotate
// Creates a new key with the same settings and gives the old key a grace period
// (default 7 days) before it expires, so integrations have time to update.
router.post('/api-key/:id/rotate',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { gracePeriodHours = 168 } = req.body; // default: 7 days

    // Verify the key belongs to this developer and is currently active
    const { data: oldKey, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', id)
      .eq('developer_id', (req as any).developer!.id)
      .eq('is_active', true)
      .single();

    if (error || !oldKey) throw new NotFoundError('API key not found');

    // Generate a fresh key
    const { key, hash, prefix } = generateAPIKey();

    const { data: newKey } = await supabase
      .from('api_keys')
      .insert({
        developer_id: (req as any).developer!.id,
        key_hash: hash,
        key_prefix: prefix,
        name: `${oldKey.name} (rotated)`,
        is_sandbox: oldKey.is_sandbox,
        is_active: true,
      })
      .select()
      .single();

    // Mark the old key to expire after the grace period (still usable until then)
    const expiresAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000);
    await supabase
      .from('api_keys')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', id);

    logger.info('API key rotated', {
      developerId: (req as any).developer!.id,
      oldKeyId: id,
      newKeyId: newKey?.id,
      gracePeriodHours,
    });

    res.status(201).json({
      new_key: key,                              // shown once — store securely
      new_key_id: newKey?.id,
      old_key_expires_at: expiresAt.toISOString(),
      grace_period_hours: gracePeriodHours,
      message: `Old key will remain active until ${expiresAt.toISOString()}. Update your integration before then.`,
    });
  })
);

// Delete developer account (GDPR compliant)
router.delete('/account',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    body('confirm_email')
      .isEmail()
      .normalizeEmail()
      .withMessage('You must confirm your email to delete your account'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { confirm_email } = req.body;
    if (confirm_email !== developer.email) {
      throw new ValidationError(
        'Email does not match your account email',
        'confirm_email',
        confirm_email
      );
    }

    // CASCADE handles api_keys, webhooks, webhook_deliveries,
    // verification_requests, documents, selfies
    const { error } = await supabase
      .from('developers')
      .delete()
      .eq('id', developer.id);

    if (error) {
      logger.error('Failed to delete developer account:', error);
      throw new Error('Failed to delete account');
    }

    logger.info('Developer account deleted', {
      developerId: developer.id,
      email: developer.email,
    });

    res.json({ message: 'Account deleted' });
  })
);

// Get full verification detail for a session (JWT-authenticated developer portal)
router.get('/verifications/:verificationId',
  apiKeyRateLimit,
  [
    param('verificationId')
      .isUUID()
      .withMessage('Invalid verification ID format')
  ],
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { verificationId } = req.params;

    // Ownership check: verification must belong to this developer
    const { data: verification, error: verErr } = await supabase
      .from('verification_requests')
      .select('id, is_sandbox')
      .eq('id', verificationId)
      .eq('developer_id', developer.id)
      .single();

    if (verErr || !verification) {
      throw new NotFoundError('Verification not found or does not belong to this developer');
    }

    // Load session state from verification_contexts
    const state = await loadSessionState(verificationId);

    if (!state) {
      // Session just initialized — no context row yet
      return res.json({
        success: true,
        verification_id: verificationId,
        status: 'pending',
        current_step: 0,
        total_steps: 5,
        message: 'Verification session has been created but no documents have been submitted yet.',
      });
    }

    const mapped = mapStatusForResponse(state);
    const riskScore = await fetchRiskScore(verificationId);

    res.json({
      success: true,
      verification_id: verificationId,
      is_sandbox: verification.is_sandbox ?? false,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      front_document_uploaded: !!state.front_extraction,
      back_document_uploaded: !!state.back_extraction,
      live_capture_uploaded: !!state.face_match,
      ocr_data: state.front_extraction?.ocr ?? null,
      barcode_data: state.back_extraction?.qr_payload ?? null,
      cross_validation_results: state.cross_validation ?? null,
      face_match_results: state.face_match ?? null,
      liveness_results: state.liveness ?? null,
      aml_screening: state.aml_screening ?? null,
      risk_score: riskScore,
      barcode_extraction_failed: state.back_extraction ? !state.back_extraction.qr_payload : null,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      face_match_passed: state.face_match?.passed ?? null,
      liveness_passed: state.liveness?.passed ?? null,
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW'
        ? 'Cross-validation requires review'
        : state.face_match?.skipped_reason
          ? `Face match skipped: ${state.face_match.skipped_reason}`
          : null,
      created_at: state.created_at,
      updated_at: state.updated_at,
    });
  })
);

export default router;
