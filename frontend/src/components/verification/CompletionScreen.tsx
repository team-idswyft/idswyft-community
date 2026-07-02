import React, { useMemo } from 'react'
import { C } from '../../theme'
import type { PageBuilderConfig, PageBranding } from './types'

// Shared shape for the terminal verification result. Deliberately narrower
// than the API's full response — only the fields this screen renders.
export interface CompletionResult {
  status?: string
  confidence_score?: number | null
  face_match_score?: number | null
  liveness_score?: number | null
}

export interface CompletionScreenProps {
  // Partial — the verification pages receive a partial page-builder config
  // from the API (or none at all in view-only/preview contexts).
  config: Partial<PageBuilderConfig> | null
  branding: PageBranding | null
  device: 'mobile' | 'desktop'
  result: CompletionResult | null
}

const CONFETTI_COLORS = [C.accent, C.green, '#fbbf24', '#f472b6', '#60a5fa']

// Lightweight, dependency-free confetti burst for the success case. No new
// package (there's no confetti lib in package.json) — just a handful of
// CSS-animated squares that fall and fade once. Cheap: 24 pieces, a single
// shared keyframe, one-shot (animation-fill-mode forwards, no looping).
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 1.6 + Math.random() * 0.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: Math.round((Math.random() - 0.5) * 60),
      })),
    []
  )

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{`
        @keyframes pb-confetti-fall {
          0%   { transform: translate(0, -20px) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--pb-drift, 0px), 340px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: 8,
            height: 8,
            background: p.color,
            animation: `pb-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            ...({ '--pb-drift': `${p.drift}px` } as React.CSSProperties),
          }}
        />
      ))}
    </div>
  )
}

/**
 * Shared verification-completion screen for the terminal SUCCESS / FAILED /
 * UNDER-REVIEW states. Extracted (behavior-preserving) from
 * UserVerificationPage's `phase === 'completed'` block.
 *
 * The SUCCESS case consumes the page-builder `completionTitle` /
 * `completionMessage` / `showConfetti` fields (falling back to the original
 * hardcoded copy when unset). FAILED / UNDER-REVIEW stay result-driven,
 * exactly as before — the page-builder doesn't configure those states.
 *
 * Age-only completion copy is intentionally NOT handled here — it's
 * page-specific (verification_mode=age_only) and stays inline in
 * UserVerificationPage.
 */
export function CompletionScreen({ config, branding, device, result }: CompletionScreenProps) {
  const statusLabel =
    result?.status === 'verified' || result?.status === 'completed'
      ? 'Verified'
      : result?.status === 'failed'
        ? 'Failed'
        : 'Under Review'
  const isSuccess = statusLabel === 'Verified'
  const isFailed = statusLabel === 'Failed'

  const hasCustomBranding = !!(branding?.logo_url || branding?.company_name || branding?.accent_color)
  const showPoweredBy = config?.showPoweredBy ?? true

  const heading = isSuccess
    ? config?.completionTitle || 'Verification Verified'
    : `Verification ${statusLabel}`
  const body = isSuccess
    ? config?.completionMessage || 'Your identity has been successfully verified.'
    : statusLabel === 'Failed'
      ? 'Verification could not be completed. Please try again.'
      : 'Your verification is being reviewed. You will be notified of the result.'

  return (
    <div style={{
      background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      {isSuccess && config?.showConfetti && <ConfettiBurst />}
      <div style={{ maxWidth: device === 'mobile' ? 380 : 440, width: '100%', textAlign: 'center' }}>
        {branding?.logo_url ? (
          <img src={branding.logo_url} alt={branding.company_name || 'Logo'} style={{ height: 36, margin: '0 auto 32px', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto 32px' }} />
        )}
        <div className={isSuccess ? 'result-badge badge-success' : isFailed ? 'result-badge badge-error' : 'result-badge badge-warning'} style={{
          margin: '0 auto 16px', display: 'inline-flex', padding: '8px 16px',
          fontFamily: C.mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {isSuccess ? 'PASS' : isFailed ? 'FAIL' : 'REVIEW'}
        </div>
        <h1 style={{ fontFamily: C.sans, fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)', margin: '16px 0 8px' }}>
          {heading}
        </h1>
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: 'var(--mid)', margin: '0 0 24px' }}>
          {body}
        </p>
        {result && (
          <div className="result-grid" style={{ textAlign: 'left' }}>
            {result.confidence_score != null && (
              <>
                <div>Confidence</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(result.confidence_score * 100)}%</div>
              </>
            )}
            {result.face_match_score != null && (
              <>
                <div>Face Match</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(result.face_match_score * 100)}%</div>
              </>
            )}
            {result.liveness_score != null && (
              <>
                <div>Liveness</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(result.liveness_score * 100)}%</div>
              </>
            )}
          </div>
        )}
        <p style={{ fontFamily: C.mono, fontSize: '0.72rem', color: 'var(--soft)', marginTop: 24, letterSpacing: '0.04em' }}>
          You can close this window.
        </p>
        {hasCustomBranding && showPoweredBy && (
          <p style={{ fontFamily: C.mono, fontSize: '0.68rem', color: 'var(--soft)', marginTop: 12, letterSpacing: '0.04em' }}>
            Powered by Idswyft
          </p>
        )}
      </div>
    </div>
  )
}

export default CompletionScreen
