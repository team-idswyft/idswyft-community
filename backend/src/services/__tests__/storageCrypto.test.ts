/**
 * Unit tests for envelope encryption (storageCrypto.ts).
 *
 * Covers:
 *   - Round-trip encrypt → decrypt yields original buffer
 *   - Wrong master key fails to decrypt (auth tag mismatch)
 *   - Tampered ciphertext, nonce, or tag fails to decrypt
 *   - Legacy plaintext files pass through (magic-byte detection)
 *   - Multiple master key candidates: rotation scenario
 *   - Edge cases: tiny files, large files, binary content
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  encryptBlob,
  decryptBlob,
  isEncryptedBlob,
  maybeDecryptBlob,
} from '../storageCrypto.js';

const MASTER_KEY = 'a'.repeat(32);                              // 32 chars min
const ANOTHER_KEY = 'b'.repeat(32);
const PREVIOUS_KEY = 'c'.repeat(32);

describe('isEncryptedBlob', () => {
  it('returns true for properly framed IDSW v1 blobs', () => {
    const blob = encryptBlob(Buffer.from('hello'), MASTER_KEY);
    expect(isEncryptedBlob(blob)).toBe(true);
  });

  it('returns false for plaintext (no magic prefix)', () => {
    expect(isEncryptedBlob(Buffer.from('hello world'))).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isEncryptedBlob(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for a buffer too short to contain the magic', () => {
    expect(isEncryptedBlob(Buffer.from([0x49, 0x44]))).toBe(false);
  });

  it('returns false when magic matches but version byte is unrecognized', () => {
    const fake = Buffer.concat([Buffer.from('IDSW'), Buffer.from([0x99])]);
    expect(isEncryptedBlob(fake)).toBe(false);
  });

  it('returns false for a real-looking JPEG file (FFD8FF...)', () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isEncryptedBlob(fakeJpeg)).toBe(false);
  });
});

describe('encryptBlob → decryptBlob round trip', () => {
  it('recovers the original plaintext for a small buffer', () => {
    const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog');
    const blob = encryptBlob(plaintext, MASTER_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY]);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('recovers the original plaintext for an empty buffer', () => {
    const plaintext = Buffer.alloc(0);
    const blob = encryptBlob(plaintext, MASTER_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY]);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('recovers the original plaintext for binary content (non-UTF8)', () => {
    const plaintext = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x7f, 0xfe, 0xfd, 0xfc]);
    const blob = encryptBlob(plaintext, MASTER_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY]);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('recovers the original plaintext for a 1MB buffer', () => {
    const plaintext = crypto.randomBytes(1024 * 1024);
    const blob = encryptBlob(plaintext, MASTER_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY]);
    expect(recovered.length).toBe(plaintext.length);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('produces different ciphertexts for the same plaintext (random nonces)', () => {
    const plaintext = Buffer.from('same plaintext');
    const blob1 = encryptBlob(plaintext, MASTER_KEY);
    const blob2 = encryptBlob(plaintext, MASTER_KEY);
    expect(blob1.equals(blob2)).toBe(false);
    // Both still decrypt to the same plaintext.
    expect(decryptBlob(blob1, [MASTER_KEY]).equals(plaintext)).toBe(true);
    expect(decryptBlob(blob2, [MASTER_KEY]).equals(plaintext)).toBe(true);
  });

  it('produces a blob larger than the plaintext by exactly the header size (93 bytes)', () => {
    const plaintext = Buffer.from('x'.repeat(100));
    const blob = encryptBlob(plaintext, MASTER_KEY);
    expect(blob.length).toBe(plaintext.length + 93);
  });
});

describe('decryptBlob — failure cases', () => {
  it('throws on wrong master key', () => {
    const blob = encryptBlob(Buffer.from('secret'), MASTER_KEY);
    expect(() => decryptBlob(blob, [ANOTHER_KEY])).toThrow();
  });

  it('throws when the encrypted DEK has been tampered with', () => {
    const blob = encryptBlob(Buffer.from('secret'), MASTER_KEY);
    // Encrypted DEK lives at offset 5 + 12 + 16 = 33 (after magic, version,
    // dek nonce, dek tag). Flip a bit to corrupt it.
    const tampered = Buffer.from(blob);
    tampered[33] ^= 0x01;
    expect(() => decryptBlob(tampered, [MASTER_KEY])).toThrow();
  });

  it('throws when the file ciphertext has been tampered with', () => {
    const blob = encryptBlob(Buffer.from('hello world this is the file body'), MASTER_KEY);
    // File ciphertext starts after the full 93-byte header.
    const tampered = Buffer.from(blob);
    tampered[blob.length - 1] ^= 0x01;
    expect(() => decryptBlob(tampered, [MASTER_KEY])).toThrow();
  });

  it('throws on plaintext input (no magic prefix)', () => {
    expect(() => decryptBlob(Buffer.from('not encrypted'), [MASTER_KEY])).toThrow();
  });

  it('throws when no master key candidates are provided', () => {
    const blob = encryptBlob(Buffer.from('secret'), MASTER_KEY);
    expect(() => decryptBlob(blob, [])).toThrow();
  });

  it('throws when blob is too short to contain a full header', () => {
    const stub = Buffer.concat([Buffer.from('IDSW'), Buffer.from([0x01]), Buffer.alloc(10)]);
    expect(() => decryptBlob(stub, [MASTER_KEY])).toThrow();
  });

  it('rejects master keys shorter than 32 chars (defensive)', () => {
    expect(() => encryptBlob(Buffer.from('x'), 'tooshort')).toThrow();
  });
});

describe('decryptBlob — multiple key candidates (rotation scenario)', () => {
  it('finds the correct key when it is first in the list', () => {
    const blob = encryptBlob(Buffer.from('rotated content'), MASTER_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY, PREVIOUS_KEY]);
    expect(recovered.toString()).toBe('rotated content');
  });

  it('finds the correct key when it is second in the list (file under previous key)', () => {
    // Simulate: file was encrypted under PREVIOUS_KEY, now we have rotated.
    // The new ENCRYPTION_KEY is MASTER_KEY; PREVIOUS_KEY is the fallback.
    const blob = encryptBlob(Buffer.from('encrypted-under-previous'), PREVIOUS_KEY);
    const recovered = decryptBlob(blob, [MASTER_KEY, PREVIOUS_KEY]);
    expect(recovered.toString()).toBe('encrypted-under-previous');
  });

  it('throws when none of the candidate keys match', () => {
    const blob = encryptBlob(Buffer.from('mystery content'), 'd'.repeat(32));
    expect(() => decryptBlob(blob, [MASTER_KEY, PREVIOUS_KEY])).toThrow();
  });
});

describe('maybeDecryptBlob (read-path helper)', () => {
  it('returns the buffer unchanged when it is plaintext (legacy file)', () => {
    const plaintext = Buffer.from('legacy unencrypted content');
    const result = maybeDecryptBlob(plaintext, [MASTER_KEY]);
    expect(result.equals(plaintext)).toBe(true);
    expect(result).toBe(plaintext);  // same reference, no copy
  });

  it('decrypts when buffer is in IDSW envelope format', () => {
    const original = Buffer.from('encrypted file body');
    const blob = encryptBlob(original, MASTER_KEY);
    const result = maybeDecryptBlob(blob, [MASTER_KEY]);
    expect(result.equals(original)).toBe(true);
  });

  it('throws when the buffer looks encrypted but the key is wrong', () => {
    // This is intentional: a file that claims to be encrypted but can't be
    // decrypted is more likely tampered/corrupted than legacy plaintext.
    const blob = encryptBlob(Buffer.from('whatever'), MASTER_KEY);
    expect(() => maybeDecryptBlob(blob, [ANOTHER_KEY])).toThrow();
  });
});
