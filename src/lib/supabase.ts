import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SETUP_MESSAGE =
  "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run supabase/schema.sql in the Supabase SQL editor.";

let client: SupabaseClient | null | undefined;

function readEnv(name: string) {
  return process.env[name];
}

export function isSupabaseConfigured() {
  return Boolean(readEnv("SUPABASE_URL") && readEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export function getSupabase() {
  if (client !== undefined) return client;

  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    client = null;
    return client;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
