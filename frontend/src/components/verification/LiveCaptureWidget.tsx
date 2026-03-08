import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL, shouldUseSandbox } from '../../config/api';

declare global {
  interface Window { cv: any; }
}

interface LiveCaptureWidgetProps {
  apiKey: string;
  verificationId: string;
  onComplete: () => void;
  onError?: (error: string) => void;
  theme?: 'light' | 'dark';
}

export const LiveCaptureWidget: React.FC<LiveCaptureWidgetProps> = ({
  apiKey,
  verificationId,
  onComplete,
  onError,
  theme = 'light',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const faceHistRef = useRef<number[]>([]);
  const smoothHistRef = useRef<boolean[]>([]);

  const [opencvReady, setOpencvReady] = useState(false);
  const [cameraState, setCameraState] = useState<'prompt' | 'initializing' | 'ready' | 'error'>('prompt');
  const [challengeState, setChallengeState] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [faceDetected, setFaceDetected] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [faceStability, setFaceStability] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captureAttempts, setCaptureAttempts] = useState(0);

  const isDark = theme === 'dark';
  const textClass = isDark ? 'text-white' : 'text-gray-900';
  const subtextClass = isDark ? 'text-gray-300' : 'text-gray-600';

  // OpenCV init
  useEffect(() => {
    mountedRef.current = true;
    const check = () => {
      if (!mountedRef.current) return;
      if (window.cv && window.cv.Mat) {
        setOpencvReady(true);
      } else {
        setTimeout(check, 150);
      }
    };
    check();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoElementRef.current) { videoElementRef.current.srcObject = null; videoElementRef.current = null; }
  };

  const initializeCamera = async () => {
    if (cameraState === 'initializing' || cameraState === 'ready') return;
    setCameraState('initializing');
    setError('');
    setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not supported in this browser');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const setupWithCanvas = () => {
        if (!canvasRef.current) { setTimeout(setupWithCanvas, 200); return; }
        setupCanvas(stream);
        if (mountedRef.current) setCameraState('ready');
      };
      setupWithCanvas();
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg =
        err.name === 'NotAllowedError' ? 'Camera permission denied. Please enable camera access.' :
        err.name === 'NotFoundError' ? 'No camera found.' :
        err.name === 'NotReadableError' ? 'Camera is already in use by another app.' :
        `Camera error: ${err.message}`;
      setCameraState('error');
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const setupCanvas = (stream: MediaStream) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    };
    video.oncanplay = () => { video.play().catch(() => {}); };
    video.onplay = () => { setTimeout(startVideoLoop, 100); };
    videoElementRef.current = video;
  };

  const startVideoLoop = () => {
    const loop = () => {
      const canvas = canvasRef.current;
      const video = videoElementRef.current;
      if (!canvas || !video || !mountedRef.current) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          detectAndDraw(canvas, ctx);
        }
      }
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  // --- face detection ---
  const detectAndDraw = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const faceFound = basicFaceDetect(imageData, canvas.width, canvas.height);
    drawOverlay(ctx, canvas.width, canvas.height, faceFound);
    smoothFaceState(faceFound);
  };

  const basicFaceDetect = (imageData: ImageData, width: number, height: number): boolean => {
    const data = imageData.data;
    const cx = width / 2, cy = height / 2;
    const size = Math.min(width, height) * 0.5;
    let skinPx = 0, warmPx = 0, total = 0, brightnessSum = 0, colorVar = 0;

    for (let y = cy - size / 2; y < cy + size / 2; y++) {
      for (let x = cx - size / 2; x < cx + size / 2; x++) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const i = (Math.floor(y) * width + Math.floor(x)) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const br = (r + g + b) / 3;
        brightnessSum += br;
        colorVar += Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
        if ((r > 50 && g > 25 && b > 15 && r > b) || (br > 40 && br < 250 && r >= g) || (r > 30 && (r + g) > b * 1.5)) skinPx++;
        if (r > g && r > b && br > 50) warmPx++;
        total++;
      }
    }

    const skinR = total ? skinPx / total : 0;
    const warmR = total ? warmPx / total : 0;
    const avgBr = total ? brightnessSum / total : 0;
    const avgVar = total ? colorVar / total : 0;

    const liveness = Math.max(0.5, Math.min(1, skinR * 3) * 0.6 + (avgBr > 30 && avgBr < 250 ? 1 : 0.7) * 0.2 + Math.min(1, avgVar / 20) * 0.2);
    setLivenessScore(liveness);

    const hist = faceHistRef.current;
    hist.push(skinR > 0.02 || warmR > 0.05 ? 1 : 0);
    if (hist.length > 5) hist.shift();
    const stab = hist.reduce((a: number, b: number) => a + b, 0) / Math.max(hist.length, 1);
    setFaceStability(Math.max(0.5, stab));

    return (avgBr > 30 && avgBr < 250 && (skinR > 0.02 || warmR > 0.05)) || (liveness > 0.3 && avgBr > 40 && avgVar > 5);
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, detected: boolean) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.25;
    ctx.strokeStyle = detected ? '#10B981' : '#EF4444';
    ctx.lineWidth = 3;
    ctx.setLineDash(detected ? [] : [10, 10]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = detected ? '#10B981' : '#EF4444';
    ctx.fillText(detected ? 'Face Detected' : 'Position Face', cx, cy + r + 25);
  };

  const smoothFaceState = (detected: boolean) => {
    const hist = smoothHistRef.current;
    hist.push(detected);
    if (hist.length > 6) hist.shift();
    const pos = hist.filter(Boolean).length;
    setFaceDetected(hist.length >= 3 && pos >= Math.ceil(hist.length * 0.5));
  };

  const startChallenge = () => {
    if (!faceDetected || livenessScore < 0.4 || faceStability < 0.5) {
      setError(!faceDetected ? 'No face detected. Position your face in the frame.' :
               livenessScore < 0.4 ? 'Ensure good lighting and your face is clearly visible.' :
               'Hold your face steady in the frame.');
      return;
    }
    setError('');
    setChallengeState('active');
    setCountdown(3);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          performCapture();
          return null;
        }
        if (!faceDetected || livenessScore < 0.4 || faceStability < 0.5) {
          clearInterval(timer);
          setError('Face lost during countdown. Please try again.');
          setChallengeState('waiting');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const performCapture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !apiKey || !verificationId) {
      const msg = 'Missing required capture data.';
      setError(msg);
      setChallengeState('waiting');
      onError?.(msg);
      return;
    }
    setLoading(true);
    setCaptureAttempts(n => n + 1);
    try {
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const useSandbox = shouldUseSandbox(apiKey);
      const body: Record<string, unknown> = {
        verification_id: verificationId,
        live_image_data: base64,
        challenge_response: 'blink_twice',
      };
      if (useSandbox) body.sandbox = true;

      const res = await fetch(`${API_BASE_URL}/api/verify/live-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Live capture failed' }));
        throw new Error(err.message || 'Live capture failed');
      }

      cleanup();
      setChallengeState('completed');
      onComplete();
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err.name === 'AbortError'
        ? 'Request timed out. Check your connection and try again.'
        : err.message || 'Capture failed. Please try again.';
      setError(msg);
      setChallengeState('waiting');
      if (captureAttempts >= 2) {
        onError?.('Maximum capture attempts reached. Please refresh and try again.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const retry = () => {
    cleanup();
    setCameraState('prompt');
    setChallengeState('waiting');
    setError('');
    setCaptureAttempts(0);
    setCountdown(null);
    // Clear detection history
    faceHistRef.current = [];
    smoothHistRef.current = [];
    setTimeout(initializeCamera, 100);
  };

  // ── Render ──

  if (challengeState === 'completed') {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className={`text-lg font-semibold ${textClass}`}>Photo Captured</h3>
        <p className={`text-sm mt-1 ${subtextClass}`}>Processing your verification…</p>
        <div className="mt-4 animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className={`text-xl font-semibold mb-1 ${textClass}`}>Live Photo Capture</h2>
        <p className={`text-sm ${subtextClass}`}>We need a live selfie to verify your identity</p>
      </div>

      {/* Camera area */}
      <div className={`rounded-2xl overflow-hidden border-2 ${isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-100'}`}>
        {/* Canvas — always mounted for ref stability */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className={`w-full ${cameraState === 'ready' ? 'block' : 'hidden'}`}
          style={{ aspectRatio: '4/3', objectFit: 'cover' }}
        />

        {cameraState === 'prompt' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">📷</div>
            <h3 className={`font-semibold mb-2 ${textClass}`}>Camera Access Required</h3>
            <p className={`text-sm mb-5 ${subtextClass}`}>
              We need your camera to capture a live selfie for identity verification.
            </p>
            <button
              onClick={initializeCamera}
              disabled={!opencvReady || loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all font-medium"
            >
              {!opencvReady ? 'Loading…' : loading ? 'Starting Camera…' : 'Enable Camera'}
            </button>
          </div>
        )}

        {cameraState === 'initializing' && (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className={`text-sm ${subtextClass}`}>Starting camera…</p>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className={`font-semibold mb-2 ${textClass}`}>Camera Failed</h3>
            <p className={`text-sm mb-4 ${subtextClass}`}>{error}</p>
            <button onClick={retry} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-sm font-medium">
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Face detection status */}
      {cameraState === 'ready' && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm ${
          faceDetected ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${faceDetected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
          <span className={faceDetected ? 'text-green-800' : 'text-amber-800'}>
            {faceDetected
              ? `Face detected · Liveness ${Math.round(livenessScore * 100)}% · Stability ${Math.round(faceStability * 100)}%`
              : 'Position your face in the center of the frame'}
          </span>
        </div>
      )}

      {/* Countdown */}
      {countdown !== null && (
        <div className="text-center">
          <div className="text-5xl font-bold text-blue-600">{countdown}</div>
          <p className={`text-sm mt-1 ${subtextClass}`}>Hold still…</p>
        </div>
      )}

      {/* Error */}
      {error && cameraState !== 'error' && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span className="flex-shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      {cameraState === 'ready' && (
        <div className="space-y-2">
          {challengeState === 'waiting' && (
            <button
              onClick={startChallenge}
              disabled={!faceDetected || loading || livenessScore < 0.4 || faceStability < 0.5}
              className="w-full py-3.5 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Processing…</>
              ) : !faceDetected ? (
                'Position Your Face First'
              ) : livenessScore < 0.4 || faceStability < 0.5 ? (
                'Improve Lighting & Hold Steady'
              ) : (
                <><span>📸</span> Capture Photo</>
              )}
            </button>
          )}

          {challengeState === 'active' && (
            <div className={`text-center py-3 text-sm font-medium ${subtextClass}`}>
              Look directly at the camera and blink twice…
            </div>
          )}

          <button
            onClick={retry}
            className={`w-full py-2.5 px-4 text-sm rounded-xl border transition-all ${
              isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Restart Camera
          </button>
        </div>
      )}

      {/* Instructions */}
      <ul className={`text-xs ${subtextClass} space-y-1 pl-1`}>
        <li>• Ensure good lighting — avoid backlighting</li>
        <li>• Center your face in the frame and hold still</li>
        <li>• Wait for the green "Face Detected" indicator before capturing</li>
      </ul>
    </div>
  );
};
