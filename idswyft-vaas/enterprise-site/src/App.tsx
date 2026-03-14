import { useState, useEffect, useRef } from 'react'
import {
  Shield, Zap, Users, ArrowRight, CheckCircle, X,
  Code2, Building2, Activity, ChevronRight, ExternalLink,
  GitBranch, Fingerprint, FileCheck, Layers, Globe,
  BarChart2, Terminal, User, Mail, Briefcase, ArrowLeft,
  Sparkles, Rocket, Crown
} from 'lucide-react'
import { Player } from '@remotion/player'
import { VaaSMarketing } from './remotion/VaaSMarketing'

// ── Code preview content (3 language tabs) ────────────────────────────────
type CodeTab = 'curl' | 'js' | 'python'

const CODE_SNIPPETS: Record<CodeTab, string> = {
  curl: `# Start a verification session
curl -X POST https://api.idswyft.app/api/verify/start \\
  -H "X-API-Key: isk_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "usr_4f8a2b",
    "returnUrl": "https://yourapp.com/verified"
  }'

# Response
{
  "verificationId": "vrf_9a2b3c4d",
  "status": "pending",
  "sessionUrl": "https://verify.idswyft.app/s/...",
  "expiresAt": "2026-03-08T15:00:00Z"
}`,

  js: `import { IdswyftClient } from '@idswyft/sdk';

const client = new IdswyftClient({
  apiKey: process.env.IDSWYFT_API_KEY
});

// Create a verification session
const session = await client.verifications.create({
  userId: 'usr_4f8a2b',
  returnUrl: 'https://yourapp.com/verified'
});

// Redirect user to the verification UI
window.location.href = session.url;

// Listen for completion via webhook
client.webhooks.on('verification.completed', async (event) => {
  const { status, userId } = event.data;
  // status: 'verified' | 'failed' | 'manual_review'
  await db.users.update(userId, {
    verified: status === 'verified'
  });
});`,

  python: `from idswyft import IdswyftClient

client = IdswyftClient(
    api_key=os.environ["IDSWYFT_API_KEY"]
)

# Create verification session
session = client.verifications.create(
    user_id="usr_4f8a2b",
    return_url="https://yourapp.com/verified"
)

# Redirect user → session.url
print(f"Session: {session.id}")

# Webhook handler
@app.post("/webhooks/idswyft")
def handle_verification(event: WebhookEvent):
    if event.type == "verification.completed":
        status = event.data["status"]
        user_id = event.data["user_id"]
        db.users.update(user_id, verified=(
            status == "verified"
        ))`
}

// ── Feature cards data ─────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: FileCheck,
    title: 'Document OCR',
    desc: 'AI-powered extraction from passports, driver\'s licenses, and national IDs. 200+ document types across 19+ countries with MRZ and localized field parsing.',
    tags: ['PaddleOCR', 'MRZ Parsing', '19+ Countries'],
  },
  {
    icon: Fingerprint,
    title: 'Biometric Matching',
    desc: 'Liveness detection + face comparison against document photos. Anti-spoofing with 99.2% match accuracy.',
    tags: ['Liveness', 'Face Match', 'Anti-Spoof'],
  },
  {
    icon: Shield,
    title: 'Fraud Detection',
    desc: 'Barcode cross-validation (US PDF417), MRZ parsing (international TD1/TD2/TD3), tamper detection, and authenticity scoring.',
    tags: ['PDF417', 'MRZ', 'Cross-Validation'],
  },
  {
    icon: Activity,
    title: 'Real-Time Webhooks',
    desc: 'Instant event delivery on state changes. Built-in retry logic with exponential backoff. No polling needed.',
    tags: ['Events', '3 Retries', 'Signed'],
  },
  {
    icon: Layers,
    title: 'White-Label UI',
    desc: 'Fully customizable verification flow with your brand colors, logo, and custom domain. Zero Idswyft branding.',
    tags: ['Custom Domain', 'Theming', 'Embeddable'],
  },
  {
    icon: BarChart2,
    title: 'Multi-Tenant Admin',
    desc: 'Manage all organizations from one dashboard. Monitor queues, review flagged cases, export audit reports.',
    tags: ['Analytics', 'Audit Trail', 'RBAC'],
  },
]

// ── Industry solutions data ────────────────────────────────────────────────
const INDUSTRIES = [
  {
    icon: Building2,
    title: 'Fintech & Banking',
    accent: 'cyan',
    items: ['KYC/AML automation', 'CIP requirements', 'BSA compliance', 'Full audit trails'],
  },
  {
    icon: Globe,
    title: 'Marketplaces',
    accent: 'blue',
    items: ['Seller identity trust', 'Age verification', 'Gig worker onboarding', 'Trust & safety'],
  },
  {
    icon: Shield,
    title: 'Healthcare',
    accent: 'emerald',
    items: ['HIPAA-compliant', 'Patient verification', 'Claims fraud prevention', 'Provider credentialing'],
  },
  {
    icon: Users,
    title: 'HR & Workforce',
    accent: 'violet',
    items: ['Remote hiring', 'Employee onboarding', 'Contractor verification', 'Right-to-work checks'],
  },
]

