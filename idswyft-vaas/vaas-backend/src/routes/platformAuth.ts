import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformNotificationService } from '../services/platformNotificationService.js';

const router = Router();

// Platform admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
      };
      return res.status(400).json(response);
    }

    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .select('id, email, password_hash, first_name, last_name, role, status, login_count')
      .eq('email', email)
      .single();

    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      };
      return res.status(401).json(response);
    }

    if (admin.status !== 'active') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive. Contact a super admin.' }
      };
      return res.status(403).json(response);
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      };
      res.status(401).json(response);

      // Fire-and-forget security notification
      platformNotificationService.emit({
        type: 'security.failed_login',
        severity: 'warning',
        title: 'Failed platform admin login attempt',
        message: `Failed login attempt for ${email} from IP ${req.ip}.`,
        source: 'platform-auth',
        metadata: { email, ip: req.ip },
      }).catch(() => {});
      return;
    }

    // Generate JWT — `role: 'platform'` distinguishes from org admin tokens
    const token = jwt.sign(
      { platform_admin_id: admin.id, role: 'platform', email: admin.email },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // Update login stats
    await vaasSupabase
      .from('platform_admins')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (admin.login_count || 0) + 1,
      })
      .eq('id', admin.id);

    const response: VaasApiResponse = {
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          first_name: admin.first_name,
          last_name: admin.last_name,
          role: admin.role,
          status: admin.status,
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('Platform admin login error:', error);
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'LOGIN_FAILED', message: 'Login failed. Please try again.' }
    };
    res.status(500).json(response);
  }
});

// Stateless logout (client clears token)
router.post('/logout', requirePlatformAdmin as any, async (req, res) => {
  const response: VaasApiResponse = {
    success: true,
    data: { message: 'Logged out successfully' },
  };
  res.json(response);
});

// Get current platform admin info
router.get('/me', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .select('id, email, first_name, last_name, role, status, last_login_at, login_count, created_at, updated_at')
      .eq('id', req.platformAdmin!.id)
      .single();

    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ADMIN_NOT_FOUND', message: 'Platform admin not found' }
      };
      return res.status(404).json(response);
    }

    const response: VaasApiResponse = {
      success: true,
      data: { admin },
    };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_ADMIN_FAILED', message: error.message }
    };
    res.status(500).json(response);
  }
});

// Change own password
router.post('/change-password', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Current password and new password are required' }
      };
      return res.status(400).json(response);
    }

    if (new_password.length < 8) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' }
      };
      return res.status(400).json(response);
    }

    // Fetch current hash
    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .select('password_hash')
      .eq('id', req.platformAdmin!.id)
      .single();

    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'ADMIN_NOT_FOUND', message: 'Admin not found' }
      };
      return res.status(404).json(response);
    }

    const match = await bcrypt.compare(current_password, admin.password_hash);
    if (!match) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' }
      };
      return res.status(401).json(response);
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await vaasSupabase
      .from('platform_admins')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', req.platformAdmin!.id);

    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Password changed successfully' },
    };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'PASSWORD_CHANGE_FAILED', message: 'Failed to change password' }
    };
    res.status(500).json(response);
  }
});

// ── Admin management (platform super_admin only) ──────────────────────────

// GET /api/platform/auth/admins — list all platform admins
router.get('/admins', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const { data: admins, error } = await vaasSupabase
      .from('platform_admins')
      .select('id, email, first_name, last_name, role, status, last_login_at, login_count, created_at')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const response: VaasApiResponse = { success: true, data: admins };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_ADMINS_FAILED', message: error.message }
    };
    res.status(500).json(response);
  }
});

// POST /api/platform/auth/admins — create a new platform admin
router.post('/admins', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    // Only super_admins can create other admins
    if (req.platformAdmin!.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Only super admins can create platform admins' }
      };
      return res.status(403).json(response);
    }

    const { email, password, first_name, last_name, role } = req.body;

    if (!email || !password) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
      };
      return res.status(400).json(response);
    }

    if (password.length < 8) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }
      };
      return res.status(400).json(response);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: admin, error } = await vaasSupabase
      .from('platform_admins')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || 'admin',
        status: 'active',
      })
      .select('id, email, first_name, last_name, role, status, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        const response: VaasApiResponse = {
          success: false,
          error: { code: 'EMAIL_TAKEN', message: 'A platform admin with this email already exists' }
        };
        return res.status(409).json(response);
      }
      throw new Error(error.message);
    }

    const response: VaasApiResponse = { success: true, data: admin };
    res.status(201).json(response);

    // Fire-and-forget security notification
    platformNotificationService.emit({
      type: 'security.admin_created',
      severity: 'info',
      title: 'Platform admin created',
      message: `New platform admin "${email}" (${role || 'admin'}) created by ${req.platformAdmin!.email}.`,
      source: 'platform-auth',
      metadata: { new_admin_id: admin.id, new_admin_email: email, role: role || 'admin', created_by: req.platformAdmin!.id },
    }).catch(() => {});
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'CREATE_ADMIN_FAILED', message: error.message }
    };
    res.status(500).json(response);
  }
});

// DELETE /api/platform/auth/admins/:id — delete a platform admin
router.delete('/admins/:id', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    if (req.platformAdmin!.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Only super admins can delete platform admins' }
      };
      return res.status(403).json(response);
    }

    // Prevent self-deletion
    if (req.params.id === req.platformAdmin!.id) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account' }
      };
      return res.status(400).json(response);
    }

    const { error } = await vaasSupabase
      .from('platform_admins')
      .delete()
      .eq('id', req.params.id);

    if (error) throw new Error(error.message);

    const response: VaasApiResponse = { success: true, data: { message: 'Admin deleted' } };
    res.json(response);

    // Fire-and-forget security notification
    platformNotificationService.emit({
      type: 'security.admin_deleted',
      severity: 'warning',
      title: 'Platform admin deleted',
      message: `Platform admin ${req.params.id} deleted by ${req.platformAdmin!.email}.`,
      source: 'platform-auth',
      metadata: { deleted_admin_id: req.params.id, deleted_by: req.platformAdmin!.id },
    }).catch(() => {});
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'DELETE_ADMIN_FAILED', message: error.message }
    };
    res.status(500).json(response);
  }
});

export default router;
