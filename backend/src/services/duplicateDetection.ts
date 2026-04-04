/**
 * Duplicate Detection Service
 *
 * Detects reused documents and faces across verification sessions using
 * perceptual hashing (documents) and locality-sensitive hashing (faces).
 *
 * All hashes are one-way — they cannot reconstruct the original image or
 * face embedding, satisfying GDPR Article 9 biometric data requirements.
 */

import sharp from 'sharp';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

// ─── Thresholds (deterministic, fixed) ───────────────────────

/** Document pHash: Hamming distance ≤ 5 out of 64 bits (~92% similar) */
const DOCUMENT_PHASH_THRESHOLD = 5;

/** Face LSH: Hamming distance ≤ 10 out of 128 bits (~92% similar) */
const FACE_LSH_THRESHOLD = 10;

// ─── Types ───────────────────────────────────────────────────

export type FingerprintType = 'document_phash' | 'face_lsh';

export interface DuplicateMatch {
  verification_request_id: string;
  fingerprint_type: FingerprintType;
  hash_value: string;
  hamming_distance: number;
  created_at: string;
}

export interface DuplicateFlag {
  type: FingerprintType;
  matched_verification_id: string;
  hamming_distance: number;
}

// ─── Hash Functions ──────────────────────────────────────────

/**
 * Compute a 64-bit average hash (aHash) of a document image.
 * 1. Resize to 8×8 grayscale
 * 2. Compute mean pixel value
 * 3. Each pixel above mean → 1, below → 0
 * Returns 16-char hex string (64 bits).
 */
