import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, tryEscalateDeveloperToken } from '../lib/adminApiInstance';
import type { ApiError } from '../lib/apiClient';
import { TotpModal } from '../components/auth/TotpModal';
import { C, injectFonts } from '../theme';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => { injectFonts(); }, []);

  // If developer is already logged in, try token escalation
  useEffect(() => {
    if (localStorage.getItem('adminToken')) { navigate('/admin/verifications'); return; }
    if (!localStorage.getItem('developer_token')) return;

    setEscalating(true);
    tryEscalateDeveloperToken()
      .then(ok => ok ? navigate('/admin/verifications') : setEscalating(false))
      .catch(() => setEscalating(false));
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await adminApi.post('/auth/admin/login', {
        email: credentials.email,
        password: credentials.password,
      });

      if (data.mfa_required) {
        if (!data.temp_token || typeof data.temp_token !== 'string') {
          setError('Login failed: invalid MFA response from server');
          return;
        }
        setTempToken(data.temp_token);
        setShowTotpModal(true);
        return;
      }

      if (!data.token || typeof data.token !== 'string') {
        setError('Login failed: invalid response from server');
        return;
      }
      localStorage.setItem('adminToken', data.token);
      navigate('/admin/verifications');
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.fields?.length) {
        setError(apiError.fields.map((f) => f.message).join(', '));
      } else {
        setError(apiError.message ?? 'Login failed');
      }
      if (apiError.correlationId) {
        console.error('Error ID:', apiError.correlationId);
      }
    } finally {
      setLoading(false);
    }
  };

  // Show a loading state while attempting token escalation
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
            Sign in to review and manage verifications
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
          <form onSubmit={handleLogin}>
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

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                color: C.muted,
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={credentials.email}
                onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                placeholder="reviewer@company.com"
                required
                style={{
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
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = C.cyan}
                onBlur={(e) => e.currentTarget.style.borderColor = C.border}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: 'block',
                color: C.muted,
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}>
                Password
              </label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="••••••••"
                required
                style={{
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
                }}
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
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1'; }}
              onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
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

      {showTotpModal && tempToken && (
        <TotpModal
          tempToken={tempToken}
          onSuccess={(token) => {
            setTempToken(null);
            setShowTotpModal(false);
            localStorage.setItem('adminToken', token);
            navigate('/admin/verifications');
          }}
          onCancel={() => {
            setShowTotpModal(false);
            setTempToken(null);
          }}
        />
      )}
    </div>
  );
};
