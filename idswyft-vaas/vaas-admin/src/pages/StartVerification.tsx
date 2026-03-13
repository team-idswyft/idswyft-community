import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  ExternalLink,
  ArrowLeft,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { sectionLabel, cardSurface, monoXs, monoSm } from '../styles/tokens';
import { apiClient } from '../services/api';
import type { EndUser } from '../types';

interface UserFormData {
  email: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  custom_message?: string;
}

const StartVerification: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    phone: '',
    first_name: '',
    last_name: '',
    external_id: '',
    custom_message: ''
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'success' | 'error'>('form');
  const [verificationUrl, setVerificationUrl] = useState<string>('');
  const [createdUser, setCreatedUser] = useState<EndUser | null>(null);
  const [error, setError] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting to start verification with data:', formData);

      // Option 1: Try using the startVerification API directly (may include user creation)
      try {
        console.log('Trying startVerification API...');
        const verificationResponse = await apiClient.startVerification({
          end_user: {
            email: formData.email,
            phone: formData.phone || undefined,
            first_name: formData.first_name || undefined,
            last_name: formData.last_name || undefined,
            external_id: formData.external_id || undefined,
            metadata: {}
          },
          settings: {
            require_liveness: true,
            require_back_of_id: true,
            callback_url: undefined,
            success_redirect_url: undefined,
            failure_redirect_url: undefined
          }
        });

        console.log('StartVerification API succeeded:', verificationResponse);
        setVerificationUrl(verificationResponse.verification_url);
        setCreatedUser(verificationResponse.end_user);
        setStep('success');
        return;

      } catch (startVerificationError: any) {
        console.log('StartVerification API failed, trying manual approach:', startVerificationError);

        // Option 2: Manual approach - create user then send invitation
        let newUser;
        try {
          console.log('Creating user with createEndUser...');
          newUser = await apiClient.createEndUser({
            email: formData.email,
            phone: formData.phone || undefined,
            first_name: formData.first_name || undefined,
            last_name: formData.last_name || undefined,
            external_id: formData.external_id || undefined,
            tags: [],
            metadata: {}
          });
          console.log('User created successfully:', newUser);
        } catch (createError: any) {
          // If user already exists, look them up and reuse
          if (createError.response?.data?.error?.code === 'DUPLICATE_EMAIL' ||
              createError.response?.data?.error?.code === 'DUPLICATE_EXTERNAL_ID') {
            console.log('User already exists, looking up existing user...');
            const { users } = await apiClient.listEndUsers({ search: formData.email, page: 1, per_page: 1 });
            if (users.length > 0) {
              newUser = users[0];
              console.log('Found existing user:', newUser);
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        }

        setCreatedUser(newUser);

        // Step 2: Send verification invitation
        console.log('Sending verification invitation to user:', newUser.id);
        const updatedUser = await apiClient.sendVerificationInvitation(newUser.id, {
          custom_message: formData.custom_message || undefined,
          expiration_days: 7
        });

        console.log('Invitation sent successfully:', updatedUser);

        // Extract verification URL from the updated user data
        if (updatedUser.verification_url) {
          setVerificationUrl(updatedUser.verification_url);
        }

        setStep('success');
      }
    } catch (error: any) {
      console.error('Failed to start verification:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL
      });

      let errorMessage = 'Failed to start verification. ';
      if (error.response?.status === 404) {
        errorMessage += `API endpoint not found: ${error.config?.method?.toUpperCase()} ${error.config?.baseURL}${error.config?.url}. The backend server may not have this endpoint implemented yet.`;
      } else if (error.response?.data?.error?.message) {
        errorMessage += error.response.data.error.message;
      } else if (error.response?.status === 400) {
        errorMessage += 'Invalid user data provided. Please check the form fields.';
      } else if (error.response?.status === 409) {
        errorMessage += 'A user with this email already exists.';
      } else if (error.response?.status === 401) {
        errorMessage += 'Authentication failed. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage += 'Permission denied. You may not have rights to create users.';
      } else if (error.response?.status === 500) {
        errorMessage += 'Server error occurred. Please contact support.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check your network connection and try again.';
      }

      setError(errorMessage);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVerificationLink = () => {
    if (verificationUrl) {
      window.open(verificationUrl, '_blank');
    }
  };

  const handleStartAnother = () => {
    setStep('form');
    setFormData({
      email: '',
      phone: '',
      first_name: '',
      last_name: '',
      external_id: '',
      custom_message: ''
    });
    setCreatedUser(null);
    setVerificationUrl('');
    setError('');
  };

  if (step === 'success') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </button>
        </div>

        <div className={`${cardSurface} p-8 text-center`}>
          <p className={`${sectionLabel} mb-4`}>
            Verification Started Successfully!
          </p>

          <p className="text-slate-400 mb-6">
            User has been created and verification invitation has been sent to{' '}
            <strong>{createdUser?.email}</strong>.
          </p>

          <div className="bg-cyan-500/12 border border-cyan-500/25 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-medium text-cyan-100 mb-2">What happens next:</h3>
            <ul className="text-sm text-cyan-200 space-y-1">
              <li>• User will receive an email with verification instructions</li>
              <li>• They'll click the link to access the branded verification portal</li>
              <li>• User completes document upload and liveness check</li>
              <li>• You'll be notified when verification is complete</li>
            </ul>
          </div>

          {verificationUrl && (
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-3">
                You can also share this verification link directly:
              </p>
              <button
                onClick={handleOpenVerificationLink}
                className="btn btn-outline inline-flex items-center"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Verification Link
              </button>
            </div>
          )}

          <div className="flex justify-center space-x-3">
            <button
              onClick={handleStartAnother}
              className="btn btn-primary"
            >
              Start Another Verification
            </button>
            <button
              onClick={() => navigate('/users')}
              className="btn btn-secondary"
            >
              View All Users
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </button>
        </div>

        <div className={`${cardSurface} p-8 text-center`}>
          <p className={`${sectionLabel} mb-4`}>
            Verification Start Failed
          </p>

          <p className="text-rose-400 mb-6">{error}</p>

          <div className="flex justify-center space-x-3">
            <button
              onClick={() => setStep('form')}
              className="btn btn-primary"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </button>
      </div>

      <div className={`${cardSurface} p-8`}>
        <div className="text-center mb-8">
          <p className={`${sectionLabel} mb-2`}>
            Start New Verification
          </p>
          <p className="text-sm text-slate-500">
            Create a user and send them a verification invitation
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email - Required */}
          <div>
            <label className="form-label">
              <Mail className="w-4 h-4 inline mr-2" />
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="form-input"
              placeholder="user@example.com"
              required
            />
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                <User className="w-4 h-4 inline mr-2" />
                First Name
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                className="form-input"
                placeholder="John"
              />
            </div>
            <div>
              <label className="form-label">
                <User className="w-4 h-4 inline mr-2" />
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                className="form-input"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="form-input"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label className="form-label">External ID</label>
              <input
                type="text"
                name="external_id"
                value={formData.external_id}
                onChange={handleInputChange}
                className="form-input"
                placeholder="Your internal user ID"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Custom Message</label>
            <textarea
              name="custom_message"
              value={formData.custom_message}
              onChange={handleInputChange}
              rows={3}
              className="form-input"
              placeholder="Add a personalized message to the verification invitation email (optional)..."
            />
          </div>

          <div className="bg-cyan-500/12 border border-cyan-500/25 rounded-lg p-4">
            <h3 className="font-medium text-cyan-100 mb-2">What will happen:</h3>
            <ul className="text-sm text-cyan-200 space-y-1">
              <li>1. A new user account will be created</li>
              <li>2. Verification invitation email will be sent automatically</li>
              <li>3. User will receive a link to your branded verification portal</li>
              <li>4. You'll be notified when verification is complete</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.email}
              className="btn btn-primary"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Starting Verification...
                </div>
              ) : (
                'Start Verification'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StartVerification;
