import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  navy: '#040d1a',
  teal: '#00d4b4',
  white: '#e8f4f8',
  muted: '#4a6a7a',
  border: 'rgba(0,212,180,0.15)',
};

const CORNER_SIZE = 22;
const CORNER_THICKNESS = 2;

const CornerMarker: React.FC<{
  position: 'tl' | 'tr' | 'bl' | 'br';
}> = ({ position }) => {
  const isTop = position.includes('t');
  const isLeft = position.includes('l');

  return (
    <div
      style={{
        position: 'absolute',
        top: isTop ? -1 : undefined,
        bottom: !isTop ? -1 : undefined,
        left: isLeft ? -1 : undefined,
        right: !isLeft ? -1 : undefined,
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        borderColor: CSS_VARS.teal,
        borderStyle: 'solid',
        borderWidth: 0,
        borderTopWidth: isTop ? CORNER_THICKNESS : 0,
        borderBottomWidth: !isTop ? CORNER_THICKNESS : 0,
        borderLeftWidth: isLeft ? CORNER_THICKNESS : 0,
        borderRightWidth: !isLeft ? CORNER_THICKNESS : 0,
        borderTopLeftRadius: isTop && isLeft ? 6 : 0,
        borderTopRightRadius: isTop && !isLeft ? 6 : 0,
        borderBottomLeftRadius: !isTop && isLeft ? 6 : 0,
        borderBottomRightRadius: !isTop && !isLeft ? 6 : 0,
      }}
    />
  );
};

interface IDViewfinderProps {
  variant: 'front' | 'back';
  /** Whether to show the processing overlay */
  showProcessing?: boolean;
  /** Label for the processing overlay, e.g. "READING FRONT" */
  processingLabel?: string;
}

export const IDViewfinder: React.FC<IDViewfinderProps> = ({
  variant,
  showProcessing = false,
  processingLabel = 'PROCESSING',
}) => {
  const frame = useCurrentFrame();

  // Scan line animation: top to bottom over ~60 frames, repeating
  const scanCycle = frame % 60;
  const scanY = interpolate(scanCycle, [0, 60], [0, 100]);

  return (
    <div style={{ padding: '0 28px', flexShrink: 0 }}>
      <div
        style={{
          width: '100%',
          aspectRatio: '1.586',
          borderRadius: 18,
          background: '#020a14',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Inner card with gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 12,
            borderRadius: 10,
            background:
              'linear-gradient(145deg, rgba(0,212,180,0.04) 0%, rgba(4,13,26,0.9) 50%, rgba(0,212,180,0.02) 100%)',
            border: `1px solid ${CSS_VARS.border}`,
          }}
        >
          {variant === 'front' ? <FrontCardContent /> : <BackCardContent />}
        </div>

        {/* Corner markers */}
        <CornerMarker position="tl" />
        <CornerMarker position="tr" />
        <CornerMarker position="bl" />
        <CornerMarker position="br" />

        {/* Scan line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${scanY}%`,
            height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${CSS_VARS.teal} 30%, ${CSS_VARS.teal} 70%, transparent 100%)`,
            opacity: 0.6,
            filter: `blur(0.5px)`,
            boxShadow: `0 0 8px ${CSS_VARS.teal}`,
            pointerEvents: 'none',
          }}
        />

        {/* Processing overlay */}
        {showProcessing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(4,13,26,0.88)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              zIndex: 5,
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: 46,
                height: 46,
                border: `2px solid ${CSS_VARS.border}`,
                borderTopColor: CSS_VARS.teal,
                borderRadius: '50%',
                animation: 'idvSpin 0.8s linear infinite',
              }}
            />
            {/* Label */}
            <div
              style={{
                fontFamily: jetbrains,
                fontSize: 12,
                color: CSS_VARS.teal,
                letterSpacing: '0.1em',
                animation: 'idvBlink 1s ease-in-out infinite',
              }}
            >
              {processingLabel}
            </div>
          </div>
        )}

        <style>
          {`
            @keyframes idvSpin {
              to { transform: rotate(360deg); }
            }
            @keyframes idvBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
          `}
        </style>
      </div>
    </div>
  );
};

/** Front variant: real specimen ID card image */
const FrontCardContent: React.FC = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src="/specimen/id-front.png"
        alt="Specimen ID"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 8,
          opacity: 0.85,
          filter: 'brightness(0.75) saturate(0.8)',
        }}
      />
    </div>
  );
};

/** Back variant: real specimen ID back image */
const BackCardContent: React.FC = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src="/specimen/id-back.png"
        alt="Specimen ID Back"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 8,
          opacity: 0.85,
          filter: 'brightness(0.75) saturate(0.8)',
        }}
      />
    </div>
  );
};
