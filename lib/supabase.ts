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

export function createPublicSupabaseClient(options?: { timeoutMs?: number }) {
  const { url, anonKey } = getSupabasePublicConfig();
  const timeoutMs = options?.timeoutMs ?? 2500;

  return createClient(url, anonKey, {
    global: {
      fetch: (input, init) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        if (init?.signal) {
          init.signal.addEventListener("abort", () => controller.abort());
        }

        return fetch(input, {
          ...init,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
    },
  });
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  return createBrowserClient(url, anonKey, {
    auth: { persistSession: false },
  });
}
