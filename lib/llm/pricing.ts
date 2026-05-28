import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Cost engine (token-tracking-spec §2). Resolves the active rate for a
// (provider, model) from the pricing_rates table and computes full-fidelity
// cost from normalized token counts. The computed $ is frozen onto each
// llm_calls row alongside the rate version, so later rate changes never
// rewrite history.

export type Rate = {
  provider: string;
  model: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  cache_read_price_per_1m: number | null;
  cache_write_price_per_1m: number | null;
  cache_storage_price_per_1m_per_hour: number | null;
  currency: string;
  version: string;
};

export type NormalizedUsage = {
  // Non-cached input tokens, billed at the full input rate. For Anthropic this
  // is usage.input_tokens (already excludes cache read/write); for Gemini it's
  // promptTokenCount − cachedContentTokenCount (the AI SDK exposes this split).
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number; // Anthropic cache_read / Gemini cachedContent
  cacheWriteTokens?: number; // Anthropic cache_creation
};

export type CostBreakdown = {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  rateVersion: string;
};

// In-instance rate cache. Rates change rarely (a new version is an explicit
// insert), and serverless instances are short-lived, so a simple TTL memo
// avoids a DB hit on every call without risking long staleness.
const RATE_TTL_MS = 10 * 60 * 1000;
const rateMemo = new Map<string, { rate: Rate | null; at: number }>();

export async function resolveRate(
  provider: string,
  model: string,
): Promise<Rate | null> {
  const key = `${provider}:${model}`;
  const cached = rateMemo.get(key);
  if (cached && Date.now() - cached.at < RATE_TTL_MS) return cached.rate;

  const service = createServiceClient();
  const { data, error } = await service
    .from("pricing_rates")
    .select(
      "provider, model, input_price_per_1m, output_price_per_1m, cache_read_price_per_1m, cache_write_price_per_1m, cache_storage_price_per_1m_per_hour, currency, version",
    )
    .eq("provider", provider)
    .eq("model", model)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[llm] resolveRate failed", error);
  const rate = (data as Rate | null) ?? null;
  rateMemo.set(key, { rate, at: Date.now() });
  return rate;
}

function asNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

export function computeCost(rate: Rate, usage: NormalizedUsage): CostBreakdown {
  const inRate = asNum(rate.input_price_per_1m);
  const outRate = asNum(rate.output_price_per_1m);
  // Fall back to the full input rate if a cache rate isn't configured, so a
  // missing rate never silently zeroes a real cost.
  const cacheReadRate =
    rate.cache_read_price_per_1m === null
      ? inRate
      : asNum(rate.cache_read_price_per_1m);
  const cacheWriteRate =
    rate.cache_write_price_per_1m === null
      ? inRate
      : asNum(rate.cache_write_price_per_1m);

  const inputCost =
    (usage.inputTokens / 1_000_000) * inRate +
    ((usage.cacheReadTokens ?? 0) / 1_000_000) * cacheReadRate +
    ((usage.cacheWriteTokens ?? 0) / 1_000_000) * cacheWriteRate;
  const outputCost = (usage.outputTokens / 1_000_000) * outRate;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    rateVersion: rate.version,
  };
}
