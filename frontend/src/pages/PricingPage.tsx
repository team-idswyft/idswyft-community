import { useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { C, injectFonts } from '../theme'

const GITHUB_URL = 'https://github.com/team-idswyft/idswyft-community'
const getEnterpriseUrl = () =>
  window.location.hostname.endsWith('.idswyft.app') || window.location.hostname === 'idswyft.app'
    ? 'https://enterprise.idswyft.app'
    : 'http://localhost:3015'

/* ─── Tier data ───────────────────────────────────────── */

const tiers = [
  {
    name: 'Community',
    badge: 'Self-Hosted',
    price: 'Free',
    priceSuffix: 'forever',
    verifications: 'Unlimited',
    overage: '—',
    hosting: 'Your infrastructure',
    support: 'Community (GitHub)',
    sla: 'None',
    cta: { label: 'View on GitHub', href: GITHUB_URL, external: true, disabled: false },
    highlighted: false,
  },
  {
    name: 'Cloud Starter',
    badge: null,
    price: '$0',
    priceSuffix: '/mo',
    verifications: '50 / month',
    overage: '—',
    hosting: 'Managed by Idswyft',
    support: 'Email',
    sla: '99.5% uptime',
    cta: { label: 'Get Started', href: '/developer', external: false, disabled: false },
    highlighted: false,
  },
  {
    name: 'Cloud Pro',
    badge: 'Coming Soon',
    price: '$49',
    priceSuffix: '/mo',
    verifications: '2,000 / month',
    overage: '$0.05 / extra',
    hosting: 'Managed by Idswyft',
    support: 'Priority email',
    sla: '99.9% uptime',
    cta: { label: 'Coming Soon', href: '', external: false, disabled: true },
    highlighted: true,
  },
]

/* ─── Feature comparison data ─────────────────────────── */

const Y = true
const N = false

interface FeatureRow {
  label: string
  community: boolean
  starter: boolean
  pro: boolean
}
interface FeatureGroup {
  category: string
  rows: FeatureRow[]
}

const features: FeatureGroup[] = [
  {
    category: 'Core Verification',
    rows: [
      { label: 'OCR extraction', community: Y, starter: Y, pro: Y },
      { label: 'Barcode / PDF417', community: Y, starter: Y, pro: Y },
      { label: 'MRZ parsing', community: Y, starter: Y, pro: Y },
      { label: 'Cross-validation', community: Y, starter: Y, pro: Y },
      { label: 'Liveness detection', community: Y, starter: Y, pro: Y },
      { label: 'Face matching', community: Y, starter: Y, pro: Y },
      { label: 'Voice authentication', community: Y, starter: Y, pro: Y },
    ],
  },
  {
    category: 'Integration',
    rows: [
      { label: 'REST API', community: Y, starter: Y, pro: Y },
      { label: 'JavaScript SDK', community: Y, starter: Y, pro: Y },
      { label: 'Hosted verification page', community: Y, starter: Y, pro: Y },
      { label: 'Webhooks', community: Y, starter: Y, pro: Y },
      { label: 'Batch API', community: Y, starter: N, pro: Y },
    ],
  },
  {
    category: 'Security & Compliance',
    rows: [
      { label: 'Encryption at rest (managed)', community: N, starter: Y, pro: Y },
      { label: 'GDPR / CCPA compliance', community: Y, starter: Y, pro: Y },
      { label: 'Configurable data retention', community: Y, starter: Y, pro: Y },
      { label: 'Audit logs', community: Y, starter: N, pro: Y },
    ],
  },
  {
    category: 'Infrastructure',
    rows: [
      { label: 'Managed hosting', community: N, starter: Y, pro: Y },
      { label: 'Automatic updates', community: N, starter: Y, pro: Y },
      { label: 'Monitoring & alerting', community: N, starter: N, pro: Y },
      { label: 'Daily backups', community: N, starter: N, pro: Y },
    ],
  },
  {
    category: 'Support',
    rows: [
      { label: 'GitHub issues', community: Y, starter: Y, pro: Y },
      { label: 'Email support', community: N, starter: Y, pro: Y },
      { label: 'Priority support', community: N, starter: N, pro: Y },
      { label: 'Dedicated account manager', community: N, starter: N, pro: N },
    ],
  },
]

/* ─── Scroll-reveal hook (same as HomePage) ──────────── */

function useScrollReveal() {
  useEffect(() => {
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

/* ─── Check / dash marks ─────────────────────────────── */

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

function DashMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <line x1="5" y1="8" x2="11" y2="8" stroke="var(--soft)" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

/* ─── Page component ─────────────────────────────────── */

export function PricingPage() {
  useEffect(() => { injectFonts() }, [])
  useScrollReveal()

  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)', fontFamily: C.sans, minHeight: '100vh' }}>

      {/* ── 1. Hero ──────────────────────────────────── */}
      <section style={{
        padding: '120px 24px 64px',
        textAlign: 'center',
        maxWidth: 800,
        margin: '0 auto',
      }}>
        <div className="eyebrow" style={{ marginBottom: 24 }}>
          pricing
        </div>
        <h1 style={{
          fontFamily: C.mono,
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.15,
          letterSpacing: '-0.025em',
          marginBottom: 20,
        }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 18, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Self-host for free or let us handle the infrastructure.
        </p>
      </section>

      {/* ── 2. Pricing Cards (shared-border grid) ───── */}
      <section className="scroll-reveal" style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          border: '1px solid var(--rule)',
        }}>
          {tiers.map((tier, idx) => (
            <div key={tier.name} style={{
              background: tier.highlighted ? 'var(--ink)' : 'var(--panel)',
              borderRight: idx < tiers.length - 1 ? '1px solid var(--rule)' : 'none',
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}>
              {/* Badge */}
              {tier.badge && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: tier.highlighted ? 'var(--accent)' : 'var(--panel)',
                  color: tier.highlighted ? 'var(--paper)' : 'var(--mid)',
                  fontFamily: C.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '4px 10px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderLeft: tier.highlighted ? 'none' : '1px solid var(--rule)',
                  borderBottom: tier.highlighted ? 'none' : '1px solid var(--rule)',
                }}>
                  {tier.badge}
                </div>
              )}

              {/* Tier name */}
              <div className="eyebrow" style={{
                marginBottom: 16,
                color: tier.highlighted ? 'var(--paper)' : undefined,
                opacity: tier.highlighted ? 0.6 : undefined,
              }}>
                {tier.name}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                <span style={{
                  fontFamily: C.mono,
                  fontSize: 48,
                  fontWeight: 500,
                  color: tier.highlighted ? 'var(--paper)' : 'var(--ink)',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                }}>
                  {tier.price}
                </span>
                <span style={{
                  fontFamily: C.mono,
                  fontSize: 16,
                  color: tier.highlighted ? 'var(--soft)' : 'var(--soft)',
                  marginLeft: 4,
                }}>
                  {tier.priceSuffix}
                </span>
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 28, flex: 1 }}>
                {[
                  { label: 'Verifications', value: tier.verifications },
                  { label: 'Overage', value: tier.overage },
                  { label: 'Hosting', value: tier.hosting },
                  { label: 'Support', value: tier.support },
                  { label: 'SLA', value: tier.sla },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    padding: '10px 0',
                    borderBottom: `1px solid ${tier.highlighted ? 'rgba(255,255,255,0.08)' : 'var(--rule)'}`,
                  }}>
                    <span style={{ color: tier.highlighted ? 'rgba(255,255,255,0.5)' : 'var(--mid)' }}>{label}</span>
                    <span style={{
                      color: tier.highlighted ? 'var(--paper)' : 'var(--ink)',
                      fontWeight: 500,
                      fontFamily: C.mono,
                      fontSize: 12,
                    }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              {tier.cta.disabled ? (
                <span
                  className="btn"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: 'transparent',
                    border: `1px solid ${tier.highlighted ? 'rgba(255,255,255,0.15)' : 'var(--rule)'}`,
                    color: tier.highlighted ? 'rgba(255,255,255,0.3)' : 'var(--soft)',
                    cursor: 'default',
                    opacity: 0.7,
                    justifyContent: 'center',
                  }}
                >
                  {tier.cta.label}
                </span>
              ) : tier.cta.external ? (
                <a
                  href={tier.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn ghost"
                  style={{
                    display: 'flex',
                    textAlign: 'center',
                    textDecoration: 'none',
                    background: 'transparent',
                    border: '1px solid var(--rule-strong)',
                    color: 'var(--ink)',
                    justifyContent: 'center',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {tier.cta.label}
                </a>
              ) : (
                <Link
                  to={tier.cta.href}
                  className="btn"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    textDecoration: 'none',
                    background: tier.highlighted ? 'var(--accent)' : 'var(--ink)',
                    color: 'var(--paper)',
                    border: tier.highlighted ? '1px solid var(--accent)' : '1px solid var(--ink)',
                    justifyContent: 'center',
                  }}
                >
                  {tier.cta.label}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Feature Comparison ────────────────────── */}
      <section className="scroll-reveal section" style={{
        padding: '80px 24px',
        maxWidth: 1000,
        margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>compare</div>
          <h2 style={{
            fontFamily: C.mono,
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--ink)',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}>
            Feature comparison
          </h2>
          <p style={{ color: 'var(--mid)', fontSize: 15 }}>Everything included in every edition — with extras as you scale.</p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600, border: '1px solid var(--rule)' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--rule)', color: 'var(--soft)', fontFamily: C.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Feature
                </th>
                {['Community', 'Starter', 'Pro'].map(h => (
                  <th key={h} scope="col" style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid var(--rule)', borderLeft: '1px solid var(--rule)', color: 'var(--soft)', fontFamily: C.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', width: 120 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map(group => (
                <Fragment key={group.category}>
                  {/* Category header */}
                  <tr>
                    <td colSpan={4} style={{ padding: '20px 16px 8px', fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {group.category}
                    </td>
                  </tr>
                  {/* Feature rows */}
                  {group.rows.map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--rule)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ink)' }}>{row.label}</td>
                      {[row.community, row.starter, row.pro].map((val, i) => (
                        <td key={i} style={{ textAlign: 'center', padding: '10px 16px', borderLeft: '1px solid var(--rule)' }} aria-label={val ? 'Included' : 'Not included'}>
                          {val ? <CheckMark /> : <DashMark />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 4. Enterprise CTA ────────────────────────── */}
      <section className="scroll-reveal" style={{
        padding: '64px 24px',
        maxWidth: 800,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--rule)',
          padding: '48px 32px',
        }}>
          <h2 style={{
            fontFamily: C.mono,
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--ink)',
            marginBottom: 12,
            letterSpacing: '-0.02em',
          }}>
            Need more?
          </h2>
          <p style={{ color: 'var(--mid)', fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 520, margin: '0 auto 24px' }}>
            Custom SLA, volume pricing, dedicated support, and on-premise deployment options.
          </p>
          <a
            href={getEnterpriseUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{
              display: 'inline-flex',
              textDecoration: 'none',
              border: '1px solid var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Contact Enterprise Sales
          </a>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            {['Custom SLA', 'Volume discounts', 'Dedicated support', 'On-premise'].map(item => (
              <span key={item} style={{ fontFamily: C.mono, fontSize: 11, color: 'var(--soft)', letterSpacing: '0.04em' }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Community Edition Details ─────────────── */}
      <section className="scroll-reveal section" style={{
        padding: '80px 24px',
        maxWidth: 800,
        margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="eyebrow" style={{ color: 'var(--accent-ink)', marginBottom: 12 }}>
            Open source
          </div>
          <h2 style={{
            fontFamily: C.mono,
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--ink)',
            marginBottom: 12,
            letterSpacing: '-0.02em',
          }}>
            Self-host in one command
          </h2>
          <p style={{ color: 'var(--mid)', fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
            Run the full verification engine on your own infrastructure. No license fees, no usage limits, no vendor lock-in.
          </p>
        </div>

        {/* Docker command block */}
        <div style={{
          background: C.codeBg,
          border: '1px solid var(--rule-strong)',
          padding: '20px 24px',
          marginBottom: 32,
          fontFamily: C.mono,
          fontSize: 14,
          color: C.code,
          overflowX: 'auto',
        }}>
          <span style={{ color: 'var(--soft)', userSelect: 'none' }}>$ </span>
          git clone {GITHUB_URL}.git && cd idswyft && docker compose up -d
        </div>

        {/* Bullet points */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 36 }}>
          {[
            { title: 'MIT License', desc: 'Use it commercially, modify it, distribute it — no restrictions.' },
            { title: 'Full source code', desc: 'Every line of the verification engine is open and auditable.' },
            { title: 'Your data, your servers', desc: 'Documents and personal data never leave your infrastructure.' },
            { title: 'Runs on minimal hardware', desc: '2 vCPU / 4 GB RAM minimum. Handles ~1-2 verifications/sec with <5s OCR latency at p95.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 5, height: 5, background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{
              textDecoration: 'none',
              border: '1px solid var(--rule-strong)',
              color: 'var(--ink)',
            }}
          >
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </a>
          <Link
            to="/docs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              fontFamily: C.mono,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              color: 'var(--accent-ink)',
            }}
          >
            Read the docs
          </Link>
        </div>
      </section>
    </div>
  )
}