export async function computeDocumentPHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 8 || info.height !== 8) {
    throw new Error(`Unexpected resize dimensions: ${info.width}x${info.height}`);
  }

  // Compute mean of all 64 pixel values
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += data[i];
  const mean = sum / 64;

  // Build 64-bit hash: each bit = (pixel >= mean)
  let hash = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (data[i] >= mean) {
      hash |= BigInt(1) << BigInt(63 - i);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute a 128-bit locality-sensitive hash from a face embedding.
 * Each dimension is quantized: >= 0 → 1, < 0 → 0.
 * Returns 32-char hex string (128 bits).
 *
 * This is one-way: 128 bits cannot reconstruct 128 float32 values.
 */
export function computeFaceLSH(embedding: number[]): string {
  if (embedding.length !== 128) {
    throw new Error(`Expected 128-d face embedding, got ${embedding.length}`);
  }

  // Pack 128 bits into two BigInts (high 64 + low 64)
  let high = BigInt(0);
  let low = BigInt(0);

  for (let i = 0; i < 64; i++) {
    if (embedding[i] >= 0) high |= BigInt(1) << BigInt(63 - i);
  }
  for (let i = 0; i < 64; i++) {
    if (embedding[64 + i] >= 0) low |= BigInt(1) << BigInt(63 - i);
  }

  const highHex = high.toString(16).padStart(16, '0');
  const lowHex = low.toString(16).padStart(16, '0');
  return highHex + lowHex;
}

/**
 * Compute Hamming distance between two hex hash strings.
 * Counts the number of differing bits via XOR + popcount.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`Hash length mismatch: ${a.length} vs ${b.length}`);
  }

  let distance = 0;

  // Process 8 hex chars (32 bits) at a time to stay within safe integer range
  for (let i = 0; i < a.length; i += 8) {
    const chunkA = parseInt(a.slice(i, i + 8), 16);
    const chunkB = parseInt(b.slice(i, i + 8), 16);
    let xor = (chunkA ^ chunkB) >>> 0; // unsigned 32-bit

    // Popcount (Brian Kernighan's method)
    while (xor) {
      xor &= xor - 1;
      distance++;
    }
  }

  return distance;
}

// ─── Database Operations ─────────────────────────────────────

/** Insert a fingerprint record for a verification. */
export async function storeFingerprint(
  developerId: string,
  verificationRequestId: string,
  type: FingerprintType,
  hashValue: string,
): Promise<void> {
  const { error } = await supabase.from('dedup_fingerprints').insert({
    developer_id: developerId,
    verification_request_id: verificationRequestId,
    fingerprint_type: type,
    hash_value: hashValue,
  });

  if (error) {
    logger.warn('Failed to store dedup fingerprint', {
      type, verificationRequestId, error: error.message,
    });
  }
}

/**
 * Check for duplicate fingerprints within the same developer scope.
 * Returns all matches within the Hamming distance threshold.
 *
 * Safety limit: fetches at most 10,000 most-recent fingerprints per query.
 * For tenants exceeding this, consider migrating to multi-probe LSH with
 * band-partitioned hash prefixes queryable in SQL.
 */
const DEDUP_QUERY_LIMIT = 10_000;

export async function checkForDuplicates(
  developerId: string,
  verificationRequestId: string,
  type: FingerprintType,
  hashValue: string,
): Promise<DuplicateMatch[]> {
  const threshold = type === 'document_phash' ? DOCUMENT_PHASH_THRESHOLD : FACE_LSH_THRESHOLD;

  // Fetch recent fingerprints for this developer + type (excluding current verification)
  const { data: fingerprints, error } = await supabase
    .from('dedup_fingerprints')
    .select('verification_request_id, hash_value, created_at')
    .eq('developer_id', developerId)
    .eq('fingerprint_type', type)
    .neq('verification_request_id', verificationRequestId)
    .order('created_at', { ascending: false })
    .limit(DEDUP_QUERY_LIMIT);

  if (error) {
    logger.warn('Failed to query dedup fingerprints', {
      type, developerId, error: error.message,
    });
    return [];
  }

  if (!fingerprints?.length) return [];

  // Compute Hamming distances and filter by threshold
  const matches: DuplicateMatch[] = [];
  for (const fp of fingerprints) {
    const dist = hammingDistance(hashValue, fp.hash_value);
    if (dist <= threshold) {
      matches.push({
        verification_request_id: fp.verification_request_id,
        fingerprint_type: type,
        hash_value: fp.hash_value,
        hamming_distance: dist,
        created_at: fp.created_at,
      });
    }
  }

  return matches;
}

/**
 * Write duplicate flags to the verification_requests row.
 * Merges with any existing flags.
 *
 * NOTE: This is a read-modify-write without row locking. In the current
 * implementation, calls are sequential within a single request handler
 * (document pHash → face LSH), so no race occurs. If this is ever called
 * concurrently, migrate to a PostgreSQL RPC with jsonb_concat for atomicity.
 */
export async function flagDuplicates(
  verificationRequestId: string,
  flags: DuplicateFlag[],
): Promise<void> {
  if (flags.length === 0) return;

  // Read existing flags to merge
  const { data: row } = await supabase
    .from('verification_requests')
    .select('duplicate_flags')
    .eq('id', verificationRequestId)
    .single();

  const existing: DuplicateFlag[] = (row?.duplicate_flags as DuplicateFlag[]) || [];
  const merged = [...existing, ...flags];

  const { error } = await supabase
    .from('verification_requests')
    .update({ duplicate_flags: merged })
    .eq('id', verificationRequestId);

  if (error) {
    logger.warn('Failed to flag duplicates', {
      verificationRequestId, error: error.message,
    });
  }
}

// ─── Pipeline Integration Helper ─────────────────────────────

export interface DedupSettings {
  enabled: boolean;
  action: 'block' | 'review' | 'allow';
}

/** Load duplicate detection settings for a developer. */
export async function getDedupSettings(developerId: string): Promise<DedupSettings> {
  const { data } = await supabase
    .from('developers')
    .select('duplicate_detection_enabled, duplicate_detection_action')
    .eq('id', developerId)
    .single();

  return {
    enabled: data?.duplicate_detection_enabled ?? false,
    action: (data?.duplicate_detection_action as DedupSettings['action']) ?? 'review',
  };
}

/**
 * Run full dedup check for a single fingerprint: store → check → flag.
 * Returns the duplicate flags found (empty array if none).
 */
export async function runDedupCheck(
  developerId: string,
  verificationRequestId: string,
  type: FingerprintType,
  hashValue: string,
): Promise<DuplicateFlag[]> {
  await storeFingerprint(developerId, verificationRequestId, type, hashValue);

  const matches = await checkForDuplicates(developerId, verificationRequestId, type, hashValue);

  const flags: DuplicateFlag[] = matches.map(m => ({
    type,
    matched_verification_id: m.verification_request_id,
    hamming_distance: m.hamming_distance,
  }));

  if (flags.length > 0) {
    await flagDuplicates(verificationRequestId, flags);
    logger.info('Duplicate detected', {
      verificationRequestId, type, matchCount: flags.length,
      matchedIds: flags.map(f => f.matched_verification_id),
    });
  }

  return flags;
}
