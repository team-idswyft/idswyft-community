import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { C, injectFonts } from '../theme'

const JS_CODE = `const BASE = 'https://api.idswyft.app'
const KEY  = 'your-api-key'
const h    = { 'X-API-Key': KEY }

// 1. Create verification session
const { id } = await fetch(\`\${BASE}/api/verification/sessions\`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'sandbox' }),
}).then(r => r.json())

// 2. Upload front of ID
const front = new FormData()
front.append('document', frontFile)
await fetch(\`\${BASE}/api/verification/\${id}/upload-front\`, { method: 'POST', headers: h, body: front })

// 3. Upload back of ID
const back = new FormData()
back.append('document', backFile)
await fetch(\`\${BASE}/api/verification/\${id}/upload-back\`, { method: 'POST', headers: h, body: back })

// 4. Upload selfie for liveness + face match
const selfie = new FormData()
selfie.append('image', selfieFile)
await fetch(\`\${BASE}/api/verification/\${id}/upload-selfie\`, { method: 'POST', headers: h, body: selfie })

// 5. Get results
const result = await fetch(\`\${BASE}/api/verification/\${id}/status\`, { headers: h }).then(r => r.json())
console.log(result.status) // 'verified' | 'failed' | 'manual_review'`

const PY_CODE = `import requests

BASE = "https://api.idswyft.app"
KEY  = "your-api-key"
H    = {"X-API-Key": KEY}

# 1. Create verification session
r = requests.post(f"{BASE}/api/verification/sessions",
    json={"mode": "sandbox"}, headers={**H, "Content-Type": "application/json"})
session_id = r.json()["id"]

# 2. Upload front of ID
with open("front.jpg", "rb") as f:
    requests.post(f"{BASE}/api/verification/{session_id}/upload-front",
        files={"document": f}, headers=H)

# 3. Upload back of ID
with open("back.jpg", "rb") as f:
    requests.post(f"{BASE}/api/verification/{session_id}/upload-back",
        files={"document": f}, headers=H)

# 4. Upload selfie for liveness + face match
with open("selfie.jpg", "rb") as f:
    requests.post(f"{BASE}/api/verification/{session_id}/upload-selfie",
        files={"image": f}, headers=H)

# 5. Get results
result = requests.get(f"{BASE}/api/verification/{session_id}/status", headers=H).json()
print(result["status"])  # 'verified' | 'failed' | 'manual_review'`

function CodeStrip() {
  const [tab, setTab] = useState<'js' | 'py'>('js')
  const code = tab === 'js' ? JS_CODE : PY_CODE

  return (
    <section style={{ padding: '64px 24px', maxWidth: 720, margin: '0 auto' }}>
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
              fontFamily: C.mono, fontSize: 12,
              color: tab === t ? C.cyan : C.muted,
              borderBottom: tab === t ? `2px solid ${C.cyan}` : '2px solid transparent',
              marginBottom: -1,
            }}>
              {t === 'js' ? 'JavaScript' : 'Python'}
            </button>
          ))}
        </div>
        <pre style={{ margin: 0, padding: '20px 24px', fontFamily: C.mono, fontSize: 13, color: C.code, lineHeight: 1.7, overflowX: 'auto' }}>
          <code>{code}</code>
        </pre>
      </div>
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>
          Full reference in docs →
        </Link>
      </div>
    </section>
  )
}

export function HomePage() {
  useEffect(() => { injectFonts() }, [])

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans }}>

      {/* 1. HERO */}
      <section className="landing-hero" style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '96px 24px 64px', textAlign: 'center',
      }}>
        <div className="landing-hero-geometry" aria-hidden="true">
          <div className="geo geo-square" />
          <div className="geo geo-diamond" />
          <div className="geo geo-circle" />
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, letterSpacing: '0.08em', marginBottom: 32 }}>
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
        <div className="landing-cards-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { value: '99.8%', label: 'Accuracy' },
            { value: '<200ms', label: 'Response' },
            { value: '200+', label: 'Doc Types' },
            { value: 'MIT', label: 'License' },
          ].map(({ value, label }) => (
            <div className="landing-card" key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontFamily: C.mono, fontSize: 13 }}>
              <span style={{ color: C.cyan, fontWeight: 600 }}>{value}</span>
              <span style={{ color: C.muted, marginLeft: 8 }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. PIPELINE */}
      <section style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto' }}>
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
            { n: '04', title: 'Live Capture',   desc: 'POST /upload-selfie' },
            { n: '05', title: 'Get Results',    desc: 'GET /status' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.n}>
              {/* Step node — fixed width, never shrinks */}
              <div style={{ flexShrink: 0, width: 140, textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: C.cyanDim, border: `1px solid ${C.cyan}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                  fontFamily: C.mono, fontSize: 13, color: C.cyan, fontWeight: 600,
                }}>
                  {step.n}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{step.desc}</div>
              </div>
              {/* Connector line — sits between steps, aligned to circle center */}
              {i < arr.length - 1 && (
                <div style={{ flex: 1, minWidth: 16, height: 1, background: C.border, marginTop: 22, flexShrink: 1 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* 3. CODE STRIP */}
      <CodeStrip />

      {/* 4. FEATURES */}
      <section style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text }}>
            Built-in capabilities
          </h2>
        </div>
        <div className="landing-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            { title: 'OCR Extraction',       desc: 'Name, DOB, document number, expiry — extracted and structured from any government ID.' },
            { title: 'Back-of-ID / Barcode', desc: 'QR codes, PDF417 barcodes, and MRZ zones cross-validated against front-side data.' },
            { title: 'Liveness Detection',   desc: 'Challenge-response live capture to confirm a real person is present during verification.' },
            { title: 'Face Matching',         desc: 'Selfie matched against document photo with a configurable confidence threshold.' },
            { title: 'Webhooks',              desc: 'Real-time POST callbacks on status changes — verified, failed, or manual_review.' },
            { title: 'GDPR Compliant',        desc: 'Configurable data retention, deletion endpoints, and encrypted storage at rest.' },
          ].map(({ title, desc }) => (
            <div className="landing-card" key={title} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.cyan}`, borderRadius: 8, padding: '24px 20px' }}>
              <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. INTEGRATION OPTIONS */}
      <section style={{ padding: '64px 24px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text }}>
            Two ways to integrate
          </h2>
        </div>
        <div className="landing-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
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
        </div>
      </section>

      {/* 6. USE CASES */}
      <section style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>
          Use cases
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640, margin: '0 auto' }}>
          {[
            'Fintech KYC', 'Marketplace Trust', 'Age Verification',
            'Account Recovery', 'Remote Onboarding', 'Healthcare',
          ].map(label => (
            <span key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '8px 16px', fontSize: 13, color: C.muted }}>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* 7. CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center', background: C.panel, borderTop: `1px solid ${C.border}` }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 16 }}>
          Ready to integrate?
        </h2>
        <p style={{ color: C.muted, fontSize: 16, marginBottom: 36 }}>
          Free tier includes 1,000 verifications per month.
        </p>
        <Link to="/developer" style={{ background: C.cyan, color: C.bg, padding: '14px 36px', borderRadius: 8, fontWeight: 600, fontSize: 16, textDecoration: 'none', display: 'inline-block', marginBottom: 40 }}>
          Get Free API Key →
        </Link>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { value: '5 min', label: 'to first verification' },
            { value: '1,000', label: 'free / month' },
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
