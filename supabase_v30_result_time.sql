-- =====================================================================
--  v30: Result time for live tests
--  Each test can have two optional times (set in the admin test form):
--    closes_at  "Live ends"            - no new start after it (until the result time)
--    result_at  "Result & answer key"  - before it students see no score, rank, answer key,
--                                        mistakes or insights for that test; after it, everything shows by itself
--  Leaderboards and the overall rank now count each student's FIRST attempt of a test, and only if it was
--  not late (and, for a test with a result time, submitted before that time). Re-attempts still work and
--  still show in the student's own results, they just do not change the rank.
--  Tests without a result time and practice tests show results at once, as before.
--  While a test runs the app also saves the answers online (cbt_save); if the student leaves and never comes back,
--  the server submits those saved answers at the end time (on time, not late).
--  Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run. Safe to run again.
--  IMPORTANT: it replaces cbt_leaderboard / cbt_overall / cbt_start / cbt_submit / cbt_catalog ... If you ever re-run an
--  OLDER file that also creates them (e.g. supabase_v25_cheat_leaderboard.sql), run this file again afterwards.
-- =====================================================================

begin;

alter table cbt_private.tests add column if not exists closes_at bigint;
alter table cbt_private.tests add column if not exists result_at bigint;

-- true while a test's score and answer key are held back
create or replace function cbt_private.res_hidden(p_test uuid)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select exists(select 1 from tests t where t.id = p_test and not t.practice and t.result_at is not null and t.result_at > now_ms())
$$;
-- same check for a test id given as text (mistake rows); true = may be shown
create or replace function cbt_private.res_visible(p_test text)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select not exists(select 1 from tests t where t.id::text = p_test and not t.practice and t.result_at is not null and t.result_at > now_ms())
$$;
-- what a student gets back for a held-back result: saved, but no score and no answer key
create or replace function cbt_private.hidden_result(r cbt_private.results)
returns jsonb language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select jsonb_build_object('ok',true,'hidden',true,'result_at',(select result_at from tests where id = r.test_id),
    'result',jsonb_build_object('id',r.id,'test_id',r.test_id,'title',r.test_title,'used',r.used_seconds,'late',r.late,
      'at',(extract(epoch from r.created_at)*1000)::bigint,'hidden',true,'result_at',(select result_at from tests where id = r.test_id)),
    'review','[]'::jsonb)
$$;
revoke all on function cbt_private.res_hidden(uuid) from public, anon, authenticated;
revoke all on function cbt_private.res_visible(text) from public, anon, authenticated;
revoke all on function cbt_private.hidden_result(cbt_private.results) from public, anon, authenticated;


-- ---------- auto-save during a test, and the server's auto-submit when the time is over ----------
-- While a test runs, the app saves the answers on the server every few seconds (cbt_save). If the student leaves
-- (Back button, closed app, lost phone) and does not come back, the attempt is graded with those saved answers at
-- the end time, so it is on time (not late) and counts like a normal submit.
alter table cbt_private.sessions add column if not exists answers jsonb;
alter table cbt_private.sessions add column if not exists client_id text;
alter table cbt_private.sessions add column if not exists saved_at timestamptz;

create or replace function cbt_private.grade_session(p_sess cbt_private.sessions, p_answers jsonb, p_client_id text, p_t bigint)
returns cbt_private.results language plpgsql security definer set search_path = cbt_private, pg_temp as $$
-- grades one attempt and saves the result; p_t = moment of the submit (ms). Body copied from cbt_submit.
declare x record; r cbt_private.results%rowtype;
        n int; i int; c int := 0; w int := 0; sk int := 0; ans int; key int; used int; clean jsonb; tm jsonb := '{}'::jsonb;
