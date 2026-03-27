import { logger } from '@/utils/logger.js';
import config from '@/config/index.js';

// Dark-theme constants (matching frontend C tokens from theme.ts)
const BG       = '#080c14';
const PANEL    = '#0b0f19';
const CARD     = '#0f1420';
const TEXT     = '#dde2ec';
const MUTED    = '#8896aa';
const DIM      = '#4a5568';
const ACCENT   = '#22d3ee';
const BORDER   = 'rgba(255,255,255,0.07)';
const BORDER_S = 'rgba(255,255,255,0.13)';

// Guilloche SVG rosette — identity-document pattern for email backgrounds.
function guillocheDataUri(): string {
  const r = (a: number) => `<ellipse cx="60" cy="60" rx="42" ry="18" fill="none" stroke="${ACCENT}" stroke-opacity="0.07" stroke-width="0.6" transform="rotate(${a},60,60)"/>`;
  const circles = [12, 20, 30, 42, 54].map(
    (rad, i) => `<circle cx="60" cy="60" r="${rad}" fill="none" stroke="${ACCENT}" stroke-opacity="${0.04 + i * 0.008}" stroke-width="0.5"/>`
  ).join('');
  const ellipses = [0, 30, 60, 90, 120, 150].map(a => r(a)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${circles}${ellipses}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private resendApiKey: string;
  private fromAddress: string;
  private _isConfigured: boolean;

  /** Whether a real email transport (Resend) is configured */
  get isConfigured(): boolean { return this._isConfigured; }

  constructor() {
    this.resendApiKey = config.email.resendApiKey;
    this.fromAddress = config.email.fromAddress;
    this._isConfigured = !!this.resendApiKey;

    if (this._isConfigured) {
      logger.info(`Email service configured (from: ${this.fromAddress})`);
    } else {
      logger.warn('Resend not configured — OTP codes will be logged to console');
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this._isConfigured) {
      logger.info(`[DEV] Email to ${options.to}: ${options.subject}`);
      logger.info(`[DEV] Text body:\n${options.text}`);
      return true;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(`Resend API error: ${response.status} — ${errorText}`);
        return false;
      }

      const result = await response.json().catch(() => ({ id: 'unknown' }));
      logger.info(`Email sent via Resend: ${result.id}`);
      return true;
    } catch (error) {
      logger.error('Resend request failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async sendOtpEmail(email: string, code: string): Promise<boolean> {
    const subject = 'Your Idswyft verification code';
    const guilloche = guillocheDataUri();

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Idswyft</title>
<style>
  @media only screen and (max-width:520px) {
    .otp-outer { padding: 8px !important; }
    .otp-card { border-radius: 10px !important; }
    .otp-body { padding: 28px 20px !important; }
    .otp-header { padding: 28px 20px 22px !important; }
    .otp-code { font-size: 30px !important; letter-spacing: 0.15em !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;">
<div class="otp-outer" style="padding:24px 16px;background:${BG};background-image:url('${guilloche}');background-size:240px 240px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" align="center"><tr><td><![endif]-->
<div class="otp-card" style="max-width:480px;margin:0 auto;background:${CARD};border-radius:14px;overflow:hidden;border:1px solid ${BORDER_S};box-shadow:0 8px 32px rgba(0,0,0,0.4);">
  <div class="otp-header" style="background:${PANEL};background-image:url('${guilloche}');background-size:120px 120px;padding:36px 28px 28px;text-align:center;border-bottom:1px solid ${BORDER};">
    <h1 style="margin:0;color:${TEXT};font-size:20px;font-weight:700;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;letter-spacing:-0.01em;">Verification Code</h1>
    <p style="margin:8px 0 0;color:${MUTED};font-size:13px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">idswyft / developer-portal</p>
    <div style="width:40px;height:2px;background:${ACCENT};margin:14px auto 0;border-radius:1px;"></div>
  </div>
  <div class="otp-body" style="padding:32px 28px;text-align:center;">
    <p style="color:${MUTED};font-size:15px;margin:0 0 24px;line-height:1.6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Enter this code to sign in to your developer account:</p>
    <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.18);border-radius:10px;padding:22px 16px;margin:0 auto;max-width:260px;">
      <div class="otp-code" style="font-family:'IBM Plex Mono','Fira Code',monospace;font-size:36px;font-weight:700;color:${ACCENT};letter-spacing:0.2em;">${code}</div>
    </div>
    <p style="color:${MUTED};font-size:13px;margin:24px 0 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">This code expires in <strong style="color:${TEXT};">10 minutes</strong>.</p>
    <p style="color:${DIM};font-size:12px;margin:10px 0 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">If you didn't request this code, you can safely ignore this email.</p>
  </div>
  <div style="padding:20px 24px 24px;text-align:center;border-top:1px solid ${BORDER};background:${PANEL};">
    <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${DIM};border-radius:3px;vertical-align:middle;margin-right:6px;text-align:center;line-height:14px;font-size:9px;color:${DIM};">&#9919;</span>
    <span style="color:${DIM};font-size:12px;vertical-align:middle;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Secured by Idswyft</span>
  </div>
</div>
<!--[if mso]></td></tr></table><![endif]-->
</div>
</body></html>`;

    const text = `Your Idswyft verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`;

    return this.sendEmail({ to: email, subject, html, text });
  }
}

export const emailService = new EmailService();
