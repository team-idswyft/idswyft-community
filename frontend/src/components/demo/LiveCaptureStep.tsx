import React from 'react';
import { C } from '../../theme';
import { OvalFaceViewfinder, TipBar, StepLabel, DemoPrimaryBtn, LivenessCues, AmbientGlow } from './DemoShared';

interface LiveCaptureStepProps {
  isProcessing: boolean;
  showActiveLiveness: boolean;
  onStartLiveness: () => void;
  onSkipLiveCapture: () => void;
  renderActiveLiveness: () => React.ReactNode;
  stepError?: string | null;
  step?: number;
  totalSteps?: number;
}

export const LiveCaptureStep: React.FC<LiveCaptureStepProps> = ({
  isProcessing,
  showActiveLiveness,
  onStartLiveness,
  onSkipLiveCapture,
  renderActiveLiveness,
  stepError,
  step,
  totalSteps,
}) => {
  return (
    <div className="demo-fade-up" style={{ padding: '8px 0', position: 'relative' }}>
      <AmbientGlow />

      <StepLabel step={step ?? 5} total={totalSteps ?? 6} label="Live Photo" />

      {!showActiveLiveness ? (
        <>
          <h2 style={{
            fontSize: 22, fontWeight: 700, color: C.text,
            marginBottom: 6, letterSpacing: '-0.02em',
          }}>
            Liveness check
          </h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
            Follow the on-screen instructions &mdash; look at the camera and turn your head when prompted.
          </p>

          <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Oval face viewfinder (preview) */}
            <OvalFaceViewfinder processing={false} />

            {/* Liveness cues */}
            <LivenessCues />

            <TipBar text="Remove glasses &middot; Face well-lit &middot; No hat" />

            <DemoPrimaryBtn onClick={onStartLiveness} disabled={isProcessing}>
              Start Liveness Check
            </DemoPrimaryBtn>

            <button
              onClick={onSkipLiveCapture}
              style={{
                background: 'transparent', color: C.muted,
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '11px 0', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', width: '100%',
              }}
            >
              Skip Live Capture
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 style={{
            fontSize: 22, fontWeight: 700, color: C.text,
            marginBottom: 6, letterSpacing: '-0.02em',
          }}>
            Liveness check
          </h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
            Follow the instructions below. Look at the camera and turn your head when prompted.
          </p>

          <div style={{ margin: '0 auto' }}>
            {renderActiveLiveness()}
          </div>
        </>
      )}

      {stepError && (
        <p style={{
          marginTop: 10, fontSize: 12, color: C.red,
          fontFamily: C.mono, textAlign: 'center',
        }}>
          {stepError}
        </p>
      )}
    </div>
  );
};
