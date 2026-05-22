create table beta_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_type text not null,
  company text,
  reason text,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create index on beta_requests(status, created_at desc);

alter table beta_requests enable row level security;

-- Only admins can read/manage. Inserts happen server-side via the service-role
-- key (the request-access page server action) so no public-facing write policy.
create policy "beta_requests_admin_all"
  on beta_requests for all
  using (public.is_admin())
  with check (public.is_admin());
