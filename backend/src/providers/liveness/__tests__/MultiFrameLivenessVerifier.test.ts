import { describe, it, expect, vi } from 'vitest';
import { verifyMultiFrameLiveness } from '../MultiFrameLivenessVerifier.js';
import type { FaceDetectionService } from '../MultiFrameLivenessVerifier.js';
import type { MultiFrameLivenessMetadata, AnalysisFrame } from '../../../verification/models/multiFrameLivenessSchema.js';
import type { FaceBufferDetectionResult } from '../../../services/faceRecognition.js';

// ─── Mock canvas module for computeFaceRegionAvgRGB ──────
// The verifier dynamically imports 'canvas'. We return different pixel data
// per call to simulate color reflection shifts between frames.
let getImageDataCallIndex = 0;
let getImageDataResponses: Uint8ClampedArray[] = [];

/** Set the pixel data sequence that getImageData will return. */
function setPixelDataSequence(responses: Array<[number, number, number]>) {
  getImageDataCallIndex = 0;
  getImageDataResponses = responses.map(([r, g, b]) => {
    // Build RGBA pixel data for a 640x480 image
    const data = new Uint8ClampedArray(640 * 480 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
    return data;
  });
}

vi.mock('canvas', () => ({
  loadImage: vi.fn().mockResolvedValue({ width: 640, height: 480 }),
  createCanvas: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockImplementation(() => {
        const idx = getImageDataCallIndex;
        getImageDataCallIndex++;
        const data = getImageDataResponses[idx] ?? new Uint8ClampedArray(640 * 480 * 4).fill(128);
        return { data, width: 640, height: 480 };
      }),
    }),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────

/** Fake base64 string (doesn't need to be valid JPEG for mocked detection). */
const FAKE_FRAME_BASE64 = 'AAAA'; // Small valid base64

/** Build a face detection result with specific yaw via landmark positioning. */
function makeFaceDetection(opts: {
  yaw?: number;
  confidence?: number;
}): FaceBufferDetectionResult {
  const { yaw = 0, confidence = 0.95 } = opts;

  // Build 68 landmarks. face-api indices: nose=30, leftEyeOuter=36, rightEyeOuter=45
  const landmarks: Array<{ x: number; y: number }> = Array.from({ length: 68 }, () => ({
    x: 320,
    y: 240,
  }));

  // Position eyes symmetrically
  landmarks[36] = { x: 280, y: 220 }; // left eye outer
  landmarks[45] = { x: 360, y: 220 }; // right eye outer

  // Position nose based on desired yaw
  // yaw = ((noseTip.x - eyeMidX) / interEyeDist) * 90
  // So noseTip.x = eyeMidX + (yaw / 90) * interEyeDist
  const eyeMidX = (280 + 360) / 2; // 320
  const interEyeDist = 80;
  const noseX = eyeMidX + (yaw / 90) * interEyeDist;
  landmarks[30] = { x: noseX, y: 250 }; // nose tip

  return {
    confidence,
    embedding: new Float32Array(128),
    landmarks,
    boundingBox: { x: 200, y: 150, width: 240, height: 300 },
  };
}

/**
 * Create a mock face detection service.
 * Called once per frame in the detection loop (7 calls for 7 frames).
 */
function createMockFaceService(
  detections: (FaceBufferDetectionResult | null)[],
): FaceDetectionService {
  let callIndex = 0;
  return {
    detectFaceFromBuffer: vi.fn().mockImplementation(async () => {
      const result = detections[callIndex % detections.length];
      callIndex++;
      return result;
    }),
  };
}

/** Build a valid multi-frame metadata payload. */
function makeMetadata(
  overrides: Partial<MultiFrameLivenessMetadata> = {},
): MultiFrameLivenessMetadata {
  const frames: AnalysisFrame[] = [
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 1000, phase: 'color_red', color_rgb: [255, 0, 0] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 2000, phase: 'color_green', color_rgb: [0, 255, 0] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 3000, phase: 'color_blue', color_rgb: [0, 0, 255] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 4000, phase: 'color_white', color_rgb: [255, 255, 255] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 5000, phase: 'turn_start' },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 6000, phase: 'turn_peak' },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 7000, phase: 'turn_return' },
  ];

  return {
    challenge_type: 'multi_frame_color',
    challenge_direction: 'left',
    frames: overrides.frames ?? frames,
    color_sequence: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]],
    start_timestamp: 1000,
    end_timestamp: 8000,
    ...overrides,
  };
}

