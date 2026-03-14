import React, { useState, useEffect } from 'react';
import { CustomerPortalVerificationEngine, VerificationStatus, VerificationStatusValues } from '../../services/NewVerificationEngine';
import { VerificationSession } from '../../types';
import customerPortalAPI from '../../services/api';
import { useOrganization } from '../../contexts/OrganizationContext';
import BrandedHeader from '../BrandedHeader';
import CountrySelector from './CountrySelector';
import DocumentTypeSelector from './DocumentTypeSelector';
import {
  Shield,
  Upload,
  Camera,
  CheckCircle,
  AlertCircle,
  FileText,
  Globe,
  User,
  Loader,
  ArrowRight
} from 'lucide-react';

interface NewVerificationSystemProps {
  sessionToken: string;
}

export const NewVerificationSystem: React.FC<NewVerificationSystemProps> = ({ sessionToken }) => {
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [verificationEngine, setVerificationEngine] = useState<CustomerPortalVerificationEngine | null>(null);
  const [verificationState, setVerificationState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { branding, organizationName } = useOrganization();

  // Initialize session and verification engine
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('🚀 Initializing verification session...');
        setLoading(true);

        // Get session data
        const sessionData = await customerPortalAPI.getVerificationSession(sessionToken);
        console.log('✅ Session data retrieved:', sessionData);
        setSession(sessionData);

        // Initialize verification engine
        const engine = new CustomerPortalVerificationEngine('new_verification_id');
        setVerificationEngine(engine);

        // Set up state update callback
        engine.onStatusUpdate((state) => {
          console.log('📊 Verification state updated:', state);
          setVerificationState(state);
        });

        // Initialize verification
        await engine.initializeVerification();

        setLoading(false);
      } catch (error) {
        console.error('❌ Failed to initialize session:', error);
        setError(`Failed to initialize verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    if (sessionToken) {
      initializeSession();
    }
  }, [sessionToken]);

  const handleFrontDocumentUpload = async (file: File) => {
    if (!verificationEngine) return;

    setUploading(true);
    setError(null);

    try {
      console.log('📄 Uploading front document...');
      await verificationEngine.uploadFrontDocument(file);
      console.log('✅ Front document uploaded successfully');
    } catch (error) {
      console.error('❌ Front document upload failed:', error);
      setError(`Failed to upload front document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleBackDocumentUpload = async (file: File) => {
    if (!verificationEngine) return;

    setUploading(true);
    setError(null);

    try {
      console.log('📄 Uploading back document...');
      await verificationEngine.uploadBackDocument(file);
      console.log('✅ Back document uploaded successfully');
    } catch (error) {
      console.error('❌ Back document upload failed:', error);
      setError(`Failed to upload back document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleLiveCaptureUpload = async (imageData: string) => {
    if (!verificationEngine) return;

    setUploading(true);
    setError(null);

    try {
      console.log('📸 Uploading live capture...');
      await verificationEngine.uploadLiveCapture(imageData);
      console.log('✅ Live capture uploaded successfully');
    } catch (error) {
      console.error('❌ Live capture upload failed:', error);
      setError(`Failed to upload live capture: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCountrySelect = (countryCode: string) => {
    if (!verificationEngine) return;
    verificationEngine.setCountry(countryCode);
  };

  const handleDocumentTypeSelect = (documentType: string) => {
    if (!verificationEngine) return;
    verificationEngine.setDocumentType(documentType);
  };

  const handleCountryBack = () => {
    if (!verificationEngine) return;
    verificationEngine.goBackToCountry();
  };

  const getStepIcon = (status: VerificationStatus) => {
    if (status === VerificationStatusValues.PENDING) return <Loader className="w-5 h-5 animate-spin" />;
    if (status.includes('processing')) return <Loader className="w-5 h-5 animate-spin" />;
    if (status.includes('completed') || status.includes('processed')) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === VerificationStatusValues.FAILED) return <AlertCircle className="w-5 h-5 text-red-500" />;
    if (status === VerificationStatusValues.VERIFIED) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <Upload className="w-5 h-5" />;
  };

  const getStepTitle = (status: VerificationStatus) => {
    switch (status) {
      case VerificationStatusValues.PENDING:
        return 'Ready to Start';
      case VerificationStatusValues.FRONT_DOCUMENT_UPLOADED:
      case VerificationStatusValues.FRONT_DOCUMENT_PROCESSING:
        return 'Processing Front Document';
      case VerificationStatusValues.FRONT_DOCUMENT_PROCESSED:
        return 'Front Document Complete';
      case VerificationStatusValues.BACK_DOCUMENT_UPLOADED:
      case VerificationStatusValues.BACK_DOCUMENT_PROCESSING:
        return 'Processing Back Document';
      case VerificationStatusValues.BACK_DOCUMENT_PROCESSED:
        return 'Back Document Complete';
      case VerificationStatusValues.CROSS_VALIDATION_PROCESSING:
        return 'Cross-Validating Documents';
      case VerificationStatusValues.CROSS_VALIDATION_COMPLETED:
        return 'Documents Validated';
      case VerificationStatusValues.LIVE_CAPTURE_PROCESSING:
        return 'Processing Live Capture';
      case VerificationStatusValues.LIVE_CAPTURE_COMPLETED:
        return 'Live Capture Complete';
      case VerificationStatusValues.VERIFIED:
        return 'Verification Complete';
      case VerificationStatusValues.FAILED:
        return 'Verification Failed';
      case VerificationStatusValues.MANUAL_REVIEW:
        return 'Manual Review Required';
      default:
        return 'In Progress';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Initializing verification...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Derived state flags
  const needsCountrySelection = verificationState?.currentStep === 1 && !verificationState?.issuingCountry;
  const needsDocTypeSelection = verificationState?.currentStep === 2 && verificationState?.issuingCountry && !verificationState?.selectedDocumentType;
  const countryAndDocSelected = !!verificationState?.issuingCountry && !!verificationState?.selectedDocumentType;

  const canUploadFront = countryAndDocSelected && verificationState?.status === VerificationStatusValues.PENDING;
  const canUploadBack = verificationState?.status === VerificationStatusValues.FRONT_DOCUMENT_PROCESSED;
  const canLiveCapture = verificationState?.status === VerificationStatusValues.CROSS_VALIDATION_COMPLETED;
  const isComplete = [VerificationStatusValues.VERIFIED, VerificationStatusValues.FAILED, VerificationStatusValues.MANUAL_REVIEW].includes(verificationState?.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandedHeader  />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-8">
            <Shield className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Identity Verification</h1>
            <p className="text-gray-600">Please follow the steps below to complete your verification</p>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-900">
                Step {verificationState?.currentStep || 1} of {verificationState?.totalSteps || 8}
              </span>
              <span className="text-sm text-gray-500">
                {getStepTitle(verificationState?.status)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((verificationState?.currentStep || 1) / (verificationState?.totalSteps || 8)) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Status */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              {getStepIcon(verificationState?.status)}
              <span className="ml-3 text-blue-800 font-medium">
                {verificationState?.processingMessage || 'Ready to start verification'}
              </span>
            </div>
          </div>

          {/* Error Display */}
          {verificationState?.errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="ml-3 text-red-800">{verificationState.errorMessage}</span>
              </div>
            </div>
          )}

          {/* Country Selection Step */}
          {needsCountrySelection && (
            <CountrySelector onSelect={handleCountrySelect} />
          )}

          {/* Document Type Selection Step */}
          {needsDocTypeSelection && (
            <DocumentTypeSelector
              countryCode={verificationState.issuingCountry}
              onSelect={handleDocumentTypeSelect}
              onBack={handleCountryBack}
            />
          )}

          {/* Upload Sections — only shown after country + doc type selected */}
          {countryAndDocSelected && (
            <div className="space-y-6">
              {/* Country/doc type summary badge */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">
                  Country: <strong>{verificationState.issuingCountry}</strong>
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-700">
                  Document: <strong>{verificationState.selectedDocumentType?.replace(/_/g, ' ')}</strong>
                </span>
                <button
                  onClick={handleCountryBack}
                  className="ml-auto text-blue-600 hover:text-blue-800 text-xs"
                >
                  Change
                </button>
              </div>

              {/* Front Document Upload */}
              <div className={`border rounded-lg p-6 ${canUploadFront ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <div className="flex items-center mb-4">
                  <FileText className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold ml-3">Front of ID Document</h3>
                  {verificationState?.frontDocumentUploaded && (
                    <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                  )}
                </div>

                {canUploadFront ? (
                  <div>
                    <p className="text-gray-600 mb-4">Upload the front side of your government-issued ID</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFrontDocumentUpload(file);
                      }}
                      disabled={uploading}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <p className="text-gray-500">
                    {verificationState?.frontDocumentUploaded ? 'Front document uploaded successfully' : 'Waiting for previous step...'}
                  </p>
                )}
              </div>

              {/* Back Document Upload */}
              <div className={`border rounded-lg p-6 ${canUploadBack ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <div className="flex items-center mb-4">
                  <FileText className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold ml-3">Back of ID Document</h3>
                  {verificationState?.backDocumentUploaded && (
                    <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                  )}
                </div>

                {canUploadBack ? (
                  <div>
                    <p className="text-gray-600 mb-4">Upload the back side of your government-issued ID</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleBackDocumentUpload(file);
                      }}
                      disabled={uploading}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <p className="text-gray-500">
                    {verificationState?.backDocumentUploaded ? 'Back document uploaded successfully' : 'Complete front document first'}
                  </p>
                )}
              </div>

              {/* Live Capture */}
              <div className={`border rounded-lg p-6 ${canLiveCapture ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <div className="flex items-center mb-4">
                  <Camera className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold ml-3">Live Selfie</h3>
                  {verificationState?.liveCaptureUploaded && (
                    <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                  )}
                </div>

                {canLiveCapture ? (
                  <div>
                    <p className="text-gray-600 mb-4">Take a selfie to complete verification</p>
                    <button
                      onClick={() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 640;
                        canvas.height = 480;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.fillStyle = '#f0f0f0';
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          ctx.fillStyle = '#666';
                          ctx.font = '20px Arial';
                          ctx.textAlign = 'center';
                          ctx.fillText('Sample Selfie', canvas.width / 2, canvas.height / 2);
                          handleLiveCaptureUpload(canvas.toDataURL());
                        }
                      }}
                      disabled={uploading}
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploading ? 'Processing...' : 'Take Selfie'}
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500">
                    {verificationState?.liveCaptureUploaded ? 'Selfie captured successfully' : 'Complete document verification first'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Final Result */}
          {isComplete && (
            <div className="mt-8 text-center">
              {verificationState?.status === VerificationStatusValues.VERIFIED && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-800 mb-2">Verification Complete!</h3>
                  <p className="text-green-700">{verificationState?.resultMessage}</p>
                </div>
              )}

              {verificationState?.status === VerificationStatusValues.FAILED && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-red-800 mb-2">Verification Failed</h3>
                  <p className="text-red-700">{verificationState?.resultMessage}</p>
                </div>
              )}

              {verificationState?.status === VerificationStatusValues.MANUAL_REVIEW && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <User className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-yellow-800 mb-2">Manual Review Required</h3>
                  <p className="text-yellow-700">{verificationState?.resultMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};