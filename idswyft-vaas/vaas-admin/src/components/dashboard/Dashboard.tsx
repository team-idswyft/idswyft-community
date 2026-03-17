import React, { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  FileText,
  Shield,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';
import { showToast } from '../../lib/toast';
import { DashboardStats, UsageStats, VerificationSession } from '../../types.js';
import { VerificationDetailsModal } from '../VerificationDetailsModal';
import type { VerificationSessionStatus } from '../VerificationDetailsModal';

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

/** Group of verifications belonging to the same end user */
interface UserGroup {
  endUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  verifications: VerificationSession[];
  latestVerification: VerificationSession;
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(first?: string, last?: string): string {
  const f = (first || '?')[0].toUpperCase();
  const l = (last || '')[0]?.toUpperCase() || '';
  return f + l;
}

const AVATAR_COLORS = [
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function Dashboard() {
  const { organization } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [recentVerifications, setRecentVerifications] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Verification detail modal state
  const [selectedVerification, setSelectedVerification] = useState<VerificationSession | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Accordion state — tracks which user groups are expanded
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const [statsResponse, usageResponse, verificationsResponse] = await Promise.all([
        apiClient.getVerificationStats(30),
        organization ? apiClient.getOrganizationUsage(organization.id) : Promise.resolve(null),
        apiClient.listVerifications({ page: 1, per_page: 20 })
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

  const handleStatusUpdate = async (verificationId: string, newStatus: VerificationSessionStatus, reason?: string) => {
    try {
      if (newStatus === 'completed' || newStatus === 'verified') {
        await apiClient.approveVerification(verificationId, reason);
      } else if (newStatus === 'failed') {
        await apiClient.rejectVerification(verificationId, reason || 'Rejected', reason);
      } else {
        await apiClient.patch(`/verifications/${verificationId}/status`, { status: newStatus, reason });
      }

      setRecentVerifications(prev =>
        prev.map(v =>
          v.id === verificationId
            ? { ...v, status: newStatus, updated_at: new Date().toISOString() }
            : v
        )
      );

      if (selectedVerification?.id === verificationId) {
        setSelectedVerification(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err: unknown) {
      showToast.error(`Status update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Group only pending/processing verifications by end_user_id;
  // completed/failed/verified etc. appear as individual rows.
  const userGroups: UserGroup[] = useMemo(() => {
    if (!recentVerifications.length) return [];

    const GROUPABLE = new Set(['pending', 'processing']);
    const groupable: VerificationSession[] = [];
    const individual: VerificationSession[] = [];

    for (const v of recentVerifications) {
      if (GROUPABLE.has(v.status)) groupable.push(v);
      else individual.push(v);
    }

    // Group the groupable ones by end_user_id
    const map = new Map<string, VerificationSession[]>();
    for (const v of groupable) {
      const key = v.end_user_id || v.id;
      const group = map.get(key);
      if (group) group.push(v);
      else map.set(key, [v]);
    }

    const groups: UserGroup[] = [];
    for (const [endUserId, verifications] of map) {
      verifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latest = verifications[0];
      const user = latest.vaas_end_users;
      groups.push({
        endUserId,
        firstName: user?.first_name || '',
        lastName: user?.last_name || '',
        email: user?.email || '',
        verifications,
        latestVerification: latest,
      });
    }

    // Each non-groupable verification becomes its own single-item group
    for (const v of individual) {
      const user = v.vaas_end_users;
      groups.push({
        endUserId: v.end_user_id || v.id,
        firstName: user?.first_name || '',
        lastName: user?.last_name || '',
        email: user?.email || '',
        verifications: [v],
        latestVerification: v,
      });
    }

    // Sort groups by latest verification date (most recent first)
    groups.sort((a, b) =>
      new Date(b.latestVerification.created_at).getTime() - new Date(a.latestVerification.created_at).getTime()
    );

    return groups.slice(0, 5);
  }, [recentVerifications]);

  const toggleExpand = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const baseClass = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold';
    switch (status) {
      case 'completed':
      case 'verified':
        return <span className={`${baseClass} border-emerald-500/35 bg-emerald-500/15 text-emerald-300`}>Verified</span>;
      case 'failed':
        return <span className={`${baseClass} border-rose-500/35 bg-rose-500/15 text-rose-300`}>Failed</span>;
      case 'pending':
        return <span className={`${baseClass} border-cyan-500/35 bg-cyan-500/15 text-cyan-300`}>Pending</span>;
      case 'processing':
        return <span className={`${baseClass} border-amber-500/35 bg-amber-500/15 text-amber-300`}>Processing</span>;
      case 'manual_review':
        return <span className={`${baseClass} border-amber-500/35 bg-amber-500/15 text-amber-300`}>Review</span>;
      case 'expired':
        return <span className={`${baseClass} border-slate-500/35 bg-slate-500/15 text-slate-300`}>Expired</span>;
      default:
        return <span className={`${baseClass} border-slate-500/35 bg-slate-500/15 text-slate-300`}>{status}</span>;
    }
  };

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
        {/* ── Recent Verifications (grouped by user) ── */}
        <section className="content-card-glass animate-fade-in-stagger" style={{ animationDelay: '520ms' }}>
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-300" />
              <h3 className="text-lg font-semibold text-slate-100">Recent Verifications</h3>
            </div>
            <Link to="/verifications" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">View all</Link>
          </div>
          <div className="p-6">
            {userGroups.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <p className="text-slate-400">No verifications yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userGroups.map((group) => {
                  const hasMultiple = group.verifications.length > 1;
                  const isExpanded = expandedUsers.has(group.endUserId);
                  const latest = group.latestVerification;

                  return (
                    <div key={group.endUserId} className="rounded-xl border border-white/10 bg-slate-900/65 overflow-hidden">
                      {/* Main row */}
                      <div
                        className={`flex items-center justify-between gap-3 p-4 ${hasMultiple ? 'cursor-pointer hover:bg-slate-800/40' : ''} transition-colors`}
                        onClick={hasMultiple ? () => toggleExpand(group.endUserId) : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Initials avatar */}
                          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${avatarColor(group.endUserId)}`}>
                            {getInitials(group.firstName, group.lastName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">
                              {group.firstName || group.lastName
                                ? `${group.firstName} ${group.lastName}`.trim()
                                : 'Unknown User'}
                            </p>
                            {group.email && (
                              <p className="truncate text-xs text-slate-500 font-mono">{group.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getStatusBadge(latest.status)}
                          {hasMultiple && (
                            <span className="inline-flex items-center rounded-full border border-slate-500/35 bg-slate-500/15 px-2 py-1 text-xs font-semibold text-slate-300">
                              &times;{group.verifications.length}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 w-14 text-right">{formatRelativeTime(latest.created_at)}</span>
                          {!hasMultiple && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVerification(latest);
                                setShowDetails(true);
                              }}
                              className="rounded-md border border-white/10 p-2 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200"
                              aria-label="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          {hasMultiple && (
                            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </div>

                      {/* Accordion sub-rows */}
                      {hasMultiple && isExpanded && (
                        <div className="border-t border-white/5 bg-slate-900/40">
                          {group.verifications.map((v) => (
                            <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 pl-16 border-b border-white/5 last:border-b-0">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="font-mono">{new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(v.status)}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVerification(v);
                                    setShowDetails(true);
                                  }}
                                  className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200"
                                  aria-label="View details"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Usage Overview ── */}
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

      {/* Verification Details Modal */}
      <VerificationDetailsModal
        verification={selectedVerification}
        isOpen={showDetails && !!selectedVerification}
        onClose={() => {
          setShowDetails(false);
          setSelectedVerification(null);
        }}
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  );
}
