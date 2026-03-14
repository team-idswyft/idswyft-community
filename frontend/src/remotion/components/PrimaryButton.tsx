import React from 'react';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

const { fontFamily: syne } = loadSyne();

const CSS_VARS = {
  teal: '#00d4b4',
  navy: '#040d1a',
};

interface PrimaryButtonProps {
  label: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label }) => {
  return (
    <div style={{ padding: '0 28px', flexShrink: 0 }}>
      <div
        style={{
          width: '100%',
          padding: '14px 0',
          borderRadius: 12,
          background: CSS_VARS.teal,
          textAlign: 'center',
          fontFamily: syne,
          fontSize: 15,
          fontWeight: 600,
          color: CSS_VARS.navy,
          letterSpacing: '0.02em',
          boxShadow: `0 0 20px rgba(0,212,180,0.3), 0 4px 12px rgba(0,0,0,0.3)`,
        }}
      >
        {label}
      </div>
    </div>
  );
};
