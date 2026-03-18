// Desktop verification flow — dark theme matching the main platform's EndUserVerification.
// Single centered card, dark navy background, cyan accents.
// All business logic preserved; only presentation changed.

import React, { useState, useEffect, useRef } from 'react';
import { VerificationSession } from '../../types';
import customerPortalAPI, { type ApiError } from '../../services/api';
import verificationAPI from '../../services/verificationApi';
import { useOrganization } from '../../contexts/OrganizationContext';
import BrandedHeader from '../BrandedHeader';
import LiveCaptureComponent from '../LiveCaptureComponent';
import type { LivenessMetadata } from '../../hooks/useActiveLiveness';
import LanguageSelector from '../LanguageSelector';
import { useTranslation } from 'react-i18next';
import '../../patterns.css';

interface ModernVerificationSystemProps {
  sessionToken: string;
}

// ── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { step: 1, label: 'Country' },
  { step: 2, label: 'Front ID' },
  { step: 3, label: 'Scanning' },
  { step: 4, label: 'Back ID' },
  { step: 5, label: 'Live Capture' },
  { step: 6, label: 'Done' },
];

// ── Theme tokens ─────────────────────────────────────────────────────────────
const t = {
  bg: 'bg-[#080c14]',
  cardBg: 'bg-[#0b0f19]',
  text: 'text-[#dde2ec]',
  textSec: 'text-[#8896aa]',
  border: 'border-[rgba(255,255,255,0.07)]',
  input: 'border-[rgba(255,255,255,0.13)] focus:border-cyan-400 bg-[#0f1420] text-[#dde2ec]',
};

