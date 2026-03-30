import React, { useState, useEffect, useRef, useCallback } from 'react';
import { computeLaplacianVariance } from '../utils/camera/computeLaplacianVariance';
import { idCameraCss } from '../utils/camera/cameraAnimations';
import { useCameraStream } from '../utils/camera/useCameraStream';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IDCameraCaptureProps {
  variant: 'front' | 'back';
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void;           // Called when getUserMedia unavailable
}

type CameraState = 'starting' | 'streaming' | 'captured';
type FocusLevel = 'blurry' | 'medium' | 'sharp';

// ─── Constants ────────────────────────────────────────────────────────────────
const FOCUS_THRESHOLDS = { blurry: 50, medium: 120 } as const;
const ROLLING_WINDOW = 5;
const AUTO_CAPTURE_HOLD_MS = 1500;   // Must stay sharp for 1.5s before auto-capture
const WARMUP_DELAY_MS = 3000;        // Ignore auto-capture for first 3s so user can position ID
const ANALYSIS_INTERVAL_MS = 200;
const ID_ASPECT_RATIO = 1.586; // Standard credit card / driver's license

const FOCUS_COLORS: Record<FocusLevel, string> = {
  blurry: '#ef4444',
  medium: '#f59e0b',
  sharp:  '#00d4b4',
};

const GUIDANCE_TEXT: Record<FocusLevel, string> = {
  blurry: 'Move closer to your ID',
  medium: 'Hold steady\u2026',
  sharp:  'Perfect! Capturing\u2026',
};

