import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { basicRateLimit } from '@/middleware/rateLimit.js';
import { hashHandoffToken } from '@/middleware/auth.js';
import { resolvePublicAssetUrl } from '@/services/storage.js';

const router = express.Router();

// GET /api/v2/verify/page-config?api_key=ik_...
// Public endpoint — returns developer branding for the hosted verification page.
// Uses HMAC-SHA256 key hashing (same as authenticateAPIKey) to resolve the developer.
router.get('/page-config',
  basicRateLimit,
  catchAsync(async (req: Request, res: Response) => {
    const apiKey = req.query.api_key as string | undefined;

    if (!apiKey) {
      return res.status(400).json({ error: 'api_key query parameter is required' });
    }

    // Hash the key to look it up
    const keyHash = crypto
      .createHmac('sha256', config.apiKeySecret)
      .update(apiKey)
      .digest('hex');

    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('developer_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (!keyRecord) {
      // Return empty branding instead of 404 to prevent API key enumeration
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({
        branding: { logo_url: null, accent_color: null, company_name: null },
      });
    }

    const { data: developer, error } = await supabase
      .from('developers')
      .select('branding_logo_url, branding_accent_color, branding_company_name, company, page_builder_config')
      .eq('id', keyRecord.developer_id)
      .single();

    if (error) {
      // Log but don't expose internal errors — return empty branding
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json({
        branding: { logo_url: null, accent_color: null, company_name: null },
      });
    }

    // Fallback company_name to the developer's profile company field
    const companyName = developer?.branding_company_name || developer?.company || null;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      branding: {
        logo_url: resolvePublicAssetUrl(developer?.branding_logo_url),
        accent_color: developer?.branding_accent_color || null,
        company_name: companyName,
      },
      page_builder_config: (developer as any)?.page_builder_config || null,
    });
  })
);

// GET /api/v2/verify/page-config/slug/:slug
// Public endpoint — resolve a custom slug to branding + page builder config.
router.get('/page-config/slug/:slug',
  basicRateLimit,
  catchAsync(async (req: Request, res: Response) => {
    const { slug } = req.params;

    const { data: developer } = await supabase
      .from('developers')
      .select('branding_logo_url, branding_accent_color, branding_company_name, company, page_builder_config')
      .eq('verification_slug', slug)
      .maybeSingle();

    res.setHeader('Cache-Control', 'public, max-age=300');

    if (!developer) {
      return res.json({
        branding: { logo_url: null, accent_color: null, company_name: null },
        page_builder_config: null,
      });
    }

    const companyName = developer.branding_company_name || developer.company || null;
    res.json({
      branding: {
        logo_url: resolvePublicAssetUrl(developer.branding_logo_url),
        accent_color: developer.branding_accent_color || null,
        company_name: companyName,
      },
      page_builder_config: (developer as any).page_builder_config || null,
    });
  })
);

// GET /api/v2/verify/session-info
// Public endpoint — returns session metadata + branding for a session token.
// Accepts X-Session-Token header.
router.get('/session-info',
  basicRateLimit,
  catchAsync(async (req: Request, res: Response) => {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required. Include X-Session-Token header.' });
    }

    // Validate format
    if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
      return res.status(400).json({ error: 'Invalid session token format' });
    }

    const tokenHash = hashHandoffToken(sessionToken);

    // Look up verification request
    const { data: verification, error: verError } = await supabase
      .from('verification_requests')
      .select('id, user_id, status, developer_id, verification_mode, age_threshold, session_token_expires_at')
      .eq('session_token_hash', tokenHash)
      .single();

    if (verError || !verification) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check expiry
    if (!verification.session_token_expires_at || new Date(verification.session_token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Session token has expired' });
    }

    // Fetch developer branding
    const { data: developer } = await supabase
      .from('developers')
      .select('branding_logo_url, branding_accent_color, branding_company_name, company, page_builder_config')
      .eq('id', verification.developer_id)
      .single();

    const companyName = developer?.branding_company_name || developer?.company || null;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      verification_id: verification.id,
      user_id: verification.user_id,
      status: verification.status,
      verification_mode: verification.verification_mode || 'full',
      ...(verification.age_threshold != null && { age_threshold: verification.age_threshold }),
      branding: {
        logo_url: resolvePublicAssetUrl(developer?.branding_logo_url),
        accent_color: developer?.branding_accent_color || null,
        company_name: companyName,
      },
      page_builder_config: (developer as any)?.page_builder_config || null,
    });
  })
);

export default router;
