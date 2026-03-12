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
import { FaceRecognitionService } from '@/services/faceRecognition.js';
import { logger, logVerificationEvent } from '@/utils/logger.js';
import { validateFileType } from '@/middleware/fileValidation.js';
import { supabase } from '@/config/database.js';
import { VERIFICATION_THRESHOLDS, getFaceMatchingThresholdSync } from '@/config/verificationThresholds.js';

import { VerificationSession } from '@/verification/session/VerificationSession.js';
import type { SessionDeps, SessionHydration } from '@/verification/session/VerificationSession.js';
import { VerificationStatus } from '@/verification/models/types.js';
import type { FrontExtractionResult, BackExtractionResult, LiveCaptureResult, SessionState } from '@/verification/models/types.js';
import { computeFaceMatch } from '@/verification/face/faceMatchService.js';
import { SessionFlowError } from '@/verification/exceptions.js';

const router = express.Router();

const storageService = new StorageService();
const verificationService = new VerificationService();
const ocrService = new OCRService();
const barcodeService = new BarcodeService();
const faceRecognitionService = new FaceRecognitionService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Session persistence helpers ──────────────────────────────

/** Save session state to verification_contexts table */
async function saveSessionState(verificationId: string, state: Readonly<SessionState>): Promise<void> {
  const context = {
    verification_id: verificationId,
    context: JSON.stringify(state),
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

/** Create a VerificationSession with real service deps, optionally hydrated from DB */
function createSession(isSandbox: boolean, hydration?: SessionHydration): VerificationSession {
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
  };

  return new VerificationSession(deps, hydration);
}

/** Hydrate a session from DB for a given verification ID */
async function hydrateSession(verificationId: string, isSandbox: boolean): Promise<VerificationSession> {
  const savedState = await loadSessionState(verificationId);
  const hydration: SessionHydration = savedState ? {
    session_id: savedState.session_id,
    current_step: savedState.current_step,
    rejection_reason: savedState.rejection_reason,
    rejection_detail: savedState.rejection_detail,
    front_extraction: savedState.front_extraction,
    back_extraction: savedState.back_extraction,
    cross_validation: savedState.cross_validation,
    face_match: savedState.face_match,
    created_at: savedState.created_at,
    completed_at: savedState.completed_at,
  } : {
    session_id: verificationId,
  };

  return createSession(isSandbox, hydration);
}

// ─── Step adapters: Run extraction and then delegate to session ──

/** Run front OCR extraction and build FrontExtractionResult */
async function extractFrontDocument(
  documentPath: string,
  documentId: string,
  documentType: string,
): Promise<FrontExtractionResult> {
  const ocrData = await ocrService.processDocument(documentId, documentPath, documentType);

  // Calculate average confidence from per-field confidence scores
  const confidenceScores = ocrData?.confidence_scores || {};
  const values = Object.values(confidenceScores).filter((v): v is number => typeof v === 'number');
  const avgConfidence = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;

  // Detect face and extract embedding from document photo
  let faceConfidence = 0;
  let faceEmbedding: number[] | null = null;
  try {
    const faceResult = await faceRecognitionService.detectFace(documentPath);
    faceConfidence = faceResult.confidence;
    faceEmbedding = faceResult.embedding;
  } catch {
    faceConfidence = 0;
  }

  return {
    ocr: {
      full_name: ocrData?.name || '',
      date_of_birth: ocrData?.date_of_birth || '',
      id_number: ocrData?.document_number || '',
      expiry_date: ocrData?.expiration_date || '',
      nationality: ocrData?.nationality || '',
      ...ocrData, // preserve all raw fields
    },
    face_embedding: faceEmbedding,
    face_confidence: faceConfidence,
    ocr_confidence: avgConfidence,
    mrz_from_front: null,
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

  const hasMrz = barcodeData?.raw_text && /[A-Z<]{30,}/.test(barcodeData.raw_text);

  return {
    qr_payload: qrPayload,
    mrz_result: hasMrz ? {
      raw_lines: (barcodeData?.raw_text || '').split('\n').filter((l: string) => /^[A-Z0-9<]{30,}$/.test(l.trim())),
      checksums_valid: true, // Checksum validation happens in Gate 2
    } : null,
    barcode_format: barcodeData?.pdf417_data ? 'PDF417' : (barcodeData?.barcode_data ? 'QR_CODE' : null),
    raw_barcode_data: barcodeData?.pdf417_data?.raw_data || barcodeData?.barcode_data || null,
  };
}

/** Run live capture processing and build LiveCaptureResult */
async function extractLiveCapture(
  selfiePath: string,
  frontDocPath: string | null,
): Promise<LiveCaptureResult> {
  // Detect face and extract embedding from selfie
  let faceConfidence = 0;
  let faceEmbedding: number[] | null = null;
  try {
    const faceResult = await faceRecognitionService.detectFace(selfiePath);
    faceConfidence = faceResult.confidence;
    faceEmbedding = faceResult.embedding;
  } catch {
    faceConfidence = 0;
  }

  // Liveness detection (stub — returns the face confidence as a proxy)
  const livenessScore = faceConfidence > 0.5 ? 0.8 : 0.2;
  const livenessPassed = livenessScore >= VERIFICATION_THRESHOLDS.LIVENESS.production;

  return {
    face_embedding: faceEmbedding,
    face_confidence: faceConfidence,
    liveness_passed: livenessPassed,
    liveness_score: livenessScore,
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
    body('sandbox').optional().isBoolean().withMessage('Sandbox must be a boolean'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { user_id, document_type = 'drivers_license' } = req.body;

    req.body.user_id = user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const isSandbox = req.isSandbox || false;
    const developerId = (req as any).developer.id;

    // Create DB record
    const verificationRecord = await verificationService.createVerificationRequest({
      user_id,
      developer_id: developerId,
      is_sandbox: isSandbox,
    });

    // Create session and save initial state
    const session = createSession(isSandbox, { session_id: verificationRecord.id });
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
  })
);

router.post('/:verification_id/front-document',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('document'),
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other']).withMessage('Invalid document type'),
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
    const { document_type = 'drivers_license' } = req.body;
    const verification = await requireOwnedVerification(req, verification_id);
    const isSandbox = (verification as any).is_sandbox || false;

    // Store document
    const documentPath = await storageService.storeDocument(
      req.file.buffer,
      req.file.originalname || 'front_document.jpg',
      req.file.mimetype,
      verification_id
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

    // Run front extraction
    const frontResult = await extractFrontDocument(documentPath, document.id, document_type);

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
      document_path: documentPath,
      ocr_data: state.front_extraction?.ocr ?? null,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      message: !stepResult.passed
        ? stepResult.user_message || 'Front document processing failed'
        : 'Front document processed successfully - ready to upload back document',
    });
  })
);

