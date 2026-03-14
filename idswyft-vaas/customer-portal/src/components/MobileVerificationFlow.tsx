// Mobile-first camera verification flow for VaaS customer portal.
// Adapted from frontend/src/pages/MobileVerificationPage.tsx for VaaS context:
//   - Uses VaaS session token (prop) instead of handoff tokens
//   - Uses verificationAPI/customerPortalAPI for session + document uploads
//   - Removes desktop handoff notification logic
//   - Keeps the full dark-theme camera-first UX

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VerificationSession } from '../types';
import customerPortalAPI from '../services/api';
import verificationAPI from '../services/verificationApi';
import { useOrganization } from '../contexts/OrganizationContext';
import IDCameraCapture from './IDCameraCapture';
import SelfieCameraCapture from './SelfieCameraCapture';

// ─── Design system CSS ─────────────────────────────────────────────────────
const css = `
:root {
  --navy:   #040d1a;
  --navy2:  #071428;
  --teal:   #00d4b4;
  --teal2:  #00ffdf;
  --white:  #e8f4f8;
  --muted:  #4a6a7a;
  --border: rgba(0,212,180,0.15);
  --glass:  rgba(0,212,180,0.04);
}

@keyframes segPulse  { 0%,100%{opacity:0.5} 50%{opacity:1} }
@keyframes scan      { 0%{top:10px;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:calc(100% - 10px);opacity:0} }
@keyframes spin      { to{transform:rotate(360deg)} }
@keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes fscan     { 0%{top:18%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:88%;opacity:0} }
@keyframes dotsDrift { from{background-position:0 0} to{background-position:18px 18px} }
@keyframes gPulse    { 0%,100%{box-shadow:0 0 18px rgba(0,212,180,0.18),inset 0 0 18px rgba(0,212,180,0.04)} 50%{box-shadow:0 0 36px rgba(0,212,180,0.36),inset 0 0 28px rgba(0,212,180,0.09)} }
@keyframes sPulse    { 0%,100%{box-shadow:0 0 32px rgba(0,212,180,0.18)} 50%{box-shadow:0 0 64px rgba(0,212,180,0.38)} }
@keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes slideIn   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes focusPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
@keyframes shutterFlash { 0%{opacity:0} 10%{opacity:0.8} 100%{opacity:0} }

.mv-fade-up { animation: fadeUp 0.38s ease both; }
`;

// ─── Step definitions ───────────────────────────────────────────────────────
const STEP_LABELS = ['Front ID', 'Back ID', 'Checking', 'Live Capture', 'Complete'];

// ─── Types ──────────────────────────────────────────────────────────────────
type Screen = 'front' | 'back' | 'checking' | 'live' | 'done';
const SCREENS: Screen[] = ['front', 'back', 'checking', 'live', 'done'];

// ─── Sub-Components ─────────────────────────────────────────────────────────

/* Step progress tracker */
const StepTracker: React.FC<{ activeIdx: number }> = ({ activeIdx }) => (
  <div style={{ padding: '12px 24px 0' }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {STEP_LABELS.map((_, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
        return (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, position: 'relative',
            background: state === 'done' ? 'var(--teal)' : 'rgba(74,106,122,0.2)',
            boxShadow: state === 'done' ? '0 0 6px rgba(0,212,180,0.4)' : 'none',
          }}>
            {state === 'active' && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: 2,
                background: 'linear-gradient(90deg, var(--teal), transparent)',
                animation: 'segPulse 1.8s ease-in-out infinite',
              }} />
            )}
          </div>
        );
      })}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
      {STEP_LABELS.map((label, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
        return (
          <span key={i} style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: state === 'done' ? 'var(--teal)' : state === 'active' ? 'var(--white)' : 'rgba(74,106,122,0.5)',
          }}>{label}</span>
        );
      })}
    </div>
  </div>
);

/* Tip bar */
const TipBar: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--glass)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '9px 13px',
    fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(232,244,248,0.55)', flexShrink: 0,
  }}>
    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
    {text}
  </div>
);

