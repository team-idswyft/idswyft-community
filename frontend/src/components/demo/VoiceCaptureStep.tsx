import React from 'react';
import { C } from '../../theme';
import { TipBar, StepLabel, DemoPrimaryBtn, AmbientGlow } from './DemoShared';

interface VoiceCaptureStepProps {
  isProcessing: boolean;
  challengeDigits: string | null;
  expiresIn: number | null;
  isRecording: boolean;
  recordingDuration: number;
  onRequestChallenge: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSubmit: () => void;
  hasRecording: boolean;
  stepError?: string | null;
  onRetry?: () => void;
  step?: number;
  totalSteps?: number;
}

export const VoiceCaptureStep: React.FC<VoiceCaptureStepProps> = ({
  isProcessing,
  challengeDigits,
  expiresIn,
  isRecording,
  recordingDuration,
  onRequestChallenge,
  onStartRecording,
  onStopRecording,
  onSubmit,
  hasRecording,
  stepError,
  onRetry,
  step,
  totalSteps,
}) => {
  const hasChallenge = !!challengeDigits;
  const expired = expiresIn !== null && expiresIn <= 0;

  return (
    <div className="demo-fade-up" style={{ padding: '8px 0', position: 'relative' }}>
      <AmbientGlow />

      <StepLabel step={step ?? 6} total={totalSteps ?? 7} label="Voice Verification" />

      <h2 style={{
        fontSize: 22, fontWeight: 700, color: C.text,
        marginBottom: 6, letterSpacing: '-0.02em',
      }}>
        Speaker verification
      </h2>

      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        Speak the digits shown below into your microphone for identity confirmation.
      </p>

      <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Microphone icon placeholder */}
        <div style={{
          width: 120, height: 120, borderRadius: '50%', margin: '0 auto',
          background: `linear-gradient(135deg, ${C.cyan}18, ${C.cyan}08)`,
          border: `2px solid ${isRecording ? C.cyan : C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.3s, box-shadow 0.3s',
          boxShadow: isRecording ? `0 0 24px ${C.cyan}40` : 'none',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={isRecording ? C.cyan : C.muted} strokeWidth="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>

        {/* Challenge digits display */}
        {hasChallenge && !expired && (
          <div style={{
            background: `${C.cyan}0a`, border: `1px solid ${C.cyan}30`,
            borderRadius: 12, padding: '16px 20px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: C.mono, fontSize: 11, color: C.cyan,
              letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase',
            }}>
              Speak these digits
            </div>
            <div style={{
              fontFamily: C.mono, fontSize: 32, fontWeight: 700, color: C.text,
              letterSpacing: '0.2em',
            }}>
              {challengeDigits}
            </div>
            {expiresIn !== null && (
              <div style={{
                fontFamily: C.mono, fontSize: 11, color: expiresIn < 30 ? C.red : C.muted,
                marginTop: 8,
              }}>
                Expires in {expiresIn}s
              </div>
            )}
          </div>
        )}

        {/* Recording duration */}
        {isRecording && (
          <div style={{
            fontFamily: C.mono, fontSize: 14, color: C.cyan,
            textAlign: 'center',
          }}>
            Recording: {recordingDuration}s
          </div>
        )}

        {/* Recording complete indicator */}
        {hasRecording && !isRecording && !isProcessing && (
          <div style={{
            fontFamily: C.mono, fontSize: 12, color: C.green || '#22c55e',
            textAlign: 'center',
          }}>
            Recording captured ({recordingDuration}s)
          </div>
        )}

        <TipBar text="Speak clearly &middot; Quiet environment &middot; Close to mic" />

        {/* Action buttons */}
        {!hasChallenge && !isProcessing && (
          <DemoPrimaryBtn onClick={onRequestChallenge} disabled={isProcessing}>
            Get Challenge Digits
          </DemoPrimaryBtn>
        )}

        {hasChallenge && !expired && !isRecording && !hasRecording && (
          <DemoPrimaryBtn onClick={onStartRecording} disabled={isProcessing}>
            Start Recording
          </DemoPrimaryBtn>
        )}

        {isRecording && (
          <DemoPrimaryBtn onClick={onStopRecording} disabled={false}>
            Stop Recording
          </DemoPrimaryBtn>
        )}

        {hasRecording && !isRecording && !isProcessing && (
          <DemoPrimaryBtn onClick={onSubmit} disabled={isProcessing}>
            Submit Voice Capture
          </DemoPrimaryBtn>
        )}

        {isProcessing && (
          <DemoPrimaryBtn onClick={() => {}} disabled>
            Verifying...
          </DemoPrimaryBtn>
        )}

        {expired && !stepError && (
          <DemoPrimaryBtn onClick={() => { onRetry?.(); onRequestChallenge(); }} disabled={isProcessing}>
            Request New Challenge
          </DemoPrimaryBtn>
        )}
      </div>

      {stepError && (
        <div style={{ marginTop: 10, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <p style={{
            fontSize: 12, color: C.red,
            fontFamily: C.mono,
          }}>
            {stepError}
          </p>
          {onRetry && (
            <DemoPrimaryBtn onClick={onRetry} disabled={isProcessing}>
              Try Again
            </DemoPrimaryBtn>
          )}
        </div>
      )}
    </div>
  );
};
