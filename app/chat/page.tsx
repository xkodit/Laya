import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Lands user on a fresh empty conversation. The row isn't created in the DB
// until the first message arrives via /api/chat (which upserts).
export default async function NewChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in?next=/chat");
  }
  const id = randomUUID();
  redirect(`/chat/${id}`);
}