begin
  select * into x from tests where id = p_sess.test_id;
  n := jsonb_array_length(x.data);
  for i in 0..n-1 loop
    key := case when (x.data->i->>'answer') ~ '^[0-3]$' then (x.data->i->>'answer')::int else null end;
    ans := case when jsonb_typeof(p_answers) = 'object' and (p_answers->>(i::text)) ~ '^[0-3]$'
                then (p_answers->>(i::text))::int else null end;
    if ans is null or key is null then sk := sk + 1;
    elsif ans = key then c := c + 1;
    else w := w + 1;
    end if;
  end loop;

  used := least(((p_t - p_sess.started_at)/1000)::int, x.duration*60);
  clean := case when jsonb_typeof(p_answers) = 'object'
    then coalesce((select jsonb_object_agg(e.k, e.v) from jsonb_each(p_answers) as e(k,v)
                   where e.k ~ '^[0-9]+$' and e.v::text ~ '^[0-3]$'),'{}'::jsonb)
    else '{}'::jsonb end;

  if jsonb_typeof(p_answers) = 'object' and jsonb_typeof(p_answers->'_t') = 'object' then
    select coalesce(jsonb_object_agg(e.k, least(greatest(floor((e.v #>> '{}')::numeric),0),3600)::int), '{}'::jsonb) into tm
    from (select k, v from jsonb_each(p_answers->'_t') as z(k,v)
          where k ~ '^[0-9]{1,3}$' and jsonb_typeof(v) = 'number' limit 400) e;
  end if;

  insert into results(student_id,test_id,test_title,score,max_score,correct,wrong,skipped,used_seconds,answers,late,client_id,times,created_at)
  values (p_sess.student_id,p_sess.test_id,x.title,c*x.correct_marks - w*x.wrong_marks,n*x.correct_marks,c,w,sk,used,clean,
          p_t > p_sess.ends_at + 120000, p_client_id, tm, to_timestamp(p_t / 1000.0))
  returning * into r;

  update sessions set submitted = true where id = p_sess.id;

  return r;
end $$;
revoke all on function cbt_private.grade_session(cbt_private.sessions, jsonb, text, bigint) from public, anon, authenticated;

create or replace function cbt_private.autosubmit(p_student uuid, p_test uuid)
returns int language plpgsql security definer set search_path = cbt_private, pg_temp as $$
-- grades every expired attempt that has auto-saved answers (optionally only one student's / one test's)
declare s cbt_private.sessions%rowtype; k int := 0; t bigint := now_ms();
begin
  for s in select * from sessions
            where not submitted and answers is not null and ends_at + 120000 < t
              and (p_student is null or student_id = p_student) and (p_test is null or test_id = p_test)
              and exists (select 1 from tests where id = sessions.test_id)
            for update skip locked
  loop
    perform grade_session(s, s.answers, s.client_id, s.ends_at);
    k := k + 1;
  end loop;
  return k;
end $$;
revoke all on function cbt_private.autosubmit(uuid, uuid) from public, anon, authenticated;

-- Student: save the answers of the running attempt (called by the app every few seconds while answering)
create or replace function public.cbt_save(p_mobile text, p_code text, p_device text, p_test uuid, p_answers jsonb, p_client_id text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; t bigint := now_ms(); sess cbt_private.sessions%rowtype;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text) > 60000 then
    return jsonb_build_object('ok',false,'error','bad_request');
  end if;
  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted for update;
  if not found then return jsonb_build_object('ok',false,'error','no_session'); end if;
  if t > sess.ends_at + 120000 then return jsonb_build_object('ok',false,'error','over'); end if;
  update sessions set answers = p_answers, client_id = left(p_client_id, 80), saved_at = now() where id = sess.id;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.cbt_save(text, text, text, uuid, jsonb, text) to anon, authenticated;

-- ---------- cbt_start ----------
CREATE OR REPLACE FUNCTION public.cbt_start(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess record; qs jsonb; allowed boolean;
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
  if not found then
    insert into sessions(student_id,test_id,started_at,ends_at)
    values (sid,p_test,t,t + x.duration::bigint*60000) returning * into sess;
  end if;

  select jsonb_agg(case when x.practice
      then jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec',
             'answer',e.v->'answer','explanation',coalesce(e.v->'explanation','""'::jsonb),'eimg',e.v->'eimg')
      else jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec') end order by e.n)
  into qs from jsonb_array_elements(x.data) with ordinality as e(v,n);

  return jsonb_build_object('ok',true,'now',t,
    'session',jsonb_build_object('id',sess.id,'started_at',sess.started_at,'ends_at',sess.ends_at),
    'test',jsonb_build_object('id',x.id,'title',x.title,'duration',x.duration,'correct',x.correct_marks,
            'wrong',x.wrong_marks,'lock_back',x.lock_back,'practice',x.practice,'questions',coalesce(qs,'[]'::jsonb)));
end $function$;

-- ---------- cbt_submit ----------
CREATE OR REPLACE FUNCTION public.cbt_submit(p_mobile text, p_code text, p_device text, p_test uuid, p_answers jsonb, p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess cbt_private.sessions%rowtype; r cbt_private.results%rowtype;
  n int; i int; c int := 0; w int := 0; sk int := 0; ans int; key int; used int; clean jsonb; tm jsonb := '{}'::jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select * into r from results where student_id = sid and client_id = p_client_id and p_client_id is not null;
  if found then
    if res_hidden(r.test_id) then return hidden_result(r); end if;
    return jsonb_build_object('ok',true,'result',result_json_t(r),'review',review_json(r.test_id));
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
      return jsonb_build_object('ok',true,'result',result_json_t(r),'review',review_json(r.test_id));
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
  return jsonb_build_object('ok',true,'result',result_json_t(r),'review',review_json(p_test));
end $function$;

-- ---------- cbt_review ----------
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
  rv := case when r.test_id is null then '[]'::jsonb else review_json(r.test_id) end;
  return jsonb_build_object('ok',true,'result',result_json_t(r),'review',rv,'gone',(jsonb_array_length(rv) = 0));
end $function$;

-- ---------- cbt_catalog ----------
CREATE OR REPLACE FUNCTION public.cbt_catalog(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  ser jsonb; fol jsonb; tst jsonb; res jsonb; bm jsonb; pend jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  perform autosubmit(sid, null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',sr.id,'title',sr.title,'description',sr.description,'is_free',sr.is_free,'price_label',sr.price_label,
      'cover_v',case when sr.cover is null then 0 else sr.cover_v end,
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'title',fl.title,'kind',fl.kind,'size',fl.size,'mime',fl.mime,'name',fl.file_name)
                 order by fl.created_at),'[]'::jsonb) from series_files fl where fl.series_id = sr.id and fl.ready),
      'unlocked',(sr.is_free or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id))
    ) order by sr.sort_order, sr.created_at),'[]'::jsonb)
  into ser from series sr where sr.active;

  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'series_id',f.series_id,'title',f.title)
           order by f.sort_order, f.created_at),'[]'::jsonb)
  into fol from folders f join series sr on sr.id = f.series_id and sr.active where f.active;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'series_id',x.series_id,'folder_id',x.folder_id,'title',x.title,'duration',x.duration,
      'questions',x.question_count,'correct',x.correct_marks,'wrong',x.wrong_marks,'free_preview',x.free_preview,'lock_back',x.lock_back,'practice',x.practice,
      'opens_at',x.opens_at,'closes_at',x.closes_at,'result_at',x.result_at,'sort',x.sort_order,'at',(extract(epoch from x.created_at)*1000)::bigint,
      'locked', not (sr.is_free or x.free_preview or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id)),
      'attempts',coalesce(r.cnt,0),
      'best',case when x.result_at is not null and not x.practice and x.result_at > t then null else r.best end,
      'best_max',case when x.result_at is not null and not x.practice and x.result_at > t then null else r.best_max end,
      'in_progress',exists(select 1 from sessions se where se.student_id = sid and se.test_id = x.id and not se.submitted and se.ends_at > t)
    ) order by x.sort_order, x.created_at),'[]'::jsonb)
  into tst
  from tests x
  join series sr on sr.id = x.series_id and sr.active
  left join folders f on f.id = x.folder_id
  left join lateral (select count(*)::int cnt, max(rs.score) best, max(rs.max_score) best_max
                     from results rs where rs.student_id = sid and rs.test_id = x.id) r on true
  where x.active and (x.folder_id is null or f.active);

  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'test_id',q.test_id,'title',q.test_title,'score',q.score,
           'max',q.max_score,'correct',q.correct,'wrong',q.wrong,'skipped',q.skipped,'used',q.used_seconds,
           'at',(extract(epoch from q.created_at)*1000)::bigint,'late',q.late) order by q.created_at desc),'[]'::jsonb)
  into res
  from (select * from results where student_id = sid order by created_at desc limit 300) q
  where res_visible(q.test_id::text);

  -- results still held back: only that they were submitted and when they will be shown
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'test_id',q.test_id,'title',q.test_title,'late',q.late,
           'at',(extract(epoch from q.created_at)*1000)::bigint,'result_at',h.result_at) order by q.created_at desc),'[]'::jsonb)
  into pend
  from results q join tests h on h.id = q.test_id
  where q.student_id = sid and not h.practice and h.result_at is not null and h.result_at > t;

  select coalesce(jsonb_agg(jsonb_build_object('t',b.test_id,'i',b.qidx)),'[]'::jsonb) into bm
  from bookmarks b where b.student_id = sid;

  return jsonb_build_object('ok',true,'now',t,'name',a->>'name','mobile',a->>'mobile','series',ser,'folders',fol,'tests',tst,'results',res,'pending',pend,'bookmarks',bm);
