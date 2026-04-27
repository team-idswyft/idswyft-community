/**
 * Unit tests for engineClient retry + circuit breaker.
 *
 * Mocks global fetch to control engine responses precisely. Uses real
 * timers (not fake) — the retry backoff and breaker open duration are
 * configured via env vars to 1ms / 50ms so tests run in real time
 * without timing-related unhandled rejections from fake-timer races.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env BEFORE the engineClient import so its module-level constants read
// the test values. vi.hoisted runs before all imports — beforeAll runs after.
vi.hoisted(() => {
  process.env.ENGINE_URL = 'http://engine.test:8080';
  process.env.ENGINE_BACKOFF_BASE_MS = '1';     // 1ms backoff per attempt
  process.env.ENGINE_BREAKER_OPEN_MS = '50';    // 50ms breaker open window
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  extractBack,
  EngineError,
  EngineCircuitOpenError,
  _resetBreakerForTests,
  getBreakerState,
} from '../engineClient.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  _resetBreakerForTests();
  globalThis.fetch = originalFetch;
});

/** Build a fake Response object with status, optionally with a JSON body. */
function fakeResponse(status: number, body: any = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? body : body),
  } as unknown as Response;
}

function fakeSuccess(): Response {
  return fakeResponse(200, { success: true, result: { ok: true } });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('engineClient retry policy', () => {
  it('returns the result on first-attempt success (no retries)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fakeSuccess());
    globalThis.fetch = fetchMock as any;

    const result = await extractBack(Buffer.from('img'));
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse(503, 'service unavailable'))
      .mockResolvedValueOnce(fakeSuccess());
    globalThis.fetch = fetchMock as any;

    const result = await extractBack(Buffer.from('img'));
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  it('retries on network error (TypeError) and succeeds on third attempt', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed: ECONNREFUSED'))
      .mockRejectedValueOnce(new TypeError('fetch failed: ECONNREFUSED'))
      .mockResolvedValueOnce(fakeSuccess());
    globalThis.fetch = fetchMock as any;

    const result = await extractBack(Buffer.from('img'));
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 4xx (engine deliberately rejected input)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse(400, 'bad image format'));
    globalThis.fetch = fetchMock as any;

    await expect(extractBack(Buffer.from('img'))).rejects.toBeInstanceOf(EngineError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  it('does NOT retry when success:false in body (logical engine failure)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse(200, { success: false, message: 'no face detected' }),
    );
    globalThis.fetch = fetchMock as any;

    await expect(extractBack(Buffer.from('img'))).rejects.toBeInstanceOf(EngineError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  it('gives up after 3 attempts on persistent 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, 'internal error'));
    globalThis.fetch = fetchMock as any;

    await expect(extractBack(Buffer.from('img'))).rejects.toBeInstanceOf(EngineError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getBreakerState().consecutiveFailures).toBe(3);
  });
});

describe('engineClient circuit breaker', () => {
  it('opens after 5 consecutive retryable failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(500, 'down')) as any;

    // Two failed calls = 6 retryable failures → breaker opens partway.
    await expect(extractBack(Buffer.from('a'))).rejects.toBeInstanceOf(EngineError);
    await expect(extractBack(Buffer.from('b'))).rejects.toBeInstanceOf(EngineError);

    expect(getBreakerState().openedAt).not.toBe(null);
    await expect(extractBack(Buffer.from('c'))).rejects.toBeInstanceOf(EngineCircuitOpenError);
  });

  it('auto-recovers after 30s in half-open mode and succeeds on probe', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(500, 'down')) as any;

    await expect(extractBack(Buffer.from('x'))).rejects.toBeInstanceOf(EngineError);
    await expect(extractBack(Buffer.from('y'))).rejects.toBeInstanceOf(EngineError);
    expect(getBreakerState().openedAt).not.toBe(null);

    // Wait past the 50ms test breaker-open window.
    await sleep(60);

    // Engine recovers — next call succeeds.
    globalThis.fetch = vi.fn().mockResolvedValueOnce(fakeSuccess()) as any;
    const result = await extractBack(Buffer.from('probe'));
    expect(result).toEqual({ ok: true });
    expect(getBreakerState().openedAt).toBe(null);
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  it('re-opens immediately if half-open probe fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(500, 'down')) as any;

    await expect(extractBack(Buffer.from('x'))).rejects.toBeInstanceOf(EngineError);
    await expect(extractBack(Buffer.from('y'))).rejects.toBeInstanceOf(EngineError);

    await sleep(60);

    // Probe call also fails (engine still down) → breaker re-opens.
    await expect(extractBack(Buffer.from('probe'))).rejects.toBeInstanceOf(EngineError);
    expect(getBreakerState().openedAt).not.toBe(null);
  });

  it('does not count 4xx failures against the breaker', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(400, 'bad input')) as any;

    for (let i = 0; i < 10; i++) {
      await expect(extractBack(Buffer.from('x'))).rejects.toBeInstanceOf(EngineError);
    }
    expect(getBreakerState().consecutiveFailures).toBe(0);
    expect(getBreakerState().openedAt).toBe(null);
  });
});
