import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Syne';
import { C } from '../../../theme';
import { TerminalWindow } from './TerminalWindow';

const { fontFamily: syne } = loadFont();

const COMMAND = `curl -X POST https://idswyft.app/api/developer/register \\
  -H "Content-Type: application/json" \\
  -d '{"email": "dev@example.com", "company": "Acme"}'`;

const RESPONSE = JSON.stringify(
  { success: true, api_key: 'ik_7f3a9c2e8b1d...x2b1', developer_id: 'dev_8k2m...' },
  null,
  2,
);

export const RegisterScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Type command at ~2 chars/frame
  const cmdChars = Math.min(Math.floor(frame * 2), COMMAND.length);
  const showResponse = frame > 80;
  const responseSlide = showResponse
    ? interpolate(frame, [80, 95], [30, 0], { extrapolateRight: 'clamp' })
    : 30;
  const responseOpacity = showResponse
    ? interpolate(frame, [80, 95], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  // API key glow
  const keyGlow = showResponse
    ? interpolate(Math.sin((frame - 80) * 0.1), [-1, 1], [0.4, 1])
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 80px',
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontFamily: syne,
          fontSize: 18,
          fontWeight: 600,
          color: C.muted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 20,
        }}
      >
        Step 1 — Register
      </div>

      <div style={{ width: '100%', maxWidth: 900 }}>
        <TerminalWindow title="bash">
          {/* Prompt + command */}
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ color: C.green }}>$ </span>
            <span style={{ color: C.text }}>{COMMAND.slice(0, cmdChars)}</span>
            {cmdChars < COMMAND.length && (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 18,
                  background: C.cyan,
                  verticalAlign: 'middle',
                  opacity: frame % 16 < 8 ? 1 : 0,
                }}
              />
            )}
          </div>

          {/* Response */}
          {showResponse && (
            <div
              style={{
                marginTop: 16,
                opacity: responseOpacity,
                transform: `translateY(${responseSlide}px)`,
              }}
            >
              <div style={{ color: C.dim, marginBottom: 4 }}>{'// Response'}</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {RESPONSE.split('\n').map((line, i) => {
                  const isKeyLine = line.includes('api_key');
                  return (
                    <div
                      key={i}
                      style={{
                        color: isKeyLine ? C.cyan : C.text,
                        textShadow: isKeyLine ? `0 0 ${12 * keyGlow}px ${C.cyan}` : 'none',
                        fontWeight: isKeyLine ? 600 : 400,
                      }}
                    >
                      {line}
                    </div>
                  );
                })}
              </pre>
            </div>
          )}
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};