export const ModernVerificationSystem: React.FC<ModernVerificationSystemProps> = ({ sessionToken }) => {
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<{ front?: File; back?: File }>({});
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [issuingCountry, setIssuingCountry] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>('drivers_license');
  const [ocrData, setOcrData] = useState<any>(null);
  const [backOfIdUploaded, setBackOfIdUploaded] = useState(false);
  const [showLiveCapture, setShowLiveCapture] = useState(false);
  const [finalStatus, setFinalStatus] = useState<'pending' | 'processing' | 'completed' | 'verified' | 'failed' | 'manual_review' | null>(null);
  const [verificationResults, setVerificationResults] = useState<any>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [retryProcessing, setRetryProcessing] = useState(false);
  const { branding, organizationName, setBranding, setOrganizationName } = useOrganization();
  const { t: tr } = useTranslation();

  const stepLabel = (step: number) => {
    const keys = ['steps.country', 'steps.frontId', 'steps.scanning', 'steps.backId', 'steps.liveCapture', 'steps.done'];
    return tr(keys[step - 1] || 'steps.done');
  };

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    };
  }, []);

  // ── Initialize session ─────────────────────────────────────────────────────
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setLoading(true);
        const sessionData = await customerPortalAPI.getVerificationSession(sessionToken);
        if (!mountedRef.current) return;
        setSession(sessionData);
        verificationAPI.setSessionToken(sessionToken);

        if (sessionData.organization?.branding) {
          setBranding(sessionData.organization.branding);
        }
        if (sessionData.organization?.name) {
          setOrganizationName(sessionData.organization.name);
        }

        // If session already failed, show the failure screen with retry option
        if (sessionData.status === 'failed') {
          setFinalStatus('failed');
          setVerificationResults({
            failure_reason: (sessionData as any).results?.failure_reason,
            retry_available: (sessionData as any).retry_available,
          });
          setCurrentStep(6);
        }

        setLoading(false);
      } catch (err: any) {
        if (!mountedRef.current) return;
        if (err?.status === 410) {
          setStaleMessage(err.message || 'This verification link is no longer active.');
        } else {
          setError(`Failed to initialize verification: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        setLoading(false);
      }
    };

    if (sessionToken) initializeSession();
  }, [sessionToken]);

  // ── File handlers ──────────────────────────────────────────────────────────
  const handleFrontFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
    setDocuments(prev => ({ ...prev, front: file }));
    setFrontPreviewUrl(URL.createObjectURL(file));
  };

  const handleBackFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    setDocuments(prev => ({ ...prev, back: file }));
    setBackPreviewUrl(URL.createObjectURL(file));
  };

  // ── Upload front document ──────────────────────────────────────────────────
  const uploadFrontDocument = async () => {
    if (!documents.front || !session) return;
    setUploading(true);
    setError(null);

    try {
      let currentVerificationId = verificationId;
      if (!currentVerificationId) {
        currentVerificationId = await verificationAPI.startVerification(session, issuingCountry || undefined);
        setVerificationId(currentVerificationId);
      }

      await verificationAPI.uploadDocument(session, currentVerificationId, documents.front, documentType, undefined, issuingCountry || undefined);
      setCurrentStep(3);
      pollForOCRCompletion(currentVerificationId);
    } catch (err) {
      setError(`${tr('errors.uploadFrontFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Upload back document ───────────────────────────────────────────────────
  const uploadBackDocument = async () => {
    if (!documents.back || !verificationId || !session) return;
    setUploading(true);
    setError(null);

    try {
      await verificationAPI.uploadBackOfId(session, verificationId, documents.back, documentType, undefined, issuingCountry || undefined);
      setBackOfIdUploaded(true);
      setCurrentStep(5);
    } catch (err) {
      setError(`${tr('errors.uploadBackFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Live capture handler ───────────────────────────────────────────────────
  const handleLiveCaptureSuccess = async (imageData: string, metadata?: LivenessMetadata) => {
    if (!session || !verificationId) return;
    setUploading(true);
    setShowLiveCapture(false);
    setError(null);

    try {
      const base64String = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      const byteString = atob(base64String);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/jpeg' });
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });

      await verificationAPI.captureSelfie(session, verificationId, file, undefined, metadata);
      setCurrentStep(6);
      await handleSubmitVerification();
      pollForFinalResults(verificationId);
    } catch (err) {
      setError(`${tr('errors.uploadLiveCaptureFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitVerification = async () => {
    if (!session) return;
    try {
      await customerPortalAPI.submitVerification(sessionToken, idempotencyKey);
    } catch (err: any) {
      if (err?.status === 409) {
        setError(tr('errors.alreadySubmitted'));
      } else {
        setError((err as ApiError)?.message ?? tr('errors.submissionFailed'));
      }
    }
  };

  // ── Polling ────────────────────────────────────────────────────────────────
  const pollForOCRCompletion = async (vId: string, attempt = 0) => {
    if (!session || !mountedRef.current) return;
    if (attempt >= 30) { setError(tr('errors.processingTimeout')); return; }

    try {
      const results = await verificationAPI.getResults(session, vId);
      if (!mountedRef.current) return;

      if (results.ocr_data && Object.keys(results.ocr_data).length > 0) {
        setOcrData(results.ocr_data);
        setCurrentStep(4);
        return;
      }
      if (results.final_result === 'failed') {
        setFinalStatus('failed');
        setVerificationResults(results);
        setCurrentStep(6);
        customerPortalAPI.reportResult(sessionToken, results).catch(() => {});
        return;
      }
      setTimeout(() => pollForOCRCompletion(vId, attempt + 1), 3000);
    } catch {
      if (mountedRef.current && attempt < 3) setTimeout(() => pollForOCRCompletion(vId, attempt + 1), 5000);
      else if (mountedRef.current) setError(tr('errors.statusCheckFailed'));
    }
  };

  const pollForFinalResults = async (vId: string, attempt = 0) => {
    if (!session || !mountedRef.current) return;
    if (attempt >= 24) { setError(tr('errors.takingLonger')); return; }

    try {
      const results = await verificationAPI.getResults(session, vId);
      if (!mountedRef.current) return;

      if (results.final_result != null) {
        setFinalStatus(results.final_result);
        setVerificationResults(results);
        // Report result back to VaaS backend (fire-and-forget)
        customerPortalAPI.reportResult(sessionToken, results).catch(() => {});
        return;
      }
      setTimeout(() => pollForFinalResults(vId, attempt + 1), 5000);
    } catch {
      if (mountedRef.current && attempt < 3) setTimeout(() => pollForFinalResults(vId, attempt + 1), 5000);
      else if (mountedRef.current) setError(tr('errors.statusCheckFailed'));
    }
  };

  // ── Retry: restart the session and reset all state ─────────────────────────
  const handleRetry = async () => {
    setRetryProcessing(true);
    setError(null);
    try {
      await customerPortalAPI.restartSession(sessionToken);
      // Reset all flow state
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setDocuments({});
      setFrontPreviewUrl(null);
      setBackPreviewUrl(null);
      setFinalStatus(null);
      setVerificationResults(null);
      setVerificationId(null);
      setOcrData(null);
      setBackOfIdUploaded(false);
      setShowLiveCapture(false);
      setIdempotencyKey(crypto.randomUUID());
      setCurrentStep(1); // Back to country selection
    } catch (err: any) {
      setError(err.message || tr('failure.maxRetries'));
    } finally {
      setRetryProcessing(false);
    }
  };

  // ── Drag-and-drop helpers ──────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, type: string) => { e.preventDefault(); setDragOver(type); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(null); };
  const handleDrop = (e: React.DragEvent, type: 'front' | 'back') => {
    e.preventDefault();
    setDragOver(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (type === 'front') {
        if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
        setDocuments(prev => ({ ...prev, front: files[0] }));
        setFrontPreviewUrl(URL.createObjectURL(files[0]));
      } else {
        if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
        setDocuments(prev => ({ ...prev, back: files[0] }));
        setBackPreviewUrl(URL.createObjectURL(files[0]));
      }
    }
  };

  // ── Progress bar ───────────────────────────────────────────────────────────
  const renderProgress = () => (
    <div className="mb-8">
      <div className="relative">
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
        <div className="flex justify-between absolute -top-1.5 w-full">
          {STEPS.map(({ step }) => (
            <div key={step} className="relative">
              <div className={`step-dot ${
                currentStep > step ? 'step-dot--done'
                  : currentStep === step ? 'step-dot--active'
                  : 'step-dot--pending'
              }`}>
                {currentStep > step && (
                  <svg className="w-2.5 h-2.5 text-white absolute top-px left-px" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {currentStep === step && (
                  <div className="w-1.5 h-1.5 bg-white rounded-full absolute top-px left-px animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-center mt-8">
        <span className="text-sm font-medium text-cyan-400">
          {stepLabel(currentStep)}
        </span>
        <span className={`text-xs ml-2 ${t.textSec}`}>
          ({currentStep}/{STEPS.length})
        </span>
      </div>
    </div>
  );

  // ── File upload area ───────────────────────────────────────────────────────
  const renderFileArea = (
    type: 'front' | 'back',
    previewUrl: string | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    label: string,
  ) => (
    <div
      className={`file-upload-zone ${dragOver === type ? 'dragover' : ''} ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      onDragOver={e => handleDragOver(e, type)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, type)}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
        disabled={uploading}
      />
      {previewUrl ? (
        <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded-xl shadow" />
      ) : (
        <div className="py-4">
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <p className={`font-medium ${t.text}`}>{label}</p>
          <p className={`text-xs mt-1 ${t.textSec}`}>{tr('frontId.uploadHint')}</p>
        </div>
      )}
    </div>
  );

  // ── OCR summary ────────────────────────────────────────────────────────────
  const renderOCRSummary = () => {
    if (!ocrData) return null;
    const fields: [string, string | undefined][] = [
      [tr('ocrFields.name'), ocrData.full_name],
      [tr('ocrFields.documentNumber'), ocrData.document_number],
      [tr('ocrFields.dateOfBirth'), ocrData.date_of_birth],
      [tr('ocrFields.expiry'), ocrData.expiry_date],
      [tr('ocrFields.nationality'), ocrData.nationality],
    ];
    const visible = fields.filter(([, v]) => v);
    if (!visible.length) return null;

    return (
      <div className={`rounded-xl border ${t.border} p-4 mb-5`}>
        <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${t.textSec}`}>{tr('frontId.extractedData')}</p>
        <div className="space-y-1.5">
          {visible.map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className={t.textSec}>{label}</span>
              <span className={`font-medium ${t.text}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Spinner helper ─────────────────────────────────────────────────────────
  const Spinner = () => (
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto mb-5" />
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center p-4 pattern-fingerprint pattern-faint pattern-fade-edges pattern-full`}>
        <div className="w-full max-w-lg">
          <div className={`portal-card p-8 text-center animate-fade-in`}>
            <div className="w-14 h-14 mx-auto mb-5 bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h2 className={`text-xl font-semibold mb-2 ${t.text}`}>{tr('desktop.initTitle')}</h2>
            <p className={`text-sm ${t.textSec}`}>{tr('desktop.initSubtitle')}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Stale link state ───────────────────────────────────────────────────────
  if (staleMessage) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center p-4 pattern-fingerprint pattern-faint pattern-fade-edges pattern-full`}>
        <div className="w-full max-w-lg">
          <BrandedHeader className="mb-6" />
          <div className="portal-card p-8 text-center animate-fade-in">
            <div className="w-14 h-14 mx-auto mb-5 bg-gradient-to-br from-cyan-400/20 to-cyan-500/20 border border-cyan-400/30 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className={`text-xl font-semibold mb-2 ${t.text}`}>{tr('staleLink.heading')}</h2>
            <p className={`text-sm ${t.textSec}`}>{staleMessage}</p>
          </div>
          <div className="mt-6 text-center">
            <p className={`text-xs ${t.textSec}`}>
              {tr('staleLink.message')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error-only state ───────────────────────────────────────────────────────
  if (error && !session) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center p-4 pattern-fingerprint pattern-faint pattern-fade-edges pattern-full`}>
        <div className="w-full max-w-lg">
          <div className="portal-card p-8 text-center animate-fade-in">
            <div className="text-4xl mb-4">!</div>
            <h2 className={`text-xl font-semibold mb-2 ${t.text}`}>{tr('common.error')}</h2>
            <p className={`text-sm mb-6 ${t.textSec}`}>{error}</p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              {tr('common.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step content renderer ──────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStep) {
      // ── 1: Country + Document Type Selection ──────────────────────────
      case 1:
        return (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center">
              <h2 className={`text-xl font-semibold mb-1 ${t.text}`}>{tr('desktop.selectCountryDoc')}</h2>
              <p className={`text-sm ${t.textSec}`}>{tr('desktop.selectCountryDocDesc')}</p>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${t.text}`}>{tr('country.issuingCountry')}</label>
              <select
                value={issuingCountry || ''}
                onChange={e => setIssuingCountry(e.target.value || null)}
                className={`w-full px-4 py-2.5 rounded-xl border ${t.input} focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              >
                <option value="">{tr('country.choosePlaceholder')}</option>
                <optgroup label={tr('country.regions.americas')}>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="BR">Brazil</option>
                  <option value="MX">Mexico</option>
                  <option value="AR">Argentina</option>
                </optgroup>
                <optgroup label={tr('country.regions.europe')}>
                  <option value="GB">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="IT">Italy</option>
                  <option value="ES">Spain</option>
                  <option value="NL">Netherlands</option>
                </optgroup>
                <optgroup label={tr('country.regions.asiaPacific')}>
                  <option value="AU">Australia</option>
                  <option value="NZ">New Zealand</option>
                  <option value="JP">Japan</option>
                  <option value="KR">South Korea</option>
                  <option value="IN">India</option>
                  <option value="SG">Singapore</option>
                  <option value="PH">Philippines</option>
                  <option value="TH">Thailand</option>
                  <option value="VN">Vietnam</option>
                </optgroup>
              </select>
            </div>

            {issuingCountry && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${t.text}`}>{tr('documentType.title')}</label>
                <select
                  value={documentType}
                  onChange={e => setDocumentType(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border ${t.input} focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
                >
                  <option value="drivers_license">{tr('documentType.driversLicense')}</option>
                  <option value="passport">{tr('documentType.passport')}</option>
                  {!['US', 'CA', 'AU', 'NZ'].includes(issuingCountry) && (
                    <option value="national_id">{tr('documentType.nationalId')}</option>
                  )}
                </select>
              </div>
            )}

            {issuingCountry && (
              <button onClick={() => setCurrentStep(2)} className="btn-primary">
                {tr('common.next')} &rarr;
              </button>
            )}
          </div>
        );

      // ── 2: Upload front document ───────────────────────────────────────
      case 2:
        return (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center">
              <h2 className={`text-xl font-semibold mb-1 ${t.text}`}>{tr('frontId.heading')}</h2>
              <p className={`text-sm ${t.textSec}`}>{tr('frontId.description')}</p>
            </div>

            {/* Country/doc type badge */}
            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${t.border} text-sm`}>
              <span className={t.textSec}>{tr('country.issuingCountry')}: <span className={`font-medium ${t.text}`}>{issuingCountry}</span></span>
              <span className={t.textSec}>|</span>
              <span className={t.textSec}>{tr('common.document')}: <span className={`font-medium ${t.text}`}>{documentType.replace(/_/g, ' ')}</span></span>
              <button onClick={() => setCurrentStep(1)} className="ml-auto text-cyan-400 text-xs hover:text-cyan-300">{tr('common.change')}</button>
            </div>

            {renderFileArea('front', frontPreviewUrl, frontInputRef, handleFrontFileSelect, tr('frontId.heading'))}

            {documents.front && (
              <button onClick={uploadFrontDocument} disabled={uploading} className="btn-primary">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {tr('common.processing')}
                  </span>
                ) : `${tr('common.next')} \u2192`}
              </button>
            )}
          </div>
        );

      // ── 3: Processing front OCR ────────────────────────────────────────
      case 3:
        return (
          <div className="text-center py-8 animate-fade-in">
            <Spinner />
            <h2 className={`text-xl font-semibold mb-2 ${t.text}`}>{tr('verification.verifying')}</h2>
            <p className={`text-sm ${t.textSec}`}>{tr('common.processing')}</p>
            <p className={`text-xs mt-2 ${t.textSec}`}>{tr('verification.dontClose')}</p>
          </div>
        );

      // ── 4: Upload back document ────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center">
              <h2 className={`text-xl font-semibold mb-1 ${t.text}`}>{tr('backId.heading')}</h2>
              <p className={`text-sm ${t.textSec}`}>{tr('backId.description')}</p>
            </div>

            {renderOCRSummary()}

            {renderFileArea('back', backPreviewUrl, backInputRef, handleBackFileSelect, tr('backId.heading'))}

            {documents.back && (
              <button onClick={uploadBackDocument} disabled={uploading} className="btn-primary">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {tr('common.processing')}
                  </span>
                ) : `${tr('common.next')} \u2192`}
              </button>
            )}
          </div>
        );

      // ── 5: Live capture ────────────────────────────────────────────────
      case 5:
        return (
          <div className="text-center py-4 animate-fade-in">
            <h2 className={`text-xl font-semibold mb-1 ${t.text}`}>{tr('liveCapture.heading')}</h2>
            <p className={`text-sm mb-6 ${t.textSec}`}>
              {tr('liveCapture.description')}
            </p>

            <button
              onClick={() => setShowLiveCapture(true)}
              disabled={uploading}
              className="btn-primary"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {tr('common.processing')}
                </span>
              ) : tr('liveCapture.captureButton')}
            </button>

            <div className={`mt-6 rounded-xl border ${t.border} p-4 text-left`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.textSec}`}>{tr('liveCapture.livenessDetectionTitle')}</p>
              <p className={`text-sm ${t.textSec}`}>
                {tr('liveCapture.livenessDetectionDesc')}
              </p>
            </div>
          </div>
        );

      // ── 6: Final result ────────────────────────────────────────────────
      case 6: {
        if (!finalStatus) {
          return (
            <div className="text-center py-8 animate-fade-in">
              <Spinner />
              <h2 className={`text-xl font-semibold mb-2 ${t.text}`}>{tr('common.processing')}</h2>
              <p className={`text-sm ${t.textSec}`}>{tr('liveCapture.analyzingPhoto')}</p>
            </div>
          );
        }

        const isVerified = finalStatus === 'verified';
        const isFailed = finalStatus === 'failed';

        return (
          <div className="text-center max-w-sm mx-auto space-y-5 animate-fade-in">
            <div className="text-5xl">
              {isVerified ? '\u2705' : isFailed ? '\u274C' : '\u23F3'}
            </div>

            <div>
              <h2 className={`text-xl font-semibold ${t.text}`}>
                {isVerified ? tr('success.heading') : isFailed ? tr('failure.heading') : tr('manualReview.heading')}
              </h2>
              <p className={`text-sm mt-1 ${t.textSec}`}>
                {isVerified
                  ? tr('success.message')
                  : isFailed
                  ? (verificationResults?.failure_reason || tr('failure.message'))
                  : tr('manualReview.message')}
              </p>
            </div>

            {/* Score details */}
            {verificationResults && (
              <div className={`rounded-xl border ${t.border} p-4 text-left text-sm space-y-2`}>
                <div className="flex justify-between">
                  <span className={t.textSec}>Status</span>
                  <span className={`font-semibold capitalize ${isVerified ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-yellow-400'}`}>
                    {finalStatus}
                  </span>
                </div>
                {verificationResults.confidence_score != null && (
                  <div className="flex justify-between">
                    <span className={t.textSec}>Confidence</span>
                    <span className={`font-medium ${t.text}`}>{Math.round(verificationResults.confidence_score * 100)}%</span>
                  </div>
                )}
                {(verificationResults.face_match_results?.score ?? verificationResults.face_match_score) != null && (
                  <div className="flex justify-between">
                    <span className={t.textSec}>Face Match</span>
                    <span className={`font-medium ${t.text}`}>
                      {Math.round((verificationResults.face_match_results?.score ?? verificationResults.face_match_score) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {isFailed && verificationResults?.retry_available !== false && (
              <button onClick={handleRetry} disabled={retryProcessing} className="btn-primary">
                {retryProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {tr('common.processing')}
                  </span>
                ) : tr('common.tryAgain')}
              </button>
            )}

            {isFailed && verificationResults?.retry_available === false && (
              <p className={`text-sm ${t.textSec}`}>{tr('failure.maxRetries')}</p>
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
    <div className={`min-h-screen ${t.bg} flex items-center justify-center p-4 pattern-fingerprint pattern-faint pattern-fade-edges pattern-full`}>
      <div className="w-full max-w-lg">
        {/* Language selector */}
        <div className="flex justify-end mb-3">
          <LanguageSelector variant="dark" />
        </div>

        {/* Organization branding */}
        <BrandedHeader className="mb-6" />

        {/* Main card */}
        <div className="portal-card">
          <div className="p-8">
            {renderProgress()}
            {renderStepContent()}

            {/* Inline error banner */}
            {error && session && (
              <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 animate-fade-in">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Security footer */}
        <div className="mt-6 text-center">
          <p className={`text-xs ${t.textSec}`}>
            {tr('common.securityFooter')}
          </p>
        </div>
      </div>

      {/* Live Capture Modal */}
      {showLiveCapture && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowLiveCapture(false)} />
            <div className="relative bg-[#0b0f19] border border-[rgba(255,255,255,0.07)] rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <LiveCaptureComponent
                onCapture={handleLiveCaptureSuccess}
                onCancel={() => setShowLiveCapture(false)}
                isLoading={uploading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
