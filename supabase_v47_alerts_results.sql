-- =====================================================================
--  v47: R1 + R2 + R3 of SECURITY_REVIEW.md
--  R1  Score, rank and answer key stay hidden until the result time — or, when a live test has only "Live ends",
--      until "Live ends". Before this, such a test gave the answer key to whoever submitted first.
--  R2  Students cannot download or delete their data themselves (owner's decision). When the admin deletes a student,
--      everything about that student goes with them (results, saved questions, reports, phones, notifications,
--      reviews, number history); store orders and payments stay for the accounts.
--  R3  Security alerts: wrong admin / team passwords, wrong 2FA codes, locked sign-ins, student lock-outs, too many
--      requests, refused actions, team and password changes, 2FA turned off, recovery codes used, members giving
--      free access or approving orders are written to cbt_private.security_events. The owner sees them in
--      Admin → Team & access → Security alerts (and on the bell); serious ones also fail the GitHub check
--      "Security alerts" (security-alerts.yml), so GitHub sends an e-mail.
--  Run after v46, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

-- ======================= R1: one result time =======================
-- when a held-back test's results are shown: the result time, else "Live ends"; null = at once (practice / no times)
create or replace function cbt_private.res_at(p_test uuid)
returns bigint language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select case when not t.practice then coalesce(t.result_at, t.closes_at) end from tests t where t.id = p_test
$$;
-- true while a test's score and answer key are held back
create or replace function cbt_private.res_hidden(p_test uuid)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select exists(select 1 from tests t where t.id = p_test and not t.practice and coalesce(t.result_at, t.closes_at) > now_ms())
$$;
-- same check for a test id given as text (mistake rows); true = may be shown
create or replace function cbt_private.res_visible(p_test text)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select not exists(select 1 from tests t where t.id::text = p_test and not t.practice and coalesce(t.result_at, t.closes_at) > now_ms())
$$;
-- what a student gets back for a held-back result: saved, but no score and no answer key
create or replace function cbt_private.hidden_result(r cbt_private.results)
returns jsonb language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select jsonb_build_object('ok',true,'hidden',true,'result_at',res_at(r.test_id),
    'result',jsonb_build_object('id',r.id,'test_id',r.test_id,'title',r.test_title,'used',r.used_seconds,'late',r.late,
      'at',(extract(epoch from r.created_at)*1000)::bigint,'hidden',true,'result_at',res_at(r.test_id)),
    'review','[]'::jsonb)
$$;
revoke all on function cbt_private.res_at(uuid), cbt_private.res_hidden(uuid), cbt_private.res_visible(text),
  cbt_private.hidden_result(cbt_private.results) from public, anon, authenticated;

-- ---------- cbt_catalog (from v30): a test's best score and the "waiting for result" list use the same time ----------
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
      'best',case when not x.practice and coalesce(x.result_at, x.closes_at) > t then null else r.best end,
      'best_max',case when not x.practice and coalesce(x.result_at, x.closes_at) > t then null else r.best_max end,
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
           'at',(extract(epoch from q.created_at)*1000)::bigint,'result_at',coalesce(h.result_at, h.closes_at)) order by q.created_at desc),'[]'::jsonb)
  into pend
  from results q join tests h on h.id = q.test_id
  where q.student_id = sid and not h.practice and coalesce(h.result_at, h.closes_at) > t;

  select coalesce(jsonb_agg(jsonb_build_object('t',b.test_id,'i',b.qidx)),'[]'::jsonb) into bm
  from bookmarks b where b.student_id = sid;

  return jsonb_build_object('ok',true,'now',t,'name',a->>'name','mobile',a->>'mobile','series',ser,'folders',fol,'tests',tst,'results',res,'pending',pend,'bookmarks',bm);
end $function$;

-- ---------- cbt_review (from v43) ----------
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
    return jsonb_build_object('ok',false,'error','hidden','result_at',res_at(r.test_id));
  end if;
  rv := case when r.test_id is null then '[]'::jsonb else qs_lang(review_json(r.test_id),r.test_id,r.lang) end;
  return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',rv,'gone',(jsonb_array_length(rv) = 0));
end $function$;
grant execute on function public.cbt_review(text, text, text, uuid) to anon, authenticated;

-- ---------- cbt_leaderboard (from v43) ----------
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

  -- ra = when a held-back test's results are shown (v47: the result time, or else "Live ends"; null = at once, e.g. practice)
  -- v43: rank = first attempts submitted by "Live ends" (+2 min to reach the server); without it, by the result time
  select res_at(id), case when not practice then coalesce(closes_at, result_at) end into ra, cut
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

