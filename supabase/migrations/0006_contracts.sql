create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  variables jsonb not null,
  validation_rules jsonb,
  template_path text not null,
  created_at timestamptz default now()
);

alter table contract_templates enable row level security;

create policy "contract_templates_select_all"
  on contract_templates for select
  to authenticated
  using (true);

create policy "contract_templates_admin_all"
  on contract_templates for all
  using (public.is_admin())
  with check (public.is_admin());

create table generated_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  template_id uuid references contract_templates(id) on delete set null,
  variables jsonb not null,
  output_pdf_path text,
  output_docx_path text,
  warnings jsonb,
  created_at timestamptz default now()
);

create index on generated_contracts(user_id, created_at desc);

alter table generated_contracts enable row level security;

create policy "generated_contracts_select_own"
  on generated_contracts for select
  using (auth.uid() = user_id or public.is_admin());

create policy "generated_contracts_insert_own"
  on generated_contracts for insert
  with check (auth.uid() = user_id);

create policy "generated_contracts_delete_own"
  on generated_contracts for delete
  using (auth.uid() = user_id);
