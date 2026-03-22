import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
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
import { escapePostgrestValue } from '../utils/sanitize.js';

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

// ── Predefined roles with default permission sets ──────────────────────────
const SYSTEM_PERMISSIONS = [
  { id: 'manage_organization', name: 'manage_organization', display_name: 'Manage Organization', description: 'Create, update, and delete organization settings', category: 'organization' as const, is_system_permission: true },
  { id: 'manage_admins', name: 'manage_admins', display_name: 'Manage Admins', description: 'Invite, edit, and remove admin users', category: 'admin_management' as const, is_system_permission: true },
  { id: 'manage_billing', name: 'manage_billing', display_name: 'Manage Billing', description: 'View and manage billing, plans, and invoices', category: 'billing' as const, is_system_permission: true },
  { id: 'view_users', name: 'view_users', display_name: 'View Users', description: 'View end-user profiles and verification history', category: 'users' as const, is_system_permission: true },
  { id: 'manage_users', name: 'manage_users', display_name: 'Manage Users', description: 'Create, edit, and delete end users', category: 'users' as const, is_system_permission: true },
  { id: 'export_users', name: 'export_users', display_name: 'Export Users', description: 'Export end-user data in CSV or JSON', category: 'users' as const, is_system_permission: true },
  { id: 'view_verifications', name: 'view_verifications', display_name: 'View Verifications', description: 'View verification sessions and results', category: 'verifications' as const, is_system_permission: true },
  { id: 'review_verifications', name: 'review_verifications', display_name: 'Review Verifications', description: 'Review flagged and manual-review verifications', category: 'verifications' as const, is_system_permission: true },
  { id: 'approve_verifications', name: 'approve_verifications', display_name: 'Approve Verifications', description: 'Approve or reject verification outcomes', category: 'verifications' as const, is_system_permission: true },
  { id: 'manage_settings', name: 'manage_settings', display_name: 'Manage Settings', description: 'Configure verification settings and thresholds', category: 'settings' as const, is_system_permission: true },
  { id: 'manage_webhooks', name: 'manage_webhooks', display_name: 'Manage Webhooks', description: 'Create, edit, and delete webhook endpoints', category: 'webhooks' as const, is_system_permission: true },
  { id: 'manage_integrations', name: 'manage_integrations', display_name: 'Manage Integrations', description: 'Manage API keys and third-party integrations', category: 'api_keys' as const, is_system_permission: true },
  { id: 'view_analytics', name: 'view_analytics', display_name: 'View Analytics', description: 'View dashboards, charts, and reports', category: 'analytics' as const, is_system_permission: true },
  { id: 'export_analytics', name: 'export_analytics', display_name: 'Export Analytics', description: 'Export analytics data and reports', category: 'analytics' as const, is_system_permission: true },
];

const ALL_PERMISSION_NAMES = SYSTEM_PERMISSIONS.map(p => p.name);

function buildRole(id: string, name: string, displayName: string, description: string, permissionNames: string[]) {
  const now = new Date().toISOString();
  return {
    id,
    name,
    display_name: displayName,
    description,
    permissions: SYSTEM_PERMISSIONS.filter(p => permissionNames.includes(p.name)),
    is_system_role: true,
    created_at: now,
    updated_at: now,
  };
}

const SYSTEM_ROLES = [
  buildRole('owner', 'owner', 'Owner', 'Full access to all organization features', ALL_PERMISSION_NAMES),
  buildRole('admin', 'admin', 'Admin', 'Manage most organization features except billing and admin management', [
    'manage_organization', 'view_users', 'manage_users', 'export_users',
    'view_verifications', 'review_verifications', 'approve_verifications',
    'manage_settings', 'manage_webhooks', 'manage_integrations',
    'view_analytics', 'export_analytics',
  ]),
  buildRole('operator', 'operator', 'Operator', 'Day-to-day operations — manage users, review verifications, view analytics', [
    'view_users', 'manage_users',
    'view_verifications', 'review_verifications',
    'manage_webhooks',
    'view_analytics',
  ]),
  buildRole('verification_reviewer', 'verification_reviewer', 'Verification Reviewer', 'Review and approve identity verifications', [
    'view_users',
    'view_verifications', 'review_verifications', 'approve_verifications',
    'view_analytics',
  ]),
  buildRole('viewer', 'viewer', 'Viewer', 'Read-only access to users, verifications, and analytics', [
    'view_users', 'view_verifications', 'view_analytics',
  ]),
];

