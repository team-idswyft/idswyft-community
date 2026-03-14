import React from 'react';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  teal: '#00d4b4',
  muted: '#4a6a7a',
  white: '#e8f4f8',
};

const LABELS = ['Front ID', 'Back ID', 'Checking', 'Live Photo', 'Complete'];

interface StepTrackerProps {
  /** Index of the currently active segment (0-4). Segments before this are "done". */
  activeIndex: number;
}

export const StepTracker: React.FC<StepTrackerProps> = ({ activeIndex }) => {
  return (
    <div style={{ padding: '8px 28px 4px', flexShrink: 0 }}>
      {/* Segments */}
      <div style={{ display: 'flex', gap: 6 }}>
        {LABELS.map((_, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: isDone ? CSS_VARS.teal : CSS_VARS.muted,
                boxShadow: isDone ? `0 0 6px ${CSS_VARS.teal}` : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '40%',
                    height: '100%',
                    background: CSS_VARS.teal,
                    borderRadius: 2,
                    animation: 'stepTrackerPulse 1.5s ease-in-out infinite',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {LABELS.map((label, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: jetbrains,
                fontSize: 8,
                color: isDone || isActive ? CSS_VARS.white : CSS_VARS.muted,
                opacity: isDone || isActive ? 1 : 0.5,
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
      <style>
        {`
          @keyframes stepTrackerPulse {
            0%, 100% { width: 30%; opacity: 0.6; }
            50% { width: 80%; opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};
