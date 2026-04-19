import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import { API_BASE_URL } from '../config/api'
import { C, injectFonts } from '../theme'

type SetupState = 'loading' | 'form' | 'success' | 'error'

interface SetupResult {
  token: string
  developer: { id: string; email: string; name: string; company: string | null }
  api_key?: { key: string; id: string; name: string; is_sandbox: boolean; created_at: string }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--rule-strong)',
  color: 'var(--ink)',
  padding: '10px 14px',
  width: '100%',
  fontSize: 14,
  fontFamily: C.sans,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: C.mono,
  fontSize: 11,
  color: 'var(--mid)',
  marginBottom: 6,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
}

export function SetupPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<SetupState>('loading')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { injectFonts() }, [])

  // Check if setup is needed
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/setup/status`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (data.needs_setup) {
          setState('form')
        } else {
          navigate('/', { replace: true })
        }
      })
      .catch(() => {
        setState('error')
      })
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/setup/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), company: company.trim() || undefined }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Setup failed (${res.status})`)
      }

      const data = await res.json()

      // Auth cookie set by server (httpOnly)
      setResult(data)
      setState('success')
      toast.success('Account created!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      toast.success('API key copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.sans }}>
        <Toaster position="top-right" />
        <div style={{ color: 'var(--mid)', fontFamily: C.mono, fontSize: 13, letterSpacing: '0.04em' }}>Checking setup status...</div>
      </div>
    )
  }

  // Error state — API unreachable
  if (state === 'error') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.sans }}>
        <Toaster position="top-right" />
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
          <div style={{ fontSize: 14, color: C.red, marginBottom: 12 }}>Could not reach the API server</div>
          <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 }}>
            Make sure the backend is running and try again.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn"
            style={{ fontFamily: C.sans }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Success state — show API key + next steps
  if (state === 'success' && result) {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', fontFamily: C.sans, color: 'var(--ink)' }}>
        <Toaster position="top-right" />
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px' }}>

          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ width: 56, height: 56, background: C.greenDim, border: `1px solid ${C.green}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 24 }}>
              &#10003;
            </div>
            <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 500, marginBottom: 8 }}>You're all set</h1>
            <p style={{ color: 'var(--mid)', fontSize: 14, margin: 0 }}>
              Welcome, {result.developer.name}. Your developer account is ready.
            </p>
          </div>

          {/* API Key -- shown once */}
          {result.api_key && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--accent)', padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--accent-ink)', fontFamily: C.mono, fontWeight: 500, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Your API Key &mdash; save it now, it won't be shown again
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <code style={{ fontFamily: C.mono, fontSize: 13, color: 'var(--ink)', wordBreak: 'break-all', flex: 1, background: C.codeBg, padding: '8px 12px' }}>
                  {result.api_key.key}
                </code>
                <button
                  onClick={() => copyKey(result.api_key!.key)}
                  className="btn-accent"
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  <ClipboardDocumentIcon style={{ width: 16, height: 16 }} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 8, fontFamily: C.mono }}>
                Type: {result.api_key.is_sandbox ? 'Sandbox' : 'Production'} &bull; Name: {result.api_key.name}
              </div>
            </div>
          )}

          {/* Next steps */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)', padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Next steps</div>
            <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.8 }}>
              <div>1. Copy the API key above and store it securely</div>
              <div>2. Check the <a href="/docs" style={{ color: 'var(--accent-ink)' }}>documentation</a> for integration guides</div>
              <div>3. Try the <a href="/demo" style={{ color: 'var(--accent-ink)' }}>interactive demo</a> to test verification</div>
            </div>
          </div>

          <button
            onClick={() => navigate('/', { replace: true })}
            className="btn"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontFamily: C.sans,
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Form state -- welcome + create account
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', fontFamily: C.sans, color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Toaster position="top-right" />
      <div style={{ maxWidth: 440, width: '100%', padding: '24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, marginBottom: 20, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
          <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Welcome to Idswyft</h1>
          <p style={{ color: 'var(--mid)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Create your admin developer account to get started.
            This will generate your first API key.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                style={inputStyle}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
                autoFocus
              />
            </div>

            <div>
              <label style={labelStyle}>Email *</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Company <span style={{ color: 'var(--soft)' }}>(optional)</span></label>
              <input
                style={inputStyle}
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Your company"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim() || !email.trim()}
              className="btn"
              style={{
                width: '100%',
                justifyContent: 'center',
                fontFamily: C.sans,
                marginTop: 4,
                opacity: (!name.trim() || !email.trim()) ? 0.5 : 1,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Creating account...' : 'Create Account & Generate API Key'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--soft)' }}>
            This is a one-time setup for your self-hosted instance.
          </div>
        </form>
      </div>
    </div>
  )
}
