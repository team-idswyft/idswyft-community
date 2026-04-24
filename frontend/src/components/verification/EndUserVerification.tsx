import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../../config/api';
import { ContinueOnPhone } from '../ContinueOnPhone';
import { LiveCaptureWidget } from './LiveCaptureWidget';

export interface VerificationProps {
  apiKey: string;
  userId: string;
  sessionToken?: string;
  sessionVerificationId?: string;
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
  sessionToken,
  sessionVerificationId,
  onComplete,
  onRedirect,
  redirectUrl,
  className = '',
  theme = 'light',
  allowedDocumentTypes = ['passport', 'drivers_license', 'national_id'],
  enableMobileHandoff = false,
  verificationMode,
  ageThreshold,
  branding: _branding,
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

  // Passport back-skip state
  const [skipBack, setSkipBack] = useState(false);

  // Result state
  const [finalResult, setFinalResult] = useState<any>(null);
  const [retryProcessing, setRetryProcessing] = useState(false);

  // Voice auth state
  const [voiceAuthEnabled, setVoiceAuthEnabled] = useState(false);
  const [voiceChallengeDigits, setVoiceChallengeDigits] = useState<string | null>(null);
  const [voiceExpiresIn, setVoiceExpiresIn] = useState<number | null>(null);
  const [voiceIsRecording, setVoiceIsRecording] = useState(false);
  const [voiceRecordingDuration, setVoiceRecordingDuration] = useState(0);
  const [voiceHasRecording, setVoiceHasRecording] = useState(false);
  const [voiceStepError, setVoiceStepError] = useState<string | null>(null);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceAudioBlobRef = useRef<Blob | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceDurationRef = useRef<number | null>(null);
  const voiceExpiryRef = useRef<number | null>(null);

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

  // ── API helpers ────────────────────────────────────────────────────────────
  const authHeader: Record<string, string> = sessionToken
    ? { 'X-Session-Token': sessionToken }
    : { 'X-API-Key': apiKey };

