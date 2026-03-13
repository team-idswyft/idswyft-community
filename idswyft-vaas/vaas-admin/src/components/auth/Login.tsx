import React, { useState, useEffect } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Shield, Lock, Mail, Building, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoginRequest } from '../../types.js';
import { apiClient } from '../../services/api';
import { TotpModal } from './TotpModal';

export default function Login() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  const { isAuthenticated, loading, error, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LoginRequest>({
    email: '',
    password: '',
    organization_slug: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/idswyft-logo.png');

  useEffect(() => {
    const loadPlatformLogo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/assets/platform`);
        const payload = await response.json();
        const remoteLogo = payload?.data?.logo_url;
        if (response.ok && typeof remoteLogo === 'string' && remoteLogo.trim()) {
          setLogoUrl(remoteLogo);
        }
      } catch {
        // Keep fallback logo if branding endpoint is unavailable.
      }
    };
    loadPlatformLogo();
  }, [API_BASE_URL]);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password.trim()) {
      errors.password = 'Password is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.login(formData);
      if ((result as any).mfa_required) {
        const token: string | undefined = (result as any).temp_token;
        if (!token || typeof token !== 'string') {
          setSubmitError('Authentication error: MFA required but no token received. Please try again.');
          return;
        }
        setTempToken(token);
        setShowTotpModal(true);
        return;
      }
      await refreshAuth();
    } catch (err: any) {
      console.error('Login failed:', err);
      const msg = err?.message ?? 'Login failed. Please try again.';
      setSubmitError(msg);
      setEmailNotVerified(msg.toLowerCase().includes('verify your email'));
      setResendSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!formData.email.trim()) return;
    setResending(true);
    try {
      await apiClient.post(`/email/send-verification/${encodeURIComponent(formData.email)}`);
      setResendSuccess(true);
    } catch {
      setSubmitError('Failed to resend verification email. Please contact support.');
    } finally {
      setResending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="gradient-bg relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45" style={{
        backgroundImage:
          'linear-gradient(rgba(151,169,192,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(151,169,192,0.08) 1px, transparent 1px)',
        backgroundSize: '42px 42px'
      }} />

      <div className="relative z-10 min-h-screen lg:grid lg:grid-cols-2">
        <section className="hidden border-r border-white/10 px-12 py-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-10 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <img src={logoUrl} alt="Idswyft VaaS" className="h-8 w-auto" />
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">Admin Console</p>
              </div>
            </div>

            <div className="max-w-md">
              <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-500">Identity Verification Platform</p>
              <h1 className="text-4xl font-semibold leading-tight text-slate-100">
                Control your <span className="gradient-text">verification operations</span>
              </h1>
              <p className="mt-4 text-base leading-relaxed text-slate-400">
                Manage users, monitor sessions, and debug provider behavior from one operator workspace.
              </p>
            </div>

            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Platform status: online
            </div>
          </div>

          <div className="space-y-3">
            <div className="card-minimal p-4">
              <div className="flex items-center gap-3">
                <div className="icon-container-blue text-cyan-100">
                  <Building className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Organization governance</p>
                  <p className="text-xs text-slate-400">Role-aware controls and tenant separation</p>
                </div>
              </div>
            </div>
            <div className="card-minimal p-4">
              <div className="flex items-center gap-3">
                <div className="icon-container-purple text-cyan-100">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Real-time visibility</p>
                  <p className="text-xs text-slate-400">Track verification outcomes and logs</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8 text-center lg:hidden">
              <img src={logoUrl} alt="Idswyft VaaS" className="mx-auto h-8 w-auto" />
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">Admin Console</p>
            </div>

            <div className="card p-7 sm:p-8">
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-semibold text-slate-100">Sign in</h2>
                <p className="mt-1 text-sm text-slate-400">Use your administrator credentials</p>
              </div>

              {error && (
                <div className="mb-5 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <div className="relative">
                    <div className="form-icon">
                      <Mail className="form-icon-svg" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={`form-input form-input-icon ${validationErrors.email ? 'border-rose-400/60 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.2)]' : ''}`}
                      placeholder="admin@company.com"
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="mt-2 flex items-center gap-1 text-sm text-rose-300">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.email}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="password" className="form-label">Password</label>
                  <div className="relative">
                    <div className="form-icon">
                      <Lock className="form-icon-svg" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className={`form-input form-input-icon pr-11 ${validationErrors.password ? 'border-rose-400/60 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.2)]' : ''}`}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-300"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="mt-2 flex items-center gap-1 text-sm text-rose-300">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.password}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="organization_slug" className="form-label">
                    Organization <span className="normal-case tracking-normal text-slate-500">(Optional)</span>
                  </label>
                  <div className="relative">
                    <div className="form-icon">
                      <Building className="form-icon-svg" />
                    </div>
                    <input
                      id="organization_slug"
                      name="organization_slug"
                      type="text"
                      autoComplete="organization"
                      className="form-input form-input-icon"
                      placeholder="your-company-slug"
                      value={formData.organization_slug}
                      onChange={handleChange}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Leave blank if you belong to one organization.</p>
                </div>

                <div className="flex items-center justify-between">
                  <Link to="/forgot-password" className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
                    Forgot your password?
                  </Link>
                </div>

                {submitError && (
                  <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                    {emailNotVerified && !resendSuccess && (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="mt-2 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition disabled:opacity-50"
                      >
                        {resending ? 'Sending...' : 'Resend verification email'}
                      </button>
                    )}
                    {resendSuccess && (
                      <p className="mt-2 text-xs text-emerald-300">Verification email sent! Check your inbox.</p>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading || submitting} className="btn btn-primary w-full py-3 text-sm">
                  {loading || submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-900 border-t-transparent" />
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>

              <div className="mt-7 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
                Need help? Contact{' '}
                <a href="mailto:support@idswyft.app" className="font-semibold text-cyan-300 hover:text-cyan-200">
                  support@idswyft.app
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      {showTotpModal && tempToken && (
        <TotpModal
          tempToken={tempToken}
          onCancel={() => {
            setShowTotpModal(false);
            setTempToken(null);
          }}
          onSuccess={async (_jwtToken: string) => {
            await refreshAuth();
            setShowTotpModal(false);
            setTempToken(null);
            navigate('/dashboard', { replace: true });
          }}
        />
      )}
    </div>
  );
}
