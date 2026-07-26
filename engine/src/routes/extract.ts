/**
 * Extraction Routes — Engine Worker
 *
 * Six endpoints that perform the heavy ML extraction work:
 *   POST /extract/front        — OCR + face detection + tamper analysis
 *   POST /extract/back         — Barcode/PDF417 + MRZ detection
 *   POST /extract/live         — Face detection + liveness + deepfake analysis
 *   POST /extract/ocr          — OCR-only (address docs, utility bills)
 *   POST /extract/voice-enroll — Speaker embedding extraction (enrollment)
 *   POST /extract/voice-verify — Speaker embedding + digit transcription (verification)
 *
 * Each endpoint accepts multipart/form-data with a file and optional JSON metadata.
 * Returns typed extraction results matching the backend's type contracts.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { logger } from '@/utils/logger.js';
import { OCRService } from '@/services/ocr.js';
import { BarcodeService } from '@/services/barcode.js';
import { FaceRecognitionService } from '@/services/faceRecognition.js';
import { extractMRZFromText, detectMRZInText, alpha3ToAlpha2 } from '@/services/mrz.js';
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
import { decodeAudioToFloat32 } from '@/services/audioDecoder.js';
import { extractSpeakerEmbedding } from '@/services/voiceSpeaker.js';
import { transcribeAudio } from '@/services/voiceRecognition.js';

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

// ─── Orientation handling ────────────────────────────────────────

/**
 * Rank an OCR result so competing page orientations can be compared.
 *
 * Text recognition on a sideways document does not fail loudly — it returns short,
 * garbled fragments. Counting populated fields, a detected MRZ block and the mean
 * per-field confidence separates a correct orientation from a wrong one reliably.
 */
function scoreExtraction(ocr: { [key: string]: any } | null): number {
  if (!ocr) return 0;
  let score = 0;

  for (const field of ['name', 'date_of_birth', 'document_number', 'expiration_date']) {
    if (ocr[field]) score += 2;
  }

  // A well-formed MRZ block is decisive — it only parses at the correct orientation
  if (ocr.raw_text && detectMRZInText(ocr.raw_text)) score += 6;

  const values = Object.values(ocr.confidence_scores || {})
    .filter((v): v is number => typeof v === 'number');
  if (values.length > 0) {
    score += (values.reduce((a, b) => a + b, 0) / values.length) * 3;
  }

  // Text-shape signal — the tie-breaker when no field parses at any orientation.
  // Without it every rotation scores zero and the winner is decided by iteration
  // order rather than by legibility. A correctly oriented page yields many lines of
  // mostly document-like characters; a rotated one yields few lines of noise, and an
  // upside-down one yields mirrored glyphs that fall outside the expected alphabet.
  const text: string = ocr.raw_text || '';
  if (text.length > 0) {
    const lines = text.split('\n').filter(l => l.trim().length > 2);
    const expected = (text.match(/[A-Z0-9<>.,\/ :-]/gi) || []).length;
    score += Math.min(lines.length, 8) * 0.5;
    score += (expected / text.length) * 4;
  }

  return score;
}

// Two populated fields plus a detected MRZ — no need to try further rotations
const ORIENTATION_GOOD_ENOUGH = 8;

interface OrientedExtraction {
  ocr: any;
  buffer: Buffer;
  angle: number;
  score: number;
}

/**
 * Run OCR, correcting page orientation when the image is rotated.
 *
 * EXIF orientation is honoured first, but phone cameras frequently write no such tag,
 * so the upright result is scored and, if weak, the remaining 90° rotations are tried.
 * The winning buffer is returned and reused for face detection and tamper analysis —
 * those fail on a sideways image just as OCR does.
 *
 * Cost: a single OCR pass in the common case thanks to the early exit; at most four
 * on the failure path, which is far cheaper than rejecting a valid document.
 */
