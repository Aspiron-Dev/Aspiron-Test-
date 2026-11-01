-- =====================================================================
--  v43: Test rules + fixes G1-G4 of SECURITY_MAP.md
--  - Live test: the attempt ends at "Live ends" at the latest (start at 8:58 with Live ends 9:00 -> auto-submit at 9:00).
--    No new attempt until the result time (as before); after it, re-attempts are allowed but the rank (test and overall)
--    counts only first attempts submitted by "Live ends" (+2 minutes for the answer to reach the server).
--  - G1: per student, at most 30 new test attempts, 120 opened reviews and 60 PYQ chapters an hour (stops bulk copying).
--  - G3: a series file can be given an "opens at" date (Admin -> Tests -> Cover & files).
--  - G4: a sign-in token works only with the phone it was made on.
--  Run after v42, then run supabase_v35_admin_team.sql again. Safe to run again.
--  Re-run this file after re-running v11, v30, v33, v39, v41 or v42 (they replace some of the same functions).
-- =====================================================================

-- ---------- per-student hourly limits ----------
create table if not exists cbt_private.rate_hits (student_id uuid not null, kind text not null, at timestamptz not null default now());
create index if not exists rate_hits_k on cbt_private.rate_hits (student_id, kind, at desc);
revoke all on cbt_private.rate_hits from public, anon, authenticated;
create or replace function cbt_private.rate_ok(p_sid uuid, p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if p_sid is null then return true; end if;
  if (select count(*) from rate_hits where student_id = p_sid and kind = p_kind and at > now() - interval '1 hour') >= p_limit then
    return false;
  end if;
  insert into rate_hits (student_id, kind) values (p_sid, p_kind);
  if random() < 0.01 then delete from rate_hits where at < now() - interval '2 hours'; end if;
  return true;
end $$;
revoke all on function cbt_private.rate_ok(uuid, text, int) from public, anon, authenticated;

-- ---------- G4: tokens bound to their phone ----------
drop function if exists cbt_private.st_ok(uuid, text, text);
create or replace function cbt_private.st_ok(p_sid uuid, p_code_hash text, p_tok text, p_device text default null) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_id uuid; r student_tokens%rowtype;
begin
  if coalesce(p_tok, '') !~ '^st1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$' then return false; end if;
  v_id := split_part(p_tok, '.', 2)::uuid;
  select * into r from student_tokens where id = v_id;
  if not found or r.student_id <> p_sid or r.expires_at < now() or r.code_hash is distinct from p_code_hash
     or r.token_hash <> encode(sha256(convert_to(split_part(p_tok, '.', 3), 'UTF8')), 'hex')
     or (p_device is not null and r.device <> '' and r.device <> p_device) then
    return false;
  end if;
  if r.last_seen < now() - interval '1 hour' then
    update student_tokens set last_seen = now(), expires_at = now() + interval '180 days' where id = v_id;
  end if;
  return true;
end $$;
revoke all on function cbt_private.st_ok(uuid, text, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION cbt_private.auth(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  s cbt_private.students%rowtype;
  m text := cbt_private.norm_mobile(p_mobile);
  c text := cbt_private.norm_code(p_code);
  t bigint := cbt_private.now_ms();
  v_tok boolean := false;
begin
  select * into s from students where mobile = m;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  -- a sign-in token from cbt_login (supabase_v42): the phone keeps this instead of the access code
  if coalesce(p_code, '') like 'st1.%' then
    v_tok := cbt_private.st_ok(s.id, s.code_hash, p_code, p_device);
    if not v_tok then return jsonb_build_object('ok',false,'error','invalid'); end if;
  end if;
  if s.locked_until > t and not v_tok then
    -- A lock is often caused by someone else typing wrong codes for this number. The student's own phone
    -- (already registered on the account) with the right code keeps working; at most 30 tries per lock.
    if not (p_device is not null and p_device = any(s.devices) and s.lock_fails < 30) then
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
    if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
      update students set lock_fails = lock_fails + 1 where id = s.id;
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
  end if;
  if s.status = 'pending' then
    return jsonb_build_object('ok',false,'error','pending');
  end if;
  if not v_tok and (s.code_hash is null or s.code_hash <> hash_code(s.salt, c)) then
    -- counted in the update itself, so wrong codes sent at the same moment are all counted
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
      lock_fails   = case when fail_count + 1 >= 8 then 0 else lock_fails end,
      fail_count   = case when fail_count + 1 >= 8 then 0 else fail_count + 1 end
    where id = s.id;
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.status = 'blocked' then
    return jsonb_build_object('ok',false,'error','blocked');
  end if;
  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('ok',false,'error','device');
  end if;
  if not (p_device = any(s.devices)) then
    -- the limit is checked again inside the update, so two new phones signing in at once cannot both get in
    update students set devices = array_append(devices, p_device)
     where id = s.id and not (p_device = any(devices)) and coalesce(array_length(devices,1),0) < max_devices;
    if not found and not exists (select 1 from students where id = s.id and p_device = any(devices)) then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
  end if;
  if s.fail_count <> 0 or s.last_seen is null or s.last_seen < now() - interval '5 minutes' then
    update students set fail_count = 0, last_seen = now() where id = s.id;
  end if;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;
revoke all on function cbt_private.auth(text, text, text) from public, anon, authenticated;

-- ---------- test attempt: ends at "Live ends"; G1 limit ----------
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
    -- v43: at most 30 new attempts an hour per student (stops copying the whole question bank)
    if not rate_ok(sid, 'start', 30) then return jsonb_build_object('ok',false,'error','busy'); end if;
    -- v41: the language is fixed here for the whole attempt; a resumed attempt keeps it
    insert into sessions(student_id,test_id,started_at,ends_at,lang)
    values (sid,p_test,t,
            -- v43: during the live window the attempt ends at "Live ends" at the latest (start 8:58, ends 9:00)
            case when x.closes_at is not null and t < x.closes_at then least(t + x.duration::bigint*60000, x.closes_at)
                 else t + x.duration::bigint*60000 end,lang_for(sid,p_test)) returning * into sess;
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
grant execute on function public.cbt_start(text, text, text, uuid) to anon, authenticated;

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
  if not rate_ok(sid, 'review', 120) then return jsonb_build_object('ok',false,'error','busy'); end if;   -- v43
  select * into r from results where id = p_result and student_id = sid;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if res_hidden(r.test_id) then
    return jsonb_build_object('ok',false,'error','hidden','result_at',(select result_at from tests where id = r.test_id));
  end if;
  rv := case when r.test_id is null then '[]'::jsonb else qs_lang(review_json(r.test_id),r.test_id,r.lang) end;
  return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',rv,'gone',(jsonb_array_length(rv) = 0));
end $function$;
grant execute on function public.cbt_review(text, text, text, uuid) to anon, authenticated;

-- ---------- rank: first attempts submitted by "Live ends" ----------
CREATE OR REPLACE FUNCTION public.cbt_leaderboard(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; total int; myrank int; top jsonb; avg_sc numeric; top_sc numeric; my_sc numeric;
        mx numeric; pctl int; dist jsonb; mybk int; below int; honest int; mych boolean; ra bigint; cut bigint;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  -- ra = result time of a test whose results are held back (null = shown at once, e.g. practice)
  -- v43: rank = first attempts submitted by "Live ends" (+2 min to reach the server); without it, by the result time
  select case when not practice then result_at end, case when not practice then coalesce(closes_at, result_at) end into ra, cut
    from tests where id = p_test;
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
             where not f1.late and (cut is null or f1.created_at <= to_timestamp((cut + 120000) / 1000.0))),
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
               where not f1.late and (cut is null or f1.created_at <= to_timestamp((cut + 120000) / 1000.0))
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
grant execute on function public.cbt_leaderboard(text, text, text, uuid) to anon, authenticated;

create or replace function cbt_private.overall_refresh()
returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare built timestamptz;
begin
  select at into built from rank_built where k = 'overall';
  if built is not null and built > now() - interval '30 seconds' then return; end if;
  if built is null then
    perform pg_advisory_xact_lock(hashtext('cbt_overall_rank'));          -- first time: wait for the one building it
  elsif not pg_try_advisory_xact_lock(hashtext('cbt_overall_rank')) then
    return;                                                              -- someone is building it now: use the current copy
  end if;
  select at into built from rank_built where k = 'overall';
  if built is not null and built > now() - interval '30 seconds' then return; end if;

  perform autosubmit(null, null);   -- expired, auto-saved attempts get their result before ranking

  delete from overall_rank;
  -- per student and test: the FIRST attempt, if not late and (for held-back tests) after the result time and submitted before it
  insert into overall_rank (student_id, pc, n, rk)
  with b as (select f1.student_id, f1.test_id, f1.score / nullif(f1.max_score,0) * 100 p
             from (select distinct on (rs.student_id, rs.test_id) rs.*, tp.result_at ra, coalesce(tp.closes_at, tp.result_at) cut
                   from results rs join tests tp on tp.id = rs.test_id and not tp.practice where rs.test_id is not null
                   order by rs.student_id, rs.test_id, rs.created_at) f1
             where not f1.late and (f1.ra is null or f1.ra <= now_ms())
               and (f1.cut is null or f1.created_at <= to_timestamp((f1.cut + 120000) / 1000.0))
               and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = f1.test_id::text)),
       s as (select student_id, round(avg(p),1) pc, count(*) n from b group by student_id)
  select s.student_id, s.pc, s.n, rank() over (order by s.pc desc nulls last) from s;

  insert into rank_built (k, at) values ('overall', now()) on conflict (k) do update set at = excluded.at;
end $$;
revoke all on function cbt_private.overall_refresh() from public, anon, authenticated;
delete from cbt_private.rank_built where k = 'overall';   -- the overall rank is rebuilt with the new rule on its next use

-- ---------- PYQ: G1 limit ----------
create or replace function public.cbt_pyq_chapter(p_mobile text, p_code text, p_device text, p_exam text, p_chapter text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  -- v43: at most 60 chapters an hour per student
  if not cbt_private.rate_ok((select id from cbt_private.students where mobile = cbt_private.norm_mobile(p_mobile)), 'pyq', 60) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 't', topic, 'y', year, 'p', paper, 'n', qno, 'q', q, 'o', options, 'a', answer, 'e', explanation, 'img', has_img, 'k', rkey,
             'rep', (select jsonb_agg(distinct r.paper) from public.cbt_pyq r where r.exam = p.exam and r.rkey = p.rkey and r.rkey <> '' ))
             order by year desc, qno)
    from public.cbt_pyq p where exam = p_exam and chapter = p_chapter), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_pyq_chapter(text, text, text, text, text) to anon, authenticated;

