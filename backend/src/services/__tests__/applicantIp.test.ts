/**
 * Unit tests for applicant IP recording.
 *
 * The applicant's own capture requests overwrite client_ip; API-key
 * (server-to-server) requests leave it alone. Supabase is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

vi.mock('../../config/database.js', () => ({
  supabase: { from: mockFrom },
}));

// Must import AFTER vi.mock
const { recordApplicantIp } = await import('../applicantIp.js');

function makeReq(headers: Record<string, string>, ip?: string) {
  return { headers, ip, socket: {} } as any;
}

describe('recordApplicantIp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
  });

  it('records the IP of a session-token request', async () => {
    await recordApplicantIp(makeReq({ 'x-session-token': 't' }, '203.0.113.7'), 'ver-1');

    expect(mockFrom).toHaveBeenCalledWith('verification_requests');
    expect(mockUpdate).toHaveBeenCalledWith({ client_ip: '203.0.113.7' });
    expect(mockEq).toHaveBeenCalledWith('id', 'ver-1');
  });

  it('records the IP of a handoff-token request', async () => {
    await recordApplicantIp(makeReq({ 'x-handoff-token': 't' }, '198.51.100.4'), 'ver-1');

    expect(mockUpdate).toHaveBeenCalledWith({ client_ip: '198.51.100.4' });
  });

  it('falls back to the socket address when req.ip is unset', async () => {
    const req = { headers: { 'x-session-token': 't' }, socket: { remoteAddress: '192.0.2.9' } } as any;
    await recordApplicantIp(req, 'ver-1');

    expect(mockUpdate).toHaveBeenCalledWith({ client_ip: '192.0.2.9' });
  });

  it('leaves client_ip alone on an API-key request (integrator server)', async () => {
    await recordApplicantIp(makeReq({ 'x-api-key': 'k' }, '52.28.0.1'), 'ver-1');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does nothing when no IP is available', async () => {
    await recordApplicantIp(makeReq({ 'x-session-token': 't' }), 'ver-1');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not throw when the update fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'db down' } });

    await expect(
      recordApplicantIp(makeReq({ 'x-session-token': 't' }, '203.0.113.7'), 'ver-1'),
    ).resolves.toBeUndefined();
  });
});
