import React, { useState, useEffect } from 'react';
import { C } from '../../theme';
import { verifyCredential, type VerificationResult } from '../../utils/vcVerifier';
import { API_BASE_URL } from '../../config/api';

interface VerifyCredentialStepProps {
  initialJwt?: string;
  onStartNew: () => void;
  onBack: () => void;
}

// JSON syntax highlighting (shared pattern with CredentialStep/ResultsStep)
const jsonTokenColors = {
  key: C.cyan,
  string: C.green,
  number: C.amber,
  boolean: C.purple,
  null: C.red,
  brace: C.dim,
  comma: 'rgba(255,255,255,0.25)',
} as const;

function highlightJson(obj: unknown): React.ReactNode[] {
  const raw = JSON.stringify(obj, null, 2);
  if (!raw) return [];
  const nodes: React.ReactNode[] = [];
  const tokenRe = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false)|(null)|([{}\[\]])|([,:])|\n( *)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = tokenRe.exec(raw)) !== null) {
    if (match.index > lastIndex) nodes.push(raw.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    if (match[1]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.key }}>{match[1]}</span>);
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.comma }}>: </span>);
    } else if (match[2]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.string }}>{match[2]}</span>);
    } else if (match[3]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.number }}>{match[3]}</span>);
    } else if (match[4]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.boolean }}>{match[4]}</span>);
    } else if (match[5]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.null }}>{match[5]}</span>);
    } else if (match[6]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.brace }}>{match[6]}</span>);
    } else if (match[7]) {
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.comma }}>{match[7]}</span>);
    } else if (match[8] !== undefined) {
      nodes.push('\n' + match[8]);
    }
  }
  if (lastIndex < raw.length) nodes.push(raw.slice(lastIndex));
  return nodes;
}

const cardStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12, textAlign: 'left',
};
const cardTitle: React.CSSProperties = {
  fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase',
};

