/**
 * API Key Secret Stability Guard
 *
 * Detects when API_KEY_SECRET changes between deploys, which silently
 * breaks all existing API keys (HMAC hashes no longer match).
 *
 * On first boot: stores a SHA-256 fingerprint of the secret in
 * the _system_config table. On subsequent boots: compares and warns.
 */
import crypto from 'crypto';
import { supabase } from './database.js';
import { logger } from '../utils/logger.js';

const CONFIG_KEY = 'api_key_secret_fingerprint';

function fingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
}

export async function verifyApiKeySecretStability(currentSecret: string): Promise<void> {
  const currentFingerprint = fingerprint(currentSecret);

  try {
    // Ensure _system_config table exists
    await supabase.rpc('exec_sql', {
      query: `CREATE TABLE IF NOT EXISTS _system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`
    }).then(() => {}, async () => {
      // rpc may not exist — try direct insert which will create-on-conflict
      // If table doesn't exist, the select below will fail gracefully
    });

    const { data: existing } = await supabase
      .from('_system_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();

    if (!existing) {
      // First boot — store the fingerprint
      await supabase
        .from('_system_config')
        .upsert({ key: CONFIG_KEY, value: currentFingerprint, updated_at: new Date().toISOString() });
      logger.info('API_KEY_SECRET fingerprint stored for future stability checks');
      return;
    }

    if (existing.value === currentFingerprint) {
      logger.info('API_KEY_SECRET stability check passed');
      return;
    }

    // SECRET CHANGED — count how many active keys will break
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    logger.error(
      `CRITICAL: API_KEY_SECRET has changed! ${count ?? 'unknown number of'} active API keys are now INVALID. ` +
      `All existing keys will fail authentication. Either restore the previous secret or re-hash all keys. ` +
      `Previous fingerprint: ${existing.value}, Current: ${currentFingerprint}`
    );

    console.error('='.repeat(72));
    console.error('CRITICAL: API_KEY_SECRET CHANGED — ALL ACTIVE API KEYS ARE BROKEN');
    console.error(`Active keys affected: ${count ?? 'unknown'}`);
    console.error('Fix: restore the old API_KEY_SECRET or re-hash all keys in api_keys table');
    console.error('='.repeat(72));

    // Update fingerprint so this warning only fires once per secret change
    await supabase
      .from('_system_config')
      .upsert({ key: CONFIG_KEY, value: currentFingerprint, updated_at: new Date().toISOString() });

  } catch (err) {
    // Non-fatal — don't block server startup over this check
    logger.warn('API_KEY_SECRET stability check skipped (table may not exist yet)', { error: err });
  }
}
