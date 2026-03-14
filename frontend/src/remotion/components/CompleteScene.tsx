import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneShell } from './PhoneShell';
import { StatusBar } from './StatusBar';
import { StepTracker } from './StepTracker';
import { SuccessScreen } from './SuccessScreen';

/**
 * Scene 4: Verification complete
 * Duration: 192 frames (6.4s at 30fps)
 *
 * All step segments done. Success ring with pulse animation.
 * Checklist items stagger in.
 */
export const CompleteScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <PhoneShell>
      <div style={{ opacity: fadeIn, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <StatusBar />
        <StepTracker activeIndex={5} />

        {/* Success screen content */}
        <SuccessScreen />
      </div>
    </PhoneShell>
  );
};
