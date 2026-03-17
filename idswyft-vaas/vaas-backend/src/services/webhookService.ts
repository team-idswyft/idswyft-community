import axios from 'axios';
import crypto from 'crypto';
import { vaasSupabase } from '../config/database.js';
import { VaasWebhook, VaasWebhookDelivery, VaasWebhookEvent } from '../types/index.js';
import { notificationService } from './notificationService.js';

export class WebhookService {
  
  async createWebhook(organizationId: string, config: {
    url: string;
    events: string[];
    secret_key?: string;
  }): Promise<VaasWebhook> {
    const secretKey = config.secret_key || this.generateSecretKey();
    
    const { data: webhook, error } = await vaasSupabase
      .from('vaas_webhooks')
      .insert({
        organization_id: organizationId,
        url: config.url,
        events: config.events,
        secret_key: secretKey,
        enabled: true
      })
      .select()
      .single();
      
    if (error) {
      throw new Error(`Failed to create webhook: ${error.message}`);
    }
    
    return webhook;
  }
  
  async getWebhook(organizationId: string, webhookId: string): Promise<VaasWebhook | null> {
    const { data: webhook, error } = await vaasSupabase
      .from('vaas_webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('organization_id', organizationId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get webhook: ${error.message}`);
    }
    
    return webhook;
  }
  
  async listWebhooks(organizationId: string): Promise<VaasWebhook[]> {
    const { data: webhooks, error } = await vaasSupabase
      .from('vaas_webhooks')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
      
    if (error) {
      throw new Error(`Failed to list webhooks: ${error.message}`);
    }
    
    return webhooks || [];
  }
  
  async updateWebhook(organizationId: string, webhookId: string, updates: Partial<VaasWebhook>): Promise<VaasWebhook> {
    const { data: webhook, error } = await vaasSupabase
      .from('vaas_webhooks')
      .update(updates)
      .eq('id', webhookId)
      .eq('organization_id', organizationId)
      .select()
      .single();
      
    if (error) {
      throw new Error(`Failed to update webhook: ${error.message}`);
    }
    
    return webhook;
  }
  
  async deleteWebhook(organizationId: string, webhookId: string): Promise<void> {
    const { error } = await vaasSupabase
      .from('vaas_webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('organization_id', organizationId);
      
    if (error) {
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }
  }
  
  async sendWebhook(organizationId: string, eventType: string, eventData: any): Promise<void> {
    try {
      // Get all webhooks for organization that listen for this event
      const { data: webhooks, error } = await vaasSupabase
        .from('vaas_webhooks')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('enabled', true)
        .contains('events', [eventType]);
        
      if (error) {
        console.error('[WebhookService] Failed to get webhooks:', error);
        return;
      }
      
      if (!webhooks || webhooks.length === 0) {
        console.log(`[WebhookService] No webhooks found for event ${eventType} in organization ${organizationId}`);
        return;
      }
      
      // Create webhook event payload
      const webhookEvent: VaasWebhookEvent = {
        id: crypto.randomUUID(),
        type: eventType,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: eventData
        },
        organization_id: organizationId,
        api_version: '1.0.0'
      };
      
      // Send to each webhook
      for (const webhook of webhooks) {
        await this.deliverWebhook(webhook, webhookEvent);
      }
    } catch (error: any) {
      console.error('[WebhookService] Send webhook failed:', error);
    }
  }
  
  private async deliverWebhook(webhook: VaasWebhook, event: VaasWebhookEvent): Promise<void> {
    try {
      // Create delivery record
      const { data: delivery, error: deliveryError } = await vaasSupabase
        .from('vaas_webhook_deliveries')
        .insert({
          webhook_id: webhook.id,
          organization_id: webhook.organization_id,
          event_type: event.type,
          event_data: event,
          status: 'pending',
          attempts: 0,
          max_retries: 3
        })
        .select()
        .single();
        
      if (deliveryError) {
        console.error('[WebhookService] Failed to create delivery record:', deliveryError);
        return;
      }
      
      // Deliver webhook
      await this.attemptDelivery(webhook, event, delivery);
    } catch (error: any) {
      console.error('[WebhookService] Deliver webhook failed:', error);
    }
  }
  
  private async attemptDelivery(webhook: VaasWebhook, event: VaasWebhookEvent, delivery: VaasWebhookDelivery): Promise<void> {
    try {
      const payload = JSON.stringify(event);
      const signature = this.generateSignature(payload, webhook.secret_key);
      
      console.log(`[WebhookService] Delivering webhook ${delivery.id} to ${webhook.url}`);
      
      const response = await axios.post(webhook.url, event, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VaaS-Webhook/1.0.0',
          'X-VaaS-Signature': signature,
          'X-VaaS-Event-Type': event.type,
          'X-VaaS-Delivery-ID': delivery.id
        },
        timeout: 30000 // 30 second timeout
      });
      
