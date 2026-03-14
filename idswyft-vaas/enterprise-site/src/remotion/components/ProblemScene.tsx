import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { AnimatedStatBar } from './AnimatedStatBar';

const { fontFamily: syne } = loadSyne();
const { fontFamily: dmSans } = loadDMSans();

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleTranslateY = interpolate(frame, [0, 20], [20, 0], {
    extrapolateRight: 'clamp',
  });

  // Subtitle fade-in (delayed)
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
      {/* Title */}
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
        Identity verification is complex
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
        Building in-house means...
      </p>

      {/* Stat bars container */}
      <div style={{ width: '100%', maxWidth: 700 }}>
        <AnimatedStatBar
          label="Time to build"
          value="6+ months"
          targetWidth={85}
          color="#ef4444"
          delay={30}
        />
        <AnimatedStatBar
          label="Infrastructure cost"
          value="$200K+"
          targetWidth={70}
          color="#f59e0b"
          delay={45}
        />
        <AnimatedStatBar
          label="Compliance frameworks"
          value="3 required"
          targetWidth={55}
          color="#f59e0b"
          delay={60}
        />
      </div>
    </div>
  );
};
