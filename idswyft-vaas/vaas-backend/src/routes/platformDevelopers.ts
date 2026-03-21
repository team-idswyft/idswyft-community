import { Router } from 'express';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { idswyftApiService } from '../services/idswyftApiService.js';

const router = Router();

// All routes require platform admin auth
router.use(requirePlatformAdmin as any);

// GET /api/platform/developers — list developers (proxied to main API)
router.get('/', async (req: PlatformAdminRequest, res) => {
  try {
    const result = await idswyftApiService.listDevelopers(req.query);
    res.json(result);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_DEVELOPERS_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// GET /api/platform/developers/:id — single developer detail
router.get('/:id', async (req: PlatformAdminRequest, res) => {
  try {
    const result = await idswyftApiService.getDeveloper(req.params.id);
    res.json(result);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_DEVELOPER_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/developers/:id/suspend
router.post('/:id/suspend', async (req: PlatformAdminRequest, res) => {
  try {
    const result = await idswyftApiService.suspendDeveloper(req.params.id);
    res.json(result);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'SUSPEND_DEVELOPER_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/developers/:id/unsuspend
router.post('/:id/unsuspend', async (req: PlatformAdminRequest, res) => {
  try {
    const result = await idswyftApiService.unsuspendDeveloper(req.params.id);
    res.json(result);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'UNSUSPEND_DEVELOPER_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

export default router;
