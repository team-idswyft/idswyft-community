import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { supabase } from '@/config/database.js';
import { authenticateDeveloperJWT, authenticateDeveloperJWTOrServiceKey } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { WEBHOOK_EVENT_NAMES } from '@/constants/webhookEvents.js';
import { WebhookService, createWebhookSignature } from '@/services/webhook.js';
import axios from 'axios';
import { validateWebhookUrl, getSafeHttpAgent, getSafeHttpsAgent, SsrfError } from '@/utils/validateUrl.js';

const webhookService = new WebhookService();

const router = express.Router();

// Rate limiting for API key operations
const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 API key operations per minute (increased for development)
  message: {
    error: 'Too many API key operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Resolve the ownership scope for a webhook-management request.
 *
 * The flexible auth (authenticateDeveloperJWTOrServiceKey) admits two principals:
 *   - Developer portal JWT → scope by developer_id only (apiKeyId = null). This
 *     preserves the original portal behaviour: a developer sees every webhook on
 *     their account regardless of which key created it.
 *   - Service API key (isk_*) → scope by developer_id AND api_key_id. Service
 *     keys share one shadow developer row per product, so developer_id alone is
 *     NOT a tenant boundary; api_key_id is the only thing isolating one key's
 *     webhooks from another's. Every read/write below MUST apply this filter.
 */
function ownerScope(req: Request): { developerId: string; apiKeyId: string | null } {
  const developer = req.developer;
  if (!developer) {
    throw new AuthenticationError('Developer authentication required');
  }
  if (req.apiKey?.is_service) {
    return { developerId: developer.id, apiKeyId: req.apiKey.id };
  }
  return { developerId: developer.id, apiKeyId: null };
}

// List webhooks for the calling principal (developer portal JWT or isk_* service key)
router.get('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWTOrServiceKey,
  catchAsync(async (req: Request, res: Response) => {
    const { developerId, apiKeyId } = ownerScope(req);

    let query = supabase
      .from('webhooks')
      .select('id, url, is_sandbox, is_active, created_at, events, secret_key, api_key_id, api_key:api_keys!api_key_id(key_prefix, name)')
      .eq('developer_id', developerId);

    // Service keys only ever see their OWN webhooks (see ownerScope).
    if (apiKeyId) {
      query = query.eq('api_key_id', apiKeyId);
    }

    const { data: webhooks, error } = await query
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list webhooks:', error);
      throw new Error('Failed to list webhooks');
    }

    // Mask secret keys and flatten api_key join
    const masked = (webhooks || []).map((w: any) => ({
      ...w,
      secret_key: w.secret_key
        ? `${w.secret_key.slice(0, 6)}${'*'.repeat(8)}${w.secret_key.slice(-4)}`
        : null,
      api_key_preview: w.api_key ? `${w.api_key.key_prefix}...` : null,
      api_key_name: w.api_key?.name ?? null,
      api_key: undefined,
    }));

    res.json({ webhooks: masked });
  })
);

