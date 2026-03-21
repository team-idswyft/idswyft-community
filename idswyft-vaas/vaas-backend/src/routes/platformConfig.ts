import { Router } from 'express';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, requirePlatformSuperAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformConfigService, PlatformConfigService } from '../services/platformConfigService.js';

const router = Router();

// ── Read routes (platform admin) ────────────────────────────────────────────

// GET / — list all config (secrets masked)
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const items = await platformConfigService.listAll();
    res.json({ success: true, data: items } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_CONFIG_FAILED', message: error.message } });
  }
});

// GET /export/env — download .env file (super_admin only)
router.get('/export/env', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const includeSecrets = req.query.include_secrets === 'true';
    const content = await platformConfigService.exportAsEnv(includeSecrets);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="platform-config.env"');
    res.send(content);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: error.message } });
  }
});

// GET /export/json — download JSON (super_admin only)
router.get('/export/json', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const includeSecrets = req.query.include_secrets === 'true';
    const data = await platformConfigService.exportAsJson(includeSecrets);
    res.json({ success: true, data } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: error.message } });
  }
});

// POST /import — import .env content (super_admin only)
router.post('/import', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Content is required' } });
    }

    const result = await platformConfigService.importFromEnv(content, req.platformAdmin!.id);
    res.json({ success: true, data: result } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'IMPORT_FAILED', message: error.message } });
  }
});

// GET /runtime — hot-reloadable values (admin + service token)
router.get('/runtime', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const runtime = await platformConfigService.getRuntimeConfig();
    res.json({ success: true, data: runtime } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'RUNTIME_CONFIG_FAILED', message: error.message } });
  }
});

// GET /audit — change history
router.get('/audit', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { key, page, per_page } = req.query as Record<string, string>;
    const result = await platformConfigService.getAuditHistory({
      key: key || undefined,
      page: page ? parseInt(page) : undefined,
      per_page: per_page ? parseInt(per_page) : undefined,
    });

    res.json({
      success: true,
      data: result.audits,
      meta: {
        total: result.total,
        page: page ? parseInt(page) : 1,
        per_page: per_page ? parseInt(per_page) : 25,
      },
    } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'AUDIT_FAILED', message: error.message } });
  }
});

// POST /seed — one-time seed from env vars (super_admin only)
router.post('/seed', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    await platformConfigService.seedDefaults();
    res.json({ success: true, data: { message: 'Config defaults seeded from environment' } } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SEED_FAILED', message: error.message } });
  }
});

// ── Key Management (approval workflow) ──────────────────────────────────────

// GET /key/generate — generate a new random encryption key
router.get('/key/generate', requirePlatformSuperAdmin as any, async (_req: PlatformAdminRequest, res) => {
  try {
    res.json({ success: true, data: { key: PlatformConfigService.generateKey() } } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'GENERATE_KEY_FAILED', message: error.message } });
  }
});

// GET /key/requests — list key change requests
router.get('/key/requests', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { page, per_page } = req.query as Record<string, string>;
    const result = await platformConfigService.listKeyChangeRequests(
      page ? parseInt(page) : 1,
      per_page ? parseInt(per_page) : 10,
    );
    res.json({
      success: true,
      data: result.requests,
      meta: { total: result.total, page: page ? parseInt(page) : 1, per_page: per_page ? parseInt(per_page) : 10 },
    } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'LIST_KEY_REQUESTS_FAILED', message: error.message } });
  }
});

// POST /key/request — create a new key change request
router.post('/key/request', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { scenario, reason } = req.body;
    if (!scenario || !['rotate', 'reset'].includes(scenario)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'scenario must be "rotate" or "reset"' } });
    }
    const request = await platformConfigService.requestKeyChange(scenario, reason || '', req.platformAdmin!.id);
    res.status(201).json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    const status = error.message.includes('already exists') ? 409 : 500;
    res.status(status).json({ success: false, error: { code: 'CREATE_KEY_REQUEST_FAILED', message: error.message } });
  }
});

// GET /key/requests/:id — single key change request
router.get('/key/requests/:id', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const request = await platformConfigService.getKeyChangeRequest(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Key change request not found' } });
    }
    res.json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'GET_KEY_REQUEST_FAILED', message: error.message } });
  }
});

// POST /key/requests/:id/approve — approve (enforces dual-control)
router.post('/key/requests/:id/approve', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const request = await platformConfigService.approveKeyChange(req.params.id, req.platformAdmin!.id);
    res.json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    const status = error.message.includes('dual-control') ? 403 : error.message.includes('expired') ? 410 : 400;
    res.status(status).json({ success: false, error: { code: 'APPROVE_FAILED', message: error.message } });
  }
});

// POST /key/requests/:id/deny — deny a pending request
router.post('/key/requests/:id/deny', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { reason } = req.body || {};
    const request = await platformConfigService.denyKeyChange(req.params.id, req.platformAdmin!.id, reason);
    res.json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'DENY_FAILED', message: error.message } });
  }
});

// POST /key/requests/:id/cancel — cancel (requester only)
router.post('/key/requests/:id/cancel', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const request = await platformConfigService.cancelKeyChange(req.params.id, req.platformAdmin!.id);
    res.json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    const status = error.message.includes('Only the requester') ? 403 : 400;
    res.status(status).json({ success: false, error: { code: 'CANCEL_FAILED', message: error.message } });
  }
});

// POST /key/requests/:id/execute — execute an approved request
router.post('/key/requests/:id/execute', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { new_key } = req.body || {};
    const request = await platformConfigService.executeKeyChange(req.params.id, req.platformAdmin!.id, new_key);
    res.json({ success: true, data: request } as VaasApiResponse);
  } catch (error: any) {
    const status = error.message.includes('required for rotation') ? 400 : 500;
    res.status(status).json({ success: false, error: { code: 'EXECUTE_FAILED', message: error.message } });
  }
});

// ── Parameterized routes (MUST come after static routes) ────────────────────

// GET /:key — single key (decrypted, super_admin only)
router.get('/:key', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const value = await platformConfigService.getValue(req.params.key);
    if (value === null) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Config key not found' } });
    }
    res.json({ success: true, data: { key: req.params.key, value } } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'GET_CONFIG_FAILED', message: error.message } });
  }
});

// PUT /:key — set value (super_admin only)
router.put('/:key', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { value, category, is_secret, requires_restart, description } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Value is required' } });
    }

    await platformConfigService.setValue(req.params.key, String(value), req.platformAdmin!.id, {
      category,
      is_secret,
      requires_restart,
      description,
    });

    res.json({ success: true, data: { message: `Config key "${req.params.key}" updated` } } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SET_CONFIG_FAILED', message: error.message } });
  }
});

// DELETE /:key — delete key (super_admin only)
router.delete('/:key', requirePlatformSuperAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    await platformConfigService.deleteKey(req.params.key, req.platformAdmin!.id);
    res.json({ success: true, data: { message: `Config key "${req.params.key}" deleted` } } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_CONFIG_FAILED', message: error.message } });
  }
});

export default router;
