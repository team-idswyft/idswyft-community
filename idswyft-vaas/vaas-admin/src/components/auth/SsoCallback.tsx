import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';

/**
 * Handles the SSO/SAML callback redirect.
 *
 * The backend redirects here with the JWT in the URL fragment:
 *   /sso/callback#token=<jwt>
 *
 * Fragments are never sent to the server, avoiding token leakage
 * in access logs or Referer headers.
 */
export default function SsoCallback() {
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processToken = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace('#', ''));
      const token = params.get('token');

      if (!token) {
        setError('No authentication token received. Please try signing in again.');
        return;
      }

      try {
        // Store the token and set auth header
        apiClient.setToken(token);
        // Refresh auth state from the server (fetches admin + org)
        await refreshAuth();
        // Clear the fragment before navigating
        window.history.replaceState(null, '', '/sso/callback');
        navigate('/dashboard', { replace: true });
      } catch {
        setError('Failed to complete SSO sign-in. The token may be expired.');
      }
    };

    processToken();
  }, []);

  if (error) {
    return (
      <div className="gradient-bg flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mb-4 text-3xl">!</div>
          <h2 className="mb-2 text-lg font-semibold text-slate-100">SSO Sign-in Failed</h2>
          <p className="mb-6 text-sm text-slate-400">{error}</p>
          <a
            href="/login"
            className="btn btn-primary inline-flex px-6 py-2.5 text-sm"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-bg flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        <p className="text-sm text-slate-400">Completing SSO sign-in...</p>
      </div>
    </div>
  );
}
