"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function authenticate(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  return { ok: true, supabase, userId: user.id };
}

export async function toggleFavorite(
  id: string,
  next: boolean,
): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("conversations")
    .update({ is_favorite: next })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat", "layout");
  return { ok: true };
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<ActionResult> {
  const trimmed = title.trim();
  if (trimmed.length === 0) return { ok: false, error: "title vide" };
  if (trimmed.length > 200) return { ok: false, error: "titre trop long" };
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("conversations")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat", "layout");
  return { ok: true };
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat", "layout");
  return { ok: true };
}

export type ConversationTranscript = {
  title: string;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
};

export async function getConversationTranscript(
  id: string,
): Promise<
  | { ok: true; transcript: ConversationTranscript }
  | { ok: false; error: string }
> {
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { data: convo, error: convoErr } = await auth.supabase
    .from("conversations")
    .select("title, created_at")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (convoErr) return { ok: false, error: convoErr.message };
  if (!convo) return { ok: false, error: "conversation introuvable" };

  const { data: rows, error: msgErr } = await auth.supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) return { ok: false, error: msgErr.message };

  const messages = (rows ?? [])
    .filter(
      (r): r is { role: "user" | "assistant"; content: string; created_at: string } =>
        r.role === "user" || r.role === "assistant",
    )
    .map((r) => ({
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }));

  return {
    ok: true,
    transcript: {
      title: convo.title?.trim() || "Sans titre",
      createdAt: convo.created_at,
      messages,
    },
  };
}
