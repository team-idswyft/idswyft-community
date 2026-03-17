import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { apiClient } from '../services/api';
import { showToast } from '../lib/toast';
import type { VerificationSession } from '../types.js';
import { VerificationDetailsModal, mapStatus, countryFlag, COUNTRY_NAMES } from '../components/VerificationDetailsModal';
import type { VerificationSessionStatus } from '../components/VerificationDetailsModal';
import { sectionLabel, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, getStatusAccent } from '../styles/tokens';

interface VerificationFilters {
  status: VerificationSessionStatus | 'all';
  dateFrom: string;
  dateTo: string;
  searchTerm: string;
}

export default function Verifications() {
  const [verifications, setVerifications] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VerificationFilters>({
    status: 'all',
    dateFrom: '',
    dateTo: '',
    searchTerm: ''
  });
  const [selectedVerification, setSelectedVerification] = useState<VerificationSession | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const loadingRef = useRef(false);

  // Accordion state — tracks which user groups are expanded
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Group verifications by end_user_id for de-duplication
  const userGroups = useMemo(() => {
    if (!verifications || verifications.length === 0) return [];

    const map = new Map<string, VerificationSession[]>();
    for (const v of verifications) {
      const key = v.end_user_id || v.id;
      const group = map.get(key);
      if (group) group.push(v);
      else map.set(key, [v]);
    }

    const groups: { endUserId: string; verifications: VerificationSession[]; latest: VerificationSession }[] = [];
    for (const [endUserId, vList] of map) {
      vList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      groups.push({ endUserId, verifications: vList, latest: vList[0] });
    }

    // Sort groups by latest verification date (most recent first)
    groups.sort((a, b) =>
      new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime()
    );
    return groups;
  }, [verifications]);

  useEffect(() => {
    loadVerifications();
  }, [currentPage, filters]);

  // Polling: auto-refresh every 15s with visibility awareness
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden' || loadingRef.current) return;
      loadVerifications(true);
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !loadingRef.current) {
        loadVerifications(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentPage, filters]);

  const loadVerifications = async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
        per_page: 20
      };

      if (filters.status !== 'all') {
        params.status = filters.status;
      }
      if (filters.dateFrom) {
        params.start_date = filters.dateFrom;
      }
      if (filters.dateTo) {
        params.end_date = filters.dateTo;
      }
      if (filters.searchTerm) {
        params.search = filters.searchTerm;
      }

      const result = await apiClient.listVerifications(params);
      setVerifications(result.verifications || []);

      // Handle pagination meta - safely extract total pages
      const totalPages = result.meta?.pagination?.total_pages ||
                        result.meta?.pages ||
                        Math.ceil((result.meta?.total || 0) / 20) || 1;
      setTotalPages(totalPages);
      setTotalRecords(result.meta?.total || 0);
    } catch (err: unknown) {
      if (!silent) {
        console.error('Failed to load verifications:', err);
        setError(err instanceof Error ? err.message : 'Failed to load verifications');
        setVerifications([]);
        setTotalPages(1);
        setTotalRecords(0);
      }
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  };

  const handleStatusUpdate = async (verificationId: string, newStatus: VerificationSessionStatus, reason?: string) => {
    try {
      if (newStatus === 'completed' || newStatus === 'verified') {
        await apiClient.approveVerification(verificationId, reason);
      } else if (newStatus === 'failed') {
        await apiClient.rejectVerification(verificationId, reason || 'Rejected', reason);
      } else {
        // For other status updates, use generic patch
        await apiClient.patch(`/verifications/${verificationId}/status`, {
          status: newStatus,
          reason
        });
      }

      // Update the verification in the list safely
      setVerifications(prev =>
        prev ? prev.map(v =>
          v.id === verificationId
            ? { ...v, status: newStatus, updated_at: new Date().toISOString() }
            : v
        ) : []
      );

      if (selectedVerification?.id === verificationId) {
        setSelectedVerification(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err: unknown) {
      showToast.error(`Status update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getStatusIcon = (status: VerificationSessionStatus) => {
    switch (status) {
      case 'completed':
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'manual_review':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'processing':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'document_uploaded':
        return <AlertTriangle className="w-4 h-4 text-cyan-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportVerifications = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);
      if (filters.searchTerm) params.append('search', filters.searchTerm);

      const response = await apiClient.get(`/verifications/export?${params}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `verifications-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast.error('Failed to export verifications');
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <p className={sectionLabel}>Verifications</p>
          <p className="text-slate-400 mt-1 text-sm">Review and manage verification requests</p>
        </div>

        <button
          onClick={exportVerifications}
          className="btn btn-secondary"
          disabled={loading}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => loadVerifications()} className="ml-4 text-rose-200 hover:text-white underline text-xs font-mono">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className={`${cardSurface} p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="text"
                className="form-input pl-10"
                placeholder="Search by email or reference..."
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Status</label>
            <select
              className="form-input"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as VerificationSessionStatus | 'all' }))}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="document_uploaded">Document Uploaded</option>
              <option value="processing">Processing</option>
              <option value="verified">Verified</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="manual_review">Manual Review</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="form-label">From Date</label>
            <input
              type="date"
              className="form-input"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>

          <div>
            <label className="form-label">To Date</label>
            <input
              type="date"
              className="form-input"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => {
              setFilters({
                status: 'all',
                dateFrom: '',
                dateTo: '',
                searchTerm: ''
              });
              setCurrentPage(1);
            }}
            className="btn btn-secondary mr-3"
          >
            Clear Filters
          </button>
          <button
            onClick={() => {
              setCurrentPage(1);
              loadVerifications();
            }}
            className="btn btn-primary"
          >
            <Filter className="w-4 h-4 mr-2" />
            Apply Filters
          </button>
        </div>
      </div>

      {/* Verification List */}
      <div className={cardSurface}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-slate-900/60 backdrop-blur-sm">
              <tr>
                <th className={tableHeaderClass}>
                  Verification
                </th>
                <th className={tableHeaderClass}>
                  Status
                </th>
                <th className={tableHeaderClass}>
                  Country
                </th>
                <th className={tableHeaderClass}>
                  Created
                </th>
                <th className={tableHeaderClass}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/55 backdrop-blur-sm divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading verifications...
                    </div>
                  </td>
                </tr>
              ) : userGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No verifications found matching your criteria
                  </td>
                </tr>
              ) : (
                userGroups.map((group) => {
                  const hasMultiple = group.verifications.length > 1;
                  const isExpanded = expandedUsers.has(group.endUserId);
                  const latest = group.latest;

                  return (
                    <React.Fragment key={group.endUserId}>
                      {/* Primary row (latest verification per user) */}
                      <tr
                        className={`hover:bg-slate-800/40 transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
                        onClick={hasMultiple ? () => toggleExpand(group.endUserId) : undefined}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="w-8 h-8 text-slate-500 mr-3" />
                            <div>
                              <div className={`${monoSm} text-slate-100 flex items-center gap-2`}>
                                {latest.vaas_end_users?.email || 'Anonymous'}
                                {hasMultiple && (
                                  <span className="inline-flex items-center rounded-full border border-slate-500/35 bg-slate-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-300">
                                    &times;{group.verifications.length}
                                  </span>
                                )}
                              </div>
                              <div className={`${monoXs} text-slate-500 flex items-center gap-1`}>
                                ID: {latest.id.substring(0, 8)}...
                                {hasMultiple && (
                                  <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getStatusIcon(latest.status)}
                            <span className={`ml-2 ${statusPill} ${getStatusAccent(mapStatus(latest.status)).pill}`}>
                              {latest.status.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">
                          {latest.issuing_country ? (
                            <span title={COUNTRY_NAMES[latest.issuing_country] || latest.issuing_country}>
                              {countryFlag(latest.issuing_country)}{' '}
                              <span className={monoXs}>{latest.issuing_country}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">--</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`flex items-center ${monoXs} text-slate-500`}>
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatDate(latest.created_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setSelectedVerification(latest);
                                setShowDetails(true);
                              }}
                              className="text-primary-600 hover:text-primary-900"
                              aria-label="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {(latest.status === 'processing' || latest.status === 'manual_review') && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(latest.id, 'verified')}
                                  className="text-green-600 hover:text-green-900"
                                  title="Approve"
                                  aria-label="Approve verification"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(latest.id, 'failed', 'Rejected during review')}
                                  className="text-red-600 hover:text-red-900"
                                  title="Reject"
                                  aria-label="Reject verification"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Accordion sub-rows for older attempts */}
                      {hasMultiple && isExpanded && group.verifications.slice(1).map((v) => (
                        <tr key={v.id} className="bg-slate-900/40 hover:bg-slate-800/30 transition-colors">
                          <td className="pl-16 pr-6 py-3 whitespace-nowrap">
                            <div className={`${monoXs} text-slate-500`}>
                              ID: {v.id.substring(0, 8)}...
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              {getStatusIcon(v.status)}
                              <span className={`ml-2 ${statusPill} ${getStatusAccent(mapStatus(v.status)).pill}`}>
                                {v.status.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-100">
                            {v.issuing_country ? (
                              <span title={COUNTRY_NAMES[v.issuing_country] || v.issuing_country}>
                                {countryFlag(v.issuing_country)}{' '}
                                <span className={monoXs}>{v.issuing_country}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500">--</span>
                            )}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className={`flex items-center ${monoXs} text-slate-500`}>
                              <Calendar className="w-4 h-4 mr-1" />
                              {formatDate(v.created_at)}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedVerification(v);
                                  setShowDetails(true);
                                }}
                                className="text-primary-600 hover:text-primary-900"
                                aria-label="View details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {(v.status === 'processing' || v.status === 'manual_review') && (
                                <>
                                  <button
                                    onClick={() => handleStatusUpdate(v.id, 'verified')}
                                    className="text-green-600 hover:text-green-900"
                                    title="Approve"
                                    aria-label="Approve verification"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleStatusUpdate(v.id, 'failed', 'Rejected during review')}
                                    className="text-red-600 hover:text-red-900"
                                    title="Reject"
                                    aria-label="Reject verification"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-slate-900/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-t border-white/10 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-white/10 rounded-lg text-sm font-mono text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-white/10 rounded-lg text-sm font-mono text-slate-300 bg-slate-900/70 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className={`${monoXs} text-slate-500`}>
                  {totalRecords > 0 && <><span className="font-medium">{totalRecords}</span> records &middot; </>}
                  Page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md -space-x-px">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-white/10 bg-slate-900/70 text-sm font-mono text-slate-500 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-white/10 bg-slate-900/70 text-sm font-mono text-slate-500 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
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

