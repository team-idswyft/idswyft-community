import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { injectFonts } from '../theme';
import '../styles/patterns.css';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selfHostedCode, setSelfHostedCode] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { injectFonts(); }, []);

  // Check existing cookie auth — no escalation, OTP-only
  useEffect(() => {
    setCheckingAuth(true);
    fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: 'include' })
      .then(res => {
        if (res.ok) navigate('/admin/verifications');
        else setCheckingAuth(false);
      })
      .catch(() => setCheckingAuth(false));
  }, [navigate]);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSelfHostedCode(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reviewer/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Failed to send verification code');
        return;
      }

      // Self-hosted: show code inline
      if (data.self_hosted && data.code) {
        setSelfHostedCode(data.code);
      }

      setStep('otp');
    } catch (err: any) {
      setError(err.message ?? 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reviewer/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Invalid verification code');
        return;
      }

      if (!data.token) {
        setError('Login failed: invalid response from server');
        return;
      }

      // Token is now set as httpOnly cookie by the server
      navigate('/admin/verifications');
    } catch (err: any) {
      setError(err.message ?? 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  // Spinner while checking existing auth
  if (checkingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--sans)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner-glass" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--mid)', fontSize: 14 }}>Authenticating...</p>
        </div>
      </div>
    );
  }

  // v2: use CSS class overrides for inputs/labels (sharp edges, solid borders)
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--panel)',
    border: '1px solid var(--rule-strong)',
    borderRadius: 0,
    padding: '10px 14px',
    color: 'var(--ink)',
    fontSize: 14,
    fontFamily: 'var(--sans)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms ease',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--mid)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  };

  return (
    <div className="pattern-shield pattern-faint pattern-fade-edges" style={{
      minHeight: '100vh',
      background: 'var(--paper)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: '0 24px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo + header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/idswyft-logo.png"
            alt="Idswyft"
            style={{ height: 32, margin: '0 auto 24px' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            idswyft / review-dashboard
          </div>
          <h1 style={{
            color: 'var(--ink)',
            fontFamily: 'var(--mono)',
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 8px',
          }}>
            Verification Management
          </h1>
          <p style={{ color: 'var(--mid)', fontSize: 14, margin: 0 }}>
            {step === 'email'
              ? 'Enter your reviewer email to sign in'
              : `Enter the code sent to ${email}`}
          </p>
        </div>

        {/* Login card */}
        <div className="card" style={{ padding: 32 }}>
          {error && (
            <div className="badge-error" style={{
              display: 'block',
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendOtp}>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="reviewer@company.com"
                  required
                  autoFocus
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--ink)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--rule-strong)'}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-accent"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              {selfHostedCode && (
                <div style={{
                  background: 'var(--accent-soft)',
                  border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
                  padding: '12px 16px',
                  marginBottom: 20,
                  textAlign: 'center',
                }}>
                  <div style={{ color: 'var(--mid)', fontSize: 12, marginBottom: 4 }}>Self-hosted mode — your code:</div>
                  <div style={{ color: 'var(--accent)', fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '0.15em' }}>
                    {selfHostedCode}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Verification Code</label>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: 24,
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.2em',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--ink)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--rule-strong)'}
                />
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="btn-accent"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  opacity: (loading || otpCode.length !== 6) ? 0.5 : 1,
                  cursor: (loading || otpCode.length !== 6) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setOtpCode(''); setError(''); setSelfHostedCode(null); }}
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: 12,
                }}
              >
                Use a different email
              </button>
            </form>
          )}
        </div>

        {/* Footer link */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a
            href="/"
            style={{
              color: 'var(--mid)',
              fontSize: 13,
              fontFamily: 'var(--mono)',
              textDecoration: 'none',
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ink)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mid)'}
          >
            &larr; Back to Portal
          </a>
        </div>
      </div>
    </div>
  );
};
