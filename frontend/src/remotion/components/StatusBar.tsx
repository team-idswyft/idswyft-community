import React from 'react';
import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: jetbrains } = loadJetBrains();

const CSS_VARS = {
  teal: '#00d4b4',
  white: '#e8f4f8',
  muted: '#4a6a7a',
};

export const StatusBar: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px 10px',
        fontFamily: jetbrains,
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      <span style={{ color: CSS_VARS.white, fontWeight: 500 }}>09:41</span>
      <span
        style={{
          color: CSS_VARS.teal,
          letterSpacing: '0.08em',
          fontWeight: 500,
        }}
      >
        SECURE SESSION
      </span>
      <span style={{ color: CSS_VARS.muted, letterSpacing: 2 }}>
        {'\u25CF\u25CF\u25CF'}
      </span>
    </div>
  );
};
