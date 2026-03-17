import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '../../services/api';
import { showToast } from '../../lib/toast';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = newPassword === confirmPassword;
  const passwordLongEnough = newPassword.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch || !passwordLongEnough || !token) return;

    setSubmitting(true);
    setError(null);

    try {
      await apiClient.resetPassword(token, newPassword);
      showToast.success('Password reset successfully. Please sign in.');
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="relative min-h-screen overflow-hidden" style={{ background: '#05080f' }}>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-[400px] text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-400" />
            <h1 className="mt-4 text-lg font-semibold text-slate-100">Invalid Reset Link</h1>
            <p className="mt-2 text-sm text-slate-400">
              This password reset link is missing or invalid. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#05080f' }}>
      {/* Background gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,211,238,0.07), transparent),' +
            'radial-gradient(ellipse 50% 40% at 80% 15%, rgba(14,116,144,0.1), transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px] animate-fade-in">

          {/* Header */}
          <div className="mb-8">
            <Link
              to="/login"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-cyan-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">
              Set new password
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter your new password below. Must be at least 8 characters.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="new-password" className="form-label">New Password</label>
              <div className="relative">
                <div className="form-icon">
                  <Lock className="form-icon-svg" />
                </div>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className={`form-input form-input-icon pr-11 ${
                    newPassword && !passwordLongEnough ? 'border-rose-400/60' : ''
                  }`}
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
              <div className="relative">
                <div className="form-icon">
                  <Lock className="form-icon-svg" />
                </div>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={`form-input form-input-icon ${
                    confirmPassword && !passwordsMatch ? 'border-rose-400/60' : ''
                  }`}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-2 flex items-center gap-1 text-sm text-rose-300">
                  <AlertCircle className="h-4 w-4" />
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !passwordsMatch || !passwordLongEnough}
              className="btn btn-primary w-full py-3 text-sm"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-900 border-t-transparent" />
                  Resetting...
                </span>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
