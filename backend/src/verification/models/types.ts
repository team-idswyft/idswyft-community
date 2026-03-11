/**
 * Re-exports all types from Zod schemas for convenient importing.
 * Import types from here; import schemas (for validation) from schemas.ts.
 */
export type {
  FrontExtractionResult,
  BackExtractionResult,
  CrossValidationResult,
  LiveCaptureResult,
  FaceMatchResult,
  GateResult,
  SessionState,
  VerificationStatusType,
  RejectionReasonType,
} from './schemas.js';

export {
  VerificationStatus,
  RejectionReason,
} from './schemas.js';
