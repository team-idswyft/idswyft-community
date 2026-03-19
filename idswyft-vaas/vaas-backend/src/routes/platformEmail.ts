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
  const panel = '#0b0f19';
  const card = '#0f1420';
  const cardAlt = '#141c2e';
  const text = '#dde2ec';
  const muted = '#8896aa';
  const dim = '#4a5568';
  const border = 'rgba(255,255,255,0.07)';
  const borderS = 'rgba(255,255,255,0.13)';
  const accent = cfg.primary_color || '#22d3ee';
  const logo = cfg.logo_url ? `<img src="${cfg.logo_url}" alt="${cfg.company_name}" style="max-width:100px;height:auto;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">` : '';
  const companyName = cfg.company_name || 'Idswyft';

  // Guilloche SVG rosette pattern
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
  };
  const r = (a: number) => `<ellipse cx="60" cy="60" rx="42" ry="18" fill="none" stroke="${accent}" stroke-opacity="0.07" stroke-width="0.6" transform="rotate(${a},60,60)"/>`;
  const circles = [12, 20, 30, 42, 54].map(
    (rad, i) => `<circle cx="60" cy="60" r="${rad}" fill="none" stroke="${accent}" stroke-opacity="${0.04 + i * 0.008}" stroke-width="0.5"/>`
  ).join('');
  const ellipses = [0, 30, 60, 90, 120, 150].map(a => r(a)).join('');
  const guillocheSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${circles}${ellipses}</svg>`;
  const guilloche = `data:image/svg+xml;base64,${Buffer.from(guillocheSvg).toString('base64')}`;

  const titles: Record<string, string> = {
    welcome: `Welcome to ${companyName}`,
    notification: 'New Enterprise Signup',
    verification: 'Verify Your Account',
    invitation: 'Identity Verification',
  };

  const subtitles: Record<string, string> = {
    welcome: 'Acme Corporation',
    notification: companyName,
    verification: `${companyName} VaaS`,
    invitation: 'Acme Corporation',
  };

  // Template-specific body content
  const bodies: Record<string, string> = {
    welcome: `
      <p style="font-size:16px;margin:0 0 16px;line-height:1.5;color:${text};">Hello <strong>John Doe</strong>,</p>
      <p style="color:${muted};line-height:1.7;font-size:15px;margin:0 0 24px;">Your account for <strong style="color:${text};">Acme Corporation</strong> has been successfully created.</p>
      <div style="background:${cardAlt};border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:18px 20px;margin:20px 0;">
        <p style="margin:0 0 10px;font-size:12px;color:${muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Login Credentials</p>
        <p style="margin:6px 0;font-size:14px;color:${muted};">Dashboard: <span style="color:${accent};">https://admin.example.com</span></p>
        <p style="margin:6px 0;font-size:14px;color:${muted};">Email: <span style="color:${text};">john@acme.com</span></p>
        <p style="margin:6px 0;font-size:14px;color:${muted};">Organization: <span style="color:${text};">Acme Corporation</span></p>
      </div>
      <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.22);border-radius:8px;padding:14px 16px;margin:18px 0;">
        <strong style="color:#fcd34d;font-size:13px;">Security Notice:</strong>
        <span style="color:${muted};font-size:14px;"> Please verify your email and change your password after logging in.</span>
      </div>`,
    notification: `
      <p style="font-size:15px;color:${muted};margin:0 0 20px;line-height:1.6;">A new organization has signed up for ${companyName} VaaS.</p>
      <div style="background:${cardAlt};border-radius:8px;overflow:hidden;border:1px solid ${border};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 14px;color:${muted};font-size:13px;border-bottom:1px solid ${border};">Company</td><td style="padding:10px 14px;color:${text};font-size:14px;border-bottom:1px solid ${border};"><strong>Acme Corporation</strong></td></tr>
          <tr><td style="padding:10px 14px;color:${muted};font-size:13px;border-bottom:1px solid ${border};">Contact</td><td style="padding:10px 14px;color:${text};font-size:14px;border-bottom:1px solid ${border};">John Doe &lt;john@acme.com&gt;</td></tr>
          <tr><td style="padding:10px 14px;color:${muted};font-size:13px;">Volume</td><td style="padding:10px 14px;color:${text};font-size:14px;">1,000/month</td></tr>
        </table>
      </div>`,
    verification: `
      <p style="font-size:16px;margin:0 0 16px;line-height:1.5;color:${text};">Hello <strong>John Doe</strong>,</p>
      <p style="color:${muted};line-height:1.7;font-size:15px;margin:0 0 24px;">Please verify your admin account for <strong style="color:${text};">Acme Corporation</strong> to complete your VaaS setup.</p>
      <p style="color:${muted};font-size:14px;margin:0 0 8px;">Or use this verification code:</p>
      <div style="background:${cardAlt};padding:18px;border-radius:8px;text-align:center;border:1px solid ${border};margin:0 0 20px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;color:${accent};letter-spacing:0.12em;">ABC123XYZ</div>
      </div>`,
    invitation: `
      <p style="font-size:16px;margin:0 0 16px;line-height:1.5;color:${text};">Hello <strong>Jane Smith</strong>,</p>
      <p style="color:${muted};line-height:1.7;font-size:15px;margin:0 0 24px;">Please complete your identity verification for Acme Corporation.</p>
      <div style="background:${cardAlt};border-radius:8px;padding:20px;margin:20px 0;border:1px solid ${border};">
        <p style="margin:0 0 14px;font-weight:600;color:${text};font-size:14px;">What to expect</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr><td style="padding:6px 10px 6px 0;vertical-align:top;width:28px;"><div style="width:24px;height:24px;border-radius:50%;background:rgba(${hexToRgb(accent)},0.12);border:1px solid rgba(${hexToRgb(accent)},0.3);text-align:center;line-height:24px;font-size:12px;font-weight:700;color:${accent};">1</div></td><td style="padding:6px 0;"><strong style="color:${text};font-size:14px;">Document Upload</strong><br><span style="color:${muted};font-size:13px;">Government-issued ID photos</span></td></tr>
          <tr><td style="padding:6px 10px 6px 0;vertical-align:top;"><div style="width:24px;height:24px;border-radius:50%;background:rgba(${hexToRgb(accent)},0.12);border:1px solid rgba(${hexToRgb(accent)},0.3);text-align:center;line-height:24px;font-size:12px;font-weight:700;color:${accent};">2</div></td><td style="padding:6px 0;"><strong style="color:${text};font-size:14px;">Live Capture</strong><br><span style="color:${muted};font-size:13px;">Quick identity matching</span></td></tr>
          <tr><td style="padding:6px 10px 6px 0;vertical-align:top;"><div style="width:24px;height:24px;border-radius:50%;background:rgba(${hexToRgb(accent)},0.12);border:1px solid rgba(${hexToRgb(accent)},0.3);text-align:center;line-height:24px;font-size:12px;font-weight:700;color:${accent};">3</div></td><td style="padding:6px 0;"><strong style="color:${text};font-size:14px;">Instant Results</strong><br><span style="color:${muted};font-size:13px;">Verified in under 2 minutes</span></td></tr>
        </table>
      </div>`,
  };

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<style>
  @media only screen and (max-width:620px) {
    .email-outer { padding: 8px !important; }
    .email-card { border-radius: 10px !important; }
    .email-body { padding: 24px 20px !important; }
    .email-header { padding: 32px 20px 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${bg};-webkit-text-size-adjust:100%;">
<div class="email-outer" style="padding:24px 16px;background:${bg};background-image:url('${guilloche}');background-size:240px 240px;">
<div class="email-card" style="max-width:600px;margin:0 auto;background:${card};border-radius:14px;overflow:hidden;border:1px solid ${borderS};box-shadow:0 8px 32px rgba(0,0,0,0.4);">
  <div class="email-header" style="background:${panel};background-image:url('${guilloche}');background-size:120px 120px;padding:40px 24px 32px;text-align:center;border-bottom:1px solid ${border};">
    ${logo}
    <h1 style="margin:0;color:${text};font-size:22px;font-weight:700;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;letter-spacing:-0.01em;">${titles[template] || 'Email Preview'}</h1>
    <p style="margin:10px 0 0;color:${muted};font-size:14px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${subtitles[template] || companyName}</p>
    <div style="width:40px;height:2px;background:${accent};margin:16px auto 0;border-radius:1px;"></div>
  </div>
  <div class="email-body" style="padding:32px 28px;color:${text};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
    ${bodies[template] || `<p style="color:${muted};">Template preview</p>`}
    <div style="text-align:center;margin:28px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td style="border-radius:8px;background:${accent};" bgcolor="${accent}">
          <a href="#" style="display:inline-block;padding:15px 32px;color:${bg};font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.02em;border-radius:8px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Action Button</a>
        </td></tr>
      </table>
    </div>
  </div>
  <div style="padding:24px 24px 28px;text-align:center;border-top:1px solid ${border};background:${panel};">
    <div style="margin-bottom:10px;">
      <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${dim};border-radius:3px;vertical-align:middle;margin-right:6px;text-align:center;line-height:14px;font-size:9px;color:${dim};">&#9919;</span>
      <span style="color:${dim};font-size:12px;vertical-align:middle;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Secured by ${companyName}</span>
    </div>
    <p style="margin:0;color:${muted};font-size:12px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${cfg.footer_text}</p>
  </div>
</div>
</div>
</body></html>`;
}

export default router;
