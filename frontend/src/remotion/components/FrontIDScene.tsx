import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneShell } from './PhoneShell';
import { StatusBar } from './StatusBar';
import { StepTracker } from './StepTracker';
import { IDViewfinder } from './IDViewfinder';
import { TipBar } from './TipBar';
import { PrimaryButton } from './PrimaryButton';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

const { fontFamily: syne } = loadSyne();

/**
 * Scene 0: Front ID scan
 * Duration: 168 frames (5.6s at 30fps)
 *
 * Timeline:
 *   0-20: Fade in
 *   20-90: Show viewfinder with scan line + specimen card visible, button ready
 *   90-100: User "taps" button, processing overlay appears
 *   100-168: Processing with "READING FRONT" label
 */
export const FrontIDScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // After frame 90, show processing overlay — gives 3s to admire the card
  const showProcessing = frame >= 90;

  // Button opacity: visible until frame 90, then fades
  const buttonOpacity = interpolate(frame, [85, 95], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <PhoneShell>
      <div style={{ opacity: fadeIn, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <StatusBar />
        <StepTracker activeIndex={0} />

        {/* Top spacer — equal to bottom */}
        <div style={{ flex: 1 }} />

        {/* Title */}
        <div
          style={{
            textAlign: 'center',
            padding: '0 28px 14px',
            fontFamily: syne,
            fontSize: 18,
            fontWeight: 600,
            color: '#e8f4f8',
          }}
        >
          Scan Front of ID
        </div>

        {/* Viewfinder */}
        <IDViewfinder
          variant="front"
          showProcessing={showProcessing}
          processingLabel="READING FRONT"
        />

        {/* Tip */}
        <div style={{ marginTop: 14 }}>
          <TipBar text="Place your ID within the frame" />
        </div>

        {/* Button */}
        <div style={{ marginTop: 12, opacity: buttonOpacity }}>
          <PrimaryButton label="Scan Front of ID" />
        </div>

        {/* Bottom spacer — equal to top */}
        <div style={{ flex: 1 }} />
      </div>
    </PhoneShell>
  );
};
