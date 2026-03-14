import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { AnimatedStatBar } from './AnimatedStatBar';

const { fontFamily: syne } = loadSyne();
const { fontFamily: dmSans } = loadDMSans();

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleTranslateY = interpolate(frame, [0, 20], [20, 0], {
    extrapolateRight: 'clamp',
  });

  // Subtitle fade-in
  const subtitleOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const subtitleTranslateY = interpolate(frame, [15, 30], [12, 0], {
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
        padding: '80px 200px',
      }}
    >
      {/* Title with "VaaS" in cyan */}
      <h2
        style={{
          fontFamily: syne,
          fontSize: 64,
          fontWeight: 700,
          color: '#f1f5f9',
          textAlign: 'center',
          marginBottom: 16,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
        }}
      >
        With Idswyft{' '}
        <span style={{ color: '#22d3ee' }}>VaaS</span>
      </h2>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: dmSans,
          fontSize: 34,
          color: '#64748b',
          textAlign: 'center',
          marginBottom: 60,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleTranslateY}px)`,
        }}
      >
        Enterprise-grade, out of the box
      </p>

      {/* Stat bars container */}
      <div style={{ width: '100%', maxWidth: 700 }}>
        <AnimatedStatBar
          label="Integration time"
          value="30 minutes"
          targetWidth={15}
          color="#22d3ee"
          delay={30}
        />
        <AnimatedStatBar
          label="Infrastructure cost"
          value="$0"
          targetWidth={5}
          color="#22d3ee"
          delay={45}
        />
        <AnimatedStatBar
          label="Compliance"
          value="Built-in"
          targetWidth={95}
          color="#22d3ee"
          delay={60}
        />
      </div>
    </div>
  );
};
