import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedHeuristicProvider } from '@idswyft/shared';
import * as fs from 'fs';
import * as path from 'path';

// Mock logger to avoid noise
vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EnhancedHeuristicProvider', () => {
  let provider: EnhancedHeuristicProvider;

  beforeEach(() => {
    provider = new EnhancedHeuristicProvider();
  });

  it('has the correct provider name', () => {
    expect(provider.name).toBe('enhanced-heuristic');
  });

  describe('empty / corrupted input', () => {
    it('returns 0 for empty buffer', async () => {
      const score = await provider.assessLiveness({ buffer: Buffer.alloc(0) });
      expect(score).toBe(0);
    });

    it('returns a low score for tiny buffer (<5KB)', async () => {
      // Create a tiny buffer with low entropy (repeating bytes)
      const tiny = Buffer.alloc(1024, 0x42);
      const score = await provider.assessLiveness({ buffer: tiny });
      expect(score).toBeLessThan(0.4);
    });
  });

  describe('natural camera photo simulation', () => {
    it('scores high for large, high-entropy JPEG-like buffer with EXIF', async () => {
      // Simulate a real JPEG: magic bytes + high-entropy random data + decent size
      const size = 200 * 1024; // 200KB — typical selfie
      const buf = Buffer.alloc(size);
      // JPEG magic bytes
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      // Add DQT marker (quantization table) with low values = high quality
      buf[3] = 0xFF; buf[4] = 0xDB;
      buf[5] = 0x00; buf[6] = 0x43; // length = 67
      // Low quantization values (camera-quality)
      for (let i = 7; i < 71; i++) buf[i] = Math.floor(Math.random() * 8) + 1;
      // Fill rest with random data to simulate high entropy
      for (let i = 71; i < size; i++) buf[i] = Math.floor(Math.random() * 256);

      const score = await provider.assessLiveness({ buffer: buf });
      // Should score reasonably high (file size + entropy + JPEG quality signals)
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('screenshot simulation', () => {
    it('scores low for PNG-formatted, low-entropy, small buffer', async () => {
      const size = 25 * 1024; // 25KB — typical cropped screenshot
      const buf = Buffer.alloc(size);
      // PNG magic bytes
      buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
      // Fill with repetitive data (low entropy — flat colors typical of screenshots)
      for (let i = 4; i < size; i++) {
        buf[i] = (i % 4 < 2) ? 0x20 : 0xE0; // alternating two values
      }

      const score = await provider.assessLiveness({ buffer: buf });
      expect(score).toBeLessThan(0.55);
    });
  });

  describe('printed photo re-photograph simulation', () => {
    it('detects moire-like periodic patterns', async () => {
      const size = 50 * 1024;
      const buf = Buffer.alloc(size);
      // JPEG header
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      // Create periodic pattern (simulating moire from screen re-photography)
      for (let i = 3; i < size; i++) {
        // Regular sinusoidal pattern — moire signature
        buf[i] = Math.floor(128 + 100 * Math.sin(i * 0.5));
      }

      const score = await provider.assessLiveness({ buffer: buf });
      // Periodic patterns should reduce the score
      expect(score).toBeLessThan(0.65);
    });
  });

  describe('pixel variance signal', () => {
    it('boosts score when pixelData has high variance', async () => {
      const buf = Buffer.alloc(60 * 1024);
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      for (let i = 3; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);

      // High variance pixel data
      const highVariancePixels = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256));

      const scoreWithPixels = await provider.assessLiveness({
        buffer: buf,
        pixelData: highVariancePixels,
      });

      // Low variance pixel data
      const lowVariancePixels = Array.from({ length: 1000 }, () => 128 + Math.floor(Math.random() * 5));

      const scoreWithLowPixels = await provider.assessLiveness({
        buffer: buf,
        pixelData: lowVariancePixels,
      });

      expect(scoreWithPixels).toBeGreaterThan(scoreWithLowPixels);
    });

    it('returns neutral pixel score when no pixelData provided', async () => {
      const buf = Buffer.alloc(60 * 1024);
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      for (let i = 3; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);

      const score = await provider.assessLiveness({ buffer: buf });
      // Should still produce a reasonable score even without pixel data
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('score bounds', () => {
    it('always returns a value between 0 and 1', async () => {
      const testCases = [
        Buffer.alloc(100, 0x00), // All zeros
        Buffer.alloc(10000, 0xFF), // All 0xFF
        Buffer.from([0xFF, 0xD8, 0xFF, ...Array(5000).fill(0).map(() => Math.floor(Math.random() * 256))]), // Random JPEG
        Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Array(3000).fill(42)]), // Flat PNG
      ];

      for (const buf of testCases) {
        const score = await provider.assessLiveness({ buffer: buf });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('dimension-based scoring', () => {
    it('gives higher aspect score for standard camera ratios (4:3)', async () => {
      const buf = Buffer.alloc(60 * 1024);
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      for (let i = 3; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);

      const score4x3 = await provider.assessLiveness({
        buffer: buf,
        width: 1600,
        height: 1200, // 4:3
      });

      const scoreWeird = await provider.assessLiveness({
        buffer: buf,
        width: 1920,
        height: 1000, // Unusual ratio (1.92:1)
      });

      expect(score4x3).toBeGreaterThan(scoreWeird);
    });
  });
});
