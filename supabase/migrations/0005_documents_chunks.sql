create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text,
  source_authority text,
  is_primary_source boolean not null default false,
  reference text,
  effective_date date,
  storage_path text not null,
  status text default 'processing',
  created_at timestamptz default now()
);

alter table documents enable row level security;

-- Authenticated users can list ready documents (so the chat UI can show source labels).
create policy "documents_select_ready"
  on documents for select
  to authenticated
  using (status = 'ready' or public.is_admin());

-- Admins (and the ingestion script via service-role) manage the corpus.
create policy "documents_admin_all"
  on documents for all
  using (public.is_admin())
  with check (public.is_admin());

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  article_ref text,
  parent_section text,
  chunk_index int,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index on document_chunks using hnsw (embedding vector_cosine_ops);
create index on document_chunks using gin (to_tsvector('french', content));

alter table document_chunks enable row level security;

-- Chunks are only readable through the server-side search RPC (service-role).
-- Authenticated users get no direct access by default; admin gets all.
create policy "document_chunks_admin_all"
  on document_chunks for all
  using (public.is_admin())
  with check (public.is_admin());
