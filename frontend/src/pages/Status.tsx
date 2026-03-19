import { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../config/api'
import '../styles/patterns.css'

const VAAS_API_BASE = import.meta.env.VITE_VAAS_API_URL || 'http://localhost:3002'

// ── Types ───────────────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency_ms: number
}

interface StatusResponse {
  overall: 'operational' | 'degraded' | 'down'
  services: ServiceStatus[]
  checked_at: string
}

type DayStatus = 'operational' | 'degraded' | 'down' | 'no-data'

interface UptimeDayData {
  day: string
  status: DayStatus
}

interface DailySummaryRow {
  day: string
  service: string
  total: number
  operational: number
  degraded: number
  down_count: number
}

// ── Status config ───────────────────────────────────────────────────────────

const STATUS = {
  operational: {
    label: 'Operational',
    dot: '#34d399',
    text: '#34d399',
    bannerBg: 'rgba(52, 211, 153, 0.06)',
    bannerBorder: 'rgba(52, 211, 153, 0.18)',
  },
  degraded: {
    label: 'Degraded Performance',
    dot: '#fbbf24',
    text: '#fbbf24',
    bannerBg: 'rgba(251, 191, 36, 0.06)',
    bannerBorder: 'rgba(251, 191, 36, 0.18)',
  },
  down: {
    label: 'Major Outage',
    dot: '#f87171',
    text: '#f87171',
    bannerBg: 'rgba(248, 113, 113, 0.06)',
    bannerBorder: 'rgba(248, 113, 113, 0.18)',
  },
} as const

const BANNER_LABELS: Record<string, string> = {
  operational: 'All Systems Operational',
  degraded: 'Experiencing Issues',
  down: 'Major Outage',
}

const BAR_COLOR: Record<DayStatus, string> = {
  operational: '#34d399',
  degraded: '#fbbf24',
  down: '#f87171',
  'no-data': '#374151',
}

const BAR_LABEL: Record<DayStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Outage',
  'no-data': 'No data',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

function daySeverity(s: DayStatus): number {
  if (s === 'down') return 3
  if (s === 'degraded') return 2
  if (s === 'operational') return 1
  return 0
}

function buildUptimeDays(rows: DailySummaryRow[], days: number = 30): UptimeDayData[] {
  const dayMap = new Map<string, DayStatus>()
  for (const row of rows) {
    let rowStatus: DayStatus = 'operational'
    if (row.down_count > 0) rowStatus = 'down'
    else if (row.degraded > 0) rowStatus = 'degraded'
    const existing = dayMap.get(row.day)
    if (!existing || daySeverity(rowStatus) > daySeverity(existing)) {
      dayMap.set(row.day, rowStatus)
    }
  }
  const result: UptimeDayData[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ day: key, status: dayMap.get(key) ?? 'no-data' })
  }
  return result
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Inline UptimeBar ────────────────────────────────────────────────────────

