import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { VaasApiResponse } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';

const router = Router();

/**
 * GET /api/platform/audit-logs
 * Cross-org audit log listing with optional organization_id filter.
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be between 1 and 100'),
    query('action').optional().isString().withMessage('Action must be a string'),
    query('admin_id').optional().isUUID().withMessage('Admin ID must be a valid UUID'),
    query('organization_id').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
    query('start_date').optional().isISO8601().withMessage('Start date must be in ISO8601 format'),
    query('end_date').optional().isISO8601().withMessage('End date must be in ISO8601 format'),
  ],
  requirePlatformAdmin as any,
  async (req: PlatformAdminRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() },
        } as VaasApiResponse);
      }

      const {
        page = 1,
        per_page = 20,
        action,
        admin_id,
        organization_id,
        start_date,
        end_date,
      } = req.query;

      let dbQuery = vaasSupabase
        .from('vaas_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (organization_id) dbQuery = dbQuery.eq('organization_id', organization_id);
      if (action) dbQuery = dbQuery.eq('action', action);
      if (admin_id) dbQuery = dbQuery.eq('admin_id', admin_id);
      if (start_date) dbQuery = dbQuery.gte('created_at', start_date);
      if (end_date) dbQuery = dbQuery.lte('created_at', end_date);

      const offset = (Number(page) - 1) * Number(per_page);
      dbQuery = dbQuery.range(offset, offset + Number(per_page) - 1);

      const { data: auditLogs, error, count } = await dbQuery;

      if (error) {
        throw new Error(`Failed to fetch audit logs: ${error.message}`);
      }

      const totalPages = Math.ceil((count || 0) / Number(per_page));

      res.json({
        success: true,
        data: {
          audit_logs: auditLogs || [],
          meta: {
            total_count: count || 0,
            page: Number(page),
            per_page: Number(per_page),
            total_pages: totalPages,
            has_more: Number(page) < totalPages,
          },
        },
      } as VaasApiResponse);
    } catch (error: any) {
      console.error('[PlatformAuditLogs] Failed to fetch audit logs:', error);
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message || 'Failed to fetch audit logs' },
      } as VaasApiResponse);
    }
  }
);

/**
 * GET /api/platform/audit-logs/stats
 * Cross-org aggregate statistics.
 */
router.get('/stats',
  [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
    query('organization_id').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
  ],
  requirePlatformAdmin as any,
  async (req: PlatformAdminRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() },
        } as VaasApiResponse);
      }

      const { days = 30, organization_id } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));

      let countQuery = vaasSupabase
        .from('vaas_audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString());

      if (organization_id) countQuery = countQuery.eq('organization_id', organization_id);

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw new Error(`Failed to count audit logs: ${countError.message}`);

      let actionQuery = vaasSupabase
        .from('vaas_audit_logs')
        .select('action')
        .gte('created_at', startDate.toISOString());

      if (organization_id) actionQuery = actionQuery.eq('organization_id', organization_id);

      const { data: actionStats, error: actionError } = await actionQuery;
      if (actionError) throw new Error(`Failed to get action statistics: ${actionError.message}`);

      const actionBreakdown = (actionStats || []).reduce((acc: any, log: any) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          total_logs: totalCount || 0,
          period_days: Number(days),
          action_breakdown: actionBreakdown,
          most_active_actions: Object.entries(actionBreakdown)
            .sort(([, a]: any, [, b]: any) => b - a)
            .slice(0, 5)
            .map(([action, count]) => ({ action, count })),
        },
      } as VaasApiResponse);
    } catch (error: any) {
      console.error('[PlatformAuditLogs] Failed to fetch stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'STATS_ERROR', message: error.message || 'Failed to fetch audit log statistics' },
      } as VaasApiResponse);
    }
  }
);

/**
 * GET /api/platform/audit-logs/export
 * Cross-org CSV/JSON export.
 */
router.get('/export',
  [
    query('format').optional().isIn(['csv', 'json']).withMessage('Format must be csv or json'),
    query('organization_id').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
    query('start_date').optional().isISO8601().withMessage('Start date must be in ISO8601 format'),
    query('end_date').optional().isISO8601().withMessage('End date must be in ISO8601 format'),
  ],
  requirePlatformAdmin as any,
  async (req: PlatformAdminRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() },
        } as VaasApiResponse);
      }

      const { format = 'json', organization_id, start_date, end_date } = req.query;

      let dbQuery = vaasSupabase
        .from('vaas_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (organization_id) dbQuery = dbQuery.eq('organization_id', organization_id);
      if (start_date) dbQuery = dbQuery.gte('created_at', start_date as string);
      if (end_date) dbQuery = dbQuery.lte('created_at', end_date as string);

      dbQuery = dbQuery.limit(10000);

      const { data: auditLogs, error } = await dbQuery;

      if (error) {
        throw new Error(`Failed to fetch audit logs for export: ${error.message}`);
      }

      const dateStamp = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        // Escape CSV fields: quote values, double internal quotes, neutralise formula injection
        const esc = (val: any): string => {
          const s = String(val ?? '');
          if (!s) return '""';
          const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return `"${safe.replace(/"/g, '""')}"`;
        };

        const csvHeaders = 'timestamp,organization_id,admin_id,action,resource_type,resource_id,ip_address,user_agent\n';
        const csvRows = (auditLogs || []).map(log =>
          [log.created_at, log.organization_id, log.admin_id, log.action, log.resource_type, log.resource_id, log.ip_address, log.user_agent].map(esc).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-platform-${dateStamp}.csv"`);
        res.send(csvHeaders + csvRows);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-platform-${dateStamp}.json"`);
        res.json({
          export_date: new Date().toISOString(),
          total_records: auditLogs?.length || 0,
          audit_logs: auditLogs || [],
        });
      }
    } catch (error: any) {
      console.error('[PlatformAuditLogs] Failed to export:', error);
      res.status(500).json({
        success: false,
        error: { code: 'EXPORT_ERROR', message: error.message || 'Failed to export audit logs' },
      } as VaasApiResponse);
    }
  }
);

export default router;
