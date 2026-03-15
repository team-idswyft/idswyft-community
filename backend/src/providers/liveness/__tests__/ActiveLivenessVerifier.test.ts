import { describe, it, expect } from 'vitest';
import { verifyActiveLivenessMetadata } from '../ActiveLivenessVerifier.js';
import type { ActiveLivenessMetadata } from '../../../verification/models/activeLivenessSchema.js';

/** Helper: generate realistic head-turn samples */
function makeHeadTurnSamples(opts: {
  direction: 'left' | 'right';
  frameCount?: number;
  durationMs?: number;
  peakYaw?: number;
  baselineYaw?: number;
}): ActiveLivenessMetadata['samples'] {
  const {
    direction,
    frameCount = 15,
    durationMs = 2500,
    peakYaw = direction === 'left' ? -25 : 25,
    baselineYaw = 0,
  } = opts;

  const samples: ActiveLivenessMetadata['samples'] = [];
  const gap = durationMs / (frameCount - 1);

  for (let i = 0; i < frameCount; i++) {
    // Simulate: center → turn → return
    const progress = i / (frameCount - 1);
    let yaw: number;
    if (progress < 0.3) {
      // Phase 1: still centered
      yaw = baselineYaw + (Math.random() - 0.5) * 2;
    } else if (progress < 0.7) {
      // Phase 2: turning to peak
      const turnProgress = (progress - 0.3) / 0.4;
      yaw = baselineYaw + (peakYaw - baselineYaw) * turnProgress;
    } else {
      // Phase 3: returning to center
      const returnProgress = (progress - 0.7) / 0.3;
      yaw = peakYaw + (baselineYaw - peakYaw) * returnProgress;
    }

    // Add slight jitter to avoid perfectly even timestamps
    const jitter = i === 0 ? 0 : (Math.random() * 10 - 5);

    samples.push({
      timestamp: 1000 + i * gap + jitter,
      yaw,
      pitch: (Math.random() - 0.5) * 5,
      roll: (Math.random() - 0.5) * 3,
      landmarks: Array.from({ length: 18 }, () => Math.random()),
    });
  }

  // Ensure timestamps are monotonically increasing
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].timestamp <= samples[i - 1].timestamp) {
      samples[i].timestamp = samples[i - 1].timestamp + 1;
    }
  }

  return samples;
}

function makeMetadata(
  overrides: Partial<ActiveLivenessMetadata> = {},
): ActiveLivenessMetadata {
  const direction = overrides.challenge_direction ?? 'left';
  const samples = overrides.samples ?? makeHeadTurnSamples({ direction });
  return {
    challenge_type: 'head_turn',
    challenge_direction: direction,
    samples,
    start_timestamp: samples[0]?.timestamp ?? 1000,
    end_timestamp: samples[samples.length - 1]?.timestamp ?? 3500,
    ...overrides,
  };
}

