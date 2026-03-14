import React from 'react';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

const { fontFamily: syne } = loadSyne();

const CSS_VARS = {
  teal: '#00d4b4',
  white: '#e8f4f8',
  glass: 'rgba(0,212,180,0.04)',
  border: 'rgba(0,212,180,0.15)',
};

interface TipBarProps {
  text: string;
}

export const TipBar: React.FC<TipBarProps> = ({ text }) => {
  return (
    <div style={{ padding: '0 28px', flexShrink: 0 }}>
      <div
        style={{
          background: CSS_VARS.glass,
          border: `1px solid ${CSS_VARS.border}`,
          borderRadius: 10,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Teal dot */}
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: CSS_VARS.teal,
            flexShrink: 0,
            boxShadow: `0 0 6px ${CSS_VARS.teal}`,
          }}
        />
        <span
          style={{
            fontFamily: syne,
            fontSize: 12,
            color: CSS_VARS.white,
            opacity: 0.8,
            lineHeight: 1.4,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
};
