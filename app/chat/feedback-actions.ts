"use server";

import { createClient } from "@/lib/supabase/server";

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string };

// Resolves the message by (conversation_id, index) rather than message_id so
// the client doesn't need to know the DB-assigned uuid of freshly-streamed
// assistant messages (useChat keeps its own ids that don't match the DB).
async function resolveMessageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  messageIndex: number,
): Promise<{ id: string; role: string } | null> {
  // Retry briefly to cover the race between stream completion (client status
  // flips to 'ready') and the route's onFinish actually inserting the rows.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("messages")
      .select("id, role")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    const msg = data?.[messageIndex];
    if (msg) return msg;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

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

export async function setMessageRating(args: {
  conversationId: string;
  messageIndex: number;
  rating: "up" | "down" | null;
}): Promise<FeedbackResult> {
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth;

  const msg = await resolveMessageId(
    supabase,
    args.conversationId,
    args.messageIndex,
  );
  if (!msg) return { ok: false, error: "message not found" };
  if (msg.role !== "assistant") {
    return { ok: false, error: "can only rate assistant messages" };
  }

  // Always clear any existing up/down first — the partial unique index would
  // reject a second insert otherwise, and this also handles the "toggle off"
  // and "switch from up to down" cases in one path.
  const { error: delError } = await supabase
    .from("message_feedback")
    .delete()
    .eq("message_id", msg.id)
    .eq("user_id", userId)
    .in("rating", ["up", "down"]);
  if (delError) return { ok: false, error: delError.message };

  if (args.rating === null) return { ok: true };

  const { error: insError } = await supabase.from("message_feedback").insert({
    message_id: msg.id,
    user_id: userId,
    rating: args.rating,
  });
  if (insError) return { ok: false, error: insError.message };
  return { ok: true };
}

export async function reportMessage(args: {
  conversationId: string;
  messageIndex: number;
  comment?: string;
}): Promise<FeedbackResult> {
  const auth = await authenticate();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth;

  const msg = await resolveMessageId(
    supabase,
    args.conversationId,
    args.messageIndex,
  );
  if (!msg) return { ok: false, error: "message not found" };
  if (msg.role !== "assistant") {
    return { ok: false, error: "can only report assistant messages" };
  }

  // Allow re-reporting (e.g., user adds a comment after initial flag) by
  // clearing any prior report row first.
  await supabase
    .from("message_feedback")
    .delete()
    .eq("message_id", msg.id)
    .eq("user_id", userId)
    .eq("rating", "report");

  const trimmed = args.comment?.trim();
  const { error } = await supabase.from("message_feedback").insert({
    message_id: msg.id,
    user_id: userId,
    rating: "report",
    comment: trimmed && trimmed.length > 0 ? trimmed : null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
