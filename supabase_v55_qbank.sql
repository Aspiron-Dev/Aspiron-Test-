-- =====================================================================
--  v55: Question bank (unlimited practice) + Test generator (students make, schedule and take their own tests)
--  Run after v54, then run supabase_v35_admin_team.sql again (it wraps cbt_admin_qbank for team permissions).
--  Safe to run again. Nothing here costs money: plain tables and functions in the same database.
--
--  Bank:   cbt_private.qbank — one row per question, tagged with subject / chapter / topic (chapter ids from
--          pyq-syllabus.js), level (easy | medium | hard), type (mcq | statement | match | fill | assertion) and
--          source (ncert | pyq | extra = out of NCERT). Filled by the admin (Admin → Question bank): all PYQs at once,
--          questions of a finished test (auto-tagged), or one by one.
--  Practice: questions come WITHOUT the answer; the answer + explanation come only after the student picks an option
--          (cbt_qb_check). Per-student hourly limits stop bulk copying of the bank.
--  Generator: the server picks the questions (the phone never sees the answers before submitting), the test opens at
--          the time the student chose, the timer is kept on the server and the marks are worked out on the server.
-- =====================================================================

create table if not exists cbt_private.qbank (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null default '',            -- phy | chem | bio (or another subject name)
  chapter     text not null default '',            -- chapter id from pyq-syllabus.js ('' = not tagged)
  topic       text not null default '',
  level       text not null default 'medium',
  qtype       text not null default 'mcq',
  source      text not null default 'extra',
  q           text not null,
  options     jsonb not null default '[]'::jsonb,
  answer      int not null,
  explanation text not null default '',
  img         text,
  oimg        jsonb,
  src         text unique,                         -- 'pyq:<id>' / 'test:<id>:<n>'; null = added by hand
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint qbank_level  check (level in ('easy', 'medium', 'hard')),
  constraint qbank_qtype  check (qtype in ('mcq', 'statement', 'match', 'fill', 'assertion')),
  constraint qbank_source check (source in ('ncert', 'pyq', 'extra')),
  constraint qbank_answer check (answer between 0 and 3)
);
create index if not exists qbank_sc on cbt_private.qbank (subject, chapter) where active;
revoke all on cbt_private.qbank from public, anon, authenticated;

-- the student's last answer to each bank question (practice); small: one row per student per question
create table if not exists cbt_private.qb_log (
  student_id uuid not null,
  qid        uuid not null,
  choice     int,
  ok         boolean not null default false,
  tries      int not null default 1,
  at         timestamptz not null default now(),
  primary key (student_id, qid)
);
revoke all on cbt_private.qb_log from public, anon, authenticated;

-- tests made by students (one attempt each; "Retake" makes a new one with the same questions)
create table if not exists cbt_private.gen_tests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null,
  title        text not null,
  qids         uuid[] not null,
  duration     int not null,                        -- minutes
  plus         numeric not null default 4,
  minus        numeric not null default 1,
  opts         jsonb not null default '{}'::jsonb,  -- what the student chose (shown on the card)
  starts_at    bigint not null,                     -- ms: the test opens (goes live) at this time
  created_at   timestamptz not null default now(),
  started_at   bigint,
  ends_at      bigint,
  answers      jsonb not null default '{}'::jsonb,  -- {question id: 0-3}
  submitted_at bigint,
  score        numeric,
  correct      int,
  wrong        int,
  skipped      int,
  used_seconds int
);
create index if not exists gen_tests_sid on cbt_private.gen_tests (student_id, starts_at desc);
revoke all on cbt_private.gen_tests from public, anon, authenticated;

-- ---------- helpers ----------
-- question type from its text (used for PYQ import; the admin page uses the same rules for tests)
create or replace function cbt_private.qb_type(p_q text) returns text language sql immutable as $$
  select case
    when p_q ~* '(match|column|list)[ -]*(i|1|a)\M.*(column|list)[ -]*(ii|2|b)\M' or p_q ~* 'match the following|match list|match column' then 'match'
    when p_q ~* 'assertion' and p_q ~* 'reason' then 'assertion'
    when p_q ~* 'statement' then 'statement'
    when p_q ~ '_{3,}|\.{5,}' or p_q ~* 'fill in the blank' then 'fill'
    else 'mcq' end
