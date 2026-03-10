import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/api';
import type { 
  AuditLogEntry, 
  AuditLogFilters, 
  AuditLogResponse, 
  AuditLogStats,
  AuditAction,
  AuditResourceType
} from '../types';
import { 
  Shield, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  AlertTriangle, 
  User, 
  Key, 
  Server,
  Activity,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

const ITEMS_PER_PAGE = 20;

// Severity badge colors
const severityColors = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800'
};

// Status colors
const statusColors = {
  success: 'bg-green-100 text-green-800',
  failure: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800'
};

// Actor type icons
const actorIcons = {
  admin: User,
  api_key: Key,
  system: Server
};

// Action groupings for filtering
const actionGroups = {
  'Authentication': [
    'login', 'logout', 'login_failed', 'password_reset', 'password_changed',
    'session_expired', 'account_locked', 'mfa_enabled', 'mfa_disabled'
  ],
  'User Management': [
    'user_created', 'user_updated', 'user_deleted', 'user_suspended',
    'user_activated', 'user_permissions_changed', 'user_role_changed'
  ],
  'API Key Management': [
    'api_key_created', 'api_key_updated', 'api_key_deleted', 'api_key_rotated',
    'api_key_permissions_changed', 'api_key_suspended', 'api_key_usage_exceeded'
  ],
  'Verifications': [
    'verification_created', 'verification_updated', 'verification_deleted',
    'verification_approved', 'verification_rejected', 'verification_flagged',
    'manual_review_assigned', 'manual_review_completed'
  ],
  'Settings': [
    'organization_updated', 'settings_changed', 'webhook_created',
    'webhook_updated', 'webhook_deleted', 'webhook_test_sent'
  ],
  'Billing': [
    'plan_upgraded', 'plan_downgraded', 'payment_method_added',
    'payment_method_removed', 'invoice_generated', 'payment_succeeded',
    'payment_failed', 'subscription_cancelled'
  ],
  'Security': [
    'suspicious_activity_detected', 'rate_limit_exceeded', 'unauthorized_access_attempt',
    'data_export_requested', 'data_export_completed', 'data_deletion_requested',
    'data_deletion_completed', 'compliance_report_generated'
  ]
};