// Get admin roles for organization
router.get('/:id/admin-roles', requireAuth as any, async (req: any, res) => {
  try {
    if (req.admin!.organization_id !== req.params.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    res.json({ success: true, data: SYSTEM_ROLES });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ROLES_FAILED', message: error.message } });
  }
});

// Get all available permissions
router.get('/:id/admin-permissions', requireAuth as any, async (req: any, res) => {
  try {
    if (req.admin!.organization_id !== req.params.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    res.json({ success: true, data: SYSTEM_PERMISSIONS });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_PERMISSIONS_FAILED', message: error.message } });
  }
});

// ── Helpers for admin-users CRUD ─────────────────────────────────────────────

/** Map a SYSTEM_ROLES entry name to the JSONB permissions the DB stores. */
function permissionsForRole(roleName: string): Record<string, boolean> {
  const role = SYSTEM_ROLES.find(r => r.name === roleName);
  if (!role) return {};
  const perms: Record<string, boolean> = {};
  for (const p of SYSTEM_PERMISSIONS) {
    perms[p.name] = role.permissions.some(rp => rp.name === p.name);
  }
  return perms;
}

/** Transform a raw DB admin row into the shape the frontend's AdminUser type expects. */
function toAdminUser(row: any) {
  const roleName = row.role || 'viewer';
  const systemRole = SYSTEM_ROLES.find(r => r.name === roleName);
  return {
    id: row.id,
    organization_id: row.organization_id,
    email: row.email,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    role_id: roleName,
    role: systemRole || buildRole(roleName, roleName, roleName, '', []),
    status: row.status || 'active',
    last_login_at: row.last_login_at || null,
    last_ip_address: null,
    failed_login_attempts: row.failed_login_attempts || 0,
    locked_until: row.locked_until || null,
    email_verified: row.email_verified || false,
    phone_number: null,
    avatar_url: null,
    timezone: null,
    language: 'en',
    two_factor_enabled: false,
    invite_token: null,
    invite_expires_at: null,
    invited_by: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Admin Users CRUD ─────────────────────────────────────────────────────────

// GET /:id/admin-users — list admin users with search, filter, pagination
router.get('/:id/admin-users/stats', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const { data: admins, error } = await vaasSupabase
      .from('vaas_admins')
      .select('id, role, status')
      .eq('organization_id', orgId);

    if (error) throw error;
    const all = admins || [];

    const admins_by_role = SYSTEM_ROLES.map(r => ({
      role_name: r.display_name,
      count: all.filter(a => a.role === r.name).length,
    }));

    res.json({
      success: true,
      data: {
        total_admins: all.length,
        active_admins: all.filter(a => a.status === 'active').length,
        pending_invites: all.filter(a => a.status === 'invited').length,
        suspended_admins: all.filter(a => a.status === 'inactive').length,
        admins_by_role,
        recent_logins: [],
        recent_invites: [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_STATS_FAILED', message: error.message } });
  }
});

router.get('/:id/admin-users', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page as string) || 20));
    const search = (req.query.search as string || '').trim();
    const roleFilter = req.query.role_id as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    let query = vaasSupabase
      .from('vaas_admins')
      .select('id, organization_id, email, first_name, last_name, role, permissions, status, email_verified, email_verified_at, last_login_at, login_count, failed_login_attempts, locked_until, created_at, updated_at', { count: 'exact' })
      .eq('organization_id', orgId);

    if (roleFilter) query = query.eq('role', roleFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (search) {
      const escaped = escapePostgrestValue(search);
      query = query.or(`email.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`);
    }

    query = query.order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / perPage);

    res.json({
      success: true,
      data: {
        users: (data || []).map(toAdminUser),
        total: totalCount,
        page,
        per_page: perPage,
        total_pages: totalPages,
        has_next_page: page < totalPages,
        has_prev_page: page > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ADMIN_USERS_FAILED', message: error.message } });
  }
});

// POST /:id/admin-users — create a new admin user
router.post('/:id/admin-users', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Only owners and admins with manage_admins can create users
    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    const { email, first_name, last_name, role_id, send_invite } = req.body;
    if (!email || !first_name || !last_name || !role_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'email, first_name, last_name, and role_id are required' } });
    }

    // Validate role
    const validRoles = SYSTEM_ROLES.map(r => r.name);
    if (!validRoles.includes(role_id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ROLE', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` } });
    }

    // Prevent non-owners from creating owners
    if (role_id === 'owner' && req.admin!.role !== 'owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only owners can create owner accounts' } });
    }

    // Check for duplicate email in this org
    const { data: existing } = await vaasSupabase
      .from('vaas_admins')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE_EMAIL', message: 'An admin with this email already exists in this organization' } });
    }

    // Generate a random temporary password
    const tempPassword = crypto.randomBytes(16).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const permissions = permissionsForRole(role_id);

    const { data: newAdmin, error } = await vaasSupabase
      .from('vaas_admins')
      .insert({
        organization_id: orgId,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        role: role_id,
        permissions,
        status: send_invite !== false ? 'invited' : 'active',
        email_verified: false,
      })
      .select()
      .single();

    if (error) throw error;

    auditService.logAuditEvent({
      organizationId: orgId,
      adminId: req.admin!.id,
      action: 'admin.created',
      resourceType: 'admin',
      resourceId: newAdmin.id,
      details: { email, role: role_id, invited: send_invite !== false },
      req,
    });

    res.status(201).json({ success: true, data: toAdminUser(newAdmin) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'CREATE_ADMIN_FAILED', message: error.message } });
  }
});

