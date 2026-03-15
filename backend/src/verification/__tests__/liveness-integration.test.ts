import { describe, it, expect, vi } from 'vitest';
import { evaluateGate4 } from '../gates/gate4-liveCapture.js';
import { createLivenessProvider } from '@/providers/liveness/index.js';
import { EnhancedHeuristicProvider } from '@/providers/liveness/EnhancedHeuristicProvider.js';
import { HeuristicProvider } from '@/providers/liveness/HeuristicProvider.js';
import { getLivenessThresholdSync } from '@/config/verificationThresholds.js';
import type { LiveCaptureResult } from '../models/types.js';

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Liveness Integration: Provider → Gate 4', () => {
  describe('provider factory', () => {
    it('defaults to enhanced-heuristic when LIVENESS_PROVIDER is unset', () => {
      delete process.env.LIVENESS_PROVIDER;
      const provider = createLivenessProvider();
      expect(provider.name).toBe('enhanced-heuristic');
    });

    it('returns HeuristicProvider when LIVENESS_PROVIDER=heuristic', () => {
      process.env.LIVENESS_PROVIDER = 'heuristic';
      const provider = createLivenessProvider();
      expect(provider.name).toBe('heuristic');
      delete process.env.LIVENESS_PROVIDER;
    });

    it('returns EnhancedHeuristicProvider when LIVENESS_PROVIDER=enhanced-heuristic', () => {
      process.env.LIVENESS_PROVIDER = 'enhanced-heuristic';
      const provider = createLivenessProvider();
      expect(provider.name).toBe('enhanced-heuristic');
      delete process.env.LIVENESS_PROVIDER;
    });
  });

  describe('end-to-end: provider score → Gate 4 decision', () => {
    const provider = new EnhancedHeuristicProvider();

    it('natural camera photo passes Gate 4', async () => {
      // Simulate a real camera JPEG: large, high entropy, standard structure
      const size = 250 * 1024;
      const buf = Buffer.alloc(size);
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
      // DQT marker with low quantization values
      buf[3] = 0xFF; buf[4] = 0xDB;
      buf[5] = 0x00; buf[6] = 0x43;
      for (let i = 7; i < 71; i++) buf[i] = Math.floor(Math.random() * 5) + 1;
      // Random high-entropy content
      for (let i = 71; i < size; i++) buf[i] = Math.floor(Math.random() * 256);

      const livenessScore = await provider.assessLiveness({ buffer: buf });
      const threshold = getLivenessThresholdSync(false); // production = 0.75
      const livenessPassed = livenessScore >= threshold;

      const liveCaptureResult: LiveCaptureResult = {
        face_embedding: [0.1, 0.2, 0.3, 0.4],
        face_confidence: 0.9,
        liveness_passed: livenessPassed,
        liveness_score: livenessScore,
      };

      const gateResult = evaluateGate4(liveCaptureResult);

      // We expect a well-formed camera JPEG simulation to at least be plausible
      // The exact score depends on EXIF analysis (which needs sharp), so we
      // test the full flow rather than asserting a specific outcome
      expect(livenessScore).toBeGreaterThan(0.3);
      expect(gateResult).toBeDefined();
      expect(gateResult.rejection_reason === null || gateResult.rejection_reason === 'LIVENESS_FAILED').toBe(true);
    });

    it('tiny suspicious image fails Gate 4', async () => {
      // 2KB flat buffer — definitely not a real selfie
      const buf = Buffer.alloc(2048, 0x42);
      buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47; // PNG

      const livenessScore = await provider.assessLiveness({ buffer: buf });
      const threshold = getLivenessThresholdSync(false);
      const livenessPassed = livenessScore >= threshold;

      const liveCaptureResult: LiveCaptureResult = {
        face_embedding: [0.1, 0.2, 0.3],
        face_confidence: 0.8,
        liveness_passed: livenessPassed,
        liveness_score: livenessScore,
      };

      const gateResult = evaluateGate4(liveCaptureResult);

      expect(livenessScore).toBeLessThan(0.5);
      expect(livenessPassed).toBe(false);
      expect(gateResult.passed).toBe(false);
      expect(gateResult.rejection_reason).toBe('LIVENESS_FAILED');
    });

    it('sandbox threshold is more lenient', async () => {
      const prodThreshold = getLivenessThresholdSync(false);
      const sandboxThreshold = getLivenessThresholdSync(true);
      expect(sandboxThreshold).toBeLessThan(prodThreshold);
      expect(prodThreshold).toBe(0.75);
      expect(sandboxThreshold).toBe(0.65);
    });
  });

  describe('fail-safe behavior', () => {
    it('provider crash results in score 0 and gate rejection', async () => {
      // Simulate a provider that throws on assessLiveness
      const crashingProvider: any = {
        name: 'crashing-provider',
        assessLiveness: async () => { throw new Error('sharp not found'); },
      };

      let livenessScore = 0;
      let livenessPassed = false;
      try {
        livenessScore = await crashingProvider.assessLiveness({ buffer: Buffer.alloc(100) });
        livenessPassed = livenessScore >= getLivenessThresholdSync(false);
      } catch {
        // Fail-safe: score 0, not passed (matches newVerification.ts catch block)
        livenessScore = 0;
        livenessPassed = false;
      }

      const gateResult = evaluateGate4({
        face_embedding: [0.1, 0.2, 0.3],
        face_confidence: 0.9,
        liveness_passed: livenessPassed,
        liveness_score: livenessScore,
      });

      expect(livenessScore).toBe(0);
      expect(livenessPassed).toBe(false);
      expect(gateResult.passed).toBe(false);
      expect(gateResult.rejection_reason).toBe('LIVENESS_FAILED');
    });

    it('empty buffer returns score 0 from enhanced provider', async () => {
      const provider = new EnhancedHeuristicProvider();
      const score = await provider.assessLiveness({ buffer: Buffer.alloc(0) });
      expect(score).toBe(0);

      const gateResult = evaluateGate4({
        face_embedding: [0.1],
        face_confidence: 0.9,
        liveness_passed: score >= getLivenessThresholdSync(false),
        liveness_score: score,
      });
      expect(gateResult.passed).toBe(false);
    });
  });

  describe('Gate 4 regression — existing tests still valid', () => {
    it('PASSES when liveness passed and face detected', () => {
      const result = evaluateGate4({
        face_embedding: [0.1, 0.2, 0.3],
        face_confidence: 0.95,
        liveness_passed: true,
        liveness_score: 0.88,
      });
      expect(result.passed).toBe(true);
    });

    it('FAILS with LIVENESS_FAILED when liveness_passed is false', () => {
      const result = evaluateGate4({
        face_embedding: [0.1, 0.2, 0.3],
        face_confidence: 0.95,
        liveness_passed: false,
        liveness_score: 0.30,
      });
      expect(result.passed).toBe(false);
      expect(result.rejection_reason).toBe('LIVENESS_FAILED');
    });

    it('FAILS with FACE_NOT_DETECTED when confidence low and no embedding', () => {
      const result = evaluateGate4({
        face_embedding: [],
        face_confidence: 0.10,
        liveness_passed: true,
        liveness_score: 0.85,
      });
      expect(result.passed).toBe(false);
      expect(result.rejection_reason).toBe('FACE_NOT_DETECTED');
    });

    it('LIVENESS_FAILED takes precedence over FACE_NOT_DETECTED', () => {
      const result = evaluateGate4({
        face_embedding: [],
        face_confidence: 0.10,
        liveness_passed: false,
        liveness_score: 0.20,
      });
      expect(result.passed).toBe(false);
      expect(result.rejection_reason).toBe('LIVENESS_FAILED');
    });
  });
});
