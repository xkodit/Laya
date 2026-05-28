-- Small key/value settings store for server-managed runtime state that can't
-- live in env vars (env vars can't be written at runtime). First consumer:
-- the Gemini context-cache resource id + its prompt hash + expiry (spec §0
-- grill, Build 3 — lib/chat/gemini-cache.ts).

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
-- Service-role (the chat route) bypasses RLS; admins can inspect via the user
-- client; regular users get no access.
create policy "app_settings_admin_all"
  on app_settings for all
  using (public.is_admin())
  with check (public.is_admin());
