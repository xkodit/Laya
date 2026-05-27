-- Hybrid retrieval (spec §7.2): vector similarity + French full-text
-- search merged via Reciprocal Rank Fusion. Replaces the vector-only
-- retrieval path that was missing the FTS leg.
--
-- Why: the original match_chunks (0009) used only `embedding <=> query`
-- ordering. Voyage-3 fails on chunks whose vocabulary differs from how
-- users phrase questions — e.g. Art. 15.10 (Loi 2015-532) says "ne
-- satisfont pas aux exigences ... réputés être à durée indéterminée"
-- while users ask "CDD se termine mais je continue à travailler".
-- The FTS leg catches lexical hits ("durée indéterminée", "réputés")
-- that the vector leg misses.
--
-- RRF (Reciprocal Rank Fusion): per-doc score = sum over query types
-- of 1 / (RRF_K + rank_in_that_list). Standard k = 60. Caps the
-- contribution from any one ranker; chunks that appear in BOTH lists
-- bubble up.
--
-- The old match_chunks (0009) stays in place so the smoke-test script
-- and any other consumers don't break.

create or replace function public.match_chunks_hybrid(
  query_embedding vector(1024),
  query_text text,
  match_count int default 20,
  filter_primary_only boolean default false
)
returns table (
  id uuid,
  document_id uuid,
  article_ref text,
  parent_section text,
  content text,
  similarity float,
  document_title text,
  document_reference text,
  is_primary_source boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with
    -- Candidate pool per leg — wider than match_count so RRF has room
    -- to re-rank without losing chunks that one leg ranked poorly.
    candidate_pool as (
      select 30 as n
    ),
    vector_ranked as (
      select
        c.id,
        row_number() over (order by c.embedding <=> query_embedding) as rn
      from document_chunks c
      join documents d on d.id = c.document_id
      where d.status = 'ready'
        and (not filter_primary_only or d.is_primary_source)
      order by c.embedding <=> query_embedding
      limit (select n from candidate_pool)
    ),
    fts_ranked as (
      select
        c.id,
        row_number() over (
          order by ts_rank(
            to_tsvector('french', c.content),
            websearch_to_tsquery('french', query_text)
          ) desc
        ) as rn
      from document_chunks c
      join documents d on d.id = c.document_id
      where d.status = 'ready'
        and (not filter_primary_only or d.is_primary_source)
        and to_tsvector('french', c.content) @@ websearch_to_tsquery('french', query_text)
      order by ts_rank(
        to_tsvector('french', c.content),
        websearch_to_tsquery('french', query_text)
      ) desc
      limit (select n from candidate_pool)
    ),
    union_ids as (
      select id from vector_ranked
      union
      select id from fts_ranked
    ),
    -- RRF score: k=60, contributions from each leg if present.
    rrf as (
      select
        u.id,
        coalesce(1.0 / (60.0 + v.rn), 0) + coalesce(1.0 / (60.0 + f.rn), 0) as rrf_score
      from union_ids u
      left join vector_ranked v on v.id = u.id
      left join fts_ranked f on f.id = u.id
    )
  select
    c.id,
    c.document_id,
    c.article_ref,
    c.parent_section,
    c.content,
    rrf.rrf_score as similarity,
    d.title as document_title,
    d.reference as document_reference,
    d.is_primary_source
  from document_chunks c
  join documents d on d.id = c.document_id
  join rrf on rrf.id = c.id
  order by rrf.rrf_score desc
  limit match_count;
$$;

revoke all on function public.match_chunks_hybrid(vector(1024), text, int, boolean)
  from public;
grant execute on function public.match_chunks_hybrid(vector(1024), text, int, boolean)
  to authenticated, service_role;
