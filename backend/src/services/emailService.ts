import { logger } from '@/utils/logger.js';
import config from '@/config/index.js';

// Dark-theme constants (matching frontend C tokens)
const BG = '#080c14';
const CARD = '#0f1420';
const TEXT = '#dde2ec';
const MUTED = '#8896aa';
const ACCENT = '#22d3ee';
const BORDER = 'rgba(255,255,255,0.07)';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private resendApiKey: string;
  private fromAddress: string;
  private isConfigured: boolean;

  constructor() {
    this.resendApiKey = config.email.resendApiKey;
    this.fromAddress = config.email.fromAddress;
    this.isConfigured = !!this.resendApiKey;

    if (this.isConfigured) {
      logger.info(`Email service configured (from: ${this.fromAddress})`);
    } else {
      logger.warn('Resend not configured — OTP codes will be logged to console');
    }
  }

  private async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isConfigured) {
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

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:20px;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#0b0f19;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
  <div style="border-top:3px solid ${ACCENT};padding:32px 30px;text-align:center;">
    <h1 style="margin:0;color:${TEXT};font-size:20px;font-weight:700;">Verification Code</h1>
    <p style="margin:8px 0 0;color:${MUTED};font-size:14px;">idswyft / developer-portal</p>
  </div>
  <div style="padding:30px;text-align:center;">
    <p style="color:${MUTED};font-size:14px;margin:0 0 24px;">Enter this code to sign in to your developer account:</p>
    <div style="background:${CARD};border:1px solid ${BORDER};border-radius:10px;padding:20px;margin:0 auto;max-width:240px;">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:36px;font-weight:700;color:${ACCENT};letter-spacing:0.2em;">${code}</div>
    </div>
    <p style="color:${MUTED};font-size:13px;margin:24px 0 0;">This code expires in 10 minutes.</p>
    <p style="color:${MUTED};font-size:12px;margin:8px 0 0;">If you didn't request this code, you can safely ignore this email.</p>
  </div>
  <div style="padding:18px;text-align:center;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;">
    Powered by Idswyft
  </div>
</div>
</body></html>`;

    const text = `Your Idswyft verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`;

    return this.sendEmail({ to: email, subject, html, text });
  }
}

export const emailService = new EmailService();
