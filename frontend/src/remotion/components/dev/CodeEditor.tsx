import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../../../theme';

const KEYWORDS = new Set([
  'const', 'let', 'await', 'async', 'new', 'return', 'if', 'else',
  'true', 'false', 'null', 'do', 'while', 'throw',
]);
const FUNCTIONS = new Set([
  'fetch', 'FormData', 'JSON', 'stringify', 'console', 'log', 'Promise', 'setTimeout',
]);

/** Colourize a single token */
const tokenColor = (t: string): string => {
  const clean = t.replace(/[()[\]{}.,:;=!]/g, '');
  if (/^["'`]/.test(clean)) return C.amber;
  if (/^\d+$/.test(clean)) return C.orange;
  if (KEYWORDS.has(clean)) return C.cyan;
  if (FUNCTIONS.has(clean)) return C.green;
  return C.text;
};

/** Highlight one line with basic token colouring */
const HighlightLine: React.FC<{ line: string }> = ({ line }) => {
  const commentIdx = line.indexOf('//');
  const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const comment = commentIdx >= 0 ? line.slice(commentIdx) : '';

  const tokens = code.split(/(\s+|[()[\]{}.,:;=!><]+|"[^"]*"|'[^']*'|`[^`]*`)/).filter(Boolean);

  return (
    <>
      {tokens.map((tok, i) =>
        /^\s+$/.test(tok) ? (
          <span key={i} style={{ whiteSpace: 'pre' }}>{tok}</span>
        ) : (
          <span key={i} style={{ color: tokenColor(tok) }}>{tok}</span>
        )
      )}
      {comment && <span style={{ color: C.dim }}>{comment}</span>}
    </>
  );
};

const LINE_HEIGHT = 22;

export { LINE_HEIGHT };

/** Blinking block cursor */
const Cursor: React.FC = () => {
  const frame = useCurrentFrame();
  // Blink every 15 frames (~0.5s at 30fps)
  const visible = frame % 30 < 15;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 16,
        background: C.cyan,
        verticalAlign: 'middle',
        marginLeft: 1,
        opacity: visible ? 0.9 : 0,
        boxShadow: visible ? `0 0 8px ${C.cyan}60` : 'none',
      }}
    />
  );
};

export const CodeEditor: React.FC<{
  code: string;
  visibleChars: number;
  fileName?: string;
  /** Vertical scroll offset in px (applied to code area) */
  scrollY?: number;
  /** Line range to highlight with a subtle glow [start, end] (0-indexed) */
  highlightRange?: [number, number];
  /** Show blinking cursor at end of text */
  showCursor?: boolean;
}> = ({ code, visibleChars, fileName = 'integration.js', scrollY = 0, highlightRange, showCursor = false }) => {
  const visible = code.slice(0, Math.floor(visibleChars));
  const lines = visible.split('\n');
  const lastLineIdx = lines.length - 1;

  return (
    <div
      style={{
        background: C.codeBg,
        borderRadius: 12,
        border: `1px solid ${C.borderStrong}`,
        overflow: 'hidden',
        fontFamily: C.mono,
        fontSize: 13,
        lineHeight: 1.7,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          padding: '8px 16px',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12,
          color: C.cyan,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {fileName}
      </div>
      {/* Code area — scrollable via transform */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            padding: '12px 0',
            transform: `translateY(${-scrollY}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {lines.map((line, i) => {
            const isHighlighted =
              highlightRange && i >= highlightRange[0] && i <= highlightRange[1];
            const isLastLine = i === lastLineIdx;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '0 16px',
                  minHeight: LINE_HEIGHT,
                  background: isHighlighted ? `${C.cyan}08` : 'transparent',
                  borderLeft: isHighlighted ? `2px solid ${C.cyan}40` : '2px solid transparent',
                }}
              >
                <span
                  style={{
                    width: 36,
                    textAlign: 'right',
                    color: isHighlighted ? C.cyan : C.dim,
                    marginRight: 16,
                    userSelect: 'none',
                    flexShrink: 0,
                    fontSize: 12,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ whiteSpace: 'pre' }}>
                  <HighlightLine line={line} />
                  {showCursor && isLastLine && <Cursor />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
