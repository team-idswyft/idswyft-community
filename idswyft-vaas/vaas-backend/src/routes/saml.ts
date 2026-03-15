/**
 * SAML SSO Routes
 *
 * Handles SAML 2.0 authentication flow:
 * - SP-initiated login (redirect to IdP)
 * - Assertion consumer service (process IdP response)
 * - SP metadata XML (for IdP configuration)
 * - SSO config CRUD (for organization admins)
 */

import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { vaasSupabase } from '../config/database.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateAuthRequest,
  processCallback,
  generateSPMetadata,
  getOrganizationSAMLConfig,
  getOrganizationSAMLConfigById,
  upsertSSOConfig,
  deleteSSOConfig,
} from '../services/samlService.js';

const router = express.Router();

// ─── Public SAML Endpoints ───────────────────────────────

/**
 * GET /api/auth/saml/login/:org_slug
 * SP-initiated SSO: redirect to the organization's IdP.
 */
router.get('/login/:org_slug', async (req: Request, res: Response) => {
  try {
    const { org_slug } = req.params;

    const result = await generateAuthRequest(org_slug);
    if (!result) {
      return res.status(404).json({
        error: 'SSO not configured',
        message: 'This organization does not have SSO enabled',
      });
    }

    // org_slug is passed via SAML RelayState (echoed back by IdP in the ACS POST),
    // avoiding cookies which fail on cross-origin POST due to SameSite restrictions.
    res.redirect(result.redirectUrl);
  } catch (err: any) {
    console.error('SAML login error:', err);
    res.status(500).json({
      error: 'SSO login failed',
      message: 'Failed to initiate SSO login',
    });
  }
});

/**
 * POST /api/auth/saml/callback
 * Assertion Consumer Service (ACS): process IdP response.
 * JIT-provisions admin user on first SSO login.
 */
router.post('/callback', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  try {
    const samlResponse = req.body.SAMLResponse;
    const orgSlug = req.body.RelayState;

    if (!samlResponse) {
      return res.status(400).json({ error: 'Missing SAML response' });
    }

    if (!orgSlug) {
      return res.status(400).json({ error: 'Missing organization context' });
    }

    // Look up org config
    const orgConfig = await getOrganizationSAMLConfig(orgSlug);
    if (!orgConfig) {
      return res.status(400).json({ error: 'SSO configuration not found' });
    }

    // Validate SAML assertion
    const profile = await processCallback(samlResponse, orgConfig.organization_id);
    if (!profile) {
      return res.status(401).json({
        error: 'SSO authentication failed',
        message: 'Invalid SAML assertion or missing email attribute',
      });
    }

    // Look up or JIT-provision admin user
    let admin = await findAdminByEmail(orgConfig.organization_id, profile.email);

    if (!admin) {
      // JIT provisioning — create admin with 'viewer' role on first SSO login
      admin = await jitProvisionAdmin(
        orgConfig.organization_id,
        profile.email,
        profile.first_name,
        profile.last_name,
      );
    }

    if (!admin || admin.status !== 'active') {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Contact your organization admin.',
      });
    }

    // Update last login
    await vaasSupabase
      .from('vaas_admins')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (admin.login_count || 0) + 1,
      })
      .eq('id', admin.id);

    // Issue JWT (same format as password-based login)
    const token = jwt.sign(
      {
        admin_id: admin.id,
        organization_id: orgConfig.organization_id,
        role: admin.role,
      },
      config.jwtSecret,
      { expiresIn: '24h' },
    );

    // Redirect to frontend with token in URL fragment (#) instead of query
    // parameter (?). Fragments are never sent to the server in subsequent
    // requests and are not logged in access logs or Referer headers.
    const frontendUrl = config.frontendUrl || 'https://app.idswyft.app';
    res.redirect(`${frontendUrl}/sso/callback#token=${encodeURIComponent(token)}`);
  } catch (err: any) {
    console.error('SAML callback error:', err);
    res.status(500).json({
      error: 'SSO callback failed',
      message: 'Failed to process SSO response',
    });
  }
});

/**
 * GET /api/auth/saml/metadata/:org_id
 * SP metadata XML for IdP configuration.
 */
