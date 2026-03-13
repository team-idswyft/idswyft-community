import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { organizationService } from '../services/organizationService.js';
import { emailService } from '../services/emailService.js';
import config from '../config/index.js';
import { VaasApiResponse, VaasCreateOrganizationRequest, VaasEnterpriseSignupRequest } from '../types/index.js';
import { validateCreateOrganization, validateEnterpriseSignup } from '../middleware/validation.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// Enterprise signup - public endpoint
router.post('/signup', validateEnterpriseSignup, async (req, res) => {
  try {
    const signupData: VaasEnterpriseSignupRequest = req.body;
    const result = await organizationService.createEnterpriseSignup(signupData);
    
    // Send welcome email with credentials + verification link
    try {
      const dashboardUrl = process.env.VAAS_ADMIN_URL || 'https://app.idswyft.app';

      // Generate verification token so the welcome email includes a verify link
      const verificationToken = jwt.sign(
        { email: signupData.email, type: 'email_verification' },
        config.jwtSecret,
        { expiresIn: '72h' }
      );
      const verifyUrl = `${dashboardUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(signupData.email)}`;

      await emailService.sendWelcomeEmail({
        organization: result.organization,
        adminEmail: signupData.email,
        adminName: `${signupData.firstName} ${signupData.lastName}`,
        adminPassword: result.adminPassword,
        dashboardUrl,
        verifyUrl
      });
      
      // Send notification to admin team
      await emailService.sendNotificationToAdmin({
        organizationName: signupData.company,
        adminName: `${signupData.firstName} ${signupData.lastName}`,
        adminEmail: signupData.email,
        jobTitle: signupData.jobTitle,
        estimatedVolume: signupData.estimatedVolume,
        useCase: signupData.useCase,
        signupId: result.signupId
      });
      
      console.log('✅ Welcome email and admin notification sent successfully');
    } catch (emailError) {
      console.error('Failed to send emails:', emailError);
      // Don't fail the entire signup process for email issues
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          subscription_tier: result.organization.subscription_tier
        },
        message: 'Organization created successfully! You will receive login credentials via email within 24 hours.',
        signup_id: result.signupId
      }
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    console.error('Enterprise signup error:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'ENTERPRISE_SIGNUP_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Create new organization (super admin only)
router.post('/', requireSuperAdmin, validateCreateOrganization, async (req, res) => {
  try {
    const organizationData: VaasCreateOrganizationRequest = req.body;
    const organization = await organizationService.createOrganization(organizationData);
    
    const response: VaasApiResponse = {
      success: true,
      data: organization
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Get organization details (admin must belong to org)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    
    // Check if admin belongs to this organization
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    const organization = await organizationService.getOrganizationById(id);
    
    if (!organization) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Organization not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: organization
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Update organization (owner/admin only)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    const updates = req.body;
    
    // Check permissions
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    // Only owners can update certain fields
    if (admin.role !== 'owner' && admin.role !== 'super_admin') {
      if (updates.subscription_tier || updates.billing_status || updates.stripe_customer_id) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Only organization owners can update billing settings'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    const organization = await organizationService.updateOrganization(id, updates);
    
    const response: VaasApiResponse = {
      success: true,
      data: organization
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Delete organization (super admin only)
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await organizationService.deleteOrganization(id);
    
    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Organization deleted successfully' }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DELETE_ORGANIZATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// List organizations (super admin only)
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 20, 100);
    
    const { organizations, total } = await organizationService.listOrganizations(page, perPage);
    
    const response: VaasApiResponse = {
      success: true,
      data: organizations,
      meta: {
        total,
        page,
        per_page: perPage,
        has_more: total > page * perPage
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIST_ORGANIZATIONS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get organization usage and billing info
router.get('/:id/usage', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    
    // Check permissions
    if (admin.organization_id !== id && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this organization'
        }
      };
      
      return res.status(403).json(response);
    }
    
    // Check if admin has billing permissions
    if (!admin.permissions.manage_billing && admin.role !== 'owner' && admin.role !== 'super_admin') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'No permission to view billing information'
        }
      };
      
      return res.status(403).json(response);
    }
    
    const usage = await organizationService.getOrganizationUsage(id);
    
    const response: VaasApiResponse = {
      success: true,
      data: usage
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_USAGE_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

export default router;