import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'
import '../styles/glassmorphic.css'

/* ── Hooks ───────────────────────────────────────────────── */

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const animated = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true
          const start = performance.now()
          const tick = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(Math.round(eased * target))
            if (progress < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration])

  return { ref, value }
}

function useScrollReveal() {
  useEffect(() => {
    document.querySelectorAll('.v2-stagger-grid').forEach(grid => {
      Array.from(grid.children).forEach((child, i) => {
        ;(child as HTMLElement).style.setProperty('--reveal-delay', `${i * 0.1}s`)
        child.classList.add('v2-reveal')
      })
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('v2-revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.v2-reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/* ── Stat Card ───────────────────────────────────────────── */

function StatCard({ target, prefix, suffix, label }: {
  target: number | null; prefix: string; suffix: string; label: string
}) {
  const { ref, value } = useCountUp(target ?? 0)
  const display = target !== null ? `${prefix}${value}${suffix}` : `${prefix}${suffix}`
  return (
    <div ref={ref} className="glass-card" style={{ padding: '16px 28px', textAlign: 'center', minWidth: 140 }}>
      <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700, color: C.cyan, lineHeight: 1.2 }}>{display}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 4, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

/* ── Scanning ID Card Animation ──────────────────────────── */

// 6 phases: scan front → extract front → scan back → cross-validate → face match → verified
const SPECIMEN_BASE = 'https://kcjugatpfhccjroyliku.supabase.co/storage/v1/object/public/specimen-assets'

const PHASES = [
  { label: 'Scanning front...', color: '#22d3ee', card: 'front' as const },
  { label: 'Extracting OCR...',  color: '#fbbf24', card: 'front' as const },
  { label: 'Scanning back...',   color: '#22d3ee', card: 'back'  as const },
  { label: 'Cross-validating...', color: '#60a5fa', card: 'back'  as const },
  { label: 'Face matching...',   color: '#a78bfa', card: 'front' as const },
  { label: 'Verified',          color: '#34d399', card: 'front' as const },
] as const

const FRONT_FIELDS = [
  { label: 'Name',   value: 'IMA SAMPLE' },
  { label: 'DOB',    value: '08/31/1979' },
  { label: 'Doc #',  value: '0001234567891' },
  { label: 'Expiry', value: '08/30/2032' },
]

const BACK_FIELDS = [
  { label: 'PDF417', value: 'DECODED' },
  { label: 'Name',   value: 'SAMPLE, IMA' },
  { label: 'DOB',    value: '08/31/1979' },
  { label: 'Doc #',  value: '0001234567891' },
]

function ScanCorners({ color }: { color: string }) {
  return (
    <>
      {[[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => (
        <div key={`${x}${y}`} style={{
          position: 'absolute',
          [y ? 'bottom' : 'top']: 10,
          [x ? 'right' : 'left']: 10,
          width: 20, height: 20,
          borderColor: color,
          borderStyle: 'solid', borderWidth: 0,
          [`border${y ? 'Bottom' : 'Top'}Width`]: '2px',
          [`border${x ? 'Right' : 'Left'}Width`]: '2px',
          transition: 'border-color 0.4s ease',
        }} />
      ))}
    </>
  )
}

function ScanningCard() {
  const [step, setStep] = useState(0)
  const phase = PHASES[step]
  const isScanning = step < 5
  const isDone = step === 5

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % 6)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  const frontRevealed = step >= 1
  const backRevealed = step >= 3
  const crossValDone = step >= 3
  const faceMatchDone = step >= 5

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 960, margin: '0 auto', alignItems: 'center' }}>

      {/* ── LEFT COLUMN: stacked ID cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Front ID */}
        <div className="glass-card scanning-card" style={{
          width: '100%', aspectRatio: '1.586', position: 'relative', overflow: 'hidden',
          opacity: phase.card === 'front' ? 1 : 0.4,
          transition: 'opacity 0.4s ease',
          padding: 0,
        }}>
          {phase.card === 'front' && isScanning && (
            <div className="scan-line" style={{
              position: 'absolute', left: 0, right: 0, height: 2, zIndex: 2,
              background: `linear-gradient(90deg, transparent, ${phase.color}, transparent)`,
            }} />
          )}
          <ScanCorners color={isDone ? C.green : phase.card === 'front' ? phase.color : C.dim} />
          <img src={`${SPECIMEN_BASE}/id-front.png`} alt="Specimen ID front" style={{
            width: '100%', height: '100%', objectFit: 'cover', borderRadius: 13, display: 'block',
          }} />
          <div style={{
            position: 'absolute', bottom: 12, left: 14,
            fontFamily: C.mono, fontSize: 10, color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}>Front Document</div>
        </div>

        {/* Back ID */}
        <div className="glass-card scanning-card" style={{
          width: '100%', aspectRatio: '1.586', position: 'relative', overflow: 'hidden',
          opacity: phase.card === 'back' ? 1 : 0.4,
          transition: 'opacity 0.4s ease',
          padding: 0,
        }}>
          {phase.card === 'back' && isScanning && (
            <div className="scan-line" style={{
              position: 'absolute', left: 0, right: 0, height: 2, zIndex: 2,
              background: `linear-gradient(90deg, transparent, ${phase.color}, transparent)`,
            }} />
          )}
          <ScanCorners color={isDone ? C.green : phase.card === 'back' ? phase.color : C.dim} />
          <img src={`${SPECIMEN_BASE}/id-back.png`} alt="Specimen ID back" style={{
            width: '100%', height: '100%', objectFit: 'cover', borderRadius: 13, display: 'block',
          }} />
          <div style={{
            position: 'absolute', bottom: 12, left: 14,
            fontFamily: C.mono, fontSize: 10, color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}>Back Document</div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: result card ── */}
      <div className="glass-card" style={{
        padding: 32, height: '100%',
        borderColor: isDone ? 'rgba(52,211,153,0.25)' : undefined,
        transition: 'border-color 0.5s ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* Phase indicator */}
        <div style={{
          fontFamily: C.mono, fontSize: 13, color: phase.color, fontWeight: 600,
          letterSpacing: '0.1em', marginBottom: 24, transition: 'color 0.3s ease',
        }}>
          {phase.label}
        </div>

        {/* Front OCR results */}
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', marginBottom: 10 }}>FRONT OCR</div>
        {FRONT_FIELDS.map((f, i) => (
          <div key={`f-${f.label}`} style={{
            display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderBottom: i < FRONT_FIELDS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{f.label}</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: frontRevealed ? C.text : C.dim, transition: 'color 0.3s ease' }}>
              {frontRevealed ? f.value : '—'}
            </span>
          </div>
        ))}

        {/* Back barcode results */}
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', marginTop: 20, marginBottom: 10 }}>BACK BARCODE</div>
        {BACK_FIELDS.map((f, i) => (
          <div key={`b-${f.label}`} style={{
            display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderBottom: i < BACK_FIELDS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{f.label}</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: backRevealed ? C.text : C.dim, transition: 'color 0.3s ease' }}>
              {backRevealed ? f.value : '—'}
            </span>
          </div>
        ))}

        {/* Verification checks */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Cross-validation</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: crossValDone ? C.green : C.dim, transition: 'color 0.3s ease' }}>
              {crossValDone ? 'MATCH' : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Face match</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: faceMatchDone ? C.green : C.dim, transition: 'color 0.3s ease' }}>
              {faceMatchDone ? '0.94' : '—'}
            </span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 8,
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.dim }}>Result</span>
            <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: isDone ? C.green : C.muted, transition: 'color 0.4s ease' }}>
              {isDone ? 'VERIFIED' : step >= 1 ? 'PENDING...' : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Pipeline Step ───────────────────────────────────────── */

const pipelineSteps = [
  { n: '01', title: 'Initialize', desc: 'Create session', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )},
  { n: '02', title: 'Front ID', desc: 'OCR + tamper check', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  )},
  { n: '03', title: 'Back ID', desc: 'Barcode + cross-val', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )},
  { n: '04', title: 'Live Capture', desc: 'Liveness + anti-spoof', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M2 12c2.5-5 6-8 10-8s7.5 3 10 8c-2.5 5-6 8-10 8s-7.5-3-10-8z" />
    </svg>
  )},
  { n: '05', title: 'Results', desc: 'Pass / Fail / Review', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )},
]

