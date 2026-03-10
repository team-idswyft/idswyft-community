import React, { useState, useEffect } from 'react';
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
  Calendar
} from 'lucide-react';
import { apiClient } from '../services/api';
import type { VerificationSession } from '../types.js';

// Type alias for VerificationSession status
type VerificationSessionStatus = VerificationSession['status'];

interface VerificationFilters {
  status: VerificationSessionStatus | 'all';
  dateFrom: string;
  dateTo: string;
  searchTerm: string;
}

export default function Verifications() {
  const [verifications, setVerifications] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadVerifications();
  }, [currentPage, filters]);

  const loadVerifications = async () => {
    try {
      setLoading(true);
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
    } catch (error) {
      console.error('Failed to load verifications:', error);
      // Set safe defaults on error
      setVerifications([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (verificationId: string, newStatus: VerificationSessionStatus, reason?: string) => {
    try {
      if (newStatus === 'completed') {
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
    } catch (error) {
      console.error('Failed to update verification status:', error);
    }
  };

  const getStatusIcon = (status: VerificationSessionStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'document_uploaded':
        return <AlertTriangle className="w-4 h-4 text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: VerificationSessionStatus) => {
    const baseClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'completed':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'failed':
        return `${baseClass} bg-red-100 text-red-800`;
      case 'processing':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'document_uploaded':
        return `${baseClass} bg-blue-100 text-blue-800`;
      case 'pending':
        return `${baseClass} bg-blue-100 text-blue-800`;
      case 'expired':
        return `${baseClass} bg-gray-100 text-gray-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
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
    } catch (error) {
      console.error('Failed to export verifications:', error);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Verifications</h1>
          <p className="text-gray-600 mt-1">Review and manage verification requests</p>
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

      {/* Filters */}
      <div className="content-card-glass p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
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
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
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
      <div className="content-card-glass">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white/50 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Verification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white/30 backdrop-blur-sm divide-y divide-white/20">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading verifications...
                    </div>
                  </td>
                </tr>
              ) : !verifications || verifications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No verifications found matching your criteria
                  </td>
                </tr>
              ) : (
                verifications.map((verification) => (
                  <tr key={verification.id} className="table-row-glass">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-8 h-8 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {verification.vaas_end_users?.email || 'Anonymous'}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {verification.id.substring(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(verification.status)}
                        <span className={`ml-2 ${getStatusBadge(verification.status)}`}>
                          {verification.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Document Verification
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
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
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {verification.status === 'processing' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(verification.id, 'completed')}
                              className="text-green-600 hover:text-green-900"
                              title="Complete"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(verification.id, 'failed', 'Rejected during review')}
                              className="text-red-600 hover:text-red-900"
                              title="Reject"
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
          <div className="bg-white/50 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-t border-white/20 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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
      {showDetails && selectedVerification && (
        <VerificationDetailsModal
          verification={selectedVerification}
          onClose={() => {
            setShowDetails(false);
            setSelectedVerification(null);
          }}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
}

interface VerificationDetailsModalProps {
  verification: VerificationSession;
  onClose: () => void;
  onStatusUpdate: (id: string, status: VerificationSessionStatus, reason?: string) => void;
}

function VerificationDetailsModal({ verification, onClose, onStatusUpdate }: VerificationDetailsModalProps) {
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'analysis' | 'raw'>('overview');

  useEffect(() => {
    loadVerificationDetails();
  }, [verification.id]);

  const loadVerificationDetails = async () => {
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

  const results = verification.results || {};
  
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white min-h-[80vh]">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Verification Analysis</h3>
            <p className="text-sm text-gray-500 mt-1">ID: {verification.id}</p>
            <div className="flex items-center mt-2">
              <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                verification.status === 'verified' ? 'bg-green-100 text-green-800' :
                verification.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {verification.status.replace('_', ' ').toUpperCase()}
              </span>
              {verification.confidence_score && (
                <span className="ml-3 text-sm text-gray-600">
                  Confidence: {(verification.confidence_score * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
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
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-4">Verification Information</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customer:</span>
                    <span className="font-medium">{verification.vaas_end_users?.email || 'Anonymous'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created:</span>
                    <span className="font-medium">{formatDate(verification.created_at)}</span>
                  </div>
                  {verification.completed_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Completed:</span>
                      <span className="font-medium">{formatDate(verification.completed_at)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Processing Time:</span>
                    <span className="font-medium">
                      {verification.completed_at ? 
                        `${Math.round((new Date(verification.completed_at).getTime() - new Date(verification.created_at).getTime()) / 1000)}s` :
                        'In progress'
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Score Overview */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-4">Score Summary</h4>
                <div className="space-y-3">
                  {results.face_match_score !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Face Match:</span>
                      <div className="flex items-center">
                        <span className={`font-medium ${getScoreColor(results.face_match_score, 0.85)}`}>
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
                      <span className="text-sm text-gray-600">Liveness:</span>
                      <div className="flex items-center">
                        <span className={`font-medium ${getScoreColor(results.liveness_score, 0.75)}`}>
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
                      <span className="text-sm text-gray-600">Overall:</span>
                      <div className="flex items-center">
                        <span className={`font-medium ${getScoreColor(verification.confidence_score, 0.8)}`}>
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
                <h4 className="font-semibold text-gray-900 mb-4">Documents & Evidence</h4>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Loading documents...
                  </div>
                ) : documents.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No documents available</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documents.map((doc, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <FileText className="w-5 h-5 text-gray-400 mr-2" />
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
                          <p className="text-sm text-gray-600">{doc.analysis}</p>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Score Analysis</h4>
                <p className="text-sm text-blue-800">
                  Detailed breakdown of verification scores and thresholds used in the decision process.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Face Match Analysis */}
                {results.face_match_score !== undefined && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h5 className="font-semibold text-gray-900 mb-4">Face Match Analysis</h5>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Score:</span>
                        <span className={`font-bold text-lg ${getScoreColor(results.face_match_score, 0.85)}`}>
                          {(results.face_match_score * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Threshold:</span>
                        <span className="font-medium">85.00%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Result:</span>
                        <span className={`font-medium ${results.face_match_score >= 0.85 ? 'text-green-600' : 'text-red-600'}`}>
                          {getScoreStatus(results.face_match_score, 0.85)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${results.face_match_score >= 0.85 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(results.face_match_score * 100, 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-500">
                        Gap from threshold: {results.face_match_score >= 0.85 ? '+' : ''}{((results.face_match_score - 0.85) * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Liveness Analysis */}
                {results.liveness_score !== undefined && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h5 className="font-semibold text-gray-900 mb-4">Liveness Detection</h5>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Score:</span>
                        <span className={`font-bold text-lg ${getScoreColor(results.liveness_score, 0.75)}`}>
                          {(results.liveness_score * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Threshold:</span>
                        <span className="font-medium">75.00%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Result:</span>
                        <span className={`font-medium ${results.liveness_score >= 0.75 ? 'text-green-600' : 'text-red-600'}`}>
                          {getScoreStatus(results.liveness_score, 0.75)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${results.liveness_score >= 0.75 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(results.liveness_score * 100, 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-500">
                        Gap from threshold: {results.liveness_score >= 0.75 ? '+' : ''}{((results.liveness_score - 0.75) * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Overall Confidence */}
                {verification.confidence_score !== undefined && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
                    <h5 className="font-semibold text-gray-900 mb-4">Overall Confidence Score</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Score:</span>
                          <span className={`font-bold text-xl ${getScoreColor(verification.confidence_score, 0.8)}`}>
                            {(verification.confidence_score * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Threshold:</span>
                          <span className="font-medium">80.00%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Final Result:</span>
                          <span className={`font-bold ${verification.confidence_score >= 0.8 ? 'text-green-600' : 'text-red-600'}`}>
                            {verification.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                          <div
                            className={`h-4 rounded-full ${verification.confidence_score >= 0.8 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(verification.confidence_score * 100, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-gray-500">
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
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-900 mb-2">Detailed Analysis</h4>
                <p className="text-sm text-yellow-800">
                  Comprehensive breakdown of verification checks and any failure reasons.
                </p>
              </div>

              {/* Failure Reasons */}
              {results.failure_reasons && results.failure_reasons.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h5 className="font-semibold text-red-900 mb-3">Failure Reasons</h5>
                  <ul className="space-y-2">
                    {results.failure_reasons.map((reason: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-red-800">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Document Analysis */}
              {results.documents && (
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h5 className="font-semibold text-gray-900 mb-4">Document Validation</h5>
                  <div className="space-y-4">
                    {results.documents.map((doc: any, index: number) => (
                      <div key={index} className="border-l-4 border-blue-500 pl-4">
                        <h6 className="font-medium text-gray-900">{doc.type || `Document ${index + 1}`}</h6>
                        {doc.ocr_data && (
                          <div className="mt-2 text-sm text-gray-600">
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
                            <span className="text-gray-500">Quality Score:</span>
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
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h5 className="font-semibold text-gray-900 mb-4">Liveness Check Details</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(results.liveness_analysis).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{key.replace('_', ' ')}:</span>
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
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h5 className="font-semibold text-gray-900 mb-4">Face Analysis Details</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(results.face_analysis).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{key.replace('_', ' ')}:</span>
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
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Raw API Response</h4>
                <p className="text-sm text-gray-600">
                  Complete verification data for debugging and audit purposes.
                </p>
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96">
                <pre className="text-sm whitespace-pre-wrap">
                  {JSON.stringify(verification, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(verification.status === 'processing' || verification.status === 'manual_review') && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Manual Review Actions</h4>
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
      </div>
    </div>
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
