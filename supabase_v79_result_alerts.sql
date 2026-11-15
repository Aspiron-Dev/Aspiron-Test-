-- =====================================================================
--  v79: "Your result is out" notification
--
--  A student who submitted a live test and is waiting for its result taps 🔔 on the "Waiting for result" card
--  (Test history). When the result time comes, the phone gets "Result is out: <test>" even if the app is closed.
--
--  • Its own table (cbt_result_alerts) and its own claim / release functions. The "test is LIVE now" alerts
--    (cbt_test_alerts, cbt_alerts_claim) are not touched.
--  • The result time is read from the test when the alert is sent (not copied when the bell is tapped), so if the admin
--    moves "Result & answer key at", no notification goes out while the result is still hidden.
--  • Sent by the same minute job (pg_cron + send-push, v22 / v36): no new job and no new cost. It needs the send-push
--    Edge Function of this version (mode "info" returns v: 3): run this file, THEN redeploy send-push (Verify JWT off).
--
--  Run ONCE in Supabase → SQL Editor after v78. Safe to run again. Nothing else changes.
-- =====================================================================

create table if not exists public.cbt_result_alerts (
  mobile     text        not null,
  test_id    text        not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  primary key (mobile, test_id)
);
create index if not exists cbt_result_alerts_due on public.cbt_result_alerts (test_id) where sent_at is null;
alter table public.cbt_result_alerts enable row level security;   -- no policies: only the functions below read or write it
revoke all on public.cbt_result_alerts from public, anon, authenticated;

-- ---------- student: bell on / off for one test ----------
create or replace function public.cbt_result_alert_set(p_mobile text, p_code text, p_device text, p_test text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; sid uuid; x record; ra bigint; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if coalesce(p_test, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'test');
  end if;
  if not p_on then
    delete from public.cbt_result_alerts where mobile = v_m and test_id = p_test;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  if not rate_ok(sid, 'ralert', 60) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  select tt.* into x from tests tt where tt.id = p_test::uuid;
  if not found then return jsonb_build_object('ok', false, 'error', 'test'); end if;
  if x.practice then return jsonb_build_object('ok', false, 'error', 'practice'); end if;
  if not exists (select 1 from results r where r.student_id = sid and r.test_id = x.id) then
    return jsonb_build_object('ok', false, 'error', 'not_attempted');
  end if;
  ra := coalesce(x.result_at, x.closes_at);
  if ra is null or ra <= now_ms() then return jsonb_build_object('ok', false, 'error', 'already'); end if;
  insert into public.cbt_result_alerts (mobile, test_id) values (v_m, p_test)
  on conflict (mobile, test_id) do update set sent_at = null;
  return jsonb_build_object('ok', true, 'on', true, 'result_at', ra);
end $$;
revoke all on function public.cbt_result_alert_set(text, text, text, text, boolean) from public, authenticated;
grant execute on function public.cbt_result_alert_set(text, text, text, text, boolean) to anon;

-- ---------- student: which tests have the bell on (not sent yet, result still ahead) ----------
create or replace function public.cbt_result_alerts_mine(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  return jsonb_build_object('ok', true, 'ids', coalesce((
    select jsonb_agg(r.test_id) from public.cbt_result_alerts r join tests t on t.id::text = r.test_id
     where r.mobile = v_m and r.sent_at is null and coalesce(t.result_at, t.closes_at) > now_ms()), '[]'::jsonb));
end $$;
revoke all on function public.cbt_result_alerts_mine(text, text, text) from public, authenticated;
grant execute on function public.cbt_result_alerts_mine(text, text, text) to anon;

-- ---------- minute job (send-push, service role only) ----------
-- alerts whose test now has its result out (within the last 6 hours), taken a few at a time: several workers can run together
-- without sending twice. The time is read from the test here, so a moved result time is respected.
create or replace function public.cbt_result_alerts_claim(p_limit int default 100)
returns table (mobile text, test_id text, title text)
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.cbt_result_alerts
   where (sent_at is not null and sent_at < now() - interval '7 days') or (sent_at is null and created_at < now() - interval '14 days');
  update public.cbt_result_alerts a set sent_at = now()
   where (a.mobile, a.test_id) in (
           select b.mobile, b.test_id from public.cbt_result_alerts b
             join cbt_private.tests t on t.id::text = b.test_id
            where b.sent_at is null and not t.practice
              and coalesce(t.result_at, t.closes_at) <= cbt_private.now_ms()
              and coalesce(t.result_at, t.closes_at) >= cbt_private.now_ms() - 21600000
            order by coalesce(t.result_at, t.closes_at)
            limit least(greatest(coalesce(p_limit, 100), 1), 300)
            for update of b skip locked)
  returning a.mobile, a.test_id, (select left(tt.title, 120) from cbt_private.tests tt where tt.id::text = a.test_id)
$$;
revoke all on function public.cbt_result_alerts_claim(int) from public, anon, authenticated;
grant execute on function public.cbt_result_alerts_claim(int) to service_role;

-- an alert that could not be delivered for a passing reason is given back (for up to 30 minutes after it was sent)
create or replace function public.cbt_result_alerts_release(p_mobile text, p_test text)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  update public.cbt_result_alerts set sent_at = null
   where mobile = p_mobile and test_id = p_test and sent_at is not null and sent_at > now() - interval '30 minutes'
$$;
revoke all on function public.cbt_result_alerts_release(text, text) from public, anon, authenticated;
grant execute on function public.cbt_result_alerts_release(text, text) to service_role;

notify pgrst, 'reload schema';
