import "server-only";

// Same restrictive regex as the client renderer
// (components/chat/answer-renderer.tsx). Restricted to leading legal-doc
// keywords so we don't catch [INFO], markdown links, or random brackets.
// Examples that match:
//   [Art. L.16.7] [Article 14] [Décret n° 2024-898] [Loi n° 2015-532]
//   [Convention AICI/UGTCI 1977]
const CITATION_REGEX =
  /\[(?:Art\.?|Article|Décret|Loi|Convention|art\.?|article|décret|loi|convention)[^\[\]\n]{1,80}\]/g;

// Must stay in lock-step with components/chat/answer-renderer.tsx normalize.
// Collapses punctuation to a dash so hierarchical components stay
// distinguishable ("Art. L.16.7" → "art-l-16-7"). "article" → "art" so
// "[Article 15.10]" matches chunks tagged "Art. 15.10". "n°" dropped so
// "[Loi n° 2015-532]" matches the canonical doc label "Loi 2015-532".
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\barticle\b/g, "art")
    .replace(/n°\s*/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

type ChunkLike = {
  article?: string;
  doc: string;
};

export type CitationValidationReport = {
  total: number;
  matched: number;
  unmatched: string[]; // inner labels of unmatched cites (e.g., "Art. 17.1")
};

function buildKeys(chunks: ChunkLike[]): {
  byArticle: Set<string>;
  byDoc: Set<string>;
} {
  const byArticle = new Set<string>();
  const byDoc = new Set<string>();
  for (const c of chunks) {
    if (c.article) {
      const key = normalize(c.article);
      if (key) byArticle.add(key);
    }
    if (c.doc) {
      const key = normalize(c.doc);
      if (key) byDoc.add(key);
    }
  }
  return { byArticle, byDoc };
}

// Mirrors the client renderer's matchChunk algorithm. Try every comma-
// separated segment as a possible article (with hierarchical fallback both
// directions), then as a possible doc; finally try the whole inner as a
// doc key. Handles all bracket shapes the model emits, including reversed
// "[Doc, Art]" forms.
function resolvesToChunk(
  inner: string,
  byArticle: Set<string>,
  byDoc: Set<string>,
): boolean {
  const parts = inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const key = normalize(part);
    if (!key) continue;
    if (byArticle.has(key)) return true;
    for (const k of byArticle) {
      if (k.startsWith(`${key}-`) || key.startsWith(`${k}-`)) return true;
    }
  }
  for (const part of parts) {
    const key = normalize(part);
    if (!key) continue;
    if (byDoc.has(key)) return true;
  }
  const fullKey = normalize(inner);
  if (fullKey && byDoc.has(fullKey)) return true;
  return false;
}

/**
 * Walk a model-emitted assistant text, find every bracket citation, and check
 * whether each one resolves to a chunk that was actually retrieved this turn.
 *
 * Pure observability: returns counts + the unmatched inner labels. Caller
 * decides what to do (log, strip, refuse, etc.).
 */
export function validateCitations(
  text: string,
  chunks: ChunkLike[],
): CitationValidationReport {
  const { byArticle, byDoc } = buildKeys(chunks);
  let total = 0;
  let matched = 0;
  const unmatched: string[] = [];

  for (const m of text.matchAll(CITATION_REGEX)) {
    const inner = m[0].slice(1, -1);
    total++;
    if (resolvesToChunk(inner, byArticle, byDoc)) matched++;
    else unmatched.push(inner);
  }

  return { total, matched, unmatched };
}

/**
 * Strip the brackets from any citation that doesn't resolve to a chunk
 * retrieved this turn. Inner text is kept (so "[Art. 13.1]" becomes the
 * plain text "Art. 13.1"), which preserves the model's reasoning trail
 * but removes the false promise of a clickable source. Brackets that
 * resolve are left untouched so the client renderer renders them as
 * clickable badges.
 */
export function stripUnmatchedCitations(
  text: string,
  chunks: ChunkLike[],
): string {
  const { byArticle, byDoc } = buildKeys(chunks);
  return text.replace(CITATION_REGEX, (match) => {
    const inner = match.slice(1, -1);
    return resolvesToChunk(inner, byArticle, byDoc) ? match : inner;
  });
}
