#!/usr/bin/env tsx
/**
 * Re-encrypt every local-storage file under the current ENCRYPTION_KEY.
 *
 * Used during key rotation to migrate files from a previous master key to
 * the current one. The `decryptBlob` function transparently tries
 * `ENCRYPTION_KEY` first then falls back to `ENCRYPTION_KEY_PREVIOUS`, so
 * read-side rotation is automatic the moment both keys are set. This script
 * is the *write-side* — it walks the uploads tree and re-wraps each file's
 * DEK under the new master key so the previous key can eventually be
 * retired.
 *
 * Idempotent: a file already encrypted under the current key gets a fresh
 * envelope wrap each run. Re-running is a no-op for correctness but does
 * burn I/O. See the runbook at backend/scripts/encryption-key-rotation.md.
 *
 * Usage:
 *   ENCRYPTION_KEY=<new>          \
 *   ENCRYPTION_KEY_PREVIOUS=<old> \
 *     npx tsx backend/scripts/rotate-encryption-key.ts [--dry-run] [--root=uploads]
 *
 * Exit codes:
 *   0  all files rotated (or dry-run completed)
 *   1  config error (keys missing, root not found)
 *   2  one or more files failed to rotate; see stderr
 */

import path from 'path';
import fs from 'fs/promises';
import {
  encryptBlob,
  decryptBlob,
  isEncryptedBlob,
} from '../src/services/storageCrypto.js';

interface RotateOptions {
  root: string;
  dryRun: boolean;
}

interface RotateStats {
  scanned: number;
  rotated: number;
  alreadyCurrent: number;
  legacyPlaintext: number;
  failed: number;
  failedPaths: string[];
}

function parseArgs(): RotateOptions {
  const args = process.argv.slice(2);
  return {
    root: args.find((a) => a.startsWith('--root='))?.split('=')[1] ?? 'uploads',
    dryRun: args.includes('--dry-run'),
  };
}

async function walkFiles(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function rotateOne(
  filePath: string,
  currentKey: string,
  candidates: string[],
  dryRun: boolean,
): Promise<'rotated' | 'already-current' | 'legacy-plaintext'> {
  const blob = await fs.readFile(filePath);

  if (!isEncryptedBlob(blob)) {
    // Legacy plaintext file. We don't auto-encrypt — the operator may have
    // intentionally left some files plaintext (test fixtures, public assets
    // misrouted into uploads/). Skip and report.
    return 'legacy-plaintext';
  }

  // Try the current key first. If that succeeds, this file is already
  // wrapped under the current master — no rotation needed.
  const plaintext = (() => {
    try {
      return decryptBlob(blob, [currentKey]);
    } catch {
      return null;
    }
  })();

  if (plaintext) {
    return 'already-current';
  }

  // Decrypt with the full candidate list (current + previous fallback).
  // If this also fails, the file is unrecoverable with the configured keys.
  const recovered = decryptBlob(blob, candidates);

  if (dryRun) {
    return 'rotated';        // would-rotate; not actually written
  }

  // Re-encrypt under the current key. Atomic write: temp + rename so a
  // crash mid-rotation never leaves a half-encrypted file.
  const fresh = encryptBlob(recovered, currentKey);
  const tempPath = `${filePath}.rotating.${process.pid}.${Date.now()}`;
  await fs.writeFile(tempPath, fresh);
  await fs.rename(tempPath, filePath);
  return 'rotated';
}

async function main(): Promise<void> {
  const opts = parseArgs();

  const currentKey = process.env.ENCRYPTION_KEY;
  const previousKey = process.env.ENCRYPTION_KEY_PREVIOUS;

  if (!currentKey || currentKey.length < 32) {
    console.error('FATAL: ENCRYPTION_KEY is required and must be at least 32 characters');
    process.exit(1);
  }
  if (!previousKey || previousKey.length < 32) {
    console.error('FATAL: ENCRYPTION_KEY_PREVIOUS is required for rotation (set to the old key)');
    process.exit(1);
  }
  if (currentKey === previousKey) {
    console.error('FATAL: ENCRYPTION_KEY_PREVIOUS must differ from ENCRYPTION_KEY (no rotation needed otherwise)');
    process.exit(1);
  }

  const candidates = [currentKey, previousKey];

  const rootAbs = path.resolve(opts.root);
  try {
    await fs.access(rootAbs);
  } catch {
    console.error(`FATAL: root directory not found: ${rootAbs}`);
    process.exit(1);
  }

  console.log(`${opts.dryRun ? '[DRY RUN] ' : ''}Rotating files under ${rootAbs}`);

  const files = await walkFiles(rootAbs);
  console.log(`Found ${files.length} files to inspect`);

  const stats: RotateStats = {
    scanned: 0,
    rotated: 0,
    alreadyCurrent: 0,
    legacyPlaintext: 0,
    failed: 0,
    failedPaths: [],
  };

  for (const filePath of files) {
    stats.scanned++;
    try {
      const outcome = await rotateOne(filePath, currentKey, candidates, opts.dryRun);
      switch (outcome) {
        case 'rotated':
          stats.rotated++;
          if (stats.rotated % 100 === 0) {
            console.log(`  ${stats.rotated} files rotated...`);
          }
          break;
        case 'already-current':
          stats.alreadyCurrent++;
          break;
        case 'legacy-plaintext':
          stats.legacyPlaintext++;
          break;
      }
    } catch (e) {
      stats.failed++;
      stats.failedPaths.push(filePath);
      console.error(`  FAILED: ${filePath} — ${(e as Error).message}`);
    }
  }

  console.log('');
  console.log(`${opts.dryRun ? '[DRY RUN] ' : ''}Rotation summary:`);
  console.log(`  scanned:          ${stats.scanned}`);
  console.log(`  rotated:          ${stats.rotated}`);
  console.log(`  already current:  ${stats.alreadyCurrent}`);
  console.log(`  legacy plaintext: ${stats.legacyPlaintext} (skipped — not encrypted)`);
  console.log(`  failed:           ${stats.failed}`);

  if (stats.failed > 0) {
    console.error('');
    console.error('Some files failed to rotate. Inspect them manually before retiring the previous key.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(2);
});
