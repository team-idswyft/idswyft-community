import React, { useRef } from 'react';
import { C } from '../../theme';
import { IDViewfinder, TipBar, StepLabel, DemoPrimaryBtn, AmbientGlow } from './DemoShared';
import type { VerificationRequest } from './types';

interface BackUploadStepProps {
  verificationRequest: VerificationRequest | null;
  backFile: File | null;
  backPreviewUrl: string | null;
  isLoading: boolean;
  totalSteps?: number;
  onBackFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}

export const BackUploadStep: React.FC<BackUploadStepProps> = ({
  verificationRequest,
  backFile,
  backPreviewUrl,
  isLoading,
  totalSteps,
  onBackFileSelect,
  onUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrData = verificationRequest?.ocr_data;

  return (
    <div className="demo-fade-up" style={{ padding: '8px 0', position: 'relative' }}>
      <AmbientGlow />

      <StepLabel step={3} total={totalSteps ?? 6} label="Back of ID" />

      <h2 style={{
        fontSize: 22, fontWeight: 700, color: C.text,
        marginBottom: 6, letterSpacing: '-0.02em',
      }}>
        Now flip it over and upload the back
      </h2>

      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        The barcode on the back must be fully visible for cross-validation.
      </p>

      <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* OCR results from front (collapsed summary) */}
        {ocrData && Object.keys(ocrData).length > 0 && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            padding: '12px 14px',
          }}>
            <div style={{
              fontFamily: C.mono, fontSize: 10, fontWeight: 600,
              color: C.muted, marginBottom: 8, letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              Front scan results
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12 }}>
              {ocrData.full_name && (
                <div>
                  <span style={{ color: C.dim }}>Name: </span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.full_name}</span>
                </div>
              )}
              {ocrData.date_of_birth && (
                <div>
                  <span style={{ color: C.dim }}>DOB: </span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.date_of_birth}</span>
                </div>
              )}
              {ocrData.document_number && (
                <div>
                  <span style={{ color: C.dim }}>Doc#: </span>
                  <span style={{ color: C.text, fontWeight: 500, fontFamily: C.mono }}>{ocrData.document_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <TipBar text="Barcode must be unobstructed &middot; Good lighting" />

        {/* ID Viewfinder (back variant) */}
        <IDViewfinder
          variant="back"
          processing={isLoading}
          processingLabel="READING BARCODE"
          previewUrl={backPreviewUrl}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onBackFileSelect}
          style={{ display: 'none' }}
        />

        {!backFile ? (
          <DemoPrimaryBtn
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            Choose Back Photo
          </DemoPrimaryBtn>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: C.surface, border: `1px solid ${C.border}`,
              padding: '10px 14px',
            }}>
              <div>
                <p style={{ fontWeight: 500, color: C.text, fontSize: 13, margin: 0 }}>{backFile.name}</p>
                <p style={{ color: C.dim, fontSize: 11, margin: '2px 0 0' }}>{(backFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: 'none', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', fontFamily: C.mono }}
              >
                Change
              </button>
            </div>
            <DemoPrimaryBtn onClick={onUpload} disabled={isLoading}>
              {isLoading ? 'Processing\u2026' : 'Scan Back of ID'}
            </DemoPrimaryBtn>
          </>
        )}
      </div>
    </div>
  );
};
