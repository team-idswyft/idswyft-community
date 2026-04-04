import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { supabase } from '@/config/database.js';
import { authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { config } from '@/config/index.js';
import { encryptSecret, decryptSecret, maskApiKey } from '@idswyft/shared';

const router = express.Router();

// ─── LLM Provider Settings ──────────────────────────────────

const VALID_LLM_PROVIDERS = ['openai', 'anthropic', 'custom'];

router.get('/settings/llm',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;

    const { data } = await supabase
      .from('developers')
      .select('llm_provider, llm_api_key_encrypted, llm_endpoint_url')
      .eq('id', developerId)
      .single();

    if (!data?.llm_provider) {
      return res.json({ configured: false, provider: null, api_key_preview: null, endpoint_url: null });
    }

    let apiKeyPreview: string | null = null;
    if (data.llm_api_key_encrypted) {
      try {
        const decrypted = decryptSecret(data.llm_api_key_encrypted, config.encryptionKey);
        apiKeyPreview = maskApiKey(decrypted);
      } catch {
        apiKeyPreview = '****';
      }
    }

    res.json({
      configured: true,
      provider: data.llm_provider,
      api_key_preview: apiKeyPreview,
      endpoint_url: data.llm_endpoint_url || null,
    });
  })
);

router.put('/settings/llm',
  authenticateDeveloperJWT,
  [
    body('provider').isIn([...VALID_LLM_PROVIDERS, null, '']).withMessage(`Provider must be one of: ${VALID_LLM_PROVIDERS.join(', ')}`),
    body('api_key').optional({ nullable: true }).isString().isLength({ min: 10 }).withMessage('API key must be at least 10 characters'),
    body('endpoint_url').optional({ nullable: true }).isURL().withMessage('Endpoint URL must be a valid URL'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { provider, api_key, endpoint_url } = req.body;

    // Allow clearing LLM config by sending provider: null or ''
    if (!provider) {
      await supabase
        .from('developers')
        .update({ llm_provider: null, llm_api_key_encrypted: null, llm_endpoint_url: null })
        .eq('id', developerId);

      return res.json({ success: true, message: 'LLM configuration removed' });
    }

    if (provider === 'custom' && !endpoint_url) {
      throw new ValidationError('Custom provider requires an endpoint URL', 'endpoint_url', null);
    }

    if (!api_key) {
      throw new ValidationError('API key is required when configuring a provider', 'api_key', null);
    }

    const encryptedKey = encryptSecret(api_key, config.encryptionKey);

    await supabase
      .from('developers')
      .update({
        llm_provider: provider,
        llm_api_key_encrypted: encryptedKey,
        llm_endpoint_url: provider === 'custom' ? endpoint_url : null,
      })
      .eq('id', developerId);

    res.json({
      success: true,
      message: `LLM provider set to ${provider}`,
      provider,
      api_key_preview: maskApiKey(api_key),
      endpoint_url: provider === 'custom' ? endpoint_url : null,
    });
  })
);

// ─── SMS Provider Settings ──────────────────────────────────

const VALID_SMS_PROVIDERS = ['twilio', 'vonage'];

router.get('/settings/sms',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;

    const { data } = await supabase
      .from('developers')
      .select('sms_provider, sms_api_key_encrypted, sms_api_secret_encrypted, sms_phone_number')
      .eq('id', developerId)
      .single();

    if (!data?.sms_provider) {
      return res.json({ configured: false, provider: null, api_key_preview: null, phone_number: null });
    }

    let apiKeyPreview: string | null = null;
    if (data.sms_api_key_encrypted) {
      try {
        const decrypted = decryptSecret(data.sms_api_key_encrypted, config.encryptionKey);
        apiKeyPreview = maskApiKey(decrypted);
      } catch {
        apiKeyPreview = '****';
      }
    }

    res.json({
      configured: true,
      provider: data.sms_provider,
      api_key_preview: apiKeyPreview,
      phone_number: data.sms_phone_number || null,
    });
  })
);

