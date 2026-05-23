import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./user-menu";

// Minimal authenticated header: logo (left) + user menu (right).
// Used by /profile and any other non-chat authenticated page.
// Calls Supabase server-side, so it must render in a server component tree.
export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/sign-in");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/brand/logo.png"
          alt="Laya"
          width={28}
          height={28}
          priority
        />
        <span className="text-sm font-semibold tracking-tight">Laya</span>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-foreground"
        >
          <MessageSquare className="size-4" />
          Conversations
        </Link>
        <UserMenu
          fullName={profile.full_name}
          email={profile.email}
          isAdmin={profile.role === "admin"}
        />
      </div>
    </header>
  );
}
