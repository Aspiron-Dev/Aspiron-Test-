-- Paste this whole file in Supabase > SQL Editor > New query > Run
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id text unique not null,
  student_id text not null,
  name text,
  test_id text not null,
  test_title text,
  score numeric,
  max_score numeric,
  correct int,
  wrong int,
  skipped int,
  used_seconds int,
  answers jsonb
);
create index if not exists attempts_student_idx on attempts(student_id);
create index if not exists attempts_test_idx on attempts(test_id);

alter table attempts enable row level security;
create policy "anon can insert" on attempts for insert to anon with check (true);
create policy "anon can read" on attempts for select to anon using (true);
