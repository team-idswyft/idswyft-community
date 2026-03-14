import React from 'react';
import { AbsoluteFill } from 'remotion';

const CSS_VARS = {
  navy: '#040d1a',
  teal: '#00d4b4',
  white: '#e8f4f8',
  muted: '#4a6a7a',
  border: 'rgba(0,212,180,0.15)',
  glass: 'rgba(0,212,180,0.04)',
};

export const PhoneShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <div
        style={{
          width: 390,
          height: 844,
          borderRadius: 48,
          background: CSS_VARS.navy,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: `0 0 0 1px rgba(0,212,180,0.18), 0 0 80px rgba(0,212,180,0.06), 0 40px 120px rgba(0,0,0,0.8)`,
        }}
      >
        {/* Scanline overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,180,0.015) 3px, rgba(0,212,180,0.015) 4px)',
            backgroundSize: '100% 4px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
        {/* Content */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};
