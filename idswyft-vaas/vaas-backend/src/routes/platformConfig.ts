import { Router } from 'express';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, requirePlatformSuperAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformConfigService } from '../services/platformConfigService.js';

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