// PUT /:id/admin-users/:adminId — update an admin user
router.put('/:id/admin-users/:adminId', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    const adminId = req.params.adminId;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    const { first_name, last_name, role_id, status } = req.body;
    const updates: Record<string, any> = {};

    if (first_name !== undefined) updates.first_name = first_name.trim();
    if (last_name !== undefined) updates.last_name = last_name.trim();
    if (status !== undefined) updates.status = status;

    if (role_id !== undefined) {
      const validRoles = SYSTEM_ROLES.map(r => r.name);
      if (!validRoles.includes(role_id)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_ROLE', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` } });
      }
      if (role_id === 'owner' && req.admin!.role !== 'owner') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only owners can assign the owner role' } });
      }
      updates.role = role_id;
      updates.permissions = permissionsForRole(role_id);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No fields to update' } });
    }

    const { data: updated, error } = await vaasSupabase
      .from('vaas_admins')
      .update(updates)
      .eq('id', adminId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    if (!updated) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admin user not found' } });
    }

    auditService.logAuditEvent({
      organizationId: orgId,
      adminId: req.admin!.id,
      action: 'admin.updated',
      resourceType: 'admin',
      resourceId: adminId,
      details: { updates: Object.keys(updates) },
      req,
    });

    res.json({ success: true, data: toAdminUser(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_ADMIN_FAILED', message: error.message } });
  }
});

// DELETE /:id/admin-users/:adminId — delete an admin user
router.delete('/:id/admin-users/:adminId', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    const adminId = req.params.adminId;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    // Prevent self-deletion
    if (req.admin!.id === adminId) {
      return res.status(400).json({ success: false, error: { code: 'SELF_DELETE', message: 'You cannot delete your own account' } });
    }

    const { data: deleted, error } = await vaasSupabase
      .from('vaas_admins')
      .delete()
      .eq('id', adminId)
      .eq('organization_id', orgId)
      .select('id')
      .single();

    if (error?.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admin user not found' } });
    }
    if (error) throw error;

    auditService.logAuditEvent({
      organizationId: orgId,
      adminId: req.admin!.id,
      action: 'admin.deleted',
      resourceType: 'admin',
      resourceId: adminId,
      details: {},
      req,
    });

    res.json({ success: true, data: null });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_ADMIN_FAILED', message: error.message } });
  }
});

