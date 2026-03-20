import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { getDocumentationApiUrl } from '../config/api';
import { C, injectFonts } from '../theme';
import '../styles/patterns.css';


// ─── Small reusable pieces ────────────────────────────────────────────────────

const Pill = ({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) => (
  <span style={{
    fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 600,
    letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4,
    background: bg, color, border: `1px solid ${color}30`,
  }}>{children}</span>
);

const MethodBadge = ({ method }: { method: 'GET' | 'POST' }) =>
  <Pill color={method === 'GET' ? C.green : C.blue} bg={method === 'GET' ? C.greenDim : C.blueDim}>{method}</Pill>;

const StatusPill = ({ status }: { status: string }) => {
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

const Callout = ({ type = 'note', children }: { type?: 'note' | 'warning' | 'danger' | 'tip'; children: React.ReactNode }) => {
  const cfg = {
    note:    { c: C.blue,   bg: C.blueDim,   icon: <InformationCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Note' },
    warning: { c: C.amber,  bg: C.amberDim,  icon: <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Important' },
    danger:  { c: C.red,    bg: C.redDim,    icon: <XCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Warning' },
    tip:     { c: C.green,  bg: C.greenDim,  icon: <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />, label: 'Tip' },
  }[type];
  return (
    <div style={{ borderLeft: `3px solid ${cfg.c}`, background: cfg.bg, borderRadius: '0 6px 6px 0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: cfg.c, marginTop: 1 }}>{cfg.icon}</span>
      <div style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.text, lineHeight: 1.65 }}>
        <strong style={{ color: cfg.c, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', marginRight: 8, fontFamily: C.mono }}>{cfg.label}</strong>
        {children}
      </div>
    </div>
  );
};

const CODE_FONT = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace";
type CodeLanguage = 'js' | 'python' | 'bash' | 'json' | 'text';

const inferLanguage = (code: string, label?: string): CodeLanguage => {
  const lowerLabel = (label || '').toLowerCase();
  const trimmed = code.trim();
  if (lowerLabel.includes('response') || trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('curl')) return 'bash';
  return 'text';
};

const highlightLine = (line: string, language: CodeLanguage) => {
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

const IDECodeBlock = ({ code, language, fileName }: { code: string; language: CodeLanguage; fileName: string }) => {
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

const Pre = ({ code, label }: { code: string; label?: string }) => {
  const language = inferLanguage(code, label);
  const extension = language === 'json' ? 'json' : language === 'bash' ? 'sh' : 'txt';
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
      {label && (
        <div style={{ background: C.surface, padding: '6px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
      <IDECodeBlock code={code} language={language} fileName={`snippet.${extension}`} />
    </div>
  );
};

const SectionAnchor = ({ id }: { id: string }) => <div id={id} style={{ scrollMarginTop: 88 }} />;

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontFamily: C.mono, fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ color: C.cyan, fontWeight: 400 }}>#</span>{children}
  </h2>
);

const Lead = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontFamily: C.sans, fontSize: '0.93rem', color: C.muted, lineHeight: 1.75, margin: '0 0 24px', maxWidth: 680 }}>{children}</p>
);

const Divider = () => <div style={{ height: 1, background: C.border, margin: '48px 0' }} />;

const FieldRow = ({ name, type, req, desc }: { name: string; type: string; req: boolean; desc: string }) => (
  <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'flex-start' }}>
    <code style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.cyan, width: 160, flexShrink: 0 }}>{name}</code>
    <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, width: 100, flexShrink: 0 }}>{type}</code>
    <span style={{ width: 72, flexShrink: 0 }}>
      {req ? <Pill color={C.red} bg={C.redDim}>required</Pill> : <Pill color={C.dim} bg="rgba(74,85,104,0.13)">optional</Pill>}
    </span>
    <span style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.text, flex: 1, lineHeight: 1.6 }}>{desc}</span>
  </div>
);

// ─── Pipeline step diagram ────────────────────────────────────────────────────
const Pipeline = () => {
  const steps = [
    { n: 1, label: 'Start Session', color: C.blue },
    { n: 2, label: 'Front Doc', color: C.cyan },
    { n: 3, label: 'Back-of-ID', color: C.cyan },
    { n: 4, label: 'Live Capture', color: C.green },
    { n: 5, label: 'Results', color: C.green },
  ];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 32px', marginBottom: 24 }}>
      <p style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px' }}>Verification Pipeline</p>
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 4 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 80 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${s.color}18`, border: `1.5px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: '0.78rem', fontWeight: 700, color: s.color, margin: '0 auto 8px' }}>{s.n}</div>
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
      <div style={{ marginTop: 16, padding: '10px 14px', background: C.redDim, borderRadius: 6, border: `1px solid ${C.red}25`, fontFamily: C.sans, fontSize: '0.78rem', color: C.muted }}>
        <span style={{ color: C.red, fontWeight: 600 }}>⚠ Cross-validation gate:</span>{' '}
        If Step 3 (back-of-ID) fails cross-validation, status is set to <code style={{ fontFamily: C.mono, color: C.red }}>failed</code> and Step 4 is blocked.
      </div>
    </div>
  );
};

// ─── Tabbed code block ────────────────────────────────────────────────────────
type CodeTabType = 'curl' | 'js' | 'python';
const TAB_META: Record<CodeTabType, { label: string; lang: CodeLanguage; file: string }> = {
  curl:   { label: 'cURL',       lang: 'bash',   file: 'snippet.sh' },
  js:     { label: 'JavaScript', lang: 'js',     file: 'snippet.js' },
  python: { label: 'Python',     lang: 'python', file: 'snippet.py' },
};

const CodeTabs = ({ curl, js, python, tab, onChange }: { curl?: string; js: string; python: string; tab: CodeTabType; onChange: (t: CodeTabType) => void }) => {
  const tabs = (curl ? ['curl', 'js', 'python'] : ['js', 'python']) as CodeTabType[];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const code = activeTab === 'curl' ? curl! : activeTab === 'js' ? js : python;
  const meta = TAB_META[activeTab];
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(t => (
          <button key={t} onClick={() => onChange(t)} style={{ padding: '8px 18px', fontFamily: CODE_FONT, fontSize: '0.75rem', fontWeight: 500, color: activeTab === t ? C.cyan : C.muted, background: 'none', border: 'none', borderBottom: activeTab === t ? `2px solid ${C.cyan}` : '2px solid transparent', cursor: 'pointer', transition: 'color 0.15s' }}>
            {TAB_META[t].label}
          </button>
        ))}
      </div>
      <IDECodeBlock code={code} language={meta.lang} fileName={meta.file} />
    </div>
  );
};