/* Primary button */
const PrimaryBtn: React.FC<{
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}> = ({ children, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: '100%', padding: 17, borderRadius: 14, border: 'none',
      background: disabled ? 'rgba(0,212,180,0.35)' : 'var(--teal)',
      color: 'var(--navy)',
      fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', overflow: 'hidden',
      transition: 'all 0.18s', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {children}
  </button>
);

/* ID Card Viewfinder */
const IDViewfinder: React.FC<{
  variant: 'front' | 'back'; processing: boolean; processingLabel: string;
  previewUrl?: string | null;
}> = ({ variant, processing, processingLabel, previewUrl }) => {
  const corners = [
    { top: 10, left: 10, bw: '2px 0 0 2px', br: '4px 0 0 0' },
    { top: 10, right: 10, bw: '2px 2px 0 0', br: '0 4px 0 0' },
    { bottom: 10, left: 10, bw: '0 0 2px 2px', br: '0 0 0 4px' },
    { bottom: 10, right: 10, bw: '0 2px 2px 0', br: '0 0 4px 0' },
  ];

  return (
    <div style={{
      width: '100%', aspectRatio: '1.586', borderRadius: 18,
      background: '#020a14', position: 'relative', overflow: 'hidden',
      flexShrink: 0, marginBottom: 18,
    }}>
      {previewUrl ? (
        <img src={previewUrl} alt="Document preview" style={{
          position: 'absolute', inset: 16, borderRadius: 10,
          objectFit: 'cover', width: 'calc(100% - 32px)', height: 'calc(100% - 32px)',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 16, borderRadius: 10,
          background: 'linear-gradient(135deg, #0c2033, #152d45)', padding: '13px 15px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          {variant === 'front' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: 30, height: 22, borderRadius: 4, background: 'linear-gradient(135deg, #c8a84b, #e8c96a)', opacity: 0.75 }} />
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '62%', marginBottom: 8 }} />
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '42%' }} />
              </div>
              <div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,212,180,0.18)', width: '90%', marginBottom: 4 }} />
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,212,180,0.18)', width: '85%' }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, justifyContent: 'center' }}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} style={{
                    height: i % 4 === 0 ? 6 : i % 2 === 0 ? 4 : 3,
                    borderRadius: 1,
                    background: 'rgba(0,212,180,0.22)',
                    width: `${48 + Math.abs(Math.sin(i * 1.3)) * 38}%`,
                  }} />
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ height: 4, borderRadius: 2, background: 'rgba(0,212,180,0.18)', width: `${90 - i * 5}%`, marginBottom: 4 }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {corners.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', width: 22, height: 22,
          borderStyle: 'solid', borderColor: 'var(--teal)',
          borderWidth: c.bw, borderRadius: c.br,
          ...(c.top !== undefined && { top: c.top }),
          ...(c.bottom !== undefined && { bottom: c.bottom }),
          ...(c.left !== undefined && { left: c.left }),
          ...(c.right !== undefined && { right: c.right }),
        } as React.CSSProperties} />
      ))}

      {!processing && (
        <div style={{
          position: 'absolute', left: 10, right: 10, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--teal), transparent)',
          boxShadow: '0 0 10px var(--teal)',
          animation: 'scan 2s ease-in-out infinite',
        }} />
      )}

      {processing && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(4,13,26,0.88)',
          backdropFilter: 'blur(3px)', borderRadius: 18,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{
            width: 46, height: 46, border: '2px solid rgba(0,212,180,0.15)',
            borderTopColor: 'var(--teal)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: 'var(--teal)', letterSpacing: '0.18em',
            animation: 'blink 1.4s ease infinite',
          }}>{processingLabel}</span>
        </div>
      )}
    </div>
  );
};

/* Ambient glow */
const AmbientGlow: React.FC = () => (
  <>
    <div style={{
      position: 'absolute', top: -60, left: -60, width: 240, height: 240,
      borderRadius: '50%', pointerEvents: 'none',
      background: 'radial-gradient(circle, rgba(0,212,180,0.05), transparent 70%)',
    }} />
    <div style={{
      position: 'absolute', bottom: -40, right: -40, width: 200, height: 200,
      borderRadius: '50%', pointerEvents: 'none',
      background: 'radial-gradient(circle, rgba(0,212,180,0.04), transparent 70%)',
    }} />
  </>
);

