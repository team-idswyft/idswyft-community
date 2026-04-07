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
  evaluateRules,
  validateCondition,
  validateAction,
  mergeActions,
} from '../../services/complianceEngine.js';
import type { ComplianceContext, ComplianceAction } from '../../services/complianceEngine.js';

describe('compliance route logic', () => {
  describe('end-to-end rule evaluation', () => {
    const ctx: ComplianceContext = {
      country: 'US',
      document_type: 'passport',
      verification_mode: 'document_only',
      metadata: { transaction_amount: 25000 },
    };

    it('evaluates a complete ruleset and merges actions', () => {
      const rulesets = [{
        ruleset_id: 'rs1',
        ruleset_name: 'High Value Transactions',
        priority: 1,
        rules: [
          {
            id: 'r1',
            condition: {
              all: [
                { field: 'country', op: 'in' as const, value: ['US', 'GB'] },
                { field: 'metadata.transaction_amount', op: 'gt' as const, value: 10000 },
              ],
            },
            action: { set_mode: 'full', require_address: true } as ComplianceAction,
            description: 'High value US/GB transactions need full verification',
          },
          {
            id: 'r2',
            condition: { field: 'metadata.transaction_amount', op: 'gt' as const, value: 20000 },
            action: { require_aml: true, set_flag: 'enhanced_due_diligence' } as ComplianceAction,
            description: 'Very high value needs AML',
          },
        ],
      }];

      const { matches, merged } = evaluateRules(rulesets, ctx);

      expect(matches).toHaveLength(2);
      expect(merged.set_mode).toBe('full');
      expect(merged.require_address).toBe(true);
      expect(merged.require_aml).toBe(true);
      expect(merged.flags).toContain('enhanced_due_diligence');
    });

    it('returns no matches for non-matching context', () => {
      const rulesets = [{
        ruleset_id: 'rs1',
        ruleset_name: 'EU Only',
        priority: 1,
        rules: [{
          id: 'r1',
          condition: { field: 'country', op: 'in' as const, value: ['DE', 'FR', 'IT'] },
          action: { set_mode: 'full' } as ComplianceAction,
          description: 'EU countries',
        }],
      }];

      const { matches, merged } = evaluateRules(rulesets, ctx);
      expect(matches).toHaveLength(0);
      expect(merged).toEqual({});
    });
  });

  describe('condition validation for route input', () => {
    it('rejects nested invalid condition', () => {
      const result = validateCondition({
        all: [
          { field: 'country', op: 'eq', value: 'US' },
          { field: 'amount', op: 'invalid_op', value: 100 },
        ],
      });
      expect(result).toBeTruthy();
      expect(result).toContain('invalid_op');
    });

    it('accepts deeply nested valid condition', () => {
      const result = validateCondition({
        all: [
          {
            any: [
              { field: 'country', op: 'eq', value: 'US' },
              { not: { field: 'country', op: 'eq', value: 'GB' } },
            ],
          },
        ],
      });
      expect(result).toBeNull();
    });
  });

  describe('action validation for route input', () => {
    it('rejects unknown action keys', () => {
      expect(validateAction({ set_mode: 'full', unknown_key: true })).toBeTruthy();
    });

    it('accepts all valid action keys', () => {
      expect(validateAction({
        set_mode: 'full',
        require_address: true,
        require_liveness: 'head_turn',
        require_aml: true,
        set_flag: 'edd',
        force_manual_review: true,
      })).toBeNull();
    });
  });
});