-- ---------- overall rank (from v43): a test counts only after its results are shown ----------
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
             from (select distinct on (rs.student_id, rs.test_id) rs.*, coalesce(tp.result_at, tp.closes_at) ra, coalesce(tp.closes_at, tp.result_at) cut
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

-- ---------- cbt_bookmarks (from v41) ----------
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
                            'result_at',(select res_at(h.id) from tests h where h.id::text = e->>'test_id')) end order by o)
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

-- ======================= R2: deleting a student removes all their data =======================
-- Runs before the student row goes (Admin → Students → Delete). Tables that do not exist are skipped.
-- Kept on purpose: store orders, payments and the order trash (accounts), the access-request block list.
create or replace function cbt_private.student_wipe() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare x text[];
begin
  foreach x slice 1 in array array[
      ['cbt_private.results','student_id'], ['cbt_private.sessions','student_id'], ['cbt_private.bookmarks','student_id'],
      ['cbt_private.reports','student_id'], ['cbt_private.mistake_done','student_id'], ['cbt_private.series_access','student_id'],
      ['cbt_private.ann_reads','student_id'], ['cbt_private.rate_hits','student_id'], ['cbt_private.student_lang','student_id'],
      ['cbt_private.student_tokens','student_id'], ['cbt_private.mobile_changes','student_id'], ['cbt_private.overall_rank','student_id'],
      ['public.cbt_device_info','student_id'], ['public.cbt_device_swaps','student_id'], ['public.cbt_reviews','student_id'],
      ['public.cbt_suspensions','student_id'], ['public.cbt_cheat_flags','student_id'],
      ['public.cbt_push_subs','mobile'], ['public.cbt_test_alerts','mobile']] loop
    if to_regclass(x[1]) is not null and exists (select 1 from pg_attribute
         where attrelid = to_regclass(x[1]) and attname = x[2] and not attisdropped) then
      if x[2] = 'mobile' then
        execute format('delete from %s where %I = $1', x[1], x[2]) using old.mobile;
      else
        execute format('delete from %s where %I::text = $1', x[1], x[2]) using old.id::text;
      end if;
    end if;
  end loop;
  return old;
end $$;
revoke all on function cbt_private.student_wipe() from public, anon, authenticated;
drop trigger if exists student_wipe on cbt_private.students;
create trigger student_wipe before delete on cbt_private.students for each row execute function cbt_private.student_wipe();

-- ======================= R3: security events and alerts =======================
-- level 'high' = alert the owner (bell + e-mail through GitHub); 'low' = counted, and one 'high' alert is added when
-- a kind reaches its limit within an hour; 'info' = shown in the list only. No password, code or token is ever stored.
create table if not exists cbt_private.security_events (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  kind    text not null,
  level   text not null default 'low',
  who     text not null default '',               -- the account or student concerned (never a password)
  detail  text not null default '',
  ip      text not null default '',               -- shortened like the activity log (a.b.•.•)
  seen    boolean not null default false,         -- the owner opened the alerts
  mailed  boolean not null default false          -- reported by security-alerts.yml
);
create index if not exists security_events_at on cbt_private.security_events (at desc);
create index if not exists security_events_kind on cbt_private.security_events (kind, at desc);
revoke all on cbt_private.security_events from public, anon, authenticated;
alter table cbt_private.security_events enable row level security;

-- how many 'low' events of a kind in one hour make an alert
create or replace function cbt_private.sec_limit(p_kind text) returns int language sql immutable as $$
  select case p_kind when 'owner_wrong_password' then 5 when 'team_wrong_password' then 10 when 'wrong_2fa' then 3
                     when 'refused' then 5 when 'student_locked' then 10 when 'busy' then 20 else 0 end
$$;

create or replace function cbt_private.sec_event(p_kind text, p_level text, p_who text default '', p_detail text default '')
returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare n int; lim int := sec_limit(p_kind); v_ip text := '';
begin
  begin v_ip := coalesce(adm_ip(), ''); exception when others then v_ip := ''; end;
  insert into security_events (kind, level, who, detail, ip)
  values (left(p_kind, 40), p_level, left(coalesce(p_who, ''), 80), left(coalesce(p_detail, ''), 160), left(v_ip, 40));
  if p_level = 'low' and lim > 0 then
    select count(*) into n from security_events where kind = p_kind and level = 'low' and at > now() - interval '1 hour';
    -- exactly at the limit: one alert per hour and kind (counts after that only add rows)
    if n = lim and not exists (select 1 from security_events where kind = 'many:' || p_kind and at > now() - interval '1 hour') then
      insert into security_events (kind, level, detail) values ('many:' || p_kind, 'high', n || ' in the last hour');
    end if;
  end if;
  if random() < 0.01 then delete from security_events where at < now() - interval '180 days'; end if;
exception when others then
  null;   -- an alert must never break a sign-in or a test
