import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { getDocumentationApiUrl } from '../config/api';
import { C, injectFonts } from '../theme';
import '../styles/patterns.css';

// ─── Pill (matches DocsPage) ─────────────────────────────────────────────────
const Pill = ({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) => (
  <span style={{
    fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 600,
    letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4,
    background: bg, color, border: `1px solid ${color}30`,
  }}>{children}</span>
);

// ─── Custom markdown components ──────────────────────────────────────────────
const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 style={{ fontFamily: C.sans, fontSize: '2rem', fontWeight: 700, color: C.cyan, margin: '48px 0 16px', lineHeight: 1.3, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontFamily: C.sans, fontSize: '1.5rem', fontWeight: 600, color: C.text, margin: '40px 0 12px', lineHeight: 1.3, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontFamily: C.sans, fontSize: '1.15rem', fontWeight: 600, color: C.text, margin: '32px 0 8px', lineHeight: 1.4 }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.muted, margin: '24px 0 8px', lineHeight: 1.4 }}>{children}</h4>
  ),
  p: ({ children }) => (
    <p style={{ fontFamily: C.sans, fontSize: '0.92rem', lineHeight: 1.7, color: C.text, margin: '0 0 16px' }}>{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, textDecoration: 'none', borderBottom: `1px solid ${C.cyanBorder}` }}
      onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.cyan; }}
      onMouseLeave={e => { e.currentTarget.style.borderBottomColor = C.cyanBorder; }}
    >{children}</a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <code style={{ fontFamily: C.mono, fontSize: '0.82rem', color: C.code }}>{children}</code>
      );
    }
    return (
      <code style={{
        fontFamily: C.mono, fontSize: '0.82rem', color: C.code,
        background: C.codeBg, padding: '2px 6px', borderRadius: 4,
        border: `1px solid ${C.border}`,
      }}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre style={{
      fontFamily: C.mono, fontSize: '0.82rem', color: C.code,
      background: C.codeBg, padding: '16px 20px', borderRadius: 8,
      border: `1px solid ${C.border}`, overflowX: 'auto',
      margin: '0 0 16px', lineHeight: 1.6,
    }}>{children}</pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 16px' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontFamily: C.sans, fontSize: '0.85rem',
        border: `1px solid ${C.border}`, borderRadius: 8,
      }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: C.surface }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th style={{
      textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: C.text,
      borderBottom: `1px solid ${C.borderStrong}`, fontSize: '0.8rem',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '10px 14px', color: C.text,
      borderBottom: `1px solid ${C.border}`,
    }}>{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: `3px solid ${C.cyan}`, margin: '0 0 16px', padding: '12px 20px',
      background: C.cyanDim, borderRadius: '0 6px 6px 0', color: C.muted,
    }}>{children}</blockquote>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: 24, margin: '0 0 16px', lineHeight: 1.7, fontSize: '0.92rem' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ paddingLeft: 24, margin: '0 0 16px', lineHeight: 1.7, fontSize: '0.92rem' }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ margin: '4px 0', color: C.text }}>{children}</li>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '32px 0' }} />
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: C.text }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: C.muted }}>{children}</em>
  ),
};

// ─── Main component ──────────────────────────────────────────────────────────
export const MarkdownDocsPage: React.FC = () => {
  const apiUrl = getDocumentationApiUrl();
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { injectFonts(); }, []);

  const fetchMarkdown = () => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/api/docs/markdown`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => { setMarkdown(text); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/api/docs/markdown`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => { setMarkdown(text); setLoading(false); })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [apiUrl]);

  return (
    <div className="pattern-wave pattern-faint pattern-fade-edges pattern-full" style={{ fontFamily: C.sans, background: C.bg, color: C.text, margin: '-24px -24px 0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Header bar (matches DocsPage style) ── */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '18px 32px',
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, background: `${C.bg}ee`, backdropFilter: 'blur(8px)', zIndex: 10,
      }}>
        <div>
          <span style={{ fontFamily: C.mono, fontSize: '1.05rem', fontWeight: 600, color: C.text }}>
            <span style={{ color: C.cyan }}>idswyft</span>
            <span style={{ color: C.dim }}> / </span>
            <span>api-docs</span>
            <span style={{ color: C.dim }}> / </span>
            <span style={{ color: C.muted }}>markdown</span>
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="/docs"
            style={{
              fontFamily: C.mono, fontSize: '0.72rem', fontWeight: 500,
              color: C.muted, textDecoration: 'none',
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { const t = e.currentTarget; t.style.color = C.cyan; t.style.borderColor = C.cyan; }}
            onMouseLeave={e => { const t = e.currentTarget; t.style.color = C.muted; t.style.borderColor = C.border; }}
          >
            <ArrowLeftIcon style={{ width: 12, height: 12 }} />
            Back to Docs
          </a>

          <a
            href={`${apiUrl}/api/docs/markdown`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: C.mono, fontSize: '0.72rem', fontWeight: 500,
              color: C.muted, textDecoration: 'none',
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { const t = e.currentTarget; t.style.color = C.cyan; t.style.borderColor = C.cyan; }}
            onMouseLeave={e => { const t = e.currentTarget; t.style.color = C.muted; t.style.borderColor = C.border; }}
          >
            <ArrowDownTrayIcon style={{ width: 12, height: 12 }} />
            Download .md
          </a>

          <Pill color={C.green} bg={C.greenDim}>v1.7.0</Pill>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px 80px' }}>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{
              width: 32, height: 32, border: `3px solid ${C.border}`,
              borderTopColor: C.cyan, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center', padding: '80px 0', color: C.muted,
          }}>
            <p style={{ fontSize: '0.95rem', marginBottom: 16 }}>Failed to load documentation: {error}</p>
            <button
              onClick={fetchMarkdown}
              style={{
                fontFamily: C.mono, fontSize: '0.82rem', fontWeight: 500,
                color: C.cyan, background: C.cyanDim,
                border: `1px solid ${C.cyanBorder}`, borderRadius: 6,
                padding: '8px 20px', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,211,238,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.cyanDim; }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {markdown}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};
