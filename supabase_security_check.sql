-- =====================================================================
--  READ-ONLY security check. It changes NOTHING: every block is a SELECT.
--  Run in Supabase → SQL Editor → New query. Run ONE numbered block at a time, then send the output.
--  Do not paste the admin password, the publishable/service keys or any password hash here.
-- =====================================================================

-- 1) Tables in public WITHOUT row level security (anyone with the public key could read or write them)
select c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by 1;

-- 2) Table permissions given to anon / authenticated (private tables should not appear here)
select grantee, table_schema, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated') and table_schema in ('public', 'cbt_private')
group by 1, 2, 3
order by 3;

-- 3) Every function anon / authenticated can run, and whether it runs with the owner's rights (security definer)
select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, p.proconfig as settings
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'cbt_private')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 2;

-- 4) Security definer functions WITHOUT a fixed search_path (can be hijacked by a malicious schema)
select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'cbt_private') and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) s where s like 'search_path=%')
order by 2;

-- 5) Can anon reach the private schema or its student table directly?
select has_schema_privilege('anon', 'cbt_private', 'USAGE') as anon_can_use_private_schema,
       has_table_privilege('anon', 'cbt_private.students', 'SELECT') as anon_can_read_students;

-- 6) Views (a view runs with its owner's rights unless options contain security_invoker=true)
select n.nspname as schema_name, c.relname as view_name, coalesce(array_to_string(c.reloptions, ', '), '') as options
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'cbt_private') and c.relkind = 'v'
order by 2;

-- 7) Storage buckets and whether they are public (anyone with the link can read a public bucket)
select id, name, public from storage.buckets;

-- 8) Which important functions exist, and where (names only, no code)
select n.nspname as schema_name, p.proname as function_name, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'cbt_private')
  and p.proname in ('cbt_admin', 'auth', 'check_code', 'norm_mobile', 'hash_code', 'cbt_notice', 'cbt_catalog',
                    'cbt_start', 'cbt_submit', 'cbt_file_part', 'cbt_leaderboard', 'cbt_login', 'cbt_request_access',
                    'cbt_report', 'cbt_suspension')
order by 2;

-- 9) Columns that hold personal data or credentials (checks that access codes are stored hashed)
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema in ('public', 'cbt_private')
  and column_name ~* '(mobile|phone|name|code|password|secret|token|salt|hash|utr|payer|email|photo)'
order by 1, 2, 3;

-- 10) The code of the base functions that are NOT in this repository (admin check, login, tests, files, reports).
--     Send this output too, so they can be checked. If your real admin password is written anywhere in it,
--     do NOT send it: that alone is a problem to fix first.
select n.nspname as schema_name, p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'cbt_private') and p.prokind = 'f'
  and p.proname in ('cbt_admin', 'set_admin_password', 'auth', 'hash_code', 'cbt_login', 'cbt_request_access', 'cbt_catalog',
                    'cbt_start', 'cbt_submit', 'cbt_file_part', 'cbt_notice', 'cbt_notice__base', 'cbt_notice_img', 'cbt_leaderboard', 'cbt_report',
                    'cbt_bookmark', 'cbt_review', 'cbt_cover', 'cbt_overall', 'cbt_insights', 'cbt_mistakes')
order by 2;
