import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/api';

interface VerificationResult {
  success: boolean;
  message: string;
  email?: string;
}

const EmailVerification: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setResult({
          success: false,
          message: 'Invalid or missing verification token'
        });
        setLoading(false);
        return;
      }

      try {
        console.log('Verifying email with token...');
        
        const response = await apiClient.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = response.data;
        
        if (data.success) {
          setResult({
            success: true,
            message: 'Your email has been verified successfully!',
            email: data.data?.email
          });
        } else {
          setResult({
            success: false,
            message: data.error?.message || 'Email verification failed'
          });
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setResult({
          success: false,
          message: 'Failed to verify email. Please try again or contact support.'
        });
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-slate-100">
              Verifying Email
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Please wait while we verify your email address...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center">
            {result?.success ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="h-16 w-16 text-red-500" />
            )}
          </div>
          
          <h2 className="mt-6 text-3xl font-extrabold text-slate-100">
            {result?.success ? 'Email Verified!' : 'Verification Failed'}
          </h2>
          
          <p className="mt-2 text-sm text-slate-400">
            {result?.message}
          </p>
          
          {result?.email && (
            <p className="mt-1 text-xs text-slate-400">
              Email: {result.email}
            </p>
          )}
        </div>

        <div className="text-center">
          {result?.success ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Your email has been successfully verified. You can now log in to your account.
              </p>
              <Link
                to="/login"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Continue to Login
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                If you continue to have problems, please contact support.
              </p>
              <div className="space-y-2">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Back to Login
                </Link>
                <a
                  href="mailto:support@idswyft.app"
                  className="w-full flex justify-center py-2 px-4 border border-white/15 rounded-md shadow-sm text-sm font-medium text-slate-300 bg-slate-900/70 hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;