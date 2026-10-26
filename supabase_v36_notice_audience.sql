-- =====================================================================
--  v36: Notices & phone notifications by TEST SERIES (segments), "Haan, padh liya" read marks,
--       and safer sending of phone notifications.
--
--  What it does
--  • A notice (or a phone notification) can be meant for "Everyone" or only for the students of chosen test series
--    (e.g. only Biology Test Series). A student belongs to a series when the series is free or when the student has
--    access to it (the same rule the app uses to unlock a series). Nothing is copied: when a student gets a series
--    (or loses it) they join (or leave) that group by themselves, so old notices follow the same rule.
--  • The student's notice list (cbt_notice) now hides the notices that are not meant for that student. This is checked
--    here in the database, so an old copy of the app cannot show them either.
--  • Students can mark a notice "Haan, padh liya" (read). The admin sees how many students read each notice.
--  • Phone notifications are sent in small batches (the Edge Function would otherwise be stopped part-way when many
--    students are registered), only to students who are still approved, and only to the chosen series.
--  • "Test is LIVE" alerts are claimed in small batches too, and the minute job runs several workers at once.
--
--  Run in Supabase → SQL Editor after v35. Safe to run again.
--  THEN: (1) run supabase_v35_admin_team.sql AGAIN (it gives the new cbt_admin_ann_aud function its permission check),
--        (2) deploy the new supabase/functions/send-push/index.ts (with "Verify JWT" off, as before).
--  If a later SQL file re-creates public.cbt_notice (for example the base setup), run this file again.
-- =====================================================================

