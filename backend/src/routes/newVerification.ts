import express, { Request, Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import { authenticateAPIKey, authenticateUser, checkSandboxMode } from '@/middleware/auth.js';
import { verificationRateLimit } from '@/middleware/rateLimit.js';
import { catchAsync, ValidationError, FileUploadError } from '@/middleware/errorHandler.js';
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
import { createLivenessProvider } from '@/providers/liveness/index.js';
import { verifyHeadTurnLiveness } from '@/providers/liveness/HeadTurnVerifier.js';
import { HeadTurnLivenessMetadataSchema } from '@/verification/models/headTurnLivenessSchema.js';
import type { HeadTurnLivenessMetadata } from '@/verification/models/headTurnLivenessSchema.js';
import { createAMLProvider } from '@/providers/aml/index.js';
import { computeRiskScore } from '@/services/riskScoring.js';
import { broadcastStatusChange } from '@/services/realtime.js';

import { VerificationSession } from '@/verification/session/VerificationSession.js';
import type { SessionDeps, SessionHydration } from '@/verification/session/VerificationSession.js';
import { VerificationStatus } from '@/verification/models/types.js';
import type { FrontExtractionResult, BackExtractionResult, LiveCaptureResult, SessionState } from '@/verification/models/types.js';
import { computeFaceMatch } from '@/verification/face/faceMatchService.js';
import { SessionFlowError } from '@/verification/exceptions.js';
import { WebhookService } from '@/services/webhook.js';
import type { WebhookPayload, VerificationSource } from '@/types/index.js';
import type { LLMProviderConfig } from '@/providers/ocr/LLMFieldExtractor.js';
import { decryptSecret } from '@/utils/encryption.js';
import { config } from '@/config/index.js';
import sharp from 'sharp';
import { SharpTamperDetector } from '@/providers/tampering/SharpTamperDetector.js';
import { DocumentZoneValidator } from '@/providers/tampering/DocumentZoneValidator.js';
import { createDeepfakeDetector } from '@/providers/deepfake/index.js';
import engineClient from '@/services/engineClient.js';

const router = express.Router();

const storageService = new StorageService();
const verificationService = new VerificationService();
const ocrService = new OCRService();
const barcodeService = new BarcodeService();
const faceRecognitionService = new FaceRecognitionService();
const webhookService = new WebhookService();
const amlProvider = createAMLProvider();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:  10 * 1024 * 1024, // 10 MB for image files
    fieldSize: 10 * 1024 * 1024, // 10 MB for text fields (liveness_metadata contains base64 frames)
  },
});

// ─── Session persistence helpers ──────────────────────────────

/** Save session state to verification_contexts table */
async function saveSessionState(verificationId: string, state: Readonly<SessionState>): Promise<void> {
  // Strip biometric data (GDPR Article 9) — embeddings only needed in-memory for face match
  const sanitized: any = JSON.parse(JSON.stringify(state));
  if (sanitized.front_extraction) sanitized.front_extraction.face_embedding = null;
  if (sanitized.live_capture) sanitized.live_capture.face_embedding = null;

  const context = {
    verification_id: verificationId,
    context: JSON.stringify(sanitized),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from('verification_contexts')
    .upsert(context, { onConflict: 'verification_id' });
}

/** Load session state from verification_contexts table */
async function loadSessionState(verificationId: string): Promise<SessionState | null> {
  const { data } = await supabase
    .from('verification_contexts')
    .select('context')
    .eq('verification_id', verificationId)
    .single();

  if (!data?.context) return null;
  return typeof data.context === 'string' ? JSON.parse(data.context) : data.context;
}

/** Addons that can be requested per-verification */
interface VerificationAddons {
  aml_screening?: boolean;
  address_verification?: boolean;
}

/** Create a VerificationSession with real service deps, optionally hydrated from DB */
function createSession(isSandbox: boolean, hydration?: SessionHydration, addons?: VerificationAddons): VerificationSession {
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
    screenAML: (addons?.aml_screening && amlProvider)
      ? async (fullName, dob, nationality) => amlProvider.screen({ full_name: fullName, date_of_birth: dob, nationality })
      : undefined,
  };

  return new VerificationSession(deps, hydration);
}

