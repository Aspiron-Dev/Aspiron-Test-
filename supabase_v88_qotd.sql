-- =====================================================================
--  v88: Question of the Day (stories on the student Home)
--
--  The admin picks questions from the Question bank for a day (Admin → Question of the Day). The questions are grouped by
--  subject; on that day each subject shows as a story circle on Home. The student taps it, answers one question at a time
--  and sees the right answer and the explanation only after answering. No new content to write: a question is a Question
--  bank question (subject, chapter, explanation already there). No AI, nothing that costs money: two small tables and functions.
--
--  • Only text questions (no picture in the question or its options; an empty picture list is no picture) can be picked: the Home list stays small and fast.
--  • A question of a live test that is already in the bank stays hidden until the test's result time (v75, qb_src_open),
--    here too. The admin cannot pick it before then.
--  • The day is the Indian date (Asia/Kolkata). Only today's questions can be answered. The first answer counts and cannot be changed.
--  • Students see only their own answers; the admin sees how many answered and how many were right.
--
--  Run ONCE in Supabase → SQL Editor after v87, then run supabase_v35_admin_team.sql again (permission for the admin function).
--  Needs v55 (Question bank) and v75. Safe to run again. Until it is run, the student app simply shows no stories.
-- =====================================================================

create table if not exists cbt_private.qotd (
  id         uuid primary key default gen_random_uuid(),
  qid        uuid not null references cbt_private.qbank(id) on delete cascade,
  show_on    date not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (qid, show_on)
);
create index if not exists qotd_day on cbt_private.qotd (show_on);
alter table cbt_private.qotd enable row level security;
revoke all on cbt_private.qotd from public, anon, authenticated;

create table if not exists cbt_private.qotd_ans (
  student_id uuid    not null references cbt_private.students(id) on delete cascade,
  qotd_id    uuid    not null references cbt_private.qotd(id) on delete cascade,
  choice     int     not null check (choice between 0 and 3),
  ok         boolean not null,
  at         timestamptz not null default now(),
  primary key (student_id, qotd_id)
);
alter table cbt_private.qotd_ans enable row level security;
revoke all on cbt_private.qotd_ans from public, anon, authenticated;

