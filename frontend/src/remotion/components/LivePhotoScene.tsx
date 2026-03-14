import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneShell } from './PhoneShell';
import { StatusBar } from './StatusBar';
import { StepTracker } from './StepTracker';
import { FaceViewfinder } from './FaceViewfinder';
import { LivenessCues } from './LivenessCues';
import { TipBar } from './TipBar';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

const { fontFamily: syne } = loadSyne();

/**
 * Scene 3: Live Photo / Face capture
 * Duration: 168 frames (5.6s at 30fps)
 *
 * Shows the oval face viewfinder with dot grid,
 * glow pulse animation, scan line, and cycling liveness cues.
 */
export const LivePhotoScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <PhoneShell>
      <div style={{ opacity: fadeIn, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <StatusBar />
        <StepTracker activeIndex={3} />

        {/* Top spacer */}
        <div style={{ flex: 1 }} />

        {/* Title */}
        <div
          style={{
            textAlign: 'center',
            padding: '0 28px 6px',
            fontFamily: syne,
            fontSize: 18,
            fontWeight: 600,
            color: '#e8f4f8',
          }}
        >
          Live Capture
        </div>

        {/* Subtitle */}
        <div
          style={{
            textAlign: 'center',
            padding: '0 28px 14px',
            fontFamily: syne,
            fontSize: 12,
            color: '#4a6a7a',
          }}
        >
          Position your face in the oval
        </div>

        {/* Face viewfinder */}
        <FaceViewfinder />

        {/* Liveness cues */}
        <LivenessCues />

        {/* Tip */}
        <div style={{ marginTop: 14 }}>
          <TipBar text="Hold steady and follow the prompts" />
        </div>

        {/* Bottom spacer */}
        <div style={{ flex: 1 }} />
      </div>
    </PhoneShell>
  );
};
