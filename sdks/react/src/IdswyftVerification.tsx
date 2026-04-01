import { useRef, useEffect, useCallback } from 'react';
import type { IdswyftVerificationProps, EmbedMessage, VerificationResult, VerificationError } from './types';

/**
 * Drop-in React component for Idswyft identity verification.
 *
 * Renders an iframe-based verification flow in either modal (overlay) or
 * inline (embedded) mode. Communicates with the hosted verification page
 * via the postMessage API.
 *
 * @example Modal mode (renders a full-screen overlay)
 * ```tsx
 * <IdswyftVerification
 *   apiKey="ik_your_api_key"
 *   userId="user-123"
 *   mode="modal"
 *   onComplete={(result) => console.log('Verified!', result)}
 *   onClose={() => setShowVerification(false)}
 * />
 * ```
 *
 * @example Inline mode (renders within parent)
 * ```tsx
 * <IdswyftVerification
 *   apiKey="ik_your_api_key"
 *   userId="user-123"
 *   mode="inline"
 *   height="600px"
 *   onComplete={(result) => console.log('Verified!', result)}
 * />
 * ```
 */
export function IdswyftVerification({
  apiKey,
  userId,
  mode = 'inline',
  theme = 'dark',
  verificationUrl = 'https://idswyft.app',
  width = '100%',
  height = '700px',
  closeOnBackdropClick = true,
  documentType,
  onComplete,
  onError,
  onStepChange,
  onClose,
  className,
  style,
}: IdswyftVerificationProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callbacksRef = useRef({ onComplete, onError, onStepChange, onClose });

  // Keep callbacks ref fresh without re-running effects
  useEffect(() => {
    callbacksRef.current = { onComplete, onError, onStepChange, onClose };
  });

  // Build iframe URL
  const iframeSrc = (() => {
    const url = new URL('/user-verification', verificationUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('embed', 'true');
    url.searchParams.set('theme', theme);
    if (documentType) url.searchParams.set('document_type', documentType);
    return url.toString();
  })();

  // PostMessage handler
  const handleMessage = useCallback((event: MessageEvent) => {
    const expectedOrigin = new URL(verificationUrl).origin;
    if (event.origin !== expectedOrigin) return;

    const data = event.data as EmbedMessage;
    if (!data || data.source !== 'idswyft-embed') return;

    const cbs = callbacksRef.current;

    switch (data.type) {
      case 'complete':
        cbs.onComplete?.(data.payload as VerificationResult);
        break;
      case 'error':
        cbs.onError?.(data.payload as VerificationError);
        break;
      case 'step_change':
        cbs.onStepChange?.(data.payload);
        break;
      case 'close':
        cbs.onClose?.();
        break;
      case 'ready':
        break;
    }
  }, [verificationUrl]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const iframe = (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      style={{
        width: mode === 'modal' ? '100%' : width,
        height: mode === 'modal' ? '700px' : height,
        maxHeight: mode === 'modal' ? 'calc(90vh - 40px)' : undefined,
        border: 'none',
        borderRadius: '12px',
      }}
      allow="camera; microphone"
      title="Idswyft Identity Verification"
    />
  );

  // ── Inline mode ──────────────────────────────────────────
  if (mode === 'inline') {
    return (
      <div className={className} style={{ width, ...style }}>
        {iframe}
      </div>
    );
  }

  // ── Modal mode ───────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={closeOnBackdropClick ? (e) => {
        if (e.target === e.currentTarget) onClose?.();
      } : undefined}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          background: theme === 'dark' ? '#0a0e17' : '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          onClick={() => onClose?.()}
          style={{
            position: 'absolute',
            top: '8px',
            right: '12px',
            background: 'none',
            border: 'none',
            color: theme === 'dark' ? '#94a3b8' : '#64748b',
            fontSize: '24px',
            cursor: 'pointer',
            zIndex: 10,
            padding: '4px 8px',
            lineHeight: 1,
          }}
          aria-label="Close verification"
        >
          &times;
        </button>
        {iframe}
      </div>
    </div>
  );
}
