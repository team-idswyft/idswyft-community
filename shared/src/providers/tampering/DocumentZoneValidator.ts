/**
 * Document Zone Validator
 *
 * Validates that detected elements (face, text, MRZ) appear in expected
 * spatial zones for each document type. Uses normalized coordinates (0-1)
 * so validation is resolution-independent.
 *
 * Supported layouts:
 *   - US Driver's License (AAMVA standard)
 *   - Passport (ICAO 9303 TD3 -- universal)
 *   - National ID (ICAO TD1 -- generic)
 *
 * Zone definitions use generous margins to accommodate scanning angles,
 * cropping variations, and country-specific layout differences.
 */

import { logger } from '@/utils/logger.js';
import type { FaceBufferDetectionResult } from '@/types/faceRecognition.js';

// --- Types ----------------------------------------------------------------

/** Reuse the canonical bounding box shape from face detection */
export type BoundingBox = FaceBufferDetectionResult['boundingBox'];

/** A rectangular zone defined in normalized (0-1) coordinates */
interface NormalizedZone {
  /** Zone label for reporting */
  name: string;
  /** Left edge (0-1) */
  x: number;
  /** Top edge (0-1) */
  y: number;
  /** Width (0-1) */
  w: number;
  /** Height (0-1) */
  h: number;
}

interface DocumentLayout {
  /** Document type identifier */
  type: string;
  /** Expected photo zone -- where the face should appear */
  photoZone: NormalizedZone;
  /** Minimum face area as fraction of document area (prevents tiny/fake faces) */
  minFaceAreaRatio: number;
  /** Maximum face area as fraction of document area (prevents full-image face) */
  maxFaceAreaRatio: number;
}

export interface ZoneValidationResult {
  /** Number of zone constraints checked */
  zonesChecked: number;
  /** Number of constraints that passed */
  zonesPassed: number;
  /** Specific violations found */
  violations: string[];
  /** Overall score (0-1) */
  score: number;
}

// --- Layout Registry ------------------------------------------------------

/**
 * Document layout definitions.
 *
 * US Driver's License: photo on left side (~left 35%, vertically centered).
 * Passport (ICAO TD3): photo in upper-left quadrant.
 * National ID (TD1): photo typically left side, similar to DL.
 *
 * Zones use generous margins (+/-10-15%) to handle:
 * - Different US state DL layouts
 * - Camera angle variation
 * - Post-crop alignment shifts
 */
export const DOCUMENT_LAYOUTS: Record<string, DocumentLayout> = {
  drivers_license: {
    type: 'drivers_license',
    photoZone: {
      name: 'DL_PHOTO_ZONE',
      x: 0.0,   // left edge
      y: 0.05,  // slight top margin
      w: 0.50,  // left half (generous -- US states vary)
      h: 0.85,  // most of vertical space
    },
    minFaceAreaRatio: 0.02,  // face must be at least 2% of document
    maxFaceAreaRatio: 0.35,  // face can't be more than 35% of document
  },

  passport: {
    type: 'passport',
    photoZone: {
      name: 'PASSPORT_PHOTO_ZONE',
      // ICAO TD3: photo in upper portion, left of center
      x: 0.0,
      y: 0.0,
      w: 0.50,
      h: 0.70, // upper 70% (MRZ occupies bottom ~20-25%)
    },
    minFaceAreaRatio: 0.03,
    maxFaceAreaRatio: 0.30,
  },

  national_id: {
    type: 'national_id',
    photoZone: {
      name: 'NATIONAL_ID_PHOTO_ZONE',
      // TD1 cards: photo typically left side
      x: 0.0,
      y: 0.0,
      w: 0.55,
      h: 0.90,
    },
    minFaceAreaRatio: 0.02,
    maxFaceAreaRatio: 0.40,
  },
};

// --- Validator ------------------------------------------------------------

