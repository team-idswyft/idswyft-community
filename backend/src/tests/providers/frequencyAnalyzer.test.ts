import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { FrequencyAnalyzer } from '@idswyft/shared';

describe('FrequencyAnalyzer', () => {
  const analyzer = new FrequencyAnalyzer();

  describe('nextPow2', () => {
    it('returns correct power of 2 for various inputs', () => {
      expect(FrequencyAnalyzer.nextPow2(1)).toBe(1);
      expect(FrequencyAnalyzer.nextPow2(2)).toBe(2);
      expect(FrequencyAnalyzer.nextPow2(3)).toBe(4);
      expect(FrequencyAnalyzer.nextPow2(5)).toBe(8);
      expect(FrequencyAnalyzer.nextPow2(100)).toBe(128);
      expect(FrequencyAnalyzer.nextPow2(1024)).toBe(1024);
    });
  });

  describe('analyze', () => {
    it('returns a valid result for uniform (DC-only) input', async () => {
      // All-128 grayscale image — zero high-frequency content
      const size = 64;
      const pixels = Buffer.alloc(size * size, 128);

      const result = await analyzer.analyze(pixels, size, size);

      expect(result.ganScore).toBeGreaterThanOrEqual(0);
      expect(result.ganScore).toBeLessThanOrEqual(1);
      expect(result.spectralEnergyRatio).toBeGreaterThanOrEqual(0);
      expect(result.spectralEnergyRatio).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.spectralAnomalies)).toBe(true);
    });

    it('detects low frequency deficit on uniform images', async () => {
      // Completely uniform image has almost zero high-freq energy
      const size = 64;
      const pixels = Buffer.alloc(size * size, 100);

      const result = await analyzer.analyze(pixels, size, size);

      // Uniform image should have very low spectral energy ratio
      expect(result.spectralEnergyRatio).toBeLessThan(0.15);
    });

    it('detects high frequency content in checkerboard pattern', async () => {
      // Checkerboard pattern — high-frequency periodic signal (simulates GAN artifacts)
      const size = 64;
      const pixels = Buffer.alloc(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          pixels[y * size + x] = ((x + y) % 2 === 0) ? 255 : 0;
        }
      }

      const result = await analyzer.analyze(pixels, size, size);

      // Checkerboard should have very high spectral energy ratio
      expect(result.spectralEnergyRatio).toBeGreaterThan(0.3);
    });

    it('handles white noise (natural-like frequency distribution)', async () => {
      // Random noise has energy distributed across all frequencies
      const size = 64;
      const pixels = Buffer.alloc(size * size);
      // Deterministic pseudo-random
      let seed = 42;
      for (let i = 0; i < size * size; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        pixels[i] = seed % 256;
      }

      const result = await analyzer.analyze(pixels, size, size);

      // White noise should have moderate energy ratio and high ganScore (looks natural)
      expect(result.ganScore).toBeGreaterThan(0);
      expect(result.spectralEnergyRatio).toBeGreaterThan(0.05);
    });

    it('handles sinusoidal signal (single frequency peak)', async () => {
      // Single-frequency sine wave — should produce isolated spectral peaks
      const size = 64;
      const pixels = Buffer.alloc(size * size);
      const freq = 8; // 8 cycles across the image
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          pixels[y * size + x] = Math.round(128 + 127 * Math.sin(2 * Math.PI * freq * x / size));
        }
      }

      const result = await analyzer.analyze(pixels, size, size);

      // Should detect the periodic signal
      expect(result.spectralEnergyRatio).toBeGreaterThan(0);
      expect(result.ganScore).toBeLessThanOrEqual(1);
    });

    it('handles small images gracefully', async () => {
      const size = 4;
      const pixels = Buffer.alloc(size * size, 128);

      const result = await analyzer.analyze(pixels, size, size);

      expect(result.ganScore).toBeGreaterThanOrEqual(0);
      expect(result.ganScore).toBeLessThanOrEqual(1);
    });

    it('handles zero-size input gracefully', async () => {
      // Zero-size input should not crash — returns a valid result
      const result = await analyzer.analyze(Buffer.alloc(0), 0, 0);

      expect(result.ganScore).toBeGreaterThanOrEqual(0);
      expect(result.ganScore).toBeLessThanOrEqual(1);
      expect(typeof result.spectralEnergyRatio).toBe('number');
    });
  });
});