$$;
revoke all on function cbt_private.qb_type(text) from public, anon, authenticated;

-- do a bank row's tags match the choice? f = {s:[subjects], c:[chapters], t:[topics], l:[levels], y:[types], o:[sources]}
-- (a missing or empty list means "all")
create or replace function cbt_private.qb_tags(b cbt_private.qbank, f jsonb) returns boolean language sql immutable as $$
  select (jsonb_typeof(f->'s') is distinct from 'array' or jsonb_array_length(f->'s') = 0 or (f->'s') ? b.subject)
     and (jsonb_typeof(f->'c') is distinct from 'array' or jsonb_array_length(f->'c') = 0 or (f->'c') ? b.chapter)
     and (jsonb_typeof(f->'t') is distinct from 'array' or jsonb_array_length(f->'t') = 0 or (f->'t') ? b.topic)
     and (jsonb_typeof(f->'l') is distinct from 'array' or jsonb_array_length(f->'l') = 0 or (f->'l') ? b.level)
     and (jsonb_typeof(f->'y') is distinct from 'array' or jsonb_array_length(f->'y') = 0 or (f->'y') ? b.qtype)
     and (jsonb_typeof(f->'o') is distinct from 'array' or jsonb_array_length(f->'o') = 0 or (f->'o') ? b.source)
$$;
revoke all on function cbt_private.qb_tags(cbt_private.qbank, jsonb) from public, anon, authenticated;
-- students only ever get questions that are switched on
create or replace function cbt_private.qb_match(b cbt_private.qbank, f jsonb) returns boolean language sql immutable as $$
  select b.active and cbt_private.qb_tags(b, f)
$$;
revoke all on function cbt_private.qb_match(cbt_private.qbank, jsonb) from public, anon, authenticated;

-- a question as the student sees it before answering (no answer, no explanation)
create or replace function cbt_private.qb_open(b cbt_private.qbank) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', b.id, 'q', b.q, 'options', b.options, 'img', b.img, 'oimg', b.oimg, 's', b.subject,
                            'c', b.chapter, 't', b.topic, 'l', b.level, 'y', b.qtype, 'o', b.source)
$$;
revoke all on function cbt_private.qb_open(cbt_private.qbank) from public, anon, authenticated;

