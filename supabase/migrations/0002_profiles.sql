create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  user_type text not null,
  company text,
  preferred_language text default 'fr',
  role text default 'user',
  created_at timestamptz default now()
);

-- is_admin() helper for RLS bypass on moderation tables.
-- SECURITY DEFINER lets it read profiles.role without tripping its own RLS.
-- Defined here (not in 0001) because the SQL body validates against profiles
-- at function-creation time.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is performed by the handle_new_user trigger (SECURITY DEFINER),
-- so no INSERT policy is needed for end users.

-- Auto-create a profile row on auth.users insert.
-- Signup form must pass full_name, user_type (+ optional company, preferred_language)
-- via Supabase Auth options.data so they land in raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, user_type, company, preferred_language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'user_type', 'salarie'),
    new.raw_user_meta_data->>'company',
    coalesce(new.raw_user_meta_data->>'preferred_language', 'fr')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
