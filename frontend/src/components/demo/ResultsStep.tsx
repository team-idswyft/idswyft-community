import React from 'react';
import { C } from '../../theme';
import type { VerificationRequest } from './types';

// ─── JSON syntax highlighting ───────────────────────────────────
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
  // Tokenize JSON string into colored spans
  const nodes: React.ReactNode[] = [];
  // Regex matches: strings (including keys), numbers, booleans, null, braces/brackets, commas/colons
  const tokenRe = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false)|(null)|([{}\[\]])|([,:])|\n( *)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = tokenRe.exec(raw)) !== null) {
    // Any unmatched text between tokens
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;
    if (match[1]) {
      // Key (quoted string followed by colon)
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.key }}>{match[1]}</span>);
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.comma }}>: </span>);
    } else if (match[2]) {
      // String value
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.string }}>{match[2]}</span>);
    } else if (match[3]) {
      // Number
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.number }}>{match[3]}</span>);
    } else if (match[4]) {
      // Boolean
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.boolean }}>{match[4]}</span>);
    } else if (match[5]) {
      // null
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.null }}>{match[5]}</span>);
    } else if (match[6]) {
      // Braces / brackets
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.brace }}>{match[6]}</span>);
    } else if (match[7]) {
      // Comma / colon
      nodes.push(<span key={i++} style={{ color: jsonTokenColors.comma }}>{match[7]}</span>);
    } else if (match[8] !== undefined) {
      // Newline + indentation
      nodes.push('\n' + match[8]);
    }
  }
  if (lastIndex < raw.length) nodes.push(raw.slice(lastIndex));
  return nodes;
}

interface ResultsStepProps {
  verificationRequest: VerificationRequest;
  isMobile: boolean;
  retryProcessing: boolean;
  onRetry: () => void;
  onStartNew: () => void;
  onGoToAddress: () => void;
  onGoToCredential?: () => void;
}

// Helper: score bar for 0-1 or 0-100 values
const ScoreBar = ({ value, max = 1, color, label, detail }: { value: number | null | undefined; max?: number; color: string; label: string; detail?: string }) => {
  if (value == null) return null;
  const pct = max === 1 ? Math.round(value * 100) : Math.round(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ color, fontWeight: 600, fontFamily: C.mono }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.6s ease' }} />
      </div>
      {detail && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{detail}</div>}
    </div>
  );
};

