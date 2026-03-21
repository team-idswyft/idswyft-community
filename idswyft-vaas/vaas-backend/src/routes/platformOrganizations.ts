import { Router } from 'express';
import { vaasSupabase } from '../config/database.js';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformNotificationService } from '../services/platformNotificationService.js';

const router = Router();

// All routes require platform admin auth
router.use(requirePlatformAdmin as any);

// GET /api/platform/organizations — list all orgs with stats
router.get('/', async (req: PlatformAdminRequest, res) => {
  try {
    const { search, status, page = '1', per_page = '25' } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    let query = vaasSupabase
      .from('vaas_organizations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(per_page) - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,contact_email.ilike.%${search}%`);
    }
    if (status) {
      query = query.eq('billing_status', status);
    }

    const { data: organizations, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Fetch member counts per org
    const orgIds = (organizations || []).map(o => o.id);
    let memberCounts: Record<string, number> = {};
    if (orgIds.length > 0) {
      const { data: counts } = await vaasSupabase
        .from('vaas_admins')
        .select('organization_id')
        .in('organization_id', orgIds);

      if (counts) {
        for (const row of counts) {
          memberCounts[row.organization_id] = (memberCounts[row.organization_id] || 0) + 1;
        }
      }
    }

    const enriched = (organizations || []).map(org => ({
      ...org,
      member_count: memberCounts[org.id] || 0,
    }));

    const response: VaasApiResponse = {
      success: true,
      data: enriched,
      meta: {
        total: count || 0,
        page: parseInt(page),
        per_page: parseInt(per_page),
        total_pages: Math.ceil((count || 0) / parseInt(per_page)),
      },
    };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_ORGS_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// GET /api/platform/organizations/:id — org detail
router.get('/:id', async (req: PlatformAdminRequest, res) => {
  try {
    const { data: org, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !org) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ORG_NOT_FOUND', message: 'Organization not found' },
      };
      return res.status(404).json(response);
    }

    const response: VaasApiResponse = { success: true, data: org };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_ORG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/organizations — create a new org
router.post('/', async (req: PlatformAdminRequest, res) => {
  try {
    const { name, slug, contact_email, subscription_tier } = req.body;

    if (!name || !slug) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and slug are required' },
      };
      return res.status(400).json(response);
    }

    const { data: org, error } = await vaasSupabase
      .from('vaas_organizations')
      .insert({
        name,
        slug,
        contact_email: contact_email || null,
        subscription_tier: subscription_tier || 'starter',
        billing_status: 'active',
        settings: {},
        branding: {},
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'SLUG_TAKEN', message: 'Organization slug already exists' },
        };
        return res.status(409).json(response);
      }
      throw new Error(error.message);
    }

    const response: VaasApiResponse = { success: true, data: org };
    res.status(201).json(response);

    // Fire-and-forget notification
    platformNotificationService.emit({
      type: 'organization.created',
      severity: 'info',
      title: `Organization created: ${name}`,
      message: `New organization "${name}" (${slug}) created by ${req.platformAdmin!.email}.`,
      source: 'platform-admin',
      metadata: { organization_id: org.id, slug, created_by: req.platformAdmin!.id },
    }).catch(() => {});
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'CREATE_ORG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// PUT /api/platform/organizations/:id/status — suspend/reactivate
router.put('/:id/status', async (req: PlatformAdminRequest, res) => {
  try {
    const { billing_status } = req.body;
    const validStatuses = ['active', 'suspended', 'cancelled'];

    if (!validStatuses.includes(billing_status)) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${validStatuses.join(', ')}` },
      };
      return res.status(400).json(response);
    }

    const { data: org, error } = await vaasSupabase
      .from('vaas_organizations')
      .update({ billing_status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !org) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ORG_NOT_FOUND', message: 'Organization not found' },
      };
      return res.status(404).json(response);
    }

    const response: VaasApiResponse = { success: true, data: org };
    res.json(response);

    // Fire-and-forget notification
    const eventType = billing_status === 'suspended' ? 'organization.suspended' as const : 'organization.status_changed' as const;
    const severity = billing_status === 'suspended' ? 'warning' as const : 'info' as const;
    platformNotificationService.emit({
      type: eventType,
      severity,
      title: `Organization ${billing_status}: ${org.name}`,
      message: `Organization "${org.name}" status changed to ${billing_status} by ${req.platformAdmin!.email}.`,
      source: 'platform-admin',
      metadata: { organization_id: org.id, new_status: billing_status, changed_by: req.platformAdmin!.id },
    }).catch(() => {});
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'UPDATE_STATUS_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// GET /api/platform/organizations/:id/stats — verification/user/API counts
router.get('/:id/stats', async (req: PlatformAdminRequest, res) => {
  try {
    const orgId = req.params.id;

    // Parallel counts
    const [adminsResult, usersResult, verificationsResult, apiKeysResult, webhooksResult] = await Promise.all([
      vaasSupabase.from('vaas_admins').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      vaasSupabase.from('vaas_end_users').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      vaasSupabase.from('vaas_verification_sessions').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      vaasSupabase.from('vaas_api_keys').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      vaasSupabase.from('vaas_webhooks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);

    const response: VaasApiResponse = {
      success: true,
      data: {
        admins: adminsResult.count || 0,
        end_users: usersResult.count || 0,
        verifications: verificationsResult.count || 0,
        api_keys: apiKeysResult.count || 0,
        webhooks: webhooksResult.count || 0,
      },
    };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_STATS_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

export default router;
