import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}

export function createPublicSupabaseClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  return createClient(url, anonKey);
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  return createBrowserClient(url, anonKey);
}
