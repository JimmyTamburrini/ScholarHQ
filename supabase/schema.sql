create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sessions jsonb not null default '[]'::jsonb,
  grades jsonb not null default '[]'::jsonb,
  class_gradebooks jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

create policy "Users can read own app state"
on public.user_app_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own app state"
on public.user_app_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own app state"
on public.user_app_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
