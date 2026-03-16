import { describe, it, expect, vi } from 'vitest';
import { verifyMultiFrameLiveness } from '../MultiFrameLivenessVerifier.js';
import type { FaceDetectionService } from '../MultiFrameLivenessVerifier.js';
import type { MultiFrameLivenessMetadata, AnalysisFrame } from '../../../verification/models/multiFrameLivenessSchema.js';
import type { FaceBufferDetectionResult } from '../../../services/faceRecognition.js';

// ─── Helpers ─────────────────────────────────────────────

/** Fake base64 string (doesn't need to be valid JPEG for mocked detection). */
const FAKE_FRAME_BASE64 = 'AAAA'; // Small valid base64

/** Build a face detection result with specific yaw via landmark positioning. */
function makeFaceDetection(opts: {
  yaw?: number;
  confidence?: number;
  bboxSize?: number;
}): FaceBufferDetectionResult {
  const { yaw = 0, confidence = 0.95, bboxSize = 240 } = opts;

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
    boundingBox: { x: 200, y: 150, width: bboxSize, height: bboxSize * 1.25 },
  };
}

/**
 * Create a mock face detection service.
 * Called once per frame in the detection loop.
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
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 2500, phase: 'color_green', color_rgb: [0, 255, 0] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 4000, phase: 'color_blue', color_rgb: [0, 0, 255] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 5500, phase: 'color_white', color_rgb: [255, 255, 255] },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 7000, phase: 'turn_start' },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 10000, phase: 'turn_peak' },
    { frame_base64: FAKE_FRAME_BASE64, timestamp: 13000, phase: 'turn_return' },
  ];

  return {
    challenge_type: 'multi_frame_color',
    challenge_direction: 'left',
    frames: overrides.frames ?? frames,
    color_sequence: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]],
    start_timestamp: 0,
    end_timestamp: 15000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('MultiFrameLivenessVerifier', () => {
  describe('valid multi-frame sequence', () => {
    it('passes with correct head turn and consistent face', async () => {
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
      expect(result.checks.temporal_plausibility.passed).toBe(true);
      expect(result.checks.face_bbox_consistency.passed).toBe(true);
      expect(result.checks.virtual_camera_not_detected.passed).toBe(true);
      expect(result.passed).toBe(true);
    });

    it('passes for right direction turn', async () => {
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

  describe('temporal plausibility', () => {
    it('passes with realistic challenge duration', async () => {
      const detections = Array(7).fill(null).map(() => makeFaceDetection({ yaw: 0 }));
      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({
        start_timestamp: 0,
        end_timestamp: 15000, // 15s — realistic
      });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.temporal_plausibility.passed).toBe(true);
    });

    it('fails when challenge is too short', async () => {
      const detections = Array(7).fill(null).map(() => makeFaceDetection({ yaw: 0 }));
      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({
        start_timestamp: 0,
        end_timestamp: 2000, // 2s — too fast (replay or manipulation)
      });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.temporal_plausibility.passed).toBe(false);
      expect(result.checks.temporal_plausibility.detail).toContain('2.0s');
    });

    it('fails when challenge is too long', async () => {
      const detections = Array(7).fill(null).map(() => makeFaceDetection({ yaw: 0 }));
      const faceService = createMockFaceService(detections);
      const metadata = makeMetadata({
        start_timestamp: 0,
        end_timestamp: 100000, // 100s — too long
      });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.temporal_plausibility.passed).toBe(false);
    });

    it('fails when frame timestamps are not chronological', async () => {
      const detections = Array(7).fill(null).map(() => makeFaceDetection({ yaw: 0 }));
      const faceService = createMockFaceService(detections);
      const frames: AnalysisFrame[] = [
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 5000, phase: 'color_red', color_rgb: [255, 0, 0] },
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 3000, phase: 'color_green', color_rgb: [0, 255, 0] }, // out of order
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 4000, phase: 'color_blue', color_rgb: [0, 0, 255] },
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 5500, phase: 'color_white', color_rgb: [255, 255, 255] },
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 7000, phase: 'turn_start' },
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 10000, phase: 'turn_peak' },
        { frame_base64: FAKE_FRAME_BASE64, timestamp: 13000, phase: 'turn_return' },
      ];
      const metadata = makeMetadata({ frames, start_timestamp: 0, end_timestamp: 15000 });
      const result = await verifyMultiFrameLiveness(metadata, faceService);

      expect(result.checks.temporal_plausibility.passed).toBe(false);
      expect(result.checks.temporal_plausibility.detail).toContain('chronological: false');
    });
  });

  describe('face bounding box consistency', () => {
    it('passes when face sizes are consistent', async () => {
      // All faces roughly the same size (±10%)
      const detections = [
        makeFaceDetection({ yaw: 0, bboxSize: 240 }),
        makeFaceDetection({ yaw: 0, bboxSize: 245 }),
        makeFaceDetection({ yaw: 0, bboxSize: 235 }),
        makeFaceDetection({ yaw: 0, bboxSize: 242 }),
        makeFaceDetection({ yaw: 0, bboxSize: 238 }),
        makeFaceDetection({ yaw: 20, bboxSize: 250 }),
        makeFaceDetection({ yaw: 2, bboxSize: 240 }),
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.face_bbox_consistency.passed).toBe(true);
    });

    it('fails when face sizes vary wildly (spliced frames)', async () => {
      // Some frames have very different face sizes — suggests different sources
      const detections = [
        makeFaceDetection({ yaw: 0, bboxSize: 240 }),
        makeFaceDetection({ yaw: 0, bboxSize: 100 }), // much smaller — different source
        makeFaceDetection({ yaw: 0, bboxSize: 240 }),
        makeFaceDetection({ yaw: 0, bboxSize: 400 }), // much larger — different source
        makeFaceDetection({ yaw: 0, bboxSize: 240 }),
        makeFaceDetection({ yaw: 20, bboxSize: 120 }), // different source
        makeFaceDetection({ yaw: 2, bboxSize: 240 }),
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.checks.face_bbox_consistency.passed).toBe(false);
    });
  });

  describe('virtual camera detection', () => {
    it('penalizes score when virtual camera detected', async () => {
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
      const detections = Array(7).fill(null).map(() =>
        makeFaceDetection({ yaw: 0 }),
      );
      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('includes reason when failed', async () => {
      // All null detections → fails multiple checks
      const faceService = createMockFaceService(Array(7).fill(null));
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.passed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Failed checks');
    });

    it('fails overall when score < 0.70', async () => {
      // No face in any frame → multiple checks fail
      const faceService = createMockFaceService(Array(7).fill(null));
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(0.70);
    });

    it('achieves perfect score with all checks passing', async () => {
      const detections = [
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 0 }),
        makeFaceDetection({ yaw: 20 }),
        makeFaceDetection({ yaw: 2 }),
      ];

      const faceService = createMockFaceService(detections);
      const result = await verifyMultiFrameLiveness(makeMetadata(), faceService);

      expect(result.score).toBeCloseTo(1, 5);
      expect(result.passed).toBe(true);
    });
  });
});