/* ── Bento Feature Data ──────────────────────────────────── */

const bentoFeatures = [
  { title: 'OCR Engine', desc: 'PaddleOCR + Tesseract dual-engine pipeline. Extracts name, DOB, document number, expiry, and address from 20+ country formats.', span: 2, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="14" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  )},
  { title: 'Cross-Validation', desc: 'Front OCR vs back barcode/MRZ. Levenshtein distance + exact match scoring.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )},
  { title: 'Liveness Detection', desc: 'Anti-spoof scoring with passive and head-turn modes. Detects printed photos, screens, and 3D masks.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M2 12c2.5-5 6-8 10-8s7.5 3 10 8c-2.5 5-6 8-10 8s-7.5-3-10-8z" />
    </svg>
  )},
  { title: 'Face Matching', desc: 'Live capture compared against document photo using face-api.js embeddings. Configurable similarity threshold with cosine distance scoring.', span: 2, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="10" r="6" /><circle cx="15" cy="10" r="6" opacity="0.5" /><path d="M12 18v3" /><line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  )},
  { title: 'Tamper Detection', desc: 'Error Level Analysis, entropy mapping, and FFT spectral analysis detect digital manipulation.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16" r="0.5" fill={C.cyan} />
    </svg>
  )},
  { title: 'Webhooks', desc: 'Real-time POST callbacks on verification status changes. Fire-and-forget delivery.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6" /><path d="M12 9l6 4" /><path d="M12 9l-6 4" /><circle cx="12" cy="3" r="1.5" /><circle cx="18" cy="13" r="1.5" /><circle cx="6" cy="13" r="1.5" />
    </svg>
  )},
  { title: 'GDPR & Privacy', desc: 'Face embeddings stripped before persistence. Configurable retention. Full erasure endpoints.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" /><polyline points="9 12 11 14 15 10" />
    </svg>
  )},
  { title: 'SDK & Components', desc: 'npm install @idswyft/sdk — drop-in TypeScript SDK with React component, real-time event watcher, and iframe embed.', span: 1, icon: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  )},
]

