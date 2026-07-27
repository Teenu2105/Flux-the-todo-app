-- =====================================================================
-- SMART TO-DO / PRODUCTIVITY APP — DATABASE SCHEMA
-- Run this entire file in Supabase → SQL Editor → New Query → Run
-- =====================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- TABLE: tasks
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade, -- nullable = Phase 1 (no login)
  title         text not null check (char_length(trim(title)) > 0),
  description   text,
  category      text not null default 'Other',
  priority      text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  due_date      date,
  due_time      time,
  completed     boolean not null default false,
  important     boolean not null default false,
  pinned        boolean not null default false,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TABLE: subtasks
-- ---------------------------------------------------------------------
create table if not exists public.subtasks (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  title         text not null check (char_length(trim(title)) > 0),
  completed     boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------
create index if not exists idx_tasks_user_id      on public.tasks(user_id);
create index if not exists idx_tasks_completed     on public.tasks(completed);
create index if not exists idx_tasks_due_date      on public.tasks(due_date);
create index if not exists idx_tasks_priority      on public.tasks(priority);
create index if not exists idx_tasks_pinned        on public.tasks(pinned);
create index if not exists idx_subtasks_task_id    on public.subtasks(task_id);

-- ---------------------------------------------------------------------
-- AUTO-UPDATE updated_at on every UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.tasks    enable row level security;
alter table public.subtasks enable row level security;

-- ---------------------------------------------------------------------
-- PHASE 1 POLICIES — no login, single personal user, uses the public
-- anon key only. This makes the app usable immediately from your phone.
-- Anyone holding your anon key + project URL can read/write tasks, so
-- only use this while the project URL/key is private to you.
-- ---------------------------------------------------------------------
drop policy if exists "phase1_select_tasks" on public.tasks;
create policy "phase1_select_tasks" on public.tasks
  for select using (user_id is null);

drop policy if exists "phase1_insert_tasks" on public.tasks;
create policy "phase1_insert_tasks" on public.tasks
  for insert with check (user_id is null);

drop policy if exists "phase1_update_tasks" on public.tasks;
create policy "phase1_update_tasks" on public.tasks
  for update using (user_id is null) with check (user_id is null);

drop policy if exists "phase1_delete_tasks" on public.tasks;
create policy "phase1_delete_tasks" on public.tasks
  for delete using (user_id is null);

drop policy if exists "phase1_select_subtasks" on public.subtasks;
create policy "phase1_select_subtasks" on public.subtasks
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id is null)
  );

drop policy if exists "phase1_insert_subtasks" on public.subtasks;
create policy "phase1_insert_subtasks" on public.subtasks
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id is null)
  );

drop policy if exists "phase1_update_subtasks" on public.subtasks;
create policy "phase1_update_subtasks" on public.subtasks
  for update using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id is null)
  );

drop policy if exists "phase1_delete_subtasks" on public.subtasks;
create policy "phase1_delete_subtasks" on public.subtasks
  for delete using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id is null)
  );

-- =====================================================================
-- PHASE 2 (OPTIONAL) — Supabase Auth, per-user tasks.
-- To switch on real multi-user security later:
--   1. Enable Supabase Auth (Email or OAuth) in your project.
--   2. Update the app so createTask() sets user_id = auth.uid() automatically.
--   3. DROP the four "phase1_*" policies on tasks/subtasks above.
--   4. Run the four statements below instead.
-- =====================================================================
-- create policy "own_select_tasks" on public.tasks
--   for select using (auth.uid() = user_id);
-- create policy "own_insert_tasks" on public.tasks
--   for insert with check (auth.uid() = user_id);
-- create policy "own_update_tasks" on public.tasks
--   for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "own_delete_tasks" on public.tasks
--   for delete using (auth.uid() = user_id);
-- -- (mirror the same auth.uid() pattern on subtasks via the task_id join)