-- ---------- tables ----------
-- who a notice is meant for; no row = everyone
create table if not exists cbt_private.ann_audience (
  ann_id     text primary key,
  series     uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
-- which student marked which notice as read
create table if not exists cbt_private.ann_reads (
  ann_id     text not null,
  student_id uuid not null,
  read_at    timestamptz not null default now(),
  primary key (ann_id, student_id)
);
create index if not exists ann_reads_student on cbt_private.ann_reads (student_id);
alter table cbt_private.ann_audience enable row level security;
alter table cbt_private.ann_reads enable row level security;
revoke all on cbt_private.ann_audience, cbt_private.ann_reads from public, anon, authenticated;

-- ---------- the one rule: is this student in the group of these series? ----------
-- (no series = everyone; a free series = everyone; otherwise the student must have been given access to one of them)
create or replace function cbt_private.in_any_series(p_student uuid, p_series uuid[])
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select coalesce(cardinality(p_series), 0) = 0
      or exists (select 1 from series sr where sr.id = any(p_series) and sr.is_free)
      or exists (select 1 from series_access ac where ac.student_id = p_student and ac.series_id = any(p_series))
$$;
revoke all on function cbt_private.in_any_series(uuid, uuid[]) from public, anon, authenticated;

-- may this student see this notice?
create or replace function cbt_private.ann_visible(p_ann text, p_student uuid)
returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select coalesce((select cbt_private.in_any_series(p_student, a.series) from ann_audience a where a.ann_id = p_ann), true)
$$;
revoke all on function cbt_private.ann_visible(text, uuid) from public, anon, authenticated;

-- ---------- student side: cbt_notice shows only their notices, with read marks ----------
-- The original function is moved to cbt_private.cbt_notice__base and a wrapper with the same name and arguments takes its place
-- (the same way v35 does it for the cbt_admin… functions). Functions that use cbt_notice only to check the login keep working.
do $do$
declare f record; v_cast text; v_names text[];
begin
  select p.oid, pg_get_function_arguments(p.oid) as args, format_type(p.prorettype, null) as ret,
         pg_get_functiondef(p.oid) as def, p.proargnames as names
    into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cbt_notice' and p.pronargs = 3;
  if not found then
    raise exception 'public.cbt_notice(text, text, text) was not found. Run the base setup first.';
  end if;
  v_names := f.names;
  if v_names is null or array_length(v_names, 1) <> 3 then
    raise exception 'public.cbt_notice has unnamed arguments; cannot wrap it.';
  end if;
  if f.def not like '%cbt-notice-v36%' then
    -- the real function is moved out of public
    execute 'drop function if exists cbt_private.cbt_notice__base(text, text, text)';
    execute 'alter function public.cbt_notice(text, text, text) set schema cbt_private';
    execute 'alter function cbt_private.cbt_notice(text, text, text) rename to cbt_notice__base';
    execute 'revoke all on function cbt_private.cbt_notice__base(text, text, text) from public, anon, authenticated';
  else
    -- already wrapped: only the wrapper is made again (below)
    execute 'drop function public.cbt_notice(text, text, text)';
  end if;
  v_cast := case when f.ret = 'json' then 'json' else 'jsonb' end;
  -- %1$s arguments  %2$s return type  %3$s json/jsonb  %4$I %5$I %6$I the three argument names
  execute format($f$
    create function public.cbt_notice(%1$s) returns %2$s language plpgsql security definer set search_path = cbt_private, pg_temp as $w$
    declare r jsonb; sid uuid; v_items jsonb;
    begin
      -- cbt-notice-v36: the original answer, then only the notices meant for this student, each with its read mark
      r := cbt_private.cbt_notice__base(%4$I, %5$I, %6$I)::text::jsonb;
      if coalesce((r->>'ok')::boolean, false) is not true or jsonb_typeof(r->'items') is distinct from 'array' then
        return r::text::%3$s;
      end if;
      begin
        select id into sid from cbt_private.students where mobile = cbt_private.norm_mobile(%4$I);
        if sid is null then return r::text::%3$s; end if;
        select coalesce(jsonb_agg(x.i || jsonb_build_object('read', rd.read_at is not null,
                                                            'read_at', (extract(epoch from rd.read_at) * 1000)::bigint) order by x.n), '[]'::jsonb)
          into v_items
          from jsonb_array_elements(r->'items') with ordinality as x(i, n)
          left join cbt_private.ann_reads rd on rd.ann_id = x.i->>'id' and rd.student_id = sid
         where cbt_private.ann_visible(x.i->>'id', sid);
        r := jsonb_set(r, '{items}', v_items);
      exception when others then
        -- never take the notices away because of a problem here: show the original list
        raise warning 'cbt_notice filter failed: %%', sqlerrm;
        r := cbt_private.cbt_notice__base(%4$I, %5$I, %6$I)::text::jsonb;
      end;
      return r::text::%3$s;
    end $w$ $f$, f.args, f.ret, v_cast, v_names[1], v_names[2], v_names[3]);
  execute 'grant execute on function public.cbt_notice(text, text, text) to anon, authenticated';
end $do$;

-- student: "Haan, padh liya"  (p_id = the notice id, or 'all' for every notice they can see)
create or replace function public.cbt_ann_read(p_mobile text, p_code text, p_device text, p_id text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare r jsonb; sid uuid; v_id text := left(coalesce(p_id, ''), 80); n int := 0;
begin
  -- login check + the notices this student is allowed to see
  r := public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device)::text::jsonb;
  if coalesce((r->>'ok')::boolean, false) is not true then return r; end if;
  select id into sid from cbt_private.students where mobile = cbt_private.norm_mobile(p_mobile);
  if sid is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v_id = 'all' then
    if not coalesce(p_on, true) then return jsonb_build_object('ok', false, 'error', 'notice'); end if;
    insert into cbt_private.ann_reads (ann_id, student_id)
    select x->>'id', sid from jsonb_array_elements(coalesce(r->'items', '[]'::jsonb)) x where coalesce(x->>'id', '') <> ''
    on conflict do nothing;
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'read', true, 'count', n, 'at', (extract(epoch from now()) * 1000)::bigint);
  end if;
  if v_id = '' or not exists (select 1 from jsonb_array_elements(coalesce(r->'items', '[]'::jsonb)) x where x->>'id' = v_id) then
    return jsonb_build_object('ok', false, 'error', 'notice');
  end if;
  if coalesce(p_on, true) then
    insert into cbt_private.ann_reads (ann_id, student_id) values (v_id, sid) on conflict do nothing;
  else
    delete from cbt_private.ann_reads where ann_id = v_id and student_id = sid;
  end if;
  return jsonb_build_object('ok', true, 'read', coalesce(p_on, true), 'at', (extract(epoch from now()) * 1000)::bigint);
end $$;
grant execute on function public.cbt_ann_read(text, text, text, text, boolean) to anon, authenticated;

