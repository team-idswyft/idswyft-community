import React, { useState } from 'react';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import {
  H2, Lead, Divider, SectionAnchor, Callout,
  FieldRow, Pre, EndpointCard, StatusPill,
} from '../components/docs/shared';
import { getDocumentationApiUrl } from '../config/api';
import { C } from '../theme';
import '../styles/patterns.css';

const NAV: NavItem[] = [
  { id: 'analysis', label: 'Analysis Engine', depth: 0 },
  { id: 'statuses', label: 'Statuses', depth: 0 },
  { id: 'batch', label: 'Batch API', depth: 0 },
  { id: 'address', label: 'Address Verification', depth: 0 },
  { id: 'aml', label: 'AML / Sanctions', depth: 0 },
  { id: 'age-estimation', label: 'Age Estimation', depth: 0 },
  { id: 'velocity', label: 'Velocity Checks', depth: 0 },
  { id: 'ip-geolocation', label: 'IP Geolocation', depth: 0 },
  { id: 'voice-auth', label: 'Voice Auth', depth: 0 },
  { id: 'compliance', label: 'Compliance Rules', depth: 0 },
  { id: 'monitoring', label: 'Monitoring', depth: 0 },
];

export const DocsFeatures: React.FC = () => {
  const apiUrl = getDocumentationApiUrl();
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
    <DocLayout slug="docs/features" nav={NAV}>

      {/* ══ ANALYSIS ENGINE ═══════════════════════════════════════════════ */}
      <SectionAnchor id="analysis" />
      <H2 index="01">Analysis Engine</H2>
      <Lead>What the platform extracts and validates from each document and capture. Processing uses algorithmic rules, image forensics, and pre-trained OCR / face-detection models — no custom AI or LLMs.</Lead>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { title: 'OCR Extraction', color: C.cyan, items: ['PaddleOCR / Tesseract engines', 'Name, DOB, ID number', 'Expiry & issue date', 'AAMVA field parsing (US DLs)', 'State DL format validation', 'Per-field confidence scores'] },
          { title: 'Document Quality', color: C.blue, items: ['Sobel edge blur detection', 'Brightness & contrast stats', 'Resolution check (≥ 800×600)', 'File size validation', 'Overall quality score', 'Auto-reject below threshold'] },
          { title: 'Cross-Validation', color: C.amber, items: ['PDF417 / QR barcode decode', 'Levenshtein distance matching', 'Token-set name similarity', 'Front OCR ↔ back barcode check', 'Date & ID number consistency', 'Weighted field scoring'] },
          { title: 'Liveness & Face Match', color: C.green, items: ['EXIF metadata analysis (20%)', 'JPEG artifact detection (15%)', 'Color histogram analysis (15%)', 'Byte entropy scoring (12%)', 'Pixel variance & edge density', 'Face detection (SSDMobilenetv1)', '128-d face embeddings', 'Cosine similarity scoring'] },
          { title: 'Voice Authentication', color: C.purple, items: ['Random digit challenge (6 digits)', 'ASR transcription verification', '192-d speaker embeddings (CAM++)', 'Cosine similarity matching', 'Configurable threshold (0.55)', 'Optional per-developer toggle'] },
        ].map(col => (
          <div key={col.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '18px 20px' }}>
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
      <H2 index="02">Verification Statuses</H2>
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
          <div key={s.status} style={{ display: 'flex', gap: 16, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
      <H2 index="03">Batch Verification</H2>
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
      <H2 index="04">Address Verification</H2>
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
      <H2 index="05">AML / Sanctions Screening</H2>
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

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
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

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Risk levels & outcomes</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
          {[
            { level: 'clear', score: '< 0.5', outcome: 'Verification proceeds normally', color: C.green },
            { level: 'potential_match', score: '0.5 – 0.84', outcome: 'Routed to manual_review', color: C.amber },
            { level: 'confirmed_match', score: '>= 0.85', outcome: 'Hard reject (failed)', color: C.red },
          ].map(r => (
            <div key={r.level} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 0, padding: 12, borderLeft: `3px solid ${r.color}` }}>
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

      {/* ══ AGE ESTIMATION ══════════════════════════════════════════════ */}
      <SectionAnchor id="age-estimation" />
      <H2 index="06">Face Age Estimation</H2>
      <Lead>
        Cross-checks apparent face age against declared date of birth. Extracts age estimates from both
        the document photo and the live capture, then flags discrepancies as a fraud signal (e.g., identity borrowing).
      </Lead>

      <Pre label="Status response — age_estimation object" code={`{
  "age_estimation": {
    "document_face_age": 34,
    "live_face_age": 22,
    "declared_age": 35,
    "age_discrepancy": 13,
    "flag": "Age discrepancy between live capture and declared DOB"
  }
}`} />

      <Callout type="note">
        Age estimation runs automatically during live capture. The <code style={{ fontFamily: C.mono }}>age_discrepancy</code> field
        shows the absolute difference between <code style={{ fontFamily: C.mono }}>live_face_age</code> and{' '}
        <code style={{ fontFamily: C.mono }}>declared_age</code>. High discrepancies contribute to the composite risk score.
      </Callout>

      <Divider />

      {/* ══ VELOCITY / FRAUD DETECTION ══════════════════════════════════ */}
      <SectionAnchor id="velocity" />
      <H2 index="07">Velocity / Fraud Detection</H2>
      <Lead>
        Analyzes verification velocity during the live-capture step to detect fraud patterns such as
        rapid resubmissions, bot-like step timing, burst activity, and multi-IP abuse. Flagged sessions
        are routed to manual review.
      </Lead>

      <Pre label="Status response — velocity_analysis object" code={`{
  "velocity_analysis": {
    "ip_address_hash": "a1b2c3...",
    "ip_reuse_count_1h": 3,
    "ip_reuse_count_24h": 8,
    "avg_step_duration_ms": 1200,
    "flags": ["RAPID_IP_REUSE", "BOT_LIKE_TIMING"],
    "score": 75
  }
}`} />

      <Callout type="note">
        Velocity flags: <code style={{ fontFamily: C.mono }}>RAPID_IP_REUSE</code> (3+ verifications from same IP in 1 hour),{' '}
        <code style={{ fontFamily: C.mono }}>BOT_LIKE_TIMING</code> (steps completed too fast),{' '}
        <code style={{ fontFamily: C.mono }}>BURST_ACTIVITY</code> (sudden spike in verifications),{' '}
        <code style={{ fontFamily: C.mono }}>MULTI_IP_ABUSE</code> (same user from many IPs). Score range: 0–100, highest flag wins.
      </Callout>

      <Divider />

      {/* ══ IP GEOLOCATION RISK ═════════════════════════════════════════ */}
      <SectionAnchor id="ip-geolocation" />
      <H2 index="08">IP Geolocation Risk</H2>
      <Lead>
        Detects geographic risk signals by comparing the client IP location against the document's issuing
        country. Identifies Tor exit nodes, datacenter/VPN IPs, and high-risk jurisdictions.
      </Lead>

      <Pre label="Status response — ip_geolocation object" code={`{
  "ip_geolocation": {
    "ip_country": "RO",
    "document_country": "US",
    "country_match": false,
    "is_tor": false,
    "is_datacenter": true,
    "geo_risk_flags": ["COUNTRY_MISMATCH", "DATACENTER_IP"],
    "geo_risk_score": 60
  }
}`} />

      <Callout type="note">
        Geo risk flags: <code style={{ fontFamily: C.mono }}>COUNTRY_MISMATCH</code>,{' '}
        <code style={{ fontFamily: C.mono }}>TOR_EXIT_NODE</code>,{' '}
        <code style={{ fontFamily: C.mono }}>DATACENTER_IP</code>,{' '}
        <code style={{ fontFamily: C.mono }}>HIGH_RISK_JURISDICTION</code>. Score contributes to the composite risk score.
      </Callout>

      <Divider />

      {/* ══ VOICE AUTHENTICATION ════════════════════════════════════════ */}
      <SectionAnchor id="voice-auth" />
      <H2 index="09">Voice Authentication</H2>
      <Lead>
        Optional speaker verification step after face matching. Users speak randomly generated digits;
        the system verifies both the spoken content (ASR transcription) and the speaker identity (192-dimensional
        embedding comparison). Enable per-developer via the settings API.
      </Lead>

      <Pre label="Enable voice auth  —  PUT /api/developer/settings/voice-auth" code={`curl -X PUT ${apiUrl}/api/developer/settings/voice-auth \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{ "enabled": true }'

// Response: { "success": true, "voice_auth_enabled": true }`} />

      <EndpointCard method="POST" path="/api/v2/verify/:id/voice-challenge" title="Request Voice Challenge">
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Generates 6 random digits for the user to speak aloud. Challenge expires after 120 seconds.
          Session must be in <code style={{ fontFamily: C.mono }}>AWAITING_VOICE</code> state.
        </p>
        <Pre label="Response  —  HTTP 200" code={`{
  "success": true,
  "challenge_digits": "3 7 1 9 0 5",
  "expires_in": 120
}`} />
      </EndpointCard>

      <EndpointCard method="POST" path="/api/v2/verify/:id/voice-capture" title="Submit Voice Capture">
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Upload audio recording of the user speaking the challenge digits. Accepts WebM, WAV, or OGG formats.
          Returns voice match results and final verification status.
        </p>
        <Pre label="Response  —  HTTP 200" code={`{
  "success": true,
  "verification_id": "v_abc123",
  "status": "COMPLETE",
  "voice_match_results": {
    "similarity_score": 0.82,
    "passed": true,
    "threshold_used": 0.55,
    "challenge_verified": true,
    "challenge_digits": "3 7 1 9 0 5"
  }
}`} />
      </EndpointCard>

      <Callout type="note">
        Voice auth uses 192-dimensional speaker embeddings (CAM++ model) with cosine similarity matching.
        Thresholds: 0.55 (production), 0.50 (sandbox). All decisions are deterministic — no LLM in the gate path.
        Challenge expiry: 120 seconds. Rejection reasons:{' '}
        <code style={{ fontFamily: C.mono }}>VOICE_MATCH_FAILED</code>,{' '}
        <code style={{ fontFamily: C.mono }}>VOICE_CHALLENGE_FAILED</code>.
      </Callout>

      <Divider />

      {/* ══ COMPLIANCE ORCHESTRATION ═══════════════════════════════════ */}
      <SectionAnchor id="compliance" />
      <H2 index="10">Compliance Rules</H2>
      <Lead>
        Ship your compliance policy as code. Define rules that automatically adjust verification requirements
        based on country, document type, user age, risk score, and custom metadata. The engine evaluates
        them at session initialization — zero code changes needed.
      </Lead>

      <Callout type="tip">
        Rules are evaluated server-side during <code style={{ fontFamily: C.mono }}>POST /api/v2/verify/initialize</code>.
        Your existing API integration works unchanged — the engine transparently adjusts the verification configuration
        based on matching rules.
      </Callout>

      {/* How it works */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
          {[
            ['1', 'Create rulesets with conditions and actions via API or the Admin Dashboard'],
            ['2', 'User starts verification — engine loads active rules for the developer'],
            ['3', 'Each rule\'s condition is tested against the session context (country, age, metadata)'],
            ['4', 'Matching actions merge (most restrictive wins) and adjust the verification pipeline'],
          ].map(([n, text]) => (
            <React.Fragment key={n}>
              <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, fontWeight: 600 }}>{n}.</span>
              <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>{text}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Condition operators & action fields */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '18px 20px' }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.8rem', fontWeight: 600, color: C.cyan, marginBottom: 12 }}>Condition Fields</div>
          {[
            { field: 'country', desc: 'ISO country code' },
            { field: 'document_type', desc: 'passport, drivers_license, national_id' },
            { field: 'user_age', desc: 'Calculated from DOB' },
            { field: 'risk_score', desc: 'Composite score (0.0 – 1.0)' },
            { field: 'aml_risk_level', desc: 'clear, potential_match, confirmed_match' },
            { field: 'metadata.*', desc: 'Developer-supplied key-value data' },
          ].map(f => (
            <div key={f.field} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, padding: '3px 0', display: 'flex', gap: 8 }}>
              <code style={{ fontFamily: C.mono, color: C.text, fontSize: '0.75rem', minWidth: 120 }}>{f.field}</code>
              <span>{f.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '18px 20px' }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.8rem', fontWeight: 600, color: C.green, marginBottom: 12 }}>Action Fields</div>
          {[
            { field: 'set_mode', desc: 'Override to age_only / document_only / identity / full' },
            { field: 'require_address', desc: 'Enable address verification step' },
            { field: 'require_liveness', desc: 'Set to passive or head_turn' },
            { field: 'require_aml', desc: 'Force AML/sanctions screening' },
            { field: 'force_manual_review', desc: 'Route to manual review' },
            { field: 'set_flag', desc: 'Attach a custom flag (e.g. high_risk)' },
          ].map(f => (
            <div key={f.field} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, padding: '3px 0', display: 'flex', gap: 8 }}>
              <code style={{ fontFamily: C.mono, color: C.text, fontSize: '0.75rem', minWidth: 120 }}>{f.field}</code>
              <span>{f.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <Callout type="note">
        When multiple rules match, actions merge additively. Verification mode escalates (never downgrades):
        {' '}<code style={{ fontFamily: C.mono }}>age_only &lt; document_only &lt; identity &lt; full</code>.
        Boolean flags like <code style={{ fontFamily: C.mono }}>force_manual_review</code> stick once set.
        Custom flags from all matching rules are collected and deduplicated.
      </Callout>

      <EndpointCard method="POST" path="/api/v2/compliance/rulesets" title="Create Ruleset">
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Create a named group of compliance rules. Rulesets are evaluated in priority order (lower numbers first).
        </p>
        <div style={{ marginBottom: 12 }}>
          <FieldRow name="name" type="string" req={true} desc="Human-readable ruleset name (max 200 chars)." />
          <FieldRow name="description" type="string" req={false} desc="Optional description." />
          <FieldRow name="is_active" type="boolean" req={false} desc="Only active rulesets are evaluated (default: true)." />
          <FieldRow name="priority" type="integer" req={false} desc="Evaluation order — lower = first (default: 100)." />
        </div>
        <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/compliance/rulesets \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "EU Compliance",
    "description": "Enhanced verification for EU member states",
    "priority": 10
  }'`} />
        <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "ruleset": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "EU Compliance",
    "description": "Enhanced verification for EU member states",
    "is_active": true,
    "priority": 10,
    "created_at": "2026-04-07T12:00:00Z"
  }
}`} />
      </EndpointCard>

      <EndpointCard method="POST" path="/api/v2/compliance/rulesets/:id/rules" title="Add Rule to Ruleset">
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Add a rule with a structured condition and action. The engine validates both server-side —
          invalid conditions or actions return HTTP 400 with a descriptive error.
        </p>
        <div style={{ marginBottom: 12 }}>
          <FieldRow name="condition" type="object" req={true} desc="Structured condition — leaf { field, op, value } or combinator { all, any, not }." />
          <FieldRow name="action" type="object" req={true} desc="Action to enforce when condition matches." />
          <FieldRow name="description" type="string" req={false} desc="Human-readable rule description." />
        </div>
        <Pre label="Request — country + age rule" code={`curl -X POST ${apiUrl}/api/v2/compliance/rulesets/RULESET_ID/rules \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "condition": {
      "all": [
        { "field": "country", "op": "in", "value": ["DE", "FR", "IT", "ES"] },
        { "field": "user_age", "op": "lt", "value": 18 }
      ]
    },
    "action": {
      "set_mode": "full",
      "require_aml": true,
      "force_manual_review": true,
      "set_flag": "eu_minor"
    },
    "description": "Full verification + manual review for EU minors"
  }'`} />
        <Pre label="Response  —  HTTP 201" code={`{
  "success": true,
  "rule": {
    "id": "660e8400-e29b-41d4-a716-446655440002",
    "condition": { "all": [{ "field": "country", "op": "in", "value": ["DE", "FR", "IT", "ES"] }, { "field": "user_age", "op": "lt", "value": 18 }] },
    "action": { "set_mode": "full", "require_aml": true, "force_manual_review": true, "set_flag": "eu_minor" },
    "description": "Full verification + manual review for EU minors",
    "created_at": "2026-04-07T12:01:00Z"
  }
}`} />
      </EndpointCard>

      <EndpointCard method="POST" path="/api/v2/compliance/evaluate" title="Dry-Run Evaluate">
        <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Test your rules against a synthetic context without creating a verification session. Returns which
          rules match and the resolved action after merging.
        </p>
        <div style={{ marginBottom: 12 }}>
          <FieldRow name="context" type="object" req={true} desc="Test context with any combination of fields: country, document_type, user_age, verification_mode, risk_score, aml_risk_level, metadata." />
        </div>
        <Pre label="Request" code={`curl -X POST ${apiUrl}/api/v2/compliance/evaluate \\
  -H "X-API-Key: your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "context": {
      "country": "DE",
      "user_age": 16,
      "document_type": "passport"
    }
  }'`} />
        <Pre label="Response" code={`{
  "success": true,
  "matched_rules": 1,
  "matches": [
    {
      "ruleset": "EU Compliance",
      "rule": "Full verification + manual review for EU minors",
      "action": { "set_mode": "full", "require_aml": true, "force_manual_review": true, "set_flag": "eu_minor" }
    }
  ],
  "resolved_action": {
    "set_mode": "full",
    "require_aml": true,
    "force_manual_review": true,
    "flags": ["eu_minor"]
  }
}`} />
      </EndpointCard>

      {/* Operators reference */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Operators</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '4px 24px' }}>
          {[
            ['eq / neq', 'Equals / not equals'],
            ['in / not_in', 'Value in / not in array'],
            ['gt / gte / lt / lte', 'Numeric comparisons'],
            ['exists', 'Field present (true) or absent (false)'],
            ['contains', 'String contains substring'],
            ['all / any / not', 'Combinators — nest conditions'],
          ].map(([op, desc]) => (
            <div key={op} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
              <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan, minWidth: 130, flexShrink: 0 }}>{op}</code>
              <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Common rule patterns */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Common patterns</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
          {[
            { title: 'Country restriction', color: C.cyan, cond: '{ "field": "country", "op": "in", "value": ["DE", "FR"] }', action: '{ "set_mode": "full", "require_aml": true }' },
            { title: 'Age gate', color: C.amber, cond: '{ "field": "user_age", "op": "lt", "value": 18 }', action: '{ "force_manual_review": true }' },
            { title: 'Risk escalation', color: C.red, cond: '{ "field": "risk_score", "op": "gte", "value": 0.7 }', action: '{ "require_aml": true, "set_flag": "high_risk" }' },
          ].map(p => (
            <div key={p.title} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 0, padding: 12, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.75rem', color: p.color, fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
              <div style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.dim, marginBottom: 4 }}>condition:</div>
              <pre style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.muted, margin: '0 0 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{p.cond}</pre>
              <div style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.dim, marginBottom: 4 }}>action:</div>
              <pre style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.muted, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{p.action}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* Other CRUD endpoints summary */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>All compliance endpoints</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { method: 'POST', path: '/api/v2/compliance/rulesets', desc: 'Create ruleset' },
            { method: 'GET', path: '/api/v2/compliance/rulesets', desc: 'List rulesets (includes rule_count)' },
            { method: 'GET', path: '/api/v2/compliance/rulesets/:id', desc: 'Get ruleset with all rules' },
            { method: 'PUT', path: '/api/v2/compliance/rulesets/:id', desc: 'Update ruleset metadata' },
            { method: 'DELETE', path: '/api/v2/compliance/rulesets/:id', desc: 'Delete ruleset + all rules (CASCADE)' },
            { method: 'POST', path: '/api/v2/compliance/rulesets/:id/rules', desc: 'Add rule to ruleset' },
            { method: 'PUT', path: '/api/v2/compliance/rules/:id', desc: 'Update rule condition/action' },
            { method: 'DELETE', path: '/api/v2/compliance/rules/:id', desc: 'Delete rule' },
            { method: 'POST', path: '/api/v2/compliance/evaluate', desc: 'Dry-run evaluation' },
          ].map(ep => {
            const methodColor: Record<string, string> = { GET: C.green, POST: C.blue, PUT: C.amber, DELETE: C.red };
            return (
              <div key={`${ep.method}-${ep.path}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 600, color: methodColor[ep.method] ?? C.muted, width: 48, textAlign: 'right', flexShrink: 0 }}>{ep.method}</span>
                <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.text, flex: 1 }}>{ep.path}</code>
                <span style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.dim }}>{ep.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Pre label="SDK usage" code={`// Create a ruleset
const { ruleset } = await fetch('/api/v2/compliance/rulesets', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'EU Compliance', priority: 10 }),
}).then(r => r.json());

// Add a rule
await fetch(\`/api/v2/compliance/rulesets/\${ruleset.id}/rules\`, {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    condition: { "field": "country", "op": "in", "value": ["DE", "FR", "IT"] },
    action: { "set_mode": "full", "require_aml": true },
    description: "Full verification for EU countries",
  }),
}).then(r => r.json());

// Dry-run test
const result = await fetch('/api/v2/compliance/evaluate', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: { country: 'DE', user_age: 25 } }),
}).then(r => r.json());

console.log(result.matched_rules, 'rules matched');
console.log(result.resolved_action);  // { set_mode: 'full', require_aml: true }`} />

      <Callout type="note">
        The Admin Dashboard (cloud edition) includes a visual drag-and-drop rule builder — create conditions,
        pick actions, and dry-run test without writing any code. Organization admins can open the{' '}
        <strong>Compliance Rules</strong> tab on the Verification Management page at{' '}
        <code style={{ fontFamily: C.mono }}>/admin/verifications</code>.
      </Callout>

      <Divider />

      {/* ══ MONITORING ════════════════════════════════════════════════════ */}
      <SectionAnchor id="monitoring" />
      <H2 index="11">Monitoring & Re-verification</H2>
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

    </DocLayout>
  );
};