-- ---------- G3: files can open from a date ----------
alter table cbt_private.series_files add column if not exists opens_at bigint;
create or replace function public.cbt_file_part(p_mobile text, p_code text, p_device text, p_file uuid, p_n integer)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; f record; d text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  select fl.*, sr.is_free into f from series_files fl join series sr on sr.id = fl.series_id and sr.active where fl.id = p_file and fl.ready;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (f.is_free or exists (select 1 from series_access ac where ac.student_id = (a->>'id')::uuid and ac.series_id = f.series_id)) then
    return jsonb_build_object('ok',false,'error','locked');
  end if;
  -- v43: a file can be set to open only from a date (e.g. solutions after the test)
  if f.opens_at is not null and f.opens_at > now_ms() then
    return jsonb_build_object('ok',false,'error','not_open','opens_at',f.opens_at);
  end if;
  select data into d from file_parts where file_id = p_file and n = p_n;
  return jsonb_build_object('ok',true,'data',d,'parts',f.parts,'mime',f.mime,'name',f.file_name);
end $$;
grant execute on function public.cbt_file_part(text, text, text, uuid, integer) to anon, authenticated;

-- admin: read / set the opening time of a series' files (permission: Tests & content; checked in v35)
create or replace function public.cbt_admin_files(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_t text;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'files', coalesce((select jsonb_object_agg(id::text, opens_at) from series_files
             where series_id::text = coalesce(d->>'series_id', '') and opens_at is not null), '{}'::jsonb));
  elsif p_action = 'set' then
    update series_files set opens_at = case when coalesce(d->>'at', '') ~ '^[0-9]{10,14}$' then (d->>'at')::bigint end
     where id::text = coalesce(d->>'id', '') returning title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_files(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v43 installed: live end time, rank cut-off, hourly limits, file opening dates, tokens per phone' as status;