export const VerifyCredentialStep: React.FC<VerifyCredentialStepProps> = ({
  initialJwt,
  onStartNew,
  onBack,
}) => {
  const [jwtInput, setJwtInput] = useState(initialJwt || '');
  const [verifying, setVerifying] = useState(false);
  const [verifyStage, setVerifyStage] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [statusResult, setStatusResult] = useState<{ active: boolean; reason?: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Auto-verify if navigating from CredentialStep with a JWT
  useEffect(() => {
    if (initialJwt) {
      handleVerify(initialJwt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async (jwtOverride?: string) => {
    const jwt = (jwtOverride || jwtInput).trim();
    if (!jwt) return;

    setVerifying(true);
    setResult(null);
    setStatusResult(null);
    setVerifyStage('DECODING JWT...');

    const verificationResult = await verifyCredential(jwt, setVerifyStage);

    setResult(verificationResult);
    setVerifying(false);
    setVerifyStage('');
  };

  const handleCheckRevocation = async () => {
    if (!result?.payload) return;
    const jti = (result.payload.jti as string) || (result.payload.vc as any)?.id;
    if (!jti) return;

    // Strip urn:uuid: prefix if present
    const cleanJti = jti.replace(/^urn:uuid:/, '');

    setCheckingStatus(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/credentials/${encodeURIComponent(cleanJti)}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatusResult(data);
    } catch {
      setStatusResult({ active: false, reason: 'error' });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setStatusResult(null);
    setJwtInput('');
  };

  const jti = result?.payload
    ? ((result.payload.jti as string) || (result.payload.vc as any)?.id || null)
    : null;

  // ── Input state ──
  if (!result && !verifying) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(96,165,250,0.08)',
            border: '1px solid rgba(96,165,250,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.5">
              <path d="M9 12l2 2 4-4" />
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Verify Credential
          </h2>
          <p style={{ color: C.muted, fontSize: 13, margin: '0 0 4px' }}>
            Paste any Idswyft JWT-VC to verify it. No API key needed.
          </p>
          <p style={{ color: C.dim, fontSize: 11, margin: 0 }}>
            Signature verification happens entirely in your browser using Ed25519 cryptography.
          </p>
        </div>

        {/* How it works */}
        <div style={cardStyle}>
          <div style={cardTitle}>How verification works</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { step: '1', label: 'Resolve DID', desc: 'The issuer\'s DID (e.g. did:web:api.idswyft.app) is resolved to its public key via HTTPS.' },
              { step: '2', label: 'Verify Signature', desc: 'The JWT signature is verified against the issuer\'s Ed25519 public key — entirely client-side.' },
              { step: '3', label: 'Check Claims', desc: 'Expiration, credential type, and identity claims are decoded and displayed.' },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: C.mono, fontSize: 10, color: C.blue,
                }}>{item.step}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* JWT input */}
        <textarea
          value={jwtInput}
          onChange={e => setJwtInput(e.target.value)}
          placeholder="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
          spellCheck={false}
          style={{
            width: '100%', minHeight: 120, padding: 14, borderRadius: 8,
            background: C.codeBg, color: C.code, border: `1px solid ${C.border}`,
            fontFamily: C.mono, fontSize: 11, lineHeight: 1.6,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(96,165,250,0.4)'; }}
          onBlur={e => { e.target.style.borderColor = C.border; }}
        />

        <button
          onClick={() => handleVerify()}
          disabled={!jwtInput.trim()}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: !jwtInput.trim() ? C.dim : C.blue, color: !jwtInput.trim() ? C.muted : '#fff',
            fontFamily: C.sans, fontSize: 14, fontWeight: 700,
            cursor: !jwtInput.trim() ? 'not-allowed' : 'pointer',
            marginTop: 12, marginBottom: 12,
          }}
        >
          Verify Credential
        </button>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onBack} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Back
          </button>
          <button onClick={onStartNew} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Start New Demo
          </button>
        </div>
      </div>
    );
  }

  // ── Verifying state ──
  if (verifying) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{
          width: 46, height: 46, border: '2px solid rgba(96,165,250,0.15)',
          borderTopColor: C.blue, borderRadius: '50%',
          animation: 'dSpin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.blue, letterSpacing: '0.08em' }}>
          {verifyStage}
        </div>
        <p style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>
          Client-side Ed25519 verification
        </p>
      </div>
    );
  }

  // ── Results state ──
  const jwtParts = jwtInput.trim().split('.');

  // Signature-only validity: valid OR expired-but-sig-ok both mean the crypto check passed
  const signatureOk = result!.valid || (result!.expired && result!.didResolved && !result!.error?.includes('signature'));
  // Determine header color: green = valid, amber = expired (sig ok), red = invalid
  const isExpiredButSigOk = !result!.valid && result!.expired && result!.didResolved;
  const headerColor = result!.valid ? C.green : isExpiredButSigOk ? C.amber : C.red;
  const headerBg = result!.valid ? C.greenDim : isExpiredButSigOk ? C.amberDim : C.redDim;
  const headerIcon = result!.valid ? '\u2713' : isExpiredButSigOk ? '\u26A0' : '\u2717';
  const headerLabel = result!.valid
    ? 'Valid Credential'
    : isExpiredButSigOk
      ? 'Expired Credential'
      : 'Invalid Credential';
  const headerDesc = result!.valid
    ? 'The Ed25519 signature was verified against the issuer\'s public key.'
    : isExpiredButSigOk
      ? 'Signature is valid but the credential has expired.'
      : result!.error || 'Signature verification failed.';

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Signature badge header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: headerBg,
          border: `1px solid ${headerColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 22,
          color: headerColor,
        }}>
          {headerIcon}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          {headerLabel}
        </h2>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {headerDesc}
        </p>
      </div>

      {/* Verification details card */}
      <div style={cardStyle}>
        <div style={cardTitle}>Verification Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Signature */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.muted }}>Signature</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: signatureOk ? C.greenDim : C.redDim,
              color: signatureOk ? C.green : C.red,
              border: `1px solid ${signatureOk ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
            }}>
              {signatureOk ? '\u2713 Valid' : '\u2717 Invalid'}
            </span>
          </div>
          {/* DID Resolution */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.muted }}>DID Resolution</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: result!.didResolved ? C.greenDim : C.redDim,
              color: result!.didResolved ? C.green : C.red,
              border: `1px solid ${result!.didResolved ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
            }}>
              {result!.didResolved ? '\u2713 Resolved' : '\u2717 Failed'}
            </span>
          </div>
          {/* Issuer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.muted }}>Issuer</span>
            <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 10 }}>{result!.issuer || 'N/A'}</span>
          </div>
          {/* Algorithm */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.muted }}>Algorithm</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>
              {(result!.header?.alg as string) || 'N/A'}
            </span>
          </div>
          {/* Expiration */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.muted }}>Expiration</span>
            {result!.expiresAt ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                background: result!.expired ? C.redDim : C.greenDim,
                color: result!.expired ? C.red : C.green,
                border: `1px solid ${result!.expired ? 'rgba(248,113,113,0.25)' : 'rgba(52,211,153,0.25)'}`,
              }}>
                {result!.expired ? '\u2717 Expired' : '\u2713 Valid'} — {result!.expiresAt.toLocaleDateString()}
              </span>
            ) : (
              <span style={{ color: C.dim, fontSize: 11 }}>No expiration</span>
            )}
          </div>
        </div>
      </div>

      {/* Claims card */}
      {result!.claims && Object.keys(result!.claims).length > 0 && (
        <div style={cardStyle}>
          <div style={cardTitle}>Credential Claims</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(result!.claims).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 11 }}>{key}</span>
                <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 12 }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revocation status */}
      {statusResult && (
        <div style={{
          ...cardStyle,
          borderColor: statusResult.active ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
        }}>
          <div style={cardTitle}>Revocation Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: statusResult.active ? C.greenDim : C.redDim,
              color: statusResult.active ? C.green : C.red,
              border: `1px solid ${statusResult.active ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
            }}>
              {statusResult.active ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
            {statusResult.reason && !statusResult.active && (
              <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{statusResult.reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Decoded JWT header */}
      {result!.header && (
        <div style={cardStyle}>
          <div style={cardTitle}>JWT Header</div>
          <pre style={{
            background: C.codeBg, color: C.code, padding: 12, borderRadius: 6,
            fontSize: 10, fontFamily: C.mono, overflowX: 'auto', lineHeight: 1.5, margin: 0,
          }}>
            {highlightJson(result!.header)}
          </pre>
        </div>
      )}

      {/* Decoded JWT payload */}
      {result!.payload && (
        <div style={cardStyle}>
          <div style={cardTitle}>JWT Payload (decoded)</div>
          <pre style={{
            background: C.codeBg, color: C.code, padding: 12, borderRadius: 6,
            fontSize: 10, fontFamily: C.mono, overflowX: 'auto',
            maxHeight: 300, overflowY: 'auto', lineHeight: 1.5, margin: 0,
          }}>
            {highlightJson(result!.payload)}
          </pre>
        </div>
      )}

      {/* Raw JWT segments */}
      <div style={cardStyle}>
        <div style={cardTitle}>Raw JWT</div>
        <div style={{
          background: C.codeBg, padding: 12, borderRadius: 6,
          fontSize: 9, fontFamily: C.mono, color: C.dim,
          wordBreak: 'break-all', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto',
        }}>
          <span style={{ color: C.cyan }}>{jwtParts[0]}</span>
          <span style={{ color: C.dim }}>.</span>
          <span style={{ color: C.green }}>{jwtParts[1]}</span>
          <span style={{ color: C.dim }}>.</span>
          <span style={{ color: C.amber }}>{jwtParts[2]}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {jti && !statusResult && (
          <button
            onClick={handleCheckRevocation}
            disabled={checkingStatus}
            style={{
              background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)',
              color: C.blue, borderRadius: 8, padding: '10px 20px',
              fontWeight: 600, fontSize: 13, cursor: checkingStatus ? 'not-allowed' : 'pointer',
              opacity: checkingStatus ? 0.6 : 1,
            }}
          >
            {checkingStatus ? 'Checking...' : 'Check Revocation'}
          </button>
        )}
        <button
          onClick={handleReset}
          style={{
            background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)',
            color: C.cyan, borderRadius: 8, padding: '10px 20px',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          Verify Another
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          Back
        </button>
        <button onClick={onStartNew} style={{
          background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          Start New Demo
        </button>
      </div>
    </div>
  );
};
