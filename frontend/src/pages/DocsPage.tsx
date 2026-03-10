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
  { id: 'selfie', label: 'Selfie (Legacy)', depth: 1 },
  { id: 'live-token', label: 'Live Token', depth: 1 },
  { id: 'integration', label: 'Integration', depth: 0 },
  { id: 'analysis', label: 'AI Analysis', depth: 0 },
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
            you submit, then poll <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>GET /api/verify/results/:id</code> until
            the relevant field appears. Below is the complete flow.
          </Lead>

          <Pipeline />

          <CodeTabs tab={tab} onChange={setTab}
            js={`const BASE = '${apiUrl}';
const KEY  = 'your-api-key';
const headers = { 'X-API-Key': KEY };

// ─── 1. Start session ───────────────────────────────────────────
const { verification_id } = await fetch(\`\${BASE}/api/verify/start\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 'user-uuid' }),
}).then(r => r.json());

// ─── 2. Upload front document (OCR runs async) ──────────────────
const fd1 = new FormData();
fd1.append('verification_id', verification_id);
fd1.append('document_type', 'drivers_license');
fd1.append('document', frontFile);       // File from <input type="file">
await fetch(\`\${BASE}/api/verify/document\`, { method: 'POST', headers, body: fd1 });

// ─── 3. Poll until OCR finishes ─────────────────────────────────
let r;
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/verify/results/\${verification_id}\`, { headers }).then(r => r.json());
} while (!r.ocr_data);

// ─── 4. Upload back-of-ID (cross-validation runs async) ─────────
const fd2 = new FormData();
fd2.append('verification_id', verification_id);
fd2.append('document_type', 'drivers_license');
fd2.append('back_of_id', backFile);
await fetch(\`\${BASE}/api/verify/back-of-id\`, { method: 'POST', headers, body: fd2 });

// ─── 5. Poll until cross-validation finishes ────────────────────
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/verify/results/\${verification_id}\`, { headers }).then(r => r.json());
} while (!r.enhanced_verification_completed);

if (r.status === 'failed') throw new Error('Cross-validation failed: ' + r.failure_reason);

// ─── 6. Submit live capture ──────────────────────────────────────
// capturedBase64 = base64 string from your camera (no data URI prefix)
await fetch(\`\${BASE}/api/verify/live-capture\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ verification_id, live_image_data: capturedBase64 }),
});

// ─── 7. Poll for final result ────────────────────────────────────
const DONE = ['verified', 'failed', 'manual_review'];
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(\`\${BASE}/api/verify/results/\${verification_id}\`, { headers }).then(r => r.json());
} while (!r.live_capture_completed || !DONE.includes(r.status));

console.log(r.status);           // 'verified' | 'failed' | 'manual_review'
console.log(r.face_match_score); // 0.0 – 1.0
console.log(r.liveness_score);   // 0.0 – 1.0
console.log(r.ocr_data.name);    // "Jane Smith"`}
            python={`import requests, time, base64

BASE = '${apiUrl}'
HEADERS = {'X-API-Key': 'your-api-key'}

def poll(vid, until_key=None, until_status=None, extra_check=None):
    """Poll /results until condition is met."""
    done = ['verified', 'failed', 'manual_review']
    while True:
        time.sleep(2)
        r = requests.get(f'{BASE}/api/verify/results/{vid}', headers=HEADERS).json()
        if until_key and r.get(until_key): return r
        if until_status and r.get('status') in done and r.get('live_capture_completed'): return r
        if extra_check and extra_check(r): return r

# ─── 1. Start session ───────────────────────────────────────────
session = requests.post(f'{BASE}/api/verify/start',
    headers={**HEADERS, 'Content-Type': 'application/json'},
    json={'user_id': 'user-uuid'}
).json()
vid = session['verification_id']

# ─── 2. Upload front document ───────────────────────────────────
with open('front.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/verify/document', headers=HEADERS,
        data={'verification_id': vid, 'document_type': 'drivers_license'},
        files={'document': f})

# ─── 3. Poll until OCR is ready ─────────────────────────────────
r = poll(vid, until_key='ocr_data')
print('Name:', r['ocr_data']['name'])

# ─── 4. Upload back-of-ID ───────────────────────────────────────
with open('back.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/verify/back-of-id', headers=HEADERS,
        data={'verification_id': vid, 'document_type': 'drivers_license'},
        files={'back_of_id': f})

# ─── 5. Poll until cross-validation finishes ────────────────────
r = poll(vid, until_key='enhanced_verification_completed')
if r['status'] == 'failed':
    raise Exception('Cross-validation failed: ' + r.get('failure_reason', ''))

# ─── 6. Submit live capture ─────────────────────────────────────
with open('selfie.jpg', 'rb') as f:
    img_b64 = base64.b64encode(f.read()).decode()
requests.post(f'{BASE}/api/verify/live-capture',
    headers={**HEADERS, 'Content-Type': 'application/json'},
    json={'verification_id': vid, 'live_image_data': img_b64})

# ─── 7. Poll for final result ────────────────────────────────────
r = poll(vid, until_status=True)
print(r['status'])            # verified / failed / manual_review
print(r['face_match_score'])  # 0.0 – 1.0
print(r['liveness_score'])    # 0.0 – 1.0
print(r['ocr_data']['name'])  # "Jane Smith"`}
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

          <Pre label="Curl example" code={`curl -X POST ${apiUrl}/api/verify/start \\
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
            asynchronous: submit the data, then poll <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>GET /api/verify/results/:id</code> to check progress.
          </Lead>

          {/* Step 1 */}
          <SectionAnchor id="step-1" />
          <EndpointCard step={1} method="POST" path="/api/verify/start" title="Start a Verification Session">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Creates a new verification session for a user. Returns a <code style={{ fontFamily: C.mono, color: C.cyan }}>verification_id</code> that
              ties together all subsequent uploads and results. One session = one complete identity check.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="user_id" type="UUID string" req={true} desc="Your unique identifier for the user being verified." />
              <FieldRow name="sandbox" type="boolean" req={false} desc="Set true to use sandbox mode. Defaults to false." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/verify/start \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "550e8400-e29b-41d4-a716-446655440000"}'`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "started",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "next_steps": [
    "Upload document with POST /api/verify/document",
    "Upload back-of-ID with POST /api/verify/back-of-id",
    "Complete live capture with POST /api/verify/live-capture",
    "Check results with GET /api/verify/results/:verification_id"
  ],
  "created_at": "2026-03-06T12:00:00Z"
}`} />
          </EndpointCard>

          {/* Step 2 */}
          <SectionAnchor id="step-2" />
          <EndpointCard step={2} method="POST" path="/api/verify/document" title="Upload Front Document">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Upload the <strong style={{ color: C.text }}>front face</strong> of the identity document (passport, driver's license, national ID).
              OCR extraction and image quality analysis run asynchronously after upload.
              The response does <em>not</em> yet contain OCR data — poll
              <code style={{ fontFamily: C.mono, color: C.cyan }}> GET /results/:id</code> until
              <code style={{ fontFamily: C.mono, color: C.cyan }}> ocr_data</code> is present before moving to Step 3.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="verification_id" type="UUID string" req={true} desc="The ID returned from Step 1." />
              <FieldRow name="document_type" type="string" req={true} desc="'passport' | 'drivers_license' | 'national_id' | 'other'" />
              <FieldRow name="document" type="File" req={true} desc="JPEG, PNG, WebP, or PDF. Max 10 MB." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/verify/document \\
  -H "X-API-Key: your-key" \\
  -F "verification_id=550e8400-e29b-41d4-a716-446655440001" \\
  -F "document_type=drivers_license" \\
  -F "document=@front.jpg"`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "pending",                    // OCR not yet complete
  "message": "Document uploaded successfully. Processing started.",
  "document_id": "doc_abc123",

  // Included if quality analysis ran (images only):
  "quality_analysis": {
    "overall_quality": "excellent",       // poor | fair | good | excellent
    "issues": [],                         // e.g. ["blurry", "low_contrast"]
    "recommendations": [],
    "quality_scores": {
      "blur_score": 342.5,
      "brightness": 128,
      "contrast": 45,
      "resolution": { "width": 1920, "height": 1080 }
    }
  }
}`} />
            <Callout type="note">
              OCR data is <strong>not in this response</strong>. Poll
              <code style={{ fontFamily: C.mono }}> GET /api/verify/results/:id</code> every 2 seconds
              until the <code style={{ fontFamily: C.mono }}>ocr_data</code> field is populated, then proceed to Step 3.
            </Callout>
          </EndpointCard>

          {/* Step 3 */}
          <SectionAnchor id="step-3" />
          <EndpointCard step={3} method="POST" path="/api/verify/back-of-id" title="Upload Back-of-ID"
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
              <FieldRow name="verification_id" type="UUID string" req={true} desc="The ID returned from Step 1." />
              <FieldRow name="document_type" type="string" req={true} desc="Must match the document_type used in Step 2." />
              <FieldRow name="back_of_id" type="File" req={true} desc="JPEG, PNG, or WebP. Max 10 MB." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/verify/back-of-id \\
  -H "X-API-Key: your-key" \\
  -F "verification_id=550e8400-e29b-41d4-a716-446655440001" \\
  -F "document_type=drivers_license" \\
  -F "back_of_id=@back.jpg"`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "back_of_id_document_id": "doc_back456",
  "status": "processing",                  // cross-validation in progress
  "message": "Back-of-ID uploaded successfully. Enhanced verification processing started.",
  "enhanced_verification": {
    "barcode_scanning_enabled": true,
    "cross_validation_enabled": true,
    "ai_powered": true
  },
  "next_steps": [
    "Processing barcode/QR code scanning",
    "Cross-validating with front-of-ID data",
    "Check results with GET /api/verify/results/550e8400-..."
  ]
}`} />
            <Callout type="warning">
              Poll <code style={{ fontFamily: C.mono }}>GET /results/:id</code> until{' '}
              <code style={{ fontFamily: C.mono }}>enhanced_verification_completed: true</code>.
              If <code style={{ fontFamily: C.mono }}>status</code> becomes{' '}
              <StatusPill status="failed" />, cross-validation did not pass — do not proceed to live capture.
              Check <code style={{ fontFamily: C.mono }}>failure_reason</code> for details.
            </Callout>
          </EndpointCard>

          {/* Step 4 */}
          <SectionAnchor id="step-4" />
          <EndpointCard step={4} method="POST" path="/api/verify/live-capture" title="Submit Live Capture"
            badge={{ label: 'AI-enhanced', color: C.purple, bg: C.purpleDim }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Submit a <strong style={{ color: C.text }}>base64-encoded camera frame</strong> for liveness detection and
              face matching against the front document photo. Only available after cross-validation passes.
              Liveness + face matching are asynchronous — the response returns immediately with
              <code style={{ fontFamily: C.mono, color: C.cyan }}> status: "processing"</code>.
              Final scores come from <code style={{ fontFamily: C.mono, color: C.cyan }}>GET /results/:id</code>.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Liveness detection checks</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                {['Facial depth & 3D structure', 'Natural skin texture & lighting', 'Screen glare & digital artifact detection', 'Challenge-response (blink, smile, head turn)', 'Anti-spoofing: photo/video replay', 'Face matching against front document photo'].map(s => (
                  <div key={s} style={{ fontFamily: C.sans, fontSize: '0.8rem', color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: C.purple, fontSize: '0.7rem' }}>✓</span> {s}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldRow name="verification_id" type="UUID string" req={true} desc="Must have cross-validation completed (enhanced_verification_completed: true)." />
              <FieldRow name="live_image_data" type="base64 string" req={true} desc="Base64-encoded JPEG. Do NOT include the data URI prefix (data:image/jpeg;base64,...)." />
              <FieldRow name="challenge_response" type="string" req={false} desc="The liveness challenge the user performed, e.g. 'smile', 'blink_twice'." />
            </div>
            <Pre label="Request" code={`curl -X POST ${apiUrl}/api/verify/live-capture \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "verification_id": "550e8400-e29b-41d4-a716-446655440001",
    "live_image_data": "/9j/4AAQSkZJRgABA...",
    "challenge_response": "smile"
  }'`} />
            <Pre label="Response  —  HTTP 201" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "live_capture_id": "550e8400-e29b-41d4-a716-446655440099",
  "status": "processing",        // liveness + face match running in background
  "message": "Live capture uploaded successfully. Processing liveness detection and face matching.",
  "liveness_check_enabled": true,
  "face_matching_enabled": true,
  "results_url": "/api/verify/results/550e8400-e29b-41d4-a716-446655440001"
}`} />
            <Callout type="note">
              Scores are <strong>not in this response</strong>. Poll{' '}
              <code style={{ fontFamily: C.mono }}>GET /results/:id</code> until{' '}
              <code style={{ fontFamily: C.mono }}>live_capture_completed: true</code> AND{' '}
              <code style={{ fontFamily: C.mono }}>status</code> is{' '}
              <StatusPill status="verified" />, <StatusPill status="failed" />, or <StatusPill status="manual_review" />.
            </Callout>
          </EndpointCard>

          {/* Step 5 */}
          <SectionAnchor id="step-5" />
          <EndpointCard step={5} method="GET" path="/api/verify/results/:verification_id" title="Get Verification Results">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              The single source of truth for a verification session. Use this endpoint for polling at each
              processing stage and for reading the final result. Returns the full record including OCR data,
              cross-validation scores, liveness score, and face match score.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Polling conditions</div>
              {[
                { after: 'After Step 2 (front doc)', condition: 'ocr_data is not null', next: 'proceed to Step 3' },
                { after: 'After Step 3 (back-of-ID)', condition: 'enhanced_verification_completed === true', next: 'check status; if not "failed", proceed to Step 4' },
                { after: 'After Step 4 (live capture)', condition: 'live_capture_completed === true AND status in ["verified","failed","manual_review"]', next: 'verification complete' },
              ].map(r => (
                <div key={r.after} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, width: 160, flexShrink: 0 }}>{r.after}</span>
                  <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, flex: 1 }}>{r.condition}</code>
                  <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.green, flexShrink: 0 }}>→ {r.next}</span>
                </div>
              ))}
            </div>

            <Pre label="Request" code={`curl -X GET ${apiUrl}/api/verify/results/550e8400-e29b-41d4-a716-446655440001 \\
  -H "X-API-Key: your-key"`} />
            <Pre label="Response  —  completed verification" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "user_id":         "550e8400-e29b-41d4-a716-446655440000",
  "status":          "verified",
  "created_at":      "2026-03-06T12:00:00Z",
  "updated_at":      "2026-03-06T12:05:30Z",

  // ── Front document (OCR) ─────────────────────────────────────
  "document_uploaded": true,
  "document_type":     "drivers_license",
  "ocr_data": {
    "name":              "Jane Smith",
    "date_of_birth":     "1990-06-15",
    "document_number":   "DL123456789",
    "expiration_date":   "2030-06-15",
    "address":           "123 Main St, Anytown, US",
    "confidence_scores": { "name": 0.97, "date_of_birth": 0.96 }
  },
  "quality_analysis": { "overallQuality": "excellent", "isBlurry": false },

  // ── Back-of-ID (barcode + cross-validation) ──────────────────
  "back_of_id_uploaded":            true,
  "enhanced_verification_completed": true,
  "cross_validation_score":          0.98,
  "cross_validation_results": {
    "match_score": 0.98,
    "validation_results": {
      "id_number_match": true,
      "expiry_date_match": true,
      "overall_consistency": true
    },
    "discrepancies": []
  },
  "barcode_data": {
    "parsed_data": {
      "id_number":          "DL123456789",
      "expiry_date":        "2030-06-15",
      "issuing_authority":  "Department of Motor Vehicles"
    }
  },

  // ── Live capture (liveness + face match) ─────────────────────
  "live_capture_completed": true,
  "liveness_score":          0.96,   // 0–1; threshold ~0.6
  "face_match_score":        0.94,   // 0–1; threshold ~0.6

  // ── Overall ──────────────────────────────────────────────────
  "confidence_score":    0.95,
  "failure_reason":      null,       // set if status is "failed"
  "manual_review_reason": null       // set if status is "manual_review"
}`} />
          </EndpointCard>

          {/* Selfie legacy */}
          <SectionAnchor id="selfie" />
          <EndpointCard method="POST" path="/api/verify/selfie" title="Selfie Upload"
            badge={{ label: 'legacy', color: C.dim, bg: 'rgba(74,85,104,0.13)' }}>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Upload a pre-captured selfie file for face matching. This is the legacy static-upload endpoint.
              For new integrations, use <code style={{ fontFamily: C.mono, color: C.cyan }}>POST /api/verify/live-capture</code> which
              includes real-time liveness detection via camera.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="verification_id" type="UUID string" req={true} desc="The session ID." />
              <FieldRow name="selfie" type="File" req={true} desc="JPEG or PNG only. Max 10 MB." />
            </div>
            <Pre label="Response  —  HTTP 201" code={`{
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status":  "processing",    // face matching runs async
  "message": "Selfie uploaded successfully. Face recognition started.",
  "selfie_id": "selfie_abc789",
  "next_steps": "Check verification status with /api/verify/results/:verification_id"
}`} />
          </EndpointCard>

          {/* Live token */}
          <SectionAnchor id="live-token" />
          <EndpointCard method="POST" path="/api/verify/generate-live-token" title="Generate Live Capture Token">
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Generate a secure short-lived token and liveness challenge for a live capture session.
              Useful when you want to redirect users to a hosted capture page rather than embedding the camera yourself.
              Token expires in 30 minutes.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldRow name="user_id" type="UUID string" req={true} desc="The user to generate the token for." />
              <FieldRow name="verification_id" type="UUID string" req={false} desc="Link the token to an existing session." />
            </div>
            <Pre label="Response" code={`{
  "live_capture_token":  "a3f8b2e1c9d7...",    // 64-char hex
  "expires_at":          "2026-03-06T12:30:00Z",
  "expires_in_seconds":  1800,
  "live_capture_url":    "https://yourapp.com/live-capture?token=a3f8b2e1...",
  "liveness_challenge": {
    "type":        "smile",                     // blink_twice | turn_head_left | smile | look_up | ...
    "instruction": "Please smile when prompted"
  },
  "user_id":         "550e8400-e29b-41d4-a716-446655440000",
  "verification_id": "550e8400-e29b-41d4-a716-446655440001"
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
                desc: 'Redirect users to our hosted verification page. No UI to build — we handle all 6 steps, camera access, mobile handoff, and result display.',
                features: ['Complete UI, zero frontend work', 'Camera + liveness built-in', 'Mobile QR code handoff', 'Light/dark theme support', 'Custom redirect on completion'],
                href: '/user-verification?api_key=demo&user_id=demo-user',
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
              <FieldRow name="theme" type="'light' | 'dark'" req={false} desc="UI color theme. Defaults to light." />
            </div>
          </div>

          <Pre label="Example URL" code={`https://yourapp.com/user-verification?api_key=sk_live_xxx&user_id=user-123&redirect_url=https://yourapp.com/done&theme=light`} />

          <Divider />

          {/* ══ AI ANALYSIS ══════════════════════════════════════════════════ */}
          <SectionAnchor id="analysis" />
          <H2>AI Analysis Features</H2>
          <Lead>What the platform extracts and validates from each document and capture.</Lead>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { title: 'OCR Extraction', color: C.cyan, items: ['Name, date of birth', 'Document number', 'Expiry & issue date', 'Issuing authority', 'Address (where applicable)', 'Per-field confidence scores'] },
              { title: 'Document Quality', color: C.blue, items: ['Blur detection', 'Brightness & contrast', 'Resolution check', 'File size validation', 'Overall quality rating', 'Improvement recommendations'] },
              { title: 'Barcode / QR', color: C.amber, items: ['PDF417 barcode decode', 'QR code scanning', 'Data field extraction', 'Front ↔ back cross-check', 'ID number consistency', 'Security feature flags'] },
              { title: 'Liveness & Face', color: C.green, items: ['3D facial depth analysis', 'Skin texture & lighting', 'Anti-spoofing detection', 'Challenge-response', 'Face similarity 0–1', 'Multiple face detection'] },
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
          <Lead>A verification moves through these statuses. Only <strong style={{ color: C.green }}>verified</strong>, <strong style={{ color: C.red }}>failed</strong>, and <strong style={{ color: C.orange }}>manual_review</strong> are terminal.</Lead>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
            {[
              { status: 'pending', color: C.amber, bg: C.amberDim, desc: 'Session created, or document uploaded. Waiting for OCR to complete.', terminal: false },
              { status: 'processing', color: C.blue, bg: C.blueDim, desc: 'Cross-validation passed. Live capture is the next required step.', terminal: false },
              { status: 'verified', color: C.green, bg: C.greenDim, desc: 'All checks passed — cross-validation, liveness, and face match.', terminal: true },
              { status: 'failed', color: C.red, bg: C.redDim, desc: 'Verification failed. Check failure_reason for: cross-validation mismatch, liveness failure, or face match below threshold.', terminal: true },
              { status: 'manual_review', color: C.orange, bg: C.orangeDim, desc: 'Requires human review. Edge case, low confidence score, or processing error.', terminal: true },
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
              { icon: '✉️', title: 'Email Support', desc: 'Technical support and integration help', href: 'mailto:support@idswyft.com', cta: 'support@idswyft.com' },
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
