import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Eye,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  BarChart3,
  FileText,
  Shield
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';
import { DashboardStats, UsageStats, VerificationSession } from '../../types.js';

interface StatCard {
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down';
    period: string;
  };
  icon: React.ReactNode;
  iconClass: string;
}

export default function Dashboard() {
  const { organization } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [recentVerifications, setRecentVerifications] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const [statsResponse, usageResponse, verificationsResponse] = await Promise.all([
        apiClient.getVerificationStats(30),
        organization ? apiClient.getOrganizationUsage(organization.id) : Promise.resolve(null),
        apiClient.listVerifications({ page: 1, per_page: 5 })
      ]);

      setStats(statsResponse);
      setUsage(usageResponse);
      setRecentVerifications(verificationsResponse.verifications);
    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [organization]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getStatusBadge = (status: string) => {
    const baseClass = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold';
    switch (status) {
      case 'completed':
        return <span className={`${baseClass} border-emerald-500/35 bg-emerald-500/15 text-emerald-300`}>Completed</span>;
      case 'failed':
        return <span className={`${baseClass} border-rose-500/35 bg-rose-500/15 text-rose-300`}>Failed</span>;
      case 'pending':
        return <span className={`${baseClass} border-cyan-500/35 bg-cyan-500/15 text-cyan-300`}>Pending</span>;
      case 'processing':
        return <span className={`${baseClass} border-amber-500/35 bg-amber-500/15 text-amber-300`}>Processing</span>;
      default:
        return <span className={`${baseClass} border-slate-500/35 bg-slate-500/15 text-slate-300`}>{status}</span>;
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card-glass p-6">
                <div className="mb-4 h-4 w-3/5 rounded bg-slate-700/70" />
                <div className="mb-2 h-8 w-2/5 rounded bg-slate-700/70" />
                <div className="h-3 w-1/3 rounded bg-slate-700/50" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="content-card-glass p-6">
              <div className="mb-4 h-4 w-1/2 rounded bg-slate-700/70" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded bg-slate-700/50" />
                ))}
              </div>
            </div>
            <div className="content-card-glass p-6">
              <div className="mb-4 h-4 w-1/2 rounded bg-slate-700/70" />
              <div className="h-48 rounded bg-slate-700/50" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="content-card-glass animate-scale-in p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-100">Error Loading Dashboard</h3>
          <p className="mb-6 text-slate-400">{error}</p>
          <button onClick={handleRefresh} className="btn btn-primary">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const statCards: StatCard[] = [
    {
      title: 'Total Verifications',
      value: stats?.verification_sessions.total || 0,
      change: { value: 12, trend: 'up', period: 'vs last month' },
      icon: <CheckCircle className="h-5 w-5" />,
      iconClass: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
    },
    {
      title: 'Success Rate',
      value: `${stats?.verification_sessions.success_rate || 0}%`,
      change: { value: 2.4, trend: 'up', period: 'vs last month' },
      icon: <TrendingUp className="h-5 w-5" />,
      iconClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
    },
    {
      title: 'Pending Reviews',
      value: stats?.end_users.manual_review || 0,
      icon: <Clock className="h-5 w-5" />,
      iconClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    },
    {
      title: 'Active Users',
      value: stats?.end_users.total || 0,
      change: { value: 8.1, trend: 'up', period: 'vs last month' },
      icon: <Users className="h-5 w-5" />,
      iconClass: 'border-violet-500/40 bg-violet-500/15 text-violet-300'
    }
  ];

  return (
    <div className="space-y-8 p-6">
      <div className="animate-slide-in-up flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Operations Overview</p>
          <h1 className="text-3xl font-semibold text-slate-100">Admin Dashboard</h1>
          <p className="mt-1 text-slate-400">Live verification metrics and organization activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-secondary glass-shimmer">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/verifications/start" className="btn btn-primary">
            Start Verification
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, index) => (
          <div key={index} className="stat-card-glass animate-fade-in-stagger p-6" style={{ animationDelay: `${index * 120}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-400">{card.title}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-100">{card.value}</p>
                {card.change && (
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${card.change.trend === 'up' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                      {card.change.trend === 'up' ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                      {card.change.value}%
                    </span>
                    <span className="text-slate-500">{card.change.period}</span>
                  </div>
                )}
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${card.iconClass}`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="content-card-glass animate-fade-in-stagger" style={{ animationDelay: '520ms' }}>
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-300" />
              <h3 className="text-lg font-semibold text-slate-100">Recent Verifications</h3>
            </div>
            <Link to="/verifications" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">View all</Link>
          </div>
          <div className="p-6">
            {recentVerifications.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <p className="text-slate-400">No verifications yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentVerifications.map((verification) => (
                  <div key={verification.id} className="table-row-glass rounded-xl border border-white/10 bg-slate-900/65 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">
                          {verification.vaas_end_users?.first_name} {verification.vaas_end_users?.last_name || 'Unknown User'}
                        </p>
                        <p className="mt-1 flex items-center text-xs text-slate-500">
                          <Calendar className="mr-1 h-3 w-3" />
                          {formatDate(verification.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(verification.status)}
                        <Link to={`/verifications/${verification.id}`} className="rounded-md border border-white/10 p-2 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="content-card-glass animate-fade-in-stagger" style={{ animationDelay: '680ms' }}>
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              <h3 className="text-lg font-semibold text-slate-100">Usage Overview</h3>
            </div>
            <Link to="/organization" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">View details</Link>
          </div>
          <div className="space-y-5 p-6">
            {usage ? (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-slate-400">Verifications This Month</span>
                    <span className="font-semibold text-slate-100">
                      {usage.current_period.verification_count}
                      {usage.monthly_limit > 0 && <span className="font-normal text-slate-500"> / {usage.monthly_limit}</span>}
                    </span>
                  </div>
                  <div className="progress-bar-glass">
                    <div
                      className="progress-fill"
                      style={{
                        width: usage.monthly_limit > 0
                          ? `${Math.min((usage.current_period.verification_count / usage.monthly_limit) * 100, 100)}%`
                          : '0%'
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-slate-900/65 p-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-500">API Calls</div>
                    <div className="mt-2 text-xl font-semibold text-slate-100">{usage.current_period.api_calls}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/65 p-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Storage</div>
                    <div className="mt-2 text-xl font-semibold text-slate-100">{usage.current_period.storage_used_mb} MB</div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-400">
                    <Shield className="h-4 w-4" />
                    Current Plan
                  </span>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/12 px-3 py-1 text-xs font-semibold uppercase text-cyan-200">
                    {organization?.subscription_tier}
                  </span>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-slate-400">Usage data unavailable</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
