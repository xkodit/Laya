import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAdminRole } from "@/lib/auth/sync-admin-role";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error?.message ?? "exchange_failed")}`,
    );
  }

  if (data.user.email) {
    await syncAdminRole(data.user.id, data.user.email);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
