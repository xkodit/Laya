import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { STATIC_SYSTEM_PROMPT, buildUserContext } from "@/lib/chat/system-prompt";
import { searchLaborCode, formatChunksForModel } from "@/lib/chat/retrieval";

export const maxDuration = 60;

const MODEL_ID = "mistral-medium-latest";

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls: unknown | null;
  created_at: string;
};

// Reconstruct UIMessage[] from rows we persisted. We store just plain text per
// turn for now (no tool roundtrips replayed on history). That's fine for the
// model because once a turn is over the relevant facts are in the assistant's
// text — the tool calls don't need to be replayed for context.
function dbMessagesToUi(rows: DbMessage[]): UIMessage[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: r.content }],
    }));
}

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function extractToolCalls(message: UIMessage): unknown[] {
  return message.parts.filter((p) => p.type.startsWith("tool-"));
}

type RetrievedChunkOutput = {
  id: string;
  article?: string;
  section?: string;
  doc: string;
  primary: boolean;
  content: string;
};

// Pull every chunk returned by any search_labor_code tool call on this message,
// deduped by chunk id (the same article can come back across multiple search
// reformulations). The result is what we store in messages.citations and what
// the UI uses to power the "click a [Art. X] badge → see the source" panel.
function extractCitedChunks(message: UIMessage): RetrievedChunkOutput[] {
  const seen = new Set<string>();
  const out: RetrievedChunkOutput[] = [];
  for (const part of message.parts) {
    if (!part.type.startsWith("tool-")) continue;
    const p = part as { output?: { chunks?: RetrievedChunkOutput[] } };
    const chunks = p.output?.chunks;
    if (!Array.isArray(chunks)) continue;
    for (const c of chunks) {
      if (c && typeof c.id === "string" && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id: string;
    message: UIMessage;
  };
  const { id: conversationId, message: incomingMessage } = body;

  if (!conversationId || !incomingMessage) {
    return NextResponse.json(
      { error: "missing id or message" },
      { status: 400 },
    );
  }

  // Auth — RLS will also enforce, but we want a fast 401 and the user id.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, user_type, company")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "no profile" }, { status: 401 });
  }

  // Ensure the conversation row exists and belongs to this user. Insert is a
  // no-op if it already exists (we upsert by id). RLS guarantees we can only
  // touch our own rows.
  const userInputText = extractText(incomingMessage);
  const autoTitle =
    userInputText.length > 0
      ? userInputText.slice(0, 60) + (userInputText.length > 60 ? "…" : "")
      : "Nouvelle conversation";

  const { error: upsertError } = await supabase.from("conversations").upsert(
    {
      id: conversationId,
      user_id: user.id,
      title: autoTitle,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Verify ownership (returns null if not ours)
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, user_id, title")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();
  if (!convo) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Load prior messages
  const { data: priorRows } = await supabase
    .from("messages")
    .select("id, role, content, tool_calls, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const priorUi = dbMessagesToUi((priorRows ?? []) as DbMessage[]);
  const uiMessages: UIMessage[] = [...priorUi, incomingMessage];

  const searchTool = tool({
    description:
      "Recherche dans le Code du travail ivoirien et les textes officiels. À utiliser dès qu'une question demande un fait juridique précis. Tu peux l'appeler jusqu'à 5 fois par tour en reformulant la requête entre chaque appel.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "La requête en français. Sois précis·e : reformule en termes juridiques (ex. 'durée hebdomadaire travail', 'préavis démission cadre').",
        ),
    }),
    execute: async ({ query }) => {
      const chunks = await searchLaborCode(query);
      return {
        query,
        count: chunks.length,
        chunks: formatChunksForModel(chunks),
      };
    },
  });

  const userContext = buildUserContext({
    full_name: profile.full_name,
    user_type: profile.user_type,
    company: profile.company,
  });

  // Mistral provider has no equivalent to Anthropic's ephemeral prompt
  // cache, so both system blocks are uncached. The structural split
  // (static prefix + per-user tail) is kept so a revert to Anthropic
  // re-enables caching with a one-line change.
  const result = streamText({
    model: mistral(MODEL_ID),
    system: [
      {
        role: "system",
        content: STATIC_SYSTEM_PROMPT,
      },
      {
        role: "system",
        content: userContext,
      },
    ],
    messages: await convertToModelMessages(uiMessages),
    tools: { search_labor_code: searchTool },
    stopWhen: stepCountIs(8),
  });

  // Ensure the stream is consumed even on client disconnect so onFinish runs
  // and we persist the assistant's response.
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages }) => {
      // messages is the full UIMessage[] including the new user + assistant
      // turns. priorRows already covers the prefix from the DB, so anything
      // beyond that index is new. We let Postgres assign uuids (the AI SDK's
      // own ids aren't uuids and would clash with the column's uuid type).
      const priorCount = priorRows?.length ?? 0;
      const toInsert = messages
        .slice(priorCount)
        .map((m) => ({
          conversation_id: conversationId,
          role: m.role,
          content: extractText(m),
          tool_calls:
            m.role === "assistant"
              ? (extractToolCalls(m) as unknown as object)
              : null,
          citations:
            m.role === "assistant"
              ? (extractCitedChunks(m) as unknown as object)
              : null,
        }))
        .filter((r) => r.content.length > 0 || r.role === "assistant");

      if (toInsert.length > 0) {
        const service = createServiceClient();
        const { error: insertError } = await service
          .from("messages")
          .insert(toInsert);
        if (insertError) {
          console.error("[chat] failed to persist messages", insertError);
        }
      }

      // Bump updated_at so the conversation list reorders
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
  });
}
