import express, { Request, Response } from 'express';
import multer from 'multer';
import { body, param } from 'express-validator';
import { authenticateAPIKey, authenticateUser, checkSandboxMode } from '@/middleware/auth.js';
import { verificationRateLimit } from '@/middleware/rateLimit.js';
import { catchAsync, ValidationError, FileUploadError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { StorageService } from '@/services/storage.js';
import { VerificationService } from '@/services/verification.js';
import { OCRService } from '@/services/ocr.js';
import { BarcodeService } from '@/services/barcode.js';
import { extractMRZFromText, alpha3ToAlpha2 } from '@/services/mrz.js';
import { FaceRecognitionService } from '@/services/faceRecognition.js';
import { logger, logVerificationEvent } from '@/utils/logger.js';
import { validateFileType } from '@/middleware/fileValidation.js';
import { supabase } from '@/config/database.js';
import { VERIFICATION_THRESHOLDS, getFaceMatchingThresholdSync, getLivenessThresholdSync } from '@/config/verificationThresholds.js';
import {
  createLivenessProvider,
  verifyHeadTurnLiveness,
  HeadTurnLivenessMetadataSchema,
  VerificationStatus,
  SharpTamperDetector,
  DocumentZoneValidator,
  createDeepfakeDetector,
  decryptSecret,
  FLOW_PRESETS,
} from '@idswyft/shared';
import type {
  HeadTurnLivenessMetadata,
  FrontExtractionResult,
  BackExtractionResult,
  LiveCaptureResult,
  SessionState,
  LLMProviderConfig,
  FlowConfig,
  VerificationMode,
} from '@idswyft/shared';
import { createAMLProviders } from '@/providers/aml/index.js';
import { screenAll } from '@/providers/aml/multiScreen.js';
import { computeRiskScore } from '@/services/riskScoring.js';
import { broadcastStatusChange } from '@/services/realtime.js';
import { saveSessionState, loadSessionState } from '@/services/sessionPersistence.js';

import { VerificationSession } from '@/verification/session/VerificationSession.js';
import type { SessionDeps, SessionHydration, AgeVerificationResult } from '@/verification/session/VerificationSession.js';
import { computeFaceMatch } from '@/verification/face/faceMatchService.js';
import { SessionFlowError } from '@/verification/exceptions.js';
import { WebhookService } from '@/services/webhook.js';
import type { WebhookPayload, VerificationSource } from '@/types/index.js';
import { config } from '@/config/index.js';
import { createAndSendPhoneOtp, verifyPhoneOtp } from '@/services/phoneOtpService.js';
import { decryptSMSConfig } from '@/services/smsService.js';
import sharp from 'sharp';
import engineClient from '@/services/engineClient.js';

const router = express.Router();

// Defensive fallbacks for verification modes that may not be in an older shared package build.
// These are only used if FLOW_PRESETS[mode] returns undefined (e.g., stale Docker cache).
const INLINE_FLOW_FALLBACKS: Partial<Record<string, FlowConfig>> = {
  document_only: { preset: 'document_only' as VerificationMode, requiresBack: true, requiresLiveness: false, requiresFaceMatch: false, totalSteps: 3, afterFront: 'AWAITING_BACK' as any, afterCrossVal: 'COMPLETE' as any },
  identity:      { preset: 'identity' as VerificationMode,      requiresBack: false, requiresLiveness: true,  requiresFaceMatch: true,  totalSteps: 3, afterFront: 'AWAITING_LIVE' as any,  afterCrossVal: 'AWAITING_LIVE' as any },
};

const storageService = new StorageService();
const verificationService = new VerificationService();
const ocrService = new OCRService();
const barcodeService = new BarcodeService();
const faceRecognitionService = new FaceRecognitionService();
const webhookService = new WebhookService();
const amlProviders = createAMLProviders();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:  10 * 1024 * 1024, // 10 MB for image files
    fieldSize: 10 * 1024 * 1024, // 10 MB for text fields (liveness_metadata contains base64 frames)
  },
});

/** Addons that can be requested per-verification */
interface VerificationAddons {
  aml_screening?: boolean;
  address_verification?: boolean;
}

/** Create a VerificationSession with real service deps, optionally hydrated from DB */
function createSession(isSandbox: boolean, hydration?: SessionHydration, addons?: VerificationAddons, developerAmlEnabled?: boolean, flow?: FlowConfig): VerificationSession {
  // AML auto-triggers when: providers configured, not sandbox, developer hasn't disabled, addon not explicitly false
  const amlEnabled = amlProviders.length > 0
    && !isSandbox
    && developerAmlEnabled !== false
    && addons?.aml_screening !== false;

  const deps: SessionDeps = {
    extractFront: async (buffer: Buffer): Promise<FrontExtractionResult> => {
      // Save buffer to temp storage, run OCR, extract face
      // This is a simplified adapter — the route handler does storage before calling
      throw new Error('extractFront should not be called directly — route handles buffer');
    },
    extractBack: async (buffer: Buffer): Promise<BackExtractionResult> => {
      throw new Error('extractBack should not be called directly — route handles buffer');
    },
    processLiveCapture: async (buffer: Buffer): Promise<LiveCaptureResult> => {
      throw new Error('processLiveCapture should not be called directly — route handles buffer');
    },
    computeFaceMatch,
    faceMatchThreshold: getFaceMatchingThresholdSync(isSandbox),
    screenAML: amlEnabled
      ? async (fullName, dob, nationality) => screenAll(amlProviders, { full_name: fullName, date_of_birth: dob, nationality })
      : undefined,
  };

  return new VerificationSession(deps, hydration, flow);
}

/** Hydrate a session from DB for a given verification ID */
async function hydrateSession(verificationId: string, isSandbox: boolean, developerId?: string): Promise<VerificationSession> {
  const savedState = await loadSessionState(verificationId);
  const hydration: SessionHydration = savedState ? {
    session_id: savedState.session_id,
    current_step: savedState.current_step,
    issuing_country: savedState.issuing_country,
    rejection_reason: savedState.rejection_reason,
    rejection_detail: savedState.rejection_detail,
    front_extraction: savedState.front_extraction,
    back_extraction: savedState.back_extraction,
    cross_validation: savedState.cross_validation,
    face_match: savedState.face_match,
    liveness: (savedState as any).liveness ?? null,
    deepfake_check: (savedState as any).deepfake_check ?? null,
    aml_screening: (savedState as any).aml_screening ?? null,
    created_at: savedState.created_at,
    completed_at: savedState.completed_at,
  } : {
    session_id: verificationId,
  };

  // Read addons + developer_id + verification_mode from the verification_requests row
  let addons: VerificationAddons | undefined;
  let resolvedDeveloperId = developerId;
  const { data: row, error: rowError } = await supabase
    .from('verification_requests')
    .select('addons, developer_id, verification_mode')
    .eq('id', verificationId)
    .single();
  if (rowError) {
    logger.error('hydrateSession: failed to read verification_requests', {
      verificationId, error: rowError.message, code: (rowError as any).code,
    });
  }
  if (row?.addons && typeof row.addons === 'object') {
    addons = row.addons as VerificationAddons;
  }
  if (!resolvedDeveloperId && row?.developer_id) {
    resolvedDeveloperId = row.developer_id;
  }

  // Look up developer's aml_enabled setting
  let developerAmlEnabled: boolean | undefined;
  if (resolvedDeveloperId) {
    const { data: dev } = await supabase
      .from('developers')
      .select('aml_enabled')
      .eq('id', resolvedDeveloperId)
      .single();
    if (dev && typeof dev.aml_enabled === 'boolean') {
      developerAmlEnabled = dev.aml_enabled;
    }
  }

  // Resolve flow config from verification_mode
  const mode = (row?.verification_mode as VerificationMode) || 'full';
  const fromShared = FLOW_PRESETS[mode];
  const fromInline = INLINE_FLOW_FALLBACKS[mode];
  const flow = fromShared ?? fromInline ?? FLOW_PRESETS.full;

  logger.info('hydrateSession flow resolution', {
    verificationId,
    rowKeys: row ? Object.keys(row).join(',') : 'NO_ROW',
    dbVerificationMode: row?.verification_mode ?? 'NULL',
    rowError: rowError ? rowError.message : 'none',
    mode,
    flowSource: fromShared ? 'FLOW_PRESETS' : fromInline ? 'INLINE_FALLBACK' : 'FULL_DEFAULT',
    preset: flow.preset,
    afterFront: flow.afterFront,
  });

  return createSession(isSandbox, hydration, addons, developerAmlEnabled, flow);
}

