import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { C } from '../theme';

// ── Section anchor scroll on mount / hash change ─────────────────────────────

function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [hash]);
}

// ── Reusable pieces ──────────────────────────────────────────────────────────

const SectionHeading = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2
    id={id}
    style={{
      fontFamily: C.mono,
      fontSize: '1.35rem',
      fontWeight: 600,
      color: 'var(--accent-ink)',
      marginBottom: 8,
      paddingTop: 80, // offset for fixed nav
      marginTop: -60,
      letterSpacing: '-0.01em',
    }}
  >
    {children}
  </h2>
);

const SubHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontFamily: C.mono, fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink)', marginTop: 28, marginBottom: 8 }}>
    {children}
  </h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontFamily: C.sans, fontSize: '0.9rem', color: 'var(--mid)', lineHeight: 1.75, marginBottom: 14 }}>
    {children}
  </p>
);

const UL = ({ items }: { items: string[] }) => (
  <ul style={{ paddingLeft: 20, marginBottom: 14 }}>
    {items.map((item, i) => (
      <li key={i} style={{ fontFamily: C.sans, fontSize: '0.9rem', color: 'var(--mid)', lineHeight: 1.75, marginBottom: 4, listStyleType: 'disc' }}>
        {item}
      </li>
    ))}
  </ul>
);

const Divider = () => (
  <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '48px 0' }} />
);

const LAST_UPDATED = 'March 22, 2026';

// ── Tab navigation ───────────────────────────────────────────────────────────

const sections = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'gdpr', label: 'GDPR Compliance' },
] as const;

