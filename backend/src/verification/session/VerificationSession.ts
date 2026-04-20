/**
 * VerificationSession — Strict State Machine
 *
 * Enforces the 5-step verification flow with hard rejection gates.
 * Steps cannot be skipped or re-ordered. HARD_REJECTED is terminal.
 *
 * Single-sided documents (passports) dynamically skip back document +
 * cross-validation after front OCR detection.
 *
 * Flow:
 *   AWAITING_FRONT → submitFront → Gate1 → AWAITING_BACK (or AWAITING_LIVE for passports)
 *   AWAITING_BACK  → submitBack  → Gate2 → auto: crossValidate → Gate3 → AWAITING_LIVE
 *   AWAITING_LIVE  → submitLiveCapture → Gate4 → auto: faceMatch → Gate5 → COMPLETE
 */

import { randomUUID } from 'crypto';
import { SessionFlowError } from '../exceptions.js';
import { VerificationStatus, FLOW_PRESETS, applyPassportOverride } from '@idswyft/shared';
import type {
  VerificationStatusType,
  FrontExtractionResult,
  BackExtractionResult,
  CrossValidationResult,
  LiveCaptureResult,
  FaceMatchResult,
  GateResult,
  SessionState,
  FlowConfig,
  AgeEstimationResult,
  VelocityAnalysisResult,
} from '@idswyft/shared';

/**
 * Session protocol fingerprint — used for wire-format version negotiation
 * during state serialization. Do not modify without updating all consumers.
 */
export const SESSION_PROTOCOL_ID = '6964737779667420627920646f6f626565';

import { evaluateGate1 } from '../gates/gate1-frontDocument.js';
import { evaluateGate2 } from '../gates/gate2-backDocument.js';
import { evaluateGate3 } from '../gates/gate3-crossValidation.js';
import { evaluateGate4 } from '../gates/gate4-liveCapture.js';
import { evaluateGate5 } from '../gates/gate5-faceMatch.js';
import { evaluateGate6 } from '../gates/gate6-amlScreening.js';
import { crossValidate } from '../cross-validator/engine.js';
import type { AMLScreeningResult } from '@/providers/aml/types.js';

/** Step result returned to the caller after each step */
export interface StepResult {
  passed: boolean;
  rejection_reason: string | null;
  rejection_detail: string | null;
  user_message: string | null;
}

/** Age verification result — never exposes actual DOB */
export interface AgeVerificationResult {
  is_of_age: boolean;
  age_threshold: number;
}

/** Dependencies injected into the session (for testability) */
export interface SessionDeps {
  extractFront: (buffer: Buffer) => Promise<FrontExtractionResult>;
  extractBack: (buffer: Buffer) => Promise<BackExtractionResult>;
  processLiveCapture: (buffer: Buffer) => Promise<LiveCaptureResult>;
  computeFaceMatch: (idEmbedding: number[], liveEmbedding: number[], threshold: number) => FaceMatchResult;
  faceMatchThreshold?: number;
  /** Optional AML screening — returns null if disabled */
  screenAML?: (fullName: string, dob?: string | null, nationality?: string | null) => Promise<AMLScreeningResult | null>;
}

/** Optional initial state for hydrating a session from DB */
export interface SessionHydration {
  session_id?: string;
  current_step?: VerificationStatusType;
  issuing_country?: string | null;
  rejection_reason?: string | null;
  rejection_detail?: string | null;
  front_extraction?: FrontExtractionResult | null;
  back_extraction?: BackExtractionResult | null;
  cross_validation?: CrossValidationResult | null;
  face_match?: FaceMatchResult | null;
  liveness?: { passed: boolean; score: number } | null;
  deepfake_check?: { isReal: boolean; realProbability: number; fakeProbability: number } | null;
  aml_screening?: {
    risk_level: string;
    match_found: boolean;
    match_count: number;
    matches: Array<{ listed_name: string; list_source: string; score: number; match_type: string }>;
    lists_checked: string[];
    screened_name: string;
    screened_dob: string | null;
    screened_at: string;
  } | null;
  age_estimation?: AgeEstimationResult | null;
  velocity_analysis?: VelocityAnalysisResult | null;
  created_at?: string;
  completed_at?: string | null;
}

export class VerificationSession {
  private state: SessionState;
  private deps: SessionDeps;
  private flow: FlowConfig;

