import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Syne';
import { C } from '../../../theme';

const { fontFamily: syne } = loadFont();

const STATS = [
  { label: 'Verifications', value: 247, suffix: '', color: C.cyan },
  { label: 'Success Rate', value: 98.5, suffix: '%', color: C.green },
  { label: 'Avg Response', value: 145, suffix: 'ms', color: C.amber },
];

const BAR_DATA = [65, 82, 74, 91, 88, 95, 78, 86, 92, 97, 85, 90];

/** Animated counter that ticks up */
const Counter: React.FC<{ value: number; progress: number; suffix: string }> = ({
  value,
  progress,
  suffix,
}) => {
  const current = value * progress;
  const display = value % 1 !== 0 ? current.toFixed(1) : Math.floor(current).toString();
  return (
    <span>
      {display}
      {suffix}
    </span>
  );
};

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Stagger stat cards: each appears 15 frames apart
  const cardProgress = (i: number) => {
    const start = i * 15;
    return interpolate(frame, [start, start + 30], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  };

  // Bar chart grows after stats
  const barProgress = interpolate(frame, [50, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 80px',
        gap: 28,
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontFamily: syne,
          fontSize: 18,
          fontWeight: 600,
          color: C.muted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: labelOpacity,
        }}
      >
        Monitor Everything in Real-Time
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 20, width: '100%', maxWidth: 800 }}>
        {STATS.map((stat, i) => {
          const p = cardProgress(i);
          const slideY = interpolate(p, [0, 1], [20, 0]);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: C.surface,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                padding: '20px 24px',
                opacity: p,
                transform: `translateY(${slideY}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: C.mono,
                  fontSize: 11,
                  color: C.muted,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontFamily: C.mono,
                  fontSize: 32,
                  fontWeight: 700,
                  color: stat.color,
                }}
              >
                <Counter value={stat.value} progress={p} suffix={stat.suffix} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar chart */}
      <div
        style={{
          width: '100%',
          maxWidth: 800,
          background: C.surface,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          Daily Verifications (Last 12 Days)
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            height: 120,
          }}
        >
          {BAR_DATA.map((val, i) => {
            const barH = (val / 100) * 120 * barProgress;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: barH,
                  borderRadius: '4px 4px 0 0',
                  background: `linear-gradient(to top, ${C.cyan}40, ${C.cyan})`,
                  transition: 'height 0.1s',
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
