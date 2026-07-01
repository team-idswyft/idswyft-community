import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendOperatorOtp, verifyOperatorOtp, selectOperatorKey } from './operatorAuth';

afterEach(() => vi.restoreAllMocks());

const f = (status: number, body: any) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })) as any);

// Real backend send response: { message: string, code?: string, self_hosted?: true }
describe('sendOperatorOtp', () => {
  it('returns ok=true on 200', async () => {
    f(200, { message: 'If this email operates a service key, a verification code has been sent.' });
    expect((await sendOperatorOtp('op@x.com')).ok).toBe(true);
  });

  it('returns ok=false with message on rate-limit error', async () => {
    f(429, { status: 'error', message: 'Too many code requests. Please try again later.' });
    const r = await sendOperatorOtp('op@x.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });
});

// Real backend verify responses:
//   single key (200): { scope: 'service-operator', operator: { email, api_key_id, service_product, service_environment, service_label } }
//   multi-key (200):  { selection_required: true, selection_token, keys: [{ api_key_id, service_product, service_environment, service_label }] }
//   no key    (401):  { status: 'error', message: 'No service access for this email', code: 'AUTHENTICATION_ERROR' }
describe('verifyOperatorOtp', () => {
  it('single key → authed (cookie set server-side, no selection_token in body)', async () => {
    f(200, {
      scope: 'service-operator',
      operator: { email: 'op@x.com', api_key_id: 'k1', service_product: 'pay', service_environment: 'production', service_label: 'gateway' },
    });
    expect((await verifyOperatorOtp('op@x.com', '123456')).status).toBe('authed');
  });

  it('multi-key → select with selectionToken + keys (api_key_id NOT id)', async () => {
    f(200, {
      selection_required: true,
      selection_token: 'sel-tok-abc',
      keys: [
        { api_key_id: 'k1', service_product: 'pay', service_environment: 'production', service_label: 'gateway' },
        { api_key_id: 'k2', service_product: 'kyc', service_environment: 'sandbox', service_label: 'kyc-test' },
      ],
    });
    const r = await verifyOperatorOtp('op@x.com', '123456');
    expect(r.status).toBe('select');
    if (r.status === 'select') {
      expect(r.selectionToken).toBe('sel-tok-abc');
      expect(r.keys).toHaveLength(2);
      // Verify real field name api_key_id (NOT id — brief was wrong, backend uses publicKey() which has api_key_id)
      expect(r.keys[0].api_key_id).toBe('k1');
      expect(r.keys[1].api_key_id).toBe('k2');
    }
  });

  it('no active key → no-key with message from error body', async () => {
    f(401, { status: 'error', message: 'No service access for this email', code: 'AUTHENTICATION_ERROR' });
    const r = await verifyOperatorOtp('op@x.com', '123456');
    expect(r.status).toBe('no-key');
    if (r.status === 'no-key') {
      expect(r.message).toBe('No service access for this email');
    }
  });

  it('network failure → resolves to error (does NOT reject)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }) as any);
    const r = await verifyOperatorOtp('op@x.com', '123456');
    expect(r.status).toBe('error');
    if (r.status === 'error') {
      expect(r.message).toBeTruthy();
    }
  });
});

// Real backend select response (200): { scope: 'service-operator', operator: { email, api_key_id, ... } }
describe('selectOperatorKey', () => {
  it('returns ok=true on 200', async () => {
    f(200, {
      scope: 'service-operator',
      operator: { email: 'op@x.com', api_key_id: 'k1', service_product: 'pay', service_environment: 'production', service_label: 'gateway' },
    });
    expect((await selectOperatorKey('sel-tok-abc', 'k1')).ok).toBe(true);
  });

  it('returns ok=false with message on invalid/expired token', async () => {
    f(401, { status: 'error', message: 'Invalid or expired selection token', code: 'AUTHENTICATION_ERROR' });
    const r = await selectOperatorKey('bad-tok', 'k1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Invalid or expired selection token');
  });
});
