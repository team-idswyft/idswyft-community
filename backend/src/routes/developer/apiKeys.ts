import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { supabase } from '@/config/database.js';
import { generateAPIKey, authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = express.Router();

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
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { name, is_sandbox = false, expires_in_days } = req.body;
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

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

    // Generate API key
    const { key, hash, prefix } = generateAPIKey();
    const keyId = crypto.randomUUID();

    // Calculate expiration date
    let expiresAt = null;
    if (expires_in_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }

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
      logger.error('Failed to create API key:', keyError);
      throw new Error(`Failed to create API key: ${keyError.message || keyError.code || 'Unknown database error'}`);
    }

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
      api_keys: apiKeys.map((key: any) => {
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
      active_keys: apiKeys.filter((k: any) => k.is_active && (!k.expires_at || new Date(k.expires_at) >= new Date())).length,
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { keyId } = req.params;
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    // First, check if the key exists and belongs to the developer
    const { data: existingKey, error: checkError } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, is_active')
      .eq('id', keyId)
      .eq('developer_id', developer.id)
      .single();

    if (checkError || !existingKey) {
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

    if (error || !apiKey) {
      logger.error('Failed to deactivate API key', { keyId, error });
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

// POST /api/developer/api-key/:id/rotate
// Creates a new key with the same settings and gives the old key a grace period
// (default 7 days) before it expires, so integrations have time to update.
router.post('/api-key/:id/rotate',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const hours = Math.max(1, Math.min(168, Number(req.body.gracePeriodHours) || 168));

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
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    await supabase
      .from('api_keys')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', id);

    logger.info('API key rotated', {
      developerId: (req as any).developer!.id,
      oldKeyId: id,
      newKeyId: newKey?.id,
      gracePeriodHours: hours,
    });

    res.status(201).json({
      new_key: key,                              // shown once — store securely
      new_key_id: newKey?.id,
      old_key_expires_at: expiresAt.toISOString(),
      grace_period_hours: hours,
      message: `Old key will remain active until ${expiresAt.toISOString()}. Update your integration before then.`,
    });
  })
);

export default router;