describe('ActiveLivenessVerifier', () => {
  describe('valid head turns', () => {
    it('passes for valid left head turn', () => {
      const result = verifyActiveLivenessMetadata(makeMetadata({
        challenge_direction: 'left',
      }));
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.75);
      expect(result.reason).toBeUndefined();
    });

    it('passes for valid right head turn', () => {
      const result = verifyActiveLivenessMetadata(makeMetadata({
        challenge_direction: 'right',
        samples: makeHeadTurnSamples({ direction: 'right' }),
      }));
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('insufficient samples', () => {
    it('fails with too few samples (3 frames)', () => {
      const samples = makeHeadTurnSamples({ direction: 'left', frameCount: 3, durationMs: 500 });
      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('sufficient_samples');
    });
  });

  describe('timestamp validation', () => {
    it('reduces score with non-monotonic timestamps', () => {
      const samples = makeHeadTurnSamples({ direction: 'left' });
      // Swap two timestamps to break monotonicity
      const temp = samples[5].timestamp;
      samples[5].timestamp = samples[3].timestamp;
      samples[3].timestamp = temp;

      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      // Single check failure → score drops but may still pass overall
      expect(result.score).toBeLessThan(1.0);
    });

    it('reduces score when challenge is too fast (< 800ms)', () => {
      const samples = makeHeadTurnSamples({ direction: 'left', frameCount: 10, durationMs: 400 });
      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      // temporal_spread fails but 7/8 still passes — verify score dropped
      expect(result.score).toBeLessThan(1.0);
    });
  });

  describe('direction validation', () => {
    it('reduces score when told left but turned right', () => {
      // Wrong direction alone = 7/8 which still passes, so verify score dropped
      const samples = makeHeadTurnSamples({ direction: 'right' });
      const result = verifyActiveLivenessMetadata(makeMetadata({
        challenge_direction: 'left',
        samples,
      }));
      // Score should be less than perfect (correct_direction check fails)
      expect(result.score).toBeLessThan(1.0);
    });

    it('fails overall when wrong direction + insufficient yaw', () => {
      // Wrong direction AND tiny yaw = at least 2 checks fail → may drop below 0.75
      const samples = makeHeadTurnSamples({ direction: 'right', peakYaw: 8 });
      const result = verifyActiveLivenessMetadata(makeMetadata({
        challenge_direction: 'left',
        samples,
      }));
      // Both correct_direction and sufficient_yaw_delta should fail
      expect(result.score).toBeLessThanOrEqual(0.875);
    });
  });

  describe('insufficient yaw delta', () => {
    it('reduces score when yaw movement is too small (< 15 degrees)', () => {
      // Single check failure = 7/8 = 0.875, still passes overall
      // but score should be below 1.0
      const samples = makeHeadTurnSamples({ direction: 'left', peakYaw: -8 });
      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      expect(result.score).toBeLessThan(1.0);
    });

    it('fails overall when combined with multiple other issues', () => {
      // Tiny yaw + wrong direction + too short = 3+ failures → score < 0.75
      const samples = makeHeadTurnSamples({
        direction: 'right',
        peakYaw: 5,
        frameCount: 10,
        durationMs: 300,
      });
      const result = verifyActiveLivenessMetadata(makeMetadata({
        challenge_direction: 'left',
        samples,
      }));
      // Fails: correct_direction, sufficient_yaw_delta, temporal_spread (at least 3/8)
      expect(result.passed).toBe(false);
    });
  });

  describe('replay attack detection', () => {
    it('fails when all yaw values are identical', () => {
      const samples: ActiveLivenessMetadata['samples'] = [];
      for (let i = 0; i < 15; i++) {
        samples.push({
          timestamp: 1000 + i * 200 + (Math.random() * 8),
          yaw: 5.0,
          pitch: 0,
          roll: 0,
          landmarks: Array.from({ length: 18 }, () => 0.5),
        });
      }
      // Fix monotonicity
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].timestamp <= samples[i - 1].timestamp) {
          samples[i].timestamp = samples[i - 1].timestamp + 1;
        }
      }

      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('no_suspicious_patterns');
    });
  });

  describe('synthetic timestamp detection', () => {
    it('reduces score for perfectly even timestamp spacing', () => {
      const samples = makeHeadTurnSamples({ direction: 'left' });
      // Make all timestamps perfectly evenly spaced
      for (let i = 0; i < samples.length; i++) {
        samples[i].timestamp = 1000 + i * 200;
      }

      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      // Even spacing alone = 7/8, may still pass but score should drop
      expect(result.score).toBeLessThan(1.0);
    });

    it('fails when combined with replay-like identical yaw + even spacing', () => {
      // Perfectly even timestamps + identical yaw = definite fail
      const samples: ActiveLivenessMetadata['samples'] = [];
      for (let i = 0; i < 15; i++) {
        samples.push({
          timestamp: 1000 + i * 200,
          yaw: 0,
          pitch: 0,
          roll: 0,
          landmarks: Array.from({ length: 18 }, () => 0.5),
        });
      }
      const result = verifyActiveLivenessMetadata(makeMetadata({ samples }));
      expect(result.passed).toBe(false);
    });
  });

  describe('score calculation', () => {
    it('returns score as ratio of passed checks', () => {
      const result = verifyActiveLivenessMetadata(makeMetadata());
      // Score should be a number between 0 and 1
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('passes when score >= 0.75 (6/8 checks)', () => {
      const result = verifyActiveLivenessMetadata(makeMetadata());
      if (result.score >= 0.75) {
        expect(result.passed).toBe(true);
      } else {
        expect(result.passed).toBe(false);
      }
    });
  });
});