// Create webhook for the calling principal (developer portal JWT or isk_* service key)
router.post('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWTOrServiceKey,
  [
    body('url')
      .isURL({ protocols: ['https'] })
      .withMessage('Valid HTTPS webhook URL is required'),
    body('is_sandbox')
      .optional()
      .isBoolean()
      .withMessage('is_sandbox must be a boolean'),
    body('events')
      .optional()
      .isArray()
      .withMessage('events must be an array'),
    body('secret')
      .optional()
      .isString()
      .withMessage('secret must be a string'),
    body('api_key_id')
      .optional({ values: 'null' })
      .isUUID()
      .withMessage('api_key_id must be a valid UUID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const isServiceKey = !!req.apiKey?.is_service;
    const { url, is_sandbox = false, events, secret, api_key_id } = req.body;

    // Resolve the effective scope of the webhook being created.
    //   - is_sandbox: service keys force production (they have no sandbox mode;
    //     see checkSandboxMode). A body value is ignored for them.
    //   - api_key_id: for a service key this is HARD-SET to the calling key's id
    //     and any body value is ignored. This is security-critical: service keys
    //     share a shadow developer, so honouring a body api_key_id would let key
    //     K1 register a webhook scoped to key K2 and exfiltrate K2's verification
    //     PII. The portal JWT path keeps the original behaviour (body-supplied,
    //     validated below).
    const effectiveSandbox = isServiceKey ? false : is_sandbox;
    const scopedApiKeyId: string | null = isServiceKey
      ? req.apiKey!.id
      : (api_key_id || null);

    // SSRF protection: block private/reserved network URLs. Awaits DNS
    // resolution so DNS-pinning bypasses (`evil.example A 127.0.0.1`) are
    // caught here, not just at delivery time.
    try {
      await validateWebhookUrl(url);
    } catch (err: any) {
      throw new ValidationError(err.message, 'url', url);
    }

    // For the JWT path, a body-supplied api_key_id must belong to this developer.
    // (Skipped for service keys — scopedApiKeyId is the authenticated key itself.)
    if (!isServiceKey && scopedApiKeyId) {
      const { data: ownedKey, error: keyError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', scopedApiKeyId)
        .eq('developer_id', developer.id)
        .eq('is_active', true)
        .single();

      if (keyError || !ownedKey) {
        throw new ValidationError('API key not found or does not belong to this developer', 'api_key_id', scopedApiKeyId);
      }
    }

    // Validate events are from the allowed set
    if (events && events.length > 0) {
      const invalid = events.filter((e: string) => !WEBHOOK_EVENT_NAMES.includes(e));
      if (invalid.length > 0) {
        throw new ValidationError('Invalid webhook events', 'events', invalid);
      }
    }

    // Check for duplicate: same URL + sandbox mode + API key scope
    let dupQuery = supabase
      .from('webhooks')
      .select('id')
      .eq('developer_id', developer.id)
      .eq('url', url)
      .eq('is_sandbox', effectiveSandbox);

    if (scopedApiKeyId) {
      dupQuery = dupQuery.eq('api_key_id', scopedApiKeyId);
    } else {
      dupQuery = dupQuery.is('api_key_id', null);
    }

    const { data: existing, error: existingError } = await dupQuery.single();

    if (existingError && existingError.code !== 'PGRST116') {
      logger.error('Failed to check existing webhook:', existingError);
      throw new Error('Failed to validate webhook');
    }

    if (existing) {
      throw new ValidationError('Webhook already exists for this URL and scope', 'url', url);
    }

    // Auto-generate signing secret if not provided
    const secretKey = secret || `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .insert({
        developer_id: developer.id,
        url,
        is_sandbox: effectiveSandbox,
        events: events && events.length > 0 ? events : WEBHOOK_EVENT_NAMES,
        secret_key: secretKey,
        api_key_id: scopedApiKeyId,
      })
      .select('id, url, is_sandbox, is_active, created_at, events, secret_key, api_key_id')
      .single();

    if (error || !webhook) {
      logger.error('Failed to create webhook:', error);
      throw new Error('Failed to create webhook');
    }

    res.status(201).json({
      webhook: {
        ...webhook,
        secret_key: secretKey, // Return full secret on creation only
      },
      message: 'Webhook created successfully. Store your signing secret securely.'
    });
  })
);

// Reveal full webhook signing secret (developer portal JWT or isk_* service key)
router.get('/webhooks/:webhookId/secret',
  apiKeyRateLimit,
  authenticateDeveloperJWTOrServiceKey,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { developerId, apiKeyId } = ownerScope(req);

    const { webhookId } = req.params;

    let query = supabase
      .from('webhooks')
      .select('id, secret_key')
      .eq('id', webhookId)
      .eq('developer_id', developerId);

    // A service key may only read the secret of its OWN webhook (see ownerScope).
    if (apiKeyId) {
      query = query.eq('api_key_id', apiKeyId);
    }

    const { data: webhook, error } = await query.single();

    if (error || !webhook) {
      throw new NotFoundError('Webhook');
    }

    logger.info('Webhook secret revealed', {
      developerId,
      webhookId,
      viaServiceKey: !!apiKeyId,
    });

    res.json({ secret_key: webhook.secret_key });
  })
);

// List recent webhook deliveries for a specific webhook
router.get('/webhooks/:webhookId/deliveries',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    // Verify webhook belongs to this developer
    const { data: webhook, error: whError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (whError || !webhook) {
      throw new NotFoundError('Webhook');
    }

    const { deliveries, total } = await webhookService.getWebhookDeliveries(webhookId, 1, 25);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d.id,
        event: (d.payload as any)?.event ?? null,
        status: d.status,
        response_status: d.response_status,
        attempts: d.attempts,
        created_at: d.created_at,
        delivered_at: d.delivered_at,
        payload: d.payload ?? null,
        response_body: d.response_body ?? null,
      })),
      total,
    });
  })
);

// Send a test webhook delivery
router.post('/webhooks/:webhookId/test',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId } = req.params;

    const { data: webhook, error: whError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (whError || !webhook) {
      throw new NotFoundError('Webhook');
    }

    const testPayload = {
      user_id: 'test_user_000',
      verification_id: 'test_000',
      status: 'verified' as const,
      timestamp: new Date().toISOString(),
      data: {},
    };

    // Fire directly — no DB record, avoids FK constraint on webhook_deliveries
    try {
      const body = JSON.stringify(testPayload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Idswyft-Webhooks/1.0',
        'X-Idswyft-Test': 'true',
      };

      const signingSecret = webhook.secret_key || webhook.secret_token;
      if (signingSecret) {
        headers['X-Idswyft-Signature'] = createWebhookSignature(body, signingSecret);
      }

      // Re-validate at test time (closes the DNS-rebinding window since the
      // webhook was registered). SsrfError is a developer-visible reason;
      // anything else gets a generic message so internal IPs/ports
      // surfaced by `err.message` don't become a port-scan oracle.
      // Done BEFORE the abort timer is set up — no timer to clear if this
      // short-circuits.
      try {
        await validateWebhookUrl(webhook.url);
      } catch (validateErr: any) {
        return res.json({
          success: false,
          status_code: null,
          error: validateErr instanceof SsrfError
            ? `Refused to send: ${validateErr.message}`
            : 'Webhook URL validation failed',
        });
      }

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 8000);

      const response = await axios.post(webhook.url, testPayload, {
        headers,
        timeout: 10000,
        signal: controller.signal,
        maxRedirects: 0,
        httpAgent: getSafeHttpAgent(),
        httpsAgent: getSafeHttpsAgent(),
        validateStatus: () => true,
      });

      clearTimeout(abortTimer);

      res.json({
        success: response.status < 500,
        status_code: response.status,
      });
    } catch (err: any) {
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED'
        || err.message?.includes('timeout') || err.message?.includes('aborted');
      // Log url+code internally but DON'T echo err.message — it contains
      // ECONNREFUSED <internal-ip>:<port> on failures, which turns this
      // endpoint into a developer-accessible internal port scanner.
      logger.error('Webhook test failed:', { url: webhook.url, code: err.code });
      res.json({
        success: false,
        status_code: null,
        error: isTimeout
          ? 'Connection timed out — verify the webhook URL is reachable'
          : 'Delivery failed — verify the webhook URL is reachable',
      });
    }
  })
);

// Resend a failed/pending webhook delivery with the original payload
router.post('/webhooks/:webhookId/deliveries/:deliveryId/resend',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    param('webhookId').isUUID().withMessage('Invalid webhook ID format'),
    param('deliveryId').isUUID().withMessage('Invalid delivery ID format'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { webhookId, deliveryId } = req.params;

    // Verify webhook belongs to this developer
    const { data: webhook, error: whError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (whError || !webhook) {
      throw new NotFoundError('Webhook');
    }

    // Load the original delivery
    const { data: delivery, error: dlError } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .eq('webhook_id', webhookId)
      .single();

    if (dlError || !delivery) {
      throw new NotFoundError('Delivery');
    }

    // Create a new delivery with the original payload (preserves audit trail)
    const webhookService = new WebhookService();
    const newDelivery = await webhookService.sendWebhook(
      webhook,
      delivery.verification_request_id,
      delivery.payload,
    );

    logger.info('Webhook delivery resent', {
      developerId: developer.id,
      webhookId,
      originalDeliveryId: deliveryId,
      newDeliveryId: newDelivery.id,
    });

    res.json({
      success: true,
      delivery: {
        id: newDelivery.id,
        status: newDelivery.status,
        created_at: newDelivery.created_at,
      },
    });
  })
);

// Delete webhook for the calling principal (developer portal JWT or isk_* service key)
router.delete('/webhooks/:webhookId',
  apiKeyRateLimit,
  authenticateDeveloperJWTOrServiceKey,
  [
    param('webhookId')
      .isUUID()
      .withMessage('Invalid webhook ID format')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { developerId, apiKeyId } = ownerScope(req);

    const { webhookId } = req.params;

    // A service key may only delete its OWN webhook (see ownerScope). Apply the
    // api_key_id filter to BOTH the existence check and the delete so the scope
    // can never widen between the two queries.
    let checkQuery = supabase
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('developer_id', developerId);
    if (apiKeyId) {
      checkQuery = checkQuery.eq('api_key_id', apiKeyId);
    }

    const { data: existingWebhook, error: checkError } = await checkQuery.single();

    if (checkError || !existingWebhook) {
      throw new NotFoundError('Webhook');
    }

    let deleteQuery = supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('developer_id', developerId);
    if (apiKeyId) {
      deleteQuery = deleteQuery.eq('api_key_id', apiKeyId);
    }

    const { error } = await deleteQuery;

    if (error) {
      logger.error('Failed to delete webhook:', error);
      throw new Error('Failed to delete webhook');
    }

    res.json({ message: 'Webhook deleted successfully' });
  })
);

export default router;
