-- Private bucket for legal-corpus PDFs. The ingestion script (service-role
-- key) writes here; chat reads from chunks not from the bucket. Admins can
-- list/manage via signed URLs for moderation.

insert into storage.buckets (id, name, public)
values ('corpus', 'corpus', false)
on conflict (id) do nothing;

-- Admin: full management. No other principal touches storage directly.
create policy "corpus_admin_select"
  on storage.objects for select
  using (bucket_id = 'corpus' and public.is_admin());

create policy "corpus_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'corpus' and public.is_admin());

create policy "corpus_admin_update"
  on storage.objects for update
  using (bucket_id = 'corpus' and public.is_admin());

create policy "corpus_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'corpus' and public.is_admin());
