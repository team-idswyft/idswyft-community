import React from 'react';
import { C } from '../../../theme';

export const TerminalWindow: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title = 'Terminal', children }) => (
  <div
    style={{
      background: C.codeBg,
      borderRadius: 12,
      border: `1px solid ${C.borderStrong}`,
      overflow: 'hidden',
      fontFamily: C.mono,
      fontSize: 15,
      lineHeight: 1.7,
    }}
  >
    {/* Title bar */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
      <span
        style={{
          marginLeft: 8,
          fontFamily: C.sans,
          fontSize: 12,
          color: C.muted,
          fontWeight: 500,
        }}
      >
        {title}
      </span>
    </div>
    {/* Content */}
    <div style={{ padding: '16px 20px', color: C.text }}>{children}</div>
  </div>
);
