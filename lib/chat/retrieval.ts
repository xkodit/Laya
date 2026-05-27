import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  article_ref: string | null;
  parent_section: string | null;
  content: string;
  document_title: string;
  document_reference: string | null;
  is_primary_source: boolean;
  similarity: number;
  rerank_score: number;
};

const CANDIDATE_COUNT = 20;
const TOP_K = 6;
const VOYAGE_API = "https://api.voyageai.com/v1";

// Deterministic query expansion: bridge the gap between user
// abbreviations (CDD, CDI, SMIG…) and the formal vocabulary used in
// the legal corpus ("contrat à durée déterminée", "salaire minimum
// interprofessionnel garanti"). Zero LLM tokens — pure string replace
// applied before both the Voyage embed call and the FTS query.
//
// Why: Q19 ("CDD se termine mais je continue à travailler") didn't
// retrieve Art. 15.10 because the chunk says "contrats à durée
// déterminée... réputés être à durée indéterminée" — no overlap with
// "CDD/CDI". Expanding the query covers the lexical gap on both legs
// of the hybrid search.
//
// Word-boundary matching so "CDDS" or "incomplet" don't trigger
// partial matches. Case-insensitive so "cdd"/"CDD"/"Cdd" all expand.
const QUERY_ALIASES: Record<string, string> = {
  CDD: "CDD contrat à durée déterminée",
  CDI: "CDI contrat à durée indéterminée",
  SMIG: "SMIG salaire minimum interprofessionnel garanti",
  CNPS: "CNPS Caisse Nationale de Prévoyance Sociale",
  DGT: "DGT Direction Générale du Travail",
  DRH: "DRH directeur·trice des ressources humaines",
  CCI: "CCI convention collective interprofessionnelle",
  RH: "RH ressources humaines",
};

function expandQuery(query: string): string {
  let expanded = query;
  for (const [abbr, full] of Object.entries(QUERY_ALIASES)) {
    const re = new RegExp(`\\b${abbr}\\b`, "gi");
    expanded = expanded.replace(re, full);
  }
  return expanded;
}

async function voyageEmbed(query: string): Promise<number[]> {
  const res = await fetch(`${VOYAGE_API}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.VOYAGE_API_KEY!}`,
    },
    body: JSON.stringify({
      input: [query],
      model: "voyage-3",
      input_type: "query",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embed failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const emb = json.data?.[0]?.embedding;
  if (!emb) throw new Error("Voyage embed returned no embedding");
  return emb;
}

async function voyageRerank(
  query: string,
  documents: string[],
  topK: number,
): Promise<Array<{ index: number; relevance_score: number }>> {
  const res = await fetch(`${VOYAGE_API}/rerank`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.VOYAGE_API_KEY!}`,
    },
    body: JSON.stringify({
      query,
      documents,
      model: "rerank-2.5",
      top_k: topK,
      return_documents: false,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Voyage rerank failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    data: Array<{ index: number; relevance_score: number }>;
  };
  return json.data ?? [];
}

export async function searchLaborCode(
  query: string,
): Promise<RetrievedChunk[]> {
  // Expand abbreviations BEFORE embedding + FTS so both legs of the
  // hybrid search see the full formal vocabulary the corpus uses.
  const expanded = expandQuery(query);
  const embedding = await voyageEmbed(expanded);

  // Hybrid retrieval (migration 0013): RPC merges vector top-30 + FTS
  // top-30 via Reciprocal Rank Fusion, returns top CANDIDATE_COUNT.
  // Replaces vector-only match_chunks (0009) which missed articles whose
  // wording diverges from how users phrase questions (e.g. Art. 15.10
  // saying "réputés être à durée indéterminée" vs user "CDD se termine
  // mais je continue à travailler"). The FTS leg catches lexical hits.
  const supabase = createServiceClient();
  const { data: candidates, error } = await supabase.rpc(
    "match_chunks_hybrid",
    {
      query_embedding: embedding as unknown as string,
      query_text: expanded,
      match_count: CANDIDATE_COUNT,
      filter_primary_only: false,
    },
  );
  if (error) {
    throw new Error(`match_chunks_hybrid failed: ${error.message}`);
  }
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const ranked = await voyageRerank(
    query,
    candidates.map((c: { content: string }) => c.content),
    TOP_K,
  );

  return ranked.map((r) => {
    const cand = candidates[r.index];
    return {
      id: cand.id,
      document_id: cand.document_id,
      article_ref: cand.article_ref,
      parent_section: cand.parent_section,
      content: cand.content,
      document_title: cand.document_title,
      document_reference: cand.document_reference,
      is_primary_source: cand.is_primary_source,
      similarity: cand.similarity,
      rerank_score: r.relevance_score,
    } satisfies RetrievedChunk;
  });
}

// Compact JSON-friendly shape we hand to the model as the tool result.
// Keep field names short — they're tokens the model has to read.
export function formatChunksForModel(chunks: RetrievedChunk[]) {
  return chunks.map((c) => ({
    id: c.id,
    article: c.article_ref ?? undefined,
    section: c.parent_section ?? undefined,
    doc: c.document_reference ?? c.document_title,
    primary: c.is_primary_source,
    content: c.content,
  }));
}
