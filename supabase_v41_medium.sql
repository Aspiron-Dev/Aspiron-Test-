-- =====================================================================
--  v41: Hindi medium + English medium in the SAME test series
--
--  What it does
--  • A test keeps its English questions as before (tests.data, unchanged). The admin can add the Hindi text of
--    every question (question, 4 options, solution) in the test builder; it is kept next to the test in
--    cbt_private.test_hi, in the same order. Images and the answer key are shared by both languages.
--  • Every student has a MEDIUM per test series (English / हिंदी): chosen on the store when buying (the order
--    remembers it and the medium is set when the admin unlocks the series), on the student app, or by the admin.
--  • The medium is LOCKED when an attempt starts (sessions.lang). The server sends only that one language, so a
--    question can never switch language in the middle of a test, also after a refresh, resume or another phone.
--    The result, answer key and solutions of that attempt come in the same language (results.lang).
--  • A test is given in Hindi only when ALL its questions and options have Hindi text ("ready") and the Hindi was
--    saved after the last change of the English questions ("fresh"). Otherwise a Hindi student gets the whole test
--    in English (never a mix) and the instructions page says so before the start.
--  • Store: a series set to "English + हिंदी" (Admin → Test studio → series → Medium) asks for the medium at Buy.
--
--  Run in Supabase → SQL Editor after v40. Safe to run again.
--  THEN run supabase_v35_admin_team.sql AGAIN (permission check for the new cbt_admin_lang function).
--  It replaces cbt_start, cbt_submit, cbt_review, cbt_mistakes and cbt_bookmarks: if you re-run
--  v30_result_time or v33_live_one_attempt, run this file again afterwards.
-- =====================================================================

begin;

-- ---------- tables ----------
-- Hindi text of a test: [{q, options:[4], explanation}] in the same order as tests.data
create table if not exists cbt_private.test_hi (
  test_id    uuid primary key references cbt_private.tests(id) on delete cascade,
  data       jsonb   not null default '[]'::jsonb,
  done       int     not null default 0,          -- questions that have Hindi text
  ready      boolean not null default false,      -- every question + option that has English text has Hindi text
  fresh      boolean not null default true,       -- false once the English questions changed after this was saved
  updated_at timestamptz not null default now()
);
alter table cbt_private.test_hi enable row level security;
revoke all on cbt_private.test_hi from public, anon, authenticated;

-- 'en' = English only, 'bi' = English + हिंदी (the store asks for the medium)
create table if not exists cbt_private.series_lang (
  series_id  uuid primary key references cbt_private.series(id) on delete cascade,
  mode       text not null default 'en' check (mode in ('en', 'bi')),
  updated_at timestamptz not null default now()
);
alter table cbt_private.series_lang enable row level security;
revoke all on cbt_private.series_lang from public, anon, authenticated;

-- a student's medium: k = series id, or 'default' (used for a series without its own choice)
create table if not exists cbt_private.student_lang (
  student_id uuid not null references cbt_private.students(id) on delete cascade,
  k          text not null,
  lang       text not null check (lang in ('en', 'hi')),
  updated_at timestamptz not null default now(),
  primary key (student_id, k)
);
alter table cbt_private.student_lang enable row level security;
revoke all on cbt_private.student_lang from public, anon, authenticated;

alter table cbt_private.sessions add column if not exists lang text not null default 'en';
alter table cbt_private.results  add column if not exists lang text not null default 'en';
alter table public.cbt_store_orders add column if not exists lang text;

-- English questions changed → the saved Hindi no longer fits until it is saved again
create or replace function cbt_private.test_hi_stale() returns trigger language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if new.data is distinct from old.data then
    update test_hi set fresh = false where test_id = new.id and fresh;
  end if;
  return new;
end $$;
drop trigger if exists test_hi_stale on cbt_private.tests;
create trigger test_hi_stale after update of data on cbt_private.tests for each row execute function cbt_private.test_hi_stale();

-- a result takes the language of the attempt it grades (the newest attempt of that student + test)
create or replace function cbt_private.result_lang() returns trigger language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  new.lang := coalesce((select s.lang from sessions s where s.student_id = new.student_id and s.test_id = new.test_id
                        order by s.started_at desc limit 1), 'en');
  return new;