// ─── Developer LLM config lookup ────────────────────────────────

/** Look up developer's LLM provider config. Returns undefined if not configured. */
async function getDeveloperLLMConfig(developerId: string): Promise<LLMProviderConfig | undefined> {
  try {
    const { data } = await supabase
      .from('developers')
      .select('llm_provider, llm_api_key_encrypted, llm_endpoint_url')
      .eq('id', developerId)
      .single();

    if (!data?.llm_provider || !data?.llm_api_key_encrypted) return undefined;

    const apiKey = decryptSecret(data.llm_api_key_encrypted, config.encryptionKey);
    return {
      provider: data.llm_provider as LLMProviderConfig['provider'],
      apiKey,
      endpointUrl: data.llm_endpoint_url || undefined,
    };
  } catch (err) {
    logger.debug('getDeveloperLLMConfig: failed to load LLM config', {
      developerId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return undefined;
  }
}

// ─── Step adapters: Run extraction and then delegate to session ──

/** Run front OCR extraction and build FrontExtractionResult */
async function extractFrontDocument(
  documentPath: string,
  documentId: string,
  documentType: string,
  issuingCountry?: string,
  verificationId?: string,
  llmConfig?: LLMProviderConfig,
  imageBuffer?: Buffer,
): Promise<FrontExtractionResult> {
  const ocrData = await ocrService.processDocument(documentId, documentPath, documentType, issuingCountry, verificationId, llmConfig);

  // Calculate average confidence from per-field confidence scores
  const confidenceScores = ocrData?.confidence_scores || {};
  const values = Object.values(confidenceScores).filter((v): v is number => typeof v === 'number');
  const avgConfidence = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;

  // Detect face — use buffer-based detection to get bounding box for zone validation
  let faceConfidence = 0;
  let faceEmbedding: number[] | null = null;
  let faceBoundingBox: { x: number; y: number; width: number; height: number } | null = null;
  try {
    if (imageBuffer) {
      const faceResult = await faceRecognitionService.detectFaceFromBuffer(imageBuffer);
      if (faceResult) {
        faceConfidence = faceResult.confidence;
        faceEmbedding = Array.from(faceResult.embedding);
        faceBoundingBox = faceResult.boundingBox;
      }
    } else {
      const faceResult = await faceRecognitionService.detectFace(documentPath);
      faceConfidence = faceResult.confidence;
      faceEmbedding = faceResult.embedding;
    }
  } catch {
    faceConfidence = 0;
  }

  // Attempt MRZ detection on front document (passports, some ID cards)
  let mrzFromFront: string[] | null = null;
  let detectedCountry = issuingCountry || null;
  if (ocrData?.raw_text) {
    const mrzResult = extractMRZFromText(ocrData.raw_text);
    if (mrzResult) {
      mrzFromFront = mrzResult.raw_lines;
      // Use MRZ fields as high-confidence overrides if OCR missed them
      if (!ocrData.name && mrzResult.fields.full_name) ocrData.name = mrzResult.fields.full_name;
      if (!ocrData.document_number && mrzResult.fields.document_number) ocrData.document_number = mrzResult.fields.document_number;
      if (!ocrData.date_of_birth && mrzResult.fields.date_of_birth) ocrData.date_of_birth = mrzResult.fields.date_of_birth;
      if (!ocrData.expiration_date && mrzResult.fields.expiry_date) ocrData.expiration_date = mrzResult.fields.expiry_date;
      // Auto-detect issuing_country from MRZ if not provided
      if (!detectedCountry && mrzResult.fields.issuing_country) {
        detectedCountry = alpha3ToAlpha2(mrzResult.fields.issuing_country) || null;
      }
      if (detectedCountry) ocrData.issuing_country = detectedCountry;
    }
  }

  // ── Tamper detection + zone validation (soft flags — Phase 1) ──────
  let authenticity: FrontExtractionResult['authenticity'] = undefined;
  if (imageBuffer) {
    try {
      const tamperResult = await new SharpTamperDetector().analyze(imageBuffer);
      authenticity = {
        score: tamperResult.score,
        flags: tamperResult.flags,
        isAuthentic: tamperResult.isAuthentic,
        ganScore: tamperResult.details?.frequency?.ganScore,
      };

      // Zone validation if face bounding box is available
      if (faceBoundingBox) {
        const meta = await sharp(imageBuffer).metadata();
        if (meta.width && meta.height) {
          const zoneResult = new DocumentZoneValidator().validate(
            faceBoundingBox,
            meta.width,
            meta.height,
            documentType,
            detectedCountry || 'US',
          );
          authenticity.zoneScore = zoneResult.score;
          if (zoneResult.violations.length > 0) {
            authenticity.flags = [...authenticity.flags, ...zoneResult.violations.map(v => v.split(':')[0])];
          }
        }
      }
    } catch (err) {
      logger.warn('Tamper/zone detection failed (non-blocking)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return {
    ocr: {
      full_name: ocrData?.name || '',
      date_of_birth: ocrData?.date_of_birth || '',
      id_number: ocrData?.document_number || '',
      expiry_date: ocrData?.expiration_date || '',
      nationality: ocrData?.nationality || '',
      issuing_country: detectedCountry || undefined,
      ...ocrData, // preserve all raw fields
    },
    face_embedding: faceEmbedding,
    face_confidence: faceConfidence,
    ocr_confidence: avgConfidence,
    mrz_from_front: mrzFromFront,
    authenticity,
  };
}

/** Run back barcode extraction and build BackExtractionResult */
async function extractBackDocument(
  documentPath: string,
): Promise<BackExtractionResult> {
  let barcodeData;
  try {
    barcodeData = await barcodeService.scanBackOfId(documentPath);
  } catch {
    barcodeData = null;
  }

  const qrPayload = barcodeData?.pdf417_data?.parsed_data ? {
    first_name: barcodeData.pdf417_data.parsed_data.firstName || '',
    last_name: barcodeData.pdf417_data.parsed_data.lastName || '',
    full_name: [barcodeData.pdf417_data.parsed_data.firstName, barcodeData.pdf417_data.parsed_data.lastName].filter(Boolean).join(' '),
    date_of_birth: barcodeData.pdf417_data.parsed_data.dateOfBirth || '',
    id_number: barcodeData.pdf417_data.parsed_data.licenseNumber || barcodeData.parsed_data?.id_number || '',
    expiry_date: barcodeData.pdf417_data.parsed_data.expirationDate || '',
    nationality: '',
    address: [
      barcodeData.pdf417_data.parsed_data.address,
      barcodeData.pdf417_data.parsed_data.city,
      barcodeData.pdf417_data.parsed_data.state,
      barcodeData.pdf417_data.parsed_data.zipCode,
    ].filter(Boolean).join(', ') || '',
  } : (barcodeData?.parsed_data ? {
    first_name: barcodeData.parsed_data.first_name || '',
    last_name: barcodeData.parsed_data.last_name || '',
    full_name: [barcodeData.parsed_data.first_name, barcodeData.parsed_data.last_name].filter(Boolean).join(' '),
    date_of_birth: barcodeData.parsed_data.date_of_birth || '',
    id_number: barcodeData.parsed_data.id_number || '',
    expiry_date: barcodeData.parsed_data.expiry_date || '',
    nationality: '',
    address: (barcodeData.parsed_data as any).address || '',
  } : null);

  // Attempt MRZ detection from raw OCR text (especially for non-US documents)
  const rawText = barcodeData?.raw_text || '';
  const mrzResult = extractMRZFromText(rawText);

  // If barcode scan failed but MRZ was detected, build qr_payload from MRZ fields
  let finalQrPayload = qrPayload;
  let barcodeFormat: 'PDF417' | 'QR_CODE' | 'DATA_MATRIX' | 'CODE_128' | 'MRZ_TD1' | 'MRZ_TD2' | 'MRZ_TD3' | null = barcodeData?.pdf417_data ? 'PDF417' : (barcodeData?.barcode_data ? 'QR_CODE' : null);

  if (!qrPayload && mrzResult && mrzResult.fields) {
    // Populate cross-validation fields from MRZ data
    finalQrPayload = {
      first_name: mrzResult.fields.first_name || '',
      last_name: mrzResult.fields.last_name || '',
      full_name: mrzResult.fields.full_name || '',
      date_of_birth: mrzResult.fields.date_of_birth || '',
      id_number: mrzResult.fields.document_number || '',
      expiry_date: mrzResult.fields.expiry_date || '',
      nationality: mrzResult.fields.nationality || '',
      address: '',
    };
    // Tag the barcode_format as MRZ
    const mrzFormatMap: Record<string, 'MRZ_TD1' | 'MRZ_TD2' | 'MRZ_TD3'> = {
      TD1: 'MRZ_TD1', TD2: 'MRZ_TD2', TD3: 'MRZ_TD3',
    };
    barcodeFormat = mrzFormatMap[mrzResult.format] || null;
  }

  // Build MRZ result for Gate 2
  const hasMrz = mrzResult !== null;
  const mrzForGate = hasMrz ? {
    raw_lines: mrzResult!.raw_lines,
    fields: mrzResult!.fields as any,
    checksums_valid: mrzResult!.check_digits_valid,
  } : (rawText && /[A-Z<]{30,}/.test(rawText) ? {
    raw_lines: rawText.split('\n').filter((l: string) => /^[A-Z0-9<]{30,}$/.test(l.trim())),
    checksums_valid: true,
  } : null);

  return {
    qr_payload: finalQrPayload,
    mrz_result: mrzForGate,
    barcode_format: barcodeFormat,
    raw_barcode_data: barcodeData?.pdf417_data?.raw_data || barcodeData?.barcode_data || null,
  };
}

/** Liveness provider — instantiated once, reused across requests */
const livenessProvider = createLivenessProvider();

/** Run live capture processing and build LiveCaptureResult */
async function extractLiveCapture(
  selfiePath: string,
  frontDocPath: string | null,
  selfieBuffer: Buffer,
  isSandbox: boolean = false,
  headTurnMetadata?: HeadTurnLivenessMetadata,
): Promise<LiveCaptureResult> {
  // Detect face from buffer — returns bounding box (reused for deepfake crop below)
  let faceConfidence = 0;
  let faceEmbedding: number[] | null = null;
  let faceBBox: { x: number; y: number; width: number; height: number } | null = null;
  try {
    const faceResult = await faceRecognitionService.detectFaceFromBuffer(selfieBuffer);
    if (faceResult) {
      faceConfidence = faceResult.confidence;
      faceEmbedding = Array.from(faceResult.embedding);
      faceBBox = faceResult.boundingBox;
    }
  } catch {
    faceConfidence = 0;
  }

  // Liveness detection: head-turn (active) or passive heuristics
  let livenessScore = 0;
  let livenessPassed = false;

  if (headTurnMetadata) {
    // Head-turn liveness — server-side face analysis of captured frames
    try {
      const headTurnResult = await verifyHeadTurnLiveness(headTurnMetadata, faceRecognitionService);
      livenessScore = headTurnResult.score;
      livenessPassed = headTurnResult.passed;
      logger.info('Head-turn liveness verification complete', {
        score: livenessScore.toFixed(3),
        passed: livenessPassed,
        reason: headTurnResult.reason,
        challenge: headTurnMetadata.challenge_direction,
        frameCount: headTurnMetadata.frames.length,
      });
    } catch (err) {
      logger.error('Head-turn liveness verifier failed, falling back to passive', { error: err });
      // Fall through to passive liveness below
    }
  }

  if (!headTurnMetadata || (livenessScore === 0 && !livenessPassed)) {
    // Passive liveness — image-based heuristics
    try {
      livenessScore = await livenessProvider.assessLiveness({
        buffer: selfieBuffer,
      });
      const threshold = getLivenessThresholdSync(isSandbox);
      livenessPassed = livenessScore >= threshold;
      logger.info('Passive liveness assessment complete', {
        provider: livenessProvider.name,
        score: livenessScore.toFixed(3),
        threshold,
        passed: livenessPassed,
        isSandbox,
      });
    } catch (err) {
      logger.error('Liveness provider failed, defaulting to fail-safe', { error: err });
      // Fail-safe: if the provider crashes, score 0 — do NOT auto-pass
      livenessScore = 0;
      livenessPassed = false;
    }
  }

  // ── Deepfake detection (Tier 2 — soft flag) ──────────────────────
  // Reuses faceBBox from the buffer detection above (no redundant face detect)
  let deepfake_check: LiveCaptureResult['deepfake_check'] = undefined;
  try {
    if (faceBBox) {
      const detector = createDeepfakeDetector();
      const crop = await detector.extractFaceCrop(selfieBuffer, faceBBox);
      const dfResult = await detector.detect(crop);
      deepfake_check = dfResult;
      if (dfResult.fakeProbability > 0.80) {
        logger.warn('Deepfake detected in live capture (soft flag)', {
          realProbability: dfResult.realProbability.toFixed(3),
          fakeProbability: dfResult.fakeProbability.toFixed(3),
        });
      }
    }
  } catch (err) {
    logger.warn('Deepfake detection failed (non-blocking)', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  return {
    face_embedding: faceEmbedding,
    face_confidence: faceConfidence,
    liveness_passed: livenessPassed,
    liveness_score: livenessScore,
    deepfake_check,
  };
}

// ─── Status mapping for backward compatibility ──────────────────

// ─── Step maps per flow ──────────────────────────────────────────
const STEP_MAPS: Record<string, Record<string, number>> = {
  full: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_BACK: 2, BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    AWAITING_LIVE: 4, LIVE_PROCESSING: 4,
    FACE_MATCHING: 5,
    COMPLETE: 5, HARD_REJECTED: 0,
  },
  document_only: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_BACK: 2, BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    COMPLETE: 3, HARD_REJECTED: 0,
  },
  identity: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_LIVE: 2, LIVE_PROCESSING: 2,
    FACE_MATCHING: 3,
    COMPLETE: 3, HARD_REJECTED: 0,
  },
  liveness_only: {
    AWAITING_LIVE: 1, LIVE_PROCESSING: 1,
    FACE_MATCHING: 1,
    COMPLETE: 1, HARD_REJECTED: 0,
  },
  age_only: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    COMPLETE: 1, HARD_REJECTED: 0,
  },
};

/** Map new 10-state VerificationStatus to old response format */
function mapStatusForResponse(state: Readonly<SessionState>, flow: FlowConfig = FLOW_PRESETS.full): {
  status: string;
  current_step: number;
  total_steps: number;
  final_result: string | null;
} {
  const stepMap = STEP_MAPS[flow.preset] ?? STEP_MAPS.full;

  let finalResult: string | null = null;
  if (state.current_step === VerificationStatus.COMPLETE) {
    if (flow.preset === 'age_only') {
      finalResult = 'verified';
    } else if (flow.preset === 'document_only') {
      // Document-only: final result based on cross-validation verdict alone
      const crossValVerdict = state.cross_validation?.verdict;
      finalResult = crossValVerdict === 'REVIEW' ? 'manual_review'
        : crossValVerdict === 'REJECT' ? 'failed'
        : 'verified';
    } else if (flow.preset === 'identity') {
      // Identity: no crossval, result based on face match only
      const needsReview = !!state.face_match?.skipped_reason;
      finalResult = needsReview ? 'manual_review' : 'verified';
    } else {
      // full / liveness_only: standard logic
      const needsReview = state.cross_validation?.verdict === 'REVIEW'
        || !!state.face_match?.skipped_reason;
      finalResult = needsReview ? 'manual_review' : 'verified';
    }
  } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
    finalResult = 'failed';
  }

  return {
    status: state.current_step,
    current_step: stepMap[state.current_step] ?? 0,
    total_steps: flow.totalSteps,
    final_result: finalResult,
  };
}

// ─── Webhook trigger helper ──────────────────────────────

/**
 * Fire webhooks if the verification has reached a terminal state.
 * Called AFTER res.json() so it never delays the HTTP response.
 * Errors are caught and logged — never thrown.
 */
async function fireWebhooksIfTerminal(
  verificationId: string,
  developerId: string,
  userId: string,
  state: SessionState,
  mapped: { final_result: string | null },
  isSandbox: boolean,
  apiKeyId?: string
): Promise<void> {
  if (mapped.final_result === null) return; // not terminal yet

  // Map terminal result to webhook event type
  const eventType = mapped.final_result === 'verified' ? 'verification.completed'
    : mapped.final_result === 'failed' ? 'verification.failed'
    : 'verification.manual_review';

  try {
    const webhooks = await webhookService.getActiveWebhooksForDeveloper(developerId, isSandbox, eventType, apiKeyId);
    if (webhooks.length === 0) return;

    const payload: WebhookPayload = {
      event: eventType,
      user_id: userId,
      verification_id: verificationId,
      status: mapped.final_result as any,
      timestamp: new Date().toISOString(),
      data: {
        ocr_data: state.front_extraction?.ocr ?? undefined,
        face_match_score: state.face_match?.similarity_score ?? undefined,
        failure_reason: state.rejection_detail ?? undefined,
      },
    };

    for (const webhook of webhooks) {
      webhookService.sendWebhook(webhook, verificationId, payload).catch(err => {
        logger.error('Webhook delivery error (fire-and-forget):', {
          webhookId: webhook.id,
          verificationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } catch (err) {
    logger.error('fireWebhooksIfTerminal failed:', {
      verificationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire a specific webhook event (non-terminal).
 * Called AFTER res.json() so it never delays the HTTP response.
 * Errors are caught and logged — never thrown.
 */
async function fireWebhookEvent(
  eventType: string,
  verificationId: string,
  developerId: string,
  userId: string,
  state: SessionState,
  isSandbox: boolean,
  apiKeyId?: string
): Promise<void> {
  try {
    const webhooks = await webhookService.getActiveWebhooksForDeveloper(developerId, isSandbox, eventType, apiKeyId);
    if (webhooks.length === 0) return;

    // Resolve the current verification status for the payload
    const mapped = mapStatusForResponse(state);
    const currentStatus = mapped.final_result || 'processing';

    const payload: WebhookPayload = {
      event: eventType,
      user_id: userId,
      verification_id: verificationId,
      status: currentStatus as any,
      timestamp: new Date().toISOString(),
      data: {
        ocr_data: state.front_extraction?.ocr ?? undefined,
        face_match_score: state.face_match?.similarity_score ?? undefined,
        failure_reason: state.rejection_detail ?? undefined,
      },
    };

    for (const webhook of webhooks) {
      webhookService.sendWebhook(webhook, verificationId, payload).catch(err => {
        logger.error('Webhook delivery error (fire-and-forget):', {
          webhookId: webhook.id,
          verificationId,
          event: eventType,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } catch (err) {
    logger.error('fireWebhookEvent failed:', {
      verificationId,
      event: eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Auth helper ──────────────────────────────

async function requireOwnedVerification(req: Request, verificationId: string) {
  const developerId = (req as any).developer.id;
  const verification = await verificationService.getVerificationRequestForDeveloper(verificationId, developerId);
  if (!verification) {
    throw new ValidationError('Verification request not found', 'verification_id', verificationId);
  }
  return verification;
}

// ─── Routes ──────────────────────────────────

router.post('/initialize',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  [
    body('user_id').isUUID().withMessage('User ID must be a valid UUID'),
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'auto']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
    body('sandbox').optional().isBoolean().withMessage('Sandbox must be a boolean'),
    body('source').optional().isIn(['api', 'vaas', 'demo']).withMessage('Source must be api, vaas, or demo'),
    body('addons').optional().isObject().withMessage('Addons must be an object'),
    body('addons.aml_screening').optional().isBoolean().withMessage('aml_screening must be a boolean'),
    body('addons.address_verification').optional().isBoolean().withMessage('address_verification must be a boolean'),
    body('verification_mode').optional().isIn(['full', 'document_only', 'identity', 'age_only']).withMessage('verification_mode must be "full", "document_only", "identity", or "age_only"'),
    body('age_threshold').optional().isInt({ min: 1, max: 99 }).withMessage('age_threshold must be an integer between 1 and 99'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { user_id, document_type = 'auto', issuing_country } = req.body;
    const addons: VerificationAddons = req.body.addons || {};
    const source: VerificationSource = req.body.source || 'api';
    const verificationMode: string = req.body.verification_mode || 'full';
    const ageThreshold: number | null = verificationMode === 'age_only'
      ? (req.body.age_threshold ?? 18)
      : null;

    req.body.user_id = user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const isSandbox = req.isSandbox || false;
    const developerId = (req as any).developer.id;

    // Create DB record with source tag
    const verificationRecord = await verificationService.createVerificationRequest({
      user_id,
      developer_id: developerId,
      is_sandbox: isSandbox,
      source,
      addons: Object.keys(addons).length > 0 ? addons as Record<string, unknown> : undefined,
    });

    // Set session start timestamp, verification mode, and age threshold
    const { error: updateError } = await supabase.from('verification_requests').update({
      session_started_at: new Date().toISOString(),
      verification_mode: verificationMode,
      ...(ageThreshold !== null && { age_threshold: ageThreshold }),
    }).eq('id', verificationRecord.id);
    if (updateError) {
      logger.error('Failed to update verification_mode', {
        verificationId: verificationRecord.id,
        verification_mode: verificationMode,
        error: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      });
    }

    // Resolve flow config from verification_mode
    const flow = FLOW_PRESETS[verificationMode as VerificationMode] ?? INLINE_FLOW_FALLBACKS[verificationMode] ?? FLOW_PRESETS.full;

    // Create session and save initial state
    const issuingCountryUpper = issuing_country?.toUpperCase() || null;
    const session = createSession(isSandbox, { session_id: verificationRecord.id, issuing_country: issuingCountryUpper }, addons, undefined, flow);
    await saveSessionState(verificationRecord.id, session.getState());

    logVerificationEvent('verification_initialized', verificationRecord.id, {
      userId: user_id,
      documentType: document_type,
      developerId,
      sandbox: isSandbox,
    });

    const isAgeOnly = verificationMode === 'age_only';
    const mapped = mapStatusForResponse(session.getState(), flow);

    const modeMessages: Record<string, string> = {
      full: 'Verification initialized successfully - ready to upload front document',
      document_only: 'Document-only verification initialized — upload front document',
      identity: 'Identity verification initialized — upload front document',
      age_only: 'Age verification initialized — upload front document to check age',
    };

    res.status(201).json({
      success: true,
      verification_id: verificationRecord.id,
      verification_mode: verificationMode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      ...(isAgeOnly && { age_threshold: ageThreshold }),
      message: modeMessages[verificationMode] || modeMessages.full,
    });

    // Fire verification.started webhook (after response is sent)
    fireWebhookEvent(
      'verification.started',
      verificationRecord.id, developerId, user_id,
      session.getState(), isSandbox, (req as any).apiKey?.id
    );
  })
);

// ─── Re-verification: liveness-only re-check for returning users ────────────
router.post('/re-verify',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  [
    body('user_id').isUUID().withMessage('User ID must be a valid UUID'),
    body('previous_verification_id').isUUID().withMessage('Previous verification ID must be a valid UUID'),
    body('source').optional().isIn(['api', 'vaas', 'demo']).withMessage('Source must be api, vaas, or demo'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { user_id, previous_verification_id } = req.body;
    const source: VerificationSource = req.body.source || 'api';

    req.body.user_id = user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const isSandbox = req.isSandbox || false;
    const developerId = (req as any).developer.id;

    // Load and validate the parent verification
    const { data: parentVerification, error: parentError } = await supabase
      .from('verification_requests')
      .select('id, user_id, developer_id, status, issuing_country, verification_mode')
      .eq('id', previous_verification_id)
      .single();

    if (parentError || !parentVerification) {
      throw new ValidationError('Previous verification not found', 'previous_verification_id', previous_verification_id);
    }
    if (parentVerification.developer_id !== developerId) {
      throw new ValidationError('Previous verification belongs to a different developer', 'previous_verification_id', previous_verification_id);
    }
    if (parentVerification.user_id !== user_id) {
      throw new ValidationError('Previous verification belongs to a different user', 'previous_verification_id', previous_verification_id);
    }
    if (parentVerification.status !== 'verified') {
      throw new ValidationError('Previous verification must have status "verified" to re-verify', 'previous_verification_id', parentVerification.status);
    }
    if (parentVerification.verification_mode && parentVerification.verification_mode !== 'full') {
      throw new ValidationError('Cannot re-verify from another re-verification — use the original verification', 'previous_verification_id', previous_verification_id);
    }

    // Load parent session to get face embedding for matching
    const parentState = await loadSessionState(previous_verification_id);
    if (!parentState?.front_extraction) {
      throw new ValidationError('Previous verification has no front extraction data — cannot re-verify', 'previous_verification_id', previous_verification_id);
    }

    // Check if face embedding is still available (GDPR stripping nullifies it on terminal states).
    // If missing, the session starts at AWAITING_FRONT so the user must re-upload their ID photo.
    const hasFaceEmbedding = parentState.front_extraction.face_embedding
      && parentState.front_extraction.face_embedding.length > 0;
    const startStep = hasFaceEmbedding
      ? VerificationStatus.AWAITING_LIVE
      : VerificationStatus.AWAITING_FRONT;
    const mode = hasFaceEmbedding ? 'liveness_only' : 'document_refresh';

    // Create new verification record linked to parent
    const verificationRecord = await verificationService.createVerificationRequest({
      user_id,
      developer_id: developerId,
      is_sandbox: isSandbox,
      source,
    });

    // Set parent link and verification mode
    await supabase.from('verification_requests').update({
      parent_verification_id: previous_verification_id,
      verification_mode: mode,
      session_started_at: new Date().toISOString(),
      issuing_country: parentVerification.issuing_country,
    }).eq('id', verificationRecord.id);

    // Create session — either at AWAITING_LIVE (with face embedding) or AWAITING_FRONT (refresh)
    const hydration: SessionHydration = {
      session_id: verificationRecord.id,
      current_step: startStep,
      issuing_country: parentVerification.issuing_country,
    };
    if (hasFaceEmbedding) {
      hydration.front_extraction = parentState.front_extraction;
    }
    const session = createSession(isSandbox, hydration);
    await saveSessionState(verificationRecord.id, session.getState());

    logVerificationEvent('re_verification_initialized', verificationRecord.id, {
      userId: user_id,
      previousVerificationId: previous_verification_id,
      developerId,
      sandbox: isSandbox,
      mode,
    });

    const mapped = mapStatusForResponse(session.getState());

    res.status(201).json({
      success: true,
      verification_id: verificationRecord.id,
      parent_verification_id: previous_verification_id,
      verification_mode: mode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      message: hasFaceEmbedding
        ? 'Re-verification initialized — ready to upload live capture (liveness-only mode)'
        : 'Re-verification initialized — face embedding expired, please re-upload front document first',
    });

    // Fire webhook
    fireWebhookEvent(
      'verification.started',
      verificationRecord.id, developerId, user_id,
      session.getState(), isSandbox, (req as any).apiKey?.id
    );
  })
);

router.post('/:verification_id/front-document',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('document'),
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other', 'auto']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new FileUploadError('Document file is required');
    }

    const frontFileTypeCheck = await validateFileType(req.file.buffer);
    if (!frontFileTypeCheck.valid) {
      throw new FileUploadError(frontFileTypeCheck.reason || 'Invalid file type');
    }

    const { verification_id } = req.params;
    const { document_type = 'auto', issuing_country } = req.body;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;
    const source: VerificationSource = (verification as any).source || 'api';

    // Store document in the source-appropriate bucket
    const documentPath = await storageService.storeDocument(
      req.file.buffer,
      req.file.originalname || 'front_document.jpg',
      req.file.mimetype,
      verification_id,
      source
    );

    const document = await verificationService.createDocument({
      verification_request_id: verification_id,
      file_path: documentPath,
      file_name: req.file.originalname || 'front_document.jpg',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      document_type,
    });

    await verificationService.updateVerificationRequest(verification_id, {
      document_id: document.id,
    } as any);

    // Resolve issuing_country: per-request override > session state
    const resolvedCountry = issuing_country?.toUpperCase() || undefined;

    // Look up developer's LLM config for enhanced OCR extraction
    const developerId = (req as any).developer.id;
    const llmConfig = await getDeveloperLLMConfig(developerId);

    // Run front extraction — engine worker if available, local fallback otherwise
    const frontResult = engineClient.isEnabled()
      ? await engineClient.extractFront(req.file.buffer, {
          documentId: document.id,
          documentType: document_type,
          issuingCountry: resolvedCountry,
          verificationId: verification_id,
          llmConfig,
        })
      : await extractFrontDocument(documentPath, document.id, document_type, resolvedCountry, verification_id, llmConfig, req.file.buffer);

    // Update document record with resolved document type if auto-classified
    const resolvedDocType = frontResult.ocr?.detected_document_type;
    if (document_type === 'auto' && resolvedDocType) {
      verificationService.updateDocument(document.id, { document_type: resolvedDocType } as any).catch(() => {});
    }

    // Ephemeral cleanup: demo files are deleted immediately after extraction
    if (source === 'demo') {
      storageService.deleteFile(documentPath).catch(err =>
        logger.warn('Ephemeral cleanup failed (front)', { documentPath, error: err })
      );
      verificationService.updateDocument(document.id, { file_path: null } as any).catch(() => {});
    }

    // Check verification mode and resolve flow
    const { data: vrRow } = await supabase
      .from('verification_requests')
      .select('verification_mode, age_threshold')
      .eq('id', verification_id)
      .single();
    const vrMode = (vrRow?.verification_mode as VerificationMode) || 'full';
    const flow = FLOW_PRESETS[vrMode] ?? INLINE_FLOW_FALLBACKS[vrMode] ?? FLOW_PRESETS.full;
    const isAgeOnly = vrMode === 'age_only';
    const ageThreshold = vrRow?.age_threshold ?? 18;

    // Hydrate session and run Gate 1 via session
    const session = await hydrateSession(verification_id, isSandbox);

    // Guard: if session was already rejected in a previous step, return early
    const preState = session.getState();
    if (preState.current_step === VerificationStatus.HARD_REJECTED) {
      const mapped = mapStatusForResponse(preState, flow);
      return res.status(409).json({
        success: false,
        verification_id,
        status: mapped.status,
        current_step: mapped.current_step,
        final_result: mapped.final_result,
        rejection_reason: preState.rejection_reason,
        rejection_detail: preState.rejection_detail,
        message: 'Verification was already rejected in a previous step. Please start a new verification.',
      });
    }

    // Override the extractFront dep to return our pre-computed result
    (session as any).deps.extractFront = async () => frontResult;

    let stepResult;
    let ageVerification: AgeVerificationResult | undefined;

    if (isAgeOnly) {
      // Age-only mode: run Gate 1 + age check, then auto-complete
      const ageResult = await session.submitFrontAgeOnly(req.file.buffer, ageThreshold);
      stepResult = ageResult;
      ageVerification = ageResult.age_verification;
    } else {
      stepResult = await session.submitFront(req.file.buffer);
    }

    await saveSessionState(verification_id, session.getState());

    // Update main DB record
    const state = session.getState();
    let dbStatus: string;
    if (isAgeOnly) {
      dbStatus = state.current_step === VerificationStatus.COMPLETE ? 'verified' : 'failed';
    } else {
      dbStatus = stepResult.passed ? 'processing' : 'failed';
    }
    await verificationService.updateVerificationRequest(verification_id, {
      status: dbStatus,
      ...(isAgeOnly && state.current_step === VerificationStatus.COMPLETE && {
        processing_completed_at: new Date().toISOString(),
      }),
    } as any);

    logVerificationEvent('front_document_processed', verification_id, {
      documentId: document.id,
      documentPath,
      status: state.current_step,
      verification_mode: vrMode,
    });

    const mapped = mapStatusForResponse(state, flow);

    const ocrResult = state.front_extraction?.ocr;

    // Build next-step message per flow
    const nextStepMessage = !stepResult.passed
      ? stepResult.user_message || 'Front document processing failed'
      : isAgeOnly
        ? (state.current_step === VerificationStatus.COMPLETE ? 'Age verification passed' : stepResult.user_message || 'Age verification failed')
        : flow.afterFront === 'AWAITING_LIVE'
          ? 'Front document processed successfully - ready for live capture'
          : 'Front document processed successfully - ready to upload back document';

    res.json({
      success: true,
      verification_id,
      verification_mode: vrMode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      document_id: document.id,
      ocr_data: isAgeOnly ? undefined : (ocrResult ?? null),
      detected_document_type: ocrResult?.detected_document_type || (document_type !== 'auto' ? document_type : undefined),
      classification_confidence: ocrResult?.classification_confidence ?? (document_type !== 'auto' ? 1.0 : undefined),
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      ...(ageVerification && { age_verification: ageVerification }),
      ...(mapped.final_result && { final_result: mapped.final_result }),
      message: nextStepMessage,
    });

    // Broadcast status change via Supabase Realtime (after response is sent)
    broadcastStatusChange(
      verification_id, mapped.status, mapped.current_step,
      mapped.final_result, state.rejection_reason,
    ).catch(() => {});

    // Fire age check webhook for age_only mode (after response is sent)
    if (isAgeOnly && ageVerification) {
      fireWebhookEvent(
        'verification.age_check',
        verification_id, (req as any).developer.id, verification.user_id,
        state, isSandbox, (req as any).apiKey?.id
      );
    }

    // Fire verification.document_processed webhook (after response is sent)
    fireWebhookEvent(
      'verification.document_processed',
      verification_id, (req as any).developer.id, verification.user_id,
      state, isSandbox, (req as any).apiKey?.id
    );

    // Fire webhooks if terminal (Gate 1 rejection or age_only completion)
    fireWebhooksIfTerminal(
      verification_id, (req as any).developer.id, verification.user_id,
      state, mapped, isSandbox, (req as any).apiKey?.id
    );
  })
);

router.post('/:verification_id/back-document',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('document'),
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other', 'auto']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new FileUploadError('Document file is required');
    }

    const backFileTypeCheck = await validateFileType(req.file.buffer);
    if (!backFileTypeCheck.valid) {
      throw new FileUploadError(backFileTypeCheck.reason || 'Invalid file type');
    }

    const { verification_id } = req.params;
    const { document_type = 'other' } = req.body;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;
    const source: VerificationSource = (verification as any).source || 'api';

    // Guard: check flow allows back document
    const { data: vrRow } = await supabase
      .from('verification_requests')
      .select('verification_mode')
      .eq('id', verification_id)
      .single();
    const vrMode = (vrRow?.verification_mode as VerificationMode) || 'full';
    const flow = FLOW_PRESETS[vrMode] ?? INLINE_FLOW_FALLBACKS[vrMode] ?? FLOW_PRESETS.full;

    if (!flow.requiresBack) {
      return res.status(400).json({
        success: false,
        verification_id,
        verification_mode: vrMode,
        message: `Back document is not required for "${vrMode}" verification mode. ${flow.requiresLiveness ? 'Proceed to live capture.' : 'Verification is complete.'}`,
      });
    }

    // Store document in the source-appropriate bucket
    const documentPath = await storageService.storeDocument(
      req.file.buffer,
      req.file.originalname || 'back_document.jpg',
      req.file.mimetype,
      verification_id,
      source
    );

    const document = await verificationService.createDocument({
      verification_request_id: verification_id,
      file_path: documentPath,
      file_name: req.file.originalname || 'back_document.jpg',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      document_type,
    });

    // Run back extraction (country context flows to Gate 2 via session state)
    const backResult = engineClient.isEnabled()
      ? await engineClient.extractBack(req.file.buffer)
      : await extractBackDocument(documentPath);

    // Ephemeral cleanup: demo files are deleted immediately after extraction
    if (source === 'demo') {
      storageService.deleteFile(documentPath).catch(err =>
        logger.warn('Ephemeral cleanup failed (back)', { documentPath, error: err })
      );
      verificationService.updateDocument(document.id, { file_path: null } as any).catch(() => {});
    }

    // Hydrate session and run Gate 2 + auto cross-validation via session
    const session = await hydrateSession(verification_id, isSandbox);

    // Guard: if session was already rejected in a previous step, return early
    const preState = session.getState();
    if (preState.current_step === VerificationStatus.HARD_REJECTED) {
      const mapped = mapStatusForResponse(preState, flow);
      return res.status(409).json({
        success: false,
        verification_id,
        status: mapped.status,
        current_step: mapped.current_step,
        final_result: mapped.final_result,
        rejection_reason: preState.rejection_reason,
        rejection_detail: preState.rejection_detail,
        message: 'Verification was already rejected in a previous step. Please start a new verification.',
      });
    }

    (session as any).deps.extractBack = async () => backResult;
    const stepResult = await session.submitBack(req.file.buffer);
    await saveSessionState(verification_id, session.getState());

    // Update main DB record
    const state = session.getState();
    let dbStatus: string;
    if (flow.preset === 'document_only' && state.current_step === VerificationStatus.COMPLETE) {
      // document_only: crossval passed → determine final status
      const crossValVerdict = state.cross_validation?.verdict;
      dbStatus = crossValVerdict === 'REVIEW' ? 'manual_review'
        : crossValVerdict === 'REJECT' ? 'failed'
        : 'verified';
      await verificationService.updateVerificationRequest(verification_id, {
        status: dbStatus,
        cross_validation_score: state.cross_validation?.overall_score ?? null,
        processing_completed_at: new Date().toISOString(),
      } as any);
    } else {
      dbStatus = stepResult.passed ? 'processing' : 'failed';
      await verificationService.updateVerificationRequest(verification_id, {
        status: dbStatus,
      } as any);
    }

    logVerificationEvent('back_document_processed', verification_id, {
      documentId: document.id,
      documentPath,
      status: state.current_step,
      verification_mode: vrMode,
    });

    const mapped = mapStatusForResponse(state, flow);

    const nextMsg = !stepResult.passed
      ? stepResult.user_message || 'Back document processing failed'
      : flow.afterCrossVal === 'COMPLETE'
        ? 'Document verification complete'
        : 'Back document processed and cross-validation passed - ready for live capture';

    res.json({
      success: true,
      verification_id,
      verification_mode: vrMode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      document_id: document.id,
      barcode_data: state.back_extraction?.qr_payload ?? null,
      barcode_extraction_failed: !state.back_extraction?.qr_payload,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      cross_validation_results: state.cross_validation ?? null,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      ...(mapped.final_result && { final_result: mapped.final_result }),
      message: nextMsg,
    });

    // Broadcast status change via Supabase Realtime
    broadcastStatusChange(
      verification_id, mapped.status, mapped.current_step,
      mapped.final_result, state.rejection_reason,
    ).catch(() => {});

    // Fire verification.document_processed webhook (after response is sent)
    fireWebhookEvent(
      'verification.document_processed',
      verification_id, (req as any).developer.id, verification.user_id,
      state, isSandbox, (req as any).apiKey?.id
    );

    // Fire webhooks if cross-validation hard-rejected (after response is sent)
    fireWebhooksIfTerminal(
      verification_id, (req as any).developer.id, verification.user_id,
      state, mapped, isSandbox, (req as any).apiKey?.id
    );
  })
);

// Cross-validation is now auto-triggered — this endpoint returns cached result
router.post('/:verification_id/cross-validation',
  authenticateAPIKey,
  verificationRateLimit,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;

    // Return cached cross-validation result (auto-triggered after back-document)
    const session = await hydrateSession(verification_id, isSandbox);
    const state = session.getState();
    const mapped = mapStatusForResponse(state);

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      cross_validation_results: state.cross_validation ?? null,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation score requires review' : state.face_match?.skipped_reason ? `Face match skipped: ${state.face_match.skipped_reason}` : null,
      message: state.cross_validation
        ? 'Cross-validation results retrieved (auto-triggered after back document)'
        : 'Cross-validation has not been performed yet',
    });
  })
);

router.post('/:verification_id/live-capture',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('selfie'),
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new FileUploadError('Document file is required');
    }

    const liveFileTypeCheck = await validateFileType(req.file.buffer);
    if (!liveFileTypeCheck.valid) {
      throw new FileUploadError(liveFileTypeCheck.reason || 'Invalid file type');
    }

    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;
    const source: VerificationSource = (verification as any).source || 'api';

    // Guard: check flow allows live capture
    const { data: vrRow } = await supabase
      .from('verification_requests')
      .select('verification_mode')
      .eq('id', verification_id)
      .single();
    const vrMode = (vrRow?.verification_mode as VerificationMode) || 'full';
    const flow = FLOW_PRESETS[vrMode] ?? INLINE_FLOW_FALLBACKS[vrMode] ?? FLOW_PRESETS.full;

    if (!flow.requiresLiveness) {
      return res.status(400).json({
        success: false,
        verification_id,
        verification_mode: vrMode,
        message: `Live capture is not required for "${vrMode}" verification mode.`,
      });
    }

    // Store selfie in the source-appropriate bucket
    const selfiePath = await storageService.storeSelfie(
      req.file.buffer,
      req.file.originalname || 'selfie.jpg',
      req.file.mimetype,
      verification_id,
      source
    );

    const selfie = await verificationService.createSelfie({
      verification_request_id: verification_id,
      file_path: selfiePath,
      file_name: req.file.originalname || 'selfie.jpg',
      file_size: req.file.size,
    });

    await verificationService.updateVerificationRequest(verification_id, {
      selfie_id: selfie.id,
    } as any);

    // Parse optional liveness metadata from client
    let headTurnMetadata: HeadTurnLivenessMetadata | undefined;
    if (req.body?.liveness_metadata) {
      try {
        const raw = typeof req.body.liveness_metadata === 'string'
          ? JSON.parse(req.body.liveness_metadata)
          : req.body.liveness_metadata;
        headTurnMetadata = HeadTurnLivenessMetadataSchema.parse(raw);
        logger.info('Head-turn liveness metadata received', {
          challenge: headTurnMetadata.challenge_direction,
          frames: headTurnMetadata.frames.length,
        });
      } catch (err) {
        throw new ValidationError(
          'Invalid liveness_metadata: expected head_turn challenge format with frames array',
          'liveness_metadata',
          req.body.liveness_metadata,
        );
      }
    }

    // Run live capture extraction with real liveness detection
    const liveResult = engineClient.isEnabled()
      ? await engineClient.extractLive(req.file.buffer, { isSandbox, headTurnMetadata })
      : await extractLiveCapture(selfiePath, null, req.file.buffer, isSandbox, headTurnMetadata);

    // Ephemeral cleanup: demo selfie files are deleted immediately after extraction
    if (source === 'demo') {
      storageService.deleteFile(selfiePath).catch(err =>
        logger.warn('Ephemeral cleanup failed (selfie)', { selfiePath, error: err })
      );
      supabase.from('selfies').update({ file_path: null }).eq('id', selfie.id).then(() => {});
    }

    // Hydrate session and run Gate 4 + auto face match via session
    const session = await hydrateSession(verification_id, isSandbox);

    // Guard: if the session was already rejected (e.g. Gate 3 cross-validation
    // failed on the back document), return a clear error instead of crashing.
    const preState = session.getState();
    if (preState.current_step === VerificationStatus.HARD_REJECTED) {
      const mapped = mapStatusForResponse(preState, flow);
      return res.status(409).json({
        success: false,
        verification_id,
        status: mapped.status,
        current_step: mapped.current_step,
        final_result: mapped.final_result,
        rejection_reason: preState.rejection_reason,
        rejection_detail: preState.rejection_detail,
        message: 'Verification was already rejected in a previous step. Please start a new verification.',
      });
    }

    (session as any).deps.processLiveCapture = async () => liveResult;
    const stepResult = await session.submitLiveCapture(req.file.buffer);
    await saveSessionState(verification_id, session.getState());

    // Update main DB record
    const state = session.getState();
    let dbStatus: string;
    const needsManualReview = state.cross_validation?.verdict === 'REVIEW'
      || !!state.face_match?.skipped_reason;
    if (state.current_step === VerificationStatus.COMPLETE) {
      dbStatus = needsManualReview ? 'manual_review' : 'verified';
    } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
      dbStatus = 'failed';
    } else {
      dbStatus = 'processing';
    }
    await verificationService.updateVerificationRequest(verification_id, {
      status: dbStatus,
      face_match_score: state.face_match?.similarity_score ?? null,
      liveness_score: state.liveness?.score ?? null,
      cross_validation_score: state.cross_validation?.overall_score ?? null,
      live_capture_completed: !!(state.face_match),
    } as any);

    // Compute and persist risk score on terminal states
    if (state.current_step === VerificationStatus.COMPLETE || state.current_step === VerificationStatus.HARD_REJECTED) {
      try {
        const riskScore = computeRiskScore(state);
        await supabase.from('verification_risk_scores').upsert({
          verification_request_id: verification_id,
          overall_score: riskScore.overall_score,
          risk_level: riskScore.risk_level,
          risk_factors: riskScore.risk_factors,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'verification_request_id' });

        await supabase.from('verification_requests').update({
          processing_completed_at: new Date().toISOString(),
        }).eq('id', verification_id);
      } catch (err) {
        logger.warn('Failed to compute/store risk score (non-blocking):', err);
      }
    }

    // Persist AML screening result to audit table (non-blocking)
    if (state.aml_screening) {
      supabase.from('aml_screenings').insert({
        verification_request_id: verification_id,
        full_name: state.aml_screening.screened_name,
        date_of_birth: state.aml_screening.screened_dob || null,
        risk_level: state.aml_screening.risk_level,
        match_found: state.aml_screening.match_found,
        matches: state.aml_screening.matches,
        lists_checked: state.aml_screening.lists_checked,
        screened_at: state.aml_screening.screened_at,
      }).then(({ error }: { error: any }) => {
        if (error) logger.warn('Failed to persist AML screening (non-blocking):', error);
      });
    }

    logVerificationEvent('live_capture_processed', verification_id, {
      selfieId: selfie.id,
      selfiePath,
      status: state.current_step,
      faceMatchPassed: state.face_match?.passed ?? null,
    });

    const mapped = mapStatusForResponse(state, flow);

    res.json({
      success: true,
      verification_id,
      verification_mode: vrMode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      selfie_id: selfie.id,
      face_match_results: state.face_match ?? null,
      liveness_results: {
        liveness_passed: liveResult.liveness_passed,
        liveness_score: liveResult.liveness_score,
        liveness_mode: headTurnMetadata ? 'head_turn' : 'passive',
      },
      deepfake_check: liveResult.deepfake_check ?? null,
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation requires review' : state.face_match?.skipped_reason ? `Face match skipped: ${state.face_match.skipped_reason}` : null,
      message: state.current_step === VerificationStatus.COMPLETE
        ? 'Verification completed successfully'
        : state.current_step === VerificationStatus.HARD_REJECTED
          ? stepResult.user_message || 'Verification failed'
          : 'Live capture processed',
    });

    // Broadcast status change via Supabase Realtime
    broadcastStatusChange(
      verification_id, mapped.status, mapped.current_step,
      mapped.final_result, state.rejection_reason,
    ).catch(() => {});

    // Fire webhooks on COMPLETE or HARD_REJECTED (after response is sent)
    fireWebhooksIfTerminal(
      verification_id, (req as any).developer.id, verification.user_id,
      state, mapped, isSandbox, (req as any).apiKey?.id
    );
  })
);

// /finalize endpoint removed — final decision auto-triggers after live capture.
// Return 410 Gone for backward compat awareness.
router.post('/:verification_id/finalize',
  authenticateAPIKey,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;

    // Return current state — finalize is no longer needed
    const session = await hydrateSession(verification_id, isSandbox);
    const state = session.getState();
    const mapped = mapStatusForResponse(state);

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      message: 'The /finalize endpoint is deprecated — final decision auto-triggers after live capture.',
    });
  })
);

