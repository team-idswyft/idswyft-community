import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C } from '../../../theme';
import { CodeEditor, LINE_HEIGHT } from './CodeEditor';

/** Condensed integration code for the video */
const CODE = `const BASE = 'https://idswyft.app';
const KEY  = 'idv_sk_live_7f3a9c...x2b1';
const headers = { 'X-API-Key': KEY };

// 1. Initialize verification session
const { verification_id } = await fetch(
  \`\${BASE}/api/v2/verify/initialize\`,
  { method: 'POST', headers: { ...headers,
    'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'u-123' })
  }).then(r => r.json());

// 2. Upload front document
const fd1 = new FormData();
fd1.append('document_type', 'drivers_license');
fd1.append('document', frontFile);
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/front-document\`,
  { method: 'POST', headers, body: fd1 });

// 3. Upload back document
const fd2 = new FormData();
fd2.append('document', backFile);
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/back-document\`,
  { method: 'POST', headers, body: fd2 });

// 4. Submit live capture
const fd3 = new FormData();
fd3.append('selfie', captureBlob, 'capture.jpg');
await fetch(\`\${BASE}/api/v2/verify/\${verification_id}/live-capture\`,
  { method: 'POST', headers, body: fd3 });

// 5. Poll for final result
let r;
do {
  await new Promise(ok => setTimeout(ok, 2000));
  r = await fetch(
    \`\${BASE}/api/v2/verify/\${verification_id}/status\`,
    { headers }).then(r => r.json());
} while (!r.final_result);

console.log(r.final_result); // 'verified'`;

// ─── Step definitions with character thresholds and line ranges ─────────────

interface Step {
  chars: number;        // char count where this step completes
  label: string;
  response: string;
  lineRange: [number, number]; // 0-indexed lines to highlight
}

const STEPS: Step[] = [
  {
    chars: 280,
    label: '1/5 Session Created',
    response: '{ "verification_id": "v-9f3a..." }',
    lineRange: [4, 11],
  },
  {
    chars: 520,
    label: '2/5 Front Document Uploaded',
    response: '{ "status": "processing_front" }',
    lineRange: [13, 18],
  },
  {
    chars: 690,
    label: '3/5 Back Document Uploaded',
    response: '{ "status": "processing_back" }',
    lineRange: [20, 24],
  },
  {
    chars: 870,
    label: '4/5 Live Capture Submitted',
    response: '{ "status": "processing_face" }',
    lineRange: [26, 30],
  },
  {
    chars: 1080,
    label: '5/5 Verification Complete',
    response: '{ "final_result": "verified", "score": 0.97 }',
    lineRange: [32, 41],
  },
];

const TYPING_SPEED = 1.0; // chars per frame — human-like pace
const PAUSE_FRAMES = 35;  // ~1.2s pause after each step for response to appear

/**
 * Compute visible chars with pauses at step boundaries.
 * Typing progresses at TYPING_SPEED, then pauses for PAUSE_FRAMES
 * after each step completes, giving time for the response card.
 */
function getVisibleChars(frame: number): number {
  let chars = 0;
  let f = 0;

  for (const step of STEPS) {
    const charsNeeded = step.chars - chars;
    const typingFrames = Math.ceil(charsNeeded / TYPING_SPEED);

    if (frame <= f + typingFrames) {
      return chars + (frame - f) * TYPING_SPEED;
    }
    f += typingFrames;
    chars = step.chars;

    // Pause — hold at current chars
    if (frame <= f + PAUSE_FRAMES) {
      return chars;
    }
    f += PAUSE_FRAMES;
  }

  // After all steps, continue typing remaining code
  return Math.min(chars + (frame - f) * TYPING_SPEED, CODE.length);
}

/** Get the current line count from visible chars */
function getCurrentLine(visibleChars: number): number {
  return CODE.slice(0, Math.floor(visibleChars)).split('\n').length - 1;
}

