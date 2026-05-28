import "server-only";
import { recordLlmCall } from "@/lib/llm/record";
import { countSegments, type SegmentTexts, type ChatProvider } from "@/lib/llm/count-tokens";
import type { NormalizedUsage } from "@/lib/llm/pricing";

// Additive tracking capture (token-tracking-spec). Reads per-step usage from a
// finished streamText result and writes one llm_calls row per provider call,
// plus the segment breakdown on the final (user-visible) step. Pure add-on —
// callers invoke it from onFinish; it never touches the streaming mechanics.
//
// NOTE: this is the lower-risk capture form. The Q12 "full wrapper that hides
// streamText behind the gateway + ESLint no-bypass" is a deferred follow-up.

// Loose shape of the AI SDK v6 step usage (LanguageModelUsage) — only the
// fields we price on.
type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

function normalize(u: UsageLike | undefined): NormalizedUsage {
  const input = u?.inputTokens ?? 0;
  const cacheRead =
    u?.inputTokenDetails?.cacheReadTokens ?? u?.cachedInputTokens ?? 0;
  const cacheWrite = u?.inputTokenDetails?.cacheWriteTokens ?? 0;
  const noCache =
    u?.inputTokenDetails?.noCacheTokens ??
    Math.max(0, input - cacheRead - cacheWrite);
  return {
    inputTokens: noCache,
    outputTokens: u?.outputTokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
}

const PROVIDER_KEY: Record<ChatProvider, string> = {
  sonnet: "anthropic",
  gemini: "gemini",
};

export async function captureChatTurn(opts: {
  provider: ChatProvider;
  model: string;
  conversationId: string;
  questionId: string;
  steps: Array<{ usage?: UsageLike }>;
  segments: SegmentTexts;
  retrievedChunksCount: number;
  startedAt: number;
}): Promise<{ totalCost: number }> {
  let totalCost = 0;
  try {
    // Exact segment breakdown via the free count endpoints (best-effort).
    const breakdown = await countSegments(opts.provider, opts.segments).catch(
      () => null,
    );
    const provider = PROVIDER_KEY[opts.provider];
    const lastIdx = opts.steps.length - 1;

    for (let i = 0; i < opts.steps.length; i++) {
      const usage = normalize(opts.steps[i]?.usage);
      const isLast = i === lastIdx;
      totalCost += await recordLlmCall({
        conversationId: opts.conversationId,
        questionId: opts.questionId,
        provider,
        model: opts.model,
        usage,
        callOutcome: "answered",
        cacheHit: (usage.cacheReadTokens ?? 0) > 0,
        latencyMs: isLast ? Date.now() - opts.startedAt : null,
        // Breakdown describes the assembled prompt → attach to the final step.
        retrievedChunksCount: isLast ? opts.retrievedChunksCount : null,
        retrievedChunksTokens: isLast
          ? (breakdown?.retrieved_chunks_tokens ?? null)
          : null,
        historyTokens: isLast ? (breakdown?.history_tokens ?? null) : null,
        systemPromptTokens: isLast
          ? (breakdown?.system_prompt_tokens ?? null)
          : null,
        userQuestionTokens: isLast
          ? (breakdown?.user_question_tokens ?? null)
          : null,
      });
    }
  } catch (err) {
    console.error("[llm] captureChatTurn error", err);
  }
  return { totalCost };
}

// Zero-cost turn (greeting / cache hit / short-circuit): one row, no tokens.
export async function captureZeroCostTurn(opts: {
  conversationId: string;
  questionId: string;
  outcome: "cached" | "no_llm_call" | "short_circuit";
  cacheHit?: boolean;
}): Promise<void> {
  await recordLlmCall({
    conversationId: opts.conversationId,
    questionId: opts.questionId,
    provider: null,
    model: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    callOutcome: opts.outcome,
    cacheHit: opts.cacheHit ?? false,
  });
}