-- keep only answers to the test's own questions, 0-3
create or replace function cbt_private.gen_clean(p jsonb, p_ids uuid[]) returns jsonb language sql immutable as $$
  select coalesce((select jsonb_object_agg(k, v::int) from jsonb_each_text(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e(k, v)
                   where k = any (p_ids::text[]) and v ~ '^[0-3]$'), '{}'::jsonb)
$$;
revoke all on function cbt_private.gen_clean(jsonb, uuid[]) from public, anon, authenticated;

-- a generated test as a card
create or replace function cbt_private.gen_card(g cbt_private.gen_tests) returns jsonb language sql stable as $$
  select jsonb_build_object('id', g.id, 'title', g.title, 'n', cardinality(g.qids), 'dur', g.duration, 'plus', g.plus, 'minus', g.minus,
    'opts', g.opts, 'at', g.starts_at, 'started', g.started_at, 'ends', g.ends_at, 'done', g.submitted_at, 'score', g.score,
    'max', cardinality(g.qids) * g.plus, 'correct', g.correct, 'wrong', g.wrong, 'skipped', g.skipped, 'used', g.used_seconds,
    'created', (extract(epoch from g.created_at) * 1000)::bigint)
$$;
revoke all on function cbt_private.gen_card(cbt_private.gen_tests) from public, anon, authenticated;

-- mark a started test (on submit, or when its time is long over)
create or replace function cbt_private.gen_mark(p_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare g gen_tests%rowtype; v_a jsonb; v_c int; v_w int; v_n int; v_now bigint := now_ms();
begin
  select * into g from gen_tests where id = p_id for update;
  if not found or g.submitted_at is not null or g.started_at is null then return; end if;
  v_a := case when p_answers is not null and v_now <= g.ends_at + 120000 then gen_clean(p_answers, g.qids) else g.answers end;
  select count(*), count(*) filter (where (v_a->>b.id::text)::int = b.answer), count(*) filter (where (v_a->>b.id::text)::int <> b.answer)
    into v_n, v_c, v_w
    from qbank b where b.id = any (g.qids);
  update gen_tests set answers = v_a, submitted_at = least(v_now, ends_at + 120000), correct = v_c, wrong = v_w, skipped = v_n - v_c - v_w,
         score = v_c * plus - v_w * minus, used_seconds = greatest(0, (least(v_now, ends_at) - started_at) / 1000)::int
   where id = p_id;
end $$;
revoke all on function cbt_private.gen_mark(uuid, jsonb) from public, anon, authenticated;

-- ===================== students: question bank =====================
-- what is in the bank (counts only, no question text) + the student's own practice numbers
create or replace function public.cbt_qb_meta(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  return jsonb_build_object('ok', true,
    'rows', coalesce((select jsonb_agg(jsonb_build_array(subject, chapter, topic, level, qtype, source, n))
                        from (select subject, chapter, topic, level, qtype, source, count(*) n from qbank where active group by 1, 2, 3, 4, 5, 6) x), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_array(subject, chapter, n, r))
                        from (select b.subject, b.chapter, count(*) n, count(*) filter (where l.ok) r
                                from qb_log l join qbank b on b.id = l.qid where l.student_id = sid group by 1, 2) x), '[]'::jsonb));
end $$;
grant execute on function public.cbt_qb_meta(text, text, text) to anon, authenticated;

-- next practice questions (10, without answers); questions not yet answered come first
drop function if exists public.cbt_qb_next(text, text, text, jsonb, uuid[]);
create or replace function public.cbt_qb_next(p_mobile text, p_code text, p_device text, p_f jsonb, p_skip jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; f jsonb := case when jsonb_typeof(p_f) = 'object' then p_f else '{}'::jsonb end; v_skip uuid[];
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if not rate_ok(sid, 'qbn', 80) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;   -- 800 questions an hour
  v_skip := array(select v::uuid from jsonb_array_elements_text(case when jsonb_typeof(p_skip) = 'array' then p_skip else '[]'::jsonb end) v
                   where v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' limit 1000);
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(qb_open(x)) from (
      select b.* from qbank b
       where qb_match(b, f) and not (b.id = any (v_skip))
       order by exists (select 1 from qb_log l where l.student_id = sid and l.qid = b.id), random()
       limit 10) x), '[]'::jsonb),
    'total', (select count(*) from qbank b where qb_match(b, f)));
end $$;
grant execute on function public.cbt_qb_next(text, text, text, jsonb, jsonb) to anon, authenticated;

-- the student picked an option: right or wrong, the answer and the explanation
create or replace function public.cbt_qb_check(p_mobile text, p_code text, p_device text, p_q uuid, p_choice int)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; b qbank%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if p_choice is null or p_choice not between 0 and 3 then return jsonb_build_object('ok', false, 'error', 'invalid_choice'); end if;
  select * into b from qbank where id = p_q and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not rate_ok(sid, 'qbc', 800) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into qb_log (student_id, qid, choice, ok) values (sid, b.id, p_choice, p_choice = b.answer)
  on conflict (student_id, qid) do update set choice = excluded.choice, ok = excluded.ok, tries = qb_log.tries + 1, at = now();
  return jsonb_build_object('ok', true, 'right', p_choice = b.answer, 'answer', b.answer, 'explanation', b.explanation);
end $$;
grant execute on function public.cbt_qb_check(text, text, text, uuid, int) to anon, authenticated;

