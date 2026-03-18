import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

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

const STATUS_CONFIG = {
  operational: {
    label: 'Operational',
    bannerLabel: 'All Systems Operational',
    dotColor: '#34d399',
    bgColor: 'rgba(52,211,153,0.08)',
    borderColor: 'rgba(52,211,153,0.25)',
    textColor: '#34d399',
  },
  degraded: {
    label: 'Degraded',
    bannerLabel: 'Some Systems Experiencing Issues',
    dotColor: '#fbbf24',
    bgColor: 'rgba(251,191,36,0.08)',
    borderColor: 'rgba(251,191,36,0.25)',
    textColor: '#fbbf24',
  },
  down: {
    label: 'Down',
    bannerLabel: 'Major Outage Detected',
    dotColor: '#f87171',
    bgColor: 'rgba(248,113,113,0.08)',
    borderColor: 'rgba(248,113,113,0.25)',
    textColor: '#f87171',
  },
} as const

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function Status() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json: StatusResponse = await response.json()
      setData(json)
      setError(null)
      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => clearInterval(interval)
  }, [])

  const overallConfig = data ? STATUS_CONFIG[data.overall] : null

  return (
    <div className="min-h-screen bg-[#080c14] text-white" style={{ fontFamily: '"DM Sans",system-ui,sans-serif' }}>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            System Status
          </h1>
          <p className="text-sm text-slate-400">
            Real-time health of Idswyft services
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
          </div>
        )}

        {/* Error state */}
        {!loading && error && !data && (
          <div
            className="mb-8 rounded-lg border px-5 py-4 text-center text-sm"
            style={{
              background: 'rgba(248,113,113,0.08)',
              borderColor: 'rgba(248,113,113,0.25)',
              color: '#f87171',
            }}
          >
            Unable to reach the status API. {error}
          </div>
        )}

        {/* Overall status banner */}
        {!loading && data && overallConfig && (
          <>
            <div
              className="mb-8 flex items-center justify-center gap-3 rounded-lg border px-5 py-4"
              style={{
                background: overallConfig.bgColor,
                borderColor: overallConfig.borderColor,
              }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: overallConfig.dotColor }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: overallConfig.textColor }}
              >
                {overallConfig.bannerLabel}
              </span>
            </div>

            {/* Service cards */}
            <div className="space-y-3">
              {data.services.map((service) => {
                const cfg = STATUS_CONFIG[service.status]
                return (
                  <div
                    key={service.name}
                    className="flex items-center justify-between rounded-lg border px-5 py-4"
                    style={{
                      background: '#0b0f19',
                      borderColor: 'rgba(255,255,255,0.07)',
                    }}
                  >
                    <span className="text-sm font-medium text-white">
                      {service.name}
                    </span>
                    <div className="flex items-center gap-4">
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: '#8896aa', fontFamily: '"IBM Plex Mono","Fira Code",monospace' }}
                      >
                        {formatLatency(service.latency_ms)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: cfg.dotColor }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{ color: cfg.textColor }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Last updated footer */}
            <div className="mt-8 text-center text-xs text-slate-500">
              {lastFetched && (
                <span>Last updated {formatTimestamp(lastFetched.toISOString())}</span>
              )}
              <span className="mx-2">·</span>
              <span>Checked at {formatTimestamp(data.checked_at)}</span>
              <span className="mx-2">·</span>
              <span>Auto-refreshes every 60s</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
