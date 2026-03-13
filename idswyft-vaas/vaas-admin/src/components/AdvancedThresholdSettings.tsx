/**
 * Advanced Threshold Settings Component
 *
 * Enhanced UI for visual threshold management in VaaS admin
 * Connects to the centralized threshold configuration system
 */

import React, { useState, useEffect } from 'react';
import { Settings, Eye, Shield, Info, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { apiClient } from '../services/api';
import { sectionLabel, monoXs, monoSm, cardSurface, infoPanel, getStatusAccent } from '../styles/tokens';

interface ThresholdData {
  production: {
    photo_consistency: number;
    face_matching: number;
    liveness: number;
    cross_validation: number;
    quality_minimum: number;
    ocr_confidence: number;
    pdf417_confidence: number;
  };
  sandbox: {
    photo_consistency: number;
    face_matching: number;
    liveness: number;
    cross_validation: number;
    quality_minimum: number;
    ocr_confidence: number;
    pdf417_confidence: number;
  };
  meta: {
    organization_id: string;
    using_defaults: boolean;
    last_updated: string;
  };
}

interface PreviewData {
  preview: {
    production: {
      face_matching: number;
      liveness: number;
    };
    sandbox: {
      face_matching: number;
      liveness: number;
    };
  };
  explanation: {
    auto_approve_threshold: string;
    manual_review_threshold: string;
    face_matching_production: string;
    liveness_detection: string;
  };
}

interface Props {
  organizationId: string;
  canEdit: boolean;
  onThresholdsUpdated?: () => void;
}

export default function AdvancedThresholdSettings({ organizationId, canEdit, onThresholdsUpdated }: Props) {
  const [thresholds, setThresholds] = useState<ThresholdData | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(85);
  const [manualReviewThreshold, setManualReviewThreshold] = useState(60);
  const [requireLiveness, setRequireLiveness] = useState(true);
  const [requireBackOfId, setRequireBackOfId] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadThresholds();
  }, [organizationId]);

  useEffect(() => {
    // Generate preview when settings change
    if (autoApproveThreshold && manualReviewThreshold) {
      generatePreview();
    }
  }, [autoApproveThreshold, manualReviewThreshold, requireLiveness, requireBackOfId, maxAttempts]);

  const loadThresholds = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get('/admin/thresholds');
      setThresholds(response.data.data);

      // Initialize form with current values (would come from organization settings)
      // For now, using example values
      setAutoApproveThreshold(85);
      setManualReviewThreshold(60);
      setRequireLiveness(true);
      setRequireBackOfId(false);
      setMaxAttempts(3);

    } catch (err: any) {
      setError(err.message || 'Failed to load threshold settings');
    } finally {
      setIsLoading(false);
    }
  };

  const generatePreview = async () => {
    try {
      const response = await apiClient.post('/admin/thresholds/preview', {
        auto_approve_threshold: autoApproveThreshold,
        manual_review_threshold: manualReviewThreshold,
        require_liveness: requireLiveness,
        require_back_of_id: requireBackOfId,
        max_verification_attempts: maxAttempts
      });
      setPreview(response.data.data);
    } catch (err) {
      console.warn('Failed to generate preview:', err);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      await apiClient.put('/admin/thresholds', {
        auto_approve_threshold: autoApproveThreshold,
        manual_review_threshold: manualReviewThreshold,
        require_liveness: requireLiveness,
        require_back_of_id: requireBackOfId,
        max_verification_attempts: maxAttempts
      });

      setSuccess('Threshold settings updated successfully');
      await loadThresholds();
      onThresholdsUpdated?.();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);

    } catch (err: any) {
      setError(err.message || 'Failed to update threshold settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsSaving(true);

      await apiClient.post('/admin/thresholds/reset');

      setSuccess('Thresholds reset to defaults');
      await loadThresholds();

    } catch (err: any) {
      setError(err.message || 'Failed to reset thresholds');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${cardSurface} p-6`}>
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700/50 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-slate-700/50 rounded"></div>
            <div className="h-4 bg-slate-700/50 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-400/30 rounded-lg p-4 flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <span className={`${monoSm} text-rose-300`}>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-lg p-4 flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <span className={`${monoSm} text-emerald-300`}>{success}</span>
        </div>
      )}

      {/* High-Level Threshold Controls */}
      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10">
          <p className={sectionLabel}>Verification Confidence Thresholds</p>
          <p className={`${monoXs} text-slate-500 mt-1`}>
            Configure the overall confidence levels for automatic decisions
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Auto-Approve Threshold */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className={`${sectionLabel} block`}>
                Auto-Approve Threshold
              </label>
              <span className={`${monoSm} text-emerald-300`}>
                {autoApproveThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="70"
              max="95"
              step="1"
              value={autoApproveThreshold}
              onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
              disabled={!canEdit}
              className="w-full h-2 bg-slate-700/50 rounded-lg appearance-none cursor-pointer border border-white/10 slider-green"
            />
            <div className="flex justify-between mt-1">
              <span className={`${monoXs} text-slate-500`}>70% (Lenient)</span>
              <span className={`${monoXs} text-slate-500`}>95% (Strict)</span>
            </div>
            <p className={`${monoXs} text-slate-500 mt-1`}>
              Verifications above this confidence are automatically approved
            </p>
          </div>

          {/* Manual Review Threshold */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className={`${sectionLabel} block`}>
                Manual Review Threshold
              </label>
              <span className={`${monoSm} text-amber-300`}>
                {manualReviewThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="80"
              step="1"
              value={manualReviewThreshold}
              onChange={(e) => setManualReviewThreshold(Number(e.target.value))}
              disabled={!canEdit}
              className="w-full h-2 bg-slate-700/50 rounded-lg appearance-none cursor-pointer border border-white/10 slider-yellow"
            />
            <div className="flex justify-between mt-1">
              <span className={`${monoXs} text-slate-500`}>30% (Fewer Reviews)</span>
              <span className={`${monoXs} text-slate-500`}>80% (More Reviews)</span>
            </div>
            <p className={`${monoXs} text-slate-500 mt-1`}>
              Verifications above this confidence require manual admin review
            </p>
          </div>

          {/* Settings Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <label className={`${sectionLabel} block`}>Liveness Detection</label>
                <p className={`${monoXs} text-slate-500`}>Require real-time selfie verification</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireLiveness}
                  onChange={(e) => setRequireLiveness(e.target.checked)}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`${sectionLabel} block`}>Back of ID Required</label>
                <p className={`${monoXs} text-slate-500`}>Require both sides of documents</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireBackOfId}
                  onChange={(e) => setRequireBackOfId(e.target.checked)}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
          </div>

          {/* Max Attempts */}
          <div>
            <label className={`${sectionLabel} block mb-2`}>
              Maximum Verification Attempts
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              disabled={!canEdit}
              className="w-32 px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-slate-900/40"
            />
            <p className={`${monoXs} text-slate-500 mt-1`}>
              How many times users can retry failed verifications
            </p>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div className={`${cardSurface} p-6`}>
          <div className="flex items-center mb-4">
            <Eye className="h-4 w-4 mr-2 text-cyan-400" />
            <p className={sectionLabel}>Impact Preview</p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={infoPanel}>
                <p className={`${sectionLabel} mb-2`}>Production Environment</p>
                <ul className="space-y-1">
                  <li className={`${monoXs} text-slate-400`}>Face matching: <span className={`${monoSm} text-slate-200`}>{(preview.preview.production.face_matching * 100).toFixed(0)}%</span> required</li>
                  <li className={`${monoXs} text-slate-400`}>Liveness detection: <span className={`${monoSm} text-slate-200`}>{(preview.preview.production.liveness * 100).toFixed(0)}%</span> required</li>
                </ul>
              </div>
              <div className={infoPanel}>
                <p className={`${sectionLabel} mb-2`}>Sandbox Environment</p>
                <ul className="space-y-1">
                  <li className={`${monoXs} text-slate-400`}>Face matching: <span className={`${monoSm} text-slate-200`}>{(preview.preview.sandbox.face_matching * 100).toFixed(0)}%</span> required</li>
                  <li className={`${monoXs} text-slate-400`}>Liveness detection: <span className={`${monoSm} text-slate-200`}>{(preview.preview.sandbox.liveness * 100).toFixed(0)}%</span> required</li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 mt-4">
              <p className={`${sectionLabel} mb-2`}>Verification Behavior</p>
              <ul className="space-y-1">
                <li className={`${monoXs} text-slate-400`}>{preview.explanation.auto_approve_threshold}</li>
                <li className={`${monoXs} text-slate-400`}>{preview.explanation.manual_review_threshold}</li>
                <li className={`${monoXs} text-slate-400`}>{preview.explanation.liveness_detection}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Current Technical Thresholds Display */}
      {thresholds && showAdvanced && (
        <div className={cardSurface}>
          <div className="px-6 py-4 border-b border-white/10">
            <p className={sectionLabel}>Technical Threshold Details</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={infoPanel}>
                <p className={`${sectionLabel} mb-3`}>Production Environment</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Photo Consistency:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.production.photo_consistency * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Face Matching:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.production.face_matching * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Liveness Detection:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.production.liveness * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Cross Validation:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.production.cross_validation * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              <div className={infoPanel}>
                <p className={`${sectionLabel} mb-3`}>Sandbox Environment</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Photo Consistency:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.sandbox.photo_consistency * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Face Matching:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.sandbox.face_matching * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Liveness Detection:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.sandbox.liveness * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${monoXs} text-slate-500`}>Cross Validation:</span>
                    <span className={`${monoSm} text-slate-200`}>{(thresholds.sandbox.cross_validation * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${infoPanel} mt-4`}>
              <div className="flex">
                <Info className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="ml-3">
                  <p className={`${sectionLabel} text-amber-400`}>About Technical Thresholds</p>
                  <p className={`${monoXs} text-slate-500 mt-1`}>
                    These technical thresholds are automatically calculated based on your high-level settings above.
                    They control the specific AI model confidence levels for each verification step.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`inline-flex items-center ${monoXs} text-slate-500 hover:text-slate-300 transition-colors`}
        >
          <Settings className="h-4 w-4 mr-1" />
          {showAdvanced ? 'Hide' : 'Show'} Technical Details
        </button>

        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            disabled={!canEdit || isSaving}
            className="inline-flex items-center px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={!canEdit || isSaving}
            className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
          >
            <Shield className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Threshold Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
