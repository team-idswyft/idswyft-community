/**
 * Unit tests for idempotency middleware (S2.6).
 *
 * Mocks supabase to control the cache lookup; uses real Express req/res
 * stubs to verify middleware behavior end-to-end.
 */

vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));
vi.mock('@/config/index.js', () => ({
  default: { nodeEnv: 'test' },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idempotencyMiddleware } from '../idempotency.js';
import { supabase } from '@/config/database.js';

/** Build a chainable supabase query mock that resolves to { data, error }. */
function chainable(resolveValue: any) {
  const calls: any[] = [];
  // Use a real Promise as the thenable so vitest/await semantics behave normally.
  // The chain methods all return `c` to allow .select().eq().eq().gt().single()
  // style chaining; await on `c` triggers the promise resolution.
  const promise = Promise.resolve(resolveValue);
  const c: any = {
    select: (...args: any[]) => { calls.push({ method: 'select', args }); return c; },
    insert: (data: any) => { calls.push({ method: 'insert', insert: data }); return c; },
    eq: (k: string, v: any) => { calls.push({ method: 'eq', eq: [k, v] }); return c; },
    gt: (k: string, v: any) => { calls.push({ method: 'gt', gt: [k, v] }); return c; },
    single: () => { calls.push({ method: 'single' }); return c; },
    then: (onFulfilled: any, onRejected: any) => promise.then(onFulfilled, onRejected),
    catch: (onRejected: any) => promise.catch(onRejected),
    finally: (onFinally: any) => promise.finally(onFinally),
    __calls: calls,
  };
  return c;
}

/** Minimal req/res/next stubs sufficient for the middleware's needs. */
function makeReqResNext({
  headers = {},
  developer = { id: 'dev-1' },
}: { headers?: Record<string, string>; developer?: any } = {}) {
  const req: any = { headers, developer };
  let statusCode = 200;
  let setHeaders: Record<string, string> = {};
  let jsonBody: any = undefined;
  const res: any = {
    status: (code: number) => { statusCode = code; return res; },
    json: (body: any) => { jsonBody = body; return res; },
    setHeader: (k: string, v: string) => { setHeaders[k] = v; return res; },
    get statusCode() { return statusCode; },
    set statusCode(c: number) { statusCode = c; },
  };
  const next = vi.fn();
  return {
    req, res, next,
    getResult: () => ({ statusCode, body: jsonBody, headers: setHeaders }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('idempotencyMiddleware', () => {
  it('passes through when no Idempotency-Key header is present', async () => {
    const { req, res, next } = makeReqResNext({ headers: {} });
    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through when no developer is on the request (handoff/session paths)', async () => {
    const { req, res, next } = makeReqResNext({
      headers: { 'idempotency-key': 'k1' },
      developer: undefined,
    });
    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('looks up cache by (key, developer_id) and replays cached response on hit', async () => {
    const cachedResponse = { verification_id: 'v-cached', status: 'pending' };
    (supabase.from as any).mockReturnValueOnce(
      chainable({ data: { response_status: 200, response_body: cachedResponse }, error: null }),
    );

    const { req, res, next, getResult } = makeReqResNext({
      headers: { 'idempotency-key': 'k1' },
      developer: { id: 'dev-1' },
    });

    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));

    expect(next).not.toHaveBeenCalled();
    const result = getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(cachedResponse);
    expect(result.headers['Idempotent-Replayed']).toBe('true');
  });

  it('proceeds to next() and intercepts res.json when no cache hit', async () => {
    (supabase.from as any).mockReturnValueOnce(
      chainable({ data: null, error: null }),
    );

    const { req, res, next } = makeReqResNext({
      headers: { 'idempotency-key': 'k2' },
      developer: { id: 'dev-1' },
    });

    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));

    expect(next).toHaveBeenCalledTimes(1);
    // res.json was wrapped — calling it should now also write to the cache.
    const insertChain = chainable({ data: null, error: null });
    (supabase.from as any).mockReturnValueOnce(insertChain);

    res.json({ verification_id: 'v-new', status: 'pending' });
    expect(insertChain.__calls.find((c: any) => c.insert)).toBeDefined();
  });

  it('accepts the legacy X-Idempotency-Key header form too', async () => {
    const cachedResponse = { x: 'y' };
    (supabase.from as any).mockReturnValueOnce(
      chainable({ data: { response_status: 201, response_body: cachedResponse }, error: null }),
    );

    const { req, res, next, getResult } = makeReqResNext({
      headers: { 'x-idempotency-key': 'k-legacy' },
      developer: { id: 'dev-1' },
    });

    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));
    expect(getResult().body).toEqual(cachedResponse);
    expect(getResult().statusCode).toBe(201);
  });

  it('Idempotency-Key takes precedence when both headers are present', async () => {
    // We only need to verify the lookup goes through with the `Idempotency-Key`
    // value. Use a chain that records the .eq() args.
    const ch = chainable({ data: null, error: null });
    (supabase.from as any).mockReturnValueOnce(ch);

    const { req, res, next } = makeReqResNext({
      headers: {
        'idempotency-key': 'k-rfc',
        'x-idempotency-key': 'k-legacy',
      },
      developer: { id: 'dev-1' },
    });

    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));

    const eqCalls = ch.__calls.filter((c: any) => c.eq);
    const keyEq = eqCalls.find((c: any) => c.eq[0] === 'key');
    expect(keyEq?.eq[1]).toBe('k-rfc');
  });

  it('queries with the right filters: key, developer_id, and non-expired', async () => {
    const ch = chainable({ data: null, error: null });
    (supabase.from as any).mockReturnValueOnce(ch);

    const { req, res, next } = makeReqResNext({
      headers: { 'idempotency-key': 'kx' },
      developer: { id: 'dev-99' },
    });

    idempotencyMiddleware(req, res, next, () => {});
    // catchAsync wraps the async fn but doesn't return its promise, so awaiting
    // the call would resolve before the inner work. Flush microtasks instead.
    await new Promise<void>((r) => setImmediate(r));

    const eqCalls = ch.__calls.filter((c: any) => c.eq).map((c: any) => c.eq);
    expect(eqCalls).toContainEqual(['key', 'kx']);
    expect(eqCalls).toContainEqual(['developer_id', 'dev-99']);

    const gtCalls = ch.__calls.filter((c: any) => c.gt).map((c: any) => c.gt);
    expect(gtCalls.some((g: any) => g[0] === 'expires_at')).toBe(true);
  });
});
