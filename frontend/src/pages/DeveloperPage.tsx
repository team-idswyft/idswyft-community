import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { C, injectFonts } from '../theme'
import {
  TrashIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

interface DeveloperWebhook {
  id: string
  url: string
  events?: string[]
  is_sandbox: boolean
  is_active: boolean
  created_at: string
}

const WEBHOOK_EVENTS = [
  'verification.started',
  'verification.completed',
  'verification.failed',
  'verification.manual_review',
]

// â”€â”€â”€ Shared styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Auth gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AuthGate({ onAuth }: { onAuth: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await fetch(`${API_BASE_URL}/api/developer/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, company }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Registration failed')
        // Auto-login after register (passwordless â€” email only)
        const loginRes = await fetch(`${API_BASE_URL}/api/auth/developer/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const loginData = await loginRes.json()
        if (!loginRes.ok) throw new Error(loginData.message || 'Login failed')
        localStorage.setItem('developer_token', loginData.token)
        onAuth(loginData.token)
      } else {
        const res = await fetch(`${API_BASE_URL}/api/auth/developer/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Invalid credentials')
        localStorage.setItem('developer_token', data.token)
        onAuth(data.token)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, width: '100%', maxWidth: 400 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 24 }}>
          idswyft / developer-portal
        </div>
        <h1 style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>
          {mode === 'login' ? 'Manage your API keys' : 'Get your free API key'}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'register' && (
            <>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
              </div>
              <div>
                <label style={labelStyle}>Company (optional)</label>
                <input style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
              </div>
            </>
          )}
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ background: C.cyan, color: C.bg, borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}
          >
            {loading ? 'Loadingâ€¦' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: C.muted }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 13 }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

// â”€â”€â”€ Create key modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CreateKeyModal({ onClose, onCreated, token }: {
  onClose: () => void
  onCreated: (key: ApiKey, fullKey: string) => void
  token: string
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
              {loading ? 'Creatingâ€¦' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main portal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function DeveloperPage() {
  useEffect(() => { injectFonts() }, [])

  const [token, setToken] = useState<string | null>(localStorage.getItem('developer_token'))
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [stats, setStats] = useState<DeveloperStats | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newFullKey, setNewFullKey] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>([...WEBHOOK_EVENTS])
  const [webhooks, setWebhooks] = useState<DeveloperWebhook[]>([])
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null)
  const [keyLogs, setKeyLogs] = useState<Record<string, ApiActivity[]>>({})
  const [keySessionOutcomes, setKeySessionOutcomes] = useState<Record<string, Record<string, string>>>({})
  const [logsLoadingForKey, setLogsLoadingForKey] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<ApiActivity | null>(null)
  const [logSearchByKey, setLogSearchByKey] = useState<Record<string, string>>({})
  const [expandedSessionByKey, setExpandedSessionByKey] = useState<Record<string, string | null>>({})

  const fetchKeys = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-keys`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.status === 401) { localStorage.removeItem('developer_token'); setToken(null); return }
      if (res.ok) setApiKeys((await res.json()).api_keys ?? [])
    } catch { /* network error â€” backend offline, show empty state */ }
  }

  const fetchStats = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/stats`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) setStats(await res.json())
    } catch { /* network error */ }
  }

  const fetchWebhooks = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const data = await res.json()
        setWebhooks(data.webhooks ?? [])
      }
    } catch { /* network error */ }
  }

  useEffect(() => {
    if (token) {
      fetchKeys(token)
      fetchStats(token)
      fetchWebhooks(token)
    }
  }, [token])

  const handleAuth = (t: string) => setToken(t)

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
        headers: { Authorization: `Bearer ${token}` },
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
    localStorage.removeItem('developer_token')
    setToken(null)
    setApiKeys([])
    setStats(null)
    setWebhooks([])
    setExpandedKeyId(null)
    setKeyLogs({})
    setKeySessionOutcomes({})
  }

  const fetchKeyLogs = async (keyId: string) => {
    if (!token) return
    setLogsLoadingForKey(keyId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/activity?api_key_id=${encodeURIComponent(keyId)}`, {
        headers: { Authorization: `Bearer ${token}` },
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

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    toast.success('Copied to clipboard')
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, events: selectedWebhookEvents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to add webhook')
      setWebhooks(prev => [data.webhook, ...prev])
      setWebhookUrl('')
      setSelectedWebhookEvents([...WEBHOOK_EVENTS])
      toast.success('Webhook added')
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
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to remove webhook')
      setWebhooks(prev => prev.filter(w => w.id !== id))
      toast.success('Webhook removed')
    } catch {
      toast.error('Failed to remove webhook')
    }
  }

  if (!token) {
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
    <div style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
              idswyft / developer-portal
            </div>
            <h1 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text }}>API Keys</h1>
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>

        {/* New key banner */}
        {newFullKey && (
          <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 8, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 4 }}>Key created â€” copy it now, it won't be shown again</div>
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
              Ã—
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
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'â€”'}
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
                            <div style={{ color: C.muted, fontSize: 12, paddingTop: 4 }}>Loading logsâ€¦</div>
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
                                                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
                                                  Session: {sessionId === 'no-session' ? 'unscoped request' : sessionId}
                                                </div>
                                                <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                  <span>{logs.length} call{logs.length > 1 ? 's' : ''} • last activity {new Date(latestTs).toLocaleString()}</span>
                                                  <span
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
                                                    }}
                                                  >
                                                    {outcomeLabel}
                                                  </span>
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
              Full documentation â†’
            </Link>
          </div>
        </div>

        {/* Webhook */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>Webhook</div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
            Receive POST callbacks when verification status changes.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://yourapp.com/webhook"
            />
            <button
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '10px 18px', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
              onClick={addWebhook}
              disabled={webhookLoading}
            >
              {webhookLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
          <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Events to send</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {WEBHOOK_EVENTS.map(eventName => {
                const checked = selectedWebhookEvents.includes(eventName)
                return (
                  <label key={eventName} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
                      style={{ accentColor: C.cyan, width: 14, height: 14 }}
                    />
                    <span style={{ color: C.text, fontSize: 12, fontFamily: C.mono }}>{eventName}</span>
                  </label>
                )
              })}
            </div>
          </div>
          {webhooks.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {webhooks.map((hook, i) => (
                <div
                  key={hook.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: i < webhooks.length - 1 ? `1px solid ${C.border}` : 'none',
                    background: C.surface,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <code style={{ fontFamily: C.mono, fontSize: 12, color: C.text, wordBreak: 'break-all' }}>{hook.url}</code>
                    {hook.events && hook.events.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => toast.success('Webhook test sent')}
                    >
                      Test
                    </button>
                    <button
                      style={{ background: 'none', border: `1px solid ${C.border}`, color: C.red, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => removeWebhook(hook.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Create key modal */}
      {showCreate && token && (
        <CreateKeyModal
          token={token}
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
    </div>
  )
}


