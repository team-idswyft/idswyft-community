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

import { encryptVaultData, decryptVaultData, generateVaultToken, extractIdentityData } from '../vaultService.js';

describe('vaultService', () => {
  describe('generateVaultToken', () => {
    it('returns a token with ivt_ prefix and 64 hex chars', () => {
      const token = generateVaultToken();
      expect(token).toMatch(/^ivt_[a-f0-9]{64}$/);
    });

    it('generates unique tokens', () => {
      const a = generateVaultToken();
      const b = generateVaultToken();
      expect(a).not.toBe(b);
    });
  });

  describe('encryptVaultData / decryptVaultData', () => {
    it('round-trips data through encryption and decryption', () => {
      const data = { full_name: 'John Doe', date_of_birth: '1990-01-15', nationality: 'US' };
      const encrypted = encryptVaultData(data);
      expect(encrypted).not.toContain('John Doe');
      const decrypted = decryptVaultData(encrypted);
      expect(decrypted).toEqual(data);
    });

    it('produces different ciphertext for same input (random IV)', () => {
      const data = { full_name: 'Test' };
      const a = encryptVaultData(data);
      const b = encryptVaultData(data);
      expect(a).not.toBe(b);
    });

    it('uses iv:tag:ciphertext hex format', () => {
      const encrypted = encryptVaultData({ test: true });
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[a-f0-9]{24}$/);  // 12 bytes = 24 hex
      expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);  // 16 bytes = 32 hex
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });

  describe('extractIdentityData', () => {
    it('extracts OCR fields from session state', () => {
      const state = {
        front_extraction: {
          ocr: {
            full_name: 'Jane Smith',
            date_of_birth: '1985-03-22',
            document_number: 'D1234567',
            nationality: 'US',
            address: '123 Main St',
            document_type: 'drivers_license',
            expiry_date: '2028-06-15',
          },
        },
        face_match: { similarity_score: 0.92 },
        completed_at: '2026-04-06T12:00:00Z',
      };
      const result = extractIdentityData(state as any);
      expect(result).toEqual({
        full_name: 'Jane Smith',
        date_of_birth: '1985-03-22',
        document_number: 'D1234567',
        nationality: 'US',
        address: '123 Main St',
        document_type: 'drivers_license',
        expiry_date: '2028-06-15',
        face_match_score: 0.92,
        verified_at: '2026-04-06T12:00:00Z',
      });
    });

    it('returns null for missing OCR data', () => {
      const state = { front_extraction: {} };
      const result = extractIdentityData(state as any);
      expect(result).toBeNull();
    });
  });
});