end $$;
drop trigger if exists result_lang on cbt_private.results;
create trigger result_lang before insert on cbt_private.results for each row execute function cbt_private.result_lang();

-- a series unlocked for a student who chose a medium in the store order: that medium becomes the series' medium
-- (unless the student or admin chose again after that order)
create or replace function cbt_private.access_lang() returns trigger language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v text; v_at timestamptz;
begin
  begin
    select o.lang, o.created_at into v, v_at
      from public.cbt_store_orders o
      join public.cbt_store_items i on i.id = o.item_id
      join students s on s.mobile = o.mobile
     where s.id = new.student_id and i.series_id = new.series_id::text and o.lang in ('en', 'hi') and o.status <> 'rejected'
     order by o.created_at desc limit 1;
    if v is not null then
      insert into student_lang (student_id, k, lang, updated_at) values (new.student_id, new.series_id::text, v, v_at)
      on conflict (student_id, k) do update set lang = excluded.lang, updated_at = excluded.updated_at
       where student_lang.updated_at < excluded.updated_at;
      insert into student_lang (student_id, k, lang, updated_at) values (new.student_id, 'default', v, v_at)
      on conflict (student_id, k) do nothing;
    end if;
  exception when others then null;   -- never stop an unlock
  end;
  return new;
end $$;
drop trigger if exists access_lang on cbt_private.series_access;
create trigger access_lang after insert on cbt_private.series_access for each row execute function cbt_private.access_lang();

