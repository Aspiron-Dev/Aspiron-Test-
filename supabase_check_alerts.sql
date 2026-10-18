-- =====================================================================
--  CHECK: why is the "test is LIVE" notification not arriving?
--  Supabase → SQL Editor → New query → paste → Run. It only READS, it changes nothing.
--  Send a screenshot of the result table.
-- =====================================================================
select 'Phones with notifications ON' as "check", count(*)::text as "result" from public.cbt_push_subs
union all select 'Bell pressed, test not live yet', count(*)::text from public.cbt_test_alerts where sent_at is null and opens_at > now()
union all select 'Alerts already sent', count(*)::text from public.cbt_test_alerts where sent_at is not null
union all select 'Missed (time passed, not sent)', count(*)::text from public.cbt_test_alerts where sent_at is null and opens_at <= now()
union all select 'Every-minute job exists', (select count(*) from cron.job where jobname = 'cbt-test-alerts')::text
union all select 'Last job run', coalesce((select d.status || ' at ' || to_char(d.start_time, 'DD Mon HH24:MI') || ' ' || coalesce(left(d.return_message, 80), '')
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'cbt-test-alerts' order by d.start_time desc limit 1), 'never ran')
union all select 'Last reply from send-push (alerts)', coalesce((select coalesce(status_code::text, 'no reply') || ' ' || coalesce(left(content, 150), '') || coalesce(' ' || error_msg, '')
    from net._http_response order by created desc limit 1), 'none yet');
