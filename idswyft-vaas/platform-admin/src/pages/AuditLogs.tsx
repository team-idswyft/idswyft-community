import React, { useState, useEffect } from 'react';
import { platformApi } from '../services/api';
import type { Organization } from '../services/api';
import {
  Search,
  Filter,
  Download,
  Eye,
  User,
  Key,
  Server,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';

const ITEMS_PER_PAGE = 20;

// ── Types (self-contained for platform-admin) ────────────────────────────────
interface AuditLogEntry {
  id: string;
  organization_id: string;
  actor_type: 'admin' | 'api_key' | 'system';
  actor_id: string;
  actor_name: string;
  actor_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  details: Record<string, any>;
  metadata: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'success' | 'failure' | 'warning';
  timestamp: string;
  created_at: string;
}

interface AuditLogFilters {
  actor_type?: string;
  resource_type?: string;
  severity?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  organization_id?: string;
  [key: string]: any;
}

interface AuditLogStats {
  total_events_today: number;
  total_events_week: number;
  total_events_month: number;
  security_alerts_count: number;
  failed_login_attempts: number;
}

// Actor icons
const actorIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: User,
  api_key: Key,
  system: Server,
};

// ── Transform raw DB row → AuditLogEntry ─────────────────────────────────────
function transformRow(row: any): AuditLogEntry {
  const rawAction: string = row.action || 'unknown';
  const shortAction = rawAction.includes('.') ? rawAction.split('.').pop()! : rawAction;

  const failActions = ['login_failed', 'account_locked', 'unauthorized_access_attempt', 'rate_limit_exceeded'];
  const highActions = ['password_reset', 'password_changed', 'user_deleted', 'api_key_deleted', 'data_deletion_requested'];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (failActions.includes(shortAction)) severity = 'high';
  else if (highActions.includes(shortAction)) severity = 'medium';

  let status: 'success' | 'failure' | 'warning' = 'success';
  if (shortAction.includes('failed') || shortAction.includes('locked') || shortAction.includes('exceeded')) {
    status = 'failure';
  } else if (shortAction.includes('flagged') || shortAction.includes('suspicious')) {
    status = 'warning';
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    actor_type: row.actor_type ?? 'admin',
    actor_id: row.actor_id ?? row.admin_id ?? '',
    actor_name: row.actor_name ?? (row.admin_id ? row.admin_id.substring(0, 8) : 'System'),
    actor_email: row.actor_email ?? undefined,
    action: shortAction,
    resource_type: (row.resource_type || 'system'),
    resource_id: row.resource_id ?? undefined,
    resource_name: row.resource_name ?? (row.resource_id ? row.resource_id.substring(0, 12) : undefined),
    details: row.details || {},
    metadata: row.metadata ?? {
      ip_address: row.ip_address ?? undefined,
      user_agent: row.user_agent ?? undefined,
    },
    severity: row.severity ?? severity,
    status: row.status ?? status,
    timestamp: row.timestamp ?? row.created_at,
    created_at: row.created_at,
  };
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Org filter
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // Load organizations for filter dropdown
  useEffect(() => {
    platformApi.listOrganizations().then(({ organizations: orgs }) => {
      setOrganizations(orgs);
    }).catch(() => { /* non-critical */ });
  }, []);

  // Load audit logs — called explicitly from handlers, NOT from useEffect
  const loadAuditLogs = async (page = 1, overrideFilters?: AuditLogFilters, overrideOrgId?: string) => {
    const activeFilters = overrideFilters ?? filters;
    const orgId = overrideOrgId ?? selectedOrgId;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        ...activeFilters,
        page,
        per_page: ITEMS_PER_PAGE,
      };
      if (orgId) params.organization_id = orgId;

      const raw = await platformApi.getAuditLogs(params);
      const rawLogs: any[] = raw.audit_logs ?? raw.entries ?? [];
      const meta = raw.meta ?? {};

      const entries = rawLogs.map(transformRow);
      setLogs(entries);
      setTotalPages(meta.total_pages ?? 1);
      setTotal(meta.total_count ?? meta.total ?? rawLogs.length);
      setCurrentPage(page);
    } catch (err: unknown) {
      console.error('Failed to load audit logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  // Load stats
  const loadStats = async (overrideOrgId?: string) => {
    const orgId = overrideOrgId ?? selectedOrgId;
    setStatsLoading(true);
    try {
      const raw = await platformApi.getAuditLogStats(
        orgId ? { organization_id: orgId } : undefined
      );
      setStats({
        total_events_today: raw.total_events_today ?? 0,
        total_events_week: raw.total_events_week ?? 0,
        total_events_month: raw.total_logs ?? raw.total_events_month ?? 0,
        security_alerts_count: raw.security_alerts_count ?? 0,
        failed_login_attempts: raw.failed_login_attempts ?? 0,
      });
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  };

  // Initial load only
  useEffect(() => {
    loadAuditLogs();
    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (key: string, value: string) => {
    const newFilters: AuditLogFilters = { ...filters };
    if (value) {
      newFilters[key] = value;
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    loadAuditLogs(1, newFilters);
  };

  const handleSearch = () => loadAuditLogs(1);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAuditLogs(currentPage), loadStats()]);
    setRefreshing(false);
  };

  const handleExport = async (format: 'csv' | 'json' = 'csv') => {
    setExporting(true);
    try {
      const params: Record<string, any> = { ...filters, format };
      if (selectedOrgId) params.organization_id = selectedOrgId;
      if (search.trim()) params.search = search.trim();

      const blob = await platformApi.exportAuditLogs(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-platform-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // export failed
    } finally {
      setExporting(false);
    }
  };

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    loadAuditLogs(1, filters, orgId);
    loadStats(orgId);
  };

  const formatAction = (action: string) =>
    action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const formatTimestamp = (ts: string) => new Date(ts).toLocaleString();

  const getRelativeTime = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Loading skeleton
  if (loading && logs.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700/50 rounded w-64 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`${cardSurface} border-l-[3px] border-l-slate-700/50 p-5`}>
                <div className="h-4 bg-slate-700/50 rounded w-24 mb-2" />
                <div className="h-8 bg-slate-700/50 rounded w-16" />
              </div>
            ))}
          </div>
          <div className={cardSurface}>
            <div className="p-6 border-b border-white/10"><div className="h-6 bg-slate-700/50 rounded w-32" /></div>
            <div className="p-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-slate-800/50 rounded mb-4" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className={sectionLabel}>Audit Logs</p>
          <p className="text-slate-400 mt-1 text-sm">Cross-organization security and compliance monitoring</p>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => loadAuditLogs()} className="ml-4 text-rose-200 hover:text-white underline text-xs font-mono">Retry</button>
          </div>
        )}

        <div className="flex space-x-3">
          {/* Organization filter */}
          <select
            value={selectedOrgId}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="px-3 py-2 border border-white/10 rounded-lg bg-slate-900/70 text-slate-100 font-mono text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          >
            <option value="">All Organizations</option>
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 border border-white/10 rounded-lg text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="p-2 border border-white/10 rounded-lg text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50 flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="font-mono text-sm">{exporting ? 'Exporting...' : 'Export'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !statsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className={`${cardSurface} border-l-[3px] border-l-cyan-400 p-5`}>
            <p className={sectionLabel}>Today</p>
            <p className={`${statNumber} text-slate-100`}>{stats.total_events_today.toLocaleString()}</p>
          </div>
          <div className={`${cardSurface} border-l-[3px] border-l-emerald-400 p-5`}>
            <p className={sectionLabel}>This Week</p>
            <p className={`${statNumber} text-emerald-400`}>{stats.total_events_week.toLocaleString()}</p>
          </div>
          <div className={`${cardSurface} border-l-[3px] border-l-rose-400 p-5`}>
            <p className={sectionLabel}>Security Alerts</p>
            <p className={`${statNumber} text-rose-400`}>{stats.security_alerts_count.toLocaleString()}</p>
          </div>
          <div className={`${cardSurface} border-l-[3px] border-l-amber-400 p-5`}>
            <p className={sectionLabel}>Failed Logins</p>
            <p className={`${statNumber} text-amber-400`}>{stats.failed_login_attempts.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className={`${cardSurface} mb-6`}>
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search logs by actor, action, resource, IP address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 pr-4 py-2 w-full border border-white/10 rounded-lg bg-slate-900/70 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-mono text-sm"
              >
                Search
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 border rounded-lg flex items-center font-mono text-sm ${
                  showFilters
                    ? 'bg-cyan-500/12 border-cyan-500/30 text-cyan-300'
                    : 'border-white/10 text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors'
                }`}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="p-6 bg-slate-900/40 border-t border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Actor Type</label>
                <select
                  value={filters.actor_type || ''}
                  onChange={(e) => handleFilterChange('actor_type', e.target.value)}
                  className="form-input"
                >
                  <option value="">All Types</option>
                  <option value="admin">Admin</option>
                  <option value="api_key">API Key</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <label className="form-label">Resource Type</label>
                <select
                  value={filters.resource_type || ''}
                  onChange={(e) => handleFilterChange('resource_type', e.target.value)}
                  className="form-input"
                >
                  <option value="">All Resources</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="verification">Verification</option>
                  <option value="api_key">API Key</option>
                  <option value="webhook">Webhook</option>
                  <option value="billing">Billing</option>
                  <option value="organization">Organization</option>
                  <option value="settings">Settings</option>
                </select>
              </div>
              <div>
                <label className="form-label">Severity</label>
                <select
                  value={filters.severity || ''}
                  onChange={(e) => handleFilterChange('severity', e.target.value)}
                  className="form-input"
                >
                  <option value="">All Severities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="form-input"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="warning">Warning</option>
                </select>
              </div>
              <div>
                <label className="form-label">From Date</label>
                <input
                  type="datetime-local"
                  value={filters.date_from || ''}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">To Date</label>
                <input
                  type="datetime-local"
                  value={filters.date_to || ''}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilters({});
                    setSearch('');
                    loadAuditLogs(1, {});
                  }}
                  className="w-full px-4 py-2 border border-white/10 rounded-lg text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors font-mono text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-100">
              Audit Logs <span className={`${monoXs} text-slate-500`}>({total.toLocaleString()} total)</span>
            </h2>
            {loading && (
              <div className={`flex items-center text-slate-500 ${monoXs}`}>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/40">
              <tr>
                <th className={tableHeaderClass}>Timestamp</th>
                <th className={tableHeaderClass}>Organization</th>
                <th className={tableHeaderClass}>Actor</th>
                <th className={tableHeaderClass}>Action</th>
                <th className={tableHeaderClass}>Resource</th>
                <th className={tableHeaderClass}>Status</th>
                <th className={tableHeaderClass}>Severity</th>
                <th className={tableHeaderClass}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/40 backdrop-blur-sm divide-y divide-white/10">
              {logs.map((log) => {
                const ActorIcon = actorIcons[log.actor_type] || User;
                const org = organizations.find(o => o.id === log.organization_id);
                return (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-100">
                      <div>
                        <div className="font-medium">{getRelativeTime(log.timestamp)}</div>
                        <div className={`${monoXs} text-slate-500`}>{formatTimestamp(log.timestamp)}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm">
                      <span className={`${monoXs} text-slate-300`}>{org?.name || log.organization_id?.substring(0, 8)}</span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        <ActorIcon className="h-4 w-4 text-slate-500 mr-2" />
                        <div>
                          <div className="font-medium text-slate-100">{log.actor_name}</div>
                          {log.actor_email && (
                            <div className={`${monoXs} text-slate-500`}>{log.actor_email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-slate-100">{formatAction(log.action)}</div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm">
                      <div>
                        <div className="font-medium text-slate-100 capitalize">{log.resource_type}</div>
                        {log.resource_name && (
                          <div className={`${monoXs} text-slate-500 truncate max-w-32`}>{log.resource_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`${statusPill} ${getStatusAccent(log.status).pill}`}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`${statusPill} ${getStatusAccent(log.severity).pill}`}>
                        {log.severity.charAt(0).toUpperCase() + log.severity.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-500">
                      <button
                        onClick={() => { setSelectedLog(log); setShowLogModal(true); }}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div className="text-center py-12">
            <Activity className="mx-auto h-12 w-12 text-slate-500" />
            <h3 className="mt-2 text-sm font-medium text-slate-100">No audit logs found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {Object.keys(filters).length > 0 || search || selectedOrgId
                ? 'Try adjusting your search criteria or filters.'
                : 'Audit logs will appear here as activities occur across organizations.'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-white/10 bg-slate-900/40">
            <div className="flex items-center justify-between">
              <div className={`${monoXs} text-slate-500`}>
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, total)} of{' '}
                {total.toLocaleString()} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => loadAuditLogs(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-1 border border-white/10 rounded-lg font-mono text-sm text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <div className="flex items-center space-x-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <button
                        key={page}
                        onClick={() => loadAuditLogs(page)}
                        disabled={loading}
                        className={`px-3 py-1 font-mono text-sm rounded-lg ${
                          page === currentPage
                            ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-200'
                            : 'text-slate-300 bg-slate-900/70 border border-white/10 hover:bg-slate-800/40 transition-colors'
                        } disabled:opacity-50`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => loadAuditLogs(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  className="px-3 py-1 border border-white/10 rounded-lg font-mono text-sm text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Audit Log Details" size="lg">
        {selectedLog && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className={sectionLabel}>Event ID</p>
                <div className={infoPanel}><p className={`${monoXs} text-slate-100`}>{selectedLog.id}</p></div>
              </div>
              <div>
                <p className={sectionLabel}>Timestamp</p>
                <div className={infoPanel}><p className={`${monoSm} text-slate-100`}>{formatTimestamp(selectedLog.timestamp)}</p></div>
              </div>
            </div>

            <div>
              <p className={sectionLabel}>Organization</p>
              <div className={infoPanel}>
                <p className={`${monoSm} text-slate-100`}>
                  {organizations.find(o => o.id === selectedLog.organization_id)?.name || selectedLog.organization_id}
                </p>
              </div>
            </div>

            <div>
              <p className={`${sectionLabel} mb-2`}>Actor</p>
              <div className={infoPanel}>
                <div className="flex items-center mb-2">
                  {React.createElement(actorIcons[selectedLog.actor_type] || User, { className: "h-5 w-5 text-slate-400 mr-2" })}
                  <span className="font-medium text-slate-100">{selectedLog.actor_name}</span>
                  <span className={`ml-2 ${statusPill} ${getStatusAccent(selectedLog.actor_type).pill}`}>
                    {selectedLog.actor_type.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                {selectedLog.actor_email && (
                  <p className={`${monoSm} text-slate-400`}>{selectedLog.actor_email}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={`${sectionLabel} mb-2`}>Action</p>
                <p className="text-sm bg-cyan-500/12 text-cyan-200 p-3 rounded-lg font-medium">
                  {formatAction(selectedLog.action)}
                </p>
              </div>
              <div>
                <p className={`${sectionLabel} mb-2`}>Resource</p>
                <div className={infoPanel}>
                  <p className="text-sm font-medium capitalize text-slate-100">{selectedLog.resource_type}</p>
                  {selectedLog.resource_name && <p className="text-sm text-slate-400 mt-1">{selectedLog.resource_name}</p>}
                  {selectedLog.resource_id && <p className={`${monoXs} text-slate-500 mt-1`}>{selectedLog.resource_id}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={`${sectionLabel} mb-2`}>Status</p>
                <span className={`${statusPill} ${getStatusAccent(selectedLog.status).pill}`}>
                  {selectedLog.status.charAt(0).toUpperCase() + selectedLog.status.slice(1)}
                </span>
              </div>
              <div>
                <p className={`${sectionLabel} mb-2`}>Severity</p>
                <span className={`${statusPill} ${getStatusAccent(selectedLog.severity).pill}`}>
                  {selectedLog.severity.charAt(0).toUpperCase() + selectedLog.severity.slice(1)}
                </span>
              </div>
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div>
                <p className={`${sectionLabel} mb-2`}>Metadata</p>
                <div className={infoPanel}>
                  {selectedLog.metadata.ip_address && (
                    <div className="mb-2">
                      <span className="text-sm font-medium text-slate-300">IP Address:</span>
                      <span className={`${monoSm} text-slate-100 ml-2`}>{selectedLog.metadata.ip_address}</span>
                    </div>
                  )}
                  {selectedLog.metadata.user_agent && (
                    <div className="mb-2">
                      <span className="text-sm font-medium text-slate-300">User Agent:</span>
                      <p className={`${monoXs} text-slate-100 mt-1`}>{selectedLog.metadata.user_agent}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className={`${sectionLabel} mb-2`}>Details</p>
              <pre className="text-sm bg-slate-900/60 text-slate-100 p-4 rounded-lg overflow-auto border border-white/10">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
