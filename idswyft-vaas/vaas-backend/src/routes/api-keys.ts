import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { VaasApiResponse } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import crypto from 'crypto';
import { auditService } from '../services/auditService.js';

const router = Router();

// Generate VaaS API key (different format from main API keys)
const generateVaasAPIKey = (): { key: string; hash: string; prefix: string } => {
  const key = `vaas_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(key)
    .digest('hex');
  const prefix = key.substring(0, 20);
  
  return { key, hash, prefix };
};

// List VaaS API keys for organization
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.admin!.organization_id;

    const { data: apiKeys, error } = await vaasSupabase
      .from('vaas_api_keys')
      .select('id, key_name, key_prefix, is_active, created_at, last_used_at, expires_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch API keys: ${error.message}`);
    }

    const response: VaasApiResponse = {
      success: true,
      data: apiKeys || []
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to list API keys:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: error.message || 'Failed to fetch API keys'
      }
    };
    res.status(500).json(response);
  }
});

// Get specific VaaS API key
router.get('/:keyId', 
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format')
  ],
  requireAuth, 
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { keyId } = req.params;

    const { data: apiKey, error } = await vaasSupabase
      .from('vaas_api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (error || !apiKey) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: VaasApiResponse = {
      success: true,
      data: apiKey
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to get API key:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: error.message || 'Failed to get API key'
      }
    };
    res.status(500).json(response);
  }
});

// Create VaaS API key
router.post('/',
  [
    body('key_name')
      .trim()
      .escape()
      .isLength({ min: 1, max: 100 })
      .withMessage('API key name is required and must be less than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('expires_in_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Expiration must be between 1 and 365 days')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { key_name, description, expires_in_days } = req.body;

    // Check existing key count (limit to 10 VaaS API keys per organization)
    const { data: existingKeys, error: countError } = await vaasSupabase
      .from('vaas_api_keys')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (countError) {
      throw new Error(`Failed to check API key count: ${countError.message}`);
    }

    const existingCount = existingKeys?.length || 0;

    const maxKeys = 10;
    if ((existingCount ?? 0) >= maxKeys) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'LIMIT_EXCEEDED',
          message: `Maximum of ${maxKeys} VaaS API keys allowed per organization`
        }
      };
      return res.status(400).json(response);
    }

    // Generate API key
    const { key, hash, prefix } = generateVaasAPIKey();
    const keyId = crypto.randomUUID();

    // Calculate expiration
    let expiresAt = null;
    if (expires_in_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }

    // Save to database
    const { data: savedKey, error: saveError } = await vaasSupabase
      .from('vaas_api_keys')
      .insert([{
        id: keyId,
        organization_id: organizationId,
        key_name: key_name.trim(),
        description: description?.trim() || null,
        key_prefix: prefix,
        key_hash: hash,
        expires_at: expiresAt,
        created_at: new Date().toISOString()
      }])
      .select('id, key_name, key_prefix, description, expires_at, created_at')
      .single();

    if (saveError) {
      throw new Error(`Failed to save API key: ${saveError.message}`);
    }

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: keyId,
      details: { key_name: key_name.trim() },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: {
        secret_key: key, // Return full key only once
        key_info: savedKey,
        message: 'VaaS API key created successfully. Store it securely - it will not be shown again.',
        usage_info: {
          purpose: 'This key provides access to VaaS backend API endpoints',
          authentication: 'Include in requests as X-API-Key header',
          scope: 'Organization-scoped access to VaaS services'
        }
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to create API key:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error.message || 'Failed to create API key'
      }
    };
    res.status(500).json(response);
  }
});

// Update VaaS API key
router.put('/:keyId',
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format'),
    body('key_name')
      .optional()
      .trim()
      .escape()
      .isLength({ min: 1, max: 100 })
      .withMessage('API key name must be between 1 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { keyId } = req.params;
    const updates = req.body;

    const { data: updatedKey, error } = await vaasSupabase
      .from('vaas_api_keys')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .select('*')
      .single();

    if (error || !updatedKey) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found or update failed'
        }
      };
      return res.status(404).json(response);
    }

    const response: VaasApiResponse = {
      success: true,
      data: updatedKey
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to update API key:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error.message || 'Failed to update API key'
      }
    };
    res.status(500).json(response);
  }
});

// Delete (deactivate) VaaS API key
router.delete('/:keyId',
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { keyId } = req.params;

    const { error } = await vaasSupabase
      .from('vaas_api_keys')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: 'Failed to delete API key'
        }
      };
      return res.status(400).json(response);
    }

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'api_key.deleted',
      resourceType: 'api_key',
      resourceId: keyId,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: {
        message: 'VaaS API key deleted successfully'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to delete API key:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: error.message || 'Failed to delete API key'
      }
    };
    res.status(500).json(response);
  }
});

// Rotate VaaS API key
router.post('/:keyId/rotate',
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { keyId } = req.params;

    // Generate new key
    const { key, hash, prefix } = generateVaasAPIKey();

    const { data: rotatedKey, error } = await vaasSupabase
      .from('vaas_api_keys')
      .update({
        key_prefix: prefix,
        key_hash: hash,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .select('id, key_name, key_prefix')
      .single();

    if (error || !rotatedKey) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found'
        }
      };
      return res.status(404).json(response);
    }

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'api_key.rotated',
      resourceType: 'api_key',
      resourceId: keyId,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: {
        secret_key: key, // Return new full key
        message: 'VaaS API key rotated successfully. Update your applications with the new key.'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to rotate API key:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'ROTATE_ERROR',
        message: error.message || 'Failed to rotate API key'
      }
    };
    res.status(500).json(response);
  }
});

// Get API key usage statistics
router.get('/:keyId/usage',
  [
    param('keyId')
      .isUUID()
      .withMessage('Invalid API key ID format')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const organizationId = req.admin!.organization_id;
    const { keyId } = req.params;

    // For now, return placeholder usage data
    // This would integrate with actual usage tracking in a full implementation
    const response: VaasApiResponse = {
      success: true,
      data: {
        key_id: keyId,
        usage: {
          total_requests: 0,
          requests_this_month: 0,
          last_used_at: null
        },
        note: 'Usage tracking not yet implemented'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[VaasAPIKeys] Failed to get usage:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'USAGE_ERROR',
        message: error.message || 'Failed to get API key usage'
      }
    };
    res.status(500).json(response);
  }
});

export default router;