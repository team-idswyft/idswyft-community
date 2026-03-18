import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { C, injectFonts } from '../theme';
import '../styles/patterns.css';

export const NotFoundPage: React.FC = () => {
  useEffect(() => { injectFonts(); }, []);

  return (
    <div className="pattern-topographic pattern-faint pattern-fade-edges pattern-full" style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontFamily: C.mono, fontSize: 'clamp(80px, 16vw, 128px)', fontWeight: 600, color: C.surface, lineHeight: 1, marginBottom: 8, userSelect: 'none' }}>
          404
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          Page Not Found
        </div>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, marginBottom: 36 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <Link
            to="/"
            style={{ background: C.cyan, color: C.bg, padding: '10px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
          >
            ← Home
          </Link>
          <Link
            to="/docs"
            style={{ border: `1px solid ${C.border}`, color: C.text, padding: '10px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
          >
            View Docs →
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Developer Portal', to: '/developer' },
            { label: 'Live Demo', to: '/demo' },
          ].map(({ label, to }) => (
            <Link key={to} to={to} style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
