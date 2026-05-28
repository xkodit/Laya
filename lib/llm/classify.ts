import "server-only";
import { TOKEN_BANDS, DOMINANT_SHARE } from "@/lib/llm/config";

// Rule-based reason attribution (token-tracking-spec §3a). Within the normal
// band → reason null (UI shows nothing). Outside it → a human-readable reason
// from the dominant driver + machine `reason_flags` for filtering.

export type ClassifyInput = {
  inputTokens: number; // total input incl. cached, for banding
  outputTokens: number;
  callOutcome: string;
  cacheHit: boolean;
  cacheReadTokens?: number | null;
  retrievedChunksCount?: number | null;
  retrievedChunksTokens?: number | null;
  historyTokens?: number | null;
  systemPromptTokens?: number | null;
};

export type Classification = { reason: string | null; reasonFlags: string[] };

export function classifyCall(c: ClassifyInput): Classification {
  // Path-based outcomes first — these explain low/zero billed tokens.
  if (c.callOutcome === "cached" || c.cacheHit) {
    return {
      reason: `Near-zero billed input: served from cache${
        c.cacheReadTokens ? ` (${c.cacheReadTokens} cache-read tokens)` : ""
      }.`,
      reasonFlags: ["cached"],
    };
  }
  if (c.callOutcome === "no_llm_call" || c.callOutcome === "short_circuit") {
    return {
      reason: "0 tokens: handled before any LLM call (greeting / canned response).",
      reasonFlags: ["short_circuit"],
    };
  }
  if (c.callOutcome === "refused_out_of_scope") {
    return {
      reason: "Minimal tokens: out-of-scope question, short refusal.",
      reasonFlags: ["refused"],
    };
  }
  if (c.callOutcome === "error") {
    return {
      reason: "0/partial tokens: provider or pipeline error.",
      reasonFlags: ["error"],
    };
  }

  const highOut = c.outputTokens > TOKEN_BANDS.highOutputTokens;
  const highIn = c.inputTokens > TOKEN_BANDS.highInputTokens;

  if (highIn) {
    const flags = ["high_input"];
    const chunks = c.retrievedChunksTokens ?? 0;
    const history = c.historyTokens ?? 0;
    const system = c.systemPromptTokens ?? 0;
    const total = c.inputTokens || 1;
    let driver: string;
    if (chunks / total >= DOMINANT_SHARE) {
      flags.push("high_context");
      driver = `${c.retrievedChunksCount ?? "plusieurs"} context chunks retrieved (${chunks} tokens) — broad/ambiguous query pulled lots of context.`;
    } else if (history / total >= DOMINANT_SHARE) {
      flags.push("long_history");
      driver = `long conversation history (${history} tokens carried forward).`;
    } else if (system / total >= DOMINANT_SHARE) {
      flags.push("large_system");
      driver = `oversized system prompt (${system} tokens).`;
    } else {
      driver = `${c.inputTokens} input tokens, no single dominant segment.`;
    }
    if (highOut) flags.push("large_output");
    const out = highOut ? ` Also high output (${c.outputTokens} tokens).` : "";
    return { reason: `High input: ${driver}${out}`, reasonFlags: flags };
  }

  if (highOut) {
    return {
      reason: `High output: long answer generated (${c.outputTokens} tokens) — multi-part question or many citations.`,
      reasonFlags: ["large_output"],
    };
  }

  if (c.inputTokens > 0 && c.inputTokens < TOKEN_BANDS.lowInputTokens) {
    return {
      reason: `Low input: very short prompt (${c.inputTokens} tokens).`,
      reasonFlags: ["low_input"],
    };
  }

  return { reason: null, reasonFlags: [] }; // normal
}
