import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Player } from '@remotion/player'
import { VerificationShowcase } from '../remotion/VerificationShowcase'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'

/* ── Inline SVG icon maps ────────────────────────────────── */

const ICON = C.cyan
const SW = 1.5 // strokeWidth for feature icons

const featureIcons: Record<string, React.ReactNode> = {
  'OCR Extraction': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="14" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  ),
  'Back-of-ID / Barcode': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><line x1="6" y1="8" x2="6" y2="16" /><line x1="9" y1="8" x2="9" y2="16" /><line x1="12" y1="8" x2="12" y2="14" /><line x1="15" y1="8" x2="15" y2="16" /><line x1="18" y1="8" x2="18" y2="13" />
    </svg>
  ),
  'Liveness Detection': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M2 12c2.5-5 6-8 10-8s7.5 3 10 8c-2.5 5-6 8-10 8s-7.5-3-10-8z" />
    </svg>
  ),
  'Face Matching': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="10" r="6" /><circle cx="15" cy="10" r="6" opacity="0.5" /><path d="M12 18v3" /><line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  ),
  'Webhooks': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6" /><path d="M12 9l6 4" /><path d="M12 9l-6 4" /><circle cx="12" cy="3" r="1.5" /><circle cx="18" cy="13" r="1.5" /><circle cx="6" cy="13" r="1.5" /><path d="M18 13l0 4" /><path d="M6 13l0 4" />
    </svg>
  ),
  'GDPR Compliant': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" /><polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  'JavaScript SDK': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  ),
  'Batch API': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" /><rect x="6" y="6" width="12" height="4" rx="1" opacity="0.6" /><rect x="8" y="2" width="8" height="4" rx="1" opacity="0.35" />
    </svg>
  ),
  'Monitoring': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
}

const pipelineIcons: Record<string, React.ReactNode> = {
  '01': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={2} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  '02': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><polyline points="8 12 11 15 16 9" />
    </svg>
  ),
  '03': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  '04': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
    </svg>
  ),
  '05': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
}

/* ── useCountUp hook ─────────────────────────────────────── */

