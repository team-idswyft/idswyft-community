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

export default router;