/** Find which step is currently active (being typed or just completed) */
function getActiveStepIndex(visibleChars: number): number {
  for (let i = 0; i < STEPS.length; i++) {
    if (visibleChars < STEPS[i].chars) return i;
  }
  return STEPS.length - 1;
}

export const CodeIntegrationScene: React.FC = () => {
  const frame = useCurrentFrame();

  const visibleChars = getVisibleChars(frame);
  const currentLine = getCurrentLine(visibleChars);
  const activeStep = getActiveStepIndex(visibleChars);
  const completedSteps = STEPS.filter((s) => visibleChars >= s.chars);

  // Scroll to keep cursor line in the upper third of view
  const targetScrollY = Math.max(0, (currentLine - 6) * LINE_HEIGHT);

  // Highlight the active step's line range
  const highlightRange = STEPS[activeStep]?.lineRange;

  // Section label for current step
  const stepLabel = activeStep < STEPS.length
    ? `Step ${activeStep + 1} of 5`
    : 'Complete';

  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Is the cursor actively typing (not paused)?
  const isTyping = visibleChars < CODE.length && getVisibleChars(frame + 1) > visibleChars;

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        display: 'flex',
        padding: '28px 36px',
        gap: 20,
      }}
    >
      {/* Keyboard typing sound — plays for entire scene, volume tied to typing */}
      <Audio
        src={staticFile('narration/keyboard-typing.wav')}
        volume={isTyping ? 0.35 : 0}
      />
      {/* Left: Code editor with zoom (62%) */}
      <div style={{ flex: 62, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Section label above editor */}
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            color: C.cyan,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
            opacity: labelOpacity,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: C.cyan,
              display: 'inline-block',
              boxShadow: `0 0 6px ${C.cyan}`,
            }}
          />
          {stepLabel}
        </div>

        {/* Zoomed code editor */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              transform: 'scale(1.25)',
              transformOrigin: 'top left',
              width: '80%',    // 1/1.25 = 80% to fill container after scale
              height: '80%',
            }}
          >
            <CodeEditor
              code={CODE}
              visibleChars={visibleChars}
              scrollY={targetScrollY}
              highlightRange={highlightRange}
              showCursor
            />
          </div>
        </div>
      </div>

      {/* Right: Response panel (38%) */}
      <div
        style={{
          flex: 38,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingTop: 28,
        }}
      >
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          API Responses
        </div>

        {completedSteps.map((step, i) => {
          // Calculate when this step completed (frame-wise)
          let completionFrame = 0;
          let c = 0;
          for (let j = 0; j <= i; j++) {
            const needed = STEPS[j].chars - c;
            completionFrame += Math.ceil(needed / TYPING_SPEED);
            c = STEPS[j].chars;
            if (j < i) completionFrame += PAUSE_FRAMES;
          }

          const elapsed = frame - completionFrame;
          const slideY = interpolate(elapsed, [0, 12], [24, 0], { extrapolateRight: 'clamp' });
          const opacity = interpolate(elapsed, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

          return (
            <div
              key={i}
              style={{
                opacity,
                transform: `translateY(${slideY}px)`,
                background: C.surface,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                padding: '8px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill={C.green} opacity={0.15} />
                  <path d="M5 8l2 2 4-4" stroke={C.green} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontFamily: C.sans, fontSize: 12, color: C.text, fontWeight: 600 }}>
                  {step.label}
                </span>
              </div>
              <div
                style={{
                  fontFamily: C.mono,
                  fontSize: 10,
                  color: C.muted,
                  background: C.codeBg,
                  borderRadius: 4,
                  padding: '4px 8px',
                }}
              >
                {step.response}
              </div>
            </div>
          );
        })}

        {completedSteps.length === 0 && (
          <div
            style={{
              fontFamily: C.sans,
              fontSize: 13,
              color: C.dim,
              fontStyle: 'italic',
              marginTop: 40,
              textAlign: 'center',
            }}
          >
            Responses will appear here...
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
