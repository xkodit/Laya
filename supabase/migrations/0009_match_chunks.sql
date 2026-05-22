-- Vector-similarity retrieval over the corpus.
-- Called by the chat's `search_labor_code` tool and by the smoke-test script.
-- SECURITY DEFINER so it can read document_chunks even though the chunks
-- table has no end-user RLS read policy. We never expose this RPC to anon
-- callers — only the server-side chat route (service_role) invokes it.

create or replace function public.match_chunks(
  query_embedding vector(1024),
  match_count int default 6,
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
  select
    c.id,
    c.document_id,
    c.article_ref,
    c.parent_section,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title as document_title,
    d.reference as document_reference,
    d.is_primary_source
  from document_chunks c
  join documents d on d.id = c.document_id
  where d.status = 'ready'
    and (not filter_primary_only or d.is_primary_source)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_chunks(vector(1024), int, boolean) from public;
grant execute on function public.match_chunks(vector(1024), int, boolean)
  to authenticated, service_role;
