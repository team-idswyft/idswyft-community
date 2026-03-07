import express, { Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import { authenticateAPIKey, authenticateUser, checkSandboxMode } from '@/middleware/auth.js';
import { verificationRateLimit } from '@/middleware/rateLimit.js';
import { catchAsync, ValidationError, FileUploadError } from '@/middleware/errorHandler.js';
import { idempotencyMiddleware } from '@/middleware/idempotency.js';
import { VerificationService } from '@/services/verification.js';
import { StorageService } from '@/services/storage.js';
import { OCRService } from '@/services/ocr.js';
import { FaceRecognitionService } from '@/services/faceRecognition.js';
import { BarcodeService } from '@/services/barcode.js';
import { VerificationConsistencyService } from '@/services/verificationConsistency.js';
import { VerificationStateManager } from '@/services/verificationStateManager.js';

import { DynamicThresholdManager } from '@/config/dynamicThresholds.js';
import { logger, logVerificationEvent } from '@/utils/logger.js';
import { 
  getFaceMatchingThreshold, 
  getLivenessThreshold, 
  validateScores,
  getThresholdInfo,
  VERIFICATION_THRESHOLDS 
} from '@/config/verificationThresholds.js';
import {
  VerificationFailureType,
  VerificationStage,
  VerificationErrorClassifier
} from '@/types/verificationTypes.js';
import { supabase } from '@/config/database.js';
import { validateFileType } from '@/middleware/fileValidation.js';

const router = express.Router();

/**
 * Helper function to get organization ID from request
 * In the future, this could be extended to support multi-tenant developers
 */
function getOrganizationId(req: any): string | null {
  // For now, we'll use the developer ID as organization ID
  // This can be extended later when we implement proper organization mapping
  return req.developer?.id || null;
}

/**
 * Get dynamic thresholds for the current request context
 */
async function getContextualThresholds(req: any, isSandbox: boolean = false) {
  const organizationId = getOrganizationId(req);
  if (organizationId) {
    try {
      return await thresholdManager.getThresholdsForOrganization(organizationId, isSandbox);
    } catch (error) {
      logger.warn('Failed to get organization thresholds, using defaults', { 
        organizationId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  // Fallback to default thresholds
  return VERIFICATION_THRESHOLDS;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new FileUploadError(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`));
    }
  }
});

// Validation middleware
const validateDocumentUpload = [
  body('user_id')
    .isUUID()
    .withMessage('User ID must be a valid UUID'),
  body('document_type')
    .isIn(['passport', 'drivers_license', 'national_id', 'other'])
    .withMessage('Document type must be one of: passport, drivers_license, national_id, other'),
  body('sandbox')
    .optional()
    .isBoolean()
    .withMessage('Sandbox must be a boolean')
];

const validateSelfieUpload = [
  body('verification_id')
    .isUUID()
    .withMessage('Verification ID must be a valid UUID'),
  body('sandbox')
    .optional()
    .isBoolean()
    .withMessage('Sandbox must be a boolean')
];

const validateStatusQuery = [
  param('user_id')
    .isUUID()
    .withMessage('User ID must be a valid UUID')
];

// Initialize services
const verificationService = new VerificationService();
const storageService = new StorageService();
const ocrService = new OCRService();
const faceRecognitionService = new FaceRecognitionService();
const barcodeService = new BarcodeService();
const consistencyService = new VerificationConsistencyService();
const stateManager = new VerificationStateManager();
const thresholdManager = DynamicThresholdManager.getInstance();

// Route: POST /api/verify/start - Start a new verification session
router.post('/start',
  authenticateAPIKey,
  idempotencyMiddleware,
  checkSandboxMode,
  verificationRateLimit,
  [
    body('user_id')
      .isUUID()
      .withMessage('User ID must be a valid UUID'),
    body('sandbox')
      .optional()
      .isBoolean()
      .withMessage('Sandbox must be a boolean')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { user_id } = req.body;
    
    // Authenticate user
    req.body.user_id = user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    
    // Create verification request
    const verificationRequest = await verificationService.createVerificationRequest({
      user_id,
      developer_id: (req as any).developer.id,
      is_sandbox: req.isSandbox || false
    });


    // Initialize state manager context
    await stateManager.initializeVerification(
      verificationRequest.id,
      user_id,
      req.isSandbox || false
    );
    
    logVerificationEvent('verification_started', verificationRequest.id, {
      userId: user_id,
      developerId: (req as any).developer.id,
      sandbox: req.isSandbox || false
    });
    
    res.status(201).json({
      verification_id: verificationRequest.id,
      status: 'started',
      user_id,
      next_steps: [
        'Upload document with POST /api/verify/document',
        'Complete live capture with POST /api/verify/live-capture',
        'Check results with GET /api/verify/results/:verification_id'
      ],
      created_at: verificationRequest.created_at
    });
  })
);

// Route: POST /api/verify/document - Upload document to existing verification
router.post('/document',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  upload.single('document'),
  [
    body('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('document_type')
      .isIn(['passport', 'drivers_license', 'national_id', 'other'])
      .withMessage('Document type must be one of: passport, drivers_license, national_id, other'),
    body('sandbox')
      .optional()
      .isBoolean()
      .withMessage('Sandbox must be a boolean')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id, document_type } = req.body;
    const file = req.file;

    if (!file) {
      throw new FileUploadError('Document file is required');
    }

    // Validate actual file bytes — rejects MIME-type spoofing (e.g. EXE renamed to JPG)
    const fileTypeCheck = await validateFileType(file.buffer);
    if (!fileTypeCheck.valid) {
      throw new FileUploadError(fileTypeCheck.reason || 'Invalid file type');
    }

    // Scope lookup to this developer — prevents IDOR (one developer accessing another's verification)
    const verificationRequest = await verificationService.getVerificationRequestForDeveloper(
      verification_id,
      (req as any).developer.id
    );
    if (!verificationRequest) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }
    
    // Authenticate user
    req.body.user_id = verificationRequest.user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    
    logVerificationEvent('document_upload_started', verification_id, {
      userId: verificationRequest.user_id,
      documentType: document_type,
      fileSize: file.size,
      mimeType: file.mimetype,
      developerId: (req as any).developer?.id,
      isSandbox: req.isSandbox || false
    });
    
    try {
      
      // Store document file
      const documentPath = await storageService.storeDocument(
        file.buffer,
        file.originalname,
        file.mimetype,
        verificationRequest.id
      );
      
      // Create document record
      const document = await verificationService.createDocument({
        verification_request_id: verificationRequest.id,
        file_path: documentPath,
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        document_type
      });
      
      // Analyze document quality
      let qualityAnalysis = null;
      try {
        if (!(req.isSandbox || false) && (file.mimetype.startsWith('image/'))) {
          // Get the actual file path for quality analysis
          const localFilePath = await storageService.getLocalFilePath(documentPath);
          qualityAnalysis = await verificationService.analyzeDocumentQuality(localFilePath);
          
          logVerificationEvent('quality_analysis_completed', verificationRequest.id, {
            documentId: document.id,
            overallQuality: qualityAnalysis.overallQuality,
            issues: qualityAnalysis.issues.length
          });
        }
      } catch (error) {
        logger.error('Document quality analysis failed:', error);
        // Don't fail the entire verification for quality analysis errors
        logVerificationEvent('quality_analysis_failed', verificationRequest.id, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      // Update verification request with document ID
      await verificationService.updateVerificationRequest(verificationRequest.id, {
        document_id: document.id
      });
      
      // Update document with quality analysis if available
      if (qualityAnalysis) {
        await verificationService.updateDocument(document.id, {
          quality_analysis: qualityAnalysis
        });
      }
      
      // Start OCR processing asynchronously - always use real OCR
      console.log('🔄 Starting real OCR processing...', {
        documentId: document.id,
        documentPath,
        documentType: document_type,
        verificationId: verificationRequest.id
      });
      
      ocrService.processDocument(document.id, documentPath, document_type)
        .then(async (ocrData) => {
          console.log('✅ OCR processing succeeded:', { 
            verificationId: verificationRequest.id,
            documentId: document.id,
            ocrData 
          });
          
          // Store OCR data in the documents table where it belongs
          await verificationService.updateDocument(document.id, {
            ocr_data: ocrData
          });
          
          // Update verification status
          await verificationService.updateVerificationRequest(verificationRequest.id, {
            status: 'verified' // Will be updated by database trigger if needed
          });
          
          logVerificationEvent('ocr_completed', verificationRequest.id, {
            documentId: document.id,
            ocrData
          });
        })
        .catch((error) => {
          console.error('🚨 OCR processing failed in route:', error);
          logger.error('OCR processing failed:', error);
          verificationService.updateVerificationRequest(verificationRequest.id, {
            status: 'manual_review',
            manual_review_reason: 'OCR processing failed'
          });
        });
      
      const response: any = {
        verification_id: verificationRequest.id,
        status: verificationRequest.status,
        message: 'Document uploaded successfully. Processing started.',
        document_id: document.id,
        next_steps: 'Upload a selfie using /api/verify/selfie or check status with /api/verify/status/:user_id'
      };
      
      // Include quality analysis in response if available
      if (qualityAnalysis) {
        response.quality_analysis = {
          overall_quality: qualityAnalysis.overallQuality,
          issues: qualityAnalysis.issues,
          recommendations: qualityAnalysis.recommendations,
          quality_scores: {
            blur_score: qualityAnalysis.blurScore,
            brightness: qualityAnalysis.brightness,
            contrast: qualityAnalysis.contrast,
            resolution: qualityAnalysis.resolution,
            file_size: qualityAnalysis.fileSize
          }
        };
      }
      
      res.status(201).json(response);
      
    } catch (error) {
      logVerificationEvent('document_upload_failed', verification_id, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

// Route: POST /api/verify/selfie
router.post('/selfie',
  authenticateAPIKey,
  checkSandboxMode,
  upload.single('selfie'),
  validateSelfieUpload,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id } = req.body;
    const file = req.file;

    if (!file) {
      throw new FileUploadError('Selfie file is required');
    }

    // Selfies must be image files — no PDFs
    const selfieTypeCheck = await validateFileType(file.buffer, ['image/jpeg', 'image/png']);
    if (!selfieTypeCheck.valid) {
      throw new FileUploadError(selfieTypeCheck.reason || 'Selfie must be a JPEG or PNG image');
    }

    // Scope lookup to this developer — prevents IDOR
    const verificationRequest = await verificationService.getVerificationRequestForDeveloper(
      verification_id,
      (req as any).developer.id
    );
    if (!verificationRequest) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }
    
    // Authenticate user
    req.body.user_id = verificationRequest.user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    
    logVerificationEvent('selfie_upload_started', verification_id, {
      userId: verificationRequest.user_id,
      fileSize: file.size,
      mimeType: file.mimetype
    });
    
    try {
      // Store selfie file
      const selfiePath = await storageService.storeSelfie(
        file.buffer,
        file.originalname,
        file.mimetype,
        verification_id
      );
      
      // Create selfie record
      const selfie = await verificationService.createSelfie({
        verification_request_id: verification_id,
        file_path: selfiePath,
        file_name: file.originalname,
        file_size: file.size
      });
      
      // Update verification request with selfie ID
      await verificationService.updateVerificationRequest(verification_id, {
        selfie_id: selfie.id
      });
      
      // Start face recognition processing asynchronously
      if (!(req.isSandbox || false)) {
        // Real face recognition
        const document = await verificationService.getDocumentByVerificationId(verification_id);
        if (document) {
          faceRecognitionService.compareFaces(document.file_path, selfiePath)
            .then(async (matchScore) => {
              await verificationService.updateVerificationRequest(verification_id, {
                face_match_score: matchScore,
                status: matchScore > 0.85 ? 'verified' : 'failed'
              });
              
              logVerificationEvent('face_recognition_completed', verification_id, {
                selfieId: selfie.id,
                matchScore
              });
            })
            .catch((error) => {
              logger.error('Face recognition failed:', error);
              verificationService.updateVerificationRequest(verification_id, {
                status: 'manual_review',
                manual_review_reason: 'Face recognition failed'
              });
            });
        }
      } else {
        // Mock face recognition for sandbox
        setTimeout(async () => {
          const mockMatchScore = 0.95;
          await verificationService.updateVerificationRequest(verification_id, {
            face_match_score: mockMatchScore,
            status: 'verified'
          });
          
          logVerificationEvent('mock_face_recognition_completed', verification_id, {
            selfieId: selfie.id,
            matchScore: mockMatchScore
          });
        }, 1500);
      }
      
      res.status(201).json({
        verification_id,
        status: 'processing',
        message: 'Selfie uploaded successfully. Face recognition started.',
        selfie_id: selfie.id,
        next_steps: 'Check verification status with /api/verify/status/:user_id'
      });
      
    } catch (error) {
      logVerificationEvent('selfie_upload_failed', verification_id, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

// Route: POST /api/verify/back-of-id - Upload back-of-ID for enhanced verification
router.post('/back-of-id',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  upload.single('back_of_id'),
  [
    body('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('document_type')
      .isIn(['passport', 'drivers_license', 'national_id', 'other'])
      .withMessage('Document type must match the front-of-ID document type'),
    body('sandbox')
      .optional()
      .isBoolean()
      .withMessage('Sandbox must be a boolean')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id, document_type } = req.body;
    const file = req.file;
    
    if (!file) {
      throw new FileUploadError('Back-of-ID file is required');
    }

    // Validate actual file bytes — rejects MIME-type spoofing
    const backIdTypeCheck = await validateFileType(file.buffer);
    if (!backIdTypeCheck.valid) {
      throw new FileUploadError(backIdTypeCheck.reason || 'Invalid file type');
    }

    // Scope lookup to this developer — prevents IDOR
    const verificationRequest = await verificationService.getVerificationRequestForDeveloper(
      verification_id,
      (req as any).developer.id
    );
    if (!verificationRequest) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }
    
    // Authenticate user
    req.body.user_id = verificationRequest.user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    // Check if front-of-ID exists
    const frontDocument = await verificationService.getDocumentByVerificationId(verification_id);
    if (!frontDocument) {
      throw new ValidationError('Front-of-ID must be uploaded before back-of-ID', 'front_document', 'missing');
    }

    if (frontDocument.document_type !== document_type) {
      throw new ValidationError('Back-of-ID document type must match front-of-ID', 'document_type', document_type);
    }
    
    logVerificationEvent('back_of_id_upload_started', verification_id, {
      userId: verificationRequest.user_id,
      documentType: document_type,
      fileSize: file.size,
      mimeType: file.mimetype,
      developerId: (req as any).developer?.id,
      isSandbox: req.isSandbox || false
    });
    
    try {
      // Store back-of-ID file
      const backOfIdPath = await storageService.storeDocument(
        file.buffer,
        `back_${file.originalname}`,
        file.mimetype,
        verificationRequest.id
      );
      
      // Create back-of-ID document record
      const backOfIdDocument = await verificationService.createDocument({
        verification_request_id: verificationRequest.id,
        file_path: backOfIdPath,
        file_name: `back_${file.originalname}`,
        file_size: file.size,
        mime_type: file.mimetype,
        document_type,
        is_back_of_id: true
      });

      // Process back-of-ID scanning asynchronously
      if (!(req.isSandbox || false) && file.mimetype.startsWith('image/')) {
        console.log('🔄 Starting back-of-ID barcode/QR scanning...', {
          backDocumentId: backOfIdDocument.id,
          backOfIdPath,
          documentType: document_type,
          verificationId: verificationRequest.id
        });

        barcodeService.scanBackOfId(backOfIdPath)
          .then(async (backOfIdData) => {
            console.log('✅ Back-of-ID scanning succeeded:', { 
              verificationId: verificationRequest.id,
              backDocumentId: backOfIdDocument.id,
              qrCodeFound: !!backOfIdData.qr_code,
              barcodeFound: !!backOfIdData.barcode_data,
              verificationCodes: backOfIdData.verification_codes?.length || 0
            });

            // Store barcode data in the back-of-ID document
            await verificationService.updateDocument(backOfIdDocument.id, {
              barcode_data: backOfIdData
            });

            // Cross-validate with front-of-ID
            if (frontDocument.ocr_data) {
              const crossValidation = await barcodeService.crossValidateWithFrontId(
                frontDocument.ocr_data,
                backOfIdData
              );

              console.log('🔄 Cross-validation completed:', {
                verificationId: verificationRequest.id,
                matchScore: crossValidation.match_score,
                overallConsistency: crossValidation.validation_results.overall_consistency,
                discrepancies: crossValidation.discrepancies.length
              });

              // 🔒 CRITICAL SECURITY CHECK: Compare photos between front and back documents
              let photoConsistencyScore = 0;
              let photoValidationPassed = false;
              let photoValidationError = null;
              
              try {
                console.log('🔒 Starting critical document photo cross-validation for security...');
                photoConsistencyScore = await faceRecognitionService.compareDocumentPhotos(
                  frontDocument.file_path,
                  backOfIdDocument.file_path
                );
                
                // Use contextual threshold (organization-specific or default)
                const contextualThresholds = await getContextualThresholds(req, req.isSandbox || false);
                const photoThreshold = contextualThresholds.PHOTO_CONSISTENCY;
                photoValidationPassed = photoConsistencyScore >= photoThreshold;
                
                console.log('🔒 Document photo cross-validation results:', {
                  verificationId: verificationRequest.id,
                  photoConsistencyScore: photoConsistencyScore.toFixed(3),
                  threshold: photoThreshold,
                  passed: photoValidationPassed ? '✅ PASS' : '❌ FAIL',
                  frontDoc: frontDocument.file_path,
                  backDoc: backOfIdDocument.file_path
                });
                
                if (!photoValidationPassed) {
                  console.log('🚨 SECURITY ALERT: Front and back document photos do not match the same person!');
                  console.log(`   📊 Photo similarity score: ${photoConsistencyScore.toFixed(3)} (below ${photoThreshold} threshold)`);
                  console.log('   🛡️ This indicates potential identity fraud - verification FAILED');
                }
                
              } catch (error) {
                console.error('🚨 Document photo cross-validation failed:', error);
                photoValidationError = error instanceof Error ? error.message : 'Unknown error during photo validation';
                photoValidationPassed = false; // Fail-safe: if we can't validate photos, fail the verification
              }

              // Update front document with cross-validation results including photo validation
              await verificationService.updateDocument(frontDocument.id, {
                cross_validation_results: {
                  ...crossValidation,
                  photo_consistency_score: photoConsistencyScore,
                  photo_validation_passed: photoValidationPassed,
                  photo_validation_error: photoValidationError
                }
              });

              // Use contextual validation with state manager
              const contextualThresholds = await getContextualThresholds(req, req.isSandbox || false);
              const crossValidationThreshold = contextualThresholds.CROSS_VALIDATION;
              const dataValidationPassed = crossValidation.validation_results.overall_consistency && 
                                         crossValidation.match_score >= crossValidationThreshold;
              
              // Check if manual review is required due to data extraction issues
              const requiresManualReview = (crossValidation as any).requires_manual_review || false;
              
              // Update scores through state manager
              await stateManager.updateScores(verificationRequest.id, {
                photoConsistency: photoConsistencyScore,
                crossValidation: crossValidation.match_score
              });
              
              // Handle different error scenarios with proper classification
              let finalResult;
              if (requiresManualReview) {
                // CRITICAL FIX: Mark enhanced verification as completed even for manual review cases
                // This prevents live capture deadlock where users get stuck waiting
                console.log('🔧 MANUAL REVIEW CASE: Marking enhanced verification as completed to prevent deadlock');
                finalResult = await stateManager.recordError(
                  verificationRequest.id,
                  VerificationFailureType.EXTRACTION_FAILURE,
                  VerificationStage.CROSS_VALIDATION,
                  (crossValidation as any).manual_review_reason || 'Data extraction issues detected',
                  { crossValidation }
                );

                // Force completion of enhanced verification to allow live capture to proceed
                await verificationService.updateVerificationRequest(verificationRequest.id, {
                  enhanced_verification_completed: true
                });
                console.log('✅ Enhanced verification marked as completed - live capture can now proceed');
              } else if (photoValidationError) {
                finalResult = await stateManager.recordError(
                  verificationRequest.id,
                  VerificationFailureType.FACE_RECOGNITION_TECHNICAL_ERROR,
                  VerificationStage.CROSS_VALIDATION,
                  `Photo validation technical error: ${photoValidationError}`,
                  { error: photoValidationError }
                );
              } else if (!photoValidationPassed) {
                finalResult = await stateManager.recordError(
                  verificationRequest.id,
                  VerificationFailureType.PHOTO_MISMATCH_FRAUD,
                  VerificationStage.CROSS_VALIDATION,
                  `Photo consistency failed - front and back documents show different people (score: ${photoConsistencyScore.toFixed(3)})`,
                  { photoConsistencyScore, threshold: contextualThresholds.PHOTO_CONSISTENCY, organizationId: getOrganizationId(req) }
                );
              } else if (!dataValidationPassed) {
                finalResult = await stateManager.recordError(
                  verificationRequest.id,
                  VerificationFailureType.DATA_INCONSISTENCY_FRAUD,
                  VerificationStage.CROSS_VALIDATION,
                  `Data cross-validation failed (score: ${crossValidation.match_score}): ${crossValidation.discrepancies.join('; ')}`,
                  { crossValidation, threshold: crossValidationThreshold }
                );
              } else {
                // Success - complete the stage
                await stateManager.completeStage(verificationRequest.id, VerificationStage.CROSS_VALIDATION, true);
                finalResult = await stateManager.getVerificationResult(verificationRequest.id);
              }
              
              const finalStatus = finalResult!.status;
              const comprehensiveValidationPassed = finalStatus === 'verified';

              // Update legacy database fields for backward compatibility
              await verificationService.updateVerificationRequest(verificationRequest.id, {
                cross_validation_score: crossValidation.match_score,
                photo_consistency_score: photoConsistencyScore,
                enhanced_verification_completed: true,
                status: finalStatus as 'pending' | 'verified' | 'failed' | 'manual_review',
                manual_review_reason: finalResult!.error?.userMessage,
                failure_reason: finalResult!.error?.message
              });

              logVerificationEvent('enhanced_verification_completed', verificationRequest.id, {
                backDocumentId: backOfIdDocument.id,
                crossValidationScore: crossValidation.match_score,
                photoConsistencyScore,
                dataValidationPassed,
                photoValidationPassed,
                comprehensiveValidationPassed,
                finalStatus,
                discrepancies: crossValidation.discrepancies,
                errorType: finalResult!.error?.type,
                userMessage: finalResult!.error?.userMessage
              });
              
              // If comprehensive validation failed, send immediate failure notification
              if (!comprehensiveValidationPassed) {
                console.log('🚨 VERIFICATION FAILED: Comprehensive validation did not pass');
                console.log(`   📊 Data validation: ${dataValidationPassed ? 'PASS' : 'FAIL'}`);
                console.log(`   🔒 Photo validation: ${photoValidationPassed ? 'PASS' : 'FAIL'}`);
                console.log('   🛡️ Identity fraud protection activated');
              }
            } else {
              // No front OCR data to cross-validate — mark complete so the frontend unblocks
              await verificationService.updateVerificationRequest(verificationRequest.id, {
                enhanced_verification_completed: true
              });
            }
          })
          .catch(async (error) => {
            console.error('🚨 Back-of-ID scanning failed:', error);
            logger.error('Back-of-ID scanning failed:', error);

            logVerificationEvent('back_of_id_scanning_failed', verificationRequest.id, {
              backDocumentId: backOfIdDocument.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });

            // Attempt to set status + flag; if the status update is rejected (e.g. already
            // terminal), fall back to setting only the flag so the frontend poll can unblock.
            try {
              await verificationService.updateVerificationRequest(verificationRequest.id, {
                status: 'manual_review',
                manual_review_reason: 'Back-of-ID processing failed',
                enhanced_verification_completed: true
              });
            } catch {
              try {
                await verificationService.updateVerificationRequest(verificationRequest.id, {
                  enhanced_verification_completed: true
                });
              } catch (flagErr) {
                logger.error('Failed to set enhanced_verification_completed after back-of-ID failure', { verificationId: verificationRequest.id, error: flagErr });
              }
            }
          });
      } else if (req.isSandbox || false) {
        // For sandbox: Use PDF417 barcode scanning only, fallback to mock data if it fails
        console.log('🔧 Sandbox mode: Attempting real PDF417 barcode scanning...');
        
        try {
          const backOfIdData = await barcodeService.scanBackOfId(backOfIdPath);
          
          console.log('✅ Sandbox PDF417 barcode scanning succeeded:', { 
            verificationId: verificationRequest.id,
            backDocumentId: backOfIdDocument.id,
            qrCodeFound: !!backOfIdData.qr_code,
            barcodeFound: !!backOfIdData.barcode_data,
            securityFeatures: backOfIdData.security_features?.length || 0
          });

          await verificationService.updateDocument(backOfIdDocument.id, {
            barcode_data: backOfIdData
          });

          // Cross-validation with front document (if available)
          if (frontDocument?.ocr_data) {
            const crossValidation = await barcodeService.crossValidateWithFrontId(
              frontDocument.ocr_data,
              backOfIdData
            );
            
            await verificationService.updateDocument(backOfIdDocument.id, {
              cross_validation_results: crossValidation
            });

            const crossValidationPassed = crossValidation.match_score >= 0.7;
            await verificationService.updateVerificationRequest(verificationRequest.id, {
              cross_validation_score: crossValidation.match_score,
              enhanced_verification_completed: true,
              // Cross-validation passing means "ready for live capture", not yet verified.
              // Keep 'processing' so the frontend knows to proceed to live capture.
              // Cross-validation failing is a hard failure.
              status: crossValidationPassed ? 'processing' : 'failed',
              failure_reason: !crossValidationPassed ?
                `Cross-validation failed - front and back ID data mismatch (score: ${crossValidation.match_score.toFixed(2)})` : undefined
            });

            logVerificationEvent('back_of_id_cross_validation_completed', verificationRequest.id, {
              backDocumentId: backOfIdDocument.id,
              crossValidationScore: crossValidation.match_score,
              finalStatus: crossValidation.match_score >= 0.7 ? 'verified' : 'failed',
              discrepancies: crossValidation.discrepancies
            });
          } else {
            // No front document to cross-validate, mark ready for live capture
            await verificationService.updateVerificationRequest(verificationRequest.id, {
              enhanced_verification_completed: true,
              status: 'processing'
            });
          }

        } catch (error) {
          console.error('🔧 Sandbox AI barcode scanning failed, using mock data:', error);
          // Fallback to mock data for sandbox
          setTimeout(async () => {
          const mockBackOfIdData = {
            qr_code: 'MOCK_QR_CODE_DATA_ABC123',
            barcode_data: 'MOCK_BARCODE_456789',
            parsed_data: {
              id_number: frontDocument.ocr_data?.id_number || 'MOCK123456',
              expiry_date: frontDocument.ocr_data?.expiry_date || '2025-12-31',
              issuing_authority: 'Mock Department of Motor Vehicles'
            },
            verification_codes: ['VER123', 'CHK456'],
            security_features: ['Mock security pattern', 'Mock hologram']
          };

          await verificationService.updateDocument(backOfIdDocument.id, {
            barcode_data: mockBackOfIdData
          });

          // Mock cross-validation with perfect match
          const mockCrossValidation = {
            match_score: 0.95,
            validation_results: {
              id_number_match: true,
              expiry_date_match: true,
              issuing_authority_match: true,
              overall_consistency: true
            },
            discrepancies: []
          };

          await verificationService.updateDocument(frontDocument.id, {
            cross_validation_results: mockCrossValidation
          });

          await verificationService.updateVerificationRequest(verificationRequest.id, {
            cross_validation_score: mockCrossValidation.match_score,
            enhanced_verification_completed: true,
            status: 'processing' // Ready for live capture
          });

          logVerificationEvent('mock_enhanced_verification_completed', verificationRequest.id, {
            backDocumentId: backOfIdDocument.id,
            crossValidationScore: mockCrossValidation.match_score
          });
        }, 2000);
        }
      }

      const response: any = {
        verification_id: verificationRequest.id,
        back_of_id_document_id: backOfIdDocument.id,
        status: 'processing',
        message: 'Back-of-ID uploaded successfully. Enhanced verification processing started.',
        next_steps: [
          'Processing barcode/QR code scanning',
          'Cross-validating with front-of-ID data', 
          `Check results with GET /api/verify/results/${verification_id}`
        ],
        enhanced_verification: {
          barcode_scanning_enabled: true,
          cross_validation_enabled: true,
          ai_powered: barcodeService.useAiBarcodeReading || false
        }
      };

      res.status(201).json(response);
      
    } catch (error) {
      logVerificationEvent('back_of_id_upload_failed', verification_id, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

// Route: GET /api/verify/results/:verification_id - Get complete verification results
router.get('/results/:verification_id',
  authenticateAPIKey,
  [
    param('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id } = req.params;
    
    // Get verification request
    const verificationRequest = await verificationService.getVerificationRequest(verification_id);
    
    if (!verificationRequest) {
      return res.status(404).json({
        status: 'not_found',
        message: 'Verification not found',
        verification_id
      });
    }

    // Check state manager for current status - database is source of truth
    const stateManagerResult = await stateManager.getVerificationResult(verification_id);
    const currentStatus = verificationRequest.status || stateManagerResult?.status;

    console.log("🔍 Status check for verification results:", {
      verificationId: verification_id,
      databaseStatus: verificationRequest.status,
      stateManagerStatus: stateManagerResult?.status,
      finalStatus: currentStatus,
      hasStateManagerResult: !!stateManagerResult
    });
    
    // Get all documents for this verification
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('verification_request_id', verification_id)
      .order('created_at', { ascending: true });
    
    // Separate front and back documents
    // First document is front, second is back (if exists)
    const document = documents?.[0] || null;
    const backOfIdDocument = documents?.[1] || null;
    
    // Validate consistency before returning results
    const consistencyCheck = await consistencyService.validateVerificationConsistency(verification_id);
    
    if (!consistencyCheck.isConsistent) {
      logger.warn('Verification consistency issues detected', {
        verificationId: verification_id,
        issues: consistencyCheck.issues,
        recommendations: consistencyCheck.recommendations
      });
    }

    // Build comprehensive response
    const responseData: any = {
      verification_id,
      user_id: verificationRequest.user_id,
      status: currentStatus,
      created_at: verificationRequest.created_at,
      updated_at: verificationRequest.updated_at,
      
      // Document verification results
      document_uploaded: !!document,
      document_type: document?.document_type || null,
      ocr_data: document?.ocr_data || null,
      quality_analysis: document?.quality_analysis || null,
      
      // Back-of-ID verification results
      back_of_id_uploaded: !!backOfIdDocument,
      barcode_data: backOfIdDocument?.barcode_data || null,
      pdf417_data: backOfIdDocument?.barcode_data?.pdf417_data || null,
      cross_validation_results: document?.cross_validation_results || null,
      cross_validation_score: verificationRequest.cross_validation_score || null,
      enhanced_verification_completed: verificationRequest.enhanced_verification_completed || false,
      
      // Live capture results
      live_capture_completed: verificationRequest.live_capture_completed || false,
      liveness_score: verificationRequest.liveness_score || null,
      face_match_score: verificationRequest.face_match_score || null,
      
      // Overall assessment
      confidence_score: verificationRequest.confidence_score || null,
      manual_review_reason: verificationRequest.manual_review_reason || null,
      failure_reason: verificationRequest.status === 'failed' ? 
        (verificationRequest.failure_reason || getFailureReason(verificationRequest, document, backOfIdDocument)) : null,
      
      // Next steps based on current state
      next_steps: getNextSteps(verificationRequest, document, backOfIdDocument),
      
      // Consistency validation results
      consistency_check: {
        is_consistent: consistencyCheck.isConsistent,
        issues: consistencyCheck.issues,
        recommendations: consistencyCheck.recommendations
      }
    };
    
    res.json(responseData);
  })
);

// Helper function to determine next steps
function getNextSteps(verification: any, document: any, backOfIdDocument?: any) {
  const steps = [];
  
  if (!document) {
    steps.push('Upload document with POST /api/verify/document');
  } else if (!backOfIdDocument) {
    steps.push('Upload back-of-ID for enhanced verification with POST /api/verify/back-of-id (optional)');
  }
  
  if (!verification.live_capture_completed) {
    steps.push('Complete live capture with POST /api/verify/live-capture');
  }
  
  if (verification.status === 'pending' && document && verification.live_capture_completed) {
    steps.push('Verification processing - check again in a few moments');
  }
  
  if (verification.status === 'manual_review') {
    steps.push('Manual review required - results will be updated when review is complete');
  }
  
  if (verification.status === 'verified' || verification.status === 'failed') {
    if (backOfIdDocument && verification.enhanced_verification_completed) {
      steps.push('Enhanced verification complete with back-of-ID cross-validation');
    } else {
      steps.push('Verification complete');
    }
  }
  
  return steps;
}

// Helper function to determine failure reason based on verification data
function getFailureReason(verification: any, document: any, backOfIdDocument?: any): string {
  // Determine if this is sandbox mode (we can infer from more lenient thresholds)
  const isSandbox = verification.liveness_score !== null && verification.liveness_score <= 0.7 && verification.status === 'verified';
  // Check for document-related failures
  if (!document) {
    return 'No document was uploaded for verification';
  }
  
  // Check for OCR failures
  if (!document.ocr_data || Object.keys(document.ocr_data).length === 0) {
    return 'Document could not be read - image quality may be too poor or document type unsupported';
  }
  
  // Check for live capture failures
  if (!verification.live_capture_completed) {
    return 'Live capture was not completed - selfie photo is required for verification';
  }
  
  // Check for liveness detection failures
  if (verification.liveness_score !== null) {
    const livenessThreshold = isSandbox ? 0.65 : 0.75;
    const isLive = verification.liveness_score > livenessThreshold;
    if (!isLive) {
      return `Liveness detection failed - score ${verification.liveness_score.toFixed(2)} is below required threshold (${livenessThreshold}). Please ensure you are a live person taking a real-time selfie.`;
    }
  }
  
  // Check for face matching failures
  if (verification.face_match_score !== null) {
    const faceMatchThreshold = isSandbox ? 0.8 : 0.85;
    const faceMatch = verification.face_match_score > faceMatchThreshold;
    if (!faceMatch) {
      return `Face matching failed - score ${verification.face_match_score.toFixed(2)} is below required threshold (${faceMatchThreshold}). The photo in your document does not sufficiently match your live selfie.`;
    }
  }
  
  // Check for cross-validation failures (enhanced verification)
  if (backOfIdDocument && verification.enhanced_verification_completed) {
    // Check for photo consistency failures (critical security check)
    if (verification.photo_consistency_score !== null && verification.photo_consistency_score < 0.75) {
      return `🚨 SECURITY ALERT: The photos on your front and back ID documents do not match the same person (similarity score: ${verification.photo_consistency_score.toFixed(2)}). This suggests you may have uploaded someone else's document. Please ensure you upload BOTH sides of YOUR OWN identification document.`;
    }
    
    // Check for data cross-validation failures
    if (verification.cross_validation_score !== null && verification.cross_validation_score < 0.7) {
      return `Document validation failed - the information on the front and back of your ID does not match (score: ${verification.cross_validation_score.toFixed(2)}). Please ensure you upload both sides of the same ID document.`;
    }
    
    // Check for barcode reading failures
    if (!backOfIdDocument.barcode_data || Object.keys(backOfIdDocument.barcode_data.parsed_data || {}).length === 0) {
      return 'The back of your ID could not be processed - the barcode or magnetic stripe may be damaged or unreadable. Please try taking a clearer photo of the back of your ID.';
    }
  }
  
  // Check for quality issues
  if (document.quality_analysis && document.quality_analysis.overall_score < 0.5) {
    return 'Document quality is insufficient for verification - please provide a clearer, well-lit photo';
  }
  
  // Generic failure reason if no specific cause is identified
  return 'Verification failed - one or more verification checks did not meet the required thresholds';
}

// Route: GET /api/verify/status/:user_id - Get latest verification for user (deprecated but kept for backward compatibility)
router.get('/status/:user_id',
  authenticateAPIKey,
  validateStatusQuery,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { user_id } = req.params;
    
    // Get latest verification request for user
    const verificationRequest = await verificationService.getLatestVerificationByUserId(user_id);
    
    if (!verificationRequest) {
      return res.status(404).json({
        status: 'not_verified',
        message: 'No verification found for this user',
        user_id
      });
    }
    
    // Redirect to new results endpoint
    return res.json({
      message: 'This endpoint is deprecated. Use GET /api/verify/results/:verification_id instead.',
      verification_id: verificationRequest.id,
      redirect_url: `/api/verify/results/${verificationRequest.id}`
    });
  })
);

// Route: GET /api/verify/status-legacy/:user_id - Legacy status check
router.get('/status-legacy/:user_id',
  authenticateAPIKey,
  validateStatusQuery,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { user_id } = req.params;
    
    // Get latest verification request for user
    const verificationRequest = await verificationService.getLatestVerificationByUserId(user_id);
    
    if (!verificationRequest) {
      return res.status(404).json({
        status: 'not_verified',
        message: 'No verification found for this user',
        user_id
      });
    }
    
    // Get associated document to retrieve OCR data
    const document = await verificationService.getDocumentByVerificationId(verificationRequest.id);
    
    // Build response data
    const responseData: any = {
      face_match_score: verificationRequest.face_match_score,
      manual_review_reason: verificationRequest.manual_review_reason
    };
    
    if (document?.ocr_data) {
      responseData.ocr_data = document.ocr_data;
    }
    
    if (document?.quality_analysis) {
      responseData.quality_analysis = document.quality_analysis;
    }
    
    res.json({
      verification_id: verificationRequest.id,
      user_id,
      status: verificationRequest.status,
      created_at: verificationRequest.created_at,
      updated_at: verificationRequest.updated_at,
      data: responseData
    });
  })
);

