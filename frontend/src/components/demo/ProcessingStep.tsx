import React from 'react';
import { C } from '../../theme';

export const ProcessingStep: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 20 }}>Processing Document</h2>
      <div className="animate-spin" style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.cyan, margin: '0 auto 16px' }} />
      <p style={{ color: C.muted, fontSize: 13 }}>
        Extracting information with OCR and PDF417 barcode scanning...
      </p>
    </div>
  );
};
