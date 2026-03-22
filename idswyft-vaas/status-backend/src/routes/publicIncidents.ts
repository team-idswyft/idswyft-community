import { Router } from 'express';
import { incidentService } from '../services/incidentService.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();

// GET /api/incidents — active first, then resolved last 90 days
router.get('/', async (_req, res) => {
  try {
    const incidents = await incidentService.getAll();
    const response: ApiResponse = { success: true, data: incidents };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// GET /api/incidents/:id — single incident with updates
router.get('/:id', async (req, res) => {
  try {
    const incident = await incidentService.getById(req.params.id);
    const response: ApiResponse = { success: true, data: incident };
    res.json(response);
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});

export default router;