// ─── Endpoint card ────────────────────────────────────────────────────────────
const EndpointCard = ({ step, method, path, title, badge, children }: {
  step?: number; method: 'GET' | 'POST'; path: string; title: string;
  badge?: { label: string; color: string; bg: string }; children: React.ReactNode;
}) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 28, overflow: 'hidden' }}>
    <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, background: `linear-gradient(90deg, ${C.surface}, rgba(34,211,238,0.03))` }}>
      {step && (
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.cyanDim, border: `1px solid ${C.cyanBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 700, color: C.cyan, flexShrink: 0 }}>{step}</div>
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

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
const NAV = [
  { id: 'quick-start', label: 'Quick Start', depth: 0 },
  { id: 'auth', label: 'Authentication', depth: 0 },
  { id: 'flow', label: 'Verification Flow', depth: 0 },
  { id: 'step-1', label: '1 · Start Session', depth: 1 },
  { id: 'step-2', label: '2 · Upload Front', depth: 1 },
  { id: 'step-3', label: '3 · Upload Back', depth: 1 },
  { id: 'step-4', label: '4 · Live Capture', depth: 1 },
  { id: 'step-5', label: '5 · Get Results', depth: 1 },
  { id: 'selfie', label: 'Cross-Validation', depth: 1 },
  { id: 'integration', label: 'Integration', depth: 0 },
  { id: 'sdk', label: 'JavaScript SDK', depth: 0 },
  { id: 'embed', label: 'Embed Component', depth: 0 },
  { id: 'analysis', label: 'Analysis Engine', depth: 0 },
  { id: 'batch', label: 'Batch API', depth: 0 },
  { id: 'address', label: 'Address Verification', depth: 0 },
  { id: 'aml', label: 'AML / Sanctions', depth: 0 },
  { id: 'monitoring', label: 'Monitoring', depth: 0 },
  { id: 'statuses', label: 'Statuses', depth: 0 },
  { id: 'rate-limits', label: 'Rate Limits', depth: 0 },
  { id: 'changelog', label: 'Changelog', depth: 0 },
  { id: 'support', label: 'Support', depth: 0 },
];

// ─── Main component ───────────────────────────────────────────────────────────
export const DocsPage: React.FC = () => {
  const apiUrl = getDocumentationApiUrl();
  const [tab, setTab] = useState<CodeTabType>('curl');
  const [active, setActive] = useState('quick-start');

  // Inject fonts
  useEffect(() => {
    injectFonts();
  }, []);

  // Scroll spy
  useEffect(() => {
    const ids = NAV.map(n => n.id);
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-80px 0px -55% 0px' }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="pattern-wave pattern-faint pattern-fade-edges pattern-full" style={{ fontFamily: C.sans, background: C.bg, color: C.text, margin: '-24px -24px 0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Page header bar ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 32px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, background: `${C.bg}ee`, backdropFilter: 'blur(8px)', zIndex: 10 }}>
        <div>
          <span style={{ fontFamily: C.mono, fontSize: '1.05rem', fontWeight: 600, color: C.text }}>
            <span style={{ color: C.cyan }}>idswyft</span>
            <span style={{ color: C.dim }}> / </span>
            <span>api-docs</span>
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill color={C.green} bg={C.greenDim}>v4.0</Pill>
          <Pill color={C.muted} bg="rgba(74,85,104,0.13)">March 2026</Pill>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'flex', maxWidth: 1440, margin: '0 auto' }}>

        {/* Sidebar */}
        <aside className="hidden lg:block" style={{ width: 230, flexShrink: 0, position: 'sticky', top: 57, height: 'calc(100vh - 57px)', overflowY: 'auto', borderRight: `1px solid ${C.border}`, padding: '28px 0', background: C.sidebar }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.dim, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 20px 12px' }}>Contents</div>
          {NAV.map(item => (
            <button key={item.id} onClick={() => scrollTo(item.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: item.depth === 0 ? '6px 20px' : '5px 20px 5px 34px', fontFamily: C.sans, fontSize: item.depth === 0 ? '0.82rem' : '0.77rem', fontWeight: item.depth === 0 ? 600 : 400, color: active === item.id ? C.cyan : item.depth === 0 ? C.text : C.muted, background: active === item.id ? C.cyanDim : 'transparent', borderLeft: active === item.id ? `2px solid ${C.cyan}` : '2px solid transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
              {item.label}
            </button>
          ))}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '48px 52px', maxWidth: 980, minWidth: 0 }}>

          {/* ══ QUICK START ══════════════════════════════════════════════════ */}
          <SectionAnchor id="quick-start" />
          <H2>Quick Start</H2>
          <Lead>
            The verification flow is a 5-call sequence. Every processing step is asynchronous —
            you submit, then poll <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>GET /api/v2/verify/:id/status</code> until
            the relevant field appears. Below is the complete flow.
          </Lead>

          <div style={{ margin: '24px 0 32px', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.codeBg }}>
            <video
              src="https://qffbflsboayyqvnqwqil.supabase.co/storage/v1/object/public/platform-assets/developer-integration-demo.mp4"
              style={{ width: '100%', aspectRatio: '16/9', display: 'block' }}
              controls
              playsInline
              preload="metadata"
              poster="/idswyft-logo.png"
            />
          </div>

          <Pipeline />

          <CodeTabs tab={tab} onChange={setTab}
            js={`const BASE = '${apiUrl}';
const KEY  = 'your-api-key';
const headers = { 'X-API-Key': KEY };

// ─── 1. Start session ───────────────────────────────────────────
const { verification_id } = await fetch(\`\${BASE}/api/v2/verify/initialize\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 'user-uuid' }),
}).then(r => r.json());

// ─── 2. Upload front document ───────────────────────────────────
const fd1 = new FormData();
fd1.append('document_type', 'drivers_license');
fd1.append('document', frontFile);       // File from <input type="file">
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/front-document\`, { method: 'POST', headers, body: fd1 });

// ─── 3. Poll until OCR finishes ─────────────────────────────────
let r;
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/status\`, { headers }).then(r => r.json());
} while (!r.ocr_data);

// ─── 4. Upload back-of-ID (cross-validation auto-triggers) ──────
const fd2 = new FormData();
fd2.append('document_type', 'drivers_license');
fd2.append('document', backFile);        // field name is 'document' (not 'back_of_id')
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/back-document\`, { method: 'POST', headers, body: fd2 });

// ─── 5. Poll until cross-validation finishes ────────────────────
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/status\`, { headers }).then(r => r.json());
} while (!r.cross_validation_results);

if (r.final_result === 'failed') throw new Error('Cross-validation failed: ' + r.failure_reason);

// ─── 6. Submit live capture (file upload) ────────────────────────
const fd3 = new FormData();
fd3.append('selfie', captureBlob, 'capture.jpg');  // Blob from canvas.toBlob()
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/live-capture\`, {
  method: 'POST',
  headers,
  body: fd3,
});

// ─── 7. Poll for final result ────────────────────────────────────
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/status\`, { headers }).then(r => r.json());
} while (!r.final_result);

console.log(r.final_result);               // 'verified' | 'failed' | 'manual_review'
console.log(r.face_match_results?.similarity_score);   // 0.0 – 1.0
console.log(r.ocr_data.name);              // "Jane Smith"`}
            python={`import requests, time

BASE = '${apiUrl}'
HEADERS = {'X-API-Key': 'your-api-key'}

def poll(vid, until_key=None, until_final=False):
    """Poll /status until condition is met."""
    while True:
        time.sleep(2)
        r = requests.get(f'{BASE}/api/v2/verify/{vid}/status', headers=HEADERS).json()
        if until_key and r.get(until_key): return r
        if until_final and r.get('final_result') is not None: return r

# ─── 1. Start session ───────────────────────────────────────────
session = requests.post(f'{BASE}/api/v2/verify/initialize',
    headers={**HEADERS, 'Content-Type': 'application/json'},
    json={'user_id': 'user-uuid'}
).json()
vid = session['verification_id']

# ─── 2. Upload front document ───────────────────────────────────
with open('front.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/front-document', headers=HEADERS,
        data={'document_type': 'drivers_license'},
        files={'document': f})

# ─── 3. Poll until OCR is ready ─────────────────────────────────
r = poll(vid, until_key='ocr_data')
print('Name:', r['ocr_data']['name'])

# ─── 4. Upload back-of-ID (cross-validation auto-triggers) ──────
with open('back.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/back-document', headers=HEADERS,
        data={'document_type': 'drivers_license'},
        files={'document': f})

# ─── 5. Poll until cross-validation finishes ────────────────────
r = poll(vid, until_key='cross_validation_results')
if r.get('final_result') == 'failed':
    raise Exception('Cross-validation failed: ' + r.get('failure_reason', ''))

# ─── 6. Submit live capture (file upload) ────────────────────────
with open('capture.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/live-capture', headers=HEADERS,
        files={'selfie': f})  # field name is 'selfie' in the API

# ─── 7. Poll for final result ────────────────────────────────────
r = poll(vid, until_final=True)
print(r['final_result'])                  # verified / failed / manual_review
print(r.get('face_match_results', {}))    # match scores
print(r['ocr_data']['name'])              # "Jane Smith"`}
          />

          <Divider />

          {/* ══ AUTHENTICATION ═══════════════════════════════════════════════ */}
          <SectionAnchor id="auth" />
          <H2>Authentication</H2>
          <Lead>Every API request must include your API key in the <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>X-API-Key</code> header. You can generate keys in the Developer Portal.</Lead>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Base URL</div>
                <code style={{ fontFamily: C.mono, fontSize: '0.85rem', color: C.cyan }}>{apiUrl}</code>
              </div>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Auth Header</div>
                <code style={{ fontFamily: C.mono, fontSize: '0.85rem', color: C.cyan }}>X-API-Key: sk_live_your_key</code>
              </div>
            </div>
          </div>

          <Pre label="Curl example" code={`curl -X POST ${apiUrl}/api/v2/verify/initialize \\
  -H "X-API-Key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "550e8400-e29b-41d4-a716-446655440000"}'`} />

          <Callout type="tip">
            Use a <strong>sandbox key</strong> (prefix <code style={{ fontFamily: C.mono }}>sk_test_</code>) during development.
            Sandbox mode uses the same pipeline with real OCR and face matching, but counts against a separate quota
            and won't affect production metrics.
          </Callout>

          <Divider />

          {/* ══ VERIFICATION FLOW ════════════════════════════════════════════ */}
          <SectionAnchor id="flow" />
          <H2>Verification Flow</H2>
          <Lead>
            Each verification is a session with a unique ID. You move through steps sequentially —
            each step unlocks the next. All heavy processing (OCR, cross-validation, liveness) is
            asynchronous: submit the data, then poll <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>GET /api/v2/verify/:id/status</code> to check progress.
          </Lead>

          {/* Step 1 */}
          <SectionAnchor id="step-1" />
          <EndpointCard step={1} method="POST" path="/api/v2/verify/initialize" title="Start a Verification Session">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Creates a new verification session for a user. Returns a <code style={{ fontFamily: C.mono, color: C.cyan }}>verification_id</code> that
              ties together all subsequent uploads and results. One session = one complete identity check.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="user_id" type="UUID string" req={true} desc="Your unique identifier for the user being verified." />
              <FieldRow name="sandbox" type="boolean" req={false} desc="Set true to use sandbox mode. Defaults to false." />
              <FieldRow name="addons" type="object" req={false} desc="Optional add-on features to enable for this session." />
              <FieldRow name="addons.aml_screening" type="boolean" req={false} desc="Enable AML/sanctions screening against OFAC, EU & UN lists. Runs automatically after identity verification completes." />
            </div>
            <CodeTabs tab={tab} onChange={setTab}
              curl={`curl -X POST ${apiUrl}/api/v2/verify/initialize \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "addons": { "aml_screening": true }
  }'`}
              js={`const res = await fetch(\`${apiUrl}/api/v2/verify/initialize\`, {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    addons: { aml_screening: true },
  }),
});
const data = await res.json();`}
              python={`import requests

res = requests.post(
    '${apiUrl}/api/v2/verify/initialize',
    headers={ 'X-API-Key': 'your-key' },
    json={
        'user_id': '550e8400-e29b-41d4-a716-446655440000',
        'addons': { 'aml_screening': True },
    },
)
data = res.json()`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "AWAITING_FRONT",
  "current_step": 1,
  "total_steps": 5,
  "message": "Verification session initialized"
}`} />
          </EndpointCard>

          {/* Step 2 */}
          <SectionAnchor id="step-2" />
          <EndpointCard step={2} method="POST" path="/api/v2/verify/:id/front-document" title="Upload Front Document">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Upload the <strong style={{ color: C.text }}>front face</strong> of the identity document (passport, driver's license, national ID).
              OCR extraction and image quality analysis (Gate 1) run during upload. The response includes
              <code style={{ fontFamily: C.mono, color: C.cyan }}> ocr_data</code> with extracted fields and confidence scores.
              If the image quality is too poor, the session is hard-rejected.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="document_type" type="string" req={true} desc="'passport' | 'drivers_license' | 'national_id' | 'other'" />
              <FieldRow name="document" type="File" req={true} desc="JPEG, PNG, WebP, or PDF. Max 10 MB." />
            </div>
            <CodeTabs tab={tab} onChange={setTab}
              curl={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/front-document \\
  -H "X-API-Key: your-key" \\
  -F "document_type=drivers_license" \\
  -F "document=@front.jpg"`}
              js={`const fd = new FormData();
fd.append('document_type', 'drivers_license');
fd.append('document', frontFile); // File from <input type="file">

const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/front-document\`,
  { method: 'POST', headers: { 'X-API-Key': 'your-key' }, body: fd },
);
const data = await res.json();`}
              python={`import requests

res = requests.post(
    f'${apiUrl}/api/v2/verify/{verification_id}/front-document',
    headers={ 'X-API-Key': 'your-key' },
    data={ 'document_type': 'drivers_license' },
    files={ 'document': open('front.jpg', 'rb') },
)
data = res.json()`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "AWAITING_BACK",
  "current_step": 2,
  "document_id": "doc_abc123",
  "message": "Front document processed successfully",

  // OCR extraction results (included in response):
  "ocr_data": {
    "full_name": "JANE SMITH",
    "date_of_birth": "1990-06-15",
    "id_number": "DL123456789",
    "expiration_date": "2030-06-15",
    "address": "123 Main St, Anytown, US",
    "confidence_scores": { "full_name": 0.97, "date_of_birth": 0.96 }
  }

  // If Gate 1 (quality) fails → status becomes "HARD_REJECTED":
  // "rejection_reason": "POOR_QUALITY",
  // "rejection_detail": "Image too blurry for OCR extraction"
}`} />
            <Callout type="note">
              If Gate 1 rejects the document (blur, low resolution), the session status becomes{' '}
              <code style={{ fontFamily: C.mono }}>HARD_REJECTED</code> and subsequent steps will return 409.
              Check <code style={{ fontFamily: C.mono }}>rejection_reason</code> and{' '}
              <code style={{ fontFamily: C.mono }}>rejection_detail</code> for guidance to display to the user.
            </Callout>
          </EndpointCard>

          {/* Step 3 */}
          <SectionAnchor id="step-3" />
          <EndpointCard step={3} method="POST" path="/api/v2/verify/:id/back-document" title="Upload Back-of-ID"
            badge={{ label: 'required', color: C.red, bg: C.redDim }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Upload the <strong style={{ color: C.text }}>back face</strong> of the ID for barcode/QR scanning and cross-validation
              against the front OCR data. This is a <strong style={{ color: C.red }}>required step</strong> — it
              unlocks live capture. If the front and back do not match the same document, the verification
              immediately moves to <StatusPill status="failed" /> and live capture is blocked.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>What cross-validation checks</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                {['PDF417 / QR barcode decoding', 'ID number consistency (front OCR ↔ barcode)', 'Expiry date matching', 'Issuing authority matching', 'Photo consistency score', 'Security feature detection'].map(s => (
                  <div key={s} style={{ fontFamily: C.sans, fontSize: '0.8rem', color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: C.green, fontSize: '0.7rem' }}>✓</span> {s}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldRow name="document_type" type="string" req={true} desc="Must match the document_type used in Step 2." />
              <FieldRow name="document" type="File" req={true} desc="JPEG, PNG, or WebP. Max 10 MB. Field name is 'document'." />
            </div>
            <CodeTabs tab={tab} onChange={setTab}
              curl={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/back-document \\
  -H "X-API-Key: your-key" \\
  -F "document_type=drivers_license" \\
  -F "document=@back.jpg"`}
              js={`const fd = new FormData();
fd.append('document_type', 'drivers_license');
fd.append('document', backFile); // File from <input type="file">

const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/back-document\`,
  { method: 'POST', headers: { 'X-API-Key': 'your-key' }, body: fd },
);
const data = await res.json();`}
              python={`import requests

res = requests.post(
    f'${apiUrl}/api/v2/verify/{verification_id}/back-document',
    headers={ 'X-API-Key': 'your-key' },
    data={ 'document_type': 'drivers_license' },
    files={ 'document': open('back.jpg', 'rb') },
)
data = res.json()`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "AWAITING_LIVE",
  "current_step": 3,
  "message": "Back document processed successfully",

  // Barcode / PDF417 extraction:
  "barcode_data": {
    "first_name": "JANE",
    "last_name": "SMITH",
    "date_of_birth": "19900615",
    "document_number": "DL123456789"
  },

  // Cross-validation (front OCR vs back barcode):
  "documents_match": true,
  "cross_validation_results": {
    "verdict": "PASS",            // "PASS" or "REVIEW"
    "has_critical_failure": false,
    "score": 0.95,                // 0.0 – 1.0
    "failures": []                // e.g. ["DOB_MISMATCH", "NAME_MISMATCH"]
  }
}`} />
            <Callout type="warning">
              Cross-validation now auto-triggers during back-document upload. Poll{' '}
              <code style={{ fontFamily: C.mono }}>GET /api/v2/verify/:id/status</code> until{' '}
              <code style={{ fontFamily: C.mono }}>cross_validation_results</code> is populated.
              If <code style={{ fontFamily: C.mono }}>final_result</code> is{' '}
              <StatusPill status="failed" />, cross-validation did not pass — do not proceed to live capture.
              Check <code style={{ fontFamily: C.mono }}>failure_reason</code> for details.
            </Callout>
          </EndpointCard>

          {/* Step 4 */}
          <SectionAnchor id="step-4" />
          <EndpointCard step={4} method="POST" path="/api/v2/verify/:id/live-capture" title="Submit Live Capture"
            badge={{ label: 'final gate', color: C.green, bg: C.greenDim }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Submit a <strong style={{ color: C.text }}>live capture image file</strong> for liveness detection (Gate 4) and
              face matching (Gate 5) against the front document photo. Only available after cross-validation passes.
              Uses multipart file upload with field name <code style={{ fontFamily: C.mono, color: C.cyan }}>selfie</code>.
              This is the final step — the response includes face match scores, liveness results, and
              the <code style={{ fontFamily: C.mono, color: C.cyan }}>final_result</code> auto-decision.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Liveness & face match checks</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                {['Image byte entropy analysis', 'Pixel variance & texture checks', 'File size heuristics (vs screenshots)', 'Digital artifact detection', 'Face detection (SSDMobileNet)', 'Face embedding cosine similarity'].map(s => (
                  <div key={s} style={{ fontFamily: C.sans, fontSize: '0.8rem', color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: C.green, fontSize: '0.7rem' }}>✓</span> {s}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldRow name="selfie" type="File" req={true} desc="JPEG or PNG live capture image. Max 10 MB." />
            </div>
            <CodeTabs tab={tab} onChange={setTab}
              curl={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/live-capture \\
  -H "X-API-Key: your-key" \\
  -F "selfie=@selfie.jpg"`}
              js={`const fd = new FormData();
fd.append('selfie', captureFile); // File from live capture

const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/live-capture\`,
  { method: 'POST', headers: { 'X-API-Key': 'your-key' }, body: fd },
);
const data = await res.json();`}
              python={`import requests

res = requests.post(
    f'${apiUrl}/api/v2/verify/{verification_id}/live-capture',
    headers={ 'X-API-Key': 'your-key' },
    files={ 'selfie': open('selfie.jpg', 'rb') },
)
data = res.json()`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "COMPLETE",
  "current_step": 5,
  "selfie_id": "selfie_abc789",
  "message": "Verification complete",

  // Face match (live capture vs document photo):
  "face_match_results": {
    "passed": true,
    "similarity_score": 0.94,     // similarity 0.0 – 1.0
    "threshold_used": 0.6         // configurable confidence threshold
  },

  // Liveness detection:
  "liveness_results": {
    "liveness_passed": true,
    "liveness_score": 0.96
  },

  // Final auto-decision:
  "final_result": "verified"      // "verified" | "manual_review" | "failed"
}`} />
            <Callout type="note">
              Poll{' '}
              <code style={{ fontFamily: C.mono }}>GET /api/v2/verify/:id/status</code> until{' '}
              <code style={{ fontFamily: C.mono }}>final_result</code> is non-null ({' '}
              <StatusPill status="verified" />, <StatusPill status="failed" />, or <StatusPill status="manual_review" />).
              Face match and liveness scores are in the status response.
            </Callout>
          </EndpointCard>

          {/* Step 5 */}
          <SectionAnchor id="step-5" />
          <EndpointCard step={5} method="GET" path="/api/v2/verify/:id/status" title="Get Verification Results">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              The single source of truth for a verification session. Use this endpoint for polling at each
              processing stage and for reading the final result. Returns the full record including OCR data,
              cross-validation scores, liveness score, and face match score.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Polling conditions</div>
              {[
                { after: 'After Step 2 (front doc)', condition: 'ocr_data is not null', next: 'proceed to Step 3' },
                { after: 'After Step 3 (back-of-ID)', condition: 'cross_validation_results is not null', next: 'check final_result; if not "failed", proceed to Step 4' },
                { after: 'After Step 4 (live capture)', condition: 'final_result is not null', next: 'verification complete' },
              ].map(r => (
                <div key={r.after} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, width: 160, flexShrink: 0 }}>{r.after}</span>
                  <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, flex: 1 }}>{r.condition}</code>
                  <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.green, flexShrink: 0 }}>→ {r.next}</span>
                </div>
              ))}
            </div>

            <CodeTabs tab={tab} onChange={setTab}
              curl={`curl -X GET ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/status \\
  -H "X-API-Key: your-key"`}
              js={`const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/status\`,
  { headers: { 'X-API-Key': 'your-key' } },
);
const data = await res.json();`}
              python={`import requests

res = requests.get(
    f'${apiUrl}/api/v2/verify/{verification_id}/status',
    headers={ 'X-API-Key': 'your-key' },
)
data = res.json()`} />
            <Pre label="Response  —  completed verification" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "COMPLETE",
  "current_step": 5,
  "total_steps": 5,
  "created_at": "2026-03-06T12:00:00Z",
  "updated_at": "2026-03-06T12:05:30Z",

  // ── Upload progress ──────────────────────────────────────────
  "front_document_uploaded": true,
  "back_document_uploaded": true,
  "live_capture_uploaded": true,

  // ── Front document (OCR) ─────────────────────────────────────
  "ocr_data": {
    "full_name":         "JANE SMITH",
    "date_of_birth":     "1990-06-15",
    "id_number":         "DL123456789",
    "expiration_date":   "2030-06-15",
    "address":           "123 Main St, Anytown, US",
    "confidence_scores": { "full_name": 0.97, "date_of_birth": 0.96 }
  },

  // ── Back-of-ID (barcode + cross-validation) ──────────────────
  "barcode_data": {
    "first_name": "JANE", "last_name": "SMITH",
    "document_number": "DL123456789"
  },
  "documents_match": true,
  "cross_validation_results": {
    "verdict": "PASS",
    "has_critical_failure": false,
    "overall_score": 0.95,
    "failures": []
  },

  // ── Live capture (liveness + face match) ─────────────────────
  "face_match_results": {
    "passed": true,
    "similarity_score": 0.94,
    "threshold_used": 0.6
  },
  "liveness_results": {
    "passed": true,
    "score": 0.96
  },

  // ── AML / Sanctions (when addons.aml_screening is enabled) ──
  "aml_screening": {
    "risk_level": "clear",           // "clear" | "potential_match" | "confirmed_match"
    "match_found": false,
    "match_count": 0,
    "lists_checked": ["us_ofac_sdn", "eu_sanctions", "un_sanctions"],
    "screened_at": "2026-03-06T12:05:28Z"
  },

  // ── Final decision ───────────────────────────────────────────
  "final_result": "verified",       // "verified" | "manual_review" | "failed"
  "failure_reason": null,           // set if final_result is "failed"
  "manual_review_reason": null      // set if final_result is "manual_review"
}`} />
          </EndpointCard>

          {/* Cross-validation (optional) */}
          <SectionAnchor id="selfie" />
          <EndpointCard method="POST" path="/api/v2/verify/:id/cross-validation" title="Get Cross-Validation Results"
            badge={{ label: 'optional', color: C.dim, bg: 'rgba(74,85,104,0.13)' }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Retrieve the cached cross-validation results separately. Cross-validation runs automatically
              during the back document upload (Step 3), so this endpoint is only needed if you want to
              query the results independently.
            </p>
            <Pre label="Response  —  HTTP 200" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "AWAITING_LIVE",
  "documents_match": true,
  "cross_validation_results": {
    "verdict": "PASS",
    "has_critical_failure": false,
    "score": 0.95,
    "failures": []
  }
}`} />
          </EndpointCard>

          <Divider />

          {/* ══ INTEGRATION OPTIONS ══════════════════════════════════════════ */}
          <SectionAnchor id="integration" />
          <H2>Integration Options</H2>
          <Lead>Two ways to add identity verification to your product. Pick the one that fits your timeline and control requirements.</Lead>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              {
                emoji: '🚀', title: 'Ready-Made Page',
                tag: { label: 'Fastest', color: C.green, bg: C.greenDim },
                desc: 'Redirect users to our hosted verification page. Users choose between mobile (recommended) or desktop — we handle all steps, camera access, and result display.',
                features: ['Mobile-first with QR handoff (recommended)', 'Complete UI, zero frontend work', 'Camera + liveness built-in', 'Optional address verification (address_verif=true)', 'Webhook notifications on completion', 'Custom redirect on completion'],
                href: '/user-verification',
                cta: 'Try demo →',
              },
              {
                emoji: '⚙️', title: 'Custom API',
                tag: { label: 'Full control', color: C.blue, bg: C.blueDim },
                desc: 'Build your own UI using the REST API directly. Full control over every step, styling, and user flow.',
                features: ['Custom UI/UX', 'Own the camera experience', 'Embed in existing flows', 'Webhook integrations', 'Enterprise configuration'],
                href: '#flow',
                cta: 'View API docs →',
              },
            ].map(opt => (
              <div key={opt.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.5rem' }}>{opt.emoji}</span>
                  <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: '1rem', color: C.text }}>{opt.title}</span>
                  <Pill color={opt.tag.color} bg={opt.tag.bg}>{opt.tag.label}</Pill>
                </div>
                <p style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.muted, lineHeight: 1.65, margin: 0 }}>{opt.desc}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {opt.features.map(f => (
                    <li key={f} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, display: 'flex', gap: 8 }}>
                      <span style={{ color: C.green }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href={opt.href} style={{ marginTop: 'auto', display: 'inline-block', fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.cyan, textDecoration: 'none' }}>{opt.cta}</a>
              </div>
            ))}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>URL parameters (ready-made page)</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="api_key" type="string" req={true} desc="Your Idswyft API key." />
              <FieldRow name="user_id" type="UUID string" req={true} desc="Unique identifier for the user being verified." />
              <FieldRow name="redirect_url" type="URL string" req={false} desc="Where to redirect after verification completes." />
              <FieldRow name="theme" type="'light' | 'dark'" req={false} desc="UI color theme. Defaults to dark." />
              <FieldRow name="address_verif" type="'true'" req={false} desc="When set to 'true', adds an optional proof-of-address step after identity verification. Users can upload a utility bill, bank statement, or tax document. The name is cross-referenced against the verified ID." />
            </div>
          </div>

          <Pre label="Example URL (identity only)" code={`https://yourapp.com/user-verification?api_key=sk_live_xxx&user_id=user-123&redirect_url=https://yourapp.com/done&theme=dark`} />
          <Pre label="Example URL (identity + address)" code={`https://yourapp.com/user-verification?api_key=sk_live_xxx&user_id=user-123&address_verif=true&redirect_url=https://yourapp.com/done`} />

          <Divider />

          {/* ══ JAVASCRIPT SDK ════════════════════════════════════════════════ */}
          <SectionAnchor id="sdk" />
          <H2>JavaScript SDK</H2>
          <Lead>
            The official <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>@idswyft/sdk</code> wraps the REST API with TypeScript types,
            automatic error handling, and a real-time event emitter for tracking verification progress without manual polling.
          </Lead>

          <Pre label="Install" code={`npm install @idswyft/sdk`} />

          <Pre label="Initialize" code={`const { IdswyftSDK } = require('@idswyft/sdk');

const sdk = new IdswyftSDK({
  apiKey: 'sk_live_your_key',
  baseURL: '${apiUrl}',     // optional, defaults to https://api.idswyft.app
  sandbox: false,            // set true for sandbox mode
});`} />

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>SDK Methods</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="startVerification()" type="→ InitializeResponse" req={false} desc="Create a new verification session" />
              <FieldRow name="uploadFrontDocument()" type="→ VerificationResult" req={false} desc="Upload front of ID for OCR extraction" />
              <FieldRow name="uploadBackDocument()" type="→ VerificationResult" req={false} desc="Upload back of ID for cross-validation" />
              <FieldRow name="uploadSelfie()" type="→ VerificationResult" req={false} desc="Submit live capture for face match" />
              <FieldRow name="getVerificationStatus()" type="→ VerificationResult" req={false} desc="Get full session status and results" />
              <FieldRow name="watch()" type="→ EventEmitter" req={false} desc="Real-time event stream (see below)" />
              <FieldRow name="createBatch()" type="→ BatchJobResponse" req={false} desc="Create batch verification job" />
              <FieldRow name="uploadAddressDocument()" type="→ AddressResult" req={false} desc="Upload proof-of-address document" />
              <FieldRow name="createMonitoringSchedule()" type="→ Schedule" req={false} desc="Schedule re-verification" />
            </div>
          </div>

          <h3 style={{ fontFamily: C.mono, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 8px' }}>
            <span style={{ color: C.green, fontWeight: 400 }}>→</span> Real-Time Events with <code style={{ color: C.cyan }}>watch()</code>
          </h3>
          <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
            Instead of writing polling loops, use <code style={{ fontFamily: C.mono, color: C.cyan }}>watch()</code> to get
            event-driven status updates. Polls at 2-second intervals by default, auto-stops on terminal states.
          </p>

          <Pre label="watch() usage" code={`const watcher = sdk.watch(verificationId);

// Listen for specific events
watcher.on('status_changed', (event) => {
  console.log('Status:', event.status);   // e.g. 'AWAITING_BACK'
});

watcher.on('step_completed', (event) => {
  console.log('Step', event.data.current_step, 'done');
});

watcher.on('verification_complete', (event) => {
  console.log('Verified!', event.data.final_result);
  // 'verified' | 'manual_review' | 'failed'
});

watcher.on('verification_failed', (event) => {
  console.log('Rejected:', event.data.rejection_reason);
});

// One-time listener
watcher.once('verification_complete', (event) => {
  redirectToSuccess(event.data.verification_id);
});

// Wildcard — catch everything
watcher.on('*', (event) => analytics.track(event.type));

// Clean up when done
watcher.destroy();`} />

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Event Types</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="status_changed" type="event" req={false} desc="Fires on any status transition (e.g. AWAITING_FRONT → AWAITING_BACK)" />
              <FieldRow name="step_completed" type="event" req={false} desc="Fires when current_step increments (step 1→2, 2→3, etc.)" />
              <FieldRow name="verification_complete" type="event" req={false} desc="Terminal success — status reached COMPLETE" />
              <FieldRow name="verification_failed" type="event" req={false} desc="Terminal failure — status reached HARD_REJECTED" />
              <FieldRow name="error" type="event" req={false} desc="Polling or network error occurred" />
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Watch Options</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="interval" type="number" req={false} desc="Polling interval in ms (default: 2000)" />
              <FieldRow name="maxAttempts" type="number" req={false} desc="Max poll attempts before auto-stop (default: 300 = 10 min)" />
            </div>
          </div>

          <Divider />

          {/* ══ EMBED COMPONENT ═══════════════════════════════════════════════ */}
          <SectionAnchor id="embed" />
          <H2>Embed Component</H2>
          <Lead>
            Drop a complete verification UI into your app with zero frontend code.{' '}
            <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>IdswyftEmbed</code> creates an iframe
            pointing to the hosted verification page and communicates results via <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>postMessage</code>.
          </Lead>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              {
                title: 'Modal Mode',
                tag: { label: 'Default', color: C.green, bg: C.greenDim },
                desc: 'Full-screen overlay with backdrop. Best for trigger-based flows (e.g. "Verify Now" button).',
                features: ['Dark overlay backdrop', 'Close on backdrop click or ✕ button', 'Auto-removes on completion', 'Blocks page scroll while open'],
              },
              {
                title: 'Inline Mode',
                tag: { label: 'Container', color: C.blue, bg: C.blueDim },
                desc: 'Renders inside a DOM element you specify. Best for embedding within an existing page layout.',
                features: ['Fits your container', 'Custom width/height', 'No overlay or backdrop', 'Stays in page flow'],
              },
            ].map(opt => (
              <div key={opt.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: '1rem', color: C.text }}>{opt.title}</span>
                  <Pill color={opt.tag.color} bg={opt.tag.bg}>{opt.tag.label}</Pill>
                </div>
                <p style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.muted, lineHeight: 1.65, margin: 0 }}>{opt.desc}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {opt.features.map(f => (
                    <li key={f} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, display: 'flex', gap: 8 }}>
                      <span style={{ color: C.green }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Pre label="Modal mode" code={`import { IdswyftEmbed } from '@idswyft/sdk';

const embed = new IdswyftEmbed({
  mode: 'modal',
  theme: 'dark',
});

// Open with a session token (from your backend)
embed.open(sessionToken, {
  onComplete: (result) => {
    console.log('Verified!', result.verificationId);
    console.log('Result:', result.finalResult);
  },
  onError: (error) => {
    console.error(error.code, error.message);
  },
  onStepChange: (step) => {
    console.log('Step', step.current, 'of', step.total);
  },
  onClose: () => {
    console.log('User closed the modal');
  },
});

// Programmatically close
embed.close();`} />

          <Pre label="Inline mode" code={`const embed = new IdswyftEmbed({
  mode: 'inline',
  container: '#verification-container',  // CSS selector or HTMLElement
  theme: 'dark',
  width: '100%',
  height: '700px',
});

embed.open(sessionToken, {
  onComplete: (result) => showSuccessMessage(result),
});`} />

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Embed Options</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="mode" type="'modal' | 'inline'" req={false} desc="UI mode. Default: 'modal'" />
              <FieldRow name="container" type="string | HTMLElement" req={false} desc="Target element for inline mode. CSS selector or DOM element." />
              <FieldRow name="theme" type="'light' | 'dark'" req={false} desc="Color theme. Default: 'dark'" />
              <FieldRow name="width" type="string" req={false} desc="Iframe width. Default: '100%'" />
              <FieldRow name="height" type="string" req={false} desc="Iframe height. Default: '700px'" />
              <FieldRow name="closeOnBackdropClick" type="boolean" req={false} desc="Close modal on backdrop click. Default: true" />
              <FieldRow name="verificationUrl" type="string" req={false} desc="Base URL for hosted page. Default: https://verify.idswyft.app" />
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Callbacks</div>
            <div style={{ padding: '8px 20px' }}>
              <FieldRow name="onComplete" type="(result) => void" req={false} desc="Verification succeeded. Result includes verificationId, status, finalResult." />
              <FieldRow name="onError" type="(error) => void" req={false} desc="Verification failed. Error includes code and message." />
              <FieldRow name="onStepChange" type="(step) => void" req={false} desc="Step changed. Step includes current, total, and status." />
              <FieldRow name="onClose" type="() => void" req={false} desc="User closed the modal (modal mode only)." />
            </div>
          </div>

          <Callout type="tip">
            The embed component communicates via <code style={{ fontFamily: C.mono }}>postMessage</code> with a{' '}
            <code style={{ fontFamily: C.mono }}>source: 'idswyft-embed'</code> identifier. Messages are ignored if they
            don't match this source, so it's safe to use alongside other iframes.
          </Callout>

          <Divider />

          {/* ══ ANALYSIS ENGINE ═══════════════════════════════════════════════ */}
          <SectionAnchor id="analysis" />
          <H2>Analysis Engine</H2>
          <Lead>What the platform extracts and validates from each document and capture. Processing uses algorithmic rules, image forensics, and pre-trained OCR / face-detection models — no custom AI or LLMs.</Lead>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { title: 'OCR Extraction', color: C.cyan, items: ['PaddleOCR / Tesseract engines', 'Name, DOB, ID number', 'Expiry & issue date', 'AAMVA field parsing (US DLs)', 'State DL format validation', 'Per-field confidence scores'] },
              { title: 'Document Quality', color: C.blue, items: ['Sobel edge blur detection', 'Brightness & contrast stats', 'Resolution check (≥ 800×600)', 'File size validation', 'Overall quality score', 'Auto-reject below threshold'] },
              { title: 'Cross-Validation', color: C.amber, items: ['PDF417 / QR barcode decode', 'Levenshtein distance matching', 'Token-set name similarity', 'Front OCR ↔ back barcode check', 'Date & ID number consistency', 'Weighted field scoring'] },
              { title: 'Liveness & Face Match', color: C.green, items: ['Byte entropy analysis', 'Pixel variance checks', 'File-size heuristics', 'Face detection (SSDMobileNet)', '128-d face embeddings', 'Cosine similarity scoring'] },
            ].map(col => (
              <div key={col.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontFamily: C.mono, fontSize: '0.8rem', fontWeight: 600, color: col.color, marginBottom: 12 }}>{col.title}</div>
                {col.items.map(item => (
                  <div key={item} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, padding: '3px 0', display: 'flex', gap: 8 }}>
                    <span style={{ color: col.color, fontSize: '0.65rem', marginTop: 3 }}>▸</span> {item}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <Divider />

          {/* ══ STATUSES ═════════════════════════════════════════════════════ */}
          <SectionAnchor id="statuses" />
          <H2>Verification Statuses</H2>
          <Lead>A verification moves through these statuses sequentially. <strong style={{ color: C.green }}>COMPLETE</strong> and <strong style={{ color: C.red }}>HARD_REJECTED</strong> are terminal states.</Lead>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
            {[
              { status: 'AWAITING_FRONT', color: C.amber, bg: C.amberDim, desc: 'Session initialized. Waiting for front document upload.', terminal: false },
              { status: 'AWAITING_BACK', color: C.amber, bg: C.amberDim, desc: 'Front document processed. Waiting for back document upload.', terminal: false },
              { status: 'CROSS_VALIDATING', color: C.blue, bg: C.blueDim, desc: 'Running cross-validation between front OCR and back barcode data.', terminal: false },
              { status: 'AWAITING_LIVE', color: C.amber, bg: C.amberDim, desc: 'Cross-validation passed. Waiting for selfie upload.', terminal: false },
              { status: 'FACE_MATCHING', color: C.blue, bg: C.blueDim, desc: 'Running liveness detection and face matching against document photo.', terminal: false },
              { status: 'COMPLETE', color: C.green, bg: C.greenDim, desc: 'All gates passed. Check final_result for: "verified", "manual_review", or "failed".', terminal: true },
              { status: 'HARD_REJECTED', color: C.red, bg: C.redDim, desc: 'Session rejected by a quality gate. Check rejection_reason for details. Subsequent steps return 409.', terminal: true },
            ].map(s => (
              <div key={s.status} style={{ display: 'flex', gap: 16, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 130, flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusPill status={s.status} />
                  {s.terminal && <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: s.color, letterSpacing: '0.06em' }}>TERMINAL</span>}
                </div>
                <span style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, flex: 1, lineHeight: 1.6 }}>{s.desc}</span>
              </div>
            ))}
          </div>

          <Divider />

          {/* ══ BATCH API ═════════════════════════════════════════════════════ */}
          <SectionAnchor id="batch" />
          <H2>Batch Verification</H2>
          <Lead>
            Process hundreds of verifications at once for enterprise onboarding, user migration, or
            periodic re-verification. Items are processed with controlled concurrency (5 concurrent max).
          </Lead>

          <EndpointCard method="POST" path="/api/v2/batch/upload" title="Create Batch Job">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Submit an array of items for batch processing. Each item requires a <code style={{ fontFamily: C.mono, color: C.cyan }}>user_id</code> and
              optionally includes document URLs, document type, and metadata. Returns a <code style={{ fontFamily: C.mono, color: C.cyan }}>batch_id</code> for tracking.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="items" type="array" req={true} desc="Array of verification items. Each needs user_id; optionally front/back/selfie URLs." />
              <FieldRow name="items[].user_id" type="string" req={true} desc="Unique identifier for the user being verified." />
              <FieldRow name="items[].document_type" type="string" req={false} desc="'passport' | 'drivers_license' | 'national_id'" />
              <FieldRow name="items[].front_document_url" type="URL" req={false} desc="URL to the front document image." />
              <FieldRow name="items[].back_document_url" type="URL" req={false} desc="URL to the back document image." />
              <FieldRow name="items[].selfie_url" type="URL" req={false} desc="URL to the selfie/live capture image." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/batch/upload \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [
      { "user_id": "user-001", "document_type": "drivers_license" },
      { "user_id": "user-002", "document_type": "passport" },
      { "user_id": "user-003", "document_type": "national_id" }
    ]
  }'`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "batch_id": "batch_abc123",
  "status": "pending",
  "total_items": 3,
  "message": "Batch job created"
}`} />
          </EndpointCard>

          <EndpointCard method="GET" path="/api/v2/batch/:id/status" title="Get Batch Progress">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Poll this endpoint to track batch progress. Includes item counts and a percentage.
            </p>
            <Pre label="Response" code={`{
  "batch_id": "batch_abc123",
  "status": "processing",
  "total_items": 3,
  "processed_items": 1,
  "succeeded_items": 1,
  "failed_items": 0,
  "progress_percentage": 33,
  "created_at": "2026-03-15T10:00:00Z",
  "completed_at": null
}`} />
          </EndpointCard>

          <EndpointCard method="GET" path="/api/v2/batch/:id/results" title="Get Batch Results">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Download individual item results for a completed batch. Each item includes its verification ID (if created) and status.
            </p>
            <Pre label="Response" code={`{
  "results": [
    { "item_id": "item_001", "user_id": "user-001", "status": "completed", "verification_id": "v_abc", "error": null },
    { "item_id": "item_002", "user_id": "user-002", "status": "completed", "verification_id": "v_def", "error": null },
    { "item_id": "item_003", "user_id": "user-003", "status": "failed", "verification_id": null, "error": "Invalid document URL" }
  ]
}`} />
          </EndpointCard>

          <EndpointCard method="POST" path="/api/v2/batch/:id/cancel" title="Cancel Batch Job">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Cancel a running batch job. Already-completed items are unaffected. Remaining items are skipped.
            </p>
          </EndpointCard>

          <Pre label="SDK usage" code={`// Create batch
