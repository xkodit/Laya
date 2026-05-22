create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text,
  language text default 'fr',
  is_favorite boolean default false,
  summary text,
  summary_through_message_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on conversations(user_id, updated_at desc);

alter table conversations enable row level security;

create policy "conversations_select_own"
  on conversations for select
  using (auth.uid() = user_id);

create policy "conversations_insert_own"
  on conversations for insert
  with check (auth.uid() = user_id);

create policy "conversations_update_own"
  on conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "conversations_delete_own"
  on conversations for delete
  using (auth.uid() = user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb,
  tool_calls jsonb,
  input_tokens int,
  output_tokens int,
  created_at timestamptz default now()
);

create index on messages(conversation_id, created_at);

alter table messages enable row level security;

create policy "messages_select_via_conversation"
  on messages for select
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_insert_via_conversation"
  on messages for insert
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- No update/delete: messages are append-only from the user's perspective.
-- Server-side cleanup (if ever needed) uses the service-role key.

create table message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating text not null,
  comment text,
  created_at timestamptz default now()
);

create index on message_feedback(message_id);

alter table message_feedback enable row level security;

create policy "message_feedback_select_own_or_admin"
  on message_feedback for select
  using (auth.uid() = user_id or public.is_admin());

create policy "message_feedback_insert_own"
  on message_feedback for insert
  with check (auth.uid() = user_id);

create policy "message_feedback_update_own"
  on message_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "message_feedback_delete_own"
  on message_feedback for delete
  using (auth.uid() = user_id);