// ─── Restart a failed verification (retry flow) ──────────────────────────
router.post('/:verification_id/restart',
  authenticateAPIKey,
  verificationRateLimit,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);

    // Only failed verifications can be restarted
    const isSandbox = (verification as any).is_sandbox || false;
    const session = await hydrateSession(verification_id, isSandbox);
    const state = session.getState();
    const mapped = mapStatusForResponse(state);

    if (mapped.final_result !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Only failed verifications can be restarted',
      });
    }

    // Enforce max 3 retries
    const currentRetryCount = (verification as any).retry_count ?? 0;
    if (currentRetryCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry attempts reached (3)',
        retry_count: currentRetryCount,
      });
    }

    // Reset verification_requests row with optimistic lock on retry_count
    const { data: updated } = await supabase.from('verification_requests').update({
      status: 'pending',
      face_match_score: null,
      liveness_score: null,
      cross_validation_score: null,
      failure_reason: null,
      processing_completed_at: null,
      document_id: null,
      selfie_id: null,
      retry_count: currentRetryCount + 1,
    }).eq('id', verification_id)
      .eq('retry_count', currentRetryCount)
      .select('id');

    if (!updated?.length) {
      return res.status(409).json({
        success: false,
        message: 'Verification was modified concurrently. Please try again.',
      });
    }

    // Delete related records — documents, selfies, risk scores, and session context
    await Promise.all([
      supabase.from('documents').delete().eq('verification_request_id', verification_id),
      supabase.from('selfies').delete().eq('verification_request_id', verification_id),
      supabase.from('verification_risk_scores').delete().eq('verification_request_id', verification_id),
      supabase.from('verification_contexts').delete().eq('verification_id', verification_id),
    ]);

    logVerificationEvent('verification_restarted', verification_id, {
      developerId: (req as any).developer.id,
      retryCount: currentRetryCount + 1,
    });

    res.json({
      success: true,
      verification_id,
      retry_count: currentRetryCount + 1,
      message: 'Verification restarted — ready to upload front document',
    });

    // Broadcast restart to Realtime subscribers
    broadcastStatusChange(
      verification_id, 'AWAITING_FRONT', 1, null, null
    ).catch(() => {});
  })
);

