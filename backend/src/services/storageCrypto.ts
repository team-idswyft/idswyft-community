/**
 * Envelope encryption for local file storage.
 *
 * Each file is encrypted under a per-file Data Encryption Key (DEK), and the
 * DEK itself is encrypted under a master key derived from `ENCRYPTION_KEY`.
 * This is the standard envelope pattern: rotating the master key only
 * requires re-wrapping the per-file DEKs, not re-encrypting every file.
 *
 * Format on disk (binary, no separators):
 *
 *   [4 bytes]  magic   = "IDSW"   — distinguishes encrypted from legacy plaintext
 *   [1 byte]   version = 0x01    — bumps if format changes
 *   [12 bytes] DEK nonce
 *   [16 bytes] DEK auth tag
 *   [32 bytes] encrypted DEK
 *   [12 bytes] file nonce
 *   [16 bytes] file auth tag
 *   [N bytes]  encrypted file
 *
 * Total header: 93 bytes. Files without the magic prefix are treated as
 * legacy plaintext on read (returned as-is). This is what makes the
 * `STORAGE_ENCRYPTION=true` flip safe for production: old files keep working.
 */

import crypto from 'crypto';

const MAGIC = Buffer.from('IDSW', 'ascii');                  // 4 bytes
const VERSION_V1 = 0x01;
const HEADER_PREFIX_LEN = MAGIC.length + 1;                  // magic + version
const NONCE_LEN = 12;                                        // GCM standard
const TAG_LEN = 16;
const DEK_LEN = 32;                                          // AES-256
const ENCRYPTED_DEK_LEN = DEK_LEN;                           // GCM is stream cipher → ciphertext same length as plaintext
const HEADER_LEN = HEADER_PREFIX_LEN + NONCE_LEN + TAG_LEN + ENCRYPTED_DEK_LEN + NONCE_LEN + TAG_LEN; // 93 bytes

const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_SALT = 'idswyft-storage-salt';          // distinct from secret-encryption salt

/** Derive a 32-byte AES key from arbitrary-length master key material. */
function deriveMasterKey(masterKeyMaterial: string): Buffer {
  return crypto.scryptSync(masterKeyMaterial, KEY_DERIVATION_SALT, 32);
}

/**
 * Detect whether a buffer is in the IDSW envelope-encrypted format.
 * Cheap O(1) check — just inspects the magic prefix.
 */
export function isEncryptedBlob(buffer: Buffer): boolean {
  if (buffer.length < HEADER_PREFIX_LEN) return false;
  return buffer.subarray(0, MAGIC.length).equals(MAGIC) && buffer[MAGIC.length] === VERSION_V1;
}

/**
 * Encrypt a plaintext buffer under the given master key. Returns the full
 * envelope-encrypted blob ready to write to disk.
 */
export function encryptBlob(plaintext: Buffer, masterKeyMaterial: string): Buffer {
  if (!masterKeyMaterial || masterKeyMaterial.length < 32) {
    throw new Error('Master key material must be at least 32 characters');
  }

  const masterKey = deriveMasterKey(masterKeyMaterial);

  // Generate a fresh DEK for this file.
  const dek = crypto.randomBytes(DEK_LEN);

  // Encrypt the DEK under the master key.
  const dekNonce = crypto.randomBytes(NONCE_LEN);
  const dekCipher = crypto.createCipheriv(ALGORITHM, masterKey, dekNonce);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  // Encrypt the file under the DEK.
  const fileNonce = crypto.randomBytes(NONCE_LEN);
  const fileCipher = crypto.createCipheriv(ALGORITHM, dek, fileNonce);
  const encryptedFile = Buffer.concat([fileCipher.update(plaintext), fileCipher.final()]);
  const fileTag = fileCipher.getAuthTag();

  // Assemble: magic | version | dekNonce | dekTag | encryptedDek | fileNonce | fileTag | encryptedFile
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_V1]),
    dekNonce,
    dekTag,
    encryptedDek,
    fileNonce,
    fileTag,
    encryptedFile,
  ]);
}

/**
 * Decrypt an envelope-encrypted blob. Tries each master key in order until
 * one successfully unwraps the DEK. Throws if all keys fail.
 *
 * Accepting multiple keys is what makes online key rotation possible:
 * during the rotation window, both the new and previous master keys are
 * configured; existing files (encrypted under the previous key) continue
 * to read while new writes use the current key.
 */
export function decryptBlob(blob: Buffer, masterKeyCandidates: string[]): Buffer {
  if (!isEncryptedBlob(blob)) {
    throw new Error('Buffer is not in IDSW envelope-encrypted format');
  }
  if (blob.length < HEADER_LEN) {
    throw new Error(`Envelope blob too short: expected at least ${HEADER_LEN} bytes, got ${blob.length}`);
  }
  if (masterKeyCandidates.length === 0) {
    throw new Error('At least one master key candidate is required');
  }

  // Parse header (offsets in bytes).
  let offset = HEADER_PREFIX_LEN;
  const dekNonce = blob.subarray(offset, offset + NONCE_LEN);              offset += NONCE_LEN;
  const dekTag = blob.subarray(offset, offset + TAG_LEN);                  offset += TAG_LEN;
  const encryptedDek = blob.subarray(offset, offset + ENCRYPTED_DEK_LEN);  offset += ENCRYPTED_DEK_LEN;
  const fileNonce = blob.subarray(offset, offset + NONCE_LEN);             offset += NONCE_LEN;
  const fileTag = blob.subarray(offset, offset + TAG_LEN);                 offset += TAG_LEN;
  const encryptedFile = blob.subarray(offset);

  // Try each master key candidate. The DEK auth tag is what tells us
  // whether the master key matches — a wrong key produces an auth failure
  // before we ever touch the file ciphertext.
  let lastError: Error | null = null;
  for (const candidate of masterKeyCandidates) {
    try {
      const masterKey = deriveMasterKey(candidate);
      const dekDecipher = crypto.createDecipheriv(ALGORITHM, masterKey, dekNonce);
      dekDecipher.setAuthTag(dekTag);
      const dek = Buffer.concat([dekDecipher.update(encryptedDek), dekDecipher.final()]);

      // DEK successfully unwrapped — now decrypt the file.
      const fileDecipher = crypto.createDecipheriv(ALGORITHM, dek, fileNonce);
      fileDecipher.setAuthTag(fileTag);
      return Buffer.concat([fileDecipher.update(encryptedFile), fileDecipher.final()]);
    } catch (e) {
      lastError = e as Error;
      // Try the next candidate.
    }
  }

  // None of the candidate keys could unwrap the DEK.
  throw new Error(`Failed to decrypt blob with any of ${masterKeyCandidates.length} candidate keys: ${lastError?.message ?? 'unknown'}`);
}

/**
 * Read-side helper: if the buffer is encrypted, decrypt it; otherwise
 * (legacy plaintext) return as-is. Used by storage.ts:downloadFile to
 * support a mixed population of encrypted and pre-encryption files.
 */
export function maybeDecryptBlob(buffer: Buffer, masterKeyCandidates: string[]): Buffer {
  if (!isEncryptedBlob(buffer)) {
    return buffer;
  }
  return decryptBlob(buffer, masterKeyCandidates);
}
