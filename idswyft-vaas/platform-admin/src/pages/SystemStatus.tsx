import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Clock, Server, Wifi, Database, Activity } from 'lucide-react';
import { platformApi } from '../services/api';
import { sectionLabel, monoXs, monoSm } from '../styles/tokens';

// ── Types ────────────────────────────────────────────────────────────────────

type ServiceStatusType = 'operational' | 'degraded' | 'down';

interface ServiceInfo {
  service: string;
  status: ServiceStatusType;
  latency_ms: number;
  details?: string;
  checked_at: string;
}

interface SystemStatusResponse {
  services: ServiceInfo[];
  overall: ServiceStatusType;
  checked_at: string;
}

// ── Status config (Claude status page style) ─────────────────────────────────

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
} as const;

const BANNER_LABELS: Record<string, string> = {
  operational: 'All Systems Operational',
  degraded: 'Some Systems Degraded',
  down: 'Major Outage',
};

const AUTO_REFRESH_SECONDS = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function getServiceIcon(name: string) {
  if (name.includes('Database')) return <Database className="h-4 w-4" />;
  if (name.includes('VaaS')) return <Server className="h-4 w-4" />;
  if (name.includes('Main')) return <Wifi className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

function getLatencyBadgeColor(ms: number): string {
  if (ms < 100) return '#34d399';
  if (ms < 500) return '#fbbf24';
  return '#f87171';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SystemStatus() {
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const countdownRef = useRef(AUTO_REFRESH_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await platformApi.getSystemStatus();
      setData(result as SystemStatusResponse);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system status');
    } finally {
      setLoading(false);
      countdownRef.current = AUTO_REFRESH_SECONDS;
      setCountdown(AUTO_REFRESH_SECONDS);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) fetchStatus();
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchStatus]);

  const overall = data ? STATUS[data.overall] : null;

  return (
    <div className="p-6" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Header row ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className={sectionLabel}>System Status</p>
          <p className="text-sm text-slate-500 mt-1">
            Real-time health monitoring across all services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Clock className="h-3.5 w-3.5" />
            <span className={`${monoXs} tabular-nums`}>{countdown}s</span>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-2 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 12,
          background: 'rgba(248, 113, 113, 0.06)',
          border: '1px solid rgba(248, 113, 113, 0.18)',
          color: '#f87171',
          fontSize: 13,
          marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-3 animate-pulse">
          <div className="h-14 bg-slate-800/40 rounded-xl" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-800/30 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Status content ────────────────────────────────────────── */}
      {data && overall && (
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
            marginBottom: 24,
          }}>
            <span style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: overall.dot,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: overall.text }}>
                {BANNER_LABELS[data.overall]}
              </span>
            </div>
            <span className={`${monoXs} text-slate-600`}>
              {relativeTime(data.checked_at)}
            </span>
          </div>

          {/* Service list — unified card like Claude status page */}
          <div style={{
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
          }}>
            {data.services.map((svc, i) => {
              const cfg = STATUS[svc.status];
              const isLast = i === data.services.length - 1;
              return (
                <div
                  key={svc.service}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: '#0d1117',
                    borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Icon + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{ color: '#64748b' }}>
                      {getServiceIcon(svc.service)}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>
                      {svc.service}
                    </span>
                  </div>

                  {/* Details text (if any) */}
                  {svc.details && (
                    <span className={`${monoXs} text-slate-600 hidden sm:block`} style={{ flex: 1, textAlign: 'center' }}>
                      {svc.details}
                    </span>
                  )}

                  {/* Latency badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <span className={monoSm} style={{
                      color: getLatencyBadgeColor(svc.latency_ms),
                      minWidth: 56,
                      textAlign: 'right',
                    }}>
                      {svc.latency_ms > 0 ? `${svc.latency_ms} ms` : '—'}
                    </span>

                    {/* Status dot + label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: cfg.dot,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: cfg.text }}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '4px 20px',
            marginTop: 20,
            padding: '10px 0',
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

          {/* Footer */}
          <div style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            textAlign: 'center',
          }}>
            <p className={`${monoXs} text-slate-600`}>
              Auto-refreshes every {AUTO_REFRESH_SECONDS} seconds
            </p>
          </div>
        </>
      )}
    </div>
  );
}
