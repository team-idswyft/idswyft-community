import { useEffect, useRef, useState, useCallback } from 'react';
// Type-only import — the actual module is loaded dynamically inside useEffect
// to keep @mediapipe/tasks-vision out of the main bundle (prevents page crash
// if WASM init fails at module level on mobile browsers)
import type { FaceDetector as FaceDetectorType } from '@mediapipe/tasks-vision';

// ─── Types ──────────────────────────────────────────────────

export type LivenessPhase =
  | 'loading'
  | 'ready'
  | 'center_face'
  | 'turn'
  | 'return_center'
  | 'capturing'
  | 'completed'
  | 'failed'
  | 'fallback';

export type ChallengeDirection = 'left' | 'right';

export interface HeadPoseSample {
  timestamp: number;
  yaw: number;
  pitch: number;
  roll: number;
  landmarks: number[];
}

export interface LivenessMetadata {
  challenge_type: 'head_turn';
  challenge_direction: ChallengeDirection;
  samples: HeadPoseSample[];
  start_timestamp: number;
  end_timestamp: number;
  mediapipe_version?: string;
  screen_width?: number;
  screen_height?: number;
}

export interface UseActiveLivenessOptions {
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  enabled: boolean;
  onComplete: (bestFrame: Blob, metadata: LivenessMetadata) => void;
  onFallback: () => void;
  challengeTimeoutMs?: number;
}

export interface UseActiveLivenessReturn {
  phase: LivenessPhase;
  direction: ChallengeDirection;
  instruction: string;
  progress: number;
  faceDetected: boolean;
  currentYaw: number;
  error: string | null;
  retry: () => void;
}

// FaceDetector keypoint indices:
// right_eye (#0), left_eye (#1), nose_tip (#2),
// mouth_center (#3), right_ear_tragion (#4), left_ear_tragion (#5)

// ─── Thresholds ──────────────────────────────────────────────
const CENTER_YAW_THRESHOLD = 5;       // ±5° for "centered"
const CENTER_HOLD_MS = 500;           // Hold center for 500ms
const TURN_YAW_THRESHOLD = 20;        // Must turn 20° from baseline
const RETURN_YAW_THRESHOLD = 8;       // ±8° to be "back to center"
const MEDIAPIPE_LOAD_TIMEOUT = 45000; // 45s — generous for slow mobile connections
const DEFAULT_CHALLENGE_TIMEOUT = 10000;

// FaceDetector model — 224KB vs FaceLandmarker's 4.6MB.
// Compiles in seconds on mobile WebKit vs hanging indefinitely.
const MODEL_CDN_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const WASM_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

function pickRandomDirection(): ChallengeDirection {
  return Math.random() < 0.5 ? 'left' : 'right';
}

function getInstructionForPhase(phase: LivenessPhase, direction: ChallengeDirection, loadingDetail?: string): string {
  switch (phase) {
    case 'loading': return loadingDetail || 'Preparing face detection...';
    case 'ready': return 'Camera ready. Position your face in the oval.';
    case 'center_face': return 'Look straight at the camera';
    case 'turn': return direction === 'left' ? 'Slowly turn your head left' : 'Slowly turn your head right';
    case 'return_center': return 'Now look straight ahead again';
    case 'capturing': return 'Hold still — capturing...';
    case 'completed': return 'Liveness check passed!';
    case 'failed': return 'Liveness check failed. Tap to retry.';
    case 'fallback': return 'Face detection unavailable. Using standard capture.';
    default: return '';
  }
}

/**
 * Estimate yaw angle from nose tip and eye keypoints.
 * Uses nose-tip horizontal offset relative to eye midpoint,
 * normalized by inter-eye distance.
 */
function estimateYaw(
  noseTip: { x: number; y: number },
  leftEye: { x: number; y: number },
  rightEye: { x: number; y: number },
): number {
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const interEyeDist = Math.abs(rightEye.x - leftEye.x);
  if (interEyeDist < 0.001) return 0;

  const offset = (noseTip.x - eyeMidX) / interEyeDist;
  // Map normalized offset to approximate degrees (-90 to +90)
  return Math.max(-90, Math.min(90, offset * 90));
}

// ─── Hook ────────────────────────────────────────────────────

