import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { STATIC_SYSTEM_PROMPT, buildUserContext } from "@/lib/chat/system-prompt";
import {
  voyageEmbed,
  searchLaborCode,
  formatChunksForModel,
} from "@/lib/chat/retrieval";
import { summarizeConversation } from "@/lib/chat/summarize";
import {
  validateCitations,
  stripUnmatchedCitations,
} from "@/lib/chat/citations-validator";
import { routeMessage } from "@/lib/chat/router";
import { GEMINI_MODEL_ID, SONNET_MODEL_ID } from "@/lib/chat/models";
import { ensureGeminiCachedContent } from "@/lib/chat/gemini-cache";
import {
  isCacheEligible,
  normalizeQuery,
  canonicalizeQuery,
  lookupCachedResponse,
  writeCachedResponse,
  bumpCacheHit,
  bumpQueryFrequency,
} from "@/lib/chat/cache";
import { captureChatTurn, captureZeroCostTurn } from "@/lib/llm/capture";
import { randomUUID } from "crypto";

export const maxDuration = 60;

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

// Smalltalk interception — short greetings / acknowledgements don't need a
// model call. Returns the canned reply (with the user's first name) or null
// if the turn should go to the model. Condition: < 4 words AND matches a
// greeting or thanks token. Keeps a real legal question like "ok et le
// préavis ?" (≥ 4 words) on the model path.
const GREETING_RE = /\b(bonjour|bonsoir|salut|coucou|hello|hey)\b/i;
const THANKS_RE = /\b(merci|thanks|ok|okay|super|parfait|nickel|top|g[ée]nial)\b/i;