-- ===================== students: test generator =====================
-- p_d = {title, f:{…as in qb_match}, n, dur, plus, minus, at (ms), order:'mix'|'subject'}  or  {copy: <test id>, at}
create or replace function public.cbt_gen_create(p_mobile text, p_code text, p_device text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; sid uuid; d jsonb := case when jsonb_typeof(p_d) = 'object' then p_d else '{}'::jsonb end;
  f jsonb; v_n int; v_dur int; v_plus numeric; v_minus numeric; v_at bigint; v_now bigint := now_ms(); v_ids uuid[];
  v_title text; v_ord text; g gen_tests%rowtype; v_id uuid;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if (select count(*) from gen_tests where student_id = sid and submitted_at is null) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  if not rate_ok(sid, 'qbg', 20) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  v_at := case when d->>'at' ~ '^\d{10,15}$' then (d->>'at')::bigint else v_now end;
  if v_at < v_now then v_at := v_now; end if;
  if v_at > v_now + 180::bigint * 86400000 then return jsonb_build_object('ok', false, 'error', 'bad_time'); end if;

  if d ? 'copy' then   -- retake: same questions and settings, new attempt
    select * into g from gen_tests where id = case when d->>'copy' ~ '^[0-9a-f-]{36}$' then (d->>'copy')::uuid end and student_id = sid;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    insert into gen_tests (student_id, title, qids, duration, plus, minus, opts, starts_at)
    values (sid, left(regexp_replace(g.title, ' \(retake( \d+)?\)$', '') || ' (retake)', 80), g.qids, g.duration, g.plus, g.minus, g.opts, v_at)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'n', cardinality(g.qids));
  end if;

  f := case when jsonb_typeof(d->'f') = 'object' then d->'f' else '{}'::jsonb end;
  v_n := case when d->>'n' ~ '^\d{1,3}$' then (d->>'n')::int end;
  v_dur := case when d->>'dur' ~ '^\d{1,3}$' then (d->>'dur')::int end;
  if v_n is null or v_n not between 5 and 200 or v_dur is null or v_dur not between 5 and 360 then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  v_plus := case when d->>'plus' in ('1', '2', '3', '4') then (d->>'plus')::numeric else 4 end;
  v_minus := case when d->>'minus' in ('0', '0.25', '0.5', '1') then (d->>'minus')::numeric else 1 end;
  v_ord := case when d->>'order' = 'subject' then 'subject' else 'mix' end;
  v_title := left(btrim(regexp_replace(coalesce(d->>'title', ''), '[\x00-\x1f<>]', '', 'g')), 80);
  if v_title = '' then v_title := 'My test'; end if;

  -- an even share of every subject, then of every chapter (round-robin), questions not practised first
  select array_agg(id order by case when v_ord = 'subject' then subject end, ord2) into v_ids from (
    select id, subject, random() ord2 from (
      select b.id, b.subject,
             row_number() over (partition by b.subject order by rn_c, seen, random()) rn_s
        from (select b.*, row_number() over (partition by b.subject, b.chapter order by random()) rn_c,
                     exists (select 1 from qb_log l where l.student_id = sid and l.qid = b.id) seen
                from qbank b where qb_match(b, f)) b) x
     order by rn_s, random() limit v_n) y;
  if v_ids is null or cardinality(v_ids) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  insert into gen_tests (student_id, title, qids, duration, plus, minus, opts, starts_at)
  values (sid, v_title, v_ids, v_dur, v_plus, v_minus,
          jsonb_build_object('f', f, 'order', v_ord, 'want', v_n), v_at)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'n', cardinality(v_ids), 'want', v_n);
end $$;
grant execute on function public.cbt_gen_create(text, text, text, jsonb) to anon, authenticated;

