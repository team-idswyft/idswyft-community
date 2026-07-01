import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchDashboardProfile, deriveIsOperator } from './operatorSession';

const OP = { email: 'op@example.com', api_key_id: 'k1', key_prefix: 'isk_aaaa', service_label: 'gw', service_product: 'p', service_environment: 'production' };

afterEach(() => { vi.restoreAllMocks(); });

function mockFetch(status: number, body: any) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as any);
}

describe('deriveIsOperator', () => {
  it('true when operator block present', () => {
    expect(deriveIsOperator({ scope: 'service-operator', operator: OP })).toBe(true);
  });
  it('false for a developer profile', () => {
    expect(deriveIsOperator({ scope: 'developer', data: { id: 'd1' } })).toBe(false);
  });
});

describe('fetchDashboardProfile', () => {
  it('returns authed=false on 401', async () => {
    mockFetch(401, { error: 'unauthenticated' });
    const r = await fetchDashboardProfile();
    expect(r).toEqual({ authed: false });
  });
  it('returns operator context on an operator profile', async () => {
    mockFetch(200, { success: true, scope: 'service-operator', operator: OP });
    const r = await fetchDashboardProfile();
    expect(r.authed).toBe(true);
    if (r.authed) { expect(r.isOperator).toBe(true); expect(r.operator).toEqual(OP); }
  });
  it('returns non-operator context on a developer profile', async () => {
    mockFetch(200, { success: true, data: { id: 'd1', email: 'dev@x.com' } });
    const r = await fetchDashboardProfile();
    expect(r.authed).toBe(true);
    if (r.authed) { expect(r.isOperator).toBe(false); expect(r.operator).toBeNull(); }
  });
});
