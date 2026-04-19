import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../config/api'
import { csrfHeader } from '../../lib/csrf'
import { C } from '../../theme'
import { inputStyle, labelStyle } from './types'
import type { AuthStep } from './types'

export function AuthGate({ onAuth }: { onAuth: (token: string, apiKey?: string) => void }) {
  const [step, setStep] = useState<AuthStep>('enter_email')
  const [email, setEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [registrationToken, setRegistrationToken] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [githubConfigured, setGithubConfigured] = useState(false)
  const [isReturning] = useState(() => localStorage.getItem('idswyft:has-session') === 'true')

  const markReturning = () => localStorage.setItem('idswyft:has-session', 'true')

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

    // Clear URL immediately to prevent re-firing on effect re-run
    window.history.replaceState({}, '', window.location.pathname)

    // Verify OAuth state to prevent CSRF
    const storedState = sessionStorage.getItem('github_oauth_state')
    sessionStorage.removeItem('github_oauth_state')
    if (!returnedState || returnedState !== storedState) {
      toast.error('OAuth state mismatch. Please try again.')
      return
    }

    setLoading(true)
    fetch(`${API_BASE_URL}/api/auth/developer/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ code, state: returnedState }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.message || 'GitHub login failed')
        markReturning()
        onAuth('session', data.api_key?.key)
      })
      .catch((err: unknown) => {
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
        markReturning()
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
      markReturning()
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
      const res = await fetch(`${API_BASE_URL}/api/auth/developer/github/url`, { credentials: 'include' })
      const data = await res.json()
      if (!data.url) throw new Error('GitHub OAuth not configured')
      sessionStorage.setItem('github_oauth_state', data.state)
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
    <div className="pattern-guilloche-rainbow pattern-full" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, '--pattern-opacity': '0.01' } as React.CSSProperties}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, width: '100%', maxWidth: 400 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 24 }}>
          idswyft / developer-portal
        </div>

        {/* -- Step 1: Enter email -- */}
        {step === 'enter_email' && (
          <>
            <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              {isReturning ? 'Sign in' : 'Sign up'}
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>
              {isReturning ? 'Enter your email to get a verification code' : 'Enter your email to create a developer account'}
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

            {!isReturning && (
              <p style={{ color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                Already have an account? Just enter your email above.
              </p>
            )}
          </>
        )}

        {/* -- Step 2: Verify OTP -- */}
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

        {/* -- Step 3: Complete registration (new users only) -- */}
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
