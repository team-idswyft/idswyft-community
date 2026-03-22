import React, { useState, useEffect, useCallback } from 'react';
import {
  Timer,
  RefreshCw,
  Play,
  Pause,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Server,
  Eye,
  Shield,
} from 'lucide-react';
import { platformApi } from '../services/api';
import type { CronJobEntry } from '../services/api';
import {
  sectionLabel,
  statNumber,
  monoXs,
  monoSm,
  cardSurface,
  statusPill,
} from '../styles/tokens';

type BackendTab = 'vaas' | 'main';

export default function CronJobManagement() {
  const [jobs, setJobs] = useState<CronJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BackendTab>('vaas');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchJobs = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await platformApi.getCronJobs();
      setJobs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load cron jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchJobs(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Clear messages after 5s
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await platformApi.pauseCronJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      setMessage({ type: 'success', text: `Job "${updated.name}" paused` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to pause job' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await platformApi.resumeCronJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      setMessage({ type: 'success', text: `Job "${updated.name}" resumed` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to resume job' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrigger = async (id: string, name: string) => {
    setActionLoading(id);
    try {
      await platformApi.triggerCronJob(id);
      setMessage({ type: 'success', text: `Job "${name}" triggered` });
      // Refresh to pick up updated lastRunAt
      await fetchJobs(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to trigger job' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalJobs = jobs.length;
  const runningJobs = jobs.filter((j) => j.status === 'running').length;
  const stoppedJobs = jobs.filter((j) => j.status === 'stopped').length;
  const lastError = jobs
    .filter((j) => j.lastResult === 'error' && j.lastRunAt)
    .sort((a, b) => (b.lastRunAt! > a.lastRunAt! ? 1 : -1))[0];

  const filteredJobs = jobs.filter((j) => j.backend === activeTab);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function formatTimestamp(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Loading / Error ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading background jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-300">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => fetchJobs()} className="ml-auto text-xs underline hover:no-underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Background Jobs</h2>
          <span className={`${statusPill} bg-cyan-500/15 text-cyan-300 border-cyan-500/30`}>
            <Shield className="mr-1 inline h-3 w-3" />
            Super admin
          </span>
        </div>
        <button
          onClick={() => fetchJobs(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Toast message ──────────────────────────────────────────────── */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className={`${cardSurface} p-5`}>
          <div className={sectionLabel}>Total Jobs</div>
          <div className={`${statNumber} mt-2 text-slate-100`}>{totalJobs}</div>
        </div>
        <div className={`${cardSurface} p-5`}>
          <div className={sectionLabel}>Running</div>
          <div className={`${statNumber} mt-2 text-emerald-400`}>{runningJobs}</div>
        </div>
        <div className={`${cardSurface} p-5`}>
          <div className={sectionLabel}>Stopped</div>
          <div className={`${statNumber} mt-2 ${stoppedJobs > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {stoppedJobs}
          </div>
        </div>
        <div className={`${cardSurface} p-5`}>
          <div className={sectionLabel}>Last Error</div>
          <div className={`mt-2 ${monoXs} ${lastError ? 'text-rose-300' : 'text-slate-500'}`}>
            {lastError ? formatTimestamp(lastError.lastRunAt) : 'None'}
          </div>
          {lastError && (
            <div className={`mt-1 truncate ${monoXs} text-slate-500`}>{lastError.name}</div>
          )}
        </div>
      </div>

      {/* ── Tab selector ───────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-slate-900/40 p-1">
        {(['vaas', 'main'] as const).map((tab) => {
          const count = jobs.filter((j) => j.backend === tab).length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-slate-800 text-cyan-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="mr-2 inline h-4 w-4" />
              {tab === 'vaas' ? 'VaaS Backend' : 'Main API'}
              <span className={`ml-2 ${monoXs} ${isActive ? 'text-cyan-400' : 'text-slate-500'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Job cards ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className={`${cardSurface} flex items-center justify-center p-12 text-sm text-slate-500`}>
            No jobs registered for this backend
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div key={job.id} className={`${cardSurface} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: Name + description */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{job.name}</h3>

                    {/* Status pill */}
                    {job.controllable ? (
                      <span
                        className={`${statusPill} ${
                          job.status === 'running'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {job.status}
                      </span>
                    ) : (
                      <span className={`${statusPill} bg-slate-500/15 text-slate-400 border-slate-500/30`}>
                        <Eye className="mr-1 inline h-3 w-3" />
                        View only
                      </span>
                    )}

                    {/* Env gate badge */}
                    {job.envGate && (
                      <span className={`${statusPill} bg-amber-500/15 text-amber-300 border-amber-500/30`}>
                        {job.envGate}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-slate-400">{job.description}</p>

                  {/* Metadata row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className={`flex items-center gap-1.5 ${monoXs} text-slate-500`}>
                      <Clock className="h-3 w-3" />
                      {job.schedule}
                    </span>
                    <span className={`flex items-center gap-1.5 ${monoXs} text-slate-500`}>
                      <Server className="h-3 w-3" />
                      {job.service}
                    </span>
                    {job.lastRunAt && (
                      <span
                        className={`flex items-center gap-1.5 ${monoXs} ${
                          job.lastResult === 'error' ? 'text-rose-400' : 'text-slate-500'
                        }`}
                      >
                        {job.lastResult === 'success' ? (
                          <CheckCircle className="h-3 w-3 text-emerald-400" />
                        ) : job.lastResult === 'error' ? (
                          <XCircle className="h-3 w-3" />
                        ) : null}
                        Last run: {formatTimestamp(job.lastRunAt)}
                      </span>
                    )}
                  </div>

                  {/* Error message */}
                  {job.lastError && (
                    <div className={`mt-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 ${monoXs} text-rose-300`}>
                      {job.lastError}
                    </div>
                  )}
                </div>

                {/* Right: Actions (VaaS only) */}
                {job.controllable && (
                  <div className="flex items-center gap-2">
                    {job.status === 'running' ? (
                      <button
                        onClick={() => handlePause(job.id)}
                        disabled={actionLoading === job.id}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResume(job.id)}
                        disabled={actionLoading === job.id}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => handleTrigger(job.id, job.name)}
                      disabled={actionLoading === job.id}
                      className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Trigger Now
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
