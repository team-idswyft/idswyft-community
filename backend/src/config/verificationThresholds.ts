/**
 * Centralized Verification Thresholds Configuration
 * 
 * This module provides consistent threshold values across the entire verification system
 * to ensure predictable behavior and easy maintenance.
 */

export interface VerificationThresholds {
  // Photo consistency between front and back documents
  PHOTO_CONSISTENCY: number;
  
  // Face matching between document photo and selfie
  FACE_MATCHING: {
    production: number;
    sandbox: number;
  };
  
  // Liveness detection to prevent spoofing
  LIVENESS: {
    production: number;
    sandbox: number;
  };
  
  // Cross-validation between front OCR and back barcode data
  CROSS_VALIDATION: number;
  
  // Document quality thresholds
  QUALITY: {
    minimum_acceptable: number;
    good_quality: number;
  };
  
  // OCR confidence thresholds
  OCR_CONFIDENCE: {
    minimum_acceptable: number;
    high_confidence: number;
  };
  
  // PDF417 barcode validation thresholds
  PDF417: {
    minimum_confidence: number;
    high_confidence: number;
  };
}

/**
 * Default verification thresholds
 * These values have been calibrated based on testing and security requirements
 */
export const VERIFICATION_THRESHOLDS: VerificationThresholds = {
  // Photo consistency between front and back documents (anti-fraud)
  PHOTO_CONSISTENCY: 0.75,
  
  // Face matching thresholds (document photo vs selfie)
  FACE_MATCHING: {
    production: 0.85,  // Stricter for production
    sandbox: 0.80      // Slightly more lenient for testing
  },
  
  // Liveness detection thresholds (anti-spoofing)
  LIVENESS: {
    production: 0.75,  // High security requirement
    sandbox: 0.65      // More lenient for development/testing
  },
  
  // Cross-validation between front and back document data
  CROSS_VALIDATION: 0.70,
  
  // Document quality assessment
  QUALITY: {
    minimum_acceptable: 0.50,  // Below this = quality issues
    good_quality: 0.75         // Above this = high quality
  },
  
  // OCR confidence levels
  OCR_CONFIDENCE: {
    minimum_acceptable: 0.60,  // Below this may need manual review
    high_confidence: 0.85      // Above this = very reliable
  },
  
  // PDF417 barcode confidence levels
  PDF417: {
    minimum_confidence: 0.70,  // Below this = potential parsing issues
    high_confidence: 0.90      // Above this = excellent parsing
  }
};

/**
 * Get threshold values based on sandbox mode
 * Now supports dynamic organization-specific overrides
 */
export async function getThresholds(
  isSandbox: boolean = false, 
  organizationId?: string
): Promise<VerificationThresholds> {
  // If organization ID provided, check for dynamic overrides
  if (organizationId) {
    try {
      const { DynamicThresholdManager } = await import('./dynamicThresholds.js');
      const thresholdManager = DynamicThresholdManager.getInstance();
      return await thresholdManager.getThresholdsForOrganization(organizationId, isSandbox);
    } catch (error) {
      // Fallback to defaults if dynamic thresholds fail
      console.warn('Failed to get dynamic thresholds, using defaults:', error);
    }
  }
  
  // Return default thresholds
  return {
    ...VERIFICATION_THRESHOLDS,
    FACE_MATCHING: {
      production: VERIFICATION_THRESHOLDS.FACE_MATCHING.production,
      sandbox: VERIFICATION_THRESHOLDS.FACE_MATCHING.sandbox
    },
    LIVENESS: {
      production: VERIFICATION_THRESHOLDS.LIVENESS.production,
      sandbox: VERIFICATION_THRESHOLDS.LIVENESS.sandbox
    }
  };
}

/**
 * Get face matching threshold for current environment
 * Now supports dynamic organization-specific overrides
 */
export async function getFaceMatchingThreshold(
  isSandbox: boolean = false, 
  organizationId?: string
): Promise<number> {
  const thresholds = await getThresholds(isSandbox, organizationId);
  return isSandbox ? 
    thresholds.FACE_MATCHING.sandbox : 
    thresholds.FACE_MATCHING.production;
}

/**
 * Get liveness detection threshold for current environment
 * Now supports dynamic organization-specific overrides
 */
export async function getLivenessThreshold(
  isSandbox: boolean = false, 
  organizationId?: string
): Promise<number> {
  const thresholds = await getThresholds(isSandbox, organizationId);
  return isSandbox ? 
    thresholds.LIVENESS.sandbox : 
    thresholds.LIVENESS.production;
}

/**
 * Validate if scores meet thresholds for verification success
 */
export async function validateScores(scores: {
  photoConsistency?: number;
  faceMatching?: number;
  liveness?: number;
  crossValidation?: number;
  quality?: number;
}, isSandbox: boolean = false, organizationId?: string): Promise<{
  photoConsistencyPassed: boolean;
  faceMatchingPassed: boolean;
  livenessPassed: boolean;
  crossValidationPassed: boolean;
  qualityPassed: boolean;
  overallPassed: boolean;
}> {
  const thresholds = await getThresholds(isSandbox, organizationId);
  const faceMatchingThreshold = await getFaceMatchingThreshold(isSandbox, organizationId);
  const livenessThreshold = await getLivenessThreshold(isSandbox, organizationId);
  
  const photoConsistencyPassed = scores.photoConsistency === undefined || scores.photoConsistency === null ||
    scores.photoConsistency >= thresholds.PHOTO_CONSISTENCY;

  const faceMatchingPassed = scores.faceMatching === undefined || scores.faceMatching === null ||
    scores.faceMatching >= faceMatchingThreshold;

  const livenessPassed = scores.liveness === undefined || scores.liveness === null ||
    scores.liveness >= livenessThreshold;

  const crossValidationPassed = scores.crossValidation === undefined || scores.crossValidation === null ||
    scores.crossValidation >= thresholds.CROSS_VALIDATION;

  const qualityPassed = scores.quality === undefined || scores.quality === null ||
    scores.quality >= thresholds.QUALITY.minimum_acceptable;
  
  const overallPassed = photoConsistencyPassed && 
    faceMatchingPassed && 
    livenessPassed && 
    crossValidationPassed && 
    qualityPassed;
  
  return {
    photoConsistencyPassed,
    faceMatchingPassed,
    livenessPassed,
    crossValidationPassed,
    qualityPassed,
    overallPassed
  };
}

/**
 * Get human-readable threshold information for logging/debugging
 */
export async function getThresholdInfo(isSandbox: boolean = false, organizationId?: string): Promise<Record<string, any>> {
  const thresholds = await getThresholds(isSandbox, organizationId);
  const faceMatchingThreshold = await getFaceMatchingThreshold(isSandbox, organizationId);
  const livenessThreshold = await getLivenessThreshold(isSandbox, organizationId);
  
  return {
    environment: isSandbox ? 'sandbox' : 'production',
    organization_id: organizationId || 'default',
    photo_consistency: thresholds.PHOTO_CONSISTENCY,
    face_matching: faceMatchingThreshold,
    liveness: livenessThreshold,
    cross_validation: thresholds.CROSS_VALIDATION,
    quality_minimum: thresholds.QUALITY.minimum_acceptable,
    ocr_minimum: thresholds.OCR_CONFIDENCE.minimum_acceptable,
    pdf417_minimum: thresholds.PDF417.minimum_confidence
  };
}