end $$;
revoke all on function cbt_private.sec_limit(text), cbt_private.sec_event(text, text, text, text) from public, anon, authenticated;

-- wrong owner / team passwords (one row per wrong password is written by admin_ok / cbt_admin_login)
create or replace function cbt_private.sec_t_fail_owner() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin perform sec_event('owner_wrong_password', 'low', 'Owner'); return null; end $$;
create or replace function cbt_private.sec_t_fail_team() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin perform sec_event('team_wrong_password', 'low', 'Team sign-in'); return null; end $$;
drop trigger if exists sec_fail_owner on cbt_private.admin_fail_log;
create trigger sec_fail_owner after insert on cbt_private.admin_fail_log for each row execute function cbt_private.sec_t_fail_owner();
drop trigger if exists sec_fail_team on cbt_private.admin_fail_log_team;
create trigger sec_fail_team after insert on cbt_private.admin_fail_log_team for each row execute function cbt_private.sec_t_fail_team();

-- a connection locked after 10 wrong passwords / codes (owner, team, password checks, 2FA codes)
create or replace function cbt_private.sec_t_lock() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if new.locked_until > now_ms() and (tg_op = 'INSERT' or new.locked_until is distinct from old.locked_until) then
    perform sec_event('sign_in_locked', 'high', '', '10 wrong tries from one place: locked for 15 minutes');
  end if;
  return null;
end $$;
drop trigger if exists sec_lock on cbt_private.admin_fails;
create trigger sec_lock after insert or update of locked_until on cbt_private.admin_fails for each row execute function cbt_private.sec_t_lock();

-- 100 wrong passwords in an hour from everywhere: owner / team sign-in paused
create or replace function cbt_private.sec_t_settings() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if new.key in ('admin_locked_until', 'team_locked_until') and (tg_op = 'INSERT' or new.value is distinct from old.value)
     and coalesce(new.value, '') ~ '^[0-9]{1,15}$' and new.value::bigint > now_ms() then
    perform sec_event('sign_in_paused', 'high', case when new.key = 'admin_locked_until' then 'Owner' else 'Team' end,
                      '100 wrong passwords in an hour: sign-in paused for 15 minutes');
  end if;
  return null;
end $$;
drop trigger if exists sec_settings on cbt_private.settings;
create trigger sec_settings after insert or update on cbt_private.settings for each row execute function cbt_private.sec_t_settings();

-- two-step sign-in: wrong codes, codes locked, 2FA turned off
create or replace function cbt_private.sec_t_totp() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_who text;
begin
  v_who := case when old.acct = 'owner' then 'Owner' else coalesce((select name from admin_users where id = old.user_id), 'Team member') end;
  if new.fails > old.fails then perform sec_event('wrong_2fa', 'low', v_who); end if;
  if new.locked_until > old.locked_until and new.locked_until > now_ms() then
    perform sec_event('2fa_locked', 'high', v_who, '5 wrong codes: locked for 15 minutes');
  end if;
  if old.enabled and not new.enabled then perform sec_event('2fa_off', 'high', v_who, 'Two-step sign-in was turned off'); end if;
  return null;
end $$;
create or replace function cbt_private.sec_t_totp_del() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if old.enabled then
    perform sec_event('2fa_off', 'high', case when old.acct = 'owner' then 'Owner'
                      else coalesce((select name from admin_users where id = old.user_id), 'Team member') end, 'Two-step sign-in was turned off');
  end if;
  return null;
end $$;
drop trigger if exists sec_totp on cbt_private.admin_totp;
create trigger sec_totp after update on cbt_private.admin_totp for each row execute function cbt_private.sec_t_totp();
drop trigger if exists sec_totp_del on cbt_private.admin_totp;
create trigger sec_totp_del after delete on cbt_private.admin_totp for each row execute function cbt_private.sec_t_totp_del();

-- a student locked out after 8 wrong access codes (many at once = someone guessing codes)
create or replace function cbt_private.sec_t_student() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if new.locked_until > coalesce(old.locked_until, 0) and new.locked_until > now_ms() then
    perform sec_event('student_locked', 'low', left(coalesce(new.name, ''), 60) || ' · …' || right(coalesce(new.mobile, ''), 4),
                      '8 wrong access codes');
  end if;
  return null;
end $$;
drop trigger if exists sec_student on cbt_private.students;
create trigger sec_student after update of locked_until on cbt_private.students for each row execute function cbt_private.sec_t_student();

