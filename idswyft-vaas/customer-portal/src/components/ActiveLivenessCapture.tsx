import { useRef, useEffect, useState, useCallback } from 'react';
import { useActiveLiveness, type LivenessMetadata } from '../hooks/useActiveLiveness';

interface ActiveLivenessCaptureProps {
  onComplete: (blob: Blob, metadata: LivenessMetadata) => void;
  onCancel: () => void;
  onFallback: () => void;
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
    flashColor,
  } = useActiveLiveness({
    videoElement: streamReady ? videoRef.current : null,
    canvasElement: canvasRef.current,
    enabled: streamReady,
    onComplete: handleComplete,
    onFallback,
  });

  const accentColor = '#2dd4bf'; // teal-400

  return (
    <div className="relative w-full max-w-md mx-auto bg-gray-950 rounded-2xl overflow-hidden border border-white/5">
      {/* Video + Overlay — aspect ratio matches actual camera stream to prevent zoom/crop */}
      <div className="relative w-full" style={{ aspectRatio: `${videoDims.w}/${videoDims.h}`, maxHeight: '70vh' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover rounded-t-2xl"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Color flash overlay — semi-transparent so face is visible through the color */}
        {flashColor && (
          <div
            className="absolute inset-0 pointer-events-none transition-colors duration-150"
            style={{
              backgroundColor: `rgba(${flashColor[0]}, ${flashColor[1]}, ${flashColor[2]}, 0.5)`,
              zIndex: 1,
            }}
          />
        )}

        {/* Oval face guide — viewBox matches video dimensions for perfect alignment */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 2 }}
          viewBox={`0 0 ${videoDims.w} ${videoDims.h}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <mask id="cp-face-oval-mask">
              <rect width={videoDims.w} height={videoDims.h} fill="white" />
              <ellipse cx={videoDims.w / 2} cy={videoDims.h * 0.42} rx={videoDims.w * 0.27} ry={videoDims.h * 0.265} fill="black" />
            </mask>
          </defs>
          <rect
            width={videoDims.w}
            height={videoDims.h}
            fill="rgba(0,0,0,0.5)"
            mask="url(#cp-face-oval-mask)"
          />
          <ellipse
            cx={videoDims.w / 2}
            cy={videoDims.h * 0.42}
            rx={videoDims.w * 0.27}
            ry={videoDims.h * 0.265}
            fill="none"
            stroke={faceDetected ? accentColor : '#6b7280'}
            strokeWidth={3}
            strokeDasharray={faceDetected ? 'none' : '8 4'}
            className="transition-all duration-300"
          />
        </svg>

        {/* Direction arrow */}
        {phase === 'turn' && (
          <div
            className="absolute top-1/2 animate-pulse"
            style={{
              left: direction === 'left' ? 20 : 'auto',
              right: direction === 'right' ? 20 : 'auto',
              transform: 'translateY(-50%)',
              zIndex: 3,
            }}
          >
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

        {/* Progress ring */}
        {(phase === 'color_flash' || phase === 'turn' || phase === 'return_center') && (
          <div className="absolute top-3 right-3" style={{ zIndex: 3 }}>
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
                className="transition-all duration-200"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Instruction area */}
      <div className="px-5 py-4 text-center min-h-[80px] flex flex-col items-center justify-center gap-3">
        <p
          className="text-base font-medium m-0"
          style={{
            color: phase === 'completed' ? '#34d399' : phase === 'failed' ? '#f87171' : '#e2e8f0',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {instruction}
        </p>

        {error && (
          <p className="text-red-400 text-sm m-0">{error}</p>
        )}

        <div className="flex gap-2">
          {phase === 'failed' && (
            <button
              onClick={retry}
              className="px-5 py-2 rounded-lg font-semibold text-sm cursor-pointer border-none"
              style={{ background: accentColor, color: '#030712' }}
            >
              Retry
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg text-sm cursor-pointer bg-transparent text-gray-400 border border-white/10 hover:border-white/20 transition-colors"
          >
            {phase === 'completed' ? 'Done' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}
