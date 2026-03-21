/**
 * Centralized Platform Config Service
 *
 * DB-backed key-value store with:
 * - AES-256-GCM encryption for secrets
 * - 60s polling cache for hot-reload
 * - Audit trail for all changes
 * - Export/import for disaster recovery
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { platformNotificationService } from './platformNotificationService.js';
import type { PlatformConfigItem, PlatformConfigAudit } from '../types/index.js';

// ── Encryption helpers ───────────────────────────────────────────────────────

let _cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const passphrase = process.env.VAAS_CONFIG_ENCRYPTION_KEY;
  if (!passphrase) {
    if (config.nodeEnv === 'production') {
      throw new Error('[PlatformConfig] VAAS_CONFIG_ENCRYPTION_KEY is required in production');
    }
    // Development fallback only
    _cachedKey = scryptSync(config.jwtSecret, 'idswyft-config-salt', 32);
    return _cachedKey;
  }

  _cachedKey = scryptSync(passphrase, 'idswyft-config-salt', 32);
  return _cachedKey;
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted value format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// ── Config registry — seeds defaults from env vars ──────────────────────────

interface ConfigRegistryEntry {
  category: string;
  is_secret: boolean;
  requires_restart: boolean;
  description: string;
  env_key: string;
}

const CONFIG_REGISTRY: Record<string, ConfigRegistryEntry> = {
  // Rate limiting (hot-reload)
  VAAS_RATE_LIMIT_WINDOW_MS: { category: 'rate-limiting', is_secret: false, requires_restart: false, description: 'Rate limit window in milliseconds' , env_key: 'VAAS_RATE_LIMIT_WINDOW_MS' },
  VAAS_RATE_LIMIT_MAX_REQUESTS_PER_ORG: { category: 'rate-limiting', is_secret: false, requires_restart: false, description: 'Max requests per org per window', env_key: 'VAAS_RATE_LIMIT_MAX_REQUESTS_PER_ORG' },
  VAAS_RATE_LIMIT_MAX_REQUESTS_PER_USER: { category: 'rate-limiting', is_secret: false, requires_restart: false, description: 'Max requests per user per window', env_key: 'VAAS_RATE_LIMIT_MAX_REQUESTS_PER_USER' },

  // Feature flags (hot-reload)
  VAAS_WEBHOOKS_ENABLED: { category: 'feature-flags', is_secret: false, requires_restart: false, description: 'Enable webhook notifications', env_key: 'VAAS_WEBHOOKS_ENABLED' },
  VAAS_BILLING_ENABLED: { category: 'feature-flags', is_secret: false, requires_restart: false, description: 'Enable billing features', env_key: 'VAAS_BILLING_ENABLED' },
  VAAS_ANALYTICS_ENABLED: { category: 'feature-flags', is_secret: false, requires_restart: false, description: 'Enable analytics features', env_key: 'VAAS_ANALYTICS_ENABLED' },
  VAAS_CUSTOM_DOMAINS_ENABLED: { category: 'feature-flags', is_secret: false, requires_restart: false, description: 'Enable custom domains', env_key: 'VAAS_CUSTOM_DOMAINS_ENABLED' },

  // API integration (requires restart)
  IDSWYFT_API_URL: { category: 'api-integration', is_secret: false, requires_restart: true, description: 'Main Idswyft API base URL', env_key: 'IDSWYFT_API_URL' },
  IDSWYFT_SERVICE_TOKEN: { category: 'api-integration', is_secret: true, requires_restart: true, description: 'Service-to-service auth token', env_key: 'IDSWYFT_SERVICE_TOKEN' },
  IDSWYFT_API_TIMEOUT: { category: 'api-integration', is_secret: false, requires_restart: true, description: 'API call timeout in ms', env_key: 'IDSWYFT_API_TIMEOUT' },

  // Security (requires restart)
  VAAS_JWT_SECRET: { category: 'security', is_secret: true, requires_restart: true, description: 'JWT signing secret', env_key: 'VAAS_JWT_SECRET' },
  VAAS_API_KEY_SECRET: { category: 'security', is_secret: true, requires_restart: true, description: 'API key encryption secret', env_key: 'VAAS_API_KEY_SECRET' },
  IDSWYFT_WEBHOOK_SECRET: { category: 'security', is_secret: true, requires_restart: true, description: 'Webhook signing secret', env_key: 'IDSWYFT_WEBHOOK_SECRET' },

  // Email (hot-reload)
  RESEND_API_KEY: { category: 'email', is_secret: true, requires_restart: false, description: 'Resend API key for sending emails', env_key: 'RESEND_API_KEY' },
  EMAIL_FROM: { category: 'email', is_secret: false, requires_restart: false, description: 'Default sender email address', env_key: 'EMAIL_FROM' },
  ADMIN_NOTIFICATION_EMAIL: { category: 'email', is_secret: false, requires_restart: false, description: 'Email for admin notifications', env_key: 'ADMIN_NOTIFICATION_EMAIL' },

  // Storage (requires restart)
  VAAS_STORAGE_PROVIDER: { category: 'storage', is_secret: false, requires_restart: true, description: 'Storage provider (local, s3, supabase)', env_key: 'VAAS_STORAGE_PROVIDER' },
  VAAS_MAX_FILE_SIZE: { category: 'storage', is_secret: false, requires_restart: true, description: 'Max file upload size in bytes', env_key: 'VAAS_MAX_FILE_SIZE' },

  // Monitoring (hot-reload)
  SENTRY_DSN: { category: 'monitoring', is_secret: true, requires_restart: false, description: 'Sentry DSN for error tracking', env_key: 'SENTRY_DSN' },
  LOG_LEVEL: { category: 'monitoring', is_secret: false, requires_restart: false, description: 'Application log level', env_key: 'LOG_LEVEL' },
};

// ── Service ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export class PlatformConfigService {
  private static instance: PlatformConfigService;
  private cache: Map<string, PlatformConfigItem> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): PlatformConfigService {
    if (!PlatformConfigService.instance) {
      PlatformConfigService.instance = new PlatformConfigService();
    }
    return PlatformConfigService.instance;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.pollInterval) return;
    console.log('[PlatformConfig] Starting config cache (60s poll)');
    await this.refreshCache();
    this.pollInterval = setInterval(() => this.refreshCache(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[PlatformConfig] Stopped');
  }

  private async refreshCache(): Promise<void> {
    try {
      const { data, error } = await vaasSupabase
        .from('platform_config')
        .select('*');

      if (error || !data) return;

      this.cache.clear();
      for (const row of data) {
        this.cache.set(row.key, row as PlatformConfigItem);
      }
    } catch (err: any) {
      console.error('[PlatformConfig] Cache refresh failed:', err.message);
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Sync read: cache → env var → default. Does NOT decrypt secrets. */
  getConfig(key: string, defaultValue?: string): string | undefined {
    const cached = this.cache.get(key);
    if (cached?.value != null) {
      // If it's encrypted, we can't return it synchronously in cleartext
      if (cached.is_secret) return '***';
      return cached.value;
    }
    return process.env[key] || defaultValue;
  }

  async listAll(): Promise<(PlatformConfigItem & { masked_value?: string })[]> {
    const { data, error } = await vaasSupabase
      .from('platform_config')
      .select('*')
      .order('category')
      .order('key');

    if (error || !data) return [];

    return data.map((item: any) => ({
      ...item,
      value: item.is_secret ? '••••••••' : item.value,
      masked_value: item.is_secret ? '••••••••' : undefined,
    }));
  }

  async getValue(key: string): Promise<string | null> {
    const { data, error } = await vaasSupabase
      .from('platform_config')
      .select('*')
      .eq('key', key)
      .single();

    if (error || !data) return null;

    if (data.is_secret && data.value) {
      try {
        return decrypt(data.value);
      } catch {
        console.error(`[PlatformConfig] Failed to decrypt key: ${key}`);
        return null;
      }
    }
    return data.value;
  }

  // ── Write ─────────────────────────────────────────────────────────────

  async setValue(
    key: string,
    value: string,
    adminId: string,
    opts: { category?: string; is_secret?: boolean; requires_restart?: boolean; description?: string } = {},
  ): Promise<void> {
    // Get current value for audit
    const { data: existing } = await vaasSupabase
      .from('platform_config')
      .select('value, is_secret, category')
      .eq('key', key)
      .single();

    const isSecret = opts.is_secret ?? existing?.is_secret ?? false;
    const storedValue = isSecret ? encrypt(value) : value;
    const changeType = existing ? 'update' : 'create';

    const { error } = await vaasSupabase
      .from('platform_config')
      .upsert({
        key,
        value: storedValue,
        category: opts.category || existing?.category || 'general',
        is_secret: isSecret,
        requires_restart: opts.requires_restart ?? false,
        description: opts.description ?? null,
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      }, { onConflict: 'key' });

    if (error) throw new Error(error.message);

    // Audit trail (mask secrets)
    await vaasSupabase.from('platform_config_audit').insert({
      config_key: key,
      old_value: existing?.is_secret ? '***' : (existing?.value ?? null),
      new_value: isSecret ? '***' : value,
      changed_by: adminId,
      change_type: changeType,
    });

    // Refresh cache immediately
    await this.refreshCache();

    // Notify
    platformNotificationService.emit({
      type: 'config.changed',
      severity: 'info',
      title: `Config ${changeType}d: ${key}`,
      message: `Configuration key "${key}" was ${changeType}d.`,
      source: 'platform-config',
      metadata: { key, change_type: changeType },
    }).catch(() => {});
  }

  async deleteKey(key: string, adminId: string): Promise<void> {
    const { data: existing } = await vaasSupabase
      .from('platform_config')
      .select('value, is_secret')
      .eq('key', key)
      .single();

    const { error } = await vaasSupabase
      .from('platform_config')
      .delete()
      .eq('key', key);

    if (error) throw new Error(error.message);

    // Audit
    await vaasSupabase.from('platform_config_audit').insert({
      config_key: key,
      old_value: existing?.is_secret ? '***' : (existing?.value ?? null),
      new_value: null,
      changed_by: adminId,
      change_type: 'delete',
    });

    await this.refreshCache();
  }

  // ── Export / Import ──────────────────────────────────────────────────

  async exportAsEnv(includeSecrets: boolean = false): Promise<string> {
    const { data, error } = await vaasSupabase
      .from('platform_config')
      .select('*')
      .order('category')
      .order('key');

    if (error || !data) return '';

    const lines: string[] = [];
    let currentCategory = '';
    for (const item of data) {
      if (item.category !== currentCategory) {
        if (lines.length > 0) lines.push('');
        lines.push(`# ${item.category}`);
        currentCategory = item.category;
      }

      let value = item.value || '';
      if (item.is_secret) {
        if (includeSecrets && value) {
          try { value = decrypt(value); } catch { value = ''; }
        } else {
          value = '';
        }
      }
      lines.push(`${item.key}=${value}`);
    }
    return lines.join('\n');
  }

  async exportAsJson(includeSecrets: boolean = false): Promise<Record<string, string>> {
    const { data, error } = await vaasSupabase
      .from('platform_config')
      .select('*')
      .order('key');

    if (error || !data) return {};

    const result: Record<string, string> = {};
    for (const item of data) {
      let value = item.value || '';
      if (item.is_secret) {
        if (includeSecrets && value) {
          try { value = decrypt(value); } catch { value = ''; }
        } else {
          value = '***';
        }
      }
      result[item.key] = value;
    }
    return result;
  }

  async importFromEnv(content: string, adminId: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const lines = content.split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='));
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();

      if (!key) {
        skipped++;
        continue;
      }

      try {
        const registry = CONFIG_REGISTRY[key];
        await this.setValue(key, value, adminId, {
          category: registry?.category || 'general',
          is_secret: registry?.is_secret || false,
          requires_restart: registry?.requires_restart || false,
          description: registry?.description,
        });

        imported++;
      } catch (err: any) {
        errors.push(`${key}: ${err.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  // ── Runtime config (hot-reloadable values) ────────────────────────────

  async getRuntimeConfig(): Promise<Record<string, string>> {
    const { data, error } = await vaasSupabase
      .from('platform_config')
      .select('key, value, is_secret')
      .eq('requires_restart', false);

    if (error || !data) return {};

    const result: Record<string, string> = {};
    for (const item of data) {
      if (item.is_secret) {
        result[item.key] = '***';
      } else {
        result[item.key] = item.value || '';
      }
    }
    return result;
  }

  // ── Seed Defaults ─────────────────────────────────────────────────────

  async seedDefaults(): Promise<void> {
    for (const [key, entry] of Object.entries(CONFIG_REGISTRY)) {
      // Check if already exists
      const { data: existing } = await vaasSupabase
        .from('platform_config')
        .select('key')
        .eq('key', key)
        .single();

      if (existing) continue; // Don't overwrite existing values

      const envValue = process.env[entry.env_key] || '';
      if (!envValue) continue; // Don't seed empty values

      const storedValue = entry.is_secret ? encrypt(envValue) : envValue;

      await vaasSupabase.from('platform_config').insert({
        key,
        value: storedValue,
        category: entry.category,
        is_secret: entry.is_secret,
        requires_restart: entry.requires_restart,
        description: entry.description,
      });
    }

    console.log('[PlatformConfig] Default config seeded from environment');
  }

  // ── Audit History ─────────────────────────────────────────────────────

  async getAuditHistory(params: { key?: string; page?: number; per_page?: number } = {}): Promise<{ audits: PlatformConfigAudit[]; total: number }> {
    const { key, page = 1, per_page = 25 } = params;
    const offset = (page - 1) * per_page;

    let query = vaasSupabase
      .from('platform_config_audit')
      .select('*', { count: 'exact' })
      .order('changed_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (key) query = query.eq('config_key', key);

    const { data, error, count } = await query;

    if (error) return { audits: [], total: 0 };
    return { audits: (data || []) as PlatformConfigAudit[], total: count || 0 };
  }
}

export const platformConfigService = PlatformConfigService.getInstance();
