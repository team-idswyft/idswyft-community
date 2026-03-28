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
      <H2>Analysis Engine</H2>
      <Lead>What the platform extracts and validates from each document and capture. Processing uses algorithmic rules, image forensics, and pre-trained OCR / face-detection models — no custom AI or LLMs.</Lead>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { title: 'OCR Extraction', color: C.cyan, items: ['PaddleOCR / Tesseract engines', 'Name, DOB, ID number', 'Expiry & issue date', 'AAMVA field parsing (US DLs)', 'State DL format validation', 'Per-field confidence scores'] },
          { title: 'Document Quality', color: C.blue, items: ['Sobel edge blur detection', 'Brightness & contrast stats', 'Resolution check (≥ 800×600)', 'File size validation', 'Overall quality score', 'Auto-reject below threshold'] },
          { title: 'Cross-Validation', color: C.amber, items: ['PDF417 / QR barcode decode', 'Levenshtein distance matching', 'Token-set name similarity', 'Front OCR ↔ back barcode check', 'Date & ID number consistency', 'Weighted field scoring'] },
          { title: 'Liveness & Face Match', color: C.green, items: ['EXIF metadata analysis (20%)', 'JPEG artifact detection (15%)', 'Color histogram analysis (15%)', 'Byte entropy scoring (12%)', 'Pixel variance & edge density', 'Face detection (SSDMobilenetv1)', '128-d face embeddings', 'Cosine similarity scoring'] },
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
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

    </DocLayout>
  );
};
