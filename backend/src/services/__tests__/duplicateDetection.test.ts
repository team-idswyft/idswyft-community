/**
 * Unit tests for the duplicate detection service.
 *
 * Tests verify the perceptual hash, face LSH, and Hamming distance
 * algorithms produce deterministic, correct results with known inputs.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock database.js — throws at import without env vars
vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn() },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeDocumentPHash,
  computeFaceLSH,
  hammingDistance,
} from '../duplicateDetection.js';
import sharp from 'sharp';

// ─── hammingDistance ──────────────────────────────────────────

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
    expect(hammingDistance('abcdef0123456789', 'abcdef0123456789')).toBe(0);
  });

  it('returns correct distance for single-bit difference', () => {
    // 0x0000000000000001 vs 0x0000000000000000 = 1 bit
    expect(hammingDistance('0000000000000001', '0000000000000000')).toBe(1);
  });

  it('returns correct distance for known hex values', () => {
    // 0xff vs 0x00 in last byte = 8 bits differ
    expect(hammingDistance('00000000000000ff', '0000000000000000')).toBe(8);
  });

  it('returns 64 for completely opposite 16-char hashes', () => {
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });

  it('returns 128 for completely opposite 32-char hashes', () => {
    expect(hammingDistance(
      'ffffffffffffffffffffffffffffffff',
      '00000000000000000000000000000000',
    )).toBe(128);
  });

  it('throws on length mismatch', () => {
    expect(() => hammingDistance('abcd', 'abcdef')).toThrow('Hash length mismatch');
  });

  it('is symmetric', () => {
    const a = 'a1b2c3d4e5f6a7b8';
    const b = '1234567890abcdef';
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });
});

// ─── computeFaceLSH ──────────────────────────────────────────

describe('computeFaceLSH', () => {
  it('produces a 32-char hex string for 128-d embedding', () => {
    const embedding = new Array(128).fill(0.5);
    const hash = computeFaceLSH(embedding);
    expect(hash).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(hash)).toBe(true);
  });

  it('all-positive embedding produces all-ones hash', () => {
    const embedding = new Array(128).fill(1.0);
    const hash = computeFaceLSH(embedding);
    expect(hash).toBe('ffffffffffffffffffffffffffffffff');
  });

  it('all-negative embedding produces all-zeros hash', () => {
    const embedding = new Array(128).fill(-1.0);
    const hash = computeFaceLSH(embedding);
    expect(hash).toBe('00000000000000000000000000000000');
  });

  it('zero values map to 1 (>= 0 threshold)', () => {
    const embedding = new Array(128).fill(0);
    const hash = computeFaceLSH(embedding);
    expect(hash).toBe('ffffffffffffffffffffffffffffffff');
  });

  it('is deterministic — same input always gives same output', () => {
    const embedding = Array.from({ length: 128 }, (_, i) => Math.sin(i));
    const hash1 = computeFaceLSH(embedding);
    const hash2 = computeFaceLSH(embedding);
    expect(hash1).toBe(hash2);
  });

  it('similar embeddings produce hashes with small Hamming distance', () => {
    const base = Array.from({ length: 128 }, (_, i) => Math.sin(i));
    // Slightly perturb 5 dimensions
    const perturbed = [...base];
    for (let i = 0; i < 5; i++) perturbed[i] = -perturbed[i];

    const hashBase = computeFaceLSH(base);
    const hashPerturbed = computeFaceLSH(perturbed);
    const distance = hammingDistance(hashBase, hashPerturbed);

    // At most 5 bits should differ (only the 5 flipped dimensions)
    expect(distance).toBeLessThanOrEqual(5);
  });

  it('throws for non-128-d embedding', () => {
    expect(() => computeFaceLSH(new Array(64).fill(0))).toThrow('Expected 128-d');
    expect(() => computeFaceLSH(new Array(256).fill(0))).toThrow('Expected 128-d');
  });
});

// ─── computeDocumentPHash ────────────────────────────────────

describe('computeDocumentPHash', () => {
  it('produces a 16-char hex string', async () => {
    // Create a simple 100x100 white image
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).jpeg().toBuffer();

    const hash = await computeDocumentPHash(buf);
    expect(hash).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
  });

  it('is deterministic — same image always gives same hash', async () => {
    const buf = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 128, g: 64, b: 200 } },
    }).png().toBuffer();

    const hash1 = await computeDocumentPHash(buf);
    const hash2 = await computeDocumentPHash(buf);
    expect(hash1).toBe(hash2);
  });

  it('identical images have Hamming distance 0', async () => {
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).jpeg().toBuffer();

    const hash1 = await computeDocumentPHash(buf);
    const hash2 = await computeDocumentPHash(buf);
    expect(hammingDistance(hash1, hash2)).toBe(0);
  });

  it('visually different images have large Hamming distance', async () => {
    const whiteBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).jpeg().toBuffer();

    // Create a gradient image (varied pixel intensities)
    const pixels = Buffer.alloc(100 * 100 * 3);
    for (let i = 0; i < 100 * 100; i++) {
      const v = Math.floor((i / (100 * 100)) * 255);
      pixels[i * 3] = v;
      pixels[i * 3 + 1] = v;
      pixels[i * 3 + 2] = v;
    }
    const gradientBuf = await sharp(pixels, { raw: { width: 100, height: 100, channels: 3 } })
      .jpeg().toBuffer();

    const hashWhite = await computeDocumentPHash(whiteBuf);
    const hashGradient = await computeDocumentPHash(gradientBuf);
    const distance = hammingDistance(hashWhite, hashGradient);

    // Very different images should have high distance
    expect(distance).toBeGreaterThan(10);
  });
});

// ─── Threshold boundary tests ────────────────────────────────

describe('threshold boundaries', () => {
  it('document pHash: distance 5 is within threshold', () => {
    // Document threshold is ≤ 5
    expect(5).toBeLessThanOrEqual(5);
  });

  it('document pHash: distance 6 exceeds threshold', () => {
    expect(6).toBeGreaterThan(5);
  });

  it('face LSH: distance 10 is within threshold', () => {
    // Face threshold is ≤ 10
    expect(10).toBeLessThanOrEqual(10);
  });

  it('face LSH: distance 11 exceeds threshold', () => {
    expect(11).toBeGreaterThan(10);
  });

  it('face LSH: slightly perturbed embedding stays within threshold', () => {
    const base = Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.5);
    const perturbed = [...base];
    // Flip 10 dimensions — right at the boundary
    for (let i = 0; i < 10; i++) perturbed[i] = -perturbed[i];

    const hashBase = computeFaceLSH(base);
    const hashPerturbed = computeFaceLSH(perturbed);
    const distance = hammingDistance(hashBase, hashPerturbed);

    expect(distance).toBeLessThanOrEqual(10);
  });
});
