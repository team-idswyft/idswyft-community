import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile, spring, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Syne';
import { C } from '../../../theme';

const { fontFamily: syne } = loadFont();

const PARTICLE_COUNT = 20;
const PARTICLE_COLORS = [C.cyan, C.green, C.amber];

/** Seeded pseudo-random for deterministic particles */
const seeded = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const Particle: React.FC<{ index: number; frame: number }> = ({ index, frame }) => {
  const startX = seeded(index) * 1280;
  const speed = 1.5 + seeded(index + 50) * 2;
  const wobble = Math.sin(frame * 0.06 + index) * 30;
  const size = 6 + seeded(index + 100) * 8;
  const color = PARTICLE_COLORS[index % PARTICLE_COLORS.length];
  const rotation = frame * (2 + seeded(index + 200) * 3);
  const startDelay = seeded(index + 300) * 30;

  const y = (frame - startDelay) * speed;
  if (y < 0) return null;

  const opacity = interpolate(y, [0, 40, 300, 400], [0, 0.8, 0.8, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: startX + wobble,
        top: -20 + y,
        width: size,
        height: size,
        background: color,
        borderRadius: seeded(index + 150) > 0.5 ? '50%' : 2,
        opacity,
        transform: `rotate(${rotation}deg)`,
      }}
    />
  );
};

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const urlOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      {/* Confetti particles */}
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} frame={frame} />
      ))}

      {/* Content */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          zIndex: 10,
        }}
      >
        {/* Headline */}
        <div
          style={{
            fontFamily: syne,
            fontSize: 40,
            fontWeight: 700,
            color: C.text,
            transform: `scale(${headlineScale})`,
          }}
        >
          Ready to Integrate?
        </div>

        {/* URL */}
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 22,
            color: C.cyan,
            opacity: urlOpacity,
            padding: '10px 28px',
            borderRadius: 8,
            border: `1px solid ${C.cyanBorder}`,
            background: C.cyanDim,
          }}
        >
          idswyft.app/doc
        </div>

        {/* Logo */}
        <div style={{ opacity: urlOpacity, marginTop: 12 }}>
          <Img src={staticFile('idswyft-logo.png')} style={{ height: 36 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
