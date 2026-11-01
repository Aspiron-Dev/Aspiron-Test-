-- =====================================================================
--  v48: R4, R5, R6, R10, R13 of SECURITY_REVIEW.md (R7, R8, R9, R11, R12: app, admin, Edge Function, workflows, docs)
--  R4  Buyers' IP addresses are kept with a keyed hash (secret in cbt_private.settings, never sent anywhere) instead of
--      a plain md5 that can be reversed; order / waiting-list IPs are cleared after 30 days, access-request IPs after 1 day.
--  R5  A practice test that has a "Live ends" or result time ahead sends no answers at the start and keeps the result
--      hidden like a live test (a live test marked "practice" by mistake no longer leaks the answer key).
--  R6  A team member giving access or changing orders / payments shows on the owner's bell (Security alerts).
--  R10 Student access codes are kept with bcrypt: each code is changed over at the student's next sign-in with it;
--      phones that are signed in stay signed in.
--  R13 "Too many requests" answers HTTP 429 with Retry-After (the body stays {"error":"busy"}).
--  Run after v47, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

-- ======================= R4: keyed IP hash, cleared after 30 days =======================
insert into cbt_private.settings (key, value)
select 'ip_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from cbt_private.settings where key = 'ip_key');

create or replace function public.cbt_store_ip() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when v = '' then '' else encode(sha256(convert_to(
           coalesce((select value from cbt_private.settings where key = 'ip_key'), '') || '|store|' || v, 'UTF8')), 'hex') end
  from (select btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), '')) v
          from (select coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json) h) x) y
$$;
revoke all on function public.cbt_store_ip() from public, anon, authenticated;

create or replace function cbt_private.ip_purge() returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  update public.cbt_store_orders set ip = '' where ip <> '' and created_at < now() - interval '30 days';
  if to_regclass('public.cbt_store_notify') is not null then
    update public.cbt_store_notify set ip = '' where ip <> '' and created_at < now() - interval '30 days';
  end if;
  delete from access_requests where created_at < now() - interval '1 day';
  delete from public.cbt_store_tries where at < now() - interval '2 hours';
  delete from public.cbt_promo_clicks where at < now() - interval '2 hours';
end $$;
revoke all on function cbt_private.ip_purge() from public, anon, authenticated;
select cbt_private.ip_purge();
do $$ begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'cbt-ip-purge') then perform cron.unschedule('cbt-ip-purge'); end if;
    perform cron.schedule('cbt-ip-purge', '23 22 * * *', 'select cbt_private.ip_purge()');   -- every night (3:53 AM India time)
  end if;
end $$;

-- ======================= R5: practice + live times = treated as live =======================
create or replace function cbt_private.res_at(p_test uuid)
returns bigint language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select coalesce(t.result_at, t.closes_at) from tests t where t.id = p_test
$$;
create or replace function cbt_private.res_hidden(p_test uuid)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select exists(select 1 from tests t where t.id = p_test and coalesce(t.result_at, t.closes_at) > now_ms())
$$;
create or replace function cbt_private.res_visible(p_test text)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select not exists(select 1 from tests t where t.id::text = p_test and coalesce(t.result_at, t.closes_at) > now_ms())
$$;
revoke all on function cbt_private.res_at(uuid), cbt_private.res_hidden(uuid), cbt_private.res_visible(text) from public, anon, authenticated;

-- ---------- cbt_catalog (from v47) ----------
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
      'best',case when coalesce(x.result_at, x.closes_at) > t then null else r.best end,
      'best_max',case when coalesce(x.result_at, x.closes_at) > t then null else r.best_max end,
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
  where q.student_id = sid and coalesce(h.result_at, h.closes_at) > t;

  select coalesce(jsonb_agg(jsonb_build_object('t',b.test_id,'i',b.qidx)),'[]'::jsonb) into bm
  from bookmarks b where b.student_id = sid;

  return jsonb_build_object('ok',true,'now',t,'name',a->>'name','mobile',a->>'mobile','series',ser,'folders',fol,'tests',tst,'results',res,'pending',pend,'bookmarks',bm);
end $function$;

