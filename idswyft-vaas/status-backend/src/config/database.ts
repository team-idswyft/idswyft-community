import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STATUS_SUPABASE_URL;
const supabaseKey = process.env.STATUS_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required: STATUS_SUPABASE_URL and STATUS_SUPABASE_SERVICE_ROLE_KEY');
}

export const statusDb = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const connectDb = async (): Promise<boolean> => {
  try {
    const { error } = await statusDb.from('service_checks').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    console.log('[DB] Connected to Status Supabase');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    return false;
  }
};

export default statusDb;
