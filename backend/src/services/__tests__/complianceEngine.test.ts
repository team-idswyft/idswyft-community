import { describe, it, expect, vi } from 'vitest';

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
    encryptionKey: 'test-encryption-key-32chars!!!!!',
    storage: { provider: 'local' },
    supabase: { storageBucket: 'identity-documents' },
    compliance: { dataRetentionDays: 90 },
  },
  default: {
    nodeEnv: 'test',
    apiKeySecret: 'test-secret-key-for-hmac',
    encryptionKey: 'test-encryption-key-32chars!!!!!',
    storage: { provider: 'local' },
    supabase: { storageBucket: 'identity-documents' },
    compliance: { dataRetentionDays: 90 },
  },
}));

import {
  evaluateCondition,
  mergeActions,
  validateCondition,
  validateAction,
} from '../complianceEngine.js';
import type { ComplianceContext, ComplianceAction } from '../complianceEngine.js';

describe('complianceEngine', () => {
  const ctx: ComplianceContext = {
    country: 'US',
    document_type: 'drivers_license',
    verification_mode: 'full',
    metadata: { transaction_amount: 15000, tier: 'premium' },
  };

  describe('evaluateCondition', () => {
    it('eq operator matches', () => {
      expect(evaluateCondition({ field: 'country', op: 'eq', value: 'US' }, ctx)).toBe(true);
    });

    it('eq operator rejects', () => {
      expect(evaluateCondition({ field: 'country', op: 'eq', value: 'GB' }, ctx)).toBe(false);
    });

    it('neq operator', () => {
      expect(evaluateCondition({ field: 'country', op: 'neq', value: 'GB' }, ctx)).toBe(true);
    });

    it('in operator', () => {
      expect(evaluateCondition({ field: 'country', op: 'in', value: ['US', 'GB', 'DE'] }, ctx)).toBe(true);
    });

    it('not_in operator', () => {
      expect(evaluateCondition({ field: 'country', op: 'not_in', value: ['GB', 'DE'] }, ctx)).toBe(true);
    });

    it('gt operator with metadata', () => {
      expect(evaluateCondition({ field: 'metadata.transaction_amount', op: 'gt', value: 10000 }, ctx)).toBe(true);
    });

    it('lt operator', () => {
      expect(evaluateCondition({ field: 'metadata.transaction_amount', op: 'lt', value: 10000 }, ctx)).toBe(false);
    });

    it('gte operator on boundary', () => {
      expect(evaluateCondition({ field: 'metadata.transaction_amount', op: 'gte', value: 15000 }, ctx)).toBe(true);
    });

    it('lte operator on boundary', () => {
      expect(evaluateCondition({ field: 'metadata.transaction_amount', op: 'lte', value: 15000 }, ctx)).toBe(true);
    });

    it('exists operator (field present)', () => {
      expect(evaluateCondition({ field: 'country', op: 'exists', value: true }, ctx)).toBe(true);
    });

    it('exists operator (field missing)', () => {
      expect(evaluateCondition({ field: 'risk_score', op: 'exists', value: true }, ctx)).toBe(false);
    });

    it('contains operator on string', () => {
      expect(evaluateCondition({ field: 'metadata.tier', op: 'contains', value: 'prem' }, ctx)).toBe(true);
    });

    it('all combinator (AND)', () => {
      const cond = {
        all: [
          { field: 'country', op: 'eq' as const, value: 'US' },
          { field: 'metadata.transaction_amount', op: 'gt' as const, value: 10000 },
        ],
      };
      expect(evaluateCondition(cond, ctx)).toBe(true);
    });

    it('all combinator fails on one false', () => {
      const cond = {
        all: [
          { field: 'country', op: 'eq' as const, value: 'US' },
          { field: 'country', op: 'eq' as const, value: 'GB' },
        ],
      };
      expect(evaluateCondition(cond, ctx)).toBe(false);
    });

    it('any combinator (OR)', () => {
      const cond = {
        any: [
          { field: 'country', op: 'eq' as const, value: 'GB' },
          { field: 'country', op: 'eq' as const, value: 'US' },
        ],
      };
      expect(evaluateCondition(cond, ctx)).toBe(true);
    });

    it('not combinator', () => {
      const cond = {
        not: { field: 'country', op: 'eq' as const, value: 'GB' },
      };
      expect(evaluateCondition(cond, ctx)).toBe(true);
    });

    it('nested combinators', () => {
      const cond = {
        all: [
          { field: 'country', op: 'in' as const, value: ['US', 'GB'] },
          {
            any: [
              { field: 'metadata.transaction_amount', op: 'gt' as const, value: 50000 },
              { field: 'document_type', op: 'eq' as const, value: 'drivers_license' },
            ],
          },
        ],
      };
      expect(evaluateCondition(cond, ctx)).toBe(true);
    });

    it('returns false for unknown field', () => {
      expect(evaluateCondition({ field: 'nonexistent', op: 'eq', value: 'x' }, ctx)).toBe(false);
    });
  });

  describe('mergeActions', () => {
    it('merges two actions — more restrictive wins', () => {
      const a: ComplianceAction = { set_mode: 'document_only' };
      const b: ComplianceAction = { set_mode: 'full', require_address: true };
      const merged = mergeActions([a, b]);
      expect(merged.set_mode).toBe('full');
      expect(merged.require_address).toBe(true);
    });

    it('true overrides false for boolean flags', () => {
      const a: ComplianceAction = { require_aml: false };
      const b: ComplianceAction = { require_aml: true };
      expect(mergeActions([a, b]).require_aml).toBe(true);
    });

    it('force_manual_review is sticky', () => {
      const a: ComplianceAction = { force_manual_review: true };
      const b: ComplianceAction = { force_manual_review: false };
      expect(mergeActions([a, b]).force_manual_review).toBe(true);
    });

    it('collects multiple set_flag values', () => {
      const a: ComplianceAction = { set_flag: 'edd' };
      const b: ComplianceAction = { set_flag: 'high_risk' };
      const merged = mergeActions([a, b]);
      expect(merged.flags).toContain('edd');
      expect(merged.flags).toContain('high_risk');
    });

    it('returns empty action for empty array', () => {
      const merged = mergeActions([]);
      expect(merged).toEqual({});
    });
  });

  describe('validateCondition', () => {
    it('accepts valid leaf condition', () => {
      expect(validateCondition({ field: 'country', op: 'eq', value: 'US' })).toBeNull();
    });

    it('rejects missing field', () => {
      expect(validateCondition({ op: 'eq', value: 'US' } as any)).toBeTruthy();
    });

    it('rejects invalid operator', () => {
      expect(validateCondition({ field: 'country', op: 'like', value: 'US' } as any)).toBeTruthy();
    });

    it('accepts valid all combinator', () => {
      expect(validateCondition({
        all: [{ field: 'country', op: 'eq', value: 'US' }],
      })).toBeNull();
    });

    it('rejects empty all array', () => {
      expect(validateCondition({ all: [] })).toBeTruthy();
    });
  });

  describe('validateAction', () => {
    it('accepts valid action', () => {
      expect(validateAction({ set_mode: 'full', require_address: true })).toBeNull();
    });

    it('rejects invalid mode', () => {
      expect(validateAction({ set_mode: 'super_mode' })).toBeTruthy();
    });

    it('rejects empty action', () => {
      expect(validateAction({})).toBeTruthy();
    });
  });
});
