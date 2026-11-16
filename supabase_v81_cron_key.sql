-- =====================================================================
--  v81: the minute job proves itself to send-push (security review F-05)
--  Until now anyone could call send-push with {"mode":"due"} (no password) and make it run the alert sending and its
--  database calls. Now the minute job also sends a secret header "x-cron-key". send-push checks it only when its own
--  secret CRON_KEY is set, so nothing breaks in between. Other callers then get 401 before any work is done.
--  Note: a refused call still counts as one Edge Function invocation; stopping floods of calls needs a rate limit in
--  front (e.g. Cloudflare), which this file does not add.
--  Steps (in this order):
--    1. Supabase → SQL Editor: run this file (safe to run again; the key is made once and kept).
--    2. SQL Editor: select value from cbt_private.settings where key = 'cron_key';   → copy the value.
--    3. Supabase → Edge Functions → Secrets: add CRON_KEY = that value. Then redeploy send-push (Verify JWT off).
--    4. Check (a few minutes later): select status_code, count(*) from net._http_response
--         where created > now() - interval '10 minutes' group by 1;   → only 200 (a 401 means CRON_KEY ≠ cron_key).
--  If supabase_v12 / v22 / v36 is run again later, the job keeps the header only with the v36 of this change.
--  The key lives only in cbt_private.settings (never readable from the website) and in the function's secrets.
--  To change it: update cbt_private.settings set value = encode(cbt_private.adm_rand(24), 'hex') where key = 'cron_key';
--  then put the new value in CRON_KEY again. Run after v80 (needs v35 for adm_rand).
-- =====================================================================

insert into cbt_private.settings (key, value) values ('cron_key', encode(cbt_private.adm_rand(24), 'hex'))
  on conflict (key) do nothing;

-- the same minute job as supabase_v36_notice_audience.sql (4 workers), plus the x-cron-key header, read at run time
do $$ begin
  if exists (select 1 from cron.job where jobname = 'cbt-test-alerts') then perform cron.unschedule('cbt-test-alerts'); end if;
end $$;
select cron.schedule('cbt-test-alerts', '* * * * *', $job$
  select net.http_post(
    url     := 'https://klvvhbqkhbdzysgpykpr.supabase.co/functions/v1/Send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3',
                                  'x-cron-key', coalesce((select value from cbt_private.settings where key = 'cron_key'), '')),
    body    := ('{"mode":"due","w":' || w || '}')::jsonb)
  from generate_series(1, 4) as w;
$job$);

select 'v81 installed: now copy cron_key into the Edge Function secret CRON_KEY and redeploy send-push' as status;
