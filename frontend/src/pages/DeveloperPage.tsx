import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { isCommunity } from '../config/edition'
import { fetchCsrfToken, csrfHeader, clearCsrfToken } from '../lib/csrf'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'
import { AnalyticsCharts } from '../components/developer/AnalyticsCharts'
import {
  TrashIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface ApiKey {
  id: string
  name: string
  key_preview: string
  is_sandbox: boolean
  is_active: boolean
  last_used_at: string | null
  created_at: string
  expires_at: string | null
  status: 'active' | 'expired'
}

interface DeveloperStats {
  total_requests: number
  successful_requests: number
  failed_requests: number
  monthly_usage: number
  monthly_limit: number
}

interface ApiActivity {
  api_key_id?: string
  timestamp: string
  method: string
  endpoint: string
  status_code: number
  response_time_ms: number
  error_message?: string
  user_agent?: string
  ip_address?: string
}

interface VerificationDetail {
  success: boolean
  verification_id: string
  is_sandbox?: boolean
  status: string
  current_step: number
  total_steps: number
  final_result: string | null
  front_document_uploaded?: boolean
  back_document_uploaded?: boolean
  live_capture_uploaded?: boolean
  cross_validation_results?: { overall_score: number; verdict: string; has_critical_failure?: boolean } | null
  face_match_results?: { similarity_score: number; passed: boolean; skipped_reason?: string } | null
  liveness_results?: { score: number; passed: boolean } | null
  risk_score?: { overall_score: number; risk_level: string; risk_factors?: unknown[] } | null
  ocr_data?: Record<string, unknown> | null
  barcode_data?: unknown | null
  aml_screening?: unknown | null
  rejection_reason?: string | null
  rejection_detail?: string | null
  failure_reason?: string | null
  manual_review_reason?: string | null
  created_at?: string
  updated_at?: string
  message?: string
}

interface DeveloperWebhook {
  id: string
  url: string
  events?: string[]
  secret_key?: string | null
  api_key_id?: string | null
  api_key_preview?: string | null
  api_key_name?: string | null
  is_sandbox: boolean
  is_active: boolean
  created_at: string
}

interface WebhookDeliveryLog {
  id: string
  event: string | null
  status: 'pending' | 'delivered' | 'failed'
  response_status: number | null
  attempts: number
  created_at: string
  delivered_at: string | null
  payload: Record<string, any> | null
  response_body: string | null
}

const WEBHOOK_EVENTS: Record<string, string> = {
  'verification.started':            'Verification session created',
  'verification.document_processed': 'Document step completed (front or back)',
  'verification.completed':          'Verification passed',
  'verification.failed':             'Verification rejected',
  'verification.manual_review':      'Flagged for manual review',
  'document.expiry_warning':         'Document nearing or past expiry date',
  'verification.reverification_due': 'Scheduled re-verification is due',
}

const WEBHOOK_EVENT_NAMES = Object.keys(WEBHOOK_EVENTS)

/** Syntax-highlight JSON string with theme-consistent colors */
function highlightJson(json: string): React.ReactNode[] {
  return json.split('\n').map((line, i) => {
    const highlighted = line
      .replace(/"([^"]+)"(?=\s*:)/g, `<span style="color:${C.cyan}">"$1"</span>`)
      .replace(/:\s*"([^"]*)"/g, `: <span style="color:${C.green}">"$1"</span>`)
      .replace(/:\s*(\d+\.?\d*)/g, `: <span style="color:${C.amber}">$1</span>`)
      .replace(/:\s*(true|false)/g, `: <span style="color:${C.purple}">$1</span>`)
      .replace(/:\s*(null)/g, `: <span style="color:${C.dim}">$1</span>`)
    return <span key={i} dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} />
  })
}

// â"€â"€â"€ Shared styles â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ── Delivery grouping helpers ──

function getDevPortalSessionId(d: WebhookDeliveryLog): string | null {
  return d.payload?.verification_id ?? null
}

function getDevLifecycleStatus(deliveries: WebhookDeliveryLog[]): { label: string; color: string; bg: string } {
  const events = deliveries.map(d => d.event || '')
  if (events.some(e => e.includes('approved') || e.includes('verified')))
    return { label: 'Approved', color: C.green, bg: C.greenDim }
  if (events.some(e => e.includes('rejected') || e.includes('failed')))
    return { label: 'Failed', color: C.red, bg: C.redDim }
  if (events.some(e => e.includes('manual_review')))
    return { label: 'Review', color: C.amber, bg: C.amberDim }
  if (events.some(e => e.includes('completed')))
    return { label: 'Completed', color: C.green, bg: C.greenDim }
  if (events.some(e => e.includes('expired')))
    return { label: 'Expired', color: C.red, bg: C.redDim }
  return { label: 'In Progress', color: C.muted, bg: 'rgba(255,255,255,0.04)' }
}

function groupDevDeliveries(deliveries: WebhookDeliveryLog[]): { groupId: string; label: string; deliveries: WebhookDeliveryLog[] }[] {
  const map = new Map<string, WebhookDeliveryLog[]>()
  for (const d of deliveries) {
    const sid = getDevPortalSessionId(d) ?? '__other__'
    if (!map.has(sid)) map.set(sid, [])
    map.get(sid)!.push(d)
  }
  for (const [, group] of map) {
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  const result: { groupId: string; label: string; deliveries: WebhookDeliveryLog[] }[] = []
  for (const [sid, group] of map) {
    if (sid === '__other__') continue
    result.push({ groupId: sid, label: sid.substring(0, 8) + '...', deliveries: group })
  }
  result.sort((a, b) => new Date(b.deliveries[0].created_at).getTime() - new Date(a.deliveries[0].created_at).getTime())
  const other = map.get('__other__')
  if (other) result.push({ groupId: '__other__', label: 'Other Events', deliveries: other })
  return result
}

const inputStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 6,
  padding: '10px 14px',
  width: '100%',
  fontSize: 14,
  fontFamily: C.sans,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: C.muted,
  marginBottom: 6,
  fontWeight: 500,
}

// â"€â"€â"€ Auth gate â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type AuthStep = 'enter_email' | 'verify_otp' | 'complete_registration'