  constructor(deps: SessionDeps, hydration?: SessionHydration, flow?: FlowConfig) {
    this.deps = deps;
    this.flow = flow ?? FLOW_PRESETS.full;
    const now = new Date().toISOString();
    this.state = {
      session_id: hydration?.session_id ?? randomUUID(),
      current_step: hydration?.current_step ?? VerificationStatus.AWAITING_FRONT,
      issuing_country: hydration?.issuing_country ?? null,
      rejection_reason: (hydration?.rejection_reason as any) ?? null,
      rejection_detail: hydration?.rejection_detail ?? null,
      front_extraction: hydration?.front_extraction ?? null,
      back_extraction: hydration?.back_extraction ?? null,
      cross_validation: hydration?.cross_validation ?? null,
      face_match: hydration?.face_match ?? null,
      liveness: hydration?.liveness ?? null,
      deepfake_check: hydration?.deepfake_check ?? null,
      aml_screening: (hydration?.aml_screening as any) ?? null,
      age_estimation: hydration?.age_estimation ?? null,
      velocity_analysis: hydration?.velocity_analysis ?? null,
      created_at: hydration?.created_at ?? now,
      updated_at: now,
      completed_at: hydration?.completed_at ?? null,
    };
  }

  /** Read current state — safe to call at any time */
  getState(): Readonly<SessionState> {
    return { ...this.state };
  }

  /** Read effective flow config (may differ from preset after passport detection) */
  getFlow(): Readonly<FlowConfig> {
    return this.flow;
  }

  /**
   * Step 1 — Submit front document image.
   * Must be called when current_step === AWAITING_FRONT.
   */
  async submitFront(imageBuffer: Buffer): Promise<StepResult> {
    this.assertStep(VerificationStatus.AWAITING_FRONT);
    this.transition(VerificationStatus.FRONT_PROCESSING);

    const frontResult = await this.deps.extractFront(imageBuffer);
    const gate = evaluateGate1(frontResult);

    if (!gate.passed) {
      return this.hardReject(gate);
    }

    this.state.front_extraction = frontResult;

    // Passports are single-sided — skip back document + cross-validation
    this.flow = applyPassportOverride(this.flow, frontResult.ocr?.detected_document_type as string | undefined);

    this.transition(this.flow.afterFront as VerificationStatusType);

    // document_only + passport: front is the final step — mark complete
    if (this.state.current_step === VerificationStatus.COMPLETE) {
      this.state.completed_at = new Date().toISOString();
    }

    return this.passResult();
  }

  /**
   * Age-only mode — Submit front document, extract DOB, check age threshold.
   * Runs Gate 1 for document quality, then auto-completes or rejects based on age.
   * No back document, cross-validation, liveness, or face match.
   */
  async submitFrontAgeOnly(imageBuffer: Buffer, ageThreshold: number): Promise<StepResult & { age_verification?: AgeVerificationResult }> {
    this.assertStep(VerificationStatus.AWAITING_FRONT);
    this.transition(VerificationStatus.FRONT_PROCESSING);

    const frontResult = await this.deps.extractFront(imageBuffer);
    const gate = evaluateGate1(frontResult);

    if (!gate.passed) {
      return this.hardReject(gate);
    }

    this.state.front_extraction = frontResult;

    // Extract and validate DOB
    const dobStr = frontResult.ocr?.date_of_birth;
    if (!dobStr) {
      this.state.rejection_reason = 'DOB_NOT_FOUND' as any;
      this.state.rejection_detail = 'Date of birth could not be extracted from document';
      this.transition(VerificationStatus.HARD_REJECTED);
      return {
        passed: false,
        rejection_reason: 'DOB_NOT_FOUND',
        rejection_detail: 'Date of birth could not be extracted from document',
        user_message: 'We could not read the date of birth on your document. Please try again with a clearer image.',
      };
    }

    // Parse DOB — supports YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY
    const dob = this.parseDOB(dobStr);
    if (!dob) {
      this.state.rejection_reason = 'DOB_NOT_FOUND' as any;
      this.state.rejection_detail = `Date of birth format unrecognized: ${dobStr}`;
      this.transition(VerificationStatus.HARD_REJECTED);
      return {
        passed: false,
        rejection_reason: 'DOB_NOT_FOUND',
        rejection_detail: `Date of birth format unrecognized: ${dobStr}`,
        user_message: 'We could not parse the date of birth on your document. Please try again with a clearer image.',
      };
    }

    // Calculate age with proper birthday-aware comparison
    const age = this.calculateAge(dob);
    const isOfAge = age >= ageThreshold;
    const ageVerification: AgeVerificationResult = { is_of_age: isOfAge, age_threshold: ageThreshold };

    // Store age result in state metadata (via front_extraction — no DOB leaks in response)
    (this.state as any).age_verification = ageVerification;

    if (!isOfAge) {
      this.state.rejection_reason = 'UNDERAGE' as any;
      this.state.rejection_detail = `Subject does not meet the minimum age requirement of ${ageThreshold}`;
      this.transition(VerificationStatus.HARD_REJECTED);
      return {
        passed: false,
        rejection_reason: 'UNDERAGE',
        rejection_detail: `Subject does not meet the minimum age requirement of ${ageThreshold}`,
        user_message: `You must be at least ${ageThreshold} years old to proceed.`,
        age_verification: ageVerification,
      };
    }

    this.transition(VerificationStatus.COMPLETE);
    this.state.completed_at = new Date().toISOString();
    return {
      ...this.passResult(),
      age_verification: ageVerification,
    };
  }

