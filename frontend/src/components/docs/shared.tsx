/**
 * Shared documentation components — used across all /docs/* pages.
 * Extracted from the original monolithic DocsPage for reuse.
 */
import React from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { C } from '../../theme';

// ─── Atoms ───────────────────────────────────────────────────────────────────

export const Pill = ({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) => (
  <span style={{
    fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 600,
    letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 0,
    background: bg, color, border: `1px solid ${color}30`,
  }}>{children}</span>
);

export const MethodBadge = ({ method }: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' }) => {
  const colors: Record<string, [string, string]> = {
    GET: [C.green, C.greenDim], POST: [C.blue, C.blueDim],
    PUT: [C.amber, C.amberDim], DELETE: [C.red, C.redDim],
  };
  const [color, bg] = colors[method] ?? [C.muted, 'rgba(136,150,170,0.1)'];
  return <Pill color={color} bg={bg}>{method}</Pill>;
};

export const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = {
    pending: [C.amber, C.amberDim],
    processing: [C.blue, C.blueDim],
    verified: [C.green, C.greenDim],
    failed: [C.red, C.redDim],
    manual_review: [C.orange, C.orangeDim],
  };
  const [color, bg] = map[status] ?? [C.muted, 'rgba(136,150,170,0.1)'];
  return <Pill color={color} bg={bg}>{status}</Pill>;
};

export const Callout = ({ type = 'note', children }: { type?: 'note' | 'warning' | 'danger' | 'tip'; children: React.ReactNode }) => {
  const cfg = {
    note:    { c: C.blue,   bg: C.blueDim,   icon: <InformationCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Note' },
    warning: { c: C.amber,  bg: C.amberDim,  icon: <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Important' },
    danger:  { c: C.red,    bg: C.redDim,    icon: <XCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Warning' },
    tip:     { c: C.green,  bg: C.greenDim,  icon: <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Tip' },
  }[type];
  return (
    <div style={{ borderLeft: `3px solid ${cfg.c}`, background: cfg.bg, borderRadius: 0, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: cfg.c, marginTop: 1 }}>{cfg.icon}</span>
      <div style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.text, lineHeight: 1.65 }}>
        <strong style={{ color: cfg.c, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', marginRight: 8, fontFamily: C.mono }}>{cfg.label}</strong>
        {children}
      </div>
    </div>
  );
};

// ─── Typography ──────────────────────────────────────────────────────────────

export const SectionAnchor = ({ id }: { id: string }) => <div id={id} style={{ scrollMarginTop: 88 }} />;

export const H2 = ({ children, index }: { children: React.ReactNode; index?: string }) => (
  <div className="section-head" style={{ display: 'grid', gridTemplateColumns: index ? '180px 1fr' : '1fr', gap: 16, padding: '32px 0 12px' }}>
    {index && <span className="eyebrow" style={{ fontFamily: C.mono, fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>{index}</span>}
    <h2 style={{ fontFamily: C.sans, fontSize: '1.35rem', fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.1 }}>
      {children}
    </h2>
  </div>
);

export const Lead = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontFamily: C.sans, fontSize: '0.93rem', color: C.muted, lineHeight: 1.75, margin: '0 0 24px', maxWidth: 680 }}>{children}</p>
);

export const Divider = () => <div style={{ height: 1, background: C.border, margin: '48px 0' }} />;

export const FieldRow = ({ name, type, req, desc }: { name: string; type: string; req: boolean; desc: string }) => (
  <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'flex-start' }}>
    <code style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.cyan, width: 160, flexShrink: 0 }}>{name}</code>
    <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, width: 100, flexShrink: 0 }}>{type}</code>
    <span style={{ width: 72, flexShrink: 0 }}>
      {req ? <Pill color={C.red} bg={C.redDim}>required</Pill> : <Pill color={C.dim} bg="rgba(74,85,104,0.13)">optional</Pill>}
    </span>
    <span style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.text, flex: 1, lineHeight: 1.6 }}>{desc}</span>
  </div>
);

// ─── Code blocks ─────────────────────────────────────────────────────────────

export const CODE_FONT = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace";
export type CodeLanguage = 'js' | 'python' | 'bash' | 'json' | 'text';

