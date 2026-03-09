import React, { useState, useEffect } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Shield, ArrowRight, Lock, Mail, Building, CheckCircle } from 'lucide-react';
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

  // Redirect if already authenticated
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
      // Login succeeded without MFA — refresh auth context to populate admin/org data
      await refreshAuth();
    } catch (err: any) {
      console.error('Login failed:', err);
      setSubmitError(err?.message ?? 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="min-h-screen flex relative z-10">
        {/* Left side - Enhanced Branding */}
        <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative">
          {/* Glass panel background */}
          <div className="absolute inset-4 glass-panel opacity-80"></div>
          
          <div className="relative z-10">
            <div className="flex items-center space-x-4 mb-12">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-xl border border-white/20">
                  <Shield className="w-8 h-8 text-blue-600" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
                  <CheckCircle className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <div>
                <img src={logoUrl} alt="Idswyft VaaS" className="h-8 w-auto" />
                <p className="text-slate-600 font-medium">Admin Portal</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <h2 className="text-4xl font-bold text-slate-800 mb-4 leading-tight">
                  Enterprise Identity
                  <br />
                  <span className="gradient-text">Verification Platform</span>
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Secure, scalable, and compliant identity verification solutions designed for enterprise administrators.
                </p>
              </div>

              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-100/80 backdrop-blur-sm rounded-full border border-green-200/50">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-green-700">System Online</span>
              </div>
            </div>
          </div>

          <div className="relative z-10">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/20 hover-lift">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Building className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Multi-tenant Management</p>
                  <p className="text-sm text-slate-600">Organization-level access control</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/20 hover-lift">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Real-time Monitoring</p>
                  <p className="text-sm text-slate-600">Live verification dashboard</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Enhanced Login form */}
        <div className="flex-1 flex items-center justify-center p-8 relative">
          <div className="w-full max-w-lg">
            {/* Mobile branding */}
            <div className="lg:hidden text-center mb-8 animate-fade-in">
              <div className="flex items-center justify-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                  <img src={logoUrl} alt="Idswyft VaaS" className="h-8 w-auto" />
                  <p className="text-slate-600 text-sm">Admin Portal</p>
                </div>
              </div>
            </div>
            
            {/* Main login card */}
            <div className="card p-8 animate-fade-in">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-slate-800 mb-2">Welcome back</h2>
                <p className="text-slate-600">Sign in to your admin dashboard</p>
              </div>

              {error && (
                <div className="mb-6 bg-red-50/80 backdrop-blur-sm border-2 border-red-200 rounded-2xl p-4 flex items-center space-x-3 animate-fade-in">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="form-group">
                  <label htmlFor="email" className="form-label">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="form-icon">
                      <Mail className="form-icon-svg" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={`form-input form-input-icon ${validationErrors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                      placeholder="admin@company.com"
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="mt-2 text-sm text-red-600 font-medium flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{validationErrors.email}</span>
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="password" className="form-label">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="form-icon">
                      <Lock className="form-icon-svg" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className={`form-input form-input-icon pr-12 ${validationErrors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center hover:bg-slate-50 rounded-r-xl transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors" />
                      ) : (
                        <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors" />
                      )}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="mt-2 text-sm text-red-600 font-medium flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{validationErrors.password}</span>
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="organization_slug" className="form-label">
                    Organization <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative group">
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
                  <p className="mt-2 text-sm text-slate-500 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Leave blank if you belong to only one organization</span>
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <Link
                      to="/forgot-password"
                      className="font-semibold text-blue-600 hover:text-blue-700 transition-all duration-200 flex items-center space-x-1 group"
                    >
                      <span>Forgot your password?</span>
                      <div className="w-1 h-1 bg-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </Link>
                  </div>
                </div>

                {submitError && (
                  <div className="mb-4 bg-red-50/80 backdrop-blur-sm border-2 border-red-200 rounded-2xl p-4 flex items-center space-x-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-red-700 text-sm font-medium">{submitError}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || submitting}
                  className="w-full btn btn-primary py-4 text-base font-semibold shadow-xl"
                >
                  {loading || submitting ? (
                    <div className="flex items-center justify-center space-x-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <span>Sign in</span>
                      <div className="w-1 h-1 bg-white rounded-full opacity-75"></div>
                    </div>
                  )}
                </button>
              </form>

              <div className="mt-8 text-center">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-[#0f1420] text-slate-500 font-medium">Need help?</span>
                  </div>
                </div>
                
                <div className="mt-6 text-sm text-slate-600">
                  <p className="mb-2">Contact your organization administrator or</p>
                  <a 
                    href="mailto:support@idswyft.app" 
                    className="inline-flex items-center space-x-2 font-semibold text-blue-600 hover:text-blue-700 transition-all duration-200 group"
                  >
                    <Mail className="w-4 h-4" />
                    <span>support@idswyft.app</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showTotpModal && tempToken && (
        <TotpModal
          tempToken={tempToken}
          onSuccess={(_token) => {
            setTempToken(null);
            setShowTotpModal(false);
            refreshAuth().then(() => navigate('/dashboard', { replace: true }));
          }}
          onCancel={() => {
            setShowTotpModal(false);
            setTempToken(null);
          }}
        />
      )}
    </div>
  );
}