/* ── Code Snippet ────────────────────────────────────────── */

const CODE_LINES = [
  { code: 'import { IdswyftSDK } from ', str: "'@idswyft/sdk'", comment: '' },
  { code: '', str: '', comment: '' },
  { code: 'const client = new IdswyftSDK({ apiKey: ', str: "'ik_your_api_key'", comment: ' })' },
  { code: '', str: '', comment: '' },
  { code: '', str: '', comment: '// 1. Create verification session' },
  { code: 'const { verification_id } = await client.startVerification({', str: '', comment: '' },
  { code: '  user_id: ', str: "'user_123'", comment: ',' },
  { code: '  document_type: ', str: "'drivers_license'", comment: '' },
  { code: '})', str: '', comment: '' },
  { code: '', str: '', comment: '' },
  { code: '', str: '', comment: '// 2. Upload front of ID' },
  { code: 'await client.uploadFrontDocument(verification_id, frontFile)', str: '', comment: '' },
  { code: '', str: '', comment: '' },
  { code: '', str: '', comment: '// 3. Upload back of ID' },
  { code: 'await client.uploadBackDocument(verification_id, backFile)', str: '', comment: '' },
  { code: '', str: '', comment: '' },
  { code: '', str: '', comment: '// 4. Upload live capture for liveness + face match' },
  { code: 'await client.uploadSelfie(verification_id, captureFile)', str: '', comment: '' },
  { code: '', str: '', comment: '' },
  { code: '', str: '', comment: '// 5. Get results' },
  { code: 'const result = await client.getVerificationStatus(verification_id)', str: '', comment: '' },
  { code: 'console.log(result.status) ', str: '', comment: "// 'COMPLETE' | 'HARD_REJECTED'" },
]

