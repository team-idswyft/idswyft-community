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
  theme = 'dark',
}: ActiveLivenessCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamReady, setStreamReady] = useState(false);

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
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
    faceDetected,
    error,
    retry,
  } = useActiveLiveness({
    videoElement: streamReady ? videoRef.current : null,
    canvasElement: canvasRef.current,
    enabled: streamReady,
    onComplete: handleComplete,
    onFallback,
  });

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#080c14' : '#ffffff';
  const textColor = isDark ? '#dde2ec' : '#1a1a2e';
  const mutedColor = isDark ? '#8896aa' : '#6b7280';
  const accentColor = '#22d3ee';

  const showArrow = phase === 'turn';

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 480,
      margin: '0 auto',
      background: bgColor,
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Video + Overlay */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            borderRadius: '16px 16px 0 0',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Oval face guide */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox="0 0 640 480"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <mask id="face-oval-mask">
              <rect width="640" height="480" fill="white" />
              <ellipse cx="320" cy="220" rx="130" ry="170" fill="black" />
            </mask>
          </defs>
          <rect
            width="640"
            height="480"
            fill="rgba(0,0,0,0.5)"
            mask="url(#face-oval-mask)"
          />
          <ellipse
            cx="320"
            cy="220"
            rx="130"
            ry="170"
            fill="none"
            stroke={faceDetected ? accentColor : mutedColor}
            strokeWidth={3}
            strokeDasharray={faceDetected ? 'none' : '8 4'}
            style={{ transition: 'stroke 0.3s' }}
          />
        </svg>

        {/* Direction arrow overlay */}
        {showArrow && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: direction === 'right' ? 'auto' : 20,
            right: direction === 'right' ? 20 : 'auto',
            transform: 'translateY(-50%)',
            animation: 'pulse 1.2s ease-in-out infinite',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d={direction === 'right'
                  ? 'M5 12h14m0 0l-6-6m6 6l-6 6'
                  : 'M19 12H5m0 0l6-6m-6 6l6 6'}
                stroke={accentColor}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Phase-specific progress ring (top-right) */}
        {(phase === 'center_face' || phase === 'turn' || phase === 'return_center') && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
          }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke={accentColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - Math.max(0, Math.min(1, progress)))}`}
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.2s' }}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Instruction area */}
      <div style={{
        padding: '16px 20px',
        textAlign: 'center',
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}>
        <p style={{
          color: phase === 'completed' ? '#34d399' : phase === 'failed' ? '#f87171' : textColor,
          fontSize: 16,
          fontWeight: 500,
          margin: 0,
          fontFamily: '"DM Sans", system-ui, sans-serif',
        }}>
          {instruction}
        </p>

        {error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {phase === 'failed' && (
            <button
              onClick={retry}
              style={{
                padding: '8px 20px',
                background: accentColor,
                color: '#080c14',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Retry
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              background: 'transparent',
              color: mutedColor,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {phase === 'completed' ? 'Done' : 'Skip'}
          </button>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: translateY(-50%) scale(1); }
          50% { opacity: 1; transform: translateY(-50%) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