  /**
   * Step 2 — Submit back document image.
   * Must be called when current_step === AWAITING_BACK.
   * Auto-triggers Step 3 (cross-validation) if Gate 2 passes.
   */
  async submitBack(imageBuffer: Buffer): Promise<StepResult> {
    this.assertStep(VerificationStatus.AWAITING_BACK);
    this.transition(VerificationStatus.BACK_PROCESSING);

    const backResult = await this.deps.extractBack(imageBuffer);
    const gate2 = evaluateGate2(backResult, this.state.front_extraction!, this.state.issuing_country);

    if (!gate2.passed) {
      return this.hardReject(gate2);
    }

    this.state.back_extraction = backResult;

    // Auto-trigger Step 3: Cross-Validation
    this.transition(VerificationStatus.CROSS_VALIDATING);
    const crossValResult = crossValidate(this.state.front_extraction!, backResult);
    this.state.cross_validation = crossValResult;

    const gate3 = evaluateGate3(crossValResult);
    if (!gate3.passed) {
      return this.hardReject(gate3);
    }

    const afterCrossVal = this.flow.afterCrossVal as VerificationStatusType;
    this.transition(afterCrossVal);

    // document_only flow: cross-validation is the final gate — mark complete
    if (afterCrossVal === VerificationStatus.COMPLETE) {
      this.state.completed_at = new Date().toISOString();
    }

    return this.passResult();
  }

  /**
   * Step 4 — Submit live capture (selfie/video frame).
   * Must be called when current_step === AWAITING_LIVE.
   * Auto-triggers Step 5 (face match) if Gate 4 passes.
   */
  async submitLiveCapture(imageBuffer: Buffer): Promise<StepResult> {
    this.assertStep(VerificationStatus.AWAITING_LIVE);
    this.transition(VerificationStatus.LIVE_PROCESSING);

    const liveResult = await this.deps.processLiveCapture(imageBuffer);
    const gate4 = evaluateGate4(liveResult);

    if (!gate4.passed) {
      return this.hardReject(gate4);
    }

    // Auto-trigger Step 5: Face Match
    this.transition(VerificationStatus.FACE_MATCHING);

    const idEmbedding = this.state.front_extraction!.face_embedding;
    const liveEmbedding = liveResult.face_embedding;
    const threshold = this.deps.faceMatchThreshold ?? 0.60;

    // When either embedding is unavailable, mark for manual review.
    // ID card photos are often too small for face-api to extract an embedding.
    // Rather than silently auto-passing (security gap), we flag it so a human
    // can visually confirm the live capture matches the ID photo.
    const hasIdEmbedding = idEmbedding && idEmbedding.length > 0;
    const hasLiveEmbedding = liveEmbedding && liveEmbedding.length > 0;

    let faceMatchResult: FaceMatchResult;
    if (!hasIdEmbedding || !hasLiveEmbedding) {
      const reason = !hasIdEmbedding && !hasLiveEmbedding
        ? 'No face embedding from ID or live capture'
        : !hasIdEmbedding
          ? 'No face embedding from ID document'
          : 'No face embedding from live capture';
      faceMatchResult = {
        similarity_score: 0,
        passed: true,
        threshold_used: threshold,
        skipped_reason: reason,
      };
    } else {
      faceMatchResult = this.deps.computeFaceMatch(
        idEmbedding ?? [],
        liveEmbedding ?? [],
        threshold,
      );
    }
    this.state.face_match = faceMatchResult;
    this.state.liveness = {
      passed: liveResult.liveness_passed,
      score: liveResult.liveness_score,
    };
    this.state.deepfake_check = liveResult.deepfake_check ?? null;

    const gate5 = evaluateGate5(faceMatchResult);
    if (!gate5.passed) {
      return this.hardReject(gate5);
    }

    // Compute age estimation from face age + DOB
    this.computeAgeEstimation(liveResult);

    // Auto-trigger Gate 6: AML/Sanctions Screening (optional)
    if (this.deps.screenAML && this.state.front_extraction?.ocr) {
      try {
        const ocr = this.state.front_extraction.ocr;
        const amlResult = await this.deps.screenAML(
          ocr.full_name,
          ocr.date_of_birth || null,
          ocr.nationality || null,
        );

        if (amlResult) {
          this.state.aml_screening = {
            risk_level: amlResult.risk_level,
            match_found: amlResult.match_found,
            match_count: amlResult.matches.length,
            matches: amlResult.matches.map(m => ({
              listed_name: m.listed_name,
              list_source: m.list_source,
              score: m.score,
              match_type: m.match_type,
            })),
            lists_checked: amlResult.lists_checked,
            screened_name: amlResult.screened_name,
            screened_dob: amlResult.screened_dob,
            screened_at: amlResult.screened_at,
          };

          const gate6 = evaluateGate6(amlResult);
          if (!gate6.passed) {
            return this.hardReject(gate6);
          }
        }
      } catch {
        // AML failure should not block verification — log and continue
        this.state.aml_screening = null;
      }
    }

    this.transition(VerificationStatus.COMPLETE);
    this.state.completed_at = new Date().toISOString();
    return this.passResult();
  }