/* ── Main Component ──────────────────────────────────────── */

export function HomePageV2() {
  useEffect(() => { injectFonts() }, [])
  useScrollReveal()

  const codeFont = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace"

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, overflow: 'hidden' }}>

      {/* ── 1. HERO ──────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px', textAlign: 'center',
        position: 'relative',
      }}>
        {/* Gradient mesh background */}
        <div className="hero-gradient-mesh" />

        {/* Security pattern overlays — guilloche + crosshatch */}
        <div className="pattern-guilloche pattern-faint pattern-animate-slow"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div className="pattern-crosshatch pattern-faint pattern-animate"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
          <div className="v2-reveal" style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em', marginBottom: 28, textTransform: 'uppercase' }}>
            Open-Source Identity Verification
          </div>

          <h1 className="v2-reveal" style={{
            fontFamily: C.mono, fontSize: 'clamp(40px, 7vw, 80px)',
            fontWeight: 700, color: C.text, lineHeight: 1.05, marginBottom: 24,
          }}>
            Verify identities.<br />
            <span style={{ color: C.cyan }}>In minutes.</span>
          </h1>

          <p className="v2-reveal" style={{ fontSize: 18, color: C.muted, maxWidth: 520, margin: '0 auto 48px', lineHeight: 1.7 }}>
            Document OCR, cross-validation, liveness detection, and face matching —
            all in one self-hostable API.
          </p>

          <div className="v2-reveal" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
            <Link to="/developer" className="cta-primary" style={{
              background: C.cyan, color: C.bg, padding: '14px 32px', borderRadius: 10,
              fontWeight: 600, fontSize: 15, textDecoration: 'none', fontFamily: C.sans,
            }}>
              Get API Key
            </Link>
            <Link to="/demo" className="cta-secondary" style={{
              padding: '14px 32px', borderRadius: 10,
              fontWeight: 600, fontSize: 15, textDecoration: 'none',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: C.text, fontFamily: C.sans,
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}>
              Try Demo
            </Link>
            <Link to="/docs" style={{ color: C.muted, padding: '14px 20px', fontSize: 15, textDecoration: 'none' }}>
              View Docs →
            </Link>
          </div>

          {/* Animated scanning card */}
          <div className="v2-reveal">
            <ScanningCard />
          </div>
        </div>
      </section>

      {/* ── 2. STATS STRIP ───────────────────────────────── */}
      <section className="v2-reveal" style={{
        padding: '40px 24px', maxWidth: 800, margin: '0 auto',
        display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        <StatCard target={90}  prefix=">" suffix="%" label="Accuracy" />
        <StatCard target={5}   prefix="<" suffix="s"  label="OCR Latency" />
        <StatCard target={20}  prefix=""  suffix=""    label="Countries" />
        <StatCard target={null} prefix="" suffix="MIT" label="License" />
      </section>

      {/* ── 3. PIPELINE ──────────────────────────────────── */}
      <section className="v2-reveal" style={{
        padding: '100px 24px', maxWidth: 1000, margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            The Verification Flow
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 600, color: C.text }}>
            Five steps. One API.
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
          {pipelineSteps.map((step, i, arr) => (
            <React.Fragment key={step.n}>
              <div className="glass-card pipeline-glass-step" style={{
                flexShrink: 0, width: 150, textAlign: 'center', padding: '24px 16px',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: C.cyanDim, border: `1px solid rgba(34,211,238,0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 8px',
                }}>
                  {step.icon}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 6 }}>{step.n}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{step.desc}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ flex: 1, minWidth: 20, marginTop: 48, display: 'flex', alignItems: 'center' }}>
                  <svg width="100%" height="2" style={{ overflow: 'visible' }}>
                    <line x1="0" y1="1" x2="100%" y2="1"
                      stroke={C.cyan} strokeWidth="1" strokeDasharray="6 4" strokeOpacity="0.3"
                      style={{ animation: 'pipelineFlow 1.2s linear infinite' }}
                    />
                  </svg>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ── 4. BENTO FEATURES ────────────────────────────── */}
      <section style={{ padding: '80px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <div className="v2-reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Capabilities
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 600, color: C.text }}>
            Everything you need to verify
          </h2>
        </div>

        <div className="v2-stagger-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}>
          {bentoFeatures.map(f => (
            <div key={f.title} className="glass-card bento-card" style={{
              gridColumn: `span ${f.span}`,
              padding: '28px 24px',
            }}>
              <div style={{ marginBottom: 16, opacity: 0.8 }}>{f.icon}</div>
              <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                {f.title}
              </div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. CODE SECTION ──────────────────────────────── */}
      <section className="v2-reveal" style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Integration
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            Ship in under 30 minutes
          </h2>
          <p style={{ color: C.muted, fontSize: 14 }}>The complete five-step verification flow.</p>
        </div>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.red, opacity: 0.7 }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.amber, opacity: 0.7 }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, opacity: 0.7 }} />
            </div>
            <span style={{ fontFamily: codeFont, fontSize: 11, color: C.dim }}>quickstart.ts</span>
            <div style={{ width: 36 }} />
          </div>
          {/* Code */}
          <div style={{ padding: '16px 0', overflowX: 'auto' }}>
            {CODE_LINES.map((line, i) => (
              <div key={i} style={{
                display: 'flex', padding: '0 20px', fontFamily: codeFont, fontSize: 13, lineHeight: 1.8,
              }}>
                <span style={{ width: 32, textAlign: 'right', color: C.dim, fontSize: 12, userSelect: 'none', marginRight: 16, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span>
                  {line.code && <span style={{ color: C.code }}>{line.code}</span>}
                  {line.str && <span style={{ color: C.amber }}>{line.str}</span>}
                  {line.comment && <span style={{ color: line.comment.startsWith('//') ? C.dim : C.code }}>{line.comment}</span>}
                  {!line.code && !line.str && !line.comment && ' '}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Link to="/docs" style={{ color: C.cyan, fontSize: 13, fontFamily: C.mono, textDecoration: 'none' }}>
            Full docs →
          </Link>
        </div>
      </section>

      {/* ── 6. INTEGRATION OPTIONS ───────────────────────── */}
      <section style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div className="v2-reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text }}>
            Three ways to integrate
          </h2>
        </div>
        <div className="v2-stagger-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { tag: 'Easiest', title: 'Hosted Flow', desc: 'Redirect users to a branded verification page. Zero frontend work.', color: C.cyan },
            { tag: 'Flexible', title: 'REST API', desc: 'Call endpoints directly from your backend. Full control over UX and data.', color: C.muted },
            { tag: 'Drop-in', title: 'SDK Embed', desc: 'npm install @idswyft/sdk — modal or inline iframe. 3 lines of code.', color: C.cyan },
          ].map(opt => (
            <div key={opt.title} className="glass-card bento-card" style={{ padding: 28 }}>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: opt.color, marginBottom: 12, letterSpacing: '0.06em' }}>{opt.tag}</div>
              <div style={{ fontWeight: 600, fontSize: 17, color: C.text, marginBottom: 10 }}>{opt.title}</div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>{opt.desc}</div>
              <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none', fontFamily: C.mono }}>Learn more →</Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── 7. PRICING ───────────────────────────────────── */}
      <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="v2-reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Pricing
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            Start free. Scale when ready.
          </h2>
          <p style={{ color: C.muted, fontSize: 15 }}>Self-host for free. Or let us run it for you.</p>
        </div>

        <div className="v2-stagger-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {/* Community */}
          <div className="glass-card pricing-highlight" style={{ padding: 28, position: 'relative' }}>
            <div className="pricing-badge">Open Source</div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.cyan, marginBottom: 16 }}>Community Edition</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: C.text }}>Free</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>forever</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['Unlimited verifications', 'Full source code (MIT)', 'Your infrastructure', 'No rate limits', 'Community support'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <a href="https://github.com/team-idswyft/idswyft" target="_blank" rel="noopener noreferrer"
              className="cta-primary" style={{
                display: 'block', textAlign: 'center', padding: '12px 20px', borderRadius: 8,
                fontWeight: 600, fontSize: 13, textDecoration: 'none',
                background: C.cyan, color: C.bg,
              }}>
              View on GitHub
            </a>
          </div>

          {/* Starter */}
          <div className="glass-card bento-card" style={{ padding: 28 }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 16 }}>Cloud Starter</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: C.text }}>$0</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['50 verifications / month', 'Managed hosting', 'Email support', '99.5% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <Link to="/developer" className="cta-secondary" style={{
              display: 'block', textAlign: 'center', padding: '12px 20px', borderRadius: 8,
              fontWeight: 600, fontSize: 13, textDecoration: 'none',
              border: `1px solid rgba(255,255,255,0.1)`, color: C.text,
            }}>
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="glass-card bento-card" style={{ padding: 28, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: C.surface, color: C.muted,
              fontFamily: C.mono, fontSize: 11, fontWeight: 600,
              padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
              border: `1px solid rgba(255,255,255,0.08)`,
            }}>
              Coming Soon
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 16 }}>Cloud Pro</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: C.text }}>$49</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['2,000 verifications / month', 'Priority support', 'Audit logs & backups', '99.9% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <span style={{
              display: 'block', textAlign: 'center', padding: '12px 20px', borderRadius: 8,
              fontWeight: 600, fontSize: 13,
              background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`,
              color: C.dim, cursor: 'default',
            }}>
              Coming Soon
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <Link to="/pricing" style={{ color: C.cyan, fontSize: 14, fontFamily: C.mono, textDecoration: 'none' }}>
            Compare all features →
          </Link>
        </div>
      </section>

      {/* ── 8. CTA ───────────────────────────────────────── */}
      <section className="v2-reveal" style={{
        padding: '100px 24px', textAlign: 'center', position: 'relative',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600, height: 300, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(34,211,238,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <h2 style={{ fontFamily: C.mono, fontSize: 36, fontWeight: 700, color: C.text, marginBottom: 16, position: 'relative' }}>
          Ready to integrate?
        </h2>
        <p style={{ color: C.muted, fontSize: 16, marginBottom: 40, position: 'relative' }}>
          Self-host for free. No per-verification fees.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48, position: 'relative' }}>
          <Link to="/developer" className="cta-primary" style={{
            background: C.cyan, color: C.bg, padding: '16px 40px', borderRadius: 10,
            fontWeight: 600, fontSize: 16, textDecoration: 'none',
          }}>
            Get Free API Key →
          </Link>
          <Link to="/pricing" className="cta-secondary" style={{
            border: '1px solid rgba(255,255,255,0.1)', color: C.text,
            padding: '16px 32px', borderRadius: 10, fontWeight: 600, fontSize: 16, textDecoration: 'none',
            background: 'rgba(255,255,255,0.03)',
          }}>
            View Pricing
          </Link>
        </div>

        {/* Bottom stats */}
        <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
          {[
            { value: '5 min', label: 'to first verification' },
            { value: '$0',    label: 'self-hosted' },
            { value: 'MIT',   label: 'open source' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color: C.cyan }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