export class DocumentZoneValidator {
  /**
   * Validate detected face position against expected document layout.
   *
   * @param faceBBox       Pixel-coordinate bounding box from face detection
   * @param imageWidth     Full image width in pixels
   * @param imageHeight    Full image height in pixels
   * @param documentType   Document type key (drivers_license, passport, national_id)
   * @param country        ISO 3166-1 alpha-2 country code (for future per-country layouts)
   */
  validate(
    faceBBox: BoundingBox,
    imageWidth: number,
    imageHeight: number,
    documentType: string,
    country: string = 'US',
  ): ZoneValidationResult {
    const violations: string[] = [];
    let checksPerformed = 0;
    let checksPassed = 0;

    const layout = DOCUMENT_LAYOUTS[documentType] || DOCUMENT_LAYOUTS.national_id;

    // Normalize face bounding box to 0-1 range
    const normFace = {
      x: faceBBox.x / imageWidth,
      y: faceBBox.y / imageHeight,
      w: faceBBox.width / imageWidth,
      h: faceBBox.height / imageHeight,
    };
    const faceCenterX = normFace.x + normFace.w / 2;
    const faceCenterY = normFace.y + normFace.h / 2;
    const faceArea = normFace.w * normFace.h;

    // -- Check 1: Face center within photo zone --------------------
    checksPerformed++;
    const zone = layout.photoZone;
    const inZone =
      faceCenterX >= zone.x &&
      faceCenterX <= zone.x + zone.w &&
      faceCenterY >= zone.y &&
      faceCenterY <= zone.y + zone.h;

    if (inZone) {
      checksPassed++;
    } else {
      violations.push(
        `FACE_OUTSIDE_PHOTO_ZONE: center (${faceCenterX.toFixed(2)}, ${faceCenterY.toFixed(2)}) ` +
        `outside ${zone.name} [${zone.x}-${(zone.x + zone.w).toFixed(2)}, ${zone.y}-${(zone.y + zone.h).toFixed(2)}]`,
      );
    }

    // -- Check 2: Face area minimum (prevents tiny/stamp-sized faces)
    checksPerformed++;
    if (faceArea >= layout.minFaceAreaRatio) {
      checksPassed++;
    } else {
      violations.push(
        `FACE_TOO_SMALL: area ratio ${faceArea.toFixed(4)} < min ${layout.minFaceAreaRatio}`,
      );
    }

    // -- Check 3: Face area maximum (prevents full-image selfie as "document")
    checksPerformed++;
    if (faceArea <= layout.maxFaceAreaRatio) {
      checksPassed++;
    } else {
      violations.push(
        `FACE_TOO_LARGE: area ratio ${faceArea.toFixed(4)} > max ${layout.maxFaceAreaRatio}`,
      );
    }

    // -- Check 4: Face aspect ratio (faces are taller than wide) ---
    checksPerformed++;
    const faceAspect = normFace.h > 0 ? normFace.w / normFace.h : 0;
    // Normal face aspect ratio: 0.55 - 1.0 (width/height)
    if (faceAspect >= 0.45 && faceAspect <= 1.15) {
      checksPassed++;
    } else {
      violations.push(
        `FACE_ABNORMAL_ASPECT: w/h ratio ${faceAspect.toFixed(2)} outside [0.45, 1.15]`,
      );
    }

    // -- Check 5: Face not at extreme edges (likely cropping artifact)
    checksPerformed++;
    const edgeMargin = 0.02; // 2% from any edge
    const notAtEdge =
      normFace.x >= edgeMargin &&
      normFace.y >= edgeMargin &&
      (normFace.x + normFace.w) <= (1 - edgeMargin) &&
      (normFace.y + normFace.h) <= (1 - edgeMargin);

    if (notAtEdge) {
      checksPassed++;
    } else {
      violations.push('FACE_AT_EDGE: face bounding box touches image edge');
    }

    const score = checksPerformed > 0 ? checksPassed / checksPerformed : 0;

    if (violations.length > 0) {
      logger.info('Zone validation violations', {
        documentType,
        country,
        violations,
        score: score.toFixed(2),
      });
    }

    return {
      zonesChecked: checksPerformed,
      zonesPassed: checksPassed,
      violations,
      score,
    };
  }
}
