import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/adminApiInstance';
import type { ApiError } from '../lib/apiClient';
import { TotpModal } from '../components/auth/TotpModal';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [showTotpModal, setShowTotpModal] = useState(false);

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
      navigate('/admin');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="text-center">
            <div className="flex flex-col items-center mb-6">
              <img 
                src="/idswyft-logo.png" 
                alt="Idswyft" 
                className="h-8 w-auto mb-4"
                onError={(e) => {
                  // Fallback to icon and text if image fails to load
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div className="hidden items-center mb-4">
                <img 
                  src="/idswyft-logo.png"
                  alt="Idswyft"
                  className="h-8 w-auto"
                />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Admin Login</h2>
            </div>
            <p className="text-gray-600">Access the Idswyft admin dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={credentials.email}
                onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin@idswyft.app"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition duration-200"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 p-4 bg-gray-50 rounded-md">
              <h3 className="font-semibold text-gray-900 mb-2">Development Access</h3>
              <p className="text-sm text-gray-600 mb-2">
                For testing purposes, you can use:
              </p>
              <div className="text-sm text-gray-700">
                <p><strong>Email:</strong> admin@idswyft.app</p>
                <p><strong>Password:</strong> admin123</p>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-blue-600 hover:text-blue-800">
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
      {showTotpModal && tempToken && (
        <TotpModal
          tempToken={tempToken}
          onSuccess={(token) => {
            setTempToken(null);
            setShowTotpModal(false);
            localStorage.setItem('adminToken', token);
            navigate('/admin');
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
