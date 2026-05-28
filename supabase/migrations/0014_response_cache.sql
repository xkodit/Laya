-- Semantic response cache (spec §0 "Token optimization design grill", Build 2).
-- Stores answers to cache-eligible queries (short, general, non-first-person,
-- no digits — see lib/chat/cache.ts isCacheEligible) so repeated universal
-- questions (SMIG, durée légale, congés…) skip the model + retrieval entirely.
--
-- Two lookup layers in the app: exact match on (query_norm, user_type,
-- prompt_hash) then semantic vector match (cosine ≥ 0.92).
--
-- Cache key fragments by user_type (role drives tone — spec §2) and by
-- prompt_hash (= hash of STATIC_SYSTEM_PROMPT + cheap-model id). The prompt
-- hash means a prompt tune or model swap auto-invalidates: old entries no
-- longer match the current hash and age out via the 30-day TTL backstop.

create table cached_responses (
  id uuid primary key default gen_random_uuid(),
  query_norm text not null,
  user_type text not null,
  query_embedding vector(1024) not null,
  response_text text not null,
  retrieved_chunks jsonb,            -- same shape as messages.citations (UI badges)
  doc_labels text[] not null default '{}',  -- canonical doc labels cited (for invalidation)
  prompt_hash text not null,         -- STATIC_SYSTEM_PROMPT + model version fingerprint
  hit_count int not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (query_norm, user_type, prompt_hash)
);

create index on cached_responses using hnsw (query_embedding vector_cosine_ops);
create index cached_responses_expires_idx on cached_responses (expires_at);
create index cached_responses_doc_labels_idx on cached_responses using gin (doc_labels);

alter table cached_responses enable row level security;
-- Service-role (the chat route + ingest) bypasses RLS. Admins can manage via
-- the user client; regular authenticated users get no direct access.
create policy "cached_responses_admin_all"
  on cached_responses for all
  using (public.is_admin())
  with check (public.is_admin());

-- Demand analytics, never wiped by invalidation. Feeds future hot-question
-- promotion / static-answer-layer decisions.
create table query_frequency (
  id uuid primary key default gen_random_uuid(),
  query_norm text not null,
  user_type text not null,
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (query_norm, user_type)
);

alter table query_frequency enable row level security;
create policy "query_frequency_admin_all"
  on query_frequency for all
  using (public.is_admin())
  with check (public.is_admin());

-- Semantic lookup: cosine similarity over non-expired entries scoped to the
-- caller's user_type + current prompt hash. Returns top match_count rows with
-- similarity so the app can apply its 0.92 threshold and log near-misses.
create or replace function public.match_cached_response(
  query_embedding vector(1024),
  p_user_type text,
  p_prompt_hash text,
  match_count int default 3
)
returns table (
  id uuid,
  query_norm text,
  response_text text,
  retrieved_chunks jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.query_norm,
    c.response_text,
    c.retrieved_chunks,
    1 - (c.query_embedding <=> query_embedding) as similarity
  from cached_responses c
  where c.user_type = p_user_type
    and c.prompt_hash = p_prompt_hash
    and c.expires_at > now()
  order by c.query_embedding <=> query_embedding
  limit match_count;
$$;

-- Atomic hit counter bump (avoids a read-modify-write race from the app).
create or replace function public.bump_cache_hit(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update cached_responses
  set hit_count = hit_count + 1, last_hit_at = now()
  where id = p_id;
$$;

-- Demand counter upsert.
create or replace function public.bump_query_frequency(
  p_query_norm text,
  p_user_type text
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into query_frequency (query_norm, user_type, count, first_seen, last_seen)
  values (p_query_norm, p_user_type, 1, now(), now())
  on conflict (query_norm, user_type)
  do update set count = query_frequency.count + 1, last_seen = now();
$$;

-- Selective corpus invalidation: drop every cached response that cited any of
-- the given canonical doc labels. Stable across re-ingest (labels don't change
-- even when chunk ids do). Called from the ingest pipeline after a document's
-- chunks are (re)written, and reusable by the admin endpoint.
create or replace function public.invalidate_cache_by_doc_labels(labels text[])
returns int
language sql
volatile
security definer
set search_path = public
as $$
  with deleted as (
    delete from cached_responses
    where doc_labels && labels
    returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.match_cached_response(vector(1024), text, text, int) from public;
revoke all on function public.bump_cache_hit(uuid) from public;
revoke all on function public.bump_query_frequency(text, text) from public;
revoke all on function public.invalidate_cache_by_doc_labels(text[]) from public;
grant execute on function public.match_cached_response(vector(1024), text, text, int) to service_role;
grant execute on function public.bump_cache_hit(uuid) to service_role;
grant execute on function public.bump_query_frequency(text, text) to service_role;
grant execute on function public.invalidate_cache_by_doc_labels(text[]) to service_role;
