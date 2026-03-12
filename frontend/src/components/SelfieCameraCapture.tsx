import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SelfieCameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void;
}

type CameraState = 'starting' | 'streaming' | 'captured';
type FaceStatus = 'no_face' | 'adjusting' | 'ready';

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_CAPTURE_HOLD_MS = 1500;
const WARMUP_DELAY_MS = 3000;
const ANALYSIS_INTERVAL_MS = 200;
const SKIN_THRESHOLD_LOW = 0.15;
const SKIN_THRESHOLD_HIGH = 0.25;
const SHARPNESS_THRESHOLD = 40;

const STATUS_COLORS: Record<FaceStatus, string> = {
  no_face:   '#ef4444',
  adjusting: '#f59e0b',
  ready:     '#00d4b4',
};

const GUIDANCE: Record<FaceStatus, string> = {
  no_face:   'Position your face in the oval',
  adjusting: 'Center your face\u2026 hold steady',
  ready:     'Perfect! Capturing\u2026',
};

// ─── CSS (injected once) ──────────────────────────────────────────────────────
const cameraCss = `
@keyframes selfiePulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
@keyframes shutterFlash { 0%{opacity:0} 10%{opacity:0.8} 100%{opacity:0} }
@keyframes camFadeIn { from{opacity:0} to{opacity:1} }
`;

// ─── Laplacian focus analysis (copied from IDCameraCapture — self-contained) ─
function computeLaplacianVariance(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
): number {
  const imageData = ctx.getImageData(x, y, w, h);
  const pixels = imageData.data;
  const width = w;
  const height = h;

  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const idx = row * width + col;
      const lap =
        gray[idx - width] +
        gray[idx - 1] +
        -4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

// ─── Skin-tone detection ──────────────────────────────────────────────────────
function analyzeFaceInOval(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
): { skinRatio: number; centered: boolean } {
  // Oval region: center ~60% of canvas, matching selfie oval proportions
  const ovalW = Math.floor(canvasW * 0.5);
  const ovalH = Math.floor(canvasH * 0.65);
  const ovalCx = canvasW / 2;
  const ovalCy = canvasH / 2;
  const ovalRx = ovalW / 2;
  const ovalRy = ovalH / 2;

  const x0 = Math.floor(ovalCx - ovalRx);
  const y0 = Math.floor(ovalCy - ovalRy);
  const imageData = ctx.getImageData(x0, y0, ovalW, ovalH);
  const pixels = imageData.data;

  let totalInOval = 0;
  let skinPixels = 0;

  // For centering: divide into 3×3 grid, count skin in each cell
  const gridSkin = Array(9).fill(0);
  const gridTotal = Array(9).fill(0);

  for (let row = 0; row < ovalH; row++) {
    for (let col = 0; col < ovalW; col++) {
      // Check if pixel is inside the oval
      const nx = (col - ovalRx) / ovalRx;
      const ny = (row - ovalRy) / ovalRy;
      if (nx * nx + ny * ny > 1) continue;

      totalInOval++;

      const idx = (row * ovalW + col) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Skin-tone heuristic (works across a wide range of skin tones)
      const isSkin =
        r > 80 && g > 30 && b > 15 &&
        r > g && r > b &&
        (r - g) > 15 &&
        (Math.max(r, g, b) - Math.min(r, g, b)) > 15;

      // Grid cell (3×3)
      const gridCol = Math.min(2, Math.floor((col / ovalW) * 3));
      const gridRow = Math.min(2, Math.floor((row / ovalH) * 3));
      const cellIdx = gridRow * 3 + gridCol;
      gridTotal[cellIdx]++;

      if (isSkin) {
        skinPixels++;
        gridSkin[cellIdx]++;
      }
    }
  }

  const skinRatio = totalInOval > 0 ? skinPixels / totalInOval : 0;

  // Centering: center cell (index 4) should have highest density
  const centerDensity = gridTotal[4] > 0 ? gridSkin[4] / gridTotal[4] : 0;
  let maxNonCenterDensity = 0;
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue;
    const d = gridTotal[i] > 0 ? gridSkin[i] / gridTotal[i] : 0;
    if (d > maxNonCenterDensity) maxNonCenterDensity = d;
  }

  // Face is centered if center cell has meaningful skin and is at least as dense
  // as any non-center cell (with a small tolerance)
  const centered = centerDensity > 0.15 && centerDensity >= maxNonCenterDensity * 0.7;

  return { skinRatio, centered };
}

