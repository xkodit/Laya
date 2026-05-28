-- Config-driven pricing for token-cost tracking (token-tracking-spec Build 1).
-- Rates are per 1,000,000 tokens, USD. Each llm_calls row stores the rate
-- `version` it was priced with, and the computed $ is frozen on the row, so a
-- later rate change only affects future rows. Editing rates = insert a new
-- version (no code change). RLS: admin-managed; the gateway reads via service
-- role (bypasses RLS).
--
-- Seed rates verified against current published pricing on 2026-05-28:
--   Gemini 2.5 Flash  — ai.google.dev/gemini-api/docs/pricing
--   Claude Sonnet 4.6 — platform.claude.com/docs/en/about-claude/pricing
--   Voyage            — docs.voyageai.com/docs/pricing

create table pricing_rates (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                       -- 'gemini' | 'anthropic' | 'voyage'
  model text not null,                          -- exact model id
  input_price_per_1m numeric(12,6) not null default 0,
  output_price_per_1m numeric(12,6) not null default 0,
  cache_read_price_per_1m numeric(12,6),        -- nullable (cheaper cached-input read)
  cache_write_price_per_1m numeric(12,6),       -- nullable (Anthropic cache write premium)
  cache_storage_price_per_1m_per_hour numeric(12,6), -- nullable (Gemini context-cache storage)
  currency text not null default 'USD',
  version text not null,                        -- bump to supersede; old rows keep their version
  effective_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  unique (provider, model, version)
);

create index pricing_rates_lookup_idx on pricing_rates (provider, model, effective_date desc);

alter table pricing_rates enable row level security;
create policy "pricing_rates_admin_all"
  on pricing_rates for all
  using (public.is_admin())
  with check (public.is_admin());

insert into pricing_rates
  (provider, model, input_price_per_1m, output_price_per_1m,
   cache_read_price_per_1m, cache_write_price_per_1m,
   cache_storage_price_per_1m_per_hour, version, effective_date, notes)
values
  ('gemini', 'gemini-2.5-flash', 0.30, 2.50, 0.03, null, 1.00,
   '2026-05-28', '2026-05-28',
   'text/image/video tier. Context-cache read 0.03/1M; storage 1.00/1M/hour (no per-write token charge).'),
  ('anthropic', 'claude-sonnet-4-6', 3.00, 15.00, 0.30, 3.75, null,
   '2026-05-28', '2026-05-28',
   'cache read = 10% of input (0.30); 5-min ephemeral cache write = 1.25x input (3.75).'),
  ('voyage', 'voyage-3', 0.06, 0, null, null, null,
   '2026-05-28', '2026-05-28', 'embeddings; billed on input tokens only.'),
  ('voyage', 'rerank-2.5', 0.05, 0, null, null, null,
   '2026-05-28', '2026-05-28', 'reranker; billed on query+document tokens (input).');
