/**
 * Integration tests for envelope encryption in StorageService (local provider).
 *
 * Uses the real filesystem (tmp directory) so we exercise the full path:
 *   storeLocally → fs.writeFile → ... → fs.readFile → downloadFile → maybeDecryptBlob
 *
 * Pure-unit tests live in services/__tests__/storageCrypto.test.ts. This file
 * complements those by catching integration bugs (path handling, buffer copies,
 * config wiring) that mocks would miss.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Configure mocks with a per-test mutable flag for STORAGE_ENCRYPTION.
// vi.hoisted() lets us reference mockConfig from the vi.mock factory below,
// since vi.mock calls are hoisted to the top of the file.
const mockConfig = vi.hoisted(() => ({
  nodeEnv: 'test',
  encryptionKey: 'test-master-key-for-storage-encryption-32chars',
  storage: {
    provider: 'local' as const,
    encryption: false,                     // toggled per test
    encryptionKeyPrevious: undefined as string | undefined,
  },
  supabase: {
    storageBucket: 'identity-documents',
    vaasBucket: 'vaas-documents',
    demoBucket: 'demo-documents',
  },
}));

vi.mock('@/config/index.js', () => ({ default: mockConfig }));

vi.mock('@/config/database.js', () => ({
  supabase: { storage: { from: vi.fn() }, from: vi.fn() },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { StorageService } from '../../services/storage.js';

let svc: StorageService;
let originalCwd: string;
let tmpRoot: string;

beforeEach(async () => {
  // Run each test in its own tmp dir so files don't collide.
  originalCwd = process.cwd();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'idswyft-storage-test-'));
  process.chdir(tmpRoot);
  svc = new StorageService();
  // Reset encryption flag to off by default; tests opt in.
  mockConfig.storage.encryption = false;
  mockConfig.storage.encryptionKeyPrevious = undefined;
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('StorageService local provider — envelope encryption', () => {
  it('writes plaintext to disk when STORAGE_ENCRYPTION=false', async () => {
    const buffer = Buffer.from('plaintext document content');
    const stored = await svc.storeDocument(buffer, 'doc.jpg', 'image/jpeg', 'verif-1');

    const onDisk = await fs.readFile(path.join(tmpRoot, stored));
    expect(onDisk.equals(buffer)).toBe(true);

    // Round-trip through downloadFile returns the same content.
    const downloaded = await svc.downloadFile(stored);
    expect(downloaded.equals(buffer)).toBe(true);
  });

  it('writes encrypted bytes to disk when STORAGE_ENCRYPTION=true', async () => {
    mockConfig.storage.encryption = true;

    const buffer = Buffer.from('sensitive document content');
    const stored = await svc.storeDocument(buffer, 'doc.jpg', 'image/jpeg', 'verif-2');

    // Bytes on disk should NOT be the original plaintext — they should be
    // an envelope-encrypted blob with the IDSW magic prefix.
    const onDisk = await fs.readFile(path.join(tmpRoot, stored));
    expect(onDisk.subarray(0, 4).toString('ascii')).toBe('IDSW');
    expect(onDisk[4]).toBe(0x01);                       // version
    expect(onDisk.equals(buffer)).toBe(false);
    expect(onDisk.length).toBe(buffer.length + 93);     // header overhead
  });

  it('round-trips encrypted file through downloadFile', async () => {
    mockConfig.storage.encryption = true;

    const buffer = Buffer.from('round-trip test content');
    const stored = await svc.storeDocument(buffer, 'doc.png', 'image/png', 'verif-3');

    const downloaded = await svc.downloadFile(stored);
    expect(downloaded.equals(buffer)).toBe(true);
  });

  it('reads legacy plaintext files even after encryption is enabled', async () => {
    // Write a plaintext file directly (simulates a pre-encryption-era file).
    mockConfig.storage.encryption = false;
    const legacy = Buffer.from('legacy file from before STORAGE_ENCRYPTION shipped');
    const stored = await svc.storeDocument(legacy, 'old.jpg', 'image/jpeg', 'verif-old');

    // Now flip encryption ON and read the legacy file. The read path
    // detects the missing magic prefix and returns the buffer unchanged.
    mockConfig.storage.encryption = true;
    const downloaded = await svc.downloadFile(stored);
    expect(downloaded.equals(legacy)).toBe(true);
  });

  it('survives a key rotation scenario via encryptionKeyPrevious', async () => {
    const previousKey = 'previous-master-key-32chars-XXXXXXXXX';
    const currentKey = 'current-master-key-32chars-YYYYYYYYY';

    // Encrypt a file under the previous key.
    mockConfig.storage.encryption = true;
    mockConfig.encryptionKey = previousKey;
    const buffer = Buffer.from('content from before rotation');
    const stored = await svc.storeDocument(buffer, 'old.jpg', 'image/jpeg', 'verif-rot');

    // Rotate: current key changes, previous key is configured as fallback.
    mockConfig.encryptionKey = currentKey;
    mockConfig.storage.encryptionKeyPrevious = previousKey;

    // Read still works — the previous-key fallback unwraps the DEK.
    const downloaded = await svc.downloadFile(stored);
    expect(downloaded.equals(buffer)).toBe(true);

    // New writes go through the current key.
    const fresh = Buffer.from('content from after rotation');
    const newStored = await svc.storeDocument(fresh, 'new.jpg', 'image/jpeg', 'verif-new');

    // Read both — both succeed.
    expect((await svc.downloadFile(stored)).equals(buffer)).toBe(true);
    expect((await svc.downloadFile(newStored)).equals(fresh)).toBe(true);
  });

  it('refuses to read an encrypted file when no candidate keys decrypt it', async () => {
    mockConfig.storage.encryption = true;
    mockConfig.encryptionKey = 'original-master-key-32chars-XXXXXXX';
    const buffer = Buffer.from('untouchable after key loss');
    const stored = await svc.storeDocument(buffer, 'doc.jpg', 'image/jpeg', 'verif-lost');

    // Lose the key.
    mockConfig.encryptionKey = 'completely-different-key-32chars-YY';
    mockConfig.storage.encryptionKeyPrevious = undefined;

    await expect(svc.downloadFile(stored)).rejects.toThrow();
  });

  it('detects tampering on an encrypted file', async () => {
    mockConfig.storage.encryption = true;
    const buffer = Buffer.from('content that must not be tampered');
    const stored = await svc.storeDocument(buffer, 'doc.jpg', 'image/jpeg', 'verif-tamper');

    // Corrupt the on-disk file.
    const fullPath = path.join(tmpRoot, stored);
    const onDisk = await fs.readFile(fullPath);
    onDisk[onDisk.length - 1] ^= 0xff;   // flip last byte
    await fs.writeFile(fullPath, onDisk);

    await expect(svc.downloadFile(stored)).rejects.toThrow();
  });
});
