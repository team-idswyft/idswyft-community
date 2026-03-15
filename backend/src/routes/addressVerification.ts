/**
 * Address Verification Routes
 *
 * Proof-of-address document upload and validation endpoints.
 * Runs independently of the identity verification pipeline —
 * requires a completed (or in-progress) identity verification
 * to cross-reference the name from the ID document.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { param, body, validationResult } from 'express-validator';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { verificationRateLimit } from '@/middleware/rateLimit.js';
import { catchAsync, ValidationError, FileUploadError } from '@/middleware/errorHandler.js';
import { StorageService } from '@/services/storage.js';
import { VerificationService } from '@/services/verification.js';
import { validateFileType } from '@/middleware/fileValidation.js';
import { logger } from '@/utils/logger.js';
import { supabase } from '@/config/database.js';
import { extractAddressDocument, type AddressDocumentType } from '@/verification/address/addressExtractor.js';
import { validateAddressDocument } from '@/verification/address/addressValidator.js';

const router = express.Router();

const storageService = new StorageService();
const verificationService = new VerificationService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const VALID_ADDRESS_DOC_TYPES: AddressDocumentType[] = ['utility_bill', 'bank_statement', 'tax_document'];

/**
 * POST /api/v2/verify/:verification_id/address-document
 * Upload a proof-of-address document for verification.
 */
router.post(
  '/:verification_id/address-document',
  authenticateAPIKey,
  verificationRateLimit,
  upload.single('document') as any,
  [
    param('verification_id').isUUID(),
    body('document_type')
      .isIn(VALID_ADDRESS_DOC_TYPES)
      .withMessage(`document_type must be one of: ${VALID_ADDRESS_DOC_TYPES.join(', ')}`),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { verification_id } = req.params;
    const documentType = req.body.document_type as AddressDocumentType;
    const file = req.file;

    if (!file) {
      throw new FileUploadError('No document file uploaded');
    }

    // Validate file type (magic bytes)
    const fileTypeCheck = await validateFileType(file.buffer);
    if (!fileTypeCheck.valid) {
      throw new FileUploadError(fileTypeCheck.reason || 'Invalid file type');
    }

    // Look up the verification request
    const { data: verification, error: verError } = await supabase
      .from('verification_requests')
      .select('id, user_id, developer_id, status, is_sandbox')
      .eq('id', verification_id)
      .eq('developer_id', (req as any).developer.id)
      .single();

    if (verError || !verification) {
      return res.status(404).json({
        error: 'Verification not found',
        message: 'Verification request not found or does not belong to this developer',
      });
    }

    // Store the document
    const storedPath = await storageService.storeDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
      verification.is_sandbox,
    );

    // Create document record
    const document = await verificationService.createDocument({
      verification_request_id: verification_id,
      document_type: documentType,
      file_path: storedPath,
      file_name: file.originalname,
      file_size: file.size,
      mime_type: file.mimetype,
    });

    // Extract address data via OCR
    const extraction = await extractAddressDocument(storedPath, document.id, documentType);

    // Get identity name from the verification's front document OCR
    const idName = await getIdNameFromVerification(verification_id);

    // Validate address document against identity
    const validation = validateAddressDocument(extraction, idName || '');

    // Store results
    const { error: updateError } = await supabase
      .from('verification_requests')
      .update({
        address_verification_status: validation.verdict,
        address_data: {
          document_type: documentType,
          document_id: document.id,
          extraction: {
            name: extraction.name,
            address: extraction.address,
            components: extraction.components,
            document_date: extraction.document_date,
            confidence: extraction.confidence,
          },
          validation,
        },
        address_match_score: validation.overall_score,
      })
      .eq('id', verification_id);

    if (updateError) {
      logger.error('Failed to store address verification results', {
        verification_id,
        error: updateError.message,
      });
      throw new Error(`Failed to store address verification results: ${updateError.message}`);
    }

    logger.info('Address document processed', {
      verification_id,
      document_type: documentType,
      verdict: validation.verdict,
      score: validation.overall_score,
    });

    res.json({
      success: true,
      verification_id,
      address_verification: {
        status: validation.verdict,
        score: validation.overall_score,
        name_match_score: validation.name_match_score,
        address: validation.address,
        document_fresh: validation.document_fresh,
        reasons: validation.reasons,
      },
    });
  }),
);

/**
 * GET /api/v2/verify/:verification_id/address-status
 * Get the address verification result for a verification.
 */
router.get(
  '/:verification_id/address-status',
  authenticateAPIKey,
  [param('verification_id').isUUID()],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { verification_id } = req.params;

    const { data: verification, error } = await supabase
      .from('verification_requests')
      .select('id, address_verification_status, address_data, address_match_score')
      .eq('id', verification_id)
      .eq('developer_id', (req as any).developer.id)
      .single();

    if (error || !verification) {
      return res.status(404).json({
        error: 'Verification not found',
        message: 'Verification request not found or does not belong to this developer',
      });
    }

    if (!verification.address_verification_status) {
      return res.json({
        verification_id,
        address_verification: null,
        message: 'No address document has been uploaded for this verification',
      });
    }

    const addressData = verification.address_data as any;

    res.json({
      verification_id,
      address_verification: {
        status: verification.address_verification_status,
        score: verification.address_match_score,
        name_match_score: addressData?.validation?.name_match_score ?? null,
        address: addressData?.validation?.address ?? null,
        document_type: addressData?.document_type ?? null,
        document_fresh: addressData?.validation?.document_fresh ?? null,
        reasons: addressData?.validation?.reasons ?? [],
      },
    });
  }),
);

// ─── Helpers ─────────────────────────────────────────────

/**
 * Get the name from the identity document's front OCR data.
 */
async function getIdNameFromVerification(verificationId: string): Promise<string | null> {
  // Try verification_contexts first (session state has the OCR data)
  const { data: ctx } = await supabase
    .from('verification_contexts')
    .select('context')
    .eq('verification_id', verificationId)
    .single();

  if (ctx?.context) {
    const state = ctx.context as any;
    const ocr = state.front_extraction?.ocr;
    if (ocr?.name) return ocr.name;
  }

  // Fallback: query front document's OCR data directly.
  // Exclude address document types so we only get identity documents.
  const { data: doc } = await supabase
    .from('documents')
    .select('ocr_data')
    .eq('verification_request_id', verificationId)
    .eq('is_back_of_id', false)
    .not('document_type', 'in', '("utility_bill","bank_statement","tax_document")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (doc?.ocr_data) {
    const ocrData = doc.ocr_data as any;
    return ocrData.name || null;
  }

  return null;
}

export default router;
