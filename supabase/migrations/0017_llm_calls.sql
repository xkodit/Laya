-- Per-call token + cost log (token-tracking-spec Build, schema §3).
-- One row per provider call; multi-step turns share a question_id. Zero-cost
-- turns (greeting / cache hit / short-circuit) also get a row, marked via
-- call_outcome with zero tokens, so the dashboard can show how often the
-- optimizations fire and compute savings.
--
-- Cost is COMPUTED + FROZEN at write time (input_cost/output_cost/total_cost)
-- with the rate_version applied, so later rate changes don't rewrite history.
-- Per-user spend is derivable via conversation_id -> conversations.user_id
-- (usage_events remains the per-user/quota store), so no user_id here.

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  question_id uuid not null,                 -- groups all calls of one user turn
  provider text,                             -- 'gemini' | 'anthropic' | 'voyage' | null (no_llm_call)
  model text,                                -- exact model id, null for no_llm_call
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int,                     -- provider cached-input read (Anthropic / Gemini)
  cache_write_tokens int,                    -- Anthropic cache write
  total_tokens int not null default 0,
  input_cost numeric(12,6) not null default 0,
  output_cost numeric(12,6) not null default 0,
  total_cost numeric(12,6) not null default 0,
  rate_version text,                         -- pricing_rates.version applied
  latency_ms int,
  -- input breakdown (approximate; exact totals come from provider usage above) --
  retrieved_chunks_count int,
  retrieved_chunks_tokens int,
  history_tokens int,
  system_prompt_tokens int,
  user_question_tokens int,
  -- attribution --
  cache_hit boolean not null default false,  -- local semantic-cache hit OR provider cache read
  call_outcome text not null,                -- answered | cached | short_circuit | refused_out_of_scope | error | no_llm_call
  reason text,
  reason_flags jsonb,
  created_at timestamptz not null default now()
);

create index llm_calls_question_idx on llm_calls (conversation_id, question_id);
create index llm_calls_model_created_idx on llm_calls (model, created_at desc);
create index llm_calls_created_idx on llm_calls (created_at desc);
create index llm_calls_outcome_idx on llm_calls (call_outcome);

alter table llm_calls enable row level security;
-- Admin-only (the gateway writes via service role, which bypasses RLS).
create policy "llm_calls_admin_all"
  on llm_calls for all
  using (public.is_admin())
  with check (public.is_admin());

-- Link the question text to its calls: stamp the same question_id on the
-- user/assistant message rows so the drill-down can show the question.
alter table messages add column if not exists question_id uuid;
create index if not exists messages_question_id_idx on messages (question_id);
