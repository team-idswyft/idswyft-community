import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';

/**
 * Seeds the first platform admin on boot if the table is empty.
 * Uses VAAS_SUPER_ADMIN_EMAILS (first entry) for the email.
 * Generates a random password and prints it to the console.
 */
export async function seedPlatformAdmin(): Promise<void> {
  try {
    // Check if any platform admins exist
    const { data: existing, error: checkError } = await vaasSupabase
      .from('platform_admins')
      .select('id')
      .limit(1);

    if (checkError) {
      // Table may not exist yet — skip silently
      console.log('⏭️  platform_admins table not found, skipping seed');
      return;
    }

    if (existing && existing.length > 0) {
      console.log('✅ Platform admin(s) already exist, skipping seed');
      return;
    }

    // Determine email from env
    const superAdminEmails = (config.superAdminEmails || '').split(',').map(e => e.trim()).filter(Boolean);
    if (superAdminEmails.length === 0) {
      console.log('⏭️  VAAS_SUPER_ADMIN_EMAILS not set, skipping platform admin seed');
      return;
    }

    const email = superAdminEmails[0];
    const password = crypto.randomBytes(16).toString('base64url'); // ~22 chars, URL-safe
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: insertError } = await vaasSupabase
      .from('platform_admins')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: 'Platform',
        last_name: 'Admin',
        role: 'super_admin',
        status: 'active',
      });

    if (insertError) {
      console.error('❌ Failed to seed platform admin:', insertError.message);
      return;
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        PLATFORM ADMIN SEEDED — SAVE THESE CREDS        ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Email:    ${email.padEnd(45)}║`);
    console.log(`║  Password: ${password.padEnd(45)}║`);
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  Change this password after first login.                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
  } catch (error) {
    console.error('❌ Platform admin seed error:', error);
  }
}
