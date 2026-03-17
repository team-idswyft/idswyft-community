import { Router } from 'express';
import crypto from 'crypto';
import { webhookService } from '../services/webhookService.js';
import { verificationService } from '../services/verificationService.js';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validateWebhookConfig } from '../middleware/validation.js';
import { VaasApiResponse } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { auditService } from '../services/auditService.js';

const router = Router();

// Create webhook (admin only)
router.post('/', requireAuth, requirePermission('manage_webhooks'), validateWebhookConfig, async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const { url, events, secret_key } = req.body;
    
    const webhook = await webhookService.createWebhook(organizationId, {
      url,
      events,
      secret_key
    });

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'webhook.created',
      resourceType: 'webhook',
      resourceId: webhook?.id,
      details: { url, events },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: webhook
    };

    res.status(201).json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_WEBHOOK_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// List webhooks (admin only)
router.get('/', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const webhooks = await webhookService.listWebhooks(organizationId);
    
    const response: VaasApiResponse = {
      success: true,
      data: webhooks
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIST_WEBHOOKS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get webhook details (admin only)
router.get('/:id', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    const webhook = await webhookService.getWebhook(organizationId, id);
    
    if (!webhook) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: webhook
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_WEBHOOK_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Update webhook (admin only)
router.put('/:id', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    const { id: _, organization_id, secret_key, created_at, updated_at, ...allowedUpdates } = updates;
    
    const webhook = await webhookService.updateWebhook(organizationId, id, allowedUpdates);

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'webhook.updated',
      resourceType: 'webhook',
      resourceId: id,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: webhook
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_WEBHOOK_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Delete webhook (admin only)
router.delete('/:id', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    await webhookService.deleteWebhook(organizationId, id);

    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'webhook.deleted',
      resourceType: 'webhook',
      resourceId: id,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Webhook deleted successfully' }
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DELETE_WEBHOOK_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Test webhook delivery (admin only)
router.post('/:id/test', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    const result = await webhookService.testWebhook(organizationId, id);
    
    const response: VaasApiResponse = {
      success: true,
      data: result
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'TEST_WEBHOOK_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Webhook endpoint for receiving notifications from main Idswyft API
router.post('/idswyft', async (req, res) => {
  try {
    const signature = req.headers['x-idswyft-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (!signature) {
      console.warn('[WebhookRoute] Missing signature for Idswyft webhook');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify HMAC-SHA256 webhook signature (main API sends "sha256=<hex>")
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', config.idswyftWebhookSecret)
      .update(payload)
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.warn('[WebhookRoute] Invalid signature for Idswyft webhook');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('[WebhookRoute] Received Idswyft webhook:', event.type, event.data?.verification_id);
    
    // Handle different event types
    switch (event.type) {
      case 'verification.completed':
      case 'verification.failed':
      case 'verification.manual_review':
        if (event.data?.verification_id) {
          await verificationService.syncVerificationFromIdswyft(event.data.verification_id);
        }
        break;
        
      default:
        console.log('[WebhookRoute] Unhandled Idswyft event type:', event.type);
    }
    
    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[WebhookRoute] Idswyft webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get webhook delivery logs (admin only)
router.get('/:id/deliveries', requireAuth, requirePermission('manage_webhooks'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 20, 100);
    const offset = (page - 1) * perPage;
    
    // Verify webhook belongs to organization
    const webhook = await webhookService.getWebhook(organizationId, id);
    if (!webhook) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const { data: deliveries, count, error } = await vaasSupabase
      .from('vaas_webhook_deliveries')
      .select('*', { count: 'exact' })
      .eq('webhook_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);
      
    if (error) {
      throw new Error(`Failed to get webhook deliveries: ${error.message}`);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: deliveries || [],
      meta: {
        total: count || 0,
        page,
        per_page: perPage,
        has_more: (count || 0) > page * perPage
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_WEBHOOK_DELIVERIES_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

export default router;