router.get('/:verification_id/status',
  authenticateAPIKey,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;

    // Resolve verification mode and flow
    const { data: vrMeta } = await supabase
      .from('verification_requests')
      .select('verification_mode, age_threshold')
      .eq('id', verification_id)
      .single();
    const vrMode = (vrMeta?.verification_mode as VerificationMode) || 'full';
    const flow = FLOW_PRESETS[vrMode] ?? INLINE_FLOW_FALLBACKS[vrMode] ?? FLOW_PRESETS.full;
    const isAgeOnly = vrMode === 'age_only';

    const session = await hydrateSession(verification_id, isSandbox);
    const state = session.getState();
    const mapped = mapStatusForResponse(state, flow);

    // Fetch risk score from DB (computed after live capture)
    let riskScore: { overall_score: number; risk_level: string; risk_factors: any[] } | null = null;
    const { data: riskRow } = await supabase
      .from('verification_risk_scores')
      .select('overall_score, risk_level, risk_factors')
      .eq('verification_request_id', verification_id)
      .single();
    if (riskRow) {
      riskScore = {
        overall_score: riskRow.overall_score,
        risk_level: riskRow.risk_level,
        risk_factors: riskRow.risk_factors ?? [],
      };
    }

    // For age_only, include age_verification from session state metadata
    const ageVerification: AgeVerificationResult | undefined = isAgeOnly
      ? (state as any).age_verification ?? undefined
      : undefined;

    res.json({
      success: true,
      verification_id,
      verification_mode: vrMode,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      ...(ageVerification && { age_verification: ageVerification }),
      front_document_uploaded: !!state.front_extraction,
      back_document_uploaded: !!state.back_extraction,
      live_capture_uploaded: !!state.face_match,
      ocr_data: isAgeOnly ? undefined : (state.front_extraction?.ocr ?? null),
      barcode_data: state.back_extraction?.qr_payload ?? null,
      cross_validation_results: state.cross_validation ?? null,
      face_match_results: state.face_match ?? null,
      liveness_results: state.liveness ?? null,
      deepfake_check: state.deepfake_check ?? null,
      aml_screening: state.aml_screening ?? null,
      risk_score: riskScore,
      barcode_extraction_failed: state.back_extraction ? !state.back_extraction.qr_payload : null,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      face_match_passed: state.face_match?.passed ?? null,
      liveness_passed: state.liveness?.passed ?? null,
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation requires review' : state.face_match?.skipped_reason ? `Face match skipped: ${state.face_match.skipped_reason}` : null,
      ...(mapped.final_result === 'failed' && {
        retry_available: ((verification as any).retry_count ?? 0) < 3,
        retry_count: (verification as any).retry_count ?? 0,
      }),
      created_at: state.created_at,
      updated_at: state.updated_at,
    });
  })
);

