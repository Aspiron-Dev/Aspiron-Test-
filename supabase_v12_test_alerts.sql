-- =====================================================================
--  v12: Test alerts — student taps 🔔 on a scheduled test, and gets a phone
--  notification automatically the moment that test goes LIVE (even if the app is closed).
--  Needs v10 (push) to be run first, and the send-push Edge Function deployed (it also sends these alerts).
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
-- =====================================================================

create table if not exists public.cbt_test_alerts (
  mobile     text        not null,
  test_id    text        not null,
  title      text        not null default '',
  opens_at   timestamptz not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (mobile, test_id)
);
create index if not exists cbt_test_alerts_due on public.cbt_test_alerts (opens_at) where sent_at is null;
alter table public.cbt_test_alerts enable row level security;   -- no policies: only functions can read/write
revoke all on public.cbt_test_alerts from anon, authenticated;

-- Student turns the alert on/off for one test. Login and the test's start time are taken
-- from the student's own catalog (cbt_catalog), so the time can't be faked.
create or replace function public.cbt_alert_set(p_mobile text, p_code text, p_device text, p_test text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; t jsonb; v_at timestamptz; v_raw text;
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  if not p_on then
    delete from public.cbt_test_alerts where mobile = p_mobile and test_id = p_test;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  select x.value into t from jsonb_array_elements(coalesce(c->'tests', '[]'::jsonb)) as x where x.value->>'id' = p_test limit 1;
  if t is null then return jsonb_build_object('ok', false, 'error', 'test'); end if;
  v_raw := t->>'opens_at';
  if coalesce(v_raw, '') = '' then return jsonb_build_object('ok', false, 'error', 'not_scheduled'); end if;
  v_at := case when v_raw ~ '^[0-9.]+$' then to_timestamp(v_raw::numeric / 1000) else v_raw::timestamptz end;
  if v_at <= now() then return jsonb_build_object('ok', false, 'error', 'already_live'); end if;
  insert into public.cbt_test_alerts (mobile, test_id, title, opens_at)
  values (p_mobile, p_test, left(coalesce(t->>'title', 'Your test'), 120), v_at)
  on conflict (mobile, test_id) do update set title = excluded.title, opens_at = excluded.opens_at, sent_at = null;
  return jsonb_build_object('ok', true, 'on', true, 'opens_at', (extract(epoch from v_at) * 1000)::bigint);
end; $$;
grant execute on function public.cbt_alert_set(text, text, text, text, boolean) to anon, authenticated;

-- Which tests this student has alerts on (so the bell shows filled on every phone)
create or replace function public.cbt_alert_list(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(test_id) from public.cbt_test_alerts
    where mobile = p_mobile and sent_at is null and opens_at > now() - interval '1 day'), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_alert_list(text, text, text) to anon, authenticated;

-- Every minute: ask the send-push Edge Function to send the alerts that are due.
-- (Calling it is harmless: it only sends alerts whose test has already started, once.)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'cbt-test-alerts') then perform cron.unschedule('cbt-test-alerts'); end if;
end $$;
select cron.schedule('cbt-test-alerts', '* * * * *', $job$
  select net.http_post(
    url     := 'https://klvvhbqkhbdzysgpykpr.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3"}'::jsonb,
    body    := '{"mode":"due"}'::jsonb);
$job$);

-- old alerts are cleaned up after a week
delete from public.cbt_test_alerts where opens_at < now() - interval '7 days';

notify pgrst, 'reload schema';