-- ---------- student side: keep this phone's notification address up to date ----------
-- (1) the phone's push address changed on its own (browsers do this now and then). The old address is the proof:
--     only the phone that had it can send it, so no password is needed. The new address replaces it for the same student.
create or replace function public.cbt_push_rotate(p_old text, p_sub jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text := left(coalesce(p_old, ''), 1000); v_ep text := left(coalesce(p_sub->>'endpoint', ''), 1000); m text;
begin
  if v_old !~ '^https://' or v_ep !~ '^https://'
     or coalesce(p_sub#>>'{keys,p256dh}', '') = '' or coalesce(p_sub#>>'{keys,auth}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  select mobile into m from public.cbt_push_subs where endpoint = v_old;
  if m is null then return jsonb_build_object('ok', false, 'error', 'unknown'); end if;
  insert into public.cbt_push_subs (endpoint, mobile, p256dh, auth)
  values (v_ep, m, left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100))
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now();
  if v_old <> v_ep then delete from public.cbt_push_subs where endpoint = v_old; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_push_rotate(text, jsonb) to anon, authenticated;

-- (2) is this phone still registered? (the app asks now and then and registers again when the answer is no)
create or replace function public.cbt_push_has(p_mobile text, p_code text, p_device text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb;
begin
  a := public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device)::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'has', exists (select 1 from public.cbt_push_subs
    where endpoint = left(coalesce(p_endpoint, ''), 1000) and mobile = p_mobile));
end $$;
grant execute on function public.cbt_push_has(text, text, text, text) to anon, authenticated;

-- ---------- server side (Edge Function send-push only; the service role) ----------
-- the phones to notify: still-approved students, and (when series are given) only those in one of the series.
-- Read in pages, in endpoint order, so the sender can work through any number of phones in small steps.
create or replace function public.cbt_push_targets(p_series uuid[] default null, p_after text default '', p_limit int default 120)
returns table (endpoint text, p256dh text, auth text, mobile text)
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select s.endpoint, s.p256dh, s.auth, s.mobile
    from public.cbt_push_subs s
   where s.endpoint > coalesce(p_after, '')
     and exists (select 1 from cbt_private.students st
                  where st.mobile = cbt_private.norm_mobile(s.mobile) and st.status = 'approved'
                    and cbt_private.in_any_series(st.id, p_series))
   order by s.endpoint
   limit least(greatest(coalesce(p_limit, 120), 1), 500)
$$;
revoke all on function public.cbt_push_targets(uuid[], text, int) from public, anon, authenticated;
grant execute on function public.cbt_push_targets(uuid[], text, int) to service_role;

-- "test is LIVE" alerts that are due: claimed a few at a time (several workers may run together without sending twice)
create or replace function public.cbt_alerts_claim(p_limit int default 100)
returns table (mobile text, test_id text, title text, opens_at timestamptz)
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.cbt_test_alerts a set sent_at = now()
   where (a.mobile, a.test_id) in (
           select b.mobile, b.test_id from public.cbt_test_alerts b
            where b.sent_at is null and b.opens_at <= now() and b.opens_at >= now() - interval '6 hours'
            order by b.opens_at
            limit least(greatest(coalesce(p_limit, 100), 1), 300)
            for update skip locked)
  returning a.mobile, a.test_id, a.title, a.opens_at
$$;
revoke all on function public.cbt_alerts_claim(int) from public, anon, authenticated;
grant execute on function public.cbt_alerts_claim(int) to service_role;

-- an alert whose notification could not be delivered for a passing reason is given back, to be tried again in the next minute
create or replace function public.cbt_alerts_release(p_mobile text, p_test text)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  update public.cbt_test_alerts set sent_at = null
   where mobile = p_mobile and test_id = p_test and opens_at > now() - interval '30 minutes'
$$;
revoke all on function public.cbt_alerts_release(text, text) from public, anon, authenticated;
grant execute on function public.cbt_alerts_release(text, text) to service_role;

