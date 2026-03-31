/**
 * Extraction Routes — Engine Worker
 *
 * Three endpoints that perform the heavy ML extraction work:
 *   POST /extract/front  — OCR + face detection + tamper analysis
 *   POST /extract/back   — Barcode/PDF417 + MRZ detection
 *   POST /extract/live   — Face detection + liveness + deepfake analysis
 *
 * Each endpoint accepts multipart/form-data with an image file and JSON metadata.
 * Returns typed extraction results matching the backend's type contracts.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { logger } from '@/utils/logger.js';
import { OCRService } from '@/services/ocr.js';
import { BarcodeService } from '@/services/barcode.js';
import { FaceRecognitionService } from '@/services/faceRecognition.js';
import { extractMRZFromText, alpha3ToAlpha2 } from '@/services/mrz.js';
import {
  createLivenessProvider, verifyHeadTurnLiveness,
  HeadTurnLivenessMetadataSchema,
  SharpTamperDetector, DocumentZoneValidator,
  createDeepfakeDetector,
} from '@idswyft/shared';
import type {
  HeadTurnLivenessMetadata,
  FrontExtractionResult, BackExtractionResult, LiveCaptureResult,
  LLMProviderConfig,
} from '@idswyft/shared';
import { getLivenessThresholdSync } from '@/config/verificationThresholds.js';

const router = express.Router();

// ─── Shared service instances ────────────────────────────────────
const ocrService = new OCRService();
const barcodeService = new BarcodeService();
const faceRecognitionService = new FaceRecognitionService();
const livenessProvider = createLivenessProvider();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    fieldSize: 10 * 1024 * 1024, // 10MB for liveness_metadata base64 frames
  },
});

// ─── POST /extract/front ─────────────────────────────────────────

router.post('/front', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required (field: "file")' });
    }

    const imageBuffer = req.file.buffer;
    const documentType = req.body.document_type || 'drivers_license';
    const issuingCountry = req.body.issuing_country || undefined;
    const documentId = req.body.document_id || 'unknown';
    const verificationId = req.body.verification_id || undefined;

    // Parse optional LLM config from JSON body field
    let llmConfig: LLMProviderConfig | undefined;
    if (req.body.llm_config) {
      try {
        llmConfig = typeof req.body.llm_config === 'string'
          ? JSON.parse(req.body.llm_config)
          : req.body.llm_config;
      } catch {
        logger.warn('Invalid llm_config JSON, ignoring');
      }
    }

    // 1. Run OCR on the document buffer
    const ocrData = await ocrService.processDocumentFromBuffer(
      imageBuffer, documentType, issuingCountry, llmConfig,
    );

    // Calculate average confidence
    const confidenceScores = ocrData?.confidence_scores || {};
    const values = Object.values(confidenceScores).filter((v): v is number => typeof v === 'number');
    const avgConfidence = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;

    // 2. Detect face from buffer
    let faceConfidence = 0;
    let faceEmbedding: number[] | null = null;
    let faceBoundingBox: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const faceResult = await faceRecognitionService.detectFaceFromBuffer(imageBuffer);
      if (faceResult) {
        faceConfidence = faceResult.confidence;
        faceEmbedding = Array.from(faceResult.embedding);
        faceBoundingBox = faceResult.boundingBox;
      }
    } catch {
      faceConfidence = 0;
    }

    // 3. MRZ detection on front document
    let mrzFromFront: string[] | null = null;
    let detectedCountry = issuingCountry || null;
    if (ocrData?.raw_text) {
      const mrzResult = extractMRZFromText(ocrData.raw_text);
      if (mrzResult) {
        mrzFromFront = mrzResult.raw_lines;
        if (!ocrData.name && mrzResult.fields.full_name) ocrData.name = mrzResult.fields.full_name;
        if (!ocrData.document_number && mrzResult.fields.document_number) ocrData.document_number = mrzResult.fields.document_number;
        if (!ocrData.date_of_birth && mrzResult.fields.date_of_birth) ocrData.date_of_birth = mrzResult.fields.date_of_birth;
        if (!ocrData.expiration_date && mrzResult.fields.expiry_date) ocrData.expiration_date = mrzResult.fields.expiry_date;
        if (!detectedCountry && mrzResult.fields.issuing_country) {
          detectedCountry = alpha3ToAlpha2(mrzResult.fields.issuing_country) || null;
        }
        if (detectedCountry) ocrData.issuing_country = detectedCountry;
      }
    }

    // 4. Tamper detection + zone validation
    let authenticity: FrontExtractionResult['authenticity'] = undefined;
    try {
      const tamperResult = await new SharpTamperDetector().analyze(imageBuffer);
      authenticity = {
        score: tamperResult.score,
        flags: tamperResult.flags,
        isAuthentic: tamperResult.isAuthentic,
        ganScore: tamperResult.details?.frequency?.ganScore,
      };

      if (faceBoundingBox) {
        const meta = await sharp(imageBuffer).metadata();
        if (meta.width && meta.height) {
          const zoneResult = new DocumentZoneValidator().validate(
            faceBoundingBox, meta.width, meta.height,
            documentType, detectedCountry || 'US',
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

    const result: FrontExtractionResult = {
      ocr: {
        full_name: ocrData?.name || '',
        date_of_birth: ocrData?.date_of_birth || '',
        id_number: ocrData?.document_number || '',
        expiry_date: ocrData?.expiration_date || '',
        nationality: ocrData?.nationality || '',
        issuing_country: detectedCountry || undefined,
        ...ocrData,
      },
      face_embedding: faceEmbedding,
      face_confidence: faceConfidence,
      ocr_confidence: avgConfidence,
      mrz_from_front: mrzFromFront,
      authenticity,
    };

    logger.info('Front extraction complete', {
      elapsedMs: Date.now() - start,
      ocrConfidence: avgConfidence.toFixed(3),
      faceDetected: faceConfidence > 0,
    });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Front extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'Front extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /extract/back ──────────────────────────────────────────

router.post('/back', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required (field: "file")' });
    }

    const imageBuffer = req.file.buffer;

    // 1. Barcode/PDF417 scanning from buffer
    let barcodeData;
    try {
      barcodeData = await barcodeService.scanBackOfIdFromBuffer(imageBuffer);
    } catch {
      barcodeData = null;
    }

    // 2. Build QR payload from barcode data
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

    // 3. MRZ detection from raw OCR text
    const rawText = barcodeData?.raw_text || '';
    const mrzResult = extractMRZFromText(rawText);

    let finalQrPayload = qrPayload;
    let barcodeFormat: 'PDF417' | 'QR_CODE' | 'DATA_MATRIX' | 'CODE_128' | 'MRZ_TD1' | 'MRZ_TD2' | 'MRZ_TD3' | null =
      barcodeData?.pdf417_data ? 'PDF417' : (barcodeData?.barcode_data ? 'QR_CODE' : null);

    if (!qrPayload && mrzResult && mrzResult.fields) {
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
      const mrzFormatMap: Record<string, 'MRZ_TD1' | 'MRZ_TD2' | 'MRZ_TD3'> = {
        TD1: 'MRZ_TD1', TD2: 'MRZ_TD2', TD3: 'MRZ_TD3',
      };
      barcodeFormat = mrzFormatMap[mrzResult.format] || null;
    }

    const hasMrz = mrzResult !== null;
    const mrzForGate = hasMrz ? {
      raw_lines: mrzResult!.raw_lines,
      fields: mrzResult!.fields as any,
      checksums_valid: mrzResult!.check_digits_valid,
    } : (rawText && /[A-Z<]{30,}/.test(rawText) ? {
      raw_lines: rawText.split('\n').filter((l: string) => /^[A-Z0-9<]{30,}$/.test(l.trim())),
      checksums_valid: true,
    } : null);

    const result: BackExtractionResult = {
      qr_payload: finalQrPayload,
      mrz_result: mrzForGate,
      barcode_format: barcodeFormat,
      raw_barcode_data: barcodeData?.pdf417_data?.raw_data || barcodeData?.barcode_data || null,
    };

    logger.info('Back extraction complete', {
      elapsedMs: Date.now() - start,
      hasBarcode: !!finalQrPayload,
      hasMrz,
    });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Back extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'Back extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /extract/live ──────────────────────────────────────────

router.post('/live', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required (field: "file")' });
    }

    const selfieBuffer = req.file.buffer;
    const isSandbox = req.body.is_sandbox === 'true' || req.body.is_sandbox === true;

    // Parse optional head-turn liveness metadata
    let headTurnMetadata: HeadTurnLivenessMetadata | undefined;
    if (req.body.head_turn_metadata) {
      try {
        const raw = typeof req.body.head_turn_metadata === 'string'
          ? JSON.parse(req.body.head_turn_metadata)
          : req.body.head_turn_metadata;
        headTurnMetadata = HeadTurnLivenessMetadataSchema.parse(raw);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: 'Invalid head_turn_metadata',
          message: err instanceof Error ? err.message : 'Validation failed',
        });
      }
    }

    // 1. Detect face from selfie buffer
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

    // 2. Liveness detection: head-turn (active) or passive
    let livenessScore = 0;
    let livenessPassed = false;

    if (headTurnMetadata) {
      try {
        const headTurnResult = await verifyHeadTurnLiveness(headTurnMetadata, faceRecognitionService);
        livenessScore = headTurnResult.score;
        livenessPassed = headTurnResult.passed;
        logger.info('Head-turn liveness verification complete', {
          score: livenessScore.toFixed(3),
          passed: livenessPassed,
          reason: headTurnResult.reason,
        });
      } catch (err) {
        logger.error('Head-turn liveness verifier failed, falling back to passive', { error: err });
      }
    }

    if (!headTurnMetadata || (livenessScore === 0 && !livenessPassed)) {
      try {
        livenessScore = await livenessProvider.assessLiveness({ buffer: selfieBuffer });
        const threshold = getLivenessThresholdSync(isSandbox);
        livenessPassed = livenessScore >= threshold;
        logger.info('Passive liveness assessment complete', {
          provider: livenessProvider.name,
          score: livenessScore.toFixed(3),
          threshold,
          passed: livenessPassed,
        });
      } catch (err) {
        logger.error('Liveness provider failed, defaulting to fail-safe', { error: err });
        livenessScore = 0;
        livenessPassed = false;
      }
    }

    // 3. Deepfake detection (Tier 2 — soft flag)
    let deepfake_check: LiveCaptureResult['deepfake_check'] = undefined;
    try {
      if (faceBBox) {
        const detector = createDeepfakeDetector();
        const crop = await detector.extractFaceCrop(selfieBuffer, faceBBox);
        const dfResult = await detector.detect(crop);
        deepfake_check = dfResult;
        if (dfResult.fakeProbability > 0.80) {
          logger.warn('Deepfake detected in live capture (soft flag)', {
            fakeProbability: dfResult.fakeProbability.toFixed(3),
          });
        }
      }
    } catch (err) {
      logger.warn('Deepfake detection failed (non-blocking)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    const result: LiveCaptureResult = {
      face_embedding: faceEmbedding,
      face_confidence: faceConfidence,
      liveness_passed: livenessPassed,
      liveness_score: livenessScore,
      deepfake_check,
    };

    logger.info('Live extraction complete', {
      elapsedMs: Date.now() - start,
      faceDetected: faceConfidence > 0,
      livenessPassed,
    });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Live extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'Live extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
