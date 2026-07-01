import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import {
  sendOperatorOtp,
  verifyOperatorOtp,
  selectOperatorKey,
  type VerifyResult,
  type OperatorKeyOption,
} from '../lib/operatorAuth';

type Step = 'email' | 'otp' | 'select';

export const OperatorLogin: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [selectionToken, setSelectionToken] = useState('');
  const [keys, setKeys] = useState<OperatorKeyOption[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: C.text,
    fontSize: 14,
    fontFamily: C.sans,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms ease',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: C.muted,
    fontFamily: C.mono,
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  };

  // Step 1: send OTP
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await sendOperatorOtp(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOtp('');
    setStep('otp');
  };

  // Step 2: verify OTP — handles all 4 VerifyResult variants
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result: VerifyResult = await verifyOperatorOtp(email, otp);
    setLoading(false);

    switch (result.status) {
      case 'authed':
        navigate('/developer');
        break;
      case 'select':
        setSelectionToken(result.selectionToken);
        setKeys(result.keys);
        setSelectedKeyId(result.keys[0]?.api_key_id ?? '');
        setError('');
        setStep('select');
        break;
      case 'no-key':
        // Covers both "no active key" and invalid/expired OTP (both 401)
        setError(result.message);
        setStep('email');
        break;
      case 'error':
        // Network failure — stay on OTP step so the user can retry
        setError(result.message);
        break;
    }
  };

  // Step 3: select a key (when multiple keys exist)
  const handleSelect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKeyId) return;
    setLoading(true);
    setError('');
    const result = await selectOperatorKey(selectionToken, selectedKeyId);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Selection failed — please try again');
      return;
    }
    navigate('/developer');
  };

  return (
    <div
      className="pattern-guilloche-rainbow pattern-full"
      style={{
        minHeight: 'calc(100vh - 120px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        '--pattern-opacity': '0.01',
      } as React.CSSProperties}
    >
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 40,
          width: '100%',
          maxWidth: 400,
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: '0.08em',
            marginBottom: 24,
          }}
        >
          idswyft / service-operator
        </div>

        {/* Inline error (shared across all steps) */}
        {error && (
          <div
            style={{
              background: C.redDim,
              border: `1px solid ${C.red}`,
              borderRadius: 6,
              padding: '10px 14px',
              color: C.red,
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Step: email ────────────────────────────────────────── */}
        {step === 'email' && (
          <>
            <h1
              style={{
                fontFamily: C.mono,
                fontSize: 22,
                fontWeight: 600,
                color: C.text,
                marginBottom: 8,
              }}
            >
              Operator sign in
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>
              Enter your email to receive a verification code
            </p>
            <form
              onSubmit={handleSend}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@company.com"
                  required
                  autoFocus
                  disabled={loading}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: C.cyan,
                  color: C.bg,
                  borderRadius: 8,
                  padding: '11px 0',
                  fontWeight: 600,
                  fontSize: 14,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          </>
        )}

        {/* ── Step: OTP ──────────────────────────────────────────── */}
        {step === 'otp' && (
          <>
            <h1
              style={{
                fontFamily: C.mono,
                fontSize: 22,
                fontWeight: 600,
                color: C.text,
                marginBottom: 8,
              }}
            >
              Check your email
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
              We sent a 6-digit code to{' '}
              <span style={{ color: C.text }}>{email}</span>
            </p>
            <form
              onSubmit={handleVerify}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label style={labelStyle}>Verification code</label>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  required
                  disabled={loading}
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: 24,
                    fontFamily: C.mono,
                    letterSpacing: '0.2em',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                style={{
                  background: C.cyan,
                  color: C.bg,
                  borderRadius: 8,
                  padding: '11px 0',
                  fontWeight: 600,
                  fontSize: 14,
                  border: 'none',
                  cursor:
                    loading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: loading || otp.length !== 6 ? 0.7 : 1,
                }}
              >
                {loading ? 'Verifying...' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtp('');
                  setError('');
                }}
                disabled={loading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.muted,
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                  padding: 0,
                }}
              >
                ← Use a different email
              </button>
            </form>
          </>
        )}

        {/* ── Step: key picker ───────────────────────────────────── */}
        {step === 'select' && (
          <>
            <h1
              style={{
                fontFamily: C.mono,
                fontSize: 22,
                fontWeight: 600,
                color: C.text,
                marginBottom: 8,
              }}
            >
              Select a service key
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
              Multiple service keys are linked to this account. Choose one to
              continue.
            </p>
            <form
              onSubmit={handleSelect}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {keys.map((key: OperatorKeyOption) => {
                  const label =
                    key.service_label ?? key.service_product ?? 'Unnamed service';
                  const product = key.service_product ?? '—';
                  const env = key.service_environment ?? 'unknown';
                  const isSelected = selectedKeyId === key.api_key_id;
                  return (
                    <label
                      key={key.api_key_id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 14px',
                        background: isSelected ? C.accentSoft : C.surface,
                        border: `1px solid ${isSelected ? C.cyanBorder : C.border}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="api_key_id"
                        value={key.api_key_id}
                        checked={isSelected}
                        onChange={() => setSelectedKeyId(key.api_key_id)}
                        style={{ marginTop: 2, accentColor: C.cyan }}
                        disabled={loading}
                      />
                      <div>
                        <div
                          style={{
                            color: C.text,
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: 12,
                            fontFamily: C.mono,
                            marginTop: 2,
                          }}
                        >
                          {product} · {env}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <button
                type="submit"
                disabled={loading || !selectedKeyId}
                style={{
                  background: C.cyan,
                  color: C.bg,
                  borderRadius: 8,
                  padding: '11px 0',
                  fontWeight: 600,
                  fontSize: 14,
                  border: 'none',
                  cursor:
                    loading || !selectedKeyId ? 'not-allowed' : 'pointer',
                  opacity: loading || !selectedKeyId ? 0.7 : 1,
                }}
              >
                {loading ? 'Signing in...' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a
            href="/"
            style={{
              color: C.muted,
              fontSize: 13,
              fontFamily: C.mono,
              textDecoration: 'none',
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
          >
            ← Back to Portal
          </a>
        </div>
      </div>
    </div>
  );
};
