import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { VaasApiResponse } from '../types/index.js';

export interface PlatformAdminRequest extends Request {
  platformAdmin?: {
    id: string;
    email: string;
    role: string;
    first_name: string | null;
    last_name: string | null;
  };
}

export const requirePlatformAdmin = async (req: PlatformAdminRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Platform admin authentication token required' }
      };
      return res.status(401).json(response);
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwtSecret) as any;

    // Ensure this is a platform admin token, not an org admin token
    if (decoded.role !== 'platform') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid platform admin token' }
      };
      return res.status(401).json(response);
    }

    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .select('id, email, role, first_name, last_name, status')
      .eq('id', decoded.platform_admin_id)
      .single();

    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired platform admin token' }
      };
      return res.status(401).json(response);
    }

    if (admin.status !== 'active') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Platform admin account is inactive' }
      };
      return res.status(403).json(response);
    }

    req.platformAdmin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      first_name: admin.first_name,
      last_name: admin.last_name,
    };

    next();
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'AUTHENTICATION_ERROR', message: 'Platform admin authentication failed' }
    };
    res.status(401).json(response);
  }
};

/** Requires the platform admin to have the super_admin role */
export const requirePlatformSuperAdmin = async (req: PlatformAdminRequest, res: Response, next: NextFunction) => {
  // First run the base platform admin check
  await new Promise<void>((resolve, reject) => {
    requirePlatformAdmin(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  if (!req.platformAdmin) {
    return; // Base middleware already sent response
  }

  if (req.platformAdmin.role !== 'super_admin') {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Platform super admin access required' }
    };
    return res.status(403).json(response);
  }

  next();
};
