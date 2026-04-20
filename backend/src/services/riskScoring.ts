/**
 * Risk Scoring Service
 *
 * Computes a composite 0-100 risk score from verification signals.
 * Higher score = higher risk.
 */

import type { SessionState } from '@idswyft/shared';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  signal: string;
  score: number;
  weight: number;
  detail: string;
}

export interface RiskScore {
  overall_score: number;
  risk_level: RiskLevel;
  risk_factors: RiskFactor[];
}

/**
 * Compute a composite risk score from session state.
 * Score 0-100 where higher = more risk.
 */
export function computeRiskScore(state: SessionState): RiskScore {
  const factors: RiskFactor[] = [];

  // ── OCR Confidence (weight: 0.17) ────────────────────────
  const ocrConf = state.front_extraction?.ocr_confidence ?? 0;
  const ocrRisk = Math.round((1 - ocrConf) * 100);
  factors.push({
    signal: 'ocr_confidence',
    score: ocrRisk,
    weight: 0.17,
    detail: `OCR confidence: ${(ocrConf * 100).toFixed(0)}%`,
  });

  // ── Face Match Score (weight: 0.21) ──────────────────────
  const faceScore = state.face_match?.similarity_score ?? 0;
  const faceRisk = Math.round((1 - faceScore) * 100);
  factors.push({
    signal: 'face_match',
    score: faceRisk,
    weight: 0.21,
    detail: `Face match similarity: ${(faceScore * 100).toFixed(0)}%`,
  });

  // ── Cross-Validation Score (weight: 0.17) ────────────────
  const crossScore = state.cross_validation?.overall_score ?? 0;
  const crossRisk = Math.round((1 - crossScore) * 100);
  factors.push({
    signal: 'cross_validation',
    score: crossRisk,
    weight: 0.17,
    detail: `Cross-validation score: ${(crossScore * 100).toFixed(0)}%`,
  });

  // ── Liveness Score (weight: 0.16) ────────────────────────
  // The actual liveness score (from EnhancedHeuristicProvider) is computed in
  // extractLiveCapture() but only returned in LiveCaptureResult — it's not
  // persisted on SessionState. Using front_extraction.face_confidence as a
  // proxy until SessionState is extended to store liveness_score directly.
  const faceConf = state.front_extraction?.face_confidence ?? 0;
  const livenessRisk = Math.round((1 - faceConf) * 100);
  factors.push({
    signal: 'liveness_proxy',
    score: livenessRisk,
    weight: 0.16,
    detail: `Face detection confidence: ${(faceConf * 100).toFixed(0)}%`,
  });

  // ── Document Expiry (weight: 0.14) ──────────────────────
  const expiryDate = state.front_extraction?.ocr?.expiry_date;
  let expiryRisk = 0;
  if (expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry < 0) {
      expiryRisk = 100; // Expired
    } else if (daysUntilExpiry < 30) {
      expiryRisk = 70; // Expiring very soon
    } else if (daysUntilExpiry < 90) {
      expiryRisk = 40; // Expiring soon
    } else {
      expiryRisk = 0; // Plenty of time
    }
  } else {
    expiryRisk = 30; // No expiry data — mild concern
  }
  factors.push({
    signal: 'document_expiry',
    score: expiryRisk,
    weight: 0.14,
    detail: expiryDate ? `Expires: ${expiryDate}` : 'No expiry date detected',
  });

  // ── AML Screening (weight: 0.09) ────────────────────────
  const aml = state.aml_screening;
  let amlRisk = 0;
  let amlDetail = 'AML screening not performed';
  if (aml) {
    if (aml.risk_level === 'confirmed_match') {
      amlRisk = 100;
      amlDetail = `AML: confirmed match (${aml.match_count} match${aml.match_count !== 1 ? 'es' : ''})`;
    } else if (aml.risk_level === 'potential_match') {
      amlRisk = 60;
      amlDetail = `AML: potential match (${aml.match_count} match${aml.match_count !== 1 ? 'es' : ''})`;
    } else {
      amlRisk = 0;
      amlDetail = 'AML: clear';
    }
  }
  factors.push({
    signal: 'aml_screening',
    score: amlRisk,
    weight: 0.09,
    detail: amlDetail,
  });

  // ── Age Discrepancy (weight: 0.06, optional) ────────────
  const ageEst = state.age_estimation;
  if (ageEst && ageEst.age_discrepancy != null) {
    const disc = ageEst.age_discrepancy;
    let ageRisk: number;
    if (disc < 5) ageRisk = 0;
    else if (disc < 10) ageRisk = 30;
    else if (disc < 15) ageRisk = 60;
    else ageRisk = 100;
    factors.push({
      signal: 'age_discrepancy',
      score: ageRisk,
      weight: 0.06,
      detail: `Age discrepancy: ${disc} years (estimated ${ageEst.live_face_age ?? '?'}, declared ${ageEst.declared_age ?? '?'})`,
    });
  }

  // ── Velocity (weight: 0.08, optional) ───────────────────
  const velocity = state.velocity_analysis;
  if (velocity && velocity.score > 0) {
    factors.push({
      signal: 'velocity',
      score: velocity.score,
      weight: 0.08,
      detail: `Velocity flags: ${velocity.flags.join(', ') || 'none'}`,
    });
  }

  // ── Geo Risk (weight: 0.07, optional) ──────────────────
  const geo = state.geo_analysis;
  if (geo && geo.score > 0) {
    factors.push({
      signal: 'geo_risk',
      score: geo.score,
      weight: 0.07,
      detail: `Geo flags: ${geo.flags.join(', ') || 'none'}`,
    });
  }

  // ── Weighted average ─────────────────────────────────────
  let weightedSum = 0;
  let totalWeight = 0;
  for (const f of factors) {
    weightedSum += f.score * f.weight;
    totalWeight += f.weight;
  }
  const overall = Math.round(weightedSum / totalWeight);

  // ── Determine risk level ─────────────────────────────────
  let risk_level: RiskLevel;
  if (overall <= 20) risk_level = 'low';
  else if (overall <= 45) risk_level = 'medium';
  else if (overall <= 70) risk_level = 'high';
  else risk_level = 'critical';

  return {
    overall_score: Math.max(0, Math.min(100, overall)),
    risk_level,
    risk_factors: factors,
  };
}
