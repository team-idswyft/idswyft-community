/**
 * Applicant IP recording
 *
 * /initialize can be called server-to-server, in which case the client_ip it
 * stores is the integrator's backend, and velocity/geo analysis would describe
 * that server instead of the applicant. The end user's own capture requests
 * (handoff or session token) overwrite it with their IP. API-key requests
 * are skipped for the same reason as /initialize.
 */

import type { Request } from 'express';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

export async function recordApplicantIp(req: Request, verificationId: string): Promise<void> {
  if (req.headers['x-api-key']) return;
  const ip = req.ip || req.socket?.remoteAddress;
  if (!ip) return;
  const { error } = await supabase.from('verification_requests')
    .update({ client_ip: ip })
    .eq('id', verificationId);
  if (error) {
    logger.warn('Failed to record applicant IP (non-blocking)', { verification_id: verificationId, error: error.message });
  }
}