// Helper: pass/fail badge
const Badge = ({ passed, label }: { passed: boolean | null | undefined; label?: string }) => {
  if (passed == null) return <span style={{ color: C.dim, fontSize: 11 }}>N/A</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: passed ? C.greenDim : C.redDim,
      color: passed ? C.green : C.red,
      border: `1px solid ${passed ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
    }}>
      {passed ? '\u2713' : '\u2717'} {label ?? (passed ? 'Passed' : 'Failed')}
    </span>
  );
};

export const ResultsStep: React.FC<ResultsStepProps> = ({
  verificationRequest,
  isMobile,
  retryProcessing,
  onRetry,
  onStartNew,
  onGoToAddress,
  onGoToCredential,
}) => {
  // v2: final_result has user-facing status, status has internal machine state
  const status = verificationRequest?.final_result ?? verificationRequest?.status;
  const isVerified = status === 'verified';
  const isFailed = status === 'failed';
  const ageVerif = (verificationRequest as any)?.age_verification;
  const isAgeOnly = !!(ageVerif && !verificationRequest?.cross_validation_results);
  const statusTone = isVerified ? C.green : isFailed ? C.red : C.amber;
  const statusBg = isVerified ? C.greenDim : isFailed ? C.redDim : C.amberDim;
  const statusIcon = isVerified ? '\u2713' : isFailed ? '\u2717' : '\u26A0';
  const statusLabel = isAgeOnly
    ? (isVerified ? 'Age Verified' : 'Age Verification Failed')
    : (isVerified ? 'Verification Complete' : isFailed ? 'Verification Failed' : 'Under Review');

  const cv = verificationRequest?.cross_validation_results;
  const fm = verificationRequest?.face_match_results;
  const lv = verificationRequest?.liveness_results;
  const aml = verificationRequest?.aml_screening;
  const risk = verificationRequest?.risk_score;

  // Card style
  const cardStyle: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12, textAlign: 'left',
  };
  const cardTitle: React.CSSProperties = {
    fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  };

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Status Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: statusBg, border: `1px solid ${statusTone}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, color: statusTone }}>
          {statusIcon}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>{statusLabel}</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {isAgeOnly
            ? isVerified
              ? `Age requirement (${ageVerif?.age_threshold}+) met successfully.`
              : (verificationRequest?.rejection_detail || (verificationRequest as any)?.message || 'Age verification failed.')
            : <>
                {isVerified && 'All gates passed. Identity verified successfully.'}
                {isFailed && (verificationRequest?.rejection_detail || 'Verification failed. Please try again with clearer documents.')}
                {!isVerified && !isFailed && 'Your verification is under manual review.'}
              </>}
        </p>
        {verificationRequest?.rejection_reason && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 12px', borderRadius: 6, background: C.redDim, border: `1px solid rgba(248,113,113,0.2)` }}>
            <span style={{ color: C.red, fontSize: 11, fontFamily: C.mono, fontWeight: 600 }}>{verificationRequest.rejection_reason}</span>
          </div>
        )}
      </div>

      {/* Verification Overview Card */}
      <div style={cardStyle}>
        <div style={cardTitle}>Overview</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Verification ID</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{verificationRequest?.verification_id?.slice(0, 12)}{'\u2026'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Status</span>
            <span style={{ color: statusTone, fontWeight: 600, textTransform: 'capitalize' }}>{status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Pipeline Step</span>
            <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{verificationRequest?.current_step ?? 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Created</span>
            <span style={{ color: C.text }}>{verificationRequest?.created_at ? new Date(verificationRequest.created_at).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Age Verification Card */}
      {ageVerif && (
        <div style={cardStyle}>
          <div style={cardTitle}>Age Verification</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.muted }}>Age Check</span>
              <Badge passed={ageVerif.is_of_age} label={ageVerif.is_of_age ? 'Passed' : 'Failed'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.muted }}>Minimum Age</span>
              <span style={{ color: C.text, fontWeight: 600 }}>{ageVerif.age_threshold}+</span>
            </div>
          </div>
        </div>
      )}

      {/* Result Cards Grid */}
      {!isAgeOnly && (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Cross-Validation */}
        <div style={cardStyle}>
          <div style={cardTitle}>Cross-Validation</div>
          {cv ? (
            <>
              <ScoreBar value={cv.overall_score} color={cv.verdict === 'PASS' ? C.green : cv.verdict === 'REJECT' ? C.red : C.amber} label="Overall Score" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.muted }}>Verdict</span>
                <Badge passed={cv.verdict === 'PASS'} label={cv.verdict} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: C.muted }}>Doc Expired</span>
                <span style={{ color: cv.document_expired ? C.red : C.green, fontSize: 11, fontWeight: 600 }}>{cv.document_expired ? 'Yes' : 'No'}</span>
              </div>
              {cv.field_scores && Object.keys(cv.field_scores).length > 0 && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, fontFamily: C.mono }}>Field Scores</div>
                  {Object.entries(cv.field_scores).map(([field, data]) => (
                    <div key={field} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: C.dim }}>{field}</span>
                      <span style={{ color: data.passed ? C.green : C.red, fontFamily: C.mono }}>{Math.round(data.score * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: C.dim, fontSize: 12 }}>Not completed</span>
          )}
        </div>

        {/* Face Match */}
        <div style={cardStyle}>
          <div style={cardTitle}>Face Match</div>
          {fm ? (
            <>
              <ScoreBar value={fm.similarity_score} color={fm.passed ? C.green : C.red} label="Similarity" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.muted }}>Result</span>
                <Badge passed={fm.passed} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: C.muted }}>Threshold</span>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{fm.threshold_used != null ? `${Math.round(fm.threshold_used * 100)}%` : 'N/A'}</span>
              </div>
            </>
          ) : (
            <span style={{ color: C.dim, fontSize: 12 }}>Not completed</span>
          )}
        </div>

        {/* Liveness */}
        <div style={cardStyle}>
          <div style={cardTitle}>Liveness Detection</div>
          {lv ? (
            <>
              <ScoreBar value={lv.score} color={lv.passed ? C.green : C.red} label="Liveness Score" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: C.muted }}>Result</span>
                <Badge passed={lv.passed} />
              </div>
            </>
          ) : (
            <span style={{ color: C.dim, fontSize: 12 }}>Not completed</span>
          )}
        </div>

        {/* AML Screening */}
        <div style={cardStyle}>
          <div style={cardTitle}>AML / Sanctions</div>
          {aml ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.muted }}>Risk Level</span>
                <Badge passed={aml.risk_level === 'clear'} label={aml.risk_level?.replace('_', ' ')} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: C.muted }}>Matches</span>
                <span style={{ color: aml.match_found ? C.red : C.green, fontWeight: 600, fontSize: 11 }}>{aml.match_count ?? 0} found</span>
              </div>
              {aml.lists_checked && aml.lists_checked.length > 0 && (
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                  Lists: {aml.lists_checked.join(', ')}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: C.dim, fontSize: 12 }}>Not available</span>
          )}
        </div>
      </div>
      )}

      {/* Risk Score — full width */}
      {risk && (
        <div style={cardStyle}>
          <div style={cardTitle}>Risk Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: 18, fontWeight: 700, fontFamily: C.mono,
              background: risk.risk_level === 'low' ? C.greenDim : risk.risk_level === 'medium' ? C.amberDim : C.redDim,
              border: `2px solid ${risk.risk_level === 'low' ? C.green : risk.risk_level === 'medium' ? C.amber : C.red}`,
              color: risk.risk_level === 'low' ? C.green : risk.risk_level === 'medium' ? C.amber : C.red,
            }}>
              {risk.overall_score}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: C.text, fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{risk.risk_level} Risk</span>
                <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>0{'\u2013'}100 scale</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${risk.overall_score}%`, borderRadius: 3, background: risk.risk_level === 'low' ? C.green : risk.risk_level === 'medium' ? C.amber : C.red, transition: 'width 0.6s ease' }} />
              </div>
              {risk.risk_factors && risk.risk_factors.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {risk.risk_factors.map((f, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: C.dim, fontFamily: C.mono }}>
                      {f.factor}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Raw API Response — always shown */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={cardTitle}>Raw API Response</div>
        <p style={{ color: C.dim, fontSize: 11, margin: '0 0 8px' }}>
          This is the exact JSON your server receives from <code style={{ color: C.cyan, background: C.codeBg, padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>GET /api/v2/verify/:id/status</code>
        </p>
        <pre style={{ background: C.codeBg, color: C.code, padding: 12, borderRadius: 6, fontSize: 10, fontFamily: C.mono, overflowX: 'auto', maxHeight: 300, overflowY: 'auto', lineHeight: 1.5, margin: 0 }}>
          {highlightJson(verificationRequest)}
        </pre>
      </div>

      {/* Retry Button (failed only) */}
      {isFailed && verificationRequest?.retry_available === true && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button
            onClick={onRetry}
            disabled={retryProcessing}
            style={{
              background: retryProcessing ? 'rgba(34,211,238,0.4)' : C.cyan,
              color: '#080c14', border: 'none', borderRadius: 8,
              padding: '10px 32px', fontWeight: 600, fontSize: 14,
              cursor: retryProcessing ? 'not-allowed' : 'pointer',
              opacity: retryProcessing ? 0.6 : 1,
            }}
          >
            {retryProcessing ? 'Restarting\u2026' : 'Try Again'}
          </button>
        </div>
      )}
      {isFailed && verificationRequest?.retry_available === false && (
        <p style={{ color: C.red, fontSize: 11, textAlign: 'center', marginBottom: 16 }}>
          Maximum retry attempts reached.
        </p>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {isVerified && onGoToCredential && (
          <button
            onClick={onGoToCredential}
            style={{
              background: C.cyan, color: C.bg, border: 'none', borderRadius: 8,
              padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Get Verifiable Credential
          </button>
        )}
        <button
          onClick={onGoToAddress}
          style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          Try Address Verification
        </button>
        <button
          onClick={onStartNew}
          style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Start New Demo
        </button>
      </div>
      <p style={{ color: C.dim, fontSize: 11, marginTop: 12, textAlign: 'center' }}>
        Address verification and verifiable credentials are optional post-verification features.
      </p>
    </div>
  );
};
