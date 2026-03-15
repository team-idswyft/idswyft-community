import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Shield,
  Calendar,
  FileText,
  User
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../contexts/OrganizationContext';
import BrandedHeader from './BrandedHeader';
import LanguageSelector from './LanguageSelector';
import customerPortalAPI from '../services/api';
import { isRealtimeAvailable, subscribeToVerification } from '../services/realtimeSubscription';

interface VerificationStatusData {
  id: string;
  status: 'pending' | 'processing' | 'verified' | 'failed' | 'expired' | 'manual_review';
  organization_name: string;
  organization_branding?: {
    company_name: string;
    logo_url?: string;
    primary_color?: string;
  };
  created_at: string;
  completed_at?: string;
  expires_at?: string;
  failure_reason?: string;
  confidence_score?: number;
  isAuthentic?: boolean;
  authenticityScore?: number;
  tamperFlags?: string[];
  documents_uploaded: number;
  estimated_completion?: string;
}

interface VerificationStatusProps {
  sessionToken: string;
}

const t = {
  bg: 'bg-[#080c14]',
  text: 'text-[#dde2ec]',
  textSec: 'text-[#8896aa]',
  border: 'border-[rgba(255,255,255,0.07)]',
};

const VerificationStatus: React.FC<VerificationStatusProps> = ({ sessionToken }) => {
  const [status, setStatus] = useState<VerificationStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { t: tr } = useTranslation();

  const { setBranding, setOrganizationName } = useOrganization();

  useEffect(() => {
    loadStatus();

    // Try Supabase Realtime first, fall back to polling
    if (isRealtimeAvailable()) {
      const sub = subscribeToVerification(
        sessionToken,
        () => {
          // Realtime push received — refresh data
          loadStatus(true);
        },
        () => {
          // Realtime failed — start polling fallback (below)
        },
      );

      return () => sub.unsubscribe();
    }

    // Polling fallback (also used when Realtime unavailable)
    const interval = setInterval(() => {
      if (status?.status === 'pending' || status?.status === 'processing' || status?.status === 'manual_review') {
        loadStatus(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionToken, status?.status]);

  const loadStatus = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setRefreshing(silent);

      const statusData = await customerPortalAPI.getVerificationStatus(sessionToken);
      setStatus(statusData as any);

      if ((statusData as any).organization_branding) {
        setBranding((statusData as any).organization_branding);
      }
      if ((statusData as any).organization_name) {
        setOrganizationName((statusData as any).organization_name);
      }

      setError(null);
    } catch (error: any) {
      if (error.response?.status === 404) {
        setError('Verification session not found. Please check your link.');
      } else {
        setError('Failed to load verification status. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'verified': return <CheckCircle className="w-8 h-8 text-green-400" />;
      case 'failed': return <XCircle className="w-8 h-8 text-red-400" />;
      case 'expired': return <XCircle className="w-8 h-8 text-gray-500" />;
      case 'manual_review': return <AlertTriangle className="w-8 h-8 text-yellow-400" />;
      case 'processing': return <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />;
      default: return <Clock className="w-8 h-8 text-gray-500" />;
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'verified': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'failed': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'expired': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      case 'manual_review': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'processing': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getStatusMessage = (s: string) => {
    switch (s) {
      case 'verified': return tr('status.verified');
      case 'failed': return tr('status.failed');
      case 'expired': return tr('status.expired');
      case 'manual_review': return tr('status.manualReview');
      case 'processing': return tr('status.processing');
      case 'pending': return tr('status.pending');
      default: return tr('status.unknown');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatStatusText = (s: string) => {
    switch (s) {
      case 'manual_review': return tr('status.manualReviewBadge');
      default: return s.charAt(0).toUpperCase() + s.slice(1);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className={t.textSec}>{tr('status.loadingStatus')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center px-4`}>
        <div className="max-w-md w-full">
          <div className="portal-card p-6 text-center">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h1 className={`text-xl font-semibold ${t.text} mb-2`}>{tr('status.errorLoading')}</h1>
            <p className={`${t.textSec} mb-6`}>{error}</p>
            <button onClick={() => loadStatus()} className="btn-primary">
              {tr('common.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className={`min-h-screen ${t.bg} py-8 px-4`}>
      <div className="max-w-lg mx-auto">
        <div className="flex justify-end mb-3">
          <LanguageSelector variant="dark" />
        </div>
        <BrandedHeader className="mb-8" />

        {/* Status Card */}
        <div className="portal-card p-8 mb-6">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              {getStatusIcon(status.status)}
            </div>

            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border mb-4 ${getStatusColor(status.status)}`}>
              {formatStatusText(status.status)}
            </div>

            <h2 className={`text-xl font-semibold ${t.text} mb-2`}>
              {getStatusMessage(status.status)}
            </h2>

            {status.failure_reason && (
              <p className="text-red-400 text-sm mb-4">Reason: {status.failure_reason}</p>
            )}

            {status.confidence_score !== undefined && (
              <p className={`${t.textSec} text-sm mb-4`}>
                Confidence Score: {Math.round(status.confidence_score * 100)}%
              </p>
            )}

            {status.isAuthentic !== undefined && (
              <div className={`portal-card p-4 mb-4 text-left`}>
                <div className="flex items-center mb-3">
                  <Shield className="w-5 h-5 text-[#8896aa] mr-2" />
                  <p className={`text-sm font-medium ${t.text}`}>{tr('status.documentAuthenticity')}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    {status.isAuthentic ? (
                      <span className="status-verified">{tr('status.authentic')}</span>
                    ) : (
                      <span className="status-failed">{tr('status.suspicious')}</span>
                    )}
                  </div>
                  {status.authenticityScore !== undefined && (
                    <p className={`text-sm ${t.textSec}`}>
                      Score: {Math.min(100, Math.max(0, Math.round(status.authenticityScore * 100)))}%
                    </p>
                  )}
                  <p className={`text-sm ${t.textSec}`}>
                    {status.tamperFlags && status.tamperFlags.length > 0
                      ? status.tamperFlags.join(', ')
                      : tr('status.noTamperFlags')}
                  </p>
                </div>
              </div>
            )}

            {(status.status === 'pending' || status.status === 'processing' || status.status === 'manual_review') && (
              <div className={`flex items-center justify-center text-xs ${t.textSec} mb-4`}>
                <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                {tr('status.autoRefresh')}
              </div>
            )}

            <button
              onClick={() => loadStatus()}
              disabled={refreshing}
              className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium border ${t.border} ${t.textSec} hover:text-cyan-400 hover:border-cyan-400/30 transition-all disabled:opacity-50`}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? tr('status.refreshing') : tr('status.refreshStatus')}
            </button>
          </div>
        </div>

        {/* Details Card */}
        <div className="portal-card p-6">
          <h3 className={`text-lg font-semibold ${t.text} mb-4`}>{tr('status.details')}</h3>

          <div className="space-y-4">
            <div className="flex items-start">
              <Calendar className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
              <div>
                <p className={`text-sm font-medium ${t.text}`}>{tr('status.submitted')}</p>
                <p className={`text-sm ${t.textSec}`}>{formatDate(status.created_at)}</p>
              </div>
            </div>

            {status.completed_at && (
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
                <div>
                  <p className={`text-sm font-medium ${t.text}`}>{tr('status.completed')}</p>
                  <p className={`text-sm ${t.textSec}`}>{formatDate(status.completed_at)}</p>
                </div>
              </div>
            )}

            {status.expires_at && status.status === 'pending' && (
              <div className="flex items-start">
                <Clock className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
                <div>
                  <p className={`text-sm font-medium ${t.text}`}>{tr('status.expires')}</p>
                  <p className={`text-sm ${t.textSec}`}>{formatDate(status.expires_at)}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <FileText className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
              <div>
                <p className={`text-sm font-medium ${t.text}`}>{tr('status.documentsUploaded')}</p>
                <p className={`text-sm ${t.textSec}`}>{status.documents_uploaded} document(s)</p>
              </div>
            </div>

            <div className="flex items-start">
              <User className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
              <div>
                <p className={`text-sm font-medium ${t.text}`}>{tr('status.verificationId')}</p>
                <p className={`text-sm ${t.textSec} font-mono`}>{status.id.substring(0, 8)}...</p>
              </div>
            </div>

            {status.estimated_completion && status.status === 'processing' && (
              <div className="flex items-start">
                <Clock className="w-5 h-5 text-[#8896aa] mr-3 mt-0.5" />
                <div>
                  <p className={`text-sm font-medium ${t.text}`}>{tr('status.estimatedCompletion')}</p>
                  <p className={`text-sm ${t.textSec}`}>{status.estimated_completion}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 text-center">
          <p className={`text-sm ${t.textSec}`}>
            {tr('status.questionsAbout')}{' '}
            <a href="mailto:support@idswyft.app" className="text-cyan-400 hover:text-cyan-300">
              {tr('common.contactSupport')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerificationStatus;
