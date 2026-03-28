/**
 * Shared layout for all /docs/* pages.
 * Provides: header bar, sidebar with page-level + section-level nav, main content area.
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { C, injectFonts } from '../../theme';
import { Pill } from './shared';
import '../../styles/patterns.css';

// ─── Page-level navigation (shown at top of sidebar on every docs page) ──────

export interface DocPage {
  path: string;
  label: string;
}

export const DOC_PAGES: DocPage[] = [
  { path: '/docs',           label: 'Getting Started' },
  { path: '/docs/guides',    label: 'Guides' },
  { path: '/docs/sdk',       label: 'SDK & Embed' },
  { path: '/docs/features',  label: 'Features' },
  { path: '/docs/reference', label: 'Reference' },
  { path: '/docs/review',    label: 'Review Dashboard' },
];

// ─── Section nav item (within a page) ────────────────────────────────────────

export interface NavItem {
  id: string;
  label: string;
  depth: number; // 0 = section, 1 = subsection
}

// ─── Layout component ────────────────────────────────────────────────────────

interface DocLayoutProps {
  /** Slug shown in header: "idswyft / {slug}" */
  slug: string;
  /** Section nav items for the current page */
  nav: NavItem[];
  children: React.ReactNode;
}

export const DocLayout: React.FC<DocLayoutProps> = ({ slug, nav, children }) => {
  const location = useLocation();
  const [active, setActive] = useState(nav[0]?.id ?? '');

  useEffect(() => { injectFonts(); }, []);

  // Scroll spy
  useEffect(() => {
    const ids = nav.map(n => n.id);
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-80px 0px -55% 0px' }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [nav]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const isCurrentPage = (path: string) => location.pathname === path;

  return (
    <div className="pattern-wave pattern-faint pattern-fade-edges pattern-full" style={{ fontFamily: C.sans, background: C.bg, color: C.text, margin: '-24px -24px 0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Header bar ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 32px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, background: `${C.bg}ee`, backdropFilter: 'blur(8px)', zIndex: 10 }}>
        <div>
          <span style={{ fontFamily: C.mono, fontSize: '1.05rem', fontWeight: 600, color: C.text }}>
            <span style={{ color: C.cyan }}>idswyft</span>
            <span style={{ color: C.dim }}> / </span>
            <span>{slug}</span>
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            to="/docs/markdown"
            style={{
              fontFamily: C.mono, fontSize: '0.72rem', fontWeight: 500,
              color: C.muted, textDecoration: 'none',
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${C.border}`,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.cyan; e.currentTarget.style.borderColor = C.cyan; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
          >.md</Link>
          <Pill color={C.green} bg={C.greenDim}>v1.7.0</Pill>
          <Pill color={C.muted} bg="rgba(74,85,104,0.13)">March 2026</Pill>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'flex', maxWidth: 1440, margin: '0 auto' }}>

        {/* Sidebar */}
        <aside className="hidden lg:block" style={{ width: 230, flexShrink: 0, position: 'sticky', top: 57, height: 'calc(100vh - 57px)', overflowY: 'auto', borderRight: `1px solid ${C.border}`, padding: '20px 0', background: C.sidebar }}>

          {/* Page-level nav */}
          <div style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.dim, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 20px 8px' }}>Pages</div>
          {DOC_PAGES.map(page => (
            <Link
              key={page.path}
              to={page.path}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 20px',
                fontFamily: C.sans, fontSize: '0.8rem', fontWeight: 600,
                color: isCurrentPage(page.path) ? C.cyan : C.muted,
                background: isCurrentPage(page.path) ? C.cyanDim : 'transparent',
                borderLeft: isCurrentPage(page.path) ? `2px solid ${C.cyan}` : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              {page.label}
            </Link>
          ))}

          {/* Section-level nav (within current page) */}
          {nav.length > 0 && (
            <>
              <div style={{ height: 1, background: C.border, margin: '12px 20px' }} />
              <div style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.dim, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 20px 8px' }}>On this page</div>
              {nav.map(item => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: item.depth === 0 ? '5px 20px' : '4px 20px 4px 34px',
                    fontFamily: C.sans,
                    fontSize: item.depth === 0 ? '0.8rem' : '0.75rem',
                    fontWeight: item.depth === 0 ? 600 : 400,
                    color: active === item.id ? C.cyan : item.depth === 0 ? C.text : C.muted,
                    background: active === item.id ? C.cyanDim : 'transparent',
                    borderLeft: active === item.id ? `2px solid ${C.cyan}` : '2px solid transparent',
                    border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '48px 52px', maxWidth: 980, minWidth: 0 }}>
          {children}

          {/* Footer */}
          <div style={{ marginTop: 64, paddingTop: 24, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.7rem', color: C.dim }}>
            &copy; 2026 Idswyft &mdash; Open source under MIT License
          </div>
        </main>
      </div>
    </div>
  );
};
