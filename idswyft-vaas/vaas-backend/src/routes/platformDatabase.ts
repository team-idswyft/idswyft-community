import { Router } from 'express';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformSuperAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformDatabaseService } from '../services/platformDatabaseService.js';

const router = Router();

// All database management routes require platform super admin
router.use(requirePlatformSuperAdmin as any);

// GET /api/platform/database/stats?target=vaas|main
router.get('/stats', async (req: PlatformAdminRequest, res) => {
  try {
    const target = (req.query.target as string) === 'main' ? 'main' as const : 'vaas' as const;

    if (target === 'main' && !platformDatabaseService.isMainApiConfigured()) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Main API database is not configured' },
      };
      return res.status(400).json(response);
    }

    const stats = await platformDatabaseService.getDatabaseStats(target);
    const protectedTables = platformDatabaseService.getProtectedTables(target);
    const categories = platformDatabaseService.getCategoryMap();

    const response: VaasApiResponse = {
      success: true,
      data: { ...stats, protectedTables, categories },
    };
    res.json(response);
  } catch (error: any) {
    console.error('[platformDatabase] Stats error:', error.message);
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'STATS_ERROR', message: error.message || 'Failed to get database stats' },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/database/purge
router.post('/purge', async (req: PlatformAdminRequest, res) => {
  try {
    const { target, categories, olderThanDays } = req.body;

    if (!target || (target !== 'vaas' && target !== 'main')) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_TARGET', message: 'Target must be "vaas" or "main"' },
      };
      return res.status(400).json(response);
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_CATEGORIES', message: 'Categories must be a non-empty array' },
      };
      return res.status(400).json(response);
    }

    if (!olderThanDays || typeof olderThanDays !== 'number' || olderThanDays < 1) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_DAYS', message: 'olderThanDays must be a positive number' },
      };
      return res.status(400).json(response);
    }

    if (target === 'main' && !platformDatabaseService.isMainApiConfigured()) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Main API database is not configured' },
      };
      return res.status(400).json(response);
    }

    const result = await platformDatabaseService.purgeCategories(target, categories, olderThanDays);

    console.log(
      `[platformDatabase] Purge by ${req.platformAdmin?.email}: target=${target}, categories=${categories.join(',')}, olderThan=${olderThanDays}d, deleted=${result.totalDeleted}`
    );

    const response: VaasApiResponse = { success: true, data: result };
    res.json(response);
  } catch (error: any) {
    console.error('[platformDatabase] Purge error:', error.message);
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'PURGE_ERROR', message: error.message || 'Failed to purge data' },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/database/wipe
router.post('/wipe', async (req: PlatformAdminRequest, res) => {
  try {
    const { target, confirmPhrase } = req.body;

    if (!target || (target !== 'vaas' && target !== 'main')) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_TARGET', message: 'Target must be "vaas" or "main"' },
      };
      return res.status(400).json(response);
    }

    if (!confirmPhrase || typeof confirmPhrase !== 'string') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'MISSING_CONFIRMATION', message: 'confirmPhrase is required' },
      };
      return res.status(400).json(response);
    }

    if (target === 'main' && !platformDatabaseService.isMainApiConfigured()) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Main API database is not configured' },
      };
      return res.status(400).json(response);
    }

    const result = await platformDatabaseService.fullWipe(target, confirmPhrase);

    console.log(
      `[platformDatabase] FULL WIPE by ${req.platformAdmin?.email}: target=${target}, tables=${result.wipedTables.length}, deleted=${result.totalDeleted}`
    );

    const response: VaasApiResponse = { success: true, data: result };
    res.json(response);
  } catch (error: any) {
    console.error('[platformDatabase] Wipe error:', error.message);
    const status = error.message.includes('Confirmation phrase') ? 400 : 500;
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'WIPE_ERROR', message: error.message || 'Failed to wipe database' },
    };
    res.status(status).json(response);
  }
});

export default router;