-- from the activity log: refused actions, team / password / 2FA changes, recovery codes, sign-ins from a new place,
-- and team members giving free access or approving orders and payments (insider misuse, R6)
create or replace function cbt_private.sec_t_audit() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare k text := new.fn || ':' || new.act;
begin
  if new.result = 'refused' then
    perform sec_event('refused', 'low', new.who, k);
  elsif new.result = '' then
    if k in ('cbt_admin_team:user_save', 'cbt_admin_team:user_delete', 'cbt_admin_team:team_2fa') then
      perform sec_event('team_changed', 'high', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    elsif k in ('cbt_admin_team:owner_password', 'cbt_admin:set_password') then
      perform sec_event('owner_password_changed', 'high', new.who, 'The owner password was changed');
    elsif k = 'session:sign_in' then
      if new.detail like '%recovery code used%' then
        perform sec_event('recovery_code_used', 'high', new.who, 'Signed in with a recovery code');
      end if;
      if new.ip <> '' and not exists (select 1 from admin_audit a where a.fn = 'session' and a.act = 'sign_in' and a.id <> new.id
                                         and a.uid is not distinct from new.uid and a.ip = new.ip and a.at > now() - interval '90 days') then
        perform sec_event('new_place_sign_in', 'info', new.who, left(new.detail, 80));
      end if;
    elsif new.uid is not null and (k in ('cbt_admin:grant', 'cbt_admin_store:order_status', 'cbt_admin_store_order:approve',
                                          'cbt_admin_payments:add', 'cbt_admin_payments:update', 'cbt_admin_payments:delete',
                                          'cbt_admin_edit:order_delete', 'cbt_admin:student_delete')) then
      perform sec_event('member_access_or_money', 'info', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists sec_audit on cbt_private.admin_audit;
create trigger sec_audit after insert on cbt_private.admin_audit for each row execute function cbt_private.sec_t_audit();

revoke all on function cbt_private.sec_t_fail_owner(), cbt_private.sec_t_fail_team(), cbt_private.sec_t_lock(), cbt_private.sec_t_settings(),
  cbt_private.sec_t_totp(), cbt_private.sec_t_totp_del(), cbt_private.sec_t_student(), cbt_private.sec_t_audit() from public, anon, authenticated;

-- too many requests from one student (copying tests / reviews quickly): one event per student and kind per hour
create or replace function cbt_private.rate_ok(p_sid uuid, p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if p_sid is null then return true; end if;
  if (select count(*) from rate_hits where student_id = p_sid and kind = p_kind and at > now() - interval '1 hour') >= p_limit then
    -- v47: written once per hour for this student and kind
    if not exists (select 1 from security_events where kind = 'busy' and detail = p_kind || ' · ' || p_sid::text and at > now() - interval '1 hour') then
      perform sec_event('busy', 'low', coalesce((select left(name, 60) from students where id = p_sid), ''), p_kind || ' · ' || p_sid::text);
    end if;
    return false;
  end if;
  insert into rate_hits (student_id, kind) values (p_sid, p_kind);
  if random() < 0.01 then delete from rate_hits where at < now() - interval '2 hours'; end if;
  return true;
end $$;
revoke all on function cbt_private.rate_ok(uuid, text, int) from public, anon, authenticated;

-- ---------- admin: Team & access → Security alerts (owner only; checked again in v35) ----------
-- get  {days?: 1-90} → {events: [...latest 300], counts: {kind: n} (in those days), unseen: high alerts not opened yet}
-- seen → marks every alert as seen
create or replace function public.cbt_admin_security(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_days int;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_action = 'count' then
    return jsonb_build_object('ok', true, 'unseen', (select count(*) from security_events where level = 'high' and not seen));
  elsif p_action = 'get' then
    v_days := greatest(1, least(90, coalesce(nullif(d->>'days', '')::int, 7)));
    return jsonb_build_object('ok', true,
      'unseen', (select count(*) from security_events where level = 'high' and not seen),
      'counts', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from security_events
                           where at > now() - make_interval(days => v_days) group by kind) z), '{}'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', (extract(epoch from at) * 1000)::bigint, 'kind', kind,
                           'level', level, 'who', who, 'detail', detail, 'ip', ip, 'seen', seen) order by id desc)
                          from (select * from security_events where at > now() - make_interval(days => v_days)
                                order by (level = 'high') desc, id desc limit 300) z), '[]'::jsonb));
  elsif p_action = 'seen' then
    update security_events set seen = true where not seen;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_security(text, text, jsonb) to anon, authenticated;

-- ---------- for security-alerts.yml (GitHub, runs with the database login every hour) ----------
-- returns one line per kind of serious alert not reported yet ("kind: n") and marks them reported. No names, no data.
create or replace function cbt_private.sec_mail() returns setof text
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  return query
    with m as (update security_events set mailed = true where level = 'high' and not mailed returning kind)
    select kind || ': ' || count(*) from m group by kind order by kind;
end $$;
revoke all on function cbt_private.sec_mail() from public, anon, authenticated;

notify pgrst, 'reload schema';
