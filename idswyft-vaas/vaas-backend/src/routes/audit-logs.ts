import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { VaasApiResponse } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';
import { escapePostgrestValue } from '../utils/sanitize.js';

const router = Router();

// Get audit logs for organization
router.get('/:organizationId/audit-logs',
  [
    param('organizationId')
      .isUUID()
      .withMessage('Invalid organization ID format'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('per_page')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Per page must be between 1 and 100'),
    query('action')
      .optional()
      .isString()
      .withMessage('Action must be a string'),
    query('admin_id')
      .optional()
      .isUUID()
      .withMessage('Admin ID must be a valid UUID'),
    query('start_date')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in ISO8601 format'),
    query('end_date')
      .optional()
      .isISO8601()
      .withMessage('End date must be in ISO8601 format'),
    query('search')
      .optional()
      .isString()
      .isLength({ max: 200 })
      .withMessage('Search must be a string under 200 characters'),
    query('resource_type')
      .optional()
      .isString()
      .isLength({ max: 50 })
      .withMessage('Resource type must be a string under 50 characters'),
    query('date_from')
      .optional()
      .isISO8601()
      .withMessage('date_from must be in ISO8601 format'),
    query('date_to')
      .optional()
      .isISO8601()
      .withMessage('date_to must be in ISO8601 format')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const { organizationId } = req.params;
    const {
      page = 1,
      per_page = 20,
      action,
      admin_id,
      start_date,
      end_date,
      search,
      resource_type,
      date_from,
      date_to
    } = req.query;

    // Verify user has access to this organization
    if (req.admin!.organization_id !== organizationId) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      return res.status(403).json(response);
    }

    // Build query
    let query = vaasSupabase
      .from('vaas_audit_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (action) {
      query = query.eq('action', action);
    }
    if (admin_id) {
      query = query.eq('admin_id', admin_id);
    }
    if (resource_type) {
      query = query.eq('resource_type', resource_type);
    }

    // Search across action, resource_type, ip_address
    if (search) {
      const s = (search as string).trim();
      if (s) {
        const escaped = escapePostgrestValue(s);
        query = query.or(`action.ilike.%${escaped}%,resource_type.ilike.%${escaped}%,ip_address.ilike.%${escaped}%`);
      }
    }

    // Date filters — support both naming conventions (start_date/end_date and date_from/date_to)
    const effectiveStart = (date_from || start_date) as string | undefined;
    const effectiveEnd = (date_to || end_date) as string | undefined;
    if (effectiveStart) {
      query = query.gte('created_at', effectiveStart);
    }
    if (effectiveEnd) {
      query = query.lte('created_at', effectiveEnd);
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(per_page);
    query = query.range(offset, offset + Number(per_page) - 1);

    const { data: auditLogs, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch audit logs: ${error.message}`);
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil((count || 0) / Number(per_page));

    const response: VaasApiResponse = {
      success: true,
      data: {
        audit_logs: auditLogs || [],
        meta: {
          total_count: count || 0,
          page: Number(page),
          per_page: Number(per_page),
          total_pages: totalPages,
          has_more: Number(page) < totalPages
        }
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[AuditLogs] Failed to fetch audit logs:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: error.message || 'Failed to fetch audit logs'
      }
    };
    res.status(500).json(response);
  }
});

// Get audit log statistics
router.get('/:organizationId/audit-logs/stats',
  [
    param('organizationId')
      .isUUID()
      .withMessage('Invalid organization ID format'),
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Days must be between 1 and 365')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const { organizationId } = req.params;
    const { days = 30 } = req.query;

    // Verify user has access to this organization
    if (req.admin!.organization_id !== organizationId) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      return res.status(403).json(response);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get total count
    const { count: totalCount, error: countError } = await vaasSupabase
      .from('vaas_audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString());

    if (countError) {
      throw new Error(`Failed to count audit logs: ${countError.message}`);
    }

    // Get action breakdown
    const { data: actionStats, error: actionError } = await vaasSupabase
      .from('vaas_audit_logs')
      .select('action')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString());

    if (actionError) {
      throw new Error(`Failed to get action statistics: ${actionError.message}`);
    }

    // Process action breakdown
    const actionBreakdown = (actionStats || []).reduce((acc: any, log: any) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    const response: VaasApiResponse = {
      success: true,
      data: {
        total_logs: totalCount || 0,
        period_days: Number(days),
        action_breakdown: actionBreakdown,
        most_active_actions: Object.entries(actionBreakdown)
          .sort(([,a]: any, [,b]: any) => b - a)
          .slice(0, 5)
          .map(([action, count]) => ({ action, count }))
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[AuditLogs] Failed to fetch audit log stats:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: error.message || 'Failed to fetch audit log statistics'
      }
    };
    res.status(500).json(response);
  }
});

// Create audit log entry
router.post('/:organizationId/audit-logs',
  [
    param('organizationId')
      .isUUID()
      .withMessage('Invalid organization ID format'),
    body('action')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Action is required and must be less than 100 characters'),
    body('resource_type')
      .optional()
      .isString()
      .isLength({ max: 50 })
      .withMessage('Resource type must be less than 50 characters'),
    body('resource_id')
      .optional()
      .isString()
      .isLength({ max: 255 })
      .withMessage('Resource ID must be less than 255 characters'),
    body('details')
      .optional()
      .isObject()
      .withMessage('Details must be a valid JSON object'),
    body('ip_address')
      .optional()
      .isIP()
      .withMessage('IP address must be valid'),
    body('user_agent')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('User agent must be less than 500 characters')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const { organizationId } = req.params;
    const {
      action,
      resource_type,
      resource_id,
      details,
      ip_address,
      user_agent
    } = req.body;

    // Verify user has access to this organization
    if (req.admin!.organization_id !== organizationId) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      return res.status(403).json(response);
    }

    const { data: auditLog, error } = await vaasSupabase
      .from('vaas_audit_logs')
      .insert([{
        organization_id: organizationId,
        admin_id: req.admin!.id,
        action,
        resource_type,
        resource_id,
        details,
        ip_address: ip_address || req.ip,
        user_agent: user_agent || req.get('User-Agent'),
        created_at: new Date().toISOString()
      }])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create audit log: ${error.message}`);
    }

    const response: VaasApiResponse = {
      success: true,
      data: auditLog
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('[AuditLogs] Failed to create audit log:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error.message || 'Failed to create audit log entry'
      }
    };
    res.status(500).json(response);
  }
});

