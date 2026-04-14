import React, { useState } from 'react';
import { DocLayout, NavItem } from '../components/docs/DocLayout';
import {
  H2, Lead, Divider, SectionAnchor, Callout,
  FieldRow, Pre, Pill,
} from '../components/docs/shared';
import { getDocumentationApiUrl } from '../config/api';
import { C } from '../theme';
import '../styles/patterns.css';

const NAV: NavItem[] = [
  { id: 'sdk', label: 'JavaScript SDK', depth: 0 },
  { id: 'embed', label: 'Embed Component', depth: 0 },
];

export const DocsSdk: React.FC = () => {
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
    <DocLayout slug="docs/sdk" nav={NAV}>

      {/* ══ JAVASCRIPT SDK ════════════════════════════════════════════════ */}
      <SectionAnchor id="sdk" />
      <H2>JavaScript SDK</H2>
      <Lead>
        The official <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>@idswyft/sdk</code> wraps the REST API with TypeScript types,
        automatic error handling, and a real-time event emitter for tracking verification progress without manual polling.
      </Lead>

      <Pre label="Install" code={`npm install @idswyft/sdk`} />

      <Pre label="Initialize" code={`const { IdswyftSDK } = require('@idswyft/sdk');

const sdk = new IdswyftSDK({
  apiKey: 'ik_your_api_key',
  baseURL: '${apiUrl}',     // optional, defaults to your deployment's base URL
  sandbox: false,            // set true for sandbox mode
});`} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>SDK Methods</div>
        <div style={{ padding: '8px 20px' }}>
          {[
            { method: 'startVerification()', returns: 'InitializeResponse', desc: 'Create a new verification session' },
            { method: 'uploadFrontDocument()', returns: 'VerificationResult', desc: 'Upload front of ID for OCR extraction' },
            { method: 'uploadBackDocument()', returns: 'VerificationResult', desc: 'Upload back of ID for cross-validation' },
            { method: 'uploadSelfie()', returns: 'VerificationResult', desc: 'Submit live capture for face match' },
            { method: 'getVerificationStatus()', returns: 'VerificationResult', desc: 'Get full session status and results' },
            { method: 'watch()', returns: 'EventEmitter', desc: 'Real-time event stream (see below)' },
            { method: 'createBatch()', returns: 'BatchJobResponse', desc: 'Create batch verification job' },
            { method: 'uploadAddressDocument()', returns: 'AddressResult', desc: 'Upload proof-of-address document' },
            { method: 'createMonitoringSchedule()', returns: 'Schedule', desc: 'Schedule re-verification' },
          ].map(row => (
            <div key={row.method} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 140px 1fr', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.border}`, alignItems: 'baseline' }}>
              <code style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.cyan, whiteSpace: 'nowrap' }}>{row.method}</code>
              <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, whiteSpace: 'nowrap' }}>→ {row.returns}</code>
              <span style={{ fontFamily: C.sans, fontSize: '0.83rem', color: C.text, lineHeight: 1.6 }}>{row.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 style={{ fontFamily: C.mono, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '32px 0 8px' }}>
        <span style={{ color: C.green, fontWeight: 400 }}>→</span> Real-Time Events with <code style={{ color: C.cyan }}>watch()</code>
      </h3>
      <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
        Instead of writing polling loops, use <code style={{ fontFamily: C.mono, color: C.cyan }}>watch()</code> to get
        event-driven status updates. Polls at 2-second intervals by default, auto-stops on terminal states.
      </p>

      <Pre label="watch() usage" code={`const watcher = sdk.watch(verificationId);

// Listen for specific events
watcher.on('status_changed', (event) => {
  console.log('Status:', event.status);   // e.g. 'AWAITING_BACK'
});

watcher.on('step_completed', (event) => {
  console.log('Step', event.data.current_step, 'done');
});

watcher.on('verification_complete', (event) => {
  console.log('Verified!', event.data.final_result);
  // 'verified' | 'manual_review' | 'failed'
});

watcher.on('verification_failed', (event) => {
  console.log('Rejected:', event.data.rejection_reason);
});

// One-time listener
watcher.once('verification_complete', (event) => {
  redirectToSuccess(event.data.verification_id);
});

// Wildcard — catch everything
watcher.on('*', (event) => analytics.track(event.type));

// Clean up when done
watcher.destroy();`} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Event Types</div>
        <div style={{ padding: '8px 20px' }}>
          <FieldRow name="status_changed" type="event" req={false} desc="Fires on any status transition (e.g. AWAITING_FRONT → AWAITING_BACK)" />
          <FieldRow name="step_completed" type="event" req={false} desc="Fires when current_step increments (step 1→2, 2→3, etc.)" />
          <FieldRow name="verification_complete" type="event" req={false} desc="Terminal success — status reached COMPLETE" />
          <FieldRow name="verification_failed" type="event" req={false} desc="Terminal failure — status reached HARD_REJECTED" />
          <FieldRow name="error" type="event" req={false} desc="Polling or network error occurred" />
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Watch Options</div>
        <div style={{ padding: '8px 20px' }}>
          <FieldRow name="interval" type="number" req={false} desc="Polling interval in ms (default: 2000)" />
          <FieldRow name="maxAttempts" type="number" req={false} desc="Max poll attempts before auto-stop (default: 300 = 10 min)" />
        </div>
      </div>

      <Divider />

      {/* ══ EMBED COMPONENT ═══════════════════════════════════════════════ */}
      <SectionAnchor id="embed" />
      <H2>Embed Component</H2>
      <Lead>
        Drop a complete verification UI into your app with zero frontend code.{' '}
        <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>IdswyftEmbed</code> creates an iframe
        pointing to the hosted verification page and communicates results via <code style={{ fontFamily: C.mono, color: C.cyan, fontSize: '0.82rem' }}>postMessage</code>.
      </Lead>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          {
            title: 'Modal Mode',
            tag: { label: 'Default', color: C.green, bg: C.greenDim },
            desc: 'Full-screen overlay with backdrop. Best for trigger-based flows (e.g. "Verify Now" button).',
            features: ['Dark overlay backdrop', 'Close on backdrop click or ✕ button', 'Auto-removes on completion', 'Blocks page scroll while open'],
          },
          {
            title: 'Inline Mode',
            tag: { label: 'Container', color: C.blue, bg: C.blueDim },
            desc: 'Renders inside a DOM element you specify. Best for embedding within an existing page layout.',
            features: ['Fits your container', 'Custom width/height', 'No overlay or backdrop', 'Stays in page flow'],
          },
        ].map(opt => (
          <div key={opt.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

      <Pre label="Modal mode" code={`import { IdswyftEmbed } from '@idswyft/sdk';

const embed = new IdswyftEmbed({
  mode: 'modal',
  theme: 'dark',
});

// Open with a session token (from your backend)
embed.open(sessionToken, {
  onComplete: (result) => {
    console.log('Verified!', result.verificationId);
    console.log('Result:', result.finalResult);
  },
  onError: (error) => {
    console.error(error.code, error.message);
  },
  onStepChange: (step) => {
    console.log('Step', step.current, 'of', step.total);
  },
  onClose: () => {
    console.log('User closed the modal');
  },
});

// Programmatically close
embed.close();`} />

      <Pre label="Inline mode" code={`const embed = new IdswyftEmbed({
  mode: 'inline',
  container: '#verification-container',  // CSS selector or HTMLElement
  theme: 'dark',
  width: '100%',
  height: '700px',
});

embed.open(sessionToken, {
  onComplete: (result) => showSuccessMessage(result),
});`} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Embed Options</div>
        <div style={{ padding: '8px 20px' }}>
          <FieldRow name="mode" type="'modal' | 'inline'" req={false} desc="UI mode. Default: 'modal'" />
          <FieldRow name="container" type="string | HTMLElement" req={false} desc="Target element for inline mode. CSS selector or DOM element." />
          <FieldRow name="theme" type="'light' | 'dark'" req={false} desc="Color theme. Default: 'dark'" />
          <FieldRow name="width" type="string" req={false} desc="Iframe width. Default: '100%'" />
          <FieldRow name="height" type="string" req={false} desc="Iframe height. Default: '700px'" />
          <FieldRow name="closeOnBackdropClick" type="boolean" req={false} desc="Close modal on backdrop click. Default: true" />
          <FieldRow name="verificationUrl" type="string" req={false} desc="Base URL for hosted page. Default: https://verify.idswyft.app" />
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Callbacks</div>
        <div style={{ padding: '8px 20px' }}>
          <FieldRow name="onComplete" type="(result) => void" req={false} desc="Verification succeeded. Result includes verificationId, status, finalResult." />
          <FieldRow name="onError" type="(error) => void" req={false} desc="Verification failed. Error includes code and message." />
          <FieldRow name="onStepChange" type="(step) => void" req={false} desc="Step changed. Step includes current, total, and status." />
          <FieldRow name="onClose" type="() => void" req={false} desc="User closed the modal (modal mode only)." />
        </div>
      </div>

      <Callout type="tip">
        The embed component communicates via <code style={{ fontFamily: C.mono }}>postMessage</code> with a{' '}
        <code style={{ fontFamily: C.mono }}>source: 'idswyft-embed'</code> identifier. Messages are ignored if they
        don't match this source, so it's safe to use alongside other iframes.
      </Callout>

    </DocLayout>
  );
};
