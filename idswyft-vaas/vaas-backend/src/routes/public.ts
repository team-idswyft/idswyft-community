import { Router, Request, Response } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { vaasSupabase } from '../config/database.js';
import { orgStorageService } from '../services/orgStorageService.js';
import { VaasApiResponse } from '../types/index.js';
import { livenessDataSchema, resultSchema } from '../schemas/verification.schema.js';

// MIME types we accept, mapped from file-type magic-byte detection
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
]);

const router = Router();

// Configure multer for file uploads (store in memory for now)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed'));
    }
  }
});

// Upload document for verification session
router.post('/sessions/:sessionToken/documents', upload.single('document') as any, async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;
    const { type, issuing_country } = req.body; // type: 'front', 'back', or 'selfie'
    const file = req.file;

    if (!file) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NO_FILE_UPLOADED',
          message: 'No file was uploaded'
        }
      };
      return res.status(400).json(response);
    }

    // Validate magic bytes match claimed MIME type
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_FILE_CONTENT',
          message: `File content does not match an allowed image or PDF type${detected ? ` (detected: ${detected.mime})` : ''}`,
        }
      };
      return res.status(400).json(response);
    }

    if (!type || !['front', 'back', 'selfie'].includes(type)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DOCUMENT_TYPE',
          message: 'Document type must be front, back, or selfie'
        }
      };
      return res.status(400).json(response);
    }

    // Find verification session by token
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, organization_id')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      return res.status(404).json(response);
    }

    // Check if session is in a valid state for document upload
    if (!['pending', 'document_uploaded'].includes(session.status)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_SESSION_STATUS',
          message: 'Cannot upload documents to this verification session'
        }
      };
      return res.status(400).json(response);
    }

    // Upload file to org's configured storage provider
    let storagePath: string;
    try {
      storagePath = await orgStorageService.storeDocument(
        session.organization_id,
        file.buffer,
        file.originalname,
        detected.mime, // Use magic-byte MIME, not claimed MIME
        session.id,
        type
      );
    } catch (storageError: any) {
      console.error('[PublicRoutes] Storage upload failed:', storageError);
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'STORAGE_UPLOAD_FAILED',
          message: 'Failed to store document file'
        }
      };
      return res.status(500).json(response);
    }

    const documentData = {
      verification_session_id: session.id,
      document_type: type,
      filename: file.originalname,
      mimetype: detected.mime,
      size: file.size,
      file_path: storagePath,
      uploaded_at: new Date().toISOString()
    };

    // Insert document record
    const { data: document, error: docError } = await vaasSupabase
      .from('vaas_verification_documents')
      .insert([documentData])
      .select('*')
      .single();

    if (docError) {
      console.error('[PublicRoutes] Document upload error:', docError);
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'DOCUMENT_UPLOAD_FAILED',
          message: 'Failed to save document'
        }
      };
      return res.status(500).json(response);
    }

    // Update session status to document_uploaded if this is the first document
    if (session.status === 'pending') {
      const updatePayload: Record<string, any> = {
        status: 'document_uploaded',
        updated_at: new Date().toISOString(),
      };
      // Persist issuing_country on the VaaS session if provided
      if (issuing_country && /^[A-Z]{2}$/i.test(issuing_country)) {
        updatePayload.issuing_country = issuing_country.toUpperCase();
      }
      await vaasSupabase
        .from('vaas_verification_sessions')
        .update(updatePayload)
        .eq('id', session.id);
    }

    const response: VaasApiResponse = {
      success: true,
      data: {
        document_id: document.id,
        processing_status: 'uploaded'
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('[PublicRoutes] Document upload failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DOCUMENT_UPLOAD_FAILED',
        message: error.message || 'Failed to upload document'
      }
    };
    
    res.status(500).json(response);
  }
});

// Submit verification for processing
router.post('/sessions/:sessionToken/submit', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;

    // Find verification session by token
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, organization_id, idswyft_verification_id')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      return res.status(404).json(response);
    }

    // Idempotency: if already processing or beyond, return success
    if (['processing', 'completed', 'verified', 'failed', 'manual_review'].includes(session.status)) {
      return res.json({ success: true, data: { message: 'Already submitted' } } as VaasApiResponse);
    }

    // Accept both pending and document_uploaded — documents may go
    // directly to the main API without updating VaaS session status
    if (!['pending', 'document_uploaded'].includes(session.status)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_SESSION_STATUS',
          message: 'Cannot submit this verification session'
        }
      };
      return res.status(400).json(response);
    }

    // Update session status to processing
    const { error: updateError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({ 
        status: 'processing', 
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      })
      .eq('id', session.id);

    if (updateError) {
      throw new Error('Failed to update session status');
    }

    // In a real implementation, this would trigger the verification processing
    // For now, we'll simulate processing by updating to completed after a delay
    // This would normally be handled by a background job or webhook from main Idswyft API

    const response: VaasApiResponse = {
      success: true,
      data: {
        message: 'Verification submitted for processing'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[PublicRoutes] Submit verification failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'SUBMIT_VERIFICATION_FAILED',
        message: error.message || 'Failed to submit verification'
      }
    };
    
    res.status(500).json(response);
  }
});

