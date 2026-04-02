import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { basicRateLimit } from '@/middleware/rateLimit.js';

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
      .select('branding_logo_url, branding_accent_color, branding_company_name, company')
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
        logo_url: developer?.branding_logo_url || null,
        accent_color: developer?.branding_accent_color || null,
        company_name: companyName,
      },
    });
  })
);

export default router;
