import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { OnnxDeepfakeDetector } from '../../providers/deepfake/OnnxDeepfakeDetector.js';
import { createDeepfakeDetector } from '../../providers/deepfake/index.js';

describe('OnnxDeepfakeDetector', () => {
  describe('extractFaceCrop', () => {
    it('extracts a face crop with margin from a test image', async () => {
      // Create a test image
      const w = 400, h = 400;
      const rawPixels = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) {
        rawPixels[i * 3] = (i * 7) % 256;
        rawPixels[i * 3 + 1] = (i * 13) % 256;
        rawPixels[i * 3 + 2] = (i * 23) % 256;
      }
      const image = await sharp(rawPixels, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 90 })
        .toBuffer();

      const detector = new OnnxDeepfakeDetector('/nonexistent/model.onnx');

      const crop = await detector.extractFaceCrop(image, {
        x: 100, y: 100, width: 150, height: 200,
      });

      // Crop should be a valid image buffer
      expect(crop).toBeInstanceOf(Buffer);
      expect(crop.length).toBeGreaterThan(0);

      // Verify it's 224x224 (INPUT_SIZE)
      const meta = await sharp(crop).metadata();
      expect(meta.width).toBe(224);
      expect(meta.height).toBe(224);
    });

    it('handles face at image edge (clips to boundary)', async () => {
      const w = 200, h = 200;
      const rawPixels = Buffer.alloc(w * h * 3, 128);
      const image = await sharp(rawPixels, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 90 })
        .toBuffer();

      const detector = new OnnxDeepfakeDetector('/nonexistent/model.onnx');

      // Face bbox extends beyond image boundary
      const crop = await detector.extractFaceCrop(image, {
        x: 150, y: 150, width: 100, height: 100,
      });

      expect(crop).toBeInstanceOf(Buffer);
      const meta = await sharp(crop).metadata();
      expect(meta.width).toBe(224);
      expect(meta.height).toBe(224);
    });
  });

  describe('detect (without model)', () => {
    it('returns neutral result when model is not available', async () => {
      const detector = new OnnxDeepfakeDetector('/nonexistent/path/model.onnx');

      const w = 224, h = 224;
      const rawPixels = Buffer.alloc(w * h * 3, 128);
      const faceBuffer = await sharp(rawPixels, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 90 })
        .toBuffer();

      const result = await detector.detect(faceBuffer);

      // Without the model file, should return neutral 50/50
      expect(result.isReal).toBe(true);
      expect(result.realProbability).toBe(0.5);
      expect(result.fakeProbability).toBe(0.5);
    });
  });

  describe('factory', () => {
    it('createDeepfakeDetector returns singleton', () => {
      const d1 = createDeepfakeDetector();
      const d2 = createDeepfakeDetector();
      expect(d1).toBe(d2);
    });

    it('returns OnnxDeepfakeDetector instance', () => {
      const detector = createDeepfakeDetector();
      expect(detector).toBeInstanceOf(OnnxDeepfakeDetector);
    });
  });
});
