import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveRate,
  computeCost,
  type NormalizedUsage,
} from "@/lib/llm/pricing";
import { classifyCall } from "@/lib/llm/classify";

// Writes one row to llm_calls: computes + freezes cost from the active rate,
// attaches the reason classification, persists. Best-effort — tracking must
// never break a chat turn, so all errors are swallowed.
export type LlmCallRecord = {
  conversationId: string;
  questionId: string;
  provider: string | null; // 'gemini' | 'anthropic' | 'voyage' | null (no_llm_call)
  model: string | null;
  usage: NormalizedUsage; // inputTokens = NON-cached input
  callOutcome:
    | "answered"
    | "cached"
    | "short_circuit"
    | "refused_out_of_scope"
    | "error"
    | "no_llm_call";
  cacheHit?: boolean;
  latencyMs?: number | null;
  retrievedChunksCount?: number | null;
  retrievedChunksTokens?: number | null;
  historyTokens?: number | null;
  systemPromptTokens?: number | null;
  userQuestionTokens?: number | null;
};

// Returns the computed total cost (USD) for this call, or 0 on any failure.
export async function recordLlmCall(rec: LlmCallRecord): Promise<number> {
  try {
    const service = createServiceClient();

    let inputCost = 0;
    let outputCost = 0;
    let totalCost = 0;
    let rateVersion: string | null = null;
    if (rec.provider && rec.model) {
      const rate = await resolveRate(rec.provider, rec.model);
      if (rate) {
        const c = computeCost(rate, rec.usage);
        inputCost = c.inputCost;
        outputCost = c.outputCost;
        totalCost = c.totalCost;
        rateVersion = c.rateVersion;
      }
    }

    const inputTokens = rec.usage.inputTokens ?? 0;
    const outputTokens = rec.usage.outputTokens ?? 0;
    const cacheRead = rec.usage.cacheReadTokens ?? 0;
    const cacheWrite = rec.usage.cacheWriteTokens ?? 0;
    const totalTokens = inputTokens + outputTokens + cacheRead + cacheWrite;

    const { reason, reasonFlags } = classifyCall({
      inputTokens: inputTokens + cacheRead, // total input for banding
      outputTokens,
      callOutcome: rec.callOutcome,
      cacheHit: rec.cacheHit ?? false,
      cacheReadTokens: cacheRead,
      retrievedChunksCount: rec.retrievedChunksCount ?? null,
      retrievedChunksTokens: rec.retrievedChunksTokens ?? null,
      historyTokens: rec.historyTokens ?? null,
      systemPromptTokens: rec.systemPromptTokens ?? null,
    });

    const { error } = await service.from("llm_calls").insert({
      conversation_id: rec.conversationId,
      question_id: rec.questionId,
      provider: rec.provider,
      model: rec.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheRead || null,
      cache_write_tokens: cacheWrite || null,
      total_tokens: totalTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: totalCost,
      rate_version: rateVersion,
      latency_ms: rec.latencyMs ?? null,
      retrieved_chunks_count: rec.retrievedChunksCount ?? null,
      retrieved_chunks_tokens: rec.retrievedChunksTokens ?? null,
      history_tokens: rec.historyTokens ?? null,
      system_prompt_tokens: rec.systemPromptTokens ?? null,
      user_question_tokens: rec.userQuestionTokens ?? null,
      cache_hit: rec.cacheHit ?? false,
      call_outcome: rec.callOutcome,
      reason,
      reason_flags: reasonFlags.length ? reasonFlags : null,
    });
    if (error) console.error("[llm] recordLlmCall insert failed", error);
    return totalCost;
  } catch (err) {
    console.error("[llm] recordLlmCall error", err);
    return 0;
  }
}
