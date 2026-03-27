import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/adminApiInstance';
import type { ApiError } from '../../lib/apiClient';
import { RetryAfterError } from '../../lib/apiClient';
import { C } from '../../theme';

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
      const { data } = await adminApi.post('/auth/totp/verify', {
        temp_token: tempToken,
        totp_code: code,
      });
      if (!data.token || typeof data.token !== 'string') {
        throw { message: 'Invalid response from server' } as ApiError;
      }
      onSuccess(data.token);
    } catch (err) {
      if (err instanceof RetryAfterError) {
        setRetryUntil(Date.now() + err.retryAfter * 1000);
        setCountdown(err.retryAfter);
        setError(`Too many attempts. Wait ${err.retryAfter}s.`);
        return;
      }
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const disabled = code.length !== 6 || loading || Date.now() < (retryUntil ?? 0);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
      fontFamily: C.sans,
    }}>
      <div style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 32,
        width: '100%',
        maxWidth: 380,
      }}>
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>
          Two-Factor Authentication
        </h2>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 24px' }}>
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
            style={{
              width: '100%',
              background: C.surface,
              border: `1px solid ${C.cyanBorder}`,
              borderRadius: 8,
              padding: '14px 16px',
              color: C.text,
              fontSize: 24,
              fontFamily: C.mono,
              textAlign: 'center',
              letterSpacing: '0.3em',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: C.red, fontSize: 13, margin: '12px 0 0' }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.muted,
                fontSize: 14,
                fontFamily: C.sans,
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: disabled ? C.dim : C.cyan,
                color: '#080c14',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: C.sans,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? 'Verifying...' : countdown > 0 ? `Wait ${countdown}s` : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
