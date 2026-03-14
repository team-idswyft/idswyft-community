import { useCurrentFrame, interpolate } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { FlowDiagram } from './FlowDiagram';

const { fontFamily: syne } = loadSyne();

export const HowItWorksScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleTranslateY = interpolate(frame, [0, 20], [16, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
      }}
    >
      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
        }}
      >
        <h2
          style={{
            fontFamily: syne,
            fontSize: 56,
            fontWeight: 600,
            color: '#f1f5f9',
          }}
        >
          How it works
        </h2>
      </div>

      {/* Flow Diagram */}
      <FlowDiagram delay={15} />
    </div>
  );
};
