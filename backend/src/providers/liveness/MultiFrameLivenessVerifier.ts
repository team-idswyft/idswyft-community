import type { MultiFrameLivenessMetadata, AnalysisFrame } from '../../verification/models/multiFrameLivenessSchema.js';
import type { FaceBufferDetectionResult } from '../../services/faceRecognition.js';
import { logger } from '@/utils/logger.js';

// ─── Types ──────────────────────────────────────────────

export interface MultiFrameLivenessResult {
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
  color_reflection_match: 0.15,
  virtual_camera_not_detected: 0.10,
} as const;

const PASS_THRESHOLD = 0.70;
const MIN_YAW_DELTA = 12;        // degrees
const RETURN_YAW_TOLERANCE = 8;  // degrees
const MIN_FACE_CONFIDENCE = 0.3;
const MIN_COLOR_MATCHES = 3;     // out of 4 color frames
const COLOR_SHIFT_THRESHOLD = 3; // minimum RGB delta in expected channel vs baseline

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

/**
 * Compute average RGB in a face bounding box region of an image buffer.
 * Uses the canvas module to read pixel data.
 */
async function computeFaceRegionAvgRGB(
  buffer: Buffer,
  bbox: { x: number; y: number; width: number; height: number },
): Promise<[number, number, number]> {
  let canvasModule: any;
  try {
    canvasModule = await import('canvas');
  } catch {
    return [128, 128, 128]; // neutral fallback
  }

  const img = await canvasModule.loadImage(buffer);
  const canvas = canvasModule.createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Clamp bbox to image bounds
  const x = Math.max(0, Math.round(bbox.x));
  const y = Math.max(0, Math.round(bbox.y));
  const w = Math.min(Math.round(bbox.width), img.width - x);
  const h = Math.min(Math.round(bbox.height), img.height - y);

  if (w <= 0 || h <= 0) return [128, 128, 128];

  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  let rSum = 0, gSum = 0, bSum = 0;
  const pixelCount = w * h;

  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }

  return [rSum / pixelCount, gSum / pixelCount, bSum / pixelCount];
}

/**
 * Check if the RELATIVE color shift between a color frame and a baseline frame
 * matches the expected flash color. This works in ambient light because it
 * measures the *change* caused by the screen flash, not absolute channel values.
 *
 * For colored flashes (R/G/B): the delta in the expected channel should be
 * positive and the largest delta among all three channels.
 * For white flash: overall brightness should increase vs baseline.
 *
 * A printed photo or screen replay cannot reflect randomized colors from the
 * device screen, so the deltas will be near-zero → check fails.
 */
function colorShiftMatches(
  frameRGB: [number, number, number],
  baselineRGB: [number, number, number],
  expectedRGB: [number, number, number],
): boolean {
  const [dr, dg, db] = [
    frameRGB[0] - baselineRGB[0],
    frameRGB[1] - baselineRGB[1],
    frameRGB[2] - baselineRGB[2],
  ];
  const [er, eg, eb] = expectedRGB;

  // White flash: all channels should increase (overall brightness up)
  if (er >= 200 && eg >= 200 && eb >= 200) {
    const avgDelta = (dr + dg + db) / 3;
    return avgDelta > COLOR_SHIFT_THRESHOLD;
  }

  // Red flash: R delta should be positive and largest
  if (er > eg && er > eb) {
    return dr > COLOR_SHIFT_THRESHOLD && dr > dg && dr > db;
  }
  // Green flash: G delta should be positive and largest
  if (eg > er && eg > eb) {
    return dg > COLOR_SHIFT_THRESHOLD && dg > dr && dg > db;
  }
  // Blue flash: B delta should be positive and largest
  if (eb > er && eb > eg) {
    return db > COLOR_SHIFT_THRESHOLD && db > dr && db > dg;
  }

  return false;
}

// ─── Main Verifier ──────────────────────────────────────

export async function verifyMultiFrameLiveness(
  metadata: MultiFrameLivenessMetadata,
  faceService: FaceDetectionService,
): Promise<MultiFrameLivenessResult> {
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

  // Separate motion and color frames
  const motionFrames = frameDetections.filter(
    (fd) => ['turn_start', 'turn_peak', 'turn_return'].includes(fd.frame.phase),
  );
  const colorFrames = frameDetections.filter(
    (fd) => fd.frame.phase.startsWith('color_'),
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

  // ── Check 5: Color reflection match (relative shift vs baseline) ──
  // Use turn_start frame as baseline — it has no color flash overlay.
  // C1 fix: compare RELATIVE RGB shift, not absolute channel dominance.
  let baselineRGB: [number, number, number] = [128, 128, 128];
  if (turnStart?.detection) {
    baselineRGB = await computeFaceRegionAvgRGB(turnStart.buffer, turnStart.detection.boundingBox);
  }

  let colorMatches = 0;
  const colorDetails: string[] = [];

  for (const fd of colorFrames) {
    if (!fd.detection || !fd.frame.color_rgb) {
      colorDetails.push(`${fd.frame.phase}: no face/no color`);
      continue;
    }

    // C2 fix: reuse cached buffer instead of re-decoding
    const avgRGB = await computeFaceRegionAvgRGB(fd.buffer, fd.detection.boundingBox);
    const matches = colorShiftMatches(avgRGB, baselineRGB, fd.frame.color_rgb as [number, number, number]);

    if (matches) colorMatches++;
    colorDetails.push(
      `${fd.frame.phase}: avg=[${avgRGB.map((v) => v.toFixed(0)).join(',')}] ` +
      `baseline=[${baselineRGB.map((v) => v.toFixed(0)).join(',')}] ` +
      `expected=[${fd.frame.color_rgb.join(',')}] → ${matches ? 'MATCH' : 'MISS'}`,
    );
  }

  checks.color_reflection_match = {
    passed: colorMatches >= MIN_COLOR_MATCHES,
    weight: WEIGHTS.color_reflection_match,
    detail: `${colorMatches}/${colorFrames.length} colors matched (need >= ${MIN_COLOR_MATCHES}). ${colorDetails.join('; ')}`,
  };

  // ── Check 6: Virtual camera not detected ──
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

  logger.info('Multi-frame liveness verification complete', {
    score: score.toFixed(3),
    passed,
    checks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { passed: v.passed, detail: v.detail }]),
    ),
  });

  return { passed, score, checks, reason };
}
