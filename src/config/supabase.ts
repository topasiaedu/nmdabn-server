import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from "../database.types";

// Service role client for backend operations
export const supabase = createClient<Database>(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper to create a client with user's JWT token
export function createUserClient(accessToken: string) {
  return createClient<Database>(env.supabase.url, env.supabase.serviceRoleKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