-- ---------- admin side ----------
-- actions: get | preview | set | readers | forget
create or replace function public.cbt_admin_ann_aud(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); v_id text; v_ser uuid[]; v_n int; v_ph int;
  v_tot int; v_ps int; v_pp int; v_list jsonb;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  -- the series ids sent by the panel (only real ones, at most 40)
  if jsonb_typeof(d->'series') = 'array' then
    select coalesce(array_agg(sr.id), '{}') into v_ser
      from series sr where sr.id::text in (select jsonb_array_elements_text(d->'series') limit 40);
  else
    v_ser := '{}';
  end if;

  if p_action = 'get' then
    if random() < 0.02 then
      delete from ann_reads r where not exists (select 1 from students st where st.id = r.student_id);
    end if;
    select count(*) into v_tot from students where status = 'approved';
    -- ph = one row per registered phone, with the student it belongs to; per series: students and phones (a free series = everyone)
    with ph as materialized (
      select st.id as sid from public.cbt_push_subs p join students st on st.mobile = cbt_private.norm_mobile(p.mobile) and st.status = 'approved'
    )
    select (select count(*) from ph), (select count(distinct sid) from ph),
           coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'free', q.is_free, 'active', q.active,
                'students', case when q.is_free then v_tot
                                 else (select count(*) from series_access ac join students st on st.id = ac.student_id and st.status = 'approved' where ac.series_id = q.id) end,
                'phones', case when q.is_free then (select count(*) from ph)
                               else (select count(*) from ph join series_access ac on ac.student_id = ph.sid where ac.series_id = q.id) end)
                order by q.sort_order, q.created_at) from series q), '[]'::jsonb)
      into v_pp, v_ps, v_list;
    return jsonb_build_object('ok', true, 'students', v_tot, 'push_students', v_ps, 'push_phones', v_pp,
      'audiences', coalesce((select jsonb_object_agg(ann_id, to_jsonb(series)) from ann_audience where cardinality(series) > 0), '{}'::jsonb),
      'reads', coalesce((select jsonb_object_agg(ann_id, n) from (select ann_id, count(*) n from ann_reads group by ann_id) q), '{}'::jsonb),
      'series', v_list);

  elsif p_action = 'preview' then
    select count(*) into v_n from students st where st.status = 'approved' and cbt_private.in_any_series(st.id, v_ser);
    select count(*) into v_ph from public.cbt_push_subs p join students st on st.mobile = cbt_private.norm_mobile(p.mobile) and st.status = 'approved'
     where cbt_private.in_any_series(st.id, v_ser);
    return jsonb_build_object('ok', true, 'students', v_n, 'phones', v_ph);

  elsif p_action = 'set' then
    v_id := left(btrim(coalesce(d->>'id', '')), 80);
    if v_id = '' then return jsonb_build_object('ok', false, 'error', 'id'); end if;
    if jsonb_typeof(d->'series') = 'array' and jsonb_array_length(d->'series') > 0 and cardinality(v_ser) = 0 then
      return jsonb_build_object('ok', false, 'error', 'series');
    end if;
    perform set_config('cbt.detail', left(v_id || case when cardinality(v_ser) = 0 then ' → everyone' else ' → ' || cardinality(v_ser) || ' series' end, 120), true);
    if cardinality(v_ser) = 0 then
      delete from ann_audience where ann_id = v_id;
    else
      insert into ann_audience (ann_id, series) values (v_id, v_ser)
      on conflict (ann_id) do update set series = excluded.series, updated_at = now();
    end if;
    return jsonb_build_object('ok', true, 'series', to_jsonb(v_ser));

  elsif p_action = 'readers' then
    v_id := left(btrim(coalesce(d->>'id', '')), 80);
    select series into v_ser from ann_audience where ann_id = v_id;
    select count(*) into v_n from students st where st.status = 'approved' and cbt_private.in_any_series(st.id, v_ser);
    return jsonb_build_object('ok', true, 'audience', v_n,
      'count', (select count(*) from ann_reads r join students st on st.id = r.student_id where r.ann_id = v_id),
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', q.name, 'mobile', '••••••' || right(q.mobile, 4), 'at', (extract(epoch from q.read_at) * 1000)::bigint) order by q.read_at desc)
                           from (select st.name, st.mobile, r.read_at from ann_reads r join students st on st.id = r.student_id
                                  where r.ann_id = v_id order by r.read_at desc limit 300) q), '[]'::jsonb));

  elsif p_action = 'forget' then
    v_id := left(btrim(coalesce(d->>'id', '')), 80);
    delete from ann_audience where ann_id = v_id;
    delete from ann_reads where ann_id = v_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_ann_aud(text, text, jsonb) to anon, authenticated;

-- ---------- the minute job: "test is LIVE" alerts, now with several workers at once ----------
-- Each worker takes its own small batch (see cbt_alerts_claim), so a test that many students watch is announced in a minute or two.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'cbt-test-alerts') then perform cron.unschedule('cbt-test-alerts'); end if;
end $$;
select cron.schedule('cbt-test-alerts', '* * * * *', $job$
  select net.http_post(
    url     := 'https://klvvhbqkhbdzysgpykpr.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3"}'::jsonb,
    body    := ('{"mode":"due","w":' || w || '}')::jsonb)
  from generate_series(1, 4) as w;
$job$);

notify pgrst, 'reload schema';
