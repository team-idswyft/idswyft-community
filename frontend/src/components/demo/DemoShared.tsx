import React, { useState, useEffect } from 'react';
import { C } from '../../theme';

// ─── CSS Keyframes ───────────────────────────────────────────────────────────
// Prefixed with "d" to avoid conflicts with mobile page animations
export const DEMO_CSS = `
@keyframes dSegPulse  { 0%,100%{opacity:0.5} 50%{opacity:1} }
@keyframes dScan      { 0%{top:10px;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:calc(100% - 10px);opacity:0} }
@keyframes dSpin      { to{transform:rotate(360deg)} }
@keyframes dBlink     { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes dFscan     { 0%{top:18%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:88%;opacity:0} }
@keyframes dDotsDrift { from{background-position:0 0} to{background-position:18px 18px} }
@keyframes dGPulse    { 0%,100%{border-color:${C.accent}} 50%{border-color:${C.accentInk}} }
@keyframes dFadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes dSlideIn   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.demo-fade-up { animation: dFadeUp 0.38s ease both; }
`;

let cssInjected = false;
export function injectDemoCSS() {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.textContent = DEMO_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

// ─── Step Label ──────────────────────────────────────────────────────────────
export const StepLabel: React.FC<{ step: number; total: number; label: string }> = ({ step, total, label }) => (
  <span style={{
    fontFamily: C.mono, fontSize: 10, fontWeight: 400,
    textTransform: 'uppercase', letterSpacing: '0.12em', color: C.accent,
    marginBottom: 8, display: 'block',
  }}>
    Step {step} of {total} &mdash; {label}
  </span>
);

// ─── Tip Bar ─────────────────────────────────────────────────────────────────
export const TipBar: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    background: C.accentSoft, border: `1px solid ${C.border}`,
    padding: '9px 13px',
    fontSize: 12, fontFamily: C.mono,
    color: C.muted, flexShrink: 0,
  }}>
    <div style={{ width: 5, height: 5, background: C.accent, flexShrink: 0 }} />
    {text}
  </div>
);

// ─── Ambient Glow (v2: no-op — removed radial gradients / glassmorphism) ─────
export const AmbientGlow: React.FC = () => null;

// ─── Primary Button ──────────────────────────────────────────────────────────
export const DemoPrimaryBtn: React.FC<{
  children: React.ReactNode; onClick: () => void; disabled?: boolean; style?: React.CSSProperties;
}> = ({ children, onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: '100%', padding: 14, border: `1px solid ${C.accent}`,
      background: disabled ? 'transparent' : C.accent,
      color: disabled ? C.muted : C.bg,
      fontFamily: C.mono, fontSize: 13, fontWeight: 500,
      letterSpacing: '0.03em',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'transform 120ms ease, opacity 120ms ease', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}
  >
    {children}
  </button>
);

// ─── ID Card Viewfinder ──────────────────────────────────────────────────────
export const IDViewfinder: React.FC<{
  variant: 'front' | 'back';
  processing: boolean;
  processingLabel?: string;
  previewUrl?: string | null;
}> = ({ variant, processing, processingLabel = 'PROCESSING', previewUrl }) => {
  const corners = [
    { top: 10, left: 10, bw: '2px 0 0 2px' },
    { top: 10, right: 10, bw: '2px 2px 0 0' },
    { bottom: 10, left: 10, bw: '0 0 2px 2px' },
    { bottom: 10, right: 10, bw: '0 2px 2px 0' },
  ];

  return (
    <div style={{
      width: '100%', maxWidth: 420, margin: '0 auto', aspectRatio: '1.586',
      background: C.codeBg, position: 'relative', overflow: 'hidden',
      border: `1px solid ${C.border}`,
      flexShrink: 0, marginBottom: 18,
    }}>
      {/* Card mock or preview image */}
      {previewUrl ? (
        <img src={previewUrl} alt="Document preview" style={{
          position: 'absolute', inset: 16,
          objectFit: 'cover', width: 'calc(100% - 32px)', height: 'calc(100% - 32px)',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 16,
          background: C.surface,
          padding: '13px 15px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          {variant === 'front' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: 30, height: 22, background: 'linear-gradient(135deg, #c8a84b, #e8c96a)', opacity: 0.75 }} />
                <div style={{ width: 38, height: 38, background: C.border }} />
              </div>
              <div>
                <div style={{ height: 5, background: C.border, width: '62%', marginBottom: 8 }} />
                <div style={{ height: 5, background: C.border, width: '42%' }} />
              </div>
              <div>
                <div style={{ height: 4, background: C.accentSoft, width: '90%', marginBottom: 4 }} />
                <div style={{ height: 4, background: C.accentSoft, width: '85%' }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, justifyContent: 'center' }}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} style={{
                    height: i % 4 === 0 ? 6 : i % 2 === 0 ? 4 : 3,
                    background: C.accentSoft,
                    width: `${48 + Math.abs(Math.sin(i * 1.3)) * 38}%`,
                  }} />
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ height: 4, background: C.accentSoft, width: `${90 - i * 5}%`, marginBottom: 4 }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Corner markers */}
      {corners.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', width: 22, height: 22,
          borderStyle: 'solid', borderColor: C.accent,
          borderWidth: c.bw,
          ...(c.top !== undefined && { top: c.top }),
          ...(c.bottom !== undefined && { bottom: c.bottom }),
          ...(c.left !== undefined && { left: c.left }),
          ...(c.right !== undefined && { right: c.right }),
        } as React.CSSProperties} />
      ))}

      {/* Scan line */}
      {!processing && !previewUrl && (
        <div style={{
          position: 'absolute', left: 10, right: 10, height: 2,
          background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
          animation: 'dScan 2s ease-in-out infinite',
        }} />
      )}

      {/* Processing overlay */}
      {processing && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(11,11,13,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{
            width: 46, height: 46, border: `2px solid ${C.accentSoft}`,
            borderTopColor: C.accent, borderRadius: '50%',
            animation: 'dSpin 0.8s linear infinite',
          }} />
          <span style={{
            fontFamily: C.mono, fontSize: 11,
            color: C.accent, letterSpacing: '0.18em',
            animation: 'dBlink 1.4s ease infinite',
          }}>{processingLabel}</span>
        </div>
      )}
    </div>
  );
};