-- true = the question has a real picture (in the question or in an option). Questions copied from a test can carry an
-- empty list such as [null,null,null,null] or ["","","",""]: that is no picture.
create or replace function cbt_private.qb_has_pic(b cbt_private.qbank) returns boolean language sql immutable as $$
  select coalesce(b.img, '') <> ''
      or (jsonb_typeof(b.oimg) = 'array' and exists (select 1 from jsonb_array_elements(b.oimg) e where jsonb_typeof(e) = 'string' and (e #>> '{}') <> ''))
$$;
revoke all on function cbt_private.qb_has_pic(cbt_private.qbank) from public, anon, authenticated;

-- today in India (the day the admin means by "today")
create or replace function cbt_private.qotd_day() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;
revoke all on function cbt_private.qotd_day() from public, anon, authenticated;

-- ---------- student: today's questions (answers only for the ones already answered) ----------
create or replace function public.cbt_qotd_today(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  return jsonb_build_object('ok', true, 'day', qotd_day(), 'items', coalesce((
    select jsonb_agg(
             jsonb_build_object('id', t.id, 's', b.subject, 'c', b.chapter, 'l', b.level, 'q', b.q, 'options', b.options,
                                'done', an.qotd_id is not null, 'choice', an.choice)
             || case when an.qotd_id is not null
                     then jsonb_build_object('right', an.ok, 'answer', b.answer, 'explanation', b.explanation) else '{}'::jsonb end
             order by b.subject, t.sort, t.created_at, t.id)
      from qotd t
      join qbank b on b.id = t.qid and b.active and qb_src_open(b.src) and not qb_has_pic(b)
      left join qotd_ans an on an.qotd_id = t.id and an.student_id = sid
     where t.show_on = qotd_day()), '[]'::jsonb));
end $$;
revoke all on function public.cbt_qotd_today(text, text, text) from public, authenticated;
grant execute on function public.cbt_qotd_today(text, text, text) to anon;

-- ---------- student: answer one question (the first answer counts) ----------
create or replace function public.cbt_qotd_answer(p_mobile text, p_code text, p_device text, p_id uuid, p_choice int)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; t qotd%rowtype; b qbank%rowtype; an qotd_ans%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if p_choice is null or p_choice not between 0 and 3 then return jsonb_build_object('ok', false, 'error', 'invalid_choice'); end if;
  select * into t from qotd where id = p_id and show_on = qotd_day();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into b from qbank qq where qq.id = t.qid and qq.active and qb_src_open(qq.src) and not qb_has_pic(qq);
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not rate_ok(sid, 'qotd', 120) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into qotd_ans (student_id, qotd_id, choice, ok) values (sid, t.id, p_choice, p_choice = b.answer)
  on conflict (student_id, qotd_id) do nothing;
  select * into an from qotd_ans where student_id = sid and qotd_id = t.id;
  return jsonb_build_object('ok', true, 'choice', an.choice, 'right', an.ok, 'answer', b.answer, 'explanation', b.explanation);
end $$;
revoke all on function public.cbt_qotd_answer(text, text, text, uuid, int) from public, authenticated;
grant execute on function public.cbt_qotd_answer(text, text, text, uuid, int) to anon;

-- ---------- admin (owner or a team member with Content): list · add · move · remove ----------
--   list   {from?, to?}            → the days in range (default: 3 days back to 30 days ahead), each row with its answers
--   add    {ids:[bank ids], date}  → put bank questions on a day (at most 40 per day; pictures and live-test questions are refused)
--   move   {id, date}              → another day
--   remove {id}                    → off the list (the students' answers to it go too)
create or replace function public.cbt_admin_qotd(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  v_day date; v_from date; v_to date; v_ids uuid[]; v_add int := 0; v_skip int := 0; v_held int := 0; v_pic int := 0; v_n int; v_id uuid; v_b qbank%rowtype;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  begin
    v_from := case when d->>'from' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'from')::date else qotd_day() - 3 end;
    v_to   := case when d->>'to'   ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'to')::date   else qotd_day() + 30 end;
    v_day  := case when d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'date')::date else null end;
  exception when others then return jsonb_build_object('ok', false, 'error', 'date');
  end;
  v_to := least(v_to, v_from + 400);

  if p_action = 'list' then
    return jsonb_build_object('ok', true, 'today', qotd_day(), 'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'qid', b.id, 'day', t.show_on, 'sort', t.sort, 's', b.subject, 'c', b.chapter, 'l', b.level,
               'q', left(b.q, 240), 'a', b.answer, 'on', b.active, 'held', not qb_src_open(b.src), 'pic', qb_has_pic(b),
               'n', (select count(*) from qotd_ans x where x.qotd_id = t.id), 'r', (select count(*) from qotd_ans x where x.qotd_id = t.id and x.ok))
             order by t.show_on desc, b.subject, t.sort, t.created_at, t.id)
        from (select * from qotd where show_on between v_from and v_to order by show_on desc, sort limit 600) t
        join qbank b on b.id = t.qid), '[]'::jsonb));

  elsif p_action = 'add' then
    if v_day is null or v_day < qotd_day() - 1 or v_day > qotd_day() + 365 then return jsonb_build_object('ok', false, 'error', 'date'); end if;
    v_ids := case when jsonb_typeof(d->'ids') = 'array'
                  then array(select v::uuid from jsonb_array_elements_text(d->'ids') v where v ~ '^[0-9a-f-]{36}$' limit 40) else '{}' end;
    if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'ids'); end if;
    select count(*) into v_n from qotd where show_on = v_day;
    foreach v_id in array v_ids loop
      select * into v_b from qbank where id = v_id and active;
      if not found then v_skip := v_skip + 1; continue; end if;
      if qb_has_pic(v_b) then v_pic := v_pic + 1; continue; end if;
      if not qb_src_open(v_b.src) then v_held := v_held + 1; continue; end if;
      if v_n >= 40 then return jsonb_build_object('ok', false, 'error', 'full', 'added', v_add); end if;
      insert into qotd (qid, show_on, sort) values (v_b.id, v_day, v_n) on conflict (qid, show_on) do nothing;
      if found then v_add := v_add + 1; v_n := v_n + 1; else v_skip := v_skip + 1; end if;
    end loop;
    return jsonb_build_object('ok', true, 'added', v_add, 'skipped', v_skip, 'held', v_held, 'pic', v_pic);

  elsif p_action = 'move' then
    if v_day is null or v_day < qotd_day() - 1 or v_day > qotd_day() + 365 then return jsonb_build_object('ok', false, 'error', 'date'); end if;
    if coalesce(d->>'id', '') !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'id'); end if;
    select count(*) into v_n from qotd where show_on = v_day;
    if v_n >= 40 then return jsonb_build_object('ok', false, 'error', 'full'); end if;
    begin
      update qotd set show_on = v_day, sort = v_n where id = (d->>'id')::uuid;
    exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'exists');
    end;
    return jsonb_build_object('ok', true);

  elsif p_action = 'remove' then
    if coalesce(d->>'id', '') !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'id'); end if;
    delete from qotd where id = (d->>'id')::uuid;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_qotd(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_qotd(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v88 installed — now run supabase_v35_admin_team.sql again' as status;