function UptimeBar({ data }: { data: UptimeDayData[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: string; status: DayStatus } | null>(null)

  const handleMouseEnter = (e: React.MouseEvent, day: string, status: DayStatus) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, day, status })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${data.length}, 1fr)`,
        gap: 2,
        height: 32,
      }}>
        {data.map((d, i) => (
          <div
            key={d.day || i}
            style={{
              backgroundColor: BAR_COLOR[d.status],
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: tooltip && tooltip.day !== d.day ? 0.5 : 1,
            }}
            onMouseEnter={(e) => handleMouseEnter(e, d.day, d.status)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 6,
        fontSize: 11,
        color: '#475569',
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        <span>{data.length} days ago</span>
        <span>Today</span>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '8px 12px',
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
            {formatDate(tooltip.day)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: BAR_COLOR[tooltip.status],
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: BAR_COLOR[tooltip.status], fontWeight: 500 }}>
              {BAR_LABEL[tooltip.status]}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function Status() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [uptimeDays, setUptimeDays] = useState<UptimeDayData[]>([])

  const fetchStatus = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json: StatusResponse = await response.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch 30-day history from VaaS public endpoint
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${VAAS_API_BASE}/api/public/status/history`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setUptimeDays(buildUptimeDays(json.data || [], 30))
      } catch {
        setUptimeDays(buildUptimeDays([], 30))
      }
    })()
  }, [])

  useEffect(() => {
    fetchStatus()
    intervalRef.current = setInterval(() => fetchStatus(true), 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const overall = data ? STATUS[data.overall] : null

  // Compute uptime percentage
  const operationalDays = uptimeDays.filter((d) => d.status === 'operational').length
  const totalWithData = uptimeDays.filter((d) => d.status !== 'no-data').length
  const uptimePct = totalWithData > 0 ? ((operationalDays / totalWithData) * 100).toFixed(2) : null

  return (
    <div className="pattern-shield pattern-faint pattern-fade-edges pattern-full" style={{ minHeight: '80vh', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 600,
            color: '#f1f5f9',
            letterSpacing: '-0.02em',
            margin: 0,
          }}>
            System Status
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>
            Current status of Idswyft services
          </p>
        </div>

        {/* ── Loading skeleton ───────────────────────────────────────── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{
                height: 68,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                animation: 'pulse 2s infinite',
              }} />
            ))}
          </div>
        )}

        {/* ── Error fallback ─────────────────────────────────────────── */}
        {!loading && error && !data && (
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: 'rgba(248, 113, 113, 0.06)',
            border: '1px solid rgba(248, 113, 113, 0.18)',
            color: '#f87171',
            fontSize: 14,
            textAlign: 'center',
          }}>
            Unable to reach the status API — {error}
          </div>
        )}

        {/* ── Status content ─────────────────────────────────────────── */}
        {!loading && data && overall && (
          <>
            {/* Overall banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 20px',
              borderRadius: 12,
              background: overall.bannerBg,
              border: `1px solid ${overall.bannerBorder}`,
              marginBottom: 32,
            }}>
              <span style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: overall.dot,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: overall.text }}>
                {BANNER_LABELS[data.overall]}
              </span>
              {refreshing && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
                  updating…
                </span>
              )}
            </div>

            {/* ── 30-day uptime bar ──────────────────────────────────── */}
            {uptimeDays.length > 0 && (
              <div style={{
                padding: '20px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: '#0b0f19',
                marginBottom: 32,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                    Uptime
                  </span>
                  {uptimePct && (
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#34d399',
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}>
                      {uptimePct}%
                    </span>
                  )}
                </div>
                <UptimeBar data={uptimeDays} />
              </div>
            )}

            {/* Service list */}
            <div style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}>
              {data.services.map((svc, i) => {
                const cfg = STATUS[svc.status]
                const isLast = i === data.services.length - 1
                return (
                  <div
                    key={svc.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '18px 20px',
                      background: '#0b0f19',
                      borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {/* Service name */}
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>
                      {svc.name}
                    </span>

                    {/* Right side: latency + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {/* Latency */}
                      <span style={{
                        fontSize: 12,
                        fontFamily: '"IBM Plex Mono", monospace',
                        color: '#64748b',
                        minWidth: 52,
                        textAlign: 'right',
                      }}>
                        {svc.latency_ms > 0 ? `${svc.latency_ms} ms` : '—'}
                      </span>

                      {/* Status indicator */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: cfg.dot,
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: cfg.text,
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '4px 20px',
              marginTop: 24,
              padding: '12px 0',
            }}>
              {(['operational', 'degraded', 'down'] as const).map((key) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: STATUS[key].dot,
                  }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {STATUS[key].label}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer info */}
            <div style={{
              marginTop: 32,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 12, color: '#475569' }}>
                Last checked {relativeTime(data.checked_at)} · Auto-refreshes every 60 seconds
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