create or replace function public.cbt_gen_list(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; r record;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  -- a started test whose time is long over is marked with the answers saved so far
  for r in select id from gen_tests where student_id = sid and submitted_at is null and started_at is not null and ends_at + 120000 < now_ms() loop
    perform gen_mark(r.id, null);
  end loop;
  return jsonb_build_object('ok', true, 'now', now_ms(), 'items', coalesce((
    select jsonb_agg(gen_card(g) order by g.starts_at desc) from (select * from gen_tests where student_id = sid order by starts_at desc limit 200) g), '[]'::jsonb));
end $$;
grant execute on function public.cbt_gen_list(text, text, text) to anon, authenticated;

-- open (or resume) a test: questions without answers; the timer starts on the first open
create or replace function public.cbt_gen_start(p_mobile text, p_code text, p_device text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; g gen_tests%rowtype; v_now bigint := now_ms();
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into g from gen_tests where id = p_id and student_id = sid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.submitted_at is null and g.started_at is not null and g.ends_at + 120000 < v_now then
    perform gen_mark(g.id, null); select * into g from gen_tests where id = p_id;
  end if;
  if g.submitted_at is not null then return jsonb_build_object('ok', false, 'error', 'done'); end if;
  if g.starts_at > v_now then return jsonb_build_object('ok', false, 'error', 'not_open', 'at', g.starts_at); end if;
  if g.started_at is null then
    if not rate_ok(sid, 'qbs', 30) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
    update gen_tests set started_at = v_now, ends_at = v_now + duration::bigint * 60000 where id = g.id returning * into g;
  end if;
  return jsonb_build_object('ok', true, 'now', v_now, 'test', gen_card(g), 'answers', g.answers,
    'questions', coalesce((select jsonb_agg(qb_open(b) order by u.o) from unnest(g.qids) with ordinality u(id, o) join qbank b on b.id = u.id), '[]'::jsonb));
end $$;
grant execute on function public.cbt_gen_start(text, text, text, uuid) to anon, authenticated;

-- auto-save while the test runs
create or replace function public.cbt_gen_save(p_mobile text, p_code text, p_device text, p_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; n int;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  update gen_tests set answers = gen_clean(p_answers, qids)
   where id = p_id and student_id = sid and started_at is not null and submitted_at is null and now_ms() <= ends_at + 120000;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;
grant execute on function public.cbt_gen_save(text, text, text, uuid, jsonb) to anon, authenticated;

create or replace function public.cbt_gen_submit(p_mobile text, p_code text, p_device text, p_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; g gen_tests%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into g from gen_tests where id = p_id and student_id = sid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.started_at is null then return jsonb_build_object('ok', false, 'error', 'not_started'); end if;
  perform gen_mark(g.id, coalesce(p_answers, '{}'::jsonb));   -- after the end time (+2 min) the saved answers count
  select * into g from gen_tests where id = p_id;
  return jsonb_build_object('ok', true, 'test', gen_card(g));
end $$;
grant execute on function public.cbt_gen_submit(text, text, text, uuid, jsonb) to anon, authenticated;

-- result with every question, the right answer, the student's answer and the explanation (only after submitting)
create or replace function public.cbt_gen_result(p_mobile text, p_code text, p_device text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; g gen_tests%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into g from gen_tests where id = p_id and student_id = sid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.submitted_at is null and g.started_at is not null and g.ends_at + 120000 < now_ms() then
    perform gen_mark(g.id, null); select * into g from gen_tests where id = p_id;
  end if;
  if g.submitted_at is null then return jsonb_build_object('ok', false, 'error', 'not_done'); end if;
  return jsonb_build_object('ok', true, 'test', gen_card(g),
    'questions', coalesce((select jsonb_agg(qb_open(b) || jsonb_build_object('a', b.answer, 'e', b.explanation, 'my', (g.answers->>b.id::text)::int) order by u.o)
                             from unnest(g.qids) with ordinality u(id, o) join qbank b on b.id = u.id), '[]'::jsonb));
end $$;
grant execute on function public.cbt_gen_result(text, text, text, uuid) to anon, authenticated;

-- delete a test that is not running, or move a test that has not started to another time
create or replace function public.cbt_gen_edit(p_mobile text, p_code text, p_device text, p_id uuid, p_action text, p_at bigint default null)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; g gen_tests%rowtype; v_now bigint := now_ms();
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into g from gen_tests where id = p_id and student_id = sid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.started_at is not null and g.submitted_at is null and g.ends_at + 120000 >= v_now then
    return jsonb_build_object('ok', false, 'error', 'running');
  end if;
  if p_action = 'delete' then
    delete from gen_tests where id = g.id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'reschedule' then
    if g.started_at is not null then return jsonb_build_object('ok', false, 'error', 'started'); end if;
    if p_at is null or p_at > v_now + 180::bigint * 86400000 then return jsonb_build_object('ok', false, 'error', 'bad_time'); end if;
    update gen_tests set starts_at = greatest(p_at, v_now) where id = g.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;
grant execute on function public.cbt_gen_edit(text, text, text, uuid, text, bigint) to anon, authenticated;

-- ===================== admin: fill and tag the bank =====================
-- permission: Tests & content (view for stats/list/get, manage for changes) — set in supabase_v35_admin_team.sql
create or replace function public.cbt_admin_qbank(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end; x jsonb;
  f jsonb; v_ids uuid[]; v_cnt int := 0; v_upd int := 0; v_q text; v_page int; v_id uuid; v_new boolean;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  f := case when jsonb_typeof(d->'f') = 'object' then d->'f' else '{}'::jsonb end;
  v_ids := case when jsonb_typeof(d->'ids') = 'array'
                then array(select v::uuid from jsonb_array_elements_text(d->'ids') v where v ~ '^[0-9a-f-]{36}$' limit 2000) else '{}' end;

  if p_action = 'stats' then
    return jsonb_build_object('ok', true, 'total', (select count(*) from qbank),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(subject, chapter, level, qtype, source, active, n))
                          from (select subject, chapter, level, qtype, source, active, count(*) n from qbank group by 1, 2, 3, 4, 5, 6) x), '[]'::jsonb),
      'tests', coalesce((select jsonb_object_agg(t, n) from (select split_part(src, ':', 2) t, count(*) n from qbank where src like 'test:%' group by 1) x), '{}'::jsonb),
      'pyq', (select count(*) from qbank where src like 'pyq:%'),
      'pyq_all', (select count(*) from public.cbt_pyq where not has_img and answer between 0 and 3 and jsonb_array_length(options) = 4),
      'practised', (select count(distinct student_id) from qb_log),
      'gen', (select count(*) from gen_tests));

  elsif p_action = 'list' then
    v_q := lower(left(coalesce(d->>'q', ''), 80));
    v_page := greatest(0, least(1000, case when d->>'page' ~ '^\d{1,4}$' then (d->>'page')::int else 0 end));
    return jsonb_build_object('ok', true,
      'total', (select count(*) from qbank b where qb_tags(b, f) and (d->>'on' is null or b.active = (d->>'on')::boolean)
                  and (v_q = '' or position(v_q in lower(b.q)) > 0)),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 's', subject, 'c', chapter, 't', topic, 'l', level, 'y', qtype, 'o', source,
                  'q', left(q, 300), 'img', img is not null, 'a', answer, 'on', active, 'src', src) order by created_at desc, id)
                  from (select * from qbank b where qb_tags(b, f) and (d->>'on' is null or b.active = (d->>'on')::boolean)
                          and (v_q = '' or position(v_q in lower(b.q)) > 0)
                        order by created_at desc, id offset v_page * 50 limit 50) l), '[]'::jsonb));

  elsif p_action = 'get' then
    return jsonb_build_object('ok', true, 'item', (select to_jsonb(b) from qbank b where id = (d->>'id')::uuid));

  elsif p_action in ('add', 'save') then
    for x in select * from jsonb_array_elements(case when p_action = 'save' then jsonb_build_array(d) when jsonb_typeof(d->'items') = 'array' then d->'items' else '[]'::jsonb end) loop
      exit when v_cnt + v_upd >= 300;
      if coalesce(btrim(x->>'q'), '') = '' and coalesce(x->>'img', '') = '' then continue; end if;
      if jsonb_typeof(x->'options') is distinct from 'array' or jsonb_array_length(x->'options') <> 4 then continue; end if;
      if coalesce(x->>'answer', '') !~ '^[0-3]$' then continue; end if;
      if p_action = 'save' and x->>'id' ~ '^[0-9a-f-]{36}$' then
        update qbank set subject = left(coalesce(x->>'subject', subject), 30), chapter = left(coalesce(x->>'chapter', chapter), 40),
               topic = left(coalesce(x->>'topic', topic), 80),
               level = case when x->>'level' in ('easy', 'medium', 'hard') then x->>'level' else level end,
               qtype = case when x->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then x->>'qtype' else qtype end,
               source = case when x->>'source' in ('ncert', 'pyq', 'extra') then x->>'source' else source end,
               q = left(x->>'q', 6000), options = x->'options', answer = (x->>'answer')::int,
               explanation = left(coalesce(x->>'explanation', ''), 6000), active = coalesce((x->>'active')::boolean, active)
         where id = (x->>'id')::uuid;
        get diagnostics v_cnt = row_count;
        continue;
      end if;
      insert into qbank (subject, chapter, topic, level, qtype, source, q, options, answer, explanation, img, oimg, src)
      values (left(coalesce(x->>'subject', ''), 30), left(coalesce(x->>'chapter', ''), 40), left(coalesce(x->>'topic', ''), 80),
              case when x->>'level' in ('easy', 'medium', 'hard') then x->>'level' else 'medium' end,
              case when x->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then x->>'qtype' else qb_type(coalesce(x->>'q', '')) end,
              case when x->>'source' in ('ncert', 'pyq', 'extra') then x->>'source' else 'extra' end,
              left(coalesce(x->>'q', ''), 6000), x->'options', (x->>'answer')::int, left(coalesce(x->>'explanation', ''), 6000),
              case when length(coalesce(x->>'img', '')) between 1 and 600000 then x->>'img' end,
              case when jsonb_typeof(x->'oimg') = 'array' and length((x->'oimg')::text) <= 1200000 then x->'oimg' end,
              case when x->>'src' ~ '^test:[0-9a-f-]{36}:\d{1,4}$' then x->>'src' end)
      on conflict (src) do update set subject = excluded.subject, chapter = excluded.chapter, topic = excluded.topic, level = excluded.level,
              qtype = excluded.qtype, source = excluded.source, q = excluded.q, options = excluded.options, answer = excluded.answer,
              explanation = excluded.explanation, img = excluded.img, oimg = excluded.oimg
      returning (xmax = 0) into v_new;
      if v_new then v_cnt := v_cnt + 1; else v_upd := v_upd + 1; end if;
    end loop;
    return jsonb_build_object('ok', true, 'added', v_cnt, 'updated', v_upd);

  elsif p_action = 'set' then   -- the same tag for many questions
    update qbank set level = case when d->>'level' in ('easy', 'medium', 'hard') then d->>'level' else level end,
           qtype = case when d->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then d->>'qtype' else qtype end,
           source = case when d->>'source' in ('ncert', 'pyq', 'extra') then d->>'source' else source end,
           active = case when d ? 'active' then coalesce((d->>'active')::boolean, active) else active end
     where id = any (v_ids);
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'changed', v_cnt);

  elsif p_action = 'delete' then
    delete from qbank where id = any (v_ids);
    get diagnostics v_cnt = row_count;
    delete from qb_log where qid = any (v_ids);
    return jsonb_build_object('ok', true, 'deleted', v_cnt);

  elsif p_action = 'remove_test' then   -- take a test's questions out of the bank again
    delete from qbank where src like 'test:' || (d->>'test')::uuid::text || ':%';
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'deleted', v_cnt);

  elsif p_action = 'import_pyq' then   -- every PYQ with 4 options and an answer (diagram questions are skipped)
    insert into qbank (subject, chapter, topic, level, qtype, source, q, options, answer, explanation, src)
    select p.subject, p.chapter, p.topic, 'medium', qb_type(p.q), 'pyq', p.q, p.options, p.answer, p.explanation, 'pyq:' || p.id
      from public.cbt_pyq p
     where not p.has_img and p.answer between 0 and 3 and jsonb_array_length(p.options) = 4
    on conflict (src) do update set subject = excluded.subject, chapter = excluded.chapter, topic = excluded.topic,
           q = excluded.q, options = excluded.options, answer = excluded.answer, explanation = excluded.explanation;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'added', v_cnt);
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;
grant execute on function public.cbt_admin_qbank(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
