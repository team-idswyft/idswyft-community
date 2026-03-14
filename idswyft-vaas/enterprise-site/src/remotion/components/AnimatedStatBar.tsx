import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadIBMPlexMono } from '@remotion/google-fonts/IBMPlexMono';

const { fontFamily: dmSans } = loadDMSans();
const { fontFamily: ibmPlexMono } = loadIBMPlexMono();

interface AnimatedStatBarProps {
  label: string;
  value: string;
  targetWidth: number;
  color: string;
  delay: number;
}

export const AnimatedStatBar: React.FC<AnimatedStatBarProps> = ({
  label,
  value,
  targetWidth,
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  const barWidth = spring({
    frame: adjustedFrame,
    fps,
    config: {
      damping: 28,
      stiffness: 80,
      mass: 0.8,
    },
  }) * targetWidth;

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const translateY = interpolate(adjustedFrame, [0, 15], [12, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        width: '100%',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: dmSans,
            fontSize: 28,
            fontWeight: 500,
            color: '#94a3b8',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: ibmPlexMono,
            fontSize: 28,
            fontWeight: 600,
            color: color,
          }}
        >
          {value}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 52,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            borderRadius: 10,
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 20px ${color}33`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
};
