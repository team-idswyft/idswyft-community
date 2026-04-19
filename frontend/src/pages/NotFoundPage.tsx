import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { C, injectFonts } from '../theme';

export const NotFoundPage: React.FC = () => {
  useEffect(() => { injectFonts(); }, []);

  return (
    <div style={{ background: 'var(--paper)', fontFamily: C.sans, color: 'var(--ink)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontFamily: C.mono, fontSize: 'clamp(80px, 16vw, 128px)', fontWeight: 500, color: 'var(--rule)', lineHeight: 1, marginBottom: 8, userSelect: 'none', letterSpacing: '-0.04em' }}>
          404
        </div>
        <div className="eyebrow" style={{ marginBottom: 20 }}>
          Page Not Found
        </div>
        <p style={{ color: 'var(--mid)', fontSize: 15, lineHeight: 1.6, marginBottom: 36 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <Link
            to="/"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            Home
          </Link>
          <Link
            to="/docs"
            className="btn ghost"
            style={{ border: '1px solid var(--rule-strong)', textDecoration: 'none' }}
          >
            View Docs
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Developer Portal', to: '/developer' },
            { label: 'Live Demo', to: '/demo' },
          ].map(({ label, to }) => (
            <Link key={to} to={to} style={{ color: 'var(--mid)', fontSize: 13, textDecoration: 'none', fontFamily: C.mono }}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
