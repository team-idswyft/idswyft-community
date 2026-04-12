import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { C } from '../theme';
import { verifyCredential, type VerificationResult } from '../utils/vcVerifier';
import { API_BASE_URL } from '../config/api';
import { IdentityCard } from '../components/credential/IdentityCard';
import { downloadCardPng, downloadCardPdf } from '../components/credential/cardExport';

// ─── JSON syntax highlighting ────────────────────────────────
const jsonColors = {
  key: C.cyan, string: C.green, number: C.amber,
  boolean: C.purple, null: C.red, brace: C.dim, comma: 'rgba(255,255,255,0.25)',
} as const;

function highlightJson(obj: unknown): React.ReactNode[] {
  const raw = JSON.stringify(obj, null, 2);
  if (!raw) return [];
  const nodes: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false)|(null)|([{}\[\]])|([,:])|\n( *)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) nodes.push(raw.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    if (match[1]) { nodes.push(<span key={i++} style={{ color: jsonColors.key }}>{match[1]}</span>); nodes.push(<span key={i++} style={{ color: jsonColors.comma }}>: </span>); }
    else if (match[2]) nodes.push(<span key={i++} style={{ color: jsonColors.string }}>{match[2]}</span>);
    else if (match[3]) nodes.push(<span key={i++} style={{ color: jsonColors.number }}>{match[3]}</span>);
    else if (match[4]) nodes.push(<span key={i++} style={{ color: jsonColors.boolean }}>{match[4]}</span>);
    else if (match[5]) nodes.push(<span key={i++} style={{ color: jsonColors.null }}>{match[5]}</span>);
    else if (match[6]) nodes.push(<span key={i++} style={{ color: jsonColors.brace }}>{match[6]}</span>);
    else if (match[7]) nodes.push(<span key={i++} style={{ color: jsonColors.comma }}>{match[7]}</span>);
    else if (match[8] !== undefined) nodes.push('\n' + match[8]);
  }
  if (lastIndex < raw.length) nodes.push(raw.slice(lastIndex));
  return nodes;
}

