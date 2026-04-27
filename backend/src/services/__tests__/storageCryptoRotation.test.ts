/**
 * End-to-end test for the key rotation workflow.
 *
 * The full operational rotation runs as a separate script
 * (backend/scripts/rotate-encryption-key.ts), which spawns a process and
 * walks the filesystem. Here we test the *primitive* the script relies on:
 * a buffer encrypted under key A can be decrypted via the multi-candidate
 * decrypt path and re-encrypted under key B, with the result decryptable
 * only by key B once the candidate list no longer includes A.
 *
 * This proves the rotation algorithm is correct independently of the
 * filesystem walking code in the script.
 */

import { describe, it, expect } from 'vitest';
import {
  encryptBlob,
  decryptBlob,
} from '../storageCrypto.js';

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);
const KEY_C = 'c'.repeat(32);

describe('Key rotation primitive', () => {
  it('rewraps a file from key A to key B without changing the plaintext', () => {
    const plaintext = Buffer.from('content that must survive rotation');

    // Stage 0: file encrypted under key A.
    const blobA = encryptBlob(plaintext, KEY_A);

    // Stage 1: rotation begins — both keys configured. Read still works.
    const recoveredDuringRotation = decryptBlob(blobA, [KEY_B, KEY_A]);
    expect(recoveredDuringRotation.equals(plaintext)).toBe(true);

    // Stage 2: rotation script re-wraps under key B (the new current).
    const blobB = encryptBlob(recoveredDuringRotation, KEY_B);

    // Sanity: the new blob is different bytes (fresh nonces).
    expect(blobB.equals(blobA)).toBe(false);

    // Stage 3: previous key retired. Read with current key only — succeeds.
    const recoveredAfterRotation = decryptBlob(blobB, [KEY_B]);
    expect(recoveredAfterRotation.equals(plaintext)).toBe(true);

    // Old blob is no longer decryptable with the current keys alone — proves
    // that retiring the previous key truly cuts off access to the old
    // ciphertext, which is the whole point of the script's stage-2 sweep.
    expect(() => decryptBlob(blobA, [KEY_B])).toThrow();
  });

  it('idempotent re-rotation: rewrapping an already-current file produces a different blob but same plaintext', () => {
    const plaintext = Buffer.from('idempotency check');

    const blob1 = encryptBlob(plaintext, KEY_A);
    const recovered1 = decryptBlob(blob1, [KEY_A]);
    const blob2 = encryptBlob(recovered1, KEY_A);

    // Different bytes (fresh nonces every encrypt) — that's expected.
    expect(blob2.equals(blob1)).toBe(false);

    // Both decrypt to the same plaintext.
    expect(decryptBlob(blob1, [KEY_A]).equals(plaintext)).toBe(true);
    expect(decryptBlob(blob2, [KEY_A]).equals(plaintext)).toBe(true);
  });

  it('three-way rotation A → B → C: each step is fully independent', () => {
    const plaintext = Buffer.from('content surviving multiple rotations');

    // A → B
    const blobA = encryptBlob(plaintext, KEY_A);
    const recoveredFromA = decryptBlob(blobA, [KEY_B, KEY_A]);
    const blobB = encryptBlob(recoveredFromA, KEY_B);

    // B → C
    const recoveredFromB = decryptBlob(blobB, [KEY_C, KEY_B]);
    const blobC = encryptBlob(recoveredFromB, KEY_C);

    // Final: only key C decrypts.
    expect(decryptBlob(blobC, [KEY_C]).equals(plaintext)).toBe(true);
    expect(() => decryptBlob(blobC, [KEY_A, KEY_B])).toThrow();
  });
});
