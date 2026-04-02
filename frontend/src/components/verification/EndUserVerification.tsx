import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../../config/api';
import { ContinueOnPhone } from '../ContinueOnPhone';
import { LiveCaptureWidget } from './LiveCaptureWidget';

export interface VerificationProps {
  apiKey: string;
  userId: string;
  onComplete?: (result: VerificationResult) => void;
  onRedirect?: (url: string) => void;
  redirectUrl?: string;
  className?: string;
  theme?: 'light' | 'dark';
  allowedDocumentTypes?: ('passport' | 'drivers_license' | 'national_id')[];
  enableMobileHandoff?: boolean;
  verificationMode?: 'full' | 'document_only' | 'identity' | 'age_only';
  ageThreshold?: number;
  branding?: {
    logo_url: string | null;
    accent_color: string | null;
    company_name: string | null;
  };
}

export interface VerificationResult {
  verification_id: string;
  status: 'verified' | 'failed' | 'manual_review';
  user_id: string;
  confidence_score?: number;
  face_match_score?: number;
  liveness_score?: number;
  isAuthentic?: boolean;
  authenticityScore?: number;
  tamperFlags?: string[];
}

// ─── Step definitions ──────────────────────────────────────────────────────
// 1 Initialize  2 Front Doc  3 Front OCR  4 Back Doc  5 Cross-Check  6 Selfie  7 Done
// ─────────────────────────────────────────────────────────────────────────────

const FULL_STEPS = [
  { step: 1, label: 'Start' },
  { step: 2, label: 'Front ID' },
  { step: 3, label: 'Scanning' },
  { step: 4, label: 'Back ID' },
  { step: 5, label: 'Checking' },
  { step: 6, label: 'Selfie' },
  { step: 7, label: 'Done' },
];

const DOCUMENT_ONLY_STEPS = [
  { step: 1, label: 'Start' },
  { step: 2, label: 'Front ID' },
  { step: 3, label: 'Scanning' },
  { step: 4, label: 'Back ID' },
  { step: 5, label: 'Checking' },
  { step: 7, label: 'Done' },
];

const IDENTITY_STEPS = [
  { step: 1, label: 'Start' },
  { step: 2, label: 'Front ID' },
  { step: 3, label: 'Scanning' },
  { step: 6, label: 'Selfie' },
  { step: 7, label: 'Done' },
];

const AGE_ONLY_STEPS = [
  { step: 1, label: 'Start' },
  { step: 2, label: 'Upload ID' },
  { step: 7, label: 'Done' },
];

interface FrontOCRData {
  document_number?: string;
  full_name?: string;
  date_of_birth?: string;
  expiry_date?: string;
  nationality?: string;
}