// ─── Phone OTP (optional verification step) ─────────────────────────────────

/**
 * Fetch the developer's SMS config for a verification request.
 * Returns null if SMS is not configured (self-hosted mode).
 */
async function getSMSConfigForVerification(verificationRequestId: string) {
  const { data: vr, error: vrError } = await supabase
    .from('verification_requests')
    .select('developer_id')
    .eq('id', verificationRequestId)
    .single();

  if (vrError || !vr?.developer_id) {
    if (vrError) logger.warn('Failed to fetch developer_id for SMS config', { verificationRequestId, error: vrError.message });
    return null;
  }

  const { data: dev, error: devError } = await supabase
    .from('developers')
    .select('sms_provider, sms_api_key_encrypted, sms_api_secret_encrypted, sms_phone_number')
    .eq('id', vr.developer_id)
    .single();

  if (devError || !dev) {
    if (devError) logger.warn('Failed to fetch SMS config for developer', { developerId: vr.developer_id, error: devError.message });
    return null;
  }

  return decryptSMSConfig(dev);
}

router.post('/:verification_id/phone-otp/send',
  authenticateAPIKey,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('phone_number').matches(/^\+[1-9]\d{6,14}$/).withMessage('Phone number must be in E.164 format (e.g. +15551234567)'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const { phone_number } = req.body;

    await requireOwnedVerification(req, verification_id);

    const smsConfig = await getSMSConfigForVerification(verification_id);
    const result = await createAndSendPhoneOtp(verification_id, phone_number, smsConfig);

    if (!result.success) {
      return res.status(429).json({ success: false, message: result.reason });
    }

    const response: any = {
      success: true,
      message: smsConfig
        ? 'Verification code sent via SMS.'
        : 'SMS provider not configured. Code returned in response (self-hosted mode).',
    };

    // Self-hosted: return plaintext code when no SMS provider is configured
    if (result.code) {
      response.code = result.code;
      response.self_hosted = true;
    }

    res.json(response);
  })
);

router.post('/:verification_id/phone-otp/verify',
  authenticateAPIKey,
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('code').matches(/^\d{6}$/).withMessage('Code must be a 6-digit number'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { verification_id } = req.params;
    const { code } = req.body;

    await requireOwnedVerification(req, verification_id);

    const result = await verifyPhoneOtp(verification_id, code);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.reason,
      });
    }

    res.json({
      success: true,
      message: 'Phone number verified successfully.',
      phone_verified: true,
    });
  })
);

export default router;
