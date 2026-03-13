import config from '../config/index.js';
import { VaasOrganization, VaasAdmin } from '../types/index.js';

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

export class EmailService {
  private resendApiKey: string;
  private fromAddress: string;
  private isConfigured: boolean = false;

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY || '';
    this.fromAddress = process.env.EMAIL_FROM || 'Idswyft VaaS <noreply@idswyft.app>';

    this.isConfigured = !!this.resendApiKey;

    if (this.isConfigured) {
      console.log(`✉️ Resend API configured (from: ${this.fromAddress})`);
    } else {
      console.warn('❌ Resend not configured. Emails will be logged instead of sent.');
      console.warn('Missing: RESEND_API_KEY');
    }
  }

  private async sendResendRequest(options: SendEmailOptions): Promise<boolean> {
    try {
      console.log(`📧 Sending email to: ${options.to}`);
      console.log(`📧 Subject: ${options.subject}`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Resend request timeout after 8 seconds')), 8000)
      );

      const fetchPromise = fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromAddress,
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

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const subject = `Welcome to Idswyft VaaS - Your ${data.organization.name} Account is Ready!`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .credentials { background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #1e40af; margin: 20px 0; }
    .warning { background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Welcome to Idswyft VaaS</h1>
  </div>
  
  <div class="content">
    <h2>Hello ${data.adminName}!</h2>
    
    <p>Your Idswyft VaaS account for <strong>${data.organization.name}</strong> has been successfully created.</p>
    
    <div class="credentials">
      <h3>🔐 Your Login Credentials</h3>
      <p><strong>Dashboard:</strong> <a href="${data.dashboardUrl}">${data.dashboardUrl}</a></p>
      <p><strong>Email:</strong> ${data.adminEmail}</p>
      <p><strong>Password:</strong> <code>${data.adminPassword}</code></p>
      <p><strong>Organization:</strong> ${data.organization.name}</p>
    </div>
    
    <div class="warning">
      <strong>⚠️ Important:</strong> Please change your password after logging in.
    </div>
    
    <a href="${data.dashboardUrl}" class="button">Access Dashboard</a>
    
    <p>Best regards,<br>The Idswyft Team</p>
  </div>
</body>
</html>`;

    const textContent = `Welcome to Idswyft VaaS!

Hello ${data.adminName},

Your account for ${data.organization.name} has been created.

Login Details:
- Dashboard: ${data.dashboardUrl}
- Email: ${data.adminEmail}  
- Password: ${data.adminPassword}
- Organization: ${data.organization.name}

Please change your password after logging in.

Best regards,
The Idswyft Team`;

    return this.sendEmail({
      to: data.adminEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
  }

  async sendNotificationToAdmin(data: NotificationEmailData): Promise<boolean> {
    const subject = `🚀 New VaaS Signup: ${data.organizationName}`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .info-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>New VaaS Enterprise Signup</h1>
  </div>
  
  <div class="content">
    <div class="info-box">
      <p><strong>Company:</strong> ${data.organizationName}</p>
      <p><strong>Contact:</strong> ${data.adminName} (${data.adminEmail})</p>
      <p><strong>Job Title:</strong> ${data.jobTitle}</p>
      <p><strong>Volume:</strong> ${data.estimatedVolume}/month</p>
      <p><strong>Use Case:</strong> ${data.useCase}</p>
      <p><strong>Signup ID:</strong> ${data.signupId}</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `New VaaS Signup: ${data.organizationName}

Company: ${data.organizationName}
Contact: ${data.adminName} (${data.adminEmail})
Job Title: ${data.jobTitle}
Volume: ${data.estimatedVolume}/month
Use Case: ${data.useCase}
Signup ID: ${data.signupId}`;

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@idswyft.app';
    
    return this.sendEmail({
      to: adminEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
  }

  async sendVerificationEmail(data: VerificationEmailData): Promise<boolean> {
    const subject = `Verify Your ${data.organizationName} Admin Account - Idswyft VaaS`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; border-bottom: 1px solid #e5e7eb; }
    .content { padding: 30px 20px; }
    .button { display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .verification-code { background: #f3f4f6; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 16px; margin: 20px 0; text-align: center; }
    .next-steps { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Idswyft VaaS</h1>
    <p>Identity Verification as a Service</p>
  </div>
  
  <div class="content">
    <h2>Verify Your Admin Account</h2>
    
    <p>Hello ${data.adminName},</p>
    
    <p>Please verify your admin account for <strong>${data.organizationName}</strong> to complete your VaaS setup.</p>
    
    <p style="text-align: center;">
      <a href="${data.dashboardUrl}/verify-email?token=${data.verificationToken}&email=${encodeURIComponent(data.adminEmail)}" class="button">
        Verify Email Address
      </a>
    </p>
    
    <p>Or use this verification code:</p>
    <div class="verification-code">
      <strong>${data.verificationToken}</strong>
    </div>
    
    <div class="next-steps">
      <h4>🎯 Next Steps:</h4>
      <ul>
        <li>Click the verification link above</li>
        <li>Access your dashboard at <a href="${data.dashboardUrl}">${data.dashboardUrl}</a></li>
        <li>Set up your organization settings</li>
        <li>Start integrating our verification API</li>
      </ul>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">
      If you didn't create this account, please ignore this email.
    </p>
  </div>
</body>
</html>`;

    const textContent = `Verify Your ${data.organizationName} Admin Account - Idswyft VaaS

Hello ${data.adminName},

Please verify your admin account for ${data.organizationName}.

Verification Link: ${data.dashboardUrl}/verify-email?token=${data.verificationToken}&email=${encodeURIComponent(data.adminEmail)}

Verification Code: ${data.verificationToken}

Next Steps:
- Click the verification link above  
- Access your dashboard at ${data.dashboardUrl}
- Set up your organization settings
- Start integrating our verification API

If you didn't create this account, please ignore this email.`;

    return this.sendEmail({
      to: data.adminEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
  }

  async sendVerificationInvitation(data: VerificationInvitationData): Promise<boolean> {
    const subject = `${data.organizationBranding?.company_name || data.organizationName} - Verify Your Identity`;
    const primaryColor = data.organizationBranding?.primary_color || '#1e40af';
    const logoUrl = data.organizationBranding?.logo_url;
    const welcomeMessage = data.organizationBranding?.welcome_message || 
      `Please complete your identity verification for ${data.organizationName}.`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background: #f8fafc; }
    .container { background: white; border-radius: 12px; overflow: hidden; margin: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); }
    .header { background: ${primaryColor}; color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 18px; color: #1a202c; margin-bottom: 20px; }
    .message { font-size: 16px; color: #4a5568; margin-bottom: 30px; line-height: 1.7; }
    .button { display: inline-block; background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0 30px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); transition: transform 0.2s; }
    .button:hover { transform: translateY(-1px); }
    .steps { background: #f7fafc; padding: 25px; border-radius: 8px; margin: 25px 0; }
    .steps h3 { margin: 0 0 15px; color: #2d3748; font-size: 18px; }
    .steps ul { margin: 0; padding-left: 20px; }
    .steps li { margin: 8px 0; color: #4a5568; }
    .expiry-notice { background: #fef5e7; border: 1px solid #f6d55c; padding: 15px; border-radius: 6px; margin: 25px 0; }
    .expiry-notice strong { color: #92400e; }
    .custom-message { background: #e6fffa; padding: 20px; border-radius: 8px; border-left: 4px solid #38b2ac; margin: 25px 0; }
    .footer { text-align: center; padding: 25px; color: #718096; font-size: 14px; border-top: 1px solid #e2e8f0; }
    .logo { max-width: 120px; height: auto; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="${data.organizationName}" class="logo">` : ''}
      <h1>🛡️ Identity Verification</h1>
      <p>${data.organizationBranding?.company_name || data.organizationName}</p>
    </div>
    
    <div class="content">
      <div class="greeting">Hello${data.userName ? ` ${data.userName}` : ''}!</div>
      
      <div class="message">
        ${welcomeMessage}
      </div>
      
      ${data.customMessage ? `
      <div class="custom-message">
        <strong>Message from ${data.organizationName}:</strong><br>
        ${data.customMessage}
      </div>
      ` : ''}
      
      <div style="text-align: center;">
        <a href="${data.verificationUrl}" class="button">
          Start Verification
        </a>
      </div>
      
      <div class="steps">
        <h3>🚀 What to expect:</h3>
        <ul>
          <li><strong>Document Upload:</strong> Take photos of your government-issued ID</li>
          <li><strong>Selfie Verification:</strong> Quick photo for identity matching</li>
          <li><strong>Liveness Check:</strong> Simple verification to confirm you're present</li>
          <li><strong>Instant Results:</strong> Get verified in under 2 minutes</li>
        </ul>
      </div>
      
      <div class="expiry-notice">
        <strong>⏰ Important:</strong> This verification link expires on ${new Date(data.expiresAt).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })} at ${new Date(data.expiresAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}.
      </div>
      
      <p style="color: #718096; font-size: 14px; margin-top: 30px;">
        If you're having trouble with the button above, you can copy and paste this link into your browser:<br>
        <a href="${data.verificationUrl}" style="color: ${primaryColor}; word-break: break-all;">${data.verificationUrl}</a>
      </p>
    </div>
    
    <div class="footer">
      <p>This verification is requested by <strong>${data.organizationName}</strong></p>
      <p>Powered by <strong>Idswyft VaaS</strong> - Secure Identity Verification</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `Identity Verification Required - ${data.organizationName}

Hello${data.userName ? ` ${data.userName}` : ''}!

${welcomeMessage}

${data.customMessage ? `Message from ${data.organizationName}: ${data.customMessage}\n\n` : ''}

Complete your verification: ${data.verificationUrl}

What to expect:
• Document Upload: Take photos of your government-issued ID
• Selfie Verification: Quick photo for identity matching  
• Liveness Check: Simple verification to confirm you're present
• Instant Results: Get verified in under 2 minutes

⏰ IMPORTANT: This verification link expires on ${new Date(data.expiresAt).toLocaleDateString()} at ${new Date(data.expiresAt).toLocaleTimeString()}.

This verification is requested by ${data.organizationName}
Powered by Idswyft VaaS - Secure Identity Verification`;

    return this.sendEmail({
      to: data.userEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
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