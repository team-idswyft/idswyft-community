import { describe, it, expect } from 'vitest';
import {
  VerificationError,
  SessionFlowError,
  HardRejectionError,
  ImagePreprocessingError,
  ExtractionError,
  FaceMatchError,
} from '../exceptions.js';

describe('VerificationError', () => {
  it('is an instance of Error', () => {
    const err = new VerificationError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
    expect(err.name).toBe('VerificationError');
  });

  it('has a code property', () => {
    const err = new VerificationError('test', 'VE_GENERIC');
    expect(err.code).toBe('VE_GENERIC');
  });
});

describe('SessionFlowError', () => {
  it('extends VerificationError', () => {
    const err = new SessionFlowError('AWAITING_FRONT', 'AWAITING_BACK');
    expect(err).toBeInstanceOf(VerificationError);
    expect(err).toBeInstanceOf(Error);
  });

  it('includes current and expected step in message', () => {
    const err = new SessionFlowError('AWAITING_FRONT', 'AWAITING_BACK');
    expect(err.message).toContain('AWAITING_FRONT');
    expect(err.message).toContain('AWAITING_BACK');
  });

  it('exposes currentStep and expectedStep properties', () => {
    const err = new SessionFlowError('FRONT_PROCESSING', 'AWAITING_LIVE');
    expect(err.currentStep).toBe('FRONT_PROCESSING');
    expect(err.expectedStep).toBe('AWAITING_LIVE');
  });

  it('has correct error name', () => {
    const err = new SessionFlowError('AWAITING_FRONT', 'AWAITING_BACK');
    expect(err.name).toBe('SessionFlowError');
  });
});

describe('HardRejectionError', () => {
  it('extends VerificationError', () => {
    const err = new HardRejectionError(1, 'FRONT_OCR_FAILED', 'OCR failed', 'Please retake');
    expect(err).toBeInstanceOf(VerificationError);
  });

  it('exposes gate, reason, detail, and userMessage', () => {
    const err = new HardRejectionError(3, 'CROSS_VALIDATION_FAILED', 'Score 0.61', 'Documents do not match');
    expect(err.gate).toBe(3);
    expect(err.reason).toBe('CROSS_VALIDATION_FAILED');
    expect(err.detail).toBe('Score 0.61');
    expect(err.userMessage).toBe('Documents do not match');
  });

  it('uses detail as the error message', () => {
    const err = new HardRejectionError(2, 'BACK_BARCODE_NOT_FOUND', 'No barcode', 'Please retake');
    expect(err.message).toBe('No barcode');
  });

  it('has correct error name', () => {
    const err = new HardRejectionError(1, 'FRONT_OCR_FAILED', 'test', 'test');
    expect(err.name).toBe('HardRejectionError');
  });
});

describe('ImagePreprocessingError', () => {
  it('extends VerificationError', () => {
    const err = new ImagePreprocessingError('Bad image format');
    expect(err).toBeInstanceOf(VerificationError);
    expect(err.name).toBe('ImagePreprocessingError');
  });
});

describe('ExtractionError', () => {
  it('extends VerificationError', () => {
    const err = new ExtractionError('OCR provider failed');
    expect(err).toBeInstanceOf(VerificationError);
    expect(err.name).toBe('ExtractionError');
  });
});

describe('FaceMatchError', () => {
  it('extends VerificationError', () => {
    const err = new FaceMatchError('No face detected in image');
    expect(err).toBeInstanceOf(VerificationError);
    expect(err.name).toBe('FaceMatchError');
  });
});

describe('Error serialization', () => {
  it('HardRejectionError serializes to JSON correctly', () => {
    const err = new HardRejectionError(5, 'FACE_MATCH_FAILED', 'Similarity 0.3', 'Face does not match');
    const json = JSON.parse(JSON.stringify({
      name: err.name,
      message: err.message,
      gate: err.gate,
      reason: err.reason,
      userMessage: err.userMessage,
    }));
    expect(json.name).toBe('HardRejectionError');
    expect(json.gate).toBe(5);
    expect(json.reason).toBe('FACE_MATCH_FAILED');
  });
});
