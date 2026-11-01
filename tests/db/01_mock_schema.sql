-- Test-only mock of the production tables that the repository SQL does not create (rebuilt from the exported
-- function code). Never run this in Supabase.
-- Mock of the production schema, reconstructed from the exported function code (Block 10) and the repo SQL.
-- Column lists are what the functions use; helper functions whose code we do not have are simple stand-ins.
create schema cbt_private;
create extension if not exists pgcrypto;

create table cbt_private.students (
  id uuid primary key default gen_random_uuid(), name text not null, mobile text unique not null, status text not null default 'pending',
  salt text, code_hash text, devices text[] not null default '{}', max_devices int not null default 2,
  fail_count int not null default 0, locked_until bigint not null default 0, last_seen timestamptz, created_at timestamptz not null default now());
create table cbt_private.settings (key text primary key, value text);
create table cbt_private.series (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', is_free boolean not null default true,
  price_label text not null default '', sort_order int not null default 0, active boolean not null default true,
  cover text, cover_v int not null default 0, created_at timestamptz not null default now());
create table cbt_private.series_access (student_id uuid, series_id uuid, primary key (student_id, series_id));
create table cbt_private.folders (
  id uuid primary key default gen_random_uuid(), series_id uuid, title text, sort_order int not null default 0,
  active boolean not null default true, created_at timestamptz not null default now());
create table cbt_private.tests (
  id uuid primary key default gen_random_uuid(), series_id uuid, folder_id uuid, title text not null, duration int not null default 180,
  correct_marks numeric not null default 4, wrong_marks numeric not null default 1, lock_back boolean not null default false,
  free_preview boolean not null default false, active boolean not null default true, sort_order int not null default 0,
  data jsonb not null default '[]', question_count int not null default 0, opens_at bigint, practice boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table cbt_private.sessions (
  id uuid primary key default gen_random_uuid(), student_id uuid, test_id uuid, started_at bigint, ends_at bigint,
  submitted boolean not null default false);
create table cbt_private.results (
  id uuid primary key default gen_random_uuid(), student_id uuid, test_id uuid, test_title text, score numeric, max_score numeric,
  correct int, wrong int, skipped int, used_seconds int, answers jsonb, late boolean not null default false, client_id text,
  times jsonb, created_at timestamptz not null default now());
create table cbt_private.bookmarks (student_id uuid, test_id uuid, qidx int, created_at timestamptz not null default now(),
  primary key (student_id, test_id, qidx));
create table cbt_private.reports (
  id uuid primary key default gen_random_uuid(), student_id uuid, test_id uuid, test_title text, qidx int, kind text, note text,
  status text not null default 'open', created_at timestamptz not null default now(), unique (student_id, test_id, qidx));
create table cbt_private.mistake_done (student_id uuid, test_id uuid, qidx int, primary key (student_id, test_id, qidx));
create table cbt_private.series_files (
  id uuid primary key default gen_random_uuid(), series_id uuid, title text, kind text, file_name text, mime text, size int,
  parts int not null default 0, ready boolean not null default false, created_at timestamptz not null default now());
create table cbt_private.file_parts (file_id uuid, n int, data text, primary key (file_id, n));
create table cbt_private.test_stage (token text, n int, qs jsonb, created_at timestamptz not null default now(), primary key (token, n));
create table cbt_private.announcements (
  id uuid primary key default gen_random_uuid(), title text, body text, link_url text, link_label text, image text,
  active boolean not null default true, created_at timestamptz not null default now());
create table public.cbt_cheat_flags (student_id uuid, test_id text, note text);

-- stand-ins for helpers whose code was not exported
create function cbt_private.now_ms() returns bigint language sql stable as $$ select (extract(epoch from clock_timestamp())*1000)::bigint $$;
create function cbt_private.norm_mobile(p text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(p,''),'\D','','g'),10) $$;
create function cbt_private.norm_code(p text) returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p,''),'[^A-Za-z0-9]','','g')) $$;
create function cbt_private.new_code() returns text language sql volatile as $$ select upper(substr(md5(random()::text),1,8)) $$;
create function cbt_private.short_name(p text) returns text language sql immutable as $$ select split_part(coalesce(p,''),' ',1) $$;
create function cbt_private.admin_ok(p_pw text) returns text language sql stable as $$ select case when p_pw = 'adminpass' then null else 'invalid' end $$;
create function cbt_private.clean_questions(q jsonb) returns jsonb language sql immutable as $$ select q $$;
create function cbt_private.result_json_t(r cbt_private.results) returns jsonb language sql stable as $$
  select jsonb_build_object('id',r.id,'test_id',r.test_id,'title',r.test_title,'score',r.score,'max',r.max_score,'correct',r.correct,
    'wrong',r.wrong,'skipped',r.skipped,'used',r.used_seconds,'at',(extract(epoch from r.created_at)*1000)::bigint,'late',r.late,'answers',r.answers) $$;
create function cbt_private.review_json(p_test uuid) returns jsonb language sql stable as $$
  select coalesce((select jsonb_agg(jsonb_build_object('q',e.v->'q','options',e.v->'options','answer',e.v->'answer',
    'explanation',e.v->'explanation') order by e.n) from cbt_private.tests t, jsonb_array_elements(t.data) with ordinality e(v,n) where t.id = p_test),'[]') $$;
create function cbt_private.mistake_rows(p_sid uuid)
returns table(test_id uuid, title text, at bigint, qi int, kind text, sec text, v jsonb, ans int, tm int) language sql stable as $$
  with latest as (select distinct on (rs.test_id) rs.* from cbt_private.results rs where rs.student_id = p_sid and rs.test_id is not null
                  order by rs.test_id, rs.created_at desc)
  select l.test_id, t.title, (extract(epoch from l.created_at)*1000)::bigint, (e.n-1)::int,
         case when (l.answers->>((e.n-1)::text)) is null then 'skipped' else 'wrong' end,
         coalesce(nullif(trim(e.v->>'sec'),''),'General'), e.v,
         case when (l.answers->>((e.n-1)::text)) ~ '^[0-3]$' then (l.answers->>((e.n-1)::text))::int end, null::int
  from latest l join cbt_private.tests t on t.id = l.test_id, jsonb_array_elements(t.data) with ordinality e(v,n)
  where (l.answers->>((e.n-1)::text)) is null or (l.answers->>((e.n-1)::text)) <> (e.v->>'answer') $$;

-- stand-in for the production cbt_bookmarks (code not exported): items carry the answer once the test is solved
create function public.cbt_bookmarks(p_mobile text, p_code text, p_device text) returns jsonb
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(jsonb_build_object('test_id',b.test_id,'qidx',b.qidx,'q',t.data->b.qidx->'q',
    'solved',exists(select 1 from results r where r.student_id = sid and r.test_id = b.test_id),
    'answer',case when exists(select 1 from results r where r.student_id = sid and r.test_id = b.test_id) then t.data->b.qidx->'answer' end)
    order by b.created_at) from bookmarks b join tests t on t.id = b.test_id where b.student_id = sid),'[]'::jsonb));
end $$;
grant execute on function public.cbt_bookmarks(text,text,text) to anon, authenticated;
