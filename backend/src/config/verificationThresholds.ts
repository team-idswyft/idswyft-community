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

  // Front-document face presence thresholds
  FACE_PRESENCE: {
    minimum_confidence: number;
    high_confidence: number;
  };
  
  // PDF417 barcode validation thresholds
  PDF417: {
    minimum_confidence: number;
    high_confidence: number;
  };

  // Document authenticity / tamper detection thresholds
  DOCUMENT_AUTHENTICITY: {
    /** FFT GAN score below this triggers soft flag */
    fft_gan_threshold: number;
    /** Color anomaly score below this triggers soft flag */
    color_anomaly_threshold: number;
    /** Minimum zone compliance score */
    zone_compliance_min: number;
    /** Minimum overall authenticity score (lenient initially) */
    min_authenticity_score: number;
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
    production: 0.60,  // Per architecture spec: cosine similarity threshold
    sandbox: 0.55      // Slightly more lenient for testing
  },
  
  // Liveness detection thresholds (anti-spoofing)
  LIVENESS: {
    production: 0.75,  // High security requirement
    sandbox: 0.65      // More lenient for development/testing
  },
  
  // Cross-validation between front and back document data
  CROSS_VALIDATION: 0.75,
  
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

  // Face presence on the front document
  FACE_PRESENCE: {
    minimum_confidence: 0.45,
    high_confidence: 0.75
  },
  
  // PDF417 barcode confidence levels
  PDF417: {
    minimum_confidence: 0.70,  // Below this = potential parsing issues
    high_confidence: 0.90      // Above this = excellent parsing
  },

  // Document authenticity thresholds (soft flags initially — tune after traffic)
  DOCUMENT_AUTHENTICITY: {
    fft_gan_threshold: 0.70,       // GAN score below 0.70 → flag
    color_anomaly_threshold: 0.60, // Color score below 0.60 → flag
    zone_compliance_min: 0.75,     // Zone score below 0.75 → flag
    min_authenticity_score: 0.50,  // Lenient — tighten after Phase 2 tuning
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

export function getFaceMatchingThresholdSync(isSandbox: boolean = false): number {
  return isSandbox ?
    VERIFICATION_THRESHOLDS.FACE_MATCHING.sandbox :
    VERIFICATION_THRESHOLDS.FACE_MATCHING.production;
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

export function getLivenessThresholdSync(isSandbox: boolean = false): number {
  return isSandbox ?
    VERIFICATION_THRESHOLDS.LIVENESS.sandbox :
    VERIFICATION_THRESHOLDS.LIVENESS.production;
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
  
  // undefined/null scores are treated as FAILING — a missing score means
  // the check was never performed, which is not a pass condition
  const photoConsistencyPassed = scores.photoConsistency != null &&
    scores.photoConsistency >= thresholds.PHOTO_CONSISTENCY;

  const faceMatchingPassed = scores.faceMatching != null &&
    scores.faceMatching >= faceMatchingThreshold;

  const livenessPassed = scores.liveness != null &&
    scores.liveness >= livenessThreshold;

  const crossValidationPassed = scores.crossValidation != null &&
    scores.crossValidation >= thresholds.CROSS_VALIDATION;

  const qualityPassed = scores.quality != null &&
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
    face_presence_minimum: thresholds.FACE_PRESENCE.minimum_confidence,
    pdf417_minimum: thresholds.PDF417.minimum_confidence,
    authenticity_fft_threshold: thresholds.DOCUMENT_AUTHENTICITY.fft_gan_threshold,
    authenticity_color_threshold: thresholds.DOCUMENT_AUTHENTICITY.color_anomaly_threshold,
    authenticity_zone_min: thresholds.DOCUMENT_AUTHENTICITY.zone_compliance_min,
    authenticity_min_score: thresholds.DOCUMENT_AUTHENTICITY.min_authenticity_score,
  };
}
