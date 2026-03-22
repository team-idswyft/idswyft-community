import { Router, Response } from 'express';
import { requirePlatformSuperAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';

const router = Router();
router.use(requirePlatformSuperAdmin as any);

const STATUS_API = process.env.STATUS_API_URL || 'http://localhost:3003';
const STATUS_TOKEN = process.env.STATUS_SERVICE_TOKEN || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function proxy(req: PlatformAdminRequest, res: Response, method: string, path: string) {
  try {
    const adminEmail = req.platformAdmin?.email || 'unknown';

    // Inject created_by into body for write operations
    let body: string | undefined;
    if (method !== 'GET' && method !== 'DELETE') {
      body = JSON.stringify({ ...req.body, created_by: adminEmail });
    }

    const response = await fetch(`${STATUS_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': STATUS_TOKEN,
      },
      body,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: { code: 'PROXY_ERROR', message: `Status service unavailable: ${err.message}` } });
  }
}

function validateId(req: any, res: Response): boolean {
  if (req.params.id && !UUID_RE.test(req.params.id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Invalid incident ID format' } });
    return false;
  }
  return true;
}

router.get('/',           (req, res) => proxy(req as PlatformAdminRequest, res, 'GET', '/api/admin/incidents'));
router.post('/',          (req, res) => proxy(req as PlatformAdminRequest, res, 'POST', '/api/admin/incidents'));
router.patch('/:id',      (req, res) => { if (validateId(req, res)) proxy(req as PlatformAdminRequest, res, 'PATCH', `/api/admin/incidents/${req.params.id}`); });
router.post('/:id/updates', (req, res) => { if (validateId(req, res)) proxy(req as PlatformAdminRequest, res, 'POST', `/api/admin/incidents/${req.params.id}/updates`); });
router.delete('/:id',     (req, res) => { if (validateId(req, res)) proxy(req as PlatformAdminRequest, res, 'DELETE', `/api/admin/incidents/${req.params.id}`); });

export default router;
