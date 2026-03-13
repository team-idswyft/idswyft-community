import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadPlatformAsset, getPlatformAssets } from '../services/assetService.js';
import { ASSET_TYPES, AssetType, VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requirePlatformAdmin as any);

// GET /api/platform/branding — get platform assets
router.get('/', async (req: PlatformAdminRequest, res: Response) => {
  try {
    const branding = await getPlatformAssets();
    const response: VaasApiResponse = { success: true, data: branding };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_BRANDING_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/branding/:assetType — upload platform asset
router.post('/:assetType', (upload.single('file') as any), async (req: PlatformAdminRequest, res: Response) => {
  try {
    const assetType = req.params.assetType as AssetType;
    if (!ASSET_TYPES.includes(assetType)) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_ASSET_TYPE', message: `Valid types: ${ASSET_TYPES.join(', ')}` },
      };
      return res.status(400).json(response);
    }

    if (!req.file) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      };
      return res.status(400).json(response);
    }

    const result = await uploadPlatformAsset(assetType, req.file);
    const response: VaasApiResponse = { success: true, data: result };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'UPLOAD_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

export default router;
