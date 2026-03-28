import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { tryEscalateDeveloperToken } from '../lib/adminApiInstance'
import { fetchCsrfToken, csrfHeader, clearCsrfToken } from '../lib/csrf'
import { C, injectFonts } from '../theme'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  XCircleIcon,
  UsersIcon,
  KeyIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'

// ─── Types ──────────────────────────────────────────────────

interface VerificationStats {
  total: number
  verified: number
  failed: number
  pending: number
  manual_review: number
}

interface WebhookStats {
  total_webhooks: number
  active_webhooks: number
  total_deliveries: number
  successful_deliveries: number
  failed_deliveries: number
  pending_deliveries: number
}

interface Developer {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  is_verified: boolean
  created_at: string
  webhook_url: string | null
  verification_stats: VerificationStats
  webhook_stats: WebhookStats
}

// ─── Helpers ────────────────────────────────────────────────

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const authFetchOpts = (): RequestInit => ({ credentials: 'include' })

// ─── Component ──────────────────────────────────────────────

export function DevelopersList() {
  const navigate = useNavigate()

  useEffect(() => { injectFonts() }, [])

  // ── State ──
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const LIMIT = 25

  // ── Mobile viewport detection ──
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── Auth guard ──
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: 'include' })
      .then(res => {
        if (res.ok) { setAuthReady(true); fetchCsrfToken(); return }
        return tryEscalateDeveloperToken().then(ok => {
          if (ok) { setAuthReady(true); fetchCsrfToken() }
          else navigate('/admin/login')
        })
      })
      .catch(() => navigate('/admin/login'))
  }, [navigate])

  // ── Fetch developers ──
  const fetchDevelopers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      const res = await fetch(`${API_BASE_URL}/api/admin/developers?${params}`, authFetchOpts())
      if (res.status === 401) { navigate('/admin/login'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDevelopers(data.developers || [])
      setTotalPages(data.pagination?.pages || 1)
      setTotalCount(data.pagination?.total || 0)
    } catch (err: any) {
      setError(err.message || 'Failed to load developers')
    } finally {
      setLoading(false)
    }
  }, [page, navigate])

  useEffect(() => { if (authReady) fetchDevelopers() }, [authReady, fetchDevelopers])

  // ── Derived stats ──
  const verifiedCount = developers.filter(d => d.is_verified).length
  const unverifiedCount = developers.filter(d => !d.is_verified).length
  const withKeysCount = developers.filter(d => (d.webhook_stats?.total_webhooks ?? 0) > 0 || d.verification_stats?.total > 0).length

  // ── Search filter (client-side on loaded page) ──
  const filtered = searchQuery
    ? developers.filter(d =>
        (d.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.company_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : developers

  // ── Mobile guard ──
  if (isMobile) {
    return (
      <div style={{
        background: C.bg, minHeight: '100vh', fontFamily: C.sans,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{
          background: C.panel, borderRadius: 16, padding: '48px 32px',
          border: `1px solid ${C.border}`, maxWidth: 400, backdropFilter: 'blur(12px)',
        }}>
          <ComputerDesktopIcon style={{ width: 48, height: 48, color: C.cyan, margin: '0 auto 20px' }} />
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 600, margin: '0 0 12px', fontFamily: C.sans }}>
            Desktop Required
          </h2>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            Developer management requires a desktop browser.
          </p>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, padding: '10px 24px', cursor: 'pointer', fontFamily: C.sans,
              fontSize: 14, fontWeight: 500, transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.cyan)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // ── Render ──
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: C.sans }}>
      {/* Scan-line overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => navigate('/admin/login')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}
              title="Back"
            >
              <ArrowLeftIcon style={{ width: 20, height: 20 }} />
            </button>
            <div>
              <h1 style={{ color: C.text, fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
                Developer Signups
              </h1>
              <p style={{ color: C.dim, fontSize: 13, margin: '4px 0 0', fontFamily: C.mono }}>
                All registered developers and their verification activity
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/admin/verifications')}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.muted, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: C.sans, fontSize: 13, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyanBorder; e.currentTarget.style.color = C.cyan }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
            >
              <ShieldCheckIcon style={{ width: 14, height: 14 }} />
              Verifications
            </button>
            <button
              onClick={() => fetchDevelopers()}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.muted, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: C.sans, fontSize: 13, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyanBorder; e.currentTarget.style.color = C.cyan }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
            >
              <ArrowPathIcon style={{ width: 14, height: 14 }} />
              Refresh
            </button>
            <button
              onClick={() => {
                fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: csrfHeader() }).catch(() => {})
                clearCsrfToken()
                navigate('/admin/login')
              }}
              style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.muted, padding: '8px 16px', cursor: 'pointer',
                fontFamily: C.sans, fontSize: 13, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total Developers', value: totalCount, color: C.text, icon: UsersIcon },
            { label: 'Verified', value: verifiedCount, color: C.green, icon: CheckBadgeIcon },
            { label: 'Unverified', value: unverifiedCount, color: C.amber, icon: ExclamationTriangleIcon },
            { label: 'With Activity', value: withKeysCount, color: C.cyan, icon: KeyIcon },
          ].map(s => (
            <div key={s.label} style={{
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {React.createElement(s.icon, { style: { width: 14, height: 14, color: s.color } })}
                <span style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {s.label}
                </span>
              </div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 600, fontFamily: C.mono, lineHeight: 1 }}>
                {s.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '12px 16px', backdropFilter: 'blur(12px)',
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <MagnifyingGlassIcon style={{ width: 14, height: 14, color: C.dim, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '6px 10px 6px 30px', color: C.text, fontSize: 12, fontFamily: C.mono,
                width: '100%', outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.cyanBorder)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
            />
          </div>
          <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>
            {filtered.length} developer{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Table ── */}
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
          overflow: 'auto', backdropFilter: 'blur(12px)',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1.5fr 2fr 1.5fr 100px 100px 130px', minWidth: 860,
            padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.surface,
          }}>
            {['', 'Name', 'Email', 'Company', 'Verified', 'Verifications', 'Signed Up'].map((h, i) => (
              <div key={i} style={{
                color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', fontFamily: C.sans,
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <ArrowPathIcon style={{ width: 24, height: 24, color: C.cyan, margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              <div style={{ color: C.muted, fontSize: 13 }}>Loading developers...</div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <XCircleIcon style={{ width: 32, height: 32, color: C.red, margin: '0 auto 12px' }} />
              <div style={{ color: C.red, fontSize: 14, marginBottom: 8 }}>{error}</div>
              <button onClick={fetchDevelopers} style={{
                background: C.redDim, border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 6,
                color: C.red, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: C.sans,
              }}>
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <UsersIcon style={{ width: 40, height: 40, color: C.dim, margin: '0 auto 12px' }} />
              <div style={{ color: C.muted, fontSize: 14 }}>
                {searchQuery ? 'No developers match your search' : 'No developers found'}
              </div>
            </div>
          )}

          {/* Rows */}
          {!loading && !error && filtered.map(dev => {
            const isExpanded = expandedId === dev.id
            const stats = dev.verification_stats

            return (
              <React.Fragment key={dev.id}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : dev.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '40px 1.5fr 2fr 1.5fr 100px 100px 130px', minWidth: 860,
                    padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer', transition: 'background 0.1s',
                    background: isExpanded ? C.surface : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.surfaceHover }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {isExpanded
                      ? <ChevronDownIcon style={{ width: 14, height: 14, color: C.cyan }} />
                      : <ChevronRightIcon style={{ width: 14, height: 14, color: C.dim }} />}
                  </div>

                  {/* Name */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>
                      {dev.full_name || '—'}
                    </span>
                  </div>

                  {/* Email */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 13, fontFamily: C.mono }}>
                      {dev.email}
                    </span>
                  </div>

                  {/* Company */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 13 }}>
                      {dev.company_name || '—'}
                    </span>
                  </div>

                  {/* Verified badge */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {dev.is_verified ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`,
                        borderRadius: 6, padding: '2px 8px',
                        color: C.green, fontSize: 11, fontWeight: 600,
                      }}>
                        <CheckBadgeIcon style={{ width: 12, height: 12 }} />
                        Yes
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: C.amberDim, border: `1px solid rgba(251,191,36,0.3)`,
                        borderRadius: 6, padding: '2px 8px',
                        color: C.amber, fontSize: 11, fontWeight: 600,
                      }}>
                        No
                      </span>
                    )}
                  </div>

                  {/* Verification count */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.text, fontSize: 13, fontFamily: C.mono }}>
                      {stats?.total ?? 0}
                    </span>
                  </div>

                  {/* Signed up date */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>
                      {formatDate(dev.created_at)}
                    </span>
                  </div>
                </div>

                {/* ── Expanded Detail ── */}
                {isExpanded && (
                  <div style={{
                    padding: '16px 20px 20px', borderBottom: `1px solid ${C.border}`,
                    background: C.surface,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      {/* Left: Verification breakdown */}
                      <div>
                        <div style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                          Verification Breakdown
                        </div>
                        <div style={{
                          background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16,
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                            {[
                              { label: 'Total', value: stats?.total ?? 0, color: C.text },
                              { label: 'Verified', value: stats?.verified ?? 0, color: C.green },
                              { label: 'Failed', value: stats?.failed ?? 0, color: C.red },
                              { label: 'Review', value: stats?.manual_review ?? 0, color: C.amber },
                              { label: 'Pending', value: stats?.pending ?? 0, color: C.cyan },
                            ].map(s => (
                              <div key={s.label} style={{ textAlign: 'center' }}>
                                <div style={{ color: s.color, fontSize: 22, fontWeight: 600, fontFamily: C.mono, lineHeight: 1 }}>
                                  {s.value}
                                </div>
                                <div style={{ color: C.dim, fontSize: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  {s.label}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Developer info */}
                      <div>
                        <div style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                          Developer Details
                        </div>
                        <div style={{
                          background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16,
                        }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {[
                                ['Developer ID', dev.id],
                                ['Email', dev.email],
                                ['Name', dev.full_name || '—'],
                                ['Company', dev.company_name || '—'],
                                ['Email Verified', dev.is_verified ? 'Yes' : 'No'],
                                ['Webhook URL', dev.webhook_url || 'None'],
                                ['Webhooks', `${dev.webhook_stats?.active_webhooks ?? 0} active / ${dev.webhook_stats?.total_webhooks ?? 0} total`],
                                ['Signed Up', formatDate(dev.created_at)],
                              ].map(([label, value], i) => (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{
                                    padding: '6px 12px 6px 0', color: C.dim, fontSize: 11, fontWeight: 500,
                                    verticalAlign: 'top', whiteSpace: 'nowrap',
                                  }}>
                                    {label}
                                  </td>
                                  <td style={{
                                    padding: '6px 0', color: C.text, fontSize: 12, fontFamily: C.mono,
                                    wordBreak: 'break-all',
                                  }}>
                                    {label === 'Webhook URL' && value !== 'None' ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <GlobeAltIcon style={{ width: 12, height: 12, color: C.cyan, flexShrink: 0 }} />
                                        {value}
                                      </span>
                                    ) : label === 'Email Verified' ? (
                                      <span style={{ color: value === 'Yes' ? C.green : C.amber, fontWeight: 600 }}>
                                        {value}
                                      </span>
                                    ) : value}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20,
          }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                color: page <= 1 ? C.dim : C.muted, padding: '6px 14px', cursor: page <= 1 ? 'default' : 'pointer',
                fontSize: 12, fontFamily: C.sans, opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ color: C.muted, fontSize: 12, fontFamily: C.mono }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                color: page >= totalPages ? C.dim : C.muted, padding: '6px 14px', cursor: page >= totalPages ? 'default' : 'pointer',
                fontSize: 12, fontFamily: C.sans, opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
