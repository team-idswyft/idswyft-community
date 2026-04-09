import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  LineChart,
  RadialBarChart,
  RadialBar,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts'
import { C } from '../../theme'
import { API_BASE_URL } from '../../config/api'

// ─── Types ──────────────────────────────────────────────────

interface DailyVolume {
  date: string
  total: number
  verified: number
  failed: number
  success_rate: number
}

interface RejectionBreakdown {
  reason: string
  count: number
  percentage: number
}

interface DailyLatency {
  date: string
  p50: number
  p95: number
}

interface FunnelStep {
  step: string
  count: number
  percentage: number
}

interface DailyWebhooks {
  date: string
  delivered: number
  failed: number
}

interface AnalyticsData {
  daily_volume: DailyVolume[]
  rejection_breakdown: RejectionBreakdown[]
  daily_latency: DailyLatency[]
  quota: { used: number; limit: number }
  funnel: FunnelStep[]
  daily_webhooks: DailyWebhooks[]
}

// ─── Theme ──────────────────────────────────────────────────

const CHART_THEME = {
  axis: { fill: C.muted, fontFamily: C.mono, fontSize: 11 },
  grid: { stroke: C.border, strokeDasharray: '3 3' },
  tooltip: {
    contentStyle: {
      background: C.surface,
      border: `1px solid ${C.borderStrong}`,
      borderRadius: 8,
      color: C.text,
      fontFamily: C.mono,
      fontSize: 12,
    },
    cursor: { fill: 'rgba(34,211,238,0.05)' },
  },
} as const

const REJECTION_PALETTE = [C.red, C.amber, C.orange, C.purple, C.blue]

const STEP_LABELS: Record<string, string> = {
  initialized: 'Initialized',
  front_uploaded: 'Front uploaded',
  back_uploaded: 'Back uploaded',
  live_captured: 'Live captured',
  completed: 'Completed',
}

// Distinct color per funnel step — progression from neutral (cyan)
// through cool tones to success (green). Indexed by position in the
// backend stageCounts object, so all five entries must be defined.
const FUNNEL_PALETTE: Record<string, string> = {
  initialized: C.cyan,
  front_uploaded: C.blue,
  back_uploaded: C.purple,
  live_captured: C.amber,
  completed: C.green,
}

// ─── Chart Card Wrapper ─────────────────────────────────────

function ChartCard({
  title,
  loading,
  empty,
  children,
}: {
  title: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '20px 20px 12px',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: C.text,
          marginBottom: 16,
          fontFamily: C.sans,
        }}
      >
        {title}
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              height: 180,
              background: `linear-gradient(90deg, ${C.surface} 25%, ${C.surfaceHover} 50%, ${C.surface} 75%)`,
              borderRadius: 8,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
      ) : empty ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.dim,
            fontSize: 13,
            fontFamily: C.mono,
          }}
        >
          No data yet
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      )}
    </div>
  )
}

// ─── Date formatter ─────────────────────────────────────────

function fmtDate(d: string) {
  const parts = d.split('-')
  return `${parts[1]}/${parts[2]}`
}

// ─── Charts ─────────────────────────────────────────────────

