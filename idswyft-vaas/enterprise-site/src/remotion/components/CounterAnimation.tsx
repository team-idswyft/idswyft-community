import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

const { fontFamily: syne } = loadSyne();

interface CounterAnimationProps {
  targetValue: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  delay?: number;
  fontSize?: number;
  color?: string;
}

export const CounterAnimation: React.FC<CounterAnimationProps> = ({
  targetValue,
  suffix = '',
  prefix = '',
  decimals = 0,
  delay = 0,
  fontSize = 72,
  color = '#f1f5f9',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  const progress = spring({
    frame: adjustedFrame,
    fps,
    config: {
      damping: 40,
      stiffness: 60,
      mass: 1,
    },
  });

  const currentValue = interpolate(progress, [0, 1], [0, targetValue]);

  const displayValue = currentValue.toFixed(decimals);

  const opacity = interpolate(adjustedFrame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const suffixOpacity = interpolate(adjustedFrame, [30, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        opacity,
      }}
    >
      {prefix && (
        <span
          style={{
            fontFamily: syne,
            fontSize: fontSize * 0.7,
            fontWeight: 800,
            color,
            marginRight: 4,
            opacity: suffixOpacity,
          }}
        >
          {prefix}
        </span>
      )}
      <span
        style={{
          fontFamily: syne,
          fontSize,
          fontWeight: 800,
          color,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {displayValue}
      </span>
      {suffix && (
        <span
          style={{
            fontFamily: syne,
            fontSize: fontSize * 0.6,
            fontWeight: 800,
            color,
            marginLeft: 4,
            opacity: suffixOpacity,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
};