// ─── Oval Face Viewfinder ────────────────────────────────────────────────────
export const OvalFaceViewfinder: React.FC<{
  processing: boolean;
  previewUrl?: string | null;
}> = ({ processing, previewUrl }) => {
  const ovalRadius = '114px 114px 94px 94px';
  return (
    <div style={{
      width: 200, height: 240, borderRadius: ovalRadius,
      background: C.codeBg, position: 'relative', overflow: 'hidden',
      margin: '0 auto 22px', flexShrink: 0,
    }}>
      {previewUrl && (
        <img src={previewUrl} alt="Selfie preview" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', borderRadius: ovalRadius,
        }} />
      )}

      {/* Dot grid */}
      {!previewUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, ${C.accentSoft} 1px, transparent 1px)`,
          backgroundSize: '18px 18px', opacity: 0.6,
          animation: 'dDotsDrift 4s linear infinite',
        }} />
      )}

      {/* Ghost silhouette */}
      {!previewUrl && (
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          width: 90, height: 120, opacity: 0.07,
          background: `linear-gradient(to bottom, transparent, ${C.text})`,
          clipPath: 'polygon(35% 0%,65% 0%,80% 28%,82% 58%,92% 70%,100% 100%,0% 100%,8% 70%,18% 58%,20% 28%)',
        }} />
      )}

      {/* Horizontal scan line */}
      {!processing && !previewUrl && (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
          animation: 'dFscan 1.9s ease-in-out infinite',
        }} />
      )}

      {/* Pulsing oval border */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: ovalRadius,
        border: `2px solid ${C.accent}`,
        animation: processing ? 'none' : 'dGPulse 2.2s ease infinite',
      }} />

      {/* Processing overlay */}
      {processing && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(11,11,13,0.92)',
          borderRadius: ovalRadius,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 46, height: 46, border: `2px solid ${C.accentSoft}`,
            borderTopColor: C.accent, borderRadius: '50%',
            animation: 'dSpin 0.8s linear infinite',
          }} />
          <span style={{
            fontFamily: C.mono, fontSize: 11,
            color: C.accent, letterSpacing: '0.18em',
            animation: 'dBlink 1.4s ease infinite',
          }}>CHECKING</span>
        </div>
      )}
    </div>
  );
};

// ─── Liveness Cues ───────────────────────────────────────────────────────────
const CUES = [
  { emoji: '\u{1F610}', label: 'Look ahead' },
  { emoji: '\u{1F60A}', label: 'Smile' },
  { emoji: '\u2194', label: 'Turn slightly' },
] as const;

export const LivenessCues: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (hidden) return;
    const iv = setInterval(() => setActiveIdx(i => (i + 1) % 3), 1600);
    return () => clearInterval(iv);
  }, [hidden]);

  if (hidden) return null;

  return (
    <div style={{ display: 'flex', gap: 22, justifyContent: 'center', margin: '18px 0' }}>
      {CUES.map((cue, i) => {
        const isActive = i === activeIdx;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
              background: isActive ? C.accentSoft : 'transparent',
              border: `1px solid ${isActive ? C.accent : C.border}`,
              transition: 'all 0.3s ease',
            }}>{cue.emoji}</div>
            <span style={{
              fontFamily: C.mono, fontSize: 9,
              letterSpacing: '0.06em',
              color: isActive ? C.accent : C.dim,
              transition: 'color 0.3s ease',
            }}>{cue.label}</span>
          </div>
        );
      })}
    </div>
  );
};
