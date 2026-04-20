import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'

/* ── Hooks ───────────────────────────────────────────────── */

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

/* ── Interactive Demo ─────────────────────────────────────── */

const SPECIMEN_BASE = 'https://kcjugatpfhccjroyliku.supabase.co/storage/v1/object/public/specimen-assets'

const DEMO_STEPS = [
  { label: 'Document', endpoint: 'POST /v2/verify/initialize' },
  { label: 'Front', endpoint: 'POST /v2/verify/:id/front-document' },
  { label: 'Back', endpoint: 'POST /v2/verify/:id/back-document' },
  { label: 'Liveness', endpoint: 'POST /v2/verify/:id/live-capture' },
  { label: 'Result', endpoint: 'GET /v2/verify/:id/status' },
] as const

const FRONT_CHECKS = [
  { text: 'Edge detection', delay: 250 },
  { text: 'Glare & blur', delay: 700 },
  { text: 'OCR + MRZ parse', delay: 1100 },
  { text: 'Template forgery', delay: 1500 },
  { text: 'Face detected', delay: 1900 },
]

const BACK_CHECKS = [
  { text: 'Barcode detected', delay: 250 },
  { text: 'PDF417 decoded', delay: 700 },
  { text: 'MRZ parsed', delay: 1100 },
  { text: 'Cross-validation', delay: 1500 },
  { text: 'Fields matched', delay: 1900 },
]

const LIVE_CHECKS = [
  { text: 'Depth map', delay: 300 },
  { text: 'Micro-movement', delay: 800 },
  { text: 'Screen replay check', delay: 1300 },
  { text: 'Mask / deepfake', delay: 1700 },
  { text: 'Face match vs doc', delay: 2100 },
]

const LIVENESS_PROMPTS = ['TURN HEAD \u2192', 'LOOK UP \u2191', 'BLINK \u2713']

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