      // Success
      await vaasSupabase
        .from('vaas_webhook_deliveries')
        .update({
          status: 'delivered',
          http_status_code: response.status,
          response_body: JSON.stringify(response.data).substring(0, 10000), // Limit response size
          delivered_at: new Date().toISOString(),
          attempts: delivery.attempts + 1
        })
        .eq('id', delivery.id);
        
      await vaasSupabase
        .from('vaas_webhooks')
        .update({
          last_success_at: new Date().toISOString(),
          failure_count: 0
        })
        .eq('id', webhook.id);
        
      console.log(`[WebhookService] Webhook ${delivery.id} delivered successfully`);
    } catch (error: any) {
      const statusCode = error.response?.status || 0;
      const errorMessage = error.response?.data || error.message;
      
      console.error(`[WebhookService] Webhook ${delivery.id} delivery failed:`, errorMessage);
      
      // Update delivery record
      const newAttempts = delivery.attempts + 1;
      const shouldRetry = newAttempts < delivery.max_retries && this.shouldRetryStatus(statusCode);
      
      await vaasSupabase
        .from('vaas_webhook_deliveries')
        .update({
          status: shouldRetry ? 'retrying' : 'failed',
          http_status_code: statusCode,
          response_body: typeof errorMessage === 'string' ? errorMessage.substring(0, 10000) : JSON.stringify(errorMessage).substring(0, 10000),
          error_message: error.message.substring(0, 1000),
          attempts: newAttempts,
          next_retry_at: shouldRetry ? new Date(Date.now() + this.getRetryDelay(newAttempts)).toISOString() : null
        })
        .eq('id', delivery.id);
        
      // Update webhook failure count
      await vaasSupabase
        .from('vaas_webhooks')
        .update({
          last_failure_at: new Date().toISOString(),
          failure_count: webhook.failure_count + 1
        })
        .eq('id', webhook.id);
        
      // Disable webhook if too many failures
      if (webhook.failure_count + 1 >= 50) {
        await vaasSupabase
          .from('vaas_webhooks')
          .update({ enabled: false })
          .eq('id', webhook.id);

        console.log(`[WebhookService] Disabled webhook ${webhook.id} due to excessive failures`);

        notificationService.create({
          organizationId: webhook.organization_id,
          type: 'webhook.delivery_failed',
          title: 'Webhook Disabled',
          message: `Webhook to ${webhook.url} was disabled after ${webhook.failure_count + 1} consecutive failures.`,
          metadata: { webhook_id: webhook.id, url: webhook.url, failure_count: webhook.failure_count + 1 },
        }).catch(() => {});
      }
      
      // Schedule retry if applicable
      if (shouldRetry) {
        setTimeout(() => {
          this.retryDelivery(delivery.id);
        }, this.getRetryDelay(newAttempts));
      }
    }
  }
  
  private async retryDelivery(deliveryId: string): Promise<void> {
    try {
      const { data: delivery, error } = await vaasSupabase
        .from('vaas_webhook_deliveries')
        .select(`
          *,
          vaas_webhooks!inner(*)
        `)
        .eq('id', deliveryId)
        .eq('status', 'retrying')
        .single();
        
      if (error || !delivery) {
        console.log(`[WebhookService] Retry delivery ${deliveryId}: delivery not found or not in retrying status`);
        return;
      }
      
      await this.attemptDelivery(delivery.vaas_webhooks, delivery.event_data, delivery);
    } catch (error: any) {
      console.error(`[WebhookService] Retry delivery ${deliveryId} failed:`, error);
    }
  }
  
  async testWebhook(organizationId: string, webhookId: string): Promise<{ success: boolean; status_code?: number; error?: string }> {
    try {
      const webhook = await this.getWebhook(organizationId, webhookId);
      if (!webhook) {
        throw new Error('Webhook not found');
      }
      
      const testEvent: VaasWebhookEvent = {
        id: crypto.randomUUID(),
        type: 'webhook.test',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            message: 'This is a test webhook delivery from VaaS',
            timestamp: new Date().toISOString()
          }
        },
        organization_id: organizationId,
        api_version: '1.0.0'
      };
      
      const payload = JSON.stringify(testEvent);
      const signature = this.generateSignature(payload, webhook.secret_key);
      
      const response = await axios.post(webhook.url, testEvent, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VaaS-Webhook/1.0.0',
          'X-VaaS-Signature': signature,
          'X-VaaS-Event-Type': testEvent.type,
          'X-VaaS-Delivery-ID': 'test'
        },
        timeout: 30000
      });
      
      return {
        success: true,
        status_code: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        status_code: error.response?.status || 0,
        error: error.message
      };
    }
  }
  
  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
  
  private shouldRetryStatus(statusCode: number): boolean {
    // Retry on server errors and some client errors, but not on auth/validation errors
    return statusCode >= 500 || statusCode === 429 || statusCode === 408 || statusCode === 0;
  }
  
  private getRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 4s, 16s
    return Math.pow(4, attempt - 1) * 1000;
  }
}

export const webhookService = new WebhookService();