// ─── Component ────────────────────────────────────────────────────────────────
const IDCameraCapture: React.FC<IDCameraCaptureProps> = ({
  variant, onCapture, onClose, onFallback,
}) => {
  const [state, setState] = useState<CameraState>('starting');
  const [focusLevel, setFocusLevel] = useState<FocusLevel>('blurry');
  const [showFlash, setShowFlash] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warmingUp, setWarmingUp] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const { streamRef, animFrameRef, stopStream } = useCameraStream();
  const rollingRef = useRef<number[]>([]);
  const sharpSinceRef = useRef<number | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const lastAnalysisRef = useRef<number>(0);
  const streamStartRef = useRef<number>(0);    // Tracks when streaming began (for warm-up)
  const mountedRef = useRef(true);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStream();
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, []);

  // ── Start camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onFallback();
      return;
    }

    let cancelled = false;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }).then(stream => {
      if (cancelled || !mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.play().then(() => {
        if (mountedRef.current) setState('streaming');
      }).catch(() => {
        // iOS sometimes rejects .play() — retry with user gesture
        if (mountedRef.current) setState('streaming');
      });
    }).catch(err => {
      if (cancelled || !mountedRef.current) return;
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
        onFallback();
      } else {
        setError('Unable to access camera. Please check permissions.');
      }
    });

    return () => { cancelled = true; };
  }, [onFallback]);

  // ── Warm-up timer (gives user time to position ID) ────────────────────────
  useEffect(() => {
    if (state !== 'streaming') return;
    setWarmingUp(true);
    const timer = setTimeout(() => { if (mountedRef.current) setWarmingUp(false); }, WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // ── Focus analysis loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'streaming') return;

    // Record when streaming started (for warm-up delay)
    if (!streamStartRef.current) streamStartRef.current = performance.now();

    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Small analysis canvas for performance
    const AW = 320;
    const AH = 200;
    canvas.width = AW;
    canvas.height = AH;

    const loop = () => {
      if (!mountedRef.current || state !== 'streaming') return;

      const now = performance.now();
      if (now - lastAnalysisRef.current >= ANALYSIS_INTERVAL_MS) {
        lastAnalysisRef.current = now;

        // Draw video frame scaled down
        ctx.drawImage(video, 0, 0, AW, AH);

        // Analyze the center (ID overlay region) — ~70% of the analysis canvas
        const regionX = Math.floor(AW * 0.15);
        const regionY = Math.floor(AH * 0.15);
        const regionW = Math.floor(AW * 0.7);
        const regionH = Math.floor(AH * 0.7);

        const variance = computeLaplacianVariance(ctx, regionX, regionY, regionW, regionH);

        // Update rolling average
        const rolling = rollingRef.current;
        rolling.push(variance);
        if (rolling.length > ROLLING_WINDOW) rolling.shift();
        const avg = rolling.reduce((a, b) => a + b, 0) / rolling.length;

        // Determine focus level
        let level: FocusLevel = 'blurry';
        if (avg > FOCUS_THRESHOLDS.medium) level = 'sharp';
        else if (avg > FOCUS_THRESHOLDS.blurry) level = 'medium';

        setFocusLevel(level);

        // Auto-capture logic (disabled during warm-up so user can position ID)
        const warmedUp = now - streamStartRef.current >= WARMUP_DELAY_MS;
        if (warmedUp && level === 'sharp') {
          if (!sharpSinceRef.current) {
            sharpSinceRef.current = now;
          } else if (now - sharpSinceRef.current >= AUTO_CAPTURE_HOLD_MS) {
            doCapture();
            return; // stop loop
          }
        } else if (!warmedUp || level !== 'sharp') {
          sharpSinceRef.current = null;
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state]);

  // ── Capture logic ────────────────────────────────────────────────────────
  const doCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || state === 'captured') return;

    // Full resolution
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw full frame
    ctx.drawImage(video, 0, 0, vw, vh);

    // Crop to the ID overlay region (center 85% width, matching aspect ratio)
    const cropW = Math.floor(vw * 0.85);
    const cropH = Math.floor(cropW / ID_ASPECT_RATIO);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);

    // Create a crop canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Auto-contrast: normalize pixel histogram
    applyAutoContrast(cropCtx, cropW, cropH);

    // Shutter flash effect
    setShowFlash(true);
    setTimeout(() => { if (mountedRef.current) setShowFlash(false); }, 300);

    // Stop the stream and analysis
    stopStream();

    // Convert to JPEG blob
    cropCanvas.toBlob(blob => {
      if (!blob || !mountedRef.current) return;
      capturedBlobRef.current = blob;
      setCapturedUrl(URL.createObjectURL(blob));
      setState('captured');
    }, 'image/jpeg', 0.92);
  }, [state, stopStream]);

  // ── Auto-contrast preprocessing ──────────────────────────────────────────
  function applyAutoContrast(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Find min/max across all channels
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }

    // Only apply if there's meaningful range to stretch
    const range = max - min;
    if (range < 30) return; // already well-contrasted or flat

    const scale = 255 / range;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.min(255, Math.max(0, (data[i] - min) * scale));     // R
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - min) * scale)); // G
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - min) * scale)); // B
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Use / Retake ─────────────────────────────────────────────────────────
  const handleUse = useCallback(() => {
    const blob = capturedBlobRef.current;
    if (!blob) return;
    const file = new File([blob], `id-${variant}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
  }, [variant, onCapture]);

  const handleRetake = useCallback(() => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    capturedBlobRef.current = null;
    rollingRef.current = [];
    sharpSinceRef.current = null;
    streamStartRef.current = 0;
    setFocusLevel('blurry');
    setWarmingUp(true);
    setState('starting');

    // Re-start camera
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }).then(stream => {
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.play().then(() => { if (mountedRef.current) setState('streaming'); });
    }).catch(() => {
      if (mountedRef.current) setError('Could not restart camera.');
    });
  }, [capturedUrl]);

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={overlayStyle}>
        <style>{idCameraCss}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 32, textAlign: 'center', gap: 16 }}>
          <div style={{ fontSize: 48, opacity: 0.5 }}>!</div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#e8f4f8', lineHeight: 1.5 }}>{error}</p>
          <button onClick={onClose} style={outlineBtnStyle}>Go Back</button>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const focusColor = warmingUp ? '#f59e0b' : FOCUS_COLORS[focusLevel];
  const positionText = variant === 'back' ? 'Position the barcode side' : 'Position the front of your ID';
  const guidanceText = state === 'captured'
    ? 'Photo captured!'
    : warmingUp
      ? positionText
      : (focusLevel === 'blurry' ? positionText : GUIDANCE_TEXT[focusLevel]);

  return (
    <div style={overlayStyle}>
      <style>{idCameraCss}</style>

      {/* Hidden canvases for analysis and capture */}
      <canvas ref={analysisCanvasRef} style={{ display: 'none' }} />
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />

      {/* Live video stream */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          display: state === 'captured' ? 'none' : 'block',
        }}
      />

      {/* Captured preview image */}
      {state === 'captured' && capturedUrl && (
        <img
          src={capturedUrl}
          alt="Captured ID"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            background: '#000',
          }}
        />
      )}

      {/* Dark mask with ID cutout */}
      {state === 'streaming' && <OverlayMask focusColor={focusColor} />}

      {/* Shutter flash */}
      {showFlash && (
        <div style={{
          position: 'absolute', inset: 0,
          background: '#fff',
          animation: 'shutterFlash 0.3s ease-out forwards',
          pointerEvents: 'none', zIndex: 20,
        }} />
      )}

      {/* Top bar: close button + header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '16px 20px', zIndex: 15,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={onClose} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', border: 'none',
          color: '#e8f4f8', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          &#x2715;
        </button>

        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          textTransform: 'uppercase', letterSpacing: '0.12em',
          color: '#00d4b4', background: 'rgba(0,0,0,0.4)',
          padding: '6px 12px', borderRadius: 20,
          backdropFilter: 'blur(4px)',
        }}>
          {variant === 'front' ? 'Front of ID' : 'Back of ID'}
        </span>

        <div style={{ width: 40 }} /> {/* Spacer for centering */}
      </div>

      {/* Bottom controls area */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 24px 36px', zIndex: 15,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
      }}>
        {/* Guidance text */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          color: state === 'streaming' ? focusColor : '#e8f4f8',
          textAlign: 'center', transition: 'color 0.3s ease',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          animation: state === 'streaming' ? 'focusPulse 2s ease infinite' : 'none',
        }}>
          {state === 'starting' ? 'Starting camera\u2026' : guidanceText}
        </div>

        {/* Focus quality bar (when streaming) */}
        {state === 'streaming' && (
          <div style={{
            width: '60%', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.15)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: focusColor,
              width: focusLevel === 'blurry' ? '20%' : focusLevel === 'medium' ? '60%' : '100%',
              transition: 'all 0.3s ease',
              boxShadow: `0 0 8px ${focusColor}`,
            }} />
          </div>
        )}

        {/* Streaming: manual capture button */}
        {state === 'streaming' && (
          <button
            onClick={doCapture}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'transparent',
              border: `4px solid ${focusColor}`,
              cursor: 'pointer', position: 'relative',
              transition: 'border-color 0.3s ease',
              boxShadow: `0 0 20px ${focusColor}40`,
            }}
          >
            <div style={{
              position: 'absolute', inset: 6, borderRadius: '50%',
              background: focusColor === '#00d4b4' ? 'rgba(0,212,180,0.3)' : 'rgba(255,255,255,0.15)',
              transition: 'background 0.3s ease',
            }} />
          </button>
        )}

        {/* Captured: Use / Retake buttons */}
        {state === 'captured' && (
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button onClick={handleRetake} style={outlineBtnStyle}>
              Retake
            </button>
            <button onClick={handleUse} style={tealBtnStyle}>
              Use Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Overlay Mask with ID card cutout ─────────────────────────────────────────
const OverlayMask: React.FC<{ focusColor: string }> = ({ focusColor }) => {
  // We use an SVG mask to create the transparent cutout
  // The ID card is centered, 85% viewport width, aspect 1.586:1
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="id-cutout-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x="7.5%" y="50%" width="85%" height="0"
              rx="12" ry="12" fill="black"
              style={{
                // Aspect ratio hack: height is set via JS below
                // We'll use a foreignObject approach instead
              }}
            />
          </mask>
        </defs>
      </svg>
      {/* Instead of SVG mask, use 4 dark panels around the cutout */}
      <CutoutOverlay focusColor={focusColor} />
    </div>
  );
};

// The cutout overlay using CSS box layout — simpler and more reliable than SVG
const CutoutOverlay: React.FC<{ focusColor: string }> = ({ focusColor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const vw = containerRef.current.clientWidth;
      const vh = containerRef.current.clientHeight;
      const cardW = vw * 0.85;
      const cardH = cardW / ID_ASPECT_RATIO;
      setDims({
        left: (vw - cardW) / 2,
        top: (vh - cardH) / 2,
        width: cardW,
        height: cardH,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const mask = 'rgba(0,0,0,0.65)';
  const cornerLen = 28;
  const cornerW = 3;

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {/* Top panel */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: dims.top, background: mask }} />
      {/* Bottom panel */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `calc(100% - ${dims.top + dims.height}px)`, background: mask }} />
      {/* Left panel */}
      <div style={{ position: 'absolute', top: dims.top, left: 0, width: dims.left, height: dims.height, background: mask }} />
      {/* Right panel */}
      <div style={{ position: 'absolute', top: dims.top, right: 0, width: dims.left, height: dims.height, background: mask }} />

      {/* Focus ring border around cutout */}
      <div style={{
        position: 'absolute',
        top: dims.top - 2,
        left: dims.left - 2,
        width: dims.width + 4,
        height: dims.height + 4,
        border: `2px solid ${focusColor}`,
        borderRadius: 14,
        transition: 'border-color 0.3s ease',
        boxShadow: `0 0 12px ${focusColor}40, inset 0 0 12px ${focusColor}10`,
        pointerEvents: 'none',
      }} />

      {/* Teal corner markers (matching existing IDViewfinder style) */}
      {[
        { top: dims.top, left: dims.left, bT: cornerW, bL: cornerW, blr: '6px 0 0 0' },
        { top: dims.top, left: dims.left + dims.width - cornerLen, bT: cornerW, bR: cornerW, blr: '0 6px 0 0' },
        { top: dims.top + dims.height - cornerLen, left: dims.left, bB: cornerW, bL: cornerW, blr: '0 0 0 6px' },
        { top: dims.top + dims.height - cornerLen, left: dims.left + dims.width - cornerLen, bB: cornerW, bR: cornerW, blr: '0 0 6px 0' },
      ].map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: c.top, left: c.left,
          width: cornerLen, height: cornerLen,
          borderTop: c.bT ? `${c.bT}px solid #00d4b4` : 'none',
          borderBottom: c.bB ? `${c.bB}px solid #00d4b4` : 'none',
          borderLeft: c.bL ? `${c.bL}px solid #00d4b4` : 'none',
          borderRight: c.bR ? `${c.bR}px solid #00d4b4` : 'none',
          borderRadius: c.blr,
          pointerEvents: 'none',
        }} />
      ))}
    </div>
  );
};

// ─── Shared Styles ────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: '#000',
  display: 'flex', flexDirection: 'column',
  animation: 'camFadeIn 0.25s ease',
};

const tealBtnStyle: React.CSSProperties = {
  flex: 1, padding: '16px 20px', borderRadius: 14, border: 'none',
  background: '#00d4b4', color: '#040d1a',
  fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase',
  cursor: 'pointer',
};

const outlineBtnStyle: React.CSSProperties = {
  flex: 1, padding: '16px 20px', borderRadius: 14,
  border: '1.5px solid rgba(0,212,180,0.4)', background: 'rgba(0,0,0,0.5)',
  color: '#e8f4f8',
  fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase',
  cursor: 'pointer', backdropFilter: 'blur(4px)',
};

export default IDCameraCapture;