  const apiGet = async (path: string) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: authHeader,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // ── Step 1: Initialize ─────────────────────────────────────────────────────
  const startVerification = async () => {
    // When using session token, the verification is already initialized server-side
    if (sessionToken && sessionVerificationId) {
      setVerificationId(sessionVerificationId);
      setCurrentStep(2);
      return;
    }

    if (!apiKey || !userId) { toast.error('Missing required parameters'); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
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
        headers: authHeader,
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
      // Passport or identity flow: skip back doc, go to scanning then liveness
      const backSkipped = isIdentity || data.detected_document_type === 'passport' || data.requires_back === false;
      if (backSkipped) {
        setSkipBack(true);
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

  // ── Step 3b: Poll for front OCR (back-skip modes — identity/passport) ──────
  const pollFrontOCRForIdentity = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Verification timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;
      // Check final_result first — document_only + passport completes after front
      if (data.final_result !== null && data.final_result !== undefined) {
        showFinalResult(data);
      } else if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
        setFrontOCR(data.ocr_data);
        setCurrentStep(6); // Skip back doc — go directly to selfie/liveness
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
        headers: authHeader,
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
  // ── Voice Capture Handlers ──────────────────────────────────
  const resetVoiceState = () => {
    const recorder = voiceMediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.stream.getTracks().forEach(t => t.stop());
      recorder.stop();
    }
    voiceMediaRecorderRef.current = null;
    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    if (voiceDurationRef.current) clearInterval(voiceDurationRef.current);
    setVoiceChallengeDigits(null);
    setVoiceExpiresIn(null);
    setVoiceHasRecording(false);
    setVoiceIsRecording(false);
    setVoiceRecordingDuration(0);
    setVoiceStepError(null);
    voiceAudioBlobRef.current = null;
    voiceChunksRef.current = [];
    if (voiceExpiryRef.current) clearInterval(voiceExpiryRef.current);
  };

  const handleVoiceChallenge = async () => {
    if (!verificationId) return;
    setIsLoading(true);
    setVoiceStepError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/voice-challenge`, {
        method: 'POST',
        headers: authHeader,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to get challenge'); }
      const data = await res.json();
      setVoiceChallengeDigits(data.challenge_digits);
      setVoiceExpiresIn(data.expires_in_seconds);
      if (voiceExpiryRef.current) clearInterval(voiceExpiryRef.current);
      const start = Date.now();
      const expSec = data.expires_in_seconds;
      voiceExpiryRef.current = window.setInterval(() => {
        const remaining = expSec - Math.floor((Date.now() - start) / 1000);
        if (remaining <= 0) {
          setVoiceExpiresIn(0);
          if (voiceExpiryRef.current) clearInterval(voiceExpiryRef.current);
        } else {
          setVoiceExpiresIn(remaining);
        }
      }, 1000) as unknown as number;
    } catch (error) {
      setVoiceStepError(error instanceof Error ? error.message : 'Failed to get challenge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceStartRecording = async () => {
    setVoiceStepError(null);
    voiceChunksRef.current = [];
    voiceAudioBlobRef.current = null;
    setVoiceHasRecording(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType });
        voiceAudioBlobRef.current = blob;
        setVoiceIsRecording(false);
        setVoiceHasRecording(true);
        if (voiceDurationRef.current) clearInterval(voiceDurationRef.current);
        stream.getTracks().forEach(t => t.stop());
      };
      voiceMediaRecorderRef.current = recorder;
      recorder.start(100);
      setVoiceIsRecording(true);
      setVoiceRecordingDuration(0);
      const dStart = Date.now();
      voiceDurationRef.current = window.setInterval(() => {
        setVoiceRecordingDuration(Math.floor((Date.now() - dStart) / 1000));
      }, 200) as unknown as number;
      voiceTimerRef.current = window.setTimeout(() => {
        if (voiceMediaRecorderRef.current?.state === 'recording') {
          voiceMediaRecorderRef.current.stop();
        }
      }, 10000) as unknown as number;
    } catch (err) {
      setVoiceStepError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  };

  const handleVoiceStopRecording = () => {
    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    if (voiceMediaRecorderRef.current?.state === 'recording') {
      voiceMediaRecorderRef.current.stop();
    }
  };

  const handleVoiceSubmit = async () => {
    if (!verificationId || !voiceAudioBlobRef.current) return;
    setIsLoading(true);
    setVoiceStepError(null);
    try {
      const formData = new FormData();
      formData.append('file', voiceAudioBlobRef.current, 'voice.webm');
      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/voice-capture`, {
        method: 'POST',
        headers: authHeader,
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Voice verification failed');
      }
      if (voiceExpiryRef.current) clearInterval(voiceExpiryRef.current);
      // Resume polling for final result
      setCurrentStep(7);
      waitForFinalResult();
    } catch (error) {
      setVoiceStepError(error instanceof Error ? error.message : 'Voice verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const waitForFinalResult = async (attempt = 0) => {
    if (!verificationId || !mountedRef.current) return;
    if (attempt >= MAX_POLL_ATTEMPTS) {
      toast.error('Live capture verification timed out. Please refresh and try again.');
      return;
    }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`);
      if (!mountedRef.current) return;
      // Voice auth: if status is AWAITING_VOICE, transition to voice step
      if (data.status === 'AWAITING_VOICE') {
        setVoiceAuthEnabled(true);
        setCurrentStep(65); // voice step (between 6 and 7)
        return;
      }
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
        headers: authHeader,
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
      setSkipBack(false);
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
  const baseSteps = isAgeOnly ? AGE_ONLY_STEPS
    : (isIdentity || skipBack)
      ? (isDocumentOnly
        ? [{ step: 1, label: 'Start' }, { step: 2, label: 'Front ID' }, { step: 3, label: 'Scanning' }, { step: 7, label: 'Done' }]
        : IDENTITY_STEPS)
    : isDocumentOnly ? DOCUMENT_ONLY_STEPS
    : FULL_STEPS;
  // Insert voice step before Done when voice auth is enabled
  const steps = voiceAuthEnabled
    ? [...baseSteps.filter(s => s.step !== 7), { step: 65, label: 'Voice' }, { step: 7, label: 'Done' }]
    : baseSteps;
  const stepIdx = steps.findIndex(s => s.step === currentStep);
  const activeStepIdx = stepIdx >= 0 ? stepIdx : steps.length - 1;

  const renderProgress = () => (
    <div className="mb-8">
      <div className="stepper">
        {steps.map(({ step, label }, i) => (
          <div key={step} className={`step ${activeStepIdx === i ? 'active' : activeStepIdx > i ? 'done' : ''}`}>
            <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
            <span>{label}</span>
          </div>
        ))}
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
    <div className="file-upload-zone">
      <input type="file" accept="image/*" onChange={onChange} className="hidden" id={id} />
      <label htmlFor={id} className="cursor-pointer block">
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto" style={{ border: '1px solid var(--rule)' }} />
        ) : (
          <div className="py-4">
            <div className="mono" style={{ fontSize: 24, marginBottom: 12, color: 'var(--mid)' }}>+</div>
            <p className="font-medium" style={{ color: 'var(--ink)' }}>{label}</p>
            <p className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--soft)', letterSpacing: '0.04em' }}>JPG, PNG up to 10MB</p>
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
      <div className="mb-5">
        <p className="eyebrow" style={{ marginBottom: 8 }}>Front ID -- Extracted Data</p>
        <div className="result-grid">
          {visible.map(([label, value]) => (
            <React.Fragment key={label}>
              <div>{label}</div>
              <div style={{ color: 'var(--ink)' }}>{value}</div>
            </React.Fragment>
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
            <div className="loading-spinner-glass mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Starting Verification</h2>
            <p className="text-sm" style={{ color: 'var(--mid)' }}>Initializing your verification session...</p>
          </div>
        );

      // ── 2: Upload front document ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                {isAgeOnly ? 'Upload Your ID' : 'Upload Front of ID'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--mid)' }}>
                {isAgeOnly
                  ? 'Upload your government-issued ID to verify your age'
                  : isIdentity
                    ? 'Take a clear photo of the front of your ID -- no back scan needed'
                    : 'Take a clear photo of the front of your government-issued ID'}
              </p>
            </div>

            <div>
              <label className="form-label">Document Type</label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
                className="form-input"
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
                className="btn-accent w-full disabled:opacity-50"
                style={{ padding: '14px 24px', justifyContent: 'center' }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                    Uploading...
                  </span>
                ) : 'Continue'}
              </button>
            )}
          </div>
        );

      // ── 3: Processing front OCR ──────────────────────────────────────────
      case 3:
        return (
          <div className="text-center py-8">
            <div className="loading-spinner-glass mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Reading Your ID</h2>
            <p className="text-sm" style={{ color: 'var(--mid)' }}>Extracting information from the front of your document...</p>
            <p className="mono" style={{ fontSize: 11, marginTop: 8, color: 'var(--soft)', letterSpacing: '0.04em' }}>Please don't close this window</p>
          </div>
        );

      // ── 4: Upload back document ──────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--ink)' }}>Upload Back of ID</h2>
              <p className="text-sm" style={{ color: 'var(--mid)' }}>We need both sides to cross-validate your identity</p>
            </div>

            {renderOCRSummary()}

            {renderFileArea('back-upload', backPreviewUrl, handleBackFileSelect, 'Upload Back of ID')}

            {backFile && (
              <button
                onClick={uploadBackDocument}
                disabled={isLoading}
                className="btn-accent w-full disabled:opacity-50"
                style={{ padding: '14px 24px', justifyContent: 'center' }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                    Uploading...
                  </span>
                ) : 'Continue'}
              </button>
            )}
          </div>
        );

      // ── 5: Cross-validation processing ──────────────────────────────────
      case 5:
        return (
          <div className="text-center py-8">
            <div className="loading-spinner-glass mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Verifying Your Documents</h2>
            <p className="text-sm" style={{ color: 'var(--mid)' }}>Cross-checking the front and back of your ID...</p>
            <ul className="checklist" style={{ marginTop: 16, maxWidth: 240, marginLeft: 'auto', marginRight: 'auto' }}>
              <li><span className="dot">--</span><span>Barcode / QR scanning</span></li>
              <li><span className="dot">--</span><span>Data cross-validation</span></li>
              <li style={{ borderBottom: 'none' }}><span className="dot">--</span><span>Authenticity check</span></li>
            </ul>
          </div>
        );

      // ── 6: Live capture ──────────────────────────────────────────────────
      case 6:
        return (
          <LiveCaptureWidget
            apiKey={apiKey}
            sessionToken={sessionToken}
            verificationId={verificationId!}
            theme={theme}
            onComplete={() => {
              setCurrentStep(7); // Show "processing" in step 7 until poll resolves
              waitForFinalResult();
            }}
            onError={msg => toast.error(msg)}
          />
        );

      // ── 65: Voice capture (between live and result) ────────────────────
      case 65:
        return (
          <div className="text-center max-w-sm mx-auto space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>Speaker Verification</h2>
            <p className="text-sm" style={{ color: 'var(--mid)' }}>
              Speak the digits shown below into your microphone.
            </p>

            {/* Microphone icon */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto',
              border: `2px solid ${voiceIsRecording ? 'var(--accent, #22d3ee)' : 'var(--border, #ddd)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.3s',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={voiceIsRecording ? 'var(--accent, #22d3ee)' : 'var(--mid, #888)'} strokeWidth="1.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>

            {/* Challenge digits */}
            {voiceChallengeDigits && (voiceExpiresIn === null || voiceExpiresIn > 0) && (
              <div style={{ padding: 16, border: '1px solid var(--border, #ddd)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Speak these digits
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--ink)' }}>
                  {voiceChallengeDigits}
                </div>
                {voiceExpiresIn !== null && (
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: voiceExpiresIn < 30 ? '#ef4444' : 'var(--mid)', marginTop: 6 }}>
                    Expires in {voiceExpiresIn}s
                  </div>
                )}
              </div>
            )}

            {voiceIsRecording && (
              <p style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent, #22d3ee)' }}>
                Recording: {voiceRecordingDuration}s
              </p>
            )}
            {voiceHasRecording && !voiceIsRecording && !isLoading && (
              <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#22c55e' }}>
                Recording captured ({voiceRecordingDuration}s)
              </p>
            )}

            <div className="space-y-2">
              {!voiceChallengeDigits && !isLoading && (
                <button className="btn-primary w-full" onClick={handleVoiceChallenge} disabled={isLoading}>
                  Get Challenge Digits
                </button>
              )}
              {voiceChallengeDigits && !voiceIsRecording && !voiceHasRecording && (voiceExpiresIn === null || voiceExpiresIn > 0) && (
                <button className="btn-primary w-full" onClick={handleVoiceStartRecording}>
                  Start Recording
                </button>
              )}
              {voiceIsRecording && (
                <button className="btn-primary w-full" onClick={handleVoiceStopRecording}>
                  Stop Recording
                </button>
              )}
              {voiceHasRecording && !voiceIsRecording && !isLoading && (
                <button className="btn-primary w-full" onClick={handleVoiceSubmit}>
                  Submit Voice Capture
                </button>
              )}
              {isLoading && (
                <div className="text-center py-2">
                  <div className="loading-spinner-glass mx-auto" />
                </div>
              )}
            </div>

            {voiceStepError && (
              <div className="space-y-2">
                <p style={{ fontSize: 12, color: '#ef4444', fontFamily: 'var(--mono)' }}>{voiceStepError}</p>
                <button className="btn-primary w-full" onClick={resetVoiceState}>
                  Try Again
                </button>
              </div>
            )}
            {voiceChallengeDigits && voiceExpiresIn !== null && voiceExpiresIn <= 0 && !voiceStepError && (
              <button className="btn-primary w-full" onClick={() => { resetVoiceState(); handleVoiceChallenge(); }}>
                Request New Challenge
              </button>
            )}
          </div>
        );

      // ── 7: Final result ──────────────────────────────────────────────────
      case 7: {
        if (!finalResult) {
          // Still waiting for live capture result
          return (
            <div className="text-center py-8">
              <div className="loading-spinner-glass mx-auto mb-5" />
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Processing Verification</h2>
              <p className="text-sm" style={{ color: 'var(--mid)' }}>Analyzing your live photo...</p>
            </div>
          );
        }

        // v2: final_result has user-facing status, status has internal machine state
        const status = finalResult.final_result ?? finalResult.status;
        const isVerified = status === 'verified';
        const isFailed = status === 'failed';

        return (
          <div className="text-center max-w-sm mx-auto space-y-5">
            <div className={isVerified ? 'result-badge badge-success' : isFailed ? 'result-badge badge-error' : 'result-badge badge-warning'} style={{
              display: 'inline-flex', padding: '8px 16px', margin: '0 auto',
              fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {isVerified ? 'VERIFIED' : isFailed ? 'FAILED' : 'REVIEW'}
            </div>

            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                {isAgeOnly
                  ? isVerified ? 'Age Verified' : 'Age Verification Failed'
                  : isVerified ? 'Identity Verified' : isFailed ? 'Verification Failed' : 'Under Review'}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--mid)' }}>
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
            <div className="result-grid text-left">
              <div>Status</div>
              <div>
                <span className={isVerified ? 'badge-success' : isFailed ? 'badge-error' : 'badge-warning'}
                  style={{ textTransform: 'capitalize' }}>{status}</span>
              </div>
              {/* Age verification */}
              {finalResult.age_verification && (
                <>
                  <div>Age Check</div>
                  <div>
                    <span className={finalResult.age_verification.is_of_age ? 'badge-success' : 'badge-error'}>
                      {finalResult.age_verification.is_of_age ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <div>Minimum Age</div>
                  <div style={{ color: 'var(--ink)' }}>{finalResult.age_verification.age_threshold}+</div>
                </>
              )}
              {/* Cross-validation: v2 uses overall_score, fall back to weighted_score / v1 flat field */}
              {(finalResult.cross_validation_results?.overall_score ?? finalResult.cross_validation_results?.weighted_score ?? finalResult.cross_validation_score) != null && (
                <>
                  <div>Doc Cross-Check</div>
                  <div style={{ color: 'var(--ink)' }}>{Math.round((finalResult.cross_validation_results?.overall_score ?? finalResult.cross_validation_results?.weighted_score ?? finalResult.cross_validation_score) * 100)}%</div>
                </>
              )}
              {finalResult.cross_validation_results?.verdict && (
                <>
                  <div>Verdict</div>
                  <div>
                    <span className={finalResult.cross_validation_results.verdict === 'PASS' ? 'badge-success' : finalResult.cross_validation_results.verdict === 'REJECT' ? 'badge-error' : 'badge-warning'}>
                      {finalResult.cross_validation_results.verdict}
                    </span>
                  </div>
                </>
              )}
              {/* Face match: v2 uses similarity_score, fall back to score / v1 flat field */}
              {(finalResult.face_match_results?.similarity_score ?? finalResult.face_match_results?.score ?? finalResult.face_match_score) != null && (
                <>
                  <div>Face Match</div>
                  <div style={{ color: 'var(--ink)' }}>{Math.round((finalResult.face_match_results?.similarity_score ?? finalResult.face_match_results?.score ?? finalResult.face_match_score) * 100)}%</div>
                </>
              )}
              {/* Liveness: v2 uses liveness_results.score (not liveness_score), fall back to v1 fields */}
              {(finalResult.liveness_results?.score ?? finalResult.liveness_results?.liveness_score ?? finalResult.liveness_score) != null && (
                <>
                  <div>Liveness</div>
                  <div style={{ color: 'var(--ink)' }}>
                    {Math.round((finalResult.liveness_results?.score ?? finalResult.liveness_results?.liveness_score ?? finalResult.liveness_score) * 100)}%
                    {finalResult.liveness_results?.passed != null && (
                      <span className={`ml-2 ${finalResult.liveness_results.passed ? 'badge-success' : 'badge-error'}`}
                        style={{ fontSize: 10, padding: '1px 6px' }}>
                        {finalResult.liveness_results.passed ? 'PASS' : 'FAIL'}
                      </span>
                    )}
                  </div>
                </>
              )}
              {/* AML Screening */}
              {finalResult.aml_screening && (
                <>
                  <div>AML Screening</div>
                  <div>
                    <span className={finalResult.aml_screening.risk_level === 'clear' ? 'badge-success' : finalResult.aml_screening.match_found ? 'badge-error' : 'badge-warning'}>
                      {finalResult.aml_screening.risk_level === 'clear' ? 'Clear' : finalResult.aml_screening.risk_level?.replace('_', ' ')}
                    </span>
                  </div>
                </>
              )}
              {/* Risk Score */}
              {finalResult.risk_score && (
                <>
                  <div>Risk Score</div>
                  <div>
                    <span className={finalResult.risk_score.risk_level === 'low' ? 'badge-success' : finalResult.risk_score.risk_level === 'medium' ? 'badge-warning' : 'badge-error'}>
                      {finalResult.risk_score.overall_score}/100 ({finalResult.risk_score.risk_level})
                    </span>
                  </div>
                </>
              )}
              {finalResult.confidence_score != null && (
                <>
                  <div>Confidence</div>
                  <div style={{ color: 'var(--ink)' }}>{Math.round(finalResult.confidence_score * 100)}%</div>
                </>
              )}
              {/* Rejection details */}
              {finalResult.rejection_reason && (
                <>
                  <div>Rejection</div>
                  <div className="mono" style={{ fontSize: 11, color: 'oklch(0.68 0.17 25)' }}>{finalResult.rejection_reason}</div>
                  {finalResult.rejection_detail && (
                    <>
                      <div>Detail</div>
                      <div style={{ color: 'var(--mid)', fontSize: 11 }}>{finalResult.rejection_detail}</div>
                    </>
                  )}
                </>
              )}
            </div>

            {isFailed && finalResult.retry_available === true && (
              <button
                onClick={handleRetry}
                disabled={retryProcessing}
                className="btn-accent w-full disabled:opacity-50"
                style={{ padding: '12px 24px', justifyContent: 'center' }}
              >
                {retryProcessing ? 'Restarting...' : 'Try Again'}
              </button>
            )}
            {isFailed && finalResult.retry_available === false && (
              <p className="mono" style={{ fontSize: 11, color: 'oklch(0.68 0.17 25)', letterSpacing: '0.04em' }}>Maximum retry attempts reached.</p>
            )}

            {(redirectUrl || onRedirect) && (
              <p className="mono" style={{ fontSize: 11, color: 'var(--soft)', letterSpacing: '0.04em' }}>Redirecting in 3 seconds...</p>
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
    <div className={`min-h-screen ${className} flex items-center justify-center p-4`} style={{ background: 'var(--paper)' }}>
      <div className="w-full max-w-lg">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="p-8">
            {showMobileChoice ? (
              <div className="py-4">
                <h2 className="text-xl font-bold text-center mb-1" style={{ color: 'var(--ink)' }}>How would you like to verify?</h2>
                <p className="text-sm text-center mb-6" style={{ color: 'var(--mid)' }}>Complete on this device or scan a QR code to use your phone</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="card p-5 flex flex-col items-center text-center gap-3">
                    <div className="mono" style={{ fontSize: 13, color: 'var(--mid)', letterSpacing: '0.04em' }}>DESKTOP</div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Start Here</h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--mid)' }}>Use your webcam and upload documents on this device</p>
                    </div>
                    <button
                      onClick={() => { setShowMobileChoice(false); startVerification(); }}
                      className="btn-accent mt-1 w-full"
                      style={{ padding: '10px 16px', justifyContent: 'center' }}
                    >
                      Start on This Device
                    </button>
                  </div>

                  <ContinueOnPhone
                    apiKey={apiKey}
                    userId={userId}
                    sessionToken={sessionToken}
                    verificationId={verificationId || sessionVerificationId || undefined}
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
