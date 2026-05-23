import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chat } from "@/components/chat/chat";
import type { UIMessage } from "ai";
import type { CitedChunk } from "@/components/chat/citation";

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

  const initialMessages: UIMessage[] = rows
    .filter(
      (m): m is { id: string; role: string; content: string; citations: unknown } =>
        m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text", text: m.content }],
    }));

  // Flatten all chunks ever cited in this conversation into a single pool. The
  // renderer keys by article_ref, so dupes across turns are harmless.
  const initialChunks: CitedChunk[] = rows.flatMap((m) =>
    Array.isArray(m.citations) ? (m.citations as CitedChunk[]) : [],
  );

  return (
    <Chat
      conversationId={id}
      initialMessages={initialMessages}
      initialChunks={initialChunks}
    />
  );
}