// POST /:id/admin-users/:adminId/suspend
router.post('/:id/admin-users/:adminId/suspend', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    const adminId = req.params.adminId;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }
    if (req.admin!.id === adminId) {
      return res.status(400).json({ success: false, error: { code: 'SELF_SUSPEND', message: 'You cannot suspend your own account' } });
    }

    const { data: updated, error } = await vaasSupabase
      .from('vaas_admins')
      .update({ status: 'inactive' })
      .eq('id', adminId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;

    auditService.logAuditEvent({
      organizationId: orgId, adminId: req.admin!.id,
      action: 'admin.suspended', resourceType: 'admin', resourceId: adminId,
      details: { reason: req.body.reason || '' }, req,
    });

    res.json({ success: true, data: toAdminUser(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SUSPEND_FAILED', message: error.message } });
  }
});

// POST /:id/admin-users/:adminId/activate
router.post('/:id/admin-users/:adminId/activate', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    const adminId = req.params.adminId;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    const { data: updated, error } = await vaasSupabase
      .from('vaas_admins')
      .update({ status: 'active' })
      .eq('id', adminId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;

    auditService.logAuditEvent({
      organizationId: orgId, adminId: req.admin!.id,
      action: 'admin.activated', resourceType: 'admin', resourceId: adminId,
      details: {}, req,
    });

    res.json({ success: true, data: toAdminUser(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'ACTIVATE_FAILED', message: error.message } });
  }
});

// POST /:id/admin-users/:adminId/unlock
router.post('/:id/admin-users/:adminId/unlock', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    const adminId = req.params.adminId;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    const { data: updated, error } = await vaasSupabase
      .from('vaas_admins')
      .update({ locked_until: null, failed_login_attempts: 0, status: 'active' })
      .eq('id', adminId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;

    auditService.logAuditEvent({
      organizationId: orgId, adminId: req.admin!.id,
      action: 'admin.unlocked', resourceType: 'admin', resourceId: adminId,
      details: {}, req,
    });

    res.json({ success: true, data: toAdminUser(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UNLOCK_FAILED', message: error.message } });
  }
});

// GET /:id/admin-invites — return pending invites (admins with status='invited')
router.get('/:id/admin-invites', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const { data, error } = await vaasSupabase
      .from('vaas_admins')
      .select('id, organization_id, email, first_name, last_name, role, created_at, updated_at')
      .eq('organization_id', orgId)
      .eq('status', 'invited')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform to AdminUserInvite shape
    const invites = (data || []).map(row => {
      const systemRole = SYSTEM_ROLES.find(r => r.name === row.role) || buildRole(row.role, row.role, row.role, '', []);
      return {
        id: row.id,
        organization_id: row.organization_id,
        email: row.email,
        role_id: row.role,
        role: systemRole,
        invited_by: req.admin!.id,
        invited_by_name: 'Admin',
        invite_token: '',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        accepted_at: null,
        status: 'pending' as const,
        created_at: row.created_at,
      };
    });

    res.json({ success: true, data: invites });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_INVITES_FAILED', message: error.message } });
  }
});

// POST /:id/admin-invites/:inviteId/resend — stub (no email integration yet)
router.post('/:id/admin-invites/:inviteId/resend', requireAuth as any, async (req: any, res) => {
  const orgId = req.params.id;
  if (req.admin!.organization_id !== orgId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }
  if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
    return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
  }
  // Invite email sending not yet implemented — acknowledge without error
  res.json({ success: true, data: null });
});

// DELETE /:id/admin-invites/:inviteId — revoke invite (delete the invited admin)
router.delete('/:id/admin-invites/:inviteId', requireAuth as any, async (req: any, res) => {
  try {
    const orgId = req.params.id;
    if (req.admin!.organization_id !== orgId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.admin!.role !== 'owner' && !req.admin!.permissions?.manage_admins) {
      return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission manage_admins required' } });
    }

    const { error } = await vaasSupabase
      .from('vaas_admins')
      .delete()
      .eq('id', req.params.inviteId)
      .eq('organization_id', orgId)
      .eq('status', 'invited');

    if (error) throw error;
    res.json({ success: true, data: null });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'REVOKE_INVITE_FAILED', message: error.message } });
  }
});

export default router;