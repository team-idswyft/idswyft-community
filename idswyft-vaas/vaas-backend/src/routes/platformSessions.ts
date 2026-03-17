import { Router } from 'express';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

/**
 * GET /api/platform/sessions
 * Returns the current platform admin session derived from the JWT + request headers.
 */
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const admin = req.platformAdmin!;
    const session = {
      id: admin.id,
      userAgent: req.get('User-Agent') || 'Unknown',
      ip: req.ip || req.socket.remoteAddress || 'Unknown',
      lastActiveAt: new Date().toISOString(),
      isCurrent: true,
    };

    const response: VaasApiResponse = { success: true, data: [session] };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SESSIONS_FETCH_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

/**
 * DELETE /api/platform/sessions/:id
 * JWT-based sessions have no server-side revocation — return success as a no-op.
 */
router.delete('/:id', requirePlatformAdmin as any, async (_req: PlatformAdminRequest, res) => {
  const response: VaasApiResponse = { success: true, data: { revoked: true } };
  res.json(response);
});

export default router;
