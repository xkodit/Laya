import "server-only";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { STATIC_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { GEMINI_MODEL_ID } from "@/lib/chat/models";

// Gemini explicit context caching (spec §0 grill, Build 3). Caches the bulky
// static prompt as a cached resource so the cheap branch (≈80% of traffic)
// stops re-sending ~3,500 tokens every turn. Implicit caching doesn't help —
// it only fires for prompts ≥4,096 tokens, and ours is ~3,500.
//
// The static prompt is cached as a leading `contents` exchange (user turn +
// model ack), NOT as systemInstruction — that lets the live request keep its
// own systemInstruction (userContext + summary) and tools, which Gemini
// forbids alongside a cached systemInstruction. Cached contents are prepended
// to the request contents server-side, preserving user/model alternation.
//
// Lifecycle: lazy self-heal. The resource id + a fingerprint of the static
// prompt + model live in app_settings. On use we reuse the stored id while the
// fingerprint matches and it isn't near expiry; otherwise we create a fresh
// resource, persist it, and best-effort delete the old one. A prompt tune or
// model swap changes the fingerprint and thus auto-rotates the cache.

const SETTINGS_KEY = "gemini_context_cache";
const GLA_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // refresh if < 1 day left
const MEMO_TTL_MS = 5 * 60 * 1000; // in-instance memo to skip the DB read

const PROMPT_HASH = createHash("sha256")
  .update(`${STATIC_SYSTEM_PROMPT}|${GEMINI_MODEL_ID}`)
  .digest("hex")
  .slice(0, 16);

type CacheSettings = { name: string; promptHash: string; expiresAt: string };

let memo: { name: string; expiresAtMs: number; cachedAtMs: number } | null =
  null;
let inflight: Promise<string | null> | null = null;

// DISABLED 2026-05-28 after a production incident (AI_APICallError on every
// Gemini turn). Gemini rejects a generateContent request that sets
// `cachedContent` alongside a request-level `systemInstruction` and `tools`.
// Our systemInstruction (userContext + rolling summary) is per-user/dynamic so
// it can't live in the cached resource, and the search tool must stay in the
// request for the AI SDK to execute it — so explicit context caching is
// incompatible with this request shape. It was also net-negative ROI at
// closed-beta scale (storage ~$2.52/mo > per-call savings). Returning null
// makes the route fall back to the validated uncached Gemini path. Set
// GEMINI_CONTEXT_CACHE=1 to re-enable once the request shape is reworked.
const GEMINI_CONTEXT_CACHE_ENABLED = process.env.GEMINI_CONTEXT_CACHE === "1";

// Returns a `cachedContents/{id}` reference, or null if caching is unavailable
// (no API key, creation failed, …) — callers fall back to the uncached path.
export async function ensureGeminiCachedContent(): Promise<string | null> {
  if (!GEMINI_CONTEXT_CACHE_ENABLED) return null;
  const now = Date.now();
  if (
    memo &&
    now - memo.cachedAtMs < MEMO_TTL_MS &&
    memo.expiresAtMs - now > REFRESH_BUFFER_MS
  ) {
    return memo.name;
  }
  if (inflight) return inflight;
  inflight = doEnsure().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doEnsure(): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    const current = (data?.value ?? null) as CacheSettings | null;

    if (
      current &&
      current.promptHash === PROMPT_HASH &&
      new Date(current.expiresAt).getTime() - Date.now() > REFRESH_BUFFER_MS
    ) {
      memo = {
        name: current.name,
        expiresAtMs: new Date(current.expiresAt).getTime(),
        cachedAtMs: Date.now(),
      };
      return current.name;
    }

    const created = await createCachedContent(apiKey);
    if (!created) {
      // Creation failed — reuse a still-valid current entry if the fingerprint
      // matches, else degrade to the uncached path.
      return current && current.promptHash === PROMPT_HASH
        ? current.name
        : null;
    }

    await service.from("app_settings").upsert(
      {
        key: SETTINGS_KEY,
        value: created as unknown as object,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (current?.name && current.name !== created.name) {
      void deleteCachedContent(apiKey, current.name);
    }
    memo = {
      name: created.name,
      expiresAtMs: new Date(created.expiresAt).getTime(),
      cachedAtMs: Date.now(),
    };
    return created.name;
  } catch (err) {
    console.error("[chat] gemini cache ensure failed", err);
    return null;
  }
}

async function createCachedContent(
  apiKey: string,
): Promise<CacheSettings | null> {
  const res = await fetch(`${GLA_BASE}/cachedContents?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: `models/${GEMINI_MODEL_ID}`,
      contents: [
        { role: "user", parts: [{ text: STATIC_SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Compris." }] },
      ],
      ttl: `${TTL_SECONDS}s`,
    }),
  });
  if (!res.ok) {
    console.error(
      `[chat] gemini cache create failed (${res.status}): ${await res.text()}`,
    );
    return null;
  }
  const json = (await res.json()) as { name?: string; expireTime?: string };
  if (!json.name) return null;
  return {
    name: json.name,
    promptHash: PROMPT_HASH,
    expiresAt:
      json.expireTime ??
      new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  };
}

async function deleteCachedContent(apiKey: string, name: string): Promise<void> {
  try {
    await fetch(`${GLA_BASE}/${name}?key=${apiKey}`, { method: "DELETE" });
  } catch {
    // best-effort cleanup of the superseded resource
  }
}
