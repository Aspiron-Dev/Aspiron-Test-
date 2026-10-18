-- =====================================================================
--  v22: 🔔 "test is LIVE now" alerts are sent by the send-push function
--  (the same one that already sends announcements), so no extra function is needed.
--  FIRST deploy the new supabase/functions/send-push/index.ts, THEN run this.
--  Run in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'cbt-test-alerts') then perform cron.unschedule('cbt-test-alerts'); end if;
end $$;
-- every minute; the apikey is the public (publishable) key from config.js, same as the website uses
select cron.schedule('cbt-test-alerts', '* * * * *', $job$
  select net.http_post(
    url     := 'https://klvvhbqkhbdzysgpykpr.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3"}'::jsonb,
    body    := '{"mode":"due"}'::jsonb);
$job$);

-- check after 2 minutes: status_code should be 200 and content like {"ok":true,...}
-- select status_code, content, created from net._http_response order by created desc limit 5;
