-- Which SQL files are installed? Read only: it changes nothing. Run in Supabase → SQL Editor.
-- Every row is one supabase_v*.sql file and one function that only that file makes.
-- "MISSING" = run that file (in the order shown, top to bottom), then run supabase_v35_admin_team.sql once at the end.
-- one result table (the SQL Editor shows only the last result of a script)
select n, file, status from (
select f.n, f.file, case when to_regproc(f.fn) is not null then 'ok' else 'MISSING — run this file' end as status
from (values
  (1, 'supabase_v52_coupons_refer.sql',        'public.cbt_admin_refer'),
  (2, 'supabase_v53_refer_fixes.sql',          'public.cbt_admin_refer_min'),
  (3, 'supabase_v54_store_map.sql',            'public.cbt_store_map'),
  (4, 'supabase_v55_qbank.sql',                'public.cbt_admin_qbank'),
  (5, 'supabase_v57_social.sql',               'public.cbt_admin_social'),
  (6, 'supabase_v58_wallet_history.sql',       'public.cbt_admin_refer_put'),
  (7, 'supabase_v59_money_month.sql',          'public.cbt_admin_money'),
  (8, 'supabase_v60_coupons_many.sql',         'public.cbt_store_coupons_public'),
  (9, 'supabase_v61_tests_page.sql',           'public.cbt_admin_store_look'),
  (10, 'supabase_v62_admin_guard.sql',         'cbt_private.sec_cat'),
  (11, 'supabase_v63_telegram_alerts.sql',     'public.cbt_admin_telegram'),
  (12, 'supabase_v64_series_page.sql',         'public.cbt_admin_series_meta'),
  (13, 'supabase_v65_auth.sql',                'public.student_signin'),
  (14, 'supabase_v66_tracker_keep.sql',        'cbt_private.keep_trk'),
  (15, 'supabase_v67_test_reviews.sql',        'public.cbt_admin_test_reviews'),
  (16, 'supabase_v68_reattempt_cheat_pdf.sql', 'public.cbt_admin_suspects'),
  (17, 'supabase_v69_test_chapters.sql',       'public.cbt_test_chapters'),
  (18, 'supabase_v70_ops.sql',                 'public.cbt_admin_ops'),
  (19, 'supabase_v72_owner_profile.sql',       'public.cbt_admin_profile'),
  (21, 'supabase_v80_access_check.sql',        'public.cbt_admin_access_check')
  ) as f(n, file, fn)
union all
-- v71 changes an existing function: 'ok' when its text has the new code
select 22, 'supabase_v71_refer_code.sql', case when to_regprocedure('cbt_private.refer_code_for(text,text,text)') is not null
  and pg_get_functiondef(to_regprocedure('cbt_private.refer_code_for(text,text,text)')) like '%''asp''%' then 'ok' else 'MISSING — run this file' end
union all
-- v73 makes no function: 'ok' when its one-time step has run
select 23, 'supabase_v73_contacts.sql', case when exists (select 1 from cbt_private.settings where key = 'contacts_perm_seeded') then 'ok' else 'MISSING — run supabase_v35_admin_team.sql, then this file' end
union all
-- v74 changes existing functions: 'ok' when the email/Google login must type the access code once (review F-02)
select 24, 'supabase_v74_login_code_once.sql', case when to_regprocedure('public.student_signin(text)') is not null
  and pg_get_functiondef(to_regprocedure('public.student_signin(text)')) like '%need_code%' then 'ok' else 'MISSING — run this file' end
union all
-- v82 makes no function: 'ok' when the cron key exists and the minute job sends it (review F-05; then set CRON_KEY in send-push)
select 25, 'supabase_v82_cron_key.sql', case when exists (select 1 from cbt_private.settings where key = 'cron_key')
  and exists (select 1 from cron.job where jobname = 'cbt-test-alerts' and command like '%x-cron-key%') then 'ok' else 'MISSING — run this file' end
union all
-- v81 changes an existing function: 'ok' when submitting a test has the size limits (review V1)
select 26, 'supabase_v81_submit_limits.sql', case when to_regprocedure('public.cbt_submit(text,text,text,uuid,jsonb,text)') is not null
  and pg_get_functiondef(to_regprocedure('public.cbt_submit(text,text,text,uuid,jsonb,text)')) like '%v81: the same limit%' then 'ok' else 'MISSING — run this file' end
union all
-- v83 changes existing functions: 'ok' when both push functions have the owner check (review V2)
select 27, 'supabase_v83_push_owner.sql', case when to_regprocedure('public.cbt_push_save(text,text,text,jsonb,boolean)') is not null
  and to_regprocedure('public.cbt_push_rotate(text,jsonb,text)') is not null
  and pg_get_functiondef(to_regprocedure('public.cbt_push_save(text,text,text,jsonb,boolean)')) like '%v83: a link already saved%'
  and pg_get_functiondef(to_regprocedure('public.cbt_push_rotate(text,jsonb,text)')) like '%v83: a link already saved for another%' then 'ok' else 'MISSING — run this file' end
union all
-- v84 makes no function: 'ok' when all 12 database rules are there; a lower number means some were skipped (see the file)
select 28, 'supabase_v84_table_checks.sql', case (select count(*) from pg_constraint where conname like 'v84\_%' and connamespace = 'cbt_private'::regnamespace)
  when 12 then 'ok' when 0 then 'MISSING — run this file'
  else 'PARTLY — ' || (select count(*) from pg_constraint where conname like 'v84\_%' and connamespace = 'cbt_private'::regnamespace) || ' of 12 rules; run the file again and read its table' end
union all
select 29, 'supabase_v85_resource_folders.sql', case when exists (select 1 from information_schema.columns where table_schema = 'cbt_private' and table_name = 'series_meta' and column_name = 'res_order')
  and exists (select 1 from information_schema.columns where table_schema = 'cbt_private' and table_name = 'test_pdfs' and column_name = 'folder')
  and to_regprocedure('cbt_private.cbt_admin_files__core(text,text,jsonb)') is not null
  and pg_get_functiondef(to_regprocedure('cbt_private.cbt_admin_files__core(text,text,jsonb)')) like '%''order''%' then 'ok'
  when exists (select 1 from information_schema.columns where table_schema = 'cbt_private' and table_name = 'series_meta' and column_name = 'res_order')
  then 'run supabase_v35_admin_team.sql again' else 'MISSING — run this file' end
) x
order by n;
