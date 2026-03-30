import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DocumentZoneValidator, DOCUMENT_LAYOUTS } from '@idswyft/shared';

describe('DocumentZoneValidator', () => {
  const validator = new DocumentZoneValidator();

  // Standard US DL: 856×540 pixels (3.375"×2.125" at 254dpi)
  const DL_WIDTH = 856;
  const DL_HEIGHT = 540;

  // Standard passport page: 1200×850 (common scan resolution)
  const PP_WIDTH = 1200;
  const PP_HEIGHT = 850;

  describe('layout registry', () => {
    it('has layouts for drivers_license, passport, and national_id', () => {
      expect(DOCUMENT_LAYOUTS).toHaveProperty('drivers_license');
      expect(DOCUMENT_LAYOUTS).toHaveProperty('passport');
      expect(DOCUMENT_LAYOUTS).toHaveProperty('national_id');
    });

    it('all layouts have valid zone definitions', () => {
      for (const [key, layout] of Object.entries(DOCUMENT_LAYOUTS)) {
        expect(layout.photoZone.x).toBeGreaterThanOrEqual(0);
        expect(layout.photoZone.y).toBeGreaterThanOrEqual(0);
        expect(layout.photoZone.w).toBeGreaterThan(0);
        expect(layout.photoZone.h).toBeGreaterThan(0);
        expect(layout.minFaceAreaRatio).toBeGreaterThan(0);
        expect(layout.maxFaceAreaRatio).toBeLessThanOrEqual(1);
        expect(layout.minFaceAreaRatio).toBeLessThan(layout.maxFaceAreaRatio);
      }
    });
  });

  describe('US driver license validation', () => {
    it('passes when face is in correct position (left side)', () => {
      // Face on left side of DL, typical position
      const result = validator.validate(
        { x: 50, y: 100, width: 180, height: 230 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.score).toBeGreaterThanOrEqual(0.8);
      expect(result.violations).toHaveLength(0);
      expect(result.zonesChecked).toBe(5);
      expect(result.zonesPassed).toBe(5);
    });

    it('flags face in wrong position (right side)', () => {
      // Face on right side — unusual for US DL
      const result = validator.validate(
        { x: 600, y: 100, width: 180, height: 230 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_OUTSIDE_PHOTO_ZONE'))).toBe(true);
      expect(result.score).toBeLessThan(1);
    });

    it('flags face too small (tiny face in corner)', () => {
      // Tiny face — less than 2% of document area
      const result = validator.validate(
        { x: 50, y: 50, width: 30, height: 40 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_TOO_SMALL'))).toBe(true);
    });

    it('flags face too large (selfie submitted as document)', () => {
      // Face covers most of the image — likely a selfie, not a document
      const result = validator.validate(
        { x: 100, y: 50, width: 600, height: 450 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_TOO_LARGE'))).toBe(true);
    });

    it('flags face at edge of image', () => {
      // Face touching left edge
      const result = validator.validate(
        { x: 0, y: 100, width: 180, height: 230 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_AT_EDGE'))).toBe(true);
    });
  });

  describe('passport validation', () => {
    it('passes when face is in upper-left (ICAO standard)', () => {
      // ICAO TD3: face photo in upper-left quadrant
      const result = validator.validate(
        { x: 80, y: 60, width: 200, height: 260 },
        PP_WIDTH, PP_HEIGHT,
        'passport', 'US',
      );

      expect(result.score).toBeGreaterThanOrEqual(0.8);
      expect(result.violations).toHaveLength(0);
    });

    it('flags face in MRZ zone (bottom of passport)', () => {
      // Face in the bottom 25% — MRZ zone
      const result = validator.validate(
        { x: 100, y: 700, width: 150, height: 120 },
        PP_WIDTH, PP_HEIGHT,
        'passport', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_OUTSIDE_PHOTO_ZONE'))).toBe(true);
    });
  });

  describe('face aspect ratio validation', () => {
    it('passes for normal face proportions', () => {
      const result = validator.validate(
        { x: 50, y: 50, width: 150, height: 200 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_ABNORMAL_ASPECT'))).toBe(false);
    });

    it('flags extremely wide "face" (likely not a face)', () => {
      // Very wide, very short — aspect ratio > 1.15
      const result = validator.validate(
        { x: 50, y: 100, width: 300, height: 100 },
        DL_WIDTH, DL_HEIGHT,
        'drivers_license', 'US',
      );

      expect(result.violations.some(v => v.includes('FACE_ABNORMAL_ASPECT'))).toBe(true);
    });
  });

  describe('fallback layout', () => {
    it('uses national_id layout for unknown document types', () => {
      const result = validator.validate(
        { x: 50, y: 50, width: 150, height: 200 },
        800, 600,
        'unknown_type', 'XX',
      );

      // Should not crash — falls back to national_id layout
      expect(result.zonesChecked).toBe(5);
      expect(typeof result.score).toBe('number');
    });
  });
});
