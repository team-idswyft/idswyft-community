import { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';
import { RetryAfterError } from '../../lib/apiClient';
import type { ApiError } from '../../lib/apiClient';

interface Props {
  tempToken: string;
  onSuccess: (jwtToken: string) => void;
  onCancel: () => void;
}

export function TotpModal({ tempToken, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!retryUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((retryUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setRetryUntil(null);
        setCountdown(0);
        clearInterval(interval);
      } else {
        setCountdown(remaining);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [retryUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.verifyTotp(tempToken, code);
      if (!result.token || typeof result.token !== 'string') {
        throw { message: 'Invalid response from server' } as ApiError;
      }
      onSuccess(result.token);
    } catch (err) {
      if (err instanceof RetryAfterError) {
        setRetryUntil(Date.now() + err.retryAfter * 1000);
        setCountdown(err.retryAfter);
        setError(`Too many attempts. Please wait ${err.retryAfter} seconds before trying again.`);
        return;
      }
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-[#0f1420] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <h2 className="text-xl font-semibold mb-2">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-[#0b0f19] border border-white/10 text-[#dde2ec] placeholder-[#4a5568]"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={code.length !== 6 || loading || Date.now() < (retryUntil ?? 0)}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {loading ? 'Verifying...' : countdown > 0 ? `Wait ${countdown}s` : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
