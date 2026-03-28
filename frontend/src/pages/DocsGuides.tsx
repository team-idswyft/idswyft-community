import React, { useState } from 'react';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import {
  H2, Lead, Divider, SectionAnchor, Callout,
  FieldRow, Pre, CodeTabs, CodeTabType, Pill,
} from '../components/docs/shared';
import { getDocumentationApiUrl } from '../config/api';
import { C } from '../theme';
import '../styles/patterns.css';

const NAV: NavItem[] = [
  { id: 'integration', label: 'Integration Options', depth: 0 },
  { id: 'guides', label: 'Guides & Tutorials', depth: 0 },
  { id: 'guide-e2e', label: 'End-to-End Tutorial', depth: 1 },
  { id: 'guide-mobile', label: 'Mobile Handoff', depth: 1 },
  { id: 'guide-custom-ui', label: 'Building Custom UI', depth: 1 },
];

export const DocsGuides: React.FC = () => {
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
    <DocLayout slug="docs/guides" nav={NAV}>

      {/* ══ INTEGRATION OPTIONS ══════════════════════════════════════════ */}
      <SectionAnchor id="integration" />
      <H2>Integration Options</H2>
      <Lead>Three ways to add identity verification to your product — from zero-code to full control.</Lead>

      {/* ── Hosted page URL callout ── */}
      <div style={{ background: `${C.cyan}11`, border: `1px solid ${C.cyan}33`, borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.text, margin: '0 0 8px', fontWeight: 600 }}>
          Hosted Verification Page
        </p>
        <p style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.muted, margin: '0 0 8px', lineHeight: 1.65 }}>
          Idswyft hosts a complete verification UI at the following URL. This is the page used by all three integration methods below — redirect, iframe, or SDK embed.
        </p>
        <code style={{ fontFamily: C.mono, fontSize: '0.85rem', color: C.cyan, display: 'block', padding: '8px 12px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          https://idswyft.app/user-verification
        </code>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          {
            emoji: '🔗', title: 'Redirect',
            tag: { label: 'Easiest', color: C.green, bg: C.greenDim },
            desc: 'Send users to the hosted page with a link or redirect. After verification, they are sent back to your redirect_url.',
            features: ['Zero frontend code', 'Works on any platform', 'User leaves your site temporarily', 'Best for: server-rendered apps, email flows'],
          },
          {
            emoji: '🖼️', title: 'Iframe Embed',
            tag: { label: 'No SDK needed', color: C.blue, bg: C.blueDim },
            desc: 'Embed the hosted page inside your app using a standard HTML iframe. Users never leave your site.',
            features: ['One line of HTML', 'Users stay on your domain', 'Requires allow="camera"', 'Best for: quick inline embed'],
          },
          {
            emoji: '⚡', title: 'SDK Embed',
            tag: { label: 'Recommended', color: C.cyan, bg: `${C.cyan}22` },
            desc: 'Use the @idswyft/sdk IdswyftEmbed component for modal or inline mode with event callbacks.',
            features: ['Modal or inline mode', 'onComplete / onError callbacks', 'postMessage communication', 'Best for: SPAs, React, Vue'],
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
          </div>
        ))}
      </div>

      <p style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.muted, lineHeight: 1.65, marginBottom: 8 }}>
        All three methods use the same hosted page URL with query parameters. For fully custom UI, see the{' '}
        <a href="/docs" style={{ color: C.cyan, textDecoration: 'none', fontFamily: C.mono, fontSize: 'inherit' }}>REST API</a> section.
      </p>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>URL parameters</div>
        <div style={{ padding: '8px 20px' }}>
          <FieldRow name="api_key" type="string" req={true} desc="Your Idswyft API key." />
          <FieldRow name="user_id" type="UUID string" req={true} desc="Unique identifier for the user being verified." />
          <FieldRow name="redirect_url" type="URL string" req={false} desc="Where to redirect after verification completes. Required for redirect integration; optional for iframe/embed." />
          <FieldRow name="theme" type="'light' | 'dark'" req={false} desc="UI color theme. Defaults to dark." />
          <FieldRow name="address_verif" type="'true'" req={false} desc="When set to 'true', adds an optional proof-of-address step after identity verification. Users can upload a utility bill, bank statement, or tax document. The name is cross-referenced against the verified ID." />
        </div>
      </div>

      <Pre label="Option 1: Redirect (link or window.location)" code={`// Redirect the user to the hosted verification page
window.location.href = 'https://idswyft.app/user-verification'
  + '?api_key=ik_your_api_key'
  + '&user_id=user-123'
  + '&redirect_url=' + encodeURIComponent('https://yourapp.com/done')
  + '&theme=dark';`} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Redirect callback parameters</div>
        <div style={{ padding: '12px 20px' }}>
          <p style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.muted, lineHeight: 1.65, margin: '0 0 12px' }}>
            When verification completes, the user is redirected back to your <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>redirect_url</code> with these query parameters appended:
          </p>
          <FieldRow name="verification_id" type="UUID string" req={true} desc="The verification session ID. Use this to fetch full results via GET /api/v2/verify/:id/status." />
          <FieldRow name="status" type="string" req={true} desc="Result status: 'verified', 'failed', or 'manual_review'. If manual_review, poll the status endpoint or listen for a webhook to get the final decision." />
          <FieldRow name="user_id" type="string" req={true} desc="The user_id you passed when starting verification." />
        </div>
      </div>

      <Pre label="Example: handling the redirect callback" code={`// On your redirect_url page (e.g. https://yourapp.com/done)
const params = new URLSearchParams(window.location.search);
const verificationId = params.get('verification_id');
const status = params.get('status');   // 'verified', 'failed', or 'manual_review'
const userId = params.get('user_id');

if (status === 'verified' && verificationId) {
  // Fetch full results from your backend
  const res = await fetch('/api/verification-result?id=' + encodeURIComponent(verificationId));
  // Update your user record, grant access, etc.
} else if (status === 'manual_review') {
  // Verification needs human review — poll GET /api/v2/verify/:id/status
  // or wait for a webhook to get the final decision
}`} />

      <Pre label="Option 2: Iframe embed (HTML)" code={`<!-- Embed the verification page inline on your site -->
<iframe
  src="https://idswyft.app/user-verification?api_key=ik_your_api_key&user_id=user-123&theme=dark"
  width="100%" height="700" frameborder="0"
  allow="camera; microphone"
  style="border: none; border-radius: 8px;"
></iframe>`} />
      <Pre label="Option 3: SDK embed (see SDK & Embed docs)" code={`import { IdswyftEmbed } from '@idswyft/sdk';

const embed = new IdswyftEmbed({ mode: 'modal', theme: 'dark' });
embed.open(sessionToken, {
  onComplete: (result) => console.log(result.finalResult),
  onError: (error) => console.error(error.message),
});`} />

      <Divider />

      {/* ══ GUIDES & TUTORIALS ════════════════════════════════════════════ */}
      <SectionAnchor id="guides" />
      <H2>Guides & Tutorials</H2>
      <Lead>Step-by-step walkthroughs for common integration patterns. Each guide includes production-ready code with proper error handling.</Lead>

      {/* ── Guide 1: End-to-End Tutorial ── */}
      <SectionAnchor id="guide-e2e" />
      <h3 style={{ fontFamily: C.mono, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 8px' }}>
        <span style={{ color: C.cyan, fontWeight: 400 }}>→</span> End-to-End Verification Tutorial
      </h3>
      <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
        A complete walkthrough with proper error handling, exponential backoff polling, and all 5 verification steps.
        Unlike the Quick Start (which is minimal), this guide shows production-ready patterns.
      </p>

      <CodeTabs tab={tab} onChange={setTab}
        js={`// ─── Reusable polling helper with exponential backoff ──────────
async function pollStatus(verificationId, apiKey, baseUrl, {
  condition, // (data) => boolean — stop polling when true
  maxAttempts = 60,
  initialDelay = 1000,
  maxDelay = 10000,
} = {}) {
  let delay = initialDelay;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(ok => setTimeout(ok, delay));
    const res = await fetch(
      \`\${baseUrl}/api/v2/verify/\${verificationId}/status\`,
      { headers: { 'X-API-Key': apiKey } },
    );
    if (!res.ok) throw new Error(\`Poll failed: \${res.status}\`);
    const data = await res.json();
    if (data.final_result === 'failed') {
      throw new Error(\`Verification failed: \${data.failure_reason}\`);
    }
    if (condition(data)) return data;
    delay = Math.min(delay * 1.5, maxDelay); // exponential backoff
  }
  throw new Error('Polling timed out');
}

// ─── Full verification flow ────────────────────────────────────
const BASE = '${apiUrl}';
const KEY  = 'ik_your_api_key';
const headers = { 'X-API-Key': KEY };

// Step 1: Initialize
const init = await fetch(\`\${BASE}/api/v2/verify/initialize\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 'user-uuid' }),
}).then(r => r.json());
const vid = init.verification_id;

// Step 2: Upload front document
const fd1 = new FormData();
fd1.append('document_type', 'drivers_license');
fd1.append('document', frontFile);
const frontRes = await fetch(\`\${BASE}/api/v2/verify/\${vid}/front-document\`, {
  method: 'POST', headers, body: fd1,
}).then(r => r.json());
if (!frontRes.success) throw new Error(frontRes.message);

// Poll until OCR is ready
const ocrResult = await pollStatus(vid, KEY, BASE, {
  condition: (d) => d.ocr_data != null,
});
console.log('OCR:', ocrResult.ocr_data.full_name);

// Step 3: Upload back document (cross-validation auto-triggers)
const fd2 = new FormData();
fd2.append('document_type', 'drivers_license');
fd2.append('document', backFile);
await fetch(\`\${BASE}/api/v2/verify/\${vid}/back-document\`, {
  method: 'POST', headers, body: fd2,
}).then(r => r.json());

// Poll until cross-validation completes
const crossResult = await pollStatus(vid, KEY, BASE, {
  condition: (d) => d.cross_validation_results != null,
});
console.log('Cross-val:', crossResult.cross_validation_results.verdict);

// Step 4: Submit live capture with liveness data
// Head turn challenge — no client ML needed, just camera frames.
// Capture frames from getUserMedia() via canvas at different time points.
const fd3 = new FormData();
fd3.append('selfie', captureBlob, 'capture.jpg');
fd3.append('liveness_metadata', JSON.stringify({
  challenge_type: 'head_turn',
  challenge_direction: 'left',
  frames: capturedFrames, // array from canvas.toDataURL('image/jpeg')
  // Each frame: { frame_base64, timestamp, phase }
  start_timestamp: startTime,
  end_timestamp: Date.now(),
}));
const liveRes = await fetch(\`\${BASE}/api/v2/verify/\${vid}/live-capture\`, {
  method: 'POST', headers, body: fd3,
}).then(r => r.json());

// Verify which liveness mode was actually used
console.log('Liveness mode:', liveRes.liveness_results?.liveness_mode);

// Poll for final result
const final = await pollStatus(vid, KEY, BASE, {
  condition: (d) => d.final_result != null,
});
console.log('Result:', final.final_result);
console.log('Face match:', final.face_match_results?.similarity_score);
console.log('Liveness:', final.liveness_results?.liveness_passed);`}
        python={`import requests, time

BASE = '${apiUrl}'
KEY  = 'ik_your_api_key'
HEADERS = {'X-API-Key': KEY}

# ─── Reusable polling helper with exponential backoff ──────────
def poll_status(vid, *, condition, max_attempts=60,
                initial_delay=1.0, max_delay=10.0):
    delay = initial_delay
    for _ in range(max_attempts):
        time.sleep(delay)
        r = requests.get(
            f'{BASE}/api/v2/verify/{vid}/status', headers=HEADERS
        ).json()
        if r.get('final_result') == 'failed':
            raise Exception(f"Verification failed: {r.get('failure_reason')}")
        if condition(r):
            return r
        delay = min(delay * 1.5, max_delay)
    raise TimeoutError('Polling timed out')

# ─── Full verification flow ────────────────────────────────────

# Step 1: Initialize
init = requests.post(f'{BASE}/api/v2/verify/initialize',
    headers={**HEADERS, 'Content-Type': 'application/json'},
    json={'user_id': 'user-uuid'},
).json()
vid = init['verification_id']

# Step 2: Upload front document
with open('front.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/front-document',
        headers=HEADERS,
        data={'document_type': 'drivers_license'},
        files={'document': f},
    )

# Poll until OCR is ready
ocr = poll_status(vid, condition=lambda d: d.get('ocr_data'))
print('OCR:', ocr['ocr_data']['full_name'])

# Step 3: Upload back document
with open('back.jpg', 'rb') as f:
    requests.post(f'{BASE}/api/v2/verify/{vid}/back-document',
        headers=HEADERS,
        data={'document_type': 'drivers_license'},
        files={'document': f},
    )

# Poll until cross-validation completes
cross = poll_status(vid, condition=lambda d: d.get('cross_validation_results'))
print('Cross-val:', cross['cross_validation_results']['verdict'])

# Step 4: Submit live capture with liveness data
# Head turn challenge — no client ML needed, just camera frames.
# captured_frames: list of dicts from canvas.toDataURL() on the frontend.
import json

liveness_metadata = {
    'challenge_type': 'head_turn',
    'challenge_direction': 'left',
    'frames': captured_frames,  # list of {frame_base64, timestamp, phase}
    'start_timestamp': start_time,
    'end_timestamp': end_time,
}

with open('capture.jpg', 'rb') as f:
    live_res = requests.post(f'{BASE}/api/v2/verify/{vid}/live-capture',
        headers=HEADERS,
        files={'selfie': f},
        data={'liveness_metadata': json.dumps(liveness_metadata)},
    ).json()

# Verify which liveness mode was actually used
print('Liveness mode:', live_res.get('liveness_results', {}).get('liveness_mode'))

# Poll for final result
final = poll_status(vid, condition=lambda d: d.get('final_result'))
print('Result:', final['final_result'])
print('Face match:', final.get('face_match_results', {}).get('similarity_score'))
print('Liveness:', final.get('liveness_results', {}).get('liveness_passed'))`} />

      <Callout type="tip">
        For event-driven updates without manual polling, use the SDK's{' '}
        <code style={{ fontFamily: C.mono }}>watch()</code> method — see the{' '}
        <a href="/docs/sdk" style={{ color: C.cyan, textDecoration: 'none', fontFamily: C.mono, fontSize: 'inherit' }}>JavaScript SDK</a>{' '}
        section.
      </Callout>
      <Callout type="warning">
        <strong>Liveness detection is mandatory.</strong> The live capture endpoint runs Gate 4 (liveness) before
        Gate 5 (face match). We recommend the <strong>head turn</strong> mode — it requires no client-side
        ML libraries, just <code style={{ fontFamily: C.mono }}>getUserMedia()</code> + canvas frame capture.
        Omitting <code style={{ fontFamily: C.mono }}>liveness_metadata</code> falls back to passive mode
        (lowest pass rate). Check <code style={{ fontFamily: C.mono }}>liveness_results.liveness_mode</code>{' '}
        in the response to confirm which mode was used. See{' '}
        <a href="/docs#step-4" style={{ color: C.cyan, textDecoration: 'none', fontFamily: C.mono, fontSize: 'inherit' }}>Step 4</a>{' '}
        for details and metadata shapes.
      </Callout>

      {/* ── Guide 2: Mobile Handoff ── */}
      <SectionAnchor id="guide-mobile" />
      <h3 style={{ fontFamily: C.mono, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 8px' }}>
        <span style={{ color: C.cyan, fontWeight: 400 }}>→</span> Mobile Handoff
      </h3>
      <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
        Let users start verification on desktop and continue on their phone. Your backend creates a handoff
        session with a short-lived token, which you present as a QR code or deep link. The mobile browser opens
        the hosted verification page and camera access works natively.
      </p>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>How handoff works</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
          {[
            ['1', 'Your backend calls POST /api/verify/handoff/create with api_key and user_id in the request body'],
            ['2', 'API returns a token (valid for 10 minutes) and an expires_at timestamp'],
            ['3', 'Build a verification URL using the token and display it as a QR code or deep link'],
            ['4', 'User opens the URL on their phone — the hosted page handles all steps'],
            ['5', 'Poll GET /api/verify/handoff/:token/status from your backend until status is "completed"'],
          ].map(([n, text]) => (
            <React.Fragment key={n}>
              <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, fontWeight: 600 }}>{n}.</span>
              <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>{text}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <CodeTabs tab={tab} onChange={setTab}
        curl={`# Create handoff session (api_key in body, not header)
curl -X POST ${apiUrl}/api/verify/handoff/create \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "ik_your_api_key",
    "user_id": "user-uuid"
  }'

# Poll status using the token
curl -X GET ${apiUrl}/api/verify/handoff/TOKEN/status`}
        js={`// Create handoff session from your backend
const handoff = await fetch(\`${apiUrl}/api/verify/handoff/create\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    api_key: 'ik_your_api_key',
    user_id: 'user-uuid',
  }),
}).then(r => r.json());

// Build the verification URL with the token
const verifyUrl = \`https://idswyft.app/user-verification?token=\${handoff.token}\`;

// Display QR code (use any QR library: qrcode, qrcode.react, etc.)
showQrCode(verifyUrl);

// Poll for completion using the token
const pollHandoff = setInterval(async () => {
  const res = await fetch(
    \`${apiUrl}/api/verify/handoff/\${handoff.token}/status\`,
  );
  if (res.status === 410) {
    clearInterval(pollHandoff);
    console.log('Session expired — regenerate token');
    return;
  }
  const status = await res.json();
  if (status.status === 'completed') {
    clearInterval(pollHandoff);
    console.log('Verification complete:', status.result);
  }
}, 3000);`}
        python={`import requests, time

BASE = '${apiUrl}'

# Create handoff session (api_key in body, not header)
handoff = requests.post(f'{BASE}/api/verify/handoff/create',
    json={
        'api_key': 'ik_your_api_key',
        'user_id': 'user-uuid',
    },
).json()

# Build the verification URL with the token
verify_url = f'https://idswyft.app/user-verification?token={handoff["token"]}'
print('Scan this URL:', verify_url)

# Poll for completion using the token
while True:
    time.sleep(3)
    res = requests.get(f'{BASE}/api/verify/handoff/{handoff["token"]}/status')
    if res.status_code == 410:
        print('Session expired — regenerate token')
        break
    status = res.json()
    if status['status'] == 'completed':
        print('Done! Result:', status.get('result'))
        break`} />

      <Pre label="Response  —  handoff/create  (HTTP 201)" code={`{
  "token": "a1b2c3d4e5f6...64-char-hex-token",
  "expires_at": "2026-03-20T10:10:00Z"
}`} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Best practices</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            'HTTPS is required for camera access on mobile browsers',
            'Test on real devices — emulators don\'t support camera APIs',
            'Use a QR library (qrcode, qrcode.react) rather than generating images manually',
            'Handle token expiry (10 min) — show a "Regenerate" button if the user is slow',
            'Set redirect_url to bring the user back to your app after verification',
          ].map(tip => (
            <div key={tip} style={{ fontFamily: C.sans, fontSize: '0.8rem', color: C.muted, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: C.green, fontSize: '0.7rem', marginTop: 3 }}>✓</span> {tip}
            </div>
          ))}
        </div>
      </div>

      {/* ── Guide 3: Building Custom UI ── */}
      <SectionAnchor id="guide-custom-ui" />
      <h3 style={{ fontFamily: C.mono, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 8px' }}>
        <span style={{ color: C.cyan, fontWeight: 400 }}>→</span> Building a Custom Verification UI
      </h3>
      <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
        Patterns and best practices for building your own verification UI on top of the REST API.
      </p>

      <h4 style={{ fontFamily: C.mono, fontSize: '0.85rem', fontWeight: 600, color: C.text, margin: '24px 0 12px' }}>Polling Strategies</h4>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { title: 'Fixed Interval', color: C.amber, pros: 'Simple to implement', cons: 'Wastes requests if processing is slow', code: 'setInterval(() => poll(), 2000)' },
          { title: 'Exponential Backoff', color: C.green, pros: 'Efficient — reduces load over time', cons: 'Slightly slower on fast responses', code: 'delay = min(delay * 1.5, 10s)' },
          { title: 'SDK watch()', color: C.cyan, pros: 'Event-driven, auto-cleanup', cons: 'Requires @idswyft/sdk', code: 'sdk.watch(id).on(\'done\', cb)' },
        ].map(s => (
          <div key={s.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontFamily: C.mono, fontSize: '0.78rem', fontWeight: 600, color: s.color, marginBottom: 8 }}>{s.title}</div>
            <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, marginBottom: 4 }}><span style={{ color: C.green }}>+</span> {s.pros}</div>
            <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, marginBottom: 8 }}><span style={{ color: C.red }}>-</span> {s.cons}</div>
            <code style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.dim }}>{s.code}</code>
          </div>
        ))}
      </div>

      <h4 style={{ fontFamily: C.mono, fontSize: '0.85rem', fontWeight: 600, color: C.text, margin: '24px 0 12px' }}>Progress Indicators</h4>
      <p style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
        Map the <code style={{ fontFamily: C.mono, color: C.cyan }}>status</code> field to user-friendly step labels:
      </p>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '8px 20px' }}>
          {[
            { status: 'AWAITING_FRONT', label: 'Upload your ID (front)', step: '1/4' },
            { status: 'AWAITING_BACK', label: 'Upload your ID (back)', step: '2/4' },
            { status: 'CROSS_VALIDATING', label: 'Verifying document...', step: '2/4' },
            { status: 'AWAITING_LIVE', label: 'Take a photo of yourself', step: '3/4' },
            { status: 'FACE_MATCHING', label: 'Verifying identity...', step: '3/4' },
            { status: 'COMPLETE', label: 'Verification complete!', step: '4/4' },
            { status: 'HARD_REJECTED', label: 'Verification failed', step: '—' },
          ].map(r => (
            <div key={r.status} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: `1px solid ${C.border}`, alignItems: 'center' }}>
              <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, width: 160, flexShrink: 0 }}>{r.status}</code>
              <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.text, flex: 1 }}>{r.label}</span>
              <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.dim }}>{r.step}</code>
            </div>
          ))}
        </div>
      </div>

      <h4 style={{ fontFamily: C.mono, fontSize: '0.85rem', fontWeight: 600, color: C.text, margin: '24px 0 12px' }}>Error Recovery</h4>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '8px 20px' }}>
          {[
            { code: '409 Conflict', action: 'Session was rejected by a gate. Start a new verification session.', color: C.orange },
            { code: '429 Too Many Requests', action: 'Back off and retry after the Retry-After header value.', color: C.amber },
            { code: '400 Bad Request', action: 'Fix the input (wrong file format, missing fields) and retry the same step.', color: C.amber },
            { code: 'Network Error', action: 'Retry with exponential backoff (max 3 retries). The API is idempotent for uploads.', color: C.red },
          ].map(r => (
            <div key={r.code} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.border}`, alignItems: 'flex-start' }}>
              <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: r.color, width: 180, flexShrink: 0 }}>{r.code}</code>
              <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, flex: 1, lineHeight: 1.6 }}>{r.action}</span>
            </div>
          ))}
        </div>
      </div>

      <h4 style={{ fontFamily: C.mono, fontSize: '0.85rem', fontWeight: 600, color: C.text, margin: '24px 0 12px' }}>Displaying OCR Results</h4>
      <Pre label="Parse OCR data from status response" code={`const status = await fetch(
  \`${apiUrl}/api/v2/verify/\${vid}/status\`,
  { headers: { 'X-API-Key': 'your-key' } },
).then(r => r.json());

if (status.ocr_data) {
  const { full_name, date_of_birth, id_number, confidence_scores } = status.ocr_data;

  // Highlight low-confidence fields for manual review
  const LOW_CONFIDENCE = 0.8;
  Object.entries(confidence_scores).forEach(([field, score]) => {
    if (score < LOW_CONFIDENCE) {
      console.warn(\`Low confidence for \${field}: \${score}\`);
      // Show a yellow highlight or "please verify" prompt in your UI
    }
  });
}`} />

      <Callout type="tip">
        For teams that want a pre-built UI, use the{' '}
        <a href="/docs/sdk#embed" style={{ color: C.cyan, textDecoration: 'none', fontFamily: C.mono, fontSize: 'inherit' }}>Embed Component</a>{' '}
        — it provides a complete verification experience you can drop into your app with zero frontend code.
      </Callout>

    </DocLayout>
  );
};
