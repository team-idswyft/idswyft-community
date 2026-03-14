import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneShell } from './PhoneShell';
import { StatusBar } from './StatusBar';
import { StepTracker } from './StepTracker';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: syne } = loadSyne();
const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  teal: '#00d4b4',
  white: '#e8f4f8',
  muted: '#4a6a7a',
  border: 'rgba(0,212,180,0.15)',
  glass: 'rgba(0,212,180,0.04)',
};

const CHECKING_MESSAGES = [
  'Validating document authenticity...',
  'Cross-referencing front & back data...',
  'Checking document expiry...',
  'Running security checks...',
  'Analyzing document quality...',
];

const PILL_TAGS = [
  { label: 'OCR', delay: 10 },
  { label: 'BARCODE', delay: 35 },
  { label: 'MRZ', delay: 60 },
  { label: 'EXPIRY', delay: 85 },
  { label: 'TAMPER', delay: 110 },
  { label: 'QUALITY', delay: 135 },
];

/**
 * Scene 2: Cross-validation / Checking
 * Duration: 216 frames (7.2s at 30fps)
 *
 * Shows a spinner with cycling status messages and pill tags
 * appearing one by one.
 */
export const CheckingScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Cycle through messages every ~40 frames (relaxed)
  const messageIndex = Math.floor(frame / 40) % CHECKING_MESSAGES.length;

  return (
    <PhoneShell>
      <div style={{ opacity: fadeIn, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <StatusBar />
        <StepTracker activeIndex={2} />

        {/* Title */}
        <div
          style={{
            textAlign: 'center',
            padding: '18px 28px 8px',
            fontFamily: syne,
            fontSize: 18,
            fontWeight: 600,
            color: CSS_VARS.white,
          }}
        >
          Verifying Document
        </div>

        {/* Center content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            padding: '0 28px',
          }}
        >
          {/* Spinner */}
          <div
            style={{
              width: 64,
              height: 64,
              border: `2px solid ${CSS_VARS.border}`,
              borderTopColor: CSS_VARS.teal,
              borderRadius: '50%',
              animation: 'checkingSpin 0.9s linear infinite',
            }}
          />

          {/* Cycling message */}
          <div
            style={{
              fontFamily: jetbrains,
              fontSize: 12,
              color: CSS_VARS.muted,
              textAlign: 'center',
              minHeight: 20,
              letterSpacing: '0.02em',
            }}
          >
            {CHECKING_MESSAGES[messageIndex]}
          </div>

          {/* Pill tags */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              maxWidth: 280,
            }}
          >
            {PILL_TAGS.map((pill, i) => {
              const pillOpacity = interpolate(
                frame,
                [pill.delay, pill.delay + 8],
                [0, 1],
                { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
              );
              const pillScale = interpolate(
                frame,
                [pill.delay, pill.delay + 8],
                [0.8, 1],
                { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
              );
              // After appearing, the pill that matches the current check glows
              const isActive = i <= Math.floor(frame / 34);

              return (
                <div
                  key={pill.label}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: isActive ? 'rgba(0,212,180,0.1)' : CSS_VARS.glass,
                    border: `1px solid ${isActive ? CSS_VARS.teal : CSS_VARS.border}`,
                    fontFamily: jetbrains,
                    fontSize: 10,
                    color: isActive ? CSS_VARS.teal : CSS_VARS.muted,
                    letterSpacing: '0.06em',
                    opacity: pillOpacity,
                    transform: `scale(${pillScale})`,
                    boxShadow: isActive ? `0 0 8px rgba(0,212,180,0.15)` : 'none',
                  }}
                >
                  {pill.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress indicator at bottom */}
        <div style={{ padding: '0 28px 32px' }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: CSS_VARS.border,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: CSS_VARS.teal,
                width: `${interpolate(frame, [0, 195], [5, 95], { extrapolateRight: 'clamp' })}%`,
                boxShadow: `0 0 8px ${CSS_VARS.teal}`,
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes checkingSpin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </PhoneShell>
  );
};
