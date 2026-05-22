create table subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  payment_provider text,
  external_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

alter table subscriptions enable row level security;

create policy "subscriptions_select_own"
  on subscriptions for select
  using (auth.uid() = user_id or public.is_admin());

-- Writes happen only from the CinetPay webhook (service-role key bypasses RLS),
-- so no user-facing write policies.

create table usage_events (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  event_type text not null,
  input_tokens int default 0,
  output_tokens int default 0,
  cost_usd numeric(10,6),
  created_at timestamptz default now()
);

create index on usage_events(user_id, created_at desc);

alter table usage_events enable row level security;

create policy "usage_events_select_own"
  on usage_events for select
  using (auth.uid() = user_id or public.is_admin());

-- Inserts come from server-side chat/contract routes using the service-role key.
