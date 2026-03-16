import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────

export type LivenessPhase =
  | 'ready'
  | 'turn'
  | 'return_center'
  | 'capturing'
  | 'completed'
  | 'failed'
  | 'fallback';

export type ChallengeDirection = 'left' | 'right';

export interface AnalysisFrame {
  frame_base64: string;
  timestamp: number;
  phase: string;
  color_rgb?: [number, number, number];
}

export interface LivenessMetadata {
  challenge_type: 'multi_frame_color';
  challenge_direction: ChallengeDirection;
  frames: AnalysisFrame[];
  color_sequence: [number, number, number][];
  start_timestamp: number;
  end_timestamp: number;
  screen_width?: number;
  screen_height?: number;
  virtual_camera_check?: {
    label: string;
    suspected_virtual: boolean;
  };
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

// ─── Constants ──────────────────────────────────────────

const DEFAULT_CHALLENGE_TIMEOUT = 35000;
const TURN_HOLD_MS = 3000;         // hold turn for 3s — user needs time to turn head ≥12°
const RETURN_HOLD_MS = 3000;       // hold center for 3s — unhurried return

const VIRTUAL_CAMERA_REGEX = /obs|virtual|manycam|snap camera|fake|xsplit|streamlabs/i;

// ─── Helpers ────────────────────────────────────────────

function pickRandomDirection(): ChallengeDirection {
  return Math.random() < 0.5 ? 'left' : 'right';
}

function getInstructionForPhase(phase: LivenessPhase, direction: ChallengeDirection): string {
  switch (phase) {
    case 'ready': return 'Position your face in the oval';
    case 'turn': return direction === 'left' ? 'Slowly turn your head left' : 'Slowly turn your head right';
    case 'return_center': return 'Now look straight ahead';
    case 'capturing': return 'Hold still — capturing...';
    case 'completed': return 'Liveness check passed!';
    case 'failed': return 'Liveness check failed. Tap to retry.';
    case 'fallback': return 'Camera unavailable. Using standard capture.';
    default: return '';
  }
}

/** Max analysis frame dimensions — keeps base64 under the 200K schema limit. */
const MAX_ANALYSIS_WIDTH = 640;
const MAX_ANALYSIS_HEIGHT = 480;

/** Capture a frame from video as base64 JPEG using the hidden canvas.
 *  Downscales to MAX_ANALYSIS dimensions to keep payload small. */
function captureFrameAsBase64(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality: number = 0.7,
): string {
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 480;
  const scale = Math.min(1, MAX_ANALYSIS_WIDTH / srcW, MAX_ANALYSIS_HEIGHT / srcH);
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/jpeg;base64,/, '');
}

// ─── Hook ────────────────────────────────────────────────

