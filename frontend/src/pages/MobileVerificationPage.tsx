import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import IDCameraCapture from '../components/IDCameraCapture';

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
const STEP_LABELS = ['Front ID', 'Back ID', 'Checking', 'Live Photo', 'Complete'];

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
      {/* Inner card mock or preview image */}
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

      {/* Corner markers */}
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

      {/* Scan line */}
      {!processing && (
        <div style={{
          position: 'absolute', left: 10, right: 10, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--teal), transparent)',
          boxShadow: '0 0 10px var(--teal)',
          animation: 'scan 2s ease-in-out infinite',
        }} />
      )}

      {/* Processing overlay */}
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

/* Oval Face Viewfinder (spec: 188×228 oval with dot grid, ghost, scan line) */
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
      {/* Selfie preview when captured */}
      {previewUrl && (
        <img src={previewUrl} alt="Selfie preview" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', borderRadius: ovalRadius,
        }} />
      )}

      {/* Dot grid */}
      {!previewUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(0,212,180,0.12) 1px, transparent 1px)',
          backgroundSize: '18px 18px', opacity: 0.6,
          animation: 'dotsDrift 4s linear infinite',
        }} />
      )}

      {/* Ghost silhouette */}
      {!previewUrl && (
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          width: 90, height: 120, opacity: 0.07,
          background: 'linear-gradient(to bottom, transparent, var(--white))',
          clipPath: 'polygon(35% 0%,65% 0%,80% 28%,82% 58%,92% 70%,100% 100%,0% 100%,8% 70%,18% 58%,20% 28%)',
        }} />
      )}

      {/* Horizontal scan line */}
      {!processing && !previewUrl && (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 1.5,
          background: 'linear-gradient(90deg, transparent, var(--teal), transparent)',
          animation: 'fscan 1.9s ease-in-out infinite',
        }} />
      )}

      {/* Pulsing oval border */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: ovalRadius,
        border: '2px solid var(--teal)',
        animation: processing ? 'none' : 'gPulse 2.2s ease infinite',
      }} />

      {/* Processing overlay */}
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