end $function$;

-- ---------- cbt_leaderboard ----------
CREATE OR REPLACE FUNCTION public.cbt_leaderboard(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; total int; myrank int; top jsonb; avg_sc numeric; top_sc numeric; my_sc numeric;
        mx numeric; pctl int; dist jsonb; mybk int; below int; honest int; mych boolean; ra bigint;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  -- ra = result time of a test whose results are held back (null = shown at once, e.g. practice)
  select case when not practice then result_at end into ra from tests where id = p_test;
  if ra is not null and ra > now_ms() then
    return jsonb_build_object('ok',true,'hidden',true,'result_at',ra,'total',0,'my_rank',null,'top','[]'::jsonb,
      'dist','[]'::jsonb,'my_cheat',false);
  end if;
  perform autosubmit(null, p_test);   -- expired, auto-saved attempts of this test get their result before ranking

  select max(max_score) into mx from results where test_id = p_test;

  -- one row per student: their FIRST attempt, counted only if it was not late (and came before the result time)
  with b as (select f1.student_id, f1.score sc,
                    exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = p_test::text) ch
             from (select distinct on (rs.student_id) rs.* from results rs where rs.test_id = p_test
                   order by rs.student_id, rs.created_at) f1
             where not f1.late and (ra is null or f1.created_at <= to_timestamp(ra / 1000.0))),
       -- cheaters are ranked after everyone else
       r as (select b.student_id, b.sc, b.ch, rank() over (order by b.ch, b.sc desc) rk from b)
  select (select count(*) from r), (select rk from r where student_id = sid),
         (select coalesce(jsonb_agg(jsonb_build_object('name',short_name(s.name),'score',r.sc,'rank',r.rk,'me',(r.student_id = sid),'cheat',r.ch)
                  order by r.rk, s.name),'[]'::jsonb) from r join students s on s.id = r.student_id where r.rk <= 10 or r.ch),
         (select round(avg(sc),1) from r where not ch), (select max(sc) from r where not ch), (select sc from r where student_id = sid),
         (select count(*) from r where not ch and sc <= (select sc from r where student_id = sid)),
         (select count(*) from r where not ch), (select ch from r where student_id = sid)
  into total, myrank, top, avg_sc, top_sc, my_sc, below, honest, mych;

  pctl := case when mych then 0
               when coalesce(honest,0) > 0 and my_sc is not null then round(100.0*below/honest)::int else null end;

  if coalesce(mx,0) > 0 then
    with b as (select f1.score sc from (select distinct on (rs.student_id) rs.* from results rs where rs.test_id = p_test
                   order by rs.student_id, rs.created_at) f1
               where not f1.late and (ra is null or f1.created_at <= to_timestamp(ra / 1000.0))
                 and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = p_test::text)),
         k as (select least(9, greatest(0, floor(b.sc / mx * 10)::int)) bk from b)
    select coalesce(jsonb_agg(coalesce((select count(*) from k where k.bk = g), 0) order by g), '[]'::jsonb)
      into dist from generate_series(0,9) g;
    mybk := case when my_sc is null or mych then null else least(9, greatest(0, floor(my_sc / mx * 10)::int)) end;
  end if;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'top',coalesce(top,'[]'::jsonb),
    'avg',avg_sc,'top_score',top_sc,'my_score',my_sc,'max',mx,'percentile',pctl,
    'dist',coalesce(dist,'[]'::jsonb),'my_bucket',mybk,'my_cheat',coalesce(mych,false));