export function useActiveLiveness(options: UseActiveLivenessOptions): UseActiveLivenessReturn {
  const {
    videoElement,
    canvasElement,
    enabled,
    onComplete,
    // onFallback is handled by the component (camera access errors), not the hook
    challengeTimeoutMs = DEFAULT_CHALLENGE_TIMEOUT,
  } = options;

  const [phase, setPhase] = useState<LivenessPhase>('ready');
  const [direction, setDirection] = useState<ChallengeDirection>(pickRandomDirection);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  const framesRef = useRef<AnalysisFrame[]>([]);
  const challengeStartRef = useRef(0);
  const returnStartRef = useRef(0);
  const virtualCameraRef = useRef<{ label: string; suspected_virtual: boolean } | undefined>(undefined);
  const animFrameRef = useRef(0);
  const turnDelayRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const turnCountRef = useRef(0);
  const scoredDirectionRef = useRef<ChallengeDirection>('left');

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Virtual camera detection on mount ──
  useEffect(() => {
    if (!enabled || !videoElement) return;
    const stream = videoElement.srcObject as MediaStream | null;
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    if (track) {
      const label = track.label;
      virtualCameraRef.current = {
        label,
        suspected_virtual: VIRTUAL_CAMERA_REGEX.test(label),
      };
    }
  }, [enabled, videoElement]);

  // ── Auto-start challenge when video is playing ──
  useEffect(() => {
    if (phase !== 'ready' || !videoElement || !canvasElement || !enabled) return;

    const startChallenge = () => {
      framesRef.current = [];
      turnCountRef.current = 0;
      const firstDir = pickRandomDirection();
      scoredDirectionRef.current = firstDir === 'left' ? 'right' : 'left';
      setDirection(firstDir);
      challengeStartRef.current = performance.now();

      // Capture baseline frame for first turn
      const base64 = captureFrameAsBase64(videoElement, canvasElement);
      framesRef.current.push({
        frame_base64: base64,
        timestamp: performance.now(),
        phase: 'turn1_start',
      });

      setPhase('turn');
    };

    if (videoElement.readyState >= 2) {
      const timer = setTimeout(startChallenge, 2500);
      return () => clearTimeout(timer);
    } else {
      const onPlaying = () => {
        setTimeout(startChallenge, 2500);
      };
      videoElement.addEventListener('playing', onPlaying);
      return () => videoElement.removeEventListener('playing', onPlaying);
    }
  }, [phase, videoElement, canvasElement, enabled]);

  // ── Turn phase — wait for user to hold turn position ──
  useEffect(() => {
    if (phase !== 'turn' || !videoElement || !canvasElement) return;

    let running = true;

    const timer = setTimeout(() => {
      if (!running) return;

      const isFirstTurn = turnCountRef.current === 0;
      const base64 = captureFrameAsBase64(videoElement, canvasElement);
      framesRef.current.push({
        frame_base64: base64,
        timestamp: performance.now(),
        phase: isFirstTurn ? 'turn1_peak' : 'turn_peak',
      });

      setProgress(isFirstTurn ? 1 / 4 : 3 / 4);

      returnStartRef.current = performance.now();
      setPhase('return_center');
    }, TURN_HOLD_MS);

    // Timeout check
    const timeoutTimer = setTimeout(() => {
      if (running && phaseRef.current === 'turn') {
        setPhase('failed');
        setError('Challenge timed out. Please try again.');
      }
    }, challengeTimeoutMs);

    return () => {
      running = false;
      clearTimeout(timer);
      clearTimeout(timeoutTimer);
    };
  }, [phase, videoElement, canvasElement, challengeTimeoutMs]);

  // ── Return to center phase ──
  useEffect(() => {
    if (phase !== 'return_center' || !videoElement || !canvasElement) return;

    let running = true;

    const timer = setTimeout(() => {
      if (!running) return;

      const isFirstTurn = turnCountRef.current === 0;
      const base64 = captureFrameAsBase64(videoElement, canvasElement);
      framesRef.current.push({
        frame_base64: base64,
        timestamp: performance.now(),
        phase: isFirstTurn ? 'turn1_return' : 'turn_return',
      });

      if (isFirstTurn) {
        // First turn done — capture scored baseline and start second turn
        setProgress(2 / 4);
        const startBase64 = captureFrameAsBase64(videoElement, canvasElement);
        framesRef.current.push({
          frame_base64: startBase64,
          timestamp: performance.now(),
          phase: 'turn_start',
        });
        turnCountRef.current = 1;
        setDirection(scoredDirectionRef.current);
        // Brief pause before second turn instruction
        turnDelayRef.current = setTimeout(() => {
          if (phaseRef.current === 'return_center') setPhase('turn');
        }, 1200);
      } else {
        // Second turn done — finalize
        setProgress(1);
        setPhase('capturing');
        finalizeLiveness();
      }
    }, RETURN_HOLD_MS);

    return () => {
      running = false;
      clearTimeout(timer);
      clearTimeout(turnDelayRef.current);
    };
  }, [phase, videoElement, canvasElement]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Finalize: capture best frame and build metadata ──
  const finalizeLiveness = useCallback(() => {
    if (!canvasElement || !videoElement) {
      setPhase('failed');
      setError('Canvas not available for capture');
      return;
    }

    // Capture the best (final, centered) frame as blob
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
      setPhase('failed');
      setError('Canvas context not available');
      return;
    }
    ctx.drawImage(videoElement, 0, 0);

    canvasElement.toBlob(
      (blob) => {
        if (!blob) {
          setPhase('failed');
          setError('Frame capture failed');
          return;
        }

        const metadata: LivenessMetadata = {
          challenge_type: 'multi_frame_color',
          challenge_direction: scoredDirectionRef.current,
          frames: framesRef.current,
          color_sequence: [],
          start_timestamp: challengeStartRef.current,
          end_timestamp: performance.now(),
          screen_width: window.innerWidth,
          screen_height: window.innerHeight,
          virtual_camera_check: virtualCameraRef.current,
        };

        setProgress(1);
        setPhase('completed');
        onComplete(blob, metadata);
      },
      'image/jpeg',
      0.92,
    );
  }, [canvasElement, videoElement, onComplete]);

  // ── Retry ──
  const retry = useCallback(() => {
    framesRef.current = [];
    turnCountRef.current = 0;
    challengeStartRef.current = 0;
    returnStartRef.current = 0;
    setDirection(pickRandomDirection());
    setError(null);
    setProgress(0);
    setPhase('ready');
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (turnDelayRef.current) clearTimeout(turnDelayRef.current);
    };
  }, []);

  return {
    phase,
    direction,
    instruction: getInstructionForPhase(phase, direction),
    progress,
    faceDetected: true,  // No client-side detection — always true when camera is active
    currentYaw: 0,       // No client-side yaw estimation
    error,
    retry,
  };
}
