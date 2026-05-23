"use client";

import { Fragment } from "react";
import { Citation, InfoLane, type CitedChunk } from "./citation";

// Matches bracketed citation markers. We restrict the leading word so we don't
// confuse [INFO], [Markdown links], or random brackets in user text for cites.
// Examples that match: [Art. L.16.7] [Article 14] [Décret n° 2024-898] [Loi n° 2015-532]
const CITATION_REGEX =
  /\[(?:Art\.?|Article|Décret|Loi|art\.?|article|décret|loi)[^\[\]\n]{1,80}\]/g;
const INFO_TOKEN = "[INFO]";

// Normalize for matching against chunk.article. Drops punctuation and case.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/n°/g, "n")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

// Build a lookup from normalized article -> chunk. We also fold in normalized
// substrings of `doc` (e.g. "Loi n° 2015-532") so document-level cites match.
function buildLookup(chunks: CitedChunk[]): Map<string, CitedChunk> {
  const map = new Map<string, CitedChunk>();
  for (const c of chunks) {
    if (c.article) {
      const key = normalize(c.article);
      if (key && !map.has(key)) map.set(key, c);
    }
    if (c.doc) {
      const key = normalize(c.doc);
      if (key && !map.has(key)) map.set(key, c);
    }
  }
  return map;
}

function matchChunk(
  badgeText: string,
  lookup: Map<string, CitedChunk>,
): CitedChunk | null {
  // Inner text without brackets
  const inner = badgeText.slice(1, -1);
  const key = normalize(inner);
  if (!key) return null;
  // Exact match first
  const hit = lookup.get(key);
  if (hit) return hit;
  // Substring fallback (cite says "Art. L.16" but chunk article is "Art. L.16.7")
  for (const [k, v] of lookup.entries()) {
    if (k.includes(key) || key.includes(k)) return v;
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
