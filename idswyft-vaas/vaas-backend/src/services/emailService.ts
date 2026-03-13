import config from '../config/index.js';
import { VaasOrganization, VaasAdmin } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';

interface WelcomeEmailData {
  organization: VaasOrganization;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  dashboardUrl: string;
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

// ── Dark-theme constants ────────────────────────────────────────────────────
const BG = '#080c14';
const CARD = '#0f1420';
const CARD_ALT = '#141c2e';
const TEXT = '#dce4ef';
const MUTED = '#8896aa';
const BORDER = 'rgba(151,169,192,0.16)';

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

  // ── Dark-theme helpers ──────────────────────────────────────────────────

  private darkHeader(accent: string, logo: string | null, title: string, subtitle: string): string {
    const logoHtml = logo ? `<img src="${logo}" alt="${subtitle}" style="max-width:120px;height:auto;margin-bottom:14px;">` : '';
    return `<div style="background:${accent};padding:32px 30px;text-align:center;border-radius:12px 12px 0 0;">
      ${logoHtml}
      <h1 style="margin:0;color:#04212a;font-size:22px;font-weight:700;">${title}</h1>
      <p style="margin:8px 0 0;color:rgba(4,33,42,0.72);font-size:14px;">${subtitle}</p>
    </div>`;
  }

  private darkFooter(footerText: string): string {
    return `<div style="padding:22px;text-align:center;border-top:1px solid ${BORDER};color:${MUTED};font-size:13px;">
      ${footerText}
    </div>`;
  }

  private darkButton(accent: string, href: string, label: string): string {
    return `<a href="${href}" style="display:inline-block;background:${accent};color:#04212a;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(0,0,0,0.25);">${label}</a>`;
  }

  private darkWrap(inner: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:20px;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:${CARD};border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
${inner}
</div></body></html>`;
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

    const htmlContent = this.darkWrap(`
      ${this.darkHeader(accent, cfg.logo_url, `Welcome to ${cfg.company_name} VaaS`, data.organization.name)}
      <div style="padding:30px;color:${TEXT};">
        <p style="font-size:17px;margin:0 0 16px;">Hello <strong>${data.adminName}</strong>,</p>
        <p style="color:${MUTED};line-height:1.7;">Your account for <strong style="color:${TEXT};">${data.organization.name}</strong> has been successfully created.</p>

        <div style="background:${CARD_ALT};border-left:3px solid ${accent};border-radius:8px;padding:18px;margin:22px 0;">
          <p style="margin:0 0 6px;font-size:13px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Login Credentials</p>
          <p style="margin:4px 0;color:${TEXT};"><strong>Dashboard:</strong> <a href="${data.dashboardUrl}" style="color:${accent};">${data.dashboardUrl}</a></p>
          <p style="margin:4px 0;color:${TEXT};"><strong>Email:</strong> ${data.adminEmail}</p>
          <p style="margin:4px 0;color:${TEXT};"><strong>Password:</strong> <code style="background:rgba(151,169,192,0.12);padding:2px 6px;border-radius:4px;">${data.adminPassword}</code></p>
          <p style="margin:4px 0;color:${TEXT};"><strong>Organization:</strong> ${data.organization.name}</p>
        </div>

        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.28);border-radius:8px;padding:14px;margin:18px 0;">
          <strong style="color:#fcd34d;">Important:</strong> <span style="color:${MUTED};">Please change your password after logging in.</span>
        </div>

        <div style="text-align:center;margin:24px 0;">
          ${this.darkButton(accent, data.dashboardUrl, 'Access Dashboard')}
        </div>

        <p style="color:${MUTED};font-size:14px;">Best regards,<br>The ${cfg.company_name} Team</p>
      </div>
      ${this.darkFooter(cfg.footer_text)}
    `);

    const textContent = `Welcome to ${cfg.company_name} VaaS!

Hello ${data.adminName},

Your account for ${data.organization.name} has been created.

Login Details:
- Dashboard: ${data.dashboardUrl}
- Email: ${data.adminEmail}
- Password: ${data.adminPassword}
- Organization: ${data.organization.name}

Please change your password after logging in.

Best regards,
The ${cfg.company_name} Team`;

    return this.sendEmail({ to: data.adminEmail, subject, html: htmlContent, text: textContent });
  }

  async sendNotificationToAdmin(data: NotificationEmailData): Promise<boolean> {
    const cfg = await this.getEmailConfig();
    const accent = cfg.primary_color;
    const subject = `New VaaS Signup: ${data.organizationName}`;

    const row = (label: string, value: string) =>
      `<tr><td style="padding:8px 12px;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:${TEXT};font-size:14px;">${value}</td></tr>`;

    const htmlContent = this.darkWrap(`
      ${this.darkHeader(accent, cfg.logo_url, 'New VaaS Enterprise Signup', cfg.company_name)}
      <div style="padding:30px;color:${TEXT};">
        <div style="background:${CARD_ALT};border-radius:8px;overflow:hidden;margin:0 0 20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tbody>
              ${row('Company', data.organizationName)}
              ${row('Contact', `${data.adminName} (${data.adminEmail})`)}
              ${row('Job Title', data.jobTitle)}
              ${row('Volume', `${data.estimatedVolume}/month`)}
              ${row('Use Case', data.useCase)}
              ${row('Signup ID', `<code style="background:rgba(151,169,192,0.12);padding:2px 6px;border-radius:4px;font-size:12px;">${data.signupId}</code>`)}
            </tbody>
          </table>
        </div>
      </div>
      ${this.darkFooter(cfg.footer_text)}
    `);

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

    const htmlContent = this.darkWrap(`
      ${this.darkHeader(accent, cfg.logo_url, 'Verify Your Admin Account', `${cfg.company_name} VaaS`)}
      <div style="padding:30px;color:${TEXT};">
        <p style="font-size:17px;margin:0 0 16px;">Hello <strong>${data.adminName}</strong>,</p>
        <p style="color:${MUTED};line-height:1.7;">Please verify your admin account for <strong style="color:${TEXT};">${data.organizationName}</strong> to complete your VaaS setup.</p>

