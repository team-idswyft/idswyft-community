import { describe, it, expect } from 'vitest';
import { HeadPoseSampleSchema, ActiveLivenessMetadataSchema } from '../activeLivenessSchema.js';

describe('HeadPoseSampleSchema', () => {
  const validSample = {
    timestamp: 1000,
    yaw: -15.3,
    pitch: 2.1,
    roll: -0.5,
    landmarks: Array.from({ length: 18 }, (_, i) => i * 0.05),
  };

  it('accepts a valid sample', () => {
    expect(() => HeadPoseSampleSchema.parse(validSample)).not.toThrow();
  });

  it('rejects missing timestamp', () => {
    const { timestamp, ...rest } = validSample;
    expect(() => HeadPoseSampleSchema.parse(rest)).toThrow();
  });

  it('rejects yaw out of range (-90 to 90)', () => {
    expect(() => HeadPoseSampleSchema.parse({ ...validSample, yaw: -91 })).toThrow();
    expect(() => HeadPoseSampleSchema.parse({ ...validSample, yaw: 91 })).toThrow();
  });

  it('rejects wrong landmark array length', () => {
    expect(() => HeadPoseSampleSchema.parse({
      ...validSample,
      landmarks: [1, 2, 3],
    })).toThrow();
  });

  it('accepts boundary yaw values', () => {
    expect(() => HeadPoseSampleSchema.parse({ ...validSample, yaw: -90 })).not.toThrow();
    expect(() => HeadPoseSampleSchema.parse({ ...validSample, yaw: 90 })).not.toThrow();
  });
});

describe('ActiveLivenessMetadataSchema', () => {
  function makeSample(ts: number, yaw: number) {
    return {
      timestamp: ts,
      yaw,
      pitch: 0,
      roll: 0,
      landmarks: Array.from({ length: 18 }, () => 0.5),
    };
  }

  const validMetadata = {
    challenge_type: 'head_turn' as const,
    challenge_direction: 'left' as const,
    samples: Array.from({ length: 10 }, (_, i) =>
      makeSample(1000 + i * 200, -i * 3),
    ),
    start_timestamp: 1000,
    end_timestamp: 2800,
    mediapipe_version: '0.10.22',
    screen_width: 640,
    screen_height: 480,
  };

  it('accepts valid metadata', () => {
    expect(() => ActiveLivenessMetadataSchema.parse(validMetadata)).not.toThrow();
  });

  it('rejects invalid challenge_type', () => {
    expect(() => ActiveLivenessMetadataSchema.parse({
      ...validMetadata,
      challenge_type: 'blink',
    })).toThrow();
  });

  it('rejects invalid challenge_direction', () => {
    expect(() => ActiveLivenessMetadataSchema.parse({
      ...validMetadata,
      challenge_direction: 'up',
    })).toThrow();
  });

  it('rejects too few samples (< 5)', () => {
    expect(() => ActiveLivenessMetadataSchema.parse({
      ...validMetadata,
      samples: validMetadata.samples.slice(0, 3),
    })).toThrow();
  });

  it('accepts metadata without optional fields', () => {
    const { mediapipe_version, screen_width, screen_height, ...minimal } = validMetadata;
    expect(() => ActiveLivenessMetadataSchema.parse(minimal)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    const { challenge_direction, ...rest } = validMetadata;
    expect(() => ActiveLivenessMetadataSchema.parse(rest)).toThrow();
  });
});
