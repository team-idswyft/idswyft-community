import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { logger, logWebhookDelivery } from '@/utils/logger.js';
import { Webhook, WebhookDelivery, WebhookPayload } from '@/types/index.js';
import { encryptSecret, decryptSecret } from '@idswyft/shared';

/** Encrypt a webhook secret_token before writing to the DB. */
function encryptWebhookSecret(plaintext: string): string {
  return encryptSecret(plaintext, config.encryptionKey);
}

/** Decrypt a webhook secret_token read from the DB. Returns null on failure. */
function decryptWebhookSecret(ciphertext: string): string | null {
  try {
    return decryptSecret(ciphertext, config.encryptionKey);
  } catch {
    // Backwards-compat: if decryption fails, assume it's a legacy plaintext value
    return ciphertext;
  }
}

export class WebhookService {
  async createWebhook(data: {
    developer_id: string;
    url: string;
    is_sandbox: boolean;
    secret_token?: string;
    events?: string[];
  }): Promise<Webhook> {
    // Encrypt secret_token before persisting
    const insertData = { ...data };
    if (insertData.secret_token) {
      insertData.secret_token = encryptWebhookSecret(insertData.secret_token);
    }

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .insert(insertData)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to create webhook:', error);
      throw new Error('Failed to create webhook');
    }
    