function VolumeChart({ data }: { data: DailyVolume[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data}>
        <CartesianGrid {...CHART_THEME.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip {...CHART_THEME.tooltip} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="total"
          fill={C.cyanDim}
          stroke={C.cyan}
          strokeWidth={2}
          name="Total"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="success_rate"
          stroke={C.green}
          strokeWidth={2}
          dot={false}
          name="Success %"
        />
        <Legend
          wrapperStyle={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function RejectionChart({ data }: { data: RejectionBreakdown[] }) {
  const formatted = data.map((d) => ({
    ...d,
    reason: d.reason.replace(/_/g, ' ').toLowerCase(),
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid {...CHART_THEME.grid} horizontal={false} />
        <XAxis type="number" tick={CHART_THEME.axis} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="reason"
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Tooltip {...CHART_THEME.tooltip} />
        <Bar dataKey="count" name="Rejections" radius={[0, 4, 4, 0]}>
          {formatted.map((_, i) => (
            <Cell key={i} fill={REJECTION_PALETTE[i % REJECTION_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function LatencyChart({ data }: { data: DailyLatency[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid {...CHART_THEME.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}ms`}
        />
        <Tooltip {...CHART_THEME.tooltip} />
        <Line
          type="monotone"
          dataKey="p50"
          stroke={C.cyan}
          strokeWidth={2}
          dot={false}
          name="P50"
        />
        <Line
          type="monotone"
          dataKey="p95"
          stroke={C.amber}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          name="P95"
        />
        <Legend
          wrapperStyle={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function QuotaChart({ data }: { data: { used: number; limit: number } }) {
  const pct = data.limit > 0 ? Math.round((data.used / data.limit) * 100) : 0
  const fill = pct > 80 ? C.red : pct > 50 ? C.amber : C.cyan
  const chartData = [{ name: 'Quota', value: pct, fill }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ResponsiveContainer width="100%" height={180}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="90%"
          startAngle={180}
          endAngle={0}
          data={chartData}
          barSize={14}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={7}
            background={{ fill: C.surface }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div
        style={{
          marginTop: -40,
          textAlign: 'center',
          fontFamily: C.mono,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, color: fill }}>{pct}%</div>
        <div style={{ fontSize: 11, color: C.muted }}>
          {data.used.toLocaleString()} / {data.limit.toLocaleString()}
        </div>
      </div>
    </div>
  )
}

function FunnelChart({ data }: { data: FunnelStep[] }) {
  // Preserve the raw step key so we can look up per-step colors; the
  // `step` field gets replaced with the human-readable label for the axis.
  const formatted = data.map((d) => ({
    ...d,
    stepKey: d.step,
    step: STEP_LABELS[d.step] || d.step,
  }))
  // Pad X-axis domain so the count label isn't clipped at the right edge
  // and so 0-value bars still have room to show their label.
  const maxCount = formatted.reduce((m, d) => Math.max(m, d.count), 0)
  const domainMax = Math.max(maxCount * 1.15, 1)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} layout="vertical" margin={{ left: 10, right: 24 }}>
        <CartesianGrid {...CHART_THEME.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, domainMax]}
          allowDecimals={false}
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="step"
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip {...CHART_THEME.tooltip} />
        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
          {formatted.map((d, i) => (
            <Cell key={i} fill={FUNNEL_PALETTE[d.stepKey] || C.cyan} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            style={{ fill: C.text, fontFamily: C.mono, fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function WebhookChart({ data }: { data: DailyWebhooks[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid {...CHART_THEME.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={CHART_THEME.axis}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={CHART_THEME.axis} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_THEME.tooltip} />
        <Bar
          dataKey="delivered"
          stackId="a"
          fill={C.green}
          name="Delivered"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="failed"
          stackId="a"
          fill={C.red}
          name="Failed"
          radius={[4, 4, 0, 0]}
        />
        <Legend
          wrapperStyle={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function AnalyticsCharts({ token }: { token: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchAnalytics() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/developer/analytics`, {
          headers: token === 'session' ? {} : { Authorization: `Bearer ${token}` },
          credentials: 'include' as RequestCredentials,
        })
        if (!res.ok) throw new Error('Failed to fetch analytics')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        console.error('Analytics fetch failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAnalytics()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: C.text,
          marginBottom: 16,
          fontFamily: C.sans,
        }}
      >
        Analytics
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
        }}
      >
        <ChartCard
          title="Verification Volume"
          loading={loading}
          empty={!data?.daily_volume?.length}
        >
          {data?.daily_volume && <VolumeChart data={data.daily_volume} />}
        </ChartCard>

        <ChartCard
          title="Rejection Reasons"
          loading={loading}
          empty={!data?.rejection_breakdown?.length}
        >
          {data?.rejection_breakdown && (
            <RejectionChart data={data.rejection_breakdown} />
          )}
        </ChartCard>

        <ChartCard
          title="API Response Time"
          loading={loading}
          empty={!data?.daily_latency?.length}
        >
          {data?.daily_latency && <LatencyChart data={data.daily_latency} />}
        </ChartCard>

        <ChartCard
          title="Quota Usage"
          loading={loading}
          empty={!data?.quota}
        >
          {data?.quota && <QuotaChart data={data.quota} />}
        </ChartCard>

        <ChartCard
          title="Verification Funnel"
          loading={loading}
          empty={!data?.funnel?.length}
        >
          {data?.funnel && <FunnelChart data={data.funnel} />}
        </ChartCard>

        <ChartCard
          title="Webhook Deliveries"
          loading={loading}
          empty={!data?.daily_webhooks?.length}
        >
          {data?.daily_webhooks && <WebhookChart data={data.daily_webhooks} />}
        </ChartCard>
      </div>
    </div>
  )
}
