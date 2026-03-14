import React from 'react';
import { useCurrentFrame } from 'remotion';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  teal: '#00d4b4',
  muted: '#4a6a7a',
  white: '#e8f4f8',
  border: 'rgba(0,212,180,0.15)',
};

const CUES = [
  { emoji: '\uD83D\uDE10', label: 'Look ahead' },
  { emoji: '\uD83D\uDE0A', label: 'Smile' },
  { emoji: '\u2194\uFE0F', label: 'Turn slightly' },
];

export const LivenessCues: React.FC = () => {
  const frame = useCurrentFrame();
  // Cycle through cues every 30 frames (~1s each)
  const activeIndex = Math.floor(frame / 30) % CUES.length;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        padding: '12px 28px',
        flexShrink: 0,
      }}
    >
      {CUES.map((cue, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              opacity: isActive ? 1 : 0.35,
              transition: 'opacity 0.3s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: `2px solid ${isActive ? CSS_VARS.teal : CSS_VARS.muted}`,
                boxShadow: isActive ? `0 0 12px rgba(0,212,180,0.3)` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                background: isActive ? 'rgba(0,212,180,0.06)' : 'transparent',
              }}
            >
              {cue.emoji}
            </div>
            <span
              style={{
                fontFamily: jetbrains,
                fontSize: 9,
                color: isActive ? CSS_VARS.white : CSS_VARS.muted,
                letterSpacing: '0.03em',
              }}
            >
              {cue.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
