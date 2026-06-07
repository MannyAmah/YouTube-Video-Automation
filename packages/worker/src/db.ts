// Supabase client (service role — worker bypasses RLS, see migration 0001).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';

export function makeDb(cfg: Config): SupabaseClient {
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
