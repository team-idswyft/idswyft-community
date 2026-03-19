import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Syne';
import { C } from '../../../theme';
import { FrontIDScene } from '../FrontIDScene';
import { BackIDScene } from '../BackIDScene';
import { LivePhotoScene } from '../LivePhotoScene';

const { fontFamily: syne } = loadFont();

/**
 * Scene 4: Reuses existing phone-based verification scenes
 * at reduced scale to show the end-user experience.
 */
export const VerificationInAction: React.FC = () => {
  const frame = useCurrentFrame();
  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: syne,
          fontSize: 18,
          fontWeight: 600,
          color: C.muted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: -60,
          zIndex: 10,
          opacity: labelOpacity,
        }}
      >
        Your User's Experience
      </div>

      {/* Phone scenes at 50% scale */}
      <div
        style={{
          transform: 'scale(0.5)',
          transformOrigin: 'center center',
          width: 390,
          height: 844,
          position: 'relative',
        }}
      >
        <Series>
          <Series.Sequence durationInFrames={80}>
            <FrontIDScene />
          </Series.Sequence>
          <Series.Sequence durationInFrames={80}>
            <BackIDScene />
          </Series.Sequence>
          <Series.Sequence durationInFrames={80}>
            <LivePhotoScene />
          </Series.Sequence>
        </Series>
      </div>
    </AbsoluteFill>
  );
};
