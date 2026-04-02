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
  source?: 'api' | 'vaas' | 'demo';
  verificationMode?: 'full' | 'age_only';
  ageThreshold?: number;
  onComplete: (result: VerificationResult) => void;
}

export const ContinueOnPhone: React.FC<ContinueOnPhoneProps> = ({
  apiKey,
  userId,
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
      const res = await fetch(`${API_BASE_URL}/api/verify/handoff/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
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
            const vRes = await fetch(
              `${API_BASE_URL}/api/v2/verify/${data.verification_id}/status`,
              { headers: { 'X-API-Key': apiKey } },
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
      <div className="border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center h-full justify-center gap-3">
        <div className="text-4xl">📱</div>
        <div>
          <h3 className="font-semibold text-white">Continue on Phone</h3>
          <p className="text-sm text-gray-500 mt-1">
            Scan a QR code to complete verification on your mobile device
          </p>
        </div>
        <button
          onClick={generateQR}
          disabled={!apiKey.trim() || !userId.trim() || isGenerating}
          className="mt-1 w-full py-2.5 px-4 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Generating…' : 'Generate QR Code'}
        </button>
        {/* Fix 4: user-visible error message */}
        {error && (
          <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>
    );
  }

  // ── WAITING ──
  if (state === 'waiting') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return (
      <div className="border-2 border-blue-200 bg-blue-50 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
        {isLocalhost && (
          <div className="w-full bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-800 text-left">
            <strong>Local dev tip:</strong> Open this page at{' '}
            <span className="font-mono font-medium">
              http://{window.location.hostname === 'localhost' ? '192.168.x.x' : window.location.hostname}:{window.location.port}/demo
            </span>{' '}
            (your LAN IP) so the QR code works on your phone.
          </div>
        )}
        <p className="text-sm font-medium text-gray-700">Scan with your phone camera</p>
        <div className="bg-white p-3 rounded-xl shadow-sm">
          {mobileUrl && <QRCode value={mobileUrl} size={180} />}
        </div>
        {mobileUrl && (
          <p className="text-[10px] text-gray-400 break-all max-w-[220px]">{mobileUrl}</p>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0" />
          <span>Waiting for phone…</span>
          <span className="font-mono text-blue-600 font-medium">{fmt(timeLeft)}</span>
        </div>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); cancel(); }}
          className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
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
    <div className="border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center gap-2">
      <div className={`text-5xl font-bold ${cfg.color}`}>{cfg.icon}</div>
      <h3 className={`font-semibold text-lg ${cfg.color}`}>{cfg.label}</h3>
      <p className="text-sm text-gray-500">Completed on mobile device</p>
      <div className="w-full mt-2 text-left text-sm space-y-1.5">
        {result?.confidence_score != null && (
          <div className="flex justify-between">
            <span className="text-gray-500">Confidence</span>
            <span className="font-medium text-gray-700">{Math.round(result.confidence_score * 100)}%</span>
          </div>
        )}
        {(result?.face_match_results?.similarity_score ?? result?.face_match_score) != null && (
          <div className="flex justify-between">
            <span className="text-gray-500">Face Match</span>
            <span className="font-medium text-gray-700">{Math.round((result?.face_match_results?.similarity_score ?? result?.face_match_score ?? 0) * 100)}%</span>
          </div>
        )}
        {(result?.liveness_results?.score ?? result?.liveness_score) != null && (
          <div className="flex justify-between">
            <span className="text-gray-500">Liveness</span>
            <span className="font-medium text-gray-700">{Math.round((result?.liveness_results?.score ?? result?.liveness_score ?? 0) * 100)}%</span>
          </div>
        )}
        {(result?.cross_validation_results?.overall_score) != null && (
          <div className="flex justify-between">
            <span className="text-gray-500">Cross-Validation</span>
            <span className="font-medium text-gray-700">{Math.round(result.cross_validation_results.overall_score * 100)}%</span>
          </div>
        )}
        {result?.aml_screening && (
          <div className="flex justify-between">
            <span className="text-gray-500">AML Screening</span>
            <span className={`font-semibold ${result.aml_screening.risk_level === 'clear' ? 'text-green-600' : 'text-red-500'}`}>
              {result.aml_screening.risk_level === 'clear' ? 'Clear' : result.aml_screening.risk_level?.replace('_', ' ')}
            </span>
          </div>
        )}
        {result?.risk_score && (
          <div className="flex justify-between">
            <span className="text-gray-500">Risk Score</span>
            <span className={`font-semibold ${result.risk_score.risk_level === 'low' ? 'text-green-600' : result.risk_score.risk_level === 'medium' ? 'text-yellow-600' : 'text-red-500'}`}>
              {result.risk_score.overall_score}/100
            </span>
          </div>
        )}
        {result?.rejection_reason && (
          <div className="flex justify-between pt-1.5 border-t border-gray-200">
            <span className="text-gray-500">Rejection</span>
            <span className="font-mono text-xs text-red-500">{result.rejection_reason}</span>
          </div>
        )}
      </div>
    </div>
  );
};
