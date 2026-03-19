import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Syne';
import { C } from '../../../theme';

const { fontFamily: syne } = loadFont();

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();

  const tagline = 'Integrate Identity Verification in 5 Minutes';
  const charsVisible = Math.min(Math.floor(frame / 1.2), tagline.length);

  const logoScale = interpolate(frame, [0, 20], [0.8, 1], { extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Subtle glow pulse on logo
  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.8],
  );

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
      }}
    >
      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          filter: `drop-shadow(0 0 ${20 * glowIntensity}px ${C.cyan})`,
        }}
      >
        <Img src={staticFile('idswyft-logo.png')} style={{ height: 64 }} />
      </div>

      {/* Tagline typed out */}
      <div
        style={{
          fontFamily: syne,
          fontSize: 32,
          fontWeight: 700,
          color: C.text,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          maxWidth: 700,
        }}
      >
        {tagline.slice(0, charsVisible)}
        {charsVisible < tagline.length && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 32,
              background: C.cyan,
              marginLeft: 2,
              verticalAlign: 'middle',
              opacity: frame % 16 < 8 ? 1 : 0,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