-- ---------- cbt_start (from v43) ----------
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

  -- v48 (R5): a practice test sends the answers at the start only when no "Live ends" / result time lies ahead
  select jsonb_agg(case when x.practice and coalesce(x.result_at, x.closes_at, 0) <= t
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

-- ======================= R6: members' access / money changes on the owner's bell =======================
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
      perform sec_event('member_access_or_money', 'warn', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    end if;
  end if;
  return null;
end $$;

create or replace function public.cbt_admin_security(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_days int;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_action = 'count' then
    return jsonb_build_object('ok', true, 'unseen', (select count(*) from security_events where level in ('high', 'warn') and not seen));
  elsif p_action = 'get' then
    v_days := greatest(1, least(90, coalesce(nullif(d->>'days', '')::int, 7)));
    return jsonb_build_object('ok', true,
      'unseen', (select count(*) from security_events where level in ('high', 'warn') and not seen),
      'counts', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from security_events
                           where at > now() - make_interval(days => v_days) group by kind) z), '{}'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', (extract(epoch from at) * 1000)::bigint, 'kind', kind,
                           'level', level, 'who', who, 'detail', detail, 'ip', ip, 'seen', seen) order by id desc)
                          from (select * from security_events where at > now() - make_interval(days => v_days)
                                order by (level in ('high', 'warn')) desc, id desc limit 300) z), '[]'::jsonb));
  elsif p_action = 'seen' then
    update security_events set seen = true where not seen;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_security(text, text, jsonb) to anon, authenticated;

-- ======================= R10: access codes with bcrypt =======================
-- salt 'b1$<22 characters>' = bcrypt (cost 8) with that salt; any other salt = the old salted sha256.
-- Same code + same salt always gives the same text, so every place that compares code_hash keeps working.
create or replace function cbt_private.hash_code(p_salt text, p_code text) returns text
language plpgsql stable security definer set search_path = cbt_private, pg_temp as $$
begin
  if coalesce(p_salt, '') like 'b1$%' then
    return cbt_private.adm_crypt(coalesce(p_code, ''), '$2a$08$' || substr(p_salt, 4, 22));
  end if;
  return encode(sha256(convert_to(coalesce(p_salt, '') || ':' || coalesce(p_code, ''), 'UTF8')), 'hex');
end $$;
revoke all on function cbt_private.hash_code(text, text) from public, anon, authenticated;

-- after a correct code: new bcrypt salt + hash; the student's tokens are moved to the new hash (nobody is signed out)
create or replace function cbt_private.code_upgrade(p_sid uuid, p_salt text, p_hash text, p_code text) returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_salt text; v_hash text;
begin
  v_salt := 'b1$' || left(translate(encode(cbt_private.adm_rand(18), 'base64'), '+=', '.'), 22);
  v_hash := hash_code(v_salt, p_code);
  update students set salt = v_salt, code_hash = v_hash
   where id = p_sid and salt is not distinct from p_salt and code_hash is not distinct from p_hash;
  if found then update student_tokens set code_hash = v_hash where student_id = p_sid and code_hash = p_hash; end if;
exception when others then
  null;   -- never stop a sign-in; the old hash keeps working and the change is tried again next time
end $$;
revoke all on function cbt_private.code_upgrade(uuid, text, text, text) from public, anon, authenticated;

-- ---------- auth (from v43) ----------
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
  -- v48 (R10): the right access code was typed: keep it with bcrypt from now on (the phone's tokens keep working)
  if not v_tok and coalesce(s.salt, '') not like 'b1$%' then perform code_upgrade(s.id, s.salt, s.code_hash, c); end if;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;
revoke all on function cbt_private.auth(text, text, text) from public, anon, authenticated;

-- ======================= R13: HTTP 429 for "busy" =======================
create or replace function cbt_private.rate_ok(p_sid uuid, p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if p_sid is null then return true; end if;
  if (select count(*) from rate_hits where student_id = p_sid and kind = p_kind and at > now() - interval '1 hour') >= p_limit then
    -- v47: written once per hour for this student and kind
    if not exists (select 1 from security_events where kind = 'busy' and detail = p_kind || ' · ' || p_sid::text and at > now() - interval '1 hour') then
      perform sec_event('busy', 'low', coalesce((select left(name, 60) from students where id = p_sid), ''), p_kind || ' · ' || p_sid::text);
    end if;
    -- v48 (R13): the website gets HTTP 429 with Retry-After (the answer is still {"error":"busy"})
    perform set_config('response.status', '429', true);
    perform set_config('response.headers', '[{"Retry-After": "600"}]', true);
    return false;
  end if;
  insert into rate_hits (student_id, kind) values (p_sid, p_kind);
  if random() < 0.01 then delete from rate_hits where at < now() - interval '2 hours'; end if;
  return true;
end $$;
revoke all on function cbt_private.rate_ok(uuid, text, int) from public, anon, authenticated;

notify pgrst, 'reload schema';