// ─── Component ────────────────────────────────────────────────────────────────
const SelfieCameraCapture: React.FC<SelfieCameraCaptureProps> = ({
  onCapture, onClose, onFallback,
}) => {
  const [state, setState] = useState<CameraState>('starting');
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_face');
  const [showFlash, setShowFlash] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warmingUp, setWarmingUp] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const readySinceRef = useRef<number | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const lastAnalysisRef = useRef<number>(0);
  const streamStartRef = useRef<number>(0);
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

  const stopStream = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── Start camera (front-facing) ─────────────────────────────────────────
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onFallback();
      return;
    }

    let cancelled = false;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
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
        if (mountedRef.current) setState('streaming');
      });
    }).catch(err => {
      if (cancelled || !mountedRef.current) return;
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
        onFallback();
      } else {
        setError('Unable to access front camera. Please check permissions.');
      }
    });

    return () => { cancelled = true; };
  }, [onFallback]);

  // ── Warm-up timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'streaming') return;
    setWarmingUp(true);
    const timer = setTimeout(() => { if (mountedRef.current) setWarmingUp(false); }, WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // ── Face detection + focus analysis loop ────────────────────────────────
  useEffect(() => {
    if (state !== 'streaming') return;

    if (!streamStartRef.current) streamStartRef.current = performance.now();

    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const AW = 320;
    const AH = 240;
    canvas.width = AW;
    canvas.height = AH;

    const loop = () => {
      if (!mountedRef.current || state !== 'streaming') return;

      const now = performance.now();
      if (now - lastAnalysisRef.current >= ANALYSIS_INTERVAL_MS) {
        lastAnalysisRef.current = now;

        // Draw video frame scaled down (mirrored for analysis doesn't matter)
        ctx.drawImage(video, 0, 0, AW, AH);

        // Skin-tone + centering analysis
        const { skinRatio, centered } = analyzeFaceInOval(ctx, AW, AH);

        // Sharpness check in the center oval region
        const regionX = Math.floor(AW * 0.25);
        const regionY = Math.floor(AH * 0.18);
        const regionW = Math.floor(AW * 0.5);
        const regionH = Math.floor(AH * 0.65);
        const variance = computeLaplacianVariance(ctx, regionX, regionY, regionW, regionH);

        // Determine face status
        let status: FaceStatus = 'no_face';
        if (skinRatio >= SKIN_THRESHOLD_HIGH && centered && variance >= SHARPNESS_THRESHOLD) {
          status = 'ready';
        } else if (skinRatio >= SKIN_THRESHOLD_LOW) {
          status = 'adjusting';
        }

        setFaceStatus(status);

        // Auto-capture logic
        const warmedUp = now - streamStartRef.current >= WARMUP_DELAY_MS;
        if (warmedUp && status === 'ready') {
          if (!readySinceRef.current) {
            readySinceRef.current = now;
          } else if (now - readySinceRef.current >= AUTO_CAPTURE_HOLD_MS) {
            doCapture();
            return;
          }
        } else {
          readySinceRef.current = null;
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state]);

  // ── Capture logic ──────────────────────────────────────────────────────────
  const doCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || state === 'captured') return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw un-mirrored: flip horizontally since the video is front-facing
    // This ensures the captured image matches reality (text readable, etc.)
    ctx.save();
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    // Crop to a rectangle enclosing the oval (roughly 70% width, 80% height, centered)
    const cropW = Math.floor(vw * 0.7);
    const cropH = Math.floor(vh * 0.85);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Shutter flash
    setShowFlash(true);
    setTimeout(() => { if (mountedRef.current) setShowFlash(false); }, 300);

    stopStream();

    cropCanvas.toBlob(blob => {
      if (!blob || !mountedRef.current) return;
      capturedBlobRef.current = blob;
      setCapturedUrl(URL.createObjectURL(blob));
      setState('captured');
    }, 'image/jpeg', 0.92);
  }, [state, stopStream]);

  // ── Use / Retake ────────────────────────────────────────────────────────
  const handleUse = useCallback(() => {
    const blob = capturedBlobRef.current;
    if (!blob) return;
    const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
  }, [onCapture]);

  const handleRetake = useCallback(() => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    capturedBlobRef.current = null;
    readySinceRef.current = null;
    streamStartRef.current = 0;
    setFaceStatus('no_face');
    setWarmingUp(true);
    setState('starting');

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
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
        <style>{cameraCss}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 32, textAlign: 'center', gap: 16 }}>
          <div style={{ fontSize: 48, opacity: 0.5 }}>!</div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#e8f4f8', lineHeight: 1.5 }}>{error}</p>
          <button onClick={onClose} style={outlineBtnStyle}>Go Back</button>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const statusColor = warmingUp ? '#f59e0b' : STATUS_COLORS[faceStatus];
  const guidanceText = state === 'captured'
    ? 'Photo captured!'
    : warmingUp
      ? 'Position your face in the oval'
      : GUIDANCE[faceStatus];

  return (
    <div style={overlayStyle}>
      <style>{cameraCss}</style>

      {/* Hidden canvases */}
      <canvas ref={analysisCanvasRef} style={{ display: 'none' }} />
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />

      {/* Live video stream (mirrored for natural selfie feel) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)',
          display: state === 'captured' ? 'none' : 'block',
        }}
      />

      {/* Captured preview (un-mirrored) */}
      {state === 'captured' && capturedUrl && (
        <img
          src={capturedUrl}
          alt="Captured selfie"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            background: '#000',
          }}
        />
      )}

      {/* Oval overlay mask */}
      {state === 'streaming' && <OvalOverlayMask statusColor={statusColor} />}

      {/* Shutter flash */}
      {showFlash && (
        <div style={{
          position: 'absolute', inset: 0,
          background: '#fff',
          animation: 'shutterFlash 0.3s ease-out forwards',
          pointerEvents: 'none', zIndex: 20,
        }} />
      )}

      {/* Top bar */}
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
          Selfie
        </span>

        <div style={{ width: 40 }} />
      </div>

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 24px 36px', zIndex: 15,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
      }}>
        {/* Guidance text */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          color: state === 'streaming' ? statusColor : '#e8f4f8',
          textAlign: 'center', transition: 'color 0.3s ease',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          animation: state === 'streaming' ? 'selfiePulse 2s ease infinite' : 'none',
        }}>
          {state === 'starting' ? 'Starting camera\u2026' : guidanceText}
        </div>

        {/* Face quality bar */}
        {state === 'streaming' && (
          <div style={{
            width: '60%', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.15)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: statusColor,
              width: faceStatus === 'no_face' ? '15%' : faceStatus === 'adjusting' ? '55%' : '100%',
              transition: 'all 0.3s ease',
              boxShadow: `0 0 8px ${statusColor}`,
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
              border: `4px solid ${statusColor}`,
              cursor: 'pointer', position: 'relative',
              transition: 'border-color 0.3s ease',
              boxShadow: `0 0 20px ${statusColor}40`,
            }}
          >
            <div style={{
              position: 'absolute', inset: 6, borderRadius: '50%',
              background: statusColor === '#00d4b4' ? 'rgba(0,212,180,0.3)' : 'rgba(255,255,255,0.15)',
              transition: 'background 0.3s ease',
            }} />
          </button>
        )}

        {/* Captured: Use / Retake */}
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

