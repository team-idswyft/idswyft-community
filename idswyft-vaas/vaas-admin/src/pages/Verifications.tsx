import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  MoreHorizontal,
  FileText,
  User,
  Calendar,
  Globe
} from 'lucide-react';
import { apiClient } from '../services/api';
import { showToast } from '../lib/toast';
import type { VerificationSession } from '../types.js';
import Modal from '../components/ui/Modal';
import { sectionLabel, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';

/** Convert ISO alpha-2 country code to flag emoji */
function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    upper.charCodeAt(0) + 0x1F1A5,
    upper.charCodeAt(1) + 0x1F1A5
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  NZ: 'New Zealand', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain',
  NL: 'Netherlands', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina',
  JP: 'Japan', KR: 'South Korea', IN: 'India', SG: 'Singapore',
  PH: 'Philippines', TH: 'Thailand', VN: 'Vietnam',
  CL: 'Chile', CO: 'Colombia', PE: 'Peru',
};

// Type alias for VerificationSession status
type VerificationSessionStatus = VerificationSession['status'];

interface VerificationFilters {
  status: VerificationSessionStatus | 'all';
  dateFrom: string;
  dateTo: string;
  searchTerm: string;
}

/** Map raw verification status to a token-compatible status key */
function mapStatus(status: string): string {
  switch (status) {
    case 'completed': return 'verified';
    case 'verified': return 'verified';
    case 'failed': return 'failed';
    case 'processing': return 'pending';
    case 'document_uploaded': return 'info';
    case 'pending': return 'pending';
    case 'expired': return 'expired';
    case 'manual_review': return 'manual_review';
    default: return 'default';
  }
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
              ) : !verifications || verifications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No verifications found matching your criteria
                  </td>
                </tr>
              ) : (
                verifications.map((verification) => (
                  <tr key={verification.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-8 h-8 text-slate-500 mr-3" />
                        <div>
                          <div className={`${monoSm} text-slate-100`}>
                            {verification.vaas_end_users?.email || 'Anonymous'}
                          </div>
                          <div className={`${monoXs} text-slate-500`}>
                            ID: {verification.id.substring(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(verification.status)}
                        <span className={`ml-2 ${statusPill} ${getStatusAccent(mapStatus(verification.status)).pill}`}>
                          {verification.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">
                      {verification.issuing_country ? (
                        <span title={COUNTRY_NAMES[verification.issuing_country] || verification.issuing_country}>
                          {countryFlag(verification.issuing_country)}{' '}
                          <span className={monoXs}>{verification.issuing_country}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`flex items-center ${monoXs} text-slate-500`}>
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatDate(verification.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedVerification(verification);
                            setShowDetails(true);
                          }}
                          className="text-primary-600 hover:text-primary-900"
                          aria-label="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {(verification.status === 'processing' || verification.status === 'manual_review') && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(verification.id, 'verified')}
                              className="text-green-600 hover:text-green-900"
                              title="Approve"
                              aria-label="Approve verification"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(verification.id, 'failed', 'Rejected during review')}
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
                ))
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

interface VerificationDetailsModalProps {
  verification: VerificationSession | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (id: string, status: VerificationSessionStatus, reason?: string) => void;
}

function VerificationDetailsModal({ verification, isOpen, onClose, onStatusUpdate }: VerificationDetailsModalProps) {
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'analysis' | 'raw'>('overview');

  useEffect(() => {
    if (verification) {
      loadVerificationDetails();
    }
  }, [verification?.id]);

  const loadVerificationDetails = async () => {
    if (!verification) return;
    try {
      setLoading(true);
      const response = await apiClient.get(`/verifications/${verification.id}/documents`);
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Failed to load verification details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: VerificationSessionStatus) => {
    if (!verification) return;
    await onStatusUpdate(verification.id, newStatus, reason);
    onClose();
  };

  // Helper functions for score analysis
  const getScoreColor = (score: number, threshold: number) => {
    if (score >= threshold) return 'text-green-600';
    if (score >= threshold - 0.1) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreStatus = (score: number, threshold: number) => {
    return score >= threshold ? '✅ PASS' : '❌ FAIL';
  };

  if (!verification) return null;

  const results = verification.results || {};
  const mapped = mapStatus(verification.status);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verification Analysis"
      size="2xl"
    >
      {/* Sub-header info */}
      <div className="mb-6">
        <p className={`${monoXs} text-slate-500`}>ID: {verification.id}</p>
        <div className="flex items-center mt-2">
          <span className={`${statusPill} ${getStatusAccent(mapped).pill}`}>
            {verification.status.replace('_', ' ').toUpperCase()}
          </span>
          {verification.confidence_score && (
            <span className="ml-3 text-sm text-slate-400">
              Confidence: {(verification.confidence_score * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/10 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'scores', label: 'Score Analysis', icon: CheckCircle },
            { id: 'analysis', label: 'Detailed Analysis', icon: AlertTriangle },
            { id: 'raw', label: 'Raw Data', icon: FileText }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto max-h-[60vh]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className={infoPanel}>
              <p className={sectionLabel}>Verification Information</p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className={`${monoSm} font-medium`}>{verification.vaas_end_users?.email || 'Anonymous'}</span>
                </div>
                {verification.issuing_country && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Country:</span>
                    <span className={`${monoSm} font-medium`}>
                      {countryFlag(verification.issuing_country)}{' '}
                      {COUNTRY_NAMES[verification.issuing_country] || verification.issuing_country}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Created:</span>
                  <span className={`${monoXs} font-medium`}>{formatDate(verification.created_at)}</span>
                </div>
                {verification.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Completed:</span>
                    <span className={`${monoXs} font-medium`}>{formatDate(verification.completed_at)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Processing Time:</span>
                  <span className={`${monoXs} font-medium`}>
                    {verification.completed_at ?
                      `${Math.round((new Date(verification.completed_at).getTime() - new Date(verification.created_at).getTime()) / 1000)}s` :
                      'In progress'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Score Overview */}
            <div className={infoPanel}>
              <p className={sectionLabel}>Score Summary</p>
              <div className="space-y-3">
                {results.face_match_score !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Face Match:</span>
                    <div className="flex items-center">
                      <span className={`${monoSm} font-semibold ${getScoreColor(results.face_match_score, 0.85)}`}>
                        {(results.face_match_score * 100).toFixed(1)}%
                      </span>
                      <span className="ml-2 text-xs">
                        {getScoreStatus(results.face_match_score, 0.85)}
                      </span>
                    </div>
                  </div>
                )}
                {results.liveness_score !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Liveness:</span>
                    <div className="flex items-center">
                      <span className={`${monoSm} font-semibold ${getScoreColor(results.liveness_score, 0.75)}`}>
                        {(results.liveness_score * 100).toFixed(1)}%
                      </span>
                      <span className="ml-2 text-xs">
                        {getScoreStatus(results.liveness_score, 0.75)}
                      </span>
                    </div>
                  </div>
                )}
                {verification.confidence_score !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Overall:</span>
                    <div className="flex items-center">
                      <span className={`${monoSm} font-semibold ${getScoreColor(verification.confidence_score, 0.8)}`}>
                        {(verification.confidence_score * 100).toFixed(1)}%
                      </span>
                      <span className="ml-2 text-xs">
                        {getScoreStatus(verification.confidence_score, 0.8)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Documents */}
            <div className="lg:col-span-2">
              <p className={`${sectionLabel} mb-4`}>Documents & Evidence</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Loading documents...
                </div>
              ) : documents.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No documents available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {documents.map((doc, index) => (
                    <div key={index} className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-slate-500 mr-2" />
                          <span className="font-medium">{doc.type || 'Document'}</span>
                        </div>
                        <button
                          onClick={() => window.open(doc.url, '_blank')}
                          className="text-primary-600 hover:text-primary-800 text-sm"
                        >
                          View
                        </button>
                      </div>
                      {doc.analysis && (
                        <p className="text-sm text-slate-400">{doc.analysis}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scores' && (
          <div className="space-y-6">
            <div className="bg-cyan-500/12 border border-cyan-500/25 rounded-lg p-4">
              <h4 className="font-semibold text-cyan-200 mb-2">Score Analysis</h4>
              <p className="text-sm text-cyan-300">
                Detailed breakdown of verification scores and thresholds used in the decision process.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Face Match Analysis */}
              {results.face_match_score !== undefined && (
                <div className={`${cardSurface} p-6`}>
                  <p className={`${sectionLabel} mb-4`}>Face Match Analysis</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Score:</span>
                      <span className={`${monoSm} font-semibold text-lg ${getScoreColor(results.face_match_score, 0.85)}`}>
                        {(results.face_match_score * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Threshold:</span>
                      <span className={`${monoSm} font-semibold`}>85.00%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Result:</span>
                      <span className={`font-medium ${results.face_match_score >= 0.85 ? 'text-green-600' : 'text-red-600'}`}>
                        {getScoreStatus(results.face_match_score, 0.85)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${results.face_match_score >= 0.85 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(results.face_match_score * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-slate-500">
                      Gap from threshold: {results.face_match_score >= 0.85 ? '+' : ''}{((results.face_match_score - 0.85) * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Liveness Analysis */}
              {results.liveness_score !== undefined && (
                <div className={`${cardSurface} p-6`}>
                  <p className={`${sectionLabel} mb-4`}>Liveness Detection</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Score:</span>
                      <span className={`${monoSm} font-semibold text-lg ${getScoreColor(results.liveness_score, 0.75)}`}>
                        {(results.liveness_score * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Threshold:</span>
                      <span className={`${monoSm} font-semibold`}>75.00%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Result:</span>
                      <span className={`font-medium ${results.liveness_score >= 0.75 ? 'text-green-600' : 'text-red-600'}`}>
                        {getScoreStatus(results.liveness_score, 0.75)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${results.liveness_score >= 0.75 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(results.liveness_score * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-slate-500">
                      Gap from threshold: {results.liveness_score >= 0.75 ? '+' : ''}{((results.liveness_score - 0.75) * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Overall Confidence */}
              {verification.confidence_score !== undefined && (
                <div className={`${cardSurface} p-6 lg:col-span-2`}>
                  <p className={`${sectionLabel} mb-4`}>Overall Confidence Score</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Score:</span>
                        <span className={`${monoSm} font-semibold text-xl ${getScoreColor(verification.confidence_score, 0.8)}`}>
                          {(verification.confidence_score * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Threshold:</span>
                        <span className={`${monoSm} font-semibold`}>80.00%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Final Result:</span>
                        <span className={`font-bold ${verification.confidence_score >= 0.8 ? 'text-green-600' : 'text-red-600'}`}>
                          {verification.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="w-full bg-slate-700/50 rounded-full h-4 mb-2">
                        <div
                          className={`h-4 rounded-full ${verification.confidence_score >= 0.8 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(verification.confidence_score * 100, 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-slate-500">
                        This verification {verification.confidence_score >= 0.8 ? 'exceeds' : 'falls below'} the minimum confidence threshold by {Math.abs((verification.confidence_score - 0.8) * 100).toFixed(2)} percentage points.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            <div className="bg-amber-500/12 border border-amber-500/25 rounded-lg p-4">
              <h4 className="font-semibold text-amber-200 mb-2">Detailed Analysis</h4>
              <p className="text-sm text-amber-300">
                Comprehensive breakdown of verification checks and any failure reasons.
              </p>
            </div>

            {/* Failure Reasons */}
            {results.failure_reasons && results.failure_reasons.length > 0 && (
              <div className="bg-rose-500/12 border border-rose-500/25 rounded-lg p-4">
                <h5 className="font-semibold text-rose-200 mb-3">Failure Reasons</h5>
                <ul className="space-y-2">
                  {results.failure_reasons.map((reason: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-sm text-rose-300">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Document Analysis */}
            {results.documents && (
              <div className={`${cardSurface} p-6`}>
                <p className={`${sectionLabel} mb-4`}>Document Validation</p>
                <div className="space-y-4">
                  {results.documents.map((doc: any, index: number) => (
                    <div key={index} className="border-l-4 border-cyan-400 pl-4">
                      <h6 className="font-medium text-slate-100">{doc.type || `Document ${index + 1}`}</h6>
                      {doc.ocr_data && (
                        <div className="mt-2 text-sm text-slate-400">
                          <p><strong>Extracted Data:</strong></p>
                          <ul className="ml-4 mt-1 space-y-1">
                            {doc.ocr_data.full_name && <li>Name: {doc.ocr_data.full_name}</li>}
                            {doc.ocr_data.document_number && <li>Document #: {doc.ocr_data.document_number}</li>}
                            {doc.ocr_data.date_of_birth && <li>DOB: {doc.ocr_data.date_of_birth}</li>}
                            {doc.ocr_data.expiry_date && <li>Expires: {doc.ocr_data.expiry_date}</li>}
                          </ul>
                        </div>
                      )}
                      {doc.quality_score && (
                        <p className="mt-2 text-sm">
                          <span className="text-slate-500">Quality Score:</span>
                          <span className={`ml-2 font-medium ${doc.quality_score > 0.7 ? 'text-green-600' : 'text-red-600'}`}>
                            {(doc.quality_score * 100).toFixed(1)}%
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Liveness Analysis Details */}
            {results.liveness_analysis && (
              <div className={`${cardSurface} p-6`}>
                <p className={`${sectionLabel} mb-4`}>Liveness Check Details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(results.liveness_analysis).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-400 capitalize">{key.replace('_', ' ')}:</span>
                      <span className="font-medium">
                        {typeof value === 'boolean' ? (value ? '✅ Yes' : '❌ No') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Face Analysis Details */}
            {results.face_analysis && (
              <div className={`${cardSurface} p-6`}>
                <p className={`${sectionLabel} mb-4`}>Face Analysis Details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(results.face_analysis).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-400 capitalize">{key.replace('_', ' ')}:</span>
                      <span className="font-medium">
                        {typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(2)}%` : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="space-y-4">
            <div className={infoPanel}>
              <p className={sectionLabel}>Raw API Response</p>
              <p className="text-sm text-slate-400">
                Complete verification data for debugging and audit purposes.
              </p>
            </div>
            <div className="bg-slate-900/60 text-green-400 p-4 rounded-lg overflow-auto max-h-96">
              <pre className="text-sm whitespace-pre-wrap">
                {JSON.stringify(verification, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {(verification.status === 'processing' || verification.status === 'manual_review') && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="bg-amber-500/12 border border-amber-500/25 p-4 rounded-lg">
            <h4 className="font-medium text-slate-100 mb-3">Manual Review Actions</h4>
            <div className="space-y-3">
              <div>
                <label className="form-label">Reason (Optional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Enter reason for approval/rejection..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleStatusUpdate('verified')}
                  className="btn btn-primary flex-1"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </button>
                <button
                  onClick={() => handleStatusUpdate('failed')}
                  className="btn btn-danger flex-1"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
