import { Router } from 'express';
import { notificationService } from '../services/notificationService.js';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// List notifications (paginated, filterable by read status)
router.get('/', requireAuth as any, requirePermission('view_verifications') as any, async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const readParam = req.query.read;
    const read = readParam === 'true' ? true : readParam === 'false' ? false : undefined;

    const result = await notificationService.list(organizationId, {
      read,
      page: Number(req.query.page) || 1,
      per_page: Number(req.query.per_page) || 20,
    });

    const response: VaasApiResponse = {
      success: true,
      data: result.notifications,
      meta: {
        total: result.total,
        page: Number(req.query.page) || 1,
        per_page: Number(req.query.per_page) || 20,
      },
    };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// Lightweight poll endpoint — unread count only
router.get('/unread-count', requireAuth as any, requirePermission('view_verifications') as any, async (req: AuthenticatedRequest, res) => {
  try {
    const count = await notificationService.unreadCount(req.admin!.organization_id);
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// Mark single notification as read
router.post('/:id/read', requireAuth as any, requirePermission('view_verifications') as any, async (req: AuthenticatedRequest, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid notification ID' } });
    }
    await notificationService.markRead(req.admin!.organization_id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// Mark all notifications as read
router.post('/read-all', requireAuth as any, requirePermission('view_verifications') as any, async (req: AuthenticatedRequest, res) => {
  try {
    await notificationService.markAllRead(req.admin!.organization_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
