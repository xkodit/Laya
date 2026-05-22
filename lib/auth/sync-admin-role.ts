import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/auth/allowlist";

// Mirrors spec §13: sets profiles.role = 'admin' for ADMIN_EMAILS matches and
// demotes back to 'user' otherwise. Called after every successful sign-in and
// from the email-confirm callback. Idempotent.
export async function syncAdminRole(
  userId: string,
  email: string,
): Promise<void> {
  const targetRole = isAdminEmail(email) ? "admin" : "user";
  const service = createServiceClient();
  await service
    .from("profiles")
    .update({ role: targetRole })
    .eq("id", userId);
}
