import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { API_BASE_URL } from '../config/api';

type HandoffState = 'idle' | 'waiting' | 'done';

interface VerificationResult {
  status: string;
  confidence_score?: number;
  face_match_score?: number;
  liveness_score?: number;
  [key: string]: any;
}

interface ContinueOnPhoneProps {
  apiKey: string;
  userId: string;
  sessionToken?: string;
  source?: 'api' | 'vaas' | 'demo';
  verificationMode?: 'full' | 'document_only' | 'identity' | 'age_only';
  ageThreshold?: number;
  onComplete: (result: VerificationResult) => void;
}

export const ContinueOnPhone: React.FC<ContinueOnPhoneProps> = ({
  apiKey,
  userId,
  sessionToken,
  source,
  verificationMode,
  ageThreshold,
  onComplete,
}) => {
  const [state, setState] = useState<HandoffState>('idle');
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Fix 1: mounted-ref guard
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; clearTimers(); };
  }, []);

  // Fix 2: onComplete ref to prevent stale closure
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const generateQR = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const handoffHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) handoffHeaders['X-Session-Token'] = sessionToken;

      const res = await fetch(`${API_BASE_URL}/api/verify/handoff/create`, {
        method: 'POST',
        headers: handoffHeaders,
        body: JSON.stringify({
          ...(!sessionToken && { api_key: apiKey }),
          user_id: userId,
          ...(source && { source }),
          ...(verificationMode && { verification_mode: verificationMode }),
          ...(ageThreshold && { age_threshold: ageThreshold }),
        }),
      });
      if (!res.ok) throw new Error('Failed to create handoff session');
      const data = await res.json();

      // Fix 3: validate required fields before use
      if (!data.token || !data.expires_at) {
        throw new Error("Handoff response missing required fields");
      }
      const expiry = new Date(data.expires_at);
      if (isNaN(expiry.getTime())) {
        throw new Error("Invalid expires_at value from server");
      }

      // Fix 1: bail if component unmounted while awaiting fetch
      if (!mountedRef.current) return;

      let url = `${window.location.origin}/verify/mobile?token=${data.token}`;
      if (verificationMode) url += `&verification_mode=${verificationMode}`;
      if (ageThreshold) url += `&age_threshold=${ageThreshold}`;

      setMobileUrl(url);
      setTimeLeft(Math.floor((expiry.getTime() - Date.now()) / 1000));
      setState('waiting');
      startTimers(data.token, expiry);
    } catch (err) {
      console.error('Failed to generate QR:', err);
      setError('Could not generate QR code. Please try again.');
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  };

  const startTimers = (tok: string, expiry: Date) => {
    // Countdown
    timerRef.current = setInterval(() => {
      const left = Math.floor((expiry.getTime() - Date.now()) / 1000);
      if (left <= 0) { clearTimers(); setState('idle'); }
      else setTimeLeft(left);
    }, 1000);

    // Status poll every 3 seconds — with fallback verification polling
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/verify/handoff/${tok}/status`);
        if (!mountedRef.current) return;
        if (res.status === 410) { clearTimers(); setState('idle'); return; }
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current) return;
        if (data.status !== 'pending') {
          // Handoff explicitly completed — use this result
          clearTimers();
          setResult(data.result ?? { status: data.status });
          setState('done');
          onCompleteRef.current(data.result ?? { status: data.status });
        } else if (data.verification_id) {
          // Handoff still pending but we have a verification_id — check directly
          try {
            const statusHeaders: Record<string, string> = sessionToken
              ? { 'X-Session-Token': sessionToken }
              : { 'X-API-Key': apiKey };
            const vRes = await fetch(
              `${API_BASE_URL}/api/v2/verify/${data.verification_id}/status`,
              { headers: statusHeaders },
            );
            if (!mountedRef.current) return;
            if (vRes.ok) {
              const vData = await vRes.json();
              if (vData.final_result !== null && vData.final_result !== undefined) {
                clearTimers();
                const fallbackResult: VerificationResult = {
                  verification_id: data.verification_id,
                  status: vData.final_result,
                  confidence_score: vData.confidence_score,
                  face_match_score: vData.face_match_results?.similarity_score,
                  liveness_score: vData.liveness_results?.liveness_score,
                };
                setResult(fallbackResult);
                setState('done');
                onCompleteRef.current(fallbackResult);
              }
            }
          } catch { /* fallback poll failed — continue normal polling */ }
        }
      } catch { /* network hiccup — retry next tick */ }
    }, 3000);
  };

  const cancel = () => {
    clearTimers();
    setState('idle');
    setMobileUrl(null);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ── IDLE ──
  if (state === 'idle') {
    return (
      <div style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', height: '100%', justifyContent: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--sans)' }}>Continue on Phone</span>
          <span style={{ fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent-ink)', padding: '2px 8px', fontWeight: 600, fontFamily: 'var(--mono)', border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)' }}>Recommended</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.5, fontFamily: 'var(--sans)' }}>
          Better camera quality for liveness and document capture.
        </p>
        <button
          onClick={generateQR}
          disabled={(!sessionToken && (!apiKey.trim() || !userId.trim())) || isGenerating}
          style={{ background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)', padding: '10px 0', width: '100%', fontWeight: 500, fontSize: 13, fontFamily: 'var(--mono)', cursor: (!sessionToken && (!apiKey.trim() || !userId.trim())) || isGenerating ? 'not-allowed' : 'pointer', opacity: (!sessionToken && (!apiKey.trim() || !userId.trim())) || isGenerating ? 0.5 : 1 }}
        >
          {isGenerating ? 'Generating\u2026' : 'Generate QR Code'}
        </button>
        {error && (
          <p role="alert" style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{error}</p>
        )}
      </div>
    );
  }

  // ── WAITING ──
  if (state === 'waiting') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return (
      <div style={{ border: '1px solid var(--rule)', background: 'var(--panel)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
        {isLocalhost && (
          <div style={{ width: '100%', background: 'var(--flag-soft)', border: '1px solid var(--rule)', padding: '8px 12px', fontSize: 12, color: 'var(--ink)', textAlign: 'left', fontFamily: 'var(--mono)' }}>
            <strong>Local dev tip:</strong> Open this page at{' '}
            <span style={{ fontWeight: 500 }}>
              http://{window.location.hostname === 'localhost' ? '192.168.x.x' : window.location.hostname}:{window.location.port}/demo
            </span>{' '}
            (your LAN IP) so the QR code works on your phone.
          </div>
        )}
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--sans)' }}>Scan with your phone camera</p>
        <div style={{ background: '#ffffff', padding: 12 }}>
          {mobileUrl && <QRCode value={mobileUrl} size={180} />}
        </div>
        {mobileUrl && (
          <p style={{ fontSize: 10, color: 'var(--soft)', wordBreak: 'break-all', maxWidth: 220, fontFamily: 'var(--mono)' }}>{mobileUrl}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mid)', fontFamily: 'var(--mono)' }}>
          <span style={{ width: 8, height: 8, background: 'var(--accent)', flexShrink: 0 }} className="animate-pulse" />
          <span>Waiting for phone…</span>
          <span style={{ color: 'var(--accent-ink)', fontWeight: 500 }}>{fmt(timeLeft)}</span>
        </div>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); cancel(); }}
          style={{ fontSize: 12, color: 'var(--soft)', textDecoration: 'underline', fontFamily: 'var(--mono)' }}
        >
          Cancel — use this device instead
        </a>
      </div>
    );
  }

  // ── DONE ──
  const statusMap: Record<string, { icon: string; color: string; label: string }> = {
    verified:      { icon: '✓', color: 'text-emerald-600', label: 'Verified' },
    completed:     { icon: '✓', color: 'text-emerald-600', label: 'Verified' },
    failed:        { icon: '✗', color: 'text-red-500',     label: 'Failed' },
    manual_review: { icon: '⏳', color: 'text-yellow-600', label: 'Pending Review' },
  };
  const cfg = statusMap[result?.status ?? ''] ?? statusMap.manual_review;

  return (
    <div style={{ border: '1px solid var(--rule)', background: 'var(--panel)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
      <div style={{ fontSize: 36, fontWeight: 700, color: cfg.color === 'text-emerald-600' ? 'var(--accent-ink)' : cfg.color === 'text-red-500' ? '#f87171' : 'var(--flag)' }}>{cfg.icon}</div>
      <h3 style={{ fontWeight: 600, fontSize: 18, fontFamily: 'var(--sans)', color: cfg.color === 'text-emerald-600' ? 'var(--accent-ink)' : cfg.color === 'text-red-500' ? '#f87171' : 'var(--flag)' }}>{cfg.label}</h3>
      <p style={{ fontSize: 13, color: 'var(--mid)', fontFamily: 'var(--sans)' }}>Completed on mobile device</p>
      <div style={{ width: '100%', marginTop: 8, textAlign: 'left', fontSize: 13, fontFamily: 'var(--mono)' }}>
        {result?.confidence_score != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</span>
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{Math.round(result.confidence_score * 100)}%</span>
          </div>
        )}
        {(result?.face_match_results?.similarity_score ?? result?.face_match_score) != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Face Match</span>
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{Math.round((result?.face_match_results?.similarity_score ?? result?.face_match_score ?? 0) * 100)}%</span>
          </div>
        )}
        {(result?.liveness_results?.score ?? result?.liveness_score) != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liveness</span>
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{Math.round((result?.liveness_results?.score ?? result?.liveness_score ?? 0) * 100)}%</span>
          </div>
        )}
        {(result?.cross_validation_results?.overall_score) != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cross-Validation</span>
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{Math.round(result.cross_validation_results.overall_score * 100)}%</span>
          </div>
        )}
        {result?.aml_screening && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>AML Screening</span>
            <span style={{ fontWeight: 500, color: result.aml_screening.risk_level === 'clear' ? 'var(--accent-ink)' : '#f87171' }}>
              {result.aml_screening.risk_level === 'clear' ? 'Clear' : result.aml_screening.risk_level?.replace('_', ' ')}
            </span>
          </div>
        )}
        {result?.risk_score && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risk Score</span>
            <span style={{ fontWeight: 500, color: result.risk_score.risk_level === 'low' ? 'var(--accent-ink)' : result.risk_score.risk_level === 'medium' ? 'var(--flag)' : '#f87171' }}>
              {result.risk_score.overall_score}/100
            </span>
          </div>
        )}
        {result?.rejection_reason && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid var(--rule)', marginTop: 4 }}>
            <span style={{ color: 'var(--mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rejection</span>
            <span style={{ fontSize: 12, color: '#f87171' }}>{result.rejection_reason}</span>
          </div>
        )}
      </div>
    </div>
  );
};
