import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle,
  Building,
  Bell,
  RefreshCw,
} from 'lucide-react';
import { platformApi } from '../services/api';
import StatCardWithTrend from '../components/charts/StatCardWithTrend';
import VerificationTrendChart from '../components/charts/VerificationTrendChart';
import WebhookHealthChart from '../components/charts/WebhookHealthChart';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

import type { SummaryStats, TrendPoint, OrgHealthRow, WebhookHealthRow } from '../types/analytics';

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);

  // Data
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [orgHealth, setOrgHealth] = useState<OrgHealthRow[]>([]);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealthRow[]>([]);

  // Controls
  const [trendDays, setTrendDays] = useState(30);

  const fetchData = useCallback(async (days: number) => {
    try {
      const [summaryData, trendData, orgData, webhookData] = await Promise.all([
        platformApi.getAnalyticsSummary(),
        platformApi.getVerificationTrend(days),
        platformApi.getOrgHealth(10),
        platformApi.getWebhookHealth(7),
      ]);

      setSummary(summaryData);
      setTrend(trendData);
      setOrgHealth(orgData);
      setWebhookHealth(webhookData);
      setError(null);
    } catch (err: any) {
      console.error('Dashboard data error:', err);
      setError(err.message || 'Failed to load dashboard data');
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchData(trendDays).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trend days change — only refetch the trend chart
  const handleDaysChange = useCallback(async (days: number) => {
    setTrendDays(days);
    setTrendLoading(true);
    try {
      const trendData = await platformApi.getVerificationTrend(days);
      setTrend(trendData);
    } catch (err) {
      console.error('Trend fetch error:', err);
    } finally {
      setTrendLoading(false);
    }
  }, []);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(trendDays);
    setRefreshing(false);
  }, [fetchData, trendDays]);

  // ── Compute deltas ──────────────────────────────────────────────────────

  const verificationDelta = summary && summary.prev_total_verifications > 0
    ? ((summary.total_verifications - summary.prev_total_verifications) / summary.prev_total_verifications) * 100
    : null;

  const successRateDelta = summary && summary.prev_success_rate > 0
    ? summary.success_rate - summary.prev_success_rate
    : null;

  // ── Loading skeleton ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 space-y-8 animate-fade-in">
        {/* Stat card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${cardSurface} p-5`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-slate-800 animate-pulse" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-16 bg-slate-800 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-slate-800/60 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className={`${cardSurface} p-5`}>
          <div className="h-[280px] bg-slate-800/30 rounded animate-pulse" />
        </div>
        {/* Table skeleton */}
        <div className={`${cardSurface} p-5`}>
          <div className="h-[200px] bg-slate-800/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────

  if (error && !summary) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-rose-400 font-mono text-sm">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg font-mono text-xs hover:bg-cyan-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold text-slate-100">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-cyan-300 font-mono text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCardWithTrend
          label="Total Verifications"
          value={summary?.total_verifications ?? 0}
          icon={BarChart3}
          iconClass="icon-container-blue"
          iconColor="text-cyan-300"
          delta={verificationDelta}
          deltaLabel="vs prior 30d"
          animationDelay={0}
        />
        <StatCardWithTrend
          label="Success Rate"
          value={summary ? `${summary.success_rate}%` : '0%'}
          icon={CheckCircle}
          iconClass="icon-container-green"
          iconColor="text-emerald-300"
          delta={successRateDelta}
          deltaLabel="pts"
          animationDelay={80}
        />
        <StatCardWithTrend
          label="Active Organizations"
          value={summary?.active_organizations ?? 0}
          icon={Building}
          iconClass="icon-container-yellow"
          iconColor="text-amber-300"
          animationDelay={160}
        />
        <StatCardWithTrend
          label="Unread Alerts"
          value={summary?.unread_alerts ?? 0}
          icon={Bell}
          iconClass="icon-container-purple"
          iconColor="text-cyan-200"
          animationDelay={240}
        />
      </div>

      {/* Verification Trend Chart */}
      <div className="animate-slide-in-up" style={{ animationDelay: '320ms' }}>
        <VerificationTrendChart
          data={trend}
          days={trendDays}
          loading={trendLoading}
          onDaysChange={handleDaysChange}
        />
      </div>

      {/* Organization Health Table */}
      <div className="animate-slide-in-up" style={{ animationDelay: '400ms' }}>
        <p className={`${sectionLabel} mb-4`}>Organization Health</p>
        <div className={`${cardSurface} overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-950/60">
                <th className={tableHeaderClass}>Organization</th>
                <th className={tableHeaderClass}>Verifications</th>
                <th className={tableHeaderClass}>Success Rate</th>
                <th className={tableHeaderClass}>Webhook Health</th>
                <th className={tableHeaderClass}>Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {orgHealth.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500 font-mono text-xs">
                    No organizations yet
                  </td>
                </tr>
              ) : (
                orgHealth.map((org) => (
                  <tr
                    key={org.org_id}
                    className="transition hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => navigate(`/organizations/${org.org_id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className={`${monoSm} text-slate-100`}>{org.org_name}</div>
                      <div className={`${monoXs} text-slate-500`}>{org.slug}</div>
                    </td>
                    <td className={`px-5 py-3 ${monoSm} text-slate-200`}>
                      {org.verification_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`${monoSm} ${
                        org.success_rate >= 90 ? 'text-emerald-400' :
                        org.success_rate >= 70 ? 'text-amber-400' :
                        'text-rose-400'
                      }`}>
                        {org.success_rate}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {org.webhook_total > 0 ? (
                        <span className={`${monoSm} ${
                          org.webhook_success_rate >= 95 ? 'text-emerald-400' :
                          org.webhook_success_rate >= 80 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {org.webhook_success_rate}%
                        </span>
                      ) : (
                        <span className={`${monoXs} text-slate-600`}>--</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`${statusPill} ${getStatusAccent(org.billing_status).pill}`}>
                        {org.billing_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Webhook Health Chart */}
      <div className="animate-slide-in-up" style={{ animationDelay: '480ms' }}>
        <WebhookHealthChart data={webhookHealth} />
      </div>
    </div>
  );
}