/** Hydrate a session from DB for a given verification ID */
async function hydrateSession(verificationId: string, isSandbox: boolean): Promise<VerificationSession> {
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
    aml_screening: (savedState as any).aml_screening ?? null,
    created_at: savedState.created_at,
    completed_at: savedState.completed_at,
  } : {
    session_id: verificationId,
  };

  // Read addons from the verification_requests row to preserve per-request flags
  let addons: VerificationAddons | undefined;
  const { data: row } = await supabase
    .from('verification_requests')
    .select('addons')
    .eq('id', verificationId)
    .single();
  if (row?.addons && typeof row.addons === 'object') {
    addons = row.addons as VerificationAddons;
  }

  return createSession(isSandbox, hydration, addons);
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
  } : (barcodeData?.parsed_data ? {
    first_name: barcodeData.parsed_data.first_name || '',
    last_name: barcodeData.parsed_data.last_name || '',
    full_name: [barcodeData.parsed_data.first_name, barcodeData.parsed_data.last_name].filter(Boolean).join(' '),
    date_of_birth: barcodeData.parsed_data.date_of_birth || '',
    id_number: barcodeData.parsed_data.id_number || '',
    expiry_date: barcodeData.parsed_data.expiry_date || '',
    nationality: '',
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

/** Map new 10-state VerificationStatus to old response format */
function mapStatusForResponse(state: Readonly<SessionState>): {
  status: string;
  current_step: number;
  total_steps: number;
  final_result: string | null;
} {
  const stepMap: Record<string, number> = {
    AWAITING_FRONT: 1,
    FRONT_PROCESSING: 1,
    AWAITING_BACK: 2,
    BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    AWAITING_LIVE: 4,
    LIVE_PROCESSING: 4,
    FACE_MATCHING: 5,
    COMPLETE: 5,
    HARD_REJECTED: 0,
  };

  let finalResult: string | null = null;
  if (state.current_step === VerificationStatus.COMPLETE) {
    finalResult = state.cross_validation?.verdict === 'REVIEW' ? 'manual_review' : 'verified';
  } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
    finalResult = 'failed';
  }

  return {
    status: state.current_step,
    current_step: stepMap[state.current_step] ?? 0,
    total_steps: 5,
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
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
    body('sandbox').optional().isBoolean().withMessage('Sandbox must be a boolean'),
    body('source').optional().isIn(['api', 'vaas', 'demo']).withMessage('Source must be api, vaas, or demo'),
    body('addons').optional().isObject().withMessage('Addons must be an object'),
    body('addons.aml_screening').optional().isBoolean().withMessage('aml_screening must be a boolean'),
    body('addons.address_verification').optional().isBoolean().withMessage('address_verification must be a boolean'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { user_id, document_type = 'drivers_license', issuing_country } = req.body;
    const addons: VerificationAddons = req.body.addons || {};
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

    // Create DB record with source tag
    const verificationRecord = await verificationService.createVerificationRequest({
      user_id,
      developer_id: developerId,
      is_sandbox: isSandbox,
      source,
      addons: Object.keys(addons).length > 0 ? addons as Record<string, unknown> : undefined,
    });

    // Set session start timestamp for processing-time analytics
    await supabase.from('verification_requests').update({
      session_started_at: new Date().toISOString(),
    }).eq('id', verificationRecord.id);

    // Create session and save initial state
    const issuingCountryUpper = issuing_country?.toUpperCase() || null;
    const session = createSession(isSandbox, { session_id: verificationRecord.id, issuing_country: issuingCountryUpper }, addons);
    await saveSessionState(verificationRecord.id, session.getState());

    logVerificationEvent('verification_initialized', verificationRecord.id, {
      userId: user_id,
      documentType: document_type,
      developerId,
      sandbox: isSandbox,
    });

    const mapped = mapStatusForResponse(session.getState());

    res.status(201).json({
      success: true,
      verification_id: verificationRecord.id,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      message: 'Verification initialized successfully - ready to upload front document',
    });

    // Fire verification.started webhook (after response is sent)
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
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    if (!req.file) {
      throw new FileUploadError('Document file is required');
    }

    const frontFileTypeCheck = await validateFileType(req.file.buffer);
    if (!frontFileTypeCheck.valid) {
      throw new FileUploadError(frontFileTypeCheck.reason || 'Invalid file type');
    }

    const { verification_id } = req.params;
    const { document_type = 'drivers_license', issuing_country } = req.body;
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

    // Ephemeral cleanup: demo files are deleted immediately after extraction
    if (source === 'demo') {
      storageService.deleteFile(documentPath).catch(err =>
        logger.warn('Ephemeral cleanup failed (front)', { documentPath, error: err })
      );
      verificationService.updateDocument(document.id, { file_path: null } as any).catch(() => {});
    }

    // Hydrate session and run Gate 1 via session
    const session = await hydrateSession(verification_id, isSandbox);
    // Override the extractFront dep to return our pre-computed result
    (session as any).deps.extractFront = async () => frontResult;
    const stepResult = await session.submitFront(req.file.buffer);
    await saveSessionState(verification_id, session.getState());

    // Update main DB record
    const dbStatus = stepResult.passed ? 'processing' : 'failed';
    await verificationService.updateVerificationRequest(verification_id, {
      status: dbStatus,
    } as any);

    logVerificationEvent('front_document_processed', verification_id, {
      documentId: document.id,
      documentPath,
      status: session.getState().current_step,
    });

    const mapped = mapStatusForResponse(session.getState());
    const state = session.getState();

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      document_id: document.id,
      ocr_data: state.front_extraction?.ocr ?? null,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      message: !stepResult.passed
        ? stepResult.user_message || 'Front document processing failed'
        : 'Front document processed successfully - ready to upload back document',
    });

    // Broadcast status change via Supabase Realtime (after response is sent)
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

    // Fire webhooks if Gate 1 hard-rejected (after response is sent)
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
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other']).withMessage('Invalid document type'),
    body('issuing_country').optional().isLength({ min: 2, max: 2 }).isAlpha().withMessage('Issuing country must be a 2-letter ISO code'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

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
      const mapped = mapStatusForResponse(preState);
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
    const dbStatus = stepResult.passed ? 'processing' : 'failed';
    await verificationService.updateVerificationRequest(verification_id, {
      status: dbStatus,
    } as any);

    logVerificationEvent('back_document_processed', verification_id, {
      documentId: document.id,
      documentPath,
      status: session.getState().current_step,
    });

    const mapped = mapStatusForResponse(session.getState());
    const state = session.getState();

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      document_id: document.id,
      barcode_data: state.back_extraction?.qr_payload ?? null,
      barcode_extraction_failed: !state.back_extraction?.qr_payload,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      cross_validation_results: state.cross_validation ?? null,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      message: !stepResult.passed
        ? stepResult.user_message || 'Back document processing failed'
        : 'Back document processed and cross-validation passed - ready for live capture',
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
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

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
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

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
      const mapped = mapStatusForResponse(preState);
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

    logVerificationEvent('live_capture_processed', verification_id, {
      selfieId: selfie.id,
      selfiePath,
      status: state.current_step,
      faceMatchPassed: state.face_match?.passed ?? null,
    });

    const mapped = mapStatusForResponse(state);

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      selfie_id: selfie.id,
      face_match_results: state.face_match ?? null,
      liveness_results: {
        liveness_passed: liveResult.liveness_passed,
        liveness_score: liveResult.liveness_score,
        liveness_mode: headTurnMetadata ? 'head_turn' : 'passive',
      },
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
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

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
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { verification_id } = req.params;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;

    const session = await hydrateSession(verification_id, isSandbox);
    const state = session.getState();
    const mapped = mapStatusForResponse(state);

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

    res.json({
      success: true,
      verification_id,
      status: mapped.status,
      current_step: mapped.current_step,
      total_steps: mapped.total_steps,
      front_document_uploaded: !!state.front_extraction,
      back_document_uploaded: !!state.back_extraction,
      live_capture_uploaded: !!state.face_match,
      ocr_data: state.front_extraction?.ocr ?? null,
      barcode_data: state.back_extraction?.qr_payload ?? null,
      cross_validation_results: state.cross_validation ?? null,
      face_match_results: state.face_match ?? null,
      liveness_results: state.liveness ?? null,
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

export default router;
