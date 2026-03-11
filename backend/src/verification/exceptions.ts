/**
 * Base class for all verification-related errors.
 * All custom exceptions in the verification pipeline extend this.
 */
export class VerificationError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'VE_GENERIC') {
    super(message);
    this.name = 'VerificationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a step method is called out of order.
 * E.g., calling submitBack() before submitFront() has passed Gate 1.
 */
export class SessionFlowError extends VerificationError {
  public readonly currentStep: string;
  public readonly expectedStep: string;

  constructor(currentStep: string, expectedStep: string) {
    super(`Cannot execute step. Current: ${currentStep}, Expected: ${expectedStep}`, 'VE_FLOW');
    this.name = 'SessionFlowError';
    this.currentStep = currentStep;
    this.expectedStep = expectedStep;
  }
}

/**
 * Thrown when a gate check fails — terminates the session immediately.
 * Caught by the session manager to transition to HARD_REJECTED.
 */
export class HardRejectionError extends VerificationError {
  public readonly gate: number;
  public readonly reason: string;
  public readonly detail: string;
  public readonly userMessage: string;

  constructor(gate: number, reason: string, detail: string, userMessage: string) {
    super(detail, 'VE_HARD_REJECT');
    this.name = 'HardRejectionError';
    this.gate = gate;
    this.reason = reason;
    this.detail = detail;
    this.userMessage = userMessage;
  }
}

/**
 * Thrown when image preprocessing fails (corrupt, wrong format, too small).
 */
export class ImagePreprocessingError extends VerificationError {
  constructor(message: string) {
    super(message, 'VE_PREPROCESS');
    this.name = 'ImagePreprocessingError';
  }
}

/**
 * Thrown when OCR, barcode, or MRZ extraction fails.
 */
export class ExtractionError extends VerificationError {
  constructor(message: string) {
    super(message, 'VE_EXTRACTION');
    this.name = 'ExtractionError';
  }
}

/**
 * Thrown when face detection or face matching fails.
 */
export class FaceMatchError extends VerificationError {
  constructor(message: string) {
    super(message, 'VE_FACE_MATCH');
    this.name = 'FaceMatchError';
  }
}
