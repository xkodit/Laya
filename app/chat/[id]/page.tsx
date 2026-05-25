import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chat } from "@/components/chat/chat";
import type { UIMessage } from "ai";
import type { CitedChunk } from "@/components/chat/citation";
import type { FeedbackState } from "@/components/chat/message-actions";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/sign-in?next=/chat/${id}`);
  }

  // The conversation may not exist yet — that's normal when the user just
  // landed via /chat (which assigns a fresh uuid). Treat missing as empty.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const rows = convo
    ? ((
        await supabase
          .from("messages")
          .select("id, role, content, citations")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true })
      ).data ?? [])
    : [];

  const filteredRows = rows.filter(
    (m): m is { id: string; role: string; content: string; citations: unknown } =>
      m.role === "user" || m.role === "assistant",
  );

  const initialMessages: UIMessage[] = filteredRows.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text", text: m.content }],
  }));

  // Per-message citations, indexed by position in initialMessages. Keeping
  // these scoped per turn prevents a citation in turn N from accidentally
  // resolving to a chunk retrieved during turn M.
  const initialChunksByIndex: Record<number, CitedChunk[]> = {};
  filteredRows.forEach((m, i) => {
    if (Array.isArray(m.citations)) {
      initialChunksByIndex[i] = m.citations as CitedChunk[];
    }
  });

  // Load this user's existing feedback for the assistant messages in view so
  // the thumbs-up / thumbs-down / report state survives a page reload. Keyed
  // by the message's position in the conversation (0-based) — same key the
  // Chat component uses to identify messages, since live-streamed messages
  // don't have DB uuids the client could match against.
  const assistantIndices = rows
    .map((m, i) => ({ id: m.id, role: m.role, i }))
    .filter((m) => m.role === "assistant");
  const initialFeedback: Record<number, FeedbackState> = {};
  if (assistantIndices.length > 0) {
    const { data: fbRows } = await supabase
      .from("message_feedback")
      .select("message_id, rating")
      .eq("user_id", user.id)
      .in(
        "message_id",
        assistantIndices.map((m) => m.id),
      );
    const byMessageId = new Map<string, { up?: boolean; down?: boolean; report?: boolean }>();
    for (const fb of fbRows ?? []) {
      const acc = byMessageId.get(fb.message_id) ?? {};
      if (fb.rating === "up") acc.up = true;
      else if (fb.rating === "down") acc.down = true;
      else if (fb.rating === "report") acc.report = true;
      byMessageId.set(fb.message_id, acc);
    }
    for (const m of assistantIndices) {
      const f = byMessageId.get(m.id);
      if (!f) continue;
      initialFeedback[m.i] = {
        rating: f.up ? "up" : f.down ? "down" : null,
        reported: !!f.report,
      };
    }
  }

  return (
    <Chat
      conversationId={id}
      initialMessages={initialMessages}
      initialChunksByIndex={initialChunksByIndex}
      initialFeedback={initialFeedback}
    />
  );
}
