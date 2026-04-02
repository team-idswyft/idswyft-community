/**
 * Static markdown representation of the Idswyft API documentation.
 * Served at GET /api/docs/markdown for LLM/crawler consumption.
 */
export const API_DOCS_MARKDOWN = `# Idswyft API Documentation

> **Base URL:** \`https://api.idswyft.app\`
> **Version:** v1.7.3 — April 2026

---

## Authentication

Every request must include your API key in the \`X-API-Key\` header.

\`\`\`
X-API-Key: ik_your_api_key
\`\`\`

All API keys use the \`ik_\` prefix. Sandbox mode is determined by the key's configuration, not its prefix:

- **Production keys** — real verifications, production traffic
- **Sandbox keys** — testing, same pipeline, separate quota

### Developer Authentication

Developers authenticate via passwordless email OTP:

1. \`POST /api/auth/developer/otp/send\` — send OTP to registered email
2. \`POST /api/auth/developer/otp/verify\` — verify OTP, receive JWT (7-day expiry)
3. Include JWT as \`Authorization: Bearer <token>\` for developer portal endpoints

GitHub OAuth is also supported as an alternative login method.

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
| addons.aml_screening | boolean | No | Override AML screening (default: auto-enabled when \`AML_PROVIDER\` is configured; set \`false\` to disable for this session) |
| verification_mode | string | No | Flow preset: \`'full'\` (default), \`'document_only'\`, \`'identity'\`, or \`'age_only'\`. See Verification Flows below |
| age_threshold | integer | No | Minimum age required (1-99, default: 18). Only used when \`verification_mode\` is \`'age_only'\` |

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

### Verification Flows (Custom Gate Pipeline)

The \`verification_mode\` parameter controls which gates run per session. Choose a preset at initialization:

| Preset | Gates Run | Steps | Use Case |
|--------|----------|-------|----------|
| \`full\` (default) | Front → Back → CrossVal → Liveness → FaceMatch [→ AML] | 5 | Full identity verification |
| \`document_only\` | Front → Back → CrossVal | 3 | Compliance document checks, no biometric |
| \`identity\` | Front → Liveness → FaceMatch | 3 | Quick identity check — no back doc, no crossval |
| \`age_only\` | Front (DOB extraction + age check) | 1 | Age-gated content |

**Endpoint guards per flow:**

- \`document_only\` / \`age_only\`: Calling \`POST /:id/live-capture\` returns HTTP 400
- \`identity\` / \`age_only\`: Calling \`POST /:id/back-document\` returns HTTP 400

**Final result determination per flow:**

| Flow | Result Based On |
|------|----------------|
| \`full\` | Cross-validation verdict + face match |
| \`document_only\` | Cross-validation verdict only (PASS → verified, REVIEW → manual_review) |
| \`identity\` | Face match only (no crossval data) |
| \`age_only\` | DOB extraction + age threshold check |

**Example: Document-only verification:**

\`\`\`json
{
  "user_id": "...",
  "verification_mode": "document_only"
}
\`\`\`

Flow: Initialize → Front Doc → Back Doc (+ cross-validation) → Complete (3 steps, no liveness).

**Example: Identity verification:**

\`\`\`json
{
  "user_id": "...",
  "verification_mode": "identity"
}
\`\`\`

Flow: Initialize → Front Doc → Live Capture (+ face match) → Complete (3 steps, no back doc).

### Alternative: Re-verify a Returning User

For returning users who have already been verified, use the re-verification endpoint to perform a liveness-only re-check instead of the full 5-step flow.

\`\`\`
POST /api/v2/verify/re-verify
Content-Type: application/json
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | UUID string | Yes | Same user_id used in the original verification |
| previous_verification_id | UUID string | Yes | ID of a previously completed verification (status must be \`verified\`) |
| source | string | No | 'api' \\| 'vaas' \\| 'demo' (default: 'api') |

**Response (201):**

\`\`\`json
{
  "success": true,
  "verification_id": "660e8400-e29b-41d4-a716-446655440002",
  "parent_verification_id": "550e8400-e29b-41d4-a716-446655440001",
  "verification_mode": "liveness_only",
  "status": "AWAITING_LIVE",
  "current_step": 4,
  "total_steps": 5,
  "message": "Re-verification initialized — ready to upload live capture (liveness-only mode)"
}
\`\`\`

**Two modes based on face embedding availability:**

| Mode | \`verification_mode\` | Starting Step | When |
|------|----------------------|---------------|------|
| Liveness-only | \`liveness_only\` | \`AWAITING_LIVE\` (step 4) | Face embedding from parent is still available |
| Document refresh | \`document_refresh\` | \`AWAITING_FRONT\` (step 1) | Face embedding was GDPR-stripped — user re-uploads front doc, then skips back doc + cross-validation |

**Constraints:**
- Parent verification must have \`status: "verified"\`
- Parent must belong to the same developer and user
- Cannot chain re-verifications — parent must be a full (\`verification_mode: "full"\`) verification
- After initialization, proceed to \`POST /api/v2/verify/:id/live-capture\` (liveness_only) or \`POST /api/v2/verify/:id/front-document\` (document_refresh)

### Alternative: Age Verification (18+/21+ Check)

For age-gated use cases (alcohol delivery, cannabis, gambling), use age-only mode to extract DOB from a document and check against an age threshold — no face match, no liveness, no back document.

**Two-step flow:**

1. Initialize with \`verification_mode: 'age_only'\`
2. Upload front document — OCR extracts DOB, age is checked, session auto-completes

\`\`\`
POST /api/v2/verify/initialize
Content-Type: application/json

{
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "verification_mode": "age_only",
  "age_threshold": 21
}
\`\`\`

**Response (201):**

\`\`\`json
{
  "success": true,
  "verification_id": "770e8400-e29b-41d4-a716-446655440003",
  "status": "AWAITING_FRONT",
  "current_step": 1,
  "total_steps": 1,
  "verification_mode": "age_only",
  "age_threshold": 21
}
\`\`\`

Then upload the front document as usual (\`POST /api/v2/verify/:id/front-document\`). The response includes:

\`\`\`json
{
  "success": true,
  "verification_id": "770e8400-e29b-41d4-a716-446655440003",
  "status": "COMPLETE",
  "current_step": 1,
  "age_verification": {
    "is_of_age": true,
    "age_threshold": 21
  },
  "final_result": "verified"
}
\`\`\`

**Privacy:** The response never includes the actual date of birth — only \`is_of_age\` (boolean) and \`age_threshold\` (integer).

**Rejection reasons:**
- \`DOB_NOT_FOUND\` — date of birth could not be extracted from the document
- \`UNDERAGE\` — subject does not meet the minimum age requirement

**Webhook:** Fires \`verification.age_check\` event on completion.

### Step 2: Upload Front Document

\`\`\`
POST /api/v2/verify/:id/front-document
Content-Type: multipart/form-data
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| document_type | string | No | 'passport' \\| 'drivers_license' \\| 'national_id' \\| 'other' \\| 'auto'. Defaults to 'auto' (auto-detect from OCR text). If provided explicitly, the given type is used with confidence 1.0 |
| document | File | Yes | JPEG, PNG, WebP, or PDF. Max 10 MB |
| country_code | string | No | ISO 3166-1 alpha-2 country code (e.g. 'US', 'GB'). Improves OCR accuracy for international documents |

**Response (201):** Includes \`ocr_data\` with extracted fields (name, DOB, document number, expiry, address) and \`confidence_scores\` per field. Also includes \`detected_document_type\` (the auto-detected or user-specified document type) and \`classification_confidence\` (0.50–1.0 indicating detection reliability). Auto-classification signals: MRZ patterns (TD1/TD2/TD3), keyword matching (PASSPORT, DRIVER LICENSE, NATIONAL ID), and field-pattern heuristics (AAMVA codes, DL tokens).

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

Cross-validation checks: PDF417/QR barcode decoding, MRZ parsing (TD1/TD2/TD3 for international IDs), ID number consistency, expiry date matching, name matching with Levenshtein distance and token-set similarity, address matching (supplementary — word-overlap scoring with abbreviation normalization, does not affect verdict).

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

> **Important:** The selfie must be a live camera capture, not a file upload. The liveness engine runs anti-spoofing checks on every image — even in passive mode. A static photo uploaded from disk will fail with ${'`'}LIVENESS_FAILED${'`'} because it lacks camera EXIF metadata and has re-compression artifacts. Always use ${'`'}getUserMedia()${'`'} to capture directly from the device camera.

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

Zero ML dependencies on the client — just \`getUserMedia()\` + \`canvas.toDataURL()\`. The server handles all face detection and yaw estimation.

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

## Optional: Phone OTP Verification

Add SMS-based phone verification as an optional step during any verification session. Requires the developer to configure their own SMS provider (Twilio or Vonage) via the Developer Settings API.

### Configure SMS Provider

\`\`\`
PUT /api/developer/settings/sms
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`provider\` | string | Yes | \`twilio\` or \`vonage\` (send \`null\` to clear) |
| \`api_key\` | string | Yes | Twilio Account SID / Vonage API key |
| \`api_secret\` | string | Yes | Twilio Auth Token / Vonage API secret |
| \`phone_number\` | string | Yes | Sender phone in E.164 format (e.g. \`+15551234567\`) |

Credentials are encrypted at rest (AES-256-GCM). When no SMS provider is configured, the OTP code is returned in the API response for self-hosted/testing use.

### Send Phone OTP

\`\`\`
POST /api/v2/verify/:id/phone-otp/send
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`phone_number\` | string | Yes | Recipient phone in E.164 format |

**Rate limit:** 3 codes per session per hour. Code expires after 10 minutes.

### Verify Phone OTP

\`\`\`
POST /api/v2/verify/:id/phone-otp/verify
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`code\` | string | Yes | 6-digit verification code |

**Response:** \`{ "success": true, "phone_verified": true }\`

Max 3 attempts per code. After exhaustion, request a new code.

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
  + '?api_key=ik_your_key'
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
  src="https://idswyft.app/user-verification?api_key=ik_your_key&user_id=user-123&theme=dark"
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

## Mobile Handoff

Let users start on desktop and continue on mobile. Useful when the desktop lacks a camera.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/api/verify/handoff/create\` | Create handoff session (body: \`api_key\`, \`user_id\`) |
| GET | \`/api/verify/handoff/:token/status\` | Poll session status from desktop |
| PATCH | \`/api/verify/handoff/:token/link\` | Link a verification_id to the handoff session (mobile calls this) |

### Flow

1. Desktop calls \`POST /api/verify/handoff/create\` with \`api_key\` and \`user_id\` in request body — returns \`token\` (30-min expiry) + \`expires_at\`
2. Build a verification URL with the token and display as a QR code
3. User scans QR on mobile — hosted page handles verification
4. Mobile links the verification to the handoff session via \`PATCH /api/verify/handoff/:token/link\`
5. Desktop polls \`GET /api/verify/handoff/:token/status\` until \`status\` is \`completed\`
6. Status response includes \`verification_id\` for fetching full results

> **Note:** Handoff uses \`api_key\` in the request body, not the \`X-API-Key\` header. Expired sessions return HTTP 410.

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
  apiKey: 'ik_your_api_key',
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
| createMonitoringSchedule() | ScheduleResponse | Create re-verification schedule |

### Real-Time Events with watch()

\`\`\`javascript
const watcher = sdk.watch(verificationId);
watcher.on('status_changed', (e) => console.log(e.status));
watcher.on('step_completed', (e) => console.log(e.step, e.data));
watcher.on('verification_complete', (e) => console.log(e.data.final_result));
watcher.on('verification_failed', (e) => console.log(e.data.rejection_reason));
watcher.on('error', (e) => console.error(e.message));
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
  onStepChange: (step) => console.log('Step:', step),
  onClose: () => console.log('Embed closed'),
});
\`\`\`

### Modes

| Mode | Description |
|------|-------------|
| \`modal\` | Full-screen overlay with backdrop. Closes on backdrop click (configurable) |
| \`inline\` | Fits your container. Set \`container\` option to a DOM element |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| mode | 'modal' \\| 'inline' | 'modal' | Display mode |
| container | HTMLElement | — | Required for inline mode |
| theme | 'light' \\| 'dark' | 'dark' | UI theme |
| width | string | '100%' | Container width (inline mode) |
| height | string | '700px' | Container height (inline mode) |
| closeOnBackdropClick | boolean | true | Allow closing modal by clicking backdrop |
| verificationUrl | string | 'https://idswyft.app' | Override verification page URL |

## React Component

Drop-in React component for SPAs. Install:

\`\`\`bash
npm install @idswyft/react
\`\`\`

### Component Usage

\`\`\`tsx
import { IdswyftVerification } from '@idswyft/react';

function App() {
  return (
    <IdswyftVerification
      apiKey="ik_your_api_key"
      userId="user-123"
      mode="modal"
      theme="dark"
      onComplete={(result) => console.log('Verified!', result.finalResult)}
      onError={(error) => console.error(error.message)}
      onClose={() => setShowVerification(false)}
    />
  );
}
\`\`\`

### Hook Usage

\`\`\`tsx
import { useIdswyftVerification } from '@idswyft/react';

function VerifyButton() {
  const { open, isOpen, result } = useIdswyftVerification({
    apiKey: 'ik_your_api_key',
  });

  return (
    <>
      <button onClick={() => open('user-123')}>Verify Identity</button>
      {result && <p>Result: {result.finalResult}</p>}
    </>
  );
}
\`\`\`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| apiKey | string | — | API key (required) |
| userId | string | — | User ID (required) |
| mode | 'modal' \\| 'inline' | 'inline' | Display mode |
| theme | 'light' \\| 'dark' | 'dark' | UI theme |
| documentType | string | — | Limit to specific document type |
| onComplete | function | — | Called when verification succeeds |
| onError | function | — | Called on error |
| onStepChange | function | — | Called on step progress |
| onClose | function | — | Called when user closes modal |

Works with Next.js, Vite, and Create React App. Requires React 17+.

---

## Analysis Engine

All verification decisions are **deterministic** — no LLMs or probabilistic models are used for pass/fail decisions. LLMs are only used for OCR text extraction behind a provider interface.

| Category | Capabilities |
|----------|-------------|
| OCR Extraction | PaddleOCR/Tesseract, name/DOB/ID number, AAMVA field parsing (US DLs), MRZ parsing (TD1/TD2/TD3 for international IDs), state format validation, per-field confidence scores, multi-language awareness (Latin scripts fully supported; Cyrillic/Arabic/CJK/Devanagari/Thai detection with custom model support) |
| Document Quality | Sobel edge blur detection, brightness/contrast stats, resolution check (≥800x600), file size validation, overall quality score, auto-reject below threshold |
| Cross-Validation | PDF417/QR barcode decode, MRZ parsing, Levenshtein distance matching, token-set name similarity, front OCR vs back barcode/MRZ check, date & ID number consistency, weighted field scoring, address cross-validation (supplementary) |
| Liveness & Face Match | EXIF metadata analysis, JPEG artifact detection, color histogram analysis, byte entropy scoring, pixel variance & edge density, face detection (SSDMobilenetv1), 128-d face embeddings, cosine similarity scoring, deepfake detection |

---

## Batch Verification

Process hundreds of verifications at once. Batch mode runs the full pipeline (OCR, barcode/MRZ extraction, quality gates, cross-validation) but skips live capture — verifications end at \`manual_review\` status for human decision.

\`\`\`
POST /api/v2/batch/upload          — Create batch job (multipart CSV + document URLs)
GET  /api/v2/batch/:id/status      — Get batch progress (items completed/failed/pending)
GET  /api/v2/batch/:id/results     — Get batch results (per-item status and extracted data)
POST /api/v2/batch/:id/cancel      — Cancel batch job
\`\`\`

Items that fail quality gates are marked as \`failed\` with a rejection reason. Passed items are set to \`manual_review\` for human decision via the Review Dashboard.

---

## Address Verification

Verify proof-of-address documents (utility bills, bank statements). Requires a completed identity verification session.

\`\`\`
POST /api/v2/verify/:id/address-document    — Upload address document
GET  /api/v2/verify/:id/address-status      — Get address verification status
\`\`\`

---

## AML / Sanctions Screening

AML screening runs automatically on all non-sandbox verifications when the \`AML_PROVIDER\` environment variable is set (e.g., \`opensanctions\`, \`offline\`, or comma-separated for multiple providers). Screening happens after face matching (Gate 6) and results are persisted to the \`aml_screenings\` table.

**Configuration:**
- \`AML_PROVIDER=opensanctions\` — OpenSanctions API
- \`AML_PROVIDER=offline\` — local offline list
- \`AML_PROVIDER=opensanctions,offline\` — both run in parallel, results merged
- Developers can opt out via \`aml_enabled: false\` on their developer record
- Per-session override: \`addons.aml_screening: false\` disables for that session

| Risk Level | Risk Score | Outcome |
|-----------|-----------|---------|
| clear | 0 | Verification proceeds normally |
| potential_match | 60 | Routed to \`manual_review\` for human decision |
| confirmed_match | 100 | Hard reject (\`failed\`) |

The \`aml_screening\` field in the status response includes: \`risk_level\`, \`match_found\`, \`match_count\`, \`matches\` (array with \`listed_name\`, \`list_source\`, \`score\`, \`match_type\`), \`lists_checked\`, \`screened_name\`, \`screened_dob\`, and \`screened_at\`.

AML contributes 10% weight to the composite risk score (factor: \`aml_screening\`).

Lists checked: OFAC SDN, EU Sanctions, UN Sanctions (depends on configured provider).

---

## Monitoring & Re-verification

Schedule automatic re-verification for expiring documents.

\`\`\`
POST /api/v2/monitoring/schedules              — Create re-verification schedule
GET  /api/v2/monitoring/expiring-documents      — List expiring documents
\`\`\`

Webhook events: \`document.expiry_warning\`, \`verification.reverification_due\`.

---

## Review Dashboard

A web-based admin interface at \`/admin/verifications\` for reviewing, approving, and rejecting identity verifications. No code required — integrate the API, then use the dashboard for manual review decisions.

### Access & Roles

Developers invite team members from the Developer Portal (Settings → Team Management). Team members access the dashboard at \`/admin/login\` via passwordless OTP. Developers themselves do not access the Review Dashboard — they manage API keys in the Developer Portal and delegate verification review to their team.

Two roles exist for the Review Dashboard:

| Role | Capabilities |
|------|-------------|
| **Organization Admin** | Approve, reject, **override** verifications. Access analytics, manage GDPR erasure, manage team. |
| **Reviewer** | Approve or reject verifications only. Cannot override, access analytics, or manage GDPR. |

Both roles are scoped to the developer's verifications and sign in via OTP. A role badge in the dashboard header shows the user's access level.

### Team Management

Developers manage their team from the Developer Portal:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/api/developer/reviewers/invite\` | Invite a team member by email (body: \`email\`, \`name?\`, \`role?\`) |
| GET | \`/api/developer/reviewers\` | List all team members |
| DELETE | \`/api/developer/reviewers/:id\` | Revoke a team member's access |

The \`role\` parameter accepts \`'reviewer'\` (default) or \`'admin'\`.

Team member OTP authentication:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/api/auth/reviewer/otp/send\` | Send OTP to team member email (rate limited: 5/15min per IP) |
| POST | \`/api/auth/reviewer/otp/verify\` | Verify OTP, receive developer-scoped JWT with role claim (24h expiry) |

Team members can only see verifications belonging to the developer who invited them. They cannot access API keys, billing, or other developers' data.

### Dashboard Features

- **Stats bar** — real-time counts: total, review, pending, verified, failed (5 cards)
- **Role badge** — shows Organization Admin, Reviewer, or Platform Admin in the header
- **Filterable table** — columns: Preview, Verification ID, User ID, Status, Doc Type, Created, Actions
- **Status filter tabs** — All, Manual Review, Pending, Verified, Failed
- **Expandable detail panel** — document images, OCR data, cross-validation results, face match score, gate analysis with score bars, risk assessment with AML screening
- **Search** — search by verification ID or user ID

### Review Actions

| Action | Description | Webhook Event |
|--------|-------------|---------------|
| **Approve** | Sets status to \`verified\`. Decision is final. | \`verification.verified\` |
| **Reject** | Sets status to \`failed\`. Optional reason included in webhook. | \`verification.failed\` |
| **Override** | Sets any status (**Organization Admin only**). Reason required. | \`verification.status_changed\` |

All actions require a confirmation dialog. All actions are logged in the audit trail. Webhook notifications fire immediately after a decision.

### Admin Verification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/admin/verifications?status=&page=&limit=\` | List verifications with pagination and status filter |
| GET | \`/api/admin/verification/:id\` | Detail view with documents array, selfie URL, OCR data |
| PUT | \`/api/admin/verification/:id/review\` | Submit review decision (body: \`decision\`, \`reason?\`, \`new_status?\`) |
| GET | \`/api/admin/dashboard\` | Stats: total, pending, verified, failed, manual_review counts |

---

## Webhooks

Register webhook URLs to receive real-time notifications when verification events occur.

### Webhook Events

| Event | Trigger |
|-------|---------|
| \`verification.verified\` | Verification approved (automated or manual) |
| \`verification.failed\` | Verification failed or rejected |
| \`verification.status_changed\` | Status override from Review Dashboard |
| \`document.expiry_warning\` | Document approaching or past expiry (alert_type: 90_day, 60_day, 30_day, expired) |
| \`verification.reverification_due\` | Scheduled re-verification is due |
| \`verification.age_check\` | Age-only verification completed (includes \`age_verification\` in payload data) |

### Webhook Security

All webhooks are signed with HMAC-SHA256 using your webhook secret. Verify the \`X-Webhook-Signature\` header to confirm authenticity.

### Webhook Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/api/developer/webhooks\` | Register a webhook URL |
| GET | \`/api/developer/webhooks\` | List registered webhooks |
| DELETE | \`/api/developer/webhooks/:id\` | Delete a webhook |
| GET | \`/api/developer/webhooks/:id/deliveries\` | View delivery logs |
| POST | \`/api/developer/webhooks/:id/deliveries/:did/resend\` | Resend a failed delivery |

Webhooks retry up to 3 times on failure with exponential backoff.

---

## Verification Statuses

| Status | Description | Terminal |
|--------|-------------|----------|
| AWAITING_FRONT | Waiting for front document upload | No |
| AWAITING_BACK | Front processed, waiting for back document | No |
| CROSS_VALIDATING | Running cross-validation checks | No |
| AWAITING_LIVE | Cross-validation passed, waiting for live capture | No |
| FACE_MATCHING | Running liveness detection + face match | No |
| COMPLETE | All gates passed — verification successful | Yes |
| HARD_REJECTED | Rejected by a gate — verification failed | Yes |

**Final result values** (returned in \`final_result\` field):

| Value | Description |
|-------|-------------|
| \`verified\` | Identity confirmed by automated pipeline or manual approval |
| \`failed\` | Verification failed — document unreadable, face mismatch, or manually rejected |
| \`manual_review\` | Automated checks flagged something — requires human review via the Review Dashboard |

---

## Rate Limits

| Scope | Cloud Edition | Self-Hosted |
|-------|--------------|-------------|
| Per developer key | 1,000 req/hour | None by default (configurable) |
| Per user | 5 verifications/hour | None by default (configurable) |
| Monthly verification quota | 50/month (Starter) | Unlimited |

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200/201 | Success |
| 400 | Bad request — validation error |
| 401 | Unauthorized — invalid or missing API key |
| 404 | Verification not found |
| 409 | Conflict — session hard-rejected, cannot proceed |
| 410 | Gone — handoff session expired |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Self-Hosted / Community Edition

Idswyft is open source and can be self-hosted using Docker Compose.

### Quick Start

\`\`\`bash
git clone https://github.com/team-idswyft/idswyft.git
cd idswyft
./install.sh     # Interactive setup — generates .env and starts containers
\`\`\`

### Architecture

Four Docker containers:

| Container | Purpose | Port |
|-----------|---------|------|
| postgres | PostgreSQL database | 5432 |
| engine | ML verification engine (OCR, face detection, liveness, deepfake) | 3002 |
| api | Express API server — orchestrates verifications | 3001 |
| frontend | Nginx serving the React app | 80 |

The engine worker handles all ML-heavy processing (TensorFlow, ONNX, PaddleOCR) in isolation. The API server communicates with the engine via HTTP (\`ENGINE_URL\` env var).

### First-Run Setup

On first boot, navigate to the frontend. If no developer account exists, a setup wizard guides you through creating the first account and API key — no OTP required for the initial setup.

---

## Changelog

### v1.8.1 (2026-04-02)

**Added:**
- Custom verification flows — \`verification_mode\` parameter now supports \`'document_only'\` and \`'identity'\` presets
- \`document_only\`: Front → Back → CrossVal (3 steps, no biometric)
- \`identity\`: Front → Liveness → FaceMatch (3 steps, no back document or cross-validation)
- Endpoint guards: back-document returns 400 for identity/age_only flows; live-capture returns 400 for document_only/age_only flows
- \`verification_mode\` and \`total_steps\` included in all endpoint responses
- Per-flow step maps in status responses for accurate progress tracking

### v1.7.3 (2026-04-01)

**Added:**
- Age verification mode (\`verification_mode: 'age_only'\`) — lightweight 18+/21+ age check using front document OCR only
- \`age_threshold\` parameter (1-99) on initialize endpoint
- \`age_verification\` response object with \`is_of_age\` boolean (DOB never exposed)
- \`verification.age_check\` webhook event
- New rejection reasons: \`DOB_NOT_FOUND\`, \`UNDERAGE\`

### v1.7.2 (2026-03-30)

**Added:**
- AML screening auto-trigger — runs automatically on all non-sandbox verifications when \`AML_PROVIDER\` is set (no longer requires \`addons.aml_screening: true\`)
- Multi-provider AML support — comma-separated \`AML_PROVIDER\` runs providers in parallel with match deduplication
- AML result persistence to \`aml_screenings\` DB table with full match details
- AML risk scoring factor (weight 0.10) integrated into composite risk score
- Address cross-validation — supplementary comparison between front OCR address and back barcode address (weight 0, informational only)
- Developer-level AML toggle: \`aml_enabled\` column (default true)

**Changed:**
- Risk scoring weights rebalanced to accommodate AML factor (total still 1.0)
- \`aml_screening\` in status response now includes \`matches\` array, \`screened_name\`, \`screened_dob\`
- \`cross_validation_results\` now includes optional \`address_validation\` field

### v1.7.0 (2026-03-27)

**Added:**
- Team invitation system with role-based access: Organization Admin (\`role: 'admin'\`) and Reviewer (\`role: 'reviewer'\`)
- Organization Admins can override verifications, access analytics, manage GDPR erasure, and manage team
- Reviewers can approve/reject only — no override, analytics, or GDPR access
- Role selector in Developer Portal Settings when inviting team members
- Team setup banner in Developer Portal when no Organization Admin exists
- Role badge in Review Dashboard header showing access level
- OTP auth endpoints: \`POST /api/auth/reviewer/otp/send\`, \`POST /api/auth/reviewer/otp/verify\`
- Team management: \`POST /api/developer/reviewers/invite\` (accepts \`role\` param), \`GET /api/developer/reviewers\`, \`DELETE /api/developer/reviewers/:id\`

**Changed:**
- Developer escalation to admin removed (POST \`/api/auth/admin/escalate\` returns 410 Gone)
- Admin verification endpoints scope queries by developer_id for org admin/reviewer tokens
- Analytics endpoints opened to Organization Admins (scoped to their developer)
- GDPR delete endpoint opened to Organization Admins with ownership verification
- Override restricted to Organization Admins and Platform Admins

### v1.6.0 (2026-03-26)

**Added:**
- Batch verification processing — full pipeline (OCR, cross-validation, quality gates) without live capture
- Admin status override — \`PUT /api/admin/verification/:id/review\` accepts \`decision: 'override'\` with \`new_status\`
- Webhook forwarding on admin actions (approve, reject, override)
- Verification Management page at \`/admin/verifications\` — stats bar, filterable table, detail view, review actions

### v1.5.0 (2026-03-24)

**Changed:**
- Extracted ML verification engine into separate microservice (\`engine/\` directory)
- Core API image reduced from ~2GB to ~250MB — ML dependencies isolated in engine container (~1.5GB)
- Docker Compose architecture: postgres + engine + api + frontend (4 containers)

**Added:**
- Community edition first-run setup wizard (auto-detects zero-developer state)
- Mobile handoff link endpoint: \`PATCH /api/verify/handoff/:token/link\`
- Extended handoff session timeout to 30 minutes

### v1.2.0 (2026-03-20)

**Changed:**
- Liveness system: removed dead MediaPipe code path, renamed MultiFrame → HeadTurn
- Malformed liveness_metadata now returns HTTP 400 (VALIDATION_ERROR) instead of silently falling back to passive mode
- Removed legacy multi_frame_color challenge type alias — only head_turn is accepted
- color_sequence field is now optional (clients no longer need to send it)

### v1.1.0 (2026-03-19)

**Added:**
- Visual authenticity checks (FFT, color distribution, deepfake detection)
- Webhook resend endpoint and delivery logs
- Per-API-key scoping for webhooks
- AML/sanctions screening addon
- Email OTP + GitHub OAuth authentication (replaced password login)
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
- **Review Dashboard:** https://idswyft.app/admin/verifications
- **Live Demo:** https://idswyft.app/demo
- **Documentation:** https://idswyft.app/docs
- **SDK:** npm install @idswyft/sdk
- **GitHub:** https://github.com/team-idswyft/idswyft
- **Email:** support@idswyft.app

---

*Generated from Idswyft API v1.7.3 — https://idswyft.app/docs*
`;
