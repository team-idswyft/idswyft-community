/**
 * Static markdown representation of the Idswyft API documentation.
 * Served at GET /api/docs/markdown for LLM/crawler consumption.
 */
export const API_DOCS_MARKDOWN = `# Idswyft API Documentation

> **Base URL:** \`https://api.idswyft.app\`
> **Version:** v1.2.0 — March 2026

---

## Authentication

Every request must include your API key in the \`X-API-Key\` header.

\`\`\`
X-API-Key: sk_live_your_key
\`\`\`

- **Live keys** (\`sk_live_\`) — production traffic, real verifications
- **Sandbox keys** (\`sk_test_\`) — testing, same pipeline, separate quota

---

## Verification Flow (5 Steps)

The verification pipeline is a 5-step sequence. Each step unlocks the next.

\`\`\`
1. Initialize → 2. Front Doc → 3. Back Doc (+ cross-validation) → 4. Live Capture (+ face match) → 5. Results
\`\`\`

**Hard rejection:** If any gate fails, the session status becomes \`HARD_REJECTED\` and subsequent steps return HTTP 409.

### Step 1: Start Session

\`\`\`
POST /api/v2/verify/initialize
Content-Type: application/json
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | UUID string | Yes | Your unique identifier for the user |
| sandbox | boolean | No | Use sandbox mode (default: false) |
| addons | object | No | Optional add-on features |
| addons.aml_screening | boolean | No | Enable AML/sanctions screening |

**Response (201):**

\`\`\`json
{
  "success": true,
  "verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "AWAITING_FRONT",
  "current_step": 1,
  "total_steps": 5
}
\`\`\`

### Step 2: Upload Front Document

\`\`\`
POST /api/v2/verify/:id/front-document
Content-Type: multipart/form-data
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| document_type | string | Yes | 'passport' \\| 'drivers_license' \\| 'national_id' \\| 'other' |
| document | File | Yes | JPEG, PNG, WebP, or PDF. Max 10 MB |

**Response (201):** Includes \`ocr_data\` with extracted fields and \`confidence_scores\`.

### Step 3: Upload Back Document

\`\`\`
POST /api/v2/verify/:id/back-document
Content-Type: multipart/form-data
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| document_type | string | Yes | Must match Step 2 document_type |
| document | File | Yes | JPEG, PNG, or WebP. Max 10 MB |

**Response (201):** Includes \`barcode_data\` and \`cross_validation_results\` with verdict (PASS/REVIEW), score, and failures.

Cross-validation checks: PDF417/QR barcode decoding, ID number consistency, expiry date matching, photo consistency.

### Step 4: Submit Live Capture

\`\`\`
POST /api/v2/verify/:id/live-capture
Content-Type: multipart/form-data
\`\`\`

One endpoint, two gates, two liveness modes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| selfie | File | Yes | JPEG or PNG image captured live from the user's camera via getUserMedia(). Max 10 MB. Static file uploads will fail liveness. |
| liveness_metadata | JSON string | No | Challenge data for head_turn liveness. Omit for passive mode |

> **Important:** The selfie must be a live camera capture, not a file upload. The liveness engine runs anti-spoofing checks on every image -- even in passive mode. A static photo uploaded from disk will fail with ${'`'}LIVENESS_FAILED${'`'} because it lacks camera EXIF metadata and has re-compression artifacts. Always use ${'`'}getUserMedia()${'`'} to capture directly from the device camera.

#### Liveness Modes

| Mode | challenge_type | Security | Best For |
|------|---------------|----------|----------|
| Passive | _(omit metadata)_ | Basic | Low-risk onboarding, sandbox |
| Head Turn | \`head_turn\` | Strong | All production identity verification |

**Head-turn metadata shape:**

\`\`\`json
{
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
}
\`\`\`

Zero ML dependencies on the client \u2014 just \`getUserMedia()\` + \`canvas.toDataURL()\`. The server handles all face detection and yaw estimation.

> **Note:** Invalid liveness_metadata returns HTTP 400 with a \`VALIDATION_ERROR\` code. It does not silently fall back to passive mode. Always check your metadata format matches the schema above.

**Response (201):**

\`\`\`json
{
  "success": true,
  "verification_id": "...",
  "status": "COMPLETE",
  "face_match_results": {
    "passed": true,
    "similarity_score": 0.94,
    "threshold_used": 0.6
  },
  "liveness_results": {
    "liveness_passed": true,
    "liveness_score": 0.96,
    "liveness_mode": "head_turn"
  },
  "final_result": "verified"
}
\`\`\`

### Step 5: Get Results

\`\`\`
GET /api/v2/verify/:id/status
\`\`\`

Returns the full verification record: OCR data, cross-validation, liveness, face match, AML screening, and final decision.

**Polling conditions:**

| After | Poll until | Then |
|-------|-----------|------|
| Step 2 (front doc) | \`ocr_data\` is not null | Proceed to Step 3 |
| Step 3 (back doc) | \`cross_validation_results\` is not null | If not failed, proceed to Step 4 |
| Step 4 (live capture) | \`final_result\` is not null | Verification complete |

---

## Integration Options

Three ways to add identity verification — from zero-code to full control. All use the same hosted page:

\`\`\`
https://idswyft.app/user-verification
\`\`\`

### Option 1: Redirect (Easiest)

Send users to the hosted page with a link or redirect. After verification, they return to your \`redirect_url\`.

\`\`\`javascript
window.location.href = 'https://idswyft.app/user-verification'
  + '?api_key=sk_live_xxx'
  + '&user_id=user-123'
  + '&redirect_url=' + encodeURIComponent('https://yourapp.com/done')
  + '&theme=dark';
\`\`\`

**Redirect callback parameters:** When verification completes, the user is redirected to your \`redirect_url\` with these query parameters appended:

| Parameter | Type | Description |
|-----------|------|-------------|
| verification_id | UUID string | The verification session ID. Use this to fetch full results via \`GET /api/v2/verify/:id/status\` |
| status | string | Result status: \`verified\`, \`failed\`, or \`manual_review\`. If \`manual_review\`, poll the status endpoint or listen for a webhook to get the final decision |
| user_id | string | The user_id you passed when starting verification |

**Example:** handling the redirect callback on your page:

\`\`\`javascript
// On your redirect_url page (e.g. https://yourapp.com/done)
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
}
\`\`\`

### Option 2: Iframe Embed (No SDK needed)

Embed the hosted page inside your app. Users never leave your site.

\`\`\`html
<iframe
  src="https://idswyft.app/user-verification?api_key=sk_live_xxx&user_id=user-123&theme=dark"
  width="100%" height="700" frameborder="0"
  allow="camera; microphone"
  style="border: none; border-radius: 8px;"
></iframe>
\`\`\`

> **Important:** The iframe requires \`allow="camera; microphone"\` for liveness detection to work.

### Option 3: SDK Embed (Recommended for SPAs)

Use the \`@idswyft/sdk\` IdswyftEmbed component for modal or inline mode with event callbacks. See the Embed Component section below.

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| api_key | string | Yes | Your API key |
| user_id | UUID | Yes | User identifier |
| redirect_url | URL | No | Where to redirect after completion. Required for redirect; optional for iframe/embed |
| theme | 'light' \\| 'dark' | No | UI theme (default: dark) |
| address_verif | 'true' | No | Enable address verification step |

### Custom API (Full Control)

Build your own UI using the REST API directly. See the Verification Flow section above.

---

## Guides

### End-to-End Tutorial

Complete walkthrough with exponential backoff polling:

\`\`\`javascript
async function pollStatus(vid, apiKey, baseUrl, { condition, maxAttempts = 60 } = {}) {
  let delay = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(ok => setTimeout(ok, delay));
    const res = await fetch(${'`'}${'${'}baseUrl}/api/v2/verify/${'${'}vid}/status${'`'}, {
      headers: { 'X-API-Key': apiKey },
    });
    const data = await res.json();
    if (data.final_result === 'failed') throw new Error(data.failure_reason);
    if (condition(data)) return data;
    delay = Math.min(delay * 1.5, 10000);
  }
  throw new Error('Polling timed out');
}
\`\`\`

### Mobile Handoff

Let users start on desktop and continue on mobile:

1. \`POST /api/verify/handoff/create\` with \`api_key\` and \`user_id\` in request body — returns \`token\` (10-min expiry) + \`expires_at\`
2. Build a verification URL with the token and display as a QR code
3. User opens on mobile — hosted page handles verification
4. Poll \`GET /api/verify/handoff/:token/status\` until \`status\` is \`completed\`

> **Note:** Handoff uses \`api_key\` in the request body, not the \`X-API-Key\` header. Expired sessions return HTTP 410.

### Building Custom UI

**Error recovery:**

| HTTP Code | Action |
|-----------|--------|
| 409 Conflict | Session rejected — start new verification |
| 429 Too Many Requests | Back off per Retry-After header |
| 400 Bad Request | Fix input and retry same step |
| Network Error | Retry with exponential backoff (max 3) |

**Status → UI mapping:**

| Status | User-Facing Label | Step |
|--------|-------------------|------|
| AWAITING_FRONT | Upload your ID (front) | 1/4 |
| AWAITING_BACK | Upload your ID (back) | 2/4 |
| CROSS_VALIDATING | Verifying document... | 2/4 |
| AWAITING_LIVE | Take a photo of yourself | 3/4 |
| FACE_MATCHING | Verifying identity... | 3/4 |
| COMPLETE | Verification complete! | 4/4 |
| HARD_REJECTED | Verification failed | — |

---

## JavaScript SDK

\`\`\`bash
npm install @idswyft/sdk
\`\`\`

\`\`\`javascript
const { IdswyftSDK } = require('@idswyft/sdk');

const sdk = new IdswyftSDK({
  apiKey: 'sk_live_your_key',
  baseURL: 'https://api.idswyft.app',
  sandbox: false,
});
\`\`\`

### SDK Methods

| Method | Returns | Description |
|--------|---------|-------------|
| startVerification() | InitializeResponse | Create new session |
| uploadFrontDocument() | VerificationResult | Upload front of ID |
| uploadBackDocument() | VerificationResult | Upload back of ID |
| uploadSelfie() | VerificationResult | Submit live capture |
| getVerificationStatus() | VerificationResult | Get session status |
| watch() | EventEmitter | Real-time event stream |
| createBatch() | BatchJobResponse | Create batch job |
| uploadAddressDocument() | AddressResult | Upload proof-of-address |

### Real-Time Events with watch()

\`\`\`javascript
const watcher = sdk.watch(verificationId);
watcher.on('status_changed', (e) => console.log(e.status));
watcher.on('verification_complete', (e) => console.log(e.data.final_result));
watcher.on('verification_failed', (e) => console.log(e.data.rejection_reason));
watcher.destroy(); // cleanup
\`\`\`

---

## Embed Component

Drop a complete verification UI into your app:

\`\`\`javascript
import { IdswyftEmbed } from '@idswyft/sdk';

const embed = new IdswyftEmbed({ mode: 'modal', theme: 'dark' });
embed.open(sessionToken, {
  onComplete: (result) => console.log(result.finalResult),
  onError: (error) => console.error(error.message),
});
\`\`\`

Modes: \`modal\` (full-screen overlay) or \`inline\` (fits your container).

---

## Analysis Engine

| Category | Capabilities |
|----------|-------------|
| OCR Extraction | PaddleOCR/Tesseract, name/DOB/ID number, AAMVA parsing, per-field confidence |
| Document Quality | Blur detection, brightness/contrast, resolution check (≥800x600), auto-reject |
| Cross-Validation | PDF417/QR decode, Levenshtein matching, front-back consistency, weighted scoring |
| Liveness & Face Match | EXIF metadata, JPEG artifacts, color histogram, byte entropy, pixel variance, edge density, face detection (SSDMobilenetv1), 128-d embeddings, cosine similarity |

---

## Batch Verification

Process hundreds of verifications at once.

\`\`\`
POST /api/v2/batch/upload          — Create batch job
GET  /api/v2/batch/:id/status      — Get batch progress
GET  /api/v2/batch/:id/results     — Get batch results
POST /api/v2/batch/:id/cancel      — Cancel batch job
\`\`\`

---

## Address Verification

Verify proof-of-address documents (utility bills, bank statements). Requires completed identity verification.

\`\`\`
POST /api/v2/verify/:id/address-document    — Upload address document
GET  /api/v2/verify/:id/address-status      — Get address status
\`\`\`

---

## AML / Sanctions Screening

Opt-in addon — enable per session with \`addons.aml_screening: true\`.

| Risk Level | Score | Outcome |
|-----------|-------|---------|
| clear | < 0.5 | Verification proceeds |
| potential_match | 0.5–0.84 | Routed to manual_review |
| confirmed_match | ≥ 0.85 | Hard reject (failed) |

Lists checked: OFAC SDN, EU Sanctions, UN Sanctions.

---

## Monitoring & Re-verification

\`\`\`
POST /api/v2/monitoring/schedules              — Create re-verification schedule
GET  /api/v2/monitoring/expiring-documents      — List expiring documents
\`\`\`

Webhook events: \`document.expiring\`, \`document.expired\`, \`reverification.due\`.

---

## Verification Statuses

| Status | Description | Terminal |
|--------|-------------|----------|
| AWAITING_FRONT | Waiting for front document | No |
| AWAITING_BACK | Front processed, waiting for back | No |
| CROSS_VALIDATING | Running cross-validation | No |
| AWAITING_LIVE | Cross-val passed, waiting for selfie | No |
| FACE_MATCHING | Running liveness + face match | No |
| COMPLETE | All gates passed | Yes |
| HARD_REJECTED | Rejected by a gate | Yes |

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Per developer key | 1,000 req/hour |
| Per user | 5 verifications/hour |
| Enterprise | Custom |

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200/201 | Success |
| 400 | Bad request — validation error |
| 401 | Unauthorized — invalid API key |
| 404 | Verification not found |
| 409 | Conflict — session hard-rejected |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Changelog

### v1.2.0 (2026-03-20)

**Changed:**
- Liveness system: removed dead MediaPipe code path, renamed MultiFrame → HeadTurn
- Malformed liveness_metadata now returns HTTP 400 (VALIDATION_ERROR) instead of silently falling back to passive mode
- Removed legacy multi_frame_color challenge type alias — only head_turn is accepted
- color_sequence field is now optional (clients no longer need to send it)

### v1.1.0 (2026-03-19)

**Added:**
- Visual authenticity checks (FFT, color distribution, deepfake detection)
- Webhook resend endpoint
- Per-API-key scoping for webhooks
- AML/sanctions screening addon
- Email OTP + GitHub OAuth authentication
- US driver's license format validator

**Fixed:**
- NULL events column filtering out webhook deliveries
- Per-provider metrics derived from results JSONB
- OTP security hardening

### v1.0.0 (2025-12-01)

**Added:**
- Initial release — document OCR, face matching, verification pipeline
- RESTful API, API key management, webhook system, sandbox environment

---

## Support

- **Developer Portal:** https://idswyft.app/developer
- **Live Demo:** https://idswyft.app/demo
- **SDK:** npm install @idswyft/sdk
- **GitHub:** https://github.com/doobee46/idswyft
- **Email:** support@idswyft.app

---

*Generated from Idswyft API v1.2.0 — https://idswyft.app/doc*
`;
