import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { sendSmsOtp, type SMSProviderConfig } from './smsService.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const MAX_SENDS_PER_SESSION = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function hashCode(code: string): string {
  return crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(code)
    .digest('hex');
}

/**
 * Atomic rate limit check scoped to a verification session.
 */
async function checkRateLimit(verificationRequestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_phone_otp_rate_limit', {
    p_vr_id: verificationRequestId,
    p_max_sends: MAX_SENDS_PER_SESSION,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    logger.error('Phone OTP rate limit check failed', { error });
    return false;
  }

  return data === true;
}

/**
 * Create a phone OTP for the given verification session.
 * Sends SMS via the developer's configured provider.
 * When no SMS provider is configured, returns the code in the response
 * (self-hosted / testing mode).
 */
export async function createAndSendPhoneOtp(
  verificationRequestId: string,
  phoneNumber: string,
  smsConfig: SMSProviderConfig | null,
): Promise<{ success: boolean; reason?: string; code?: string }> {
  const allowed = await checkRateLimit(verificationRequestId);
  if (!allowed) {
    logger.warn('Phone OTP rate limit exceeded', { verificationRequestId });
    return { success: false, reason: 'Too many code requests. Please try again later.' };
  }

  // Invalidate previous unused codes for this session
  await supabase
    .from('phone_otp_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('verification_request_id', verificationRequestId)
    .is('used_at', null);

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from('phone_otp_codes').insert({
    verification_request_id: verificationRequestId,
    phone_number: phoneNumber,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
  });

  if (insertError) {
    logger.error('Failed to insert phone OTP code', { error: insertError });
    return { success: false, reason: 'Failed to generate code' };
  }

  // If developer has SMS configured, send via their provider
  if (smsConfig) {
    const sent = await sendSmsOtp(smsConfig, phoneNumber, code);
    if (!sent) {
      logger.error('Failed to send phone OTP SMS', { verificationRequestId });
      return { success: false, reason: 'Failed to deliver SMS. Check your SMS provider configuration.' };
    }
    logger.info('Phone OTP created and sent', { verificationRequestId });
    return { success: true };
  }

  // No SMS provider configured — return plaintext code (self-hosted / testing)
  logger.info('Phone OTP created (no SMS provider — returning code)', { verificationRequestId });
  return { success: true, code };
}

/**
 * Verify a phone OTP code for the given verification session.
 * Uses atomic Postgres RPC to prevent race conditions.
 */
export async function verifyPhoneOtp(
  verificationRequestId: string,
  code: string,
): Promise<{ valid: boolean; reason?: string }> {
  const inputHash = hashCode(code);

  const { data, error } = await supabase.rpc('verify_phone_otp_atomic', {
    p_vr_id: verificationRequestId,
    p_code_hash: inputHash,
    p_max_attempts: MAX_ATTEMPTS,
  });

  if (error) {
    logger.error('Phone OTP verify RPC failed', { error });
    return { valid: false, reason: 'Verification failed. Please try again.' };
  }

  const result = data as { status: string; attempts_left: number } | null;

  if (!result || result.status === 'not_found') {
    return { valid: false, reason: 'No valid code found. Request a new one.' };
  }

  if (result.status === 'exhausted') {
    return { valid: false, reason: 'Too many attempts. Request a new code.' };
  }

  if (result.status === 'invalid') {
    const left = result.attempts_left;
    return {
      valid: false,
      reason: left > 0
        ? `Invalid code. ${left} attempt(s) remaining.`
        : 'Too many attempts. Request a new code.',
    };
  }

  // Timing-safe comparison as defense-in-depth
  const storedHash = result.status === 'valid' ? inputHash : '';
  const inputBuf = Buffer.from(inputHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (inputBuf.length !== storedBuf.length || !crypto.timingSafeEqual(inputBuf, storedBuf)) {
    return { valid: false, reason: 'Verification failed.' };
  }

  logger.info('Phone OTP verified successfully', { verificationRequestId });
  return { valid: true };
}
