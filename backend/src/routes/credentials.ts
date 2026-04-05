import express, { Request, Response } from 'express';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import { issueIdentityCredential, revokeCredential, checkCredentialStatus } from '@/services/vcIssuer.js';
import { isVCConfigured } from '@/services/vcKeyManager.js';

const router = express.Router();

/**
 * GET /api/v2/verify/:id/credential
 * Issue (or re-fetch) a W3C Verifiable Credential for a completed verification.
 * Requires API key auth. Developer must have vc_enabled = true.
 */
router.get('/:id/credential',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const verificationId = req.params.id;
    const developerId = (req as any).developer.id;

    if (!isVCConfigured()) {
      return res.status(503).json({ error: 'Verifiable Credentials are not available on this instance' });
    }

    // Check developer has VC enabled
    const { data: dev } = await supabase
      .from('developers')
      .select('vc_enabled')
      .eq('id', developerId)
      .single();

    if (!dev?.vc_enabled) {
      return res.status(403).json({ error: 'Verifiable Credentials are not enabled for your account. Enable them in Settings → Integrations.' });
    }

    // Verify ownership
    const { data: vr } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('id', verificationId)
      .eq('developer_id', developerId)
      .maybeSingle();

    if (!vr) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    try {
      const credential = await issueIdentityCredential(verificationId, developerId);
      res.json({
        success: true,
        credential: credential.jwt,
        jti: credential.jti,
        expires_at: credential.expiresAt.toISOString(),
      });
    } catch (err: any) {
      // If already issued, return the existing JWT reference
      if (err.message?.includes('already been issued')) {
        const { data: existing } = await supabase
          .from('verifiable_credentials')
          .select('credential_jti, issued_at, expires_at')
          .eq('verification_request_id', verificationId)
          .eq('developer_id', developerId)
          .is('revoked_at', null)
          .maybeSingle();

        if (existing) {
          return res.json({
            success: true,
            already_issued: true,
            jti: existing.credential_jti,
            issued_at: existing.issued_at,
            expires_at: existing.expires_at,
            message: 'Credential was already issued. Use the JTI to check status. Re-issuance requires revoking the existing credential first.',
          });
        }
      }
      return res.status(400).json({ error: err.message });
    }
  })
);

/**
 * POST /api/v2/credentials/:jti/revoke
 * Revoke a credential by JTI. Requires API key auth.
 */
router.post('/credentials/:jti/revoke',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const { jti } = req.params;
    const developerId = (req as any).developer.id;
    const { reason } = req.body || {};

    try {
      await revokeCredential(jti, developerId, reason);
      res.json({ success: true, message: 'Credential revoked' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  })
);

/**
 * GET /api/v2/credentials/:jti/status
 * Public endpoint — check if a credential is active.
 * No authentication required (verifiers need to check status).
 */
router.get('/credentials/:jti/status',
  catchAsync(async (req: Request, res: Response) => {
    const { jti } = req.params;
    const status = await checkCredentialStatus(jti);
    res.json(status);
  })
);

export default router;