end $function$;

-- ---------- cbt_overall ----------
CREATE OR REPLACE FUNCTION public.cbt_overall(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; total int; myrank int; mypct numeric; top jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  perform autosubmit(null, null);

  -- per student and test: the FIRST attempt, if not late and (for held-back tests) after the result time and submitted before it
  with b as (select f1.student_id, f1.test_id, f1.score / nullif(f1.max_score,0) * 100 p
             from (select distinct on (rs.student_id, rs.test_id) rs.*, tp.result_at ra
                   from results rs join tests tp on tp.id = rs.test_id and not tp.practice where rs.test_id is not null
                   order by rs.student_id, rs.test_id, rs.created_at) f1
             where not f1.late and (f1.ra is null or (f1.ra <= now_ms() and f1.created_at <= to_timestamp(f1.ra / 1000.0)))
               and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = f1.test_id::text)),
       s as (select student_id, round(avg(p),1) pc, count(*) n from b group by student_id),
       r as (select s.*, rank() over (order by s.pc desc nulls last) rk from s)
  select (select count(*) from r), (select rk from r where student_id = sid), (select pc from r where student_id = sid),
         (select coalesce(jsonb_agg(jsonb_build_object('name',short_name(st.name),'pct',r.pc,'rank',r.rk,'tests',r.n,'me',(r.student_id = sid))
                  order by r.rk, st.name),'[]'::jsonb) from r join students st on st.id = r.student_id where r.rk <= 5)
  into total, myrank, mypct, top;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'my_pct',mypct,'top',coalesce(top,'[]'::jsonb));
end $function$;

-- ---------- cbt_mistakes ----------
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

  return jsonb_build_object('ok',true,'items',items,'counts',cnt,'offset',off,'more',fcount > off + lim);
end $function$;

