import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame, interpolate } from 'remotion';
import { FrontIDScene } from './components/FrontIDScene';
import { BackIDScene } from './components/BackIDScene';
import { CheckingScene } from './components/CheckingScene';
import { LivePhotoScene } from './components/LivePhotoScene';
import { CompleteScene } from './components/CompleteScene';

/**
 * VerificationShowcase — Root Remotion composition
 *
 * 1140 frames total at 30fps (38s loop).
 *
 * Scene breakdown (relaxed pacing):
 *   Scene 0 - Front ID:   168 frames (5.6s)
 *   Scene 1 - Back ID:    168 frames (5.6s)
 *   Scene 2 - Checking:   216 frames (7.2s)
 *   Scene 3 - Live Photo: 168 frames (5.6s)
 *   Scene 4 - Complete:   270 frames (9.0s)
 *   Transition:           150 frames (5.0s) — fade out to loop
 *
 * Total: 1140 frames = 38s at 30fps
 */

const FADE_DURATION = 15; // frames for cross-fade

const SceneWrapper: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
}> = ({ children, durationInFrames }) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, FADE_DURATION], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE_DURATION, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      {children}
    </AbsoluteFill>
  );
};

const TransitionScene: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 120], [1, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <CompleteScene />
    </AbsoluteFill>
  );
};

export const VerificationShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#040d1a' }}>
      <Series>
        <Series.Sequence durationInFrames={168}>
          <SceneWrapper durationInFrames={168}>
            <FrontIDScene />
          </SceneWrapper>
        </Series.Sequence>

        <Series.Sequence durationInFrames={168}>
          <SceneWrapper durationInFrames={168}>
            <BackIDScene />
          </SceneWrapper>
        </Series.Sequence>

        <Series.Sequence durationInFrames={216}>
          <SceneWrapper durationInFrames={216}>
            <CheckingScene />
          </SceneWrapper>
        </Series.Sequence>

        <Series.Sequence durationInFrames={168}>
          <SceneWrapper durationInFrames={168}>
            <LivePhotoScene />
          </SceneWrapper>
        </Series.Sequence>

        <Series.Sequence durationInFrames={270}>
          <SceneWrapper durationInFrames={270}>
            <CompleteScene />
          </SceneWrapper>
        </Series.Sequence>

        <Series.Sequence durationInFrames={150}>
          <TransitionScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
