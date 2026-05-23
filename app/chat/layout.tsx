import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/app/user-menu";
import { ChatSidebar } from "@/components/chat/sidebar";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in?next=/chat");
  }

  const [{ data: profile }, { data: conversations }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("conversations")
      .select("id, title, is_favorite, updated_at")
      .eq("user_id", user.id)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (!profile) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/logo.png"
              alt="Laya"
              width={26}
              height={26}
              priority
            />
            <span className="text-sm font-semibold tracking-tight">Laya</span>
          </Link>
        </div>
        <ChatSidebar conversations={conversations ?? []} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
          <div className="md:hidden">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/brand/logo.png" alt="Laya" width={24} height={24} />
              <span className="text-sm font-semibold tracking-tight">Laya</span>
            </Link>
          </div>
          <div className="hidden md:block" />
          <UserMenu
            fullName={profile.full_name}
            email={profile.email}
            isAdmin={profile.role === "admin"}
          />
        </header>

        {children}
      </div>
    </div>
  );
}
