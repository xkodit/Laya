import "server-only";
import { createHash } from "crypto";
import { GEMINI_MODEL_ID, SONNET_MODEL_ID } from "@/lib/chat/models";

// Exact per-segment token counts via the providers' FREE token-count endpoints
// (token-tracking-spec §3, Hard Req #1). No model is invoked, so there is no
// token billing — only rate limits. Run post-stream in onFinish, never on the
// hot path. All failures degrade to null (the breakdown is best-effort).

const GLA_BASE = "https://generativelanguage.googleapis.com/v1beta";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

export type ChatProvider = "gemini" | "sonnet";

async function countGemini(text: string): Promise<number | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || !text) return text ? null : 0;
  try {
    const res = await fetch(
      `${GLA_BASE}/models/${GEMINI_MODEL_ID}:countTokens?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
        }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { totalTokens?: number };
    return json.totalTokens ?? null;
  } catch {
    return null;
  }
}

async function countAnthropic(text: string): Promise<number | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text) return text ? null : 0;
  try {
    const res = await fetch(`${ANTHROPIC_BASE}/messages/count_tokens`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: SONNET_MODEL_ID,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { input_tokens?: number };
    return json.input_tokens ?? null;
  } catch {
    return null;
  }
}

function countOne(provider: ChatProvider, text: string): Promise<number | null> {
  return provider === "sonnet" ? countAnthropic(text) : countGemini(text);
}

// The static system prompt doesn't change within a turn or across turns (only
// when the prompt version changes), so count it once per (provider, hash).
const staticMemo = new Map<string, number | null>();

async function countStatic(
  provider: ChatProvider,
  text: string,
): Promise<number | null> {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const key = `${provider}:${hash}`;
  if (staticMemo.has(key)) return staticMemo.get(key) ?? null;
  const n = await countOne(provider, text);
  staticMemo.set(key, n);
  return n;
}

export type SegmentTexts = {
  systemStatic: string; // STATIC_SYSTEM_PROMPT (counted once, cached)
  systemDynamic: string; // userContext + summary block
  history: string; // windowed prior turns, concatenated
  chunks: string; // retrieved chunk contents injected this turn
  question: string; // the user's incoming message
};

export type SegmentTokens = {
  system_prompt_tokens: number | null;
  history_tokens: number | null;
  retrieved_chunks_tokens: number | null;
  user_question_tokens: number | null;
};

// Count each segment independently (approximately additive — role/formatting
// tokens are a small residual against the exact billed total). Runs the calls
// in parallel.
export async function countSegments(
  provider: ChatProvider,
  seg: SegmentTexts,
): Promise<SegmentTokens> {
  const [staticN, dynamicN, history, chunks, question] = await Promise.all([
    countStatic(provider, seg.systemStatic),
    countOne(provider, seg.systemDynamic),
    countOne(provider, seg.history),
    countOne(provider, seg.chunks),
    countOne(provider, seg.question),
  ]);
  const system =
    staticN === null && dynamicN === null
      ? null
      : (staticN ?? 0) + (dynamicN ?? 0);
  return {
    system_prompt_tokens: system,
    history_tokens: history,
    retrieved_chunks_tokens: chunks,
    user_question_tokens: question,
  };
}
