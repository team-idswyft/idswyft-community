import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { emailService } from './emailService.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const MAX_SENDS_PER_HOUR = 5;

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function hashCode(code: string): string {
  return crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(code)
    .digest('hex');
}

const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

/**
 * Atomic rate limit check using a Postgres RPC function.
 * Upserts the rate limit row and returns whether the send is allowed.
 * No read-then-write race condition.
 */
async function checkRateLimit(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_otp_rate_limit', {
    p_email: email,
    p_max_sends: MAX_SENDS_PER_HOUR,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    logger.error('OTP rate limit check failed', { error });
    // Fail open — allow the send but log the error
    return true;
  }

  return data === true;
}

/**
 * Create an OTP for the given email, store its hash, and send the email.
 * Returns { success: true } or { success: false, reason: string }.
 */
export async function createAndSendOtp(email: string): Promise<{ success: boolean; reason?: string }> {
  // Rate limit check
  const allowed = await checkRateLimit(email);
  if (!allowed) {
    logger.warn('OTP rate limit exceeded', { email });
    // Still return success to prevent email enumeration
    return { success: true };
  }

  // Invalidate any existing unused codes for this email
  await supabase
    .from('developer_otp_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('email', email)
    .is('used_at', null);

  // Generate and store
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from('developer_otp_codes').insert({
    email,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
  });

  if (insertError) {
    logger.error('Failed to insert OTP code', { error: insertError });
    return { success: false, reason: 'Failed to generate code' };
  }

  // Send email (fire-and-forget style — log failures, don't block)
  const sent = await emailService.sendOtpEmail(email, code);
  if (!sent) {
    logger.error('Failed to send OTP email', { email });
    // Still return success to the client — the code exists in DB
  }

  logger.info('OTP created and sent', { email });
  return { success: true };
}

/**
 * Verify a code against the stored hash for the given email.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export async function verifyOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
  const now = new Date().toISOString();

  // Find the latest unexpired, unused code for this email
  const { data: otpRecord, error } = await supabase
    .from('developer_otp_codes')
    .select('*')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !otpRecord) {
    return { valid: false, reason: 'No valid code found. Request a new one.' };
  }

  // Check max attempts
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    // Mark as used (exhausted)
    await supabase
      .from('developer_otp_codes')
      .update({ used_at: now })
      .eq('id', otpRecord.id);
    return { valid: false, reason: 'Too many attempts. Request a new code.' };
  }

  // Increment attempts
  await supabase
    .from('developer_otp_codes')
    .update({ attempts: otpRecord.attempts + 1 })
    .eq('id', otpRecord.id);

  // Compare hash
  const inputHash = hashCode(code);
  if (inputHash !== otpRecord.code_hash) {
    const attemptsLeft = MAX_ATTEMPTS - (otpRecord.attempts + 1);
    return { valid: false, reason: attemptsLeft > 0 ? `Invalid code. ${attemptsLeft} attempt(s) remaining.` : 'Too many attempts. Request a new code.' };
  }

  // Mark as used
  await supabase
    .from('developer_otp_codes')
    .update({ used_at: now })
    .eq('id', otpRecord.id);

  logger.info('OTP verified successfully', { email });
  return { valid: true };
}