const batch = await sdk.createBatch([
  { user_id: 'user-001', document_type: 'drivers_license' },
  { user_id: 'user-002', document_type: 'passport' },
]);

// Poll progress
const status = await sdk.getBatchStatus(batch.batch_id);
console.log(status.progress_percentage + '% complete');

// Get results when done
const results = await sdk.getBatchResults(batch.batch_id);

// Cancel if needed
await sdk.cancelBatch(batch.batch_id);`} />

          <Divider />

          {/* ══ ADDRESS VERIFICATION ══════════════════════════════════════════ */}
          <SectionAnchor id="address" />
          <H2>Address Verification</H2>
          <Lead>
            Verify proof-of-address documents (utility bills, bank statements, tax documents) and
            cross-reference the name against the verified ID. Requires a completed identity verification first.
          </Lead>

          <EndpointCard method="POST" path="/api/v2/verify/:id/address-document" title="Upload Address Document"
            badge={{ label: 'post-verification', color: C.blue, bg: C.blueDim }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Upload a proof-of-address document for OCR extraction and name cross-validation against the identity
              document. The address document must show the same person's name and be recently dated.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="document" type="File" req={true} desc="JPEG, PNG, or PDF. Max 10 MB." />
              <FieldRow name="document_type" type="string" req={true} desc="'utility_bill' | 'bank_statement' | 'tax_document'" />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/verify/VERIFICATION_ID/address-document \\
  -H "X-API-Key: your-key" \\
  -F "document=@utility_bill.jpg" \\
  -F "document_type=utility_bill"`} />
            <Pre label="Response  —  HTTP 200" code={`{
  "success": true,
  "verification_id": "v_abc123",
  "address_verification": {
    "status": "pass",
    "score": 0.92,
    "name_match_score": 0.95,
    "address": "123 Main St, Apt 4B, New York, NY 10001",
    "document_type": "utility_bill",
    "document_fresh": true,
    "reasons": []
  }
}`} />
            <Callout type="note">
              The <code style={{ fontFamily: C.mono }}>name_match_score</code> compares the name on the address document
              against the name extracted from the identity document (OCR). A score below 0.7 routes to{' '}
              <code style={{ fontFamily: C.mono }}>review</code> status. The <code style={{ fontFamily: C.mono }}>document_fresh</code>{' '}
              flag checks if the document is dated within the last 90 days.
            </Callout>
          </EndpointCard>

          <EndpointCard method="GET" path="/api/v2/verify/:id/address-status" title="Get Address Status">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Query the address verification result separately.
            </p>
            <Pre label="Response" code={`{
  "verification_id": "v_abc123",
  "address_verification": {
    "status": "pass",          // "pass" | "review" | "reject"
    "score": 0.92,
    "name_match_score": 0.95,
    "address": "123 Main St, New York, NY 10001",
    "document_type": "utility_bill",
    "document_fresh": true,
    "reasons": []
  }
}`} />
          </EndpointCard>

          <Pre label="SDK usage" code={`// Upload proof-of-address document
const result = await sdk.uploadAddressDocument(
  verificationId,
  documentBuffer,     // Buffer or Blob
  'utility_bill',     // document type
  'electric-bill.pdf' // optional filename
);

console.log(result.address_verification.status);          // 'pass'
console.log(result.address_verification.address);          // extracted address
console.log(result.address_verification.name_match_score); // 0.95

// Query status separately
const status = await sdk.getAddressStatus(verificationId);`} />

          <Divider />

          {/* ══ AML / SANCTIONS SCREENING ══════════════════════════════════ */}
          <SectionAnchor id="aml" />
          <H2>AML / Sanctions Screening</H2>
          <Lead>
            Screen verified identities against global sanctions and watchlists (OFAC SDN, EU, UN).
            AML screening is an opt-in addon — enable it per session by passing{' '}
            <code style={{ fontFamily: C.mono, color: C.cyan }}>addons.aml_screening: true</code> during initialization.
            The screening runs automatically as Gate 6, after all identity verification gates pass.
          </Lead>

          <Callout type="note">
            AML screening uses OCR-extracted data (full name, date of birth, nationality) from the front document.
            It runs automatically after Gate 5 (face match) — no additional API call needed. Results appear in the{' '}
            <code style={{ fontFamily: C.mono }}>aml_screening</code> field of the status response.
          </Callout>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
              {[
                ['1', 'Pass addons.aml_screening: true in the initialize request'],
                ['2', 'Complete identity verification (front doc → back doc → live capture)'],
                ['3', 'Gate 6 automatically screens extracted name/DOB against sanctions lists'],
                ['4', 'Results appear in aml_screening field of the status response'],
              ].map(([n, text]) => (
                <React.Fragment key={n}>
                  <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, fontWeight: 600 }}>{n}.</span>
                  <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>{text}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Risk levels & outcomes</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { level: 'clear', score: '< 0.5', outcome: 'Verification proceeds normally', color: C.green },
                { level: 'potential_match', score: '0.5 – 0.84', outcome: 'Routed to manual_review', color: C.amber },
                { level: 'confirmed_match', score: '>= 0.85', outcome: 'Hard reject (failed)', color: C.red },
              ].map(r => (
                <div key={r.level} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 12, borderLeft: `3px solid ${r.color}` }}>
                  <div style={{ fontFamily: C.mono, fontSize: '0.75rem', color: r.color, fontWeight: 600, marginBottom: 4 }}>{r.level}</div>
                  <div style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.dim, marginBottom: 6 }}>score {r.score}</div>
                  <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.5 }}>{r.outcome}</div>
                </div>
              ))}
            </div>
          </div>

          <Pre label="Enable AML screening" code={`curl -X POST ${apiUrl}/api/v2/verify/initialize \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "user-uuid",
    "addons": { "aml_screening": true }
  }'`} />

          <Pre label="Status response — with AML results" code={`{
  "verification_id": "v_abc123",
  "status": "COMPLETE",
  "final_result": "verified",

  "aml_screening": {
    "risk_level": "clear",             // "clear" | "potential_match" | "confirmed_match"
    "match_found": false,
    "match_count": 0,
    "lists_checked": [
      "us_ofac_sdn",
      "eu_sanctions",
      "un_sanctions"
    ],
    "screened_at": "2026-03-19T10:05:28Z"
  }
}`} />

          <Pre label="Status response — potential match (manual review)" code={`{
  "verification_id": "v_abc123",
  "status": "COMPLETE",
  "final_result": "manual_review",
  "manual_review_reason": "AML_POTENTIAL_MATCH",

  "aml_screening": {
    "risk_level": "potential_match",
    "match_found": true,
    "match_count": 1,
    "lists_checked": ["us_ofac_sdn", "eu_sanctions", "un_sanctions"],
    "screened_at": "2026-03-19T10:05:28Z"
  }
}`} />

          <Callout type="warning">
            When AML screening is not enabled (no <code style={{ fontFamily: C.mono }}>addons.aml_screening</code> flag), the{' '}
            <code style={{ fontFamily: C.mono }}>aml_screening</code> field will be <code style={{ fontFamily: C.mono }}>null</code>{' '}
            in the status response. AML screening is failure-safe — if the screening provider is unavailable, verification
            proceeds normally and the field is set to <code style={{ fontFamily: C.mono }}>null</code>.
          </Callout>

          <Pre label="SDK usage" code={`// Initialize with AML screening enabled
const session = await sdk.initialize({
  userId: 'user-uuid',
  addons: { aml_screening: true },
});

// ... complete verification steps ...

// Check AML results in final status
const status = await sdk.getStatus(session.verification_id);

if (status.aml_screening?.risk_level === 'clear') {
  console.log('No sanctions matches found');
} else if (status.aml_screening?.risk_level === 'potential_match') {
  console.log('Manual review required — potential sanctions match');
} else if (status.aml_screening?.risk_level === 'confirmed_match') {
  console.log('Verification failed — confirmed sanctions match');
}`} />

          <Divider />

          {/* ══ MONITORING ════════════════════════════════════════════════════ */}
          <SectionAnchor id="monitoring" />
          <H2>Monitoring & Re-verification</H2>
          <Lead>
            Schedule automatic re-verification reminders and track document expiry dates.
            Sends webhook notifications when documents are approaching expiry (90/60/30 days) or when
            re-verification is due.
          </Lead>

          <EndpointCard method="POST" path="/api/v2/monitoring/schedules" title="Create Re-verification Schedule">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Schedule periodic re-verification for a user. When a schedule comes due, a{' '}
              <code style={{ fontFamily: C.mono, color: C.cyan }}>reverification.due</code> webhook event fires.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="user_id" type="UUID" req={true} desc="User to schedule re-verification for." />
              <FieldRow name="interval_days" type="number" req={true} desc="Days between re-verifications (30–730)." />
              <FieldRow name="verification_request_id" type="UUID" req={false} desc="Link to a specific verification." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/monitoring/schedules \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{ "user_id": "user-uuid", "interval_days": 365 }'`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "schedule": {
    "id": "sched_abc123",
    "user_id": "user-uuid",
    "interval_days": 365,
    "next_verification_at": "2027-03-15T00:00:00Z",
    "last_verification_at": null,
    "status": "active",
    "created_at": "2026-03-15T10:00:00Z"
  }
}`} />
          </EndpointCard>

          <EndpointCard method="GET" path="/api/v2/monitoring/expiring-documents" title="Get Expiring Documents">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              List identity documents approaching expiry across your verified users. Alerts are generated
              at 90, 60, and 30-day thresholds.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="days_ahead" type="number" req={false} desc="Look-ahead window in days (default: 90)." />
              <FieldRow name="page" type="number" req={false} desc="Page number for pagination." />
              <FieldRow name="limit" type="number" req={false} desc="Items per page (default: 20)." />
            </div>
            <Pre label="Response" code={`{
  "alerts": [
    {
      "id": "alert_001",
      "verification_request_id": "v_abc",
      "user_id": "user-001",
      "expiry_date": "2026-06-15",
      "alert_type": "90_day",
      "webhook_sent": true,
      "created_at": "2026-03-15T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}`} />
          </EndpointCard>

          <Pre label="SDK usage" code={`// Create re-verification schedule (annual)
const schedule = await sdk.createMonitoringSchedule({
  user_id: 'user-uuid',
  interval_days: 365,
});

// List active schedules
const schedules = await sdk.listMonitoringSchedules({ status: 'active' });

// Get documents expiring in the next 60 days
const expiring = await sdk.getExpiringDocuments({ days_ahead: 60 });
console.log(expiring.alerts.length, 'documents expiring soon');

// Cancel a schedule
await sdk.cancelMonitoringSchedule(schedule.schedule.id);`} />

          <Callout type="note">
            Document expiry detection is based on the <code style={{ fontFamily: C.mono }}>expiration_date</code> field
            extracted during OCR. Webhook events (<code style={{ fontFamily: C.mono }}>document.expiring</code>,{' '}
            <code style={{ fontFamily: C.mono }}>document.expired</code>,{' '}
            <code style={{ fontFamily: C.mono }}>reverification.due</code>) are delivered to your registered webhook URLs.
          </Callout>

          <Divider />

          {/* ══ RATE LIMITS ══════════════════════════════════════════════════ */}
          <SectionAnchor id="rate-limits" />
          <H2>Rate Limits & Status Codes</H2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Rate Limits</div>
              {[
                { label: 'Per developer key', value: '1,000 req / hour', note: 'sandbox + production combined' },
                { label: 'Per user', value: '5 verifications / hour', note: 'across all developer keys' },
                { label: 'Enterprise', value: 'Custom', note: 'contact sales' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.text }}>{r.label}</div>
                    <div style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.dim }}>{r.note}</div>
                  </div>
                  <code style={{ fontFamily: C.mono, fontSize: '0.8rem', color: C.cyan, alignSelf: 'center' }}>{r.value}</code>
                </div>
              ))}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>HTTP Status Codes</div>
              {[
                { code: '200 / 201', color: C.green, desc: 'Success' },
                { code: '400', color: C.amber, desc: 'Bad request — validation error' },
                { code: '401', color: C.red, desc: 'Unauthorized — invalid or missing API key' },
                { code: '404', color: C.red, desc: 'Verification not found' },
                { code: '409', color: C.orange, desc: 'Conflict — session hard-rejected by a gate' },
                { code: '429', color: C.orange, desc: 'Rate limit exceeded' },
                { code: '500', color: C.red, desc: 'Internal server error' },
              ].map(s => (
                <div key={s.code} style={{ display: 'flex', gap: 14, padding: '7px 0', borderTop: `1px solid ${C.border}`, alignItems: 'center' }}>
                  <code style={{ fontFamily: C.mono, fontSize: '0.78rem', color: s.color, width: 72, flexShrink: 0 }}>{s.code}</code>
                  <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <Divider />

          {/* ══ CHANGELOG ═══════════════════════════════════════════════════ */}
          <SectionAnchor id="changelog" />
          <H2>Changelog</H2>
          <Lead>
            Notable changes to the Idswyft API. This project uses{' '}
            <a href="https://semver.org" target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, textDecoration: 'none' }}>Semantic Versioning</a>.
          </Lead>

          {[
            {
              version: '1.1.0',
              date: '2026-03-19',
              added: [
                'Visual authenticity checks — FFT analysis, color distribution, zone validation, deepfake detection',
                'Webhook resend endpoint (POST /api/developer/webhooks/:id/deliveries/:did/resend)',
                'Per-API-key scoping for webhook endpoints',
                'Developer-configurable LLM fallback for OCR with date disambiguation',
                'Developer portal analytics charts with 7-day retention',
                'Account deletion endpoint (DELETE /api/developer/account)',
                'Email OTP + GitHub OAuth authentication (replaced insecure password login)',
                'Webhook delivery logs endpoint (GET /api/developer/webhooks/:id/deliveries)',
                'Webhook test endpoint with timeout handling',
                'AML/sanctions screening opt-in addon',
                'US driver\'s license format validator',
                '/health endpoint for Railway health checks + /api/health for API consumers',
              ],
              fixed: [
                'NULL events column silently filtering out webhook deliveries',
                'Per-provider metrics now derived from results JSONB instead of session-level aggregates',
                'Missing webhook_deliveries table migration',
                'OTP security hardening — atomic verify, timing-safe comparison, fail-closed',
                'Trailing AAMVA field markers stripped from space-separated DLN',
                'CORS origins always include production domains',
              ],
              changed: [
                'Email templates redesigned with guilloche pattern, platform identity, and mobile optimization',
              ],
            },
            {
              version: '1.0.0',
              date: '2025-12-01',
              added: [
                'Initial release — document OCR, face matching, verification pipeline',
                'RESTful API for verification workflows',
                'API key management system',
                'Webhook notification system with HMAC-SHA256 signing',
                'Sandbox environment for developer testing',
                'Rate limiting and abuse protection',
              ],
              fixed: [],
              changed: [],
            },
          ].map(release => (
            <div key={release.version} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Pill color={C.cyan} bg={C.cyanDim}>v{release.version}</Pill>
                <span style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.dim }}>{release.date}</span>
                {release.version === '1.1.0' && <Pill color={C.green} bg={C.greenDim}>latest</Pill>}
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {release.added.length > 0 && (
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: '0.68rem', fontWeight: 600, color: C.green, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                      Added
                    </div>
                    {release.added.map(item => (
                      <div key={item} style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.65, padding: '3px 0 3px 12px', borderLeft: `2px solid ${C.green}20` }}>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {release.fixed.length > 0 && (
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: '0.68rem', fontWeight: 600, color: C.amber, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber }} />
                      Fixed
                    </div>
                    {release.fixed.map(item => (
                      <div key={item} style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.65, padding: '3px 0 3px 12px', borderLeft: `2px solid ${C.amber}20` }}>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {release.changed.length > 0 && (
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: '0.68rem', fontWeight: 600, color: C.blue, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue }} />
                      Changed
                    </div>
                    {release.changed.map(item => (
                      <div key={item} style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.65, padding: '3px 0 3px 12px', borderLeft: `2px solid ${C.blue}20` }}>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <Divider />

          {/* ══ SUPPORT ══════════════════════════════════════════════════════ */}
          <SectionAnchor id="support" />
          <H2>Support & Resources</H2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '🔑', title: 'Developer Portal', desc: 'Get API keys, view usage stats and analytics', href: '/developer', cta: 'Open Portal →' },
              { icon: '🎮', title: 'Live Demo', desc: 'Try the full verification flow with a sandbox key', href: '/demo', cta: 'Open Demo →' },
              { icon: '📦', title: 'JavaScript SDK', desc: 'TypeScript SDK with real-time events and embed component', href: 'https://www.npmjs.com/package/@idswyft/sdk', cta: 'npm install @idswyft/sdk' },
              { icon: '🔧', title: 'GitHub', desc: 'Source code, examples, and issue tracker', href: 'https://github.com/doobee46/idswyft', cta: 'View on GitHub →' },
              { icon: '✉️', title: 'Email Support', desc: 'Technical support and integration help', href: 'mailto:support@idswyft.app', cta: 'support@idswyft.app' },
            ].map(r => (
              <div key={r.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '1.4rem' }}>{r.icon}</div>
                <div style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text }}>{r.title}</div>
                <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.55, flex: 1 }}>{r.desc}</div>
                <a href={r.href} target={r.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontFamily: C.sans, fontSize: '0.8rem', fontWeight: 600, color: C.cyan, textDecoration: 'none' }}>{r.cta}</a>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 64, paddingTop: 24, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.7rem', color: C.dim }}>
            © 2026 Idswyft — Open source under MIT License
          </div>

        </main>
      </div>
    </div>
  );
};
