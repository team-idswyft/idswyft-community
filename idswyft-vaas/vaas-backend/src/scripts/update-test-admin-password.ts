import bcrypt from 'bcrypt';
import { vaasSupabase } from '../config/database.js';

async function updateTestAdminPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx tsx src/scripts/update-test-admin-password.ts <email> <password>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  try {
    // Hash the new password (cost factor 12 — project standard)
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update the admin user password
    const { data, error } = await vaasSupabase
      .from('vaas_admins')
      .update({
        password_hash: passwordHash,
        email_verified: true,
        status: 'active'
      })
      .eq('email', email)
      .select('id, email, first_name, last_name');

    if (error) {
      console.error('Failed to update password:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.error('Admin user not found with email:', email);
      process.exit(1);
    }

    console.log('Admin password updated successfully for:', data[0].email);
    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
}

updateTestAdminPassword();
