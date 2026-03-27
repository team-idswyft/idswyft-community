import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tryEscalateDeveloperToken } from '../lib/adminApiInstance';
import { API_BASE_URL } from '../config/api';
import { C, injectFonts } from '../theme';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selfHostedCode, setSelfHostedCode] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { injectFonts(); }, []);

  // Try escalating developer session or check existing cookie auth
  useEffect(() => {
    setEscalating(true);
    // Try to access a protected endpoint — if the cookie is valid, skip login
    fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: 'include' })
      .then(res => {
        if (res.ok) { navigate('/admin/verifications'); return; }
        // No valid admin/reviewer cookie — try developer escalation
        return tryEscalateDeveloperToken().then(ok => {
          if (ok) navigate('/admin/verifications');
          else setEscalating(false);
        });
      })
      .catch(() => setEscalating(false));
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

  // Spinner while escalating developer token
  if (escalating) {
    return (
      <div style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: C.sans,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${C.border}`,
            borderTopColor: C.cyan, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: C.muted, fontSize: 14 }}>Authenticating...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '12px 16px',
    color: C.text,
    fontSize: 14,
    fontFamily: C.sans,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: C.muted,
    fontSize: 12,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: C.sans,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute',
        top: '30%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 600,
        background: `radial-gradient(circle, ${C.cyanDim} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

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
          <h1 style={{
            color: C.text,
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}>
            Verification Management
          </h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>
            {step === 'email'
              ? 'Enter your reviewer email to sign in'
              : `Enter the code sent to ${email}`}
          </p>
        </div>

        {/* Login card */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 32,
          backdropFilter: 'blur(20px)',
        }}>
          {error && (
            <div style={{
              background: C.redDim,
              border: `1px solid rgba(248,113,113,0.25)`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              color: C.red,
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
                  onFocus={(e) => e.currentTarget.style.borderColor = C.cyan}
                  onBlur={(e) => e.currentTarget.style.borderColor = C.border}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  background: loading ? C.dim : C.cyan,
                  color: '#080c14',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: C.sans,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s, transform 0.1s',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              {selfHostedCode && (
                <div style={{
                  background: 'rgba(34,211,238,0.06)',
                  border: `1px solid rgba(34,211,238,0.2)`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                  textAlign: 'center',
                }}>
                  <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Self-hosted mode — your code:</div>
                  <div style={{ color: C.cyan, fontSize: 24, fontWeight: 700, fontFamily: C.mono, letterSpacing: '0.15em' }}>
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
                    fontFamily: C.mono,
                    letterSpacing: '0.2em',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = C.cyan}
                  onBlur={(e) => e.currentTarget.style.borderColor = C.border}
                />
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  background: (loading || otpCode.length !== 6) ? C.dim : C.cyan,
                  color: '#080c14',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: C.sans,
                  cursor: (loading || otpCode.length !== 6) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s, transform 0.1s',
                  opacity: (loading || otpCode.length !== 6) ? 0.6 : 1,
                }}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setOtpCode(''); setError(''); setSelfHostedCode(null); }}
                style={{
                  width: '100%',
                  padding: '10px 24px',
                  marginTop: 12,
                  background: 'transparent',
                  color: C.muted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: C.sans,
                  cursor: 'pointer',
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
              color: C.muted,
              fontSize: 13,
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = C.cyan}
            onMouseLeave={(e) => e.currentTarget.style.color = C.muted}
          >
            &larr; Back to Portal
          </a>
        </div>
      </div>
    </div>
  );
};
