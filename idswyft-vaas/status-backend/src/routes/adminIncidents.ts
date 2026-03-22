import { Router } from 'express';
import { requireServiceToken } from '../middleware/serviceAuth.js';
import { incidentService } from '../services/incidentService.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();
router.use(requireServiceToken as any);

// GET /api/admin/incidents
router.get('/', async (_req, res) => {
  try {
    const incidents = await incidentService.getAll();
    res.json({ success: true, data: incidents } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// POST /api/admin/incidents
router.post('/', async (req, res) => {
  try {
    const { title, severity, affected_services, status, created_by } = req.body;
    if (!title || !severity || !affected_services) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'title, severity, and affected_services are required' } });
      return;
    }
    const incident = await incidentService.create({ title, severity, affected_services, status, created_by });
    res.status(201).json({ success: true, data: incident } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// PATCH /api/admin/incidents/:id
router.patch('/:id', async (req, res) => {
  try {
    const incident = await incidentService.update(req.params.id, req.body);
    res.json({ success: true, data: incident } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// POST /api/admin/incidents/:id/updates
router.post('/:id/updates', async (req, res) => {
  try {
    const { message, status, created_by } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'message is required' } });
      return;
    }
    const update = await incidentService.addUpdate(req.params.id, { message, status, created_by });
    res.status(201).json({ success: true, data: update } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// DELETE /api/admin/incidents/:id
router.delete('/:id', async (req, res) => {
  try {
    await incidentService.delete(req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