async function extractWithOrientation(
  original: Buffer,
  documentType: string,
  issuingCountry: string | undefined,
  llmConfig: LLMProviderConfig | undefined,
): Promise<OrientedExtraction> {
  let base = original;
  try {
    // sharp().rotate() with no argument applies the EXIF orientation tag, if present
    base = await sharp(original).rotate().toBuffer();
  } catch {
    base = original;
  }

  // 270° first among the rotations: portrait photos of landscape documents are the
  // common real-world case and land here.
  const angles = [0, 270, 90, 180];
  let best: OrientedExtraction | null = null;

  for (const angle of angles) {
    let candidate = base;
    if (angle !== 0) {
      try {
        candidate = await sharp(base).rotate(angle).toBuffer();
      } catch {
        continue;
      }
    }

    let ocr: any = null;
    try {
      ocr = await ocrService.processDocumentFromBuffer(candidate, documentType, issuingCountry, llmConfig);
    } catch {
      continue;
    }

    const score = scoreExtraction(ocr);
    if (!best || score > best.score) best = { ocr, buffer: candidate, angle, score };
    if (score >= ORIENTATION_GOOD_ENOUGH) break;
  }

  if (best && best.angle !== 0) {
    logger.info('Corrected document orientation before extraction', {
      rotatedBy: best.angle, score: Number(best.score.toFixed(2)),
    });
  }

  return best ?? { ocr: null, buffer: base, angle: 0, score: 0 };
}

// ─── POST /extract/front ─────────────────────────────────────────