// ─── Oval Overlay Mask ────────────────────────────────────────────────────────
// Uses an SVG mask for the oval cutout — simpler than 4-panel approach for ovals
const OvalOverlayMask: React.FC<{ statusColor: string }> = ({ statusColor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ cx: 0, cy: 0, rx: 0, ry: 0, vw: 0, vh: 0 });

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const vw = containerRef.current.clientWidth;
      const vh = containerRef.current.clientHeight;
      // Oval: ~70% viewport width, taller than wide (face proportions)
      const rx = vw * 0.35;
      const ry = rx * 1.25; // Oval is 25% taller than wide
      setDims({ cx: vw / 2, cy: vh * 0.42, rx, ry, vw, vh });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      {/* SVG mask with oval cutout */}
      <svg width={dims.vw} height={dims.vh} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="selfie-oval-mask">
            <rect width="100%" height="100%" fill="white" />
            <ellipse cx={dims.cx} cy={dims.cy} rx={dims.rx} ry={dims.ry} fill="black" />
          </mask>
        </defs>
        {/* Dark overlay with oval cutout */}
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#selfie-oval-mask)" />
        {/* Oval border ring */}
        <ellipse
          cx={dims.cx} cy={dims.cy} rx={dims.rx} ry={dims.ry}
          fill="none"
          stroke={statusColor}
          strokeWidth={2.5}
          style={{ transition: 'stroke 0.3s ease' }}
        />
      </svg>

      {/* Ghost silhouette inside oval (when no face detected) */}
      <div style={{
        position: 'absolute',
        left: dims.cx - 45,
        top: dims.cy + dims.ry * 0.15,
        width: 90, height: 120,
        opacity: 0.07,
        background: 'linear-gradient(to bottom, transparent, #e8f4f8)',
        clipPath: 'polygon(35% 0%,65% 0%,80% 28%,82% 58%,92% 70%,100% 100%,0% 100%,8% 70%,18% 58%,20% 28%)',
        pointerEvents: 'none',
      }} />

      {/* Teal corner markers on the oval (4 cardinal points) */}
      {[
        { x: dims.cx, y: dims.cy - dims.ry, rot: 0 },     // top
        { x: dims.cx, y: dims.cy + dims.ry, rot: 180 },   // bottom
        { x: dims.cx - dims.rx, y: dims.cy, rot: 270 },   // left
        { x: dims.cx + dims.rx, y: dims.cy, rot: 90 },    // right
      ].map((pt, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: pt.x - 10,
          top: pt.y - 1.5,
          width: 20, height: 3,
          background: '#00d4b4',
          borderRadius: 2,
          transform: `rotate(${pt.rot}deg)`,
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

export default SelfieCameraCapture;
