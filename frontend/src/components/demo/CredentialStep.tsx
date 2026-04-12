import React, { useState, useRef } from 'react';
import { C } from '../../theme';
import { IdentityCard } from '../credential/IdentityCard';
import { downloadCardPng, downloadCardPdf } from '../credential/cardExport';

interface CredentialStepProps {
  verificationId: string;
  onStartNew: () => void;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo credential generation — runs entirely client-side.
// No backend API is called, no credential is persisted, and no real
// Ed25519 signing occurs. This exists purely to show what a W3C JWT-VC
// looks like. In production, use POST /api/v2/verify/:id/credential instead.
// ─────────────────────────────────────────────────────────────────────────────
function base64UrlEncode(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function buildDemoCredential(verificationId: string): { jwt: string; jti: string; expires_at: string } {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
  const iat = Math.floor(issuedAt.getTime() / 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const jti = `urn:uuid:${crypto.randomUUID()}`;
  // did:example: is the W3C-reserved DID method for documentation and demos.
  const subjectId = `did:example:demo-${crypto.randomUUID()}`;

  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid: 'did:web:idswyft.app#demo-key',
  };

  const payload = {
    iss: 'did:web:idswyft.app',
    sub: subjectId,
    nbf: iat,
    iat,
    exp,
    jti,
    vc: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://idswyft.app/contexts/identity/v1',
      ],
      type: ['VerifiableCredential', 'IdentityCredential'],
      issuer: 'did:web:idswyft.app',
      issuanceDate: issuedAt.toISOString(),
      credentialSubject: {
        id: subjectId,
        verified: true,
        verificationId,
        documentType: 'drivers_license',
        fullName: 'DEMO HOLDER',
        dateOfBirth: '1990-01-01',
        issuingCountry: 'USA',
        demo: true,
      },
    },
  };

  // Intentionally human-readable so anyone inspecting the token sees it's a demo.
  const fakeSignature = 'DEMO_SIGNATURE_NOT_VALID_FOR_REAL_VERIFICATION';

  return {
    jwt: `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.${fakeSignature}`,
    jti,
    expires_at: expiresAt.toISOString(),
  };
}

// Reuse JSON syntax highlighting from ResultsStep
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

function decodeJwtPart(part: string): any {
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

const cardStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12, textAlign: 'left',
};
const cardTitle: React.CSSProperties = {
  fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase',
};

