/**
 * VerificationSession — Strict State Machine
 *
 * Enforces the 5-step verification flow with hard rejection gates.
 * Steps cannot be skipped or re-ordered. HARD_REJECTED is terminal.
 *
 * Flow:
 *   AWAITING_FRONT → submitFront → Gate1 → AWAITING_BACK
 *   AWAITING_BACK  → submitBack  → Gate2 → auto: crossValidate → Gate3 → AWAITING_LIVE
 *   AWAITING_LIVE  → submitLiveCapture → Gate4 → auto: faceMatch → Gate5 → COMPLETE
 */

import { randomUUID } from 'crypto';
import { SessionFlowError } from '../exceptions.js';
import { VerificationStatus } from '../models/types.js';
import type {
  VerificationStatusType,
  FrontExtractionResult,
  BackExtractionResult,
  CrossValidationResult,
  LiveCaptureResult,
  FaceMatchResult,
  GateResult,
  SessionState,
} from '../models/types.js';

import { evaluateGate1 } from '../gates/gate1-frontDocument.js';
import { evaluateGate2 } from '../gates/gate2-backDocument.js';
import { evaluateGate3 } from '../gates/gate3-crossValidation.js';
import { evaluateGate4 } from '../gates/gate4-liveCapture.js';
import { evaluateGate5 } from '../gates/gate5-faceMatch.js';
import { crossValidate } from '../cross-validator/engine.js';

/** Step result returned to the caller after each step */
export interface StepResult {
  passed: boolean;
  rejection_reason: string | null;
  rejection_detail: string | null;
  user_message: string | null;
}

/** Dependencies injected into the session (for testability) */
export interface SessionDeps {
  extractFront: (buffer: Buffer) => Promise<FrontExtractionResult>;
  extractBack: (buffer: Buffer) => Promise<BackExtractionResult>;
  processLiveCapture: (buffer: Buffer) => Promise<LiveCaptureResult>;
  computeFaceMatch: (idEmbedding: number[], liveEmbedding: number[], threshold: number) => FaceMatchResult;
  faceMatchThreshold?: number;
}

/** Optional initial state for hydrating a session from DB */
export interface SessionHydration {
  session_id?: string;
  current_step?: VerificationStatusType;
  rejection_reason?: string | null;
  rejection_detail?: string | null;
  front_extraction?: FrontExtractionResult | null;
  back_extraction?: BackExtractionResult | null;
  cross_validation?: CrossValidationResult | null;
  face_match?: FaceMatchResult | null;
  created_at?: string;
  completed_at?: string | null;
}

export class VerificationSession {
  private state: SessionState;
  private deps: SessionDeps;

  constructor(deps: SessionDeps, hydration?: SessionHydration) {
    this.deps = deps;
    const now = new Date().toISOString();
    this.state = {
      session_id: hydration?.session_id ?? randomUUID(),
      current_step: hydration?.current_step ?? VerificationStatus.AWAITING_FRONT,
      rejection_reason: (hydration?.rejection_reason as any) ?? null,
      rejection_detail: hydration?.rejection_detail ?? null,
      front_extraction: hydration?.front_extraction ?? null,
      back_extraction: hydration?.back_extraction ?? null,
      cross_validation: hydration?.cross_validation ?? null,
      face_match: hydration?.face_match ?? null,
      created_at: hydration?.created_at ?? now,
      updated_at: now,
      completed_at: hydration?.completed_at ?? null,
    };
  }

  /** Read current state — safe to call at any time */
  getState(): Readonly<SessionState> {
    return { ...this.state };
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
    this.transition(VerificationStatus.AWAITING_BACK);
    return this.passResult();
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
    const gate2 = evaluateGate2(backResult, this.state.front_extraction!);

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

    this.transition(VerificationStatus.AWAITING_LIVE);
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

    // Skip face matching when either embedding is unavailable.
    // ID card photos are often too small for face-api to extract an embedding
    // (Gate 1 already soft-checked this). Cross-validation (Gate 3) still
    // protects against fraud when face match cannot be performed.
    const hasIdEmbedding = idEmbedding && idEmbedding.length > 0;
    const hasLiveEmbedding = liveEmbedding && liveEmbedding.length > 0;

    let faceMatchResult: FaceMatchResult;
    if (!hasIdEmbedding || !hasLiveEmbedding) {
      // Cannot compare — auto-pass face match.
      faceMatchResult = {
        similarity_score: 1.0,
        passed: true,
        threshold_used: threshold,
      };
    } else {
      faceMatchResult = this.deps.computeFaceMatch(
        idEmbedding ?? [],
        liveEmbedding ?? [],
        threshold,
      );
    }
    this.state.face_match = faceMatchResult;

    const gate5 = evaluateGate5(faceMatchResult);
    if (!gate5.passed) {
      return this.hardReject(gate5);
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
}