function cannedSmalltalkReply(
  text: string,
  firstName: string,
): string | null {
  const t = text.trim();
  if (t.length === 0) return null;
  if (t.split(/\s+/).length >= 4) return null;

  const isGreeting = GREETING_RE.test(t);
  const isThanks = THANKS_RE.test(t);
  if (!isGreeting && !isThanks) return null;

  // Greeting wins if both are present (e.g. "salut merci").
  if (isGreeting) {
    return `Bonjour ${firstName}, je suis Laya, votre assistante en droit du travail ivoirien. Posez-moi votre question — par exemple sur un contrat, un licenciement, des congés payés ou la durée du travail.`;
  }
  return `Avec plaisir, ${firstName} ! Si vous avez une autre question sur le droit du travail ivoirien, je suis là.`;
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
  // One id per user turn — groups all provider calls (multi-step tool use) of
  // this turn in llm_calls, and is stamped on the persisted message rows so the
  // cost drill-down can show the question text.
  const questionId = randomUUID();
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
    .select("id, user_id, title, summary, summary_through_message_id")
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

  // Sliding-window context (spec §7.4). Everything up to and including
  // `summary_through_message_id` is represented by the rolling `summary`
  // (injected as a system block below); only the messages AFTER that point
  // are sent verbatim. Caps per-turn input tokens regardless of conversation
  // length while preserving the older context in compacted form. All messages
  // still persist to the DB in full — this only shapes the model's view.
  const allRows = (priorRows ?? []) as DbMessage[];
  const convoSummary = convo.summary ?? null;
  const summaryThroughId = convo.summary_through_message_id ?? null;

  let windowRows = allRows;
  if (convoSummary && summaryThroughId) {
    const idx = allRows.findIndex((r) => r.id === summaryThroughId);
    if (idx >= 0) windowRows = allRows.slice(idx + 1);
  }
  // Backstop: if summarization has been failing, the uncovered tail can grow
  // unbounded. Cap it so input tokens can't run away (loses oldest verbatim
  // context, mirroring the pre-summary truncation). The summary still carries
  // the older turns when present.
  const MAX_WINDOW = 12;
  if (windowRows.length > MAX_WINDOW) windowRows = windowRows.slice(-MAX_WINDOW);

  // Anthropic requires the first message to be a user message. If the window
  // boundary (summary cutoff or MAX_WINDOW slice) lands on an assistant turn,
  // drop leading assistant rows — their gist is already in the summary, and
  // the incoming user message always follows the window.
  while (windowRows.length > 0 && windowRows[0].role !== "user") {
    windowRows = windowRows.slice(1);
  }

  const cappedPriorUi = dbMessagesToUi(windowRows);
  const uiMessages: UIMessage[] = [...cappedPriorUi, incomingMessage];

  // Trigger threshold for recomputing the rolling summary in onFinish.
  const LIVE_WINDOW = 6;

  // Shared fast-path responder: stream a fixed assistant text (smalltalk reply
  // or cache hit) as the turn, persist both turns + bump updated_at, no model
  // call. `citations` is attached to the assistant row (null for smalltalk,
  // the cached chunks for a cache hit) so badges resolve on reload.
  const fixedTextResponse = (
    text: string,
    citations: object | null,
    routeLabel: string,
    outcome: "cached" | "no_llm_call",
    cacheHit: boolean,
  ): Response => {
    console.info(
      `[chat] route=${routeLabel} len=${userInputText.length} convo=${conversationId}`,
    );
    const stream = createUIMessageStream<UIMessage>({
      originalMessages: uiMessages,
      execute: ({ writer }) => {
        const id = "fixed";
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
      onFinish: async ({ messages }) => {
        const service = createServiceClient();
        const newMessages = messages.slice(cappedPriorUi.length);
        const toInsert = newMessages
          .map((m) => ({
            conversation_id: conversationId,
            question_id: questionId,
            role: m.role,
            content: extractText(m),
            tool_calls: null,
            citations: m.role === "assistant" ? citations : null,
          }))
          .filter((r) => r.content.length > 0);
        if (toInsert.length > 0) {
          const { error: insertError } = await service
            .from("messages")
            .insert(toInsert);
          if (insertError) {
            console.error(
              "[chat] failed to persist fixed response",
              insertError,
            );
          }
        }
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        // Log the zero-cost turn so the dashboard sees how often the
        // optimizations fire (savings = aggregate of these vs model turns).
        await captureZeroCostTurn({
          conversationId,
          questionId,
          outcome,
          cacheHit,
        });
      },
    });
    return createUIMessageStreamResponse({ stream });
  };

  // Smalltalk fast-path: intercept greetings / acknowledgements before any
  // model call. Zero tokens consumed, so no usage_events row is logged.
  const firstName = profile.full_name.split(/\s+/)[0] || profile.full_name;
  const canned = cannedSmalltalkReply(userInputText, firstName);
  if (canned) {
    return fixedTextResponse(canned, null, "canned", "no_llm_call", false);
  }

  const searchTool = tool({
    description:
      "Recherche dans le Code du travail ivoirien et les textes officiels. À utiliser dès qu'une question demande un fait juridique précis. Tu peux l'appeler jusqu'à 3 fois par tour en reformulant la requête entre chaque appel.",
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

  // Whole-conversation routing (spec §0 "post-validation cycle"):
  // long detailed / individual-situation / adversarial messages →
  // Sonnet 4.6 (validated baseline). Short general/factual →
  // Gemini Flash 2.5 (cost-viable cheap branch for closed beta).
  const route = routeMessage(userInputText);
  console.info(
    `[chat] route=${route} len=${userInputText.length} convo=${conversationId}`,
  );

  // Semantic response cache (spec §0 grill, Build 2). Eligible turns are the
  // cheap-branch general questions (no first-person, no digits) — see
  // isCacheEligible. On a hit, skip the model + retrieval entirely. On a miss,
  // keep the embedding so onFinish can populate the cache without re-embedding.
  let cacheCtx: { normKey: string; embedding: number[] } | null = null;
  if (isCacheEligible(userInputText, route)) {
    const normKey = canonicalizeQuery(normalizeQuery(userInputText));
    try {
      const embedding = await voyageEmbed(normKey);
      const hit = await lookupCachedResponse(
        normKey,
        profile.user_type,
        embedding,
      );
      if (hit) {
        await bumpCacheHit(hit.id);
        await bumpQueryFrequency(normKey, profile.user_type);
        return fixedTextResponse(
          hit.responseText,
          (hit.retrievedChunks as object) ?? null,
          `cache-${hit.kind}`,
          "cached",
          true,
        );
      }
      cacheCtx = { normKey, embedding };
    } catch (err) {
      console.error("[chat] cache lookup error", err);
    }
  }

  // Sonnet supports ephemeral prompt caching on the static prefix — 90%
  // discount on the ~3,500-token static block for any call within the 5-min
  // TTL. Gemini uses explicit context caching (Build 3): the static prompt
  // lives in a cached `contents` resource, so when a reference is available we
  // drop the static system block and reference the cache instead. null →
  // caching unavailable, fall back to sending the static block inline.
  const model = route === "sonnet" ? anthropic(SONNET_MODEL_ID) : google(GEMINI_MODEL_ID);
  const geminiCacheName =
    route === "gemini" ? await ensureGeminiCachedContent() : null;
  if (route === "gemini") {
    console.info(
      `[chat] gemini-context-cache=${geminiCacheName ? "hit" : "uncached"} convo=${conversationId}`,
    );
  }

  // Rolling summary injected as a separate (uncached) system block. Kept out
  // of STATIC_SYSTEM_PROMPT so the cached Sonnet prefix stays byte-identical
  // across turns; kept out of the messages array so it can't break Anthropic's
  // "first message must be user" / role-alternation constraints. Self-describing
  // so the model treats it as memory, not as content to quote.
  const summaryBlock = convoSummary
    ? [
        {
          role: "system" as const,
          content: `Résumé des tours précédents de cette conversation (mémoire interne — ne le cite pas, n'y fais pas référence explicitement, ne le répète pas) :\n\n${convoSummary}`,
        },
      ]
    : [];

  const systemBlocks =
    route === "sonnet"
      ? [
          {
            role: "system" as const,
            content: STATIC_SYSTEM_PROMPT,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          {
            role: "system" as const,
            content: userContext,
          },
          ...summaryBlock,
        ]
      : geminiCacheName
        ? [
            // Static prompt is in the Gemini context cache — only the dynamic
            // blocks go in systemInstruction here.
            {
              role: "system" as const,
              content: userContext,
            },
            ...summaryBlock,
          ]
        : [
            {
              role: "system" as const,
              content: STATIC_SYSTEM_PROMPT,
            },
            {
              role: "system" as const,
              content: userContext,
            },
            ...summaryBlock,
          ];

  const startedAt = Date.now();
  const result = streamText({
    model,
    system: systemBlocks,
    messages: await convertToModelMessages(uiMessages),
    tools: { search_labor_code: searchTool },
    stopWhen: stepCountIs(4),
    providerOptions: geminiCacheName
      ? { google: { cachedContent: geminiCacheName } }
      : undefined,
  });

  // Ensure the stream is consumed even on client disconnect so onFinish runs
  // and we persist the assistant's response.
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages }) => {
      // Aggregated usage across all steps of this turn (multi-pass tool
      // calling counts as one logical turn). totalUsage resolves once the
      // stream is fully consumed — consumeStream() above guarantees that.
      const totalUsage = await result.totalUsage;
      const inputTokens = totalUsage?.inputTokens ?? null;
      const outputTokens = totalUsage?.outputTokens ?? null;

      // messages is the full UIMessage[] including the new user + assistant
      // turns. Slice from cappedPriorUi.length (not priorRows.length) since
      // that's the actual count of prior messages we sent to the model.
      // We let Postgres assign uuids (the AI SDK's own ids aren't uuids
      // and would clash with the column's uuid type).
      const priorCount = cappedPriorUi.length;
      const newMessages = messages.slice(priorCount);

      // Citation validation: walk the final assistant text and check that
      // every `[Art. X]` / `[Loi …]` / `[Décret …]` bracket resolves to a
      // chunk retrieved in this turn. Pure logging for now — the data
      // shows whether fabrication is happening in production. Aggregates
      // chunks across all new assistant messages so multi-step tool
      // calling doesn't trigger false positives.
      const turnChunks: ReturnType<typeof extractCitedChunks> = [];
      for (const m of newMessages) {
        if (m.role === "assistant") turnChunks.push(...extractCitedChunks(m));
      }
      let lastAssistantText = "";
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].role === "assistant") {
          lastAssistantText = extractText(newMessages[i]);
          break;
        }
      }
      if (lastAssistantText.length > 0) {
        const report = validateCitations(lastAssistantText, turnChunks);
        if (report.unmatched.length > 0) {
          console.warn(
            `[chat] citation-fabrication conversation=${conversationId} ` +
              `unmatched=${report.unmatched.length}/${report.total} ` +
              `labels=${JSON.stringify(report.unmatched)}`,
          );
        }
      }

      // Track this turn's provider calls (token-tracking-spec): one llm_calls
      // row per step, with the segment breakdown on the final step. Best-effort
      // — never blocks persistence. Returns the turn's total $ for usage_events.
      const segments = {
        systemStatic: STATIC_SYSTEM_PROMPT,
        systemDynamic:
          userContext + (convoSummary ? `\n\n${convoSummary}` : ""),
        history: windowRows.map((r) => r.content).join("\n\n"),
        chunks: turnChunks.map((c) => c.content).join("\n\n"),
        question: userInputText,
      };
      const steps = await result.steps;
      const cap = await captureChatTurn({
        provider: route,
        model: route === "sonnet" ? SONNET_MODEL_ID : GEMINI_MODEL_ID,
        conversationId,
        questionId,
        steps,
        segments,
        retrievedChunksCount: turnChunks.length,
        startedAt,
      });

      // Strip unmatched citations from assistant content before persisting:
      // any `[Art. X]` that didn't resolve to a chunk retrieved this turn
      // becomes plain text (brackets removed, inner kept). Persisted DB
      // content is clean; the live stream the user already saw is not touched.
      const toInsert = newMessages
        .map((m) => {
          const rawContent = extractText(m);
          const content =
            m.role === "assistant"
              ? stripUnmatchedCitations(rawContent, turnChunks)
              : rawContent;
          return {
            conversation_id: conversationId,
            question_id: questionId,
            role: m.role,
            content,
            tool_calls:
              m.role === "assistant"
                ? (extractToolCalls(m) as unknown as object)
                : null,
            citations:
              m.role === "assistant"
                ? (extractCitedChunks(m) as unknown as object)
                : null,
          };
        })
        .filter((r) => r.content.length > 0 || r.role === "assistant");

      const service = createServiceClient();
      if (toInsert.length > 0) {
        const { error: insertError } = await service
          .from("messages")
          .insert(toInsert);
        if (insertError) {
          console.error("[chat] failed to persist messages", insertError);
        }

        // One usage_events row per chat turn (spec §13) — per-user/quota axis,
        // now with cost_usd computed from the tracking pricing config.
        if (inputTokens !== null || outputTokens !== null) {
          const { error: usageError } = await service
            .from("usage_events")
            .insert({
              user_id: user.id,
              event_type: "chat_message",
              input_tokens: inputTokens ?? 0,
              output_tokens: outputTokens ?? 0,
              cost_usd: cap.totalCost,
            });
          if (usageError) {
            console.error("[chat] failed to log usage_events", usageError);
          }
        }
      }

      // Bump updated_at so the conversation list reorders
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Populate the response cache on an eligible miss (reuse the lookup
      // embedding). Store the CLEANED assistant text (same strip applied to the
      // persisted message) + cited chunks, so the next identical / near-identical
      // query is served without a model call. Frequency is bumped for every
      // eligible turn (hit or miss) to feed demand analytics.
      if (cacheCtx) {
        await bumpQueryFrequency(cacheCtx.normKey, profile.user_type);
        if (lastAssistantText.length > 0) {
          await writeCachedResponse({
            normKey: cacheCtx.normKey,
            userType: profile.user_type,
            embedding: cacheCtx.embedding,
            responseText: stripUnmatchedCitations(lastAssistantText, turnChunks),
            retrievedChunks: turnChunks,
          });
        }
      }

      // Sliding-window summarization (spec §7.4): once the conversation
      // exceeds the live window, recompute a rolling summary covering
      // everything except the last LIVE_WINDOW messages. Wholesale
      // re-summarization each trigger (fresh perspective, avoids the framing
      // drift of incremental summaries). On failure, leaves the previous
      // summary in place — the model-window backstop cap covers tail growth.
      const { data: freshRows } = await service
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (freshRows && freshRows.length > LIVE_WINDOW) {
        const toCompact = freshRows.slice(0, freshRows.length - LIVE_WINDOW);
        const throughId = toCompact[toCompact.length - 1].id;
        const transcript = toCompact
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map(
            (r) =>
              `${r.role === "user" ? "Utilisateur" : "Laya"}: ${r.content}`,
          )
          .join("\n\n");
        const summary = await summarizeConversation(transcript);
        if (summary) {
          await service
            .from("conversations")
            .update({
              summary,
              summary_through_message_id: throughId,
            })
            .eq("id", conversationId);
        }
      }
    },
  });
}