export const CredentialStep: React.FC<CredentialStepProps> = ({
  verificationId,
  onStartNew,
  onBack,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ jwt: string; jti: string; expires_at: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [statusResult, setStatusResult] = useState<{ active: boolean; reason?: string } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; email_sent: boolean } | null>(null);

  // Demo-only: generate a mock JWT-VC client-side. No backend call is made.
  const fetchCredential = async () => {
    setLoading(true);
    setError(null);
    // Small simulated delay so the "BUILDING CREDENTIAL..." spinner is visible.
    await new Promise(resolve => setTimeout(resolve, 700));
    try {
      setCredential(buildDemoCredential(verificationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate demo credential');
    } finally {
      setLoading(false);
    }
  };

  // Demo-only: there is no real credential to look up, so just reflect
  // the current local state (active unless already revoked in this session).
  const checkStatus = async () => {
    if (!credential) return;
    setCheckingStatus(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setStatusResult(revoked ? { active: false, reason: 'revoked' } : { active: true });
    setCheckingStatus(false);
  };

  // Demo-only: flip local state; nothing is persisted server-side.
  const revokeCredential = async () => {
    if (!credential) return;
    setRevoking(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setRevoked(true);
    setStatusResult({ active: false, reason: 'revoked' });
    setRevoking(false);
  };

  const copyJwt = () => {
    if (!credential) return;
    navigator.clipboard.writeText(credential.jwt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Demo-only: no email is actually sent. Simulate a successful delivery.
  const sendCredentialEmail = async () => {
    setSending(true);
    setSendResult(null);
    setError(null);
    await new Promise(resolve => setTimeout(resolve, 500));
    setSendResult({ success: true, email_sent: true });
    setSending(false);
  };

  // Decode JWT parts
  const jwtParts = credential?.jwt.split('.') || [];
  const header = jwtParts[0] ? decodeJwtPart(jwtParts[0]) : null;
  const payload = jwtParts[1] ? decodeJwtPart(jwtParts[1]) : null;
  const vcClaims = payload?.vc?.credentialSubject;

  // Not yet fetched — show the request card
  if (!credential && !loading) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(34, 211, 238, 0.08)',
            border: '1px solid rgba(34, 211, 238, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Verifiable Credential
          </h2>
          <p style={{ color: C.muted, fontSize: 13, margin: '0 0 4px' }}>
            Preview a W3C Verifiable Credential (JWT-VC) for this verification.
          </p>
          <p style={{ color: C.dim, fontSize: 11, margin: 0 }}>
            Demo mode: the JWT is generated locally for illustration. In production, Idswyft signs it with Ed25519 via <code style={{ fontFamily: C.mono, color: C.cyan }}>POST /verify/:id/credential</code>.
          </p>
        </div>

        {/* Info card */}
        <div style={cardStyle}>
          <div style={cardTitle}>How it works</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { step: '1', label: 'Issue', desc: 'In production, Idswyft signs a JWT-VC containing the verified identity claims.' },
              { step: '2', label: 'Store', desc: 'Your app stores the JWT. The user can share it with other services.' },
              { step: '3', label: 'Verify', desc: 'Any relying party resolves the issuer DID and verifies the signature offline.' },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(34, 211, 238, 0.06)', border: '1px solid rgba(34, 211, 238, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: C.mono, fontSize: 10, color: C.cyan,
                }}>{item.step}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 12, color: C.red, fontFamily: C.mono,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={fetchCredential}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: C.cyan, color: C.bg,
            fontFamily: C.sans, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', marginBottom: 12,
          }}
        >
          Preview Demo Credential
        </button>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onBack} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Back to Results
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

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{
          width: 46, height: 46, border: `2px solid rgba(34,211,238,0.15)`,
          borderTopColor: C.cyan, borderRadius: '50%',
          animation: 'dSpin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.cyan, letterSpacing: '0.08em' }}>
          BUILDING CREDENTIAL...
        </div>
        <p style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>
          Generating demo JWT-VC
        </p>
      </div>
    );
  }

  // Credential issued — show full details
  return (
    <div style={{ padding: '8px 0' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: revoked ? 'rgba(248,113,113,0.08)' : C.greenDim,
          border: `1px solid ${revoked ? 'rgba(248,113,113,0.3)' : C.green}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 22,
          color: revoked ? C.red : C.green,
        }}>
          {revoked ? '\u2717' : '\u2713'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>
            {revoked ? 'Credential Revoked' : 'Credential Issued'}
          </h2>
          <span style={{
            fontSize: 9, fontFamily: C.mono, fontWeight: 700,
            padding: '2px 8px', borderRadius: 10, letterSpacing: '0.1em',
            background: 'rgba(251, 191, 36, 0.1)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.25)',
          }}>DEMO</span>
        </div>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {revoked
            ? 'This demo credential is marked revoked locally. Nothing was persisted.'
            : 'This JWT-VC was generated client-side for illustration only.'}
        </p>
      </div>

      {/* Identity Card visual */}
      {vcClaims && (
        <div style={{ marginBottom: 20 }}>
          <IdentityCard
            ref={cardRef}
            name={String(vcClaims.fullName || vcClaims.name || 'Unknown')}
            dateOfBirth={vcClaims.dateOfBirth}
            nationality={vcClaims.issuingCountry}
            documentType={vcClaims.documentType}
            verifiedAt={payload?.vc?.issuanceDate}
            issuer={payload?.iss}
            jti={credential!.jti}
            expiresAt={credential!.expires_at}
            status={revoked ? 'revoked' : 'valid'}
            isDemo={vcClaims.demo === true}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button
              onClick={() => cardRef.current && downloadCardPng(cardRef.current)}
              style={{
                background: C.cyanDim, border: `1px solid ${C.cyanBorder}`,
                color: C.cyan, borderRadius: 8, padding: '8px 18px',
                fontFamily: C.mono, fontWeight: 600, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PNG
            </button>
            <button
              onClick={() => cardRef.current && downloadCardPdf(cardRef.current)}
              style={{
                background: C.cyanDim, border: `1px solid ${C.cyanBorder}`,
                color: C.cyan, borderRadius: 8, padding: '8px 18px',
                fontFamily: C.mono, fontWeight: 600, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              PDF
            </button>
          </div>
        </div>
      )}

      {/* Claims card */}
      {vcClaims && (
        <div style={cardStyle}>
          <div style={cardTitle}>Credential Claims</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(vcClaims).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 11 }}>{key}</span>
                <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 12 }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credential metadata */}
      <div style={cardStyle}>
        <div style={cardTitle}>Credential Info</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>JTI</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 10 }}>{credential!.jti}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Algorithm</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{header?.alg || 'EdDSA'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Issuer DID</span>
            <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 10 }}>{payload?.iss || 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Type</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{payload?.vc?.type?.join(', ') || 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Expires</span>
            <span style={{ color: C.text }}>{credential!.expires_at ? new Date(credential!.expires_at).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* JWT Header */}
      <div style={cardStyle}>
        <div style={cardTitle}>JWT Header</div>
        <pre style={{
          background: C.codeBg, color: C.code, padding: 12, borderRadius: 6,
          fontSize: 10, fontFamily: C.mono, overflowX: 'auto', lineHeight: 1.5, margin: 0,
        }}>
          {highlightJson(header)}
        </pre>
      </div>

      {/* JWT Payload */}
      <div style={cardStyle}>
        <div style={cardTitle}>JWT Payload (decoded)</div>
        <pre style={{
          background: C.codeBg, color: C.code, padding: 12, borderRadius: 6,
          fontSize: 10, fontFamily: C.mono, overflowX: 'auto', maxHeight: 300, overflowY: 'auto', lineHeight: 1.5, margin: 0,
        }}>
          {highlightJson(payload)}
        </pre>
      </div>

      {/* Raw JWT */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={cardTitle as any}>Raw JWT</div>
          <button onClick={copyJwt} style={{
            background: 'rgba(34,211,238,0.06)', border: `1px solid rgba(34,211,238,0.15)`,
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            fontFamily: C.mono, fontSize: 10, color: C.cyan,
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
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

      {/* Status check */}
      {statusResult && (
        <div style={{
          ...cardStyle,
          borderColor: statusResult.active ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
        }}>
          <div style={cardTitle}>Credential Status</div>
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

      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          fontSize: 12, color: C.red, fontFamily: C.mono,
        }}>
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          onClick={checkStatus}
          disabled={checkingStatus}
          style={{
            background: 'rgba(34,211,238,0.06)', border: `1px solid rgba(34,211,238,0.15)`,
            color: C.cyan, borderRadius: 8, padding: '10px 20px',
            fontWeight: 600, fontSize: 13, cursor: checkingStatus ? 'not-allowed' : 'pointer',
            opacity: checkingStatus ? 0.6 : 1,
          }}
        >
          {checkingStatus ? 'Checking...' : 'Check Status'}
        </button>
        {!revoked && (
          <button
            onClick={revokeCredential}
            disabled={revoking}
            style={{
              background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
              color: C.red, borderRadius: 8, padding: '10px 20px',
              fontWeight: 600, fontSize: 13, cursor: revoking ? 'not-allowed' : 'pointer',
              opacity: revoking ? 0.6 : 1,
            }}
          >
            {revoking ? 'Revoking...' : 'Revoke Credential'}
          </button>
        )}
        <button
          onClick={() => { setEmailOpen(!emailOpen); setSendResult(null); }}
          style={{
            background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)',
            color: '#a855f7', borderRadius: 8, padding: '10px 20px',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 4l-10 8L2 4" />
          </svg>
          Send via Email
        </button>
      </div>

      {/* Send via Email inline form */}
      {emailOpen && (
        <div style={{ ...cardStyle, borderColor: 'rgba(168,85,247,0.2)' }}>
          <div style={cardTitle}>Send Credential via Email (demo)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="email"
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              placeholder="recipient@example.com"
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 6,
                background: C.codeBg, border: `1px solid ${C.border}`,
                color: C.text, fontFamily: C.mono, fontSize: 12,
                outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && sendEmail.trim()) sendCredentialEmail(); }}
            />
            <button
              onClick={sendCredentialEmail}
              disabled={sending || !sendEmail.trim()}
              style={{
                background: C.cyan, color: C.bg, border: 'none',
                borderRadius: 6, padding: '8px 16px', fontWeight: 700,
                fontSize: 12, cursor: sending || !sendEmail.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !sendEmail.trim() ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
          {sendResult?.success && (
            <div style={{
              marginTop: 8, fontSize: 12, color: C.green, fontFamily: C.mono,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{'\u2713'}</span> Send simulated to {sendEmail} — no email was actually delivered
            </div>
          )}
          {sendResult && !sendResult.success && (
            <div style={{
              marginTop: 8, fontSize: 12, color: C.red, fontFamily: C.mono,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{'\u2717'}</span> Failed to send — check the email address and try again
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          Back to Results
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
