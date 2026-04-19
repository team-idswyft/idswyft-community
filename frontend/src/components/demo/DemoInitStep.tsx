import React from 'react';
import { C } from '../../theme';
import { ContinueOnPhone } from '../ContinueOnPhone';

type VerificationMode = 'full' | 'document_only' | 'identity' | 'age_only';

interface DemoInitStepProps {
  apiKey: string;
  userId: string;
  isLoading: boolean;
  isMobile: boolean;
  mobileHandoffDone: boolean;
  mobileResult: any;
  verificationMode: VerificationMode;
  ageThreshold: number;
  onApiKeyChange: (key: string) => void;
  onUserIdChange: (id: string) => void;
  onVerificationModeChange: (mode: VerificationMode) => void;
  onAgeThresholdChange: (threshold: number) => void;
  onStart: () => void;
  onMobileHandoffDone: (done: boolean) => void;
  onMobileResult: (result: any) => void;
  onMobileVerificationComplete: (verificationId: string) => void;
}

export const DemoInitStep: React.FC<DemoInitStepProps> = ({
  apiKey,
  userId,
  isLoading,
  isMobile,
  mobileHandoffDone,
  mobileResult,
  verificationMode,
  ageThreshold,
  onApiKeyChange,
  onUserIdChange,
  onVerificationModeChange,
  onAgeThresholdChange,
  onStart,
  onMobileHandoffDone,
  onMobileResult,
  onMobileVerificationComplete,
}) => {
  return (
    <div style={{ padding: '8px 0' }}>
      {mobileHandoffDone ? (
        <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center', padding: '32px 0' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? C.greenDim : C.redDim,
            border: `1px solid ${mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? C.green : C.red}`,
            fontSize: 24,
            color: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? C.green : C.red,
          }}>
            {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '\u2713' : '\u2717'}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? 'Verification Complete' : mobileResult?.status === 'failed' ? 'Verification Failed' : 'Under Review'}
          </h2>
          <p style={{ color: C.muted, fontSize: 13 }}>Completed on mobile device</p>
          {mobileResult?.confidence_score != null && (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
              Confidence: {Math.round(mobileResult.confidence_score * 100)}%
            </p>
          )}
          {(mobileResult?.status === 'failed' || mobileResult?.status === 'manual_review') && (
            <button
              onClick={() => { onMobileHandoffDone(false); onMobileResult(null); }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 13 }}
            >
              Try Again
            </button>
          )}
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 6 }}>
            Live Verification Demo
          </h2>
          <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
            Enter your API key, then scan to continue on your phone (recommended) or use this device.
          </p>

          <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontFamily: C.mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: C.muted, marginBottom: 8 }}>
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="ik_your_api_key_here"
                style={{ background: C.panel, border: `1px solid ${C.borderStrong}`, color: C.text, padding: '10px 14px', width: '100%', fontSize: 14, fontFamily: C.sans, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ marginTop: 4, fontSize: 11, color: C.dim }}>
                Get your key from the <a href="/developer" style={{ color: C.accent, textDecoration: 'none' }}>Developer page</a>
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: C.mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: C.muted, marginBottom: 8 }}>
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => onUserIdChange(e.target.value)}
                placeholder="Auto-generated UUID"
                style={{ background: C.panel, border: `1px solid ${C.borderStrong}`, color: C.text, padding: '10px 14px', width: '100%', fontSize: 14, fontFamily: C.sans, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: C.mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: C.muted, marginBottom: 8 }}>
                Verification Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  { mode: 'full' as VerificationMode, label: 'Full', desc: 'ID + liveness + face match' },
                  { mode: 'document_only' as VerificationMode, label: 'Document Only', desc: 'ID front + back, no live capture' },
                  { mode: 'identity' as VerificationMode, label: 'Identity', desc: 'ID front + liveness, no back doc' },
                  { mode: 'age_only' as VerificationMode, label: 'Age Check', desc: 'DOB extraction only' },
                ]).map(({ mode, label, desc }) => (
                  <button
                    key={mode}
                    onClick={() => onVerificationModeChange(mode)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                      background: verificationMode === mode ? C.accentSoft : 'transparent',
                      border: `1px solid ${verificationMode === mode ? C.accent : C.border}`,
                      color: verificationMode === mode ? C.accent : C.muted,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {verificationMode === 'age_only' && (
              <div>
                <label style={{ display: 'block', fontFamily: C.mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: C.muted, marginBottom: 8 }}>
                  Minimum Age
                </label>
                <select
                  value={ageThreshold}
                  onChange={(e) => onAgeThresholdChange(parseInt(e.target.value, 10))}
                  style={{ background: C.panel, border: `1px solid ${C.borderStrong}`, color: C.text, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value={18}>18+</option>
                  <option value={21}>21+</option>
                  <option value={25}>25+</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, maxWidth: 600, margin: '0 auto' }}>
            <ContinueOnPhone
              apiKey={apiKey}
              userId={userId}
              source="demo"
              verificationMode={verificationMode}
              ageThreshold={verificationMode === 'age_only' ? ageThreshold : undefined}
              onComplete={(result) => {
                if (result.verification_id) {
                  onMobileVerificationComplete(result.verification_id);
                } else {
                  onMobileResult(result);
                  onMobileHandoffDone(true);
                }
              }}
            />
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>Or use this device</div>
              <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>Upload documents and use webcam here instead.</p>
              <button
                onClick={onStart}
                disabled={isLoading || !apiKey.trim() || !userId.trim()}
                style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, padding: '9px 0', width: '100%', fontFamily: C.mono, fontWeight: 500, fontSize: 13, cursor: isLoading || !apiKey.trim() || !userId.trim() ? 'not-allowed' : 'pointer', opacity: isLoading || !apiKey.trim() || !userId.trim() ? 0.5 : 1 }}
              >
                {isLoading ? 'Starting\u2026' : 'Start on This Device'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
