import express, { Request, Response, NextFunction } from 'express';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import { loadSessionState } from '@/verification/statusReader.js';
import {
  storeVaultEntry,
  retrieveVaultEntry,
  deleteVaultEntry,
  extractIdentityData,
  resolveAttribute,
  decryptVaultData,
  generateShareToken,
} from '@/services/vaultService.js';

const router = express.Router();

/** Middleware: check vault_enabled on developer */
async function requireVaultEnabled(req: Request, res: Response, next: NextFunction) {
  const developerId = (req as any).developer.id;
  const { data: dev } = await supabase
    .from('developers')
    .select('vault_enabled')
    .eq('id', developerId)
    .single();

  if (!dev?.vault_enabled) {
    return res.status(403).json({
      error: 'Identity Vault is not enabled for your account. Enable it in Settings.',
    });
  }
  next();
}

/**
 * POST /api/v2/vault/store
 * Store a verified identity in the vault. Returns an opaque vault token.
 */
router.post('/store',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { verification_id } = req.body || {};

    if (!verification_id || typeof verification_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(verification_id)) {
      return res.status(400).json({ error: 'verification_id must be a valid UUID' });
    }

    // Verify ownership
    const { data: vr } = await supabase
      .from('verification_requests')
      .select('id, final_result')
      .eq('id', verification_id)
      .eq('developer_id', developerId)
      .maybeSingle();

    if (!vr) return res.status(404).json({ error: 'Verification not found' });
    if (vr.final_result !== 'verified') {
      return res.status(400).json({ error: 'Only verified identities can be stored in the vault' });
    }

    // Check for existing vault entry
    const { data: existing } = await supabase
      .from('identity_vault')
      .select('vault_token')
      .eq('verification_id', verification_id)
      .eq('developer_id', developerId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return res.json({
        success: true,
        already_stored: true,
        vault_token: existing.vault_token,
        message: 'Identity is already in the vault.',
      });
    }

    // Extract identity data from session state
    const state = await loadSessionState(verification_id);
    if (!state) return res.status(404).json({ error: 'Verification session data not found' });

    const identityData = extractIdentityData(state);
    if (!identityData) {
      return res.status(400).json({ error: 'Verification is missing required identity data (OCR)' });
    }

    const result = await storeVaultEntry(developerId, verification_id, identityData);

    res.status(201).json({
      success: true,
      vault_token: result.vault_token,
    });
  })
);

/**
 * GET /api/v2/vault/share/:shareToken
 * Public endpoint — retrieve shared attributes. No API key needed.
 * NOTE: This must be registered BEFORE the /:token route to avoid conflict.
 */
router.get('/share/:shareToken',
  catchAsync(async (req: Request, res: Response) => {
    const { shareToken } = req.params;

    const { data: link } = await supabase
      .from('vault_share_links')
      .select('id, vault_id, allowed_attributes, expires_at, access_count, max_accesses')
      .eq('share_token', shareToken)
      .single();

    if (!link) return res.status(404).json({ error: 'Share link not found' });

    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    if (link.max_accesses && link.access_count >= link.max_accesses) {
      return res.status(410).json({ error: 'Share link access limit reached' });
    }

    // Atomically increment access count and re-check limit
    // This prevents race conditions where concurrent requests bypass max_accesses
    const { data: updated } = await supabase
      .from('vault_share_links')
      .update({ access_count: link.access_count + 1 })
      .eq('id', link.id)
      .lt('access_count', link.max_accesses ?? 2147483647)
      .select('access_count');

    if (!updated || updated.length === 0) {
      return res.status(410).json({ error: 'Share link access limit reached' });
    }

    // Get vault entry
    const { data: vault } = await supabase
      .from('identity_vault')
      .select('encrypted_data, status, expires_at')
      .eq('id', link.vault_id)
      .single();

    if (!vault || vault.status !== 'active') {
      return res.status(404).json({ error: 'Vault entry no longer available' });
    }

    // Check vault-level expiry (lazy status update may not have run yet)
    if (vault.expires_at && new Date(vault.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Vault entry no longer available' });
    }

    const fullData = decryptVaultData(vault.encrypted_data);

    // Only return allowed attributes
    const shared: Record<string, unknown> = {};
    for (const attr of link.allowed_attributes) {
      const resolved = resolveAttribute(fullData, attr);
      if (resolved) shared[attr] = resolved.value;
    }

    res.json({
      success: true,
      attributes: shared,
      expires_at: link.expires_at,
    });
  })
);

/**
 * GET /api/v2/vault/:token
 * Retrieve full identity data from the vault.
 */
router.get('/:token',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { token } = req.params;

    if (!token.startsWith('ivt_')) {
      return res.status(400).json({ error: 'Invalid vault token format' });
    }

    const entry = await retrieveVaultEntry(token, developerId);

    res.json({
      success: true,
      vault_token: token,
      status: entry.status,
      data: entry.data,
      created_at: entry.created_at,
      expires_at: entry.expires_at,
    });
  })
);