router.get('/metadata/:org_id', (req: Request, res: Response) => {
  const xml = generateSPMetadata(req.params.org_id);
  res.set('Content-Type', 'application/xml');
  res.send(xml);
});

// ─── Protected SSO Config CRUD ───────────────────────────

/**
 * GET /api/auth/saml/config
 * Get SSO configuration for the authenticated admin's organization.
 */
router.get('/config', requireAuth as any, async (req: Request, res: Response) => {
  const adminReq = req as AuthenticatedRequest;
  const orgId = adminReq.admin!.organization_id;

  const ssoConfig = await getOrganizationSAMLConfigById(orgId);

  res.json({
    sso_configured: !!ssoConfig,
    config: ssoConfig ? {
      idp_entity_id: ssoConfig.idp_entity_id,
      idp_sso_url: ssoConfig.idp_sso_url,
      is_enabled: ssoConfig.is_enabled,
      attribute_mapping: ssoConfig.attribute_mapping,
      created_at: ssoConfig.created_at,
      // Don't expose the full certificate
      has_certificate: !!ssoConfig.idp_certificate,
    } : null,
  });
});

/**
 * PUT /api/auth/saml/config
 * Create or update SSO configuration.
 * Requires owner or admin role.
 */
router.put('/config', requireAuth as any, async (req: Request, res: Response) => {
  const adminReq = req as AuthenticatedRequest;

  if (!['owner', 'admin'].includes(adminReq.admin!.role)) {
    return res.status(403).json({ error: 'Only owners and admins can configure SSO' });
  }

  const { idp_entity_id, idp_sso_url, idp_certificate, attribute_mapping, is_enabled } = req.body;

  if (!idp_entity_id || !idp_sso_url || !idp_certificate) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'idp_entity_id, idp_sso_url, and idp_certificate are required',
    });
  }

  const result = await upsertSSOConfig(adminReq.admin!.organization_id, {
    idp_entity_id,
    idp_sso_url,
    idp_certificate,
    attribute_mapping,
    is_enabled,
  });

  if (!result) {
    return res.status(500).json({ error: 'Failed to save SSO configuration' });
  }

  res.json({
    success: true,
    message: 'SSO configuration saved',
    config: {
      idp_entity_id: result.idp_entity_id,
      idp_sso_url: result.idp_sso_url,
      is_enabled: result.is_enabled,
    },
  });
});

/**
 * DELETE /api/auth/saml/config
 * Remove SSO configuration for the organization.
 */
router.delete('/config', requireAuth as any, async (req: Request, res: Response) => {
  const adminReq = req as AuthenticatedRequest;

  if (adminReq.admin!.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can delete SSO configuration' });
  }

  const deleted = await deleteSSOConfig(adminReq.admin!.organization_id);

  if (!deleted) {
    return res.status(500).json({ error: 'Failed to delete SSO configuration' });
  }

  res.json({ success: true, message: 'SSO configuration deleted' });
});

// ─── Helpers ─────────────────────────────────────────────

async function findAdminByEmail(orgId: string, email: string) {
  const { data, error } = await vaasSupabase
    .from('vaas_admins')
    .select('*')
    .eq('organization_id', orgId)
    .eq('email', email.toLowerCase())
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * JIT (Just-In-Time) provision a new admin on first SSO login.
 * Created with 'viewer' role — org admin can upgrade later.
 */
async function jitProvisionAdmin(
  orgId: string,
  email: string,
  firstName: string,
  lastName: string,
) {
  const { data, error } = await vaasSupabase
    .from('vaas_admins')
    .insert({
      organization_id: orgId,
      email: email.toLowerCase(),
      password_hash: '!SSO_USER!', // Sentinel — not a valid bcrypt hash, prevents password login
      first_name: firstName || 'SSO',
      last_name: lastName || 'User',
      role: 'viewer',
      status: 'active',
      email_verified: true,
      permissions: {
        view_users: true,
        view_verifications: true,
        view_analytics: true,
      },
    })
    .select()
    .single();

  if (error || !data) return null;
  return data;
}

export default router;
