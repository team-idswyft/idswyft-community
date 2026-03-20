import type { HeadTurnLivenessMetadata, AnalysisFrame } from '../../verification/models/headTurnLivenessSchema.js';
import type { FaceBufferDetectionResult } from '../../services/faceRecognition.js';
import { logger } from '@/utils/logger.js';

// ─── Types ──────────────────────────────────────────────

export interface HeadTurnLivenessResult {
  passed: boolean;
  score: number;
  checks: Record<string, { passed: boolean; weight: number; detail?: string }>;
  reason?: string;
}

/** Minimal interface for the face detection dependency (makes testing easy) */
export interface FaceDetectionService {
  detectFaceFromBuffer(buffer: Buffer): Promise<FaceBufferDetectionResult | null>;
}

// ─── Constants ──────────────────────────────────────────

const WEIGHTS = {
  face_present_all_frames: 0.15,
  head_turn_detected: 0.25,
  correct_direction: 0.20,
  return_to_center: 0.15,
  temporal_plausibility: 0.08,
  face_bbox_consistency: 0.07,
  virtual_camera_not_detected: 0.10,
} as const;

const PASS_THRESHOLD = 0.70;
const MIN_YAW_DELTA = 12;        // degrees
const RETURN_YAW_TOLERANCE = 8;  // degrees
const MIN_FACE_CONFIDENCE = 0.3;
const MIN_CHALLENGE_DURATION = 8000;   // 8s minimum for full challenge
const MAX_CHALLENGE_DURATION = 90000;  // 90s maximum (generous for slow users)
const MAX_BBOX_CV = 0.35;             // max coefficient of variation for face bbox areas

// ─── Helpers ────────────────────────────────────────────

/** Estimate yaw from 68-point landmarks (same technique as client-side). */
function estimateYawFromLandmarks(landmarks: Array<{ x: number; y: number }>): number {
  // face-api 68-point indices: nose tip = 30, left eye outer = 36, right eye outer = 45
  if (landmarks.length < 68) return 0;

  const noseTip = landmarks[30];
  const leftEyeOuter = landmarks[36];
  const rightEyeOuter = landmarks[45];

  const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
  const interEyeDist = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
  if (interEyeDist < 1) return 0;

  const offset = (noseTip.x - eyeMidX) / interEyeDist;
  return Math.max(-90, Math.min(90, offset * 90));
}

/** Decode base64 JPEG to Buffer. */
function decodeFrame(base64: string): Buffer {
  // Strip data URI prefix if present
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(raw, 'base64');
}

/** Compute coefficient of variation of face bounding box areas across frames. */
function computeBboxCV(
  detections: Array<{ detection: FaceBufferDetectionResult | null }>,
): { cv: number; count: number } {
  const areas = detections
    .filter((fd) => fd.detection !== null)
    .map((fd) => fd.detection!.boundingBox.width * fd.detection!.boundingBox.height);

  if (areas.length < 2) return { cv: 0, count: areas.length };

  const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
  if (mean === 0) return { cv: 0, count: areas.length };

  const variance = areas.reduce((sum, a) => sum + (a - mean) ** 2, 0) / areas.length;
  return { cv: Math.sqrt(variance) / mean, count: areas.length };
}

// ─── Main Verifier ──────────────────────────────────────

