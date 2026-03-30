/**
 * AES-256-GCM encryption for storing third-party API keys at rest.
 * Uses the platform ENCRYPTION_KEY (32+ chars) as the key material.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'idswyft-llm-key-salt', 32);
}

/**
 * Encrypt a plaintext string -> base64-encoded ciphertext (iv:tag:encrypted).
 */
export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string (iv:tag:encrypted) -> plaintext.
 */
export function decryptSecret(ciphertext: string, encryptionKey: string): string {
  const [ivHex, tagHex, encrypted] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encrypted) {
    throw new Error('Invalid ciphertext format');
  }

  const key = deriveKey(encryptionKey);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Mask an API key for display: show first 4 and last 4 chars.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 10) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
