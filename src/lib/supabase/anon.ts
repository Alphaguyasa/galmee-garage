import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Client that ignores cookies: public pages act as anon even when staff are logged in.
 * `headers` are sent with every request (the status page sends its link token this way,
 * and the database policies read it from the request headers).
 */
export function createAnonClient(headers?: Record<string, string>) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
    global: headers ? { headers } : undefined,
  });
}
