import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { C } from '../../theme';
import {
  guillocheDataUri,
  crosshatchDataUri,
  microtextDataUri,
  IDSWYFT_LOGO_BASE64,
} from './cardPatterns';

export interface IdentityCardProps {
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  documentType?: string;
  verifiedAt?: string;
  faceMatchScore?: number;
  issuer?: string;
  jti?: string;
  expiresAt?: string;
  status: 'valid' | 'expired' | 'invalid' | 'revoked';
  isDemo?: boolean;
}

// ── Card dimensions (ISO ID-1 ratio 1.586:1) ────────────────────────────────
const CARD_W = 440;
const CARD_H = 277;

// ── Status seal config ───────────────────────────────────────────────────────
const sealConfig = {
  valid:   { bg: 'rgba(52,211,153,0.15)', stroke: C.green, icon: '\u2713' },
  expired: { bg: 'rgba(251,191,36,0.15)', stroke: C.amber, icon: '\u26A0' },
  invalid: { bg: 'rgba(248,113,113,0.15)', stroke: C.red,   icon: '\u2717' },
  revoked: { bg: 'rgba(248,113,113,0.15)', stroke: C.red,   icon: '\u2717' },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso?: string): string {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function formatDocType(raw?: string): string {
  if (!raw) return '\u2014';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function truncateJti(jti?: string): string {
  if (!jti) return '\u2014';
  const clean = jti.replace(/^urn:uuid:/, '');
  return clean.length > 16 ? `${clean.slice(0, 8)}...${clean.slice(-4)}` : clean;
}

// ── Shared inline styles ─────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontFamily: C.mono, fontSize: 8, fontWeight: 600,
  color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase',
  marginBottom: 2,
};
const valueStyle: React.CSSProperties = {
  fontFamily: C.mono, fontSize: 11, color: '#fff', lineHeight: 1.3,
};

// ── Component ────────────────────────────────────────────────────────────────
export const IdentityCard = forwardRef<HTMLDivElement, IdentityCardProps>(
  function IdentityCard(props, ref) {
    const {
      name, dateOfBirth, nationality, documentType,
      verifiedAt, faceMatchScore, issuer, jti, expiresAt,
      status, isDemo,
    } = props;

    const seal = sealConfig[status];

    // ── Responsive scaling ─────────────────────────────────────────────────
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const measure = () => {
        const w = el.parentElement?.clientWidth ?? CARD_W;
        setScale(w < CARD_W ? w / CARD_W : 1);
      };
      measure();
      const ro = new ResizeObserver(measure);
      if (el.parentElement) ro.observe(el.parentElement);
      return () => ro.disconnect();
    }, []);

    return (
      <div
        ref={wrapperRef}
        style={{
          width: CARD_W * scale,
          height: CARD_H * scale,
          overflow: 'hidden',
        }}
      >
        <div
          ref={ref}
          style={{
            width: CARD_W,
            height: CARD_H,
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            fontFamily: C.sans,
          }}
        >
          {/* Layer 1: solid navy fill */}
          <div style={{
            position: 'absolute', inset: 0,
            background: '#0a1628',
          }} />

          {/* Layer 2: guilloche pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url("${guillocheDataUri()}")`,
            backgroundRepeat: 'repeat',
            opacity: 0.06,
          }} />

          {/* Layer 3: crosshatch overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url("${crosshatchDataUri()}")`,
            backgroundRepeat: 'repeat',
            opacity: 0.04,
          }} />

          {/* Layer 4: microtext strips — top & bottom */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 12,
            backgroundImage: `url("${microtextDataUri()}")`,
            backgroundRepeat: 'repeat-x',
            opacity: 0.08,
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 12,
            backgroundImage: `url("${microtextDataUri()}")`,
            backgroundRepeat: 'repeat-x',
            opacity: 0.08,
          }} />

          {/* Layer 5: diagonal watermark */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <div style={{
              fontFamily: C.sans, fontSize: 64, fontWeight: 700,
              color: 'rgba(255,255,255,0.04)',
              transform: 'rotate(-25deg)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              letterSpacing: '0.1em',
            }}>
              idswyft
            </div>
          </div>

          {/* Layer 6: content */}
          <div style={{
            position: 'relative', zIndex: 1,
            padding: '16px 22px 14px',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4,
            }}>
              {/* Logo + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={IDSWYFT_LOGO_BASE64}
                  alt=""
                  style={{ height: 18, display: 'block' }}
                />
              </div>

              {/* Center title */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  fontFamily: C.mono, fontSize: 9, fontWeight: 600,
                  color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>
                  Identity Credential
                </div>
              </div>

              {/* Seal */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: seal.bg,
                border: `1.5px solid ${seal.stroke}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: seal.stroke, flexShrink: 0,
              }}>
                {seal.icon}
              </div>
            </div>

            {/* Subtitle */}
            <div style={{
              textAlign: 'center', marginBottom: 14,
              fontFamily: C.mono, fontSize: 7, color: C.dim,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              W3C Verifiable Credential
            </div>

            {/* Name */}
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Name</div>
              <div style={{
                fontFamily: C.sans, fontSize: 16, fontWeight: 700,
                color: '#fff', lineHeight: 1.2,
              }}>
                {name || 'Unknown'}
              </div>
            </div>

            {/* 3-col row */}
            <div style={{
              display: 'flex', gap: 16, marginBottom: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Date of Birth</div>
                <div style={valueStyle}>{formatDate(dateOfBirth)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Nationality</div>
                <div style={valueStyle}>{nationality || '\u2014'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Document Type</div>
                <div style={valueStyle}>{formatDocType(documentType)}</div>
              </div>
            </div>

            {/* 2-col row */}
            <div style={{
              display: 'flex', gap: 16, marginBottom: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Verified At</div>
                <div style={valueStyle}>{formatDate(verifiedAt)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Face Match</div>
                <div style={valueStyle}>
                  {faceMatchScore != null ? `${Math.round(faceMatchScore * 100)}%` : '\u2014'}
                </div>
              </div>
            </div>

            {/* Issuer */}
            <div style={{ marginBottom: 8 }}>
              <div style={labelStyle}>Issuer</div>
              <div style={{
                fontFamily: C.mono, fontSize: 9, color: C.cyan, lineHeight: 1.3,
              }}>
                {issuer || '\u2014'}
              </div>
            </div>

            {/* Footer: ref + powered by */}
            <div style={{
              marginTop: 'auto',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            }}>
              <div style={{
                fontFamily: C.mono, fontSize: 8, color: C.dim,
              }}>
                REF: {truncateJti(jti)}
                {expiresAt && (
                  <span style={{ marginLeft: 12 }}>
                    EXP: {formatDate(expiresAt)}
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: C.mono, fontSize: 7, color: C.dim,
                letterSpacing: '0.04em',
              }}>
                Powered by Idswyft
              </div>
            </div>
          </div>

          {/* Layer 7: DEMO overlay */}
          {isDemo && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', pointerEvents: 'none',
            }}>
              <div style={{
                fontFamily: C.sans, fontSize: 72, fontWeight: 900,
                color: 'rgba(248,113,113,0.18)',
                transform: 'rotate(-25deg)',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                letterSpacing: '0.15em',
              }}>
                DEMO
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
