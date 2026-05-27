import "server-only";

// Same restrictive regex as the client renderer
// (components/chat/answer-renderer.tsx). Restricted to leading legal-doc
// keywords so we don't catch [INFO], markdown links, or random brackets.
// Examples that match:
//   [Art. L.16.7] [Article 14] [Décret n° 2024-898] [Loi n° 2015-532]
const CITATION_REGEX =
  /\[(?:Art\.?|Article|Décret|Loi|art\.?|article|décret|loi)[^\[\]\n]{1,80}\]/g;

// Normalize for matching against chunk.article and chunk.doc. Collapses
// punctuation to a dash so hierarchical components stay distinguishable:
// "Art. L.16.7" → "art-l-16-7". The dash boundary prevents false matches
// like "art-5" against "art-51-4".
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/n°/g, "n")
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

/**
 * Walk a model-emitted assistant text, find every bracket citation, and check
 * whether each one resolves to a chunk that was actually retrieved this turn.
 * Mirrors the client renderer's matchChunk() — exact article match, then
 * hierarchical fallback both directions ("Art. L.16" matches "Art. L.16.7"),
 * then doc-only match for whole-document cites.
 *
 * Pure observability for now: returns counts + the unmatched inner labels.
 * Caller decides what to do (log, strip, refuse, etc.).
 */
export function validateCitations(
  text: string,
  chunks: ChunkLike[],
): CitationValidationReport {
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

  let total = 0;
  let matched = 0;
  const unmatched: string[] = [];

  for (const m of text.matchAll(CITATION_REGEX)) {
    const badge = m[0];
    const inner = badge.slice(1, -1);
    total++;

    // Split off any doc suffix — the article portion is what resolves
    // against byArticle. Without this split, "Art. 15.6, Loi n° 2015-532"
    // would never exact-match a chunk whose article is just "Art. 15.6".
    const articlePart = inner.split(",")[0]!.trim();
    const articleKey = normalize(articlePart);

    let hit = false;
    if (articleKey) {
      if (byArticle.has(articleKey)) {
        hit = true;
      } else {
        // Hierarchical fallback (cite parent vs chunk child, both ways).
        for (const k of byArticle) {
          if (k.startsWith(`${articleKey}-`) || articleKey.startsWith(`${k}-`)) {
            hit = true;
            break;
          }
        }
      }
    }

    if (!hit) {
      // Doc-only fallback for cites like "[Loi n° 2015-532]".
      const fullKey = normalize(inner);
      if (fullKey && byDoc.has(fullKey)) hit = true;
    }

    if (hit) matched++;
    else unmatched.push(inner);
  }

  return { total, matched, unmatched };
}

/**
 * Strip the brackets from any citation that doesn't resolve to a chunk
 * retrieved this turn. Inner text is kept (so "[Art. 13.1]" becomes the
 * plain text "Art. 13.1"), which preserves the model's reasoning trail
 * but removes the false promise of a clickable source.
 *
 * Same matching algorithm as validateCitations() — identical exact /
 * hierarchical / doc fallback logic. Brackets that resolve are left
 * untouched so the client renderer can still turn them into badges.
 */
export function stripUnmatchedCitations(
  text: string,
  chunks: ChunkLike[],
): string {
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

  return text.replace(CITATION_REGEX, (match) => {
    const inner = match.slice(1, -1);
    const articlePart = inner.split(",")[0]!.trim();
    const articleKey = normalize(articlePart);

    let hit = false;
    if (articleKey) {
      if (byArticle.has(articleKey)) {
        hit = true;
      } else {
        for (const k of byArticle) {
          if (k.startsWith(`${articleKey}-`) || articleKey.startsWith(`${k}-`)) {
            hit = true;
            break;
          }
        }
      }
    }

    if (!hit) {
      const fullKey = normalize(inner);
      if (fullKey && byDoc.has(fullKey)) hit = true;
    }

    return hit ? match : inner;
  });
}
