import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared counter the mocked OCR service uses to fail the first init, then
// succeed. vi.hoisted keeps it reachable from the hoisted vi.mock factory.
const state = vi.hoisted(() => ({ attempts: 0 }));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ppu-paddle-ocr is dev/engine-only, so it is never installed in the backend
// worktree. The factory stands in for it: initialize() rejects the first time
// (a network blip fetching the ONNX models) and resolves afterwards.
vi.mock('ppu-paddle-ocr', () => {
  class PaddleOcrService {
    constructor(_opts?: unknown) {}
    async initialize(): Promise<void> {
      state.attempts += 1;
      if (state.attempts === 1) {
        throw new Error('fetch failed');
      }
    }
    async recognize(): Promise<{ text: string }> {
      return { text: 'OK' };
    }
  }
  return { PaddleOcrService };
});

import { PaddleOCRProvider } from '@/providers/ocr/PaddleOCRProvider.js';

describe('PaddleOCRProvider init retry', () => {
  beforeEach(() => {
    state.attempts = 0;
  });

  // Regression for community #57: a failed first initialization must not be
  // cached forever. Before the fix, ensureInitialized() stored the rejected
  // initPromise and the `if (!this.initPromise)` guard blocked every retry, so
  // one network blip left OCR dead until the container restarted.
  it('retries model initialization after the first attempt fails', async () => {
    const provider = new PaddleOCRProvider();
    const init = () => (provider as unknown as {
      ensureInitialized: () => Promise<unknown>;
    }).ensureInitialized();

    await expect(init()).rejects.toThrow('fetch failed');

    const service = await init();
    expect(service).toBeDefined();
    expect(state.attempts).toBe(2);
  });
});
