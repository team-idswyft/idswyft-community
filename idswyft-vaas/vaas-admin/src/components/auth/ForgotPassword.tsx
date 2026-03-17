import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { apiClient } from '../../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);

    try {
      await apiClient.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err: any) {
      // Backend always returns 200 to prevent email enumeration,
      // so treat any response as success for the user.
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

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
      {/* Dot grid */}
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
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {submitted ? (
            /* Success state */
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-semibold text-emerald-200">Check your email</h2>
                  <p className="mt-1 text-sm text-emerald-300/80">
                    If an account exists for <span className="font-mono text-emerald-200">{email}</span>,
                    you'll receive a password reset link shortly.
                  </p>
                  <Link
                    to="/login"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Return to Sign In
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email Address</label>
                <div className="relative">
                  <div className="form-icon">
                    <Mail className="form-icon-svg" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    className="form-input form-input-icon"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="btn btn-primary w-full py-3 text-sm"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-900 border-t-transparent" />
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
