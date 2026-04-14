import express, { Request, Response } from 'express';
import QRCode from 'qrcode';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import { issueIdentityCredential, revokeCredential, checkCredentialStatus } from '@/services/vcIssuer.js';
import { isVCConfigured } from '@/services/vcKeyManager.js';
import { emailService } from '@/services/emailService.js';
import { loadSessionState } from '@/verification/statusReader.js';

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
 * POST /api/v2/verify/:id/credential/send
 * Send a credential email with QR code to the specified address.
 * Issues the credential if not already issued; retrieves stored JWT if already issued.
 */
router.post('/:id/credential/send',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const verificationId = req.params.id;
    const developerId = (req as any).developer.id;
    const { email } = req.body || {};

    // Validate email
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

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

    // Issue or retrieve existing credential
    let jwt: string;
    let jti: string;
    let expiresAt: Date;

    // Check if credential already exists
    const { data: existing } = await supabase
      .from('verifiable_credentials')
      .select('credential_jti, credential_jwt, expires_at')
      .eq('verification_request_id', verificationId)
      .eq('developer_id', developerId)
      .is('revoked_at', null)
      .maybeSingle();

    if (existing?.credential_jwt) {
      jwt = existing.credential_jwt;
      jti = existing.credential_jti;
      expiresAt = new Date(existing.expires_at);
    } else {
      // Issue new credential
      const credential = await issueIdentityCredential(verificationId, developerId);
      jwt = credential.jwt;
      jti = credential.jti;
      expiresAt = credential.expiresAt;
    }

    // Load session state for recipient name
    const state = await loadSessionState(verificationId);
    const recipientName = state?.front_extraction?.ocr?.full_name || 'there';

    // Build verify URL and QR code — use FRONTEND_URL for self-hosted deployments
    const siteUrl = process.env.FRONTEND_URL || 'https://idswyft.app';
    const verifyUrl = `${siteUrl}/verify-credential?jwt=${jwt}`;
    const qrDataUri = await QRCode.toDataURL(verifyUrl, { width: 280, margin: 2 });

    // Send email
    const emailSent = await emailService.sendCredentialEmail(
      email,
      recipientName,
      verifyUrl,
      qrDataUri,
      expiresAt,
    );

    res.json({
      success: true,
      jti,
      expires_at: expiresAt.toISOString(),
      email_sent: emailSent,
    });
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
