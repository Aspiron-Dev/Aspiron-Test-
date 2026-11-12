-- Which SQL files are installed? Read only: it changes nothing. Run in Supabase → SQL Editor.
-- Every row is one supabase_v*.sql file and one function that only that file makes.
-- "MISSING" = run that file (in the order shown, top to bottom), then run supabase_v35_admin_team.sql once at the end.
select f.file, case when to_regproc(f.fn) is not null then 'ok' else 'MISSING — run this file' end as status
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
  (18, 'supabase_v70_ops.sql',                 'public.cbt_admin_ops')
) as f(n, file, fn) order by f.n;
-- v71 changes an existing function: 'ok' when its text has the new code
select 'supabase_v71_refer_code.sql' as file, case when pg_get_functiondef('cbt_private.refer_code_for(text,text,text)'::regprocedure) like '%''asp''%' then 'ok' else 'MISSING — run this file' end as status;
