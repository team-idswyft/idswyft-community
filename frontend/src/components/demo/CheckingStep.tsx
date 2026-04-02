import React, { useState, useEffect } from 'react';
import { C } from '../../theme';
import { StepLabel, AmbientGlow, DemoPrimaryBtn } from './DemoShared';

const MESSAGES = [
  'Verifying your document\u2026',
  'Cross-checking details\u2026',
  'Almost there\u2026',
];

const TAGS = ['Document read', 'Details matched', 'Security checks'];

interface CheckingStepProps {
  stepError?: string | null;
  onRetry?: () => void;
}

export const CheckingStep: React.FC<CheckingStepProps> = ({ stepError, onRetry }) => {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1800);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="demo-fade-up"
      style={{
        textAlign: 'center', padding: '48px 0', position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      <AmbientGlow />

      <StepLabel step={4} total={6} label="Verification" />

      {/* Spinner */}
      <div style={{
        width: 80, height: 80,
        border: `2.5px solid ${C.cyanDim}`,
        borderTopColor: C.cyan, borderRadius: '50%',
        boxShadow: '0 0 30px rgba(34,211,238,0.1)',
        animation: 'dSpin 1s linear infinite',
        marginBottom: 18,
      }} />

      {/* Cycling message */}
      <p style={{
        fontFamily: C.sans, fontSize: 16, fontWeight: 700,
        color: C.text, marginBottom: 6,
      }}>
        {MESSAGES[msgIdx]}
      </p>

      <p style={{
        fontFamily: C.mono, fontSize: 11, color: C.muted,
        letterSpacing: '0.08em',
      }}>
        This only takes a moment
      </p>

      {/* Status tags */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {TAGS.map(tag => (
          <span key={tag} style={{
            padding: '5px 10px', borderRadius: 20,
            background: C.cyanDim, border: `1px solid ${C.cyanBorder}`,
            fontFamily: C.mono, fontSize: 10,
            color: C.cyan, opacity: 0.7,
          }}>{tag}</span>
        ))}
      </div>

      {stepError && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <p style={{
            fontSize: 12, color: C.red,
            fontFamily: C.mono, marginBottom: onRetry ? 12 : 0,
          }}>
            {stepError}
          </p>
          {onRetry && (
            <DemoPrimaryBtn onClick={onRetry} style={{ maxWidth: 200, margin: '0 auto' }}>
              Retry
            </DemoPrimaryBtn>
          )}
        </div>
      )}
    </div>
  );
};
