import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function supabaseAdmin() {
  const env = serverEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
