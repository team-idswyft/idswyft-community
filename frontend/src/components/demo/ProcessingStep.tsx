import React, { useState, useEffect } from 'react';
import { C } from '../../theme';
import { AmbientGlow } from './DemoShared';

const MESSAGES = [
  'Extracting document text\u2026',
  'Reading document fields\u2026',
  'Analyzing image quality\u2026',
];

const TAGS = ['OCR scan', 'Field extraction', 'Quality check'];

export const ProcessingStep: React.FC = () => {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1800);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="demo-fade-up"
      style={{
        textAlign: 'center', padding: '48px 0', position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      <AmbientGlow />

      {/* Spinner */}
      <div style={{
        width: 80, height: 80,
        border: `2.5px solid ${C.accentSoft}`,
        borderTopColor: C.accent, borderRadius: '50%',
        animation: 'dSpin 1s linear infinite',
        marginBottom: 18,
      }} />

      {/* Cycling message */}
      <p style={{
        fontFamily: C.sans, fontSize: 16, fontWeight: 700,
        color: C.text, marginBottom: 6,
      }}>
        {MESSAGES[msgIdx]}
      </p>

      <p style={{
        fontFamily: C.mono, fontSize: 11, color: C.muted,
        letterSpacing: '0.08em',
      }}>
        This only takes a moment
      </p>

      {/* Status tags */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {TAGS.map(tag => (
          <span key={tag} style={{
            padding: '5px 10px',
            background: C.accentSoft, border: `1px solid ${C.border}`,
            fontFamily: C.mono, fontSize: 10,
            color: C.accent, opacity: 0.7,
          }}>{tag}</span>
        ))}
      </div>
    </div>
  );
};
