/**
 * Unit tests for the risk scoring service.
 *
 * Tests verify the composite scoring algorithm with various
 * session states, edge cases, and risk-level thresholds.
 */

import { describe, it, expect } from 'vitest';
import { computeRiskScore, RiskScore } from '../riskScoring.js';
import type { SessionState } from '@idswyft/shared';

/** Build a minimal SessionState with optional overrides. */
function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    current_step: 5, // COMPLETE
    rejection_reason: null,
    rejection_detail: null,
    front_extraction: null,
    back_extraction: null,
    cross_validation: null,
    live_capture: null,
    face_match: null,
    aml_screening: null,
    ...overrides,
  } as SessionState;
}

describe('computeRiskScore', () => {
  it('returns low risk for a perfect verification', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.95,
        face_confidence: 0.92,
        ocr: { expiry_date: '2030-01-01', full_name: 'Test', date_of_birth: '1990-01-01' },
      } as any,
      face_match: { similarity_score: 0.95, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
    });

    const result = computeRiskScore(state);
    expect(result.overall_score).toBeLessThanOrEqual(20);
    expect(result.risk_level).toBe('low');
    expect(result.risk_factors.length).toBeGreaterThan(0);
  });

  it('returns medium risk for borderline face match', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.80,
        face_confidence: 0.75,
        ocr: { expiry_date: '2028-06-01' },
      } as any,
      face_match: { similarity_score: 0.55, passed: true } as any,
      cross_validation: { overall_score: 0.70 } as any,
    });

    const result = computeRiskScore(state);
    expect(result.overall_score).toBeGreaterThan(20);
    expect(result.overall_score).toBeLessThanOrEqual(45);
    expect(result.risk_level).toBe('medium');
  });

  it('returns high risk for failed liveness proxy', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.60,
        face_confidence: 0.30, // low face detection = liveness proxy fail
        ocr: { expiry_date: '2025-04-01' }, // expiring soon
      } as any,
      face_match: { similarity_score: 0.40, passed: false } as any,
      cross_validation: { overall_score: 0.50 } as any,
    });

    const result = computeRiskScore(state);
    expect(result.overall_score).toBeGreaterThan(45);
    expect(['high', 'critical']).toContain(result.risk_level);
  });

  it('returns critical risk when everything fails', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.10,
        face_confidence: 0.05,
        ocr: { expiry_date: '2020-01-01' }, // expired
      } as any,
      face_match: { similarity_score: 0.10, passed: false } as any,
      cross_validation: { overall_score: 0.10 } as any,
    });

    const result = computeRiskScore(state);
    expect(result.overall_score).toBeGreaterThan(70);
    expect(result.risk_level).toBe('critical');
  });

  it('handles missing session data gracefully (defaults to 0)', () => {
    const state = makeState(); // everything null

    const result = computeRiskScore(state);
    // All signals default to 0 → risk score = 100 (max risk)
    expect(result.overall_score).toBeGreaterThanOrEqual(70);
    expect(result.risk_level).toBe('critical');
    expect(result.risk_factors.length).toBe(6);
  });

  it('includes all expected risk factors', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.85,
        face_confidence: 0.80,
        ocr: { expiry_date: '2029-01-01' },
      } as any,
      face_match: { similarity_score: 0.80, passed: true } as any,
      cross_validation: { overall_score: 0.85 } as any,
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).toContain('ocr_confidence');
    expect(signals).toContain('face_match');
    expect(signals).toContain('cross_validation');
    expect(signals).toContain('liveness_proxy');
    expect(signals).toContain('document_expiry');
    expect(signals).toContain('aml_screening');
  });

  it('assigns mild concern when no expiry date available', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.90,
        face_confidence: 0.85,
        ocr: {}, // no expiry_date
      } as any,
      face_match: { similarity_score: 0.90, passed: true } as any,
      cross_validation: { overall_score: 0.85 } as any,
    });

    const result = computeRiskScore(state);
    const expiryFactor = result.risk_factors.find(f => f.signal === 'document_expiry');
    expect(expiryFactor).toBeDefined();
    expect(expiryFactor!.score).toBe(30); // mild concern
    expect(expiryFactor!.detail).toBe('No expiry date detected');
  });

  it('clamps overall score between 0 and 100', () => {
    // Perfect scores should not go below 0
    const state = makeState({
      front_extraction: {
        ocr_confidence: 1.0,
        face_confidence: 1.0,
        ocr: { expiry_date: '2035-01-01' },
      } as any,
      face_match: { similarity_score: 1.0, passed: true } as any,
      cross_validation: { overall_score: 1.0 } as any,
    });

    const result = computeRiskScore(state);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
  });

  it('base weights sum approximately to 0.94 (optional signals add up to ~1.15)', () => {
    // Base 6 signals only (no age_estimation, no velocity_analysis, no geo_analysis)
    const state = makeState({
      front_extraction: { ocr_confidence: 0.5, face_confidence: 0.5, ocr: {} } as any,
      face_match: { similarity_score: 0.5, passed: true } as any,
      cross_validation: { overall_score: 0.5 } as any,
    });

    const result = computeRiskScore(state);
    const totalWeight = result.risk_factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(0.94, 1);
  });

  it('includes age_discrepancy factor when age estimation is present', () => {
    const state = makeState({
      front_extraction: {
        ocr_confidence: 0.90, face_confidence: 0.85,
        ocr: { expiry_date: '2029-01-01' },
      } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      age_estimation: {
        document_face_age: 32,
        live_face_age: 35,
        declared_age: 34,
        age_discrepancy: 1,
      },
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).toContain('age_discrepancy');
    expect(result.risk_factors.length).toBe(7);
    const ageFactor = result.risk_factors.find(f => f.signal === 'age_discrepancy')!;
    expect(ageFactor.score).toBe(0); // discrepancy < 5
    expect(ageFactor.weight).toBe(0.06);
  });

  it('scores age_discrepancy by tier: 30 for 5-9yr, 60 for 10-14yr, 100 for 15+yr', () => {
    const makeAgeState = (discrepancy: number) => makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      age_estimation: {
        document_face_age: 30, live_face_age: 30 + discrepancy,
        declared_age: 30, age_discrepancy: discrepancy,
      },
    });

    expect(computeRiskScore(makeAgeState(3)).risk_factors.find(f => f.signal === 'age_discrepancy')!.score).toBe(0);
    expect(computeRiskScore(makeAgeState(7)).risk_factors.find(f => f.signal === 'age_discrepancy')!.score).toBe(30);
    expect(computeRiskScore(makeAgeState(12)).risk_factors.find(f => f.signal === 'age_discrepancy')!.score).toBe(60);
    expect(computeRiskScore(makeAgeState(20)).risk_factors.find(f => f.signal === 'age_discrepancy')!.score).toBe(100);
  });

  it('omits age_discrepancy factor when age_estimation is null', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      age_estimation: null,
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).not.toContain('age_discrepancy');
    expect(result.risk_factors.length).toBe(6);
  });

  it('includes velocity factor when velocity_analysis has flags', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      velocity_analysis: {
        ip_verifications_1h: 6,
        ip_verifications_24h: 6,
        user_verifications_24h: 0,
        avg_step_duration_ms: 5000,
        fastest_step_ms: 3000,
        flags: ['rapid_ip_reuse'],
        score: 70,
      },
    });

    const result = computeRiskScore(state);
    const velocityFactor = result.risk_factors.find(f => f.signal === 'velocity');
    expect(velocityFactor).toBeDefined();
    expect(velocityFactor!.score).toBe(70);
    expect(velocityFactor!.weight).toBe(0.08);
    expect(velocityFactor!.detail).toContain('rapid_ip_reuse');
  });

  it('omits velocity factor when velocity_analysis has score 0', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      velocity_analysis: {
        ip_verifications_1h: 0,
        ip_verifications_24h: 0,
        user_verifications_24h: 0,
        avg_step_duration_ms: null,
        fastest_step_ms: null,
        flags: [],
        score: 0,
      },
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).not.toContain('velocity');
  });

  it('omits velocity factor when velocity_analysis is null', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      velocity_analysis: null,
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).not.toContain('velocity');
  });

  it('includes both velocity and age_discrepancy when both present', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      age_estimation: {
        document_face_age: 30, live_face_age: 45,
        declared_age: 30, age_discrepancy: 15,
      },
      velocity_analysis: {
        ip_verifications_1h: 6,
        ip_verifications_24h: 11,
        user_verifications_24h: 4,
        avg_step_duration_ms: 500,
        fastest_step_ms: 500,
        flags: ['rapid_ip_reuse', 'burst_activity', 'high_user_frequency', 'bot_like_timing'],
        score: 80,
      },
    });

    const result = computeRiskScore(state);
    expect(result.risk_factors.length).toBe(8); // 6 base + age + velocity
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).toContain('age_discrepancy');
    expect(signals).toContain('velocity');
  });

  it('includes geo_risk factor when geo_analysis has flags', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      geo_analysis: {
        ip_country: 'NG',
        ip_region: '',
        ip_city: 'Lagos',
        document_country: 'US',
        is_tor: false,
        is_datacenter: false,
        flags: ['country_mismatch'],
        score: 70,
      },
    });

    const result = computeRiskScore(state);
    const geoFactor = result.risk_factors.find(f => f.signal === 'geo_risk');
    expect(geoFactor).toBeDefined();
    expect(geoFactor!.score).toBe(70);
    expect(geoFactor!.weight).toBe(0.07);
    expect(geoFactor!.detail).toContain('country_mismatch');
  });

  it('omits geo_risk factor when geo_analysis has score 0', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      geo_analysis: {
        ip_country: 'US',
        ip_region: 'CA',
        ip_city: 'San Francisco',
        document_country: 'US',
        is_tor: false,
        is_datacenter: false,
        flags: [],
        score: 0,
      },
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).not.toContain('geo_risk');
  });

  it('omits geo_risk factor when geo_analysis is null', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      geo_analysis: null,
    });

    const result = computeRiskScore(state);
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).not.toContain('geo_risk');
  });

  it('includes all optional signals when all present (age + velocity + geo)', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.90, face_confidence: 0.85, ocr: {} } as any,
      face_match: { similarity_score: 0.85, passed: true } as any,
      cross_validation: { overall_score: 0.90 } as any,
      age_estimation: {
        document_face_age: 30, live_face_age: 45,
        declared_age: 30, age_discrepancy: 15,
      },
      velocity_analysis: {
        ip_verifications_1h: 6, ip_verifications_24h: 11,
        user_verifications_24h: 4, avg_step_duration_ms: 500,
        fastest_step_ms: 500,
        flags: ['rapid_ip_reuse', 'burst_activity', 'high_user_frequency', 'bot_like_timing'],
        score: 80,
      },
      geo_analysis: {
        ip_country: 'NG', ip_region: '', ip_city: 'Lagos',
        document_country: 'US', is_tor: false, is_datacenter: false,
        flags: ['country_mismatch'], score: 70,
      },
    });

    const result = computeRiskScore(state);
    expect(result.risk_factors.length).toBe(9); // 6 base + age + velocity + geo
    const signals = result.risk_factors.map(f => f.signal);
    expect(signals).toContain('age_discrepancy');
    expect(signals).toContain('velocity');
    expect(signals).toContain('geo_risk');
  });
});
