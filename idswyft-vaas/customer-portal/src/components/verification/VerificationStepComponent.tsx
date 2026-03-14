// Individual step components for the verification flow - FIXED TO USE EXISTING LiveCaptureComponent
import React, { useRef, useState } from 'react';
import { VerificationStep, VerificationStatus, VerificationState } from '../../types/verification';
import { VerificationSession } from '../../types';
import { Upload, FileText, Camera, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import LiveCaptureComponent from '../LiveCaptureComponent';
import CountrySelector from './CountrySelector';
import DocumentTypeSelector from './DocumentTypeSelector';

interface VerificationStepComponentProps {
  state: VerificationState;
  session: VerificationSession | null;
  onCountrySelect: (countryCode: string) => void;
  onDocumentTypeSelect: (documentType: string) => void;
  onCountryBack: () => void;
  onFrontDocumentUpload: (file: File, documentType: string) => Promise<void>;
  onBackDocumentUpload: (file: File, documentType: string) => Promise<void>;
  onLiveCapture: (imageData: string) => Promise<void>;
}

export const VerificationStepComponent: React.FC<VerificationStepComponentProps> = ({
  state,
  session,
  onCountrySelect,
  onDocumentTypeSelect,
  onCountryBack,
  onFrontDocumentUpload,
  onBackDocumentUpload,
  onLiveCapture,
}) => {
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState('drivers_license');
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [showLiveCapture, setShowLiveCapture] = useState(false);

  const handleFrontDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFront(true);
    try {
      await onFrontDocumentUpload(file, documentType);
    } catch (error) {
      console.error('Front document upload failed:', error);
    } finally {
      setUploadingFront(false);
    }
  };

  const handleBackDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBack(true);
    try {
      await onBackDocumentUpload(file, documentType);
    } catch (error) {
      console.error('Back document upload failed:', error);
    } finally {
      setUploadingBack(false);
    }
  };

  const handleLiveCaptureStart = () => {
    console.log('🎥 Starting live capture using existing LiveCaptureComponent...');
    setShowLiveCapture(true);
  };

  const handleLiveCaptureComplete = async (imageData: string) => {
    console.log('📸 Live capture completed, processing...');
    setShowLiveCapture(false);
    await onLiveCapture(imageData);
  };

  const handleLiveCaptureCancel = () => {
    console.log('❌ Live capture cancelled');
    setShowLiveCapture(false);
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case VerificationStep.COUNTRY_SELECTION:
        return <CountrySelector onSelect={onCountrySelect} />;

      case VerificationStep.DOCUMENT_TYPE_SELECTION:
        return (
          <DocumentTypeSelector
            countryCode={state.issuingCountry || 'US'}
            onSelect={onDocumentTypeSelect}
            onBack={onCountryBack}
          />
        );

      case VerificationStep.FRONT_DOCUMENT_UPLOAD:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Front of ID</h2>
            <p className="text-gray-600 mb-6">
              Please upload a clear photo of the front of your government-issued ID.
            </p>

            {/* Document type selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="drivers_license">Driver's License</option>
                <option value="passport">Passport</option>
                <option value="national_id">National ID</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Upload area */}
            <div
              onClick={() => frontInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                {uploadingFront ? 'Uploading...' : 'Click to upload front of ID'}
              </p>
              <p className="text-sm text-gray-500">
                Supports JPEG, PNG (max 10MB)
              </p>
            </div>

            <input
              ref={frontInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFrontDocumentSelect}
              className="hidden"
              disabled={uploadingFront}
            />
          </div>
        );

      case VerificationStep.FRONT_DOCUMENT_PROCESSING:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing Document</h2>
              <p className="text-gray-600">
                We're extracting information from your document. This usually takes 30-60 seconds.
              </p>
              {state.documents.front?.ocrData && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-2" />
                  <p className="text-green-800 text-sm">Document information extracted successfully!</p>
                </div>
              )}
            </div>
          </div>
        );

      case VerificationStep.BACK_DOCUMENT_UPLOAD:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Back of ID</h2>
            <p className="text-gray-600 mb-6">
              For enhanced verification, please upload the back of your ID document.
            </p>

            {/* Upload area */}
            <div
              onClick={() => backInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                {uploadingBack ? 'Uploading...' : 'Click to upload back of ID'}
              </p>
              <p className="text-sm text-gray-500">
                Supports JPEG, PNG (max 10MB)
              </p>
            </div>

            <input
              ref={backInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleBackDocumentSelect}
              className="hidden"
              disabled={uploadingBack}
            />
          </div>
        );

      case VerificationStep.BACK_DOCUMENT_PROCESSING:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing Back of ID</h2>
              <p className="text-gray-600">
                Scanning barcodes and QR codes on the back of your document...
              </p>
            </div>
          </div>
        );

      case VerificationStep.CROSS_VALIDATION:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Cross-Validating Documents</h2>
              <p className="text-gray-600">
                Verifying that the front and back of your ID contain consistent information...
              </p>
              {state.crossValidation.completed && (
                <div className={`mt-4 p-4 rounded-lg ${
                  state.crossValidation.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {state.crossValidation.passed ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-2" />
                      <p className="text-green-800 text-sm">Document validation successful!</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-red-600 mx-auto mb-2" />
                      <p className="text-red-800 text-sm">Document validation failed</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case VerificationStep.LIVE_CAPTURE:
        // Use the existing sophisticated LiveCaptureComponent instead of basic camera implementation
        if (showLiveCapture) {
          return (
            <LiveCaptureComponent
              onCapture={handleLiveCaptureComplete}
              onCancel={handleLiveCaptureCancel}
              isLoading={state.status === VerificationStatus.PROCESSING}
            />
          );
        }

        // Show the start button for live capture
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Photo Capture</h2>
            <p className="text-gray-600 mb-6">
              Take a live photo to verify your identity. Look directly at the camera and ensure good lighting.
            </p>

            <div className="text-center">
              <button
                onClick={handleLiveCaptureStart}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center space-x-2 mx-auto transition-colors"
              >
                <Camera className="w-5 h-5" />
                <span>Start Camera</span>
              </button>
            </div>
          </div>
        );

      case VerificationStep.LIVE_CAPTURE_PROCESSING:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing Live Capture</h2>
              <p className="text-gray-600">
                Performing face matching and liveness detection...
              </p>
            </div>
          </div>
        );

      case VerificationStep.VERIFICATION_COMPLETE:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              {state.finalResult?.status === 'verified' ? (
                <>
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h2 className="text-2xl font-semibold text-green-900 mb-2">Verification Complete!</h2>
                  <p className="text-green-700">Your identity has been successfully verified.</p>
                </>
              ) : state.finalResult?.status === 'failed' ? (
                <>
                  <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
                  <h2 className="text-2xl font-semibold text-red-900 mb-2">Verification Failed</h2>
                  <p className="text-red-700 mb-2">We were unable to verify your identity.</p>
                  {state.finalResult.reason && (
                    <p className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                      {state.finalResult.reason}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Clock className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
                  <h2 className="text-2xl font-semibold text-yellow-900 mb-2">Manual Review Required</h2>
                  <p className="text-yellow-700">Your verification requires manual review.</p>
                  {state.finalResult?.reason && (
                    <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded border border-yellow-200 mt-2">
                      {state.finalResult.reason}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Initializing...</h2>
              <p className="text-gray-600">Preparing verification flow...</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {renderStep()}

      {/* Status indicator */}
      {state.status === VerificationStatus.PROCESSING && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-blue-600 mr-3 animate-spin" />
            <span className="text-blue-800 font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
};