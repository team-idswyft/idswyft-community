/**
 * Platform-level Threshold Management API
 *
 * Allows platform admins to manage verification thresholds per organization.
 * Moved from org-scoped admin-thresholds to platform-level control.
 */

import { Router } from 'express';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { vaasSupabase } from '../config/database.js';

const router = Router();

// ── Default threshold settings ──────────────────────────────────────────────
const DEFAULT_THRESHOLDS = {
  production: {
    photo_consistency: 0.85,
    face_matching: 0.80,
    liveness: 0.75,
    cross_validation: 0.85,
    quality_minimum: 0.70,
    ocr_confidence: 0.80,
    pdf417_confidence: 0.85,
  },
  sandbox: {
    photo_consistency: 0.75,
    face_matching: 0.70,
    liveness: 0.65,
    cross_validation: 0.75,
    quality_minimum: 0.60,
    ocr_confidence: 0.70,
    pdf417_confidence: 0.75,
  },
};

const DEFAULT_ADMIN_SETTINGS = {
  auto_approve_threshold: 85,
  manual_review_threshold: 60,
  require_liveness: true,
  require_back_of_id: false,
  max_verification_attempts: 3,
};

/** Calculate technical thresholds from high-level admin settings */
function calculateThresholds(settings: typeof DEFAULT_ADMIN_SETTINGS) {
  const { auto_approve_threshold, require_liveness } = settings;
  const faceMatchingProd = Math.max(0.70, (auto_approve_threshold / 100) * 0.9);
  const faceMatchingSandbox = Math.max(0.60, (auto_approve_threshold / 100) * 0.8);
  const livenessProd = require_liveness ? Math.max(0.65, (auto_approve_threshold / 100) * 0.85) : 0;
  const livenessSandbox = require_liveness ? Math.max(0.55, (auto_approve_threshold / 100) * 0.75) : 0;

  return {
    production: {
      ...DEFAULT_THRESHOLDS.production,
      face_matching: faceMatchingProd,
      liveness: livenessProd,
    },
    sandbox: {
      ...DEFAULT_THRESHOLDS.sandbox,
      face_matching: faceMatchingSandbox,
      liveness: livenessSandbox,
    },
  };
}

/**
 * GET /api/platform/thresholds
 * List all organizations with their threshold settings
 */
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { data: orgs, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('id, name, slug, threshold_settings')
      .order('name');

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch organizations' },
      });
    }

    const result = (orgs || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      threshold_settings: org.threshold_settings || {
        ...DEFAULT_THRESHOLDS,
        meta: {
          organization_id: org.id,
          using_defaults: true,
          last_updated: null,
          admin_settings: DEFAULT_ADMIN_SETTINGS,
        },
      },
    }));

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
});

/**
 * GET /api/platform/thresholds/:org_id
 * Get thresholds for a specific organization
 */
router.get('/:org_id', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { org_id } = req.params;

    const { data: org, error } = await vaasSupabase
      .from('vaas_organizations')
      .select('id, name, slug, threshold_settings')
      .eq('id', org_id)
      .single();

    if (error || !org) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
    }

    const thresholds = org.threshold_settings || {
      ...DEFAULT_THRESHOLDS,
      meta: {
        organization_id: org_id,
        using_defaults: true,
        last_updated: null,
        admin_settings: DEFAULT_ADMIN_SETTINGS,
      },
    };

    res.json({ success: true, data: thresholds });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
});

/**
 * PUT /api/platform/thresholds/:org_id
 * Update thresholds for a specific organization
 */
router.put('/:org_id', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { org_id } = req.params;
    const {
      auto_approve_threshold = 85,
      manual_review_threshold = 60,
      require_liveness = true,
      require_back_of_id = false,
      max_verification_attempts = 3,
    } = req.body;

    // Validate
    if (auto_approve_threshold < 70 || auto_approve_threshold > 95) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Auto-approve threshold must be between 70% and 95%' },
      });
    }
    if (manual_review_threshold < 30 || manual_review_threshold > 80) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Manual review threshold must be between 30% and 80%' },
      });
    }

    const adminSettings = {
      auto_approve_threshold,
      manual_review_threshold,
      require_liveness,
      require_back_of_id,
      max_verification_attempts,
    };

    const computed = calculateThresholds(adminSettings);

    const thresholdSettings = {
      ...computed,
      meta: {
        organization_id: org_id,
        using_defaults: false,
        last_updated: new Date().toISOString(),
        admin_settings: adminSettings,
      },
    };

    const { error } = await vaasSupabase
      .from('vaas_organizations')
      .update({ threshold_settings: thresholdSettings, updated_at: new Date().toISOString() })
      .eq('id', org_id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to save threshold settings' },
      });
    }

    res.json({ success: true, data: thresholdSettings });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
});

/**
 * POST /api/platform/thresholds/:org_id/reset
 * Reset thresholds to defaults for an organization
 */
router.post('/:org_id/reset', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { org_id } = req.params;

    const defaultThresholds = {
      ...DEFAULT_THRESHOLDS,
      meta: {
        organization_id: org_id,
        using_defaults: true,
        last_updated: new Date().toISOString(),
        admin_settings: DEFAULT_ADMIN_SETTINGS,
      },
    };

    const { error } = await vaasSupabase
      .from('vaas_organizations')
      .update({ threshold_settings: defaultThresholds, updated_at: new Date().toISOString() })
      .eq('id', org_id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to reset threshold settings' },
      });
    }

    res.json({ success: true, data: defaultThresholds });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
});

/**
 * POST /api/platform/thresholds/:org_id/preview
 * Preview threshold impact without saving
 */
router.post('/:org_id/preview', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const {
      auto_approve_threshold = 85,
      manual_review_threshold = 60,
      require_liveness = true,
    } = req.body;

    const adminSettings = { ...DEFAULT_ADMIN_SETTINGS, auto_approve_threshold, manual_review_threshold, require_liveness };
    const computed = calculateThresholds(adminSettings);

    const previewData = {
      preview: computed,
      explanation: {
        auto_approve_threshold: `Verifications with ${auto_approve_threshold}%+ confidence will be automatically approved`,
        manual_review_threshold: `Verifications with ${manual_review_threshold}%+ confidence will go to manual review`,
        face_matching_production: `Face matching requires ${(computed.production.face_matching * 100).toFixed(0)}%+ similarity (production)`,
        liveness_detection: require_liveness
          ? `Liveness detection requires ${(computed.production.liveness * 100).toFixed(0)}%+ confidence`
          : 'Liveness detection is disabled',
      },
    };

    res.json({ success: true, data: previewData });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
});

export default router;
