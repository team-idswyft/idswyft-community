import React from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';
import { C } from '../../theme';
import { BackOfIdUpload } from '../BackOfIdUpload';
import type { VerificationRequest } from './types';

interface BackDocumentStepProps {
  verificationRequest: VerificationRequest | null;
  verificationId: string | null;
  apiKey: string;
  documentType: string;
  backOfIdUploaded: boolean;
  showLiveCapture: boolean;
  onBackUploaded: (uploaded: boolean) => void;
  onStartLiveCapture: () => void;
  onSkipLiveCapture: () => void;
  renderLiveCapture: () => React.ReactNode;
}

export const BackDocumentStep: React.FC<BackDocumentStepProps> = ({
  verificationRequest,
  verificationId,
  apiKey,
  documentType,
  backOfIdUploaded,
  showLiveCapture,
  onBackUploaded,
  onStartLiveCapture,
  onSkipLiveCapture,
  renderLiveCapture,
}) => {
  const ocrData = verificationRequest?.ocr_data;

  return (
    <div style={{ padding: '8px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 20 }}>Document Information & Verification</h2>
      {ocrData && Object.keys(ocrData).length > 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Extracted Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ocrData.full_name && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.muted }}>Full Name</span>
                <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.full_name}</span>
              </div>
            )}
            {ocrData.document_number && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.muted }}>Document Number</span>
                <span style={{ color: C.text, fontWeight: 500, fontFamily: C.mono }}>{ocrData.document_number}</span>
              </div>
            )}
            {ocrData.date_of_birth && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.muted }}>Date of Birth</span>
                <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.date_of_birth}</span>
              </div>
            )}
            {ocrData.expiry_date && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.muted }}>Expiry Date</span>
                <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.expiry_date}</span>
              </div>
            )}
            {ocrData.nationality && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.muted }}>Nationality</span>
                <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.nationality}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: C.amberDim, border: `1px solid ${C.amber}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <p style={{ color: C.amber, fontSize: 13, margin: 0 }}>Document information could not be extracted automatically.</p>
        </div>
      )}

      {!backOfIdUploaded && (
        <div style={{ marginBottom: 20 }}>
          <BackOfIdUpload
            verificationId={verificationId!}
            documentType={documentType || 'national_id'}
            apiKey={apiKey}
            onUploadComplete={(result) => {
              console.log('Back-of-ID upload completed:', result);
              onBackUploaded(true);
            }}
            onUploadError={(error) => {
              console.error('Back-of-ID upload error:', error);
            }}
          />
        </div>
      )}

      {backOfIdUploaded && (
        <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.green, fontSize: 13, fontWeight: 600 }}>
            <span>{'\u2713'}</span>
            <span>Enhanced Verification Complete</span>
          </div>
          <p style={{ color: C.green, fontSize: 12, marginTop: 6, opacity: 0.8, margin: '6px 0 0' }}>
            Back-of-ID processed with PDF417 barcode scanning, QR code detection, and cross-validation.
          </p>
        </div>
      )}

      {backOfIdUploaded && showLiveCapture && renderLiveCapture()}

      {backOfIdUploaded && !showLiveCapture && (
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>Identity Verification</h3>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
            Verify you're the person in the document using live capture.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360, margin: '0 auto' }}>
            <button
              onClick={onStartLiveCapture}
              style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <CameraIcon style={{ width: 18, height: 18 }} />
              Start Live Capture
            </button>
            <button
              onClick={onSkipLiveCapture}
              style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Skip Live Capture
            </button>
          </div>
        </div>
      )}

      {!backOfIdUploaded && (
        <div style={{ background: C.blueDim, border: `1px solid ${C.blue}`, borderRadius: 8, padding: 20, textAlign: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.blue, marginBottom: 6 }}>Next Step: Upload Back-of-ID</h3>
          <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
            Upload the back of your ID for enhanced verification with PDF417 barcode scanning.
          </p>
        </div>
      )}
    </div>
  );
};
