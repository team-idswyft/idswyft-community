import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Wifi,
  Database,
  Server,
} from 'lucide-react';
import { platformApi } from '../services/api';
import { sectionLabel, cardSurface, monoXs, monoSm, statusPill, getStatusAccent } from '../styles/tokens';

// ── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'operational' | 'degraded' | 'down';

interface ServiceInfo {
  service: string;
  status: ServiceStatus;
  latency_ms: number;
  details?: string;
  checked_at: string;
}

interface SystemStatusResponse {
  services: ServiceInfo[];
  overall: ServiceStatus;
  checked_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL = 30; // seconds

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'VaaS API': <Server className="h-5 w-5" />,
  'Main API': <Wifi className="h-5 w-5" />,
  'VaaS Database': <Database className="h-5 w-5" />,
  'Main Database': <Database className="h-5 w-5" />,
};

const STATUS_ICONS: Record<ServiceStatus, React.ReactNode> = {
  operational: <CheckCircle className="h-5 w-5 text-emerald-400" />,
  degraded: <AlertTriangle className="h-5 w-5 text-amber-400" />,
  down: <XCircle className="h-5 w-5 text-rose-400" />,
};

const STATUS_DOT_COLORS: Record<ServiceStatus, string> = {
  operational: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  down: 'bg-rose-400',
};

const STATUS_TEXT_COLORS: Record<ServiceStatus, string> = {
  operational: 'text-emerald-400',
  degraded: 'text-amber-400',
  down: 'text-rose-400',
};

const OVERALL_BANNERS: Record<ServiceStatus, { bg: string; border: string; text: string; label: string }> = {
  operational: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-300',
    label: 'All Systems Operational',
  },
  degraded: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    label: 'Some Systems Degraded',
  },
  down: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    text: 'text-rose-300',
    label: 'Major Outage',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getServiceIcon(serviceName: string): React.ReactNode {
  return SERVICE_ICONS[serviceName] || <Activity className="h-5 w-5" />;
}

function getLatencyColor(ms: number): string {
  if (ms < 100) return 'text-emerald-400';
  if (ms < 300) return 'text-amber-400';
  return 'text-rose-400';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SystemStatus() {
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL);
  const countdownRef = useRef(AUTO_REFRESH_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await platformApi.getSystemStatus();
      setData(result as SystemStatusResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system status');
    } finally {
      setLoading(false);
      countdownRef.current = AUTO_REFRESH_INTERVAL;
      setCountdown(AUTO_REFRESH_INTERVAL);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Countdown timer + auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        fetchStatus();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStatus]);

  const handleManualRefresh = () => {
    fetchStatus();
  };

  const overall = data?.overall ?? 'operational';
  const banner = OVERALL_BANNERS[overall];
  const accent = getStatusAccent(overall);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={sectionLabel}>System Status</p>
          <p className="text-sm text-slate-500 mt-1">
            Real-time health monitoring for all platform services.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Countdown */}
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span className={`${monoXs} text-slate-500`}>
              {countdown}s
            </span>
          </div>
          {/* Refresh button */}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="p-2 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Overall status banner */}
      {loading && !data ? (
        <div className="animate-pulse">
          <div className={`${cardSurface} p-5`}>
            <div className="h-4 bg-slate-700/50 rounded w-56" />
          </div>
        </div>
      ) : data ? (
        <>
          <div className={`${banner.bg} border ${banner.border} rounded-xl p-4 flex items-center gap-3`}>
            {STATUS_ICONS[overall]}
            <div>
              <p className={`font-semibold ${banner.text}`}>{banner.label}</p>
              <p className={`${monoXs} text-slate-500 mt-0.5`}>
                Last checked: {formatTimestamp(data.checked_at)}
              </p>
            </div>
          </div>

          {/* Service cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.services.map((svc) => {
              const svcAccent = getStatusAccent(svc.status);
              const dotColor = STATUS_DOT_COLORS[svc.status] || STATUS_DOT_COLORS.operational;
              const textColor = STATUS_TEXT_COLORS[svc.status] || STATUS_TEXT_COLORS.operational;

              return (
                <div
                  key={svc.service}
                  className={`${cardSurface} border-l-2 ${svcAccent.border} p-5 space-y-3 transition-colors`}
                >
                  {/* Service name + icon */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400">
                        {getServiceIcon(svc.service)}
                      </span>
                      <span className="font-semibold text-slate-100">
                        {svc.service}
                      </span>
                    </div>
                    {/* Latency */}
                    <span className={`${monoSm} ${getLatencyColor(svc.latency_ms)}`}>
                      {svc.latency_ms}ms
                    </span>
                  </div>

                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`} />
                      <span className={`${statusPill} ${svcAccent.pill}`}>
                        {svc.status}
                      </span>
                    </div>
                  </div>

                  {/* Details (optional) */}
                  {svc.details && (
                    <p className={`${monoXs} text-slate-500 leading-relaxed`}>
                      {svc.details}
                    </p>
                  )}

                  {/* Last checked */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                    <Clock className="h-3 w-3 text-slate-600" />
                    <span className={`${monoXs} text-slate-600`}>
                      {formatTimestamp(svc.checked_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
