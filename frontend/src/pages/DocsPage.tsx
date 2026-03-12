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
const CodeTabs = ({ js, python, tab, onChange }: { js: string; python: string; tab: 'js' | 'python'; onChange: (t: 'js' | 'python') => void }) => (
  <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      {(['js', 'python'] as const).map(t => (
        <button key={t} onClick={() => onChange(t)} style={{ padding: '8px 18px', fontFamily: CODE_FONT, fontSize: '0.75rem', fontWeight: 500, color: tab === t ? C.cyan : C.muted, background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${C.cyan}` : '2px solid transparent', cursor: 'pointer', transition: 'color 0.15s' }}>
          {t === 'js' ? 'JavaScript' : 'Python'}
        </button>
      ))}
    </div>
    <IDECodeBlock
      code={tab === 'js' ? js : python}
      language={tab === 'js' ? 'js' : 'python'}
      fileName={tab === 'js' ? 'quickstart.js' : 'quickstart.py'}
    />
  </div>
);

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
  { id: 'analysis', label: 'Analysis Engine', depth: 0 },
  { id: 'statuses', label: 'Statuses', depth: 0 },
  { id: 'rate-limits', label: 'Rate Limits', depth: 0 },
  { id: 'support', label: 'Support', depth: 0 },
];

// ─── Main component ───────────────────────────────────────────────────────────
export const DocsPage: React.FC = () => {
  const apiUrl = getDocumentationApiUrl();
  const [tab, setTab] = useState<'js' | 'python'>('js');
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
    <div style={{ fontFamily: C.sans, background: C.bg, color: C.text, margin: '-24px -24px 0', minHeight: '100vh', overflowX: 'hidden' }}>

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
          <Pill color={C.green} bg={C.greenDim}>v2.0</Pill>
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
fd3.append('selfie', selfieBlob, 'selfie.jpg');  // Blob from canvas.toBlob()
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
console.log(r.face_match_results?.score);   // 0.0 – 1.0
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
with open('selfie.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/live-capture', headers=HEADERS,
        files={'selfie': f})

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
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/verify/initialize \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "550e8400-e29b-41d4-a716-446655440000"}'`} />
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
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/front-document \\
  -H "X-API-Key: your-key" \\
  -F "document_type=drivers_license" \\
  -F "document=@front.jpg"`} />
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
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/back-document \\
  -H "X-API-Key: your-key" \\
  -F "document_type=drivers_license" \\
  -F "document=@back.jpg"`} />
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
              Submit a <strong style={{ color: C.text }}>selfie image file</strong> for liveness detection (Gate 4) and
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
              <FieldRow name="selfie" type="File" req={true} desc="JPEG or PNG selfie image. Max 10 MB." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/live-capture \\
  -H "X-API-Key: your-key" \\
  -F "selfie=@selfie.jpg"`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "COMPLETE",
  "current_step": 5,
  "selfie_id": "selfie_abc789",
  "message": "Verification complete",

  // Face match (selfie vs document photo):
  "face_match_results": {
    "passed": true,
    "score": 0.94,                // similarity 0.0 – 1.0
    "distance": 0.32              // lower = more similar
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

            <Pre label="Request" code={`curl -X GET ${apiUrl}/api/v2/verify/550e8400-e29b-41d4-a716-446655440001/status \\
  -H "X-API-Key: your-key"`} />
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
    "score": 0.95,
    "failures": []
  },

  // ── Live capture (liveness + face match) ─────────────────────
  "face_match_results": {
    "passed": true,
    "score": 0.94,
    "distance": 0.32
  },
  "liveness_results": {
    "liveness_passed": true,
    "liveness_score": 0.96
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
                features: ['Mobile-first with QR handoff (recommended)', 'Complete UI, zero frontend work', 'Camera + liveness built-in', 'Webhook notifications on completion', 'Custom redirect on completion'],
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
            </div>
          </div>

          <Pre label="Example URL" code={`https://yourapp.com/user-verification?api_key=sk_live_xxx&user_id=user-123&redirect_url=https://yourapp.com/done&theme=dark`} />

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

          {/* ══ SUPPORT ══════════════════════════════════════════════════════ */}
          <SectionAnchor id="support" />
          <H2>Support & Resources</H2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '🔑', title: 'Developer Portal', desc: 'Get API keys, view usage stats and analytics', href: '/developer', cta: 'Open Portal →' },
              { icon: '🎮', title: 'Live Demo', desc: 'Try the full verification flow with a sandbox key', href: '/demo', cta: 'Open Demo →' },
              { icon: '📦', title: 'GitHub', desc: 'Source code, examples, and issue tracker', href: 'https://github.com/doobee46/idswyft', cta: 'View on GitHub →' },
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
