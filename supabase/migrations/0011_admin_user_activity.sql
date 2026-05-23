-- Per-user activity rollup used by /admin/users. One round-trip instead of
-- N queries. SECURITY DEFINER bypasses RLS; explicit is_admin() check inside
-- prevents non-admins from calling it via PostgREST.

create or replace function public.admin_user_activity()
returns table (
  user_id uuid,
  conversation_count bigint,
  message_count bigint,
  last_active timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select
      p.id::uuid,
      coalesce(count(distinct c.id), 0)::bigint,
      coalesce(count(m.id), 0)::bigint,
      max(c.updated_at)
    from public.profiles p
    left join public.conversations c on c.user_id = p.id
    left join public.messages m on m.conversation_id = c.id
    group by p.id;
end;
$$;

revoke all on function public.admin_user_activity() from public;
grant execute on function public.admin_user_activity() to authenticated;
