-- Extensions
create extension if not exists pgcrypto;
create extension if not exists vector;

-- is_admin() helper for RLS bypass on moderation tables.
-- SECURITY DEFINER lets it read profiles.role without tripping its own RLS.
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
