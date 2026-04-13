// Logger
export { logger, configureSharedLogger } from './utils/logger.js';
export type { SharedLogger } from './utils/logger.js';

// Encryption
export { encryptSecret, decryptSecret, maskApiKey } from './utils/encryption.js';

// Core types
export type { OCRData, DocumentType } from './types/index.js';

// Face recognition types
export type { FaceBufferDetectionResult } from './types/faceRecognition.js';

// Provider types
export type { OCRProvider, FaceMatchingProvider, LivenessProvider, ProviderConfig } from './providers/types.js';

// Liveness
export { EnhancedHeuristicProvider } from './providers/liveness/EnhancedHeuristicProvider.js';
export { verifyHeadTurnLiveness } from './providers/liveness/HeadTurnVerifier.js';
export type { HeadTurnLivenessResult, FaceDetectionService } from './providers/liveness/HeadTurnVerifier.js';
export { createLivenessProvider } from './providers/liveness/index.js';

// Tampering
export { SharpTamperDetector } from './providers/tampering/SharpTamperDetector.js';
export type { TamperDetectionResult, TamperDetectionDetails } from './providers/tampering/SharpTamperDetector.js';
export { FrequencyAnalyzer } from './providers/tampering/FrequencyAnalyzer.js';
export type { FrequencyAnalysisResult } from './providers/tampering/FrequencyAnalyzer.js';
export { DocumentZoneValidator, DOCUMENT_LAYOUTS } from './providers/tampering/DocumentZoneValidator.js';
export type { BoundingBox as ZoneBoundingBox, ZoneValidationResult } from './providers/tampering/DocumentZoneValidator.js';

// Deepfake
export { OnnxDeepfakeDetector } from './providers/deepfake/OnnxDeepfakeDetector.js';
export type { DeepfakeDetectionResult } from './providers/deepfake/OnnxDeepfakeDetector.js';
export { createDeepfakeDetector } from './providers/deepfake/index.js';

// OCR — Document classification
export { classifyDocument } from './providers/ocr/DocumentClassifier.js';
export type { ClassificationResult } from './providers/ocr/DocumentClassifier.js';

// OCR
export { STATE_DL_FORMATS } from './providers/ocr/dlFormats.js';
export {
  INTERNATIONAL_ID_FORMATS,
  INTERNATIONAL_HEADER_NOISE,
  getCountryFormat,
  validateIdNumber,
} from './providers/ocr/internationalIdFormats.js';
export type { CountryDocFormat, CountryIdFormat } from './providers/ocr/internationalIdFormats.js';
export {
  extractFieldsWithLLM,
  findLowConfidenceFields,
  mergeLLMResults,
} from './providers/ocr/LLMFieldExtractor.js';
export type { LLMProviderConfig, LLMExtractionRequest } from './providers/ocr/LLMFieldExtractor.js';
export { OpenAIProvider } from './providers/ocr/OpenAIProvider.js';

// Verification models
export {
  RejectionReason,
  VerificationStatus,
  FrontExtractionResultSchema,
  BackExtractionResultSchema,
  CrossValidationResultSchema,
  LiveCaptureResultSchema,
  FaceMatchResultSchema,
  GateResultSchema,
  FLOW_PRESETS,
  applyPassportOverride,
} from './verification/models/schemas.js';
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
  AMLScreeningSessionResult,
  FlowConfig,
  VerificationMode,
} from './verification/models/schemas.js';

export { HeadTurnLivenessMetadataSchema, AnalysisFrameSchema } from './verification/models/headTurnLivenessSchema.js';
export type { HeadTurnLivenessMetadata, AnalysisFrame } from './verification/models/headTurnLivenessSchema.js';