export default function AuditLogs() {
  const { organization } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  
  // Selected log for details modal
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // Load audit logs
  const loadAuditLogs = useCallback(async (page = 1, newFilters = filters) => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const params = {
        ...newFilters,
        page,
        per_page: ITEMS_PER_PAGE,
        search: search.trim() || undefined
      };

      const response = await apiClient.getAuditLogs(organization.id, params);
      setLogs(response.entries);
      setTotalPages(response.total_pages);
      setTotal(response.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, search]);

  // Load audit log statistics
  const loadStats = useCallback(async () => {
    if (!organization?.id) return;
    
    setStatsLoading(true);
    try {
      const statsData = await apiClient.getAuditLogStats(organization.id);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load audit log stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [organization?.id]);

  // Initial load
  useEffect(() => {
    loadAuditLogs();
    loadStats();
  }, [loadAuditLogs, loadStats]);

  // Handle filter changes
  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    const newFilters: AuditLogFilters = { ...filters };
    if (value) {
      // Type-safe assignment based on key type
      switch (key) {
        case 'actor_type':
          newFilters.actor_type = value as 'admin' | 'api_key' | 'system';
          break;
        case 'resource_type':
          newFilters.resource_type = value as AuditResourceType;
          break;
        case 'severity':
          newFilters.severity = value as 'low' | 'medium' | 'high' | 'critical';
          break;
        case 'status':
          newFilters.status = value as 'success' | 'failure' | 'warning';
          break;
        default:
          (newFilters as any)[key] = value;
      }
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    loadAuditLogs(1, newFilters);
  };

  // Handle search
  const handleSearch = () => {
    loadAuditLogs(1);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAuditLogs(currentPage), loadStats()]);
    setRefreshing(false);
  };

  // Handle export
  const handleExport = async (format: 'csv' | 'json' = 'csv') => {
    if (!organization?.id) return;
    
    setExporting(true);
    try {
      const blob = await apiClient.exportAuditLogs(organization.id, {
        ...filters,
        search: search.trim() || undefined,
        format
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export audit logs:', error);
    } finally {
      setExporting(false);
    }
  };

  // Format action name for display
  const formatAction = (action: AuditAction) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Get relative time
  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  // Show log details modal
  const showLogDetails = (log: AuditLogEntry) => {
    setSelectedLog(log);
    setShowLogModal(true);
  };

  if (loading && logs.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="stat-card-glass p-6">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
          <div className="content-card-glass">
            <div className="p-6 border-b">
              <div className="h-6 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="p-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded mb-4"></div>
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
        <div className="flex items-center">
          <Shield className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-gray-600 mt-1">Organization-wide security and compliance monitoring</p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <div className="relative">
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !statsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="stat-card-glass p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Today</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_events_today.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          
          <div className="stat-card-glass p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">This Week</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_events_week.toLocaleString()}</p>
              </div>
              <Calendar className="h-8 w-8 text-green-600" />
            </div>
          </div>
          
          <div className="stat-card-glass p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Security Alerts</p>
                <p className="text-2xl font-bold text-red-600">{stats.security_alerts_count.toLocaleString()}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          
          <div className="stat-card-glass p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Failed Logins</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.failed_login_attempts.toLocaleString()}</p>
              </div>
              <XCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="content-card-glass mb-6">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search logs by actor, action, resource, IP address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Search
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 border rounded-md flex items-center ${
                  showFilters 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="p-6 bg-gray-50 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Actor Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actor Type</label>
                <select
                  value={filters.actor_type || ''}
                  onChange={(e) => handleFilterChange('actor_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="admin">Admin</option>
                  <option value="api_key">API Key</option>
                  <option value="system">System</option>
                </select>
              </div>

              {/* Resource Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resource Type</label>
                <select
                  value={filters.resource_type || ''}
                  onChange={(e) => handleFilterChange('resource_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              {/* Severity Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={filters.severity || ''}
                  onChange={(e) => handleFilterChange('severity', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Severities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="warning">Warning</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="datetime-local"
                  value={filters.date_from || ''}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="datetime-local"
                  value={filters.date_to || ''}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilters({});
                    setSearch('');
                    loadAuditLogs(1, {});
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audit Logs Table */}
      <div className="content-card-glass">
        <div className="px-6 py-4 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              Audit Logs ({total.toLocaleString()} total)
            </h2>
            {loading && (
              <div className="flex items-center text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white/30 backdrop-blur-sm divide-y divide-white/20">
              {logs.map((log) => {
                const ActorIcon = actorIcons[log.actor_type];
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{getRelativeTime(log.timestamp)}</div>
                        <div className="text-gray-500 text-xs">{formatTimestamp(log.timestamp)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        <ActorIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="font-medium text-gray-900">{log.actor_name}</div>
                          {log.actor_email && (
                            <div className="text-gray-500 text-xs">{log.actor_email}</div>
                          )}
                          <div className="text-gray-400 text-xs capitalize">{log.actor_type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">{formatAction(log.action)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div>
                        <div className="font-medium text-gray-900 capitalize">{log.resource_type}</div>
                        {log.resource_name && (
                          <div className="text-gray-500 text-xs truncate max-w-32">{log.resource_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[log.status]}`}>
                        {log.status === 'success' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {log.status === 'failure' && <XCircle className="h-3 w-3 mr-1" />}
                        {log.status === 'warning' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${severityColors[log.severity]}`}>
                        {log.severity.charAt(0).toUpperCase() + log.severity.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => showLogDetails(log)}
                        className="text-blue-600 hover:text-blue-900 flex items-center"
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
            <Shield className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No audit logs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {Object.keys(filters).length > 0 || search
                ? 'Try adjusting your search criteria or filters.'
                : 'Audit logs will appear here as activities occur in your organization.'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, total)} of{' '}
                {total.toLocaleString()} results
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => loadAuditLogs(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
                        className={`px-3 py-1 text-sm rounded ${
                          page === currentPage
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
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
                  className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {showLogModal && selectedLog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="px-6 py-4 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event ID</label>
                  <p className="text-sm font-mono bg-gray-100 p-2 rounded">{selectedLog.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timestamp</label>
                  <p className="text-sm text-gray-900">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
              </div>

              {/* Actor Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Actor</label>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center mb-2">
                    {React.createElement(actorIcons[selectedLog.actor_type], { className: "h-5 w-5 text-gray-600 mr-2" })}
                    <span className="font-medium">{selectedLog.actor_name}</span>
                    <span className={`ml-2 inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      selectedLog.actor_type === 'admin' ? 'bg-blue-100 text-blue-800' :
                      selectedLog.actor_type === 'api_key' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedLog.actor_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {selectedLog.actor_email && (
                    <p className="text-sm text-gray-600">{selectedLog.actor_email}</p>
                  )}
                </div>
              </div>

              {/* Action & Resource */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                  <p className="text-sm bg-blue-50 text-blue-800 p-3 rounded-lg font-medium">
                    {formatAction(selectedLog.action)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Resource</label>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm font-medium capitalize">{selectedLog.resource_type}</p>
                    {selectedLog.resource_name && (
                      <p className="text-sm text-gray-600 mt-1">{selectedLog.resource_name}</p>
                    )}
                    {selectedLog.resource_id && (
                      <p className="text-xs text-gray-500 font-mono mt-1">{selectedLog.resource_id}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Severity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedLog.status]}`}>
                    {selectedLog.status === 'success' && <CheckCircle className="h-4 w-4 mr-1" />}
                    {selectedLog.status === 'failure' && <XCircle className="h-4 w-4 mr-1" />}
                    {selectedLog.status === 'warning' && <AlertCircle className="h-4 w-4 mr-1" />}
                    {selectedLog.status.charAt(0).toUpperCase() + selectedLog.status.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${severityColors[selectedLog.severity]}`}>
                    {selectedLog.severity.charAt(0).toUpperCase() + selectedLog.severity.slice(1)}
                  </span>
                </div>
              </div>

              {/* Metadata */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Metadata</label>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {selectedLog.metadata.ip_address && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700">IP Address:</span>
                        <span className="text-sm text-gray-900 ml-2">{selectedLog.metadata.ip_address}</span>
                      </div>
                    )}
                    {selectedLog.metadata.user_agent && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700">User Agent:</span>
                        <p className="text-sm text-gray-900 mt-1 font-mono text-xs">{selectedLog.metadata.user_agent}</p>
                      </div>
                    )}
                    {selectedLog.metadata.location && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700">Location:</span>
                        <span className="text-sm text-gray-900 ml-2">{selectedLog.metadata.location}</span>
                      </div>
                    )}
                    {selectedLog.metadata.api_key_name && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700">API Key:</span>
                        <span className="text-sm text-gray-900 ml-2">{selectedLog.metadata.api_key_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
                <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setShowLogModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
