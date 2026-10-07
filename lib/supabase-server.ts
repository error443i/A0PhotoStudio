import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./supabase";

export function isMissingSchemaTable(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) return false;
  if (typeof error.message !== "string") return false;

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return (
    code === "PGRST205" ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table")
  );
}

function createTimeoutFetch(timeoutMs = 8000) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
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
  };
}

/**
 * Creates a server-side Supabase client authenticated via Next.js HTTP-only cookies.
 * Compatible with Next.js Server Actions and Route Handlers.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const { url, anonKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // If called from a read-only Server Component, setting cookies is ignored.
        }
      },
    },
    global: {
      fetch: createTimeoutFetch(8000),
    },
  });
}

/**
 * Creates an administrative Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Used for bypass RLS and server-side storage management.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || anonKey;

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createTimeoutFetch(8000),
    },
  });
}

export type AdminAuthResult =
  | { status: "admin"; user: User; client: SupabaseClient }
  | { status: "not-admin"; user: User; error: string }
  | { status: "signed-out"; error?: string }
  | { status: "setup-error"; error: string };

/**
 * Verifies that the current request has an active session that belongs to an authorized administrator.
 */
export async function verifyAdminSession(): Promise<AdminAuthResult> {
  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();

  if (authError || !authData.user) {
    return { status: "signed-out" };
  }

  const user = authData.user;
  const { data: adminRecord, error: adminError } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    if (isMissingSchemaTable(adminError)) {
      return {
        status: "setup-error",
        error:
          "Required admin tables are missing from Supabase. Run migrations in Supabase SQL Editor.",
      };
    }
    return {
      status: "not-admin",
      user,
      error: `Unable to verify administrator privileges: ${adminError.message}`,
    };
  }

  if (!adminRecord) {
    return {
      status: "not-admin",
      user,
      error: "This account is not on the authorized administrator list.",
    };
  }

  return { status: "admin", user, client };
}
