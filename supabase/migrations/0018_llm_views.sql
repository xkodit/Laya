-- Aggregate views over llm_calls (token-tracking-spec §3 "Views"). All use
-- security_invoker so the querying user's RLS applies — i.e. only admins (via
-- the llm_calls admin policy) can read them; regular users get nothing.

-- Per user question: one row per (conversation, question_id), summing the
-- provider calls of that turn. Powers the drill-down table.
create view llm_per_question
with (security_invoker = on) as
select
  conversation_id,
  question_id,
  min(created_at)                                              as asked_at,
  min(call_outcome)                                            as call_outcome,
  bool_or(cache_hit)                                           as cache_hit,
  array_agg(distinct model) filter (where model is not null)   as models,
  count(*)                                                     as call_count,
  sum(input_tokens)                                            as input_tokens,
  sum(output_tokens)                                           as output_tokens,
  sum(cache_read_tokens)                                       as cache_read_tokens,
  sum(total_tokens)                                            as total_tokens,
  sum(total_cost)                                              as total_cost,
  (array_agg(reason) filter (where reason is not null))[1]     as reason,
  (array_agg(reason_flags) filter (where reason_flags is not null))[1] as reason_flags,
  max(retrieved_chunks_count)                                  as retrieved_chunks_count,
  max(retrieved_chunks_tokens)                                 as retrieved_chunks_tokens,
  max(history_tokens)                                          as history_tokens,
  max(system_prompt_tokens)                                    as system_prompt_tokens,
  max(user_question_tokens)                                    as user_question_tokens
from llm_calls
group by conversation_id, question_id;

-- Per conversation: totals + free-question count for the conversation list.
create view llm_per_conversation
with (security_invoker = on) as
select
  conversation_id,
  count(distinct question_id)                                  as question_count,
  count(distinct question_id) filter (
    where call_outcome in ('cached', 'no_llm_call', 'short_circuit')
  )                                                            as free_questions,
  count(*)                                                     as call_count,
  sum(total_tokens)                                            as total_tokens,
  sum(total_cost)                                              as total_cost,
  array_agg(distinct model) filter (where model is not null)   as models,
  max(created_at)                                              as last_at
from llm_calls
group by conversation_id;

-- Per model per day: overview / trends + spend share.
create view llm_per_model_daily
with (security_invoker = on) as
select
  (created_at at time zone 'UTC')::date                        as day,
  coalesce(model, '(no model)')                                as model,
  coalesce(provider, 'none')                                   as provider,
  count(*)                                                     as calls,
  count(distinct question_id)                                  as questions,
  sum(input_tokens)                                            as input_tokens,
  sum(output_tokens)                                           as output_tokens,
  sum(total_tokens)                                            as total_tokens,
  sum(total_cost)                                              as total_cost
from llm_calls
group by 1, 2, 3;

grant select on llm_per_question, llm_per_conversation, llm_per_model_daily
  to authenticated, service_role;
