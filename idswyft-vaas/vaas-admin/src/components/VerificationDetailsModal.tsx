import React, { useState } from 'react';
import {
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  User
} from 'lucide-react';
import { apiClient } from '../services/api';
import type { VerificationSession } from '../types.js';
import Modal from './ui/Modal';
import { sectionLabel, monoXs, monoSm, cardSurface, statusPill, infoPanel, getStatusAccent } from '../styles/tokens';

/** Convert ISO alpha-2 country code to flag emoji */
export function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    upper.charCodeAt(0) + 0x1F1A5,
    upper.charCodeAt(1) + 0x1F1A5
  );
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  NZ: 'New Zealand', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain',
  NL: 'Netherlands', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina',
  JP: 'Japan', KR: 'South Korea', IN: 'India', SG: 'Singapore',
  PH: 'Philippines', TH: 'Thailand', VN: 'Vietnam',
  CL: 'Chile', CO: 'Colombia', PE: 'Peru',
};

// Type alias for VerificationSession status
export type VerificationSessionStatus = VerificationSession['status'];

/** Map raw verification status to a token-compatible status key */
export function mapStatus(status: string): string {
  switch (status) {
    case 'completed': return 'verified';
    case 'verified': return 'verified';
    case 'failed': return 'failed';
    case 'processing': return 'pending';
    case 'document_uploaded': return 'info';
    case 'pending': return 'pending';
    case 'expired': return 'expired';
    case 'manual_review': return 'manual_review';
    case 'terminated': return 'failed';
    default: return 'default';
  }
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

export interface VerificationDetailsModalProps {
  verification: VerificationSession | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (id: string, status: VerificationSessionStatus, reason?: string) => void;
}

export function VerificationDetailsModal({ verification, isOpen, onClose, onStatusUpdate }: VerificationDetailsModalProps) {
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'analysis' | 'raw'>('overview');
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);

  const handleStatusUpdate = async (newStatus: VerificationSessionStatus) => {
    if (!verification) return;
    await onStatusUpdate(verification.id, newStatus, reason);
    onClose();
  };

  const handleOverride = async () => {
    if (!verification || !overrideReason.trim()) return;
    try {
      setOverrideLoading(true);
      await apiClient.post(`/verifications/${verification.id}/override`, {
        reason: overrideReason.trim(),
        notes: overrideNotes.trim() || undefined
      });
      setShowOverrideForm(false);
      setOverrideReason('');
      setOverrideNotes('');
      onClose();
    } catch (error: any) {
      console.error('Failed to override verification:', error);
      alert(error.message || 'Failed to override verification');
    } finally {
      setOverrideLoading(false);
    }
  };

  const isTerminalStatus = (status: string) =>
    ['failed', 'verified', 'completed', 'terminated'].includes(status);

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

            {/* Evidence from Results */}
            <div className="lg:col-span-2">
              <p className={`${sectionLabel} mb-4`}>Evidence & Analysis</p>
              {!results.documents?.length && !results.ocr_data && !results.face_analysis && !results.liveness_analysis && !results.cross_validation_results ? (
                <p className="text-slate-500 text-center py-8">No evidence data available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* OCR Data Card */}
                  {results.ocr_data && (
                    <div className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <FileText className="w-5 h-5 text-cyan-400 mr-2" />
                        <span className="font-medium text-slate-100">OCR Extracted Data</span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-400">
                        {results.ocr_data.full_name && <p>Name: <span className="text-slate-200">{results.ocr_data.full_name}</span></p>}
                        {results.ocr_data.document_number && <p>Doc #: <span className="text-slate-200">{results.ocr_data.document_number}</span></p>}
                        {results.ocr_data.date_of_birth && <p>DOB: <span className="text-slate-200">{results.ocr_data.date_of_birth}</span></p>}
                        {results.ocr_data.expiry_date && <p>Expires: <span className="text-slate-200">{results.ocr_data.expiry_date}</span></p>}
                        {results.ocr_data.issuing_country && <p>Country: <span className="text-slate-200">{results.ocr_data.issuing_country}</span></p>}
                      </div>
                    </div>
                  )}

                  {/* Cross-Validation Card */}
                  {results.cross_validation_results && (
                    <div className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                        <span className="font-medium text-slate-100">Cross-Validation</span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-400">
                        {Object.entries(results.cross_validation_results).map(([key, value]) => (
                          <p key={key}>
                            <span className="capitalize">{key.replace(/_/g, ' ')}: </span>
                            <span className={`font-medium ${value === 'match' || value === true ? 'text-green-400' : value === 'mismatch' || value === false ? 'text-red-400' : 'text-slate-200'}`}>
                              {typeof value === 'boolean' ? (value ? 'Match' : 'Mismatch') : String(value)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Face Analysis Card */}
                  {results.face_analysis && (
                    <div className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <User className="w-5 h-5 text-violet-400 mr-2" />
                        <span className="font-medium text-slate-100">Face Analysis</span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-400">
                        {Object.entries(results.face_analysis).map(([key, value]) => (
                          <p key={key}>
                            <span className="capitalize">{key.replace(/_/g, ' ')}: </span>
                            <span className="text-slate-200 font-medium">
                              {typeof value === 'object' && value !== null ? JSON.stringify(value) : typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(1)}%` : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Liveness Card */}
                  {results.liveness_analysis && (
                    <div className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <Eye className="w-5 h-5 text-amber-400 mr-2" />
                        <span className="font-medium text-slate-100">Liveness Detection</span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-400">
                        {Object.entries(results.liveness_analysis).map(([key, value]) => (
                          <p key={key}>
                            <span className="capitalize">{key.replace(/_/g, ' ')}: </span>
                            <span className="text-slate-200 font-medium">
                              {typeof value === 'object' && value !== null ? JSON.stringify(value) : typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(1)}%` : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Document list from results (if synced from main API) */}
                  {results.documents?.map((doc: any, index: number) => (
                    <div key={index} className="border border-white/10 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <FileText className="w-5 h-5 text-slate-400 mr-2" />
                        <span className="font-medium text-slate-100">{doc.type || `Document ${index + 1}`}</span>
                      </div>
                      {doc.ocr_data && (
                        <div className="space-y-1 text-sm text-slate-400">
                          {doc.ocr_data.full_name && <p>Name: <span className="text-slate-200">{doc.ocr_data.full_name}</span></p>}
                          {doc.ocr_data.document_number && <p>Doc #: <span className="text-slate-200">{doc.ocr_data.document_number}</span></p>}
                          {doc.ocr_data.date_of_birth && <p>DOB: <span className="text-slate-200">{doc.ocr_data.date_of_birth}</span></p>}
                        </div>
                      )}
                      {doc.quality_score && (
                        <p className="mt-2 text-sm">
                          Quality: <span className={`font-medium ${doc.quality_score > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(doc.quality_score * 100).toFixed(1)}%</span>
                        </p>
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

      {/* Override Button — terminal states only */}
      {isTerminalStatus(verification.status) && (
        <div className="mt-6 pt-4 border-t border-white/10">
          {!showOverrideForm ? (
            <button
              onClick={() => setShowOverrideForm(true)}
              className="flex items-center px-4 py-2 text-sm font-medium text-amber-300 bg-amber-500/12 border border-amber-500/25 rounded-lg hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Override to Manual Review
            </button>
          ) : (
            <div className="bg-amber-500/12 border border-amber-500/25 p-4 rounded-lg">
              <h4 className="font-medium text-amber-200 mb-1">Override Verification</h4>
              <p className="text-xs text-amber-300/70 mb-3">
                This will move the verification from <strong>{verification.status}</strong> back to <strong>manual review</strong>. This action is audit-logged.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Reason <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Why is this verification being overridden?"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Notes (Optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Additional context..."
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleOverride}
                    disabled={!overrideReason.trim() || overrideLoading}
                    className="flex items-center px-4 py-2 text-sm font-medium text-amber-200 bg-amber-600/30 border border-amber-500/40 rounded-lg hover:bg-amber-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {overrideLoading ? (
                      <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mr-2" />
                    )}
                    Confirm Override
                  </button>
                  <button
                    onClick={() => { setShowOverrideForm(false); setOverrideReason(''); setOverrideNotes(''); }}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