function TabBar() {
  const { hash } = useLocation();
  const active = hash?.slice(1) || 'privacy';

  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', marginBottom: 40 }}>
      {sections.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 16px',
              fontFamily: C.mono,
              fontSize: '0.75rem',
              fontWeight: 500,
              letterSpacing: '0.04em',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
              background: isActive ? 'var(--panel)' : 'transparent',
              color: isActive ? 'var(--accent-ink)' : 'var(--mid)',
              borderBottom: isActive ? '2px solid var(--ink)' : '2px solid transparent',
              borderRight: '1px solid var(--rule)',
            }}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LegalPage() {
  useScrollToHash();

  return (
    <div style={{ minHeight: '100vh', paddingTop: 100, paddingBottom: 80 }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <span className="eyebrow" style={{ color: 'var(--accent-ink)' }}>
            idswyft / legal
          </span>
        </div>
        <h1 style={{
          fontFamily: C.mono,
          fontSize: '2rem',
          fontWeight: 500,
          color: 'var(--ink)',
          marginBottom: 8,
          letterSpacing: '-0.02em',
        }}>
          Legal
        </h1>
        <P>Last updated: {LAST_UPDATED}</P>

        <TabBar />

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* Privacy Policy                                                    */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <SectionHeading id="privacy">Privacy Policy</SectionHeading>

        <P>
          Idswyft ("we", "our", "us") is committed to protecting the privacy of developers
          and end users who interact with our identity verification platform. This policy
          describes how we collect, use, store, and protect personal information.
        </P>

        <SubHeading>Information We Collect</SubHeading>
        <UL items={[
          'Account information: email address, name, and company name when you register as a developer.',
          'Identity documents: government-issued IDs uploaded for verification (passport, driver\'s license, national ID).',
          'Biometric data: facial images captured during live capture for face matching.',
          'Usage data: API call logs, verification request metadata, timestamps, and IP addresses.',
          'Device information: browser type, operating system, and device identifiers during verification sessions.',
        ]} />

        <SubHeading>How We Use Your Information</SubHeading>
        <UL items={[
          'To process identity verification requests submitted through our API.',
          'To detect fraud and prevent abuse of our verification services.',
          'To improve our OCR, document recognition, and face matching accuracy.',
          'To communicate important service updates, security alerts, and account information.',
          'To generate anonymized, aggregate analytics for platform monitoring.',
        ]} />

        <SubHeading>Data Storage & Security</SubHeading>
        <P>
          On Idswyft Cloud (idswyft.app), identity documents and biometric data are stored with
          AES-256 server-side encryption at rest. Application-layer encryption additionally protects
          stored secrets such as API keys and webhook signing keys. Data is transmitted exclusively
          over HTTPS/TLS 1.3. We store verification data only for the duration required by your
          configured retention policy (default: 30 days), after which it is permanently deleted.
        </P>
        <P>
          Self-hosted deployments (community edition) ship with local filesystem storage by default;
          operators are responsible for configuring encryption at rest, either via filesystem-level
          encryption (LUKS, dm-crypt, EBS volume encryption) or by switching to S3-compatible storage
          with server-side encryption enabled.
        </P>

        <SubHeading>Third-Party Sharing</SubHeading>
        <P>
          We do not sell personal data. We share information only with: (1) the developer/organization
          that initiated the verification request, (2) infrastructure providers necessary for service
          operation (hosting, database), and (3) law enforcement when required by law.
        </P>

        <SubHeading>Your Rights</SubHeading>
        <P>
          You may request access to, correction of, or deletion of your personal data at any time by
          contacting us at <a href="mailto:privacy@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>privacy@idswyft.app</a>.
          For GDPR-specific rights, see the GDPR Compliance section below.
        </P>

        <Divider />

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* Terms of Service                                                  */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <SectionHeading id="terms">Terms of Service</SectionHeading>

        <P>
          By accessing or using the Idswyft API, dashboard, or verification services, you agree
          to be bound by these Terms of Service. If you do not agree, do not use our services.
        </P>

        <SubHeading>1. Account & API Access</SubHeading>
        <P>
          You must register for a developer account to access the Idswyft API. You are responsible for
          maintaining the confidentiality of your API keys and for all activity that occurs under your
          account. You must notify us immediately of any unauthorized use.
        </P>

        <SubHeading>2. Acceptable Use</SubHeading>
        <P>You agree not to:</P>
        <UL items={[
          'Use the service for any unlawful purpose or to facilitate identity fraud.',
          'Attempt to reverse-engineer, decompile, or extract source code from our verification pipeline.',
          'Submit fabricated or manipulated documents to test or exploit our verification system.',
          'Exceed rate limits or use automated tools to abuse the API beyond your plan\'s allocation.',
          'Resell or redistribute API access without a written agreement.',
        ]} />

        <SubHeading>3. Service Level & Availability</SubHeading>
        <P>
          We strive for high availability but do not guarantee uninterrupted service. Scheduled
          maintenance windows will be communicated in advance. Our system status is available at{' '}
          <a href="/status" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>idswyft.app/status</a>.
        </P>

        <SubHeading>4. Verification Accuracy</SubHeading>
        <P>
          While we target &gt;90% document validation accuracy, verification results are probabilistic
          and should not be the sole basis for critical decisions. We recommend implementing manual
          review workflows for edge cases. Idswyft is not liable for decisions made solely based on
          automated verification results.
        </P>

        <SubHeading>5. Data Retention & Deletion</SubHeading>
        <P>
          Verification data is retained according to your organization's configured retention period
          (default: 30 days). You may request early deletion of specific records via the API or admin
          dashboard. Upon account termination, all associated data is deleted within 30 days.
        </P>

        <SubHeading>6. Limitation of Liability</SubHeading>
        <P>
          To the maximum extent permitted by law, Idswyft shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages arising from your use of the service,
          including but not limited to loss of profits, data, or business opportunities.
        </P>

        <SubHeading>7. Termination</SubHeading>
        <P>
          We may suspend or terminate your access if you violate these Terms, engage in abusive behavior,
          or fail to pay applicable fees. You may terminate your account at any time through the developer
          dashboard. Termination does not relieve you of obligations incurred prior to termination.
        </P>

        <SubHeading>8. Changes to Terms</SubHeading>
        <P>
          We may update these Terms from time to time. Material changes will be communicated via email
          to registered developers at least 30 days before taking effect. Continued use after changes
          constitutes acceptance.
        </P>

        <Divider />

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* GDPR Compliance                                                   */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <SectionHeading id="gdpr">GDPR Compliance</SectionHeading>

        <P>
          Idswyft is committed to compliance with the General Data Protection Regulation (EU) 2016/679.
          This section outlines how we handle personal data for users in the European Economic Area (EEA).
        </P>

        <SubHeading>Legal Basis for Processing</SubHeading>
        <P>We process personal data under the following legal bases:</P>
        <UL items={[
          'Contractual necessity: processing verification requests as part of the service you signed up for.',
          'Legitimate interest: fraud prevention, service security, and platform improvement.',
          'Consent: where explicitly provided, such as optional biometric face matching.',
          'Legal obligation: compliance with applicable laws and regulations.',
        ]} />

        <SubHeading>Data Processing Roles</SubHeading>
        <P>
          When you (the developer/organization) use Idswyft to verify your users' identities, you act
          as the <strong style={{ color: 'var(--ink)' }}>Data Controller</strong> and Idswyft acts as the{' '}
          <strong style={{ color: 'var(--ink)' }}>Data Processor</strong>. We process data solely on your
          instructions and in accordance with our Data Processing Agreement (DPA).
        </P>

        <SubHeading>Data Subject Rights</SubHeading>
        <P>Under GDPR, individuals whose data we process have the right to:</P>
        <UL items={[
          'Access: request a copy of personal data we hold about them.',
          'Rectification: request correction of inaccurate personal data.',
          'Erasure ("right to be forgotten"): request deletion of personal data.',
          'Restriction: request that we limit processing of their data.',
          'Portability: receive personal data in a structured, machine-readable format.',
          'Object: object to processing based on legitimate interest.',
        ]} />
        <P>
          To exercise these rights, contact us at{' '}
          <a href="mailto:gdpr@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>gdpr@idswyft.app</a>.
          We respond to all requests within 30 days.
        </P>

        <SubHeading>Data Retention</SubHeading>
        <P>
          Identity documents and biometric data are retained only for the verification session duration
          plus your configured retention period (default: 30 days). After this period, all personal data
          is permanently and irreversibly deleted from our systems, including backups.
        </P>

        <SubHeading>International Transfers</SubHeading>
        <P>
          When personal data is transferred outside the EEA, we ensure appropriate safeguards are in
          place, including Standard Contractual Clauses (SCCs) approved by the European Commission.
        </P>

        <SubHeading>Data Processing Agreement</SubHeading>
        <P>
          We offer a pre-signed DPA to all customers processing EEA personal data through our platform.
          To request a copy, contact{' '}
          <a href="mailto:legal@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>legal@idswyft.app</a>.
        </P>

        <SubHeading>Data Protection Officer</SubHeading>
        <P>
          For GDPR-related inquiries, you may contact our Data Protection team at{' '}
          <a href="mailto:dpo@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>dpo@idswyft.app</a>.
        </P>

        <SubHeading>CCPA (California)</SubHeading>
        <P>
          California residents have additional rights under the California Consumer Privacy Act (CCPA),
          including the right to know what personal information is collected, the right to delete, and
          the right to opt out of the sale of personal information. We do not sell personal information.
          To exercise your CCPA rights, contact{' '}
          <a href="mailto:privacy@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>privacy@idswyft.app</a>.
        </P>

        {/* Bottom spacer + contact */}
        <Divider />
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--rule)',
          padding: '24px 28px',
        }}>
          <h3 style={{ fontFamily: C.mono, fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>
            Questions?
          </h3>
          <P>
            If you have questions about this legal documentation, contact us at{' '}
            <a href="mailto:legal@idswyft.app" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>legal@idswyft.app</a>.
          </P>
        </div>
      </div>
    </div>
  );
}
