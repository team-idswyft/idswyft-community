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

// ── Sync threshold helpers (engine has no database, no dynamic overrides) ──

export function getFaceMatchingThresholdSync(isSandbox: boolean = false): number {
  return isSandbox ?
    VERIFICATION_THRESHOLDS.FACE_MATCHING.sandbox :
    VERIFICATION_THRESHOLDS.FACE_MATCHING.production;
}

export function getLivenessThresholdSync(isSandbox: boolean = false): number {
  return isSandbox ?
    VERIFICATION_THRESHOLDS.LIVENESS.sandbox :
    VERIFICATION_THRESHOLDS.LIVENESS.production;
}
