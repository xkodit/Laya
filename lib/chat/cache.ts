import "server-only";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { STATIC_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { GEMINI_MODEL_ID } from "@/lib/chat/models";
import type { RouteDecision } from "@/lib/chat/router";

// Semantic response cache (spec §0 grill, Build 2). Lets repeated universal
// questions skip the model + retrieval. Only general, context-free queries are
// eligible (see isCacheEligible) — anything personal or numeric stays out, both
// for correctness (case-specific answers) and privacy (no PII in the cache).

const SIMILARITY_THRESHOLD = 0.92;
const TTL_DAYS = 30;

// Cache key fragment: a fingerprint of the static prompt + cheap model. When
// either changes, every prior entry stops matching (lookup filters on this
// hash) and ages out via TTL — so prompt tuning / model swaps self-invalidate.
export const CACHE_VERSION_HASH = createHash("sha256")
  .update(`${STATIC_SYSTEM_PROMPT}|${GEMINI_MODEL_ID}`)
  .digest("hex")
  .slice(0, 16);

// Normalize for the exact-match layer + as the text we embed. Strips accents
// and punctuation, lowercases, collapses whitespace.
export function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Hand-mapped exact-match layer: collapse known phrasings of a few universal
// questions onto one canonical key, so they share a single cache entry and hit
// exactly after the first population. Anchored full-string match only (never
// substring) so "le smig est-il imposable" can't collapse onto "smig montant".
// Variants must be written in normalizeQuery() form (lowercase, no accents).
// EXTENSION POINT: expand with Hussein-curated universal queries.
const CANONICAL_GROUPS: Array<{ canonical: string; variants: string[] }> = [
  {
    canonical: "smig montant",
    variants: [
      "smig montant",
      "montant du smig",
      "quel est le montant du smig",
      "c est quoi le smig",
      "le smig c est combien",
      "combien est le smig",
    ],
  },
  {
    canonical: "duree legale travail hebdomadaire",
    variants: [
      "duree legale du travail",
      "duree legale travail hebdomadaire",
      "duree hebdomadaire de travail",
      "duree legale de travail par semaine",
    ],
  },
];

export function canonicalizeQuery(norm: string): string {
  for (const g of CANONICAL_GROUPS) {
    if (g.variants.includes(norm)) return g.canonical;
  }
  return norm;
}

// First-person markers signal a personal situation → never cache (correctness
// + privacy). Tested on raw text (apostrophes survive, unlike normalizeQuery).
const FIRST_PERSON_RE =
  /(\bje\b|\bj['’]|\bmon\b|\bma\b|\bmes\b|\bnous\b|\bnotre\b|\bnos\b|\bmoi\b|\bm['’])/i;

// Eligibility is composed with the router: only the cheap (Gemini) branch —
// long/individual-situation/adversarial turns route to Sonnet and never cache.
export function isCacheEligible(text: string, route: RouteDecision): boolean {
  if (route !== "gemini") return false;
  if (/\d/.test(text)) return false;
  if (FIRST_PERSON_RE.test(text)) return false;
  return true;
}

export type CacheHit = {
  id: string;
  responseText: string;
  retrievedChunks: unknown;
  similarity: number;
  kind: "exact" | "semantic";
};

type CacheMatchRow = {
  id: string;
  query_norm: string;
  response_text: string;
  retrieved_chunks: unknown;
  similarity: number;
};

export async function lookupCachedResponse(
  normKey: string,
  userType: string,
  embedding: number[],
): Promise<CacheHit | null> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  // Exact layer — O(1) on the (query_norm, user_type, prompt_hash) unique index.
  const { data: exact } = await service
    .from("cached_responses")
    .select("id, response_text, retrieved_chunks")
    .eq("query_norm", normKey)
    .eq("user_type", userType)
    .eq("prompt_hash", CACHE_VERSION_HASH)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (exact) {
    return {
      id: exact.id,
      responseText: exact.response_text,
      retrievedChunks: exact.retrieved_chunks,
      similarity: 1,
      kind: "exact",
    };
  }

  // Semantic layer — cosine ≥ threshold.
  const { data, error } = await service.rpc("match_cached_response", {
    query_embedding: embedding as unknown as string,
    p_user_type: userType,
    p_prompt_hash: CACHE_VERSION_HASH,
    match_count: 3,
  });
  if (error) {
    console.error("[chat] cache semantic lookup failed", error);
    return null;
  }
  const matches = (data ?? []) as CacheMatchRow[];
  if (matches.length === 0) return null;

  const top = matches[0];
  if (top.similarity < SIMILARITY_THRESHOLD) {
    // Telemetry to tune the threshold later.
    console.info(
      `[chat] cache-near-miss norm="${normKey}" top3=` +
        JSON.stringify(matches.map((m) => Number(m.similarity.toFixed(3)))),
    );
    return null;
  }
  return {
    id: top.id,
    responseText: top.response_text,
    retrievedChunks: top.retrieved_chunks,
    similarity: top.similarity,
    kind: "semantic",
  };
}

export async function writeCachedResponse(args: {
  normKey: string;
  userType: string;
  embedding: number[];
  responseText: string;
  retrievedChunks: Array<{ doc?: string }>;
}): Promise<void> {
  const service = createServiceClient();
  const docLabels = [
    ...new Set(
      (args.retrievedChunks ?? [])
        .map((c) => c.doc)
        .filter((d): d is string => typeof d === "string" && d.length > 0),
    ),
  ];
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString();
  const { error } = await service.from("cached_responses").upsert(
    {
      query_norm: args.normKey,
      user_type: args.userType,
      query_embedding: args.embedding as unknown as string,
      response_text: args.responseText,
      retrieved_chunks: args.retrievedChunks as unknown as object,
      doc_labels: docLabels,
      prompt_hash: CACHE_VERSION_HASH,
      expires_at: expiresAt,
    },
    { onConflict: "query_norm,user_type,prompt_hash" },
  );
  if (error) console.error("[chat] cache write failed", error);
}

export async function bumpCacheHit(id: string): Promise<void> {
  const service = createServiceClient();
  await service.rpc("bump_cache_hit", { p_id: id });
}

export async function bumpQueryFrequency(
  normKey: string,
  userType: string,
): Promise<void> {
  const service = createServiceClient();
  await service.rpc("bump_query_frequency", {
    p_query_norm: normKey,
    p_user_type: userType,
  });
}
