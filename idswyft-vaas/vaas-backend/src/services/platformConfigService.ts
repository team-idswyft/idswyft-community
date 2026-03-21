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
  // ── VaaS Backend — Core ─────────────────────────────────────────────
  NODE_ENV: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'Runtime environment (development, production, test)', env_key: 'NODE_ENV' },
  VAAS_PORT: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'Server port for VaaS backend', env_key: 'VAAS_PORT' },
  VAAS_CORS_ORIGINS: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'Comma-separated allowed CORS origins (merged with built-in production domains)', env_key: 'VAAS_CORS_ORIGINS' },
  VAAS_FRONTEND_URL: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'VaaS admin frontend URL for redirects and email links', env_key: 'VAAS_FRONTEND_URL' },
  VAAS_WEBHOOK_BASE_URL: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'Base URL for outbound webhook deliveries', env_key: 'VAAS_WEBHOOK_BASE_URL' },
  VAAS_SUPER_ADMIN_EMAILS: { category: 'VaaS Core', is_secret: false, requires_restart: true, description: 'Comma-separated emails auto-granted super_admin on first login', env_key: 'VAAS_SUPER_ADMIN_EMAILS' },

  // ── VaaS Backend — Database ─────────────────────────────────────────
  VAAS_SUPABASE_URL: { category: 'VaaS Database', is_secret: false, requires_restart: true, description: 'VaaS Supabase project URL', env_key: 'VAAS_SUPABASE_URL' },
  VAAS_SUPABASE_ANON_KEY: { category: 'VaaS Database', is_secret: true, requires_restart: true, description: 'VaaS Supabase anonymous/public key', env_key: 'VAAS_SUPABASE_ANON_KEY' },
  VAAS_SUPABASE_SERVICE_ROLE_KEY: { category: 'VaaS Database', is_secret: true, requires_restart: true, description: 'VaaS Supabase service role key (full DB access)', env_key: 'VAAS_SUPABASE_SERVICE_ROLE_KEY' },

  // ── VaaS Backend — Security ─────────────────────────────────────────
  VAAS_JWT_SECRET: { category: 'VaaS Security', is_secret: true, requires_restart: true, description: 'JWT signing secret for VaaS auth tokens', env_key: 'VAAS_JWT_SECRET' },
  VAAS_API_KEY_SECRET: { category: 'VaaS Security', is_secret: true, requires_restart: true, description: 'Encryption key for API key hashing', env_key: 'VAAS_API_KEY_SECRET' },
  IDSWYFT_WEBHOOK_SECRET: { category: 'VaaS Security', is_secret: true, requires_restart: true, description: 'HMAC signing secret for webhook payloads', env_key: 'IDSWYFT_WEBHOOK_SECRET' },

  // ── VaaS Backend — Email ────────────────────────────────────────────
  RESEND_API_KEY: { category: 'VaaS Email', is_secret: true, requires_restart: false, description: 'Resend API key — primary email provider', env_key: 'RESEND_API_KEY' },
  EMAIL_FROM: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'Default sender address (e.g. noreply@mail.idswyft.app)', env_key: 'EMAIL_FROM' },
  ADMIN_NOTIFICATION_EMAIL: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'Email address for platform admin alerts', env_key: 'ADMIN_NOTIFICATION_EMAIL' },
  MAILGUN_API_KEY: { category: 'VaaS Email', is_secret: true, requires_restart: false, description: 'Mailgun API key (fallback email provider)', env_key: 'MAILGUN_API_KEY' },
  MAILGUN_DOMAIN: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'Mailgun sending domain', env_key: 'MAILGUN_DOMAIN' },
  MAILGUN_FROM: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'Mailgun sender address', env_key: 'MAILGUN_FROM' },
  SMTP_HOST: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'SMTP server hostname', env_key: 'SMTP_HOST' },
  SMTP_PORT: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'SMTP server port (typically 587 for TLS)', env_key: 'SMTP_PORT' },
  SMTP_USER: { category: 'VaaS Email', is_secret: false, requires_restart: false, description: 'SMTP authentication username', env_key: 'SMTP_USER' },
  SMTP_PASS: { category: 'VaaS Email', is_secret: true, requires_restart: false, description: 'SMTP authentication password', env_key: 'SMTP_PASS' },

  // ── VaaS Backend — Integration ──────────────────────────────────────
  IDSWYFT_API_URL: { category: 'VaaS Integration', is_secret: false, requires_restart: true, description: 'Main Idswyft API base URL for service-to-service calls', env_key: 'IDSWYFT_API_URL' },
  IDSWYFT_SERVICE_TOKEN: { category: 'VaaS Integration', is_secret: true, requires_restart: true, description: 'Service-to-service auth token (X-Service-Token header)', env_key: 'IDSWYFT_SERVICE_TOKEN' },
  IDSWYFT_API_TIMEOUT: { category: 'VaaS Integration', is_secret: false, requires_restart: true, description: 'Main API call timeout in milliseconds', env_key: 'IDSWYFT_API_TIMEOUT' },
  MAIN_API_SUPABASE_URL: { category: 'VaaS Integration', is_secret: false, requires_restart: true, description: 'Main project Supabase URL (for cross-project queries)', env_key: 'MAIN_API_SUPABASE_URL' },
  MAIN_API_SUPABASE_ANON_KEY: { category: 'VaaS Integration', is_secret: true, requires_restart: true, description: 'Main project Supabase anon key', env_key: 'MAIN_API_SUPABASE_ANON_KEY' },
  MAIN_API_SUPABASE_SERVICE_ROLE_KEY: { category: 'VaaS Integration', is_secret: true, requires_restart: true, description: 'Main project Supabase service role key', env_key: 'MAIN_API_SUPABASE_SERVICE_ROLE_KEY' },

  // ── VaaS Backend — Features ─────────────────────────────────────────
  VAAS_WEBHOOKS_ENABLED: { category: 'VaaS Features', is_secret: false, requires_restart: false, description: 'Enable outbound webhook notifications to org endpoints', env_key: 'VAAS_WEBHOOKS_ENABLED' },
  VAAS_BILLING_ENABLED: { category: 'VaaS Features', is_secret: false, requires_restart: false, description: 'Enable Stripe billing and subscription features', env_key: 'VAAS_BILLING_ENABLED' },
  VAAS_ANALYTICS_ENABLED: { category: 'VaaS Features', is_secret: false, requires_restart: false, description: 'Enable analytics dashboard and usage metrics', env_key: 'VAAS_ANALYTICS_ENABLED' },
  VAAS_CUSTOM_DOMAINS_ENABLED: { category: 'VaaS Features', is_secret: false, requires_restart: false, description: 'Allow organizations to use custom domains', env_key: 'VAAS_CUSTOM_DOMAINS_ENABLED' },

  // ── VaaS Backend — Rate Limits ──────────────────────────────────────
  VAAS_RATE_LIMIT_WINDOW_MS: { category: 'VaaS Rate Limits', is_secret: false, requires_restart: false, description: 'Sliding window duration in ms (default: 3600000 = 1 hour)', env_key: 'VAAS_RATE_LIMIT_WINDOW_MS' },
  VAAS_RATE_LIMIT_MAX_REQUESTS_PER_ORG: { category: 'VaaS Rate Limits', is_secret: false, requires_restart: false, description: 'Max API requests per organization per window', env_key: 'VAAS_RATE_LIMIT_MAX_REQUESTS_PER_ORG' },
  VAAS_RATE_LIMIT_MAX_REQUESTS_PER_USER: { category: 'VaaS Rate Limits', is_secret: false, requires_restart: false, description: 'Max API requests per user per window', env_key: 'VAAS_RATE_LIMIT_MAX_REQUESTS_PER_USER' },

  // ── VaaS Backend — Storage ──────────────────────────────────────────
  VAAS_STORAGE_PROVIDER: { category: 'VaaS Storage', is_secret: false, requires_restart: true, description: 'File storage backend: local, s3, or supabase', env_key: 'VAAS_STORAGE_PROVIDER' },
  VAAS_MAX_FILE_SIZE: { category: 'VaaS Storage', is_secret: false, requires_restart: true, description: 'Max upload size in bytes (default: 10485760 = 10 MB)', env_key: 'VAAS_MAX_FILE_SIZE' },

  // ── VaaS Backend — Monitoring ───────────────────────────────────────
  SENTRY_DSN: { category: 'VaaS Monitoring', is_secret: true, requires_restart: false, description: 'Sentry DSN for error tracking and performance monitoring', env_key: 'SENTRY_DSN' },
  LOG_LEVEL: { category: 'VaaS Monitoring', is_secret: false, requires_restart: false, description: 'Log verbosity: debug, info, warn, error', env_key: 'LOG_LEVEL' },

  // ── Main API — Core ─────────────────────────────────────────────────
  CORS_ORIGINS: { category: 'Main API Core', is_secret: false, requires_restart: true, description: 'Comma-separated allowed CORS origins for main API', env_key: 'CORS_ORIGINS' },

  // ── Main API — Database ─────────────────────────────────────────────
  DATABASE_URL: { category: 'Main API Database', is_secret: true, requires_restart: true, description: 'Direct Postgres connection string for main API', env_key: 'DATABASE_URL' },
  SUPABASE_URL: { category: 'Main API Database', is_secret: false, requires_restart: true, description: 'Main project Supabase URL', env_key: 'SUPABASE_URL' },
  SUPABASE_ANON_KEY: { category: 'Main API Database', is_secret: true, requires_restart: true, description: 'Main project Supabase anonymous key', env_key: 'SUPABASE_ANON_KEY' },
  SUPABASE_SERVICE_ROLE_KEY: { category: 'Main API Database', is_secret: true, requires_restart: true, description: 'Main project Supabase service role key (full DB access)', env_key: 'SUPABASE_SERVICE_ROLE_KEY' },

  // ── Main API — Security ─────────────────────────────────────────────
  JWT_SECRET: { category: 'Main API Security', is_secret: true, requires_restart: true, description: 'JWT signing secret for main API auth tokens', env_key: 'JWT_SECRET' },
  API_KEY_SECRET: { category: 'Main API Security', is_secret: true, requires_restart: true, description: 'Encryption key for developer API key hashing', env_key: 'API_KEY_SECRET' },
  SERVICE_TOKEN: { category: 'Main API Security', is_secret: true, requires_restart: true, description: 'Service-to-service auth token (must match IDSWYFT_SERVICE_TOKEN on VaaS)', env_key: 'SERVICE_TOKEN' },

  // ── Main API — OAuth ────────────────────────────────────────────────
  GITHUB_CLIENT_ID: { category: 'Main API OAuth', is_secret: false, requires_restart: true, description: 'GitHub OAuth app client ID for developer login', env_key: 'GITHUB_CLIENT_ID' },
  GITHUB_CLIENT_SECRET: { category: 'Main API OAuth', is_secret: true, requires_restart: true, description: 'GitHub OAuth app client secret', env_key: 'GITHUB_CLIENT_SECRET' },
  GITHUB_REDIRECT_URI: { category: 'Main API OAuth', is_secret: false, requires_restart: true, description: 'GitHub OAuth callback URL', env_key: 'GITHUB_REDIRECT_URI' },

  // ── Main API — AI ───────────────────────────────────────────────────
  OPENAI_API_KEY: { category: 'Main API AI', is_secret: true, requires_restart: true, description: 'OpenAI API key for document analysis assistance', env_key: 'OPENAI_API_KEY' },

  // ── VaaS Admin (Frontend) ───────────────────────────────────────────
  VAAS_ADMIN_VITE_API_URL: { category: 'VaaS Admin', is_secret: false, requires_restart: true, description: 'VaaS backend API URL used by the org admin frontend (build-time, requires redeploy)', env_key: 'VITE_API_URL' },
  VAAS_ADMIN_VITE_API_TIMEOUT: { category: 'VaaS Admin', is_secret: false, requires_restart: true, description: 'API request timeout in ms for the org admin frontend (build-time)', env_key: 'VITE_API_TIMEOUT' },
  VAAS_ADMIN_VITE_MOCK_AUTH_ENABLED: { category: 'VaaS Admin', is_secret: false, requires_restart: true, description: 'Enable mock auth bypass for local development (build-time)', env_key: 'VITE_MOCK_AUTH_ENABLED' },
  VAAS_ADMIN_VITE_NODE_ENV: { category: 'VaaS Admin', is_secret: false, requires_restart: true, description: 'Node environment for the org admin frontend build (build-time)', env_key: 'VITE_NODE_ENV' },

  // ── Platform Admin (Frontend) ───────────────────────────────────────
  PLATFORM_ADMIN_VITE_API_URL: { category: 'Platform Admin', is_secret: false, requires_restart: true, description: 'VaaS backend API URL used by the platform admin frontend (build-time, requires redeploy)', env_key: 'VITE_API_URL' },
  PLATFORM_ADMIN_VITE_NODE_ENV: { category: 'Platform Admin', is_secret: false, requires_restart: true, description: 'Node environment for the platform admin frontend build (build-time)', env_key: 'VITE_NODE_ENV' },
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
        .select('key, category, description')
        .eq('key', key)
        .single();

      if (existing) {
        // Update category/description if they changed (e.g. service regrouping)
        if (existing.category !== entry.category || existing.description !== entry.description) {
          await vaasSupabase.from('platform_config').update({
            category: entry.category,
            description: entry.description,
            is_secret: entry.is_secret,
            requires_restart: entry.requires_restart,
          }).eq('key', key);
        }
        continue;
      }

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
