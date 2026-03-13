import { Router } from 'express';
import { vaasSupabase } from '../config/database.js';
import { VaasApiResponse } from '../types/index.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';

const router = Router();

router.use(requirePlatformAdmin as any);

// GET /api/platform/email/config — get email branding config
router.get('/config', async (req: PlatformAdminRequest, res) => {
  try {
    const { data, error } = await vaasSupabase
      .from('platform_email_config')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error) {
      // Table may not exist yet — return defaults
      const response: VaasApiResponse = {
        success: true,
        data: {
          logo_url: null,
          primary_color: '#22d3ee',
          footer_text: 'Powered by Idswyft VaaS',
          company_name: 'Idswyft',
          from_email: 'noreply@mail.idswyft.app',
        },
      };
      return res.json(response);
    }

    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'FETCH_EMAIL_CONFIG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// PUT /api/platform/email/config — update email branding
router.put('/config', async (req: PlatformAdminRequest, res) => {
  try {
    const { logo_url, primary_color, footer_text, company_name, from_email } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (footer_text !== undefined) updates.footer_text = footer_text;
    if (company_name !== undefined) updates.company_name = company_name;
    if (from_email !== undefined) updates.from_email = from_email;

    const { data, error } = await vaasSupabase
      .from('platform_email_config')
      .update(updates)
      .eq('id', 'default')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'UPDATE_EMAIL_CONFIG_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

// GET /api/platform/email/preview/:template — render preview HTML
router.get('/preview/:template', async (req: PlatformAdminRequest, res) => {
  try {
    const { template } = req.params;
    const validTemplates = ['welcome', 'notification', 'verification', 'invitation'];
    if (!validTemplates.includes(template)) {
      const response: VaasApiResponse = {
        success: false,
        error: { code: 'INVALID_TEMPLATE', message: `Valid templates: ${validTemplates.join(', ')}` },
      };
      return res.status(400).json(response);
    }

    // Get current config
    const { data: emailConfig } = await vaasSupabase
      .from('platform_email_config')
      .select('*')
      .eq('id', 'default')
      .single();

    const cfg = emailConfig || {
      logo_url: null,
      primary_color: '#22d3ee',
      footer_text: 'Powered by Idswyft VaaS',
      company_name: 'Idswyft',
    };

    const previewHtml = renderPreview(template, cfg);

    const response: VaasApiResponse = {
      success: true,
      data: { html: previewHtml, template, config: cfg },
    };
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: { code: 'PREVIEW_FAILED', message: error.message },
    };
    res.status(500).json(response);
  }
});

function renderPreview(template: string, cfg: any): string {
  const bg = '#080c14';
  const card = '#0f1420';
  const text = '#dce4ef';
  const muted = '#8896aa';
  const accent = cfg.primary_color || '#22d3ee';
  const logo = cfg.logo_url ? `<img src="${cfg.logo_url}" alt="${cfg.company_name}" style="max-width:120px;height:auto;margin-bottom:15px;">` : '';

  const titles: Record<string, string> = {
    welcome: 'Welcome — Account Ready',
    notification: 'New VaaS Signup Notification',
    verification: 'Verify Your Admin Account',
    invitation: 'Identity Verification Invitation',
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:${card};border-radius:12px;overflow:hidden;border:1px solid rgba(151,169,192,0.16);">
  <div style="background:${accent};padding:30px;text-align:center;">
    ${logo}
    <h1 style="margin:0;color:#04212a;font-size:22px;">${titles[template] || 'Email Preview'}</h1>
    <p style="margin:8px 0 0;color:rgba(4,33,42,0.7);font-size:14px;">${cfg.company_name}</p>
  </div>
  <div style="padding:30px;color:${text};">
    <p style="font-size:16px;">Hello <strong>John Doe</strong>,</p>
    <p style="color:${muted};line-height:1.6;">This is a preview of the <strong>${template}</strong> email template using your current branding configuration.</p>
    <div style="text-align:center;margin:25px 0;">
      <a href="#" style="display:inline-block;background:${accent};color:#04212a;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Action Button</a>
    </div>
    <div style="background:rgba(151,169,192,0.08);padding:16px;border-radius:8px;border-left:3px solid ${accent};margin:20px 0;">
      <p style="margin:0;color:${muted};font-size:14px;">Sample detail block for credentials, verification codes, or instructions.</p>
    </div>
  </div>
  <div style="padding:20px;text-align:center;border-top:1px solid rgba(151,169,192,0.12);color:${muted};font-size:13px;">
    ${cfg.footer_text}
  </div>
</div>
</body></html>`;
}

export default router;
