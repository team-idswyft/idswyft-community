import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock database
vi.mock('../../config/database.js', () => ({
  vaasSupabase: { from: vi.fn() },
}));

vi.mock('../../config/index.js', () => ({
  default: {
    jwtSecret: 'test-secret',
    superAdminEmails: 'super@example.com,admin@example.com',
  },
}));

import { requireAuth, requirePermission, requireRole, AuthenticatedRequest } from '../auth.js';
import { vaasSupabase } from '../../config/database.js';

// ─── Helpers ─────────────────────────────────────

function mockReqResNext() {
  const req = {
    headers: {},
    admin: undefined,
  } as unknown as AuthenticatedRequest;

  const resData: any = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((data) => { resData.body = data; }),
  } as any;

  const next = vi.fn();
  return { req, res, next, resData };
}

function mockAdminLookup(result: { data: any; error: any }) {
  const singleFn = vi.fn().mockResolvedValue(result);
  const eqChain: any = {
    eq: vi.fn().mockReturnValue({ single: singleFn }),
    single: singleFn,
  };
  (vaasSupabase.from as any).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(eqChain),
    }),
  });
}

// ─── Tests ───────────────────────────────────────

describe('requireAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token is provided', async () => {
    const { req, res, next } = mockReqResNext();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'UNAUTHORIZED' }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid JWT', async () => {
    const { req, res, next } = mockReqResNext();
    req.headers.authorization = 'Bearer not-a-valid-jwt';

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when admin is not found in DB', async () => {
    const { req, res, next } = mockReqResNext();
    const token = jwt.sign({ admin_id: 'admin-1' }, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;

    mockAdminLookup({ data: null, error: { message: 'not found' } });

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INVALID_TOKEN' }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when organization is suspended', async () => {
    const { req, res, next } = mockReqResNext();
    const token = jwt.sign({ admin_id: 'admin-1' }, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;

    mockAdminLookup({
      data: {
        id: 'admin-1',
        organization_id: 'org-1',
        email: 'test@example.com',
        role: 'admin',
        permissions: {},
        status: 'active',
        vaas_organizations: { billing_status: 'suspended' },
      },
      error: null,
    });

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'ORGANIZATION_SUSPENDED' }) })
    );
  });

  it('calls next and attaches admin on success', async () => {
    const { req, res, next } = mockReqResNext();
    const token = jwt.sign({ admin_id: 'admin-1' }, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;

    mockAdminLookup({
      data: {
        id: 'admin-1',
        organization_id: 'org-1',
        email: 'test@example.com',
        role: 'admin',
        permissions: { view_users: true },
        status: 'active',
        vaas_organizations: { billing_status: 'active' },
      },
      error: null,
    });

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.admin).toEqual({
      id: 'admin-1',
      organization_id: 'org-1',
      email: 'test@example.com',
      role: 'admin',
      permissions: { view_users: true },
    });
  });
});

describe('requirePermission', () => {
  it('returns 401 when no admin on request', () => {
    const { req, res, next } = mockReqResNext();
    const middleware = requirePermission('manage_webhooks');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows owners regardless of specific permission', () => {
    const { req, res, next } = mockReqResNext();
    req.admin = { id: 'a', organization_id: 'o', email: 'x@x.com', role: 'owner', permissions: {} };

    const middleware = requirePermission('manage_webhooks');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when admin lacks the required permission', () => {
    const { req, res, next } = mockReqResNext();
    req.admin = { id: 'a', organization_id: 'o', email: 'x@x.com', role: 'admin', permissions: {} };

    const middleware = requirePermission('manage_webhooks');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }) })
    );
  });

  it('allows admin with the specific permission', () => {
    const { req, res, next } = mockReqResNext();
    req.admin = { id: 'a', organization_id: 'o', email: 'x@x.com', role: 'admin', permissions: { manage_webhooks: true } };

    const middleware = requirePermission('manage_webhooks');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('returns 401 when no admin on request', () => {
    const { req, res, next } = mockReqResNext();
    const middleware = requireRole(['owner']);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows admin with matching role', () => {
    const { req, res, next } = mockReqResNext();
    req.admin = { id: 'a', organization_id: 'o', email: 'x@x.com', role: 'owner', permissions: {} };

    const middleware = requireRole(['owner', 'admin']);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when admin role is not in allowed list', () => {
    const { req, res, next } = mockReqResNext();
    req.admin = { id: 'a', organization_id: 'o', email: 'x@x.com', role: 'viewer', permissions: {} };

    const middleware = requireRole(['owner']);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
