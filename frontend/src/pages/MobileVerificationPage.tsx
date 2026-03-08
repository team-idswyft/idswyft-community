import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import EndUserVerification from '../components/verification/EndUserVerification';

const MobileVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [patchFailed, setPatchFailed] = useState(false);

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
        if (!data.api_key || !data.user_id) {
          throw new Error('Session response is incomplete. Please try scanning the QR code again.');
        }
        setApiKey(data.api_key);
        setUserId(data.user_id);
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // "Failed to fetch" means the phone can't reach the backend
        const isNetwork = e.message === 'Failed to fetch' ||
          e.message === 'Load failed' ||
          e.message.toLowerCase().includes('network');
        setError(
          isNetwork
            ? 'Could not reach the verification server. Make sure your phone and computer are on the same Wi-Fi network, then scan the QR code again.'
            : e.message
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token]);

  const handleComplete = async (result: any) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/verify/handoff/${token}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The handoff session only accepts 'completed' or 'failed'.
        // Map the verification status: failed → 'failed', everything else → 'completed'.
        // The full verification result (including the real status) is passed in `result`.
        body: JSON.stringify({ status: result.status === 'failed' ? 'failed' : 'completed', result }),
      });
      if (!res.ok) {
        console.error('Failed to notify desktop of completion:', res.status);
        setPatchFailed(true);
      }
    } catch (err) {
      console.error('Failed to report completion to desktop:', err);
      setPatchFailed(true);
    }
    setDone(true);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load</h2>
          <p className="text-gray-500 text-sm leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // ── Done ──
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">All Done!</h2>
          <p className="text-gray-500 leading-relaxed">
            Your verification is complete. You can close this tab and check your desktop.
          </p>
          {patchFailed && (
            <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Note: We couldn't notify your desktop automatically. Please refresh it to see your result.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Verification flow ──
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Mobile Verification</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete your identity verification on this device
          </p>
        </div>
        {apiKey && userId && (
          <EndUserVerification
            apiKey={apiKey}
            userId={userId}
            onComplete={handleComplete}
            enableMobileHandoff={false}
          />
        )}
      </div>
    </div>
  );
};

export default MobileVerificationPage;
