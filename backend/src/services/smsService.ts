import { logger } from '@/utils/logger.js';
import { decryptSecret } from '@idswyft/shared';
import { config } from '@/config/index.js';

/**
 * Developer-provided SMS credentials, decrypted at request time.
 * Mirrors the LLM provider config pattern.
 */
export interface SMSProviderConfig {
  provider: 'twilio' | 'vonage';
  apiKey: string;        // Twilio Account SID / Vonage API key
  apiSecret: string;     // Twilio Auth Token / Vonage API secret
  phoneNumber: string;   // Sender phone (E.164)
}

/**
 * Sends an OTP code via SMS using the developer's own provider credentials.
 * Returns true on success, false on failure (fire-and-forget style).
 */
export async function sendSmsOtp(
  smsConfig: SMSProviderConfig,
  recipientPhone: string,
  code: string,
): Promise<boolean> {
  const message = `Your verification code is: ${code}. It expires in 10 minutes.`;

  try {
    switch (smsConfig.provider) {
      case 'twilio':
        return await sendViaTwilio(smsConfig, recipientPhone, message);
      case 'vonage':
        return await sendViaVonage(smsConfig, recipientPhone, message);
      default:
        logger.error('Unsupported SMS provider', { provider: smsConfig.provider });
        return false;
    }
  } catch (err) {
    logger.error('SMS send failed', { provider: smsConfig.provider, error: (err as Error).message });
    return false;
  }
}

async function sendViaTwilio(
  cfg: SMSProviderConfig,
  to: string,
  body: string,
): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.apiKey}/Messages.json`;
  const auth = Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: cfg.phoneNumber, Body: body }).toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Twilio API error', { status: res.status, body: errBody });
    return false;
  }

  return true;
}

async function sendViaVonage(
  cfg: SMSProviderConfig,
  to: string,
  body: string,
): Promise<boolean> {
  const res = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
      from: cfg.phoneNumber,
      to: to.replace(/\+/g, ''),
      text: body,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Vonage API error', { status: res.status, body: errBody });
    return false;
  }

  const data = await res.json() as any;
  return data.messages?.[0]?.status === '0';
}

/**
 * Decrypt developer SMS config from DB row.
 * Returns null if SMS is not configured.
 */
export function decryptSMSConfig(dev: {
  sms_provider: string | null;
  sms_api_key_encrypted: string | null;
  sms_api_secret_encrypted: string | null;
  sms_phone_number: string | null;
}): SMSProviderConfig | null {
  if (!dev.sms_provider || !dev.sms_api_key_encrypted || !dev.sms_api_secret_encrypted || !dev.sms_phone_number) {
    return null;
  }

  try {
    return {
      provider: dev.sms_provider as SMSProviderConfig['provider'],
      apiKey: decryptSecret(dev.sms_api_key_encrypted, config.encryptionKey),
      apiSecret: decryptSecret(dev.sms_api_secret_encrypted, config.encryptionKey),
      phoneNumber: dev.sms_phone_number,
    };
  } catch (err) {
    logger.error('Failed to decrypt SMS config', { error: (err as Error).message });
    return null;
  }
}
