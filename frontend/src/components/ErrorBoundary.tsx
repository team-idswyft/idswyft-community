import React from 'react';
import { C } from '../theme';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: C.bg,
          padding: 32,
        }}>
          <div style={{
            maxWidth: 480,
            textAlign: 'center',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 40,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#x26A0;</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: C.sans }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, fontFamily: C.sans, lineHeight: 1.5 }}>
              This page encountered an error. Try refreshing or navigating back.
            </p>
            {this.state.error && (
              <pre style={{
                fontSize: 12,
                fontFamily: C.mono,
                color: '#f87171',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.15)',
                borderRadius: 8,
                padding: 16,
                textAlign: 'left',
                overflow: 'auto',
                maxHeight: 120,
                marginBottom: 20,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: C.cyan,
                  color: C.bg,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: C.sans,
                }}
              >
                Refresh Page
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  color: C.muted,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: C.sans,
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
