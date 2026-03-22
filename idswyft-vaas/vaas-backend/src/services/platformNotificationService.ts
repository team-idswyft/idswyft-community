/**
 * Platform Notification Service
 *
 * Handles in-app notifications + external channel dispatch (Slack, Discord, Email, Webhook).
 * SSE-based real-time push to connected platform admin clients.
 * All external dispatches are fire-and-forget — failures never block the caller.
 */

import { Response } from 'express';
import { vaasSupabase } from '../config/database.js';
import { emailService } from './emailService.js';
import { cronRegistry } from './cronRegistryService.js';
import type {
  PlatformEvent,
  PlatformNotification,
  PlatformNotificationChannel,
  PlatformNotificationRule,
  PlatformNotificationSeverity,
} from '../types/index.js';

// ── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<PlatformNotificationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const SEVERITY_COLORS: Record<PlatformNotificationSeverity, string> = {
  info: '#38bdf8',     // sky-400
  warning: '#fbbf24',  // amber-400
  error: '#f87171',    // rose-400
  critical: '#ef4444', // red-500
};

// ── Service ──────────────────────────────────────────────────────────────────

export class PlatformNotificationService {
  private static instance: PlatformNotificationService;
  private sseClients: Map<string, Response> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): PlatformNotificationService {
    if (!PlatformNotificationService.instance) {
      PlatformNotificationService.instance = new PlatformNotificationService();
    }
    return PlatformNotificationService.instance;
  }

  // ── SSE Client Management ────────────────────────────────────────────────

  addSSEClient(adminId: string, res: Response): void {
    // Remove existing connection for same admin (reconnect scenario)
    this.sseClients.delete(adminId);
    this.sseClients.set(adminId, res);

    // Start heartbeat if this is the first client
    if (this.sseClients.size === 1 && !this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30_000);
    }
  }

  removeSSEClient(adminId: string): void {
    this.sseClients.delete(adminId);

    // Stop heartbeat if no clients
    if (this.sseClients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat(): void {
    const dead: string[] = [];
    for (const [adminId, res] of this.sseClients) {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        dead.push(adminId);
      }
    }
    for (const id of dead) this.sseClients.delete(id);
  }

  private broadcastSSE(notification: PlatformNotification): void {
    const payload = `data: ${JSON.stringify(notification)}\n\n`;
    const dead: string[] = [];
    for (const [adminId, res] of this.sseClients) {
      try {
        res.write(payload);
      } catch {
        dead.push(adminId);
      }
    }
    for (const id of dead) this.sseClients.delete(id);
  }

  // ── Core: Emit ──────────────────────────────────────────────────────────

  /** Fire-and-forget: insert DB row → broadcast SSE → dispatch channels. Never throws. */
  async emit(event: PlatformEvent): Promise<void> {
    try {
      // 1. Insert into DB
      const { data: notification, error } = await vaasSupabase
        .from('platform_notifications')
        .insert({
          type: event.type,
          severity: event.severity,
          title: event.title,
          message: event.message,
          metadata: event.metadata || {},
          source: event.source || null,
        })
        .select()
        .single();

      if (error) {
        console.error('[PlatformNotification] Failed to insert:', error.message);
        return;
      }

      // 2. Broadcast to SSE clients
      this.broadcastSSE(notification as PlatformNotification);

      // 3. Dispatch to external channels (fire-and-forget)
      this.dispatchToChannels(event).catch((err) => {
        console.error('[PlatformNotification] Channel dispatch error:', err.message);
      });
    } catch (err: any) {
      console.error('[PlatformNotification] emit() error:', err.message);
    }
  }

  // ── Channel Dispatch ───────────────────────────────────────────────────

  private async dispatchToChannels(event: PlatformEvent): Promise<void> {
    // Find matching rules with their channels
    const { data: rules, error } = await vaasSupabase
      .from('platform_notification_rules')
      .select('*, channel:platform_notification_channels(*)')
      .eq('event_type', event.type)
      .eq('enabled', true);

    if (error || !rules) return;

    for (const rule of rules) {
      const channel = (rule as any).channel as PlatformNotificationChannel | null;
      if (!channel?.enabled) continue;

      // Check severity threshold
      if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[rule.min_severity as PlatformNotificationSeverity]) {
        continue;
      }

      try {
        switch (channel.type) {
          case 'slack':
            await this.sendSlack(channel.config.webhook_url, event);
            break;
          case 'discord':
            await this.sendDiscord(channel.config.webhook_url, event);
            break;
          case 'email':
            await this.sendEmailNotification(channel.config.recipients || [], event);
            break;
          case 'webhook':
            await this.sendCustomWebhook(channel.config, event);
            break;
        }

        // Mark success
        await vaasSupabase
          .from('platform_notification_channels')
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', channel.id);
      } catch (err: any) {
        console.error(`[PlatformNotification] Channel ${channel.name} (${channel.type}) failed:`, err.message);

        // Mark failure
        await vaasSupabase
          .from('platform_notification_channels')
          .update({
            last_failure_at: new Date().toISOString(),
            failure_count: (channel.failure_count || 0) + 1,
          })
          .eq('id', channel.id);
      }
    }
  }

  private async sendSlack(webhookUrl: string, event: PlatformEvent): Promise<void> {
    const color = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          color,
          title: event.title,
          text: event.message,
          fields: [
            { title: 'Type', value: event.type, short: true },
            { title: 'Severity', value: event.severity.toUpperCase(), short: true },
          ],
          footer: 'Idswyft Platform',
          ts: Math.floor(Date.now() / 1000),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  }

  private async sendDiscord(webhookUrl: string, event: PlatformEvent): Promise<void> {
    const colorInt = parseInt(SEVERITY_COLORS[event.severity]?.replace('#', '') || '38bdf8', 16);
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: event.title,
          description: event.message,
          color: colorInt,
          fields: [
            { name: 'Type', value: event.type, inline: true },
            { name: 'Severity', value: event.severity.toUpperCase(), inline: true },
          ],
          footer: { text: 'Idswyft Platform' },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  }

  private async sendEmailNotification(recipients: string[], event: PlatformEvent): Promise<void> {
    for (const email of recipients) {
      await emailService.sendPlatformAlert(email, event.title, event.message);
    }
  }

  private async sendCustomWebhook(cfg: Record<string, any>, event: PlatformEvent): Promise<void> {
    await fetch(cfg.url, {
      method: cfg.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.headers || {}),
      },
      body: JSON.stringify({
        event_type: event.type,
        severity: event.severity,
        title: event.title,
        message: event.message,
        source: event.source,
        metadata: event.metadata || {},
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  }

  // ── Notification CRUD ──────────────────────────────────────────────────

  async list(params: {
    page?: number;
    per_page?: number;
    read?: boolean;
    type?: string;
    severity?: string;
  } = {}): Promise<{ notifications: PlatformNotification[]; total: number }> {
    const { page = 1, per_page = 25, read, type, severity } = params;
    const offset = (page - 1) * per_page;

    let query = vaasSupabase
      .from('platform_notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (typeof read === 'boolean') query = query.eq('read', read);
    if (type) query = query.eq('type', type);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;

    if (error) {
      console.error('[PlatformNotification] list error:', error.message);
      return { notifications: [], total: 0 };
    }

    return { notifications: (data || []) as PlatformNotification[], total: count || 0 };
  }

  async unreadCount(): Promise<number> {
    const { count, error } = await vaasSupabase
      .from('platform_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);

    if (error) return 0;
    return count || 0;
  }

  async markRead(notificationId: string, adminId: string): Promise<void> {
    await vaasSupabase
      .from('platform_notifications')
      .update({ read: true, read_by: adminId, read_at: new Date().toISOString() })
      .eq('id', notificationId);
  }

  async markAllRead(adminId: string): Promise<void> {
    await vaasSupabase
      .from('platform_notifications')
      .update({ read: true, read_by: adminId, read_at: new Date().toISOString() })
      .eq('read', false);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  /** Delete notifications older than `retentionDays`. Returns count of deleted rows. */
  async cleanupOldNotifications(retentionDays: number = 7): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      // Supabase JS .delete() doesn't return a count, so query first
      const { data, error: findErr } = await vaasSupabase
        .from('platform_notifications')
        .select('id')
        .lt('created_at', cutoff);

      if (findErr || !data || data.length === 0) return 0;

      const { error: delErr } = await vaasSupabase
        .from('platform_notifications')
        .delete()
        .lt('created_at', cutoff);

      if (delErr) {
        console.error('[PlatformNotification] Cleanup error:', delErr.message);
        return 0;
      }

      console.log(`[PlatformNotification] Cleaned up ${data.length} notifications older than ${retentionDays} days`);
      return data.length;
    } catch (err: any) {
      console.error('[PlatformNotification] Cleanup unexpected error:', err.message);
      return 0;
    }
  }

  /** Start a weekly background job to purge notifications older than 7 days. */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  startCleanupJob(intervalMs: number = 7 * 24 * 60 * 60 * 1000, retentionDays: number = 7): void {
    if (this.cleanupInterval) return;

    console.log(`[PlatformNotification] Starting cleanup job (every ${Math.round(intervalMs / 86400000)}d, ${retentionDays}d retention)`);

    // Run immediately on startup
    this.cleanupOldNotifications(retentionDays).catch(() => {});

    // Then run on schedule
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldNotifications(retentionDays)
        .then(() => cronRegistry.reportRun('notification-cleanup', 'success'))
        .catch((err) => {
          cronRegistry.reportRun('notification-cleanup', 'error', err.message);
        });
    }, intervalMs);
  }

  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ── Channel CRUD ──────────────────────────────────────────────────────

  async listChannels(): Promise<PlatformNotificationChannel[]> {
    const { data, error } = await vaasSupabase
      .from('platform_notification_channels')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as PlatformNotificationChannel[];
  }

  async createChannel(channel: {
    name: string;
    type: string;
    config: Record<string, any>;
    enabled?: boolean;
    created_by?: string;
  }): Promise<PlatformNotificationChannel> {
    const { data, error } = await vaasSupabase
      .from('platform_notification_channels')
      .insert({
        name: channel.name,
        type: channel.type,
        config: channel.config,
        enabled: channel.enabled ?? true,
        created_by: channel.created_by || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as PlatformNotificationChannel;
  }

  async updateChannel(id: string, updates: {
    name?: string;
    config?: Record<string, any>;
    enabled?: boolean;
  }): Promise<PlatformNotificationChannel> {
    const { data, error } = await vaasSupabase
      .from('platform_notification_channels')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as PlatformNotificationChannel;
  }

  async deleteChannel(id: string): Promise<void> {
    const { error } = await vaasSupabase
      .from('platform_notification_channels')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async testChannel(id: string): Promise<void> {
    const { data: channel, error } = await vaasSupabase
      .from('platform_notification_channels')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !channel) throw new Error('Channel not found');

    const testEvent: PlatformEvent = {
      type: 'health.service_recovered',
      severity: 'info',
      title: 'Test Notification',
      message: 'This is a test notification from Idswyft Platform. If you see this, the channel is working correctly.',
      source: 'platform-admin',
      metadata: { test: true },
    };

    const ch = channel as PlatformNotificationChannel;
    switch (ch.type) {
      case 'slack':
        await this.sendSlack(ch.config.webhook_url, testEvent);
        break;
      case 'discord':
        await this.sendDiscord(ch.config.webhook_url, testEvent);
        break;
      case 'email':
        await this.sendEmailNotification(ch.config.recipients || [], testEvent);
        break;
      case 'webhook':
        await this.sendCustomWebhook(ch.config, testEvent);
        break;
    }

    // Mark success
    await vaasSupabase
      .from('platform_notification_channels')
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .eq('id', id);
  }

  // ── Rule Management ───────────────────────────────────────────────────

  async listRules(channelId: string): Promise<PlatformNotificationRule[]> {
    const { data, error } = await vaasSupabase
      .from('platform_notification_rules')
      .select('*')
      .eq('channel_id', channelId)
      .order('event_type');

    if (error) return [];
    return (data || []) as PlatformNotificationRule[];
  }

  async upsertRules(channelId: string, rules: { event_type: string; min_severity: string; enabled: boolean }[]): Promise<void> {
    // Delete existing rules for this channel
    await vaasSupabase
      .from('platform_notification_rules')
      .delete()
      .eq('channel_id', channelId);

    if (rules.length === 0) return;

    // Insert new rules
    const rows = rules.map((r) => ({
      channel_id: channelId,
      event_type: r.event_type,
      min_severity: r.min_severity,
      enabled: r.enabled,
    }));

    const { error } = await vaasSupabase
      .from('platform_notification_rules')
      .insert(rows);

    if (error) throw new Error(error.message);
  }
}

export const platformNotificationService = PlatformNotificationService.getInstance();