router.put('/settings/sms',
  authenticateDeveloperJWT,
  [
    body('provider').isIn([...VALID_SMS_PROVIDERS, null, '']).withMessage(`Provider must be one of: ${VALID_SMS_PROVIDERS.join(', ')}`),
    body('api_key').optional({ nullable: true }).isString().isLength({ min: 10 }).withMessage('API key / Account SID must be at least 10 characters'),
    body('api_secret').optional({ nullable: true }).isString().isLength({ min: 10 }).withMessage('Auth token / API secret must be at least 10 characters'),
    body('phone_number').optional({ nullable: true }).matches(/^\+[1-9]\d{6,14}$/).withMessage('Phone number must be in E.164 format (e.g. +15551234567)'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { provider, api_key, api_secret, phone_number } = req.body;

    // Allow clearing SMS config
    if (!provider) {
      await supabase
        .from('developers')
        .update({ sms_provider: null, sms_api_key_encrypted: null, sms_api_secret_encrypted: null, sms_phone_number: null })
        .eq('id', developerId);

      return res.json({ success: true, message: 'SMS configuration removed' });
    }

    if (!api_key || !api_secret || !phone_number) {
      throw new ValidationError('API key, API secret, and phone number are all required', 'provider', provider);
    }

    const encryptedKey = encryptSecret(api_key, config.encryptionKey);
    const encryptedSecret = encryptSecret(api_secret, config.encryptionKey);

    await supabase
      .from('developers')
      .update({
        sms_provider: provider,
        sms_api_key_encrypted: encryptedKey,
        sms_api_secret_encrypted: encryptedSecret,
        sms_phone_number: phone_number,
      })
      .eq('id', developerId);

    res.json({
      success: true,
      message: `SMS provider set to ${provider}`,
      provider,
      api_key_preview: maskApiKey(api_key),
      phone_number,
    });
  })
);

// ─── Page Branding Settings ────────────────────────────────────

router.get('/settings/branding',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;

    const { data } = await supabase
      .from('developers')
      .select('branding_logo_url, branding_accent_color, branding_company_name')
      .eq('id', developerId)
      .single();

    const hasAny = !!(data?.branding_logo_url || data?.branding_accent_color || data?.branding_company_name);

    res.json({
      configured: hasAny,
      logo_url: data?.branding_logo_url || null,
      accent_color: data?.branding_accent_color || null,
      company_name: data?.branding_company_name || null,
    });
  })
);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.put('/settings/branding',
  authenticateDeveloperJWT,
  [
    body('logo_url').optional({ nullable: true }).isURL({ protocols: ['https', 'http'] }).withMessage('Logo URL must be a valid HTTP(S) URL'),
    body('accent_color').optional({ nullable: true }).matches(HEX_COLOR_RE).withMessage('Accent color must be a 6-digit hex (e.g. #22d3ee)'),
    body('company_name').optional({ nullable: true }).isString().trim().isLength({ max: 100 }).withMessage('Company name must be at most 100 characters'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { logo_url, accent_color, company_name } = req.body;

    const { error } = await supabase
      .from('developers')
      .update({
        branding_logo_url: logo_url ?? null,
        branding_accent_color: accent_color ?? null,
        branding_company_name: company_name ?? null,
      })
      .eq('id', developerId);

    if (error) {
      return res.status(500).json({ error: 'Failed to save branding settings' });
    }

    res.json({
      success: true,
      logo_url: logo_url ?? null,
      accent_color: accent_color ?? null,
      company_name: company_name ?? null,
    });
  })
);

// ─── Page Builder Config ──────────────────────────────────────

const ALLOWED_PB_KEYS = new Set([
  'headerTitle', 'headerSubtitle', 'showPoweredBy',
  'theme', 'backgroundColor', 'cardBackgroundColor', 'textColor',
  'fontFamily', 'steps', 'completionTitle', 'completionMessage', 'showConfetti',
]);

