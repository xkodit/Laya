"use client";

import { Fragment } from "react";
import { Citation, InfoLane, type CitedChunk } from "./citation";

// Matches bracketed citation markers. We restrict the leading word so we don't
// confuse [INFO], [Markdown links], or random brackets in user text for cites.
// Examples that match: [Art. L.16.7] [Article 14] [Décret n° 2024-898] [Loi n° 2015-532]
const CITATION_REGEX =
  /\[(?:Art\.?|Article|Décret|Loi|art\.?|article|décret|loi)[^\[\]\n]{1,80}\]/g;
const INFO_TOKEN = "[INFO]";

// Normalize for matching against chunk.article. Collapses punctuation to a
// dash so hierarchical components stay distinguishable: "Art. L.16.7" becomes
// "art-l-16-7", which lets the parent/child fallback below reason safely
// (without the dash, "art5" would incorrectly match "art514").
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/n°/g, "n")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

type Lookup = {
  byArticle: Map<string, CitedChunk>;
  byDoc: Map<string, CitedChunk>;
};

function buildLookup(chunks: CitedChunk[]): Lookup {
  const byArticle = new Map<string, CitedChunk>();
  const byDoc = new Map<string, CitedChunk>();
  for (const c of chunks) {
    if (c.article) {
      const key = normalize(c.article);
      if (key && !byArticle.has(key)) byArticle.set(key, c);
    }
    if (c.doc) {
      const key = normalize(c.doc);
      if (key && !byDoc.has(key)) byDoc.set(key, c);
    }
  }
  return { byArticle, byDoc };
}

function matchChunk(badgeText: string, lookup: Lookup): CitedChunk | null {
  // Inner text without brackets, e.g. "Art. 15.4, Loi n° 2015-532"
  const inner = badgeText.slice(1, -1);
  // Split off any doc suffix — the article portion is what we resolve against
  // byArticle. Without this split, a cite like "Art. 15.6, Loi n° 2015-532"
  // would never exact-match a chunk whose article is just "Art. 15.6".
  const articlePart = inner.split(",")[0]!.trim();
  const articleKey = normalize(articlePart);

  if (articleKey) {
    const exact = lookup.byArticle.get(articleKey);
    if (exact) return exact;
    // Hierarchical fallback: chunk article is a child of the cite (cite says
    // "Art. L.16", chunk is "Art. L.16.7"). Requires the dash boundary so we
    // don't match "art-5" against "art-51-4".
    for (const [k, v] of lookup.byArticle.entries()) {
      if (k.startsWith(`${articleKey}-`)) return v;
    }
    // Reverse direction (cite is a child of chunk).
    for (const [k, v] of lookup.byArticle.entries()) {
      if (articleKey.startsWith(`${k}-`)) return v;
    }
  }

  // Doc-only citation like "[Loi n° 2015-532]" — fall back to the doc map.
  const fullKey = normalize(inner);
  if (fullKey) {
    const docHit = lookup.byDoc.get(fullKey);
    if (docHit) return docHit;
  }
  return null;
}

type Node =
  | { kind: "text"; value: string }
  | { kind: "info" }
  | { kind: "cite"; label: string };

// Split text into (text | info | cite) nodes. Handles streaming-partial text
// gracefully: a half-emitted `[Art. ` with no closing bracket stays as plain
// text until the closing token arrives in a later chunk.
function tokenize(text: string): Node[] {
  const nodes: Node[] = [];
  let cursor = 0;

  // Pre-extract [INFO] tokens
  while (cursor < text.length) {
    const infoAt = text.indexOf(INFO_TOKEN, cursor);
    CITATION_REGEX.lastIndex = cursor;
    const citeMatch = CITATION_REGEX.exec(text);
    const citeAt = citeMatch ? citeMatch.index : -1;

    // Pick whichever comes first
    if (infoAt === -1 && citeAt === -1) {
      nodes.push({ kind: "text", value: text.slice(cursor) });
      break;
    }

    let nextAt: number;
    let nextKind: "info" | "cite";
    let nextLen: number;

    if (infoAt !== -1 && (citeAt === -1 || infoAt < citeAt)) {
      nextAt = infoAt;
      nextKind = "info";
      nextLen = INFO_TOKEN.length;
    } else {
      nextAt = citeAt;
      nextKind = "cite";
      nextLen = citeMatch![0].length;
    }

    if (nextAt > cursor) {
      nodes.push({ kind: "text", value: text.slice(cursor, nextAt) });
    }
    if (nextKind === "info") {
      nodes.push({ kind: "info" });
    } else {
      nodes.push({ kind: "cite", label: text.slice(nextAt, nextAt + nextLen) });
    }
    cursor = nextAt + nextLen;
  }

  return nodes;
}

export function AnswerRenderer({
  text,
  chunks,
  onOpenChunk,
}: {
  text: string;
  chunks: CitedChunk[];
  onOpenChunk: (chunk: CitedChunk) => void;
}) {
  const lookup = buildLookup(chunks);
  const nodes = tokenize(text);

  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === "text") {
          return <Fragment key={i}>{node.value}</Fragment>;
        }
        if (node.kind === "info") {
          return <InfoLane key={i} />;
        }
        const chunk = matchChunk(node.label, lookup);
        return (
          <Citation
            key={i}
            label={node.label}
            chunk={chunk}
            onOpen={onOpenChunk}
          />
        );
      })}
    </>
  );
}