-- ---------- cbt_insights ----------
CREATE OR REPLACE FUNCTION public.cbt_insights(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; subj jsonb; tests_n int;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  with latest as (
    select distinct on (rs.test_id) rs.* from results rs
    where rs.student_id = sid and rs.test_id is not null and res_visible(rs.test_id::text) order by rs.test_id, rs.created_at desc),
  q as (
    select coalesce(nullif(trim(e.v->>'sec'),''),'General') sec,
      case when (e.v->>'answer') ~ '^[0-3]$' then (e.v->>'answer')::int end key,
      case when (l.answers->>((e.n-1)::text)) ~ '^[0-3]$' then (l.answers->>((e.n-1)::text))::int end ans,
      case when (l.times->>((e.n-1)::text)) ~ '^[0-9]+$' then (l.times->>((e.n-1)::text))::int end tm
    from latest l join tests t on t.id = l.test_id, jsonb_array_elements(t.data) with ordinality as e(v,n))
  select coalesce(jsonb_agg(jsonb_build_object('sec',sec,'total',tot,'correct',c,'wrong',w,'skipped',s,'avg_time',tt) order by sec),'[]'::jsonb)
  into subj
  from (select sec, count(*) tot,
          count(*) filter (where ans is not null and key is not null and ans = key) c,
          count(*) filter (where ans is not null and key is not null and ans <> key) w,
          count(*) filter (where ans is null or key is null) s,
          round(avg(tm) filter (where tm is not null and tm > 0)) tt
        from q group by sec) z;

  select count(distinct test_id) into tests_n from results where student_id = sid and test_id is not null and res_visible(test_id::text);
  return jsonb_build_object('ok',true,'subjects',subj,'tests',tests_n,'mistakes',(select count(*) from mistake_rows(sid) m9 where res_visible(m9.test_id::text)));
end $function$;

-- ---------- cbt_admin ----------
CREATE OR REPLACE FUNCTION public.cbt_admin(p_pw text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  e text; d jsonb := coalesce(p_data,'{}'::jsonb);
  sid uuid; code text; sl text; m text; nm text; ex record; fnd boolean;
  ser uuid; fid uuid; ttl text; dur int; cm numeric; wm numeric; so int; qs jsonb; clean jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok',false,'error',e); end if;

  begin
    if p_action = 'ping' then
      return jsonb_build_object('ok',true);

    elsif p_action = 'students' then
      return jsonb_build_object('ok',true,'students',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',s.id,'name',s.name,'mobile',s.mobile,'status',s.status,
          'devices',coalesce(array_length(s.devices,1),0),'max_devices',s.max_devices,
          'created',(extract(epoch from s.created_at)*1000)::bigint,
          'last_seen',(extract(epoch from s.last_seen)*1000)::bigint,
          'has_code',(s.code_hash is not null),
          'access',(select coalesce(jsonb_agg(ac.series_id),'[]'::jsonb) from series_access ac where ac.student_id = s.id),
          'attempts',(select count(*) from results rs where rs.student_id = s.id)
        ) order by (s.status = 'pending') desc, s.created_at desc),'[]'::jsonb) from students s));

    elsif p_action = 'student_add' then
      m := norm_mobile(d->>'mobile');
      nm := left(btrim(regexp_replace(coalesce(d->>'name',''),'\s+',' ','g')),60);
      if length(nm) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
      if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
      select * into ex from students where mobile = m;
      fnd := found;
      if fnd and ex.code_hash is not null then
        return jsonb_build_object('ok',false,'error','exists');
      end if;
      code := new_code(); sl := gen_random_uuid()::text;
      if fnd then
        update students set name = nm, status = 'approved', salt = sl, code_hash = hash_code(sl,code),
               devices = '{}', fail_count = 0, locked_until = 0 where id = ex.id returning id into sid;
      else
        insert into students(name,mobile,status,salt,code_hash)
        values (nm,m,'approved',sl,hash_code(sl,code)) returning id into sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid,'code',code,'mobile',m,'name',nm);

    elsif p_action in ('student_approve','student_code') then
      sid := (d->>'id')::uuid; code := new_code(); sl := gen_random_uuid()::text;
      update students set status = case when status = 'pending' then 'approved' else status end,
             salt = sl, code_hash = hash_code(sl,code), devices = '{}', fail_count = 0, locked_until = 0
       where id = sid returning name, mobile into nm, m;
      if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
      return jsonb_build_object('ok',true,'code',code,'name',nm,'mobile',m);

    elsif p_action = 'student_block' then
      sid := (d->>'id')::uuid;
      update students set status = case when coalesce((d->>'block')::boolean,true) then 'blocked'
                                        when code_hash is null then 'pending' else 'approved' end
       where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_devices_reset' then
      sid := (d->>'id')::uuid;
      update students set devices = '{}', fail_count = 0, locked_until = 0 where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_update' then
      sid := (d->>'id')::uuid;
      update students set
        name = coalesce(nullif(left(btrim(coalesce(d->>'name','')),60),''), name),
        max_devices = greatest(1, least(10, coalesce(nullif(d->>'max_devices','')::int, max_devices)))
       where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_delete' then
      delete from students where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'grant' then
      sid := (d->>'student_id')::uuid; ser := (d->>'series_id')::uuid;
      if coalesce((d->>'on')::boolean,false) then
        insert into series_access(student_id,series_id) values (sid,ser) on conflict do nothing;
      else
        delete from series_access where student_id = sid and series_id = ser;
      end if;
      return jsonb_build_object('ok',true);

    elsif p_action = 'catalog' then
      return jsonb_build_object('ok',true,
        'series',(select coalesce(jsonb_agg((to_jsonb(sr) - 'cover') || jsonb_build_object('has_cover',(sr.cover is not null),
                'files',(select coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'title',fl.title,'kind',fl.kind,'size',fl.size,'name',fl.file_name)
                          order by fl.created_at),'[]'::jsonb) from series_files fl where fl.series_id = sr.id and fl.ready))
                order by sr.sort_order, sr.created_at),'[]'::jsonb) from series sr),
        'folders',(select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order, f.created_at),'[]'::jsonb) from folders f),
        'tests',(select coalesce(jsonb_agg(jsonb_build_object(
            'id',x.id,'series_id',x.series_id,'folder_id',x.folder_id,'title',x.title,'duration',x.duration,
            'questions',x.question_count,'correct',x.correct_marks,'wrong',x.wrong_marks,'lock_back',x.lock_back,
            'free_preview',x.free_preview,'active',x.active,'sort_order',x.sort_order,'opens_at',x.opens_at,
            'closes_at',x.closes_at,'result_at',x.result_at,
            'problems',(select count(*) from jsonb_array_elements(x.data) pq where (pq->>'answer') is null or (pq->>'answer') !~ '^[0-3]$'),
            'reports',(select count(*) from reports rp where rp.test_id = x.id and rp.status = 'open'),
            'results',(select count(*) from results rs where rs.test_id = x.id)
          ) order by x.sort_order, x.created_at),'[]'::jsonb) from tests x));

    elsif p_action = 'series_save' then
      sid := nullif(d->>'id','')::uuid;
      if sid is null then
        if length(btrim(coalesce(d->>'title',''))) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
        insert into series(title,description,is_free,price_label,sort_order,active)
        values (btrim(d->>'title'), coalesce(d->>'description',''), coalesce((d->>'is_free')::boolean,true),
                coalesce(d->>'price_label',''), coalesce(nullif(d->>'sort_order','')::int,0), coalesce((d->>'active')::boolean,true))
        returning id into sid;
      else
        update series set
          title = coalesce(nullif(btrim(coalesce(d->>'title','')),''), title),
          description = coalesce(d->>'description', description),
          is_free = coalesce((d->>'is_free')::boolean, is_free),
          price_label = coalesce(d->>'price_label', price_label),
          sort_order = coalesce(nullif(d->>'sort_order','')::int, sort_order),
          active = coalesce((d->>'active')::boolean, active)
         where id = sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'series_delete' then
      delete from series where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'folder_save' then
      sid := nullif(d->>'id','')::uuid;
      if sid is null then
        if length(btrim(coalesce(d->>'title',''))) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
        insert into folders(series_id,title,sort_order,active)
        values ((d->>'series_id')::uuid, btrim(d->>'title'), coalesce(nullif(d->>'sort_order','')::int,0), coalesce((d->>'active')::boolean,true))
        returning id into sid;
      else
        update folders set
          title = coalesce(nullif(btrim(coalesce(d->>'title','')),''), title),
          sort_order = coalesce(nullif(d->>'sort_order','')::int, sort_order),
          active = coalesce((d->>'active')::boolean, active)
         where id = sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'folder_delete' then
      delete from folders where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'test_save' then
      sid := nullif(d->>'id','')::uuid;
      ser := (d->>'series_id')::uuid;
      if not exists (select 1 from series where id = ser) then return jsonb_build_object('ok',false,'error','series'); end if;
      fid := nullif(d->>'folder_id','')::uuid;
      if fid is not null and not exists (select 1 from folders where id = fid and series_id = ser) then fid := null; end if;
      ttl := btrim(coalesce(d->>'title',''));
      if length(ttl) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
      dur := greatest(1, least(600, coalesce(nullif(d->>'duration','')::int,180)));
      cm := coalesce(nullif(d->>'correct','')::numeric,4);
      wm := coalesce(nullif(d->>'wrong','')::numeric,1);
      so := coalesce(nullif(d->>'sort_order','')::int,0);
      if nullif(d->>'closes_at','') is not null and nullif(d->>'result_at','') is not null
         and (d->>'result_at')::bigint < (d->>'closes_at')::bigint then
        return jsonb_build_object('ok',false,'error','result_before_close');
      end if;

      qs := d->'questions'; clean := null;
      if d ? 'stage_token' then
        select coalesce(jsonb_agg(e.v order by s2.n, e.o),'[]'::jsonb) into qs
        from test_stage s2, jsonb_array_elements(s2.qs) with ordinality as e(v,o)
        where s2.token = d->>'stage_token';
        if jsonb_array_length(qs) <> coalesce(nullif(d->>'count','')::int,-1) then
          return jsonb_build_object('ok',false,'error','incomplete');
        end if;
      end if;
      if qs is not null and jsonb_typeof(qs) = 'array' then
        if jsonb_array_length(qs) = 0 then return jsonb_build_object('ok',false,'error','questions'); end if;
        clean := clean_questions(qs);
      end if;

      if sid is null then
        if clean is null then return jsonb_build_object('ok',false,'error','questions'); end if;
        insert into tests(series_id,folder_id,title,duration,correct_marks,wrong_marks,lock_back,free_preview,active,sort_order,data,question_count,opens_at,closes_at,result_at)
        values (ser,fid,ttl,dur,cm,wm,coalesce((d->>'lock_back')::boolean,false),coalesce((d->>'free_preview')::boolean,false),
                coalesce((d->>'active')::boolean,true),so,clean,jsonb_array_length(clean),nullif(d->>'opens_at','')::bigint,
                nullif(d->>'closes_at','')::bigint,nullif(d->>'result_at','')::bigint)
        returning id into sid;
      else
        update tests set series_id = ser, folder_id = fid, title = ttl, duration = dur, correct_marks = cm, wrong_marks = wm,
               lock_back = coalesce((d->>'lock_back')::boolean,false), free_preview = coalesce((d->>'free_preview')::boolean,false),
               active = coalesce((d->>'active')::boolean,true), sort_order = so, updated_at = now(),
               opens_at = case when d ? 'opens_at' then nullif(d->>'opens_at','')::bigint else opens_at end,
               closes_at = case when d ? 'closes_at' then nullif(d->>'closes_at','')::bigint else closes_at end,
               result_at = case when d ? 'result_at' then nullif(d->>'result_at','')::bigint else result_at end,
               data = coalesce(clean, data), question_count = coalesce(jsonb_array_length(clean), question_count)
         where id = sid;
        if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
      end if;
      if d ? 'stage_token' then delete from test_stage where token = d->>'stage_token'; end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'test_get' then
      return jsonb_build_object('ok',true,'test',(select to_jsonb(x) from tests x where x.id = (d->>'id')::uuid));

    elsif p_action = 'test_delete' then
      delete from tests where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'results' then
      perform autosubmit(null, null);
      return jsonb_build_object('ok',true,'results',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',rs.id,'student',s.name,'mobile',s.mobile,'test_id',rs.test_id,'title',rs.test_title,
          'score',rs.score,'max',rs.max_score,'correct',rs.correct,'wrong',rs.wrong,'skipped',rs.skipped,
          'used',rs.used_seconds,'at',(extract(epoch from rs.created_at)*1000)::bigint,'late',rs.late
        ) order by rs.created_at desc),'[]'::jsonb)
        from (select r2.* from results r2
               where (nullif(d->>'test_id','') is null or r2.test_id = nullif(d->>'test_id','')::uuid)
               order by r2.created_at desc limit 3000) rs
        join students s on s.id = rs.student_id));

    elsif p_action = 'result_delete' then
      delete from results where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'test_stage' then
      delete from test_stage where created_at < now() - interval '1 day';
      if length(coalesce(d->>'token','')) < 8 or jsonb_typeof(d->'questions') <> 'array' then
        return jsonb_build_object('ok',false,'error','bad_request');
      end if;
      insert into test_stage(token,n,qs) values (d->>'token',(d->>'n')::int,d->'questions')
        on conflict (token,n) do update set qs = excluded.qs, created_at = now();
      return jsonb_build_object('ok',true);

    elsif p_action = 'series_cover' then
      sid := (d->>'id')::uuid;
      if coalesce(d->>'cover','') = '' then
        update series set cover = null, cover_v = cover_v + 1 where id = sid;
      elsif (d->>'cover') like 'data:image/%' and length(d->>'cover') < 400000 then
        update series set cover = d->>'cover', cover_v = cover_v + 1 where id = sid;
      else
        return jsonb_build_object('ok',false,'error','image');
      end if;
      return jsonb_build_object('ok',true);

    elsif p_action = 'file_put' then
      sid := nullif(d->>'id','')::uuid;
      if sid is null then
        if coalesce((d->>'size')::int,0) > 8000000 then return jsonb_build_object('ok',false,'error','too_big'); end if;
        if coalesce(d->>'mime','') !~ '^(application/pdf|image/(jpeg|png|webp))$' then return jsonb_build_object('ok',false,'error','type'); end if;
        insert into series_files(series_id,title,kind,file_name,mime,size)
        values ((d->>'series_id')::uuid, left(coalesce(nullif(btrim(d->>'title'),''),'File'),80),
                case when d->>'kind' in ('syllabus','schedule','notes') then d->>'kind' else 'syllabus' end,
                left(coalesce(d->>'name','file'),80), d->>'mime', coalesce((d->>'size')::int,0))
        returning id into sid;
      end if;
      insert into file_parts(file_id,n,data) values (sid,(d->>'n')::int,d->>'data')
        on conflict (file_id,n) do update set data = excluded.data;
      if coalesce((d->>'last')::boolean,false) then
        update series_files set parts = (d->>'n')::int + 1, ready = true where id = sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'file_delete' then
      delete from series_files where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'reports' then
      return jsonb_build_object('ok',true,'reports',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',rp.id,'student',s.name,'mobile',s.mobile,'test_id',rp.test_id,'title',coalesce(x.title,rp.test_title),
          'qidx',rp.qidx,'kind',rp.kind,'note',rp.note,'status',rp.status,
          'at',(extract(epoch from rp.created_at)*1000)::bigint,
          'q',left(coalesce(x.data->rp.qidx->>'q',''),300),
          'answer',x.data->rp.qidx->'answer'
        ) order by (rp.status = 'open') desc, rp.created_at desc),'[]'::jsonb)
        from (select r2.* from reports r2 order by r2.created_at desc limit 1000) rp
        join students s on s.id = rp.student_id
        left join tests x on x.id = rp.test_id));

    elsif p_action = 'report_status' then
      update reports set status = case when d->>'status' in ('open','resolved','rejected') then d->>'status' else status end
       where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'report_delete' then
      delete from reports where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'bookmark_stats' then
      return jsonb_build_object('ok',true,'items',(
        select coalesce(jsonb_agg(z order by z->>'sortkey' desc),'[]'::jsonb) from (
          select jsonb_build_object('test_id',b.test_id,'title',x.title,'qidx',b.qidx,'count',count(*),
                 'q',left(coalesce(x.data->b.qidx->>'q',''),200),
                 'students',(array_agg(short_name(s.name) order by b.created_at))[1:8],
                 'sortkey',lpad(count(*)::text,6,'0')) z
          from bookmarks b join tests x on x.id = b.test_id join students s on s.id = b.student_id
          group by b.test_id, x.title, b.qidx, x.data order by count(*) desc limit 100) y));

    elsif p_action = 'usage' then
      return jsonb_build_object('ok',true,
        'db_bytes',pg_database_size(current_database()),
        'tests_bytes',(select coalesce(sum(pg_column_size(data)),0) from tests),
        'files_bytes',(select coalesce(sum(length(data)),0) from file_parts),
        'covers_bytes',(select coalesce(sum(length(cover)),0) from series where cover is not null),
        'results_bytes',(select coalesce(sum(pg_column_size(answers)+120),0) from results),
        'limit_bytes',524288000,
        'students',(select count(*) from students),'tests',(select count(*) from tests),
        'results',(select count(*) from results),'reports',(select count(*) from reports where status = 'open'));

    elsif p_action = 'set_password' then
      if length(coalesce(d->>'new_pw','')) < 8 then return jsonb_build_object('ok',false,'error','short'); end if;
      perform set_admin_password(d->>'new_pw');
      return jsonb_build_object('ok',true);
    end if;

    return jsonb_build_object('ok',false,'error','unknown_action');
  exception when others then
    return jsonb_build_object('ok',false,'error','bad_request','detail',sqlerrm);
  end;
