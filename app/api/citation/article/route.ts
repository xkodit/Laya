import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Fetch every chunk of the same article (same document_id + article_ref),
// concatenated in chunk_index order. The chat tool stores only the chunks
// retrieved by Voyage rerank — typically the top 3 — but the article-aware
// chunker splits articles >1500 chars into multiple chunks, so a cited
// article may exist as several chunks in the corpus. When the user clicks a
// citation badge, the side panel needs the full article text so they can
// verify the cited claim end-to-end (Round-5 V&V Q18 was a false MAUVAIS
// because Hadi saw only one chunk of Art. 14 of CCI 1977 — the exception
// he was looking for was in chunk 2 of the same article).
//
// Lookup strategy: chunk id is truncated to 8 hex chars in the persisted
// citation (formatChunksForModel saves model tokens), so we LIKE-match by
// prefix. 8 hex = ~4B possibilities across ~hundreds of corpus chunks =
// effectively unique. Falls back to the (doc, article) tuple if the prefix
// lookup misses (e.g. very old persisted citations from before truncation).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chunkId = url.searchParams.get("chunkId");
  const article = url.searchParams.get("article");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Resolve (document_id, article_ref) from the chunk id prefix.
  let documentId: string | null = null;
  let articleRef: string | null = article;
  if (chunkId && chunkId.length >= 6) {
    const { data } = await service
      .from("document_chunks")
      .select("document_id, article_ref")
      .like("id", `${chunkId}%`)
      .limit(1)
      .maybeSingle();
    if (data) {
      documentId = data.document_id;
      articleRef = data.article_ref;
    }
  }

  if (!documentId || !articleRef) {
    return NextResponse.json(
      { error: "chunk not found" },
      { status: 404 },
    );
  }

  // Fetch every chunk of that article, ordered as they appear in the source
  // document. We don't dedupe content here — if the chunker overlapped, the
  // small repetition is preferable to risking a missed fragment.
  const { data: parts, error } = await service
    .from("document_chunks")
    .select("content, chunk_index")
    .eq("document_id", documentId)
    .eq("article_ref", articleRef)
    .order("chunk_index", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fullContent = (parts ?? [])
    .map((p) => p.content)
    .join("\n\n")
    .trim();

  return NextResponse.json({
    article: articleRef,
    chunkCount: parts?.length ?? 0,
    content: fullContent,
  });
}