function AuthGate({ onAuth }: { onAuth: (token: string, apiKey?: string) => void }) {
  const [step, setStep] = useState<AuthStep>('enter_email')
  const [email, setEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [registrationToken, setRegistrationToken] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [githubConfigured, setGithubConfigured] = useState(false)

  const otpRefs = React.useRef(
    Array.from({ length: 6 }, () => React.createRef<HTMLInputElement>())
  ).current

  // Check if GitHub OAuth is configured
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/developer/github/url?state=check`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setGithubConfigured(d.configured === true))
      .catch(() => {})
  }, [])

  // Handle GitHub callback from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    if (!code) return

    // Verify OAuth state to prevent CSRF
    const storedState = sessionStorage.getItem('github_oauth_state')
    sessionStorage.removeItem('github_oauth_state')
    if (!returnedState || returnedState !== storedState) {
      window.history.replaceState({}, '', window.location.pathname)
      toast.error('OAuth state mismatch. Please try again.')
      return
    }

    setLoading(true)
    fetch(`${API_BASE_URL}/api/auth/developer/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        window.history.replaceState({}, '', window.location.pathname)
        if (!ok) throw new Error(data.message || 'GitHub login failed')
        onAuth('session', data.api_key?.key)
      })
      .catch((err: unknown) => {
        window.history.replaceState({}, '', window.location.pathname)
        toast.error(err instanceof Error ? err.message : 'GitHub login failed')
      })
      .finally(() => setLoading(false))
  }, [onAuth])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const sendOtp = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/developer/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to send code')
      setStep('verify_otp')
      setResendCooldown(30)

      if (data.code && data.self_hosted) {
        // Self-hosted mode: auto-fill and auto-submit the OTP
        const digits = data.code.split('')
        setOtpDigits(digits)
        toast.success('Self-hosted mode — code auto-filled')
        // Small delay to let state update, then auto-verify
        setTimeout(() => verifyOtp(data.code), 300)
      } else {
        setOtpDigits(['', '', '', '', '', ''])
        toast.success('Verification code sent')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...otpDigits]
    next[index] = value
    setOtpDigits(next)

    // Auto-advance
    if (value && index < 5) {
      otpRefs[index + 1].current?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && next.every(d => d.length === 1)) {
      verifyOtp(next.join(''))
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 0) return
    const next = [...otpDigits]
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setOtpDigits(next)
    if (pasted.length === 6) {
      verifyOtp(pasted)
    } else {
      otpRefs[Math.min(pasted.length, 5)].current?.focus()
    }
  }

  const verifyOtp = async (code: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/developer/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Invalid code')

      if (data.is_new) {
        // New user — go to registration step
        setRegistrationToken(data.registration_token)
        setStep('complete_registration')
      } else {
        // Existing user — login complete (cookie set by server)
        onAuth(data.token)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
      setOtpDigits(['', '', '', '', '', ''])
      otpRefs[0].current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const completeRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/developer/otp/complete-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ registration_token: registrationToken, name, company }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Registration failed')
      // Cookie set by server
      onAuth(data.token, data.api_key?.key)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const startGitHub = async () => {
    setLoading(true)
    try {
      const state = crypto.randomUUID()
      sessionStorage.setItem('github_oauth_state', state)
      const res = await fetch(`${API_BASE_URL}/api/auth/developer/github/url?state=${encodeURIComponent(state)}`, { credentials: 'include' })
      const data = await res.json()
      if (!data.url) throw new Error('GitHub OAuth not configured')
      window.location.href = data.url
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'GitHub login failed')
      setLoading(false)
    }
  }

  const digitInputStyle: React.CSSProperties = {
    width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 600,
    fontFamily: C.mono, background: C.surface, border: `1px solid ${C.border}`,
    color: C.text, borderRadius: 8, outline: 'none',
  }

  return (
    <div className="pattern-shield pattern-faint pattern-full" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, width: '100%', maxWidth: 400 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 24 }}>
          idswyft / developer-portal
        </div>

        {/* ── Step 1: Enter email ── */}
        {step === 'enter_email' && (
          <>
            <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              Sign in
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>
              Enter your email to get a verification code
            </p>
            <form onSubmit={e => { e.preventDefault(); sendOtp() }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ background: C.cyan, color: C.bg, borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Sending code...' : 'Continue with Email'}
              </button>
            </form>

            {githubConfigured && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ color: C.dim, fontSize: 12 }}>or</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
                <button
                  onClick={startGitHub}
                  disabled={loading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '11px 0', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                  Continue with GitHub
                </button>
              </>
            )}
          </>
        )}

        {/* ── Step 2: Verify OTP ── */}
        {step === 'verify_otp' && (
          <>
            <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              Check your email
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
              We sent a 6-digit code to <span style={{ color: C.text }}>{email}</span>
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }} onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={otpRefs[i]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpDigit(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                  disabled={loading}
                  style={digitInputStyle}
                />
              ))}
            </div>
            {loading && <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginBottom: 16 }}>Verifying...</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => { setStep('enter_email'); setOtpDigits(['', '', '', '', '', '']) }}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13 }}
              >
                Use different email
              </button>
              <button
                onClick={() => { sendOtp() }}
                disabled={resendCooldown > 0 || loading}
                style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? C.dim : C.cyan, cursor: resendCooldown > 0 ? 'default' : 'pointer', fontSize: 13 }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Complete registration (new users only) ── */}
        {step === 'complete_registration' && (
          <>
            <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              Create your account
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
              Almost there! Tell us a bit about yourself.
            </p>
            <form onSubmit={completeRegistration} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Company (optional)</label>
                <input style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ background: C.cyan, color: C.bg, borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// â"€â"€â"€ Create key modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function CreateKeyModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (key: ApiKey, fullKey: string) => void
}) {
  const [name, setName] = useState('')
  const [isSandbox, setIsSandbox] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ name, is_sandbox: isSandbox }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to create key')
      const newKey: ApiKey = {
        id: data.key_id,
        name: data.name,
        key_preview: `${data.key_prefix}...`,
        is_sandbox: data.is_sandbox,
        is_active: true,
        last_used_at: null,
        created_at: data.created_at,
        expires_at: data.expires_at,
        status: 'active',
      }
      onCreated(newKey, data.api_key)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 420 }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 24 }}>Create API Key</h2>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Key name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production App" required />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              id="sandbox-toggle"
              checked={isSandbox}
              onChange={e => setIsSandbox(e.target.checked)}
              style={{ accentColor: C.cyan, width: 16, height: 16 }}
            />
            <label htmlFor="sandbox-toggle" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              Sandbox mode (simulated results)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 1, background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// â"€â"€â"€ Main portal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function DeveloperPage() {
  const navigate = useNavigate()
  useEffect(() => { injectFonts() }, [])

  const [token, setToken] = useState<string | null>(null)
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)

  // On mount, check if an auth cookie exists by probing a protected endpoint
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/developer/profile`, { credentials: 'include' })
      .then(res => { if (res.ok) { setToken('session'); fetchCsrfToken(); } })
      .catch(() => {})
  }, [])

  // Community edition: redirect to /setup if no developers exist yet
  // On API error (e.g. backend not ready during Docker startup), redirect
  // to /setup which has a retry UI, rather than showing the login form
  // for an account that doesn't exist yet.
  useEffect(() => {
    if (token || !isCommunity) { setSetupNeeded(false); return }
    fetch(`${API_BASE_URL}/api/setup/status`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (data.needs_setup) navigate('/setup', { replace: true })
        else setSetupNeeded(false)
      })
      .catch(() => navigate('/setup', { replace: true }))
  }, [token, navigate])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [stats, setStats] = useState<DeveloperStats | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newFullKey, setNewFullKey] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookApiKeyId, setWebhookApiKeyId] = useState<string | null>(null)
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>([...WEBHOOK_EVENT_NAMES])
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteAccountEmail, setDeleteAccountEmail] = useState('')
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false)
  const [showPayloadExample, setShowPayloadExample] = useState(false)
  const [webhooks, setWebhooks] = useState<DeveloperWebhook[]>([])
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [expandedWebhookLog, setExpandedWebhookLog] = useState<string | null>(null)
  const [webhookDeliveries, setWebhookDeliveries] = useState<Record<string, WebhookDeliveryLog[]>>({})
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null)
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null)
  const [resendingDeliveryId, setResendingDeliveryId] = useState<string | null>(null)
  const [deliveryViewMode, setDeliveryViewMode] = useState<Record<string, 'chronological' | 'grouped'>>({})
  const [expandedSessionGroups, setExpandedSessionGroups] = useState<Record<string, Set<string>>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null)
  const [keyLogs, setKeyLogs] = useState<Record<string, ApiActivity[]>>({})
  const [keySessionOutcomes, setKeySessionOutcomes] = useState<Record<string, Record<string, string>>>({})
  const [logsLoadingForKey, setLogsLoadingForKey] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<ApiActivity | null>(null)
  const [logSearchByKey, setLogSearchByKey] = useState<Record<string, string>>({})
  const [expandedSessionByKey, setExpandedSessionByKey] = useState<Record<string, string | null>>({})
  const [verificationDetail, setVerificationDetail] = useState<VerificationDetail | null>(null)
  const [verificationDetailLoading, setVerificationDetailLoading] = useState<string | null>(null)
  const [verificationDetailError, setVerificationDetailError] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'scores' | 'json'>('scores')

  // LLM Enhancement settings
  const [llmProvider, setLlmProvider] = useState<string>('')
  const [llmApiKey, setLlmApiKey] = useState<string>('')
  const [llmEndpointUrl, setLlmEndpointUrl] = useState<string>('')
  const [llmKeyPreview, setLlmKeyPreview] = useState<string>('')
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmLoading, setLlmLoading] = useState(false)
  const [showLlmKey, setShowLlmKey] = useState(false)

  // Profile settings
  const [profileName, setProfileName] = useState('')
  const [profileCompany, setProfileCompany] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // Reviewer management
  const [reviewers, setReviewers] = useState<Array<{ id: string; email: string; name?: string; status: string; invited_at: string; last_login_at?: string }>>([])
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerInviting, setReviewerInviting] = useState(false)

  const fetchKeys = async (_t?: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-keys`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.status === 401) { setToken(null); return }
      if (res.ok) setApiKeys((await res.json()).api_keys ?? [])
    } catch { /* network error - backend offline, show empty state */ }
  }

  const fetchStats = async (_t?: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/stats`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) setStats(await res.json())
    } catch { /* network error */ }
  }

  const fetchWebhooks = async (_t?: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setWebhooks(data.webhooks ?? [])
      }
    } catch { /* network error */ }
  }

  const fetchLLMSettings = async (_t?: string) => {
    setLlmLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setLlmConfigured(data.configured)
        setLlmProvider(data.provider || '')
        setLlmKeyPreview(data.api_key_preview || '')
        setLlmEndpointUrl(data.endpoint_url || '')
        setLlmApiKey('')
        setShowLlmKey(false)
      }
    } catch { /* network error */ }
    setLlmLoading(false)
  }

  const saveLLMSettings = async () => {
    if (!token) return
    setLlmSaving(true)
    try {
      const body: Record<string, string | null> = { provider: llmProvider || null }
      if (llmApiKey) body.api_key = llmApiKey
      if (llmProvider === 'custom') body.endpoint_url = llmEndpointUrl || null
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(llmProvider ? 'LLM settings saved' : 'LLM settings cleared')
        fetchLLMSettings(token)
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        toast.error(err.error || 'Failed to save LLM settings')
      }
    } catch { toast.error('Network error') }
    setLlmSaving(false)
  }

  const clearLLMSettings = async () => {
    if (!token) return
    setLlmSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ provider: null }),
      })
      if (res.ok) {
        toast.success('LLM settings cleared')
        setLlmProvider('')
        setLlmApiKey('')
        setLlmEndpointUrl('')
        setLlmKeyPreview('')
        setLlmConfigured(false)
      }
    } catch { toast.error('Network error') }
    setLlmSaving(false)
  }

  const fetchProfile = async (_t?: string) => {
    setProfileLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/profile`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const { data } = await res.json()
        setProfileName(data.name || '')
        setProfileCompany(data.company || '')
        setProfileEmail(data.email || '')
        setProfileAvatarUrl(data.avatar_url || '')
      }
    } catch { /* network error */ }
    setProfileLoading(false)
  }

  const saveProfile = async () => {
    if (!token) return
    setProfileSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ name: profileName, company: profileCompany || null }),
      })
      if (res.ok) {
        toast.success('Profile updated')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Failed to update profile')
      }
    } catch { toast.error('Network error') }
    setProfileSaving(false)
  }

  const uploadAvatar = async (file: File) => {
    if (!token) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/avatar`, {
        method: 'POST',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
        body: formData,
      })
      if (res.ok) {
        const { data } = await res.json()
        setProfileAvatarUrl(data.avatar_url)
        toast.success('Avatar updated')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Failed to upload avatar')
      }
    } catch { toast.error('Network error') }
  }

  const fetchReviewers = async (_t?: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setReviewers(data.reviewers ?? [])
      }
    } catch { /* network error */ }
  }

  const inviteReviewer = async () => {
    if (!token || !reviewerEmail) return
    setReviewerInviting(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ email: reviewerEmail, name: reviewerName || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setReviewers(prev => [data.reviewer, ...prev])
        setReviewerEmail('')
        setReviewerName('')
        toast.success('Reviewer invited')
      } else {
        toast.error(data.message || 'Failed to invite reviewer')
      }
    } catch { toast.error('Network error') }
    setReviewerInviting(false)
  }

  const revokeReviewer = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers/${id}`, {
        method: 'DELETE',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        setReviewers(prev => prev.map(r => r.id === id ? { ...r, status: 'revoked' } : r))
        toast.success('Reviewer access revoked')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || 'Failed to revoke reviewer')
      }
    } catch { toast.error('Network error') }
  }

  useEffect(() => {
    if (token) {
      fetchKeys(token)
      fetchStats(token)
      fetchWebhooks(token)
      fetchLLMSettings(token)
      fetchProfile(token)
      fetchReviewers(token)
    }
  }, [token])

  const handleAuth = (t: string, apiKey?: string) => {
    setToken(t)
    fetchCsrfToken()
    if (apiKey) setNewFullKey(apiKey)
  }

  const handleCreated = (key: ApiKey, fullKey: string) => {
    setApiKeys(prev => [...prev, key])
    setNewFullKey(fullKey)
    setShowCreate(false)
  }

  const handleDelete = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-key/${id}`, {
        method: 'DELETE',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
      })
      if (!res.ok) throw new Error('Delete failed')
      setApiKeys(prev => prev.filter(k => k.id !== id))
      toast.success('Key deleted')
    } catch {
      toast.error('Failed to delete key')
    } finally {
      setDeleteId(null)
    }
  }

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: csrfHeader() }).catch(() => {})
    clearCsrfToken()
    setToken(null)
    setApiKeys([])
    setStats(null)
    setWebhooks([])
    setReviewers([])
    setRevealedSecrets({})
    setExpandedKeyId(null)
    setKeyLogs({})
    setKeySessionOutcomes({})
  }

  const fetchKeyLogs = async (keyId: string) => {
    if (!token) return
    setLogsLoadingForKey(keyId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/activity?api_key_id=${encodeURIComponent(keyId)}`, {
        credentials: 'include' as RequestCredentials,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load logs')
      setKeyLogs(prev => ({ ...prev, [keyId]: data.recent_activities ?? [] }))
      setKeySessionOutcomes(prev => ({ ...prev, [keyId]: data.session_outcomes ?? {} }))
    } catch {
      toast.error('Failed to load API call logs')
      setKeyLogs(prev => ({ ...prev, [keyId]: [] }))
    } finally {
      setLogsLoadingForKey(null)
    }
  }

  const toggleKeyLogs = async (keyId: string) => {
    if (expandedKeyId === keyId) {
      setExpandedKeyId(null)
      return
    }
    setExpandedKeyId(keyId)
    if (!keyLogs[keyId]) {
      await fetchKeyLogs(keyId)
    }
  }

  const inferResourceLabel = (endpoint: string) => {
    const clean = endpoint.split('?')[0]
    const parts = clean.split('/').filter(Boolean)
    if (parts.length === 0) return 'unknown'
    const apiIndex = parts.indexOf('api')
    if (apiIndex >= 0 && parts[apiIndex + 1]) return parts[apiIndex + 1]
    return parts[0]
  }

  const extractSessionId = (endpoint: string) => {
    const uuidMatch = endpoint.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
    if (uuidMatch) return uuidMatch[0]
    const queryMatch = endpoint.match(/(?:session_id|verification_id)=([^&]+)/i)
    if (queryMatch && queryMatch[1]) return decodeURIComponent(queryMatch[1])
    return 'no-session'
  }

  const groupLogsBySession = (logs: ApiActivity[]) => {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const explicit = sorted.map(log => {
      const sid = extractSessionId(log.endpoint)
      return sid === 'no-session' ? null : sid
    })

    const prevSession: Array<string | null> = []
    const nextSession: Array<string | null> = new Array(sorted.length).fill(null)

    let currentPrev: string | null = null
    for (let i = 0; i < sorted.length; i++) {
      if (explicit[i]) currentPrev = explicit[i]
      prevSession[i] = currentPrev
    }

    let currentNext: string | null = null
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (explicit[i]) currentNext = explicit[i]
      nextSession[i] = currentNext
    }

    return sorted.reduce<Record<string, ApiActivity[]>>((acc, log, idx) => {
      const rawSession = extractSessionId(log.endpoint)
      const assignedSession =
        rawSession !== 'no-session'
          ? rawSession
          : (prevSession[idx] || nextSession[idx] || 'no-session')
      if (!acc[assignedSession]) acc[assignedSession] = []
      acc[assignedSession].push(log)
      return acc
    }, {})
  }

  const toggleSessionGroup = (keyId: string, sessionId: string) => {
    setExpandedSessionByKey(prev => ({
      ...prev,
      [keyId]: prev[keyId] === sessionId ? null : sessionId,
    }))
  }

  const inferActionLabel = (method: string, endpoint: string) => {
    const lowerMethod = method.toUpperCase()
    const lowerEndpoint = endpoint.toLowerCase()
    if (lowerMethod === 'POST' && lowerEndpoint.includes('/start')) return 'Start verification flow'
    if (lowerMethod === 'POST' && lowerEndpoint.includes('/upload')) return 'Upload verification artifact'
    if (lowerMethod === 'GET' && lowerEndpoint.includes('/status')) return 'Read verification status'
    if (lowerMethod === 'POST') return 'Create/submit resource'
    if (lowerMethod === 'GET') return 'Read resource'
    if (lowerMethod === 'PUT' || lowerMethod === 'PATCH') return 'Update resource'
    if (lowerMethod === 'DELETE') return 'Delete resource'
    return 'Process API call'
  }

  const copyKey = async (key: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(key)
      } else {
        // Fallback for non-HTTPS contexts (e.g. LAN IP in development)
        const textarea = document.createElement('textarea')
        textarea.value = key
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy - try selecting and copying manually')
    }
  }

  const fetchVerificationDetail = async (verificationId: string) => {
    if (!token) return
    setVerificationDetailLoading(verificationId)
    setVerificationDetailError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/verifications/${verificationId}`, {
        credentials: 'include' as RequestCredentials,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load verification details')
      setVerificationDetail(data)
      setDetailTab('scores')
    } catch (err: unknown) {
      setVerificationDetailError(err instanceof Error ? err.message : 'Failed to load verification details')
      setVerificationDetail(null)
    } finally {
      setVerificationDetailLoading(null)
    }
  }

  const addWebhook = async () => {
    if (!token) return
    const url = webhookUrl.trim()
    if (!url) {
      toast.error('Enter a webhook URL')
      return
    }
    if (selectedWebhookEvents.length === 0) {
      toast.error('Select at least one webhook event')
      return
    }

    setWebhookLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ url, events: selectedWebhookEvents, api_key_id: webhookApiKeyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to add webhook')
      setWebhooks(prev => [data.webhook, ...prev])
      // Store the full secret so the user can copy it right after creation
      if (data.webhook?.secret_key) {
        setRevealedSecrets(prev => ({ ...prev, [data.webhook.id]: data.webhook.secret_key }))
      }
      setWebhookUrl('')
      setWebhookApiKeyId(null)
      setSelectedWebhookEvents([...WEBHOOK_EVENT_NAMES])
      toast.success('Webhook added - copy your signing secret now')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add webhook')
    } finally {
      setWebhookLoading(false)
    }
  }

  const removeWebhook = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}`, {
        method: 'DELETE',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
      })
      if (!res.ok) throw new Error('Failed to remove webhook')
      setWebhooks(prev => prev.filter(w => w.id !== id))
      setRevealedSecrets(prev => { const copy = { ...prev }; delete copy[id]; return copy })
      toast.success('Webhook removed')
    } catch {
      toast.error('Failed to remove webhook')
    }
  }

  const testWebhook = async (id: string) => {
    if (!token) return
    setTestingWebhookId(id)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}/test`, {
        method: 'POST',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
        signal: controller.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (data.success) {
        toast.success(`Test delivered (HTTP ${data.status_code})`)
      } else {
        toast.error(data.error || `Test failed${data.status_code ? ` (HTTP ${data.status_code})` : ''}`)
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      toast.error(isAbort ? 'Test timed out - check that the webhook URL is reachable' : 'Failed to send test webhook')
    } finally {
      setTestingWebhookId(null)
    }
  }

  const revealSecret = async (id: string) => {
    if (revealedSecrets[id]) {
      setRevealedSecrets(prev => { const copy = { ...prev }; delete copy[id]; return copy })
      return
    }
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}/secret`, {
        credentials: 'include' as RequestCredentials,
      })
      const data = await res.json()
      if (res.ok && data.secret_key) {
        setRevealedSecrets(prev => ({ ...prev, [id]: data.secret_key }))
      } else {
        toast.error('Failed to reveal secret')
      }
    } catch {
      toast.error('Failed to reveal secret')
    }
  }

  const toggleDeliveryLog = async (webhookId: string) => {
    if (expandedWebhookLog === webhookId) {
      setExpandedWebhookLog(null)
      return
    }
    setExpandedWebhookLog(webhookId)
    if (webhookDeliveries[webhookId]) return // already fetched
    if (!token) return
    setDeliveriesLoading(webhookId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries`, {
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setWebhookDeliveries(prev => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
      }
    } catch { /* network error */ }
    finally { setDeliveriesLoading(null) }
  }

  const resendDelivery = async (webhookId: string, deliveryId: string) => {
    if (!token) return
    setResendingDeliveryId(deliveryId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries/${deliveryId}/resend`, {
        method: 'POST',
        headers: csrfHeader(),
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        toast.success('Webhook resent')
        // Refresh deliveries for this webhook
        const listRes = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries`, {
          credentials: 'include' as RequestCredentials,
        })
        if (listRes.ok) {
          const data = await listRes.json()
          setWebhookDeliveries(prev => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
        }
      } else {
        toast.error('Failed to resend webhook')
      }
    } catch {
      toast.error('Failed to resend webhook')
    } finally {
      setResendingDeliveryId(null)
    }
  }

  // Shared delivery item renderer used by both chronological and grouped views
  const renderDeliveryItem = (d: WebhookDeliveryLog, webhookId: string, opts?: { compact?: boolean }) => {
    const statusColor = d.status === 'delivered' ? C.green : d.status === 'failed' ? C.red : C.muted
    const isExpanded = expandedDeliveryId === d.id
    const compact = opts?.compact
    return (
      <div key={d.id}>
        <div
          onClick={() => setExpandedDeliveryId(isExpanded ? null : d.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '5px 8px' : '6px 8px',
            background: isExpanded ? C.surface : C.panel, borderRadius: isExpanded ? '4px 4px 0 0' : 4,
            fontSize: 11, cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontFamily: C.mono, color: C.text, minWidth: compact ? 140 : 160 }}>{d.event || 'unknown'}</span>
          <span style={{ color: statusColor, fontWeight: 500, minWidth: compact ? 50 : 60, fontSize: compact ? 10 : 11 }}>{d.status === 'delivered' ? `${d.response_status}` : d.status}</span>
          <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{compact ? new Date(d.created_at).toLocaleTimeString() : new Date(d.created_at).toLocaleString()}</span>
          <span style={{ color: C.muted, fontSize: 10, marginLeft: 4, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>&#9656;</span>
        </div>
        {isExpanded && (
          <div style={{ background: C.codeBg, borderRadius: '0 0 6px 6px', border: `1px solid ${C.border}`, borderTop: 'none', overflow: 'hidden' }}>
            {d.payload && (
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Request Payload</div>
                <pre style={{ margin: 0, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, lineHeight: 1.5, fontFamily: C.mono, color: C.text, overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre', wordBreak: 'normal' }}>{highlightJson(JSON.stringify(d.payload, null, 2))}</pre>
              </div>
            )}
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Response</span>
                {d.response_status && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: d.response_status < 300 ? C.greenDim : d.response_status < 500 ? C.amberDim : C.redDim, color: d.response_status < 300 ? C.green : d.response_status < 500 ? C.amber : C.red }}>{d.response_status}</span>
                )}
              </div>
              <pre style={{ margin: 0, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, lineHeight: 1.5, fontFamily: C.mono, color: C.muted, overflowX: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{d.response_body ? (() => { try { return highlightJson(JSON.stringify(JSON.parse(d.response_body), null, 2)) } catch { return d.response_body.slice(0, 500) } })() : 'No response captured'}</pre>
            </div>
            {(d.status === 'failed' || d.status === 'pending') && d.payload && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); resendDelivery(webhookId, d.id) }}
                  disabled={resendingDeliveryId === d.id}
                  style={{ background: 'none', border: `1px solid ${C.cyanBorder}`, color: C.cyan, borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 500, cursor: resendingDeliveryId === d.id ? 'wait' : 'pointer', opacity: resendingDeliveryId === d.id ? 0.5 : 1 }}
                >{resendingDeliveryId === d.id ? 'Resending...' : 'Resend'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const deleteAccount = async () => {
    if (!token) return
    setDeleteAccountLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ confirm_email: deleteAccountEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to delete account')
      fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: csrfHeader() }).catch(() => {})
      clearCsrfToken()
      setToken(null)
      toast.success('Account deleted')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteAccountLoading(false)
      setShowDeleteAccount(false)
      setDeleteAccountEmail('')
    }
  }

  if (!token) {
    // Community edition: show spinner while checking if setup is needed
    if (isCommunity && setupNeeded === null) {
      return (
        <div style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: C.muted, fontSize: 14 }}>Loading...</div>
        </div>
      )
    }
    return (
      <div style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh' }}>
        <AuthGate onAuth={handleAuth} />
      </div>
    )
  }

  const curlSnippet = `curl -X POST https://api.idswyft.app/api/verification/sessions \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"sandbox"}'`

  return (
    <div className="pattern-microprint pattern-faint pattern-fade-edges pattern-full" style={{ background: C.bg, fontFamily: C.sans, color: C.text, fontSize: 14, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
              idswyft / developer-portal
            </div>
            <h1 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text }}>API Keys</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowSettings(true)}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Settings"
            >
              <Cog6ToothIcon style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={handleLogout}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* New key banner */}
        {newFullKey && (
          <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 8, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 4 }}>Key created - copy it now, it won't be shown again</div>
              <code style={{ fontFamily: C.mono, fontSize: 13, color: C.text, wordBreak: 'break-all' }}>{newFullKey}</code>
            </div>
            <button
              onClick={() => copyKey(newFullKey)}
              style={{ background: C.green, color: C.bg, border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
            >
              Copy
            </button>
            <button
              onClick={() => setNewFullKey(null)}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, padding: '0 4px' }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Usage strip */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Requests this month', value: stats.monthly_usage.toLocaleString() },
              { label: 'Verifications',        value: stats.successful_requests.toLocaleString() },
              { label: 'Limit remaining',      value: (stats.monthly_limit - stats.monthly_usage).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.cyan }}>{value}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {token && <AnalyticsCharts token={token} />}

        {/* API Keys table */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>API Keys</span>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.cyan, color: C.bg, border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <PlusIcon style={{ width: 14, height: 14 }} />
              Create Key
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Key', 'Type', 'Created', 'Last Used', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
                            <tbody>
                {apiKeys.map(key => (
                  <React.Fragment key={key.id}>
                    <tr style={{ borderBottom: expandedKeyId === key.id ? 'none' : `1px solid ${C.border}` }}>
                      <td style={{ padding: '12px 16px', color: C.text, fontSize: 14 }}>{key.name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>{key.key_preview}</code>
                          <button
                            onClick={() => copyKey(key.key_preview)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 2 }}
                          >
                            <ClipboardDocumentIcon style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: key.is_sandbox ? 'rgba(251,191,36,0.1)' : C.greenDim,
                          color: key.is_sandbox ? C.amber : C.green,
                          border: `1px solid ${key.is_sandbox ? C.amber : C.green}33`,
                          borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                        }}>
                          {key.is_sandbox ? 'sandbox' : 'live'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 13 }}>
                        {new Date(key.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 13 }}>
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {deleteId === key.id ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleDelete(key.id)}
                              style={{ background: C.redDim, color: C.red, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteId(null)}
                              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => toggleKeyLogs(key.id)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 12, padding: 2, fontFamily: C.mono }}
                            >
                              {expandedKeyId === key.id ? (
                                <ChevronDownIcon style={{ width: 12, height: 12 }} />
                              ) : (
                                <ChevronRightIcon style={{ width: 12, height: 12 }} />
                              )}
                              logs
                            </button>
                            <button
                              onClick={() => setDeleteId(key.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4 }}
                            >
                              <TrashIcon style={{ width: 15, height: 15 }} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {expandedKeyId === key.id && (
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td colSpan={6} style={{ padding: '0 16px 14px 16px', background: C.panel }}>
                          {logsLoadingForKey === key.id ? (
                            <div style={{ color: C.muted, fontSize: 12, paddingTop: 4 }}>Loading logs...</div>
                          ) : (keyLogs[key.id] ?? []).length === 0 ? (
                            <div style={{ color: C.muted, fontSize: 12, paddingTop: 4 }}>No recent API calls for this key.</div>
                          ) : (
                            <>
                              <div style={{ marginBottom: 10 }}>
                                <input
                                  style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }}
                                  value={logSearchByKey[key.id] ?? ''}
                                  onChange={e => setLogSearchByKey(prev => ({ ...prev, [key.id]: e.target.value }))}
                                  placeholder="Search session ID or endpoint"
                                />
                              </div>
                              {(() => {
                                const searchTerm = (logSearchByKey[key.id] ?? '').trim().toLowerCase()
                                const filteredLogs = (keyLogs[key.id] ?? []).filter(log => {
                                  const sessionId = extractSessionId(log.endpoint).toLowerCase()
                                  return !searchTerm || sessionId.includes(searchTerm) || log.endpoint.toLowerCase().includes(searchTerm)
                                })

                                const grouped = groupLogsBySession(filteredLogs)

                                const sessionIds = Object.keys(grouped).sort((a, b) => {
                                  const aLatest = grouped[a].reduce((max, log) => Math.max(max, new Date(log.timestamp).getTime()), 0)
                                  const bLatest = grouped[b].reduce((max, log) => Math.max(max, new Date(log.timestamp).getTime()), 0)
                                  return bLatest - aLatest
                                })

                                if (sessionIds.length === 0) {
                                  return <div style={{ color: C.muted, fontSize: 12, paddingTop: 4 }}>No sessions matched your search.</div>
                                }

                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {sessionIds.map(sessionId => {
                                      const logs = grouped[sessionId]
                                      const latestTs = logs.reduce((max, log) => Math.max(max, new Date(log.timestamp).getTime()), 0)
                                      const isOpen = expandedSessionByKey[key.id] === sessionId
                                      const verificationOutcome = (keySessionOutcomes[key.id] ?? {})[sessionId]
                                      const normalizedOutcome = verificationOutcome ? verificationOutcome.toLowerCase() : ''
                                      const isFailedOutcome = normalizedOutcome === 'failed'
                                      const isSuccessOutcome = normalizedOutcome === 'verified'
                                      const outcomeLabel = isFailedOutcome
                                        ? 'failed'
                                        : isSuccessOutcome
                                          ? 'succeeded'
                                          : verificationOutcome || 'in_progress'

                                      return (
                                        <div key={sessionId} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                                          <button
                                            onClick={() => toggleSessionGroup(key.id, sessionId)}
                                            style={{ width: '100%', background: C.surface, border: 'none', borderBottom: isOpen ? `1px solid ${C.border}` : 'none', textAlign: 'left', padding: '10px 12px', cursor: 'pointer' }}
                                          >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                              <div>
                                                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                  Session: {sessionId === 'no-session' ? 'unscoped request' : sessionId}
                                                  {sessionId !== 'no-session' && (
                                                    <ClipboardDocumentIcon
                                                      style={{ width: 12, height: 12, color: C.muted, cursor: 'pointer', flexShrink: 0 }}
                                                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); copyKey(sessionId) }}
                                                    />
                                                  )}
                                                </div>
                                                <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                  <span>{logs.length} call{logs.length > 1 ? 's' : ''} • last activity {new Date(latestTs).toLocaleString()}</span>
                                                  {sessionId !== 'no-session' ? (
                                                    <span
                                                      role="button"
                                                      tabIndex={0}
                                                      onClick={(e: React.MouseEvent) => {
                                                        e.stopPropagation()
                                                        fetchVerificationDetail(sessionId)
                                                      }}
                                                      onKeyDown={(e: React.KeyboardEvent) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                          e.preventDefault()
                                                          e.stopPropagation()
                                                          fetchVerificationDetail(sessionId)
                                                        }
                                                      }}
                                                      style={{
                                                        background: isFailedOutcome ? C.redDim : isSuccessOutcome ? C.greenDim : C.surface,
                                                        color: isFailedOutcome ? C.red : isSuccessOutcome ? C.green : C.muted,
                                                        border: `1px solid ${isFailedOutcome ? `${C.red}33` : isSuccessOutcome ? `${C.green}33` : C.border}`,
                                                        borderRadius: 4,
                                                        padding: '1px 6px',
                                                        fontSize: 10,
                                                        fontFamily: C.mono,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.04em',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                      }}
                                                    >
                                                      <CodeBracketIcon style={{ width: 10, height: 10 }} />
                                                      {verificationDetailLoading === sessionId ? 'loading...' : outcomeLabel}
                                                    </span>
                                                  ) : (
                                                    <span
                                                      style={{
                                                        background: C.surface,
                                                        color: C.muted,
                                                        border: `1px solid ${C.border}`,
                                                        borderRadius: 4,
                                                        padding: '1px 6px',
                                                        fontSize: 10,
                                                        fontFamily: C.mono,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.04em',
                                                      }}
                                                    >
                                                      {outcomeLabel}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div style={{ color: C.cyan, fontSize: 12, fontFamily: C.mono }}>
                                                {isOpen ? 'hide' : 'open'}
                                              </div>
                                            </div>
                                          </button>

                                          {isOpen && (
                                            <div style={{ overflowX: 'auto' }}>
                                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                  <tr>
                                                    {['Time', 'Method', 'Endpoint', 'Status', 'Latency'].map(h => (
                                                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
                                                        {h}
                                                      </th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {logs.map((log, index) => (
                                                    <tr
                                                      key={`${sessionId}-${log.timestamp}-${index}`}
                                                      style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                                                      onClick={() => setSelectedLog(log)}
                                                    >
                                                      <td style={{ padding: '8px 10px', color: C.muted, fontSize: 12, fontFamily: C.mono }}>{new Date(log.timestamp).toLocaleString()}</td>
                                                      <td style={{ padding: '8px 10px', color: C.text, fontSize: 12, fontFamily: C.mono }}>{log.method}</td>
                                                      <td style={{ padding: '8px 10px', color: C.text, fontSize: 12, fontFamily: C.mono }}>{log.endpoint}</td>
                                                      <td style={{ padding: '8px 10px', color: log.status_code >= 400 ? C.red : C.green, fontSize: 12, fontFamily: C.mono }}>{log.status_code}</td>
                                                      <td style={{ padding: '8px 10px', color: C.muted, fontSize: 12, fontFamily: C.mono }}>{log.response_time_ms}ms</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick start */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 16 }}>Quick Start</div>
          <pre style={{ background: C.codeBg, borderRadius: 6, padding: '16px 18px', margin: 0, fontFamily: C.mono, fontSize: 12, color: C.code, lineHeight: 1.7, overflowX: 'auto' }}>
            <code>{curlSnippet}</code>
          </pre>
          <div style={{ marginTop: 12 }}>
            <Link to="/docs" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>
              Full documentation â†'
            </Link>
          </div>
        </div>

        {/* Webhooks */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>Webhooks</div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
            Receive signed POST callbacks when verification status changes. Each webhook gets a unique signing secret for HMAC verification.
          </div>

          {/* Add webhook form */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Endpoint URL</label>
              <input
                style={{ ...inputStyle }}
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://yourapp.com/webhook"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Scope to API Key</label>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={webhookApiKeyId ?? ''}
                onChange={e => setWebhookApiKeyId(e.target.value || null)}
              >
                <option value="">All keys (fires for every verification)</option>
                {apiKeys.filter(k => k.status === 'active').map(k => (
                  <option key={k.id} value={k.id}>
                    {k.key_preview} - {k.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Events</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ background: 'none', border: 'none', color: C.cyan, fontSize: 11, cursor: 'pointer', padding: 0 }}
                    onClick={() => setSelectedWebhookEvents([...WEBHOOK_EVENT_NAMES])}
                  >
                    Select All
                  </button>
                  <span style={{ color: C.border }}>|</span>
                  <button
                    style={{ background: 'none', border: 'none', color: C.cyan, fontSize: 11, cursor: 'pointer', padding: 0 }}
                    onClick={() => setSelectedWebhookEvents([])}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {WEBHOOK_EVENT_NAMES.map(eventName => {
                  const checked = selectedWebhookEvents.includes(eventName)
                  return (
                    <label key={eventName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const isChecked = e.target.checked
                          setSelectedWebhookEvents(prev => (
                            isChecked
                              ? [...prev, eventName]
                              : prev.filter(item => item !== eventName)
                          ))
                        }}
                        style={{ accentColor: C.cyan, width: 14, height: 14, marginTop: 2, flexShrink: 0 }}
                      />
                      <div>
                        <span style={{ color: C.text, fontSize: 12, fontFamily: C.mono }}>{eventName}</span>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{WEBHOOK_EVENTS[eventName]}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <button
              style={{ background: C.cyan, border: 'none', color: C.bg, borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: webhookLoading ? 0.6 : 1 }}
              onClick={addWebhook}
              disabled={webhookLoading}
            >
              {webhookLoading ? 'Adding...' : 'Add Webhook'}
            </button>
          </div>

          {/* Active webhooks list */}
          {webhooks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {webhooks.map(hook => (
                <div
                  key={hook.id}
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  {/* URL + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: hook.is_active ? C.green : C.muted, flexShrink: 0 }} />
                    <code style={{ fontFamily: C.mono, fontSize: 12, color: C.text, wordBreak: 'break-all', flex: 1 }}>{hook.url}</code>
                    <span style={{ color: C.muted, fontSize: 10 }}>{new Date(hook.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* API key scope */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>Scope:</span>
                    <span style={{
                      fontFamily: C.mono,
                      fontSize: 11,
                      color: hook.api_key_id ? C.cyan : C.muted,
                    }}>
                      {hook.api_key_id
                        ? `${hook.api_key_preview || hook.api_key_id}${hook.api_key_name ? ` (${hook.api_key_name})` : ''}`
                        : 'All keys'}
                    </span>
                  </div>

                  {/* Event pills */}
                  {hook.events && hook.events.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                      {hook.events.map(eventName => (
                        <span
                          key={`${hook.id}-${eventName}`}
                          style={{
                            background: C.panel,
                            border: `1px solid ${C.border}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                            color: C.muted,
                            fontSize: 10,
                            fontFamily: C.mono,
                          }}
                        >
                          {eventName}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Secret key */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>Secret:</span>
                    <code style={{ fontFamily: C.mono, fontSize: 11, color: C.text, flex: 1, wordBreak: 'break-all' }}>
                      {revealedSecrets[hook.id] || hook.secret_key || 'n/a'}
                    </code>
                    <button
                      onClick={() => revealSecret(hook.id)}
                      style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}
                      title={revealedSecrets[hook.id] ? 'Hide' : 'Reveal'}
                    >
                      {revealedSecrets[hook.id]
                        ? <EyeSlashIcon style={{ width: 14, height: 14 }} />
                        : <EyeIcon style={{ width: 14, height: 14 }} />
                      }
                    </button>
                    {revealedSecrets[hook.id] && (
                      <button
                        onClick={() => copyKey(revealedSecrets[hook.id])}
                        style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}
                        title="Copy secret"
                      >
                        <ClipboardDocumentIcon style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, opacity: testingWebhookId === hook.id ? 0.6 : 1 }}
                      onClick={() => testWebhook(hook.id)}
                      disabled={testingWebhookId === hook.id}
                    >
                      {testingWebhookId === hook.id ? 'Sending...' : 'Test'}
                    </button>
                    <button
                      style={{ background: 'none', border: `1px solid ${C.border}`, color: expandedWebhookLog === hook.id ? C.cyan : C.muted, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => toggleDeliveryLog(hook.id)}
                    >
                      {deliveriesLoading === hook.id ? 'Loading...' : 'Logs'}
                    </button>
                    <button
                      style={{ background: 'none', border: `1px solid ${C.border}`, color: C.red, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => removeWebhook(hook.id)}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Delivery log */}
                  {expandedWebhookLog === hook.id && (
                    <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      {/* Header with view toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Recent Deliveries</div>
                        {webhookDeliveries[hook.id] && webhookDeliveries[hook.id].length > 0 && (
                          <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                            <button
                              onClick={() => setDeliveryViewMode(prev => ({ ...prev, [hook.id]: 'chronological' }))}
                              style={{
                                background: (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? C.cyanDim : 'none',
                                color: (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? C.cyan : C.muted,
                                border: 'none', padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: C.mono,
                              }}
                            >Timeline</button>
                            <button
                              onClick={() => setDeliveryViewMode(prev => ({ ...prev, [hook.id]: 'grouped' }))}
                              style={{
                                background: (deliveryViewMode[hook.id] || 'grouped') === 'grouped' ? C.cyanDim : 'none',
                                color: (deliveryViewMode[hook.id] || 'grouped') === 'grouped' ? C.cyan : C.muted,
                                border: 'none', borderLeft: `1px solid ${C.border}`, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: C.mono,
                              }}
                            >By Session</button>
                          </div>
                        )}
                      </div>
                      {(!webhookDeliveries[hook.id] || webhookDeliveries[hook.id].length === 0) ? (
                        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>No deliveries yet</div>
                      ) : (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? (
                        /* Chronological flat list */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                          {webhookDeliveries[hook.id].map(d => renderDeliveryItem(d, hook.id))}
                        </div>
                      ) : (
                        /* Grouped by verification session */
                        (() => {
                          const groups = groupDevDeliveries(webhookDeliveries[hook.id])
                          const defaultExpanded = new Set(groups.slice(0, 3).map(g => g.groupId))
                          const hookGroups = expandedSessionGroups[hook.id] ?? defaultExpanded

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                              {groups.map(group => {
                                const isGroupExpanded = hookGroups.has(group.groupId)
                                const lifecycle = getDevLifecycleStatus(group.deliveries)
                                const toggleSessionGroup = () => {
                                  setExpandedSessionGroups(prev => {
                                    const current = prev[hook.id] ?? defaultExpanded
                                    const next = new Set(current)
                                    next.has(group.groupId) ? next.delete(group.groupId) : next.add(group.groupId)
                                    return { ...prev, [hook.id]: next }
                                  })
                                }

                                return (
                                  <div key={group.groupId} style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                    {/* Group header */}
                                    <div
                                      onClick={toggleSessionGroup}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                        background: C.surface, cursor: 'pointer', transition: 'background 0.15s',
                                      }}
                                    >
                                      <span style={{ color: C.muted, fontSize: 10, transition: 'transform 0.15s', transform: isGroupExpanded ? 'rotate(90deg)' : 'none' }}>&#9656;</span>
                                      <span style={{ fontFamily: C.mono, color: C.text, fontSize: 11 }}>{group.label}</span>
                                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: C.muted, fontFamily: C.mono }}>
                                        {group.deliveries.length}
                                      </span>
                                      <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: lifecycle.bg, color: lifecycle.color }}>
                                        {lifecycle.label}
                                      </span>
                                      <span style={{ color: C.muted, fontSize: 9, marginLeft: 'auto', whiteSpace: 'nowrap', fontFamily: C.mono }}>
                                        {new Date(group.deliveries[0].created_at).toLocaleDateString()}
                                        {group.deliveries.length > 1 && ` → ${new Date(group.deliveries[group.deliveries.length - 1].created_at).toLocaleDateString()}`}
                                      </span>
                                    </div>

                                    {/* Group body */}
                                    {isGroupExpanded && (
                                      <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
                                        {group.deliveries.map(d => renderDeliveryItem(d, hook.id, { compact: true }))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Payload example */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <button
              style={{ width: '100%', background: C.surface, border: 'none', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => setShowPayloadExample(prev => !prev)}
            >
              <span style={{ color: C.muted, fontSize: 12, fontWeight: 500 }}>Example Payload</span>
              {showPayloadExample
                ? <ChevronDownIcon style={{ width: 14, height: 14, color: C.muted }} />
                : <ChevronRightIcon style={{ width: 14, height: 14, color: C.muted }} />
              }
            </button>
            {showPayloadExample && (
              <pre style={{ background: C.codeBg, margin: 0, padding: '14px 16px', fontFamily: C.mono, fontSize: 11, color: C.code, lineHeight: 1.7, overflowX: 'auto' }}>
{`{
  "user_id": "a1b2c3d4-...",
  "verification_id": "e5f6g7h8-...",
  "status": "verification.completed",
  "timestamp": "2026-03-19T12:00:00.000Z",
  "data": {
    "ocr_data": {
      "full_name": "Jane Doe",
      "date_of_birth": "1990-01-15",
      "id_number": "D1234567"
    },
    "face_match_score": 0.94
  }
}

// Verify signature (Node.js)
const crypto = require('crypto');
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_WEBHOOK_SECRET)
  .update(rawBody, 'utf8')
  .digest('hex');
if (expected !== req.headers['x-idswyft-signature']) {
  throw new Error('Invalid signature');
}`}
              </pre>
            )}
          </div>
        </div>

      </div>

      {/* Create key modal */}
      {showCreate && token && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedLog && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{ width: '100%', maxWidth: 760, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  API Call Debug Details
                </div>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                  {selectedLog.method} {selectedLog.endpoint}
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Session ID</div>
                <div style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>
                  {extractSessionId(selectedLog.endpoint) === 'no-session' ? 'not detected in endpoint' : extractSessionId(selectedLog.endpoint)}
                </div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Resource</div>
                <div style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{inferResourceLabel(selectedLog.endpoint)}</div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Action</div>
                <div style={{ color: C.text, fontSize: 13 }}>{inferActionLabel(selectedLog.method, selectedLog.endpoint)}</div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Status / Latency</div>
                <div style={{ color: selectedLog.status_code >= 400 ? C.red : C.green, fontFamily: C.mono, fontSize: 13 }}>
                  {selectedLog.status_code} in {selectedLog.response_time_ms}ms
                </div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Timestamp</div>
                <div style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{new Date(selectedLog.timestamp).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Client Context</div>
              <div style={{ color: C.text, fontSize: 13, marginBottom: 6 }}>
                IP: <code style={{ fontFamily: C.mono, color: C.muted }}>{selectedLog.ip_address || 'not captured'}</code>
              </div>
              <div style={{ color: C.text, fontSize: 13 }}>
                User-Agent: <code style={{ fontFamily: C.mono, color: C.muted }}>{selectedLog.user_agent || 'not captured'}</code>
              </div>
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Outcome</div>
              <div style={{ color: selectedLog.status_code >= 400 ? C.red : C.green, fontSize: 13 }}>
                {selectedLog.error_message || (selectedLog.status_code >= 400 ? 'Request failed' : 'Request completed successfully')}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                Request/response body payloads are not currently captured in this log stream.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '80px 16px 24px' }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 1040, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, maxHeight: '100%', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cog6ToothIcon style={{ width: 18, height: 18, color: C.text }} />
                <div style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Settings</div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: '0 4px' }}
              >
                &times;
              </button>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'flex', gap: 0 }}>

              {/* ─── Left column: Profile + Danger Zone ─── */}
              <div style={{ flex: 1, paddingRight: 28 }}>

                {/* Profile */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <UserCircleIcon style={{ width: 16, height: 16, color: C.cyan }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Profile</div>
                  </div>

                  {profileLoading ? (
                    <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                  ) : (
                    <>
                      {/* Avatar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                        <div
                          style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: `1px solid ${C.border}` }}
                          onClick={() => document.getElementById('avatar-input')?.click()}
                        >
                          {profileAvatarUrl ? (
                            <img src={profileAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <UserCircleIcon style={{ width: 28, height: 28, color: C.dim }} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                          >
                            <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>Change</span>
                          </div>
                        </div>
                        <input
                          id="avatar-input"
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file && file.size > 2 * 1024 * 1024) {
                              toast.error('File must be under 2 MB')
                              e.target.value = ''
                              return
                            }
                            if (file) uploadAvatar(file)
                            e.target.value = ''
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Click avatar to change</div>
                          <div style={{ fontSize: 11, color: C.dim }}>JPEG or PNG, max 2 MB</div>
                        </div>
                      </div>

                      {/* Email (read-only) */}
                      <label style={labelStyle}>Email</label>
                      <input
                        type="email"
                        value={profileEmail}
                        readOnly
                        style={{ ...inputStyle, marginBottom: 12, opacity: 0.5, cursor: 'not-allowed' }}
                      />

                      {/* Name */}
                      <label style={labelStyle}>Name</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }}
                        placeholder="Your name"
                      />

                      {/* Company */}
                      <label style={labelStyle}>Company <span style={{ color: C.dim, fontWeight: 400 }}>(optional)</span></label>
                      <input
                        type="text"
                        value={profileCompany}
                        onChange={e => setProfileCompany(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }}
                        placeholder="Your company"
                      />

                      {/* Save button */}
                      <button
                        onClick={saveProfile}
                        disabled={profileSaving || !profileName.trim()}
                        style={{
                          background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                          padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          opacity: (profileSaving || !profileName.trim()) ? 0.5 : 1,
                        }}
                      >
                        {profileSaving ? 'Saving...' : 'Save Profile'}
                      </button>
                    </>
                  )}
                </div>

                {/* Verification Reviewers */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <UsersIcon style={{ width: 16, height: 16, color: C.cyan }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Verification Reviewers</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    Invite people to review and manage your verifications. They sign in via email code — no passwords needed.
                  </div>

                  {/* Invite form */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={reviewerEmail}
                      onChange={e => setReviewerEmail(e.target.value)}
                      placeholder="reviewer@company.com"
                      style={{ ...inputStyle, flex: '1 1 160px', marginBottom: 0 }}
                    />
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={e => setReviewerName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{ ...inputStyle, flex: '0 1 120px', marginBottom: 0 }}
                    />
                    <button
                      onClick={inviteReviewer}
                      disabled={reviewerInviting || !reviewerEmail.includes('@')}
                      style={{
                        background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                        padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        opacity: (reviewerInviting || !reviewerEmail.includes('@')) ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {reviewerInviting ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>

                  {/* Reviewers list */}
                  {reviewers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {reviewers.map(r => (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px',
                          opacity: r.status === 'revoked' ? 0.45 : 1,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.email}
                              {r.name && <span style={{ color: C.dim, marginLeft: 6 }}>({r.name})</span>}
                            </div>
                            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                              {r.status === 'invited' && 'Invited'}
                              {r.status === 'active' && `Active${r.last_login_at ? ` · Last login ${new Date(r.last_login_at).toLocaleDateString()}` : ''}`}
                              {r.status === 'revoked' && 'Revoked'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                              padding: '2px 6px', borderRadius: 4,
                              background: r.status === 'active' ? 'rgba(34,197,94,0.12)' : r.status === 'invited' ? 'rgba(34,211,238,0.1)' : 'rgba(248,113,113,0.1)',
                              color: r.status === 'active' ? '#22c55e' : r.status === 'invited' ? C.cyan : C.red,
                            }}>
                              {r.status}
                            </span>
                            {r.status !== 'revoked' && (
                              <button
                                onClick={() => revokeReviewer(r.id)}
                                title="Revoke access"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: C.dim, display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                                onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
                              >
                                <XMarkIcon style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewers.length === 0 && (
                    <div style={{ color: C.dim, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                      No reviewers invited yet
                    </div>
                  )}

                  {/* Copy login link */}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/admin/login`
                      navigator.clipboard.writeText(url).then(() => toast.success('Login link copied'))
                    }}
                    style={{
                      marginTop: 12, background: 'none', border: `1px solid ${C.border}`,
                      color: C.muted, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Copy reviewer login link
                  </button>
                </div>

                {/* Danger Zone */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <ExclamationTriangleIcon style={{ width: 16, height: 16, color: C.red }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.red }}>Danger Zone</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    Permanently delete your developer account and all associated data including API keys, webhooks, and verification records. This action cannot be undone.
                  </div>
                  <button
                    style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                    onClick={() => { setShowSettings(false); setShowDeleteAccount(true) }}
                  >
                    Delete Account
                  </button>
                </div>
              </div>

              {/* ─── Vertical divider ─── */}
              <div style={{ width: 1, background: C.border, flexShrink: 0 }} />

              {/* ─── Right column: OCR Enhancement ─── */}
              <div style={{ flex: 1, paddingLeft: 28 }}>

                {/* OCR Enhancement (LLM Fallback) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <CodeBracketIcon style={{ width: 16, height: 16, color: C.cyan }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>OCR Enhancement</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    This is completely optional. Our OCR pipeline extracts document fields using fast heuristics.
                    When you provide an LLM key, it acts as a <strong style={{ color: C.text, fontWeight: 500 }}>second-pass fallback</strong> --
                    only called for fields where heuristic confidence is below 60%.
                    This can improve accuracy on unusual layouts or poor-quality scans, but most documents process fine without it.
                    Your key is encrypted at rest and only used during your verifications.
                  </div>

                  {llmLoading ? (
                    <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                  ) : (
                    <>
                      {/* Provider select */}
                      <label style={labelStyle}>Provider</label>
                      <select
                        value={llmProvider}
                        onChange={e => { setLlmProvider(e.target.value); setLlmApiKey(''); setShowLlmKey(false) }}
                        style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer', appearance: 'auto' }}
                      >
                        <option value="">None (disabled)</option>
                        <option value="openai">OpenAI (GPT-4o Vision)</option>
                        <option value="anthropic">Anthropic (Claude Vision)</option>
                        <option value="custom">Custom (OpenAI-compatible endpoint)</option>
                      </select>

                      {llmProvider && (
                        <>
                          {/* API Key */}
                          <label style={labelStyle}>
                            API Key
                            {llmConfigured && llmKeyPreview && !llmApiKey && (
                              <span style={{ color: C.green, marginLeft: 8, fontWeight: 400 }}>
                                configured: {llmKeyPreview}
                              </span>
                            )}
                          </label>
                          <div style={{ position: 'relative', marginBottom: 12 }}>
                            <input
                              type={showLlmKey ? 'text' : 'password'}
                              style={{ ...inputStyle, paddingRight: 40 }}
                              value={llmApiKey}
                              onChange={e => setLlmApiKey(e.target.value)}
                              placeholder={llmConfigured ? 'Enter new key to replace' : llmProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                            />
                            <button
                              type="button"
                              onClick={() => setShowLlmKey(!showLlmKey)}
                              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}
                            >
                              {showLlmKey
                                ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                                : <EyeIcon style={{ width: 16, height: 16 }} />
                              }
                            </button>
                          </div>

                          {/* Custom endpoint URL */}
                          {llmProvider === 'custom' && (
                            <>
                              <label style={labelStyle}>Endpoint URL</label>
                              <input
                                type="url"
                                style={{ ...inputStyle, marginBottom: 12 }}
                                value={llmEndpointUrl}
                                onChange={e => setLlmEndpointUrl(e.target.value)}
                                placeholder="https://your-server.com/v1/chat/completions"
                              />
                            </>
                          )}

                          {/* Save / Clear buttons */}
                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            <button
                              onClick={saveLLMSettings}
                              disabled={llmSaving || (!llmApiKey && !llmConfigured)}
                              style={{
                                background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                                padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                opacity: (llmSaving || (!llmApiKey && !llmConfigured)) ? 0.5 : 1,
                              }}
                            >
                              {llmSaving ? 'Saving...' : 'Save'}
                            </button>
                            {llmConfigured && (
                              <button
                                onClick={clearLLMSettings}
                                disabled={llmSaving}
                                style={{
                                  background: 'none', border: `1px solid ${C.border}`, color: C.muted,
                                  borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13,
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>{/* end two-column layout */}
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteAccount && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
          onClick={() => setShowDeleteAccount(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 440, background: C.panel, border: `1px solid ${C.red}33`, borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ExclamationTriangleIcon style={{ width: 20, height: 20, color: C.red }} />
              <div style={{ fontWeight: 600, fontSize: 16, color: C.red }}>Delete Account</div>
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              This will permanently delete your developer account and all associated data. Type your email address to confirm.
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 16 }}
              type="email"
              value={deleteAccountEmail}
              onChange={e => setDeleteAccountEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountEmail('') }}
              >
                Cancel
              </button>
              <button
                style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: deleteAccountEmail ? 1 : 0.5 }}
                onClick={deleteAccount}
                disabled={!deleteAccountEmail || deleteAccountLoading}
              >
                {deleteAccountLoading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification detail modal */}
      {(verificationDetail || verificationDetailError) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}
          onClick={() => { setVerificationDetail(null); setVerificationDetailError(null) }}
        >
          <div
            style={{ width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            {verificationDetailError ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ color: C.red, fontSize: 14, fontWeight: 600 }}>Failed to load verification details</div>
                  <button onClick={() => { setVerificationDetail(null); setVerificationDetailError(null) }} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Close</button>
                </div>
                <div style={{ color: C.muted, fontSize: 13 }}>{verificationDetailError}</div>
              </>
            ) : verificationDetail && (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Verification Detail</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>{verificationDetail.verification_id}</span>
                      <ClipboardDocumentIcon
                        style={{ width: 14, height: 14, color: C.muted, cursor: 'pointer', flexShrink: 0 }}
                        onClick={() => copyKey(verificationDetail.verification_id)}
                      />
                      {verificationDetail.is_sandbox && (
                        <span style={{ background: C.amberDim, color: C.amber, border: `1px solid ${C.amber}33`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase' }}>sandbox</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setVerificationDetail(null); setVerificationDetailError(null) }} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Close</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  {(['scores', 'json'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      style={{
                        background: 'none',
                        border: 'none',
                        borderBottom: detailTab === tab ? `2px solid ${C.cyan}` : '2px solid transparent',
                        color: detailTab === tab ? C.cyan : C.muted,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: C.sans,
                      }}
                    >
                      {tab === 'scores' ? 'Scores' : 'Raw JSON'}
                    </button>
                  ))}
                </div>

                {/* Scores tab */}
                {detailTab === 'scores' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {/* Status + step */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                      <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Status</div>
                      <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>{verificationDetail.status}</div>
                      <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Step {verificationDetail.current_step} of {verificationDetail.total_steps}</div>
                    </div>

                    {/* Final result */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                      <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Final Result</div>
                      <div style={{
                        fontFamily: C.mono,
                        fontSize: 14,
                        fontWeight: 600,
                        color: verificationDetail.final_result === 'verified' ? C.green
                          : verificationDetail.final_result === 'failed' ? C.red
                          : verificationDetail.final_result === 'manual_review' ? C.amber
                          : C.muted,
                      }}>
                        {verificationDetail.final_result || 'In progress'}
                      </div>
                    </div>

                    {/* Cross-validation */}
                    {verificationDetail.cross_validation_results && (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Cross-Validation</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg, overflow: 'hidden' }}>
                            <div style={{ width: `${(verificationDetail.cross_validation_results.overall_score ?? 0) * 100}%`, height: '100%', borderRadius: 3, background: (verificationDetail.cross_validation_results.overall_score ?? 0) >= 0.8 ? C.green : C.amber }} />
                          </div>
                          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{((verificationDetail.cross_validation_results.overall_score ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                        <span style={{
                          background: verificationDetail.cross_validation_results.verdict === 'PASS' ? C.greenDim : verificationDetail.cross_validation_results.verdict === 'FAIL' ? C.redDim : C.amberDim,
                          color: verificationDetail.cross_validation_results.verdict === 'PASS' ? C.green : verificationDetail.cross_validation_results.verdict === 'FAIL' ? C.red : C.amber,
                          borderRadius: 4, padding: '1px 6px', fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase',
                        }}>
                          {verificationDetail.cross_validation_results.verdict}
                        </span>
                      </div>
                    )}

                    {/* Face match */}
                    {verificationDetail.face_match_results && (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Face Match</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg, overflow: 'hidden' }}>
                            <div style={{ width: `${(verificationDetail.face_match_results.similarity_score ?? 0) * 100}%`, height: '100%', borderRadius: 3, background: verificationDetail.face_match_results.passed ? C.green : C.red }} />
                          </div>
                          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{((verificationDetail.face_match_results.similarity_score ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                        <span style={{
                          background: verificationDetail.face_match_results.passed ? C.greenDim : C.redDim,
                          color: verificationDetail.face_match_results.passed ? C.green : C.red,
                          borderRadius: 4, padding: '1px 6px', fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase',
                        }}>
                          {verificationDetail.face_match_results.passed ? 'passed' : 'failed'}
                        </span>
                      </div>
                    )}

                    {/* Liveness */}
                    {verificationDetail.liveness_results && (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Liveness</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg, overflow: 'hidden' }}>
                            <div style={{ width: `${(verificationDetail.liveness_results.score ?? 0) * 100}%`, height: '100%', borderRadius: 3, background: verificationDetail.liveness_results.passed ? C.green : C.red }} />
                          </div>
                          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{((verificationDetail.liveness_results.score ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                        <span style={{
                          background: verificationDetail.liveness_results.passed ? C.greenDim : C.redDim,
                          color: verificationDetail.liveness_results.passed ? C.green : C.red,
                          borderRadius: 4, padding: '1px 6px', fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase',
                        }}>
                          {verificationDetail.liveness_results.passed ? 'passed' : 'failed'}
                        </span>
                      </div>
                    )}

                    {/* Risk score */}
                    {verificationDetail.risk_score && (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>Risk Score</div>
                        <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 600, color: C.text }}>{verificationDetail.risk_score.overall_score}</div>
                        <span style={{
                          background: verificationDetail.risk_score.risk_level === 'low' ? C.greenDim : verificationDetail.risk_score.risk_level === 'high' ? C.redDim : C.amberDim,
                          color: verificationDetail.risk_score.risk_level === 'low' ? C.green : verificationDetail.risk_score.risk_level === 'high' ? C.red : C.amber,
                          borderRadius: 4, padding: '1px 6px', fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase', marginTop: 4, display: 'inline-block',
                        }}>
                          {verificationDetail.risk_score.risk_level}
                        </span>
                      </div>
                    )}

                    {/* OCR data — full width */}
                    {verificationDetail.ocr_data && (
                      <div style={{ gridColumn: '1 / -1', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>OCR Extracted Data</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                          {Object.entries(verificationDetail.ocr_data as Record<string, unknown>).map(([field, value]) => (
                            <div key={field}>
                              <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{field.replace(/_/g, ' ')}</div>
                              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginTop: 2 }}>{value != null ? String(value) : '-'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rejection info — full width, only when rejected */}
                    {verificationDetail.rejection_reason && (
                      <div style={{ gridColumn: '1 / -1', background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.red, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>Rejection</div>
                        <div style={{ color: C.red, fontFamily: C.mono, fontSize: 13 }}>{verificationDetail.rejection_reason}</div>
                        {verificationDetail.rejection_detail && (
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{verificationDetail.rejection_detail}</div>
                        )}
                      </div>
                    )}

                    {/* Manual review reason — full width */}
                    {verificationDetail.manual_review_reason && (
                      <div style={{ gridColumn: '1 / -1', background: C.amberDim, border: `1px solid ${C.amber}33`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.amber, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>Manual Review Required</div>
                        <div style={{ color: C.amber, fontFamily: C.mono, fontSize: 13 }}>{verificationDetail.manual_review_reason}</div>
                      </div>
                    )}

                    {/* "Not yet available" if no documents uploaded */}
                    {verificationDetail.message && (
                      <div style={{ gridColumn: '1 / -1', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ color: C.muted, fontSize: 13 }}>{verificationDetail.message}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Raw JSON tab */}
                {detailTab === 'json' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ color: C.muted, fontSize: 12 }}>
                        Response from <code style={{ fontFamily: C.mono, color: C.code }}>GET /api/developer/verifications/:id</code>
                      </div>
                      <button
                        onClick={() => copyKey(JSON.stringify(verificationDetail, null, 2))}
                        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <ClipboardDocumentIcon style={{ width: 12, height: 12 }} /> Copy
                      </button>
                    </div>
                    <pre style={{ background: C.codeBg, borderRadius: 8, padding: '16px 18px', margin: 0, fontFamily: C.mono, fontSize: 12, color: C.code, lineHeight: 1.6, overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>{JSON.stringify(verificationDetail, null, 2)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


