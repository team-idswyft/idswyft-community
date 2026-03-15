import type { ActiveLivenessMetadata } from '../../verification/models/activeLivenessSchema.js';

export interface ActiveLivenessResult {
  passed: boolean;
  score: number;
  /** Human-readable reason when checks fail */
  reason?: string;
}

/**
 * Verify active liveness metadata from client-side MediaPipe challenge.
 *
 * Runs 8 temporal-consistency checks on head-pose samples collected during
 * a head-turn challenge. All ML ran client-side; this is pure data validation.
 *
 * Score = passed checks / 8. Pass threshold: >= 0.75 (6/8).
 */
export function verifyActiveLivenessMetadata(
  metadata: ActiveLivenessMetadata,
): ActiveLivenessResult {
  const checks: { name: string; passed: boolean }[] = [];
  const { samples, challenge_direction } = metadata;

  // ── Check 1: Sufficient samples (>= 8 frames) ──
  checks.push({
    name: 'sufficient_samples',
    passed: samples.length >= 8,
  });

  // ── Check 2: Monotonic timestamps ──
  let monotonic = true;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].timestamp <= samples[i - 1].timestamp) {
      monotonic = false;
      break;
    }
  }
  checks.push({ name: 'monotonic_timestamps', passed: monotonic });

  // ── Check 3: Temporal spread >= 800ms ──
  const duration = samples.length >= 2
    ? samples[samples.length - 1].timestamp - samples[0].timestamp
    : 0;
  checks.push({
    name: 'temporal_spread',
    passed: duration >= 800,
  });

  // ── Check 4: Not too long (<= 15000ms) ──
  checks.push({
    name: 'not_too_long',
    passed: duration <= 15000,
  });

  // ── Check 5: Correct direction ──
  // Left turn = negative yaw shift, right turn = positive yaw shift.
  // Compare baseline (mean of first 3 samples) vs peak.
  const baselineYaw = samples.length >= 3
    ? (samples[0].yaw + samples[1].yaw + samples[2].yaw) / 3
    : samples[0]?.yaw ?? 0;

  // Find peak yaw deviation from baseline
  let peakDeviation = 0;
  let peakYaw = baselineYaw;
  for (const s of samples) {
    const dev = s.yaw - baselineYaw;
    if (Math.abs(dev) > Math.abs(peakDeviation)) {
      peakDeviation = dev;
      peakYaw = s.yaw;
    }
  }

  const expectedSign = challenge_direction === 'left' ? -1 : 1;
  const correctDirection = peakDeviation * expectedSign > 0;
  checks.push({ name: 'correct_direction', passed: correctDirection });

  // ── Check 6: Sufficient yaw delta (>= 15 degrees from baseline) ──
  checks.push({
    name: 'sufficient_yaw_delta',
    passed: Math.abs(peakDeviation) >= 15,
  });

  // ── Check 7: Returned to center ──
  // Last 2-3 samples should be within ±10 degrees of baseline
  const tailCount = Math.min(3, samples.length);
  const tailSamples = samples.slice(-tailCount);
  const returnedToCenter = tailSamples.every(
    (s) => Math.abs(s.yaw - baselineYaw) <= 10,
  );
  checks.push({ name: 'returned_to_center', passed: returnedToCenter });

  // ── Check 8: No suspicious patterns ──
  let suspicious = false;
  let suspiciousReason = '';

  // 8a: All yaw values identical (replay of static image)
  const allSameYaw = samples.length > 1 && samples.every(
    (s) => Math.abs(s.yaw - samples[0].yaw) < 0.01,
  );
  if (allSameYaw) {
    suspicious = true;
    suspiciousReason = 'all yaw values identical';
  }

  // 8b: Perfectly even timestamp spacing (synthetic data)
  if (!suspicious && samples.length >= 4) {
    const gaps: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      gaps.push(samples[i].timestamp - samples[i - 1].timestamp);
    }
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // If all gaps are within 1ms of the mean, timestamps are suspiciously regular
    const perfectlyEven = meanGap > 0 && gaps.every(
      (g) => Math.abs(g - meanGap) < 1,
    );
    if (perfectlyEven) {
      suspicious = true;
      suspiciousReason = 'perfectly even timestamp spacing';
    }
  }

  // 8c: Yaw teleportation (> 30 degree jump between consecutive frames)
  if (!suspicious) {
    for (let i = 1; i < samples.length; i++) {
      const jump = Math.abs(samples[i].yaw - samples[i - 1].yaw);
      if (jump > 30) {
        suspicious = true;
        suspiciousReason = `yaw teleportation: ${jump.toFixed(1)} degree jump`;
        break;
      }
    }
  }

  checks.push({ name: 'no_suspicious_patterns', passed: !suspicious });

  // ── Score calculation ──
  const passedCount = checks.filter((c) => c.passed).length;
  const score = passedCount / checks.length;
  const passed = score >= 0.75; // 6/8

  const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);
  const reason = passed
    ? undefined
    : `Failed checks: ${failedChecks.join(', ')}${suspiciousReason ? ` (${suspiciousReason})` : ''}`;

  return { passed, score, reason };
}
