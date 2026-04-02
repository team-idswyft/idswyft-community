import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config/api'
import { fetchCsrfToken, csrfHeader, clearCsrfToken } from '../lib/csrf'
import { C, injectFonts } from '../theme'
import '../styles/patterns.css'
import {
  ShieldCheckIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  IdentificationIcon,
  ArrowLeftIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
  PhotoIcon,
  ComputerDesktopIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

// ─── Types ──────────────────────────────────────────────────

interface Verification {
  id: string
  user_id: string
  status: string
  document_type?: string
  created_at: string
  is_sandbox?: boolean
  source?: string
  failure_reason?: string
  developer_id?: string
  document_thumbnail?: string | null
  selfie_thumbnail?: string | null
}

interface DocumentInfo {
  id: string
  file_name: string
  document_type: string
  url: string | null
}

interface GateDebug {
  gates: {
    ocr: { extracted: boolean | null; quality_score: number | null; quality_analysis: any; fields: Record<string, string> | null; back_fields: Record<string, string> | null; barcode_data: any }
    cross_validation: { score: number | null; verdict: string | null; mismatches: Array<{ field: string; front: string; back: string }>; results: any }
    liveness: { score: number | null; passed: boolean | null }
    deepfake: { is_real: boolean | null; real_probability: number | null; fake_probability: number | null }
    face_match: { score: number | null; passed: boolean | null }
    photo_consistency: { score: number | null }
    address: { status: string | null; score: number | null }
  }
  risk: { overall_score: number; risk_level: string; factors: Array<{ factor?: string; name?: string; weight?: number; score?: number }>; computed_at: string } | null
  aml: { risk_level: string; match_found: boolean; match_count: number; matches: any; lists_checked: string[]; screened_at: string } | null
  timing: { session_started_at: string | null; processing_completed_at: string | null }
  decision: { failure_reason: string | null; manual_review_reason: string | null; reviewed_by: string | null; reviewed_at: string | null }
}

interface VerificationDetail {
  id: string
  user_id: string
  status: string
  document_type?: string
  created_at: string
  is_sandbox?: boolean
  source?: string
  failure_reason?: string
  document_url: string | null
  selfie_url: string | null
  documents: DocumentInfo[]
  user?: { id: string; full_name?: string; email?: string } | null
  developer?: { id: string; company_name?: string; email?: string } | null
  debug?: GateDebug
}

interface Stats {
  total: number
  pending: number
  verified: number
  failed: number
  manual_review: number
}

interface ConfirmAction {
  verificationId: string
  decision: 'approve' | 'reject' | 'override'
  newStatus?: string
}

type StatusFilter = 'all' | 'manual_review' | 'verified' | 'failed' | 'pending'

// ─── Helpers ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ElementType; label: string }> = {
  verified:      { color: C.green,  bg: C.greenDim,  border: 'rgba(52,211,153,0.3)',  icon: ShieldCheckIcon,        label: 'Verified' },
  failed:        { color: C.red,    bg: C.redDim,    border: 'rgba(248,113,113,0.3)', icon: XCircleIcon,            label: 'Failed' },
  manual_review: { color: C.amber,  bg: C.amberDim,  border: 'rgba(251,191,36,0.3)',  icon: ExclamationTriangleIcon, label: 'Manual Review' },
  pending:       { color: C.cyan,   bg: C.cyanDim,   border: C.cyanBorder,            icon: ClockIcon,              label: 'Pending' },
  processing:    { color: C.blue,   bg: C.blueDim,   border: 'rgba(96,165,250,0.3)',  icon: ArrowPathIcon,          label: 'Processing' },
}

const getStatusConfig = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.pending

const truncateId = (id: string) => id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const authFetchOpts = (): RequestInit => ({ credentials: 'include' })
const authFetchOptsJson = (): RequestInit => ({ credentials: 'include', headers: { 'Content-Type': 'application/json', ...csrfHeader() } })