function validatePageBuilderConfig(cfg: any): string | null {
  if (!cfg || typeof cfg !== 'object') return 'Config must be an object';
  for (const k of Object.keys(cfg)) {
    if (!ALLOWED_PB_KEYS.has(k)) return `Unknown config key: ${k}`;
  }
  if (cfg.headerTitle && (typeof cfg.headerTitle !== 'string' || cfg.headerTitle.length > 200))
    return 'headerTitle must be a string (max 200 chars)';
  if (cfg.headerSubtitle && (typeof cfg.headerSubtitle !== 'string' || cfg.headerSubtitle.length > 300))
    return 'headerSubtitle must be a string (max 300 chars)';
  if (cfg.theme && !['dark', 'light'].includes(cfg.theme))
    return 'theme must be "dark" or "light"';
  if (cfg.fontFamily && !['dm-sans', 'inter', 'system'].includes(cfg.fontFamily))
    return 'fontFamily must be "dm-sans", "inter", or "system"';
  for (const colorKey of ['backgroundColor', 'cardBackgroundColor', 'textColor']) {
    if (cfg[colorKey] && !HEX_COLOR_RE.test(cfg[colorKey]))
      return `${colorKey} must be a 6-digit hex color`;
  }
  if (cfg.completionTitle && (typeof cfg.completionTitle !== 'string' || cfg.completionTitle.length > 200))
    return 'completionTitle must be a string (max 200 chars)';
  if (cfg.completionMessage && (typeof cfg.completionMessage !== 'string' || cfg.completionMessage.length > 500))
    return 'completionMessage must be a string (max 500 chars)';
  return null;
}

router.get('/settings/page-builder',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { data } = await supabase
      .from('developers')
      .select('page_builder_config, verification_slug')
      .eq('id', developerId)
      .single();

    res.json({
      configured: !!data?.page_builder_config,
      config: data?.page_builder_config || null,
      slug: data?.verification_slug || null,
    });
  })
);

router.put('/settings/page-builder',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { config: pbConfig } = req.body;

    const err = validatePageBuilderConfig(pbConfig);
    if (err) return res.status(400).json({ error: err });

    const { error } = await supabase
      .from('developers')
      .update({ page_builder_config: pbConfig })
      .eq('id', developerId);

    if (error) return res.status(500).json({ error: 'Failed to save page builder config' });
    res.json({ success: true });
  })
);

router.put('/settings/page-builder/slug',
  authenticateDeveloperJWT,
  [
    body('slug').optional({ nullable: true }).isString().matches(/^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/)
      .withMessage('Slug must be 4-50 chars: lowercase letters, numbers, and hyphens'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { slug } = req.body;

    if (slug) {
      // Check uniqueness
      const { data: existing } = await supabase
        .from('developers')
        .select('id')
        .eq('verification_slug', slug)
        .neq('id', developerId)
        .maybeSingle();

      if (existing) return res.status(409).json({ error: 'Slug is already taken' });
    }

    const { error } = await supabase
      .from('developers')
      .update({ verification_slug: slug || null })
      .eq('id', developerId);

    if (error) return res.status(500).json({ error: 'Failed to save slug' });
    res.json({ success: true, slug: slug || null });
  })
);

// ─── Duplicate Detection Settings ────────────────────────────

const VALID_DEDUP_ACTIONS = ['block', 'review', 'allow'] as const;

router.get('/settings/duplicate-detection',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;

    const { data } = await supabase
      .from('developers')
      .select('duplicate_detection_enabled, duplicate_detection_action')
      .eq('id', developerId)
      .single();

    res.json({
      enabled: data?.duplicate_detection_enabled ?? false,
      action: data?.duplicate_detection_action ?? 'review',
    });
  })
);

router.put('/settings/duplicate-detection',
  authenticateDeveloperJWT,
  [
    body('enabled').isBoolean().withMessage('enabled must be a boolean'),
    body('action').isIn([...VALID_DEDUP_ACTIONS]).withMessage(`action must be one of: ${VALID_DEDUP_ACTIONS.join(', ')}`),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { enabled, action } = req.body;

    const { error } = await supabase
      .from('developers')
      .update({
        duplicate_detection_enabled: enabled,
        duplicate_detection_action: action,
      })
      .eq('id', developerId);

    if (error) {
      return res.status(500).json({ error: 'Failed to save duplicate detection settings' });
    }

    res.json({ success: true, enabled, action });
  })
);

export default router;
