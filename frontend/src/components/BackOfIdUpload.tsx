import React, { useState, useRef } from 'react';
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  QrCodeIcon,
  ViewfinderCircleIcon
} from '@heroicons/react/24/outline';
import { buildApiUrl, shouldUseSandbox } from '../config/api';

interface BackOfIdUploadProps {
  verificationId: string;
  documentType: string;
  apiKey: string;
  onUploadComplete?: (result: any) => void;
  onUploadError?: (error: string) => void;
}

export const BackOfIdUpload: React.FC<BackOfIdUploadProps> = ({
  verificationId,
  documentType,
  apiKey,
  onUploadComplete,
  onUploadError
}) => {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      const errorMsg = 'Please upload a valid image file (JPEG, PNG, or WebP)';
      setError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = 'File size must be less than 10MB';
      setError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    uploadBackOfId(file);
  };

  const uploadBackOfId = async (file: File) => {
    setUploadState('uploading');
    setError('');

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('document_type', documentType);

      // Build URL with sandbox query parameter if needed
      const url = buildApiUrl(`/api/v2/verify/${verificationId}/back-document`);
      if (shouldUseSandbox()) {
        url.searchParams.append('sandbox', 'true');
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Back-of-ID upload response:', result);

      setUploadResult(result);

      // Check if cross-validation rejected the session
      if (result.rejection_reason || result.status === 'failed') {
        const reason = result.rejection_detail || result.rejection_reason || 'Cross-validation failed';
        setError(reason);
        setUploadState('error');
        onUploadError?.(`Verification failed: ${reason}`);
        return;
      }

      setUploadState('processing');
      onUploadComplete?.(result);

      // Simulate processing completion
      setTimeout(() => {
        setUploadState('success');
      }, 3000);

    } catch (error) {
      console.error('❌ Back-of-ID upload failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setError(errorMsg);
      setUploadState('error');
      onUploadError?.(errorMsg);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const renderUploadArea = () => {
    if (uploadState === 'success') {
      return (
        <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Back-of-ID Uploaded Successfully!
          </h3>
          <p className="text-gray-600 mb-4">
            Enhanced verification with barcode/QR scanning completed
          </p>
          
          {uploadResult?.enhanced_verification && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center space-x-2 text-green-800">
                <QrCodeIcon className="w-5 h-5" />
                <span className="font-medium">Enhanced Verification Features:</span>
              </div>
              <ul className="mt-2 text-green-700 text-sm space-y-1">
                {uploadResult.enhanced_verification.barcode_scanning_enabled && (
                  <li>✓ Barcode/QR Code Scanning</li>
                )}
                {uploadResult.enhanced_verification.cross_validation_enabled && (
                  <li>✓ Cross-validation with Front-of-ID</li>
                )}
                {uploadResult.enhanced_verification.ai_powered && (
                  <li>✓ AI-Powered Analysis</li>
                )}
              </ul>
            </div>
          )}
        </div>
      );
    }

    if (uploadState === 'processing') {
      return (
        <div className="text-center py-8">
          <ArrowPathIcon className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Processing Back-of-ID...
          </h3>
          <div className="space-y-2 text-gray-600">
            <p className="flex items-center justify-center space-x-2">
              <QrCodeIcon className="w-4 h-4" />
              <span>Scanning QR codes and barcodes</span>
            </p>
            <p className="flex items-center justify-center space-x-2">
              <ViewfinderCircleIcon className="w-4 h-4" />
              <span>Cross-validating with front-of-ID</span>
            </p>
            <p className="flex items-center justify-center space-x-2">
              <CheckCircleIcon className="w-4 h-4" />
              <span>Verifying authenticity</span>
            </p>
          </div>
        </div>
      );
    }

    if (uploadState === 'uploading') {
      return (
        <div className="text-center py-8">
          <ArrowPathIcon className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Uploading Back-of-ID...
          </h3>
          <p className="text-gray-600">Please wait while we process your document</p>
        </div>
      );
    }

    return (
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center hover:border-blue-400 transition-colors ${
          dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileInputChange}
          className="hidden"
        />
        
        <QrCodeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Upload Back-of-ID for Enhanced Verification
        </h3>
        
        <p className="text-gray-600 mb-4">
          Upload the back of your ID for QR/barcode scanning and cross-validation
        </p>
        
        <div className="space-y-2">
          <button
            onClick={triggerFileSelect}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
            Choose File
          </button>
          
          <p className="text-sm text-gray-500">or drag and drop your image here</p>
        </div>
        
        <div className="mt-4 text-xs text-gray-400">
          Supported formats: JPEG, PNG, WebP (max 10MB)
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <QrCodeIcon className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">
          Enhanced Verification
        </h2>
        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
          Optional
        </span>
      </div>
      
      <div className="mb-4 text-sm text-gray-600">
        <p className="mb-2">
          <strong>Why upload the back-of-ID?</strong>
        </p>
        <ul className="space-y-1 ml-4">
          <li>• <strong>QR/Barcode Scanning:</strong> Extract encoded verification data</li>
          <li>• <strong>Cross-Validation:</strong> Compare front and back information</li>
          <li>• <strong>Higher Accuracy:</strong> Increase verification confidence</li>
          <li>• <strong>Security Features:</strong> Detect additional authenticity markers</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800">
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="font-medium">Upload Error</span>
          </div>
          <p className="mt-1 text-red-700 text-sm">{error}</p>
        </div>
      )}

      {renderUploadArea()}
      
      {uploadResult && uploadResult.next_steps && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Next Steps:</h4>
          <ul className="space-y-1">
            {uploadResult.next_steps.map((step: string, index: number) => (
              <li key={index} className="text-sm text-gray-700">
                {index + 1}. {step}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};