end $function$;


-- ---------- cbt_bookmarks ----------
-- Its code was not exported, so it is left as it is: moved once to cbt_private.cbt_bookmarks_all, and a small
-- wrapper takes its place that leaves out saved questions of tests whose answer key is still held back.
-- (Undo: drop function public.cbt_bookmarks(text,text,text);
--        alter function cbt_private.cbt_bookmarks_all(text,text,text) set schema public;
--        alter function public.cbt_bookmarks_all(text,text,text) rename to cbt_bookmarks;
--        grant execute on function public.cbt_bookmarks(text,text,text) to anon, authenticated;)
do $do$
begin
  if to_regprocedure('cbt_private.cbt_bookmarks_all(text,text,text)') is null
     and to_regprocedure('public.cbt_bookmarks(text,text,text)') is not null then
    alter function public.cbt_bookmarks(text,text,text) rename to cbt_bookmarks_all;
    alter function public.cbt_bookmarks_all(text,text,text) set schema cbt_private;
    revoke all on function cbt_private.cbt_bookmarks_all(text,text,text) from public, anon, authenticated;
  end if;
  if to_regprocedure('cbt_private.cbt_bookmarks_all(text,text,text)') is not null then
    execute $f$
      create or replace function public.cbt_bookmarks(p_mobile text, p_code text, p_device text)
      returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $b$
      declare r jsonb;
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
        end if;
        return r;
      end $b$;
      grant execute on function public.cbt_bookmarks(text, text, text) to anon, authenticated;
    $f$;
  end if;
end
$do$;

-- every 5 minutes: auto-submit expired, auto-saved attempts so the admin sees them quickly
-- (without pg_cron this is skipped; they are then submitted when a student or the admin opens results)
do $do$
begin
  perform cron.schedule('cbt-autosubmit', '*/5 * * * *', 'select cbt_private.autosubmit(null, null)');
exception when others then
  raise notice 'pg_cron not available, skipped the auto-submit schedule';
end
$do$;

commit;

notify pgrst, 'reload schema';

select case when to_regprocedure('cbt_private.cbt_bookmarks_all(text,text,text)') is not null
            then 'v30 installed: result time, first-attempt rank, bookmarks protected'
            else 'v30 installed, but saved questions (bookmarks) are NOT protected yet: send me the cbt_bookmarks code' end as status;
