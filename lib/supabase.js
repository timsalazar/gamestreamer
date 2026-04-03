import { createClient } from '@supabase/supabase-js';

// Server-side client — prefers service key (bypasses RLS), falls back to anon key for local dev
const key = process.env.SUPABASE_SERVICE_KEY?.startsWith('eyJ')
  ? process.env.SUPABASE_SERVICE_KEY
  : process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_SERVICE_KEY?.startsWith('eyJ')) {
  console.warn('⚠️  Using anon key for server — add SUPABASE_SERVICE_KEY for production');
}

export const supabaseAdmin = createClient(process.env.SUPABASE_URL, key);

// Client-side safe config (exposed to browser)
export const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
};