/* Oval Face Viewfinder */
const OvalFaceViewfinder: React.FC<{
  processing: boolean; previewUrl?: string | null;
}> = ({ processing, previewUrl }) => {
  const ovalRadius = '114px 114px 94px 94px';
  return (
    <div style={{
      width: 188, height: 228, borderRadius: ovalRadius,
      background: '#020a14', position: 'relative', overflow: 'hidden',
      margin: '0 auto 22px', flexShrink: 0,
    }}>
      {previewUrl && (
        <img src={previewUrl} alt="Selfie preview" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', borderRadius: ovalRadius,
        }} />
      )}

      {!previewUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(0,212,180,0.12) 1px, transparent 1px)',
          backgroundSize: '18px 18px', opacity: 0.6,
          animation: 'dotsDrift 4s linear infinite',
        }} />
      )}

      {!previewUrl && (
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          width: 90, height: 120, opacity: 0.07,
          background: 'linear-gradient(to bottom, transparent, var(--white))',
          clipPath: 'polygon(35% 0%,65% 0%,80% 28%,82% 58%,92% 70%,100% 100%,0% 100%,8% 70%,18% 58%,20% 28%)',
        }} />
      )}

      {!processing && !previewUrl && (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 1.5,
          background: 'linear-gradient(90deg, transparent, var(--teal), transparent)',
          animation: 'fscan 1.9s ease-in-out infinite',
        }} />
      )}

      <div style={{
        position: 'absolute', inset: 0, borderRadius: ovalRadius,
        border: '2px solid var(--teal)',
        animation: processing ? 'none' : 'gPulse 2.2s ease infinite',
      }} />

      {processing && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(4,13,26,0.88)',
          backdropFilter: 'blur(3px)', borderRadius: ovalRadius,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 46, height: 46, border: '2px solid rgba(0,212,180,0.15)',
            borderTopColor: 'var(--teal)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: 'var(--teal)', letterSpacing: '0.18em',
            animation: 'blink 1.4s ease infinite',
          }}>CHECKING</span>
        </div>
      )}
    </div>
  );
};

/* Liveness Cues */
const LIVENESS_CUES = [
  { emoji: '\u{1F610}', label: 'Look ahead' },
  { emoji: '\u{1F60A}', label: 'Smile' },
  { emoji: '\u2194', label: 'Turn slightly' },
] as const;

