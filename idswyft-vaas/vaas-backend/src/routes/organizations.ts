import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { organizationService } from '../services/organizationService.js';
import { emailService } from '../services/emailService.js';
import config from '../config/index.js';
import { VaasApiResponse, VaasCreateOrganizationRequest, VaasEnterpriseSignupRequest } from '../types/index.js';
import { validateBody } from '../schemas/validate.js';
import { createOrganizationSchema, updateOrganizationSchema, enterpriseSignupSchema } from '../schemas/organization.schema.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { auditService } from '../services/auditService.js';
import { orgStorageService } from '../services/orgStorageService.js';
import { vaasSupabase } from '../config/database.js';

const router = Router();

// Enterprise signup - public endpoint
router.post('/signup', validateBody(enterpriseSignupSchema), async (req, res) => {
  try {
    const signupData: VaasEnterpriseSignupRequest = req.body;
    const result = await organizationService.createEnterpriseSignup(signupData);
    
    // Send welcome email with credentials + verification link
    try {
      const dashboardUrl = process.env.VAAS_ADMIN_URL || 'https://app.idswyft.app';

      // Generate verification token so the welcome email includes a verify link
      const verificationToken = jwt.sign(
        { email: signupData.email, type: 'email_verification' },
        config.jwtSecret,
        { expiresIn: '72h' }
      );
      const verifyUrl = `${dashboardUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(signupData.email)}`;

      await emailService.sendWelcomeEmail({
        organization: result.organization,
        adminEmail: signupData.email,
        adminName: `${signupData.firstName} ${signupData.lastName}`,
        adminPassword: result.adminPassword,
        dashboardUrl,
        verifyUrl
      });
      
      // Send notification to admin team
      await emailService.sendNotificationToAdmin({
        organizationName: signupData.company,
        adminName: `${signupData.firstName} ${signupData.lastName}`,
        adminEmail: signupData.email,
        jobTitle: signupData.jobTitle,
        estimatedVolume: signupData.estimatedVolume,
        useCase: signupData.useCase,
        signupId: result.signupId
      });
      
      console.log('✅ Welcome email and admin notification sent successfully');
    } catch (emailError) {
      console.error('Failed to send emails:', emailError);
      // Don't fail the entire signup process for email issues
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          subscription_tier: result.organization.subscription_tier
        },
        message: 'Organization created successfully! You will receive login credentials via email within 24 hours.',
        signup_id: result.signupId
      }
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    console.error('Enterprise signup error:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'ENTERPRISE_SIGNUP_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Create new organization (super admin only)
router.post('/', requireSuperAdmin, validateBody(createOrganizationSchema), async (req, res) => {
  try {
    const organizationData: VaasCreateOrganizationRequest = req.body;
    const organization = await organizationService.createOrganization(organizationData);
    
    const response: VaasApiResponse = {
      success: true,
      data: organization
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Get organization details (admin must belong to org)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    
    // Check if admin belongs to this organization
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    const organization = await organizationService.getOrganizationById(id);
    
    if (!organization) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Organization not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: organization
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Update organization (owner/admin only)
router.put('/:id', requireAuth, validateBody(updateOrganizationSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    const updates = req.body;
    
    // Check permissions
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    // Only owners can update certain fields
    if (admin.role !== 'owner' && admin.role !== 'super_admin') {
      if (updates.subscription_tier || updates.billing_status || updates.stripe_customer_id) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Only organization owners can update billing settings'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    const organization = await organizationService.updateOrganization(id, updates);

    auditService.logAuditEvent({
      organizationId: id,
      adminId: admin.id,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: id,
      details: { fields: Object.keys(updates) },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: organization
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Delete organization (super admin only)
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    await organizationService.deleteOrganization(id);

    auditService.logAuditEvent({
      organizationId: id,
      adminId: admin?.id,
      action: 'organization.deleted',
      resourceType: 'organization',
      resourceId: id,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Organization deleted successfully' }
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DELETE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// List organizations (super admin only)
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 20, 100);
    
    const { organizations, total } = await organizationService.listOrganizations(page, perPage);
    
    const response: VaasApiResponse = {
      success: true,
      data: organizations,
      meta: {
        total,
        page,
        per_page: perPage,
        has_more: total > page * perPage
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIST_ORGANIZATIONS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get organization usage and billing info
router.get('/:id/usage', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    
    // Check permissions
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    // Check if admin has billing permissions
    if (!admin.permissions.manage_billing && admin.role !== 'owner' && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'No permission to view billing information'
        }
      };
      
      return res.status(403).json(response);
    }
    
    const usage = await organizationService.getOrganizationUsage(id);
    
    const response: VaasApiResponse = {
      success: true,
      data: usage
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_USAGE_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// ─── Storage Configuration ────────────────────────────────────────────

const VALID_STORAGE_TYPES = ['default', 's3', 'gcs', 'supabase'] as const;

const VALID_DATA_REGIONS = [
  'us-east-1', 'us-west-2',
  'eu-west-1', 'eu-central-1',
  'ap-southeast-1', 'ap-northeast-1',
  'ca-central-1', 'sa-east-1',
] as const;

const STORAGE_DEFAULTS = {
  storage_type: 'default',
  data_region: 'us-east-1',
  config: {},
  retention_days: 365,
  auto_delete_completed: false,
  encryption_enabled: true,
};

// Allowlisted config keys per provider — everything else is stripped
const PROVIDER_ALLOWED_KEYS: Record<string, string[]> = {
  s3: ['s3_region', 's3_bucket', 's3_access_key', 's3_secret_key'],
  supabase: ['supabase_url', 'supabase_service_key', 'supabase_bucket'],
  gcs: ['gcs_bucket', 'gcs_project_id', 'gcs_key_file'],
  default: [],
};

// Keys whose values are secrets — redacted in GET responses
const SECRET_KEYS = new Set(['s3_secret_key', 's3_access_key', 'supabase_service_key', 'gcs_key_file']);

function redactSecrets(cfg: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (SECRET_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      redacted[key] = value.length > 4 ? '****' + value.slice(-4) : '****';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function filterConfigKeys(providerConfig: Record<string, any>, storageType: string): Record<string, any> {
  const allowed = PROVIDER_ALLOWED_KEYS[storageType] || [];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (providerConfig[key] !== undefined) {
      filtered[key] = providerConfig[key];
    }
  }
  return filtered;
}

// GET /:id/storage-config — read storage settings for an organization
router.get('/:id/storage-config', requireAuth as any, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    // Org membership check
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this organization' },
      };
      return res.status(403).json(response);
    }

    const { data, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('storage_settings')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Organization not found' },
        };
        return res.status(404).json(response);
      }
      throw new Error(`Failed to fetch storage config: ${error.message}`);
    }

    // Merge persisted values over defaults so the frontend always gets a full shape
    const merged = { ...STORAGE_DEFAULTS, ...(data?.storage_settings || {}) };

    // Redact secrets — the frontend shows masked values for existing credentials
    if (merged.config && typeof merged.config === 'object') {
      merged.config = redactSecrets(merged.config);
    }

    const response: VaasApiResponse = { success: true, data: merged };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_STORAGE_CONFIG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// POST /:id/storage-config — update storage settings (owner / super_admin only)
router.post('/:id/storage-config', requireAuth as any, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    // Only owners and super_admins may change storage config
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this organization' },
      };
      return res.status(403).json(response);
    }

    if (admin.role !== 'owner' && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Only organization owners can update storage settings' },
      };
      return res.status(403).json(response);
    }

    const { storage_type, data_region, config: providerConfig, retention_days, auto_delete_completed, encryption_enabled } = req.body;

    // ── Validation ───────────────────────────────────────────────────
    if (storage_type && !VALID_STORAGE_TYPES.includes(storage_type)) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_STORAGE_TYPE', message: `storage_type must be one of: ${VALID_STORAGE_TYPES.join(', ')}` },
      };
      return res.status(400).json(response);
    }

    if (data_region && !VALID_DATA_REGIONS.includes(data_region)) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_DATA_REGION', message: `data_region must be one of: ${VALID_DATA_REGIONS.join(', ')}` },
      };
      return res.status(400).json(response);
    }

    if (retention_days !== undefined) {
      const days = Number(retention_days);
      if (isNaN(days) || days < 1 || days > 2555) {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'INVALID_RETENTION', message: 'retention_days must be between 1 and 2555' },
        };
        return res.status(400).json(response);
      }
    }

    // Provider-specific required fields
    const st = storage_type || 'default';
    if (st === 's3') {
      if (!providerConfig?.s3_bucket || !providerConfig?.s3_region || !providerConfig?.s3_access_key || !providerConfig?.s3_secret_key) {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'MISSING_S3_FIELDS', message: 'S3 requires s3_bucket, s3_region, s3_access_key, and s3_secret_key' },
        };
        return res.status(400).json(response);
      }
    } else if (st === 'supabase') {
      if (!providerConfig?.supabase_url || !providerConfig?.supabase_bucket) {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'MISSING_SUPABASE_FIELDS', message: 'Supabase requires supabase_url and supabase_bucket' },
        };
        return res.status(400).json(response);
      }
    } else if (st === 'gcs') {
      if (!providerConfig?.gcs_bucket || !providerConfig?.gcs_project_id) {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'MISSING_GCS_FIELDS', message: 'GCS requires gcs_bucket and gcs_project_id' },
        };
        return res.status(400).json(response);
      }
    }

    // ── Sanitize: only persist allowed keys for the selected provider ─
    const sanitizedConfig = st === 'default'
      ? {}
      : filterConfigKeys(providerConfig || {}, st);

    // If the client sends a redacted value (from the GET response), preserve
    // the existing stored value so we don't overwrite real secrets with "****".
    const { data: existing } = await vaasSupabase
      .from('vaas_organizations')
      .select('storage_settings')
      .eq('id', id)
      .single();

    if (!existing) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      };
      return res.status(404).json(response);
    }

    const existingConfig = (existing.storage_settings as any)?.config || {};
    for (const key of SECRET_KEYS) {
      if (typeof sanitizedConfig[key] === 'string' && sanitizedConfig[key].startsWith('****')) {
        // Preserve the previously stored value
        sanitizedConfig[key] = existingConfig[key] || '';
      }
    }

    // ── Persist ──────────────────────────────────────────────────────
    const storageSettings = {
      storage_type: st,
      data_region: data_region || 'us-east-1',
      config: sanitizedConfig,
      retention_days: retention_days !== undefined ? Number(retention_days) : 365,
      auto_delete_completed: auto_delete_completed ?? false,
      encryption_enabled: encryption_enabled ?? true,
    };

    const { error } = await vaasSupabase
      .from('vaas_organizations')
      .update({ storage_settings: storageSettings })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update storage config: ${error.message}`);
    }

    // Invalidate cached storage client so next upload uses the new config
    orgStorageService.invalidateCache(id);

    auditService.logAuditEvent({
      organizationId: id,
      adminId: admin.id,
      action: 'storage_config.updated',
      resourceType: 'organization',
      resourceId: id,
      details: { storage_type: st, data_region: storageSettings.data_region },
      req,
    });

    // Return the saved config with secrets redacted
    const responseData = {
      ...storageSettings,
      config: redactSecrets(storageSettings.config),
    };
    const response: VaasApiResponse = { success: true, data: responseData };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'UPDATE_STORAGE_CONFIG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

export default router;