import { vaasSupabase } from '../config/database.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────

type StorageType = 'default' | 's3' | 'supabase' | 'gcs';

interface StorageSettings {
  storage_type: StorageType;
  data_region?: string;
  config: Record<string, string>;
  retention_days?: number;
  auto_delete_completed?: boolean;
  encryption_enabled?: boolean;
}

interface CacheEntry {
  settings: StorageSettings;
  settingsHash: string;
  s3Client?: any; // S3Client — dynamically imported
  supabaseClient?: SupabaseClient;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_BUCKET = 'vaas-documents';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

// ─── Path prefix utilities ──────────────────────────────────────────

/**
 * Encode provider + path into a prefixed string.
 * Format: `provider:inner/path`
 */
function encodePath(provider: string, innerPath: string): string {
  return `${provider}:${innerPath}`;
}

/**
 * Decode a prefixed path into { provider, path }.
 * Legacy `temp://` paths return provider 'temp'.
 */
export function decodePath(filePath: string): { provider: string; path: string } {
  if (filePath.startsWith('temp://')) {
    return { provider: 'temp', path: filePath.slice(7) };
  }
  const idx = filePath.indexOf(':');
  if (idx > 0 && idx < 20 && !filePath.startsWith('/')) {
    return { provider: filePath.substring(0, idx), path: filePath.substring(idx + 1) };
  }
  // Fallback — treat as default provider
  return { provider: 'default', path: filePath };
}

// ─── Secure filename ────────────────────────────────────────────────

/**
 * Generate a unique, traversal-safe filename.
 * Pattern: `{sessionId}_{timestamp}_{8-byte-hex}.{ext}`
 */
function generateSecureFileName(sessionId: string, originalName: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName).toLowerCase();
  // Strip everything except alphanumeric, dash, underscore from session ID
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safeSession}_${timestamp}_${random}${ext}`;
}

/**
 * Build the inner path for a document.
 * `org-{orgId}/{sessionId}/{docType}/{filename}`
 */
function buildInnerPath(orgId: string, sessionId: string, docType: string, filename: string): string {
  const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeType = docType.replace(/[^a-zA-Z0-9_-]/g, '');
  return `org-${safeOrg}/${safeSession}/${safeType}/${filename}`;
}

// ─── Validation ─────────────────────────────────────────────────────

function validatePathComponent(value: string, name: string): void {
  if (!value || value.includes('..') || value.includes('\0') || /[/\\]/.test(value)) {
    throw new Error(`Invalid ${name}: contains disallowed characters`);
  }
}

/**
 * Defense-in-depth: verify that the inner path starts with the expected org prefix.
 * Prevents one org's credentials from being used to sign/delete another org's files.
 */
function assertOrgOwnsPath(orgId: string, innerPath: string): void {
  const expectedPrefix = `org-${orgId.replace(/[^a-zA-Z0-9_-]/g, '')}/`;
  if (!innerPath.startsWith(expectedPrefix)) {
    throw new Error('File path does not belong to the requesting organization');
  }
}

// ─── Service ────────────────────────────────────────────────────────

class OrgStorageService {
  private cache = new Map<string, CacheEntry>();

  // ── Settings resolution ─────────────────────────────────────────

  private hashSettings(settings: StorageSettings): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(settings))
      .digest('hex')
      .slice(0, 16);
  }

  private async getOrgSettings(orgId: string): Promise<StorageSettings> {
    const { data, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('storage_settings')
      .eq('id', orgId)
      .single();

    if (error || !data) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const raw = (data.storage_settings as StorageSettings | null) || {};
    return {
      storage_type: (raw as any).storage_type || 'default',
      data_region: (raw as any).data_region || 'us-east-1',
      config: (raw as any).config || {},
      retention_days: (raw as any).retention_days ?? 365,
      auto_delete_completed: (raw as any).auto_delete_completed ?? false,
      encryption_enabled: (raw as any).encryption_enabled ?? true,
    };
  }

  private async resolveCache(orgId: string): Promise<CacheEntry> {
    const existing = this.cache.get(orgId);
    const now = Date.now();

    if (existing && now - existing.fetchedAt < CACHE_TTL_MS) {
      return existing;
    }

    const settings = await this.getOrgSettings(orgId);
    const hash = this.hashSettings(settings);

    // If settings haven't changed, refresh timestamp but reuse clients
    if (existing && existing.settingsHash === hash) {
      existing.fetchedAt = now;
      return existing;
    }

    // Build new entry — clients created lazily per provider
    const entry: CacheEntry = {
      settings,
      settingsHash: hash,
      fetchedAt: now,
    };
    this.cache.set(orgId, entry);
    return entry;
  }

  // ── Provider clients ────────────────────────────────────────────

  private async getS3Client(entry: CacheEntry): Promise<any> {
    if (entry.s3Client) return entry.s3Client;

    const cfg = entry.settings.config;
    if (!cfg.s3_access_key || !cfg.s3_secret_key) {
      throw new Error('S3 storage requires s3_access_key and s3_secret_key');
    }
    if (!cfg.s3_bucket) {
      throw new Error('S3 storage requires s3_bucket');
    }

    const { S3Client } = await import('@aws-sdk/client-s3');

    entry.s3Client = new S3Client({
      region: cfg.s3_region || entry.settings.data_region || 'us-east-1',
      credentials: {
        accessKeyId: cfg.s3_access_key,
        secretAccessKey: cfg.s3_secret_key,
      },
    });
    return entry.s3Client;
  }

  private getSupabaseClient(entry: CacheEntry): SupabaseClient {
    if (entry.supabaseClient) return entry.supabaseClient;

    const cfg = entry.settings.config;
    if (!cfg.supabase_url || !cfg.supabase_service_key) {
      throw new Error('Supabase storage requires supabase_url and supabase_service_key');
    }

    entry.supabaseClient = createClient(cfg.supabase_url, cfg.supabase_service_key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return entry.supabaseClient;
  }

  // ── Store document ──────────────────────────────────────────────

  async storeDocument(
    orgId: string,
    buffer: Buffer,
    originalFilename: string,
    mimetype: string,
    sessionId: string,
    docType: string
  ): Promise<string> {
    validatePathComponent(sessionId, 'sessionId');
    validatePathComponent(docType, 'docType');

    const entry = await this.resolveCache(orgId);
    const filename = generateSecureFileName(sessionId, originalFilename);
    const innerPath = buildInnerPath(orgId, sessionId, docType, filename);

    switch (entry.settings.storage_type) {
      case 'default':
        return this.storeInDefaultSupabase(buffer, innerPath, mimetype);
      case 's3':
        return this.storeInS3(entry, buffer, innerPath, mimetype);
      case 'supabase':
        return this.storeInOrgSupabase(entry, buffer, innerPath, mimetype);
      case 'gcs':
        throw new Error('GCS storage is not yet supported. Please use S3, Supabase, or the default provider.');
      default:
        throw new Error(`Unknown storage provider: ${entry.settings.storage_type}`);
    }
  }

  private async storeInDefaultSupabase(buffer: Buffer, innerPath: string, mimetype: string): Promise<string> {
    const { error } = await vaasSupabase.storage
      .from(DEFAULT_BUCKET)
      .upload(innerPath, buffer, {
        contentType: mimetype,
        duplex: 'half',
      });

    if (error) {
      console.error('[OrgStorage] Default Supabase upload failed:', error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return encodePath('default', innerPath);
  }

  private async storeInS3(entry: CacheEntry, buffer: Buffer, innerPath: string, mimetype: string): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getS3Client(entry);
    const bucket = entry.settings.config.s3_bucket;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: innerPath,
        Body: buffer,
        ContentType: mimetype,
        ServerSideEncryption: 'AES256',
      })
    );

    return encodePath('s3', innerPath);
  }

  private async storeInOrgSupabase(entry: CacheEntry, buffer: Buffer, innerPath: string, mimetype: string): Promise<string> {
    const client = this.getSupabaseClient(entry);
    const bucket = entry.settings.config.supabase_bucket;

    const { error } = await client.storage
      .from(bucket)
      .upload(innerPath, buffer, {
        contentType: mimetype,
        duplex: 'half',
      });

    if (error) {
      console.error('[OrgStorage] Org Supabase upload failed:', error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return encodePath('supabase', innerPath);
  }

  // ── Get signed URL ──────────────────────────────────────────────

  async getFileUrl(orgId: string, filePath: string, expiresIn: number = SIGNED_URL_EXPIRY): Promise<string> {
    const { provider, path: innerPath } = decodePath(filePath);

    if (provider === 'temp') {
      throw new Error('This document was stored before file storage was configured. No file data available.');
    }

    assertOrgOwnsPath(orgId, innerPath);
    const entry = await this.resolveCache(orgId);

    switch (provider) {
      case 'default':
        return this.getDefaultSignedUrl(innerPath, expiresIn);
      case 's3':
        return this.getS3SignedUrl(entry, innerPath, expiresIn);
      case 'supabase':
        return this.getOrgSupabaseSignedUrl(entry, innerPath, expiresIn);
      default:
        throw new Error(`Unknown storage provider in path: ${provider}`);
    }
  }

  private async getDefaultSignedUrl(innerPath: string, expiresIn: number): Promise<string> {
    const { data } = await vaasSupabase.storage
      .from(DEFAULT_BUCKET)
      .createSignedUrl(innerPath, expiresIn);

    if (!data?.signedUrl) {
      throw new Error('Failed to generate signed URL');
    }
    return data.signedUrl;
  }

  private async getS3SignedUrl(entry: CacheEntry, innerPath: string, expiresIn: number): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.getS3Client(entry);
    const bucket = entry.settings.config.s3_bucket;

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: innerPath }),
      { expiresIn }
    );
  }

  private async getOrgSupabaseSignedUrl(entry: CacheEntry, innerPath: string, expiresIn: number): Promise<string> {
    const client = this.getSupabaseClient(entry);
    const bucket = entry.settings.config.supabase_bucket;

    const { data } = await client.storage
      .from(bucket)
      .createSignedUrl(innerPath, expiresIn);

    if (!data?.signedUrl) {
      throw new Error('Failed to generate signed URL');
    }
    return data.signedUrl;
  }

  // ── Delete file ─────────────────────────────────────────────────

  async deleteFile(orgId: string, filePath: string): Promise<void> {
    const { provider, path: innerPath } = decodePath(filePath);

    if (provider === 'temp') {
      // Nothing to delete for legacy temp paths
      return;
    }

    assertOrgOwnsPath(orgId, innerPath);
    const entry = await this.resolveCache(orgId);

    switch (provider) {
      case 'default': {
        const { error } = await vaasSupabase.storage
          .from(DEFAULT_BUCKET)
          .remove([innerPath]);
        if (error) throw new Error(`Failed to delete from default storage: ${error.message}`);
        break;
      }
      case 's3': {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const client = await this.getS3Client(entry);
        await client.send(
          new DeleteObjectCommand({
            Bucket: entry.settings.config.s3_bucket,
            Key: innerPath,
          })
        );
        break;
      }
      case 'supabase': {
        const client = this.getSupabaseClient(entry);
        const { error } = await client.storage
          .from(entry.settings.config.supabase_bucket)
          .remove([innerPath]);
        if (error) throw new Error(`Failed to delete from org Supabase: ${error.message}`);
        break;
      }
      default:
        throw new Error(`Unknown storage provider in path: ${provider}`);
    }
  }

  // ── Default bucket initialization ───────────────────────────────

  async ensureDefaultBucket(): Promise<void> {
    const { error } = await vaasSupabase.storage.createBucket(DEFAULT_BUCKET, {
      public: false,
    });
    if (error && !error.message.includes('already exists')) {
      console.warn('[OrgStorage] Failed to create default bucket:', error.message);
    }
  }

  // ── Cache management ────────────────────────────────────────────

  invalidateCache(orgId: string): void {
    this.cache.delete(orgId);
  }

  /** Exposed for testing */
  _getCacheSize(): number {
    return this.cache.size;
  }
}

export const orgStorageService = new OrgStorageService();
