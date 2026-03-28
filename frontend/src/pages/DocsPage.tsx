import React, { useState } from 'react';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import {
  H2, Lead, Divider, SectionAnchor, Callout,
  FieldRow, Pre, CodeTabs, CodeTabType, Pipeline,
  EndpointCard, StatusPill,
} from '../components/docs/shared';
import { getDocumentationApiUrl } from '../config/api';
import { C } from '../theme';
import '../styles/patterns.css';

const NAV: NavItem[] = [
  { id: 'quick-start', label: 'Quick Start', depth: 0 },
  { id: 'auth', label: 'Authentication', depth: 0 },
  { id: 'flow', label: 'Verification Flow', depth: 0 },
  { id: 'step-1', label: '1 · Start Session', depth: 1 },
  { id: 'step-2', label: '2 · Upload Front', depth: 1 },
  { id: 'step-3', label: '3 · Upload Back', depth: 1 },
  { id: 'step-4', label: '4 · Live Capture', depth: 1 },
  { id: 'step-5', label: '5 · Get Results', depth: 1 },
  { id: 'selfie', label: 'Cross-Validation', depth: 1 },
];

export const DocsPage: React.FC = () => {
  const apiUrl = getDocumentationApiUrl();
  const [tab, setTab] = useState<CodeTabType>('curl');
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <DocLayout slug="api-docs" nav={NAV}>

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
            <code style={{ fontFamily: C.mono, fontSize: '0.85rem', color: C.cyan }}>X-API-Key: ik_your_api_key</code>
          </div>
        </div>
      </div>

      <Pre label="Curl example" code={`curl -X POST ${apiUrl}/api/v2/verify/initialize \\
  -H "X-API-Key: ik_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "550e8400-e29b-41d4-a716-446655440000"}'`} />

      <Callout type="tip">
        Use a <strong>sandbox key</strong> during development.
        Sandbox mode is a property of the key (set in the Developer Portal), not a prefix distinction — all keys use the <code style={{ fontFamily: C.mono }}>ik_</code> prefix.
        Sandbox mode uses the same pipeline with real OCR and face matching, but counts against a separate quota and won't affect production metrics.
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px 24px' }}>
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
          One endpoint, two gates, two liveness modes. Submit a{' '}
          <strong style={{ color: C.text }}>live capture image</strong> plus optional{' '}
          <code style={{ fontFamily: C.mono, color: C.cyan }}>liveness_metadata</code> to unlock stronger liveness detection.{' '}
          <strong style={{ color: C.text }}>Gate 4 (Liveness)</strong> checks that the image is from a live person, then{' '}
          <strong style={{ color: C.text }}>Gate 5 (Face Match)</strong> auto-triggers to compare against the document photo
          (128-d cosine similarity, threshold 0.60).
        </p>

        {/* Two-column mode comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            {
              title: 'Passive', color: C.amber, label: 'Basic',
              desc: 'Just upload the image — no extra data needed. 8 heuristic signals (entropy, pixel variance, EXIF, file size, etc.).',
              signals: ['Byte entropy analysis', 'Pixel variance & texture', 'File size heuristics', 'EXIF metadata checks', 'Color distribution', 'Digital artifact detection', 'Face detection (SSDMobileNet)', 'Frequency domain analysis'],
              security: 'Basic',
              when: 'Low-risk onboarding, sandbox testing',
            },
            {
              title: 'Head Turn', color: C.green, label: 'Recommended',
              desc: 'Client captures 5\u201312 timed frames while user turns head. Server runs face detection + 7 weighted checks. Pass \u2265 0.70. Zero ML on the client.',
              signals: ['All passive checks', 'Face present across all frames', 'Head turn detected (\u226512\u00B0 yaw)', 'Correct direction compliance', 'Return to center verified', 'Temporal plausibility (3\u201360s)', 'Face bounding box consistency', 'Virtual camera detection'],
              security: 'Strong',
              when: 'All production identity verification',
            },
          ].map(t => (
            <div key={t.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: `3px solid ${t.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: C.mono, fontSize: '0.82rem', fontWeight: 700, color: t.color }}>{t.title}</span>
                <span style={{ fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30`, letterSpacing: '0.06em' }}>{t.label}</span>
              </div>
              <p style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
              <div>
                {t.signals.map(s => (
                  <div key={s} style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.dim, padding: '2px 0', display: 'flex', gap: 6 }}>
                    <span style={{ color: t.color, fontSize: '0.6rem', marginTop: 3 }}>▸</span> {s}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Security</div>
                <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: t.color, fontWeight: 600 }}>{t.security}</span>
              </div>
              <div>
                <div style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Best for</div>
                <span style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.muted }}>{t.when}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Client-side requirements */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Client-side requirements</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '100px 1fr 1fr', gap: '8px 16px' }}>
            {[
              ['Passive', 'None — just upload the image file', 'None'],
              ['Head turn', 'getUserMedia() + canvas.toDataURL()', 'None — all face analysis runs server-side'],
            ].map(([tier, browser, deps]) => (
              <React.Fragment key={tier}>
                <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, fontWeight: 600 }}>{tier}</span>
                <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.5 }}>{browser}</span>
                <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.5 }}>{deps}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <Callout type="tip">
          <strong>Head turn needs zero ML dependencies on the client.</strong> Just capture JPEG frames from the camera
          using standard browser APIs (<code style={{ fontFamily: C.mono }}>getUserMedia</code> + <code style={{ fontFamily: C.mono }}>canvas.toDataURL</code>).
          The server handles all face detection and yaw estimation. This is what the hosted verification page and demo use internally.
        </Callout>

        {/* Fields */}
        <div style={{ marginBottom: 12 }}>
          <FieldRow name="selfie" type="File" req={true} desc="JPEG or PNG image captured live from the user's camera via getUserMedia(). Max 10 MB. Static file uploads will fail liveness." />
          <FieldRow name="liveness_metadata" type="JSON string" req={false} desc="JSON-stringified challenge data for head_turn liveness. Omit for passive mode (lowest pass rate)." />
        </div>

        <Callout type="warning">
          <strong>The selfie must be a live camera capture, not a file upload.</strong> The liveness engine runs anti-spoofing
          checks on every image — even in passive mode (8 heuristic signals including EXIF analysis, compression artifacts,
          moire detection). A static photo uploaded from disk will almost certainly fail with{' '}
          <code style={{ fontFamily: C.mono }}>LIVENESS_FAILED</code> because it lacks camera metadata and has
          re-compression artifacts. Always use{' '}
          <code style={{ fontFamily: C.mono }}>getUserMedia()</code> to capture directly from the device camera.
        </Callout>

        {/* liveness_metadata JSON shape */}
        <Pre label="liveness_metadata — head_turn" code={`{
  "challenge_type": "head_turn",
  "challenge_direction": "left",
  "frames": [
    { "frame_base64": "/9j/4AAQ...", "timestamp": 1000,  "phase": "turn1_start" },
    { "frame_base64": "/9j/4BBR...", "timestamp": 4000,  "phase": "turn1_peak" },
    { "frame_base64": "/9j/4CCG...", "timestamp": 7000,  "phase": "turn1_return" },
    { "frame_base64": "/9j/4DDH...", "timestamp": 8200,  "phase": "turn_start" },
    { "frame_base64": "/9j/4EEI...", "timestamp": 11200, "phase": "turn_peak" },
    { "frame_base64": "/9j/4FFJ...", "timestamp": 14200, "phase": "turn_return" }
  ],
  "start_timestamp": 0,
  "end_timestamp": 15000
}`} />

        {/* Passive upload example */}
        <CodeTabs tab={tab} onChange={setTab}
          curl={`# Passive liveness (just the file, no metadata)
curl -X POST ${apiUrl}/api/v2/verify/VERIFICATION_ID/live-capture \\
  -H "X-API-Key: your-key" \\
  -F "selfie=@capture.jpg"`}
          js={`// Passive liveness — just the file
const fd = new FormData();
fd.append('selfie', captureFile);

const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/live-capture\`,
  { method: 'POST', headers: { 'X-API-Key': 'your-key' }, body: fd },
);
const data = await res.json();`}
          python={`# Passive liveness — just the file
import requests

res = requests.post(
    f'${apiUrl}/api/v2/verify/{verification_id}/live-capture',
    headers={'X-API-Key': 'your-key'},
    files={'selfie': open('capture.jpg', 'rb')},
)
data = res.json()`} />

        <CodeTabs tab={tab} onChange={setTab}
          curl={`# Head-turn liveness — capture frames from camera, server analyzes face
curl -X POST ${apiUrl}/api/v2/verify/VERIFICATION_ID/live-capture \\
  -H "X-API-Key: your-key" \\
  -F "selfie=@capture.jpg" \\
  -F 'liveness_metadata={
    "challenge_type": "head_turn",
    "challenge_direction": "left",
    "frames": [
      {"frame_base64":"<base64>","timestamp":1000,"phase":"turn1_start"},
      {"frame_base64":"<base64>","timestamp":4000,"phase":"turn1_peak"},
      {"frame_base64":"<base64>","timestamp":7000,"phase":"turn1_return"},
      {"frame_base64":"<base64>","timestamp":8200,"phase":"turn_start"},
      {"frame_base64":"<base64>","timestamp":11200,"phase":"turn_peak"},
      {"frame_base64":"<base64>","timestamp":14200,"phase":"turn_return"}
    ],
    "start_timestamp": 0,
    "end_timestamp": 15000
  }'`}
          js={`// Head-turn liveness — capture frames from camera, server analyzes face
const fd = new FormData();
fd.append('selfie', captureFile);
fd.append('liveness_metadata', JSON.stringify({
  challenge_type: 'head_turn',
  challenge_direction: 'left',
  frames: capturedFrames, // from canvas.toDataURL('image/jpeg', 0.7)
  // Each frame: { frame_base64, timestamp, phase }
  // Phases: turn1_start → turn1_peak → turn1_return → turn_start → turn_peak → turn_return
  start_timestamp: startTime,
  end_timestamp: Date.now(),
}));

const res = await fetch(
  \`${apiUrl}/api/v2/verify/\${verification_id}/live-capture\`,
  { method: 'POST', headers: { 'X-API-Key': 'your-key' }, body: fd },
);
const data = await res.json();`}
          python={`# Head-turn liveness — capture frames from camera, server analyzes face
import requests, json

metadata = {
    'challenge_type': 'head_turn',
    'challenge_direction': 'left',
    'frames': captured_frames,  # list of {frame_base64, timestamp, phase}
    # Phases: turn1_start → turn1_peak → turn1_return → turn_start → turn_peak → turn_return
    'start_timestamp': start_time,
    'end_timestamp': end_time,
}

res = requests.post(
    f'${apiUrl}/api/v2/verify/{verification_id}/live-capture',
    headers={'X-API-Key': 'your-key'},
    files={'selfie': open('capture.jpg', 'rb')},
    data={'liveness_metadata': json.dumps(metadata)},
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
    "similarity_score": 0.94,     // cosine similarity 0.0 – 1.0
    "threshold_used": 0.6         // configurable confidence threshold
  },

  // Liveness detection:
  "liveness_results": {
    "liveness_passed": true,
    "liveness_score": 0.96,
    "liveness_mode": "head_turn"  // "passive" | "head_turn"
  },

  // Final auto-decision:
  "final_result": "verified"      // "verified" | "manual_review" | "failed"
}`} />

        <Callout type="tip">
          <strong>Which mode should you use?</strong> For low-risk flows (e.g. sandbox, basic onboarding), passive is fine.
          For all production identity verification, use <strong>head turn</strong> — it provides strong anti-spoofing
          with zero client-side ML dependencies.
        </Callout>
        <Callout type="warning">
          If <code style={{ fontFamily: C.mono }}>liveness_metadata</code> is provided but fails validation (wrong schema,
          missing fields), the API returns <strong>HTTP 400</strong> with a{' '}
          <code style={{ fontFamily: C.mono }}>VALIDATION_ERROR</code> code. It does not silently fall back to passive mode.
          Always check your metadata format matches the schema above.
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

    </DocLayout>
  );
};