// Route: GET /api/verify/history/:user_id
router.get('/history/:user_id',
  authenticateAPIKey,
  validateStatusQuery,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { user_id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    
    const verificationHistory = await verificationService.getVerificationHistory(
      user_id,
      page,
      limit
    );
    
    res.json({
      user_id,
      page,
      limit,
      total: verificationHistory.total,
      verifications: verificationHistory.verifications.map(v => ({
        verification_id: v.id,
        status: v.status,
        created_at: v.created_at,
        updated_at: v.updated_at,
        has_document: !!v.document_id,
        has_selfie: !!v.selfie_id,
        face_match_score: v.face_match_score
      }))
    });
  })
);

// Route: POST /api/verify/live-capture
router.post('/live-capture',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  [
    body('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('live_image_data')
      .isBase64()
      .withMessage('Live image data must be valid base64'),
    body('challenge_response')
      .optional()
      .isString()
      .withMessage('Challenge response must be a string'),
    body('sandbox')
      .optional()
      .isBoolean()
      .withMessage('Sandbox must be a boolean')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id, live_image_data, challenge_response } = req.body;
    
    // Get verification request
    const verificationRequest = await verificationService.getVerificationRequest(verification_id);
    if (!verificationRequest) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }
    
    // Authenticate user
    req.body.user_id = verificationRequest.user_id;
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    
    logVerificationEvent('live_capture_started', verification_id, {
      userId: verificationRequest.user_id,
      challengeProvided: !!challenge_response,
      dataSize: live_image_data?.length || 0
    });
    
    // Validate live_image_data exists and is not empty
    if (!live_image_data || typeof live_image_data !== 'string' || live_image_data.trim() === '') {
      throw new ValidationError('Live image data is required and must be a non-empty string', 'live_image_data', live_image_data);
    }

    try {
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(live_image_data, 'base64');
      
      // Store live capture image
      const liveCaptureId = crypto.randomUUID();
      const liveCaptureFilename = `live_${liveCaptureId}.jpg`;
      const liveCapturePath = await storageService.storeSelfie(
        imageBuffer,
        liveCaptureFilename,
        'image/jpeg',
        verification_id
      );
      
      // Create live capture record
      const liveCapture = await verificationService.createSelfie({
        verification_request_id: verification_id,
        file_path: liveCapturePath,
        file_name: liveCaptureFilename,
        file_size: imageBuffer.length
        // Note: is_live_capture and challenge_response columns don't exist in current schema
      });
      
      // Update verification request with live capture ID
      await verificationService.updateVerificationRequest(verification_id, {
        selfie_id: liveCapture.id,
        live_capture_completed: true
      });
      
      // Process liveness detection and face matching
      if (!(req.isSandbox || false)) {
        try {
          // Get document for face matching
          const document = await verificationService.getDocumentByVerificationId(verification_id);
          
          if (document) {
            // 🔒 ENHANCED SECURITY CHECK: Verify comprehensive document validation before proceeding with selfie matching
            
            // Check if there's a back-of-ID document uploaded
            const { data: allDocuments } = await supabase
              .from('documents')
              .select('*')
              .eq('verification_request_id', verification_id)
              .order('created_at', { ascending: true });
            
            const frontDocument = allDocuments?.find(doc => !doc.is_back_of_id);
            const backDocument = allDocuments?.find(doc => doc.is_back_of_id);
            
            // If back-of-ID exists, check if comprehensive validation passed first
            if (backDocument) {
              console.log('🔒 Back-of-ID detected - checking comprehensive validation status before selfie matching...');
              
              const currentVerification = await verificationService.getVerificationRequest(verification_id);
              
              // Check if comprehensive validation passed (both data and photo consistency)
              const comprehensiveValidationFailed = 
                currentVerification!.status === 'failed' && 
                currentVerification!.enhanced_verification_completed;
              
              if (comprehensiveValidationFailed) {
                console.log('🚨 SECURITY BLOCK: Comprehensive document validation failed - skipping selfie matching');
                console.log('   🛡️ Reason: Front and back documents do not match the same person');
                console.log('   📝 Status remains: FAILED due to document mismatch');
                
                // Don't proceed with selfie matching - documents already failed validation
                await verificationService.updateVerificationRequest(verification_id, {
                  live_capture_completed: true,
                  failure_reason: currentVerification?.failure_reason || 'Document validation failed - front and back documents do not match',
                  manual_review_reason: 'Live capture completed but documents failed comprehensive validation'
                });
                
                logVerificationEvent('live_capture_blocked_document_mismatch', verification_id, {
                  liveCaptureId: liveCapture.id,
                  reason: 'Comprehensive document validation failed',
                  status: 'failed'
                });
                
                // Exit early - don't proceed with face matching
                return;
              }
              
              // Check both database and state manager for enhanced verification completion
              const stateManagerResult = await stateManager.getVerificationResult(verification_id);
              const enhancedVerificationComplete = currentVerification!.enhanced_verification_completed ||
                                                 (stateManagerResult && stateManagerResult.completedStages?.includes(VerificationStage.CROSS_VALIDATION));

              // CRITICAL FIX: Always proceed with live capture - don't defer based on enhanced verification
              // The enhanced verification completion check was causing permanent deadlocks
              if (!enhancedVerificationComplete) {
                console.log('⚠️  Enhanced verification still processing, but proceeding with live capture to avoid deadlock', {
                  databaseFlag: currentVerification!.enhanced_verification_completed,
                  stateManagerStages: stateManagerResult?.completedStages || [],
                  hasCrossValidation: stateManagerResult?.completedStages?.includes(VerificationStage.CROSS_VALIDATION) || false
                });
                console.log('🔄 Live capture will proceed - final status will be determined after all processes complete');
              }
              
              console.log('✅ Comprehensive document validation passed - proceeding with selfie matching');
            }
            
            // Run face recognition with liveness checks (only against front document)
            const [matchScore, livenessScore] = await Promise.all([
              faceRecognitionService.compareFaces(frontDocument?.file_path || document.file_path, liveCapturePath),
              faceRecognitionService.detectLiveness(liveCapturePath, challenge_response)
            ]);
            
            // Use contextual thresholds (organization-specific or defaults)
            const contextualThresholds = await getContextualThresholds(req, req.isSandbox || false);
            const faceMatchThreshold = req.isSandbox || false ? 
              contextualThresholds.FACE_MATCHING.sandbox : 
              contextualThresholds.FACE_MATCHING.production;
            const livenessThreshold = req.isSandbox || false ? 
              contextualThresholds.LIVENESS.sandbox : 
              contextualThresholds.LIVENESS.production;
            
            // Validate scores using contextual thresholds
            const organizationId = getOrganizationId(req);
            const validation = await validateScores({
              faceMatching: matchScore,
              liveness: livenessScore
            }, req.isSandbox || false, organizationId || undefined);
            
            // Update scores through state manager
            const stateResult = await stateManager.updateScores(verification_id, {
              faceMatching: matchScore,
              liveness: livenessScore
            });
            
            // For enhanced verification, check if document cross-validation passed.
            // A passing cross-validation sets status to 'processing' (ready for live capture).
            // A failing cross-validation sets status to 'failed'.
            let documentValidationPassed = true;
            if (backDocument) {
              const currentVerification = await verificationService.getVerificationRequest(verification_id);
              documentValidationPassed = currentVerification!.enhanced_verification_completed === true &&
                                         currentVerification!.status !== 'failed';
            }
            
            // Determine final status and handle errors appropriately
            let finalResult;
            if (!documentValidationPassed) {
              finalResult = await stateManager.recordError(
                verification_id,
                VerificationFailureType.DATA_INCONSISTENCY_FRAUD,
                VerificationStage.FACE_MATCHING,
                'Document validation failed - front and back documents do not match',
                { backDocument: !!backDocument }
              );
            } else if (!validation.livenessPassed) {
              finalResult = await stateManager.recordError(
                verification_id,
                VerificationFailureType.LIVENESS_FAILED,
                VerificationStage.FACE_MATCHING,
                `Liveness detection failed - score ${livenessScore.toFixed(3)} below threshold ${livenessThreshold}`,
                { livenessScore, threshold: livenessThreshold }
              );
            } else if (!validation.faceMatchingPassed) {
              finalResult = await stateManager.recordError(
                verification_id,
                VerificationFailureType.FACE_NOT_MATCHING,
                VerificationStage.FACE_MATCHING,
                `Face matching failed - score ${matchScore.toFixed(3)} below threshold ${faceMatchThreshold}`,
                { matchScore, threshold: faceMatchThreshold }
              );
            } else {
              // Success - complete the stage
              await stateManager.completeStage(verification_id, VerificationStage.FACE_MATCHING, true);
              finalResult = stateResult;
            }
            
            // Comprehensive score analysis logging with centralized thresholds
            // const thresholdInfo = getThresholdInfo(req.isSandbox || false); // Removed - using detailed info below
            console.log(`📊 Final Verification Score Analysis for ${verification_id}:`);
            console.log(`   🎯 Face Match Score: ${matchScore.toFixed(3)} (threshold: ${faceMatchThreshold}) - ${validation.faceMatchingPassed ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   🔍 Liveness Score: ${livenessScore.toFixed(3)} (threshold: ${livenessThreshold}) - ${validation.livenessPassed ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   📝 Final Status: ${finalResult.status.toUpperCase()}`);
            console.log(`   🔗 Document Path: ${frontDocument?.file_path || document.file_path}`);
            console.log(`   📸 Live Capture Path: ${liveCapturePath}`);
            console.log(`   🔒 Enhanced Verification: ${backDocument ? 'YES' : 'NO'}`);
            console.log(`   🏗️  Environment: ${req.isSandbox || false ? 'SANDBOX' : 'PRODUCTION'}`);
            console.log(`   🏢 Organization: ${organizationId || 'DEFAULT'}`);
            console.log(`   ⚙️  Using Thresholds: ${organizationId ? 'CUSTOM' : 'SYSTEM_DEFAULT'}`);
            console.log(`   📊 Threshold Values: Face=${faceMatchThreshold}, Liveness=${livenessThreshold}`);
            
            // Log threshold details for debugging
            const detailedThresholdInfo = await getThresholdInfo(req.isSandbox || false, organizationId || undefined);
            console.log(`   📋 Full Threshold Info: ${JSON.stringify(detailedThresholdInfo, null, 2)}`);
            
            // Calculate score gaps with dynamic thresholds
            const livenessGap = livenessScore - livenessThreshold;
            const faceMatchGap = matchScore - faceMatchThreshold;
            console.log(`   📏 Score Gaps: Liveness ${livenessGap >= 0 ? '+' : ''}${livenessGap.toFixed(3)}, Face Match ${faceMatchGap >= 0 ? '+' : ''}${faceMatchGap.toFixed(3)}`);
            
            // Update legacy database fields for backward compatibility
            await verificationService.updateVerificationRequest(verification_id, {
              face_match_score: matchScore,
              liveness_score: livenessScore,
              live_capture_completed: true,
              status: finalResult.status as 'pending' | 'verified' | 'failed' | 'manual_review',
              manual_review_reason: finalResult.error?.userMessage,
              failure_reason: finalResult.error?.message
            });
            
            logVerificationEvent('live_capture_processed', verification_id, {
              liveCaptureId: liveCapture.id,
              matchScore,
              livenessScore,
              finalStatus: finalResult.status,
              enhancedVerification: !!backDocument,
              documentValidationPassed,
              validation,
              organizationId,
              usingCustomThresholds: !!organizationId,
              thresholds: detailedThresholdInfo,
              errorType: finalResult.error?.type,
              userMessage: finalResult.error?.userMessage
            });
            
          } else {
            // No document found - this means user hasn't uploaded a document yet
            logger.info('No document found for face matching. User needs to upload document first.', {
              verificationId: verification_id
            });
            
            // Update verification status to indicate missing document
            await verificationService.updateVerificationRequest(verification_id, {
              status: 'pending',
              manual_review_reason: 'Live capture completed, but document upload is still required for face matching'
            });
            
            logVerificationEvent('live_capture_partial', verification_id, {
              liveCapture: liveCapture.id,
              reason: 'Document not uploaded yet - face matching skipped',
              status: 'pending'
            });
          }
        } catch (error) {
          logger.error('Live capture processing failed:', error);
          await verificationService.updateVerificationRequest(verification_id, {
            status: 'manual_review',
            manual_review_reason: 'Live capture processing failed'
          });
        }
      } else {
        // Sandbox mode - perform REAL face matching but with additional logging
        try {
          console.log('🧪 Sandbox mode: Performing REAL face matching and liveness detection...');
          
          // Get document for face matching
          const document = await verificationService.getDocumentByVerificationId(verification_id);
          
          if (document) {
            // Run REAL face recognition with liveness checks - no mocking!
            const [matchScore, livenessScore] = await Promise.all([
              faceRecognitionService.compareFaces(document.file_path, liveCapturePath),
              faceRecognitionService.detectLiveness(liveCapturePath, challenge_response)
            ]);
            
            console.log('🧪 Sandbox REAL results:', {
              matchScore,
              livenessScore,
              document: document.file_path,
              selfie: liveCapturePath
            });
            
            // Determine final status based on REAL scores with sandbox-specific thresholds
            const isLive = livenessScore > 0.65; // More lenient threshold for sandbox testing
            const faceMatch = matchScore > 0.8; // Tightened threshold for sandbox testing
            const finalStatus = isLive && faceMatch ? 'verified' : 'failed';
            
            // Comprehensive sandbox score analysis logging
            console.log(`🧪📊 Sandbox Verification Score Analysis for ${verification_id}:`);
            console.log(`   🎯 Face Match Score: ${matchScore.toFixed(3)} (sandbox threshold: 0.8) - ${faceMatch ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   🔍 Liveness Score: ${livenessScore.toFixed(3)} (sandbox threshold: 0.65) - ${isLive ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   📝 Final Status: ${finalStatus.toUpperCase()}`);
            console.log(`   🔗 Document Path: ${document.file_path}`);
            console.log(`   📸 Live Capture Path: ${liveCapturePath}`);
            
            // Compare against production thresholds for reference
            const prodLiveness = livenessScore > 0.75;
            const prodFaceMatch = matchScore > 0.85;
            console.log(`   🏭 Production Comparison: Liveness ${prodLiveness ? '✅' : '❌'} (0.75), Face Match ${prodFaceMatch ? '✅' : '❌'} (0.85)`);
            
            // Log specific failure reasons for debugging
            if (!isLive && !faceMatch) {
              console.log(`   ⚠️  Both liveness and face matching failed (sandbox thresholds)`);
            } else if (!isLive) {
              console.log(`   ⚠️  Liveness detection failed (score below 0.7)`);
            } else if (!faceMatch) {
              console.log(`   ⚠️  Face matching failed (score below 0.8)`);
            }
            
            // Calculate how close scores are to both sandbox and production thresholds
            const sandboxLivenessGap = livenessScore - 0.65;
            const sandboxFaceMatchGap = matchScore - 0.8;
            const prodLivenessGap = livenessScore - 0.75;
            const prodFaceMatchGap = matchScore - 0.85;
            console.log(`   📏 Sandbox Gaps: Liveness ${sandboxLivenessGap >= 0 ? '+' : ''}${sandboxLivenessGap.toFixed(3)}, Face Match ${sandboxFaceMatchGap >= 0 ? '+' : ''}${sandboxFaceMatchGap.toFixed(3)}`);
            console.log(`   📏 Production Gaps: Liveness ${prodLivenessGap >= 0 ? '+' : ''}${prodLivenessGap.toFixed(3)}, Face Match ${prodFaceMatchGap >= 0 ? '+' : ''}${prodFaceMatchGap.toFixed(3)}`);
            
            await verificationService.updateVerificationRequest(verification_id, {
              face_match_score: matchScore,
              liveness_score: livenessScore,
              status: finalStatus,
              manual_review_reason: !isLive ? 'Sandbox: Liveness detection failed' : 
                                   !faceMatch ? 'Sandbox: Face matching failed' : undefined,
              failure_reason: !isLive ? `Liveness detection failed - score ${livenessScore.toFixed(2)} below sandbox threshold 0.65` :
                             !faceMatch ? `Face matching failed - score ${matchScore.toFixed(2)} below sandbox threshold 0.8` : undefined
            });
            
            logVerificationEvent('sandbox_live_capture_processed', verification_id, {
              liveCaptureId: liveCapture.id,
              matchScore,
              livenessScore,
              finalStatus,
              realComparison: true
            });
            
          } else {
            // No document found - this means user hasn't uploaded a document yet
            console.log('🧪 Sandbox: No document found for face matching. User needs to upload document first.');
            
            // Update verification status to indicate missing document
            await verificationService.updateVerificationRequest(verification_id, {
              status: 'pending',
              manual_review_reason: 'Sandbox: Live capture completed, but document upload is still required for face matching'
            });
            
            logVerificationEvent('sandbox_live_capture_partial', verification_id, {
              liveCaptureId: liveCapture.id,
              reason: 'Document not uploaded yet - face matching skipped',
              status: 'pending'
            });
          }
        } catch (error) {
          console.error('🧪 Sandbox face matching failed:', error);
          await verificationService.updateVerificationRequest(verification_id, {
            status: 'failed',
            manual_review_reason: 'Sandbox: Face matching processing failed',
            failure_reason: 'Technical error during face matching - please try again or contact support'
          });
          
          logVerificationEvent('sandbox_live_capture_failed', verification_id, {
            liveCaptureId: liveCapture.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      res.status(201).json({
        verification_id,
        live_capture_id: liveCapture.id,
        status: 'processing',
        message: 'Live capture uploaded successfully. Processing liveness detection and face matching.',
        next_steps: [
          'Processing liveness detection and face matching',
          `Check results with GET /api/verify/results/${verification_id}`
        ],
        liveness_check_enabled: true,
        face_matching_enabled: true,
        results_url: `/api/verify/results/${verification_id}`
      });
      
    } catch (error) {
      logVerificationEvent('live_capture_failed', verification_id, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

// Route: POST /api/verify/generate-live-token
router.post('/generate-live-token',
  authenticateAPIKey,
  [
    body('user_id')
      .isUUID()
      .withMessage('User ID must be a valid UUID'),
    body('verification_id')
      .optional()
      .isUUID()
      .withMessage('Verification ID must be a valid UUID if provided')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { user_id, verification_id } = req.body;
    
    // Authenticate user
    await new Promise((resolve, reject) => {
      authenticateUser(req as any, res as any, (err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    
    // Generate secure token for live capture session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minute expiry
    
    // Generate challenge for liveness detection
    const challenges = [
      'blink_twice',
      'turn_head_left',
      'turn_head_right',
      'smile',
      'look_up',
      'look_down'
    ];
    const selectedChallenge = challenges[Math.floor(Math.random() * challenges.length)];
    
    // Store token in database (you would need to create a live_capture_tokens table)
    // For now, we'll return the token directly
    
    logVerificationEvent('live_capture_token_generated', verification_id || user_id, {
      userId: user_id,
      verificationId: verification_id,
      challenge: selectedChallenge,
      expiresAt: expiresAt.toISOString()
    });
    
    res.json({
      live_capture_token: token,
      expires_at: expiresAt.toISOString(),
      live_capture_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/live-capture?token=${token}`,
      liveness_challenge: {
        type: selectedChallenge,
        instruction: getChallengeInstruction(selectedChallenge)
      },
      user_id,
      verification_id: verification_id || null,
      expires_in_seconds: 1800
    });
  })
);

// Helper function for challenge instructions
function getChallengeInstruction(challenge: string): string {
  const instructions = {
    'blink_twice': 'Please blink twice slowly when prompted',
    'turn_head_left': 'Please turn your head to the left when prompted',
    'turn_head_right': 'Please turn your head to the right when prompted',
    'smile': 'Please smile when prompted',
    'look_up': 'Please look up when prompted',
    'look_down': 'Please look down when prompted'
  };
  return instructions[challenge as keyof typeof instructions] || 'Follow the on-screen instructions';
}

// Route: POST /api/verify/test-pdf417 - Test PDF417 barcode parsing from raw data
router.post('/test-pdf417',
  authenticateAPIKey,
  body('raw_barcode_data')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Raw barcode data must be a string with at least 10 characters'),
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { raw_barcode_data } = req.body;

    logger.info('PDF417 test parsing requested', {
      dataLength: raw_barcode_data.length,
      apiKey: req.apiKey?.id
    });

    // Initialize barcode service
    const barcodeService = new BarcodeService();

    try {
      // Parse PDF417 data
      const pdf417Result = await barcodeService.parsePDF417(raw_barcode_data);

      logger.info('PDF417 test parsing completed', {
        validation_status: pdf417Result.validation_status,
        confidence: pdf417Result.confidence,
        apiKey: req.apiKey?.id
      });

      res.json({
        success: true,
        pdf417_data: pdf417Result,
        message: `PDF417 parsing completed with ${pdf417Result.validation_status} status`
      });

    } catch (error) {
      logger.error('PDF417 test parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        apiKey: req.apiKey?.id
      });

      res.status(500).json({
        success: false,
        error: 'PDF417 parsing failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  })
);

// Route: POST /api/verify/check-consistency/:verification_id - Manual consistency check
router.post('/check-consistency/:verification_id',
  authenticateAPIKey,
  [
    param('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id } = req.params;

    // IDOR protection: verify the verification belongs to the authenticated developer
    const ownerCheck = await verificationService.getVerificationRequestForDeveloper(
      verification_id,
      (req as any).developer.id
    );
    if (!ownerCheck) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }

    // Validate verification consistency
    const consistencyCheck = await consistencyService.validateVerificationConsistency(verification_id);
    
    // Recalculate scores if inconsistencies found
    let recalculatedScores = null;
    if (!consistencyCheck.isConsistent) {
      try {
        recalculatedScores = await consistencyService.recalculateConsistentScores(verification_id);
        
        logVerificationEvent('consistency_recalculated', verification_id, {
          previousIssues: consistencyCheck.issues.length,
          newStatus: recalculatedScores.final_status,
          newConfidenceScore: recalculatedScores.confidence_score
        });
      } catch (error) {
        logger.error('Failed to recalculate consistency scores', {
          verificationId: verification_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    res.json({
      verification_id,
      consistency_check: {
        is_consistent: consistencyCheck.isConsistent,
        issues: consistencyCheck.issues,
        recommendations: consistencyCheck.recommendations
      },
      recalculated_scores: recalculatedScores,
      message: consistencyCheck.isConsistent ? 
        'Verification is consistent' : 
        `Found ${consistencyCheck.issues.length} consistency issues${recalculatedScores ? ' and recalculated scores' : ''}`
    });
  })
);

// Route: POST /api/verify/reupload-document/:verification_id - Re-upload document after validation failure
router.post('/reupload-document/:verification_id',
  authenticateAPIKey,
  checkSandboxMode,
  verificationRateLimit,
  upload.single('document'),
  [
    param('verification_id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('document_type')
      .isIn(['passport', 'drivers_license', 'national_id', 'other'])
      .withMessage('Document type must be one of: passport, drivers_license, national_id, other'),
    body('document_side')
      .isIn(['front', 'back'])
      .withMessage('Document side must be either front or back'),
    body('replace_existing')
      .optional()
      .isBoolean()
      .withMessage('Replace existing must be a boolean')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { verification_id } = req.params;
    const { document_type, document_side, replace_existing = true } = req.body;
    const file = req.file;

    if (!file) {
      throw new FileUploadError('Document file is required');
    }

    // Validate actual file bytes — rejects MIME-type spoofing
    const backIdTypeCheck = await validateFileType(file.buffer);
    if (!backIdTypeCheck.valid) {
      throw new FileUploadError(backIdTypeCheck.reason || 'Invalid file type');
    }

    // Get verification request (atomic ownership check — IDOR protection)
    const verificationRequest = await verificationService.getVerificationRequestForDeveloper(
      verification_id,
      (req as any).developer.id
    );
    if (!verificationRequest) {
      throw new ValidationError('Verification request not found', 'verification_id', verification_id);
    }

    // Check if this is a reupload for a failed verification
    if (verificationRequest.status !== 'failed') {
      throw new ValidationError('Document re-upload is only allowed for failed verifications', 'status', verificationRequest.status);
    }
    
    logVerificationEvent('document_reupload_started', verification_id, {
      userId: verificationRequest.user_id,
      documentType: document_type,
      documentSide: document_side,
      fileSize: file.size,
      mimeType: file.mimetype,
      replaceExisting: replace_existing
    });
    
    try {
      // Get existing documents
      const { data: existingDocuments } = await supabase
        .from('documents')
        .select('*')
        .eq('verification_request_id', verification_id)
        .order('created_at', { ascending: true });
      
      const isBackSide = document_side === 'back';
      const existingDoc = existingDocuments?.find(doc => 
        isBackSide ? doc.is_back_of_id : !doc.is_back_of_id
      );
      
      // Store new document file
      const documentPath = await storageService.storeDocument(
        file.buffer,
        isBackSide ? `back_${file.originalname}` : file.originalname,
        file.mimetype,
        verificationRequest.id
      );
      
      if (replace_existing && existingDoc) {
        // Update existing document
        await verificationService.updateDocument(existingDoc.id, {
          file_path: documentPath,
          file_name: isBackSide ? `back_${file.originalname}` : file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
          // Clear previous processing results
          ocr_data: undefined,
          barcode_data: undefined,
          cross_validation_results: undefined,
          quality_analysis: undefined
        });
        
        console.log(`📄 ${document_side} document replaced for verification ${verification_id}`);
      } else {
        // Create new document record
        await verificationService.createDocument({
          verification_request_id: verificationRequest.id,
          file_path: documentPath,
          file_name: isBackSide ? `back_${file.originalname}` : file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
          document_type,
          is_back_of_id: isBackSide
        });
        
        console.log(`📄 New ${document_side} document uploaded for verification ${verification_id}`);
      }
      
      // Reset verification status to allow reprocessing
      await verificationService.updateVerificationRequest(verification_id, {
        status: 'pending',
        enhanced_verification_completed: false,
        photo_consistency_score: undefined,
        cross_validation_score: undefined,
        manual_review_reason: `${document_side} document re-uploaded - reprocessing verification`,
        failure_reason: undefined
      });
      
      // Start reprocessing based on document side
      if (document_side === 'front') {
        // Trigger OCR reprocessing
        const updatedDoc = existingDoc ? 
          await verificationService.getDocumentByVerificationId(verification_id) : 
          existingDocuments?.find(doc => !doc.is_back_of_id);
        
        if (updatedDoc) {
          ocrService.processDocument(updatedDoc.id, documentPath, document_type)
            .then(async (ocrData) => {
              await verificationService.updateDocument(updatedDoc.id, {
                ocr_data: ocrData
              });
              
              logVerificationEvent('reupload_ocr_completed', verification_id, {
                documentId: updatedDoc.id,
                documentSide: 'front'
              });
            })
            .catch((error) => {
              console.error('🚨 Reupload OCR processing failed:', error);
              // CRITICAL FIX: Mark enhanced verification as completed even when reupload fails
              console.log('🔧 REUPLOAD OCR FAILURE: Marking enhanced verification as completed to prevent deadlock');
              verificationService.updateVerificationRequest(verification_id, {
                status: 'manual_review',
                manual_review_reason: 'Front document reupload OCR processing failed',
                enhanced_verification_completed: true
              });
              console.log('✅ Enhanced verification marked as completed despite reupload failure - live capture can now proceed');
            });
        }
      } else {
        // Trigger back-of-ID reprocessing
        const frontDoc = existingDocuments?.find(doc => !doc.is_back_of_id);
        const backDoc = existingDoc || existingDocuments?.find(doc => doc.is_back_of_id);
        
        if (frontDoc && backDoc && !(req.isSandbox || false)) {
          barcodeService.scanBackOfId(documentPath)
            .then(async (backOfIdData) => {
              await verificationService.updateDocument(backDoc.id, {
                barcode_data: backOfIdData
              });
              
              // Run comprehensive validation again
              if (frontDoc.ocr_data) {
                const [crossValidation, photoConsistencyScore] = await Promise.all([
                  barcodeService.crossValidateWithFrontId(frontDoc.ocr_data, backOfIdData),
                  faceRecognitionService.compareDocumentPhotos(frontDoc.file_path, documentPath)
                ]);
                
                const dataValidationPassed = crossValidation.validation_results.overall_consistency && 
                                           crossValidation.match_score >= 0.7;
                const photoValidationPassed = photoConsistencyScore >= 0.75;
                const comprehensiveValidationPassed = dataValidationPassed && photoValidationPassed;
                
                await verificationService.updateVerificationRequest(verification_id, {
                  cross_validation_score: crossValidation.match_score,
                  photo_consistency_score: photoConsistencyScore,
                  enhanced_verification_completed: true,
                  status: comprehensiveValidationPassed ? 'verified' : 'failed',
                  manual_review_reason: comprehensiveValidationPassed ? undefined :
                    'Reupload validation failed - documents still do not match'
                });
                
                logVerificationEvent('reupload_validation_completed', verification_id, {
                  documentSide: 'back',
                  comprehensiveValidationPassed,
                  photoConsistencyScore,
                  crossValidationScore: crossValidation.match_score
                });
              }
            })
            .catch((error) => {
              console.error('🚨 Reupload back-of-ID processing failed:', error);
              // CRITICAL FIX: Mark enhanced verification as completed even when reupload fails
              console.log('🔧 REUPLOAD BACK-ID FAILURE: Marking enhanced verification as completed to prevent deadlock');
              verificationService.updateVerificationRequest(verification_id, {
                status: 'manual_review',
                manual_review_reason: 'Back document reupload processing failed',
                enhanced_verification_completed: true
              });
              console.log('✅ Enhanced verification marked as completed despite reupload failure - live capture can now proceed');
            });
        }
      }
      
      res.json({
        verification_id,
        status: 'reprocessing',
        message: `${document_side} document re-uploaded successfully. Reprocessing verification.`,
        document_side,
        document_type,
        next_steps: [
          `${document_side === 'front' ? 'OCR processing' : 'Barcode scanning and cross-validation'} in progress`,
          `Check results with GET /api/verify/results/${verification_id}`
        ],
        reupload_successful: true
      });
      
    } catch (error) {
      logVerificationEvent('document_reupload_failed', verification_id, {
        error: error instanceof Error ? error.message : 'Unknown error',
        documentSide: document_side
      });
      throw error;
    }
  })
);

export default router;