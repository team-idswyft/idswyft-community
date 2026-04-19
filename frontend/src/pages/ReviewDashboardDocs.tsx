/**
 * /docs/review — Review Dashboard documentation.
 * Uses the shared DocLayout + components from shared.tsx.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { C } from '../theme';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import { Pill, SectionAnchor, H2, Lead, Divider, Callout } from '../components/docs/shared';

// ─── StatusBadge (review-specific color mapping) ────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = {
    verified:      [C.green, C.greenDim],
    failed:        [C.red, C.redDim],
    manual_review: [C.amber, C.amberDim],
    pending:       [C.cyan, C.cyanDim],
  };
  const [color, bg] = map[status] ?? [C.muted, 'rgba(136,150,170,0.1)'];
  return <Pill color={color} bg={bg}>{status}</Pill>;
};

// ─── Section nav ────────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  { id: 'overview',  label: 'Overview',           depth: 0 },
  { id: 'access',    label: 'Getting Access',      depth: 0 },
  { id: 'roles',     label: 'Roles',               depth: 1 },
  { id: 'reviewers', label: 'Invite Team Members', depth: 1 },
  { id: 'reviewer-login', label: 'OTP Login',      depth: 1 },
  { id: 'dashboard', label: 'The Dashboard',       depth: 0 },
  { id: 'stats',     label: 'Stats Bar',           depth: 1 },
  { id: 'table',     label: 'Verification Table',  depth: 1 },
  { id: 'filters',   label: 'Filters & Search',    depth: 1 },
  { id: 'detail',    label: 'Detail Panel',        depth: 1 },
  { id: 'actions',   label: 'Review Actions',      depth: 0 },
  { id: 'approve',   label: 'Approve',             depth: 1 },
  { id: 'reject',    label: 'Reject',              depth: 1 },
  { id: 'override',  label: 'Override',            depth: 1 },
  { id: 'statuses',  label: 'Status Reference',    depth: 0 },
  { id: 'webhooks',  label: 'Webhooks',            depth: 0 },
];

// ─── Main component ────────────────────────────────────────────────────────

export const ReviewDashboardDocs: React.FC = () => (
  <DocLayout slug="review-dashboard" nav={NAV}>

    {/* ══ OVERVIEW ═════════════════════════════════════════════════════ */}
    <SectionAnchor id="overview" />
    <H2 index="01">Review Dashboard</H2>
    <Lead>
      The Review Dashboard lets you and your team review, approve, or reject identity verifications
      without writing any code. It's the fastest way to go live — integrate the API, then use the
      dashboard for manual review decisions while you build your automation.
    </Lead>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 32 }}>
      {[
        { icon: '🔍', title: 'Review Verifications', desc: 'View document images, OCR data, face match scores, and cross-validation results' },
        { icon: '✅', title: 'Approve or Reject', desc: 'Make manual decisions with confirmation — results pushed via webhooks instantly' },
        { icon: '👥', title: 'Invite Reviewers', desc: 'Give team members access with passwordless OTP login — no shared credentials' },
        { icon: '📊', title: 'Live Stats', desc: 'See total, pending, verified, and failed counts at a glance' },
      ].map(c => (
        <div key={c.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '1.4rem' }}>{c.icon}</div>
          <div style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text }}>{c.title}</div>
          <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.55 }}>{c.desc}</div>
        </div>
      ))}
    </div>

    <Callout type="tip">
      The Review Dashboard is designed for the transition period between "API works" and "fully automated."
      Many teams use it permanently for{' '}
      <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>manual_review</code>{' '}
      cases that need a human decision.
    </Callout>

    <Divider />

    {/* ══ ACCESS ════════════════════════════════════════════════════════ */}
    <SectionAnchor id="access" />
    <H2 index="02">Getting Access</H2>
    <Lead>
      Developers invite team members from the Developer Portal. Team members access the dashboard
      via passwordless OTP — no passwords to manage.
    </Lead>

    {/* Roles */}
    <SectionAnchor id="roles" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.cyan, fontFamily: C.mono, fontWeight: 400, fontSize: '0.85rem' }}>1.</span>
      Roles
    </h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      There are two roles for the Review Dashboard. Both are scoped to the developer's verifications
      and sign in via OTP.
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, maxWidth: 680 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 0, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>Admin</span>
          <span style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text }}>Organization Admin</span>
        </div>
        <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.55 }}>
          Approve, reject, <strong>override</strong> verifications. Access analytics, manage GDPR erasure requests, and manage the reviewer team.
        </div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 0, background: 'rgba(136,150,170,0.1)', color: C.muted }}>Reviewer</span>
          <span style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text }}>Reviewer</span>
        </div>
        <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.55 }}>
          Approve or reject verifications. Cannot override, access analytics, or manage GDPR requests.
        </div>
      </div>
    </div>

    <Callout type="note">
      Developers never see the Review Dashboard directly. They manage their API keys in the Developer Portal
      and invite Organization Admins to handle day-to-day verification review.
    </Callout>

    {/* Invite team members */}
    <SectionAnchor id="reviewers" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.cyan, fontFamily: C.mono, fontWeight: 400, fontSize: '0.85rem' }}>2.</span>
      Invite Team Members
    </h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      From the Developer Portal, invite team members as Organization Admins or Reviewers:
    </div>

    <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
      {[
        { step: '1', text: 'Open Developer Portal → Settings (gear icon)' },
        { step: '2', text: 'Scroll to "Team Management"' },
        { step: '3', text: 'Enter email, name, select role → Invite' },
      ].map(s => (
        <div key={s.step} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 180px' }}>
          <div style={{ width: 24, height: 24, borderRadius: 0, background: C.cyanDim, border: `1px solid ${C.cyanBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 700, color: C.cyan, flexShrink: 0 }}>{s.step}</div>
          <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.text }}>{s.text}</span>
        </div>
      ))}
    </div>

    <Callout type="warning">
      All team members can only see verifications belonging to <strong>your</strong> developer account. They
      cannot access API keys, billing, or other developers' data. Each person gets their own
      OTP-based login.
    </Callout>

    {/* Reviewer login */}
    <SectionAnchor id="reviewer-login" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.cyan, fontFamily: C.mono, fontWeight: 400, fontSize: '0.85rem' }}>3.</span>
      OTP Login
    </h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      Both Organization Admins and Reviewers access the dashboard at{' '}
      <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>/admin/login</code>.
      They enter their email, receive an OTP code, and are taken directly to the Review Dashboard.
      No passwords, no account creation required. A role badge in the header shows the user's
      access level.
    </div>

    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px 24px', marginBottom: 24, maxWidth: 500 }}>
      <div style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.dim, marginBottom: 12, letterSpacing: '0.06em' }}>OTP LOGIN FLOW</div>
      {[
        'Reviewer navigates to /admin/login',
        'Enters their invited email address',
        'Receives 6-digit OTP via email',
        'Enters code → redirected to /admin/verifications',
      ].map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 3 ? C.green : C.cyan, flexShrink: 0 }} />
          <span style={{ fontFamily: C.sans, fontSize: '0.82rem', color: C.text }}>{step}</span>
        </div>
      ))}
    </div>

    <Divider />

    {/* ══ DASHBOARD ═════════════════════════════════════════════════════ */}
    <SectionAnchor id="dashboard" />
    <H2 index="03">The Dashboard</H2>
    <Lead>
      The dashboard is a single-page view with stats, a filterable table, and an expandable
      detail panel — everything you need to review verifications quickly.
    </Lead>

    {/* Stats bar */}
    <SectionAnchor id="stats" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 10px' }}>Stats Bar</h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      At the top of the page, five stat cards show real-time counts:
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 28 }}>
      {[
        { label: 'Total', value: '—', color: C.text },
        { label: 'Review', value: '—', color: C.amber },
        { label: 'Pending', value: '—', color: C.cyan },
        { label: 'Verified', value: '—', color: C.green },
        { label: 'Failed', value: '—', color: C.red },
      ].map(s => (
        <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 16px', borderTop: `3px solid ${s.color}` }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.muted, letterSpacing: '0.06em', marginBottom: 4 }}>{s.label.toUpperCase()}</div>
          <div style={{ fontFamily: C.mono, fontSize: '1.1rem', fontWeight: 600, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>

    {/* Table */}
    <SectionAnchor id="table" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 10px' }}>Verification Table</h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      The main table shows all verifications with sortable columns. Click any row to expand
      the detail panel.
    </div>

    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 2fr 1.5fr 1.5fr 2fr 1fr', gap: 0, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.7rem', color: C.dim, letterSpacing: '0.04em' }}>
        <span></span><span>ID</span><span>USER ID</span><span>STATUS</span><span>DOC TYPE</span><span>CREATED</span><span>ACTIONS</span>
      </div>
      {[
        { id: 'a3f8...c2d1', user: '9e7b...4a01', status: 'manual_review', doc: 'drivers_license', date: '2 min ago' },
        { id: 'b1e2...d4f5', user: '3c8a...7b02', status: 'verified', doc: 'passport', date: '15 min ago' },
        { id: 'c9d0...e6a3', user: '5f2d...1c03', status: 'failed', doc: 'national_id', date: '1 hour ago' },
      ].map(row => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '40px 2fr 2fr 1.5fr 1.5fr 2fr 1fr', gap: 0, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontFamily: C.sans, fontSize: '0.8rem', color: C.text, alignItems: 'center' }}>
          <span style={{ color: C.dim, fontSize: '0.7rem' }}>▸</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.muted }}>{row.id}</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.muted }}>{row.user}</span>
          <span><StatusBadge status={row.status} /></span>
          <span style={{ fontSize: '0.78rem', color: C.muted }}>{row.doc}</span>
          <span style={{ fontSize: '0.78rem', color: C.muted }}>{row.date}</span>
          <span style={{ color: C.cyan, fontSize: '0.75rem', cursor: 'pointer' }}>View</span>
        </div>
      ))}
    </div>

    {/* Filters */}
    <SectionAnchor id="filters" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 10px' }}>Filters & Search</h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      Use the status tabs above the table to filter by verification state:
    </div>

    <div style={{ display: 'flex', gap: 0, marginBottom: 24, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
      {['All', 'Manual Review', 'Verified', 'Failed', 'Pending'].map(tab => (
        <span key={tab} className={`case-tab${tab === 'All' ? ' active' : ''}`} style={{
          fontFamily: C.mono, fontSize: '0.78rem', fontWeight: 500,
          padding: '10px 18px',
          background: 'transparent',
          color: tab === 'All' ? C.text : C.muted,
          borderBottom: tab === 'All' ? `2px solid ${C.text}` : '2px solid transparent',
        }}>{tab}</span>
      ))}
    </div>

    {/* Detail panel */}
    <SectionAnchor id="detail" />
    <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 10px' }}>Detail Panel</h3>
    <div style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 680 }}>
      Clicking a row expands the detail panel showing everything about the verification:
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 24 }}>
      {[
        { title: 'Document Images', desc: 'Front and back photos of the uploaded ID document' },
        { title: 'OCR Data', desc: 'Extracted name, date of birth, document number, expiry' },
        { title: 'Cross-Validation', desc: 'Front OCR vs back barcode consistency scores' },
        { title: 'Face Match', desc: 'Similarity score between document photo and live capture' },
        { title: 'Gate Analysis', desc: 'Score bars for OCR, cross-validation, liveness, deepfake, and face match gates' },
        { title: 'Risk Assessment', desc: 'Overall risk score, risk level, contributing factors, and AML screening results' },
      ].map(d => (
        <div key={d.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '14px 16px' }}>
          <div style={{ fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>{d.title}</div>
          <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.muted, lineHeight: 1.55 }}>{d.desc}</div>
        </div>
      ))}
    </div>

    <Divider />

    {/* ══ ACTIONS ═══════════════════════════════════════════════════════ */}
    <SectionAnchor id="actions" />
    <H2 index="04">Review Actions</H2>
    <Lead>
      Each verification can be approved, rejected, or overridden. All actions require a
      confirmation dialog to prevent accidental decisions.
    </Lead>

    <SectionAnchor id="approve" />
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />
        <span style={{ fontFamily: C.sans, fontSize: '0.95rem', fontWeight: 600, color: C.text }}>Approve</span>
      </div>
      <div style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, lineHeight: 1.65 }}>
        Sets the verification status to <StatusBadge status="verified" />. The decision is
        final and triggers a{' '}
        <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.8rem' }}>verification.verified</code>{' '}
        webhook event to the developer's registered webhook URL.
      </div>
    </div>

    <SectionAnchor id="reject" />
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.red }} />
        <span style={{ fontFamily: C.sans, fontSize: '0.95rem', fontWeight: 600, color: C.text }}>Reject</span>
      </div>
      <div style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, lineHeight: 1.65 }}>
        Sets the verification status to <StatusBadge status="failed" />. You can provide an optional
        reason which is stored and included in the webhook payload. Triggers a{' '}
        <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.8rem' }}>verification.failed</code>{' '}
        webhook event.
      </div>
    </div>

    <SectionAnchor id="override" />
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.amber }} />
        <span style={{ fontFamily: C.sans, fontSize: '0.95rem', fontWeight: 600, color: C.text }}>Override</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 0, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>Admin Only</span>
      </div>
      <div style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, lineHeight: 1.75 }}>
        Lets you set any status — useful for edge cases. For example, overriding a{' '}
        <StatusBadge status="failed" /> verification to <StatusBadge status="verified" /> when
        you've manually confirmed the person's identity through other means. A reason is required
        for overrides. This action is only available to <strong>Organization Admins</strong> — regular
        Reviewers can only approve or reject.
      </div>
    </div>

    <Callout type="warning">
      All review actions are logged in the audit trail. Webhook notifications fire immediately
      after a decision, so your application can react in real time.
    </Callout>

    <Divider />

    {/* ══ STATUS REFERENCE ══════════════════════════════════════════════ */}
    <SectionAnchor id="statuses" />
    <H2 index="05">Status Reference</H2>
    <Lead>
      Every verification moves through these states. The dashboard color-codes each status
      for quick visual scanning.
    </Lead>

    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden', marginBottom: 24 }}>
      {[
        { status: 'pending', desc: 'Verification created, waiting for document upload or processing to complete.' },
        { status: 'manual_review', desc: 'Automated checks flagged something — a human needs to review and decide.' },
        { status: 'verified', desc: 'Identity confirmed. Either by automated pipeline or manual approval.' },
        { status: 'failed', desc: 'Verification failed. Document unreadable, face mismatch, or manually rejected.' },
      ].map((row, i) => (
        <div key={row.status} style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none', alignItems: 'flex-start' }}>
          <div style={{ width: 120, flexShrink: 0, paddingTop: 2 }}><StatusBadge status={row.status} /></div>
          <div style={{ fontFamily: C.sans, fontSize: '0.84rem', color: C.muted, lineHeight: 1.65 }}>{row.desc}</div>
        </div>
      ))}
    </div>

    <Divider />

    {/* ══ WEBHOOKS ══════════════════════════════════════════════════════ */}
    <SectionAnchor id="webhooks" />
    <H2 index="06">Webhooks</H2>
    <Lead>
      When you approve, reject, or override a verification from the dashboard, a webhook is
      fired to your registered URL — the same events as automated decisions.
    </Lead>

    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 0, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.7rem', color: C.dim, letterSpacing: '0.04em' }}>
        <span>EVENT</span><span>TRIGGER</span><span>PAYLOAD INCLUDES</span>
      </div>
      {[
        { event: 'verification.verified', trigger: 'Approve', payload: 'verification_id, status, reviewed_by, reviewed_at' },
        { event: 'verification.failed', trigger: 'Reject', payload: 'verification_id, status, reason, reviewed_by, reviewed_at' },
        { event: 'verification.status_changed', trigger: 'Override', payload: 'verification_id, old_status, new_status, reason, reviewed_by' },
      ].map((row, i) => (
        <div key={row.event} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 0, padding: '10px 16px', borderBottom: i < 2 ? `1px solid ${C.border}` : 'none', fontFamily: C.sans, fontSize: '0.8rem', color: C.text, alignItems: 'center' }}>
          <code style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.cyan }}>{row.event}</code>
          <span style={{ fontSize: '0.8rem', color: C.muted }}>{row.trigger}</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.muted }}>{row.payload}</span>
        </div>
      ))}
    </div>

    <Callout type="tip">
      Set up your webhook URL in the{' '}
      <Link to="/developer" style={{ color: C.cyan, textDecoration: 'none' }}>Developer Portal</Link>{' '}
      under Settings. Webhooks retry up to 3 times on failure. See the{' '}
      <Link to="/docs" style={{ color: C.cyan, textDecoration: 'none' }}>API Docs</Link>{' '}
      for the full webhook payload schema.
    </Callout>

  </DocLayout>
);