export const inferLanguage = (code: string, label?: string): CodeLanguage => {
  const lowerLabel = (label || '').toLowerCase();
  const trimmed = code.trim();
  if (lowerLabel.includes('response') || trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('curl')) return 'bash';
  return 'text';
};

export const highlightLine = (line: string, language: CodeLanguage) => {
  const keywords = new Set(
    language === 'js'
      ? ['const', 'let', 'await', 'async', 'new', 'return', 'if', 'else', 'true', 'false', 'null']
      : language === 'python'
        ? ['import', 'with', 'as', 'for', 'in', 'if', 'else', 'True', 'False', 'None']
        : language === 'json'
          ? ['true', 'false', 'null']
          : ['curl', '-X', '-H', '-d']
  );

  const commentPattern = language === 'python' ? /(#.*$)/ : /(\/\/.*$)/;
  const commentMatch = line.match(commentPattern);
  const codePart = commentMatch ? line.slice(0, commentMatch.index) : line;
  const commentPart = commentMatch ? line.slice(commentMatch.index) : '';
  const tokens = codePart.split(/(\s+|[()[\]{}.,:=])/).filter(token => token.length > 0);

  return (
    <>
      {tokens.map((token, idx) => {
        if (/^\s+$/.test(token)) return <span key={`ws-${idx}`} style={{ whiteSpace: 'pre' }}>{token}</span>;

        const plain = token.replace(/[()[\]{}.,:=]/g, '');
        const isString = /^f?["'`].*["'`]$/.test(plain);
        const isNumber = /^\d+$/.test(plain);
        const isKeyword = keywords.has(plain);
        const isFunction = /^(fetch|requests|post|get|print|open|FormData|JSON|stringify|console|log)$/.test(plain);

        const color = isString
          ? C.amber
          : isKeyword
            ? C.cyan
            : isFunction
              ? C.green
              : isNumber
                ? C.red
                : C.code;

        return <span key={`tok-${idx}`} style={{ color, fontWeight: isKeyword ? 600 : 400 }}>{token}</span>;
      })}
      {commentPart && <span style={{ color: C.muted }}>{commentPart}</span>}
    </>
  );
};

export const IDECodeBlock = ({ code, language, fileName }: { code: string; language: CodeLanguage; fileName: string }) => {
  const lines = code.split('\n');
  return (
    <div style={{ background: C.codeBg }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, opacity: 0.8 }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber, opacity: 0.8 }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, opacity: 0.8 }} />
        </div>
        <div style={{ fontFamily: CODE_FONT, fontSize: '0.68rem', color: C.muted }}>{fileName}</div>
        <div style={{ width: 38 }} />
      </div>
      <div style={{ overflowX: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${fileName}-${idx + 1}`}>
                <td style={{ width: 50, textAlign: 'right', verticalAlign: 'top', padding: '0 10px 0 0', color: C.dim, fontFamily: CODE_FONT, fontSize: '0.72rem', userSelect: 'none', borderRight: `1px solid ${C.border}`, background: C.surface }}>
                  {idx + 1}
                </td>
                <td style={{ padding: '0 16px 0 12px', color: C.code, fontFamily: CODE_FONT, fontSize: '0.79rem', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {line ? highlightLine(line, language) : ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const Pre = ({ code, label }: { code: string; label?: string }) => {
  const language = inferLanguage(code, label);
  const extension = language === 'json' ? 'json' : language === 'bash' ? 'sh' : 'txt';
  return (
    <div className="code-panel" style={{ borderRadius: 0, border: `1px solid ${C.borderStrong}`, overflow: 'hidden', marginBottom: 16, background: C.codeBg }}>
      {label && (
        <div style={{ background: C.surface, padding: '6px 20px', borderBottom: `1px solid ${C.borderStrong}`, fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
      <IDECodeBlock code={code} language={language} fileName={`snippet.${extension}`} />
    </div>
  );
};

// ─── Tabbed code block ───────────────────────────────────────────────────────

export type CodeTabType = 'curl' | 'js' | 'python';
const TAB_META: Record<CodeTabType, { label: string; lang: CodeLanguage; file: string }> = {
  curl:   { label: 'cURL',       lang: 'bash',   file: 'snippet.sh' },
  js:     { label: 'JavaScript', lang: 'js',     file: 'snippet.js' },
  python: { label: 'Python',     lang: 'python', file: 'snippet.py' },
};

export const CodeTabs = ({ curl, js, python, tab, onChange }: { curl?: string; js: string; python: string; tab: CodeTabType; onChange: (t: CodeTabType) => void }) => {
  const tabs = (curl ? ['curl', 'js', 'python'] : ['js', 'python']) as CodeTabType[];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const code = activeTab === 'curl' ? curl! : activeTab === 'js' ? js : python;
  const meta = TAB_META[activeTab];
  return (
    <div className="code-panel" style={{ borderRadius: 0, border: `1px solid ${C.borderStrong}`, overflow: 'hidden', marginBottom: 16, background: C.codeBg }}>
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.borderStrong}` }}>
        {tabs.map(t => (
          <button key={t} onClick={() => onChange(t)} className={`case-tab${activeTab === t ? ' active' : ''}`} style={{ padding: '10px 18px', fontFamily: C.mono, fontSize: '0.75rem', fontWeight: 500, color: activeTab === t ? C.text : C.muted, background: 'none', border: 'none', borderBottom: activeTab === t ? `2px solid ${C.text}` : '2px solid transparent', cursor: 'pointer', transition: 'color 0.15s' }}>
            {TAB_META[t].label}
          </button>
        ))}
      </div>
      <IDECodeBlock code={code} language={meta.lang} fileName={meta.file} />
    </div>
  );
};

