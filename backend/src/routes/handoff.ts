import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { catchAsync, ValidationError } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

const router = express.Router();

// POST /api/verify/handoff/create — desktop creates a session, returns token
router.post('/create', catchAsync(async (req: Request, res: Response) => {
  const { api_key, user_id, source } = req.body;

  if (!api_key || !user_id) {
    throw new ValidationError('api_key and user_id are required', 'body', req.body);
  }

  const validSource = ['api', 'vaas', 'demo'].includes(source) ? source : 'api';
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const { error } = await supabase
    .from('mobile_handoff_sessions')
    .insert({ token, api_key, user_id, source: validSource, expires_at: expiresAt.toISOString() });

  if (error) {
    logger.error('Failed to create handoff session', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`Failed to create handoff session: ${error.message}`);
  }

  res.status(201).json({ token, expires_at: expiresAt.toISOString() });
}));

// GET /api/verify/handoff/:token/session — mobile fetches api_key + user_id
router.get('/:token/session', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { data, error } = await supabase
    .from('mobile_handoff_sessions')
    .select('api_key, user_id, source, status, expires_at')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(data.expires_at) < new Date()) {
    const { error: expireError } = await supabase
      .from('mobile_handoff_sessions')
      .update({ status: 'expired' })
      .eq('token', token);
    if (expireError) {
      logger.warn('Failed to mark handoff session as expired', { token, error: expireError });
    }
    return res.status(410).json({ error: 'Session expired' });
  }

  if (data.status !== 'pending') {
    return res.status(409).json({ error: 'Session already used' });
  }

  res.json({ api_key: data.api_key, user_id: data.user_id, source: data.source || 'api' });
}));

// PATCH /api/verify/handoff/:token/link — mobile links verification_id to session
router.patch('/:token/link', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;
  const { verification_id } = req.body;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!verification_id || typeof verification_id !== 'string') {
    throw new ValidationError('verification_id is required', 'verification_id', verification_id);
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verification_id)) {
    throw new ValidationError('Invalid verification_id format', 'verification_id', verification_id);
  }

  const { data: updated, error } = await supabase
    .from('mobile_handoff_sessions')
    .update({ verification_id })
    .eq('token', token)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    logger.error('Failed to link verification_id to handoff session', error);
    throw new Error('Failed to link verification_id');
  }

  if (!updated || updated.length === 0) {
    return res.status(404).json({ error: 'Session not found or already completed' });
  }

  res.json({ success: true });
}));

// PATCH /api/verify/handoff/:token/complete — mobile reports completion
router.patch('/:token/complete', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { status, result } = req.body;

  if (!status || !['completed', 'failed'].includes(status)) {
    throw new ValidationError('status must be completed or failed', 'status', status);
  }

  // Validate result shape and size
  if (result != null) {
    if (typeof result !== 'object' || Array.isArray(result)) {
      throw new ValidationError('result must be a plain object', 'result', result);
    }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4096) {
      throw new ValidationError('result payload too large (max 4096 bytes)', 'result', result);
    }
  }

  // First verify the session exists and hasn't expired
  const { data: session, error: fetchError } = await supabase
    .from('mobile_handoff_sessions')
    .select('status, expires_at')
    .eq('token', token)
    .single();

  if (fetchError || !session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Session expired' });
  }

  // Atomic update — only succeeds if status is still 'pending'
  const { data: updated, error } = await supabase
    .from('mobile_handoff_sessions')
    .update({ status, result: result ?? null })
    .eq('token', token)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    logger.error('Failed to complete handoff session', error);
    throw new Error('Failed to update session');
  }

  if (!updated || updated.length === 0) {
    return res.status(409).json({ error: 'Session already completed' });
  }

  res.json({ success: true });
}));

// GET /api/verify/handoff/:token/status — desktop polls for completion
router.get('/:token/status', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { data, error } = await supabase
    .from('mobile_handoff_sessions')
    .select('status, result, expires_at, verification_id')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(data.expires_at) < new Date()) {
    const { error: expireError } = await supabase
      .from('mobile_handoff_sessions')
      .update({ status: 'expired' })
      .eq('token', token);
    if (expireError) {
      logger.warn('Failed to mark handoff session as expired', { token, error: expireError });
    }
    return res.status(410).json({ error: 'Session expired' });
  }

  res.json({
    status: data.status,
    ...(data.verification_id && { verification_id: data.verification_id }),
    ...(data.status !== 'pending' && { result: data.result }),
  });
}));

export default router;