/* Liveness Cues — 3 cycling circles */
const LIVENESS_CUES = [
  { emoji: '😐', label: 'Look ahead' },
  { emoji: '😊', label: 'Smile' },
  { emoji: '↔', label: 'Turn slightly' },
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
const MobileVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Handoff state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [_userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [patchFailed, setPatchFailed] = useState(false);

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

  // Guided camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraVariant, setCameraVariant] = useState<'front' | 'back'>('front');
  const [cameraSupported, setCameraSupported] = useState(true);

  // Checking screen messages
  const [checkingMsg, setCheckingMsg] = useState('Verifying your document…');

  // Final result
  const [finalResult, setFinalResult] = useState<any>(null);
  const [stepError, setStepError] = useState<string | null>(null);

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

  // ── Handoff session fetch ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setError('Invalid link — no token provided.');
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/verify/handoff/${token}/session`, { signal: controller.signal })
      .then(r => {
        if (r.status === 410) throw new Error('This QR code has expired. Please generate a new one on your desktop.');
        if (r.status === 409) throw new Error('This link has already been used.');
        if (!r.ok) throw new Error('Invalid or unrecognised link.');
        return r.json();
      })
      .then(data => {
        if (!data.api_key || !data.user_id) throw new Error('Session response is incomplete. Please try scanning the QR code again.');
        setApiKey(data.api_key);
        setUserId(data.user_id);
        // Auto-start verification
        initializeVerification(data.api_key, data.user_id);
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        const isNetwork = e.message === 'Failed to fetch' || e.message === 'Load failed' || e.message.toLowerCase().includes('network');
        setError(
          isNetwork
            ? 'Could not reach the verification server. Make sure your phone and computer are on the same Wi-Fi network, then scan the QR code again.'
            : e.message
        );
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token]);

  // ── API helper ─────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string, key: string) => {
    const res = await fetch(`${API_BASE_URL}${path}`, { headers: { 'X-API-Key': key } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // ── Step 0: Initialize verification session ────────────────────────────
  const initializeVerification = async (key: string, uid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ user_id: uid }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to start'); }
      const data = await res.json();
      if (!mountedRef.current) return;
      setVerificationId(data.verification_id);
      setLoading(false);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to start verification');
        setLoading(false);
      }
    }
  };

  // ── Step: Upload front document ────────────────────────────────────────
  const handleFrontSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
    setFrontFile(file);
    setFrontPreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  // ── Guided camera callbacks ─────────────────────────────────────────────
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

  const handleCameraClose = useCallback(() => {
    setShowCamera(false);
  }, []);

  const handleCameraFallback = useCallback(() => {
    setShowCamera(false);
    setCameraSupported(false);
    // Auto-click the hidden file input as fallback
    const inputId = cameraVariant === 'front' ? 'mv-front-upload' : 'mv-back-upload';
    setTimeout(() => document.getElementById(inputId)?.click(), 100);
  }, [cameraVariant]);

  const uploadFront = async () => {
    if (!frontFile || !verificationId || !apiKey) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      const fd = new FormData();
      fd.append('document_type', documentType);
      fd.append('document', frontFile);
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/front-document`, {
        method: 'POST', headers: { 'X-API-Key': apiKey }, body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Upload failed'); }
      if (!mountedRef.current) return;
      const data = await res.json().catch(() => null);

      // Gate 1 may hard-reject (e.g. image too blurry for OCR) — let user retake
      if (data?.rejection_reason) {
        setStepError(data.message || 'The photo of your ID is not clear enough. Please retake it in good lighting.');
        setFrontFile(null);
        if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
        setFrontPreviewUrl(null);
        return;
      }

      // Move to back ID and poll OCR in background
      setScreenIdx(1);
      pollFrontOCR(0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  // ── Poll front OCR ─────────────────────────────────────────────────────
  const pollFrontOCR = async (attempt: number) => {
    if (!verificationId || !apiKey || !mountedRef.current) return;
    if (attempt >= 60) { setStepError('OCR timed out. Please try again.'); return; }
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`, apiKey);
      if (!mountedRef.current) return;
      if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
        // OCR complete — user can now upload back
        return;
      }
      if (data.final_result === 'failed') { showFinalResult(data); return; }
      setTimeout(() => pollFrontOCR(attempt + 1), 2000);
    } catch {
      if (mountedRef.current) setTimeout(() => pollFrontOCR(attempt + 1), 2000);
    }
  };

  // ── Step: Upload back document ─────────────────────────────────────────
  const handleBackSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    setBackFile(file);
    setBackPreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  const uploadBack = async () => {
    if (!backFile || !verificationId || !apiKey) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      const fd = new FormData();
      fd.append('document', backFile);
      fd.append('document_type', documentType);
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/back-document`, {
        method: 'POST', headers: { 'X-API-Key': apiKey }, body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Upload failed'); }
      if (!mountedRef.current) return;
      setScreenIdx(2); // Checking screen
      pollCrossValidation(0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  // ── Poll cross-validation ──────────────────────────────────────────────
  const pollCrossValidation = async (attempt: number) => {
    if (!verificationId || !apiKey || !mountedRef.current) return;
    if (attempt >= 60) { setStepError('Validation timed out. Please try again.'); return; }

    // Cycle checking messages
    if (attempt === 0) setCheckingMsg('Verifying your document…');

    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`, apiKey);
      if (!mountedRef.current) return;
      const isComplete = !!data.cross_validation_results || data.final_result !== null;
      if (isComplete) {
        if (data.final_result === 'failed') { showFinalResult(data); }
        else { setScreenIdx(3); } // Live photo
      } else {
        setTimeout(() => pollCrossValidation(attempt + 1), 2000);
      }
    } catch {
      if (mountedRef.current) setTimeout(() => pollCrossValidation(attempt + 1), 2000);
    }
  };

  // Cycling messages for checking screen
  useEffect(() => {
    if (screen !== 'checking') return;
    const msgs = ['Verifying your document…', 'Cross-checking details…', 'Almost there…'];
    let idx = 0;
    const iv = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      setCheckingMsg(msgs[idx]);
    }, 1800);
    return () => clearInterval(iv);
  }, [screen]);

  // ── Selfie capture (file input with capture="user") ────────────────────
  const handleSelfieSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfieFile(file);
    setSelfiePreviewUrl(URL.createObjectURL(file));
    setStepError(null);
  };

  const uploadSelfie = async () => {
    if (!selfieFile || !verificationId || !apiKey) return;
    setIsProcessing(true);
    setStepError(null);
    try {
      const fd = new FormData();
      fd.append('selfie', selfieFile);
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/live-capture`, {
        method: 'POST', headers: { 'X-API-Key': apiKey }, body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: 'Selfie upload failed' })); throw new Error(e.message || 'Selfie upload failed'); }
      if (!mountedRef.current) return;
      setScreenIdx(4); // Done screen
      waitForFinalResult(0);
    } catch (err: any) {
      if (mountedRef.current) setStepError(err.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  };

  const waitForFinalResult = async (attempt: number) => {
    if (!verificationId || !apiKey || !mountedRef.current) return;
    if (attempt >= 60) return;
    try {
      const data = await apiGet(`/api/v2/verify/${verificationId}/status`, apiKey);
      if (!mountedRef.current) return;
      if (data.final_result !== null) { showFinalResult(data); }
      else { setTimeout(() => waitForFinalResult(attempt + 1), 3000); }
    } catch {
      if (mountedRef.current) setTimeout(() => waitForFinalResult(attempt + 1), 3000);
    }
  };

  // ── Show final result & notify desktop ─────────────────────────────────
  const showFinalResult = async (data: any) => {
    if (!mountedRef.current) return;
    setFinalResult(data);
    setScreenIdx(4);
    // Notify desktop
    if (!token) return;
    try {
      const status = data.final_result ?? data.status;
      const res = await fetch(`${API_BASE_URL}/api/verify/handoff/${token}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status === 'failed' ? 'failed' : 'completed',
          result: {
            verification_id: data.verification_id,
            status,
            user_id: data.user_id,
            confidence_score: data.confidence_score,
            face_match_score: data.face_match_results?.score ?? data.face_match_score,
            liveness_score: data.liveness_results?.liveness_score ?? data.liveness_score,
          },
        }),
      });
      if (!res.ok) setPatchFailed(true);
    } catch {
      setPatchFailed(true);
    }
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
          }}>Preparing your session…</span>
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
          {/* Signal dots */}
          <span style={{ opacity: 1 }}>●</span>
          <span style={{ opacity: 0.7 }}>●</span>
          <span style={{ opacity: 0.4 }}>●</span>
        </span>
      </div>

      {/* Step progress */}
      <StepTracker activeIdx={screenIdx} />

      {/* Screen content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: 20 }}>

        {/* ── Screen 0: Front ID ──────────────────────────────────────── */}
        {screen === 'front' && (
          <div key="front" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 400,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 1 of 5 — Front of ID</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Scan the front<br />of your ID
            </h1>

            <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
              Position your ID card and take a clear photo. Make sure all four corners are visible and the text is clear.
            </p>

            {/* Document type selector */}
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

            <TipBar text="Good lighting · No glare · Hold steady" />

            <div style={{ marginTop: 12 }} />
            <IDViewfinder variant="front" processing={isProcessing} processingLabel="READING FRONT" previewUrl={frontPreviewUrl} />

            {/* Hidden file input (fallback when camera unsupported) */}
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
                {isProcessing ? 'Processing…' : 'Scan Front of ID'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Screen 1: Back ID ───────────────────────────────────────── */}
        {screen === 'back' && (
          <div key="back" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 2 of 5 — Back of ID</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Now flip it over<br />and scan the back
            </h1>

            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
              Keep the same conditions — good lighting, flat surface. The barcode on the back must be fully visible.
            </p>

            <TipBar text="Barcode must be unobstructed" />

            <div style={{ marginTop: 12 }} />
            <IDViewfinder variant="back" processing={isProcessing} processingLabel="READING BARCODE" previewUrl={backPreviewUrl} />

            {/* Hidden file input (fallback when camera unsupported) */}
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
                {isProcessing ? 'Processing…' : 'Scan Back of ID'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Screen 2: Checking (auto, no user input) ────────────────── */}
        {screen === 'checking' && (
          <div key="checking" className="mv-fade-up" style={{
            ...screenStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 24,
            }}>Step 3 of 5 — Verification</span>

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

        {/* ── Screen 3: Live Photo ────────────────────────────────────── */}
        {screen === 'live' && (
          <div key="live" className="mv-fade-up" style={screenStyle}>
            <AmbientGlow />

            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
              marginBottom: 8,
            }}>Step 4 of 5 — Live Photo</span>

            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', marginBottom: 8 }}>
              Take a quick<br />selfie
            </h1>

            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>
              We need to confirm your identity matches your ID. Look directly at the camera in a well-lit area.
            </p>

            {/* Oval face viewfinder */}
            <OvalFaceViewfinder processing={isProcessing} previewUrl={selfiePreviewUrl} />

            {/* Liveness cues — hidden when processing */}
            <LivenessCues hidden={isProcessing} />

            <TipBar text="Remove glasses · Face well-lit · No hat" />

            <div style={{ marginTop: 14 }} />

            {/* Hidden file input — capture="user" opens front camera on mobile */}
            <input type="file" accept="image/*" capture="user" id="mv-selfie-upload" style={{ display: 'none' }}
              onChange={handleSelfieSelect} />

            {!selfieFile ? (
              <PrimaryBtn onClick={() => document.getElementById('mv-selfie-upload')?.click()} disabled={isProcessing}>
                Take Selfie
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={uploadSelfie} disabled={isProcessing}>
                {isProcessing ? 'Processing…' : 'Submit Selfie'}
              </PrimaryBtn>
            )}

            {stepError && (
              <p style={{ marginTop: 10, fontSize: 12, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                {stepError}
              </p>
            )}
          </div>
        )}

        {/* ── Guided Camera Overlay ─────────────────────────────────── */}
        {showCamera && (
          <IDCameraCapture
            variant={cameraVariant}
            onCapture={handleCameraCapture}
            onClose={handleCameraClose}
            onFallback={handleCameraFallback}
          />
        )}

        {/* ── Screen 4: Complete ──────────────────────────────────────── */}
        {screen === 'done' && (
          <div key="done" className="mv-fade-up" style={{
            ...screenStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <AmbientGlow />

            {!finalResult ? (
              /* Still polling for result */
              <>
                <div style={{
                  width: 80, height: 80, border: '2.5px solid rgba(0,212,180,0.12)',
                  borderTopColor: 'var(--teal)', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', marginBottom: 18,
                }} />
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Processing your verification…</p>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--muted)', letterSpacing: '0.08em',
                }}>Analyzing your live photo</p>
              </>
            ) : (() => {
              const status = finalResult.final_result ?? finalResult.status;
              const isVerified = status === 'verified';
              const isFailed = status === 'failed';

              if (isVerified) {
                // Success state — the premium completion screen
                const checklist = [
                  'Identity document verified',
                  'Document details confirmed',
                  'Liveness check passed',
                  'Face matched successfully',
                ];
                return (
                  <>
                    {/* Success ring */}
                    <div style={{
                      width: 112, height: 112, borderRadius: '50%',
                      border: '2px solid var(--teal)', background: 'rgba(0,212,180,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 44, animation: 'sPulse 2.4s ease infinite',
                      marginBottom: 20,
                    }}>✓</div>

                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)',
                      marginBottom: 8,
                    }}>Verification complete</span>

                    <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 8 }}>
                      You're all set
                    </h1>

                    <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 24 }}>
                      Your identity has been verified. You can close this tab and return to your desktop.
                    </p>

                    {/* Checklist */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
                      {checklist.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 11,
                          background: 'rgba(0,212,180,0.04)', border: '1px solid rgba(0,212,180,0.1)',
                          borderRadius: 11, padding: '11px 14px',
                          animation: `slideIn 0.3s ease ${i * 90}ms both`,
                        }}>
                          <span style={{ color: 'var(--teal)', fontSize: 14, flexShrink: 0 }}>✓</span>
                          <span style={{ fontSize: 13, color: 'rgba(232,244,248,0.72)' }}>{item}</span>
                        </div>
                      ))}
                    </div>

                    {patchFailed && (
                      <p style={{
                        marginTop: 16, fontSize: 11, color: 'rgba(245,158,11,0.8)',
                        fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        Note: We couldn't notify your desktop automatically. Please refresh it to see your result.
                      </p>
                    )}
                  </>
                );
              }

              // Failed or manual review
              return (
                <>
                  <div style={{
                    width: 112, height: 112, borderRadius: '50%',
                    border: `2px solid ${isFailed ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    background: isFailed ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 44, marginBottom: 20,
                  }}>
                    {isFailed ? '✕' : '⏳'}
                  </div>

                  <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 8 }}>
                    {isFailed ? 'Verification Failed' : 'Under Review'}
                  </h1>

                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
                    {isFailed
                      ? 'We were unable to verify your identity. Please return to your desktop to see details.'
                      : 'Your verification is being reviewed. You will be notified of the result.'}
                  </p>

                  {patchFailed && (
                    <p style={{
                      fontSize: 11, color: 'rgba(245,158,11,0.8)',
                      fontFamily: "'JetBrains Mono', monospace",
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                      borderRadius: 8, padding: '8px 12px',
                    }}>
                      Note: We couldn't notify your desktop automatically. Please refresh it to see your result.
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileVerificationPage;