/**
 * Set up pixel data for a successful color reflection test.
 * computeFaceRegionAvgRGB is called in this order:
 *   1. baseline (turn_start frame)
 *   2-5. color frames (red, green, blue, white — order matches metadata.frames)
 *
 * Baseline = neutral gray (128,128,128).
 * Color frames show a shift in the expected channel relative to baseline.
 */
function setupPassingColorPixels() {
  setPixelDataSequence([
    [128, 128, 128], // baseline (turn_start)
    [140, 125, 125], // color_red — R shifted up
    [125, 140, 125], // color_green — G shifted up
    [125, 125, 140], // color_blue — B shifted up
    [140, 140, 140], // color_white — all channels up
  ]);
}

/** Set up pixel data where color reflection FAILS (all frames identical). */
function setupFailingColorPixels() {
  setPixelDataSequence([
    [128, 128, 128], // baseline
    [128, 128, 128], // color_red — no shift (photo attack)
    [128, 128, 128], // color_green — no shift
    [128, 128, 128], // color_blue — no shift
    [128, 128, 128], // color_white — no shift
  ]);
}

// ─── Tests ──────────────────────────────────────────────

describe('MultiFrameLivenessVerifier', () => {
  describe('valid multi-frame sequence', () => {
    it('passes with correct head turn and color reflection', async () => {
      setupPassingColorPixels();
      // 4 color frames (neutral face) + turn_start (yaw=0), turn_peak (yaw=20), turn_return (yaw=0)
      // Front camera: physical left turn = positive yaw in raw image
      const detections = [
        makeFaceDetection({ yaw: 0 }),  // color_red
        makeFaceDetection({ yaw: 0 }),  // color_green
        makeFaceDetection({ yaw: 0 }),  // color_blue
        makeFaceDetection({ yaw: 0 }),  // color_white
        makeFaceDetection({ yaw: 0 }),  // turn_start
        makeFaceDetection({ yaw: 20 }), // turn_peak (left = positive in raw front-camera image)
        makeFaceDetection({ yaw: 2 }),  // turn_return (back to center)
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.face_present_all_frames.passed).toBe(true);
      expect(result.checks.head_turn_detected.passed).toBe(true);
      expect(result.checks.correct_direction.passed).toBe(true);
      expect(result.checks.return_to_center.passed).toBe(true);
      expect(result.checks.color_reflection_match.passed).toBe(true);
      expect(result.checks.virtual_camera_not_detected.passed).toBe(true);
      expect(result.passed).toBe(true);
    });

    it('passes for right direction turn', async () => {
      setupPassingColorPixels();
      // Front camera: physical right turn = negative yaw in raw image
      const detections = [
        makeFaceDetection({ yaw: 0 }),   // color_red
        makeFaceDetection({ yaw: 0 }),   // color_green
        makeFaceDetection({ yaw: 0 }),   // color_blue
        makeFaceDetection({ yaw: 0 }),   // color_white
        makeFaceDetection({ yaw: 0 }),   // turn_start
        makeFaceDetection({ yaw: -20 }), // turn_peak (right = negative in raw front-camera image)
        makeFaceDetection({ yaw: -2 }),  // turn_return
      ];

      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({ challenge_direction: 'right' });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.head_turn_detected.passed).toBe(true);
      expect(result.checks.correct_direction.passed).toBe(true);
      expect(result.checks.return_to_center.passed).toBe(true);
    });
  });

  describe('face presence check', () => {
    it('fails when face missing in 2+ frames', async () => {
      setupPassingColorPixels();
      const detections = [
        null,                            // color_red — no face
        null,                            // color_green — no face
        makeFaceDetection({ yaw: 0 }),   // color_blue
        makeFaceDetection({ yaw: 0 }),   // color_white
        makeFaceDetection({ yaw: 0 }),   // turn_start
        makeFaceDetection({ yaw: -20 }), // turn_peak
        makeFaceDetection({ yaw: 0 }),   // turn_return
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.face_present_all_frames.passed).toBe(false);
      expect(result.checks.face_present_all_frames.detail).toContain('5/7');
    });

    it('fails with low confidence face detection', async () => {
      setupPassingColorPixels();
      const detections = Array(7).fill(null).map(() =>
        makeFaceDetection({ yaw: 0, confidence: 0.1 }),
      );

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.face_present_all_frames.passed).toBe(false);
    });
  });

  describe('head turn detection', () => {
    it('fails when yaw delta is insufficient', async () => {
      setupPassingColorPixels();
      const detections = [
        makeFaceDetection({ yaw: 0 }), // color frames...
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }), // turn_start
        makeFaceDetection({ yaw: 5 }), // turn_peak — only 5 degrees (positive = left, but insufficient)
        makeFaceDetection({ yaw: 0 }), // turn_return
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.head_turn_detected.passed).toBe(false);
      expect(result.checks.head_turn_detected.detail).toContain('5.0');
    });
  });

  describe('direction validation', () => {
    it('fails when head turns in wrong direction', async () => {
      setupPassingColorPixels();
      // Asked to turn left but turned right (front camera: right = negative yaw)
      const detections = [
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),   // turn_start
        makeFaceDetection({ yaw: -20 }), // turn_peak — right (negative) instead of left (positive)
        makeFaceDetection({ yaw: -2 }),  // turn_return
      ];

      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({ challenge_direction: 'left' });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.correct_direction.passed).toBe(false);
    });
  });

  describe('return to center', () => {
    it('fails when head does not return to center', async () => {
      setupPassingColorPixels();
      const detections = [
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),  // turn_start
        makeFaceDetection({ yaw: 20 }), // turn_peak (left = positive)
        makeFaceDetection({ yaw: 15 }), // turn_return — still turned (15° from start > 8° tolerance)
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.return_to_center.passed).toBe(false);
    });
  });

  describe('color reflection match', () => {
    it('fails when no color shift detected (photo attack)', async () => {
      setupFailingColorPixels();
      const detections = Array(7).fill(null).map((_, i) => {
        if (i === 5) return makeFaceDetection({ yaw: 20 }); // left = positive in front camera
        return makeFaceDetection({ yaw: 0 });
      });

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.color_reflection_match.passed).toBe(false);
      expect(result.checks.color_reflection_match.detail).toContain('0/4');
    });

    it('passes when correct color shifts detected', async () => {
      setupPassingColorPixels();
      const detections = Array(7).fill(null).map((_, i) => {
        if (i === 5) return makeFaceDetection({ yaw: 20 }); // left = positive in front camera
        return makeFaceDetection({ yaw: 0 });
      });

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.color_reflection_match.passed).toBe(true);
    });
  });

  describe('virtual camera detection', () => {
    it('penalizes score when virtual camera detected', async () => {
      setupPassingColorPixels();
      const detections = Array(7).fill(null).map((_, i) => {
        if (i === 5) return makeFaceDetection({ yaw: 20 }); // left = positive in front camera
        return makeFaceDetection({ yaw: 0 });
      });

      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({
        virtual_camera_check: {
          label: 'obs virtual camera',
          suspected_virtual: true,
        },
      });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.virtual_camera_not_detected.passed).toBe(false);
      expect(result.checks.virtual_camera_not_detected.detail).toContain('suspected: true');
    });

    it('passes when camera is real', async () => {
      setupPassingColorPixels();
      const detections = Array(7).fill(null).map(() =>
        makeFaceDetection({ yaw: 0 }),
      );

      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({
        virtual_camera_check: {
          label: 'FaceTime HD Camera',
          suspected_virtual: false,
        },
      });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.virtual_camera_not_detected.passed).toBe(true);
    });
  });

  describe('score calculation', () => {
    it('returns weighted score between 0 and 1', async () => {
      setupPassingColorPixels();
      const detections = Array(7).fill(null).map(() =>
        makeFaceDetection({ yaw: 0 }),
      );
      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('includes reason when failed', async () => {
      setupFailingColorPixels();
      // All null detections → fails multiple checks
      const faceService = createMockFaceService(Array(7).fill(null));
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.passed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Failed checks');
    });

    it('fails overall when score < 0.70', async () => {
      setupFailingColorPixels();
      // No face in any frame → multiple checks fail
      const faceService = createMockFaceService(Array(7).fill(null));
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(0.70);
    });
  });
});