const EndUserVerification: React.FC<VerificationProps> = ({
  apiKey,
  userId,
  onComplete,
  onRedirect,
  redirectUrl,
  className = '',
  theme = 'light',
  allowedDocumentTypes = ['passport', 'drivers_license', 'national_id'],
  enableMobileHandoff = false,
  verificationMode,
  ageThreshold,
  branding,
}) => {
  const isAgeOnly = verificationMode === 'age_only';
  const isDocumentOnly = verificationMode === 'document_only';
  const isIdentity = verificationMode === 'identity';
  // Core state
  const [currentStep, setCurrentStep] = useState(1);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileChoice, setShowMobileChoice] = useState(enableMobileHandoff);

  // Front doc state
  const [documentType, setDocumentType] = useState<string>('national_id');
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [frontOCR, setFrontOCR] = useState<FrontOCRData | null>(null);

  // Back doc state
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);

  // Result state
  const [finalResult, setFinalResult] = useState<any>(null);
  const [retryProcessing, setRetryProcessing] = useState(false);

  // Refs
  const mountedRef = useRef(true);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    };
  }, []);

  // Auto-start on mount
  useEffect(() => {
    if (!enableMobileHandoff) {
      startVerification();
    }
  }, []);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const isDark = theme === 'dark';
  const accentColor = branding?.accent_color || (isDark ? '#22d3ee' : '#3b82f6');
  const styles = {
    bg: isDark ? 'bg-[#080c14]' : 'bg-gray-50',
    cardBg: isDark ? 'bg-[#0b0f19]' : 'bg-white',
    text: isDark ? 'text-[#dde2ec]' : 'text-gray-900',
    textSec: isDark ? 'text-[#8896aa]' : 'text-gray-600',
    border: isDark ? 'border-[rgba(255,255,255,0.07)]' : 'border-gray-200',
    input: isDark
      ? 'border-[rgba(255,255,255,0.13)] focus:border-cyan-400 bg-[#0f1420] text-[#dde2ec]'
      : 'border-gray-300 focus:border-blue-500 text-gray-900',
    button: isDark ? 'bg-cyan-500 hover:bg-cyan-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
  };

  // ── API helpers ────────────────────────────────────────────────────────────
  const apiGet = async (path: string) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // ── Step 1: Initialize ─────────────────────────────────────────────────────
  const startVerification = async () => {
    if (!apiKey || !userId) { toast.error('Missing required parameters'); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          user_id: userId,
          ...(verificationMode && { verification_mode: verificationMode }),
          ...(ageThreshold && { age_threshold: ageThreshold }),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to start verification');
      }
      const data = await res.json();
      if (!mountedRef.current) return;
      setVerificationId(data.verification_id);
      setCurrentStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start verification');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // ── Step 2: Upload front document ─────────────────────────────────────────
  const handleFrontFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
    setFrontFile(file);
    setFrontPreviewUrl(URL.createObjectURL(file));
  };

  const uploadFrontDocument = async () => {
    if (!frontFile || !verificationId) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('document_type', documentType);
      formData.append('document', frontFile);

      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/front-document`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to upload document');
      }
      const data = await res.json();
      // Age-only mode: front-document response includes final_result directly
      if (isAgeOnly && data.age_verification) {
        showFinalResult(data);
        return;
      }
      toast.success('Document uploaded successfully');
      if (isIdentity) {
        // Identity flow: skip back doc, go to scanning then liveness
        setCurrentStep(3);
        pollFrontOCRForIdentity();
      } else {
        setCurrentStep(3);
        pollFrontOCR();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload document');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // ── Step 3: Poll for front OCR completion ─────────────────────────────────
  const MAX_POLL_ATTEMPTS = 60; // 60 × 2s = 2 minutes max

  const pollFrontOCR = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Verification timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;
      if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
        setFrontOCR(data.ocr_data);
        setCurrentStep(4); // Proceed to back-doc upload
      } else if (data.final_result === 'failed' || data.final_result === 'manual_review') {
        showFinalResult(data);
      } else {
        setTimeout(() => pollFrontOCR(attempt + 1), 2000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollFrontOCR(attempt + 1), 2000);
    }
  };

  // ── Step 3b: Poll for front OCR (identity mode — skip back doc) ──────────
  const pollFrontOCRForIdentity = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Verification timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;
      if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
        setFrontOCR(data.ocr_data);
        setCurrentStep(6); // Skip back doc — go directly to selfie/liveness
      } else if (data.final_result === 'failed' || data.final_result === 'manual_review') {
        showFinalResult(data);
      } else {
        setTimeout(() => pollFrontOCRForIdentity(attempt + 1), 2000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollFrontOCRForIdentity(attempt + 1), 2000);
    }
  };

  // ── Step 4: Upload back document ──────────────────────────────────────────
  const handleBackFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    setBackFile(file);
    setBackPreviewUrl(URL.createObjectURL(file));
  };

  const uploadBackDocument = async () => {
    if (!backFile || !verificationId) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('document', backFile);
      formData.append('document_type', documentType);

      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/back-document`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to upload back document');
      }
      toast.success('Back document uploaded');
      setCurrentStep(5);
      pollCrossValidation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload back document');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // ── Step 5: Poll for cross-validation completion ──────────────────────────
  const pollCrossValidation = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Document validation timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;

      // Cross-validation is auto-triggered during back-document upload in v2.
      // Check if results are available or if a terminal state was reached.
      const isComplete = !!data.cross_validation_results || data.final_result !== null;

      if (isComplete) {
        if (data.final_result === 'failed') {
          // Hard fraud failure (data inconsistency) — skip live capture
          showFinalResult(data);
        } else if (isDocumentOnly || data.final_result !== null) {
          // document_only: cross-validation is the final gate
          showFinalResult(data);
        } else {
          // Cross-validation passed or needs review — proceed to live capture.
          setCurrentStep(6);
        }
      } else {
        // Still processing — keep polling
        setTimeout(() => pollCrossValidation(attempt + 1), 2000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollCrossValidation(attempt + 1), 2000);
    }
  };

  // ── Step 6: After live capture, poll for final result ─────────────────────
  const waitForFinalResult = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Live capture verification timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;
      // In v2, final_result is non-null when verification reaches a terminal state
      if (data.final_result !== null) {
        showFinalResult(data);
      } else {
        setTimeout(() => waitForFinalResult(attempt + 1), 3000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => waitForFinalResult(attempt + 1), 3000);
    }
  };

  // ── Shared: display final result ──────────────────────────────────────────
  const showFinalResult = (data: any) => {
    if (!mountedRef.current) return;
    setFinalResult(data);
    setCurrentStep(7);

    if (onComplete) {
      // v2: data.final_result has user-facing status ('verified'|'failed'|'manual_review'),
      // data.status has internal machine state ('COMPLETE'|'HARD_REJECTED'|etc.)
      onComplete({
        verification_id: data.verification_id,
        status: data.final_result ?? data.status,
        user_id: data.user_id,
        confidence_score: data.confidence_score,
        face_match_score: data.face_match_results?.similarity_score ?? data.face_match_results?.score ?? data.face_match_score,
        liveness_score: data.liveness_results?.score ?? data.liveness_results?.liveness_score ?? data.liveness_score,
        isAuthentic: data.isAuthentic,
        authenticityScore: data.authenticityScore,
        tamperFlags: data.tamperFlags,
      });
    }

    if (redirectUrl || onRedirect) {
      redirectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (onRedirect) onRedirect(redirectUrl || '/');
        else if (redirectUrl) window.location.href = redirectUrl;
      }, 3000);
    }
  };

  // ── Retry failed verification ────────────────────────────────────────────
  const handleRetry = async () => {
    if (!verificationId) return;
    setRetryProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/restart`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to restart verification');
      }
      if (!mountedRef.current) return;
      // Reset local state — reuse same verificationId (server reset it)
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setFrontFile(null);
      setFrontPreviewUrl(null);
      setBackFile(null);
      setBackPreviewUrl(null);
      setFrontOCR(null);
      setFinalResult(null);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      setCurrentStep(2); // Back to front doc upload
    } catch (err: any) {
      toast.error(err.message || 'Failed to restart verification');
    } finally {
      if (mountedRef.current) setRetryProcessing(false);
    }
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const steps = isAgeOnly ? AGE_ONLY_STEPS
    : isDocumentOnly ? DOCUMENT_ONLY_STEPS
    : isIdentity ? IDENTITY_STEPS
    : FULL_STEPS;
  const stepIdx = steps.findIndex(s => s.step === currentStep);
  const activeStepIdx = stepIdx >= 0 ? stepIdx : steps.length - 1;

  const renderProgress = () => (
    <div className="mb-8">
      <div className="relative">
        <div className={`h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
          <div
            className="h-1.5 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${(activeStepIdx / (steps.length - 1)) * 100}%`, background: `linear-gradient(to right, ${accentColor}, ${accentColor})` }}
          />
        </div>
        <div className="flex justify-between absolute -top-1.5 w-full">
          {steps.map(({ step }, i) => (
            <div key={step} className="relative">
              <div className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                activeStepIdx >= i
                  ? ''
                  : isDark ? 'bg-[#0f1420] border-[rgba(255,255,255,0.13)]' : 'bg-white border-gray-300'
              }`} style={activeStepIdx >= i ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}>
                {activeStepIdx > i && (
                  <svg className="w-2.5 h-2.5 text-white absolute top-px left-px" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {activeStepIdx === i && (
                  <div className="w-1.5 h-1.5 bg-white rounded-full absolute top-px left-px animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-center mt-8">
        <span className="text-sm font-medium" style={{ color: accentColor }}>
          {steps[activeStepIdx]?.label}
        </span>
        <span className={`text-xs ml-2 ${styles.textSec}`}>
          ({activeStepIdx + 1}/{steps.length})
        </span>
      </div>
    </div>
  );

  // ── File upload area ───────────────────────────────────────────────────────
  const renderFileArea = (
    id: string,
    previewUrl: string | null,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    label: string,
  ) => (
    <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${isDark ? 'hover:border-cyan-400' : 'hover:border-blue-400'} ${styles.border}`}>
      <input type="file" accept="image/*" onChange={onChange} className="hidden" id={id} />
      <label htmlFor={id} className="cursor-pointer block">
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded-xl shadow" />
        ) : (
          <div className="py-4">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <p className={`font-medium ${styles.text}`}>{label}</p>
            <p className={`text-xs mt-1 ${styles.textSec}`}>JPG, PNG up to 10MB</p>
          </div>
        )}
      </label>
    </div>
  );

  // ── OCR summary card ───────────────────────────────────────────────────────
  const renderOCRSummary = () => {
    if (!frontOCR) return null;
    const fields: [string, string | undefined][] = [
      ['Name', frontOCR.full_name],
      ['Document #', frontOCR.document_number],
      ['Date of Birth', frontOCR.date_of_birth],
      ['Expiry', frontOCR.expiry_date],
      ['Nationality', frontOCR.nationality],
    ];
    const visible = fields.filter(([, v]) => v);
    if (!visible.length) return null;
    return (
      <div className={`rounded-xl border ${styles.border} p-4 mb-5`}>
        <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${styles.textSec}`}>Front ID — Extracted Data</p>
        <div className="space-y-1.5">
          {visible.map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className={styles.textSec}>{label}</span>
              <span className={`font-medium ${styles.text}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Step content ───────────────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStep) {
      // ── 1: Initializing ─────────────────────────────────────────────────
      case 1:
        return (
          <div className="text-center py-8">
            <div className={`w-14 h-14 mx-auto mb-5 bg-gradient-to-br ${isDark ? 'from-cyan-400 to-cyan-500' : 'from-blue-500 to-blue-600'} rounded-full flex items-center justify-center`}>
              <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h2 className={`text-xl font-semibold mb-2 ${styles.text}`}>Starting Verification</h2>
            <p className={`text-sm ${styles.textSec}`}>Initializing your verification session…</p>
          </div>
        );

      // ── 2: Upload front document ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className={`text-xl font-semibold mb-1 ${styles.text}`}>
                {isAgeOnly ? 'Upload Your ID' : 'Upload Front of ID'}
              </h2>
              <p className={`text-sm ${styles.textSec}`}>
                {isAgeOnly
                  ? 'Upload your government-issued ID to verify your age'
                  : isIdentity
                    ? 'Take a clear photo of the front of your ID — no back scan needed'
                    : 'Take a clear photo of the front of your government-issued ID'}
              </p>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${styles.text}`}>Document Type</label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border ${styles.input} focus:ring-2 ${isDark ? 'focus:ring-cyan-500' : 'focus:ring-blue-500'} focus:border-transparent transition-all`}
              >
                {allowedDocumentTypes.includes('national_id') && <option value="national_id">National ID</option>}
                {allowedDocumentTypes.includes('passport') && <option value="passport">Passport</option>}
                {allowedDocumentTypes.includes('drivers_license') && <option value="drivers_license">Driver's License</option>}
              </select>
            </div>

            {renderFileArea('front-upload', frontPreviewUrl, handleFrontFileSelect, 'Upload Front of ID')}

            {frontFile && (
              <button
                onClick={uploadFrontDocument}
                disabled={isLoading}
                className="w-full py-3.5 px-6 text-white font-medium rounded-xl disabled:opacity-50 transition-all" style={{ backgroundColor: accentColor }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading…
                  </span>
                ) : 'Continue →'}
              </button>
            )}
          </div>
        );

      // ── 3: Processing front OCR ──────────────────────────────────────────
      case 3:
        return (
          <div className="text-center py-8">
            <div className={`animate-spin rounded-full h-10 w-10 border-b-2 ${isDark ? 'border-cyan-400' : 'border-blue-600'} mx-auto mb-5`} />
            <h2 className={`text-xl font-semibold mb-2 ${styles.text}`}>Reading Your ID</h2>
            <p className={`text-sm ${styles.textSec}`}>Extracting information from the front of your document…</p>
            <p className={`text-xs mt-2 ${styles.textSec}`}>Please don't close this window</p>
          </div>
        );

      // ── 4: Upload back document ──────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className={`text-xl font-semibold mb-1 ${styles.text}`}>Upload Back of ID</h2>
              <p className={`text-sm ${styles.textSec}`}>We need both sides to cross-validate your identity</p>
            </div>

            {renderOCRSummary()}

            {renderFileArea('back-upload', backPreviewUrl, handleBackFileSelect, 'Upload Back of ID')}

            {backFile && (
              <button
                onClick={uploadBackDocument}
                disabled={isLoading}
                className="w-full py-3.5 px-6 text-white font-medium rounded-xl disabled:opacity-50 transition-all" style={{ backgroundColor: accentColor }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading…
                  </span>
                ) : 'Continue →'}
              </button>
            )}
          </div>
        );

      // ── 5: Cross-validation processing ──────────────────────────────────
      case 5:
        return (
          <div className="text-center py-8">
            <div className={`animate-spin rounded-full h-10 w-10 border-b-2 ${isDark ? 'border-cyan-400' : 'border-blue-600'} mx-auto mb-5`} />
            <h2 className={`text-xl font-semibold mb-2 ${styles.text}`}>Verifying Your Documents</h2>
            <p className={`text-sm ${styles.textSec}`}>Cross-checking the front and back of your ID…</p>
            <div className={`mt-4 text-xs ${styles.textSec} space-y-1`}>
              <p>✦ Barcode / QR scanning</p>
              <p>✦ Data cross-validation</p>
              <p>✦ Authenticity check</p>
            </div>
          </div>
        );

      // ── 6: Live capture ──────────────────────────────────────────────────
      case 6:
        return (
          <LiveCaptureWidget
            apiKey={apiKey}
            verificationId={verificationId!}
            theme={theme}
            onComplete={() => {
              setCurrentStep(7); // Show "processing" in step 7 until poll resolves
              waitForFinalResult();
            }}
            onError={msg => toast.error(msg)}
          />
        );

      // ── 7: Final result ──────────────────────────────────────────────────
      case 7: {
        if (!finalResult) {
          // Still waiting for live capture result
          return (
            <div className="text-center py-8">
              <div className={`animate-spin rounded-full h-10 w-10 border-b-2 ${isDark ? 'border-cyan-400' : 'border-blue-600'} mx-auto mb-5`} />
              <h2 className={`text-xl font-semibold mb-2 ${styles.text}`}>Processing Verification</h2>
              <p className={`text-sm ${styles.textSec}`}>Analyzing your live photo…</p>
            </div>
          );
        }

        // v2: final_result has user-facing status, status has internal machine state
        const status = finalResult.final_result ?? finalResult.status;
        const isVerified = status === 'verified';
        const isFailed = status === 'failed';

        return (
          <div className="text-center max-w-sm mx-auto space-y-5">
            <div className={`text-5xl ${isVerified ? '' : isFailed ? '' : ''}`}>
              {isVerified ? '✅' : isFailed ? '❌' : '⏳'}
            </div>

            <div>
              <h2 className={`text-xl font-semibold ${styles.text}`}>
                {isAgeOnly
                  ? isVerified ? 'Age Verified!' : 'Age Verification Failed'
                  : isVerified ? 'Identity Verified!' : isFailed ? 'Verification Failed' : 'Under Review'}
              </h2>
              <p className={`text-sm mt-1 ${styles.textSec}`}>
                {isAgeOnly
                  ? isVerified
                    ? `You meet the minimum age requirement of ${finalResult.age_verification?.age_threshold ?? ageThreshold ?? 18}.`
                    : finalResult.message || finalResult.rejection_detail || 'Age verification could not be completed.'
                  : isVerified
                  ? 'Your identity has been successfully verified.'
                  : isFailed
                  ? finalResult.failure_reason || 'Verification could not be completed. Please try again.'
                  : 'Your verification is under manual review. You will be notified of the result.'}
              </p>
            </div>

            {/* Score details */}
            <div className={`rounded-xl border ${styles.border} p-4 text-left text-sm space-y-2`}>
              <div className="flex justify-between">
                <span className={styles.textSec}>Status</span>
                <span className={`font-semibold capitalize ${isVerified ? 'text-green-600' : isFailed ? 'text-red-600' : 'text-yellow-600'}`}>{status}</span>
              </div>
              {/* Age verification */}
              {finalResult.age_verification && (
                <>
                  <div className="flex justify-between">
                    <span className={styles.textSec}>Age Check</span>
                    <span className={`font-semibold ${finalResult.age_verification.is_of_age ? 'text-green-600' : 'text-red-500'}`}>
                      {finalResult.age_verification.is_of_age ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={styles.textSec}>Minimum Age</span>
                    <span className={`font-medium ${styles.text}`}>{finalResult.age_verification.age_threshold}+</span>
                  </div>
                </>
              )}
              {/* Cross-validation: v2 uses overall_score, fall back to weighted_score / v1 flat field */}
              {(finalResult.cross_validation_results?.overall_score ?? finalResult.cross_validation_results?.weighted_score ?? finalResult.cross_validation_score) != null && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Doc Cross-Check</span>
                  <span className={`font-medium ${styles.text}`}>{Math.round((finalResult.cross_validation_results?.overall_score ?? finalResult.cross_validation_results?.weighted_score ?? finalResult.cross_validation_score) * 100)}%</span>
                </div>
              )}
              {finalResult.cross_validation_results?.verdict && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Verdict</span>
                  <span className={`font-semibold ${finalResult.cross_validation_results.verdict === 'PASS' ? 'text-green-600' : finalResult.cross_validation_results.verdict === 'REJECT' ? 'text-red-500' : 'text-yellow-600'}`}>{finalResult.cross_validation_results.verdict}</span>
                </div>
              )}
              {/* Face match: v2 uses similarity_score, fall back to score / v1 flat field */}
              {(finalResult.face_match_results?.similarity_score ?? finalResult.face_match_results?.score ?? finalResult.face_match_score) != null && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Face Match</span>
                  <span className={`font-medium ${styles.text}`}>{Math.round((finalResult.face_match_results?.similarity_score ?? finalResult.face_match_results?.score ?? finalResult.face_match_score) * 100)}%</span>
                </div>
              )}
              {/* Liveness: v2 uses liveness_results.score (not liveness_score), fall back to v1 fields */}
              {(finalResult.liveness_results?.score ?? finalResult.liveness_results?.liveness_score ?? finalResult.liveness_score) != null && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Liveness</span>
                  <span className={`font-medium ${styles.text}`}>
                    {Math.round((finalResult.liveness_results?.score ?? finalResult.liveness_results?.liveness_score ?? finalResult.liveness_score) * 100)}%
                    {finalResult.liveness_results?.passed != null && (
                      <span className={`ml-2 text-xs ${finalResult.liveness_results.passed ? 'text-green-600' : 'text-red-500'}`}>
                        {finalResult.liveness_results.passed ? '✓' : '✗'}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {/* AML Screening */}
              {finalResult.aml_screening && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>AML Screening</span>
                  <span className={`font-semibold ${finalResult.aml_screening.risk_level === 'clear' ? 'text-green-600' : finalResult.aml_screening.match_found ? 'text-red-500' : 'text-yellow-600'}`}>
                    {finalResult.aml_screening.risk_level === 'clear' ? 'Clear' : finalResult.aml_screening.risk_level?.replace('_', ' ')}
                  </span>
                </div>
              )}
              {/* Risk Score */}
              {finalResult.risk_score && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Risk Score</span>
                  <span className={`font-semibold ${finalResult.risk_score.risk_level === 'low' ? 'text-green-600' : finalResult.risk_score.risk_level === 'medium' ? 'text-yellow-600' : 'text-red-500'}`}>
                    {finalResult.risk_score.overall_score}/100 ({finalResult.risk_score.risk_level})
                  </span>
                </div>
              )}
              {finalResult.confidence_score != null && (
                <div className="flex justify-between">
                  <span className={styles.textSec}>Confidence</span>
                  <span className={`font-medium ${styles.text}`}>{Math.round(finalResult.confidence_score * 100)}%</span>
                </div>
              )}
              {/* Rejection details */}
              {finalResult.rejection_reason && (
                <div className={`mt-2 pt-2 border-t ${styles.border}`}>
                  <div className="flex justify-between">
                    <span className={styles.textSec}>Rejection</span>
                    <span className="font-mono text-xs text-red-500">{finalResult.rejection_reason}</span>
                  </div>
                  {finalResult.rejection_detail && (
                    <p className={`text-xs mt-1 ${styles.textSec}`}>{finalResult.rejection_detail}</p>
                  )}
                </div>
              )}
            </div>

            {isFailed && finalResult.retry_available === true && (
              <button
                onClick={handleRetry}
                disabled={retryProcessing}
                className={`w-full py-3 px-6 bg-gradient-to-r ${isDark ? 'from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600' : 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'} text-white font-medium rounded-xl disabled:opacity-50 transition-all`}
              >
                {retryProcessing ? 'Restarting…' : 'Try Again'}
              </button>
            )}
            {isFailed && finalResult.retry_available === false && (
              <p className={`text-xs ${isDark ? 'text-red-400' : 'text-red-500'}`}>Maximum retry attempts reached.</p>
            )}

            {(redirectUrl || onRedirect) && (
              <p className={`text-xs ${styles.textSec}`}>Redirecting in 3 seconds…</p>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ── Root render ────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#080c14]' : 'bg-gray-50'} ${className} flex items-center justify-center p-4`}>
      <div className="w-full max-w-lg">
        <div className={`${isDark ? 'bg-[#0b0f19] border-[rgba(255,255,255,0.07)]' : 'bg-white border-gray-200'} rounded-3xl shadow-xl border overflow-hidden`}>
          <div className="p-8">
            {showMobileChoice ? (
              <div className="py-4">
                <h2 className={`text-xl font-bold text-center mb-1 ${styles.text}`}>How would you like to verify?</h2>
                <p className={`text-sm text-center mb-6 ${styles.textSec}`}>Complete on this device or scan a QR code to use your phone</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`border ${styles.border} rounded-2xl p-5 flex flex-col items-center text-center gap-3`}>
                    <div className="text-4xl">💻</div>
                    <div>
                      <h3 className={`font-semibold ${styles.text}`}>Start Here</h3>
                      <p className={`text-sm ${styles.textSec} mt-1`}>Use your webcam and upload documents on this device</p>
                    </div>
                    <button
                      onClick={() => { setShowMobileChoice(false); startVerification(); }}
                      className={`mt-1 w-full py-2.5 px-4 ${isDark ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-xl text-sm font-medium transition-colors`}
                    >
                      Start on This Device
                    </button>
                  </div>

                  <ContinueOnPhone
                    apiKey={apiKey}
                    userId={userId}
                    verificationMode={verificationMode}
                    ageThreshold={ageThreshold}
                    onComplete={result => {
                      setShowMobileChoice(false);
                      if (onComplete) onComplete({
                        verification_id: result.verification_id ?? 'mobile-handoff',
                        user_id: result.user_id ?? userId,
                        status: (result.status ?? 'manual_review') as VerificationResult['status'],
                        confidence_score: result.confidence_score,
                        face_match_score: result.face_match_score,
                        liveness_score: result.liveness_score,
                      });
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                {renderProgress()}
                {renderStepContent()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EndUserVerification;
