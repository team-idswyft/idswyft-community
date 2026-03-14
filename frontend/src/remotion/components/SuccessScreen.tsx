import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: syne } = loadSyne();
const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  teal: '#00d4b4',
  white: '#e8f4f8',
  muted: '#4a6a7a',
  navy: '#040d1a',
};

const CHECKLIST_ITEMS = [
  'Document authenticated',
  'Data extracted & validated',
  'Liveness confirmed',
  'Face match verified',
];

export const SuccessScreen: React.FC = () => {
  const frame = useCurrentFrame();

  // Checkmark scale-in: frames 0-15
  const checkScale = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const checkOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: '0 28px',
        gap: 32,
      }}
    >
      {/* Success ring */}
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: '50%',
          border: `2px solid ${CSS_VARS.teal}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'successPulse 2s ease-in-out infinite',
          transform: `scale(${checkScale})`,
          opacity: checkOpacity,
        }}
      >
        <span
          style={{
            fontSize: 44,
            color: CSS_VARS.teal,
            fontWeight: 300,
            lineHeight: 1,
          }}
        >
          {'\u2713'}
        </span>
      </div>

      {/* Verified label */}
      <div
        style={{
          fontFamily: syne,
          fontSize: 22,
          fontWeight: 600,
          color: CSS_VARS.white,
          letterSpacing: '0.04em',
          opacity: interpolate(frame, [10, 20], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        VERIFIED
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        {CHECKLIST_ITEMS.map((item, i) => {
          // Stagger each item by 8 frames starting at frame 20
          const itemStart = 20 + i * 8;
          const itemOpacity = interpolate(frame, [itemStart, itemStart + 10], [0, 1], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          });
          const itemY = interpolate(frame, [itemStart, itemStart + 10], [12, 0], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: itemOpacity,
                transform: `translateY(${itemY}px)`,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'rgba(0,212,180,0.12)',
                  border: `1px solid ${CSS_VARS.teal}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: CSS_VARS.teal, fontSize: 11, fontWeight: 600 }}>
                  {'\u2713'}
                </span>
              </div>
              <span
                style={{
                  fontFamily: jetbrains,
                  fontSize: 12,
                  color: CSS_VARS.white,
                  opacity: 0.85,
                }}
              >
                {item}
              </span>
            </div>
          );
        })}
      </div>

      <style>
        {`
          @keyframes successPulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(0,212,180,0.25), 0 0 20px rgba(0,212,180,0.1);
            }
            50% {
              box-shadow: 0 0 0 8px rgba(0,212,180,0.06), 0 0 40px rgba(0,212,180,0.15);
            }
          }
        `}
      </style>
    </div>
  );
};