// ─── Shared styles ───────────────────────────────────────────
const card: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: 20, marginBottom: 16, textAlign: 'left',
};
const cardLabel: React.CSSProperties = {
  fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.muted,
  marginBottom: 12, letterSpacing: '0.04em', textTransform: 'uppercase',
};

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: ok ? C.greenDim : C.redDim,
      color: ok ? C.green : C.red,
      border: `1px solid ${ok ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
    }}>
      {ok ? `\u2713 ${yes}` : `\u2717 ${no}`}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: C.muted }}>{label}</span>
      {children}
    </div>
  );
}

// ─── Page component ──────────────────────────────────────────
export function VerifyCredentialPage() {
  const [searchParams] = useSearchParams();
  const [jwtInput, setJwtInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [statusResult, setStatusResult] = useState<{ active: boolean; reason?: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-verify from URL param
  useEffect(() => {
    const jwt = searchParams.get('jwt');
    if (jwt) {
      setJwtInput(jwt);
      handleVerify(jwt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async (jwtOverride?: string) => {
    const jwt = (jwtOverride || jwtInput).trim();
    if (!jwt) return;
    setVerifying(true);
    setResult(null);
    setStatusResult(null);
    setStage('DECODING JWT...');
    const res = await verifyCredential(jwt, setStage);
    setResult(res);
    setVerifying(false);
    setStage('');
  };

  const handleCheckRevocation = async () => {
    if (!result?.payload) return;
    const jti = (result.payload.jti as string) || (result.payload.vc as any)?.id;
    if (!jti) return;
    const cleanJti = jti.replace(/^urn:uuid:/, '');
    setCheckingStatus(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/credentials/${encodeURIComponent(cleanJti)}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusResult(await res.json());
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

  // Determine result visual state
  const signatureOk = result
    ? result.valid || (result.expired && result.didResolved && !result.error?.includes('signature'))
    : false;
  const isExpiredButSigOk = result
    ? !result.valid && result.expired && result.didResolved
    : false;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.sans, color: C.text }}>
      {/* Spin animation */}
      <style>{`@keyframes vcSpin { to { transform: rotate(360deg) } }`}</style>

      {/* Hero section */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px 60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: C.cyanDim, border: `1px solid ${C.cyanBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Verify a Credential
          </h1>
          <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
            Paste any Idswyft JWT-VC to verify its authenticity. Signature verification happens entirely in your browser — no API key needed.
          </p>
        </div>

        {/* ── Verifying spinner ── */}
        {verifying && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48,
              border: `2px solid ${C.cyanDim}`, borderTopColor: C.cyan,
              borderRadius: '50%', animation: 'vcSpin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.cyan, letterSpacing: '0.08em' }}>
              {stage}
            </div>
            <p style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>
              Client-side Ed25519 verification
            </p>
          </div>
        )}

        {/* ── Input state ── */}
        {!result && !verifying && (
          <>
            {/* How it works */}
            <div style={card}>
              <div style={cardLabel}>How it works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { n: '1', title: 'Resolve DID', desc: 'The issuer\'s DID (e.g. did:web:api.idswyft.app) is resolved to fetch their public key via HTTPS.' },
                  { n: '2', title: 'Verify Signature', desc: 'The JWT signature is verified against the issuer\'s Ed25519 public key — entirely in your browser.' },
                  { n: '3', title: 'Check Claims', desc: 'Expiration, credential type, and identity claims are decoded and displayed.' },
                ].map(s => (
                  <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      background: C.cyanDim, border: `1px solid rgba(34,211,238,0.12)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: C.mono, fontSize: 11, color: C.cyan,
                    }}>{s.n}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <textarea
              value={jwtInput}
              onChange={e => setJwtInput(e.target.value)}
              placeholder="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
              spellCheck={false}
              style={{
                width: '100%', minHeight: 140, padding: 16, borderRadius: 10,
                background: C.codeBg, color: C.code, border: `1px solid ${C.border}`,
                fontFamily: C.mono, fontSize: 12, lineHeight: 1.6,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(34,211,238,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = C.border; }}
            />

            <button
              onClick={() => handleVerify()}
              disabled={!jwtInput.trim()}
              style={{
                width: '100%', padding: 14, borderRadius: 10, border: 'none',
                background: !jwtInput.trim() ? C.dim : C.cyan,
                color: !jwtInput.trim() ? C.muted : C.bg,
                fontFamily: C.sans, fontSize: 15, fontWeight: 700,
                cursor: !jwtInput.trim() ? 'not-allowed' : 'pointer',
                marginTop: 14, transition: 'opacity 0.15s',
              }}
            >
              Verify Credential
            </button>

            {/* Subtle link to demo */}
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.dim }}>
              Don't have a credential? <Link to="/demo" style={{ color: C.cyan, textDecoration: 'none' }}>Try the demo</Link> to issue one.
            </p>
          </>
        )}

        {/* ── Results state ── */}
        {result && !verifying && (() => {
          const headerColor = result.valid ? C.green : isExpiredButSigOk ? C.amber : C.red;
          const headerBg = result.valid ? C.greenDim : isExpiredButSigOk ? C.amberDim : C.redDim;
          const headerIcon = result.valid ? '\u2713' : isExpiredButSigOk ? '\u26A0' : '\u2717';
          const headerLabel = result.valid
            ? 'Valid Credential'
            : isExpiredButSigOk ? 'Expired Credential' : 'Invalid Credential';
          const headerDesc = result.valid
            ? 'The Ed25519 signature was verified against the issuer\'s public key.'
            : isExpiredButSigOk
              ? 'Signature is valid but the credential has expired.'
              : result.error || 'Signature verification failed.';

          const jwtParts = jwtInput.trim().split('.');

          return (
            <>
              {/* Result header badge */}
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: '50%',
                  background: headerBg, border: `1px solid ${headerColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px', fontSize: 24, color: headerColor,
                }}>
                  {headerIcon}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  {headerLabel}
                </h2>
                <p style={{ color: C.muted, fontSize: 13, margin: 0, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                  {headerDesc}
                </p>
              </div>

              {/* Identity Card visual — show whenever decoded claims exist */}
              {result.claims && (() => {
                const claims = result.claims as Record<string, unknown>;
                const vc = result.payload?.vc as Record<string, unknown> | undefined;
                const cardStatus: 'valid' | 'expired' | 'invalid' | 'revoked' =
                  statusResult && !statusResult.active ? 'revoked'
                    : result.valid ? 'valid'
                    : isExpiredButSigOk ? 'expired'
                    : 'invalid';
                return (
                  <div style={{ marginBottom: 24 }}>
                    <IdentityCard
                      ref={cardRef}
                      name={String(claims.name || claims.fullName || 'Unknown')}
                      dateOfBirth={claims.dateOfBirth as string | undefined}
                      nationality={(claims.nationality || claims.issuingCountry) as string | undefined}
                      documentType={claims.documentType as string | undefined}
                      verifiedAt={(claims.verifiedAt || vc?.issuanceDate) as string | undefined}
                      faceMatchScore={typeof claims.faceMatchScore === 'number' ? claims.faceMatchScore : undefined}
                      issuer={result.issuer ?? undefined}
                      jti={jti ?? undefined}
                      expiresAt={result.expiresAt?.toISOString()}
                      status={cardStatus}
                      isDemo={claims.demo === true}
                      jwtRaw={jwtInput.trim()}
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
                );
              })()}

              {/* Verification details */}
              <div style={card}>
                <div style={cardLabel}>Verification Details</div>
                <Row label="Signature"><Badge ok={signatureOk} yes="Valid" no="Invalid" /></Row>
                <Row label="DID Resolution"><Badge ok={result.didResolved} yes="Resolved" no="Failed" /></Row>
                <Row label="Issuer">
                  <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 10 }}>{result.issuer || 'N/A'}</span>
                </Row>
                <Row label="Algorithm">
                  <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{(result.header?.alg as string) || 'N/A'}</span>
                </Row>
                <Row label="Expiration">
                  {result.expiresAt ? (
                    <Badge ok={!result.expired} yes={`Valid \u2014 ${result.expiresAt.toLocaleDateString()}`} no={`Expired \u2014 ${result.expiresAt.toLocaleDateString()}`} />
                  ) : (
                    <span style={{ color: C.dim, fontSize: 11 }}>No expiration</span>
                  )}
                </Row>
              </div>

              {/* Claims */}
              {result.claims && Object.keys(result.claims).length > 0 && (
                <div style={card}>
                  <div style={cardLabel}>Credential Claims</div>
                  {Object.entries(result.claims).map(([key, value]) => (
                    <Row key={key} label={key}>
                      <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 12 }}>{String(value)}</span>
                    </Row>
                  ))}
                </div>
              )}

              {/* Revocation status */}
              {statusResult && (
                <div style={{
                  ...card,
                  borderColor: statusResult.active ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
                }}>
                  <div style={cardLabel}>Revocation Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge ok={statusResult.active} yes="Active" no="Inactive" />
                    {statusResult.reason && !statusResult.active && (
                      <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{statusResult.reason}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Decoded header */}
              {result.header && (
                <div style={card}>
                  <div style={cardLabel}>JWT Header</div>
                  <pre style={{
                    background: C.codeBg, color: C.code, padding: 14, borderRadius: 8,
                    fontSize: 11, fontFamily: C.mono, overflowX: 'auto', lineHeight: 1.5, margin: 0,
                  }}>
                    {highlightJson(result.header)}
                  </pre>
                </div>
              )}

              {/* Decoded payload */}
              {result.payload && (
                <div style={card}>
                  <div style={cardLabel}>JWT Payload</div>
                  <pre style={{
                    background: C.codeBg, color: C.code, padding: 14, borderRadius: 8,
                    fontSize: 11, fontFamily: C.mono, overflowX: 'auto',
                    maxHeight: 320, overflowY: 'auto', lineHeight: 1.5, margin: 0,
                  }}>
                    {highlightJson(result.payload)}
                  </pre>
                </div>
              )}

              {/* Raw JWT */}
              <div style={card}>
                <div style={cardLabel}>Raw JWT</div>
                <div style={{
                  background: C.codeBg, padding: 14, borderRadius: 8,
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
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                {jti && !statusResult && (
                  <button
                    onClick={handleCheckRevocation}
                    disabled={checkingStatus}
                    style={{
                      background: C.cyanDim, border: `1px solid ${C.cyanBorder}`,
                      color: C.cyan, borderRadius: 8, padding: '10px 22px',
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
                    color: C.cyan, borderRadius: 8, padding: '10px 22px',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Verify Another
                </button>
              </div>
            </>
          );
        })()}

        {/* Footer note */}
        <div style={{
          textAlign: 'center', marginTop: 48, paddingTop: 24,
          borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.dim,
        }}>
          Powered by <a href="https://idswyft.app" style={{ color: C.muted, textDecoration: 'none' }}>Idswyft</a> &middot;{' '}
          <a href="https://www.w3.org/TR/vc-data-model-2.0/" target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: 'none' }}>
            W3C Verifiable Credentials
          </a> &middot;{' '}
          <a href="https://w3c-ccg.github.io/did-method-web/" target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: 'none' }}>
            DID:web
          </a>
        </div>
      </div>
    </div>
  );
}
