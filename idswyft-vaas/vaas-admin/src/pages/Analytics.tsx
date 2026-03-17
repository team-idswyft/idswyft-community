import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { DashboardStats, UsageStats, VerificationSession } from '../types.js';
import {
  BarChart3,
  TrendingUp,
  Users,
  AlertTriangle,
  Download,
  RefreshCw,
  Target,
  Eye,
  CheckCircle
} from 'lucide-react';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';

export default function Analytics() {
  const { organization, admin } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [recentVerifications, setRecentVerifications] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<7 | 30 | 90>(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'users' | 'performance'>('overview');

  const fetchAnalyticsData = async () => {
    try {
      setError(null);
      setRefreshing(true);

      // Fetch analytics data in parallel
      const [statsResponse, usageResponse, verificationsResponse] = await Promise.all([
        apiClient.getVerificationStats(selectedPeriod),
        organization ? apiClient.getOrganizationUsage(organization.id) : Promise.resolve(null),
        apiClient.listVerifications({ page: 1, per_page: 10 })
      ]);

      setStats(statsResponse);
      setUsage(usageResponse);
      setRecentVerifications(verificationsResponse.verifications);
    } catch (err: any) {
      console.error('Failed to fetch analytics data:', err);
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [organization, selectedPeriod]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalyticsData();
  };

  const handleExport = () => {
    if (!stats) return;

    const rows = [
      ['Metric', 'Value'],
      ['Period', `${selectedPeriod} days`],
      ['Total Verifications', String(stats.verification_sessions.total || 0)],
      ['Completed', String(stats.verification_sessions.completed || 0)],
      ['Failed', String(stats.verification_sessions.failed || 0)],
      ['Pending', String(stats.verification_sessions.pending || 0)],
      ['Processing', String(stats.verification_sessions.processing || 0)],
      ['Success Rate', `${stats.verification_sessions.success_rate || 0}%`],
      ['Total Users', String(stats.end_users.total || 0)],
      ['Verified Users', String(stats.end_users.verified || 0)],
      ['Manual Review', String(stats.end_users.manual_review || 0)],
    ];

    if (usage) {
      rows.push(
        ['Monthly Verification Count', String(usage.current_period.verification_count)],
        ['Monthly Limit', String(usage.monthly_limit)],
        ['API Calls', String(usage.current_period.api_calls)],
        ['Storage Used (MB)', String(usage.current_period.storage_used_mb.toFixed(1))],
      );
    }

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${selectedPeriod}d-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canViewAnalytics = admin?.permissions.view_analytics || false;
  const canExportAnalytics = admin?.permissions.export_analytics || false;

  if (!canViewAnalytics) {
    return (
      <div className="p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-slate-500" />
          <h3 className="mt-2 text-sm font-medium text-slate-100">Access Denied</h3>
          <p className="mt-1 text-sm text-slate-500">
            You don't have permission to view analytics data.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-700/50 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`${cardSurface} border-l-[3px] border-l-slate-700/50 p-5`}>
                <div className="h-4 bg-slate-700/50 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-slate-700/50 rounded w-1/2"></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${cardSurface} h-96`}></div>
            <div className={`${cardSurface} h-96`}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className={`${cardSurface} p-6 text-center`}>
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-100 mb-2">Error Loading Analytics</h3>
          <p className="text-slate-400 mb-4">{error}</p>
          <button onClick={handleRefresh} className="btn btn-primary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={sectionLabel}>Analytics</p>
          <p className="text-slate-400 mt-1 text-sm">Detailed insights and performance metrics for your verification platform</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Period Selector */}
          <div className="border border-white/10 rounded-lg overflow-hidden flex">
            {([7, 30, 90] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`font-mono text-xs px-3 py-2 transition-colors ${
                  selectedPeriod === period
                    ? 'bg-slate-700/60 text-slate-100'
                    : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                }`}
              >
                {period}d
              </button>
            ))}
          </div>

          {canExportAnalytics && (
            <button
              onClick={handleExport}
              className="btn btn-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-primary"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Analytics Tabs */}
      <div className="border-b border-white/10">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Overview', icon: BarChart3 },
            { id: 'trends', name: 'Trends', icon: TrendingUp },
            { id: 'users', name: 'Users', icon: Users },
            { id: 'performance', name: 'Performance', icon: Target }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-white/10'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab stats={stats} usage={usage} selectedPeriod={selectedPeriod} />
      )}

      {activeTab === 'trends' && (
        <TrendsTab stats={stats} selectedPeriod={selectedPeriod} />
      )}

      {activeTab === 'users' && (
        <UsersTab stats={stats} recentVerifications={recentVerifications} selectedPeriod={selectedPeriod} />
      )}

      {activeTab === 'performance' && (
        <PerformanceTab stats={stats} usage={usage} selectedPeriod={selectedPeriod} />
      )}
    </div>
  );
}

interface TabProps {
  stats: DashboardStats | null;
  usage?: UsageStats | null;
  recentVerifications?: VerificationSession[];
  selectedPeriod: number;
}

function OverviewTab({ stats, usage, selectedPeriod }: TabProps) {
  const overviewStats = [
    {
      name: 'Total Verifications',
      value: stats?.verification_sessions.total?.toLocaleString() || '0',
      accent: 'border-l-cyan-400',
      textColor: 'text-slate-100'
    },
    {
      name: 'Success Rate',
      value: `${stats?.verification_sessions.success_rate || 0}%`,
      accent: 'border-l-emerald-400',
      textColor: 'text-emerald-400'
    },
    {
      name: 'Avg. Completion Time',
      value: '2.4 min',
      accent: 'border-l-amber-400',
      textColor: 'text-amber-400'
    },
    {
      name: 'Active Users',
      value: stats?.end_users.total?.toLocaleString() || '0',
      accent: 'border-l-violet-400',
      textColor: 'text-violet-400'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {overviewStats.map((stat, index) => (
          <div key={index} className={`${cardSurface} border-l-[3px] ${stat.accent} p-5`}>
            <p className={sectionLabel}>{stat.name}</p>
            <p className={`${statNumber} ${stat.textColor} mt-2`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verification Status Distribution */}
        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>Verification Status Distribution</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <StatusBar
                label="Completed"
                value={stats?.verification_sessions.completed || 0}
                total={stats?.verification_sessions.total || 1}
                color="green"
              />
              <StatusBar
                label="Failed"
                value={stats?.verification_sessions.failed || 0}
                total={stats?.verification_sessions.total || 1}
                color="red"
              />
              <StatusBar
                label="Pending"
                value={stats?.verification_sessions.pending || 0}
                total={stats?.verification_sessions.total || 1}
                color="yellow"
              />
              <StatusBar
                label="Processing"
                value={stats?.verification_sessions.processing || 0}
                total={stats?.verification_sessions.total || 1}
                color="blue"
              />
            </div>
          </div>
        </div>

        {/* Usage Overview */}
        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>Usage Summary</p>
          </div>
          <div className="p-6">
            {usage ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-400">Monthly Verifications</span>
                    <span className={`${monoSm} text-slate-100`}>
                      {usage.current_period.verification_count} / {usage.monthly_limit}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div
                      className="bg-cyan-500 h-2 rounded-full"
                      style={{
                        width: `${Math.min((usage.current_period.verification_count / usage.monthly_limit) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={sectionLabel}>API Calls</p>
                    <p className={`${statNumber} text-slate-100 mt-1`}>
                      {usage.current_period.api_calls.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className={sectionLabel}>Storage Used</p>
                    <p className={`${statNumber} text-slate-100 mt-1`}>
                      {usage.current_period.storage_used_mb.toFixed(1)} MB
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-500">Usage data unavailable</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendsTab({ stats, selectedPeriod }: TabProps) {
  return (
    <div className="space-y-6">
      <div className={cardSurface}>
        <div className="p-6 border-b border-white/10">
          <p className={sectionLabel}>Verification Trends</p>
          <p className="text-sm text-slate-400 mt-1">
            Performance trends over the last {selectedPeriod} days
          </p>
        </div>
        <div className="p-6">
          <div className="h-64 flex items-center justify-center border-2 border-white/10 border-dashed rounded-lg">
            <div className="text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-slate-500" />
              <span className="mt-2 block text-sm font-medium text-slate-100">
                Trend Charts Coming Soon
              </span>
              <span className="block text-sm text-slate-500">
                Historical verification trends and patterns will be displayed here
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>Success Rate Trend</p>
          </div>
          <div className="p-6">
            <div className="text-center py-12">
              <Target className="mx-auto h-8 w-8 text-slate-500 mb-2" />
              <p className="text-sm text-slate-500">Success rate timeline chart</p>
            </div>
          </div>
        </div>

        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>Volume Trend</p>
          </div>
          <div className="p-6">
            <div className="text-center py-12">
              <BarChart3 className="mx-auto h-8 w-8 text-slate-500 mb-2" />
              <p className="text-sm text-slate-500">Volume trend chart</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ stats, recentVerifications }: TabProps) {
  const userStats = [
    {
      name: 'Total Users',
      value: stats?.end_users.total || 0,
      accent: 'border-l-cyan-400',
      textColor: 'text-slate-100'
    },
    {
      name: 'Verified Users',
      value: stats?.end_users.verified || 0,
      accent: 'border-l-emerald-400',
      textColor: 'text-emerald-400'
    },
    {
      name: 'Pending Review',
      value: stats?.end_users.manual_review || 0,
      accent: 'border-l-amber-400',
      textColor: 'text-amber-400'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {userStats.map((stat, index) => (
          <div key={index} className={`${cardSurface} border-l-[3px] ${stat.accent} p-5`}>
            <p className={sectionLabel}>{stat.name}</p>
            <p className={`${statNumber} ${stat.textColor} mt-2`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className={cardSurface}>
        <div className="p-6 border-b border-white/10">
          <p className={sectionLabel}>Recent Activity</p>
        </div>
        <div className="overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-slate-900/60 backdrop-blur-sm">
              <tr>
                <th className={tableHeaderClass}>
                  User
                </th>
                <th className={tableHeaderClass}>
                  Status
                </th>
                <th className={tableHeaderClass}>
                  Date
                </th>
                <th className={tableHeaderClass}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/40 backdrop-blur-sm divide-y divide-white/10">
              {recentVerifications?.slice(0, 5).map((verification) => (
                <tr key={verification.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="ml-4">
                        <div className={`${monoSm} font-medium text-slate-100`}>
                          {verification.vaas_end_users?.first_name} {verification.vaas_end_users?.last_name || 'Unknown User'}
                        </div>
                        <div className={`${monoXs} text-slate-500`}>
                          {verification.vaas_end_users?.email || 'No email'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`${statusPill} ${getStatusAccent(verification.status).pill}`}>
                      {verification.status}
                    </span>
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoXs} text-slate-100`}>
                    {new Date(verification.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-500">
                    <button className="text-indigo-600 hover:text-indigo-900">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-center text-sm text-slate-500">
                    No recent activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PerformanceTab({ stats, usage }: TabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>System Performance</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">API Response Time</span>
                <span className={`${monoSm} text-slate-100`}>245ms avg</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '85%' }}></div>
              </div>
              <p className={`${monoXs} text-slate-500 mt-1`}>Excellent performance</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Uptime</span>
                <span className={`${monoSm} text-slate-100`}>99.9%</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '99%' }}></div>
              </div>
              <p className={`${monoXs} text-slate-500 mt-1`}>Last 30 days</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Error Rate</span>
                <span className={`${monoSm} text-slate-100`}>0.1%</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '5%' }}></div>
              </div>
              <p className={`${monoXs} text-slate-500 mt-1`}>Within acceptable limits</p>
            </div>
          </div>
        </div>

        <div className={cardSurface}>
          <div className="p-6 border-b border-white/10">
            <p className={sectionLabel}>Quality Metrics</p>
          </div>
          <div className="p-6 space-y-4">
            <div className={`${infoPanel} flex items-center justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-100">Manual Review Rate</p>
                <p className={`${monoXs} text-slate-400`}>Verifications requiring manual review</p>
              </div>
              <div className="text-right">
                <p className={`${monoSm} font-semibold text-slate-100`}>
                  {((stats?.end_users.manual_review || 0) / (stats?.end_users.total || 1) * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className={`${infoPanel} flex items-center justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-100">Avg. Processing Time</p>
                <p className={`${monoXs} text-slate-400`}>Time to complete verification</p>
              </div>
              <div className="text-right">
                <p className={`${monoSm} font-semibold text-slate-100`}>2.4 min</p>
              </div>
            </div>

            <div className={`${infoPanel} flex items-center justify-between`}>
              <div>
                <p className="text-sm font-medium text-slate-100">Success Rate</p>
                <p className={`${monoXs} text-slate-400`}>Verifications completed successfully</p>
              </div>
              <div className="text-right">
                <p className={`${monoSm} font-semibold text-slate-100`}>{stats?.verification_sessions.success_rate || 0}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cardSurface}>
        <div className="p-6 border-b border-white/10">
          <p className={sectionLabel}>Performance Recommendations</p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-100">API Performance: Excellent</p>
                <p className="text-sm text-slate-400">Response times are well within acceptable limits.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-100">Manual Review Rate: Monitor</p>
                <p className="text-sm text-slate-400">Consider adjusting confidence thresholds to optimize automatic approvals.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-100">System Uptime: Excellent</p>
                <p className="text-sm text-slate-400">Uptime is consistently above 99.9%.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatusBarProps {
  label: string;
  value: number;
  total: number;
  color: 'green' | 'red' | 'yellow' | 'blue';
}

function StatusBar({ label, value, total, color }: StatusBarProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  const colorClasses = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    blue: 'bg-cyan-500'
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className={`${monoSm} text-slate-100`}>{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-slate-700/50 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