// Get verification status
router.get('/sessions/:sessionToken/status', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;

    // Find verification session by token
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select(`
        id,
        status,
        results,
        submitted_at,
        completed_at,
        expires_at
      `)
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      return res.status(404).json(response);
    }

    // Count uploaded documents
    const { data: documents, error: docError } = await vaasSupabase
      .from('vaas_verification_documents')
      .select('id, document_type')
      .eq('verification_session_id', session.id);

    if (docError) {
      console.error('[PublicRoutes] Error fetching documents:', docError);
    }

    const statusResponse = {
      status: session.status,
      confidence_score: session.results?.confidence_score,
      results: session.results ? {
        face_match_score: session.results.face_match_score,
        liveness_score: session.results.liveness_score,
        document_validity: session.results.document_validity,
        failure_reasons: session.results.failure_reasons
      } : undefined,
      documents_uploaded: documents?.length || 0,
      submitted_at: session.submitted_at,
      completed_at: session.completed_at,
      expires_at: session.expires_at
    };

    res.json(statusResponse);
  } catch (error: any) {
    console.error('[PublicRoutes] Get status failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_STATUS_FAILED',
        message: error.message || 'Failed to get verification status'
      }
    };
    
    res.status(500).json(response);
  }
});

// Perform liveness check
router.post('/sessions/:sessionToken/liveness', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;

    // Validate liveness payload
    const parseResult = livenessDataSchema.safeParse(req.body);
    if (!parseResult.success) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid liveness data',
          details: parseResult.error.issues,
        }
      };
      return res.status(400).json(response);
    }
    const livenessData = parseResult.data;

    // Find verification session by token
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      return res.status(404).json(response);
    }

    // Store liveness data (this would normally trigger liveness detection processing)
    const { error: updateError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({ 
        liveness_data: livenessData,
        updated_at: new Date().toISOString() 
      })
      .eq('id', session.id);

    if (updateError) {
      throw new Error('Failed to store liveness data');
    }

    const response: VaasApiResponse = {
      success: true,
      data: {
        message: 'Liveness data received'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[PublicRoutes] Liveness check failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIVENESS_CHECK_FAILED',
        message: error.message || 'Failed to process liveness check'
      }
    };
    
    res.status(500).json(response);
  }
});

// Report verification result from customer portal
// Called after the main API finishes processing — bridges the gap
// between the main API results and the VaaS admin dashboard.
router.post('/sessions/:sessionToken/result', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;

    // Validate result payload
    const parseResult = resultSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.error('[PublicRoutes] Result schema validation failed:', JSON.stringify(parseResult.error.issues));
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid result data',
          details: parseResult.error.issues,
        }
      };
      return res.status(400).json(response);
    }

    const {
      final_result,
      confidence_score,
      face_match_results,
      liveness_results,
      ocr_data,
      cross_validation_results,
      failure_reason,
      manual_review_reason,
    } = parseResult.data;

    // Find session by token
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, end_user_id')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      return res.status(404).json(response);
    }

    // Idempotency: if already at a terminal status, return success
    if (['verified', 'failed', 'completed'].includes(session.status)) {
      return res.json({ success: true, data: { message: 'Result already recorded' } } as VaasApiResponse);
    }

    // Build the results JSONB matching what VaaS admin detail modal reads
    const failureReasons: string[] = [];
    if (failure_reason) failureReasons.push(failure_reason);
    if (manual_review_reason) failureReasons.push(manual_review_reason);

    const resultsJson = {
      verification_status: final_result,
      confidence_score: confidence_score ?? null,
      face_match_score: face_match_results?.similarity_score ?? face_match_results?.score ?? null,
      liveness_score: liveness_results?.liveness_score ?? liveness_results?.confidence ?? null,
      liveness_passed: liveness_results?.liveness_passed ?? liveness_results?.passed ?? null,
      ocr_data: ocr_data ?? null,
      cross_validation_results: cross_validation_results ?? null,
      face_analysis: face_match_results ?? null,
      liveness_analysis: liveness_results ?? null,
      failure_reasons: failureReasons.length > 0 ? failureReasons : [],
    };

    const now = new Date().toISOString();

    // Update session with results
    const { error: updateError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({
        status: final_result as string,
        results: resultsJson,
        confidence_score: confidence_score ?? null,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', session.id);

    if (updateError) {
      console.error('[PublicRoutes] Result update error:', updateError);
      throw new Error('Failed to update session with results');
    }

    // Update end user verification status
    if (session.end_user_id) {
      await vaasSupabase
        .from('vaas_end_users')
        .update({
          verification_status: final_result as string,
          verification_completed_at: now,
          updated_at: now,
        })
        .eq('id', session.end_user_id);
    }

    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Result recorded' }
    };
    res.json(response);
  } catch (error: any) {
    console.error('[PublicRoutes] Report result failed:', error);

    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'REPORT_RESULT_FAILED',
        message: error.message || 'Failed to report verification result'
      }
    };
    res.status(500).json(response);
  }
});

export default router;