function useCountUp(target: number, duration = 1000) {
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
            // ease-out cubic
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

/* ── Stat card with count-up ─────────────────────────────── */

function StatCard({ numericTarget, prefix, suffix, label }: {
  numericTarget: number | null
  prefix: string
  suffix: string
  label: string
}) {
  const { ref, value } = useCountUp(numericTarget ?? 0)
  const display = numericTarget !== null ? `${prefix}${value}${suffix}` : `${prefix}${suffix}`
  return (
    <div ref={ref} className="landing-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontFamily: C.mono, fontSize: 13 }}>
      <span style={{ color: C.cyan, fontWeight: 600 }}>{display}</span>
      <span style={{ color: C.muted, marginLeft: 8 }}>{label}</span>
    </div>
  )
}

const JS_CODE = `const BASE = 'https://api.idswyft.app'
const KEY  = 'your-api-key'
const h    = { 'X-API-Key': KEY }

// 1. Create verification session
const { verification_id } = await fetch(\`\${BASE}/api/v2/verify/initialize\`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ document_type: 'drivers_license' }),
}).then(r => r.json())

// 2. Upload front of ID
const front = new FormData()
front.append('document', frontFile)
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/front-document\`, { method: 'POST', headers: h, body: front })

// 3. Upload back of ID
const back = new FormData()
back.append('document', backFile)
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/back-document\`, { method: 'POST', headers: h, body: back })

// 4. Upload live capture for liveness + face match
const capture = new FormData()
capture.append('image', captureFile)
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/live-capture\`, { method: 'POST', headers: h, body: capture })

// 5. Get results
const result = await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/status\`, { headers: h }).then(r => r.json())
console.log(result.status) // 'verified' | 'failed' | 'manual_review'`

const PY_CODE = `import requests

BASE = "https://api.idswyft.app"
KEY  = "your-api-key"
H    = {"X-API-Key": KEY}

# 1. Create verification session
r = requests.post(f"{BASE}/api/v2/verify/initialize",
    json={"document_type": "drivers_license"}, headers={**H, "Content-Type": "application/json"})
verification_id = r.json()["verification_id"]

# 2. Upload front of ID
with open("front.jpg", "rb") as f:
    requests.post(f"{BASE}/api/v2/verify/{verification_id}/front-document",
        files={"document": f}, headers=H)

# 3. Upload back of ID
with open("back.jpg", "rb") as f:
    requests.post(f"{BASE}/api/v2/verify/{verification_id}/back-document",
        files={"document": f}, headers=H)

# 4. Upload live capture for liveness + face match
with open("capture.jpg", "rb") as f:
    requests.post(f"{BASE}/api/v2/verify/{verification_id}/live-capture",
        files={"image": f}, headers=H)

# 5. Get results
result = requests.get(f"{BASE}/api/v2/verify/{verification_id}/status", headers=H).json()
print(result["status"])  # 'verified' | 'failed' | 'manual_review'`

function CodeStrip() {
  const [tab, setTab] = useState<'js' | 'py'>('js')
  const code = tab === 'js' ? JS_CODE : PY_CODE
  const codeLines = code.split('\n')
  const codeFont = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace"
  const keywords = new Set(
    tab === 'js'
      ? ['const', 'await', 'async', 'method', 'headers', 'body', 'return', 'then', 'new']
      : ['import', 'with', 'as', 'for', 'in']
  )

  const renderHighlightedLine = (line: string) => {
    const commentMatch = line.match(/(\s\/\/.*$|\s#.*$|^\/\/.*$|^#.*$)/)
    const codePart = commentMatch ? line.slice(0, commentMatch.index) : line
    const commentPart = commentMatch ? line.slice(commentMatch.index) : ''
    const tokens = codePart.split(/(\s+|[()[\]{}.,:=])/).filter(token => token.length > 0)

    return (
      <>
        {tokens.map((token, idx) => {
          if (/^\s+$/.test(token)) {
            return <span key={`ws-${idx}`} style={{ whiteSpace: 'pre' }}>{token}</span>
          }

          const plain = token.replace(/[()[\]{}.,:=]/g, '')
          const isString = /^f?["'`].*["'`]$/.test(plain)
          const isNumber = /^\d+$/.test(plain)
          const isFunction = /^(fetch|print|open|FormData|console|log|requests|post|get|stringify|json)$/.test(plain)
          const isKeyword = keywords.has(plain)

          const color = isString
            ? C.amber
            : isKeyword
              ? C.cyan
              : isFunction
                ? C.green
                : isNumber
                  ? C.red
                  : C.code

          return (
            <span key={`tok-${idx}`} style={{ color, fontWeight: isKeyword ? 600 : 400 }}>
              {token}
            </span>
          )
        })}
        {commentPart && <span style={{ color: C.muted }}>{commentPart}</span>}
      </>
    )
  }

  return (
    <section style={{ padding: '64px 24px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Quickstart
        </h2>
        <p style={{ color: C.muted, fontSize: 14 }}>The complete five-step verification flow.</p>
      </div>
      <div style={{ background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 16px' }}>
          {(['js', 'py'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px',
              fontFamily: codeFont, fontSize: 12,
              color: tab === t ? C.cyan : C.muted,
              borderBottom: tab === t ? `2px solid ${C.cyan}` : '2px solid transparent',
              marginBottom: -1,
            }}>
              {t === 'js' ? 'JavaScript' : 'Python'}
            </button>
          ))}
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, opacity: 0.8 }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber, opacity: 0.8 }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, opacity: 0.8 }} />
          </div>
          <div style={{ fontFamily: codeFont, fontSize: 11, color: C.muted }}>
            quickstart.{tab === 'js' ? 'js' : 'py'}
          </div>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ overflowX: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              {codeLines.map((line, index) => (
                <tr key={`${tab}-line-${index + 1}`}>
                  <td
                    style={{
                      width: 44,
                      textAlign: 'right',
                      verticalAlign: 'top',
                      padding: '0 10px 0 0',
                      color: C.dim,
                      fontFamily: codeFont,
                      fontSize: 12,
                      userSelect: 'none',
                      borderRight: `1px solid ${C.border}`,
                      background: C.surface,
                    }}
                  >
                    {index + 1}
                  </td>
                  <td
                    style={{
                      padding: '0 16px 0 12px',
                      color: C.code,
                      fontFamily: codeFont,
                      fontSize: 13,
                      lineHeight: 1.75,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {line ? renderHighlightedLine(line) : ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>
          Full reference in docs →
        </Link>
      </div>
    </section>
  )
}

function useScrollReveal() {
  useEffect(() => {
    // Assign staggered delays to grid children
    document.querySelectorAll('.landing-cards-grid').forEach(grid => {
      Array.from(grid.children).forEach((child, i) => {
        ;(child as HTMLElement).style.setProperty('--reveal-delay', `${i * 0.08}s`)
        child.classList.add('scroll-reveal')
      })
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    )
    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

export function HomePage() {
  useEffect(() => { injectFonts() }, [])
  useScrollReveal()

  return (
    <div className="pattern-diagonal-wave pattern-faint pattern-animate-diagonal pattern-full" style={{ background: C.bg, color: C.text, fontFamily: C.sans }}>

      {/* 1. HERO */}
      <section className="landing-hero" style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '96px 24px 64px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(34,211,238,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Floating particles */}
        {[
          { top: '22%', left: '18%', size: 4, anim: 'heroFloat1', dur: '6s' },
          { top: '35%', left: '78%', size: 3, anim: 'heroFloat2', dur: '8s' },
          { top: '60%', left: '30%', size: 3, anim: 'heroFloat3', dur: '7s' },
          { top: '50%', left: '72%', size: 2, anim: 'heroFloat1', dur: '9s' },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute', top: p.top, left: p.left,
            width: p.size, height: p.size, borderRadius: '50%',
            background: C.cyan, opacity: 0.4, pointerEvents: 'none',
            animation: `${p.anim} ${p.dur} ease-in-out infinite`,
          }} />
        ))}
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, letterSpacing: '0.08em', marginBottom: 32, position: 'relative' }}>
          idswyft / identity-verification
        </div>
        <h1 style={{
          fontFamily: C.mono,
          fontSize: 'clamp(36px, 6vw, 72px)',
          fontWeight: 600, color: C.text, lineHeight: 1.1, marginBottom: 24, maxWidth: 700,
        }}>
          Verify identities.<br />
          <span style={{ color: C.cyan }}>In minutes.</span>
        </h1>
        <p style={{ fontSize: 18, color: C.muted, maxWidth: 480, lineHeight: 1.6, marginBottom: 48 }}>
          Open-source document verification API. Integrate in under 30 minutes.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64 }}>
          <Link to="/developer" style={{ background: C.cyan, color: C.bg, padding: '12px 28px', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Get API Key
          </Link>
          <Link to="/demo" style={{ border: `1px solid ${C.border}`, color: C.text, padding: '12px 28px', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Try Demo
          </Link>
          <Link to="/docs" style={{ color: C.muted, padding: '12px 20px', fontSize: 15, textDecoration: 'none' }}>
            View Docs →
          </Link>
        </div>
        <div className="landing-cards-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', position: 'relative' }}>
          <StatCard numericTarget={90} prefix=">" suffix="%" label="Accuracy Target" />
          <StatCard numericTarget={5}  prefix="<" suffix="s" label="OCR Latency (p95)" />
          <StatCard numericTarget={20} prefix=""  suffix=""  label="Countries" />
          <StatCard numericTarget={null} prefix="" suffix="MIT" label="License" />
        </div>
      </section>

      {/* 2. PIPELINE */}
      <section className="scroll-reveal pattern-topographic pattern-faint pattern-fade-edges pattern-full" style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            The verification flow
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text }}>
            Five steps, one API
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto' }}>
          {[
            { n: '01', title: 'Create Session', desc: 'POST /sessions' },
            { n: '02', title: 'Upload Front',   desc: 'POST /upload-front' },
            { n: '03', title: 'Upload Back',    desc: 'POST /upload-back' },
            { n: '04', title: 'Live Capture',   desc: 'POST /live-capture' },
            { n: '05', title: 'Get Results',    desc: 'GET /status' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.n}>
              {/* Step node — icon in circle, number below */}
              <div style={{ flexShrink: 0, width: 140, textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: C.cyanDim, border: `1px solid ${C.cyan}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 4px',
                }}>
                  {pipelineIcons[step.n]}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 8 }}>{step.n}</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{step.desc}</div>
              </div>
              {/* Animated dashed connector */}
              {i < arr.length - 1 && (
                <div style={{ flex: 1, minWidth: 16, marginTop: 22, flexShrink: 1, display: 'flex', alignItems: 'center' }}>
                  <svg width="100%" height="2" style={{ overflow: 'visible' }}>
                    <line x1="0" y1="1" x2="100%" y2="1" stroke={C.cyan} strokeWidth="1" strokeDasharray="6 4" strokeOpacity="0.4" style={{ animation: 'pipelineFlow 1.2s linear infinite' }} />
                  </svg>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* 2.5. VERIFICATION SHOWCASE VIDEO */}
      <section className="scroll-reveal pattern-shield pattern-faint pattern-full" style={{ background: C.bg, padding: '96px 24px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap', justifyContent: 'center' }}>

          {/* Left column: marketing copy */}
          <div style={{ flex: '1 1 380px', maxWidth: 480 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              See it in action
            </div>
            <h2 style={{ fontFamily: C.sans, fontSize: 32, fontWeight: 700, color: C.text, lineHeight: 1.2, marginBottom: 16 }}>
              From document scan to verified identity — in under 3 minutes
            </h2>
            <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
              Your users scan the front and back of their ID, take a quick live photo,
              and our engine handles the rest. Cross-validation, barcode parsing,
              liveness checks, and face matching — all in one seamless flow.
            </p>

            {/* Feature bullets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
              {[
                { title: 'Smart document detection', desc: 'Automatic ID type recognition with guided capture overlay.' },
                { title: 'Cross-validation engine', desc: 'Front-side OCR vs back-side barcode or MRZ — inconsistencies flagged instantly across 19+ countries.' },
                { title: 'Liveness + face match', desc: 'Anti-spoof live capture compared against the document photo in real time.' },
                { title: 'Instant results', desc: 'Verified, failed, or flagged for review — webhook delivered within seconds.' },
              ].map(({ title, desc }) => (
                <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, marginTop: 7, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 32 }}>
              {[
                { value: '<3 min', label: 'Verification time' },
                { value: '<5s', label: 'OCR p95 latency' },
                { value: '5 steps', label: 'Guided flow' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 600, color: C.cyan }}>{value}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: phone mockup */}
          <div style={{ flex: '0 0 auto', position: 'relative' }}>
            {/* Ambient glow behind phone */}
            <div style={{
              position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
              width: 300, height: 500, borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(34,211,238,0.06) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            <Player
              component={VerificationShowcase}
              durationInFrames={1140}
              fps={30}
              compositionWidth={390}
              compositionHeight={844}
              style={{ width: 290, height: 628, borderRadius: 36, position: 'relative', zIndex: 1 }}
              autoPlay
              loop
              controls={false}
            />
          </div>
        </div>
      </section>

      {/* 3. CODE STRIP */}
      <CodeStrip />

      {/* 4. FEATURES */}
      <section className="scroll-reveal pattern-crosshatch pattern-faint pattern-fade-edges pattern-full" style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text }}>
            Built-in capabilities
          </h2>
        </div>
        <div className="landing-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            { title: 'OCR Extraction',       desc: 'Name, DOB, document number, expiry — extracted from passports, driver\'s licenses, and national IDs across 20 countries.', tags: [] as string[] },
            { title: 'Back-of-ID / Barcode', desc: 'PDF417 barcodes (US), MRZ zones (international), and QR codes — all cross-validated against front-side data.', tags: [] as string[] },
            { title: 'Liveness Detection',   desc: 'Anti-spoof scoring with live capture to confirm a real person is present. Detects printed photos, screen replays, and 3D masks.', tags: [] as string[] },
            { title: 'Face Matching',         desc: 'Live capture matched against document photo with a configurable confidence threshold.', tags: [] as string[] },
            { title: 'Webhooks',              desc: 'Real-time POST callbacks on status changes — verified, failed, or manual_review.', tags: [] as string[] },
            { title: 'GDPR Compliant',        desc: 'Configurable data retention, deletion endpoints, and encrypted storage at rest.', tags: [] as string[] },
            { title: 'JavaScript SDK',        desc: 'Drop-in TypeScript SDK with IdswyftEmbed component, real-time event watcher, and automatic error handling.', tags: ['npm install', 'TypeScript', 'watch()'] },
            { title: 'Batch API',             desc: 'Process hundreds of verifications in a single API call. Controlled concurrency, progress tracking, and webhook on completion.', tags: ['Enterprise', 'Bulk Import', 'Async'] },
            { title: 'Monitoring',            desc: 'Document expiry alerts at 90/60/30 days and scheduled re-verification reminders via webhook.', tags: ['Expiry Alerts', 'Re-verify', 'Cron'] },
          ].map(({ title, desc, tags }) => (
            <div className="landing-card" key={title} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.cyan}`, borderRadius: 8, padding: '24px 20px' }}>
              <div style={{ marginBottom: 12, opacity: 0.85 }}>{featureIcons[title]}</div>
              <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{desc}</div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {tags.map(tag => (
                    <span key={tag} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, background: C.cyanDim, border: `1px solid ${C.cyanBorder}`, borderRadius: 4, padding: '2px 8px' }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5. INTEGRATION OPTIONS */}
      <section className="scroll-reveal" style={{ padding: '64px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text }}>
            Three ways to integrate
          </h2>
        </div>
        <div className="landing-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          <div className="landing-card" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 28 }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, color: C.cyan, marginBottom: 12 }}>Option A</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: C.text, marginBottom: 10 }}>Ready-Made Verification Page</div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Redirect users to a hosted verification flow. Branded with your logo. Zero frontend work.
            </div>
            <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>See hosted flow docs →</Link>
          </div>
          <div className="landing-card" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 28 }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, color: C.muted, marginBottom: 12 }}>Option B</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: C.text, marginBottom: 10 }}>Custom API Integration</div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Call the REST API directly from your backend. Full control over UX and data handling.
            </div>
            <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>Read the API reference →</Link>
          </div>
          <div className="landing-card" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 28 }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, color: C.cyan, marginBottom: 12 }}>Option C</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: C.text, marginBottom: 10 }}>SDK Embed</div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Drop-in iframe component. Modal or inline mode. <span style={{ fontFamily: C.mono, fontSize: 12 }}>npm install @idswyft/sdk</span> — 3 lines of code.
            </div>
            <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>See SDK docs →</Link>
          </div>
        </div>
      </section>

      {/* 6. USE CASES */}
      <section className="scroll-reveal" style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>
          Use cases
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640, margin: '0 auto' }}>
          {[
            'Fintech KYC', 'Marketplace Trust', 'Age Verification',
            'Account Recovery', 'Remote Onboarding', 'Healthcare',
            'AML Compliance', 'Batch Onboarding', 'Document Monitoring',
          ].map(label => (
            <span key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '8px 16px', fontSize: 13, color: C.muted }}>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* 7. PRICING PREVIEW */}
      <section className="scroll-reveal" style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Pricing
          </div>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            Start free. Scale when ready.
          </h2>
          <p style={{ color: C.muted, fontSize: 15 }}>
            Self-host the full engine or let us run it for you.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {/* Community — prominent */}
          <div style={{
            background: C.panel,
            border: `2px solid ${C.cyan}`,
            borderRadius: 14,
            padding: 28,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: C.cyan, color: C.bg,
              fontFamily: C.mono, fontSize: 11, fontWeight: 600,
              padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
            }}>
              Open Source
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.cyan, marginBottom: 12 }}>
              Community Edition
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 700, color: C.text }}>Free</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 6 }}>forever</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {['Unlimited verifications', 'Full source code (MIT)', 'Your infrastructure, your data', 'No rate limits', 'Community support'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
            <a
              href="https://github.com/team-idswyft/idswyft"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: 8,
                fontWeight: 600, fontSize: 13, textDecoration: 'none',
                background: C.cyan, color: C.bg,
              }}
            >
              View on GitHub
            </a>
          </div>

          {/* Cloud Starter */}
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 28,
          }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 12 }}>
              Cloud Starter
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 700, color: C.text }}>$0</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 6 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {['50 verifications / month', 'Managed hosting', 'Email support', '99.5% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
            <Link
              to="/developer"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: 8,
                fontWeight: 600, fontSize: 13, textDecoration: 'none',
                border: `1px solid ${C.border}`, color: C.text,
              }}
            >
              Get Started
            </Link>
          </div>

          {/* Cloud Pro */}
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 28,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: C.surface, color: C.muted,
              fontFamily: C.mono, fontSize: 11, fontWeight: 600,
              padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
              border: `1px solid ${C.border}`,
            }}>
              Coming Soon
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 12 }}>
              Cloud Pro
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 700, color: C.text }}>$49</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.dim, marginLeft: 6 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {['2,000 verifications / month', 'Priority support + monitoring', 'Audit logs & daily backups', '99.9% uptime SLA'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
            <span
              style={{
                display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: 8,
                fontWeight: 600, fontSize: 13,
                background: C.surface, border: `1px solid ${C.border}`, color: C.dim,
                cursor: 'default',
              }}
            >
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

      {/* 8. CTA */}
      <section className="scroll-reveal pattern-guilloche pattern-subtle pattern-animate-slow pattern-full" style={{ padding: '80px 24px', textAlign: 'center', background: C.panel, borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 16 }}>
          Ready to integrate?
        </h2>
        <p style={{ color: C.muted, fontSize: 16, marginBottom: 36 }}>
          Self-host for free. No per-verification fees.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <Link to="/developer" style={{ background: C.cyan, color: C.bg, padding: '14px 36px', borderRadius: 8, fontWeight: 600, fontSize: 16, textDecoration: 'none' }}>
            Get Free API Key →
          </Link>
          <Link to="/pricing" style={{ border: `1px solid ${C.border}`, color: C.text, padding: '14px 28px', borderRadius: 8, fontWeight: 600, fontSize: 16, textDecoration: 'none' }}>
            View Pricing
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { value: '5 min', label: 'to first verification' },
            { value: '$0',    label: 'self-hosted' },
            { value: 'MIT',   label: 'open source' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 600, color: C.cyan }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