-- ---------- helpers ----------
-- one question with its Hindi text. Keys the English question does not have are not added
-- (so a live test never gets an explanation). Empty Hindi text keeps the English one, which only happens where
-- the English is empty too (an image-only option), except the solution: it then stays English and gets x_en.
create or replace function cbt_private.q_hi(v jsonb, h jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(h) is distinct from 'object' then v else v
    || case when v ? 'q' then jsonb_build_object('q', coalesce(nullif(h->>'q', ''), v->>'q', '')) else '{}'::jsonb end
    || case when jsonb_typeof(v->'options') = 'array' then jsonb_build_object('options', (
         select coalesce(jsonb_agg(to_jsonb(coalesce(nullif(h->'options'->>(o.i::int - 1), ''), o.e #>> '{}', '')) order by o.i), '[]'::jsonb)
           from jsonb_array_elements(v->'options') with ordinality o(e, i))) else '{}'::jsonb end
    || case when not (v ? 'explanation') then '{}'::jsonb
            when coalesce(h->>'explanation', '') <> '' then jsonb_build_object('explanation', h->>'explanation')
            when coalesce(v->>'explanation', '') <> '' then jsonb_build_object('x_en', true)
            else '{}'::jsonb end
    || jsonb_build_object('lang', 'hi')
  end
$$;

-- a list of questions in the order of the test (questions, answer key) in a language
create or replace function cbt_private.qs_lang(p_qs jsonb, p_test uuid, p_lang text) returns jsonb
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select case
    when p_lang is distinct from 'hi' or jsonb_typeof(p_qs) is distinct from 'array' then p_qs
    when not exists (select 1 from test_hi h where h.test_id = p_test and jsonb_array_length(h.data) = jsonb_array_length(p_qs)) then p_qs
    else (select coalesce(jsonb_agg(q_hi(e.v, h.data->(e.n::int - 1)) order by e.n), '[]'::jsonb)
            from jsonb_array_elements(p_qs) with ordinality e(v, n), test_hi h where h.test_id = p_test)
  end
$$;

-- true when the Hindi of a test can be given
create or replace function cbt_private.hi_ok(p_test uuid) returns boolean
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select exists (select 1 from test_hi h join tests t on t.id = h.test_id
                  where h.test_id = p_test and h.ready and h.fresh and jsonb_array_length(h.data) = t.question_count)
$$;

-- the student's medium for a series ('en' when never chosen)
create or replace function cbt_private.medium_of(p_sid uuid, p_series uuid) returns text
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select coalesce((select lang from student_lang where student_id = p_sid and k = p_series::text),
                  (select lang from student_lang where student_id = p_sid and k = 'default'), 'en')
$$;

-- the language a NEW attempt of this test gets
create or replace function cbt_private.lang_for(p_sid uuid, p_test uuid) returns text
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select case when medium_of(p_sid, t.series_id) = 'hi' and hi_ok(t.id) then 'hi' else 'en' end
    from tests t where t.id = p_test
$$;

-- saved questions / mistakes (items with test_id + qidx) in the student's medium of each series
create or replace function cbt_private.items_lang(p_sid uuid, p_items jsonb) returns jsonb
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select case when jsonb_typeof(p_items) is distinct from 'array' then p_items else
    coalesce((select jsonb_agg(case
        when coalesce(e->>'test_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and coalesce(e->>'qidx', '') ~ '^[0-9]{1,4}$'
             and lang_for(p_sid, (e->>'test_id')::uuid) = 'hi'
        then q_hi(e, (select h.data->((e->>'qidx')::int) from test_hi h where h.test_id = (e->>'test_id')::uuid))
        else e end order by o)
      from jsonb_array_elements(p_items) with ordinality x(e, o)), '[]'::jsonb)
  end
$$;

revoke all on function cbt_private.q_hi(jsonb, jsonb), cbt_private.qs_lang(jsonb, uuid, text), cbt_private.hi_ok(uuid),
  cbt_private.medium_of(uuid, uuid), cbt_private.lang_for(uuid, uuid), cbt_private.items_lang(uuid, jsonb),
  cbt_private.test_hi_stale(), cbt_private.result_lang(), cbt_private.access_lang() from public, anon, authenticated;


-- ---------- cbt_start (v33 + the attempt's language) ----------
CREATE OR REPLACE FUNCTION public.cbt_start(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess record; qs jsonb; allowed boolean; lg text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select tt.*, sr.is_free as s_free, sr.active as s_active into x
  from tests tt join series sr on sr.id = tt.series_id where tt.id = p_test;
  if not found or not x.active or not x.s_active then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  allowed := x.s_free or x.free_preview
             or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id);
  if not allowed then return jsonb_build_object('ok',false,'error','locked'); end if;

  -- live window over: no new start until the result time (after it the test opens again, outside the rank)
  if x.closes_at is not null and t > x.closes_at and (x.result_at is null or t < x.result_at)
     and not exists(select 1 from sessions where student_id = sid and test_id = p_test and not submitted and ends_at > t) then
    return jsonb_build_object('ok',false,'error','closed','closes_at',x.closes_at,'result_at',x.result_at,'now',t);
  end if;

  if x.opens_at is not null and t < x.opens_at
     and not exists(select 1 from sessions where student_id = sid and test_id = p_test and not submitted) then
    return jsonb_build_object('ok',false,'error','not_open','opens_at',x.opens_at,'now',t);
  end if;

  perform autosubmit(sid, p_test);   -- an expired attempt that was auto-saved gets its result instead of being dropped
  update sessions set submitted = true
   where student_id = sid and test_id = p_test and not submitted and ends_at < t - 120000;

  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted;
  -- v33: live test already submitted -> no second attempt until the result time (or "Live ends" without one)
  if not found and not x.practice and coalesce(x.result_at, x.closes_at) is not null
     and t < coalesce(x.result_at, x.closes_at)
     and exists(select 1 from results where student_id = sid and test_id = p_test) then
    return jsonb_build_object('ok',false,'error','attempted','result_at',coalesce(x.result_at, x.closes_at),'now',t);
  end if;
  if not found then
    -- v41: the language is fixed here for the whole attempt; a resumed attempt keeps it
    insert into sessions(student_id,test_id,started_at,ends_at,lang)
    values (sid,p_test,t,t + x.duration::bigint*60000,lang_for(sid,p_test)) returning * into sess;
  end if;

  select jsonb_agg(case when x.practice
      then jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec',
             'answer',e.v->'answer','explanation',coalesce(e.v->'explanation','""'::jsonb),'eimg',e.v->'eimg')
      else jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec') end order by e.n)
  into qs from jsonb_array_elements(x.data) with ordinality as e(v,n);

  lg := case when sess.lang = 'hi' and exists(select 1 from test_hi h where h.test_id = p_test
                and jsonb_array_length(h.data) = jsonb_array_length(coalesce(qs,'[]'::jsonb))) then 'hi' else 'en' end;
  qs := qs_lang(qs, p_test, lg);

  return jsonb_build_object('ok',true,'now',t,
    'session',jsonb_build_object('id',sess.id,'started_at',sess.started_at,'ends_at',sess.ends_at,'lang',lg),
    'test',jsonb_build_object('id',x.id,'title',x.title,'duration',x.duration,'correct',x.correct_marks,
            'wrong',x.wrong_marks,'lock_back',x.lock_back,'practice',x.practice,'lang',lg,'questions',coalesce(qs,'[]'::jsonb)));
end $function$;

-- ---------- cbt_submit (v30 + answer key in the attempt's language) ----------
CREATE OR REPLACE FUNCTION public.cbt_submit(p_mobile text, p_code text, p_device text, p_test uuid, p_answers jsonb, p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess cbt_private.sessions%rowtype; r cbt_private.results%rowtype;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select * into r from results where student_id = sid and client_id = p_client_id and p_client_id is not null;
  if found then
    if res_hidden(r.test_id) then return hidden_result(r); end if;
    return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(r.test_id),r.test_id,r.lang));
  end if;

  select * into x from tests where id = p_test;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;

  -- locked, so the server's auto-submit cannot grade the same attempt at the same moment
  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted for update;
  if not found then
    -- the server may have just auto-submitted this attempt (same client id): give that result back
    select * into r from results where student_id = sid and client_id = p_client_id and p_client_id is not null;
    if found then
      if res_hidden(r.test_id) then return hidden_result(r); end if;
      return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(r.test_id),r.test_id,r.lang));
    end if;
    return jsonb_build_object('ok',false,'error','no_session');
  end if;

  -- time over, and this attempt was auto-saved on the server while it ran: grade that saved copy at the end time (not late)
  if t > sess.ends_at + 120000 and sess.answers is not null then
    r := grade_session(sess, sess.answers, coalesce(sess.client_id, p_client_id), sess.ends_at);
  else
    r := grade_session(sess, p_answers, p_client_id, t);
  end if;

  if res_hidden(p_test) then return hidden_result(r); end if;
  return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(p_test),p_test,r.lang));
end $function$;

-- ---------- cbt_review (v30 + the attempt's language) ----------
CREATE OR REPLACE FUNCTION public.cbt_review(p_mobile text, p_code text, p_device text, p_result uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; r cbt_private.results%rowtype; rv jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into r from results where id = p_result and student_id = sid;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if res_hidden(r.test_id) then
    return jsonb_build_object('ok',false,'error','hidden','result_at',(select result_at from tests where id = r.test_id));
  end if;
  rv := case when r.test_id is null then '[]'::jsonb else qs_lang(review_json(r.test_id),r.test_id,r.lang) end;
  return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',rv,'gone',(jsonb_array_length(rv) = 0));
end $function$;

-- ---------- cbt_mistakes (v30 + the student's medium) ----------
CREATE OR REPLACE FUNCTION public.cbt_mistakes(p_mobile text, p_code text, p_device text, p_offset integer, p_limit integer, p_kind text, p_sec text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; items jsonb; cnt jsonb; fcount int;
        lim int := least(greatest(coalesce(p_limit,15),1),30); off int := greatest(coalesce(p_offset,0),0);
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select jsonb_build_object(
    'wrong', count(*) filter (where kind = 'wrong'),
    'skipped', count(*) filter (where kind = 'skipped'),
    'secs', (select coalesce(jsonb_agg(jsonb_build_object('sec',z.sec,'n',z.n) order by z.sec),'[]'::jsonb)
             from (select m2.sec, count(*) n from mistake_rows(sid) m2 where res_visible(m2.test_id::text) group by m2.sec) z),
    'mastered', (select count(*) from mistake_done where student_id = sid))
  into cnt from mistake_rows(sid) m0 where res_visible(m0.test_id::text);

  select count(*) into fcount from mistake_rows(sid) m
   where res_visible(m.test_id::text) and (p_kind is null or p_kind in ('','all') or m.kind = p_kind) and (p_sec is null or p_sec = '' or m.sec = p_sec);

  select coalesce(jsonb_agg(jsonb_build_object('test_id',z.test_id,'title',z.title,'at',z.at,'qidx',z.qi,'kind',z.kind,'sec',z.sec,
      'q',z.v->'q','options',z.v->'options','answer',z.v->'answer','explanation',coalesce(z.v->'explanation','""'::jsonb),
      'img',z.v->'img','oimg',z.v->'oimg','eimg',z.v->'eimg','mine',z.ans,'time',z.tm) order by z.at desc, z.test_id, z.qi),'[]'::jsonb)
  into items
  from (select * from mistake_rows(sid) m
        where res_visible(m.test_id::text) and (p_kind is null or p_kind in ('','all') or m.kind = p_kind) and (p_sec is null or p_sec = '' or m.sec = p_sec)
        order by m.at desc, m.test_id, m.qi offset off limit lim) z;

  return jsonb_build_object('ok',true,'items',items_lang(sid, items),'counts',cnt,'offset',off,'more',fcount > off + lim);
end $function$;

-- ---------- cbt_bookmarks (v30 wrapper + the student's medium) ----------
do $do$
begin
  if to_regprocedure('cbt_private.cbt_bookmarks_all(text,text,text)') is not null then
    execute $f$
      create or replace function public.cbt_bookmarks(p_mobile text, p_code text, p_device text)
      returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $b$
      declare r jsonb; sid uuid;
      begin
        r := cbt_bookmarks_all(p_mobile, p_code, p_device);
        if coalesce((r->>'ok')::boolean, false) and jsonb_typeof(r->'items') = 'array' then
          -- saved questions of a held-back test stay in the list, but only with the question: no answer, no explanation
          r := jsonb_set(r, '{items}', coalesce((select jsonb_agg(case when e->>'test_id' is null or res_visible(e->>'test_id') then e
                     else jsonb_build_object('test_id',e->'test_id','title',e->'title','qidx',e->'qidx','q',e->'q','img',e->'img',
                            'options',coalesce(e->'options','[]'::jsonb),'oimg',e->'oimg','sec',e->'sec',
                            'solved',false,'answer',null,'explanation','','eimg',null,'hidden',true,
                            'result_at',(select h.result_at from tests h where h.id::text = e->>'test_id')) end order by o)
                   from jsonb_array_elements(r->'items') with ordinality as x(e, o)), '[]'::jsonb));
          -- v41: in the student's medium (the sign-in was checked by cbt_bookmarks_all just above)
          select id into sid from students where mobile = norm_mobile(p_mobile);
          if sid is not null then r := jsonb_set(r, '{items}', items_lang(sid, r->'items')); end if;
        end if;
        return r;
      end $b$;
      grant execute on function public.cbt_bookmarks(text, text, text) to anon, authenticated;
    $f$;
  end if;
end
$do$;


-- ---------- student: my medium ----------
-- get → {media: {series id | 'default': 'en'|'hi'}, hi: [tests that can be given in Hindi], bi: [series that offer Hindi]}
-- set {k: series id | 'default', lang: 'en'|'hi'} — a running attempt keeps its language; the next start uses this
create or replace function public.cbt_lang(p_mobile text, p_code text, p_device text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; d jsonb := coalesce(p_data, '{}'::jsonb);
        v_k text := btrim(coalesce(d->>'k', '')); v_l text := coalesce(d->>'lang', '');
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'media', coalesce((select jsonb_object_agg(k, lang) from student_lang where student_id = sid), '{}'::jsonb),
      'hi', coalesce((select jsonb_agg(h.test_id) from test_hi h join tests t on t.id = h.test_id
                       where h.ready and h.fresh and t.active and jsonb_array_length(h.data) = t.question_count), '[]'::jsonb),
      'bi', coalesce((select jsonb_agg(distinct z.id) from (
                select sl.series_id id from series_lang sl where sl.mode = 'bi'
                union select t.series_id from test_hi h join tests t on t.id = h.test_id where h.ready and h.fresh and t.active) z), '[]'::jsonb));
  elsif p_action = 'set' then
    if v_l not in ('en', 'hi') then return jsonb_build_object('ok', false, 'error', 'lang'); end if;
    if v_k <> 'default' and not exists (select 1 from series where id::text = v_k and active) then
      return jsonb_build_object('ok', false, 'error', 'series');
    end if;
    insert into student_lang (student_id, k, lang) values (sid, v_k, v_l)
    on conflict (student_id, k) do update set lang = excluded.lang, updated_at = now();
    insert into student_lang (student_id, k, lang) values (sid, 'default', v_l) on conflict (student_id, k) do nothing;
    return jsonb_build_object('ok', true, 'k', v_k, 'lang', v_l);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_lang(text, text, text, text, jsonb) to anon, authenticated;


-- ---------- store ----------
-- which store items offer Hindi (their series is set to English + हिंदी)
create or replace function public.cbt_store_langs()
returns jsonb language sql stable security definer set search_path = public, cbt_private, pg_temp as $$
  select jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(i.id) from public.cbt_store_items i
           join cbt_private.series_lang sl on sl.series_id::text = i.series_id where i.active and sl.mode = 'bi'), '[]'::jsonb))
$$;
grant execute on function public.cbt_store_langs() to anon, authenticated;

-- "Buy" with the medium: the same order as cbt_store_order, and the order remembers the medium
create or replace function public.cbt_store_order_lang(p_item uuid, p_name text, p_mobile text, p_lang text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  r := public.cbt_store_order(p_item, p_name, p_mobile);
  if coalesce((r->>'ok')::boolean, false) and p_lang in ('en', 'hi') then
    update public.cbt_store_orders set lang = p_lang where code = r->>'code';
    r := r || jsonb_build_object('lang', p_lang);
  end if;
  return r;
end $$;
grant execute on function public.cbt_store_order_lang(uuid, text, text, text) to anon, authenticated;


-- ---------- admin ----------
-- overview | test_get | test_set | test_clear | series_set | student_get | student_set | orders
create or replace function public.cbt_admin_lang(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); x record; hs jsonb; v_done int; v_ready boolean; v_id uuid;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'overview' then
    return jsonb_build_object('ok', true,
      'series', coalesce((select jsonb_object_agg(series_id, mode) from series_lang), '{}'::jsonb),
      'tests', coalesce((select jsonb_object_agg(h.test_id, jsonb_build_object('done', h.done, 'n', t.question_count,
                 'ready', h.ready, 'fresh', h.fresh, 'at', (extract(epoch from h.updated_at) * 1000)::bigint))
               from test_hi h join tests t on t.id = h.test_id), '{}'::jsonb));

  elsif p_action = 'test_get' then
    select h.*, t.question_count into x from test_hi h join tests t on t.id = h.test_id where h.test_id = (d->>'id')::uuid;
    if not found then return jsonb_build_object('ok', true, 'hi', null); end if;
    return jsonb_build_object('ok', true, 'hi', x.data, 'done', x.done, 'ready', x.ready, 'fresh', x.fresh,
      'at', (extract(epoch from x.updated_at) * 1000)::bigint);

  elsif p_action = 'test_set' then
    select * into x from tests where id = (d->>'id')::uuid;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if jsonb_typeof(d->'data') is distinct from 'array' or length((d->'data')::text) > 3000000 then
      return jsonb_build_object('ok', false, 'error', 'bad_request');
    end if;
    if jsonb_array_length(d->'data') <> jsonb_array_length(x.data) then
      return jsonb_build_object('ok', false, 'error', 'count', 'n', jsonb_array_length(x.data));
    end if;
    -- clean copy: {q, options:[4], explanation}, text only
    select coalesce(jsonb_agg(jsonb_build_object(
        'q', left(coalesce(case when jsonb_typeof(e.v->'q') = 'string' then e.v->>'q' end, ''), 8000),
        'options', jsonb_build_array(
            left(coalesce(case when jsonb_typeof(e.v->'options'->0) = 'string' then e.v->'options'->>0 end, ''), 3000),
            left(coalesce(case when jsonb_typeof(e.v->'options'->1) = 'string' then e.v->'options'->>1 end, ''), 3000),
            left(coalesce(case when jsonb_typeof(e.v->'options'->2) = 'string' then e.v->'options'->>2 end, ''), 3000),
            left(coalesce(case when jsonb_typeof(e.v->'options'->3) = 'string' then e.v->'options'->>3 end, ''), 3000)),
        'explanation', left(coalesce(case when jsonb_typeof(e.v->'explanation') = 'string' then e.v->>'explanation' end, ''), 12000)
      ) order by e.n), '[]'::jsonb)
    into hs from jsonb_array_elements(d->'data') with ordinality e(v, n);

    -- ready: Hindi wherever the English question has text (question and each option)
    select count(*) filter (where btrim(h.v->>'q') <> ''),
           bool_and((btrim(coalesce(en.v->>'q', '')) = '' or btrim(h.v->>'q') <> '')
                    and not exists (select 1 from generate_series(0, 3) j
                                     where btrim(coalesce(en.v->'options'->>j, '')) <> '' and btrim(coalesce(h.v->'options'->>j, '')) = ''))
      into v_done, v_ready
      from jsonb_array_elements(hs) with ordinality h(v, n)
      join jsonb_array_elements(x.data) with ordinality en(v, n) on en.n = h.n;

    if coalesce(v_done, 0) = 0 then
      delete from test_hi where test_id = x.id;
      return jsonb_build_object('ok', true, 'done', 0, 'ready', false, 'cleared', true);
    end if;
    insert into test_hi (test_id, data, done, ready, fresh, updated_at) values (x.id, hs, v_done, coalesce(v_ready, false), true, now())
    on conflict (test_id) do update set data = excluded.data, done = excluded.done, ready = excluded.ready, fresh = true, updated_at = now();
    return jsonb_build_object('ok', true, 'done', v_done, 'ready', coalesce(v_ready, false), 'n', jsonb_array_length(x.data));

  elsif p_action = 'test_clear' then
    delete from test_hi where test_id = (d->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'series_set' then
    v_id := (d->>'id')::uuid;
    if not exists (select 1 from series where id = v_id) then return jsonb_build_object('ok', false, 'error', 'series'); end if;
    if coalesce(d->>'mode', '') not in ('en', 'bi') then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
    insert into series_lang (series_id, mode) values (v_id, d->>'mode')
    on conflict (series_id) do update set mode = excluded.mode, updated_at = now();
    return jsonb_build_object('ok', true);

  elsif p_action = 'student_get' then
    return jsonb_build_object('ok', true, 'media', coalesce((select jsonb_object_agg(k, lang) from student_lang
             where student_id = (d->>'id')::uuid), '{}'::jsonb));

  elsif p_action = 'student_set' then
    v_id := (d->>'id')::uuid;
    if not exists (select 1 from students where id = v_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if coalesce(d->>'k', '') <> 'default' and not exists (select 1 from series where id::text = d->>'k') then
      return jsonb_build_object('ok', false, 'error', 'series');
    end if;
    if coalesce(d->>'lang', '') = '' then
      delete from student_lang where student_id = v_id and k = d->>'k';
    elsif d->>'lang' in ('en', 'hi') then
      insert into student_lang (student_id, k, lang) values (v_id, d->>'k', d->>'lang')
      on conflict (student_id, k) do update set lang = excluded.lang, updated_at = now();
    else
      return jsonb_build_object('ok', false, 'error', 'lang');
    end if;
    return jsonb_build_object('ok', true);

  elsif p_action = 'orders' then
    -- medium chosen in recent store orders: {order code: 'en'|'hi'}
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_object_agg(code, lang) from public.cbt_store_orders
             where lang is not null and created_at > now() - interval '120 days'), '{}'::jsonb));
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_lang(text, text, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