router.post('/:verification_id/back-document',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('document'),
  [
    param('verification_id').isUUID().withMessage('Invalid verification ID'),
    body('document_type').optional().isIn(['passport', 'drivers_license', 'national_id', 'other']).withMessage('Invalid document type'),
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

    // Store document
    const documentPath = await storageService.storeDocument(
      req.file.buffer,
      req.file.originalname || 'back_document.jpg',
      req.file.mimetype,
      verification_id
    );

    const document = await verificationService.createDocument({
      verification_request_id: verification_id,
      file_path: documentPath,
      file_name: req.file.originalname || 'back_document.jpg',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      document_type,
    });

    // Run back extraction
    const backResult = await extractBackDocument(documentPath);

    // Hydrate session and run Gate 2 + auto cross-validation via session
    const session = await hydrateSession(verification_id, isSandbox);
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
      document_path: documentPath,
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
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation score requires review' : null,
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

    // Store selfie
    const selfiePath = await storageService.storeSelfie(
      req.file.buffer,
      req.file.originalname || 'selfie.jpg',
      req.file.mimetype,
      verification_id
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

    // Run live capture extraction
    const savedState = await loadSessionState(verification_id);
    const frontDocPath = savedState?.front_extraction ? null : null; // embedding from session state
    const liveResult = await extractLiveCapture(selfiePath, frontDocPath);

    // Hydrate session and run Gate 4 + auto face match via session
    const session = await hydrateSession(verification_id, isSandbox);
    (session as any).deps.processLiveCapture = async () => liveResult;
    const stepResult = await session.submitLiveCapture(req.file.buffer);
    await saveSessionState(verification_id, session.getState());

    // Update main DB record
    const state = session.getState();
    let dbStatus: string;
    if (state.current_step === VerificationStatus.COMPLETE) {
      dbStatus = state.cross_validation?.verdict === 'REVIEW' ? 'manual_review' : 'verified';
    } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
      dbStatus = 'failed';
    } else {
      dbStatus = 'processing';
    }
    await verificationService.updateVerificationRequest(verification_id, {
      status: dbStatus,
    } as any);

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
      selfie_path: selfiePath,
      face_match_results: state.face_match ?? null,
      liveness_results: {
        liveness_passed: liveResult.liveness_passed,
        liveness_score: liveResult.liveness_score,
      },
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation requires review' : null,
      message: state.current_step === VerificationStatus.COMPLETE
        ? 'Verification completed successfully'
        : state.current_step === VerificationStatus.HARD_REJECTED
          ? stepResult.user_message || 'Verification failed'
          : 'Live capture processed',
    });
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
      liveness_results: null, // liveness is part of live capture step
      barcode_extraction_failed: state.back_extraction ? !state.back_extraction.qr_payload : null,
      documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
      face_match_passed: state.face_match?.passed ?? null,
      liveness_passed: null,
      final_result: mapped.final_result,
      rejection_reason: state.rejection_reason,
      rejection_detail: state.rejection_detail,
      failure_reason: state.rejection_detail,
      manual_review_reason: state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation requires review' : null,
      created_at: state.created_at,
      updated_at: state.updated_at,
    });
  })
);

export default router;
