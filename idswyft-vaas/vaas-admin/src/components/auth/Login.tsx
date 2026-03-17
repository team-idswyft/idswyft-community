import React, { useState, useEffect } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Lock, Mail, Building, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoginRequest } from '../../types.js';
import { apiClient } from '../../services/api';
import { TotpModal } from './TotpModal';

// ── Inline SVG illustration: Identity Verification Scanner ──────────────────
function VerificationIllustration() {
  return (
    <svg
      viewBox="0 0 480 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="login-float w-full max-w-[420px]"
      aria-hidden="true"
    >
      {/* Ambient glow */}
      <defs>
        <radialGradient id="lg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lg-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <filter id="lg-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="40" />
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="240" cy="210" r="180" fill="url(#lg-glow)" filter="url(#lg-blur)" className="login-glow-pulse" />

      {/* ── ID Card ── */}
      <rect x="110" y="80" width="260" height="170" rx="16" fill="url(#lg-card)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Card inner border highlight */}
      <rect x="112" y="82" width="256" height="166" rx="15" fill="none" stroke="rgba(34,211,238,0.08)" strokeWidth="0.5" />

      {/* Portrait placeholder */}
      <rect x="132" y="106" width="76" height="95" rx="8" fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.2)" strokeWidth="1" />
      {/* Abstract face silhouette */}
      <ellipse cx="170" cy="138" rx="18" ry="22" fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.15)" strokeWidth="0.8" />
      <ellipse cx="170" cy="168" rx="24" ry="12" fill="rgba(34,211,238,0.05)" stroke="rgba(34,211,238,0.1)" strokeWidth="0.6" />

      {/* Text lines on card */}
      <rect x="228" y="114" width="110" height="8" rx="4" fill="rgba(255,255,255,0.12)" />
      <rect x="228" y="134" width="85" height="6" rx="3" fill="rgba(255,255,255,0.07)" />
      <rect x="228" y="152" width="95" height="6" rx="3" fill="rgba(255,255,255,0.07)" />
      <rect x="228" y="170" width="60" height="6" rx="3" fill="rgba(255,255,255,0.05)" />
      {/* Barcode */}
      <rect x="228" y="196" width="120" height="24" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      {Array.from({ length: 14 }).map((_, i) => (
        <rect
          key={`bar-${i}`}
          x={234 + i * 8}
          y="200"
          width={i % 3 === 0 ? 3 : 2}
          height="16"
          rx="0.5"
          fill={`rgba(255,255,255,${i % 2 === 0 ? 0.1 : 0.05})`}
        />
      ))}

      {/* ── Scan line (animated) ── */}
      <rect x="110" y="80" width="260" height="6" rx="3" fill="url(#lg-scan)" className="login-scan-sweep" />

      {/* ── Corner viewfinder brackets ── */}
      {/* Top-left */}
      <path d="M100 108 L100 78 L130 78" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Top-right */}
      <path d="M380 108 L380 78 L350 78" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Bottom-left */}
      <path d="M100 222 L100 252 L130 252" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Bottom-right */}
      <path d="M380 222 L380 252 L350 252" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

      {/* ── Scanning arc ── */}
      <g className="login-arc-spin" style={{ transformOrigin: '240px 165px' }}>
        <circle cx="240" cy="165" r="130" fill="none" stroke="rgba(34,211,238,0.12)" strokeWidth="1" strokeDasharray="20,30" />
      </g>

      {/* ── Data flow nodes ── */}
      <circle cx="68" cy="160" className="login-node-pulse" fill="#22d3ee" opacity="0.6" />
      <circle cx="412" cy="160" className="login-node-pulse" fill="#22d3ee" opacity="0.6" style={{ animationDelay: '0.8s' }} />
      <circle cx="240" cy="38" className="login-node-pulse" fill="#22d3ee" opacity="0.4" style={{ animationDelay: '1.6s' }} />

      {/* Data stream lines */}
      <line x1="68" y1="160" x2="110" y2="160" stroke="rgba(34,211,238,0.3)" strokeWidth="1" className="login-data-stream" />
      <line x1="370" y1="160" x2="412" y2="160" stroke="rgba(34,211,238,0.3)" strokeWidth="1" className="login-data-stream" style={{ animationDelay: '1s' }} />

      {/* ── Verified badge (floating) ── */}
      <g className="login-float-delay">
        <rect x="310" y="278" width="120" height="36" rx="18" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.35)" strokeWidth="1" />
        <circle cx="332" cy="296" r="8" fill="rgba(16,185,129,0.25)" stroke="rgba(16,185,129,0.5)" strokeWidth="1" />
        <path d="M328 296 L331 299 L337 293" fill="none" stroke="#6ee7b7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="346" y="300" fill="#6ee7b7" fontSize="11" fontFamily="'DM Sans', sans-serif" fontWeight="600">Verified</text>
      </g>

      {/* ── Confidence score badge ── */}
      <g className="login-badge-reveal-delay">
        <rect x="55" y="268" width="110" height="36" rx="18" fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.3)" strokeWidth="1" />
        <text x="78" y="290" fill="#67e8f9" fontSize="11" fontFamily="'IBM Plex Mono', monospace" fontWeight="500">Score: 98.4</text>
      </g>

      {/* ── Shield icon (top center) ── */}
      <g className="login-badge-reveal" style={{ transformOrigin: '240px 340px' }}>
        <circle cx="240" cy="340" r="24" fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.25)" strokeWidth="1" />
        <path
          d="M240 326 L228 332 L228 342 C228 350 233 356 240 358 C247 356 252 350 252 342 L252 332 Z"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.7"
        />
        <path d="M235 342 L239 346 L246 338" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      </g>

      {/* ── Dot grid texture ── */}
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 10 }).map((_, col) => (
          <circle
            key={`dot-${row}-${col}`}
            cx={60 + col * 40}
            cy={50 + row * 48}
            r="0.8"
            fill="rgba(255,255,255,0.06)"
          />
        ))
      )}
    </svg>
  );
}

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
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoSlug, setSsoSlug] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);

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

  const handleSsoLogin = () => {
    const slug = ssoSlug.trim() || formData.organization_slug?.trim();
    if (!slug) {
      setSubmitError('Enter your organization slug to use SSO.');
      return;
    }
    setSsoLoading(true);
    // Redirect to the SAML SP-initiated login endpoint
    window.location.href = `${API_BASE_URL}/auth/saml/login/${encodeURIComponent(slug)}`;
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
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#05080f' }}>
      {/* ── Background layers ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,211,238,0.07), transparent),' +
            'radial-gradient(ellipse 50% 40% at 80% 15%, rgba(14,116,144,0.1), transparent)',
        }}
      />
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Scan pulse overlay */}
      <div
        className="login-scan-pulse pointer-events-none absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(34,211,238,0.03) 50%, transparent 100%)',
        }}
      />

      {/* ── Content ── */}
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">

        {/* ── Left: Illustration + Branding ── */}
        <section className="hidden flex-1 flex-col items-center justify-center px-12 py-16 lg:flex">
          <div className="w-full max-w-lg">
            {/* Logo + badge */}
            <div className="mb-10 flex items-center gap-4 animate-fade-in">
              <img src={logoUrl} alt="Idswyft" className="h-9 w-auto" />
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Admin Console
              </div>
            </div>

            {/* Hero text */}
            <div className="mb-12 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <h1
                className="font-display text-[clamp(2rem,3.5vw,3.2rem)] font-bold leading-[1.1] tracking-tight text-slate-100"
              >
                Enterprise identity
                <br />
                <span
                  style={{
                    background: 'linear-gradient(90deg, #7ddff0 0%, #22d3ee 48%, #06b6d4 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  verification control
                </span>
              </h1>
              <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-slate-400">
                Manage users, review verifications, and monitor your organization's identity pipeline from a single dashboard.
              </p>
            </div>

            {/* Illustration */}
            <div className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
              <VerificationIllustration />
            </div>

            {/* Status bar */}
            <div className="mt-8 flex items-center gap-6 animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-medium text-slate-500">Platform online</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <span className="font-mono text-xs text-slate-600">SAML 2.0 + MFA</span>
              <div className="h-3 w-px bg-white/10" />
              <span className="font-mono text-xs text-slate-600">SOC 2</span>
            </div>
          </div>
        </section>

        {/* ── Right: Login form ── */}
        <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 lg:max-w-[520px] lg:border-l lg:border-white/[0.06] lg:px-14">
          <div className="w-full max-w-[400px] animate-fade-in">

            {/* Mobile-only logo */}
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <img src={logoUrl} alt="Idswyft" className="h-8 w-auto" />
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Admin
              </span>
            </div>

            {/* Form card */}
            <div
              className="rounded-2xl border border-white/[0.07] p-7 sm:p-8"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div className="mb-7">
                <h2 className="font-display text-2xl font-bold text-slate-100">Sign in</h2>
                <p className="mt-1 text-sm text-slate-500">Use your administrator credentials</p>
              </div>

              {/* ── Auth mode toggle ── */}
              <div className="mb-6 flex rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
                <button
                  type="button"
                  onClick={() => { setSsoMode(false); setSubmitError(null); }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    !ssoMode
                      ? 'bg-white/[0.06] text-slate-200 shadow-sm'
                      : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  Email &amp; Password
                </button>
                <button
                  type="button"
                  onClick={() => { setSsoMode(true); setSubmitError(null); }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    ssoMode
                      ? 'bg-white/[0.06] text-slate-200 shadow-sm'
                      : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  SSO / SAML
                </button>
              </div>

              {error && (
                <div className="mb-5 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Password form ── */}
              {!ssoMode && (
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
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                      Organization <span className="normal-case tracking-normal text-slate-600">(Optional)</span>
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
                    <p className="mt-2 text-xs text-slate-600">Leave blank if you belong to one organization.</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <Link to="/forgot-password" className="text-sm font-medium text-cyan-300/80 transition hover:text-cyan-200">
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
                      <span className="flex items-center justify-center gap-2">
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </form>
              )}

              {/* ── SSO / SAML form ── */}
              {ssoMode && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
                    <p className="text-sm leading-relaxed text-slate-400">
                      Enter your organization slug to sign in with your company's identity provider (Okta, Azure AD, Google Workspace, etc.).
                    </p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="sso_slug" className="form-label">Organization Slug</label>
                    <div className="relative">
                      <div className="form-icon">
                        <Building className="form-icon-svg" />
                      </div>
                      <input
                        id="sso_slug"
                        name="sso_slug"
                        type="text"
                        className="form-input form-input-icon"
                        placeholder="your-company"
                        value={ssoSlug}
                        onChange={(e) => { setSsoSlug(e.target.value); setSubmitError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSsoLogin(); }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      This is the unique identifier your admin provided when setting up SSO.
                    </p>
                  </div>

                  {submitError && (
                    <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSsoLogin}
                    disabled={ssoLoading}
                    className="btn btn-primary w-full py-3 text-sm"
                  >
                    {ssoLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-900 border-t-transparent" />
                        Redirecting to IdP...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Continue with SSO
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </button>

                  <p className="text-center text-xs text-slate-600">
                    You'll be redirected to your company's identity provider to authenticate.
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="mt-7 border-t border-white/[0.06] pt-5 text-center text-xs text-slate-600">
                Need help? Contact{' '}
                <a href="mailto:support@idswyft.app" className="font-semibold text-cyan-400/70 hover:text-cyan-300 transition">
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
