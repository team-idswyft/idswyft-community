import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { isCommunity } from '../config/edition'
import { fetchCsrfToken, getCsrfToken, csrfHeader, clearCsrfToken } from '../lib/csrf'
import { C, injectFonts, getTheme, toggleTheme } from '../theme'
import '../styles/patterns.css'
import '../styles/dev-portal.css'
import { AnalyticsCharts } from '../components/developer/AnalyticsCharts'

import type { ApiKey, DeveloperStats } from '../components/developer/types'
import { AuthGate } from '../components/developer/AuthGate'
import { ApiKeysSection } from '../components/developer/ApiKeysSection'
import { WebhooksSection } from '../components/developer/WebhooksSection'
import { SettingsModal } from '../components/developer/SettingsModal'

type SectionKey = 'api-keys' | 'webhooks'

export function DeveloperPage() {
  const navigate = useNavigate()
  useEffect(() => { injectFonts() }, [])

  const [token, setToken] = useState<string | null>(() => getCsrfToken() ? 'session' : null)
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getTheme())
  const [activeSection, setActiveSection] = useState<SectionKey>('api-keys')

  const apiKeysAnchorRef = useRef<HTMLDivElement | null>(null)
  const webhooksAnchorRef = useRef<HTMLDivElement | null>(null)

  // On mount, check if an auth cookie exists by probing a protected endpoint
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/developer/profile`, { credentials: 'include' })
      .then(res => {
        if (res.ok) { setToken('session'); fetchCsrfToken(); }
        else { setToken(null); clearCsrfToken(); }
      })
      .catch(() => {})
  }, [])

  // Community edition: redirect to /setup if no developers exist yet.
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

  const authHeaders = (t: string) =>
    t === 'session' ? {} as Record<string, string> : { Authorization: `Bearer ${t}` } as Record<string, string>

  const fetchKeys = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/api-keys`, {
        headers: authHeaders(token),
        credentials: 'include' as RequestCredentials,
      })
      if (res.status === 401) { setToken(null); return }
      if (res.ok) setApiKeys((await res.json()).api_keys ?? [])
    } catch { /* network error */ }
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

  // Track which section is in view so the sidebar highlights the right item
  // as the user scrolls. Falls back to whichever was clicked last if both are
  // visible (long viewports).
  useEffect(() => {
    if (!token) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const winner = visible.reduce((a, b) =>
          a.intersectionRatio > b.intersectionRatio ? a : b
        )
        const key = winner.target.getAttribute('data-section') as SectionKey | null
        if (key) setActiveSection(key)
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    const targets = [apiKeysAnchorRef.current, webhooksAnchorRef.current].filter(Boolean) as Element[]
    targets.forEach(t => observer.observe(t))
    return () => observer.disconnect()
  }, [token])

  const handleAuth = (t: string, apiKey?: string) => {
    setToken(t)
    fetchCsrfToken()
    if (apiKey) setNewFullKey(apiKey)
  }

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...csrfHeader() }
    }).catch(() => {})
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

  const handleScrollTo = (key: SectionKey) => {
    const target = key === 'api-keys' ? apiKeysAnchorRef.current : webhooksAnchorRef.current
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(key)
    }
  }

  const handleToggleTheme = () => setTheme(toggleTheme())

  if (!token) {
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

  const sunIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
  const moonIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )

  return (
    <div className="dev-portal">
      <div className="app">
        {/* ── sidebar ───────────────────────────────────────────── */}
        <aside className="side">
          <div className="brand">
            <span className="brand-mark"><span /><span /><span /><span /></span>
            <span>idswyft<em>.dev</em></span>
          </div>

          <div className="side-group" style={{ paddingTop: 20 }}>
            <div className="side-label">Developers</div>
            <button
              type="button"
              className={`side-link${activeSection === 'api-keys' ? ' on' : ''}`}
              onClick={() => handleScrollTo('api-keys')}
            >
              <span className="ic" />API Keys
            </button>
            <button
              type="button"
              className={`side-link${activeSection === 'webhooks' ? ' on' : ''}`}
              onClick={() => handleScrollTo('webhooks')}
            >
              <span className="ic" />Webhooks
            </button>
            <button
              type="button"
              className="side-link"
              onClick={() => navigate('/developer/page-builder')}
            >
              <span className="ic" />Page Builder
            </button>
            <Link to="/docs" className="side-link" style={{ display: 'flex' }}>
              <span className="ic" />Docs
            </Link>
          </div>

          <div className="side-group">
            <div className="side-label">Account</div>
            <button
              type="button"
              className="side-link"
              onClick={() => setShowSettings(true)}
            >
              <span className="ic" />Settings
            </button>
            <button
              type="button"
              className="side-link"
              onClick={handleLogout}
            >
              <span className="ic" />Sign out
            </button>
          </div>

          <div className="side-foot">
            <div className="row"><span>status</span><span className="ok">● operational</span></div>
            <div className="row"><span>region</span><span>iad-1</span></div>
            <div className="row"><span>plan</span><span>starter</span></div>
          </div>
        </aside>

        {/* ── main column ──────────────────────────────────────── */}
        <main>
          <header className="top">
            <div className="crumbs">
              <span>console</span>
              <span className="sep">/</span>
              <span>developers</span>
              <span className="sep">/</span>
              <span className="here">{activeSection === 'webhooks' ? 'webhooks' : 'api keys'}</span>
            </div>
            <div className="top-spacer" />
            <button
              className="icon-btn"
              type="button"
              onClick={handleToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? sunIcon : moonIcon}
            </button>
            {/* Mobile fallback for Settings + Sign out — sidebar hides ≤760px */}
            <button
              className="icon-btn mobile-only"
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Open settings"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              className="icon-btn mobile-only"
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </header>

          <div className="page">
            {/* page head */}
            <div className="page-head">
              <div>
                <div className="eyebrow">// developers · api keys</div>
                <h1 className="page-h1">API Keys</h1>
                <p className="page-sub">
                  Manage your verification keys, monitor live traffic, and configure webhooks for any verification event.
                </p>
              </div>
              <div className="page-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => { fetchKeys(); fetchStats() }}
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            {/* team setup banner — uses .forge pattern */}
            {hasOrgAdmin === false && !teamBannerDismissed && (
              <div className="forge" style={{ marginTop: 0, marginBottom: 28 }}>
                <span className="badge">team</span>
                <div>
                  <h4>Set up your team</h4>
                  <p>
                    Invite an Organization Admin to manage verifications from the Review Dashboard —
                    approve, reject, override, and access analytics without your developer credentials.
                  </p>
                </div>
                <div className="right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => setShowSettings(true)}
                  >
                    Invite Admin
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      setTeamBannerDismissed(true)
                      localStorage.setItem('idswyft:team-banner-dismissed', 'true')
                    }}
                    aria-label="Dismiss"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* api keys section anchor */}
            <div ref={apiKeysAnchorRef} data-section="api-keys" style={{ scrollMarginTop: 80 }}>
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
            </div>

            {/* webhooks section anchor */}
            <div ref={webhooksAnchorRef} data-section="webhooks" style={{ scrollMarginTop: 80 }}>
              <WebhooksSection token={token} apiKeys={apiKeys} />
            </div>

            {/* page builder — .forge pattern */}
            <div className="forge">
              <span className="badge">builder</span>
              <div>
                <h4>Customize your hosted verification page</h4>
                <p>Drag-and-drop document parsers, custom liveness prompts, and your own brand on the user-facing flow.</p>
              </div>
              <div className="right">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => navigate('/developer/page-builder')}
                >
                  Open Builder →
                </button>
              </div>
            </div>
          </div>
        </main>
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
