import { Router } from 'express';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformSuperAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { cronRegistry } from '../services/cronRegistryService.js';
import config from '../config/index.js';

const router = Router();

// Service-token auth for external cron reporters (must be before requirePlatformSuperAdmin)
router.post('/report', (req, res) => {
  const token = req.headers['x-service-token'];
  if (!token || token !== config.idswyftApi.serviceToken) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid service token' } } as VaasApiResponse);
  }

  const { id, lastRunAt, lastResult, lastError } = req.body;
  if (!id || !lastRunAt || !lastResult) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'id, lastRunAt, lastResult required' } } as VaasApiResponse);
  }
  if (lastResult !== 'success' && lastResult !== 'error') {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'lastResult must be "success" or "error"' } } as VaasApiResponse);
  }

  cronRegistry.reportRun(id, lastResult, lastError || undefined, lastRunAt);
  res.json({ success: true } as VaasApiResponse);
});

// Apply platform admin auth to all routes below this line
router.use(requirePlatformSuperAdmin as any);

// GET /api/platform/cron-jobs — list all registered cron jobs
router.get('/', (req: PlatformAdminRequest, res) => {
  const jobs = cronRegistry.getAll();
  const response: VaasApiResponse = { success: true, data: { jobs } };
  res.json(response);
});

// POST /api/platform/cron-jobs/:id/pause — pause a VaaS job
router.post('/:id/pause', (req: PlatformAdminRequest, res) => {
  const { id } = req.params;
  const job = cronRegistry.get(id);

  if (!job) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: `Job "${id}" not found` },
    };
    return res.status(404).json(response);
  }

  if (!job.controllable) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_CONTROLLABLE', message: `Job "${id}" is view-only and cannot be paused` },
    };
    return res.status(400).json(response);
  }

  if (job.status === 'stopped') {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'ALREADY_STOPPED', message: `Job "${id}" is already stopped` },
    };
    return res.status(400).json(response);
  }

  const updated = cronRegistry.pause(id);
  const response: VaasApiResponse = { success: true, data: { job: updated } };
  res.json(response);
});

// POST /api/platform/cron-jobs/:id/resume — resume a paused VaaS job
router.post('/:id/resume', (req: PlatformAdminRequest, res) => {
  const { id } = req.params;
  const job = cronRegistry.get(id);

  if (!job) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: `Job "${id}" not found` },
    };
    return res.status(404).json(response);
  }

  if (!job.controllable) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_CONTROLLABLE', message: `Job "${id}" is view-only and cannot be resumed` },
    };
    return res.status(400).json(response);
  }

  if (job.status === 'running') {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'ALREADY_RUNNING', message: `Job "${id}" is already running` },
    };
    return res.status(400).json(response);
  }

  const updated = cronRegistry.resume(id);
  const response: VaasApiResponse = { success: true, data: { job: updated } };
  res.json(response);
});

// POST /api/platform/cron-jobs/:id/trigger — trigger immediate run of a VaaS job
router.post('/:id/trigger', async (req: PlatformAdminRequest, res) => {
  const { id } = req.params;
  const job = cronRegistry.get(id);

  if (!job) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: `Job "${id}" not found` },
    };
    return res.status(404).json(response);
  }

  if (!job.controllable) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'NOT_CONTROLLABLE', message: `Job "${id}" is view-only and cannot be triggered` },
    };
    return res.status(400).json(response);
  }

  try {
    const triggered = await cronRegistry.trigger(id);
    if (!triggered) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'TRIGGER_FAILED', message: `Job "${id}" has no trigger function` },
      };
      return res.status(400).json(response);
    }

    const response: VaasApiResponse = {
      success: true,
      data: { message: `Job "${id}" triggered successfully`, job: cronRegistry.get(id) },
    };
    res.json(response);
  } catch (err: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'TRIGGER_ERROR', message: err.message || 'Trigger failed' },
    };
    res.status(500).json(response);
  }
});

export default router;
