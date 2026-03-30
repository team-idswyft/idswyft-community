import { describe, it, expect } from 'vitest';
import { getCountryFormat, validateIdNumber, INTERNATIONAL_ID_FORMATS } from '@idswyft/shared';

describe('International ID Format Registry', () => {
  describe('getCountryFormat', () => {
    it('returns format for known country + document type', () => {
      const format = getCountryFormat('GB', 'drivers_license');
      expect(format).not.toBeNull();
      expect(format!.date_format).toBe('DMY');
    });

    it('returns null for unknown country', () => {
      expect(getCountryFormat('XX', 'drivers_license')).toBeNull();
    });

    it('returns null for unknown document type', () => {
      expect(getCountryFormat('GB', 'spaceship_license')).toBeNull();
    });

    it('is case-insensitive on country code', () => {
      expect(getCountryFormat('gb', 'drivers_license')).not.toBeNull();
    });

    it('returns correct format for German Personalausweis', () => {
      const format = getCountryFormat('DE', 'national_id');
      expect(format).not.toBeNull();
      expect(format!.has_mrz).toBe(true);
      expect(format!.field_labels.name.length).toBeGreaterThan(0);
    });

    it('returns correct format for Brazilian CNH', () => {
      const format = getCountryFormat('BR', 'drivers_license');
      expect(format).not.toBeNull();
      expect(format!.date_format).toBe('DMY');
    });

    it('returns correct format for Japanese DL', () => {
      const format = getCountryFormat('JP', 'drivers_license');
      expect(format).not.toBeNull();
      expect(format!.date_format).toBe('YMD');
    });
  });

  describe('validateIdNumber', () => {
    // UK
    it('validates UK driving licence number', () => {
      expect(validateIdNumber('GB', 'drivers_license', 'MORGA657054SM9IJ')).toBe(true);
    });

    it('rejects invalid UK driving licence number', () => {
      expect(validateIdNumber('GB', 'drivers_license', '12345')).toBe(false);
    });

    // Spain DNI
    it('validates Spanish DNI number', () => {
      expect(validateIdNumber('ES', 'national_id', '12345678A')).toBe(true);
    });

    it('rejects invalid Spanish DNI', () => {
      expect(validateIdNumber('ES', 'national_id', '123')).toBe(false);
    });

    // Brazil CNH
    it('validates Brazilian CNH number', () => {
      expect(validateIdNumber('BR', 'drivers_license', '12345678901')).toBe(true);
    });

    // Singapore NRIC
    it('validates Singapore NRIC', () => {
      expect(validateIdNumber('SG', 'national_id', 'S1234567A')).toBe(true);
    });

    // Unknown country — no validation constraint
    it('passes validation for unknown country', () => {
      expect(validateIdNumber('XX', 'drivers_license', 'anything')).toBe(true);
    });
  });

  describe('registry coverage', () => {
    const expectedCountries = ['GB', 'CA', 'AU', 'NZ', 'DE', 'FR', 'IT', 'ES', 'NL',
      'BR', 'MX', 'AR', 'JP', 'KR', 'IN', 'SG', 'PH', 'TH', 'VN'];

    for (const country of expectedCountries) {
      it(`has format definition for ${country}`, () => {
        expect(INTERNATIONAL_ID_FORMATS[country]).toBeDefined();
        expect(INTERNATIONAL_ID_FORMATS[country].document_types.length).toBeGreaterThan(0);
      });
    }

    it('each format has required fields', () => {
      for (const [country, def] of Object.entries(INTERNATIONAL_ID_FORMATS)) {
        for (const doc of def.document_types) {
          expect(doc.type, `${country} missing type`).toBeTruthy();
          expect(doc.id_number_regex, `${country} missing id_number_regex`).toBeInstanceOf(RegExp);
          expect(doc.date_format, `${country} missing date_format`).toMatch(/^(DMY|MDY|YMD)$/);
          expect(doc.field_labels.name.length, `${country} missing name labels`).toBeGreaterThan(0);
          expect(doc.field_labels.date_of_birth.length, `${country} missing dob labels`).toBeGreaterThan(0);
        }
      }
    });
  });
});
