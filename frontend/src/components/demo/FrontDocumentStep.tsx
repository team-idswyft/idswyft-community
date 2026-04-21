import React, { useRef } from 'react';
import { C } from '../../theme';
import { IDViewfinder, TipBar, StepLabel, DemoPrimaryBtn, AmbientGlow } from './DemoShared';

interface FrontDocumentStepProps {
  selectedFile: File | null;
  previewUrl: string | null;
  documentType: string;
  isLoading: boolean;
  isAgeOnly?: boolean;
  ageThreshold?: number;
  totalSteps?: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDocumentTypeChange: (type: string) => void;
  onUpload: () => void;
}

export const FrontDocumentStep: React.FC<FrontDocumentStepProps> = ({
  selectedFile,
  previewUrl,
  documentType,
  isLoading,
  isAgeOnly,
  ageThreshold,
  totalSteps,
  onFileSelect,
  onDocumentTypeChange,
  onUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="demo-fade-up" style={{ padding: '8px 0', position: 'relative' }}>
      <AmbientGlow />

      <StepLabel
        step={2}
        total={totalSteps ?? 6}
        label={isAgeOnly ? 'Upload ID' : 'Front of ID'}
      />

      <h2 style={{
        fontSize: 22, fontWeight: 700, color: C.text,
        marginBottom: 6, letterSpacing: '-0.02em',
      }}>
        {isAgeOnly ? 'Upload your ID' : 'Upload the front of your ID'}
      </h2>

      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        {isAgeOnly
          ? `We'll check your date of birth to confirm you are ${ageThreshold ?? 18}+. No other data is stored.`
          : 'Make sure all four corners are visible and the text is readable. Good lighting helps.'}
      </p>

      <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Document type selector */}
        <select
          value={documentType}
          onChange={(e) => onDocumentTypeChange(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px',
            border: `1px solid ${C.borderStrong}`, background: C.panel,
            color: C.text, fontFamily: C.mono, fontSize: 12, outline: 'none',
          }}
        >
          <option value="">Select document type</option>
          <option value="national_id">National ID</option>
          <option value="drivers_license">Driver's License</option>
          <option value="passport">Passport</option>
          <option value="other">Other</option>
        </select>

        <TipBar text="Good lighting &middot; No glare &middot; All corners visible" />

        {/* ID Viewfinder */}
        <IDViewfinder
          variant="front"
          processing={isLoading}
          processingLabel="READING FRONT"
          previewUrl={previewUrl}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />

        {!selectedFile ? (
          <DemoPrimaryBtn
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || !documentType}
          >
            {!documentType ? 'Select document type first' : 'Choose Front Photo'}
          </DemoPrimaryBtn>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: C.surface, border: `1px solid ${C.border}`,
              padding: '10px 14px',
            }}>
              <div>
                <p style={{ fontWeight: 500, color: C.text, fontSize: 13, margin: 0 }}>{selectedFile.name}</p>
                <p style={{ color: C.dim, fontSize: 11, margin: '2px 0 0' }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: 'none', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', fontFamily: C.mono }}
              >
                Change
              </button>
            </div>
            <DemoPrimaryBtn onClick={onUpload} disabled={isLoading || !documentType}>
              {isLoading ? 'Processing\u2026' : 'Scan Front of ID'}
            </DemoPrimaryBtn>
          </>
        )}
      </div>
    </div>
  );
};
