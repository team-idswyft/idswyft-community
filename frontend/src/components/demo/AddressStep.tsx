import React from 'react';
import { C } from '../../theme';

interface AddressStepProps {
  addressFile: File | null;
  addressPreview: string | null;
  addressDocType: string;
  addressResult: any;
  addressUploading: boolean;
  onAddressFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddressDocTypeChange: (type: string) => void;
  onUploadAddress: () => void;
  onStartNew: () => void;
}

export const AddressStep: React.FC<AddressStepProps> = ({
  addressFile,
  addressPreview,
  addressDocType,
  addressResult,
  addressUploading,
  onAddressFileSelect,
  onAddressDocTypeChange,
  onUploadAddress,
  onStartNew,
}) => {
  return (
    <div style={{ padding: '8px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 6 }}>
        Address Verification
        <span style={{ fontSize: 11, fontWeight: 400, color: C.dim, marginLeft: 8, verticalAlign: 'middle' }}>(optional)</span>
      </h2>
      <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
        Upload a proof-of-address document. The name will be cross-referenced against your verified ID.
      </p>

      {!addressResult ? (
        <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontFamily: C.mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: C.muted, marginBottom: 8 }}>Document Type</label>
            <select
              value={addressDocType}
              onChange={(e) => onAddressDocTypeChange(e.target.value)}
              style={{ background: C.panel, border: `1px solid ${C.borderStrong}`, color: C.text, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none' }}
            >
              <option value="utility_bill">Utility Bill</option>
              <option value="bank_statement">Bank Statement</option>
              <option value="tax_document">Tax Document</option>
            </select>
          </div>

          <label htmlFor="address-doc-upload" style={{ display: 'block', border: `1px solid ${C.borderStrong}`, background: C.panel, padding: '32px 16px', textAlign: 'center', cursor: 'pointer' }}>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onAddressFileSelect} style={{ display: 'none' }} id="address-doc-upload" />
            <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: C.muted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p style={{ color: C.muted, fontSize: 13 }}>Upload a utility bill, bank statement, or tax document</p>
            <p style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>JPEG, PNG or PDF (max 10MB)</p>
          </label>

          {addressFile && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 16 }}>
              <p style={{ fontWeight: 500, color: C.text, fontSize: 13, margin: 0 }}>{addressFile.name}</p>
              <p style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{(addressFile.size / 1024 / 1024).toFixed(2)} MB</p>
              {addressPreview && (
                <img src={addressPreview} alt="Address document preview" style={{ width: '100%', height: 160, objectFit: 'contain', background: C.codeBg, marginTop: 12 }} />
              )}
            </div>
          )}

          {addressFile && (
            <button
              onClick={onUploadAddress}
              disabled={addressUploading}
              style={{ background: C.purple, color: '#fff', border: `1px solid ${C.purple}`, padding: '11px 0', width: '100%', fontFamily: C.mono, fontWeight: 500, fontSize: 13, cursor: addressUploading ? 'not-allowed' : 'pointer', opacity: addressUploading ? 0.5 : 1 }}
            >
              {addressUploading ? 'Processing\u2026' : 'Verify Address Document'}
            </button>
          )}

          <button
            onClick={onStartNew}
            style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, padding: '10px 0', fontFamily: C.mono, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}
          >
            Skip {'\u2014'} Start New Demo
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          {/* Address Result Card */}
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, margin: '0 auto 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                background: addressResult.status === 'verified' ? C.greenDim : addressResult.status === 'failed' ? C.redDim : C.amberDim,
                border: `1px solid ${addressResult.status === 'verified' ? C.green : addressResult.status === 'failed' ? C.red : C.amber}`,
                color: addressResult.status === 'verified' ? C.green : addressResult.status === 'failed' ? C.red : C.amber,
              }}>
                {addressResult.status === 'verified' ? '\u2713' : addressResult.status === 'failed' ? '\u2717' : '\u26A0'}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                Address {addressResult.status === 'verified' ? 'Verified' : addressResult.status === 'failed' ? 'Failed' : 'Review'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>Overall Score</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{Math.round((addressResult.score || 0) * 100)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>Name Match</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{Math.round((addressResult.name_match_score || 0) * 100)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>Document Fresh</span>
                <span style={{ color: addressResult.document_fresh ? C.green : C.amber }}>{addressResult.document_fresh ? 'Yes' : 'No / Unknown'}</span>
              </div>
              {addressResult.address && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.muted }}>Address</span>
                  <span style={{ color: C.text, textAlign: 'right', maxWidth: 220 }}>{addressResult.address}</span>
                </div>
              )}
            </div>

            {addressResult.reasons && addressResult.reasons.length > 0 && (
              <div style={{ marginTop: 12, background: C.codeBg, border: `1px solid ${C.borderStrong}`, padding: 10 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, fontFamily: C.mono }}>Validation Notes</div>
                {addressResult.reasons.map((r: string, i: number) => (
                  <p key={i} style={{ color: C.dim, fontSize: 11, margin: '2px 0', fontFamily: C.mono }}>{'\u2022'} {r}</p>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onStartNew}
            style={{ background: C.accent, color: C.bg, border: `1px solid ${C.accent}`, padding: '10px 24px', fontFamily: C.mono, fontWeight: 500, fontSize: 13, cursor: 'pointer', width: '100%' }}
          >
            Start New Demo
          </button>
        </div>
      )}
    </div>
  );
};
