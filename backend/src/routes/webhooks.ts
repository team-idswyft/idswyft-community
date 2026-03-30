import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { WebhookService } from '@/services/webhook.js';
import { WEBHOOK_EVENT_NAMES } from '@/constants/webhookEvents.js';
import { logger } from '@/utils/logger.js';
import { WebhookPayload } from '@/types/index.js';
import { validateWebhookUrl } from '@/utils/validateUrl.js';

const router = express.Router();
const webhookService = new WebhookService();

// Register webhook URL
router.post('/register',
  authenticateAPIKey,
  [
    body('url')
      .isURL()
      .withMessage('Valid webhook URL is required'),
    body('is_sandbox')
      .optional()
      .isBoolean()
      .withMessage('is_sandbox must be a boolean'),
    body('secret_token')
      .optional()
      .isLength({ min: 10, max: 100 })
      .withMessage('Secret token must be between 10 and 100 characters')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { url, is_sandbox = false, secret_token } = req.body;
    const developerId = req.developer!.id;

    // SSRF protection: block private/reserved network URLs
    try {
      validateWebhookUrl(url);
    } catch (err: any) {
      throw new ValidationError(err.message, 'url', url);
    }

    // Check if webhook already exists for this developer and URL
    const existingWebhook = await webhookService.getWebhookByUrl(developerId, url, is_sandbox);
    if (existingWebhook) {
      throw new ValidationError('Webhook already exists for this URL', 'url', url);
    }
    
    // Create webhook
    const webhook = await webhookService.createWebhook({
      developer_id: developerId,
      url,
      is_sandbox,
      secret_token,
      events: WEBHOOK_EVENT_NAMES,
    });
    
    logger.info('Webhook registered', {
      developerId,
      webhookId: webhook.id,
      url,
      isSandbox: is_sandbox
    });
    
    res.status(201).json({
      webhook: {
        id: webhook.id,
        url: webhook.url,
        is_sandbox: webhook.is_sandbox,
        is_active: webhook.is_active,
        created_at: webhook.created_at
      },
      message: 'Webhook registered successfully'
    });
  })
);

// List webhooks for developer
router.get('/',
  authenticateAPIKey,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = req.developer!.id;
    const webhooks = await webhookService.getWebhooksByDeveloper(developerId);
    
    res.json({
      webhooks: webhooks.map(webhook => ({
        id: webhook.id,
        url: webhook.url,
        is_sandbox: webhook.is_sandbox,
        is_active: webhook.is_active,
        created_at: webhook.created_at
      }))
    });
  })
);

// Update webhook
router.put('/:webhookId',
  authenticateAPIKey,
  [
    body('url')
      .optional()
      .isURL()
      .withMessage('Valid webhook URL is required'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
    body('secret_token')
      .optional()
      .isLength({ min: 10, max: 100 })
      .withMessage('Secret token must be between 10 and 100 characters')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { webhookId } = req.params;
    const developerId = req.developer!.id;

    // Allowlist — only permit fields the API is designed to update (M3 mass-assignment fix)
    const { url, is_active, secret_token } = req.body;
    const updates: Record<string, unknown> = {};
    if (url !== undefined) updates.url = url;
    if (is_active !== undefined) updates.is_active = is_active;
    if (secret_token !== undefined) updates.secret_token = secret_token;

    // Verify webhook belongs to developer
    const webhook = await webhookService.getWebhookById(webhookId);
    if (!webhook || webhook.developer_id !== developerId) {
      throw new NotFoundError('Webhook');
    }

    // SSRF validation on URL updates
    if (updates.url) {
      validateWebhookUrl(updates.url as string);
    }

    // Update webhook
    const updatedWebhook = await webhookService.updateWebhook(webhookId, updates);
    
    logger.info('Webhook updated', {
      developerId,
      webhookId,
      updates
    });
    
    res.json({
      webhook: {
        id: updatedWebhook.id,
        url: updatedWebhook.url,
        is_sandbox: updatedWebhook.is_sandbox,
        is_active: updatedWebhook.is_active,
        created_at: updatedWebhook.created_at
      },
      message: 'Webhook updated successfully'
    });
  })
);

// Delete webhook
router.delete('/:webhookId',
  authenticateAPIKey,
  catchAsync(async (req: Request, res: Response) => {
    const { webhookId } = req.params;
    const developerId = req.developer!.id;
    
    // Verify webhook belongs to developer
    const webhook = await webhookService.getWebhookById(webhookId);
    if (!webhook || webhook.developer_id !== developerId) {
      throw new NotFoundError('Webhook');
    }
    
    // Delete webhook
    await webhookService.deleteWebhook(webhookId);
    
    logger.info('Webhook deleted', {
      developerId,
      webhookId
    });
    
    res.json({
      message: 'Webhook deleted successfully'
    });
  })
);

// Get webhook deliveries
router.get('/:webhookId/deliveries',
  authenticateAPIKey,
  catchAsync(async (req: Request, res: Response) => {
    const { webhookId } = req.params;
    const developerId = req.developer!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    // Verify webhook belongs to developer
    const webhook = await webhookService.getWebhookById(webhookId);
    if (!webhook || webhook.developer_id !== developerId) {
      throw new NotFoundError('Webhook');
    }
    
    // Get deliveries
    const deliveries = await webhookService.getWebhookDeliveries(webhookId, page, limit);
    
    res.json({
      webhook_id: webhookId,
      page,
      limit,
      total: deliveries.total,
      deliveries: deliveries.deliveries.map(delivery => ({
        id: delivery.id,
        verification_request_id: delivery.verification_request_id,
        status: delivery.status,
        response_status: delivery.response_status,
        attempts: delivery.attempts,
        created_at: delivery.created_at,
        delivered_at: delivery.delivered_at,
        next_retry_at: delivery.next_retry_at
      }))
    });
  })
);

// Test webhook (send test payload)
router.post('/:webhookId/test',
  authenticateAPIKey,
  catchAsync(async (req: Request, res: Response) => {
    const { webhookId } = req.params;
    const developerId = req.developer!.id;
    
    // Verify webhook belongs to developer
    const webhook = await webhookService.getWebhookById(webhookId);
    if (!webhook || webhook.developer_id !== developerId) {
      throw new NotFoundError('Webhook');
    }
    
    // Send test webhook
    const testPayload: WebhookPayload = {
      user_id: 'test-user-123',
      verification_id: 'test-verification-456',
      status: 'verified' as const,
      timestamp: new Date().toISOString(),
      data: {
        ocr_data: {
          name: 'Test User',
          raw_text: 'This is a test webhook delivery'
        },
        face_match_score: 0.95
      }
    };
    
    const delivery = await webhookService.sendWebhook(webhook, 'test-verification-456', testPayload);
    
    logger.info('Test webhook sent', {
      developerId,
      webhookId,
      deliveryId: delivery.id
    });
    
    res.json({
      message: 'Test webhook sent',
      delivery: {
        id: delivery.id,
        status: delivery.status,
        created_at: delivery.created_at
      },
      payload: testPayload
    });
  })
);

export default router;