// Export audit logs
router.get('/:organizationId/audit-logs/export',
  [
    param('organizationId')
      .isUUID()
      .withMessage('Invalid organization ID format'),
    query('format')
      .optional()
      .isIn(['csv', 'json'])
      .withMessage('Format must be csv or json'),
    query('start_date')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in ISO8601 format'),
    query('end_date')
      .optional()
      .isISO8601()
      .withMessage('End date must be in ISO8601 format')
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }

    const { organizationId } = req.params;
    const { format = 'json', start_date, end_date } = req.query;

    // Verify user has access to this organization
    if (req.admin!.organization_id !== organizationId) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      return res.status(403).json(response);
    }

    // Build query
    let query = vaasSupabase
      .from('vaas_audit_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (start_date) {
      query = query.gte('created_at', start_date as string);
    }
    if (end_date) {
      query = query.lte('created_at', end_date as string);
    }

    // Limit export to prevent abuse
    query = query.limit(10000);

    const { data: auditLogs, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch audit logs for export: ${error.message}`);
    }

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = 'timestamp,admin_id,action,resource_type,resource_id,ip_address,user_agent\n';
      const csvRows = (auditLogs || []).map(log => 
        `${log.created_at},${log.admin_id},${log.action},${log.resource_type || ''},${log.resource_id || ''},${log.ip_address || ''},${log.user_agent || ''}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${organizationId}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeaders + csvRows);
    } else {
      // Return as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${organizationId}-${new Date().toISOString().split('T')[0]}.json"`);
      res.json({
        export_date: new Date().toISOString(),
        organization_id: organizationId,
        total_records: auditLogs?.length || 0,
        audit_logs: auditLogs || []
      });
    }
  } catch (error: any) {
    console.error('[AuditLogs] Failed to export audit logs:', error);
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'EXPORT_ERROR',
        message: error.message || 'Failed to export audit logs'
      }
    };
    res.status(500).json(response);
  }
});

export default router;