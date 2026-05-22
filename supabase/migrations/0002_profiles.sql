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
