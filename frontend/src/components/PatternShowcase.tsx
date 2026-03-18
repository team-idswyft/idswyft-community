/**
 * Pattern Showcase — preview all security-document-inspired patterns.
 *
 * Run the dev server and navigate to wherever you mount this component
 * to see every pattern at different intensities.
 *
 * Usage in any page:
 *   import { PatternShowcase } from '../components/PatternShowcase';
 *   <PatternShowcase />
 *
 * Usage of individual patterns:
 *   import '../styles/patterns.css';
 *   <section className="pattern-guilloche pattern-subtle">
 *     <h2>Your content here</h2>
 *   </section>
 */

import { C } from '../theme';
import '../styles/patterns.css';

const patterns = [
  {
    name: 'Guilloche',
    className: 'pattern-guilloche',
    description: 'Flowing sine-wave mesh — classic security document pattern',
  },
  {
    name: 'Crosshatch',
    className: 'pattern-crosshatch',
    description: 'Diagonal fine-line grid — currency & bond texture',
  },
  {
    name: 'Topographic',
    className: 'pattern-topographic',
    description: 'Concentric contour lines — like the VT mountain backdrop',
  },
  {
    name: 'Fingerprint',
    className: 'pattern-fingerprint',
    description: 'Concentric loops — on-brand for identity verification',
  },
  {
    name: 'Microprint',
    className: 'pattern-microprint',
    description: 'Fine horizontal parallel lines — microprint texture',
  },
  {
    name: 'Wave',
    className: 'pattern-wave',
    description: 'Horizontal wavy bands — subtle flowing motion',
  },
  {
    name: 'Shield',
    className: 'pattern-shield',
    description: 'Hexagonal security grid — protective mesh',
  },
  {
    name: 'Diagonal Wave',
    className: 'pattern-diagonal-wave',
    description: 'Flowing diagonal lines — rising from bottom-left to top-right',
  },
];

const intensities = [
  { label: 'Faint', className: 'pattern-faint', opacity: '0.02' },
  { label: 'Subtle', className: 'pattern-subtle', opacity: '0.04' },
  { label: 'Visible', className: 'pattern-visible', opacity: '0.08' },
];