/**
 * GET /api/v2/vault/:token/attributes/:attr
 * Retrieve a single attribute assertion from the vault.
 */
router.get('/:token/attributes/:attr',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { token, attr } = req.params;

    if (!token.startsWith('ivt_')) {
      return res.status(400).json({ error: 'Invalid vault token format' });
    }

    const entry = await retrieveVaultEntry(token, developerId);
    const resolved = resolveAttribute(entry.data, attr);

    if (!resolved) {
      return res.status(404).json({ error: `Attribute '${attr}' not available` });
    }

    res.json({
      success: true,
      attribute: attr,
      value: resolved.value,
    });
  })
);

/**
 * DELETE /api/v2/vault/:token
 * GDPR hard delete — permanently removes the vault entry.
 */
router.delete('/:token',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { token } = req.params;

    if (!token.startsWith('ivt_')) {
      return res.status(400).json({ error: 'Invalid vault token format' });
    }

    try {
      await deleteVaultEntry(token, developerId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Vault entry not found') {
        return res.status(404).json({ error: 'Vault entry not found' });
      }
      throw err;
    }

    res.json({ success: true, message: 'Vault entry permanently deleted' });
  })
);

/**
 * GET /api/v2/vault
 * List vault tokens (paginated). No PII in the response.
 */
router.get('/',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const { data: entries, error } = await supabase
      .from('identity_vault')
      .select('vault_token, verification_id, status, access_count, last_accessed_at, expires_at, created_at')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to list vault entries: ${error.message}`);

    const { count } = await supabase
      .from('identity_vault')
      .select('id', { count: 'exact', head: true })
      .eq('developer_id', developerId);

    res.json({
      success: true,
      entries: entries || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  })
);

/**
 * POST /api/v2/vault/:token/share
 * Generate a time-limited, scope-limited share link.
 */
router.post('/:token/share',
  authenticateAPIKey as any,
  requireVaultEnabled as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { token } = req.params;
    const { attributes, expires_in, recipient_label } = req.body || {};

    if (!token.startsWith('ivt_')) {
      return res.status(400).json({ error: 'Invalid vault token format' });
    }

    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
      return res.status(400).json({ error: 'attributes array is required' });
    }

    const expiresInSec = typeof expires_in === 'number' ? expires_in : 86400; // default 24h
    if (expiresInSec < 60 || expiresInSec > 604800) {
      return res.status(400).json({ error: 'expires_in must be between 60 and 604800 seconds (1 min to 7 days)' });
    }

    // Verify vault entry exists and belongs to developer
    const { data: vault } = await supabase
      .from('identity_vault')
      .select('id, status')
      .eq('vault_token', token)
      .eq('developer_id', developerId)
      .single();

    if (!vault) return res.status(404).json({ error: 'Vault entry not found' });
    if (vault.status !== 'active') return res.status(400).json({ error: 'Vault entry is not active' });

    const shareToken = generateShareToken();
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);

    const { error } = await supabase
      .from('vault_share_links')
      .insert({
        vault_id: vault.id,
        developer_id: developerId,
        share_token: shareToken,
        allowed_attributes: attributes,
        recipient_label: recipient_label || null,
        expires_at: expiresAt.toISOString(),
      });

    if (error) throw new Error(`Failed to create share link: ${error.message}`);

    const baseUrl = process.env.API_BASE_URL || 'https://api.idswyft.app';

    res.status(201).json({
      success: true,
      share_url: `${baseUrl}/api/v2/vault/share/${shareToken}`,
      share_token: shareToken,
      expires_at: expiresAt.toISOString(),
      allowed_attributes: attributes,
    });
  })
);

export default router;
