import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS. Server-only — `server-only` import will
// fail the build if any client component pulls this in.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