export async function verifyHeadTurnLiveness(
  metadata: HeadTurnLivenessMetadata,
  faceService: FaceDetectionService,
): Promise<HeadTurnLivenessResult> {
  const checks: Record<string, { passed: boolean; weight: number; detail?: string }> = {};

  // Decode all frames once and detect faces (C2 fix: cache buffers)
  const frameDetections: Array<{
    frame: AnalysisFrame;
    detection: FaceBufferDetectionResult | null;
    buffer: Buffer;
  }> = [];

  for (const frame of metadata.frames) {
    const buffer = decodeFrame(frame.frame_base64);
    const detection = await faceService.detectFaceFromBuffer(buffer);
    frameDetections.push({ frame, detection, buffer });
  }

  // ── Check 1: Face present in all frames ──
  const facesPresentCount = frameDetections.filter(
    (fd) => fd.detection !== null && fd.detection.confidence >= MIN_FACE_CONFIDENCE,
  ).length;
  const allFacesPresent = facesPresentCount === frameDetections.length;
  checks.face_present_all_frames = {
    passed: allFacesPresent,
    weight: WEIGHTS.face_present_all_frames,
    detail: `${facesPresentCount}/${frameDetections.length} frames have faces`,
  };

  // Separate motion frames for turn checks
  const motionFrames = frameDetections.filter(
    (fd) => ['turn_start', 'turn_peak', 'turn_return'].includes(fd.frame.phase),
  );

  // ── Check 2: Head turn detected ──
  const turnStart = motionFrames.find((fd) => fd.frame.phase === 'turn_start');
  const turnPeak = motionFrames.find((fd) => fd.frame.phase === 'turn_peak');
  const turnReturn = motionFrames.find((fd) => fd.frame.phase === 'turn_return');

  let startYaw = 0;
  let peakYaw = 0;
  let returnYaw = 0;

  if (turnStart?.detection) {
    startYaw = estimateYawFromLandmarks(turnStart.detection.landmarks);
  }
  if (turnPeak?.detection) {
    peakYaw = estimateYawFromLandmarks(turnPeak.detection.landmarks);
  }
  if (turnReturn?.detection) {
    returnYaw = estimateYawFromLandmarks(turnReturn.detection.landmarks);
  }

  const yawDelta = Math.abs(peakYaw - startYaw);
  checks.head_turn_detected = {
    passed: yawDelta >= MIN_YAW_DELTA,
    weight: WEIGHTS.head_turn_detected,
    detail: `yaw delta: ${yawDelta.toFixed(1)} degrees (need >= ${MIN_YAW_DELTA})`,
  };

  // ── Check 3: Correct direction ──
  const yawShift = peakYaw - startYaw;
  // Front-facing camera: physical left turn → nose moves right in raw image → positive yaw
  const expectedSign = metadata.challenge_direction === 'left' ? 1 : -1;
  const directionCorrect = yawDelta >= MIN_YAW_DELTA && yawShift * expectedSign > 0;
  checks.correct_direction = {
    passed: directionCorrect,
    weight: WEIGHTS.correct_direction,
    detail: `expected ${metadata.challenge_direction}, yaw shift: ${yawShift.toFixed(1)}`,
  };

  // ── Check 4: Return to center ──
  const returnDelta = Math.abs(returnYaw - startYaw);
  checks.return_to_center = {
    passed: returnDelta <= RETURN_YAW_TOLERANCE,
    weight: WEIGHTS.return_to_center,
    detail: `return delta: ${returnDelta.toFixed(1)} degrees (need <= ${RETURN_YAW_TOLERANCE})`,
  };

  // ── Check 5: Temporal plausibility ──
  // Frame timestamps must span a realistic challenge duration and be in order.
  const challengeDuration = metadata.end_timestamp - metadata.start_timestamp;
  const chronological = metadata.frames.every(
    (f, i) => i === 0 || f.timestamp >= metadata.frames[i - 1].timestamp,
  );
  const durationOk =
    challengeDuration >= MIN_CHALLENGE_DURATION &&
    challengeDuration <= MAX_CHALLENGE_DURATION;
  checks.temporal_plausibility = {
    passed: durationOk && chronological,
    weight: WEIGHTS.temporal_plausibility,
    detail: `duration: ${(challengeDuration / 1000).toFixed(1)}s (need ${MIN_CHALLENGE_DURATION / 1000}-${MAX_CHALLENGE_DURATION / 1000}s), chronological: ${chronological}`,
  };

  // ── Check 6: Face bounding box consistency ──
  // A real person at roughly the same distance will have consistent face size.
  // Spliced frames from different sources will have wildly different bbox areas.
  const { cv: bboxCV, count: bboxCount } = computeBboxCV(frameDetections);
  checks.face_bbox_consistency = {
    passed: bboxCount >= 2 ? bboxCV < MAX_BBOX_CV : true,
    weight: WEIGHTS.face_bbox_consistency,
    detail: `bbox area CV: ${bboxCV.toFixed(3)} (need < ${MAX_BBOX_CV}), ${bboxCount} faces measured`,
  };

  // ── Check 7: Virtual camera not detected ──
  const virtualCheck = metadata.virtual_camera_check;
  const virtualCameraOk = !virtualCheck?.suspected_virtual;
  checks.virtual_camera_not_detected = {
    passed: virtualCameraOk,
    weight: WEIGHTS.virtual_camera_not_detected,
    detail: virtualCheck ? `label: "${virtualCheck.label}", suspected: ${virtualCheck.suspected_virtual}` : 'no virtual camera check data',
  };

  // ── Score calculation ──
  let score = 0;
  for (const [, check] of Object.entries(checks)) {
    if (check.passed) score += check.weight;
  }

  const passed = score >= PASS_THRESHOLD;
  const failedChecks = Object.entries(checks)
    .filter(([, c]) => !c.passed)
    .map(([name]) => name);

  const reason = passed
    ? undefined
    : `Failed checks: ${failedChecks.join(', ')}`;

  logger.info('Head-turn liveness verification complete', {
    score: score.toFixed(3),
    passed,
    checks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { passed: v.passed, detail: v.detail }]),
    ),
  });

  return { passed, score, checks, reason };
}
