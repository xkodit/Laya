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
  const embedding = await voyageEmbed(query);

  const supabase = createServiceClient();
  const { data: candidates, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: CANDIDATE_COUNT,
    filter_primary_only: false,
  });
  if (error) {
    throw new Error(`match_chunks failed: ${error.message}`);
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
