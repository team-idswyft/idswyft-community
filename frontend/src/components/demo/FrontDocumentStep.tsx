import React from 'react';
import { C } from '../../theme';

interface FrontDocumentStepProps {
  selectedFile: File | null;
  previewUrl: string | null;
  documentType: string;
  isLoading: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDocumentTypeChange: (type: string) => void;
  onUpload: () => void;
}

export const FrontDocumentStep: React.FC<FrontDocumentStepProps> = ({
  selectedFile,
  previewUrl,
  documentType,
  isLoading,
  onFileSelect,
  onDocumentTypeChange,
  onUpload,
}) => {
  return (
    <div style={{ padding: '8px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 6 }}>Upload Your ID Document</h2>
      <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
        Upload a clear photo of your government-issued ID.
      </p>
      <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>Document Type</label>
          <select
            value={documentType}
            onChange={(e) => onDocumentTypeChange(e.target.value)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none' }}
          >
            <option value="">Select document type</option>
            <option value="national_id">National ID</option>
            <option value="drivers_license">Driver's License</option>
            <option value="passport">Passport</option>
            <option value="other">Other</option>
          </select>
        </div>
        <label htmlFor="document-upload" style={{ display: 'block', border: `2px dashed ${C.border}`, borderRadius: 8, padding: '32px 16px', textAlign: 'center', cursor: 'pointer' }}>
          <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onFileSelect} style={{ display: 'none' }} id="document-upload" />
          <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: C.muted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p style={{ color: C.muted, fontSize: 13 }}>Click to upload or drag and drop</p>
          <p style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>JPEG, PNG or PDF (max 10MB)</p>
        </label>
        {selectedFile && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <p style={{ fontWeight: 500, color: C.text, fontSize: 13, margin: 0 }}>{selectedFile.name}</p>
            <p style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            {previewUrl && (
              <img src={previewUrl} alt="Document preview" style={{ width: '100%', height: 160, objectFit: 'contain', background: C.codeBg, borderRadius: 6, marginTop: 12 }} />
            )}
          </div>
        )}
        {selectedFile && !documentType && (
          <p style={{ color: C.red, fontSize: 12, textAlign: 'center', margin: 0 }}>Please select a document type before uploading.</p>
        )}
        {selectedFile && (
          <button
            onClick={onUpload}
            disabled={isLoading || !documentType}
            style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '11px 0', width: '100%', fontWeight: 600, fontSize: 14, cursor: isLoading || !documentType ? 'not-allowed' : 'pointer', opacity: isLoading || !documentType ? 0.5 : 1 }}
          >
            {isLoading ? 'Uploading...' : 'Upload Document'}
          </button>
        )}
      </div>
    </div>
  );
};
