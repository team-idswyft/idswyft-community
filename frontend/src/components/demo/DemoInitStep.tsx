import React from 'react';
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
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.1)',
            border: `1px solid ${mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '#34d399' : '#f87171'}`,
            fontSize: 24,
            color: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '#34d399' : '#f87171',
          }}>
            {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '\u2713' : '\u2717'}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#dde2ec', marginBottom: 6 }}>
            {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? 'Verification Complete' : mobileResult?.status === 'failed' ? 'Verification Failed' : 'Under Review'}
          </h2>
          <p style={{ color: '#8896aa', fontSize: 13 }}>Completed on mobile device</p>
          {mobileResult?.confidence_score != null && (
            <p style={{ color: '#8896aa', fontSize: 13, marginTop: 8 }}>
              Confidence: {Math.round(mobileResult.confidence_score * 100)}%
            </p>
          )}
          {(mobileResult?.status === 'failed' || mobileResult?.status === 'manual_review') && (
            <button
              onClick={() => { onMobileHandoffDone(false); onMobileResult(null); }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#22d3ee', cursor: 'pointer', fontSize: 13 }}
            >
              Try Again
            </button>
          )}
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#dde2ec', textAlign: 'center', marginBottom: 6 }}>
            Live Verification Demo
          </h2>
          <p style={{ color: '#8896aa', fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
            Enter your API key, then verify on this device or scan to use your phone.
          </p>

          <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="ik_your_api_key_here"
                style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.07)', color: '#dde2ec', borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ marginTop: 4, fontSize: 11, color: '#4a5568' }}>
                Get your key from the <a href="/developer" style={{ color: '#22d3ee', textDecoration: 'none' }}>Developer page</a>
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => onUserIdChange(e.target.value)}
                placeholder="Auto-generated UUID"
                style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.07)', color: '#dde2ec', borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
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
                      padding: '10px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                      background: verificationMode === mode ? 'rgba(34,211,238,0.12)' : '#0f1420',
                      border: `1px solid ${verificationMode === mode ? '#22d3ee' : 'rgba(255,255,255,0.07)'}`,
                      color: verificationMode === mode ? '#22d3ee' : '#8896aa',
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
                <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
                  Minimum Age
                </label>
                <select
                  value={ageThreshold}
                  onChange={(e) => onAgeThresholdChange(parseInt(e.target.value, 10))}
                  style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.07)', color: '#dde2ec', borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value={18}>18+</option>
                  <option value={21}>21+</option>
                  <option value={25}>25+</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, maxWidth: 600, margin: '0 auto' }}>
            <div style={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#dde2ec', fontWeight: 600 }}>Start Here</div>
              <p style={{ fontSize: 12, color: '#8896aa', lineHeight: 1.5 }}>Upload documents and use webcam on this device.</p>
              <button
                onClick={onStart}
                disabled={isLoading || !apiKey.trim() || !userId.trim()}
                style={{ background: '#22d3ee', color: '#080c14', border: 'none', borderRadius: 8, padding: '9px 0', width: '100%', fontWeight: 600, fontSize: 13, cursor: isLoading || !apiKey.trim() || !userId.trim() ? 'not-allowed' : 'pointer', opacity: isLoading || !apiKey.trim() || !userId.trim() ? 0.5 : 1 }}
              >
                {isLoading ? 'Starting\u2026' : 'Start on This Device'}
              </button>
            </div>
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
          </div>
        </>
      )}
    </div>
  );
};
