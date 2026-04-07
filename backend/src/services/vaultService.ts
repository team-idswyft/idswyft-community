import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '@/config/index.js';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import type { SessionState } from '@idswyft/shared';

// ─── Encryption ────────────────────────────────────────────────

function deriveKey(): Buffer {
  const key = config.encryptionKey;
  // If hex-encoded 32 bytes (64 hex chars), decode directly for full 256-bit entropy
  if (/^[0-9a-f]{64}$/i.test(key)) {
    return Buffer.from(key, 'hex');
  }
  // Otherwise, derive via SHA-256 to get exactly 32 bytes deterministically
  return createHash('sha256').update(key, 'utf8').digest();
}

export function encryptVaultData(data: Record<string, unknown>): string {
  const iv = randomBytes(12); // 96-bit nonce for GCM
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptVaultData(ciphertext: string): Record<string, unknown> {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid vault data format');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ─── Token Generation ──────────────────────────────────────────

export function generateVaultToken(): string {
  return `ivt_${randomBytes(32).toString('hex')}`;
}

export function generateShareToken(): string {
  return `shr_${randomBytes(32).toString('hex')}`;
}

// ─── Identity Data Extraction ──────────────────────────────────

export function extractIdentityData(state: SessionState): Record<string, unknown> | null {
  const ocr = state.front_extraction?.ocr;
  if (!ocr?.full_name) return null;

  return {
    full_name: ocr.full_name ?? null,
    date_of_birth: ocr.date_of_birth ?? null,
    document_number: ocr.document_number ?? null,
    nationality: ocr.nationality ?? null,
    address: ocr.address ?? null,
    document_type: ocr.document_type ?? null,
    expiry_date: ocr.expiry_date ?? null,
    face_match_score: state.face_match?.similarity_score ?? null,
    verified_at: state.completed_at ?? null,
  };
}

// ─── Attribute Resolver ────────────────────────────────────────

export function resolveAttribute(
  data: Record<string, unknown>,
  attr: string,
): { value: unknown } | null {
  // Age-based assertions
  const ageMatch = attr.match(/^age_over_(\d+)$/);
  if (ageMatch) {
    const threshold = parseInt(ageMatch[1], 10);
    const dob = data.date_of_birth as string | null;
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return { value: age >= threshold };
  }

  // Direct field lookups
  const fieldMap: Record<string, string> = {
    full_name: 'full_name',
    name: 'full_name',
    date_of_birth: 'date_of_birth',
    dob: 'date_of_birth',
    nationality: 'nationality',
    document_number: 'document_number',
    document_type: 'document_type',
    address: 'address',
    expiry_date: 'expiry_date',
    face_match_score: 'face_match_score',
    verified_at: 'verified_at',
    identity_verified: 'verified_at',
  };

  const field = fieldMap[attr];
  if (!field) return null;

  if (attr === 'identity_verified') {
    return { value: data.verified_at != null };
  }

  return data[field] !== undefined ? { value: data[field] } : null;
}

// ─── Database Operations ───────────────────────────────────────

export async function storeVaultEntry(
  developerId: string,
  verificationId: string,
  identityData: Record<string, unknown>,
  expiresAt?: Date,
): Promise<{ vault_token: string; id: string }> {
  const vaultToken = generateVaultToken();
  const encrypted = encryptVaultData(identityData);

  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + config.compliance.dataRetentionDays);

  const { data, error } = await supabase
    .from('identity_vault')
    .insert({
      developer_id: developerId,
      vault_token: vaultToken,
      verification_id: verificationId,
      encrypted_data: encrypted,
      encryption_key_id: 'v1',
      expires_at: (expiresAt ?? defaultExpiry).toISOString(),
    })
    .select('id, vault_token')
    .single();

  if (error) throw new Error(`Failed to store vault entry: ${error.message}`);

  logger.info(`[Vault] Stored entry for verification ${verificationId}`, {
    vault_token: vaultToken.slice(0, 12) + '...',
    developer_id: developerId,
  });

  return { vault_token: data.vault_token, id: data.id };
}

export async function retrieveVaultEntry(
  vaultToken: string,
  developerId: string,
): Promise<{ id: string; data: Record<string, unknown>; status: string; created_at: string; expires_at: string | null }> {
  const { data: entry, error } = await supabase
    .from('identity_vault')
    .select('id, encrypted_data, status, created_at, expires_at, access_count')
    .eq('vault_token', vaultToken)
    .eq('developer_id', developerId)
    .single();

  if (error || !entry) throw new Error('Vault entry not found');

  if (entry.status !== 'active') throw new Error('Vault entry is no longer active');

  if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
    await supabase.from('identity_vault').update({ status: 'expired' }).eq('id', entry.id);
    throw new Error('Vault entry has expired');
  }

  // Update access audit
  await supabase
    .from('identity_vault')
    .update({
      access_count: (entry.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', entry.id);

  const decrypted = decryptVaultData(entry.encrypted_data);

  return {
    id: entry.id,
    data: decrypted,
    status: entry.status,
    created_at: entry.created_at,
    expires_at: entry.expires_at,
  };
}

export async function deleteVaultEntry(
  vaultToken: string,
  developerId: string,
): Promise<void> {
  // Hard delete — GDPR erasure
  // vault_share_links are cascade-deleted via FK (ON DELETE CASCADE)
  const { data, error } = await supabase
    .from('identity_vault')
    .delete()
    .eq('vault_token', vaultToken)
    .eq('developer_id', developerId)
    .select('id');

  if (error) throw new Error(`Failed to delete vault entry: ${error.message}`);
  if (!data || data.length === 0) throw new Error('Vault entry not found');

  logger.info(`[Vault] GDPR erasure completed`, { vault_token: vaultToken.slice(0, 12) + '...' });
}
