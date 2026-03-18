import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

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

// ── Component ───────────────────────────────────────────────────────────────

export function Status() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const response = await fetch(`${API_BASE}/status`)
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

  useEffect(() => {
    fetchStatus()
    intervalRef.current = setInterval(() => fetchStatus(true), 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const overall = data ? STATUS[data.overall] : null

  return (
    <div style={{ minHeight: '80vh', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <img
            src="/idswyft-logo.png"
            alt="Idswyft"
            style={{ height: 32, margin: '0 auto 20px' }}
          />
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
