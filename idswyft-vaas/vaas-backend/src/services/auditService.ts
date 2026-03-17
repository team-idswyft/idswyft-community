import { Request } from 'express';
import { vaasSupabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

export interface AuditEvent {
  organizationId: string;
  adminId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  req?: Request;
}

/**
 * Fire-and-forget audit logger. Writes to vaas_audit_logs.
 * Never throws — audit failure must not block the primary request.
 */
function logAuditEvent(event: AuditEvent): void {
  const {
    organizationId,
    adminId,
    action,
    resourceType,
    resourceId,
    details,
    req,
  } = event;

  // Extract client IP: req.ip handles trust proxy; fall back to x-forwarded-for first entry
  const forwarded = req?.headers['x-forwarded-for'];
  const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null;
  const ipAddress = req?.ip || forwardedIp || null;

  const userAgent = req?.get('User-Agent')?.substring(0, 500) || null;

  // Wrap in async IIFE — Supabase returns PromiseLike (no .catch), so await + try/catch
  (async () => {
    try {
      const { error } = await vaasSupabase
        .from('vaas_audit_logs')
        .insert([{
          organization_id: organizationId,
          admin_id: adminId || null,
          action,
          resource_type: resourceType || null,
          resource_id: resourceId || null,
          details: details || null,
          ip_address: ipAddress,
          user_agent: userAgent,
        }]);
      if (error) {
        logger.warn('Failed to write audit log', { error: error.message, action, organizationId });
      }
    } catch (err: any) {
      logger.warn('Audit log write threw', { error: err.message, action, organizationId });
    }
  })();
}

export const auditService = { logAuditEvent };
