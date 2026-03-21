import express, { Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
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

// ─── Developer Management (platform admin) ────────────────────────────────

// List developers with search, status filter, pagination
router.get('/developers', authenticateServiceToken, catchAsync(async (req: Request, res: Response) => {
  const { search, status, page = '1', per_page = '25' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(per_page) || 25));
  const offset = (pageNum - 1) * perPage;

  let query = supabase
    .from('developers')
    .select('id, email, name, company, status, is_verified, avatar_url, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (search) {
    // Sanitize PostgREST special characters to prevent filter injection
    const sanitized = search.replace(/[,%().\\]/g, '');
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,company.ilike.%${sanitized}%`);
    }
  }
  if (status && (status === 'active' || status === 'suspended')) {
    query = query.eq('status', status);
  }

  const { data: developers, error, count } = await query;

  if (error) {
    logger.error('Failed to list developers', error);
    return res.status(500).json({ success: false, error: 'Failed to list developers' });
  }

  // Enrich with api_key_count and verification_count via lightweight HEAD queries
  const devIds = (developers || []).map(d => d.id);
  let apiKeyCounts: Record<string, number> = {};
  let verificationCounts: Record<string, number> = {};

  if (devIds.length > 0) {
    const counts = await Promise.all(devIds.map(async (devId) => {
      const [keyRes, verRes] = await Promise.all([
        supabase.from('api_keys').select('id', { count: 'exact', head: true }).eq('developer_id', devId).eq('is_active', true),
        supabase.from('verification_requests').select('id', { count: 'exact', head: true }).eq('developer_id', devId),
      ]);
      return { id: devId, api_key_count: keyRes.count || 0, verification_count: verRes.count || 0 };
    }));
    for (const c of counts) {
      apiKeyCounts[c.id] = c.api_key_count;
      verificationCounts[c.id] = c.verification_count;
    }
  }

  const enriched = (developers || []).map(d => ({
    ...d,
    api_key_count: apiKeyCounts[d.id] || 0,
    verification_count: verificationCounts[d.id] || 0,
  }));

  res.json({
    success: true,
    data: enriched,
    meta: {
      total: count || 0,
      page: pageNum,
      per_page: perPage,
    },
  });
}));

// Get single developer detail
router.get('/developers/:id', authenticateServiceToken, [param('id').isUUID()], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Invalid developer ID format' });
  }
  const { id } = req.params;

  const { data: developer, error } = await supabase
    .from('developers')
    .select('id, email, name, company, status, is_verified, avatar_url, created_at')
    .eq('id', id)
    .single();

  if (error || !developer) {
    return res.status(404).json({ success: false, error: 'Developer not found' });
  }

  // Get counts
  const [keyResult, verResult] = await Promise.all([
    supabase.from('api_keys').select('id', { count: 'exact', head: true }).eq('developer_id', id).eq('is_active', true),
    supabase.from('verification_requests').select('id', { count: 'exact', head: true }).eq('developer_id', id),
  ]);

  res.json({
    success: true,
    data: {
      ...developer,
      api_key_count: keyResult.count || 0,
      verification_count: verResult.count || 0,
    },
  });
}));

// Suspend developer
router.post('/developers/:id/suspend', authenticateServiceToken, [param('id').isUUID()], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Invalid developer ID format' });
  }
  const { id } = req.params;

  const { data: developer, error } = await supabase
    .from('developers')
    .update({ status: 'suspended' })
    .eq('id', id)
    .eq('status', 'active')
    .select('id, email, name, status')
    .single();

  if (error || !developer) {
    return res.status(404).json({ success: false, error: 'Developer not found or already suspended' });
  }

  logger.info('Developer suspended', { developerId: id, email: developer.email });
  res.json({ success: true, data: developer });
}));

// Unsuspend developer
router.post('/developers/:id/unsuspend', authenticateServiceToken, [param('id').isUUID()], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Invalid developer ID format' });
  }
  const { id } = req.params;

  const { data: developer, error } = await supabase
    .from('developers')
    .update({ status: 'active' })
    .eq('id', id)
    .eq('status', 'suspended')
    .select('id, email, name, status')
    .single();

  if (error || !developer) {
    return res.status(404).json({ success: false, error: 'Developer not found or already active' });
  }

  logger.info('Developer unsuspended', { developerId: id, email: developer.email });
  res.json({ success: true, data: developer });
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