export function PatternShowcase() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '48px 24px' }}>
      {/* Header */}
      <div style={{ maxWidth: 960, margin: '0 auto 48px' }}>
        <h1
          style={{
            fontFamily: C.mono,
            color: C.cyan,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Pattern Library
        </h1>
        <h2
          style={{
            fontFamily: C.sans,
            color: C.text,
            fontSize: 32,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Security Document Patterns
        </h2>
        <p style={{ fontFamily: C.sans, color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>
          Subtle background textures inspired by government ID guilloche, crosshatch,
          and microprint. Designed for the dark theme — apply to any section with a
          single CSS class.
        </p>
      </div>

      {/* Pattern grid */}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {patterns.map((pattern) => (
          <div key={pattern.name} style={{ marginBottom: 56 }}>
            {/* Pattern name */}
            <div style={{ marginBottom: 16 }}>
              <h3
                style={{
                  fontFamily: C.sans,
                  color: C.text,
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {pattern.name}
              </h3>
              <p style={{ fontFamily: C.sans, color: C.muted, fontSize: 13 }}>
                {pattern.description}
              </p>
              <code
                style={{
                  fontFamily: C.mono,
                  color: C.cyan,
                  fontSize: 12,
                  background: C.codeBg,
                  padding: '2px 8px',
                  borderRadius: 4,
                  display: 'inline-block',
                  marginTop: 8,
                }}
              >
                className="{pattern.className}"
              </code>
            </div>

            {/* Three intensity columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {intensities.map((intensity) => (
                <div
                  key={intensity.label}
                  className={`${pattern.className} ${intensity.className} pattern-full`}
                  style={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    height: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontFamily: C.mono,
                      color: C.muted,
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {intensity.label}
                  </span>
                  <span
                    style={{
                      fontFamily: C.mono,
                      color: C.dim,
                      fontSize: 10,
                      marginTop: 4,
                    }}
                  >
                    opacity: {intensity.opacity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Animated demo */}
        <div style={{ marginBottom: 56 }}>
          <h3
            style={{
              fontFamily: C.sans,
              color: C.text,
              fontSize: 20,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Animated + Fade
          </h3>
          <p style={{ fontFamily: C.sans, color: C.muted, fontSize: 13, marginBottom: 16 }}>
            Add <code style={{ color: C.cyan, fontFamily: C.mono, fontSize: 12 }}>pattern-animate</code>{' '}
            for slow drift, <code style={{ color: C.cyan, fontFamily: C.mono, fontSize: 12 }}>pattern-fade-edges</code>{' '}
            for vignette fade
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div
              className="pattern-guilloche pattern-visible pattern-animate pattern-full"
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 12 }}>
                guilloche + animate
              </span>
            </div>
            <div
              className="pattern-fingerprint pattern-visible pattern-animate-slow pattern-fade-edges pattern-full"
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 12 }}>
                fingerprint + fade-edges
              </span>
            </div>
          </div>
        </div>

        {/* Real-world usage example */}
        <div style={{ marginBottom: 56 }}>
          <h3
            style={{
              fontFamily: C.sans,
              color: C.text,
              fontSize: 20,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Real-World Example
          </h3>
          <p style={{ fontFamily: C.sans, color: C.muted, fontSize: 13, marginBottom: 16 }}>
            A hero section with the fingerprint pattern and edge fade
          </p>

          <div
            className="pattern-fingerprint pattern-subtle pattern-fade-edges pattern-full"
            style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 24,
              padding: '64px 48px',
              textAlign: 'center',
              overflow: 'hidden',
            }}
          >
            <p
              style={{
                fontFamily: C.mono,
                color: C.cyan,
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Identity Verification
            </p>
            <h2
              style={{
                fontFamily: C.sans,
                color: C.text,
                fontSize: 36,
                fontWeight: 600,
                marginBottom: 16,
                lineHeight: 1.2,
              }}
            >
              Verify identities.<br />
              In minutes, not days.
            </h2>
            <p
              style={{
                fontFamily: C.sans,
                color: C.muted,
                fontSize: 16,
                maxWidth: 480,
                margin: '0 auto 32px',
                lineHeight: 1.6,
              }}
            >
              Open-source document verification with OCR, liveness detection,
              and face matching. One API call to verify.
            </p>
            <button
              style={{
                fontFamily: C.sans,
                fontWeight: 600,
                fontSize: 14,
                color: '#080c14',
                background: C.cyan,
                border: 'none',
                borderRadius: 10,
                padding: '12px 32px',
                cursor: 'pointer',
              }}
            >
              Get API Key
            </button>
          </div>
        </div>

        {/* Integration guide */}
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '32px',
            marginBottom: 48,
          }}
        >
          <h3
            style={{
              fontFamily: C.sans,
              color: C.text,
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Quick Integration
          </h3>
          <pre
            style={{
              fontFamily: C.mono,
              fontSize: 13,
              color: C.code,
              background: C.codeBg,
              padding: 20,
              borderRadius: 10,
              overflow: 'auto',
              lineHeight: 1.7,
            }}
          >
{`// 1. Import the CSS (once, in your root)
import '../styles/patterns.css';

// 2. Add pattern class to any container
<section className="pattern-guilloche pattern-subtle">
  <h1>Your content here</h1>
</section>

// 3. Optional modifiers
<div className="pattern-fingerprint pattern-visible pattern-animate pattern-fade-edges">
  {/* Animated pattern with vignette fade */}
</div>

// Available patterns:
//   pattern-guilloche    — sine-wave mesh
//   pattern-crosshatch   — diagonal grid
//   pattern-topographic  — contour lines
//   pattern-fingerprint  — concentric loops
//   pattern-microprint   — horizontal lines
//   pattern-wave         — wavy bands
//   pattern-shield       — hexagonal grid

// Intensity:  pattern-faint | pattern-subtle | pattern-visible
// Animation:  pattern-animate | pattern-animate-slow
// Masking:    pattern-full | pattern-fade-bottom | pattern-fade-edges`}
          </pre>
        </div>
      </div>
    </div>
  );
}
