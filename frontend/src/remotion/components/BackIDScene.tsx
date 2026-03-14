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
 * Scene 1: Back ID scan
 * Duration: 168 frames (5.6s at 30fps)
 *
 * Timeline:
 *   0-20: Fade in
 *   20-90: Show back viewfinder with scan + specimen back visible
 *   90-100: Button fades, processing appears
 *   100-168: Processing overlay with "READING BARCODE"
 */
export const BackIDScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const showProcessing = frame >= 90;
  const buttonOpacity = interpolate(frame, [85, 95], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <PhoneShell>
      <div style={{ opacity: fadeIn, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <StatusBar />
        <StepTracker activeIndex={1} />

        {/* Top spacer */}
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
          Scan Back of ID
        </div>

        {/* Viewfinder - back variant */}
        <IDViewfinder
          variant="back"
          showProcessing={showProcessing}
          processingLabel="READING BARCODE"
        />

        {/* Tip */}
        <div style={{ marginTop: 14 }}>
          <TipBar text="Flip your ID and align the barcode" />
        </div>

        {/* Button */}
        <div style={{ marginTop: 12, opacity: buttonOpacity }}>
          <PrimaryButton label="Scan Back of ID" />
        </div>

        {/* Bottom spacer */}
        <div style={{ flex: 1 }} />
      </div>
    </PhoneShell>
  );
};
