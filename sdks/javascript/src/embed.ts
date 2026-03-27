// ─── Embed Types ────────────────────────────────────────

export type EmbedMode = 'modal' | 'inline';
export type EmbedTheme = 'light' | 'dark';

export interface EmbedOptions {
  /** Embed mode: 'modal' (overlay) or 'inline' (within container) */
  mode?: EmbedMode;
  /** Container element or CSS selector (required for inline mode) */
  container?: HTMLElement | string;
  /** Theme for the verification UI */
  theme?: EmbedTheme;
  /** Base URL for the hosted verification page */
  verificationUrl?: string;
  /** Width of the iframe (default: '100%') */
  width?: string;
  /** Height of the iframe (default: '700px') */
  height?: string;
  /** Allow closing the modal via backdrop click (default: true) */
  closeOnBackdropClick?: boolean;
}

export interface EmbedCallbacks {
  /** Called when verification succeeds */
  onComplete?: (result: EmbedResult) => void;
  /** Called when verification fails */
  onError?: (error: EmbedError) => void;
  /** Called when the verification step changes */
  onStepChange?: (step: { current: number; total: number; status: string }) => void;
  /** Called when the user closes the modal */
  onClose?: () => void;
}

export interface EmbedResult {
  verificationId: string;
  status: string;
  finalResult: string;
}

export interface EmbedError {
  verificationId?: string;
  code: string;
  message: string;
}

// ─── PostMessage Protocol ───────────────────────────────

interface EmbedMessage {
  source: 'idswyft-embed';
  type: 'complete' | 'error' | 'step_change' | 'close' | 'ready';
  payload: any;
}

// ─── Embeddable UI Component ────────────────────────────

/**
 * IdswyftEmbed creates an iframe-based drop-in verification UI.
 *
 * Two modes:
 * - `modal`: creates a full-screen overlay with the verification iframe
 * - `inline`: renders the iframe inside a specified container element
 *
 * Communication between the parent page and the iframe happens via
 * the postMessage API, following the same pattern used by Stripe Elements
 * and Plaid Link.
 *
 * Usage:
 * ```ts
 * const embed = new IdswyftEmbed({
 *   mode: 'modal',
 *   theme: 'dark',
 * });
 *
 * embed.open(sessionToken, {
 *   onComplete: (result) => console.log('Verified!', result),
 *   onError: (error) => console.error('Failed:', error),
 *   onClose: () => console.log('User closed modal'),
 * });
 * ```
 */
export class IdswyftEmbed {
  private options: Required<Omit<EmbedOptions, 'container'>> & { container?: HTMLElement | string };
  private callbacks: EmbedCallbacks = {};
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private isOpen = false;

  constructor(options: EmbedOptions = {}) {
    this.options = {
      mode: options.mode || 'modal',
      container: options.container,
      theme: options.theme || 'dark',
      verificationUrl: options.verificationUrl || 'https://verify.idswyft.app',
      width: options.width || '100%',
      height: options.height || '700px',
      closeOnBackdropClick: options.closeOnBackdropClick ?? true,
    };
  }

  /**
   * Open the verification UI with a session token.
   * In modal mode, creates an overlay. In inline mode, renders into the container.
   */
  open(sessionToken: string, callbacks: EmbedCallbacks = {}): void {
    if (this.isOpen) {
      this.close();
    }

    this.callbacks = callbacks;
    this.isOpen = true;

    // Build iframe URL
    const url = new URL('/verify', this.options.verificationUrl);
    url.searchParams.set('session', sessionToken);
    url.searchParams.set('embed', 'true');
    url.searchParams.set('theme', this.options.theme);

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.src = url.toString();
    this.iframe.style.width = this.options.width;
    this.iframe.style.height = this.options.height;
    this.iframe.style.border = 'none';
    this.iframe.style.borderRadius = '12px';
    this.iframe.setAttribute('allow', 'camera; microphone');
    this.iframe.setAttribute('title', 'Idswyft Identity Verification');

    // Listen for postMessage events from the iframe
    this.messageHandler = (event: MessageEvent) => this.handleMessage(event);
    window.addEventListener('message', this.messageHandler);

    if (this.options.mode === 'modal') {
      this.openModal();
    } else {
      this.openInline();
    }
  }

  /** Close the verification UI and clean up resources. */
  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;

    // Remove message listener
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Remove modal overlay
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      document.body.style.overflow = '';
      this.overlay = null;
    }

    // Remove inline iframe
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    this.iframe = null;
  }

  /** Whether the embed UI is currently open. */
  get active(): boolean {
    return this.isOpen;
  }

  // ── Modal Mode ────────────────────────────────────────

  private openModal(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      padding: 20px;
      box-sizing: border-box;
    `;

    // Container for iframe + close button
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      background: ${this.options.theme === 'dark' ? '#0a0e17' : '#ffffff'};
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 12px;
      background: none;
      border: none;
      color: ${this.options.theme === 'dark' ? '#94a3b8' : '#64748b'};
      font-size: 24px;
      cursor: pointer;
      z-index: 10;
      padding: 4px 8px;
      line-height: 1;
    `;
    closeBtn.addEventListener('click', () => {
      this.callbacks.onClose?.();
      this.close();
    });

    // Set iframe dimensions for modal
    if (this.iframe) {
      this.iframe.style.width = '100%';
      this.iframe.style.height = '700px';
      this.iframe.style.maxHeight = 'calc(90vh - 40px)';
    }

    container.appendChild(closeBtn);
    if (this.iframe) container.appendChild(this.iframe);
    this.overlay.appendChild(container);

    // Backdrop click to close
    if (this.options.closeOnBackdropClick) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.callbacks.onClose?.();
          this.close();
        }
      });
    }

    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';
  }

  // ── Inline Mode ───────────────────────────────────────

  private openInline(): void {
    const containerEl = this.resolveContainer();
    if (!containerEl) {
      console.error('IdswyftEmbed: container element not found');
      this.callbacks.onError?.({
        code: 'CONTAINER_NOT_FOUND',
        message: 'Container element not found for inline embed mode',
      });
      return;
    }

    if (this.iframe) {
      containerEl.appendChild(this.iframe);
    }
  }

  private resolveContainer(): HTMLElement | null {
    if (!this.options.container) return null;
    if (typeof this.options.container === 'string') {
      return document.querySelector(this.options.container);
    }
    return this.options.container;
  }

  // ── PostMessage Handler ───────────────────────────────

  private handleMessage(event: MessageEvent): void {
    // Validate origin to prevent cross-origin message spoofing
    const expectedOrigin = new URL(this.options.verificationUrl).origin;
    if (event.origin !== expectedOrigin) return;

    const data = event.data as EmbedMessage;

    // Only process messages from our iframe
    if (!data || data.source !== 'idswyft-embed') return;

    switch (data.type) {
      case 'complete':
        this.callbacks.onComplete?.(data.payload as EmbedResult);
        this.close();
        break;

      case 'error':
        this.callbacks.onError?.(data.payload as EmbedError);
        break;

      case 'step_change':
        this.callbacks.onStepChange?.(data.payload);
        break;

      case 'close':
        this.callbacks.onClose?.();
        this.close();
        break;

      case 'ready':
        // Iframe loaded — could resize or send config
        break;
    }
  }
}