        <div style="text-align:center;margin:24px 0;">
          ${this.darkButton(accent, verifyUrl, 'Verify Email Address')}
        </div>

        <p style="color:${MUTED};font-size:14px;">Or use this verification code:</p>
        <div style="background:${CARD_ALT};padding:16px;border-radius:8px;text-align:center;font-family:monospace;font-size:16px;color:${TEXT};letter-spacing:0.05em;margin:12px 0;">
          <strong>${data.verificationToken}</strong>
        </div>

        <div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.18);border-radius:8px;padding:18px;margin:22px 0;">
          <p style="margin:0 0 10px;font-weight:600;color:${TEXT};">Next Steps:</p>
          <ul style="margin:0;padding-left:18px;color:${MUTED};line-height:1.8;">
            <li>Click the verification link above</li>
            <li>Access your dashboard at <a href="${data.dashboardUrl}" style="color:${accent};">${data.dashboardUrl}</a></li>
            <li>Set up your organization settings</li>
            <li>Start integrating our verification API</li>
          </ul>
        </div>

        <p style="color:${MUTED};font-size:13px;">If you didn't create this account, please ignore this email.</p>
      </div>
      ${this.darkFooter(cfg.footer_text)}
    `);

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

    const htmlContent = this.darkWrap(`
      ${this.darkHeader(accent, logo, 'Identity Verification', companyName)}
      <div style="padding:30px;color:${TEXT};">
        <p style="font-size:17px;margin:0 0 16px;">Hello${data.userName ? ` <strong>${data.userName}</strong>` : ''}!</p>
        <p style="color:${MUTED};line-height:1.7;">${welcomeMessage}</p>

        ${data.customMessage ? `
        <div style="background:${CARD_ALT};border-left:3px solid ${accent};border-radius:8px;padding:16px;margin:18px 0;">
          <strong style="color:${TEXT};">Message from ${data.organizationName}:</strong><br>
          <span style="color:${MUTED};">${data.customMessage}</span>
        </div>
        ` : ''}

        <div style="text-align:center;margin:24px 0;">
          ${this.darkButton(accent, data.verificationUrl, 'Start Verification')}
        </div>

        <div style="background:${CARD_ALT};border-radius:8px;padding:18px;margin:22px 0;">
          <p style="margin:0 0 10px;font-weight:600;color:${TEXT};">What to expect:</p>
          <ul style="margin:0;padding-left:18px;color:${MUTED};line-height:1.8;">
            <li><strong style="color:${TEXT};">Document Upload:</strong> Take photos of your government-issued ID</li>
            <li><strong style="color:${TEXT};">Live Capture:</strong> Quick photo for identity matching</li>
            <li><strong style="color:${TEXT};">Liveness Check:</strong> Simple verification to confirm you're present</li>
            <li><strong style="color:${TEXT};">Instant Results:</strong> Get verified in under 2 minutes</li>
          </ul>
        </div>

        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.24);border-radius:8px;padding:14px;margin:18px 0;">
          <strong style="color:#fcd34d;">Important:</strong>
          <span style="color:${MUTED};"> This verification link expires on ${new Date(data.expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date(data.expiresAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.</span>
        </div>

        <p style="color:${MUTED};font-size:13px;margin-top:24px;">
          If you're having trouble with the button, copy and paste this link:<br>
          <a href="${data.verificationUrl}" style="color:${accent};word-break:break-all;">${data.verificationUrl}</a>
        </p>
      </div>
      <div style="padding:22px;text-align:center;border-top:1px solid ${BORDER};color:${MUTED};font-size:13px;">
        <p style="margin:0 0 4px;">This verification is requested by <strong style="color:${TEXT};">${data.organizationName}</strong></p>
        <p style="margin:0;">${cfg.footer_text}</p>
      </div>
    `);

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
