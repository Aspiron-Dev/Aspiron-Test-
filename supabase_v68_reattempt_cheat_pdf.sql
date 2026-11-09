-- =====================================================================
--  v68: Re-attempt fix + "too fast, full marks" cheating alerts + answer-key PDF only after the result
--
--  1) RE-ATTEMPT FIX (cbt_start)
--     Live day: one attempt only, no second start until the result & answer key time (unchanged).
--     After the result time: the test opens again and can be re-attempted ANY number of times.
--     Re-attempts never change the live result or rank: the rank uses only the first attempt (unchanged).
--     Bug fixed: a test with "Live ends" set but NO "Result & answer key at" time stayed "Closed" for ever,
--     so nobody could re-attempt it. Now its result time is "Live ends" and it opens again right then.
--
--  2) CHEATING ALERTS (Admin → Integrity → "Suspicious attempts", and the admin home "needs attention" list)
--     A FIRST attempt is suspicious when it scored 90 % or more AND took 6 minutes or less AND less than half
--     the test's time. Re-attempts are never flagged (the answer key is already out by then).
--     The admin can tag it as cheating (🚩, as before) or mark it "Looks fine" (it leaves the list).
--
--  3) ANSWER KEY PDF (Google Drive link, same admin box as v51: Test studio → ⋯ → "PDF notes link")
--     For a live test the link is given to students only after its result time, so the answer key cannot
--     leak while the test is live. Practice tests / tests without times: shown at once (as before).
--
--  Run in Supabase → SQL Editor after v67, THEN run supabase_v35_admin_team.sql again.  Safe to run again.
--  Costs nothing: no new cron, no extension, no storage (PDFs stay in Google Drive).
-- =====================================================================

-- ---------- 1) cbt_start (from v48, one condition changed) ----------
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
  -- v68: with only "Live ends" set (no result time), the result comes at "Live ends", so the test opens again
  --      right then. Before v68 such a test stayed closed for ever and nobody could re-attempt it.
  if x.closes_at is not null and x.result_at is not null and t > x.closes_at and t < x.result_at
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

-- ---------- 2) suspicious attempts ----------
create table if not exists cbt_private.suspect_ok (
  result_id text primary key,
  at        timestamptz not null default now()
);
alter table cbt_private.suspect_ok enable row level security;
revoke all on cbt_private.suspect_ok from public, anon, authenticated;

-- the rule, in one place: first attempt, >= 90 %, <= 6 minutes and < half the test's time
create or replace function cbt_private.suspect_rows(p_days int)
returns table (result_id text, student_id uuid, test_id text, title text, score numeric, max_score numeric,
               used_seconds int, duration int, at timestamptz)
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select r.id::text, r.student_id, r.test_id::text, coalesce(r.test_title, t.title), r.score, r.max_score,
         r.used_seconds, t.duration, r.created_at
    from results r
    join tests t on t.id = r.test_id
   where r.created_at > now() - make_interval(days => greatest(1, least(90, p_days)))
     and coalesce(r.max_score, 0) > 0 and r.score >= 0.9 * r.max_score
     and coalesce(r.used_seconds, 0) <= 360
     and coalesce(r.used_seconds, 0) * 2 < t.duration * 60
     and not exists (select 1 from results f where f.student_id = r.student_id and f.test_id = r.test_id
                       and (f.created_at, f.id::text) < (r.created_at, r.id::text))
     and not exists (select 1 from suspect_ok o where o.result_id = r.id::text)
$$;
revoke all on function cbt_private.suspect_rows(int) from public, anon, authenticated;

-- actions: count | get {days?} | ok {result_id}  (permission: integrity — see admin_need in v35)
create or replace function public.cbt_admin_suspects(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_days int := coalesce(nullif(d->>'days', '')::int, 30);
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;

  if p_action = 'count' then
    return jsonb_build_object('ok', true, 'count', (select count(*) from suspect_rows(7) s
      where not exists (select 1 from public.cbt_cheat_flags f where f.student_id = s.student_id and f.test_id = s.test_id)));
  elsif p_action = 'get' then
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.result_id, 'test_id', s.test_id, 'title', s.title, 'score', s.score, 'max', s.max_score,
        'used', s.used_seconds, 'duration', s.duration, 'at', (extract(epoch from s.at) * 1000)::bigint,
        'name', st.name, 'mobile', st.mobile,
        'flagged', exists (select 1 from public.cbt_cheat_flags f where f.student_id = s.student_id and f.test_id = s.test_id))
        order by s.at desc)
      from (select * from suspect_rows(v_days) limit 300) s join students st on st.id = s.student_id), '[]'::jsonb));
  elsif p_action = 'ok' then
    if not exists (select 1 from results where id::text = d->>'result_id') then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    insert into suspect_ok (result_id) values (d->>'result_id') on conflict do nothing;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_suspects(text, text, jsonb) to anon, authenticated;


-- ---------- 3) student PDF links: a live test's answer key only after its result time ----------
create or replace function public.cbt_test_pdfs(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; t bigint := cbt_private.now_ms();
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_object_agg(p.test_id, jsonb_build_object('url', p.url, 'label', p.label))
      from cbt_private.test_pdfs p
      join jsonb_array_elements(coalesce(c->'tests', '[]'::jsonb)) x on x.value->>'id' = p.test_id
      join cbt_private.tests tt on tt.id::text = p.test_id
     where coalesce((x.value->>'locked')::boolean, false) is not true
       and (tt.practice or coalesce(tt.result_at, tt.closes_at) is null or coalesce(tt.result_at, tt.closes_at) <= t)), '{}'::jsonb));
end $$;
grant execute on function public.cbt_test_pdfs(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
