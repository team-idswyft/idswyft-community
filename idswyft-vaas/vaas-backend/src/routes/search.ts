import { Router } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { vaasSupabase } from '../config/database.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

/** Escape Postgres ILIKE metacharacters so user input is treated literally. */
function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&');
}

// Global search across multiple tables
router.get('/', requireAuth as any, requirePermission('view_verifications') as any, async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const q = (req.query.q as string || '').trim();
    const limit = Math.min(Number(req.query.limit) || 5, 10);

    if (q.length < 2) {
      const response: VaasApiResponse = {
        success: true,
        data: { verifications: [], users: [], webhooks: [], audit_logs: [], api_keys: [] },
      };
      return res.json(response);
    }

    const ilike = `%${escapeIlike(q)}%`;

    // Run all searches in parallel
    const [verificationsResult, usersResult, webhooksResult, auditLogsResult, apiKeysResult] = await Promise.all([
      // Verifications — search by ID prefix and joined user fields
      (async () => {
        // Search by session ID prefix
        const { data: byId } = await vaasSupabase
          .from('vaas_verification_sessions')
          .select('id, status, confidence_score, created_at, end_user_id, vaas_end_users(first_name, last_name, email)')
          .eq('organization_id', organizationId)
          .ilike('id', ilike)
          .order('created_at', { ascending: false })
          .limit(limit);

        // Search by user email/name
        const { data: byUser } = await vaasSupabase
          .from('vaas_verification_sessions')
          .select('id, status, confidence_score, created_at, end_user_id, vaas_end_users!inner(first_name, last_name, email)')
          .eq('organization_id', organizationId)
          .or(`email.ilike.${ilike},first_name.ilike.${ilike},last_name.ilike.${ilike}`, { referencedTable: 'vaas_end_users' })
          .order('created_at', { ascending: false })
          .limit(limit);

        // Merge and deduplicate
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const row of [...(byId || []), ...(byUser || [])]) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        return merged.slice(0, limit);
      })(),

      // End users
      vaasSupabase
        .from('vaas_end_users')
        .select('id, email, first_name, last_name, external_id, verification_status, created_at')
        .eq('organization_id', organizationId)
        .or(`email.ilike.${ilike},first_name.ilike.${ilike},last_name.ilike.${ilike},external_id.ilike.${ilike}`)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then(r => r.data || []),

      // Webhooks
      vaasSupabase
        .from('vaas_webhooks')
        .select('id, url, enabled, failure_count, created_at')
        .eq('organization_id', organizationId)
        .ilike('url', ilike)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then(r => r.data || []),

      // Audit logs
      vaasSupabase
        .from('vaas_audit_logs')
        .select('id, action, resource_type, resource_id, actor_name, severity, created_at')
        .eq('organization_id', organizationId)
        .or(`action.ilike.${ilike},resource_type.ilike.${ilike}`)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then(r => r.data || []),

      // API keys
      vaasSupabase
        .from('vaas_api_keys')
        .select('id, key_name, key_prefix, is_active, created_at')
        .eq('organization_id', organizationId)
        .or(`key_name.ilike.${ilike},key_prefix.ilike.${ilike}`)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then(r => r.data || []),
    ]);

    const response: VaasApiResponse = {
      success: true,
      data: {
        verifications: verificationsResult,
        users: usersResult,
        webhooks: webhooksResult,
        audit_logs: auditLogsResult,
        api_keys: apiKeysResult,
      },
    };
    res.json(response);
  } catch (err: any) {
    console.error('[Search] Error:', err.message);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