export function useActiveLiveness(options: UseActiveLivenessOptions): UseActiveLivenessReturn {
  const {
    videoElement,
    canvasElement,
    enabled,
    onComplete,
    onFallback,
    challengeTimeoutMs = DEFAULT_CHALLENGE_TIMEOUT,
  } = options;

  const [phase, setPhase] = useState<LivenessPhase>('loading');
  const [direction, setDirection] = useState<ChallengeDirection>(pickRandomDirection);
  const [faceDetected, setFaceDetected] = useState(false);
  const [currentYaw, setCurrentYaw] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState('Preparing face detection...');

  const detectorRef = useRef<FaceDetectorType | null>(null);
  const samplesRef = useRef<HeadPoseSample[]>([]);
  const baselineYawRef = useRef(0);
  const centerStartRef = useRef(0);
  const challengeStartRef = useRef(0);
  const bestFrameRef = useRef<Blob | null>(null);
  const animFrameRef = useRef(0);
  const phaseRef = useRef(phase);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Initialize FaceDetector ──
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && phaseRef.current === 'loading') {
        cancelled = true; // Prevent late-resolving createFromOptions from overriding fallback
        console.warn('MediaPipe load timeout — falling back');
        setPhase('fallback');
        onFallback();
      }
    }, MEDIAPIPE_LOAD_TIMEOUT);

    (async () => {
      try {
        // Step 1: Dynamic import — code-splits @mediapipe/tasks-vision into a separate chunk
        // so WASM init failures don't crash the entire page
        setLoadingDetail('Loading detection library...');
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        if (cancelled) return;

        // Step 2: Pre-fetch model as ArrayBuffer — avoids silent fetch failure inside WASM context on mobile
        setLoadingDetail('Downloading face model...');
        const modelResponse = await fetch(MODEL_CDN_URL);
        if (!modelResponse.ok) throw new Error(`Model download failed: ${modelResponse.status}`);
        const modelBuffer = await modelResponse.arrayBuffer();
        if (cancelled) return;

        // Step 3: Load WASM runtime from CDN
        setLoadingDetail('Loading detection engine...');
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
        if (cancelled) return;

        // Step 4: Create FaceDetector with pre-fetched 224KB BlazeFace model
        setLoadingDetail('Initializing face detection...');
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetBuffer: new Uint8Array(modelBuffer),
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });

        if (cancelled) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        clearTimeout(timeout);
        setPhase('ready');
      } catch (err) {
        console.error('MediaPipe init failed:', err);
        if (!cancelled) {
          setPhase('fallback');
          onFallback();
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-transition from ready → center_face when video is playing ──
  useEffect(() => {
    if (phase === 'ready' && videoElement && videoElement.readyState >= 2) {
      setPhase('center_face');
    } else if (phase === 'ready' && videoElement) {
      const onPlaying = () => setPhase('center_face');
      videoElement.addEventListener('playing', onPlaying);
      return () => videoElement.removeEventListener('playing', onPlaying);
    }
  }, [phase, videoElement]);

  // ── Main detection loop ──
  useEffect(() => {
    if (!enabled || !videoElement || !detectorRef.current) return;
    if (phase !== 'center_face' && phase !== 'turn' && phase !== 'return_center') return;

    const detector = detectorRef.current;
    let running = true;

    const detect = () => {
      if (!running || !videoElement || videoElement.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      let results;
      try {
        results = detector.detectForVideo(videoElement, now);
      } catch (e) {
        console.warn('FaceDetector.detectForVideo error:', e);
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const det = results.detections?.[0];
      const hasDetections = !!det?.keypoints && det.keypoints.length >= 3;
      setFaceDetected(!!hasDetections);

      if (!hasDetections) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // FaceDetector keypoints: right_eye(0), left_eye(1), nose_tip(2),
      // mouth_center(3), right_ear_tragion(4), left_ear_tragion(5)
      const keypoints = results.detections[0].keypoints!;
      const rightEye = keypoints[0];
      const leftEye = keypoints[1];
      const noseTip = keypoints[2];
      const mouthCenter = keypoints[3] || noseTip;
      const rightEar = keypoints[4] || rightEye;
      const leftEar = keypoints[5] || leftEye;

      const yaw = estimateYaw(noseTip, leftEye, rightEye);
      const pitch = 0; // FaceDetector lacks chin keypoint — not needed for head-turn
      const roll = 0;
      setCurrentYaw(yaw);

      // Build landmark array (6 keypoints × 3 coords, z=0 for backend compatibility)
      const landmarkArray = [noseTip, mouthCenter, leftEye, rightEye, leftEar, rightEar]
        .flatMap(kp => [kp.x, kp.y, 0]);

      const currentPhase = phaseRef.current;

      // ── Phase: center_face ──
      if (currentPhase === 'center_face') {
        if (Math.abs(yaw) <= CENTER_YAW_THRESHOLD) {
          if (centerStartRef.current === 0) {
            centerStartRef.current = now;
          } else if (now - centerStartRef.current >= CENTER_HOLD_MS) {
            // Face centered for long enough — start challenge
            baselineYawRef.current = yaw;
            samplesRef.current = [];
            challengeStartRef.current = now;
            setPhase('turn');
          }
          setProgress((now - centerStartRef.current) / CENTER_HOLD_MS);
        } else {
          centerStartRef.current = 0;
          setProgress(0);
        }
      }

      // ── Phase: turn ──
      if (currentPhase === 'turn') {
        const sample: HeadPoseSample = {
          timestamp: now,
          yaw,
          pitch,
          roll,
          landmarks: landmarkArray,
        };
        samplesRef.current.push(sample);

        const delta = yaw - baselineYawRef.current;
        const expectedSign = direction === 'left' ? -1 : 1;
        const normalizedDelta = delta * expectedSign;
        setProgress(Math.min(1, normalizedDelta / TURN_YAW_THRESHOLD));

        if (normalizedDelta >= TURN_YAW_THRESHOLD) {
          setPhase('return_center');
        }

        // Timeout check
        if (now - challengeStartRef.current > challengeTimeoutMs) {
          setPhase('failed');
          setError('Challenge timed out. Please try again.');
        }
      }

      // ── Phase: return_center ──
      if (currentPhase === 'return_center') {
        const sample: HeadPoseSample = {
          timestamp: now,
          yaw,
          pitch,
          roll,
          landmarks: landmarkArray,
        };
        samplesRef.current.push(sample);

        const returnDelta = Math.abs(yaw - baselineYawRef.current);
        setProgress(1 - Math.min(1, returnDelta / TURN_YAW_THRESHOLD));

        if (returnDelta <= RETURN_YAW_THRESHOLD) {
          // Capture the best frame
          setPhase('capturing');
          captureFrame();
        }

        // Timeout check
        if (now - challengeStartRef.current > challengeTimeoutMs) {
          setPhase('failed');
          setError('Challenge timed out. Please try again.');
        }
      }

      animFrameRef.current = requestAnimationFrame(detect);
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, enabled, videoElement, direction, challengeTimeoutMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Capture frame from canvas ──
  const captureFrame = useCallback(() => {
    if (!canvasElement || !videoElement) {
      setPhase('failed');
      setError('Canvas not available for capture');
      return;
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
      setPhase('failed');
      setError('Canvas context not available');
      return;
    }

    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    ctx.drawImage(videoElement, 0, 0);

    canvasElement.toBlob(
      (blob) => {
        if (!blob) {
          setPhase('failed');
          setError('Frame capture failed');
          return;
        }

        bestFrameRef.current = blob;
        const endTime = performance.now();
        const samples = samplesRef.current;

        const metadata: LivenessMetadata = {
          challenge_type: 'head_turn',
          challenge_direction: direction,
          samples,
          start_timestamp: challengeStartRef.current,
          end_timestamp: endTime,
          mediapipe_version: '0.10.21',
          screen_width: window.innerWidth,
          screen_height: window.innerHeight,
        };

        setPhase('completed');
        onComplete(blob, metadata);
      },
      'image/jpeg',
      0.92,
    );
  }, [canvasElement, videoElement, direction, onComplete]);

  // ── Retry ──
  const retry = useCallback(() => {
    samplesRef.current = [];
    centerStartRef.current = 0;
    challengeStartRef.current = 0;
    setDirection(pickRandomDirection());
    setError(null);
    setProgress(0);
    setPhase('center_face');
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };
  }, []);

  return {
    phase,
    direction,
    instruction: getInstructionForPhase(phase, direction, loadingDetail),
    progress,
    faceDetected,
    currentYaw,
    error,
    retry,
  };
}
