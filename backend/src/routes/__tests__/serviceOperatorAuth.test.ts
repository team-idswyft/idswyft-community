/**
 * Service-operator OTP login route tests (Phase 2).
 * Mocks Supabase + otpService; real JWT (config mock provides jwtSecret).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  otpValid: true,
  keys: [] as any[],         // rows returned by the verify list query
  selectRow: null as any,    // row returned by the select single() query
}));

vi.mock('@/config/database.js', () => {
  const make = () => {
    const obj: any = {
      _filters: [] as Array<[string, any]>,
      select: vi.fn(() => obj),
      eq: vi.fn((c: string, v: any) => { obj._filters.push([c, v]); return obj; }),
      single: vi.fn(() =>
        Promise.resolve({ data: state.selectRow, error: state.selectRow ? null : { message: 'not found' } })),
      then: undefined as any,
    };
    // The verify handler awaits the eq()-chain directly (no .single()): make the
    // final eq() return a thenable resolving to the keys list.
    obj.eq = vi.fn((c: string, v: any) => {
      obj._filters.push([c, v]);
      const chained: any = { ...obj, eq: obj.eq, single: obj.single };
      chained.then = (resolve: any) =>
        Promise.resolve({ data: state.keys, error: null }).then(resolve);
      return chained;
    });
    return obj;
  };
  return {
    supabase: { from: vi.fn(() => make()) },
    connectDB: vi.fn(),
  };
});

vi.mock('@/services/otpService.js', () => ({
  createAndSendOtp: vi.fn(async () => ({ success: true, code: '123456' })),
  verifyOtp: vi.fn(async () => ({ valid: state.otpValid, reason: state.otpValid ? undefined : 'Invalid code' })),
}));

vi.mock('@/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/index.js', () => ({
  default: { jwtSecret: 'test-jwt-secret', apiKeySecret: 'test-secret', nodeEnv: 'test' },
}));

let app: Express;
async function buildApp() {
  const mod = await import('../serviceOperatorAuth.js');
  const a = express();
  a.use(express.json());
  a.use('/api/auth', mod.default);
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  });
  return a;
}

const K1 = { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', service_product: 'gatepass', service_environment: 'production', service_label: 'GP prod', developer_id: 'shadow' };
const K2 = { id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', service_product: 'gatepass', service_environment: 'staging', service_label: 'GP stg', developer_id: 'shadow' };

beforeEach(async () => {
  state.otpValid = true;
  state.keys = [];
  state.selectRow = null;
  app = await buildApp();
});

describe('POST /api/auth/service-operator/otp/send', () => {
  it('returns 200 and (self-hosted) the code', async () => {
    const res = await request(app).post('/api/auth/service-operator/otp/send').send({ email: 'obed@idswyft.app' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('123456');
  });
});

describe('POST /api/auth/service-operator/otp/verify', () => {
  it('rejects a bad OTP (401)', async () => {
    state.otpValid = false;
    const res = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'obed@idswyft.app', code: '000000' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the email operates no service key', async () => {
    state.keys = [];
    const res = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'nobody@idswyft.app', code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no service access/i);
  });

  it('sets the operator cookie and returns the key when exactly one matches', async () => {
    state.keys = [K1];
    const res = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'obed@idswyft.app', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('service-operator');
    expect(res.body.operator.api_key_id).toBe(K1.id);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/idswyft_token=/);
  });

  it('returns a selection token + key list when more than one matches (no cookie)', async () => {
    state.keys = [K1, K2];
    const res = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'obed@idswyft.app', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.selection_required).toBe(true);
    expect(typeof res.body.selection_token).toBe('string');
    expect(res.body.keys).toHaveLength(2);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/auth/service-operator/otp/select', () => {
  it('rejects a bad selection token (401)', async () => {
    const res = await request(app).post('/api/auth/service-operator/otp/select').send({ selection_token: 'garbage', api_key_id: K1.id });
    expect(res.status).toBe(401);
  });

  it('sets the cookie for a valid selection token + owned key', async () => {
    // First obtain a real selection token via the multi-key verify path.
    state.keys = [K1, K2];
    const verifyRes = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'obed@idswyft.app', code: '123456' });
    const selectionToken = verifyRes.body.selection_token;

    state.selectRow = K1; // the chosen key, owned by this operator
    const res = await request(app).post('/api/auth/service-operator/otp/select').send({ selection_token: selectionToken, api_key_id: K1.id });
    expect(res.status).toBe(200);
    expect(res.body.operator.api_key_id).toBe(K1.id);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/idswyft_token=/);
  });

  it('returns 401 when the chosen key is not owned by the operator', async () => {
    state.keys = [K1, K2];
    const verifyRes = await request(app).post('/api/auth/service-operator/otp/verify').send({ email: 'obed@idswyft.app', code: '123456' });
    const selectionToken = verifyRes.body.selection_token;

    state.selectRow = null; // not found for this operator
    const res = await request(app).post('/api/auth/service-operator/otp/select').send({ selection_token: selectionToken, api_key_id: '99999999-9999-4999-8999-999999999999' });
    expect(res.status).toBe(401);
  });
});
