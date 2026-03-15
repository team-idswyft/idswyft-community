/**
 * @jest-environment jsdom
 */
import { IdswyftEmbed } from '../src/embed';

describe('IdswyftEmbed', () => {
  afterEach(() => {
    // Clean up any remaining DOM elements
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  describe('constructor', () => {
    it('creates with default options', () => {
      const embed = new IdswyftEmbed();
      expect(embed.active).toBe(false);
    });

    it('accepts custom options', () => {
      const embed = new IdswyftEmbed({
        mode: 'inline',
        theme: 'light',
        width: '500px',
        height: '600px',
      });
      expect(embed.active).toBe(false);
    });
  });

  describe('modal mode', () => {
    it('creates overlay and iframe on open()', () => {
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-session-token');

      expect(embed.active).toBe(true);

      // Check overlay exists
      const overlay = document.body.querySelector('div[style*="position: fixed"]');
      expect(overlay).not.toBeNull();

      // Check iframe exists with correct src
      const iframe = document.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe!.src).toContain('session=test-session-token');
      expect(iframe!.src).toContain('embed=true');
      expect(iframe!.src).toContain('theme=dark');

      // Body overflow should be hidden
      expect(document.body.style.overflow).toBe('hidden');

      embed.close();
    });

    it('creates close button in modal', () => {
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token');

      const closeBtn = document.querySelector('button');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn!.innerHTML).toContain('×');

      embed.close();
    });

    it('close() removes overlay and resets body overflow', () => {
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token');

      expect(embed.active).toBe(true);
      embed.close();

      expect(embed.active).toBe(false);
      expect(document.body.style.overflow).toBe('');
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('calls onClose when close button clicked', () => {
      const onClose = jest.fn();
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token', { onClose });

      const closeBtn = document.querySelector('button');
      closeBtn!.click();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(embed.active).toBe(false);
    });

    it('theme=light sets light background', () => {
      const embed = new IdswyftEmbed({ mode: 'modal', theme: 'light' });
      embed.open('test-token');

      const iframe = document.querySelector('iframe');
      expect(iframe!.src).toContain('theme=light');

      embed.close();
    });
  });

  describe('inline mode', () => {
    it('renders iframe into container element', () => {
      const container = document.createElement('div');
      container.id = 'verify-container';
      document.body.appendChild(container);

      const embed = new IdswyftEmbed({
        mode: 'inline',
        container: '#verify-container',
      });
      embed.open('test-token');

      expect(embed.active).toBe(true);
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();

      embed.close();
    });

    it('accepts HTMLElement as container', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const embed = new IdswyftEmbed({
        mode: 'inline',
        container: container,
      });
      embed.open('test-token');

      expect(container.querySelector('iframe')).not.toBeNull();
      embed.close();
    });

    it('calls onError if container not found', () => {
      const onError = jest.fn();
      const embed = new IdswyftEmbed({
        mode: 'inline',
        container: '#nonexistent',
      });
      embed.open('test-token', { onError });

      expect(onError).toHaveBeenCalledWith({
        code: 'CONTAINER_NOT_FOUND',
        message: 'Container element not found for inline embed mode',
      });
    });
  });

  describe('postMessage handling', () => {
    it('calls onComplete on verification_complete message', () => {
      const onComplete = jest.fn();
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token', { onComplete });

      // Simulate postMessage from iframe
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'idswyft-embed',
          type: 'complete',
          payload: {
            verificationId: 'v-123',
            status: 'COMPLETE',
            finalResult: 'verified',
          },
        },
      }));

      expect(onComplete).toHaveBeenCalledWith({
        verificationId: 'v-123',
        status: 'COMPLETE',
        finalResult: 'verified',
      });
      expect(embed.active).toBe(false);
    });

    it('calls onError on error message', () => {
      const onError = jest.fn();
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token', { onError });

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'idswyft-embed',
          type: 'error',
          payload: { code: 'UPLOAD_FAILED', message: 'File too large' },
        },
      }));

      expect(onError).toHaveBeenCalledWith({
        code: 'UPLOAD_FAILED',
        message: 'File too large',
      });
    });

    it('calls onStepChange on step_change message', () => {
      const onStepChange = jest.fn();
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token', { onStepChange });

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'idswyft-embed',
          type: 'step_change',
          payload: { current: 2, total: 5, status: 'AWAITING_BACK' },
        },
      }));

      expect(onStepChange).toHaveBeenCalledWith({
        current: 2,
        total: 5,
        status: 'AWAITING_BACK',
      });
    });

    it('ignores messages from non-idswyft sources', () => {
      const onComplete = jest.fn();
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token', { onComplete });

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'some-other-app',
          type: 'complete',
          payload: {},
        },
      }));

      expect(onComplete).not.toHaveBeenCalled();
      embed.close();
    });
  });

  describe('lifecycle', () => {
    it('close() before open() is a no-op', () => {
      const embed = new IdswyftEmbed({ mode: 'modal' });
      expect(() => embed.close()).not.toThrow();
    });

    it('open() after open() closes previous and opens new', () => {
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('token-1');
      embed.open('token-2');

      const iframes = document.querySelectorAll('iframe');
      // Should have only one iframe (old one cleaned up)
      expect(iframes.length).toBe(1);
      expect(iframes[0].src).toContain('session=token-2');

      embed.close();
    });

    it('removes message listener on close', () => {
      const removeListenerSpy = jest.spyOn(window, 'removeEventListener');
      const embed = new IdswyftEmbed({ mode: 'modal' });
      embed.open('test-token');
      embed.close();

      expect(removeListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
      removeListenerSpy.mockRestore();
    });
  });
});
