import config from '../config/index.js';
import { VaasOrganization, VaasAdmin } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';

interface WelcomeEmailData {
  organization: VaasOrganization;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  dashboardUrl: string;
  verifyUrl?: string;
}

interface NotificationEmailData {
  organizationName: string;
  adminName: string;
  adminEmail: string;
  jobTitle: string;
  estimatedVolume: string;
  useCase: string;
  signupId: string;
}

interface VerificationEmailData {
  adminEmail: string;
  adminName: string;
  organizationName: string;
  verificationToken: string;
  dashboardUrl: string;
}

interface VerificationInvitationData {
  userEmail: string;
  userName: string;
  organizationName: string;
  verificationUrl: string;
  expiresAt: string;
  customMessage?: string;
  organizationBranding?: {
    primary_color?: string;
    logo_url?: string;
    company_name?: string;
    welcome_message?: string;
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface EmailConfig {
  logo_url: string | null;
  primary_color: string;
  footer_text: string;
  company_name: string;
  from_email: string;
}

// ── Dark-theme constants (matching C tokens from frontend/src/theme.ts) ─────
const BG       = '#080c14';
const PANEL    = '#0b0f19';
const CARD     = '#0f1420';
const CARD_ALT = '#141c2e';
const TEXT     = '#dde2ec';
const MUTED    = '#8896aa';
const DIM      = '#4a5568';
const BORDER   = 'rgba(255,255,255,0.07)';
const BORDER_S = 'rgba(255,255,255,0.13)';

// Guilloche SVG rosette pattern — base64-encoded for email compatibility.
// Creates overlapping ellipses at 30-degree intervals (identity-document aesthetic).
function guillochePatternSvg(accentColor: string): string {
  const opacity = 0.07;
  const r = (a: number) => `<ellipse cx="60" cy="60" rx="42" ry="18" fill="none" stroke="${accentColor}" stroke-opacity="${opacity}" stroke-width="0.6" transform="rotate(${a},60,60)"/>`;
  const circles = [12, 20, 30, 42, 54].map(
    (rad, i) => `<circle cx="60" cy="60" r="${rad}" fill="none" stroke="${accentColor}" stroke-opacity="${0.04 + i * 0.008}" stroke-width="0.5"/>`
  ).join('');
  const ellipses = [0, 30, 60, 90, 120, 150].map(a => r(a)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${circles}${ellipses}</svg>`;
}

function guillocheDataUri(accentColor: string): string {
  const svg = guillochePatternSvg(accentColor);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export class EmailService {
  private resendApiKey: string;
  private fromAddress: string;
  private isConfigured: boolean = false;

  // 5-minute cache for platform_email_config
  private emailConfigCache: EmailConfig | null = null;
  private emailConfigCacheTime: number = 0;
  private static CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY || '';
    this.fromAddress = process.env.EMAIL_FROM || 'Idswyft VaaS <noreply@mail.idswyft.app>';

    this.isConfigured = !!this.resendApiKey;

    if (this.isConfigured) {
      console.log(`✉️ Resend API configured (from: ${this.fromAddress})`);
    } else {
      console.warn('❌ Resend not configured. Emails will be logged instead of sent.');
      console.warn('Missing: RESEND_API_KEY');
    }
  }

  /**
   * Reads platform_email_config from DB with 5-minute cache.
   * Falls back to defaults if table doesn't exist or query fails.
   */
  async getEmailConfig(): Promise<EmailConfig> {
    const now = Date.now();
    if (this.emailConfigCache && (now - this.emailConfigCacheTime) < EmailService.CONFIG_CACHE_TTL) {
      return this.emailConfigCache;
    }

    const defaults: EmailConfig = {
      logo_url: null,
      primary_color: '#22d3ee',
      footer_text: 'Powered by Idswyft VaaS',
      company_name: 'Idswyft',
      from_email: 'noreply@mail.idswyft.app',
    };

    try {
      const { data, error } = await vaasSupabase
        .from('platform_email_config')
        .select('logo_url, primary_color, footer_text, company_name, from_email')
        .eq('id', 'default')
        .single();

      if (error || !data) {
        this.emailConfigCache = defaults;
      } else {
        this.emailConfigCache = {
          logo_url: data.logo_url || defaults.logo_url,
          primary_color: data.primary_color || defaults.primary_color,
          footer_text: data.footer_text || defaults.footer_text,
          company_name: data.company_name || defaults.company_name,
          from_email: data.from_email || defaults.from_email,
        };
      }
    } catch {
      this.emailConfigCache = defaults;
    }

    this.emailConfigCacheTime = now;
    return this.emailConfigCache;
  }

  // ── Email design system ────────────────────────────────────────────────

  private emailHeader(accent: string, logo: string | null, title: string, subtitle: string): string {
    const guilloche = guillocheDataUri(accent);
    const logoHtml = logo
      ? `<img src="${logo}" alt="${subtitle}" style="max-width:100px;height:auto;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">`
      : '';
    return `<div style="background:${PANEL};background-image:url('${guilloche}');background-size:120px 120px;padding:40px 24px 32px;text-align:center;border-bottom:1px solid ${BORDER};">
      ${logoHtml}
      <h1 style="margin:0;color:${TEXT};font-size:22px;font-weight:700;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;letter-spacing:-0.01em;">${title}</h1>
      <p style="margin:10px 0 0;color:${MUTED};font-size:14px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${subtitle}</p>
      <div style="width:40px;height:2px;background:${accent};margin:16px auto 0;border-radius:1px;"></div>
    </div>`;
  }

  private emailFooter(footerText: string, companyName: string): string {
    return `<div style="padding:24px 24px 28px;text-align:center;border-top:1px solid ${BORDER};background:${PANEL};">
      <div style="margin-bottom:10px;">
        <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${DIM};border-radius:3px;vertical-align:middle;margin-right:6px;text-align:center;line-height:14px;font-size:9px;color:${DIM};">&#9919;</span>
        <span style="color:${DIM};font-size:12px;vertical-align:middle;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Secured by ${companyName}</span>
      </div>
      <p style="margin:0;color:${MUTED};font-size:12px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${footerText}</p>
    </div>`;
  }

  private emailButton(accent: string, href: string, label: string): string {
    return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr><td style="border-radius:8px;background:${accent};" bgcolor="${accent}">
        <a href="${href}" target="_blank" style="display:inline-block;padding:15px 32px;color:${BG};font-size:15px;font-weight:700;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;text-decoration:none;letter-spacing:0.02em;border-radius:8px;mso-padding-alt:0;">
          ${label}
        </a>
      </td></tr>
    </table>`;
  }

  private emailWrap(inner: string, accent: string): string {
    const guilloche = guillocheDataUri(accent);
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Idswyft</title>
<style>
  @media only screen and (max-width:620px) {
    .email-outer { padding: 8px !important; }
    .email-card { border-radius: 10px !important; }
    .email-body { padding: 24px 20px !important; }
    .email-header { padding: 32px 20px 24px !important; }
    .email-footer { padding: 20px 16px 24px !important; }
    .email-h1 { font-size: 20px !important; }
    .detail-block { padding: 14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div class="email-outer" style="padding:24px 16px;background:${BG};background-image:url('${guilloche}');background-size:240px 240px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
<div class="email-card" style="max-width:600px;margin:0 auto;background:${CARD};border-radius:14px;overflow:hidden;border:1px solid ${BORDER_S};box-shadow:0 8px 32px rgba(0,0,0,0.4);">
${inner}
</div>
<!--[if mso]></td></tr></table><![endif]-->
</div>
</body></html>`;
  }

  private detailBlock(accent: string, content: string): string {
    return `<div class="detail-block" style="background:${CARD_ALT};border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:18px 20px;margin:20px 0;">
      ${content}
    </div>`;
  }

  private infoBox(borderColor: string, labelColor: string, label: string, message: string): string {
    return `<div style="background:rgba(${this.hexToRgb(borderColor)},0.06);border:1px solid rgba(${this.hexToRgb(borderColor)},0.22);border-radius:8px;padding:14px 16px;margin:18px 0;">
      <strong style="color:${labelColor};font-size:13px;">${label}</strong>
      <span style="color:${MUTED};font-size:14px;"> ${message}</span>
    </div>`;
  }

  private hexToRgb(hex: string): string {
    const h = hex.replace('#', '');
    return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
  }

  private labelRow(label: string, value: string): string {
    return `<p style="margin:6px 0;font-size:14px;line-height:1.6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
      <span style="color:${MUTED};">${label}:</span> <span style="color:${TEXT};">${value}</span>
    </p>`;
  }

  // ── Send infrastructure (unchanged) ─────────────────────────────────────

  private async sendResendRequest(options: SendEmailOptions): Promise<boolean> {
    try {
      console.log(`📧 Sending email to: ${options.to}`);
      console.log(`📧 Subject: ${options.subject}`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Resend request timeout after 8 seconds')), 8000)
      );

      // Use platform-configured from address, falling back to constructor default
      const emailConfig = await this.getEmailConfig();
      const fromAddr = emailConfig.from_email
        ? `${emailConfig.company_name} <${emailConfig.from_email}>`
        : this.fromAddress;

      const fetchPromise = fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text
        })
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`❌ Resend API error: ${response.status} ${response.statusText}`);
        console.error(`❌ Error details: ${errorText}`);
        return false;
      }

      const result = await response.json().catch(() => ({ id: 'unknown' }));
      console.log(`✅ Email sent via Resend: ${result.id || 'Success'}`);
      return true;

    } catch (error) {
      console.error('❌ Resend request failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      if (!this.isConfigured) {
        console.log('\n📧 EMAIL (not sent - Resend not configured):');
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`From: ${this.fromAddress}`);
        console.log('─'.repeat(50));
        return true; // Return true for development mode
      }

      return await this.sendResendRequest(options);

    } catch (error) {
      console.error('❌ Email service error:', error instanceof Error ? error.message : String(error));

      console.log('\n📧 EMAIL (failed to send):');
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log('─'.repeat(50));

      return false;
    }
  }

  // ── Templates (dark theme) ──────────────────────────────────────────────

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const cfg = await this.getEmailConfig();
    const accent = cfg.primary_color;
    const subject = `Welcome to ${cfg.company_name} VaaS - Your ${data.organization.name} Account is Ready!`;

    const htmlContent = this.emailWrap(`
      ${this.emailHeader(accent, cfg.logo_url, `Welcome to ${cfg.company_name}`, data.organization.name)}
      <div class="email-body" style="padding:32px 28px;color:${TEXT};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
        <p style="font-size:16px;margin:0 0 16px;line-height:1.5;">Hello <strong>${data.adminName}</strong>,</p>
        <p style="color:${MUTED};line-height:1.7;font-size:15px;margin:0 0 24px;">Your account for <strong style="color:${TEXT};">${data.organization.name}</strong> has been successfully created. Here are your login details:</p>

        ${this.detailBlock(accent, `
          <p style="margin:0 0 10px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Login Credentials</p>
          ${this.labelRow('Dashboard', `<a href="${data.dashboardUrl}" style="color:${accent};text-decoration:none;">${data.dashboardUrl}</a>`)}
          ${this.labelRow('Email', data.adminEmail)}
          ${this.labelRow('Password', `<code style="background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:${TEXT};">${data.adminPassword}</code>`)}
          ${this.labelRow('Organization', data.organization.name)}
        `)}

        ${this.infoBox('#f59e0b', '#fcd34d', 'Security Notice:', 'Please verify your email and change your password after logging in.')}

        <div style="text-align:center;margin:28px 0;">
          ${data.verifyUrl ? this.emailButton(accent, data.verifyUrl, 'Verify Email & Get Started') : this.emailButton(accent, data.dashboardUrl, 'Access Dashboard')}
        </div>
        ${data.verifyUrl ? `<p style="color:${MUTED};font-size:13px;text-align:center;margin:0;">After verifying, log in at <a href="${data.dashboardUrl}" style="color:${accent};text-decoration:none;">${data.dashboardUrl}</a></p>` : ''}

        <p style="color:${MUTED};font-size:14px;margin:28px 0 0;">Best regards,<br>The ${cfg.company_name} Team</p>
      </div>
      ${this.emailFooter(cfg.footer_text, cfg.company_name)}
    `, accent);

    const textContent = `Welcome to ${cfg.company_name} VaaS!

Hello ${data.adminName},

Your account for ${data.organization.name} has been created.
${data.verifyUrl ? `\nPlease verify your email first: ${data.verifyUrl}\n` : ''}
Login Details:
- Dashboard: ${data.dashboardUrl}
- Email: ${data.adminEmail}
- Password: ${data.adminPassword}
- Organization: ${data.organization.name}

Please verify your email and change your password after logging in.

Best regards,
The ${cfg.company_name} Team`;

    return this.sendEmail({ to: data.adminEmail, subject, html: htmlContent, text: textContent });
  }

  async sendNotificationToAdmin(data: NotificationEmailData): Promise<boolean> {
    const cfg = await this.getEmailConfig();
    const accent = cfg.primary_color;
    const subject = `New VaaS Signup: ${data.organizationName}`;

    const row = (label: string, value: string) =>
      `<tr>
        <td style="padding:10px 14px;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;border-bottom:1px solid ${BORDER};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${label}</td>
        <td style="padding:10px 14px;color:${TEXT};font-size:14px;border-bottom:1px solid ${BORDER};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${value}</td>
      </tr>`;

    const htmlContent = this.emailWrap(`
      ${this.emailHeader(accent, cfg.logo_url, 'New Enterprise Signup', cfg.company_name)}
      <div class="email-body" style="padding:32px 28px;color:${TEXT};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
        <p style="font-size:15px;color:${MUTED};margin:0 0 20px;line-height:1.6;">A new organization has signed up for ${cfg.company_name} VaaS.</p>
        <div style="background:${CARD_ALT};border-radius:8px;overflow:hidden;border:1px solid ${BORDER};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            <tbody>
              ${row('Company', `<strong>${data.organizationName}</strong>`)}
              ${row('Contact', `${data.adminName} &lt;${data.adminEmail}&gt;`)}
              ${row('Job Title', data.jobTitle)}
              ${row('Volume', `${data.estimatedVolume}/month`)}
              ${row('Use Case', data.useCase)}
              ${row('Signup ID', `<code style="background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${accent};">${data.signupId}</code>`)}
            </tbody>
          </table>
        </div>
      </div>
      ${this.emailFooter(cfg.footer_text, cfg.company_name)}
    `, accent);

    const textContent = `New VaaS Signup: ${data.organizationName}

Company: ${data.organizationName}
Contact: ${data.adminName} (${data.adminEmail})
Job Title: ${data.jobTitle}
Volume: ${data.estimatedVolume}/month
Use Case: ${data.useCase}
Signup ID: ${data.signupId}`;

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@idswyft.app';
    return this.sendEmail({ to: adminEmail, subject, html: htmlContent, text: textContent });
  }

  async sendVerificationEmail(data: VerificationEmailData): Promise<boolean> {
    const cfg = await this.getEmailConfig();
    const accent = cfg.primary_color;
    const subject = `Verify Your ${data.organizationName} Admin Account - ${cfg.company_name} VaaS`;
    const verifyUrl = `${data.dashboardUrl}/verify-email?token=${data.verificationToken}&email=${encodeURIComponent(data.adminEmail)}`;

    const htmlContent = this.emailWrap(`
      ${this.emailHeader(accent, cfg.logo_url, 'Verify Your Account', `${cfg.company_name} VaaS`)}
      <div class="email-body" style="padding:32px 28px;color:${TEXT};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
        <p style="font-size:16px;margin:0 0 16px;line-height:1.5;">Hello <strong>${data.adminName}</strong>,</p>
        <p style="color:${MUTED};line-height:1.7;font-size:15px;margin:0 0 24px;">Please verify your admin account for <strong style="color:${TEXT};">${data.organizationName}</strong> to complete your VaaS setup.</p>

        <div style="text-align:center;margin:28px 0;">
          ${this.emailButton(accent, verifyUrl, 'Verify Email Address')}
        </div>

        <p style="color:${MUTED};font-size:14px;margin:0 0 8px;">Or use this verification code:</p>
        <div style="background:${CARD_ALT};padding:18px;border-radius:8px;text-align:center;border:1px solid ${BORDER};margin:0 0 24px;">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;color:${accent};letter-spacing:0.12em;">${data.verificationToken}</div>
        </div>

        ${this.detailBlock(accent, `
          <p style="margin:0 0 12px;font-weight:600;color:${TEXT};font-size:14px;">Next Steps</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr><td style="padding:4px 0;color:${MUTED};font-size:14px;line-height:1.7;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
              <span style="color:${accent};margin-right:8px;">1.</span> Click the verification link above
            </td></tr>
            <tr><td style="padding:4px 0;color:${MUTED};font-size:14px;line-height:1.7;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
              <span style="color:${accent};margin-right:8px;">2.</span> Access your dashboard at <a href="${data.dashboardUrl}" style="color:${accent};text-decoration:none;">${data.dashboardUrl}</a>
            </td></tr>
            <tr><td style="padding:4px 0;color:${MUTED};font-size:14px;line-height:1.7;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
              <span style="color:${accent};margin-right:8px;">3.</span> Set up your organization settings
            </td></tr>
            <tr><td style="padding:4px 0;color:${MUTED};font-size:14px;line-height:1.7;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
              <span style="color:${accent};margin-right:8px;">4.</span> Start integrating the verification API
            </td></tr>
          </table>
        `)}

        <p style="color:${DIM};font-size:13px;margin:24px 0 0;">If you didn't create this account, you can safely ignore this email.</p>
      </div>
      ${this.emailFooter(cfg.footer_text, cfg.company_name)}
    `, accent);

    const textContent = `Verify Your ${data.organizationName} Admin Account - ${cfg.company_name} VaaS

Hello ${data.adminName},

Please verify your admin account for ${data.organizationName}.

Verification Link: ${verifyUrl}

Verification Code: ${data.verificationToken}

Next Steps:
- Click the verification link above
- Access your dashboard at ${data.dashboardUrl}
- Set up your organization settings
- Start integrating our verification API

If you didn't create this account, please ignore this email.`;

    return this.sendEmail({ to: data.adminEmail, subject, html: htmlContent, text: textContent });
  }

  async sendVerificationInvitation(data: VerificationInvitationData): Promise<boolean> {
    const cfg = await this.getEmailConfig();
    // Org branding overrides platform config when provided
    const accent = data.organizationBranding?.primary_color || cfg.primary_color;
    const logo = data.organizationBranding?.logo_url || cfg.logo_url;
    const companyName = data.organizationBranding?.company_name || data.organizationName;
    const welcomeMessage = data.organizationBranding?.welcome_message ||
      `Please complete your identity verification for ${data.organizationName}.`;

    const subject = `${companyName} - Verify Your Identity`;

    const stepRow = (num: string, title: string, desc: string) =>
      `<tr>
        <td style="padding:8px 12px 8px 0;vertical-align:top;width:28px;">
          <div style="width:24px;height:24px;border-radius:50%;background:rgba(${this.hexToRgb(accent)},0.12);border:1px solid rgba(${this.hexToRgb(accent)},0.3);text-align:center;line-height:24px;font-size:12px;font-weight:700;color:${accent};font-family:'IBM Plex Mono',monospace;">${num}</div>
        </td>
        <td style="padding:8px 0;vertical-align:top;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
          <strong style="color:${TEXT};font-size:14px;">${title}</strong><br>
          <span style="color:${MUTED};font-size:13px;line-height:1.5;">${desc}</span>
        </td>
      </tr>`;

    const htmlContent = this.emailWrap(`
      ${this.emailHeader(accent, logo, 'Identity Verification', companyName)}
      <div class="email-body" style="padding:32px 28px;color:${TEXT};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
        <p style="font-size:16px;margin:0 0 16px;line-height:1.5;">Hello${data.userName ? ` <strong>${data.userName}</strong>` : ''},</p>
        <p style="color:${MUTED};line-height:1.7;font-size:15px;margin:0 0 24px;">${welcomeMessage}</p>

        ${data.customMessage ? this.detailBlock(accent, `
          <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Message from ${data.organizationName}</p>
          <p style="margin:0;color:${TEXT};font-size:14px;line-height:1.6;">${data.customMessage}</p>
        `) : ''}

        <div style="text-align:center;margin:28px 0;">
          ${this.emailButton(accent, data.verificationUrl, 'Start Verification')}
        </div>

        <div style="background:${CARD_ALT};border-radius:8px;padding:20px;margin:24px 0;border:1px solid ${BORDER};">
          <p style="margin:0 0 14px;font-weight:600;color:${TEXT};font-size:14px;">What to expect</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            ${stepRow('1', 'Document Upload', 'Take photos of your government-issued ID')}
            ${stepRow('2', 'Live Capture', 'Quick camera capture for identity matching')}
            ${stepRow('3', 'Liveness Check', 'Simple verification to confirm you\'re present')}
            ${stepRow('4', 'Instant Results', 'Get verified in under 2 minutes')}
          </table>
        </div>

        ${this.infoBox('#f59e0b', '#fcd34d', 'Expires:', `This verification link expires on ${new Date(data.expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date(data.expiresAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`)}

        <p style="color:${DIM};font-size:13px;margin:24px 0 0;">
          If the button doesn't work, copy and paste this link:<br>
          <a href="${data.verificationUrl}" style="color:${accent};text-decoration:none;word-break:break-all;font-size:12px;">${data.verificationUrl}</a>
        </p>
      </div>
      <div class="email-footer" style="padding:24px 24px 28px;text-align:center;border-top:1px solid ${BORDER};background:${PANEL};">
        <p style="margin:0 0 6px;color:${MUTED};font-size:13px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Verification requested by <strong style="color:${TEXT};">${data.organizationName}</strong></p>
        <div style="margin-top:8px;">
          <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${DIM};border-radius:3px;vertical-align:middle;margin-right:6px;text-align:center;line-height:14px;font-size:9px;color:${DIM};">&#9919;</span>
          <span style="color:${DIM};font-size:12px;vertical-align:middle;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Secured by ${cfg.company_name}</span>
        </div>
        <p style="margin:6px 0 0;color:${MUTED};font-size:12px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">${cfg.footer_text}</p>
      </div>
    `, accent);

    const textContent = `Identity Verification Required - ${data.organizationName}

Hello${data.userName ? ` ${data.userName}` : ''}!

${welcomeMessage}

${data.customMessage ? `Message from ${data.organizationName}: ${data.customMessage}\n\n` : ''}Complete your verification: ${data.verificationUrl}

What to expect:
- Document Upload: Take photos of your government-issued ID
- Live Capture: Quick photo for identity matching
- Liveness Check: Simple verification to confirm you're present
- Instant Results: Get verified in under 2 minutes

IMPORTANT: This verification link expires on ${new Date(data.expiresAt).toLocaleDateString()} at ${new Date(data.expiresAt).toLocaleTimeString()}.

This verification is requested by ${data.organizationName}
${cfg.footer_text}`;

    return this.sendEmail({ to: data.userEmail, subject, html: htmlContent, text: textContent });
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!this.isConfigured) {
      return {
        connected: false,
        error: 'Resend not configured - missing RESEND_API_KEY'
      };
    }

    try {
      console.log('🔍 Testing Resend configuration...');
      return {
        connected: true,
        error: `From: ${this.fromAddress}`
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    const result = await this.testConnection();
    return result.connected;
  }
}

export const emailService = new EmailService();