const LivenessCues: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (hidden) return;
    const iv = setInterval(() => setActiveIdx(i => (i + 1) % 3), 1600);
    return () => clearInterval(iv);
  }, [hidden]);

  if (hidden) return null;

  return (
    <div style={{ display: 'flex', gap: 22, justifyContent: 'center', margin: '18px 0' }}>
      {LIVENESS_CUES.map((cue, i) => {
        const isActive = i === activeIdx;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
              background: isActive ? 'rgba(0,212,180,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1.5px solid ${isActive ? 'var(--teal)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: isActive ? '0 0 12px rgba(0,212,180,0.2)' : 'none',
              transition: 'all 0.3s ease',
            }}>{cue.emoji}</div>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: '0.06em',
              color: isActive ? 'var(--teal)' : 'var(--muted)',
              transition: 'color 0.3s ease',
            }}>{cue.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
interface MobileVerificationFlowProps {
  sessionToken: string;
}

const MobileVerificationFlow: React.FC<MobileVerificationFlowProps> = ({ sessionToken }) => {
  const { setBranding, setOrganizationName } = useOrganization();

  // Session state
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Verification flow state
  const [screenIdx, setScreenIdx] = useState(0);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentType, setDocumentType] = useState('national_id');

  // File state
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraVariant, setCameraVariant] = useState<'front' | 'back'>('front');
  const [cameraSupported, setCameraSupported] = useState(true);
  const [showSelfieCamera, setShowSelfieCamera] = useState(false);

  // Checking screen messages
  const [checkingMsg, setCheckingMsg] = useState('Verifying your document\u2026');

  // Final result
  const [finalResult, setFinalResult] = useState<any>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const mountedRef = useRef(true);

  const screen: Screen = SCREENS[screenIdx];

  // ── Cleanup + camera support check ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    setCameraSupported(!!navigator.mediaDevices?.getUserMedia);
    return () => {
      mountedRef.current = false;
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
  }, []);

  // ── Session initialization (VaaS context) ─────────────────────────────
  useEffect(() => {
    if (!sessionToken) {
      setError('Invalid link \u2014 no session token provided.');
      setLoading(false);
      return;
    }

    const initSession = async () => {
      try {
        const sessionData = await customerPortalAPI.getVerificationSession(sessionToken);
        if (!mountedRef.current) return;
        setSession(sessionData);

        // Apply org branding
        if (sessionData.organization?.branding) {
          setBranding(sessionData.organization.branding);
        }
        if (sessionData.organization?.name) {
          setOrganizationName(sessionData.organization.name);
        }

        setLoading(false);
      } catch (err: any) {
        if (!mountedRef.current) return;
        if (err?.status === 410) {
          setStaleMessage(err.message || 'This verification link is no longer active.');
        } else {
          setError(err.message || 'Failed to load verification session');
        }
        setLoading(false);
      }
    };

    initSession();
  }, [sessionToken]);

  // ── Start verification via existing VaaS API ──────────────────────────
  const startVerification = async (): Promise<string | null> => {
    if (!session) return null;
    try {
      const vId = await verificationAPI.startVerification(session);
      if (!mountedRef.current) return null;
      setVerificationId(vId);
      return vId;
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message || 'Failed to start verification');
      return null;
    }
  };

  // ── Camera callbacks ─────────────────────────────────────────────────────
  const openCamera = useCallback((variant: 'front' | 'back') => {
    setCameraVariant(variant);
    setShowCamera(true);
  }, []);

  const handleCameraCapture = useCallback((file: File) => {
    setShowCamera(false);
    if (cameraVariant === 'front') {
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      setFrontFile(file);
      setFrontPreviewUrl(URL.createObjectURL(file));
    } else {
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setBackFile(file);
      setBackPreviewUrl(URL.createObjectURL(file));
    }
    setStepError(null);
  }, [cameraVariant, frontPreviewUrl, backPreviewUrl]);

  const handleCameraClose = useCallback(() => setShowCamera(false), []);

  const handleCameraFallback = useCallback(() => {
    setShowCamera(false);
    setCameraSupported(false);
    const inputId = cameraVariant === 'front' ? 'mv-front-upload' : 'mv-back-upload';
    setTimeout(() => document.getElementById(inputId)?.click(), 100);
  }, [cameraVariant]);

  const handleSelfieCameraCapture = useCallback((file: File) => {
    setShowSelfieCamera(false);
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfieFile(file);
    setSelfiePreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  }, [selfiePreviewUrl]);

  const handleSelfieCameraClose = useCallback(() => setShowSelfieCamera(false), []);

  const handleSelfieCameraFallback = useCallback(() => {
    setShowSelfieCamera(false);
    setCameraSupported(false);
    setTimeout(() => document.getElementById('mv-selfie-upload')?.click(), 100);
  }, []);

  // ── File input handlers (fallback) ───────────────────────────────────────
  const handleFrontSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
    setFrontFile(file);
    setFrontPreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  const handleBackSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    setBackFile(file);
    setBackPreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  const handleSelfieSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfieFile(file);
    setSelfiePreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  // ── Upload front document ──────────────────────────────────────────────
  const uploadFront = async () => {
    if (!frontFile || !session) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      let vId = verificationId;
      if (!vId) {
        vId = await startVerification();
        if (!vId) return;
      }

      await verificationAPI.uploadDocument(session, vId, frontFile, documentType);
      if (!mountedRef.current) return;
      setScreenIdx(1); // Move to back ID
      pollOCR(vId, 0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  // ── Poll OCR completion ────────────────────────────────────────────────
  const pollOCR = async (vId: string, attempt: number) => {
    if (!session || !mountedRef.current) return;
    if (attempt >= 60) { setStepError('OCR timed out. Please try again.'); return; }
    try {
      const results = await verificationAPI.getResults(session, vId);
      if (!mountedRef.current) return;
      if (results.ocr_data && Object.keys(results.ocr_data).length > 0) return; // OCR done
      if (results.final_result === 'failed') {
        customerPortalAPI.reportResult(sessionToken, results).catch(() => {});
        showFinal(results);
        return;
      }
      setTimeout(() => pollOCR(vId, attempt + 1), 2000);
    } catch {
      if (mountedRef.current) setTimeout(() => pollOCR(vId, attempt + 1), 2000);
    }
  };

  // ── Upload back document ───────────────────────────────────────────────
  const uploadBack = async () => {
    if (!backFile || !verificationId || !session) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      await verificationAPI.uploadBackOfId(session, verificationId, backFile, documentType);
      if (!mountedRef.current) return;
      setScreenIdx(2); // Checking screen
      pollCrossValidation(verificationId, 0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  // ── Poll cross-validation ─────────────────────────────────────────────
  const pollCrossValidation = async (vId: string, attempt: number) => {
    if (!session || !mountedRef.current) return;
    if (attempt >= 60) { setStepError('Validation timed out.'); return; }
    if (attempt === 0) setCheckingMsg('Verifying your document\u2026');
    try {
      const results = await verificationAPI.getResults(session, vId);
      if (!mountedRef.current) return;
      const isComplete = !!results.cross_validation_results || results.final_result !== null;
      if (isComplete) {
        if (results.final_result === 'failed') {
          customerPortalAPI.reportResult(sessionToken, results).catch(() => {});
          showFinal(results);
        } else {
          setScreenIdx(3); // Live capture
        }
      } else {
        setTimeout(() => pollCrossValidation(vId, attempt + 1), 2000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollCrossValidation(vId, attempt + 1), 2000);
    }
  };

  // Cycling check messages
  useEffect(() => {
    if (screen !== 'checking') return;
    const msgs = ['Verifying your document\u2026', 'Cross-checking details\u2026', 'Almost there\u2026'];
    let idx = 0;
    const iv = setInterval(() => { idx = (idx + 1) % msgs.length; setCheckingMsg(msgs[idx]); }, 1800);
    return () => clearInterval(iv);
  }, [screen]);

  // ── Upload selfie ─────────────────────────────────────────────────────
  const uploadSelfie = async () => {
    if (!selfieFile || !verificationId || !session) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      await verificationAPI.captureSelfie(session, verificationId, selfieFile);
      if (!mountedRef.current) return;
      setScreenIdx(4); // Done screen

      // Submit verification
      try {
        await customerPortalAPI.submitVerification(sessionToken, idempotencyKey);
      } catch (submitErr: any) {
        // 409 = already submitted, not a real error
        if (submitErr?.status !== 409) {
          console.warn('[MobileFlow] Submit verification warning:', submitErr.message);
        }
      }

      pollFinalResult(verificationId, 0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  const pollFinalResult = async (vId: string, attempt: number) => {
    if (!session || !mountedRef.current) return;
    if (attempt >= 60) return;
    try {
      const results = await verificationAPI.getResults(session, vId);
      if (!mountedRef.current) return;
      if (results.final_result !== null && results.final_result !== undefined) {
        // Report result back to VaaS backend (fire-and-forget)
        customerPortalAPI.reportResult(sessionToken, results).catch(() => {});
        showFinal(results);
      } else {
        setTimeout(() => pollFinalResult(vId, attempt + 1), 3000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollFinalResult(vId, attempt + 1), 3000);
    }
  };

  const showFinal = (data: any) => {
    if (!mountedRef.current) return;
    setFinalResult(data);
    setScreenIdx(4);
  };

  // ─── Shared styles ────────────────────────────────────────────────────
  const shellStyle: React.CSSProperties = {
    minHeight: '100dvh', width: '100%',
    background: 'var(--navy)',
    fontFamily: "'Syne', sans-serif",
    color: 'var(--white)',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  };

  const screenStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '0 24px 32px', overflow: 'hidden',
    position: 'relative',
  };

  // ─── Loading state ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={shellStyle}>
        <style>{css}</style>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, border: '2.5px solid rgba(0,212,180,0.12)',
            borderTopColor: 'var(--teal)', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            color: 'var(--muted)', letterSpacing: '0.08em',
          }}>Preparing your session\u2026</span>
        </div>
      </div>
    );
  }

  // ─── Stale link state ───────────────────────────────────────────────
  if (staleMessage) {
    return (
      <div style={shellStyle}>
        <style>{css}</style>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', gap: 16, textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            border: '2px solid rgba(0,212,180,0.3)',
            background: 'rgba(0,212,180,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>{'\u2713'}</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            Verification Link Used
          </h2>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            {staleMessage}
          </p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, marginTop: 8 }}>
            If you need to verify again, please request a new link from the organization.
          </p>
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={shellStyle}>
        <style>{css}</style>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', gap: 16, textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            border: '2px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>!</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            Unable to Load
          </h2>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  // ─── Verification flow ────────────────────────────────────────────────
  return (
    <div style={shellStyle}>
      <style>{css}</style>

      {/* Status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px 10px',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      }}>
        <span style={{ color: 'var(--muted)' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ color: 'var(--teal)', letterSpacing: '0.1em', fontSize: 10, textTransform: 'uppercase' }}>
          Secure Session
        </span>
        <span style={{ color: 'var(--muted)' }}>
          <span style={{ opacity: 1 }}>\u25CF</span>
          <span style={{ opacity: 0.7 }}>\u25CF</span>
          <span style={{ opacity: 0.4 }}>\u25CF</span>
        </span>
      </div>

      {/* Step progress */}
      <StepTracker activeIdx={screenIdx} />

      {/* Screen content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: 20 }}>

        {/* ── Screen 0: Front ID ─────────────────────────────────── */}
        {screen === 'front' && (
          <div key="front" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 400,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 1 of 5 \u2014 Front of ID</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Scan the front<br />of your ID
            </h1>

            <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
              Position your ID card and take a clear photo. Make sure all four corners are visible and the text is clear.
            </p>

            <div style={{ marginBottom: 14 }}>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--navy2)',
                  color: 'var(--white)', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, outline: 'none',
                }}
              >
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
              </select>
            </div>

            <TipBar text="Good lighting \u00B7 No glare \u00B7 Hold steady" />

            <div style={{ marginTop: 12 }} />
            <IDViewfinder variant="front" processing={isProcessing} processingLabel="READING FRONT" previewUrl={frontPreviewUrl} />

            <input type="file" accept="image/*" capture="environment" id="mv-front-upload" style={{ display: 'none' }}
              onChange={handleFrontSelect} />

            {!frontFile ? (
              <PrimaryBtn
                onClick={() => cameraSupported ? openCamera('front') : document.getElementById('mv-front-upload')?.click()}
                disabled={isProcessing}
              >
                Take Photo of Front
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={uploadFront} disabled={isProcessing}>
                {isProcessing ? 'Processing\u2026' : 'Scan Front of ID'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Screen 1: Back ID ──────────────────────────────────── */}
        {screen === 'back' && (
          <div key="back" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 2 of 5 \u2014 Back of ID</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Now flip it over<br />and scan the back
            </h1>

            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
              Keep the same conditions \u2014 good lighting, flat surface. The barcode on the back must be fully visible.
            </p>

            <TipBar text="Barcode must be unobstructed" />

            <div style={{ marginTop: 12 }} />
            <IDViewfinder variant="back" processing={isProcessing} processingLabel="READING BARCODE" previewUrl={backPreviewUrl} />

            <input type="file" accept="image/*" capture="environment" id="mv-back-upload" style={{ display: 'none' }}
              onChange={handleBackSelect} />

            {!backFile ? (
              <PrimaryBtn
                onClick={() => cameraSupported ? openCamera('back') : document.getElementById('mv-back-upload')?.click()}
                disabled={isProcessing}
              >
                Take Photo of Back
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={uploadBack} disabled={isProcessing}>
                {isProcessing ? 'Processing\u2026' : 'Scan Back of ID'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Screen 2: Checking ─────────────────────────────────── */}
        {screen === 'checking' && (
          <div key="checking" className="mv-fade-up" style={{
            ...screenStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 24,
            }}>Step 3 of 5 \u2014 Verification</span>

            <div style={{
              width: 80, height: 80, border: '2.5px solid rgba(0,212,180,0.12)',
              borderTopColor: 'var(--teal)', borderRadius: '50%',
              boxShadow: '0 0 30px rgba(0,212,180,0.1)',
              animation: 'spin 1s linear infinite', marginBottom: 18,
            }} />

            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {checkingMsg}
            </p>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--muted)',
              letterSpacing: '0.08em',
            }}>This only takes a moment</p>

            <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Document read', 'Details matched', 'Security checks'].map(tag => (
                <span key={tag} style={{
                  padding: '5px 10px', borderRadius: 20,
                  background: 'rgba(0,212,180,0.06)', border: '1px solid rgba(0,212,180,0.12)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--teal)', opacity: 0.7,
                }}>{tag}</span>
              ))}
            </div>

            {stepError && (
              <p style={{ marginTop: 16, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Screen 3: Live Capture ─────────────────────────────── */}
        {screen === 'live' && (
          <div key="live" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 4 of 5 \u2014 Live Capture</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Take a quick<br />live capture
            </h1>

            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>
              We need to confirm your identity matches your ID. Look directly at the camera in a well-lit area.
            </p>

            <OvalFaceViewfinder processing={isProcessing} previewUrl={selfiePreviewUrl} />
            <LivenessCues hidden={isProcessing} />

            <TipBar text="Remove glasses \u00B7 Face well-lit \u00B7 No hat" />

            <div style={{ marginTop: 14 }} />

            <input type="file" accept="image/*" capture="user" id="mv-selfie-upload" style={{ display: 'none' }}
              onChange={handleSelfieSelect} />

            {!selfieFile ? (
              <PrimaryBtn
                onClick={() => cameraSupported ? setShowSelfieCamera(true) : document.getElementById('mv-selfie-upload')?.click()}
                disabled={isProcessing}
              >
                Take Live Capture
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={uploadSelfie} disabled={isProcessing}>
                {isProcessing ? 'Processing\u2026' : 'Submit Live Capture'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Camera overlays ─────────────────────────────────────── */}
        {showCamera && (
          <IDCameraCapture
            variant={cameraVariant}
            onCapture={handleCameraCapture}
            onClose={handleCameraClose}
            onFallback={handleCameraFallback}
          />
        )}

        {showSelfieCamera && (
          <SelfieCameraCapture
            onCapture={handleSelfieCameraCapture}
            onClose={handleSelfieCameraClose}
            onFallback={handleSelfieCameraFallback}
          />
        )}

        {/* ── Screen 4: Complete ──────────────────────────────────── */}
        {screen === 'done' && (
          <div key="done" className="mv-fade-up" style={{
            ...screenStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <AmbientGlow />

            {!finalResult ? (
              <>
                <div style={{
                  width: 80, height: 80, border: '2.5px solid rgba(0,212,180,0.12)',
                  borderTopColor: 'var(--teal)', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', marginBottom: 18,
                }} />
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Processing your verification\u2026</p>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--muted)', letterSpacing: '0.08em',
                }}>Analyzing your live capture</p>
              </>
            ) : (() => {
              const status = finalResult.final_result ?? finalResult.status;
              const isVerified = status === 'verified';
              const isFailed = status === 'failed';

              if (isVerified) {
                const checklist = [
                  'Identity document verified',
                  'Document details confirmed',
                  'Liveness check passed',
                  'Face matched successfully',
                ];
                return (
                  <>
                    <div style={{
                      width: 112, height: 112, borderRadius: '50%',
                      border: '2px solid var(--teal)', background: 'rgba(0,212,180,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 44, animation: 'sPulse 2.4s ease infinite',
                      marginBottom: 20,
                    }}>\u2713</div>

                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
                      marginBottom: 8,
                    }}>Verification complete</span>

                    <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 8 }}>
                      You're all set
                    </h1>

                    <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 24 }}>
                      Your identity has been verified. You can close this page.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
                      {checklist.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 11,
                          background: 'rgba(0,212,180,0.04)', border: '1px solid rgba(0,212,180,0.1)',
                          borderRadius: 11, padding: '11px 14px',
                          animation: `slideIn 0.3s ease ${i * 90}ms both`,
                        }}>
                          <span style={{ color: 'var(--teal)', fontSize: 14, flexShrink: 0 }}>\u2713</span>
                          <span style={{ fontSize: 13, color: 'rgba(232,244,248,0.72)' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              }

              return (
                <>
                  <div style={{
                    width: 112, height: 112, borderRadius: '50%',
                    border: `2px solid ${isFailed ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    background: isFailed ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 44, marginBottom: 20,
                  }}>
                    {isFailed ? '\u2715' : '\u23F3'}
                  </div>

                  <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 8 }}>
                    {isFailed ? 'Verification Failed' : 'Under Review'}
                  </h1>

                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
                    {isFailed
                      ? (finalResult.failure_reason || 'We were unable to verify your identity with the provided documents.')
                      : 'Your verification is being reviewed. You will be notified of the result.'}
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileVerificationFlow;
