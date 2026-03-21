import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformNotificationService } from '../services/platformNotificationService.js';

const router = Router();

// ── SSE stream — manual JWT auth (EventSource can't send headers) ────────────

router.get('/stream', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    }

    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.role !== 'platform') {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid platform token' } });
    }

    // Verify admin exists and is active
    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .select('id, status')
      .eq('id', decoded.platform_admin_id)
      .single();

    if (error || !admin || admin.status !== 'active') {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Admin not found or inactive' } });
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n'); // initial flush

    const adminId = admin.id;
    platformNotificationService.addSSEClient(adminId, res);

    req.on('close', () => {
      platformNotificationService.removeSSEClient(adminId);
    });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'SSE auth failed' } });
    }
  }
});

// ── All remaining routes require platform admin auth ────────────────────────
router.use(requirePlatformAdmin as any);

// GET /  — list notifications
router.get('/', async (req: PlatformAdminRequest, res) => {
  try {
    const { page, per_page, read, type, severity } = req.query as Record<string, string>;
    const result = await platformNotificationService.list({
      page: page ? parseInt(page) : undefined,
      per_page: per_page ? parseInt(per_page) : undefined,
      read: read === 'true' ? true : read === 'false' ? false : undefined,
      type: type || undefined,
      severity: severity || undefined,
    });

    const response: VaasApiResponse = {
      success: true,
      data: result.notifications,
      meta: {
        total: result.total,
        page: page ? parseInt(page) : 1,
        per_page: per_page ? parseInt(per_page) : 25,
        total_pages: Math.ceil(result.total / (per_page ? parseInt(per_page) : 25)),
      },
    };
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_NOTIFICATIONS_FAILED', message: error.message } });
  }
});

// GET /unread-count
router.get('/unread-count', async (req: PlatformAdminRequest, res) => {
  try {
    const count = await platformNotificationService.unreadCount();
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UNREAD_COUNT_FAILED', message: error.message } });
  }
});

// POST /:id/read
router.post('/:id/read', async (req: PlatformAdminRequest, res) => {
  try {
    await platformNotificationService.markRead(req.params.id, req.platformAdmin!.id);
    res.json({ success: true, data: { message: 'Notification marked as read' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MARK_READ_FAILED', message: error.message } });
  }
});

// POST /read-all
router.post('/read-all', async (req: PlatformAdminRequest, res) => {
  try {
    await platformNotificationService.markAllRead(req.platformAdmin!.id);
    res.json({ success: true, data: { message: 'All notifications marked as read' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MARK_ALL_READ_FAILED', message: error.message } });
  }
});

// ── Channel CRUD ────────────────────────────────────────────────────────────

// GET /channels
router.get('/channels', async (req: PlatformAdminRequest, res) => {
  try {
    const channels = await platformNotificationService.listChannels();
    res.json({ success: true, data: channels });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_CHANNELS_FAILED', message: error.message } });
  }
});

// POST /channels
router.post('/channels', async (req: PlatformAdminRequest, res) => {
  try {
    const { name, type, config: channelConfig, enabled } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name and type are required' } });
    }

    const validTypes = ['slack', 'discord', 'email', 'webhook'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Type must be one of: ${validTypes.join(', ')}` } });
    }

    const channel = await platformNotificationService.createChannel({
      name,
      type,
      config: channelConfig || {},
      enabled,
      created_by: req.platformAdmin!.id,
    });

    res.status(201).json({ success: true, data: channel });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'CREATE_CHANNEL_FAILED', message: error.message } });
  }
});

// PUT /channels/:id
router.put('/channels/:id', async (req: PlatformAdminRequest, res) => {
  try {
    const { name, config: channelConfig, enabled } = req.body;
    const channel = await platformNotificationService.updateChannel(req.params.id, {
      name,
      config: channelConfig,
      enabled,
    });
    res.json({ success: true, data: channel });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_CHANNEL_FAILED', message: error.message } });
  }
});

// DELETE /channels/:id
router.delete('/channels/:id', async (req: PlatformAdminRequest, res) => {
  try {
    await platformNotificationService.deleteChannel(req.params.id);
    res.json({ success: true, data: { message: 'Channel deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_CHANNEL_FAILED', message: error.message } });
  }
});

// POST /channels/:id/test
router.post('/channels/:id/test', async (req: PlatformAdminRequest, res) => {
  try {
    await platformNotificationService.testChannel(req.params.id);
    res.json({ success: true, data: { message: 'Test notification sent' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'TEST_CHANNEL_FAILED', message: error.message } });
  }
});

// ── Rule Management ─────────────────────────────────────────────────────────

// GET /channels/:id/rules
router.get('/channels/:id/rules', async (req: PlatformAdminRequest, res) => {
  try {
    const rules = await platformNotificationService.listRules(req.params.id);
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_RULES_FAILED', message: error.message } });
  }
});

// PUT /channels/:id/rules
router.put('/channels/:id/rules', async (req: PlatformAdminRequest, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rules must be an array' } });
    }

    await platformNotificationService.upsertRules(req.params.id, rules);
    const updated = await platformNotificationService.listRules(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPSERT_RULES_FAILED', message: error.message } });
  }
});

export default router;