// ── Accent color helpers ───────────────────────────────────────────────────
const accentClasses: Record<string, { bg: string; border: string; icon: string }> = {
  cyan:    { bg: 'bg-cyan-400/10',   border: 'border-cyan-400/20',   icon: 'text-cyan-400' },
  blue:    { bg: 'bg-blue-400/10',   border: 'border-blue-400/20',   icon: 'text-blue-400' },
  emerald: { bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', icon: 'text-emerald-400' },
  violet:  { bg: 'bg-violet-400/10', border: 'border-violet-400/20', icon: 'text-violet-400' },
}

// ── Component ──────────────────────────────────────────────────────────────
function App() {
  const vaasBackendUrl =
    import.meta.env.VITE_VAAS_BACKEND_URL || 'https://api-vaas.idswyft.app'
  const vaasAdminUrl =
    import.meta.env.VITE_VAAS_ADMIN_URL || 'https://app.idswyft.app/login'
  const fallbackLogoUrl = '/idswyft-logo.png'
  const [showSignupForm, setShowSignupForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signupStep, setSignupStep] = useState(1)
  const [signupResult, setSignupResult] = useState<{ name: string; tier: string } | null>(null)
  const [signupError, setSignupError] = useState('')
  const [activeTab, setActiveTab] = useState<CodeTab>('curl')
  const [scrolled, setScrolled] = useState(false)
  const [logoUrl, setLogoUrl] = useState(fallbackLogoUrl)
  const modalRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    jobTitle: '',
    estimatedVolume: '',
    useCase: '',
  })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const loadPlatformBranding = async () => {
      try {
        const response = await fetch(`${vaasBackendUrl}/api/assets/platform`)
        const payload = await response.json()
        if (response.ok) {
          const remoteLogoUrl = payload?.data?.logo_url
          if (typeof remoteLogoUrl === 'string' && remoteLogoUrl.trim()) {
            setLogoUrl(remoteLogoUrl)
          }
          const faviconUrl = payload?.data?.favicon_url
          if (typeof faviconUrl === 'string' && faviconUrl.trim()) {
            const link = document.querySelector("link[rel='icon']") as HTMLLinkElement
            if (link) link.href = faviconUrl
          }
        }
      } catch {
        // Keep local fallback logo/favicon when branding endpoint is unavailable.
      }
    }

    loadPlatformBranding()
  }, [vaasBackendUrl])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const openSignup = () => {
    setShowSignupForm(true)
    setSignupStep(1)
    setSignupResult(null)
    setSignupError('')
  }

  const closeSignup = () => {
    setShowSignupForm(false)
    setSignupStep(1)
    setSignupResult(null)
    setSignupError('')
    setFormData({
      firstName: '', lastName: '', email: '', phone: '',
      company: '', jobTitle: '', estimatedVolume: '', useCase: '',
    })
  }

  const nextStep = () => {
    setSignupError('')
    if (modalRef.current) modalRef.current.scrollTop = 0
    setSignupStep(s => Math.min(s + 1, 3))
  }
  const prevStep = () => {
    setSignupError('')
    if (modalRef.current) modalRef.current.scrollTop = 0
    setSignupStep(s => Math.max(s - 1, 1))
  }

  const canAdvanceStep1 = formData.firstName.trim() && formData.lastName.trim() && formData.email.trim()
  const canAdvanceStep2 = formData.company.trim() && formData.estimatedVolume

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSignupError('')
    try {
      const response = await fetch(`${vaasBackendUrl}/api/organizations/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const result = await response.json()
      if (result.success) {
        setSignupResult({
          name: result.data.organization.name,
          tier: result.data.organization.subscription_tier,
        })
        setSignupStep(4) // success screen
      } else {
        if (result.error?.details && Array.isArray(result.error.details)) {
          const msgs = result.error.details
            .map((d: { field: string; message: string }) => `${d.field}: ${d.message}`)
            .join('. ')
          setSignupError(msgs)
        } else {
          setSignupError(result.error?.message || 'Something went wrong. Please try again.')
        }
      }
    } catch {
      setSignupError('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#05080f', color: '#f1f5f9' }}>

      {/* ════════════════════════════════════════
          NAV — pill transitions to solid on scroll
          ════════════════════════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          padding: scrolled ? '10px 0' : '20px 0',
          background: scrolled ? 'rgba(5,8,15,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
          {/* Logo + VaaS badge */}
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Idswyft"
              className="h-7 w-auto"
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{
                color: '#22d3ee',
                background: 'rgba(34,211,238,0.08)',
                border: '1px solid rgba(34,211,238,0.2)',
                padding: '2px 8px',
                borderRadius: '4px',
                letterSpacing: '0.15em',
              }}
            >
              VaaS
            </span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Solutions', href: '#solutions' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Docs', href: 'https://idswyft.app/doc' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}
                className="hover:text-white transition-colors duration-200"
              >
                {label}
              </a>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <a
              href={vaasAdminUrl}
              className="hidden sm:block text-sm font-medium transition-colors"
              style={{ color: '#64748b' }}
            >
              Sign in
            </a>
            <button
              onClick={openSignup}
              className="text-sm font-bold px-4 py-2 rounded-lg transition-colors duration-200"
              style={{ background: '#22d3ee', color: '#05080f' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#67e8f9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee')}
            >
              Start Free
            </button>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
          HERO — dark, dot grid, scan pulse
          ════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Dot grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(34,211,238,0.07) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Radial vignette */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,211,238,0.05) 0%, rgba(5,8,15,0.7) 60%, #05080f 100%)',
          }}
        />
        {/* Cyan scan beam */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="scan-pulse" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-32 pb-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* ── Left: headline + CTAs + stats ── */}
            <div>
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-8">
                <div className="relative w-2 h-2">
                  <span className="verified-ping absolute inset-0 rounded-full" style={{ background: '#10b981' }} />
                  <span
                    className="relative block w-2 h-2 rounded-full"
                    style={{ background: '#10b981' }}
                  />
                </div>
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: '#10b981', letterSpacing: '0.18em' }}
                >
                  Open-Source Powered Enterprise Platform
                </span>
              </div>

              {/* Headline */}
              <h1
                className="font-display mb-6 tracking-tight"
                style={{
                  fontSize: 'clamp(2.6rem, 5.5vw, 4.75rem)',
                  fontWeight: 800,
                  lineHeight: 0.95,
                  fontFamily: 'Syne, sans-serif',
                }}
              >
                Enterprise Identity
                <br />
                <span style={{ color: '#22d3ee' }}>Verification.</span>
                <br />
                Open-Source Proven.
              </h1>

              {/* Subheadline */}
              <p
                className="leading-relaxed mb-10"
                style={{ color: '#64748b', fontSize: '18px', maxWidth: '480px' }}
              >
                No black-box pricing. No vendor lock-in. Idswyft VaaS delivers
                enterprise-grade KYC, document verification, and biometric matching
                — all built on the transparent Idswyft open-source engine.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-4 mb-14">
                <button
                  onClick={openSignup}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-200"
                  style={{ background: '#22d3ee', color: '#05080f' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#67e8f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee')}
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="https://github.com/doobee46/idswyft"
                  target="_blank"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#f1f5f9'
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#94a3b8'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                >
                  <GitBranch className="w-4 h-4" />
                  View Open Source
                </a>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-10">
                {[
                  { value: '< 30 min', label: 'Integration time' },
                  { value: '99.9%', label: 'API uptime SLA' },
                  { value: '200+', label: 'Document types' },
                ].map(stat => (
                  <div key={stat.label}>
                    <div
                      className="font-display font-bold"
                      style={{ fontSize: '22px', color: '#f1f5f9', fontFamily: 'Syne, sans-serif' }}
                    >
                      {stat.value}
                    </div>
                    <div
                      className="uppercase tracking-wider mt-0.5"
                      style={{ fontSize: '11px', color: '#475569', letterSpacing: '0.12em' }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: API response card ── */}
            <div className="hidden lg:block">
              <div className="relative">
                {/* Glow */}
                <div
                  className="absolute inset-0 rounded-3xl blur-3xl"
                  style={{ background: 'rgba(34,211,238,0.06)' }}
                />
                {/* Card */}
                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  {/* Card header bar */}
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="flex gap-1.5">
                      {['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.15)'].map(
                        (bg, i) => (
                          <div
                            key={i}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: bg }}
                          />
                        )
                      )}
                    </div>
                    <span
                      className="ml-2"
                      style={{ color: '#475569', fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}
                    >
                      POST /api/verify/start
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: '#10b981' }}
                      />
                      <span
                        style={{ color: '#10b981', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }}
                      >
                        200 OK
                      </span>
                    </div>
                  </div>

                  {/* JSON response body */}
                  <div className="p-5" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', lineHeight: '1.75' }}>
                    <span style={{ color: '#475569' }}>{'{'}</span>
                    <br />
                    <span style={{ paddingLeft: '16px', display: 'block' }}>
                      <span style={{ color: '#67e8f9' }}>"verificationId"</span>
                      <span style={{ color: '#64748b' }}>: </span>
                      <span style={{ color: '#6ee7b7' }}>"vrf_9a2b3c4d"</span>
                      <span style={{ color: '#475569' }}>,</span>
                    </span>
                    <span style={{ paddingLeft: '16px', display: 'block' }}>
                      <span style={{ color: '#67e8f9' }}>"status"</span>
                      <span style={{ color: '#64748b' }}>: </span>
                      <span style={{ color: '#fcd34d' }}>"pending"</span>
                      <span style={{ color: '#475569' }}>,</span>
                    </span>
                    <span style={{ paddingLeft: '16px', display: 'block' }}>
                      <span style={{ color: '#67e8f9' }}>"sessionUrl"</span>
                      <span style={{ color: '#64748b' }}>: </span>
                      <span style={{ color: '#93c5fd' }}>"https://verify.idswyft.app/s/..."</span>
                      <span style={{ color: '#475569' }}>,</span>
                    </span>
                    <span style={{ paddingLeft: '16px', display: 'block' }}>
                      <span style={{ color: '#67e8f9' }}>"expiresAt"</span>
                      <span style={{ color: '#64748b' }}>: </span>
                      <span style={{ color: '#cbd5e1' }}>"2026-03-08T15:00:00Z"</span>
                    </span>
                    <span style={{ color: '#475569' }}>{'}'}</span>
                  </div>

                  {/* Verification step flow */}
                  <div
                    className="px-5 pb-4 pt-1"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-center flex-wrap gap-y-1">
                      {['Upload ID', 'Scan Back', 'Live Capture', 'Verified ✓'].map((step, i) => (
                        <div key={step} className="flex items-center">
                          <span
                            className="px-2.5 py-1 rounded-md text-xs font-medium"
                            style={
                              i === 3
                                ? {
                                    background: 'rgba(16,185,129,0.12)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16,185,129,0.2)',
                                  }
                                : { color: '#475569' }
                            }
                          >
                            {step}
                          </span>
                          {i < 3 && (
                            <ChevronRight
                              className="w-3 h-3 mx-0.5 flex-shrink-0"
                              style={{ color: '#334155' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WHY VAAS — Marketing Video
          ════════════════════════════════════════ */}
      <section style={{ padding: '80px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-10">
            <p
              className="uppercase tracking-widest font-semibold mb-4"
              style={{ color: '#22d3ee', fontSize: '11px', letterSpacing: '0.15em', fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Why Idswyft VaaS
            </p>
            <h2
              className="font-display"
              style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, fontFamily: "'Syne', sans-serif", lineHeight: 1.1 }}
            >
              Stop building.{' '}
              <span style={{ color: '#22d3ee' }}>Start verifying.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Player
              component={VaaSMarketing}
              durationInFrames={720}
              fps={30}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', maxWidth: 900, aspectRatio: '16/9', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}
              autoPlay
              loop
              controls={false}
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          PLATFORM STRIP
          ════════════════════════════════════════ */}
      <section
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(255,255,255,0.015)',
          padding: '18px 0',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <p
              className="uppercase tracking-widest font-semibold"
              style={{ color: '#334155', fontSize: '11px', letterSpacing: '0.15em' }}
            >
              Part of the Idswyft Platform
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              {[
                { label: 'Open-Source Core', icon: GitBranch },
                { label: 'VaaS Enterprise', icon: Building2 },
                { label: 'Customer Portal', icon: Users },
                { label: 'Admin Dashboard', icon: BarChart2 },
              ].map(({ label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 transition-colors cursor-default"
                  style={{ color: '#334155', fontSize: '12px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <a
              href="https://idswyft.app"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#22d3ee' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#67e8f9')}
              onMouseLeave={e => (e.currentTarget.style.color = '#22d3ee')}
            >
              idswyft.app <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          HOW IT WORKS — 3 steps
          ════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}
            >
              Integrate in three steps
            </h2>
            <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto' }}>
              From API key to live verifications in under 30 minutes.
              No sales call required.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {[
              {
                num: '01',
                icon: Terminal,
                title: 'Get Your API Keys',
                desc: 'Create an organization account and receive API keys instantly. Sandbox environment included — test end-to-end without touching production.',
                tag: 'No credit card required',
              },
              {
                num: '02',
                icon: Code2,
                title: 'Embed the SDK',
                desc: 'Drop in our JavaScript verification component, or call the REST API headless. Works with React, Vue, plain HTML, iOS, Android.',
                tag: 'Framework-agnostic',
              },
              {
                num: '03',
                icon: Zap,
                title: 'Receive Webhooks',
                desc: 'Get real-time status updates as verifications complete. Status: verified, failed, or manual_review. Retry logic built-in.',
                tag: 'Signed payloads',
              },
            ].map((step, i) => (
              <div
                key={step.num}
                className="relative group rounded-2xl p-8 transition-all duration-300"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.border = '1px solid rgba(34,211,238,0.2)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                }}
              >
                {/* Step number watermark */}
                <div
                  className="font-display font-extrabold mb-4 select-none"
                  style={{ fontSize: '52px', color: 'rgba(255,255,255,0.04)', lineHeight: 1, fontFamily: 'Syne, sans-serif' }}
                >
                  {step.num}
                </div>

                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}
                >
                  <step.icon className="w-5 h-5" style={{ color: '#22d3ee' }} />
                </div>

                <h3
                  className="font-semibold mb-3 transition-colors"
                  style={{ color: '#f1f5f9', fontSize: '17px' }}
                >
                  {step.title}
                </h3>
                <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.65', marginBottom: '16px' }}>
                  {step.desc}
                </p>
                <div className="flex items-center gap-1.5" style={{ color: '#22d3ee', fontSize: '12px' }}>
                  <span className="w-1 h-1 rounded-full" style={{ background: '#22d3ee' }} />
                  {step.tag}
                </div>

                {/* Connector arrow between steps */}
                {i < 2 && (
                  <div
                    className="hidden lg:flex absolute top-1/2 -right-4 z-10 items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      background: '#0a0e1a',
                      border: '1px solid rgba(34,211,238,0.15)',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <ChevronRight className="w-4 h-4" style={{ color: '#22d3ee' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FEATURES — 6 cards
          ════════════════════════════════════════ */}
      <section
        id="features"
        style={{
          padding: '96px 0',
          background: 'rgba(255,255,255,0.012)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}
            >
              The full verification stack
            </h2>
            <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto' }}>
              Every piece of infrastructure you need, managed and maintained by us.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, tags }) => (
              <div
                key={title}
                className="relative group rounded-2xl p-6 overflow-hidden transition-all duration-300"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.border = '1px solid rgba(34,211,238,0.2)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                }}
              >
                {/* Corner glow on hover */}
                <div
                  className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'rgba(34,211,238,0.07)' }}
                />

                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#22d3ee' }} />
                </div>

                <h3 className="font-semibold mb-2" style={{ color: '#f1f5f9', fontSize: '16px' }}>
                  {title}
                </h3>
                <p style={{ color: '#64748b', fontSize: '13px', lineHeight: '1.65', marginBottom: '16px' }}>
                  {desc}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#475569',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          API PREVIEW — tabbed code block
          ════════════════════════════════════════ */}
      <section id="api" className="py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left: copy */}
            <div>
              <p
                className="uppercase tracking-widest font-semibold mb-4"
                style={{ color: '#22d3ee', fontSize: '11px', letterSpacing: '0.15em' }}
              >
                Developer Native
              </p>
              <h2
                className="font-display mb-6"
                style={{ fontSize: 'clamp(1.8rem,3.5vw,2.75rem)', fontWeight: 700, lineHeight: 1.1, fontFamily: 'Syne, sans-serif' }}
              >
                Built for engineers,<br />
                trusted by compliance.
              </h2>
              <p style={{ color: '#64748b', lineHeight: '1.7', marginBottom: '28px' }}>
                RESTful API with predictable JSON responses. SDK clients for JavaScript,
                Python, and Go. Full OpenAPI schema, idempotency keys, signed webhooks,
                and sub-200ms response times — everything you expect from a modern API.
              </p>
              <ul className="space-y-3">
                {[
                  'OpenAPI 3.0 schema included',
                  'Sandbox with realistic test identities',
                  'Idempotent retry support',
                  'Comprehensive audit logging',
                  'Sub-200ms API response times',
                  'Rate limit headers on every response',
                ].map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#94a3b8' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: code block */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
            >
              {/* Tabs */}
              <div
                className="flex items-center gap-0 px-4 pt-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                {(['curl', 'js', 'python'] as CodeTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-4 py-2.5 text-xs font-medium transition-all duration-150"
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      borderBottom: activeTab === tab ? '2px solid #22d3ee' : '2px solid transparent',
                      color: activeTab === tab ? '#22d3ee' : '#475569',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'curl' ? 'cURL' : tab === 'js' ? 'JavaScript' : 'Python'}
                  </button>
                ))}
              </div>

              {/* Code */}
              <div className="p-5 overflow-x-auto">
                <pre
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '12px',
                    lineHeight: '1.7',
                    color: '#94a3b8',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <code>{CODE_SNIPPETS[activeTab]}</code>
                </pre>
              </div>

              {/* Footer: view docs */}
              <div
                className="px-5 py-3 flex items-center justify-end"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                <a
                  href="https://idswyft.app/doc"
                  target="_blank"
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: '#22d3ee' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#67e8f9')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#22d3ee')}
                >
                  Full API Reference <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          INDUSTRY SOLUTIONS
          ════════════════════════════════════════ */}
      <section
        id="solutions"
        style={{
          padding: '96px 0',
          background: 'rgba(255,255,255,0.012)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}
            >
              Built for regulated industries
            </h2>
            <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto' }}>
              Deep compliance coverage across KYC, AML, HIPAA, and
              trust & safety requirements.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {INDUSTRIES.map(({ icon: Icon, title, accent, items }) => {
              const colors = accentClasses[accent]
              return (
                <div
                  key={title}
                  className="rounded-2xl p-6 transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)')}
                  onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)')}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${colors.bg} border ${colors.border}`}
                  >
                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  <h3 className="font-semibold mb-3" style={{ color: '#f1f5f9', fontSize: '15px' }}>
                    {title}
                  </h3>
                  <ul className="space-y-2">
                    {items.map(item => (
                      <li key={item} className="flex items-center gap-2" style={{ color: '#475569', fontSize: '12px' }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#334155' }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          COMPLIANCE BADGES
          ════════════════════════════════════════ */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2
              className="font-display mb-3"
              style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}
            >
              Compliance without the headache
            </h2>
            <p style={{ color: '#475569', fontSize: '14px' }}>
              Certifications maintained by our team, not yours.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {['SOC 2 Type II', 'GDPR Ready', 'CCPA Compliant', 'HIPAA Controls', 'PCI DSS', 'ISO 27001'].map(
              cert => (
                <div
                  key={cert}
                  className="flex items-center gap-2 transition-all duration-200 cursor-default"
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.025)',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)'
                    e.currentTarget.style.color = '#10b981'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.color = '#64748b'
                  }}
                >
                  <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
                  {cert}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          PRICING
          ════════════════════════════════════════ */}
      <section
        id="pricing"
        style={{
          padding: '96px 0',
          background: 'rgba(255,255,255,0.012)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}
            >
              Transparent pricing
            </h2>
            <p style={{ color: '#64748b', maxWidth: '420px', margin: '0 auto' }}>
              Usage-based. No hidden fees. No annual lock-in required.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-5 max-w-5xl mx-auto items-start">

            {/* Starter */}
            <div
              className="rounded-2xl p-7 transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)')}
            >
              <p className="uppercase tracking-widest font-semibold mb-4" style={{ color: '#475569', fontSize: '11px', letterSpacing: '0.15em' }}>
                Starter
              </p>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="font-display font-bold" style={{ fontSize: '40px', fontFamily: 'Syne, sans-serif' }}>$299</span>
                <span style={{ color: '#475569', fontSize: '14px', marginBottom: '6px' }}>/mo</span>
              </div>
              <p style={{ color: '#334155', fontSize: '12px', marginBottom: '24px' }}>
                + $2.00 per verification &middot; up to 500/mo
              </p>
              <ul className="space-y-3 mb-8">
                {['Document verification', 'Biometric face matching', 'Webhook events', 'Sandbox environment', 'Email support'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: '#64748b' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openSignup}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'
                  e.currentTarget.style.color = '#f1f5f9'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = '#94a3b8'
                }}
              >
                Start Free Trial
              </button>
            </div>

            {/* Professional — featured, slightly elevated */}
            <div
              className="relative rounded-2xl p-7"
              style={{
                background: 'rgba(34,211,238,0.05)',
                border: '1px solid rgba(34,211,238,0.28)',
                transform: 'scale(1.02)',
                boxShadow: '0 0 40px rgba(34,211,238,0.08)',
              }}
            >
              {/* Badge */}
              <div
                className="absolute -top-3.5 left-1/2 -translate-x-1/2"
                style={{
                  background: '#22d3ee',
                  color: '#05080f',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  padding: '3px 12px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Most Popular
              </div>
              <p className="uppercase tracking-widest font-semibold mb-4" style={{ color: '#22d3ee', fontSize: '11px', letterSpacing: '0.15em' }}>
                Professional
              </p>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="font-display font-bold" style={{ fontSize: '40px', fontFamily: 'Syne, sans-serif' }}>$799</span>
                <span style={{ color: '#64748b', fontSize: '14px', marginBottom: '6px' }}>/mo</span>
              </div>
              <p style={{ color: '#334155', fontSize: '12px', marginBottom: '24px' }}>
                + $1.50 per verification &middot; up to 2,000/mo
              </p>
              <ul className="space-y-3 mb-8">
                {['Everything in Starter', 'Fraud detection + barcode scan', 'White-label UI', 'Priority support (4hr SLA)', 'Advanced analytics dashboard'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: '#94a3b8' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#22d3ee' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openSignup}
                className="w-full py-3 rounded-xl text-sm font-bold transition-colors duration-200"
                style={{ background: '#22d3ee', color: '#05080f' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#67e8f9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee')}
              >
                Start Free Trial
              </button>
            </div>

            {/* Enterprise */}
            <div
              className="rounded-2xl p-7 transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)')}
            >
              <p className="uppercase tracking-widest font-semibold mb-4" style={{ color: '#475569', fontSize: '11px', letterSpacing: '0.15em' }}>
                Enterprise
              </p>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="font-display font-bold" style={{ fontSize: '40px', fontFamily: 'Syne, sans-serif' }}>$2,499</span>
                <span style={{ color: '#475569', fontSize: '14px', marginBottom: '6px' }}>/mo</span>
              </div>
              <p style={{ color: '#334155', fontSize: '12px', marginBottom: '24px' }}>
                + $1.00 per verification &middot; unlimited volume
              </p>
              <ul className="space-y-3 mb-8">
                {['Everything in Professional', 'Dedicated account manager', '99.9% uptime SLA', 'Custom integrations', 'On-prem deployment option'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: '#64748b' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openSignup}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'
                  e.currentTarget.style.color = '#f1f5f9'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = '#94a3b8'
                }}
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FINAL CTA
          ════════════════════════════════════════ */}
      <section className="py-32 relative overflow-hidden">
        {/* Bottom radial glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: '800px',
            height: '400px',
            background: 'radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        {/* Horizontal divider glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: '600px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)',
          }}
        />

        <div className="relative text-center max-w-3xl mx-auto px-6">
          <h2
            className="font-display mb-6"
            style={{
              fontSize: 'clamp(2.5rem,5.5vw,4rem)',
              fontWeight: 800,
              lineHeight: 1.05,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            Start verifying<br />
            <span style={{ color: '#22d3ee' }}>identities today.</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '17px', maxWidth: '420px', margin: '0 auto 48px', lineHeight: '1.65' }}>
            Free trial includes 1,000 verifications.
            No credit card required. Cancel any time.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={openSignup}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-bold transition-colors duration-200"
              style={{ background: '#22d3ee', color: '#05080f' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#67e8f9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee')}
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="https://idswyft.app/doc"
              target="_blank"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-medium transition-all duration-200"
              style={{ color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#f1f5f9'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              }}
            >
              Read the Docs
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '40px 0' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Idswyft"
                className="h-6 w-auto"
                style={{ opacity: 0.5 }}
              />
              <span style={{ color: '#1e293b', fontSize: '12px' }}>VaaS — Enterprise Edition</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap justify-center gap-6" style={{ fontSize: '12px' }}>
              {[
                { label: 'Platform', href: 'https://idswyft.app' },
                { label: 'Documentation', href: 'https://idswyft.app/doc' },
                { label: 'Open Source', href: 'https://github.com/doobee46/idswyft' },
                { label: 'Admin Portal', href: vaasAdminUrl },
                { label: 'Privacy', href: '#' },
                { label: 'Terms', href: '#' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  style={{ color: '#1e293b' }}
                  className="transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.color = '#64748b')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#1e293b')}
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Copyright */}
            <p style={{ color: '#1e293b', fontSize: '12px' }}>
              © 2026 Idswyft. MIT Licensed.
            </p>
          </div>
        </div>
      </footer>

      {/* ════════════════════════════════════════
          MULTI-STEP SIGNUP MODAL
          ════════════════════════════════════════ */}
      {showSignupForm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeSignup() }}
        >
          <div
            ref={modalRef}
            className="w-full max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{
              maxWidth: signupStep === 4 ? '480px' : '560px',
              background: '#080c18',
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'max-width 0.3s ease',
            }}
          >
            {/* ── Modal header with progress ── */}
            {signupStep < 4 && (
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="px-7 pt-6 pb-4">
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3">
                      {signupStep > 1 && (
                        <button
                          onClick={prevStep}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#475569', background: 'rgba(255,255,255,0.04)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                      )}
                      <div>
                        <h2
                          className="font-display font-bold"
                          style={{ fontSize: '20px', fontFamily: 'Syne, sans-serif' }}
                        >
                          {signupStep === 1 && 'Get started'}
                          {signupStep === 2 && 'Your company'}
                          {signupStep === 3 && 'Almost there'}
                        </h2>
                        <p style={{ color: '#475569', fontSize: '13px', marginTop: '2px' }}>
                          {signupStep === 1 && 'Create your VaaS account'}
                          {signupStep === 2 && 'Tell us about your organization'}
                          {signupStep === 3 && 'Describe your verification needs'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={closeSignup}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#334155', background: 'transparent' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.color = '#94a3b8'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#334155'
                      }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Step progress bar */}
                  <div className="flex gap-2">
                    {[1, 2, 3].map(step => (
                      <div
                        key={step}
                        className="flex-1 rounded-full overflow-hidden"
                        style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: signupStep >= step ? '100%' : '0%',
                            background: signupStep >= step
                              ? 'linear-gradient(90deg, #22d3ee, #67e8f9)'
                              : 'transparent',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="p-7">
              {/* Error message */}
              {signupError && (
                <div
                  className="mb-5 p-3.5 rounded-xl flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  <X className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                  <p style={{ color: '#fca5a5', fontSize: '13px', lineHeight: 1.5 }}>{signupError}</p>
                </div>
              )}

              {/* ── STEP 1: Personal Info ── */}
              {signupStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'firstName', label: 'First Name', placeholder: 'John', type: 'text', icon: User },
                      { id: 'lastName', label: 'Last Name', placeholder: 'Doe', type: 'text', icon: User },
                    ].map(({ id, label, placeholder, type }) => (
                      <div key={id}>
                        <label
                          className="block uppercase tracking-wider font-semibold mb-2"
                          style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                        >
                          {label}
                        </label>
                        <input
                          type={type}
                          name={id}
                          required
                          value={formData[id as keyof typeof formData]}
                          onChange={handleInputChange}
                          placeholder={placeholder}
                          className="w-full rounded-xl text-sm transition-all duration-200"
                          style={{
                            padding: '11px 14px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            color: '#f1f5f9',
                            outline: 'none',
                          }}
                          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Business Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#334155' }} />
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="john@company.com"
                        className="w-full rounded-xl text-sm transition-all duration-200"
                        style={{
                          padding: '11px 14px 11px 40px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          color: '#f1f5f9',
                          outline: 'none',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Phone <span style={{ color: '#334155', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', fontSize: '11px' }}>(optional)</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 123-4567"
                      className="w-full rounded-xl text-sm transition-all duration-200"
                      style={{
                        padding: '11px 14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#f1f5f9',
                        outline: 'none',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                    />
                  </div>

                  {/* Trust signals */}
                  <div className="flex items-center gap-4 pt-1" style={{ color: '#334155', fontSize: '11px' }}>
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
                      SOC 2 Compliant
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
                      No credit card
                    </span>
                  </div>

                  <button
                    onClick={nextStep}
                    disabled={!canAdvanceStep1}
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
                    style={{
                      background: canAdvanceStep1 ? '#22d3ee' : 'rgba(34,211,238,0.15)',
                      color: canAdvanceStep1 ? '#05080f' : 'rgba(34,211,238,0.4)',
                      cursor: canAdvanceStep1 ? 'pointer' : 'not-allowed',
                    }}
                    onMouseEnter={e => { if (canAdvanceStep1) e.currentTarget.style.background = '#67e8f9' }}
                    onMouseLeave={e => { if (canAdvanceStep1) e.currentTarget.style.background = '#22d3ee' }}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── STEP 2: Company Info ── */}
              {signupStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Company Name
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#334155' }} />
                      <input
                        type="text"
                        name="company"
                        required
                        value={formData.company}
                        onChange={handleInputChange}
                        placeholder="Acme Corporation"
                        className="w-full rounded-xl text-sm transition-all duration-200"
                        style={{
                          padding: '11px 14px 11px 40px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          color: '#f1f5f9',
                          outline: 'none',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Your Role
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#334155' }} />
                      <input
                        type="text"
                        name="jobTitle"
                        value={formData.jobTitle}
                        onChange={handleInputChange}
                        placeholder="CTO, Head of Engineering, Compliance Officer..."
                        className="w-full rounded-xl text-sm transition-all duration-200"
                        style={{
                          padding: '11px 14px 11px 40px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          color: '#f1f5f9',
                          outline: 'none',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Expected Monthly Volume
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { value: '1-1000', label: '1 – 1K', sub: 'Getting started', icon: Sparkles },
                        { value: '1000-10000', label: '1K – 10K', sub: 'Growing fast', icon: Rocket },
                        { value: '10000-50000', label: '10K – 50K', sub: 'Scale-up', icon: Zap },
                        { value: '50000+', label: '50K+', sub: 'Enterprise', icon: Crown },
                      ].map(({ value, label, sub, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, estimatedVolume: value }))}
                          className="text-left rounded-xl p-3.5 transition-all duration-200"
                          style={{
                            background: formData.estimatedVolume === value
                              ? 'rgba(34,211,238,0.08)'
                              : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${formData.estimatedVolume === value
                              ? 'rgba(34,211,238,0.3)'
                              : 'rgba(255,255,255,0.06)'}`,
                          }}
                          onMouseEnter={e => {
                            if (formData.estimatedVolume !== value)
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                          }}
                          onMouseLeave={e => {
                            if (formData.estimatedVolume !== value)
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon
                              className="w-4 h-4"
                              style={{
                                color: formData.estimatedVolume === value ? '#22d3ee' : '#475569',
                              }}
                            />
                            <div>
                              <p
                                className="font-semibold text-sm"
                                style={{
                                  color: formData.estimatedVolume === value ? '#f1f5f9' : '#94a3b8',
                                }}
                              >
                                {label}
                              </p>
                              <p style={{ color: '#475569', fontSize: '11px' }}>{sub}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={nextStep}
                    disabled={!canAdvanceStep2}
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
                    style={{
                      background: canAdvanceStep2 ? '#22d3ee' : 'rgba(34,211,238,0.15)',
                      color: canAdvanceStep2 ? '#05080f' : 'rgba(34,211,238,0.4)',
                      cursor: canAdvanceStep2 ? 'pointer' : 'not-allowed',
                    }}
                    onMouseEnter={e => { if (canAdvanceStep2) e.currentTarget.style.background = '#67e8f9' }}
                    onMouseLeave={e => { if (canAdvanceStep2) e.currentTarget.style.background = '#22d3ee' }}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── STEP 3: Use Case + Submit ── */}
              {signupStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label
                      className="block uppercase tracking-wider font-semibold mb-2"
                      style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.14em' }}
                    >
                      Primary Use Case
                    </label>
                    <textarea
                      name="useCase"
                      rows={3}
                      value={formData.useCase}
                      onChange={handleInputChange}
                      placeholder="KYC onboarding, marketplace trust & safety, patient verification, employee screening..."
                      className="w-full rounded-xl text-sm resize-none transition-all duration-200"
                      style={{
                        padding: '11px 14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#f1f5f9',
                        outline: 'none',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                    />
                  </div>

                  {/* Summary card */}
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p className="font-semibold mb-3" style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Your trial includes
                    </p>
                    <ul className="space-y-2.5">
                      {[
                        '1,000 free verifications',
                        'Full API access with sandbox mode',
                        'Admin dashboard & analytics',
                        'Webhook integrations',
                        'Dedicated onboarding support',
                      ].map(item => (
                        <li key={item} className="flex items-center gap-2.5" style={{ color: '#94a3b8', fontSize: '13px' }}>
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#10b981' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-200"
                    style={{
                      background: isSubmitting ? 'rgba(34,211,238,0.4)' : '#22d3ee',
                      color: '#05080f',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!isSubmitting) e.currentTarget.style.background = '#67e8f9' }}
                    onMouseLeave={e => { if (!isSubmitting) e.currentTarget.style.background = '#22d3ee' }}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border-2 animate-spin"
                          style={{ borderColor: 'rgba(5,8,15,0.3)', borderTopColor: '#05080f' }}
                        />
                        Creating your account...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Start Free Trial
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}
                  </button>

                  <p className="text-center" style={{ color: '#334155', fontSize: '11px' }}>
                    No credit card required. Cancel anytime.
                  </p>
                </div>
              )}

              {/* ── STEP 4: Success ── */}
              {signupStep === 4 && signupResult && (
                <div className="text-center py-4">
                  {/* Animated checkmark */}
                  <div
                    className="mx-auto mb-5 flex items-center justify-center rounded-full"
                    style={{
                      width: '64px',
                      height: '64px',
                      background: 'rgba(16,185,129,0.1)',
                      border: '2px solid rgba(16,185,129,0.25)',
                    }}
                  >
                    <CheckCircle className="w-8 h-8" style={{ color: '#10b981' }} />
                  </div>

                  <h2
                    className="font-display font-bold mb-2"
                    style={{ fontSize: '22px', fontFamily: 'Syne, sans-serif' }}
                  >
                    Welcome to Idswyft VaaS
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, maxWidth: '340px', margin: '0 auto' }}>
                    Your account for <strong style={{ color: '#f1f5f9' }}>{signupResult.name}</strong> has been created.
                  </p>

                  <div
                    className="rounded-xl p-4 mt-6 text-left"
                    style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)' }}
                  >
                    <p className="font-semibold mb-3" style={{ color: '#94a3b8', fontSize: '12px' }}>
                      What happens next
                    </p>
                    <ul className="space-y-2.5">
                      {[
                        { text: 'Check your email for login credentials', highlight: true },
                        { text: 'Access the admin dashboard to configure settings', highlight: false },
                        { text: 'Generate API keys and start integrating', highlight: false },
                        { text: '1,000 free verifications ready to use', highlight: false },
                      ].map(({ text, highlight }) => (
                        <li key={text} className="flex items-start gap-2.5" style={{ color: highlight ? '#f1f5f9' : '#64748b', fontSize: '13px' }}>
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <a
                      href={vaasAdminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
                      style={{ background: '#22d3ee', color: '#05080f' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#67e8f9')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee')}
                    >
                      Open Dashboard
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={closeSignup}
                      className="flex-1 py-3 rounded-xl text-sm font-medium transition-all duration-200"
                      style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', background: 'transparent' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
                        e.currentTarget.style.color = '#94a3b8'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.color = '#64748b'
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
