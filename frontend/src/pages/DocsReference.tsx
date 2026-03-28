import React, { useState } from 'react';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import {
  H2, Lead, Divider, SectionAnchor, Pill,
} from '../components/docs/shared';
import { C } from '../theme';
import '../styles/patterns.css';

const NAV: NavItem[] = [
  { id: 'rate-limits', label: 'Rate Limits', depth: 0 },
  { id: 'changelog', label: 'Changelog', depth: 0 },
  { id: 'support', label: 'Support', depth: 0 },
];

export const DocsReference: React.FC = () => {
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
    <DocLayout slug="docs/reference" nav={NAV}>

      {/* ══ RATE LIMITS ══════════════════════════════════════════════════ */}
      <SectionAnchor id="rate-limits" />
      <H2>Rate Limits & Status Codes</H2>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Rate Limits</div>
          {[
            { label: 'Per developer key', value: '1,000 req / hour', note: 'cloud edition — sandbox + production combined' },
            { label: 'Per user', value: '5 verifications / hour', note: 'cloud edition — across all developer keys' },
            { label: 'Self-hosted', value: 'None', note: 'rate limiting disabled by default' },
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
          version: '1.7.0',
          date: '2026-03-27',
          added: [
            'Reviewer invitation system — developers invite external reviewers with OTP-based access scoped to their verifications',
            'Reviewer auth: POST /api/auth/reviewer/otp/send, POST /api/auth/reviewer/otp/verify',
            'Reviewer management: POST /api/developer/reviewers/invite, GET /api/developer/reviewers, DELETE /api/developer/reviewers/:id',
            'Reviewer management UI in Developer Portal settings (invite, list, revoke, copy login link)',
          ],
          fixed: [],
          changed: [
            'Admin verification endpoints scope queries by developer_id for reviewer tokens',
            'Reviewers cannot use override decision (admin-only)',
          ],
        },
        {
          version: '1.6.0',
          date: '2026-03-26',
          added: [
            'Batch verification processing — full pipeline (OCR, cross-validation, quality gates) without live capture',
            'Admin status override with new_status field on PUT /api/admin/verification/:id/review',
            'Webhook forwarding on admin review actions (approve, reject, override)',
            'Verification Management page at /admin/verifications — stats, filterable table, detail view, review actions',
          ],
          fixed: [],
          changed: [
            'Batch items that fail quality gates correctly marked as failed with rejection reason',
          ],
        },
        {
          version: '1.5.0',
          date: '2026-03-24',
          added: [
            'Community edition first-run setup wizard (auto-detects zero-developer state)',
            'Mobile handoff link endpoint: PATCH /api/verify/handoff/:token/link',
            'Engine Worker microservice — standalone container for ML verification (OCR, face detection, liveness, deepfake)',
          ],
          fixed: [
            'Mobile handoff desktop notification — exponential backoff retry, 30-min session timeout',
          ],
          changed: [
            'Core API image reduced from ~2GB to ~250MB — ML dependencies isolated in engine container (~1.5GB)',
            'Docker Compose architecture: postgres + engine + api + frontend (4 containers)',
          ],
        },
        {
          version: '1.2.0',
          date: '2026-03-20',
          added: [],
          fixed: [],
          changed: [
            'Liveness system: removed dead MediaPipe code path, renamed MultiFrame → HeadTurn',
            'Malformed liveness_metadata now returns HTTP 400 (VALIDATION_ERROR) instead of silently falling back to passive mode',
            'Removed legacy multi_frame_color challenge type alias — only head_turn is accepted',
            'color_sequence field is now optional (clients no longer need to send it)',
          ],
        },
        {
          version: '1.1.0',
          date: '2026-03-19',
          added: [
            'Visual authenticity checks — FFT analysis, color distribution, zone validation, deepfake detection',
            'Webhook resend endpoint (POST /api/developer/webhooks/:id/deliveries/:did/resend)',
            'Per-API-key scoping for webhook endpoints',
            'Developer-configurable LLM fallback for OCR with date disambiguation',
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
          changed: [],
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
            {release.version === '1.7.0' && <Pill color={C.green} bg={C.greenDim}>latest</Pill>}
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
          { icon: '🔍', title: 'Review Dashboard', desc: 'Review, approve, and manage verifications with your team', href: '/docs/review', cta: 'View Guide →' },
          { icon: '🎮', title: 'Live Demo', desc: 'Try the full verification flow with a sandbox key', href: '/demo', cta: 'Open Demo →' },
          { icon: '📦', title: 'JavaScript SDK', desc: 'TypeScript SDK with real-time events and embed component', href: 'https://www.npmjs.com/package/@idswyft/sdk', cta: 'npm install @idswyft/sdk' },
          { icon: '🔧', title: 'GitHub', desc: 'Source code, examples, and issue tracker', href: 'https://github.com/team-idswyft/idswyft', cta: 'View on GitHub →' },
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

    </DocLayout>
  );
};