/** Returns theme color for a 0-1 score: green ≥0.7, amber ≥0.4, red <0.4, dim if null */
const scoreColor = (score: number | null): string => {
  if (score === null || score === undefined) return C.dim
  if (score >= 0.7) return C.green
  if (score >= 0.4) return C.amber
  return C.red
}

/** Format a 0-1 score as percentage, or '—' if null */
const fmtScore = (score: number | null): string => {
  if (score === null || score === undefined) return '—'
  return `${(score * 100).toFixed(0)}%`
}

/** Inline score bar component */
function ScoreBar({ label, score, passed }: { label: string; score: number | null; passed?: boolean | null }) {
  const pct = score !== null && score !== undefined ? Math.round(score * 100) : 0
  const color = scoreColor(score)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ color: C.muted, fontSize: 11, fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontSize: 12, fontFamily: C.mono, fontWeight: 600 }}>
          {fmtScore(score)}
          {passed !== null && passed !== undefined && (
            <span style={{ marginLeft: 6, color: passed ? C.green : C.red, fontSize: 10 }}>
              {passed ? 'PASS' : 'FAIL'}
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────

export function VerificationManagement() {
  const navigate = useNavigate()

  useEffect(() => { injectFonts() }, [])

  // ── State ──
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, verified: 0, failed: 0, manual_review: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VerificationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [overrideStatus, setOverrideStatus] = useState('verified')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'reviewer' | 'platform'>('reviewer')
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

  // ── Auth guard (cookie-only, no escalation) ──
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: 'include' })
      .then(res => {
        if (res.ok) { setAuthReady(true); fetchCsrfToken(); return }
        navigate('/admin/login')
      })
      .catch(() => navigate('/admin/login'))
  }, [navigate])

  // ── Detect user role (org admin vs reviewer vs platform admin) ──
  useEffect(() => {
    if (!authReady) return
    // Probe analytics — org admins and platform admins get 200, regular reviewers get 403
    fetch(`${API_BASE_URL}/api/admin/analytics?period=7d`, { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          // Could be org admin or platform admin — try developers list to distinguish
          fetch(`${API_BASE_URL}/api/admin/developers?limit=1`, { credentials: 'include' })
            .then(r => setUserRole(r.ok ? 'platform' : 'admin'))
            .catch(() => setUserRole('admin'))
        } else {
          setUserRole('reviewer')
        }
      })
      .catch(() => setUserRole('reviewer'))
  }, [authReady])

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Fetch verifications ──
  const fetchVerifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`${API_BASE_URL}/api/admin/verifications?${params}`, authFetchOpts())
      if (res.status === 401) {
        navigate('/admin/login')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      setVerifications(data.verifications || [])
      setTotalPages(data.pagination?.pages || 1)
    } catch (err: any) {
      setError(err.message || 'Failed to load verifications')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, navigate])

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, authFetchOpts())
      if (!res.ok) return
      const data = await res.json()
      if (data.stats) setStats(data.stats)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { if (authReady) fetchVerifications() }, [authReady, fetchVerifications])
  useEffect(() => { if (authReady) fetchStats() }, [authReady, fetchStats])

  // ── Fetch detail when expanding a row ──
  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return }
    setExpandedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/verification/${id}`, authFetchOpts())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDetail(data.verification)
    } catch { setDetail(null) }
    finally { setDetailLoading(false) }
  }

  // ── Execute review action ──
  const executeAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      const body: Record<string, string> = { decision: confirmAction.decision }
      if (confirmAction.decision === 'override') body.new_status = confirmAction.newStatus || overrideStatus
      if (actionReason.trim()) body.reason = actionReason.trim()

      const res = await fetch(`${API_BASE_URL}/api/admin/verification/${confirmAction.verificationId}/review`, {
        method: 'PUT', ...authFetchOptsJson(), body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`) }

      const resolvedStatus = confirmAction.decision === 'approve' ? 'verified'
        : confirmAction.decision === 'reject' ? 'failed'
        : confirmAction.newStatus || overrideStatus

      setVerifications(prev => prev.map(v => v.id === confirmAction.verificationId ? { ...v, status: resolvedStatus } : v))
      if (detail?.id === confirmAction.verificationId) setDetail(d => d ? { ...d, status: resolvedStatus } : d)
      setToast({ message: `Verification ${confirmAction.decision === 'override' ? 'overridden to ' + resolvedStatus : confirmAction.decision + 'd'} successfully. Webhook notification queued.`, type: 'success' })
      setConfirmAction(null)
      setActionReason('')
      fetchStats()
    } catch (err: any) {
      setToast({ message: err.message || 'Action failed', type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  // ── Search filter (client-side on loaded page) ──
  const filtered = searchQuery
    ? verifications.filter(v =>
        v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.user_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : verifications

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
          border: `1px solid ${C.border}`, maxWidth: 400,
          backdropFilter: 'blur(12px)',
        }}>
          <ComputerDesktopIcon style={{ width: 48, height: 48, color: C.cyan, margin: '0 auto 20px' }} />
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 600, margin: '0 0 12px', fontFamily: C.sans }}>
            Desktop Required
          </h2>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            Verification management requires a desktop browser for reviewing documents,
            comparing images, and making approval decisions.
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
    <div className="pattern-crosshatch pattern-faint pattern-fade-edges pattern-full" style={{ background: C.bg, minHeight: '100vh', fontFamily: C.sans }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>

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
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
                idswyft / verification-management
              </div>
              <h1 style={{ fontFamily: C.mono, color: C.text, fontSize: 24, fontWeight: 600, margin: 0 }}>
                Verification Management
              </h1>
              <p style={{ color: C.dim, fontSize: 13, margin: '4px 0 0', fontFamily: C.mono }}>
                Review, approve, and manage verification requests
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {userRole === 'platform' && (
              <button
                onClick={() => navigate('/admin/developers')}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: C.sans, fontSize: 13, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyanBorder; e.currentTarget.style.color = C.cyan }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
              >
                <UsersIcon style={{ width: 14, height: 14 }} />
                Developers
              </button>
            )}
            {/* Role badge */}
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '4px 8px', borderRadius: 4,
              background: userRole === 'platform' ? C.purpleDim : userRole === 'admin' ? C.cyanDim : C.surface,
              color: userRole === 'platform' ? C.purple : userRole === 'admin' ? C.cyan : C.muted,
              border: `1px solid ${userRole === 'platform' ? 'rgba(167,139,250,0.3)' : userRole === 'admin' ? C.cyanBorder : C.border}`,
            }}>
              {userRole === 'platform' ? 'Platform Admin' : userRole === 'admin' ? 'Org Admin' : 'Reviewer'}
            </span>
            <button
              onClick={() => { fetchVerifications(); fetchStats() }}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total', value: stats.total, color: C.text, bg: C.surface },
            { label: 'Review', value: stats.manual_review, color: C.amber, bg: C.amberDim },
            { label: 'Pending', value: stats.pending, color: C.cyan, bg: C.cyanDim },
            { label: 'Verified', value: stats.verified, color: C.green, bg: C.greenDim },
            { label: 'Failed', value: stats.failed, color: C.red, bg: C.redDim },
          ].map(s => (
            <div key={s.label} style={{
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 600, fontFamily: C.mono, lineHeight: 1 }}>
                {s.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '12px 16px', backdropFilter: 'blur(12px)',
        }}>
          <FunnelIcon style={{ width: 16, height: 16, color: C.dim, flexShrink: 0 }} />

          {/* Status tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'manual_review', 'pending', 'verified', 'failed'] as StatusFilter[]).map(f => {
              const active = statusFilter === f
              const cfg = f !== 'all' ? getStatusConfig(f) : null
              return (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(1) }}
                  style={{
                    background: active ? (cfg?.bg || C.surface) : 'transparent',
                    border: `1px solid ${active ? (cfg?.border || C.borderStrong) : 'transparent'}`,
                    borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                    color: active ? (cfg?.color || C.text) : C.muted,
                    fontSize: 12, fontWeight: 500, fontFamily: C.sans,
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'all' ? 'All' : f === 'manual_review' ? 'Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <MagnifyingGlassIcon style={{ width: 14, height: 14, color: C.dim, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '6px 10px 6px 30px', color: C.text, fontSize: 12, fontFamily: C.mono,
                width: 200, outline: 'none',
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.cyanBorder}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
          overflow: 'auto', backdropFilter: 'blur(12px)',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 80px 1fr 1fr 140px 130px 140px 200px', minWidth: 1020,
            padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
            background: C.surface,
          }}>
            {['', 'Preview', 'Verification ID', 'User ID', 'Status', 'Type', 'Created', 'Actions'].map((h, i) => (
              <div key={i} style={{
                color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', fontFamily: C.sans,
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <ArrowPathIcon style={{ width: 24, height: 24, color: C.cyan, margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              <div style={{ color: C.muted, fontSize: 13 }}>Loading verifications...</div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <XCircleIcon style={{ width: 32, height: 32, color: C.red, margin: '0 auto 12px' }} />
              <div style={{ color: C.red, fontSize: 14, marginBottom: 8 }}>{error}</div>
              <button onClick={fetchVerifications} style={{
                background: C.redDim, border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 6,
                color: C.red, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: C.sans,
              }}>
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <IdentificationIcon style={{ width: 40, height: 40, color: C.dim, margin: '0 auto 12px' }} />
              <div style={{ color: C.muted, fontSize: 14 }}>
                {searchQuery ? 'No verifications match your search' : 'No verifications found'}
              </div>
            </div>
          )}

          {/* Table rows */}
          {!loading && !error && filtered.map(v => {
            const cfg = getStatusConfig(v.status)
            const StatusIcon = cfg.icon
            const isExpanded = expandedId === v.id

            return (
              <React.Fragment key={v.id}>
                {/* Main row */}
                <div
                  onClick={() => toggleExpand(v.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '40px 80px 1fr 1fr 140px 130px 140px 200px', minWidth: 1020,
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

                  {/* Thumbnails */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                    {v.document_thumbnail ? (
                      <img
                        src={v.document_thumbnail}
                        alt="Doc"
                        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}` }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 4, background: C.codeBg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PhotoIcon style={{ width: 14, height: 14, color: C.dim }} />
                      </div>
                    )}
                    {v.selfie_thumbnail ? (
                      <img
                        src={v.selfie_thumbnail}
                        alt="Live"
                        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 16, border: `1px solid ${C.border}` }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : null}
                  </div>

                  {/* Verification ID */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.text, fontSize: 13, fontFamily: C.mono }} title={v.id}>
                      {truncateId(v.id)}
                    </span>
                    {v.is_sandbox && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, fontWeight: 600, color: C.purple,
                        background: C.purpleDim, border: `1px solid rgba(167,139,250,0.3)`,
                        borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Sandbox
                      </span>
                    )}
                  </div>

                  {/* User ID */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 13, fontFamily: C.mono }} title={v.user_id}>
                      {truncateId(v.user_id)}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      borderRadius: 6, padding: '3px 10px',
                      color: cfg.color, fontSize: 11, fontWeight: 600,
                    }}>
                      <StatusIcon style={{ width: 12, height: 12 }} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Document type */}
                  <div style={{ display: 'flex', alignItems: 'center', color: C.muted, fontSize: 12 }}>
                    {(v.document_type || 'unknown').replace(/_/g, ' ')}
                  </div>

                  {/* Created */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>{formatDate(v.created_at)}</span>
                    <span style={{ color: C.dim, fontSize: 10, fontFamily: C.mono }}>{formatTime(v.created_at)}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {(v.status === 'verified' || v.status === 'failed') ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: v.status === 'verified' ? C.green : C.red,
                        fontSize: 11, fontWeight: 600, fontFamily: C.sans,
                      }}>
                        {v.status === 'verified' ? (
                          <><CheckCircleIcon style={{ width: 14, height: 14 }} /> Complete</>
                        ) : (
                          <><XCircleIcon style={{ width: 14, height: 14 }} /> Complete</>
                        )}
                      </span>
                    ) : null}
                    {(v.status === 'manual_review' || v.status === 'pending') && (
                      <>
                        <button
                          onClick={() => setConfirmAction({ verificationId: v.id, decision: 'approve' })}
                          title="Approve"
                          style={{
                            background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`, borderRadius: 6,
                            color: C.green, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                            fontFamily: C.sans, transition: 'all 0.15s',
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setConfirmAction({ verificationId: v.id, decision: 'reject' })}
                          title="Reject"
                          style={{
                            background: C.redDim, border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 6,
                            color: C.red, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                            fontFamily: C.sans, transition: 'all 0.15s',
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {userRole !== 'reviewer' && (
                      <button
                        onClick={() => setConfirmAction({ verificationId: v.id, decision: 'override' })}
                        title="Override status"
                        style={{
                          background: C.amberDim, border: `1px solid rgba(251,191,36,0.2)`, borderRadius: 6,
                          color: C.amber, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                          fontFamily: C.sans, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        <ArrowsUpDownIcon style={{ width: 11, height: 11 }} />
                        Override
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <div style={{
                    padding: '0 20px 20px', borderBottom: `1px solid ${C.border}`,
                    background: C.surface,
                  }}>
                    {detailLoading && (
                      <div style={{ padding: 32, textAlign: 'center' }}>
                        <ArrowPathIcon style={{ width: 20, height: 20, color: C.cyan, margin: '0 auto', animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}

                    {!detailLoading && detail && (<>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, paddingTop: 8 }}>

                        {/* Left: Documents */}
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                            Uploaded Documents
                          </div>

                          {detail.documents && detail.documents.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                              {detail.documents.map(doc => (
                                <div key={doc.id} style={{
                                  background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8,
                                  overflow: 'hidden',
                                }}>
                                  {doc.url ? (
                                    <img
                                      src={doc.url}
                                      alt={doc.file_name}
                                      style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                  ) : (
                                    <div style={{
                                      width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: C.codeBg,
                                    }}>
                                      <PhotoIcon style={{ width: 32, height: 32, color: C.dim }} />
                                    </div>
                                  )}
                                  <div style={{ padding: '8px 10px' }}>
                                    <div style={{ color: C.muted, fontSize: 11, fontFamily: C.mono }}>{doc.file_name}</div>
                                    <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{doc.document_type}</div>
                                  </div>
                                </div>
                              ))}

                              {/* Selfie */}
                              {detail.selfie_url && (
                                <div style={{
                                  background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8,
                                  overflow: 'hidden',
                                }}>
                                  <img
                                    src={detail.selfie_url}
                                    alt="Live capture"
                                    style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                  />
                                  <div style={{ padding: '8px 10px' }}>
                                    <div style={{ color: C.muted, fontSize: 11, fontFamily: C.mono }}>live_capture</div>
                                    <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>selfie</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{
                              background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8,
                              padding: 24, textAlign: 'center',
                            }}>
                              <DocumentTextIcon style={{ width: 24, height: 24, color: C.dim, margin: '0 auto 8px' }} />
                              <div style={{ color: C.dim, fontSize: 12 }}>No documents available</div>
                            </div>
                          )}
                        </div>

                        {/* Right: Metadata */}
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                            Verification Data
                          </div>

                          <div style={{
                            background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: 16,
                          }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <tbody>
                                {[
                                  ['Verification ID', detail.id],
                                  ['User ID', detail.user_id],
                                  ['Status', detail.status],
                                  ['Document Type', detail.document_type || '-'],
                                  ['Source', detail.source || 'api'],
                                  ['Sandbox', detail.is_sandbox ? 'Yes' : 'No'],
                                  ['Created', `${formatDate(detail.created_at)} ${formatTime(detail.created_at)}`],
                                  ...(detail.failure_reason ? [['Failure Reason', detail.failure_reason]] : []),
                                  ...(detail.developer?.company_name ? [['Developer', detail.developer.company_name]] : []),
                                  ...(detail.developer?.email ? [['Developer Email', detail.developer.email]] : []),
                                ].map(([label, value], i) => (
                                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <td style={{
                                      padding: '8px 12px 8px 0', color: C.dim, fontSize: 11, fontWeight: 500,
                                      verticalAlign: 'top', whiteSpace: 'nowrap',
                                    }}>
                                      {label}
                                    </td>
                                    <td style={{
                                      padding: '8px 0', color: C.text, fontSize: 12, fontFamily: C.mono,
                                      wordBreak: 'break-all',
                                    }}>
                                      {label === 'Status' ? (
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 4,
                                          color: getStatusConfig(String(value)).color,
                                          fontSize: 12, fontWeight: 600,
                                        }}>
                                          {React.createElement(getStatusConfig(String(value)).icon, { style: { width: 12, height: 12 } })}
                                          {getStatusConfig(String(value)).label}
                                        </span>
                                      ) : value}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Action buttons in detail view */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button
                              onClick={() => setConfirmAction({ verificationId: v.id, decision: 'approve' })}
                              style={{
                                flex: 1, background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`, borderRadius: 8,
                                color: C.green, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                fontFamily: C.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              }}
                            >
                              <CheckCircleIcon style={{ width: 16, height: 16 }} />
                              Approve
                            </button>
                            <button
                              onClick={() => setConfirmAction({ verificationId: v.id, decision: 'reject' })}
                              style={{
                                flex: 1, background: C.redDim, border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 8,
                                color: C.red, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                fontFamily: C.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              }}
                            >
                              <XCircleIcon style={{ width: 16, height: 16 }} />
                              Reject
                            </button>
                            {userRole !== 'reviewer' && (
                              <button
                                onClick={() => setConfirmAction({ verificationId: v.id, decision: 'override' })}
                                style={{
                                  flex: 1, background: C.amberDim, border: `1px solid rgba(251,191,36,0.2)`, borderRadius: 8,
                                  color: C.amber, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                  fontFamily: C.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                              >
                                <ArrowsUpDownIcon style={{ width: 16, height: 16 }} />
                                Override
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Debug: Verification Gate Analysis ── */}
                      {detail.debug && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                            Verification Gate Analysis
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            {/* Gate Scores */}
                            <div style={{ background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                              <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Gate Scores</div>
                              <ScoreBar label="OCR Quality" score={detail.debug.gates.ocr.quality_score} />
                              <ScoreBar label="Cross-Validation" score={detail.debug.gates.cross_validation.score} passed={detail.debug.gates.cross_validation.verdict === 'PASS' ? true : detail.debug.gates.cross_validation.verdict === 'REJECT' ? false : null} />
                              <ScoreBar label="Liveness" score={detail.debug.gates.liveness.score} passed={detail.debug.gates.liveness.passed} />
                              <ScoreBar label="Deepfake Check" score={detail.debug.gates.deepfake.real_probability} passed={detail.debug.gates.deepfake.is_real} />
                              <ScoreBar label="Face Match" score={detail.debug.gates.face_match.score} passed={detail.debug.gates.face_match.passed} />
                              {detail.debug.gates.photo_consistency.score !== null && (
                                <ScoreBar label="Photo Consistency" score={detail.debug.gates.photo_consistency.score} />
                              )}
                              {detail.debug.gates.address.score !== null && (
                                <ScoreBar label="Address Match" score={detail.debug.gates.address.score} />
                              )}
                            </div>

                            {/* OCR Extracted Fields */}
                            <div style={{ background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                              <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>OCR Fields (Front)</div>
                              {detail.debug.gates.ocr.fields ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <tbody>
                                    {Object.entries(detail.debug.gates.ocr.fields).map(([key, val]) => (
                                      <tr key={key} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <td style={{ padding: '4px 8px 4px 0', color: C.dim, fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                          {key.replace(/_/g, ' ')}
                                        </td>
                                        <td style={{ padding: '4px 0', color: val ? C.text : C.dim, fontSize: 11, fontFamily: C.mono, wordBreak: 'break-all' }}>
                                          {val || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div style={{ color: C.dim, fontSize: 11 }}>No OCR data available</div>
                              )}
                              {detail.debug.gates.cross_validation.mismatches && detail.debug.gates.cross_validation.mismatches.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ color: C.amber, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Cross-Validation Mismatches</div>
                                  {detail.debug.gates.cross_validation.mismatches.map((m, i) => (
                                    <div key={i} style={{ color: C.muted, fontSize: 10, fontFamily: C.mono, padding: '2px 0' }}>
                                      {m.field}: front="{m.front}" vs back="{m.back}"
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Risk & AML */}
                            <div style={{ background: C.codeBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                              {detail.debug.risk ? (
                                <>
                                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Risk Assessment</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{
                                      fontSize: 20, fontWeight: 700, fontFamily: C.mono,
                                      color: detail.debug.risk.overall_score <= 30 ? C.green : detail.debug.risk.overall_score <= 60 ? C.amber : C.red,
                                    }}>
                                      {detail.debug.risk.overall_score}
                                    </span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                                      background: detail.debug.risk.risk_level === 'low' ? C.greenDim : detail.debug.risk.risk_level === 'medium' ? C.amberDim : C.redDim,
                                      color: detail.debug.risk.risk_level === 'low' ? C.green : detail.debug.risk.risk_level === 'medium' ? C.amber : C.red,
                                    }}>
                                      {detail.debug.risk.risk_level}
                                    </span>
                                  </div>
                                  {detail.debug.risk.factors && (
                                    <div>
                                      {(Array.isArray(detail.debug.risk.factors) ? detail.debug.risk.factors : []).map((f, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                          <span style={{ color: C.dim, fontSize: 10 }}>{f.factor || f.name}</span>
                                          <span style={{ color: C.muted, fontSize: 10, fontFamily: C.mono }}>{f.weight ?? f.score}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div style={{ color: C.dim, fontSize: 11 }}>No risk assessment data</div>
                              )}

                              {detail.debug.aml && (
                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AML Screening</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                                      background: detail.debug.aml.match_found ? C.redDim : C.greenDim,
                                      color: detail.debug.aml.match_found ? C.red : C.green,
                                    }}>
                                      {detail.debug.aml.match_found ? 'MATCH FOUND' : 'CLEAR'}
                                    </span>
                                  </div>
                                  <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>
                                    Lists: {(detail.debug.aml.lists_checked || []).join(', ') || '—'}
                                  </div>
                                </div>
                              )}

                              {detail.debug.timing.processing_completed_at && detail.debug.timing.session_started_at && (
                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Processing Time</div>
                                  <div style={{ color: C.cyan, fontSize: 14, fontFamily: C.mono, fontWeight: 600 }}>
                                    {((new Date(detail.debug.timing.processing_completed_at).getTime() - new Date(detail.debug.timing.session_started_at).getTime()) / 1000).toFixed(1)}s
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>)}

                    {!detailLoading && !detail && (
                      <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13 }}>
                        Failed to load details
                      </div>
                    )}
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

      {/* ── Confirmation Modal ── */}
      {confirmAction && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { if (!actionLoading) { setConfirmAction(null); setActionReason('') } }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14,
              padding: 28, width: 440, maxWidth: '90vw',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: 0 }}>
                {confirmAction.decision === 'approve' ? 'Approve Verification'
                  : confirmAction.decision === 'reject' ? 'Reject Verification'
                  : 'Override Status'}
              </h3>
              <button
                onClick={() => { setConfirmAction(null); setActionReason('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4 }}
              >
                <XMarkIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
                {confirmAction.decision === 'approve'
                  ? 'This will mark the verification as verified and notify downstream systems via webhook.'
                  : confirmAction.decision === 'reject'
                  ? 'This will mark the verification as failed and notify downstream systems via webhook.'
                  : 'Override the verification to a specific status. A webhook will be sent to downstream systems.'}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 4, fontFamily: C.mono }}>
                  VERIFICATION ID
                </div>
                <div style={{
                  background: C.codeBg, borderRadius: 6, padding: '8px 12px',
                  color: C.text, fontSize: 12, fontFamily: C.mono, border: `1px solid ${C.border}`,
                }}>
                  {confirmAction.verificationId}
                </div>
              </div>

              {/* Override status selector */}
              {confirmAction.decision === 'override' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 4, fontFamily: C.mono }}>
                    NEW STATUS
                  </div>
                  <select
                    value={overrideStatus}
                    onChange={e => setOverrideStatus(e.target.value)}
                    style={{
                      width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                      padding: '8px 12px', color: C.text, fontSize: 13, fontFamily: C.sans, outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="verified">Verified</option>
                    <option value="failed">Failed</option>
                    <option value="manual_review">Manual Review</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              )}

              {/* Reason (optional for approve, recommended for reject/override) */}
              <div>
                <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 4, fontFamily: C.mono }}>
                  REASON {confirmAction.decision === 'approve' ? '(optional)' : '(recommended)'}
                </div>
                <textarea
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder={
                    confirmAction.decision === 'approve' ? 'Optional notes...'
                    : confirmAction.decision === 'reject' ? 'Reason for rejection...'
                    : 'Reason for override...'
                  }
                  rows={3}
                  style={{
                    width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: '8px 12px', color: C.text, fontSize: 13, fontFamily: C.sans, outline: 'none',
                    resize: 'vertical',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.cyanBorder}
                  onBlur={e => e.currentTarget.style.borderColor = C.border}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConfirmAction(null); setActionReason('') }}
                disabled={actionLoading}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, padding: '10px 20px', cursor: 'pointer', fontSize: 13,
                  fontFamily: C.sans, fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={actionLoading}
                style={{
                  background: confirmAction.decision === 'approve' ? C.greenDim
                    : confirmAction.decision === 'reject' ? C.redDim
                    : C.amberDim,
                  border: `1px solid ${
                    confirmAction.decision === 'approve' ? 'rgba(52,211,153,0.4)'
                    : confirmAction.decision === 'reject' ? 'rgba(248,113,113,0.4)'
                    : 'rgba(251,191,36,0.4)'
                  }`,
                  borderRadius: 8,
                  color: confirmAction.decision === 'approve' ? C.green
                    : confirmAction.decision === 'reject' ? C.red
                    : C.amber,
                  padding: '10px 24px', cursor: actionLoading ? 'wait' : 'pointer',
                  fontSize: 13, fontFamily: C.sans, fontWeight: 600,
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading ? 'Processing...'
                  : confirmAction.decision === 'approve' ? 'Confirm Approve'
                  : confirmAction.decision === 'reject' ? 'Confirm Reject'
                  : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: toast.type === 'success' ? C.greenDim : C.redDim,
          border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
          borderRadius: 10, padding: '14px 20px', maxWidth: 400,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp 0.3s ease-out',
        }}>
          {toast.type === 'success'
            ? <CheckCircleIcon style={{ width: 18, height: 18, color: C.green, flexShrink: 0 }} />
            : <XCircleIcon style={{ width: 18, height: 18, color: C.red, flexShrink: 0 }} />}
          <span style={{ color: toast.type === 'success' ? C.green : C.red, fontSize: 13, fontWeight: 500 }}>
            {toast.message}
          </span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 2, marginLeft: 4, flexShrink: 0 }}
          >
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
          <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  )
}