function useChecklistState(items: { text: string; delay: number }[], active: boolean) {
  const itemsRef = useRef(items)
  const [done, setDone] = useState<boolean[]>(items.map(() => false))
  useEffect(() => {
    if (!active) { setDone(itemsRef.current.map(() => false)); return }
    const timers = itemsRef.current.map((item, i) =>
      setTimeout(() => setDone(prev => { const next = [...prev]; next[i] = true; return next }), item.delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [active])
  return { done, allDone: done.every(Boolean) }
}

function ChecklistUI({ items, done, heading }: {
  items: { text: string; delay: number }[]; done: boolean[]; heading: string;
}) {
  return (
    <div>
      <h4 style={{
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 400,
      }}>{heading}</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'var(--mono)', fontSize: 12 }}>
        {items.map((item, i) => (
          <li key={item.text} style={{
            display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 8,
            padding: '6px 0', borderBottom: '1px dashed var(--rule)', alignItems: 'center',
          }}>
            <span style={{ color: done[i] ? 'var(--accent)' : 'var(--mid)' }}>{done[i] ? '\u25CF' : '\u25CB'}</span>
            <span style={{ color: 'var(--ink)' }}>{item.text}</span>
            <span style={{ color: done[i] ? 'var(--accent-ink)' : 'var(--mid)', fontSize: 11 }}>{done[i] ? 'passed' : 'pending'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CaptureStep({ comment, imgSrc, imgAlt, checks, active, onBack, onNext }: {
  comment: string; imgSrc: string; imgAlt: string;
  checks: { text: string; delay: number }[];
  active: boolean; onBack: () => void; onNext: () => void;
}) {
  const { done, allDone } = useChecklistState(checks, active)
  return (
    <div style={{ animation: 'demoFadeIn 260ms ease both' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 14 }}>{comment}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT: capture frame */}
        <div style={{
          aspectRatio: '8/5', border: '1px solid var(--ink)', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(var(--paper), var(--paper))',
        }}>
          <ScanCorners color="var(--accent)" />
          <img src={imgSrc} alt={imgAlt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {/* scan line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: 'var(--accent)', boxShadow: '0 0 14px var(--accent)',
            animation: 'demoScan 2s ease-in-out infinite',
          }} />
        </div>
        {/* RIGHT: pipeline checklist */}
        <ChecklistUI items={checks} done={done} heading="// Pipeline" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button onClick={onBack} style={{
          fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
          background: 'transparent', border: '1px solid var(--rule-strong)', color: 'var(--ink)',
        }}>&larr; Back</button>
        <button onClick={onNext} disabled={!allDone} style={{
          fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
          background: allDone ? 'var(--ink)' : 'var(--rule)', color: allDone ? 'var(--paper)' : 'var(--mid)',
          border: allDone ? '1px solid var(--ink)' : '1px solid var(--rule)',
        }}>Continue &rarr;</button>
      </div>
      <style>{`
        @keyframes demoScan { 0%,100% { top: 15%; opacity: 0.2; } 50% { top: 80%; opacity: 0.9; } }
      `}</style>
    </div>
  )
}

function InteractiveDemo({ onStepChange }: { onStepChange: (step: number) => void }) {
  const [step, setStep] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState('dl')
  const [promptIdx, setPromptIdx] = useState(0)

  const goTo = useCallback((s: number) => { setStep(s); onStepChange(s) }, [onStepChange])
  const next = useCallback(() => { if (step < 4) goTo(step + 1) }, [step, goTo])
  const back = useCallback(() => { if (step > 0) goTo(step - 1) }, [step, goTo])

  // Liveness prompt cycling
  useEffect(() => {
    if (step !== 3) return
    const id = setInterval(() => setPromptIdx(p => (p + 1) % LIVENESS_PROMPTS.length), 1500)
    return () => clearInterval(id)
  }, [step])

  // Liveness checklist state (proper hook)
  const liveState = useChecklistState(LIVE_CHECKS, step === 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Stepper bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
        fontFamily: 'var(--mono)', fontSize: 11, padding: '12px 16px 0',
      }}>
        {DEMO_STEPS.map((s, i) => (
          <div key={s.label} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center',
            padding: '6px 0',
            borderTop: `2px solid ${i < step ? 'var(--accent)' : i === step ? 'var(--ink)' : 'var(--rule)'}`,
            color: i < step ? 'var(--accent-ink)' : i === step ? 'var(--ink)' : 'var(--mid)',
            cursor: 'pointer',
          }} onClick={() => goTo(i)}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{`0${i + 1}`}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, padding: '16px 16px 0', overflow: 'hidden' }}>
        {/* Step 0: Document Selection */}
        {step === 0 && (
          <div style={{ animation: 'demoFadeIn 260ms ease both' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 14 }}>
              {'// choose a document type'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {([
                { id: 'passport', title: 'Passport', sub: 'MRZ + NFC', label: 'PASSPORT' },
                { id: 'dl', title: "Driver's License", sub: 'PDF417 barcode', label: 'DL' },
                { id: 'national', title: 'National ID', sub: 'EU eIDAS / mDL', label: 'ID' },
              ] as const).map(doc => (
                <div key={doc.id} onClick={() => setSelectedDoc(doc.id)} style={{
                  border: `1px solid ${selectedDoc === doc.id ? 'var(--accent)' : 'var(--rule)'}`,
                  background: selectedDoc === doc.id ? 'var(--accent-soft)' : 'transparent',
                  padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
                  transition: 'border-color 0.2s, background 0.2s',
                }}>
                  {/* doc illustration placeholder */}
                  <div style={{
                    aspectRatio: '8/5', border: '1px solid var(--rule-strong)', position: 'relative',
                    background: 'repeating-conic-gradient(var(--rule) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px',
                  }}>
                    <span style={{
                      position: 'absolute', bottom: 4, left: 6,
                      fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mid)',
                    }}>{doc.label}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{doc.title}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mid)' }}>{doc.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={next} style={{
                fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
                background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)',
              }}>Continue &rarr;</button>
            </div>
          </div>
        )}

        {/* Step 1: Front Capture */}
        {step === 1 && (
          <CaptureStep
            comment="// align document inside frame"
            imgSrc={`${SPECIMEN_BASE}/id-front.png`} imgAlt="Specimen ID front"
            checks={FRONT_CHECKS} active={step === 1}
            onBack={back} onNext={next}
          />
        )}

        {/* Step 2: Back Capture */}
        {step === 2 && (
          <CaptureStep
            comment="// scan back document"
            imgSrc={`${SPECIMEN_BASE}/id-back.png`} imgAlt="Specimen ID back"
            checks={BACK_CHECKS} active={step === 2}
            onBack={back} onNext={next}
          />
        )}

        {/* Step 3: Liveness */}
        {step === 3 && (
          <div style={{ animation: 'demoFadeIn 260ms ease both' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 14 }}>
              {'// passive liveness \u2014 follow the prompt'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
              {/* LEFT: liveness frame */}
              <div style={{
                aspectRatio: '4/5', border: '1px solid var(--ink)', position: 'relative', overflow: 'hidden',
                background: 'radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 10%, var(--paper)) 0%, var(--paper) 60%)',
              }}>
                {/* face oval */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  width: '55%', aspectRatio: '3/4', border: '2px dashed var(--accent)', borderRadius: '50%',
                }} />
                {/* placeholder text */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mid)',
                }}>LIVE.CAPTURE</div>
                {/* prompt tag */}
                <div style={{
                  position: 'absolute', top: 14, left: 14,
                  background: 'var(--ink)', color: 'var(--paper)',
                  fontFamily: 'var(--mono)', fontSize: 11, padding: '6px 10px',
                }}>{LIVENESS_PROMPTS[promptIdx]}</div>
                {/* prompt arrow */}
                <div style={{
                  position: 'absolute', top: '50%', right: 14, transform: 'translateY(-50%)',
                  fontFamily: 'var(--mono)', fontSize: 32, color: 'var(--accent)',
                  animation: 'demoPointRight 1.2s ease-in-out infinite',
                }}>&rarr;</div>
              </div>
              {/* RIGHT: anti-spoof checklist */}
              <ChecklistUI items={LIVE_CHECKS} done={liveState.done} heading="// Anti-spoof" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <button onClick={back} style={{
                fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--rule-strong)', color: 'var(--ink)',
              }}>&larr; Back</button>
              <button onClick={next} disabled={!liveState.allDone} style={{
                fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
                background: liveState.allDone ? 'var(--ink)' : 'var(--rule)',
                color: liveState.allDone ? 'var(--paper)' : 'var(--mid)',
                border: liveState.allDone ? '1px solid var(--ink)' : '1px solid var(--rule)',
              }}>Continue &rarr;</button>
            </div>
            <style>{`
              @keyframes demoPointRight { 0%,100% { transform: translate(-4px, -50%); } 50% { transform: translate(4px, -50%); } }
            `}</style>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && (
          <div style={{ animation: 'demoFadeIn 260ms ease both' }}>
            {/* result head */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
                  {'\u25CF VERIFIED \u2014 confidence 0.984'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)', marginTop: 10 }}>
                  completed in 612ms &middot; 5/5 checks passed
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mid)', textAlign: 'right', lineHeight: 1.4 }}>
                vrf_01HXZ8<br />M3QK6YEF
              </div>
            </div>
            {/* result grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {[
                ['Name', 'IMA SAMPLE'],
                ['DOB', '08/31/1979'],
                ['Doc type', 'drivers_license \u00B7 US-CA'],
                ['Match score', '0.984 (strong)'],
                ['Liveness', 'passive \u00B7 cleared'],
                ['Cross-val', '5/5 fields matched'],
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <div style={{
                    padding: '10px 14px', border: '1px solid var(--rule)',
                    fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)',
                  }}>{label}</div>
                  <div style={{
                    padding: '10px 14px', border: '1px solid var(--rule)',
                    fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)',
                  }}>{value}</div>
                </React.Fragment>
              ))}
            </div>
            {/* bottom actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <button onClick={() => goTo(0)} style={{
                fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--rule-strong)', color: 'var(--ink)',
              }}>{'\u21BB Run again'}</button>
              <a href="#api" style={{
                fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px',
                color: 'var(--accent)', textDecoration: 'none',
              }}>See the code &rarr;</a>
            </div>
          </div>
        )}
      </div>

      {/* global demo keyframes */}
      <style>{`
        @keyframes demoFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

/* ── (Pipeline + Bento data removed — now inlined in sections 01 + 02) ── */

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
  const [demoStep, setDemoStep] = useState(0)
  const [activeCase, setActiveCase] = useState<'fintech' | 'market' | 'crypto' | 'gig' | 'health'>('fintech')

  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)', fontFamily: C.sans, overflow: 'hidden' }}>

      {/* ── 1. HERO ──────────────────────────────────────── */}
      <section className="hero-section" style={{
        padding: '48px 0 56px',
        position: 'relative',
        borderBottom: '1px solid var(--rule)',
      }}>
        {/* Gradient mesh background */}
        <div className="hero-gradient-mesh" />

        {/* Security pattern overlays — guilloche + crosshatch */}
        <div className="pattern-guilloche-rainbow pattern-full pattern-animate-slow"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', '--pattern-opacity': '0.01' } as React.CSSProperties} />
        <div className="pattern-crosshatch-rainbow pattern-full pattern-animate"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', '--pattern-opacity': '0.01' } as React.CSSProperties} />

        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div className="hero-grid" style={{
            display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 56,
            alignItems: 'start',
          }}>
            {/* Left column: hero copy */}
            <div>
              <div className="v2-reveal eyebrow" style={{ marginBottom: 24 }}>
                // v2.0 — shipped apr.2026
              </div>

              <h1 className="v2-reveal" style={{
                fontFamily: C.sans, fontSize: 'clamp(48px, 6.2vw, 82px)',
                fontWeight: 500, color: 'var(--ink)', lineHeight: 0.98,
                letterSpacing: '-0.035em', margin: '0 0 20px',
              }}>
                Identity verification<br />
                built for <span style={{
                  color: 'var(--accent-ink)', background: 'var(--accent-soft)',
                  padding: '0 0.1em',
                }}>devs</span>,<br />
                <span style={{ color: 'var(--mid)' }}>not ticket queues.</span>
              </h1>

              <p className="v2-reveal" style={{
                fontSize: 18, color: 'var(--mid)', maxWidth: '52ch',
                lineHeight: 1.5, margin: '0 0 28px',
              }}>
                One SDK. Document checks, liveness, biometric matching, fraud prevention, and sanctions screening —
                deterministic results in under 800&nbsp;ms. Drop it in on a Tuesday, ship it by Friday.
              </p>

              <div className="v2-reveal hero-actions" style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <Link to="/developer" className="btn" style={{
                  background: 'var(--ink)', color: 'var(--paper)', padding: '12px 18px',
                  fontWeight: 500, fontSize: 13, textDecoration: 'none', fontFamily: C.mono,
                  border: '1px solid var(--ink)',
                }}>
                  Get API Key
                </Link>
                <Link to="/demo" className="btn ghost" style={{
                  padding: '12px 18px',
                  fontWeight: 500, fontSize: 13, textDecoration: 'none',
                  background: 'transparent', border: '1px solid var(--ink)',
                  color: 'var(--ink)', fontFamily: C.mono,
                }}>
                  Try Demo
                </Link>
                <Link to="/docs" style={{
                  color: 'var(--mid)', padding: '12px 18px', fontSize: 13,
                  textDecoration: 'none', fontFamily: C.mono,
                }}>
                  View Docs →
                </Link>
              </div>

              {/* Hero-meta stats strip */}
              <div className="v2-reveal hero-stats" style={{
                display: 'flex', gap: 28, marginTop: 36,
                fontFamily: C.mono, fontSize: 12, color: 'var(--mid)',
                paddingTop: 20, borderTop: '1px solid var(--rule)',
              }}>
                <span><span style={{ color: 'var(--accent-ink)' }}>&gt;90%</span> accuracy</span>
                <span><span style={{ color: 'var(--accent-ink)' }}>&lt;5s</span> OCR</span>
                <span><span style={{ color: 'var(--accent-ink)' }}>20+</span> countries</span>
                <span><span style={{ color: 'var(--accent-ink)' }}>MIT</span> license</span>
              </div>
            </div>

            {/* Right column: demo panel with ScanningCard */}
            <div className="demo v2-reveal" style={{
              background: 'var(--panel)',
              border: '1px solid var(--rule-strong)',
              marginBottom: 48,
              display: 'grid', gridTemplateRows: 'auto 1fr',
              minHeight: 520,
            }}>
              {/* Demo header bar */}
              <div className="demo-head" style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderBottom: '1px solid var(--rule)',
                fontFamily: C.mono, fontSize: 11.5, color: 'var(--mid)',
              }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--rule-strong)', display: 'inline-block' }} />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--rule-strong)', display: 'inline-block' }} />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--rule-strong)', display: 'inline-block' }} />
                </div>
                <span>idswyft.demo</span>
                <span style={{ marginLeft: 'auto' }}>{DEMO_STEPS[demoStep].endpoint}</span>
              </div>
              {/* Demo body */}
              <div style={{ padding: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <InteractiveDemo onStepChange={setDemoStep} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 01. PROCESS (Pipeline) ──────────────────────── */}
      <section className="section v2-reveal" style={{
        padding: '32px 0 80px',
      }}>
        <div className="wrap">
          <div className="section-head" style={{ marginBottom: 56 }}>
            <span className="section-index">01 — Process</span>
            <div>
              <h2 className="section-title" style={{ fontFamily: C.mono }}>
                Four steps. One API.
              </h2>
              <p className="section-sub" style={{ color: 'var(--mid)', maxWidth: '58ch', fontSize: 16 }}>
                A single verification call runs document OCR, cross-validation, liveness detection, and face matching.
              </p>
            </div>
          </div>

          <div className="how-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
            border: '1px solid var(--rule)',
          }}>
            {[
              {
                n: '01 / initialize',
                title: 'Create a verification session.',
                body: 'One POST request creates a session. Choose document type, set callbacks, and receive a verification ID.',
                tag: 'POST /v2/verify/initialize',
              },
              {
                n: '02 / analyze',
                title: 'Submit front and back of ID.',
                body: 'PaddleOCR + Tesseract dual-engine pipeline extracts text. PDF417 barcode decoded. Automatic cross-validation scores front vs back.',
                tag: 'OCR + barcode + cross-val',
              },
              {
                n: '03 / match',
                title: 'Confirm the human is real.',
                body: 'Live capture with head-turn or passive liveness. Anti-spoof scoring detects printed photos, screens, and masks. Face matched against document photo.',
                tag: 'Liveness + face match',
              },
              {
                n: '04 / decide',
                title: 'Get the final result.',
                body: 'Poll for results or receive a webhook. Three outcomes: verified, failed, or manual_review. Full scores and evidence included.',
                tag: 'Deterministic decisions',
              },
            ].map((step, i) => (
              <div key={step.n} className="how-cell" style={{
                padding: 28,
                borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
                position: 'relative', minHeight: 260,
                display: 'flex', flexDirection: 'column',
              }}>
                <div className="how-n" style={{
                  fontFamily: C.mono, fontSize: 12, color: 'var(--mid)',
                  letterSpacing: '0.05em', marginBottom: 16,
                }}>
                  {step.n}
                </div>
                <h3 className="how-title" style={{
                  fontSize: 22, letterSpacing: '-0.02em', fontWeight: 500,
                  margin: '0 0 10px', lineHeight: 1.15,
                }}>
                  {step.title}
                </h3>
                <p className="how-body" style={{
                  color: 'var(--mid)', fontSize: 14, lineHeight: 1.55, margin: 0,
                }}>
                  {step.body}
                </p>
                <div className="how-tag" style={{
                  marginTop: 'auto', fontFamily: C.mono, fontSize: 11,
                  color: 'var(--accent-ink)',
                  paddingTop: 14, borderTop: '1px dashed var(--rule)',
                }}>
                  <span style={{ color: 'var(--accent)' }}>→ </span>{step.tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02. CAPABILITY (Features) ─────────────────────── */}
      <section className="section" style={{ padding: '32px 0 80px' }}>
        <div className="wrap">
          <div className="v2-reveal section-head" style={{ marginBottom: 56 }}>
            <span className="section-index">02 — Capability</span>
            <div>
              <h2 className="section-title" style={{ fontFamily: C.mono }}>
                Everything you need to verify
              </h2>
              <p className="section-sub" style={{ color: 'var(--mid)', maxWidth: '58ch', fontSize: 16 }}>
                Call the verification endpoint for the whole pipeline, or compose individual checks.
                Every signal is inspectable, every decision is deterministic.
              </p>
            </div>
          </div>

          <div className="feat-grid v2-stagger-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
            border: '1px solid var(--rule)', borderBottom: 'none',
          }}>
            {[
              {
                n: '01 / document',
                title: 'OCR Engine',
                body: 'PaddleOCR + Tesseract dual-engine pipeline. Extracts name, DOB, document number, expiry, and address from 20+ country formats.',
                statBold: '20+', statLabel: 'countries',
              },
              {
                n: '02 / biometrics',
                title: 'Face Matching + Liveness',
                body: 'Live capture compared against document photo using face-api.js embeddings. Anti-spoof scoring with passive and head-turn modes.',
                statBold: '0.94', statLabel: 'threshold',
              },
              {
                n: '03 / validation',
                title: 'Cross-Validation',
                body: 'Front OCR vs back barcode/MRZ. Levenshtein distance + exact match scoring. Unreadable barcodes get REVIEW, not auto-PASS.',
                statBold: '5', statLabel: 'fields matched',
              },
              {
                n: '04 / security',
                title: 'Tamper Detection',
                body: 'Error Level Analysis, entropy mapping, and FFT spectral analysis detect digital manipulation.',
                statBold: '3', statLabel: 'detection layers',
              },
              {
                n: '05 / privacy',
                title: 'GDPR & Privacy',
                body: 'Face embeddings stripped before persistence. Configurable retention. Full erasure endpoints.',
                statBold: 'GDPR', statLabel: 'CCPA',
              },
              {
                n: '06 / integration',
                title: 'SDK & Webhooks',
                body: 'npm install @idswyft/sdk — drop-in TypeScript SDK with React component, real-time event watcher, and iframe embed. Webhook callbacks on status changes.',
                statBold: '3 lines', statLabel: 'to integrate',
              },
              {
                n: '07 / fraud',
                title: 'Fraud Prevention',
                body: 'Velocity checks detect rapid-fire bot submissions and IP reuse. IP geolocation flags Tor exit nodes, datacenter proxies, and country mismatches against the document origin.',
                statBold: '4', statLabel: 'fraud signals',
              },
              {
                n: '08 / compliance',
                title: 'PEP & Age Screening',
                body: 'Screen extracted names against Politically Exposed Persons databases via OpenSanctions. Cross-check apparent face age against declared DOB to catch identity borrowing.',
                statBold: 'PEP', statLabel: '+ age check',
              },
              {
                n: '09 / auditable',
                title: 'Deterministic Decisions',
                body: 'Every verification decision is fully reproducible. Same inputs, same result. No LLM in the decision path — only checksums, exact matching, and fixed thresholds.',
                statBold: '100%', statLabel: 'reproducible',
              },
            ].map((feat, i) => (
              <div key={feat.n} className="feat" style={{
                borderRight: (i % 3) < 2 ? '1px solid var(--rule)' : 'none',
                borderBottom: '1px solid var(--rule)',
                padding: 28, display: 'flex', flexDirection: 'column', gap: 10,
                minHeight: 200,
              }}>
                <div className="feat-head" style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontFamily: C.mono, fontSize: 11, color: 'var(--mid)',
                }}>
                  <span style={{
                    width: 18, height: 18, display: 'grid', placeItems: 'center',
                    border: '1px solid var(--ink)', flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <rect x="1" y="1" width="8" height="8" stroke="var(--ink)" strokeWidth="1" fill="none" />
                    </svg>
                  </span>
                  {feat.n}
                </div>
                <div className="feat-title" style={{
                  fontSize: 19, letterSpacing: '-0.015em', fontWeight: 500,
                  margin: '4px 0 6px',
                }}>
                  {feat.title}
                </div>
                <p className="feat-body" style={{
                  color: 'var(--mid)', fontSize: 14, lineHeight: 1.55, margin: 0,
                }}>
                  {feat.body}
                </p>
                <div className="feat-stat" style={{
                  marginTop: 'auto', fontFamily: C.mono, fontSize: 11,
                  color: 'var(--ink)', display: 'flex', gap: 12,
                  paddingTop: 14, borderTop: '1px dashed var(--rule)',
                }}>
                  <b style={{ fontWeight: 500 }}>{feat.statBold}</b>
                  <span style={{ color: 'var(--mid)' }}>{feat.statLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 03. API (Code) ────────────────────────────────── */}
      <section className="section v2-reveal" style={{ padding: '32px 0 80px' }}>
        <div className="wrap">
          <div className="section-head" style={{ marginBottom: 40 }}>
            <span className="section-index">03 — API</span>
            <div>
              <h2 className="section-title" style={{ fontFamily: C.mono }}>
                Ship in under 30 minutes
              </h2>
              <p className="section-sub" style={{ color: 'var(--mid)', maxWidth: '58ch', fontSize: 16 }}>
                Same endpoints in every environment.
              </p>
            </div>
          </div>

          <div className="code-wrap" style={{
            display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 32,
            alignItems: 'stretch',
          }}>
            {/* Left column: copy + bullets */}
            <div className="code-copy">
              <h3 style={{
                fontSize: 36, lineHeight: 1.05, letterSpacing: '-0.025em',
                fontWeight: 500, margin: '0 0 16px',
              }}>
                One call.<br />Any stack.
              </h3>
              <p style={{ color: 'var(--mid)', maxWidth: '44ch', margin: 0 }}>
                The complete five-step verification flow. Idempotent by design. The SDK streams progress
                events so you can render a real-time UI without polling.
              </p>
              <ul className="code-bullets" style={{
                listStyle: 'none', padding: 0, margin: '20px 0 0',
                fontFamily: C.mono, fontSize: 12.5,
              }}>
                {[
                  { label: 'install', value: 'npm i @idswyft/sdk' },
                  { label: 'runtime', value: 'Node \u00b7 Bun \u00b7 Browser' },
                  { label: 'types', value: '1st-party TypeScript' },
                  { label: 'latency', value: 'p50 <5s end-to-end' },
                ].map((item) => (
                  <li key={item.label} style={{
                    padding: '10px 0', borderTop: '1px solid var(--rule)',
                    display: 'grid', gridTemplateColumns: '80px 1fr', gap: 16,
                  }}>
                    <span style={{ color: 'var(--mid)' }}>{item.label}</span>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right column: code panel */}
            <div className="code-panel" style={{ minHeight: 420 }}>
              {/* Tab bar */}
              <div className="code-tabs" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px',
              }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: C.red, opacity: 0.7 }} />
                  <span style={{ width: 10, height: 10, background: C.amber, opacity: 0.7 }} />
                  <span style={{ width: 10, height: 10, background: C.green, opacity: 0.7 }} />
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>quickstart.ts</span>
                <div style={{ width: 36 }} />
              </div>
              {/* Code */}
              <div className="code-body" style={{ padding: '16px 0', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {CODE_LINES.map((line, i) => (
                  <div key={i} style={{
                    display: 'flex', padding: '0 20px', fontFamily: C.mono, fontSize: 13, lineHeight: 1.8,
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
          </div>

          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <Link to="/docs" style={{ color: 'var(--accent)', fontSize: 13, fontFamily: C.mono, textDecoration: 'none' }}>
              Full docs →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 04. INTEGRATION OPTIONS ──────────────────────── */}
      <section className="section" style={{ padding: '80px 0' }}>
        <div className="wrap">
          <div className="v2-reveal section-head" style={{ marginBottom: 48 }}>
            <span className="section-index">04 — Options</span>
            <div>
              <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: 'var(--ink)' }}>
                Three ways to integrate
              </h2>
            </div>
          </div>
          <div className="v2-stagger-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0, border: '1px solid var(--rule)' }}>
            {[
              { tag: 'Easiest', title: 'Hosted Flow', desc: 'Redirect users to a branded verification page. Zero frontend work.', color: 'var(--accent)' },
              { tag: 'Flexible', title: 'REST API', desc: 'Call endpoints directly from your backend. Full control over UX and data.', color: 'var(--mid)' },
              { tag: 'Drop-in', title: 'SDK Embed', desc: 'npm install @idswyft/sdk — modal or inline iframe. 3 lines of code.', color: 'var(--accent)' },
            ].map((opt, i) => (
              <div key={opt.title} style={{
                padding: 28,
                borderRight: i < 2 ? '1px solid var(--rule)' : 'none',
                background: 'var(--panel)',
              }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: opt.color, marginBottom: 12, letterSpacing: '0.06em' }}>{opt.tag}</div>
                <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--ink)', marginBottom: 10 }}>{opt.title}</div>
                <div style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.65, marginBottom: 16 }}>{opt.desc}</div>
                <Link to="/docs" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', fontFamily: C.mono }}>Learn more →</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 05. VERIFIABLE CREDENTIALS ─────────────────── */}
      <section className="section" style={{ padding: '100px 0', position: 'relative' }}>
        <div className="wrap">
        {/* Section header */}
        <div className="v2-reveal section-head" style={{ marginBottom: 56 }}>
          <span className="section-index">05 — Credentials</span>
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 12 }}>
              Verifiable Credentials
            </div>
            <h2 className="section-title" style={{ fontFamily: C.mono, marginBottom: 12 }}>
              Verify once. <span style={{ color: 'var(--accent)' }}>Reuse everywhere.</span>
            </h2>
            <p style={{ color: 'var(--mid)', fontSize: 15, maxWidth: 560 }}>
              After verification, issue W3C Verifiable Credentials your users can re-present —
              eliminating repeat KYC across supporting apps.
            </p>
          </div>
        </div>

        {/* Two-column: Credential card (left) + Flow steps (right) */}
        <div className="vc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

          {/* Left: Animated credential card */}
          <div className="v2-reveal" style={{
            padding: 32,
            border: '1px solid var(--rule)',
            background: 'var(--panel)',
            minWidth: 0,
            position: 'relative',
          }}>
            {/* Credential header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Identity Credential
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
                  W3C Verifiable Credential &middot; JWT-VC
                </div>
              </div>
              {/* Animated seal */}
              <div className="vc-seal" style={{
                width: 40, height: 40,
                background: 'var(--accent-soft)',
                border: '1px solid var(--rule)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
            </div>

            {/* Claims */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'name', value: 'Jane Doe' },
                { label: 'dateOfBirth', value: '1990-01-15' },
                { label: 'nationality', value: 'US' },
                { label: 'documentType', value: 'drivers_license' },
                { label: 'faceMatchScore', value: '0.94' },
                { label: 'verifiedAt', value: '2026-04-04T14:32Z' },
              ].map((claim, i) => (
                <div key={claim.label} className="vc-claim-row" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--rule)',
                  animationDelay: `${i * 0.12}s`,
                }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{claim.label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: 'var(--accent)' }}>{claim.value}</span>
                </div>
              ))}
            </div>

            {/* JWT scroll */}
            <div style={{
              overflow: 'hidden',
              background: C.codeBg,
              padding: '8px 0',
              border: '1px solid var(--rule)',
            }}>
              <div className="vc-jwt-scroll" style={{
                fontFamily: C.mono, fontSize: 9, color: C.dim, whiteSpace: 'nowrap',
                display: 'inline-block', paddingLeft: 12,
              }}>
                eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRlbnRpdHlDcmVkZW50aWFsIl19fQ.
                <span style={{ opacity: 0.4 }}>
                  Tl1jCvHe5d5D3k2YJlQzBNqR8X9fZwVHkJGKse4zXyM
                </span>
                &nbsp;&nbsp;&nbsp;&nbsp;
                eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRlbnRpdHlDcmVkZW50aWFsIl19fQ.
                <span style={{ opacity: 0.4 }}>
                  Tl1jCvHe5d5D3k2YJlQzBNqR8X9fZwVHkJGKse4zXyM
                </span>
              </div>
            </div>

            {/* Issuer info */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, background: 'var(--accent)' }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
                Signed by did:web:api.idswyft.app &middot; Ed25519
              </span>
            </div>

            {/* Exported identity card preview */}
            <div style={{ marginTop: 24, borderTop: '1px solid var(--rule)', paddingTop: 20 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                Exportable Identity Card
              </div>
              <div style={{
                overflow: 'hidden',
                border: '1px solid var(--rule)',
              }}>
                <img
                  src="/vc-identity-card.png"
                  alt="Idswyft Verifiable Credential identity card"
                  style={{ width: '100%', display: 'block' }}
                />
              </div>
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginTop: 8 }}>
                Download as PNG or PDF — ISO ID-1 card dimensions
              </p>
            </div>
          </div>

          {/* Right: Flow steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              {
                step: '01',
                title: 'Verify identity',
                desc: 'User completes standard verification — document OCR, cross-validation, liveness, face match.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="0" /><circle cx="9" cy="12" r="2" /><path d="M15 10h2M15 14h2" /></svg>,
              },
              {
                step: '02',
                title: 'Issue credential',
                desc: 'Idswyft signs a JWT-VC with your issuer DID. Claims include name, DOB, nationality, and face match score.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>,
              },
              {
                step: '03',
                title: 'Re-present anywhere',
                desc: 'User shares the credential with other apps. They verify the signature against your public DID document — no API call needed.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
              },
            ].map((item, i) => (
              <div key={item.step} className="v2-reveal" style={{
                padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start',
                border: '1px solid var(--rule)', background: 'var(--panel)',
                ...({ '--reveal-delay': `${i * 0.15}s` } as React.CSSProperties),
              }}>
                <div style={{
                  minWidth: 44, height: 44,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--rule)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em' }}>{item.step}</span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{item.title}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                </div>
              </div>
            ))}

            {/* DID resolution note */}
            <div className="v2-reveal" style={{
              padding: '16px 20px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--rule)',
              display: 'flex', alignItems: 'center', gap: 12,
              ...({ '--reveal-delay': '0.45s' } as React.CSSProperties),
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: 'var(--accent)', marginBottom: 2 }}>did:web resolution</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                  Public key auto-served at <code style={{ fontFamily: C.mono, fontSize: 11, color: 'var(--mid)' }}>/.well-known/did.json</code> — no blockchain, no registration.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tech specs */}
        <div className="v2-reveal vc-tech-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
          marginTop: 56, border: '1px solid var(--rule)',
        }}>
          {[
            { label: 'Format', value: 'JWT-VC' },
            { label: 'Signing', value: 'Ed25519 (EdDSA)' },
            { label: 'DID Method', value: 'did:web' },
            { label: 'Validity', value: '2 years' },
          ].map(({ label, value }, i) => (
            <div key={label} style={{
              textAlign: 'center', padding: '20px 16px',
              borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
              background: 'var(--panel)',
            }}>
              <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 4, fontFamily: C.mono }}>{label}</div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── 06. PRICING ──────────────────────────────────── */}
      <section className="section" style={{ padding: '100px 0' }}>
        <div className="wrap">
        <div className="v2-reveal section-head" style={{ marginBottom: 56 }}>
          <span className="section-index">06 — Pricing</span>
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 12 }}>
              Pricing
            </div>
            <h2 className="section-title" style={{ fontFamily: C.mono, marginBottom: 8 }}>
              Start free. Scale when ready.
            </h2>
            <p style={{ color: 'var(--mid)', fontSize: 15 }}>Self-host for free. Or let us run it for you.</p>
          </div>
        </div>

        <div className="v2-stagger-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0, border: '1px solid var(--rule)' }}>
          {/* Community */}
          <div style={{
            padding: 28, position: 'relative',
            borderRight: '1px solid var(--rule)',
            background: 'var(--panel)',
            borderTop: '2px solid var(--accent)',
          }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--accent)', color: 'var(--paper)',
              fontFamily: C.mono, fontSize: 11, fontWeight: 600,
              padding: '4px 14px',
              letterSpacing: '0.04em',
            }}>Open Source</div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 16 }}>Community Edition</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>Free</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>forever</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['Unlimited verifications', 'Full source code (MIT)', 'Your infrastructure', 'No rate limits', 'Community support'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <a href="https://github.com/team-idswyft/idswyft-community" target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '12px 20px',
                fontWeight: 600, fontSize: 13, textDecoration: 'none',
                background: 'var(--ink)', color: 'var(--paper)',
                border: '1px solid var(--ink)',
              }}>
              View on GitHub
            </a>
          </div>

          {/* Starter */}
          <div style={{
            padding: 28,
            borderRight: '1px solid var(--rule)',
            background: 'var(--panel)',
          }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: 'var(--mid)', marginBottom: 16 }}>Cloud Starter</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>$0</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['50 verifications / month', 'Managed hosting', 'Email support', '99.5% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <Link to="/developer" style={{
              display: 'block', textAlign: 'center', padding: '12px 20px',
              fontWeight: 600, fontSize: 13, textDecoration: 'none',
              border: '1px solid var(--rule-strong)', color: 'var(--ink)',
              background: 'transparent',
            }}>
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div style={{
            padding: 28, position: 'relative',
            background: 'var(--panel)',
          }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: C.surface, color: 'var(--mid)',
              fontFamily: C.mono, fontSize: 11, fontWeight: 600,
              padding: '4px 14px', letterSpacing: '0.04em',
              border: '1px solid var(--rule)',
            }}>
              Coming Soon
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: 'var(--mid)', marginBottom: 16 }}>Cloud Pro</div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>$49</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 8 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {['2,000 verifications / month', 'Priority support', 'Audit logs & backups', '99.9% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {item}
                </div>
              ))}
            </div>
            <span style={{
              display: 'block', textAlign: 'center', padding: '12px 20px',
              fontWeight: 600, fontSize: 13,
              background: 'transparent', border: '1px solid var(--rule)',
              color: C.dim, cursor: 'default',
            }}>
              Coming Soon
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <Link to="/pricing" style={{ color: 'var(--accent)', fontSize: 14, fontFamily: C.mono, textDecoration: 'none' }}>
            Compare all features →
          </Link>
        </div>
        </div>
      </section>

      {/* ── 07. USE CASES ────────────────────────────────── */}
      <section className="section v2-reveal" style={{ padding: '100px 0' }}>
        <div className="wrap">
        <div className="section-head" style={{ marginBottom: 48 }}>
          <span className="section-index">07 — Use Cases</span>
          <div>
            <h2 className="section-title" style={{ fontFamily: C.mono }}>
              The identity layer for regulated products.
            </h2>
            <p className="section-sub" style={{ color: 'var(--mid)', maxWidth: '58ch', fontSize: 16 }}>
              Fintech, marketplaces, gig platforms, crypto — the same primitives, tuned to your risk model.
            </p>
          </div>
        </div>

        {/* Tab row */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)', marginBottom: 24, overflowX: 'auto',
        }}>
          {([
            { key: 'fintech' as const, label: 'Fintech onboarding' },
            { key: 'market' as const, label: 'Marketplaces' },
            { key: 'crypto' as const, label: 'Crypto & Web3' },
            { key: 'gig' as const, label: 'Gig & sharing' },
            { key: 'health' as const, label: 'Healthcare' },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveCase(tab.key)} style={{
              fontFamily: C.mono, fontSize: 12, padding: '14px 18px',
              cursor: 'pointer', background: 'transparent', border: 'none',
              color: activeCase === tab.key ? 'var(--ink)' : 'var(--mid)',
              borderBottom: `2px solid ${activeCase === tab.key ? 'var(--ink)' : 'transparent'}`,
              marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {(() => {
          const cases = {
            fintech: {
              title: 'Open an account in minutes, not weeks.',
              body: 'Replace the KYC vendor stack with one call. Pair document + liveness in a single flow, with country-specific rules that live in your codebase.',
              stats: [['94%', 'first-try pass rate'], ['< 3s', 'median flow time']] as [string, string][],
              viz: ['step.01  \u2502  collect document', 'step.02  \u2502  liveness (passive)', 'step.03  \u2502  cross-validation', 'step.04  \u2502  webhook \u2192 /onboarding/complete'],
            },
            market: {
              title: 'Verify sellers without breaking the listing flow.',
              body: 'Deferred verification hooks run in the background while the seller keeps editing. Only block on high-risk categories.',
              stats: [['+31%', 'seller activation'], ['\u221262%', 'fraudulent listings']] as [string, string][],
              viz: ['trigger  \u2502  listing.published', 'if price > $500 \u2192 verify', 'else        \u2192 defer 24h', 'pass     \u2192 badge.issued'],
            },
            crypto: {
              title: 'Travel Rule\u2013ready from day one.',
              body: 'Source-of-funds and sanctions screening on top of the core pipeline. Ship custody and on-ramp products without building a compliance team.',
              stats: [['47', 'sanctions lists'], ['T+0', 'travel rule export']] as [string, string][],
              viz: ['scope    \u2502  custody + on-ramp', 'jurisdic.\u2502  US \u00B7 EU \u00B7 UK \u00B7 SG', 'exports  \u2502  travel-rule JSON', 'residency\u2502  region-pinned'],
            },
            gig: {
              title: 'Onboard workers at shift-start.',
              body: 'Mobile-first capture that works anywhere. Re-verify right-to-work and licenses on the schedule the regulator dictates.',
              stats: [['< 45s', 'end-to-end capture'], ['auto', 're-verify on expiry']] as [string, string][],
              viz: ['device   \u2502  android \u00B7 ios \u00B7 web', 'recur    \u2502  on expiry \u2212 30d', 'fallback \u2502  human review < 2m', 'coverage \u2502  20+ countries'],
            },
            health: {
              title: 'Age + identity, without the PII leakage.',
              body: 'Age estimation for restricted products, or full identity for telehealth. Minimal data collection for the lightest possible flow.',
              stats: [['HIPAA', 'compliant path'], ['0', 'PII stored on minimal path']] as [string, string][],
              viz: ['mode     \u2502  estimate | verify', 'outputs  \u2502  \u226518 \u00B7 \u226521 \u00B7 DOB', 'minimal  \u2502  no-retention', 'audit    \u2502  proof archive'],
            },
          }
          const c = cases[activeCase]
          return (
            <div className="case-content-grid" style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40, padding: '16px 0 0', minHeight: 320,
            }}>
              {/* LEFT: copy + stats */}
              <div>
                <h4 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 500, lineHeight: 1.1, marginBottom: 14, marginTop: 0 }}>
                  {c.title}
                </h4>
                <p style={{ color: 'var(--mid)', maxWidth: '56ch', margin: 0 }}>{c.body}</p>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 24,
                  border: '1px solid var(--rule)',
                }}>
                  {c.stats.map(([n, l], i) => (
                    <div key={l} style={{
                      padding: 18, borderRight: i === 0 ? '1px solid var(--rule)' : 'none',
                    }}>
                      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{n}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 11, color: 'var(--mid)' }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* RIGHT: viz panel */}
              <div style={{
                border: '1px solid var(--rule)', padding: 20,
                background: 'linear-gradient(var(--panel), var(--panel)) padding-box, repeating-linear-gradient(0deg, var(--rule) 0 1px, transparent 1px 40px)',
                fontFamily: C.mono, fontSize: 11, color: 'var(--mid)', minHeight: 280,
              }}>
                {c.viz.map((row, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
                    <span style={{ color: 'var(--mid)' }}>{`0${i + 1}  `}</span>{row}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
        </div>
      </section>

      {/* ── 08. FOUNDER ───────────────────────────────────── */}
      <section className="section v2-reveal" style={{
        padding: '100px 0',
        borderTop: '1px solid var(--rule)',
      }}>
        <div className="wrap">
        <div style={{ border: '1px solid var(--rule)', background: 'var(--panel)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>

            {/* Photo side */}
            <div style={{
              flex: '0 0 200px', minHeight: 240, position: 'relative',
              background: `url(https://res.cloudinary.com/doobee46/image/upload/v1680066932/seed_photo/doobee.jpg) center/cover no-repeat`,
            }}>
              <div style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                background: 'var(--ink)', color: 'var(--paper)',
                fontFamily: C.mono, fontSize: 9, fontWeight: 700,
                padding: '5px 12px',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                Founder
              </div>
            </div>

            {/* Quote side */}
            <div style={{ flex: 1, minWidth: 260, padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {/* Quote mark */}
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 48, color: 'var(--accent)', lineHeight: 1, marginBottom: 8, opacity: 0.5 }}>"</div>

              <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.75, marginBottom: 16 }}>
                I built Idswyft because every identity verification service I tried was either
                ridiculously expensive, locked behind enterprise sales calls, or impossible to
                self-host. I wanted something a solo developer could spin up in an afternoon —
                with real OCR, real liveness detection, and real face matching — without
                handing user data to a third party.
              </p>

              <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.75, marginBottom: 24 }}>
                So I used my understanding of software engineering and the power of coding
                agents to build the tool I wished existed. Now it's yours — open source,
                self-hostable, and free forever.
              </p>

              <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Obed Lorisson</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: 'var(--mid)' }}>Founder & Developer</span>
                  <a href="https://github.com/doobee46" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mid)', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--mid)')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Motivation cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, marginTop: 20, border: '1px solid var(--rule)' }}>
          {[
            { icon: '\u{1F4B8}', title: 'Cost Barrier', desc: 'Per-verification pricing made KYC unaffordable for small projects.' },
            { icon: '\u{1F512}', title: 'Data Sovereignty', desc: 'Sending user photos to third-party APIs felt wrong. Self-hosting was non-negotiable.' },
            { icon: '\u26A1', title: 'Developer Experience', desc: '5 REST endpoints, one Docker command. No SDKs-for-SDKs complexity.' },
          ].map((card, i) => (
            <div key={card.title} style={{
              padding: '20px 18px', textAlign: 'center',
              borderRight: i < 2 ? '1px solid var(--rule)' : 'none',
              background: 'var(--panel)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.6 }}>{card.desc}</div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── 09. CTA ──────────────────────────────────────── */}
      <section style={{
        borderTop: '1px solid var(--rule)', padding: '80px 0',
        background: 'radial-gradient(ellipse at 70% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 55%), var(--paper)',
      }}>
        <div className="wrap cta-grid" style={{
          display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40, alignItems: 'end',
        }}>
          {/* LEFT */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>{'// ship identity this week'}</div>
            <h2 style={{
              fontSize: 'clamp(40px, 5vw, 64px)', letterSpacing: '-0.03em', fontWeight: 500,
              lineHeight: 1.02, margin: '0 0 16px',
            }}>
              Integration to first verified user in{' '}
              <span style={{ color: 'var(--accent-ink)', background: 'var(--accent-soft)', padding: '0 8px' }}>one afternoon.</span>
            </h2>
            <p style={{ color: 'var(--mid)', maxWidth: '48ch', margin: '0 0 28px' }}>
              Every plan starts on the sandbox with real document templates — no sales call. Generate a key and npm i.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/developer" style={{
                background: 'var(--ink)', color: 'var(--paper)', padding: '10px 16px',
                fontFamily: C.mono, fontSize: 12, textDecoration: 'none',
                border: '1px solid var(--ink)',
              }}>
                Get API Key &rarr;
              </Link>
              <Link to="/docs" style={{
                background: 'transparent', border: '1px solid var(--rule-strong)',
                color: 'var(--ink)', padding: '10px 16px',
                fontFamily: C.mono, fontSize: 12, textDecoration: 'none',
              }}>
                View Docs
              </Link>
            </div>
          </div>

          {/* RIGHT */}
          <div className="cta-specs" style={{
            fontFamily: C.mono, fontSize: 12, color: 'var(--mid)',
            borderLeft: '1px solid var(--rule)', paddingLeft: 32,
          }}>
            {[
              { label: 'setup', value: 'docker compose up' },
              { label: 'first verify', value: '< 5 minutes' },
              { label: 'cost', value: '$0 self-hosted' },
              { label: 'license', value: 'MIT' },
              { label: 'support', value: 'GitHub Issues' },
              { label: 'docs', value: 'idswyft.app/docs' },
            ].map((row, i) => (
              <div key={row.label} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12,
                padding: '8px 0',
                borderBottom: i < 5 ? '1px dashed var(--rule)' : 'none',
              }}>
                <span style={{ color: 'var(--mid)' }}>{row.label}</span>
                <span style={{ color: 'var(--ink)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
