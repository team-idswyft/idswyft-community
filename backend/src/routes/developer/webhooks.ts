import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { supabase } from '@/config/database.js';
import { authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { WEBHOOK_EVENT_NAMES } from '@/constants/webhookEvents.js';
import { WebhookService, createWebhookSignature } from '@/services/webhook.js';
import axios from 'axios';
import { validateWebhookUrl } from '@/utils/validateUrl.js';

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

// List webhooks for developer (JWT-authenticated developer portal)
router.get('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('id, url, is_sandbox, is_active, created_at, events, secret_key, api_key_id, api_key:api_keys!api_key_id(key_prefix, name)')
      .eq('developer_id', developer.id)
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

// Create webhook for developer (JWT-authenticated developer portal)
router.post('/webhooks',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
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

    const { url, is_sandbox = false, events, secret, api_key_id } = req.body;

    // SSRF protection: block private/reserved network URLs
    try {
      validateWebhookUrl(url);
    } catch (err: any) {
      throw new ValidationError(err.message, 'url', url);
    }

    // If api_key_id is provided, validate it belongs to this developer
    if (api_key_id) {
      const { data: ownedKey, error: keyError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', api_key_id)
        .eq('developer_id', developer.id)
        .eq('is_active', true)
        .single();

      if (keyError || !ownedKey) {
        throw new ValidationError('API key not found or does not belong to this developer', 'api_key_id', api_key_id);
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
      .eq('is_sandbox', is_sandbox);

    if (api_key_id) {
      dupQuery = dupQuery.eq('api_key_id', api_key_id);
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
        is_sandbox,
        events: events && events.length > 0 ? events : WEBHOOK_EVENT_NAMES,
        secret_key: secretKey,
        api_key_id: api_key_id || null,
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

// Reveal full webhook signing secret
router.get('/webhooks/:webhookId/secret',
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

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('id, secret_key')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (error || !webhook) {
      throw new NotFoundError('Webhook');
    }

    logger.info('Webhook secret revealed', {
      developerId: developer.id,
      webhookId,
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

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 8000);

      const response = await axios.post(webhook.url, testPayload, {
        headers,
        timeout: 10000,
        signal: controller.signal,
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
      logger.error('Webhook test failed:', { url: webhook.url, code: err.code, message: err.message });
      res.json({
        success: false,
        status_code: null,
        error: isTimeout
          ? 'Connection timed out — verify the webhook URL is reachable'
          : (err.message || 'Test delivery failed'),
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

// Delete webhook for developer (JWT-authenticated developer portal)
router.delete('/webhooks/:webhookId',
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

    const { data: existingWebhook, error: checkError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('developer_id', developer.id)
      .single();

    if (checkError || !existingWebhook) {
      throw new NotFoundError('Webhook');
    }

    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('developer_id', developer.id);

    if (error) {
      logger.error('Failed to delete webhook:', error);
      throw new Error('Failed to delete webhook');
    }

    res.json({ message: 'Webhook deleted successfully' });
  })
);

export default router;
