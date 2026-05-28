import "server-only";

// Token-tracking tunables (token-tracking-spec §3a). Kept in one place so the
// reason classifier's "normal" band can be retuned without touching logic.
//
// Seeded from Laya's real pre-optimization baseline (spec §0, scripts/
// token_baseline.py): input p50 ≈ 10.6k, p90 ≈ 21k, p99 ≈ 39k; output p50 ≈
// 541, p90 ≈ 1025, p99 ≈ 2065. The "high" bands sit ≈ p90. RE-TUNE once the
// post-optimization (TOP_K=3 + summarization + caps) distribution settles —
// these numbers will drop.
export const TOKEN_BANDS = {
  highInputTokens: 22_000,
  highOutputTokens: 1_100,
  // Below this, treat as a low/zero-token outlier (most are explained by
  // call_outcome = cached/short_circuit/no_llm_call, not this threshold).
  lowInputTokens: 500,
} as const;

// Dominant-driver thresholds for the "why" attribution: a segment is called
// out only when it accounts for at least this share of input tokens.
export const DOMINANT_SHARE = 0.5;

// Gemini context-cache storage: $/1M cached tokens/hour. Mirrors the
// pricing_rates row for gemini-2.5-flash; used by the overview to net Build-3
// storage cost against its per-call savings (token-tracking-spec §11).
export const GEMINI_CACHE_STORAGE_PER_1M_PER_HOUR = 1.0;
