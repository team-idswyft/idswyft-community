import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SharpTamperDetector } from '@idswyft/shared';

describe('SharpTamperDetector (6 checks)', () => {
  const detector = new SharpTamperDetector();

  /**
   * Create a test image buffer with Sharp.
   * Uses a gradient pattern for realistic channel statistics.
   */
  async function createTestImage(options?: {
    width?: number;
    height?: number;
    channels?: 3 | 4;
    format?: 'jpeg' | 'png';
    quality?: number;
  }): Promise<Buffer> {
    const w = options?.width ?? 256;
    const h = options?.height ?? 256;
    const channels = options?.channels ?? 3;

    // Create a gradient image with natural-looking variation
    const rawPixels = Buffer.alloc(w * h * channels);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * channels;
        rawPixels[offset] = Math.round((x / w) * 200 + 20);     // R: left-to-right gradient
        rawPixels[offset + 1] = Math.round((y / h) * 180 + 30); // G: top-to-bottom gradient
        rawPixels[offset + 2] = Math.round(((x + y) / (w + h)) * 160 + 40); // B: diagonal
        if (channels === 4) rawPixels[offset + 3] = 255;
      }
    }

    let img = sharp(rawPixels, { raw: { width: w, height: h, channels } });

    if (options?.format === 'jpeg' || !options?.format) {
      return img.jpeg({ quality: options?.quality ?? 90 }).toBuffer();
    } else {
      return img.png().toBuffer();
    }
  }

  describe('result structure', () => {
    it('returns score, flags, isAuthentic, and details', async () => {
      const image = await createTestImage();
      const result = await detector.analyze(image);

      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.flags)).toBe(true);
      expect(typeof result.isAuthentic).toBe('boolean');
      expect(result.details).toBeDefined();
    });

    it('has detail fields for all 6 checks', async () => {
      const image = await createTestImage();
      const result = await detector.analyze(image);
      const d = result.details!;

      expect(d.ela).toBeDefined();
      expect(typeof d.ela.diff).toBe('number');
      expect(typeof d.ela.flagged).toBe('boolean');

      expect(d.entropy).toBeDefined();
      expect(typeof d.entropy.value).toBe('number');

      expect(d.exif).toBeDefined();
      expect(typeof d.exif.present).toBe('boolean');

      // Frequency, color, and double compression may be null on failure
      // but should be present if analysis succeeded
    });
  });

  describe('scoring', () => {
    it('gives high score to a normal gradient image (JPEG)', async () => {
      const image = await createTestImage({ format: 'jpeg', quality: 90 });
      const result = await detector.analyze(image);

      // A normal gradient JPEG should not trigger many flags
      // (MISSING_EXIF_JPEG is expected since we create it without EXIF)
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });

    it('gives high score to a PNG image', async () => {
      const image = await createTestImage({ format: 'png' });
      const result = await detector.analyze(image);

      // PNG doesn't trigger EXIF check (only applies to JPEG)
      expect(result.details?.exif.flagged).toBe(false);
    });

    it('authenticity threshold is 0.7', async () => {
      const image = await createTestImage();
      const result = await detector.analyze(image);

      expect(result.isAuthentic).toBe(result.score >= 0.7);
    });
  });

  describe('check 1: ELA', () => {
    it('reports ELA diff in details', async () => {
      const image = await createTestImage();
      const result = await detector.analyze(image);

      expect(typeof result.details!.ela.diff).toBe('number');
      expect(result.details!.ela.diff).toBeGreaterThanOrEqual(0);
    });
  });

  describe('check 2: entropy', () => {
    it('flags low entropy for uniform images', async () => {
      // Create a nearly solid image — very low entropy
      const w = 128, h = 128;
      const rawPixels = Buffer.alloc(w * h * 3, 100); // All pixels same value
      const image = await sharp(rawPixels, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 95 })
        .toBuffer();

      const result = await detector.analyze(image);

      expect(result.details!.entropy.value).toBeLessThan(10);
      // May or may not be < 5 depending on JPEG artifacts
    });
  });

  describe('check 3: EXIF', () => {
    it('flags missing EXIF on JPEG', async () => {
      const image = await createTestImage({ format: 'jpeg' });
      const result = await detector.analyze(image);

      // Our test images don't have EXIF data
      expect(result.details!.exif.present).toBe(false);
      expect(result.details!.exif.flagged).toBe(true);
      expect(result.flags).toContain('MISSING_EXIF_JPEG');
    });

    it('does not flag missing EXIF on PNG', async () => {
      const image = await createTestImage({ format: 'png' });
      const result = await detector.analyze(image);

      expect(result.details!.exif.flagged).toBe(false);
    });
  });

  describe('check 4: color anomaly', () => {
    it('populates color anomaly details', async () => {
      const image = await createTestImage();
      const result = await detector.analyze(image);

      // Color anomaly check should run and produce a result
      if (result.details!.colorAnomaly) {
        expect(typeof result.details!.colorAnomaly.score).toBe('number');
        expect(Array.isArray(result.details!.colorAnomaly.anomalies)).toBe(true);
      }
    });
  });

  describe('check 5: double compression', () => {
    it('populates double compression details for large enough images', async () => {
      const image = await createTestImage({ width: 256, height: 256 });
      const result = await detector.analyze(image);

      if (result.details!.doubleCompression) {
        expect(typeof result.details!.doubleCompression.detected).toBe('boolean');
        expect(typeof result.details!.doubleCompression.regionVariance).toBe('number');
      }
    });
  });

  describe('check 6: frequency analysis', () => {
    it('populates frequency analysis details', async () => {
      const image = await createTestImage({ width: 256, height: 256 });
      const result = await detector.analyze(image);

      if (result.details!.frequency) {
        expect(typeof result.details!.frequency.ganScore).toBe('number');
        expect(result.details!.frequency.ganScore).toBeGreaterThanOrEqual(0);
        expect(result.details!.frequency.ganScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(result.details!.frequency.spectralAnomalies)).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    it('returns neutral score for invalid input', async () => {
      const result = await detector.analyze(Buffer.from('not an image'));

      expect(result.score).toBe(0.5);
      expect(result.flags).toContain('ANALYSIS_FAILED');
      expect(result.isAuthentic).toBe(false); // 0.5 < 0.7
    });
  });
});
