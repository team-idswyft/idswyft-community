import { describe, it, expect, vi } from 'vitest';
import { evaluateGate6 } from '../gates/gate6-amlScreening.js';
import type { AMLScreeningResult } from '@/providers/aml/types.js';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeAMLResult(overrides: Partial<AMLScreeningResult> = {}): AMLScreeningResult {
  return {
    risk_level: 'clear',
    match_found: false,
    matches: [],
    lists_checked: ['us_ofac_sdn', 'eu_sanctions'],
    screened_name: 'John Doe',
    screened_dob: '1990-01-01',
    screened_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Gate 6 — AML/Sanctions Screening', () => {
  it('PASSES when result is null (AML disabled)', () => {
    const result = evaluateGate6(null);
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES when risk_level is clear', () => {
    const result = evaluateGate6(makeAMLResult({ risk_level: 'clear' }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with AML_MATCH_FOUND on confirmed_match', () => {
    const result = evaluateGate6(makeAMLResult({
      risk_level: 'confirmed_match',
      match_found: true,
      matches: [{
        listed_name: 'JOHN DOE',
        list_source: 'us_ofac_sdn',
        score: 0.95,
        match_type: 'name_dob',
      }],
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('AML_MATCH_FOUND');
    expect(result.rejection_detail).toContain('JOHN DOE');
    expect(result.rejection_detail).toContain('us_ofac_sdn');
  });

  it('FAILS with AML_POTENTIAL_MATCH on potential_match', () => {
    const result = evaluateGate6(makeAMLResult({
      risk_level: 'potential_match',
      match_found: true,
      matches: [{
        listed_name: 'Jon Doe',
        list_source: 'eu_sanctions',
        score: 0.65,
        match_type: 'name',
      }],
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('AML_POTENTIAL_MATCH');
    expect(result.rejection_detail).toContain('Manual review');
  });

  it('provides user-friendly message on confirmed match', () => {
    const result = evaluateGate6(makeAMLResult({
      risk_level: 'confirmed_match',
      match_found: true,
      matches: [{
        listed_name: 'Test Person',
        list_source: 'us_ofac_sdn',
        score: 0.92,
        match_type: 'name',
      }],
    }));
    expect(result.user_message).toBeTruthy();
    // Should NOT reveal sanctions details to end user
    expect(result.user_message).not.toContain('sanctions');
    expect(result.user_message).not.toContain('OFAC');
  });

  it('provides review message on potential match', () => {
    const result = evaluateGate6(makeAMLResult({
      risk_level: 'potential_match',
      match_found: true,
      matches: [{ listed_name: 'J. Doe', list_source: 'un', score: 0.6, match_type: 'name' }],
    }));
    expect(result.user_message).toContain('additional review');
  });
});
