import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { isCommunity } from '../config/edition'
import { fetchCsrfToken, csrfHeader, clearCsrfToken } from '../lib/csrf'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'
import { AnalyticsCharts } from '../components/developer/AnalyticsCharts'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import type { ApiKey, DeveloperStats } from '../components/developer/types'
import { AuthGate } from '../components/developer/AuthGate'
import { ApiKeysSection } from '../components/developer/ApiKeysSection'
import { WebhooksSection } from '../components/developer/WebhooksSection'
import { SettingsModal } from '../components/developer/SettingsModal'

// --- Main portal ---

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
  const [newFullKey, setNewFullKey] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [hasOrgAdmin, setHasOrgAdmin] = useState<boolean | null>(null)
  const [teamBannerDismissed, setTeamBannerDismissed] = useState(
    () => localStorage.getItem('idswyft:team-banner-dismissed') === 'true'
  )

  const authHeaders = (t: string) => t === 'session' ? {} as Record<string, string> : { Authorization: `Bearer ${t}` } as Record<string, string>

  const fetchKeys = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-keys`, {
        headers: authHeaders(token),
        credentials: 'include' as RequestCredentials,
      })
      if (res.status === 401) { setToken(null); return }
      if (res.ok) setApiKeys((await res.json()).api_keys ?? [])
    } catch { /* network error - backend offline, show empty state */ }
  }

  const fetchStats = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/stats`, {
        headers: authHeaders(token),
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) setStats(await res.json())
    } catch { /* network error */ }
  }

  const checkOrgAdmin = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers`, {
        headers: authHeaders(token),
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        const admins = (data.reviewers || []).filter((r: any) => r.role === 'admin' && r.status !== 'revoked')
        setHasOrgAdmin(admins.length > 0)
      }
    } catch { /* network error */ }
  }

  useEffect(() => {
    if (token) {
      fetchKeys()
      fetchStats()
      checkOrgAdmin()
    }
  }, [token])

  const handleAuth = (t: string, apiKey?: string) => {
    setToken(t)
    fetchCsrfToken()
    if (apiKey) setNewFullKey(apiKey)
  }

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...csrfHeader() } }).catch(() => {})
    clearCsrfToken()
    setToken(null)
    setApiKeys([])
    setStats(null)
  }

  const handleAccountDeleted = () => {
    setToken(null)
    setApiKeys([])
    setStats(null)
  }

  const handleUnauthorized = () => {
    setToken(null)
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

        {/* Team setup banner — shown when no org admin exists */}
        {hasOrgAdmin === false && !teamBannerDismissed && (
          <div style={{
            background: C.cyanDim, border: `1px solid ${C.cyanBorder}`, borderRadius: 10,
            padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Set up your team</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                Invite an Organization Admin to manage verifications from the Review Dashboard.
                They can approve, reject, override, and access analytics — without needing your developer credentials.
              </div>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              style={{
                background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              Invite Admin
            </button>
            <button
              onClick={() => { setTeamBannerDismissed(true); localStorage.setItem('idswyft:team-banner-dismissed', 'true') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: 18, padding: '0 4px', lineHeight: 1 }}
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        <ApiKeysSection
          token={token}
          apiKeys={apiKeys}
          setApiKeys={setApiKeys}
          stats={stats}
          newFullKey={newFullKey}
          setNewFullKey={setNewFullKey}
          onUnauthorized={handleUnauthorized}
          renderAfterStats={token ? <AnalyticsCharts token={token} /> : undefined}
        />

        <WebhooksSection token={token} apiKeys={apiKeys} />

      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          token={token}
          onClose={() => setShowSettings(false)}
          onAccountDeleted={handleAccountDeleted}
        />
      )}
    </div>
  )
}
