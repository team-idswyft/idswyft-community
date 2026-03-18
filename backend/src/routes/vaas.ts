import express, { Request, Response } from 'express';
import { authenticateServiceToken } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

const router = express.Router();

// VaaS service endpoint - create user
router.post('/users', authenticateServiceToken, catchAsync(async (req: Request, res: Response) => {
  const { email, phone, first_name, last_name, external_id, metadata } = req.body;
  
  logger.info('VaaS user creation request received', {
    email,
    phone,
    first_name,
    last_name,
    external_id
  });
  
  // Create user in main Idswyft system (will be extended with full schema later)
  // For now, store only the basic fields that exist, and track full data in VaaS system
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      email,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    logger.error('Failed to create user', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
  
  logger.info('VaaS user created', {
    user_id: user.id,
    email: user.email
  });
  
  res.status(201).json({
    success: true,
    data: {
      id: user.id,
      email: user.email || email,
      phone: phone, // Return original data even if not stored yet
      first_name: first_name,
      last_name: last_name,
      external_id: external_id,
      metadata: metadata
    }
  });
}));

// VaaS service endpoint - submit verification request
router.post('/verify', authenticateServiceToken, catchAsync(async (req: Request, res: Response) => {
  const { user_id, document_url, selfie_url, organization_id, addons } = req.body;

  logger.info('VaaS verification request received', {
    user_id,
    organization_id,
    has_document: !!document_url,
    has_selfie: !!selfie_url,
    addons: addons || null,
  });

  // Create verification request in main Idswyft system
  const insertData: Record<string, unknown> = {
    user_id,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (addons && typeof addons === 'object') {
    insertData.addons = addons;
  }

  const { data: verification, error } = await supabase
    .from('verification_requests')
    .insert(insertData)
    .select()
    .single();
  
  if (error) {
    logger.error('Failed to create verification request', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create verification request'
    });
  }
  
  logger.info('VaaS verification created', {
    verification_id: verification.id,
    user_id,
    organization_id
  });
  
  res.json({
    success: true,
    verification_id: verification.id,
    status: verification.status,
    message: 'Verification request submitted successfully'
  });
}));

// VaaS service endpoint - get verification status
router.get('/verify/:verification_id/status', authenticateServiceToken, catchAsync(async (req: Request, res: Response) => {
  const { verification_id } = req.params;
  
  const { data: verification, error } = await supabase
    .from('verification_requests')
    .select('id, status, confidence_score, failure_reason, updated_at')
    .eq('id', verification_id)
    .single();
  
  if (error || !verification) {
    return res.status(404).json({
      success: false,
      error: 'Verification not found'
    });
  }
  
  res.json({
    success: true,
    verification: {
      id: verification.id,
      status: verification.status,
      confidence_score: verification.confidence_score,
      failure_reason: verification.failure_reason,
      updated_at: verification.updated_at
    }
  });
}));

// VaaS service endpoint - health check for service-to-service communication
router.get('/health', authenticateServiceToken, (req, res) => {
  res.json({
    success: true,
    message: 'VaaS service integration is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;