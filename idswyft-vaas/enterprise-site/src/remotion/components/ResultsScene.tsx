import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadIBMPlexMono } from '@remotion/google-fonts/IBMPlexMono';
import { CounterAnimation } from './CounterAnimation';

const { fontFamily: syne } = loadSyne();
const { fontFamily: dmSans } = loadDMSans();
const { fontFamily: ibmPlexMono } = loadIBMPlexMono();

const subStats = [
  { value: '<200ms', label: 'Response time' },
  { value: 'SOC 2', label: 'Certified' },
  { value: 'White-label', label: 'Fully branded' },
];

export const ResultsScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Counter label
  const labelOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const labelTranslateY = interpolate(frame, [25, 40], [8, 0], {
    extrapolateRight: 'clamp',
  });

  // Sub-stats stagger
  const getSubStatOpacity = (index: number) =>
    interpolate(frame, [55 + index * 12, 70 + index * 12], [0, 1], {
      extrapolateRight: 'clamp',
    });
  const getSubStatTranslateY = (index: number) =>
    interpolate(frame, [55 + index * 12, 70 + index * 12], [16, 0], {
      extrapolateRight: 'clamp',
    });

  // Final fade-out for loop (last ~30 frames = 1 second)
  const fadeOut = interpolate(frame, [150, 178], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 200px',
        opacity: fadeOut,
      }}
    >
      {/* Large counter */}
      <div style={{ marginBottom: 16 }}>
        <CounterAnimation
          targetValue={99.8}
          suffix="%"
          decimals={1}
          delay={0}
          fontSize={128}
          color="#f1f5f9"
        />
      </div>

      {/* Label */}
      <p
        style={{
          fontFamily: ibmPlexMono,
          fontSize: 30,
          color: '#64748b',
          textAlign: 'center',
          marginBottom: 64,
          opacity: labelOpacity,
          transform: `translateY(${labelTranslateY}px)`,
          letterSpacing: '0.05em',
        }}
      >
        Document verification accuracy
      </p>

      {/* Sub-stat cards */}
      <div
        style={{
          display: 'flex',
          gap: 36,
          justifyContent: 'center',
        }}
      >
        {subStats.map((stat, index) => (
          <div
            key={stat.label}
            style={{
              opacity: getSubStatOpacity(index),
              transform: `translateY(${getSubStatTranslateY(index)}px)`,
              width: 280,
              padding: '32px 24px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: syne,
                fontSize: 38,
                fontWeight: 700,
                color: '#22d3ee',
                marginBottom: 8,
              }}
            >
              {stat.value}
            </p>
            <p
              style={{
                fontFamily: dmSans,
                fontSize: 22,
                color: '#475569',
                fontWeight: 500,
              }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