router.post('/front', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required (field: "file")' });
    }

    const documentType = req.body.document_type || 'auto';
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

    // 1. Run OCR, correcting page orientation when the photo is rotated.
    //    The winning buffer is reused below for face detection and tamper analysis.
    const oriented = await extractWithOrientation(req.file.buffer, documentType, issuingCountry, llmConfig);
    const imageBuffer = oriented.buffer;
    const ocrData = oriented.ocr;

    // NOTE: average confidence is computed further below, after MRZ enrichment —
    // MRZ-sourced fields contribute their own scores and must be counted.

    // 2. Detect face from buffer
    let faceConfidence = 0;
    let faceEmbedding: number[] | null = null;
    let faceBoundingBox: { x: number; y: number; width: number; height: number } | null = null;
    let faceAge: number | undefined;
    let faceGender: string | undefined;
    try {
      const faceResult = await faceRecognitionService.detectFaceFromBuffer(imageBuffer);
      if (faceResult) {
        faceConfidence = faceResult.confidence;
        faceEmbedding = Array.from(faceResult.embedding);
        faceBoundingBox = faceResult.boundingBox;
        faceAge = faceResult.age;
        faceGender = faceResult.gender;
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

        // A MRZ whose check digits validate is the most trustworthy source in the
        // pipeline — it is checksum-protected, unlike free-text OCR. Fields taken from
        // it must carry a matching confidence, otherwise they leave confidence_scores
        // empty and the downstream average collapses to its 0.5 fallback, which sits
        // below Gate 1's minimum and rejects an otherwise perfect read.
        const mrzConfidence = mrzResult.check_digits_valid ? 0.99 : 0.75;
        ocrData.confidence_scores = ocrData.confidence_scores || {};
        const takeFromMRZ = (key: string, value: string | null | undefined): boolean => {
          if (!value) return false;
          ocrData.confidence_scores![key] = mrzConfidence;
          return true;
        };

        if (!ocrData.name && takeFromMRZ('name', mrzResult.fields.full_name)) {
          ocrData.name = mrzResult.fields.full_name!;
        }
        if (!ocrData.document_number && takeFromMRZ('document_number', mrzResult.fields.document_number)) {
          ocrData.document_number = mrzResult.fields.document_number!;
        }
        if (!ocrData.date_of_birth && takeFromMRZ('date_of_birth', mrzResult.fields.date_of_birth)) {
          ocrData.date_of_birth = mrzResult.fields.date_of_birth!;
        }
        if (!ocrData.expiration_date && takeFromMRZ('expiration_date', mrzResult.fields.expiry_date)) {
          ocrData.expiration_date = mrzResult.fields.expiry_date!;
        }
        if (!detectedCountry && mrzResult.fields.issuing_country) {
          detectedCountry = alpha3ToAlpha2(mrzResult.fields.issuing_country) || null;
        }
        if (detectedCountry) ocrData.issuing_country = detectedCountry;

        logger.info('MRZ enrichment applied', {
          checkDigitsValid: mrzResult.check_digits_valid,
          format: mrzResult.format,
          confidence: mrzConfidence,
        });
      }
    }

    // Calculate average confidence — after MRZ enrichment, so MRZ-sourced fields count
    const confidenceScores = ocrData?.confidence_scores || {};
    const values = Object.values(confidenceScores).filter((v): v is number => typeof v === 'number');
    const avgConfidence = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;

    // Resolve document type: use auto-classified type if available, otherwise raw input
    const resolvedDocType = ocrData?.detected_document_type || documentType;

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
            resolvedDocType, detectedCountry || 'US',
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
      face_age: faceAge,
      face_gender: faceGender,
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
    let liveFaceAge: number | undefined;
    let liveFaceGender: string | undefined;
    try {
      const faceResult = await faceRecognitionService.detectFaceFromBuffer(selfieBuffer);
      if (faceResult) {
        faceConfidence = faceResult.confidence;
        faceEmbedding = Array.from(faceResult.embedding);
        faceBBox = faceResult.boundingBox;
        liveFaceAge = faceResult.age;
        liveFaceGender = faceResult.gender;
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
      face_age: liveFaceAge,
      face_gender: liveFaceGender,
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

// ─── POST /extract/ocr ──────────────────────────────────────────
// Lightweight OCR-only extraction (no face detection, tamper analysis, or MRZ parsing).
// Used by address verification and other utility document flows.

router.post('/ocr', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required (field: "file")' });
    }

    const documentType = req.body.document_type || 'auto';
    const ocrData = await ocrService.processDocumentFromBuffer(req.file.buffer, documentType);

    logger.info('OCR-only extraction complete', { elapsedMs: Date.now() - start, documentType });
    res.json({ success: true, result: ocrData });
  } catch (error) {
    logger.error('OCR-only extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'OCR extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /extract/voice-enroll ─────────────────────────────────
// Extracts a speaker embedding from audio for enrollment.
// Returns { speaker_embedding: number[], embedding_dimension: number }

router.post('/voice-enroll', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required (field: "file")' });
    }

    const mimeType = req.file.mimetype || 'audio/webm';
    const samples = await decodeAudioToFloat32(req.file.buffer, mimeType);
    const embedding = extractSpeakerEmbedding(samples);

    logger.info('Voice enrollment extraction complete', {
      elapsedMs: Date.now() - start,
      embeddingDim: embedding.length,
    });

    res.json({
      success: true,
      result: {
        speaker_embedding: embedding,
        embedding_dimension: embedding.length,
      },
    });
  } catch (error) {
    logger.error('Voice enrollment extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'Voice enrollment extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /extract/voice-verify ─────────────────────────────────
// Extracts speaker embedding AND transcribes spoken digits.
// Returns { speaker_embedding, embedding_dimension, transcription }

router.post('/voice-verify', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required (field: "file")' });
    }

    const mimeType = req.file.mimetype || 'audio/webm';
    const samples = await decodeAudioToFloat32(req.file.buffer, mimeType);

    // Both operations use the same decoded audio — run sequentially
    // (sherpa-onnx native calls are synchronous on the main thread)
    const embedding = extractSpeakerEmbedding(samples);
    const transcription = transcribeAudio(samples);

    logger.info('Voice verification extraction complete', {
      elapsedMs: Date.now() - start,
      embeddingDim: embedding.length,
      transcriptionLength: transcription.length,
    });

    res.json({
      success: true,
      result: {
        speaker_embedding: embedding,
        embedding_dimension: embedding.length,
        transcription,
      },
    });
  } catch (error) {
    logger.error('Voice verification extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    });
    res.status(500).json({
      success: false,
      error: 'Voice verification extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
