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

  it('weights sum approximately to 1.0', () => {
    const state = makeState({
      front_extraction: { ocr_confidence: 0.5, face_confidence: 0.5, ocr: {} } as any,
      face_match: { similarity_score: 0.5, passed: true } as any,
      cross_validation: { overall_score: 0.5 } as any,
    });

    const result = computeRiskScore(state);
    const totalWeight = result.risk_factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });
});
