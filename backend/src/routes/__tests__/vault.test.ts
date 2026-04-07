import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  connectDB: vi.fn(),
}));

vi.mock('@/config/index.js', () => ({
  config: {
    nodeEnv: 'test',
    apiKeySecret: 'test-secret-key-for-hmac',
    encryptionKey: 'test-encryption-key-32chars!!!!',
    storage: { provider: 'local' },
    supabase: { storageBucket: 'identity-documents' },
    compliance: { dataRetentionDays: 90 },
  },
  default: {
    nodeEnv: 'test',
    apiKeySecret: 'test-secret-key-for-hmac',
    encryptionKey: 'test-encryption-key-32chars!!!!',
    storage: { provider: 'local' },
    supabase: { storageBucket: 'identity-documents' },
    compliance: { dataRetentionDays: 90 },
  },
}));

import { encryptVaultData, resolveAttribute } from '../../services/vaultService.js';

describe('vault route logic', () => {
  describe('resolveAttribute', () => {
    const sampleData = {
      full_name: 'John Doe',
      date_of_birth: '1970-01-15',
      nationality: 'US',
      document_type: 'drivers_license',
      document_number: 'D1234567',
      address: '123 Main St',
      expiry_date: '2028-01-01',
      face_match_score: 0.91,
      verified_at: '2026-04-06T12:00:00Z',
    };

    it('resolves age_over_21 for a 35-year-old', () => {
      const result = resolveAttribute(sampleData, 'age_over_21');
      expect(result).toEqual({ value: true });
    });

    it('resolves age_over_21 as false for a minor', () => {
      const minor = { ...sampleData, date_of_birth: '2015-01-01' };
      const result = resolveAttribute(minor, 'age_over_21');
      expect(result).toEqual({ value: false });
    });

    it('resolves nationality', () => {
      const result = resolveAttribute(sampleData, 'nationality');
      expect(result).toEqual({ value: 'US' });
    });

    it('resolves identity_verified as boolean', () => {
      const result = resolveAttribute(sampleData, 'identity_verified');
      expect(result).toEqual({ value: true });
    });

    it('returns null for unknown attribute', () => {
      const result = resolveAttribute(sampleData, 'unknown_field');
      expect(result).toBeNull();
    });

    it('returns null for age check with missing DOB', () => {
      const noAge = { ...sampleData, date_of_birth: null };
      const result = resolveAttribute(noAge, 'age_over_18');
      expect(result).toBeNull();
    });
  });

  describe('encryptVaultData roundtrip in route context', () => {
    it('encrypted data does not leak PII', () => {
      const data = { full_name: 'Secret Person', date_of_birth: '1985-01-01' };
      const encrypted = encryptVaultData(data);
      expect(encrypted).not.toContain('Secret');
      expect(encrypted).not.toContain('Person');
      expect(encrypted).not.toContain('1985');
    });
  });
});
