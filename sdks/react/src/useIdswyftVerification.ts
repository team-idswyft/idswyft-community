import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  UseVerificationOptions,
  UseVerificationReturn,
  VerificationResult,
  VerificationError,
  StepProgress,
  EmbedMessage,
} from './types';

/**
 * React hook for imperative control of Idswyft verification.
 *
 * Use this when you need programmatic open/close (e.g., triggered by a button)
 * rather than declarative rendering via `<IdswyftVerification />`.
 *
 * @example
 * ```tsx
 * function VerifyButton() {
 *   const { open, close, isOpen, result, error, step } = useIdswyftVerification({
 *     apiKey: 'ik_your_api_key',
 *   });
 *
 *   return (
 *     <>
 *       <button onClick={() => open('user-123')}>Verify Identity</button>
 *       {result && <p>Result: {result.finalResult}</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </>
 *   );
 * }
 * ```
 */
export function useIdswyftVerification(options: UseVerificationOptions): UseVerificationReturn {
  const {
    apiKey,
    verificationUrl = 'https://idswyft.app',
    theme = 'dark',
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<VerificationError | null>(null);
  const [step, setStep] = useState<StepProgress | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // PostMessage handler
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const expectedOrigin = new URL(verificationUrl).origin;
      if (event.origin !== expectedOrigin) return;

      const data = event.data as EmbedMessage;
      if (!data || data.source !== 'idswyft-embed') return;

      switch (data.type) {
        case 'complete':
          setResult(data.payload as VerificationResult);
          cleanup();
          break;
        case 'error':
          setError(data.payload as VerificationError);
          break;
        case 'step_change':
          setStep(data.payload as StepProgress);
          break;
        case 'close':
          cleanup();
          break;
      }
    }

    if (isOpen) {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [isOpen, verificationUrl]);

  function cleanup() {
    if (overlayRef.current && overlayRef.current.parentNode) {
      overlayRef.current.parentNode.removeChild(overlayRef.current);
    }
    overlayRef.current = null;
    iframeRef.current = null;
    setIsOpen(false);
  }

  const open = useCallback((userId: string, opts?: { documentType?: string }) => {
    // Reset state
    setResult(null);
    setError(null);
    setStep(null);

    // Build iframe URL
    const url = new URL('/user-verification', verificationUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('embed', 'true');
    url.searchParams.set('theme', theme);
    if (opts?.documentType) url.searchParams.set('document_type', opts.documentType);

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = url.toString();
    iframe.style.cssText = 'width:100%;height:700px;max-height:calc(90vh - 40px);border:none;border-radius:12px;';
    iframe.setAttribute('allow', 'camera; microphone');
    iframe.setAttribute('title', 'Idswyft Identity Verification');
    iframeRef.current = iframe;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.7);display:flex;align-items:center;
      justify-content:center;z-index:999999;padding:20px;box-sizing:border-box;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      position:relative;width:100%;max-width:480px;max-height:90vh;
      background:${theme === 'dark' ? '#0a0e17' : '#ffffff'};
      border-radius:16px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.4);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close verification');
    closeBtn.style.cssText = `
      position:absolute;top:8px;right:12px;background:none;border:none;
      color:${theme === 'dark' ? '#94a3b8' : '#64748b'};font-size:24px;
      cursor:pointer;z-index:10;padding:4px 8px;line-height:1;
    `;
    closeBtn.addEventListener('click', cleanup);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    container.appendChild(closeBtn);
    container.appendChild(iframe);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    overlayRef.current = overlay;
    setIsOpen(true);
  }, [apiKey, verificationUrl, theme]);

  const close = useCallback(() => {
    cleanup();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current && overlayRef.current.parentNode) {
        overlayRef.current.parentNode.removeChild(overlayRef.current);
        document.body.style.overflow = '';
      }
    };
  }, []);

  return { open, close, isOpen, result, error, step };
}