    return webhook as Webhook;
  }
  
  async getWebhookById(id: string): Promise<Webhook | null> {
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get webhook:', error);
      throw new Error('Failed to get webhook');
    }
    
    return webhook as Webhook;
  }
  
  async getWebhookByUrl(
    developerId: string, 
    url: string, 
    isSandbox: boolean
  ): Promise<Webhook | null> {
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('developer_id', developerId)
      .eq('url', url)
      .eq('is_sandbox', isSandbox)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get webhook by URL:', error);
      throw new Error('Failed to get webhook');
    }
    
    return webhook as Webhook;
  }
  
  async getWebhooksByDeveloper(developerId: string): Promise<Webhook[]> {
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error('Failed to get webhooks by developer:', error);
      throw new Error('Failed to get webhooks');
    }
    
    return webhooks as Webhook[];
  }
  
  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook> {
    // Encrypt secret_token if being updated
    const safeUpdates = { ...updates };
    if (safeUpdates.secret_token) {
      safeUpdates.secret_token = encryptWebhookSecret(safeUpdates.secret_token);
    }

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .update(safeUpdates)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to update webhook:', error);
      throw new Error('Failed to update webhook');
    }
    
    return webhook as Webhook;
  }
  
  async deleteWebhook(id: string): Promise<void> {
    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', id);
    
    if (error) {
      logger.error('Failed to delete webhook:', error);
      throw new Error('Failed to delete webhook');
    }
  }
  
  async sendWebhook(
    webhook: Webhook,
    verificationRequestId: string,
    payload: WebhookPayload
  ): Promise<WebhookDelivery> {
    // Create webhook delivery record
    const { data: delivery, error } = await supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhook.id,
        verification_request_id: verificationRequestId,
        payload,
        status: 'pending',
        attempts: 0
      })
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to create webhook delivery:', error);
      throw new Error('Failed to create webhook delivery');
    }
    
    // Send webhook asynchronously
    this.deliverWebhook(delivery as WebhookDelivery, webhook).catch(error => {
      logger.error('Webhook delivery failed:', error);
    });
    
    return delivery as WebhookDelivery;
  }
  
  private async deliverWebhook(delivery: WebhookDelivery, webhook: Webhook): Promise<void> {
    const maxAttempts = config.webhooks.retryAttempts;
    let attempt = delivery.attempts + 1;
    
    while (attempt <= maxAttempts) {
      try {
        logWebhookDelivery(webhook.id, 'attempting', {
          deliveryId: delivery.id,
          attempt,
          maxAttempts,
          url: webhook.url
        });
        
        // Prepare headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Idswyft-Webhooks/1.0',
          'X-Idswyft-Webhook-Id': delivery.id,
          'X-Idswyft-Delivery-Attempt': attempt.toString()
        };
        
        // Add signature if signing secret is provided (decrypt from DB storage)
        const rawSecret = webhook.secret_key || webhook.secret_token;
        if (rawSecret) {
          const signingSecret = decryptWebhookSecret(rawSecret);
          if (signingSecret) {
            const signature = this.generateSignature(
              JSON.stringify(delivery.payload),
              signingSecret
            );
            headers['X-Idswyft-Signature'] = signature;
          }
        }
        
        // Send webhook
        const response = await axios.post(webhook.url, delivery.payload, {
          headers,
          timeout: config.webhooks.timeoutMs,
          validateStatus: (status) => status < 500 // Only retry on 5xx errors
        });
        
        // Update delivery as successful
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'delivered',
            response_status: response.status,
            response_body: this.truncateResponse(JSON.stringify(response.data)),
            attempts: attempt,
            delivered_at: new Date().toISOString()
          })
          .eq('id', delivery.id);
        
        logWebhookDelivery(webhook.id, 'delivered', {
          deliveryId: delivery.id,
          attempt,
          responseStatus: response.status,
          url: webhook.url
        });
        
        return; // Success, exit retry loop
        
      } catch (error: any) {
        const isLastAttempt = attempt === maxAttempts;
        const responseStatus = error.response?.status || 0;
        const responseBody = error.response ? 
          this.truncateResponse(JSON.stringify(error.response.data)) : 
          error.message;
        
        // Update delivery attempt
        await supabase
          .from('webhook_deliveries')
          .update({
            status: isLastAttempt ? 'failed' : 'pending',
            response_status: responseStatus,
            response_body: responseBody,
            attempts: attempt,
            next_retry_at: isLastAttempt ? null : this.calculateNextRetry(attempt)
          })
          .eq('id', delivery.id);
        
        logWebhookDelivery(webhook.id, isLastAttempt ? 'failed' : 'retry_scheduled', {
          deliveryId: delivery.id,
          attempt,
          maxAttempts,
          error: error.message,
          responseStatus,
          url: webhook.url
        });
        
        if (isLastAttempt) {
          logger.error('Webhook delivery failed after all retries', {
            webhookId: webhook.id,
            deliveryId: delivery.id,
            attempts: attempt,
            error: error.message
          });
          return;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
        
        attempt++;
      }
    }
  }
  
  private generateSignature(payload: string, secret: string): string {
    return createWebhookSignature(payload, secret);
  }
  
  private truncateResponse(response: string, maxLength: number = 1000): string {
    if (response.length <= maxLength) {
      return response;
    }
    return response.substring(0, maxLength) + '... (truncated)';
  }
  
  private calculateNextRetry(attempt: number): string {
    // Exponential backoff: 1min, 5min, 15min
    const delays = [60000, 300000, 900000]; // in milliseconds
    const delay = delays[Math.min(attempt - 1, delays.length - 1)];
    const nextRetry = new Date(Date.now() + delay);
    return nextRetry.toISOString();
  }
  
  async getWebhookDeliveries(
    webhookId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const { data: deliveries, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    const { count, error: countError } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('webhook_id', webhookId);
    
    if (error || countError) {
      logger.error('Failed to get webhook deliveries:', error || countError);
      throw new Error('Failed to get webhook deliveries');
    }
    
    return {
      deliveries: deliveries as WebhookDelivery[],
      total: count || 0
    };
  }
  
  // Process pending webhook deliveries (to be called by a cron job)
  async processPendingDeliveries(): Promise<void> {
    const now = new Date().toISOString();
    
    // Get pending deliveries that are ready for retry
    const { data: pendingDeliveries, error } = await supabase
      .from('webhook_deliveries')
      .select(`
        *,
        webhook:webhooks(*)
      `)
      .eq('status', 'pending')
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .limit(50); // Process in batches
    
    if (error) {
      logger.error('Failed to get pending webhook deliveries:', error);
      return;
    }
    
    if (!pendingDeliveries || pendingDeliveries.length === 0) {
      return;
    }
    
    logger.info('Processing pending webhook deliveries', {
      count: pendingDeliveries.length
    });
    
    // Process each delivery
    for (const delivery of pendingDeliveries) {
      try {
        await this.deliverWebhook(delivery as WebhookDelivery, delivery.webhook as Webhook);
      } catch (error) {
        logger.error('Error processing webhook delivery:', {
          deliveryId: delivery.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  /**
   * Fetch all active webhooks for a developer, filtered by sandbox mode
   * and optionally by event type subscription.
   * Returns [] on error — webhook failure must never block verification.
   */
  async getActiveWebhooksForDeveloper(
    developerId: string,
    isSandbox: boolean,
    eventType?: string,
    apiKeyId?: string
  ): Promise<Webhook[]> {
    try {
      let query = supabase
        .from('webhooks')
        .select('*')
        .eq('developer_id', developerId)
        .eq('is_active', true)
        .eq('is_sandbox', isSandbox);

      // Each .or() produces an independent parenthesized group ANDed with the rest.
      // When both are present: WHERE ... AND (events filter) AND (api_key filter)
      if (eventType) {
        query = query.or(`events.cs.{${eventType}},events.is.null`);
      }

      // Filter by API key scope: return webhooks that are either unscoped (NULL)
      // or scoped to the specific API key that triggered the verification
      if (apiKeyId) {
        query = query.or(`api_key_id.is.null,api_key_id.eq.${apiKeyId}`);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch active webhooks for developer:', error);
        return [];
      }

      return (data ?? []) as Webhook[];
    } catch (err) {
      logger.error('Unexpected error fetching active webhooks:', err);
      return [];
    }
  }

  // Get webhook statistics for a developer
  async getWebhookStats(developerId: string): Promise<{
    total_webhooks: number;
    active_webhooks: number;
    total_deliveries: number;
    successful_deliveries: number;
    failed_deliveries: number;
    pending_deliveries: number;
  }> {
    // Get webhook counts
    const { count: totalWebhooks } = await supabase
      .from('webhooks')
      .select('*', { count: 'exact', head: true })
      .eq('developer_id', developerId);
    
    const { count: activeWebhooks } = await supabase
      .from('webhooks')
      .select('*', { count: 'exact', head: true })
      .eq('developer_id', developerId)
      .eq('is_active', true);
    
    // Get delivery stats
    const { data: deliveryStats } = await supabase
      .from('webhook_deliveries')
      .select(`
        status,
        webhook:webhooks!inner(developer_id)
      `)
      .eq('webhook.developer_id', developerId);
    
    const stats = {
      total_webhooks: totalWebhooks || 0,
      active_webhooks: activeWebhooks || 0,
      total_deliveries: deliveryStats?.length || 0,
      successful_deliveries: 0,
      failed_deliveries: 0,
      pending_deliveries: 0
    };
    
    if (deliveryStats) {
      deliveryStats.forEach((delivery: any) => {
        switch (delivery.status) {
          case 'delivered':
            stats.successful_deliveries++;
            break;
          case 'failed':
            stats.failed_deliveries++;
            break;
          case 'pending':
            stats.pending_deliveries++;
            break;
        }
      });
    }
    
    return stats;
  }
}

/**
 * Creates an HMAC-SHA256 signature for a webhook payload.
 * Format: "sha256=<64-char hex digest>"
 */
export function createWebhookSignature(payload: string, secret: string): string {
  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')}`;
}

/**
 * Verifies an HMAC-SHA256 webhook signature using timing-safe comparison
 * to prevent timing-based side-channel attacks.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createWebhookSignature(payload, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  // Length must match before timingSafeEqual (it requires equal-length buffers)
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}