import { useRef, useEffect, useState, useCallback } from 'react';
import { useActiveLiveness, type LivenessMetadata } from '../../hooks/useActiveLiveness';

interface ActiveLivenessCaptureProps {
  onComplete: (blob: Blob, metadata: LivenessMetadata) => void;
  onCancel: () => void;
  onFallback: () => void;
  theme?: 'light' | 'dark';
}

export function ActiveLivenessCapture({
  onComplete,
  onCancel,
  onFallback,
}: ActiveLivenessCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [videoDims, setVideoDims] = useState({ w: 480, h: 640 }); // portrait default for mobile

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadedmetadata', () => {
            const w = videoRef.current?.videoWidth || 480;
            const h = videoRef.current?.videoHeight || 640;
            setVideoDims({ w, h });
          });
          await videoRef.current.play();
          setStreamReady(true);
        }
      } catch (err) {
        console.error('Camera access failed:', err);
        onFallback();
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback((blob: Blob, metadata: LivenessMetadata) => {
    // Stop the camera
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    onComplete(blob, metadata);
  }, [onComplete]);

  const {
    phase,
    direction,
    instruction,
    progress,
    error,
    retry,
    flashColor,
  } = useActiveLiveness({
    videoElement: streamReady ? videoRef.current : null,
    canvasElement: canvasRef.current,
    enabled: streamReady,
    onComplete: handleComplete,
    onFallback,
  });

  // ── Dot state computation ──
  // 6 progress dots: 4 color flashes + turn 1 + turn 2
  const TOTAL_DOTS = 6;

  const getActiveStep = (): number => {
    if (phase === 'ready') return -1;
    if (phase === 'completed') return TOTAL_DOTS;
    if (phase === 'failed') return Math.min(Math.floor(progress * 9), TOTAL_DOTS - 1);
    if (phase === 'color_flash') return Math.min(Math.floor(progress * 9), 3);
    if (phase === 'turn') return progress < 6 / 9 ? 4 : 5;
    if (phase === 'return_center' || phase === 'capturing') return progress < 6 / 9 ? 4 : 5;
    return Math.floor(progress * 9);
  };

  const activeStep = getActiveStep();

  const getDotState = (i: number): 'done' | 'active' | 'pending' => {
    if (i < activeStep) return 'done';
    if (i === activeStep) return 'active';
    return 'pending';
  };

  // ── Border state ──
  const borderState = phase === 'failed' ? 'fail'
    : phase === 'completed' ? 'success'
    : (phase === 'color_flash' || phase === 'turn' || phase === 'return_center') ? 'active'
    : 'idle';

  const showScanLine = phase !== 'completed' && phase !== 'failed';
  const challengeActive = phase === 'color_flash' || phase === 'turn' || phase === 'return_center';

  // ── Tip text ──
  const tipText = phase === 'ready' ? 'Good lighting \u00B7 Face uncovered \u00B7 No sunglasses'
    : phase === 'failed' ? 'Ensure good lighting and face is centred'
    : phase === 'completed' ? 'Verification complete'
    : 'Keep your face visible throughout';

  // ── Oval stroke color ──
  const ovalStroke = borderState === 'fail' ? '#ff3b5c'
    : borderState === 'success' ? '#00d4b4'
    : borderState === 'active' ? '#00ffdf'
    : '#00d4b4';

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 480,
      margin: '0 auto',
      background: '#040d1a',
      borderRadius: 16,
      overflow: 'hidden',
      fontFamily: "'Syne', sans-serif",
      color: '#e8f4f8',
    }}>
      <style>{LIVENESS_CSS}</style>

      {/* Video + Overlays */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${videoDims.w}/${videoDims.h}`,
        maxHeight: '70vh',
      }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            borderRadius: 16,
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Ambient glow — top-left */}
        <div className="lv-glow lv-glow-tl" />

        {/* Color flash overlay */}
        {flashColor && (
          <div
            className="lv-flash"
            style={{
              backgroundColor: `rgba(${flashColor[0]}, ${flashColor[1]}, ${flashColor[2]}, 0.65)`,
            }}
          />
        )}

        {/* Oval face guide with mask + animated border */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 2,
          }}
          viewBox={`0 0 ${videoDims.w} ${videoDims.h}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <mask id="face-oval-mask">
              <rect width={videoDims.w} height={videoDims.h} fill="white" />
              <ellipse
                cx={videoDims.w / 2}
                cy={videoDims.h * 0.42}
                rx={videoDims.w * 0.27}
                ry={videoDims.h * 0.265}
                fill="black"
              />
            </mask>
          </defs>
          {/* Darken area outside the oval */}
          <rect
            width={videoDims.w}
            height={videoDims.h}
            fill="rgba(4,13,26,0.55)"
            mask="url(#face-oval-mask)"
          />
          {/* Animated oval border */}
          <ellipse
            cx={videoDims.w / 2}
            cy={videoDims.h * 0.42}
            rx={videoDims.w * 0.27}
            ry={videoDims.h * 0.265}
            fill="none"
            stroke={ovalStroke}
            strokeWidth={2.5}
            className={`lv-oval lv-oval--${borderState}`}
          />
        </svg>

        {/* Scan line */}
        {showScanLine && (
          <div className={`lv-scan ${challengeActive ? 'lv-scan--fast' : ''}`} />
        )}

        {/* Direction arrow for head turn */}
        {phase === 'turn' && (
          <div style={{
            position: 'absolute',
            top: '42%',
            left: direction === 'right' ? 'auto' : 16,
            right: direction === 'right' ? 16 : 'auto',
            transform: 'translateY(-50%)',
            zIndex: 5,
          }}>
            <div className="lv-arrow-pulse">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <path
                  d={direction === 'right'
                    ? 'M5 12h14m0 0l-6-6m6 6l-6 6'
                    : 'M19 12H5m0 0l6-6m-6 6l6 6'}
                  stroke="#00ffdf"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Progress ring (top-right) */}
        {challengeActive && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5 }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0,212,180,0.12)" strokeWidth={3} />
              <circle
                cx="22" cy="22" r="18"
                fill="none"
                stroke={progress > 0.75 ? '#ffb547' : '#00d4b4'}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - Math.max(0, Math.min(1, progress)))}`}
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
              />
            </svg>
          </div>
        )}

        {/* Cancel pill — top-left */}
        <button onClick={onCancel} className="lv-cancel">
          {phase === 'completed' ? 'Done' : 'Skip'}
        </button>

        {/* Glassmorphism instruction bar — bottom overlay */}
        <div className="lv-bar">
          <p className="lv-bar-text" style={{
            color: phase === 'completed' ? '#00d4b4' : phase === 'failed' ? '#ff3b5c' : '#e8f4f8',
          }}>
            {instruction}
          </p>

          {error && <p className="lv-bar-error">{error}</p>}

          {/* Challenge progress dots */}
          <div className="lv-dots">
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
              <div key={i} className={`lv-dot lv-dot--${getDotState(i)}`} />
            ))}
          </div>

          {/* Tip */}
          <div className="lv-tip">
            <span className="lv-tip-dot" />
            <span>{tipText}</span>
          </div>

          {/* Retry button */}
          {phase === 'failed' && (
            <button onClick={retry} className="lv-btn-retry">
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Injected CSS ──────────────────────────────────────

const LIVENESS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Ambient Glow ── */
.lv-glow {
  position: absolute; border-radius: 50%; pointer-events: none; z-index: 0;
}
.lv-glow-tl {
  top: -80px; left: -80px; width: 240px; height: 240px;
  background: radial-gradient(circle, rgba(0,212,180,0.05) 0%, transparent 70%);
}

/* ── Color Flash Overlay ── */
.lv-flash {
  position: absolute; inset: 0;
  transition: background-color 0.3s ease-in-out;
  pointer-events: none; z-index: 1;
}

/* ── Scan Line ── */
.lv-scan {
  position: absolute; left: 18%; right: 18%;
  height: 1.5px; z-index: 3; pointer-events: none;
  background: linear-gradient(90deg, transparent, #00d4b4, transparent);
  box-shadow: 0 0 8px #00d4b4;
  animation: lv-fscan 2s ease-in-out infinite;
}
.lv-scan--fast { animation-duration: 0.9s; }

/* ── Oval Border Animations ── */
.lv-oval { transition: stroke 0.3s, filter 0.3s; }
.lv-oval--idle   { animation: lv-borderIdle 2.4s ease infinite; }
.lv-oval--active { animation: lv-borderActive 0.8s ease infinite; }
.lv-oval--success { animation: lv-borderSuccess 0.6s ease forwards; }
.lv-oval--fail   { filter: drop-shadow(0 0 30px rgba(255,59,92,0.35)); }

/* ── Direction Arrow ── */
.lv-arrow-pulse { animation: lv-arrowPulse 1.2s ease-in-out infinite; }

/* ── Cancel Pill ── */
.lv-cancel {
  position: absolute; top: 12px; left: 12px; z-index: 10;
  padding: 6px 14px; border-radius: 20px;
  border: 1px solid rgba(0,212,180,0.15);
  background: rgba(4,13,26,0.7);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  color: #4a6a7a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.07em;
  cursor: pointer; transition: all 0.2s;
}
.lv-cancel:hover { border-color: #00d4b4; color: #00d4b4; }

/* ── Instruction Bar (Glassmorphism) ── */
.lv-bar {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 6;
  padding: 14px 20px 18px;
  background: rgba(4,13,26,0.88);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(0,212,180,0.15);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.lv-bar-text {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
  text-shadow: 0 1px 8px rgba(0,0,0,0.5);
}
.lv-bar-error {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: #ff3b5c; letter-spacing: 0.04em;
}

/* ── Progress Dots ── */
.lv-dots { display: flex; gap: 6px; justify-content: center; }
.lv-dot {
  width: 6px; height: 6px; border-radius: 50%;
  transition: all 0.3s cubic-bezier(.4,0,.2,1);
}
.lv-dot--done {
  background: #00d4b4; box-shadow: 0 0 6px rgba(0,212,180,0.5);
}
.lv-dot--active {
  background: #00ffdf; width: 18px; border-radius: 3px;
  box-shadow: 0 0 8px rgba(0,255,223,0.5);
}
.lv-dot--pending { background: rgba(74,106,122,0.3); }

/* ── Tip Bar ── */
.lv-tip {
  display: flex; align-items: center; gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: rgba(232,244,248,0.45);
  letter-spacing: 0.06em;
}
.lv-tip-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #00d4b4; flex-shrink: 0;
}

/* ── Retry Button ── */
.lv-btn-retry {
  margin-top: 2px; padding: 10px 28px; border-radius: 12px; border: none;
  background: #00d4b4; color: #040d1a;
  font-family: 'Syne', sans-serif;
  font-size: 14px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase;
  cursor: pointer; position: relative; overflow: hidden;
  transition: all 0.18s;
}
.lv-btn-retry::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 50%);
}
.lv-btn-retry:hover { background: #00ffdf; transform: translateY(-1px); }

/* ── Keyframes ── */
@keyframes lv-fscan {
  0%   { top: 18%; opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { top: 66%; opacity: 0; }
}
@keyframes lv-borderIdle {
  0%, 100% { filter: drop-shadow(0 0 18px rgba(0,212,180,0.15)); }
  50%      { filter: drop-shadow(0 0 36px rgba(0,212,180,0.32)); }
}
@keyframes lv-borderActive {
  0%, 100% { filter: drop-shadow(0 0 24px rgba(0,255,223,0.3)); }
  50%      { filter: drop-shadow(0 0 50px rgba(0,255,223,0.55)); }
}
@keyframes lv-borderSuccess {
  from { filter: drop-shadow(0 0 20px rgba(0,212,180,0.3)); }
  to   { filter: drop-shadow(0 0 70px rgba(0,212,180,0.7)); }
}
@keyframes lv-arrowPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.15); }
}
`;