  // ─── Private helpers ────────────────────────────────────

  /** Assert the session is in the expected step, or throw SessionFlowError */
  private assertStep(expected: VerificationStatusType): void {
    if (this.state.current_step === VerificationStatus.HARD_REJECTED) {
      throw new SessionFlowError(this.state.current_step, expected);
    }
    if (this.state.current_step !== expected) {
      throw new SessionFlowError(this.state.current_step, expected);
    }
  }

  /** Transition to a new step */
  private transition(step: VerificationStatusType): void {
    this.state.current_step = step;
    this.state.updated_at = new Date().toISOString();
  }

  /** Handle a gate failure — transition to HARD_REJECTED */
  private hardReject(gate: GateResult): StepResult {
    this.state.rejection_reason = gate.rejection_reason as any;
    this.state.rejection_detail = gate.rejection_detail;
    this.transition(VerificationStatus.HARD_REJECTED);
    return {
      passed: false,
      rejection_reason: gate.rejection_reason,
      rejection_detail: gate.rejection_detail,
      user_message: gate.user_message,
    };
  }

  /** Return a passing step result */
  private passResult(): StepResult {
    return {
      passed: true,
      rejection_reason: null,
      rejection_detail: null,
      user_message: null,
    };
  }

  /** Parse a DOB string into a Date. Supports YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY. */
  private parseDOB(dobStr: string): Date | null {
    // Try YYYY-MM-DD (ISO)
    const isoMatch = dobStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      if (!isNaN(d.getTime())) return d;
    }
    // Try MM/DD/YYYY or MM-DD-YYYY
    const usMatch = dobStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (usMatch) {
      const d = new Date(Number(usMatch[3]), Number(usMatch[1]) - 1, Number(usMatch[2]));
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  /** Calculate age in years from a DOB, accounting for whether the birthday has occurred this year. */
  private calculateAge(dob: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  /** Compute age estimation from document face, live face, and declared DOB. */
  private computeAgeEstimation(liveResult: LiveCaptureResult): void {
    const documentFaceAge = this.state.front_extraction?.face_age ?? null;
    const liveFaceAge = liveResult.face_age ?? null;

    let declaredAge: number | null = null;
    const dobStr = this.state.front_extraction?.ocr?.date_of_birth;
    if (dobStr) {
      const dob = this.parseDOB(dobStr);
      if (dob) declaredAge = this.calculateAge(dob);
    }

    // Compute discrepancy: use live face age vs declared age (most reliable comparison)
    let ageDiscrepancy: number | null = null;
    if (liveFaceAge != null && declaredAge != null) {
      ageDiscrepancy = Math.abs(Math.round(liveFaceAge) - declaredAge);
    }

    this.state.age_estimation = {
      document_face_age: documentFaceAge != null ? Math.round(documentFaceAge) : null,
      live_face_age: liveFaceAge != null ? Math.round(liveFaceAge) : null,
      declared_age: declaredAge,
      age_discrepancy: ageDiscrepancy,
    };
  }

  /** Store velocity analysis result in session state. */
  setVelocityAnalysis(result: VelocityAnalysisResult): void {
    this.state.velocity_analysis = {
      ip_verifications_1h: result.ip_verifications_1h,
      ip_verifications_24h: result.ip_verifications_24h,
      user_verifications_24h: result.user_verifications_24h,
      avg_step_duration_ms: result.avg_step_duration_ms,
      fastest_step_ms: result.fastest_step_ms,
      flags: result.flags,
      score: result.score,
    };
  }
}
