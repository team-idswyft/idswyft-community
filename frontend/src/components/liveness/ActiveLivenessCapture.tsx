import { useRef, useEffect, useState, useCallback } from 'react';
import { useActiveLiveness, type LivenessMetadata } from '../../hooks/useActiveLiveness';

interface ActiveLivenessCaptureProps {
  onComplete: (blob: Blob, metadata: LivenessMetadata) => void;
  onCancel: () => void;
  onFallback: () => void;
  /** When true, shows a processing overlay after liveness completes */
  isProcessing?: boolean;
}

export function ActiveLivenessCapture({
  onComplete,
  onCancel,
  onFallback,
  isProcessing = false,
}: ActiveLivenessCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamReady, setStreamReady] = useState(false);
  // Always portrait — objectFit:'cover' crops landscape webcam feeds to fit.
  // Keeping portrait ensures the oval face guide frames faces correctly on all devices.
  const videoDims = { w: 480, h: 640 };

  // Start camera — use `playing` event for readiness instead of awaiting play(),
  // because the async gap after getUserMedia can expire the user-gesture context
  // on some desktop browsers, causing play() to reject and silently falling back.
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
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.addEventListener('loadedmetadata', () => {
            // Dims used for canvas capture only — container stays portrait
          });
          // Listen for the video to actually start rendering frames
          video.addEventListener('playing', () => {
            if (!cancelled) setStreamReady(true);
          }, { once: true });
          // Kick play — autoPlay attribute is the primary trigger, this is a safety net
          video.play().catch(() => {});
        }
      } catch (err) {
        console.error('Camera access failed:', err);
        if (!cancelled) onFallback();
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
  } = useActiveLiveness({
    videoElement: streamReady ? videoRef.current : null,
    canvasElement: canvasRef.current,
    enabled: streamReady,
    onComplete: handleComplete,
    onFallback,
  });

  // ── Dot state computation ──
  // 4 progress dots: turn 1 + return 1 + turn 2 + return 2
  const TOTAL_DOTS = 4;

  const getActiveStep = (): number => {
    if (phase === 'ready') return -1;
    if (phase === 'completed') return TOTAL_DOTS;
    if (phase === 'failed') return Math.min(Math.floor(progress * 4), TOTAL_DOTS - 1);
    // progress is 0/4..4/4 — map to dot index
    return Math.min(Math.floor(progress * 4), TOTAL_DOTS - 1);
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
    : (phase === 'turn' || phase === 'return_center') ? 'active'
    : 'idle';

  const showScanLine = phase !== 'completed' && phase !== 'failed';
  const challengeActive = phase === 'turn' || phase === 'return_center';

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
      maxWidth: 520,
      margin: '0 auto',
      background: 'var(--paper)',
      border: '1px solid var(--rule)',
      overflow: 'hidden',
      fontFamily: 'var(--sans)',
      color: 'var(--ink)',
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
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Ambient glow — top-left */}
        <div className="lv-glow lv-glow-tl" />

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

        {/* Processing overlay — shown while backend analyzes */}
        {isProcessing && (
          <div className="lv-processing">
            <div className="lv-processing-spinner" />
            <p className="lv-processing-text">Processing verification...</p>
            <p className="lv-processing-sub">Analyzing your document and identity</p>
          </div>
        )}

        {/* Cancel pill — top-left */}
        {!isProcessing && (
          <button onClick={onCancel} className="lv-cancel">
            {phase === 'completed' ? 'Done' : 'Skip'}
          </button>
        )}

        {/* Glassmorphism instruction bar — bottom overlay */}
        {!isProcessing && (
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
        )}
      </div>
    </div>
  );
}

// ─── Injected CSS ──────────────────────────────────────

const LIVENESS_CSS = `
/* ── Ambient Glow (removed for v2 -- kept as invisible placeholder) ── */
.lv-glow {
  position: absolute; pointer-events: none; z-index: 0; display: none;
}
.lv-glow-tl { display: none; }

/* ── Scan Line ── */
.lv-scan {
  position: absolute; left: 18%; right: 18%;
  height: 1px; z-index: 3; pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
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
  padding: 6px 14px;
  border: 1px solid var(--rule);
  background: var(--panel);
  color: var(--mid);
  font-family: var(--mono);
  font-size: 11px; letter-spacing: 0.07em;
  cursor: pointer; transition: all 0.2s;
}
.lv-cancel:hover { border-color: var(--ink); color: var(--ink); }

/* ── Instruction Bar (solid panel) ── */
.lv-bar {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 6;
  padding: 14px 20px 18px;
  background: var(--panel);
  border-top: 1px solid var(--rule);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.lv-bar-text {
  margin: 0;
  font-family: var(--sans);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
}
.lv-bar-error {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px; color: #ff3b5c; letter-spacing: 0.04em;
}

/* ── Progress Dots ── */
.lv-dots { display: flex; gap: 6px; justify-content: center; }
.lv-dot {
  width: 6px; height: 6px;
  transition: all 0.3s cubic-bezier(.4,0,.2,1);
}
.lv-dot--done {
  background: var(--accent);
}
.lv-dot--active {
  background: var(--accent); width: 18px;
}
.lv-dot--pending { background: var(--rule); }

/* ── Tip Bar ── */
.lv-tip {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono);
  font-size: 10px; color: var(--soft);
  letter-spacing: 0.06em;
}
.lv-tip-dot {
  width: 5px; height: 5px;
  background: var(--accent); flex-shrink: 0;
}

/* ── Retry Button ── */
.lv-btn-retry {
  margin-top: 2px; padding: 10px 28px; border: 1px solid var(--ink);
  background: var(--ink); color: var(--paper);
  font-family: var(--mono);
  font-size: 13px; font-weight: 500;
  letter-spacing: 0.05em; text-transform: uppercase;
  cursor: pointer; position: relative; overflow: hidden;
  transition: all 0.18s;
}
.lv-btn-retry:hover { transform: translateY(-1px); }

/* ── Processing Overlay ── */
.lv-processing {
  position: absolute; inset: 0; z-index: 20;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: var(--panel);
  border: 1px solid var(--rule);
}
.lv-processing-spinner {
  width: 48px; height: 48px; border-radius: 50%;
  border: 3px solid var(--rule);
  border-top-color: var(--accent);
  animation: lv-spin 0.8s linear infinite;
}
.lv-processing-text {
  margin: 0;
  font-family: var(--sans);
  font-size: 16px; font-weight: 600; color: var(--ink);
  letter-spacing: -0.01em;
}
.lv-processing-sub {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px; color: var(--soft);
  letter-spacing: 0.04em;
}

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
@keyframes lv-spin {
  to { transform: rotate(360deg); }
}
`;