// ─── Endpoint card ───────────────────────────────────────────────────────────

export const EndpointCard = ({ step, method, path, title, badge, children }: {
  step?: number; method: 'GET' | 'POST'; path: string; title: string;
  badge?: { label: string; color: string; bg: string }; children: React.ReactNode;
}) => (
  <div className="card" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 0, marginBottom: 28, overflow: 'hidden' }}>
    <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, background: C.surface }}>
      {step && (
        <div style={{ width: 26, height: 26, borderRadius: 0, background: C.cyanDim, border: `1px solid ${C.cyanBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 700, color: C.cyan, flexShrink: 0 }}>{step}</div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <MethodBadge method={method} />
          <code style={{ fontFamily: C.mono, fontSize: '0.84rem', color: C.cyan }}>{path}</code>
          {badge && <Pill color={badge.color} bg={badge.bg}>{badge.label}</Pill>}
        </div>
        <div style={{ fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, color: C.text }}>{title}</div>
      </div>
    </div>
    <div style={{ padding: '20px 24px' }}>{children}</div>
  </div>
);

// ─── Pipeline diagram ────────────────────────────────────────────────────────

export const Pipeline = () => {
  const steps = [
    { n: 1, label: 'Start Session', color: C.blue },
    { n: 2, label: 'Front Doc', color: C.cyan },
    { n: 3, label: 'Back-of-ID', color: C.cyan },
    { n: 4, label: 'Live Capture', color: C.green },
    { n: 5, label: 'Results', color: C.green },
  ];
  return (
    <div className="card" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 0, padding: '24px 32px', marginBottom: 24 }}>
      <p className="eyebrow" style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px' }}>Verification Pipeline</p>
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 4 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 80 }}>
              <div style={{ width: 36, height: 36, borderRadius: 0, background: `${s.color}18`, border: `1.5px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: '0.78rem', fontWeight: 700, color: s.color, margin: '0 auto 8px' }}>{s.n}</div>
              <div style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.muted, lineHeight: 1.4, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingBottom: 20, minWidth: 24 }}>
                <div style={{ flex: 1, height: 1, background: C.borderStrong }} />
                <ArrowRightIcon style={{ width: 12, height: 12, color: C.dim, flexShrink: 0 }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: '10px 14px', background: C.redDim, borderRadius: 0, border: `1px solid ${C.red}25`, fontFamily: C.sans, fontSize: '0.78rem', color: C.muted }}>
        <span style={{ color: C.red, fontWeight: 600 }}>Cross-validation gate:</span>{' '}
        If Step 3 (back-of-ID) fails cross-validation, status is set to <code style={{ fontFamily: C.mono, color: C.red }}>failed</code> and Step 4 is blocked.
      </div>
    </div>
  );
};
