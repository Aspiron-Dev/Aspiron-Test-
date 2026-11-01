-- Open findings from SECURITY_REVIEW.md that are NOT fixed yet (waiting for the owner's go-ahead).
-- Each check describes the SAFE behaviour, so it FAILS today and must PASS once the finding is fixed;
-- then move it into break_it.sql. CI shows these as a separate, non-blocking step so the open risks stay visible.
\set ON_ERROR_STOP 1
\pset pager off
\t on
\a
set client_min_messages = warning;
create temp table t (n serial, name text, ok boolean, info text);
grant all on t to anon; grant all on sequence t_n_seq to anon;
create function pg_temp.chk(p_name text, p_ok boolean, p_info text default '') returns void language sql as
  $$ insert into t (name, ok, info) values (p_name, coalesce(p_ok, false), coalesce(p_info, '')) $$;
grant execute on function pg_temp.chk(text, boolean, text) to anon;
select set_config('request.headers', '{"x-real-ip":"203.0.113.77"}', false);
-- test database only: start from a clean owner sign-in (break_it.sql turns two-step sign-in on)
delete from cbt_private.admin_totp; delete from cbt_private.admin_fails; delete from cbt_private.settings where key in ('admin_locked_until','team_locked_until');

-- (R1 and R2 are fixed in supabase_v47_alerts_results.sql; their checks moved to break_it.sql, section 17.)
-- Add the next open finding here, written as the safe behaviour.

\t off
\a
select case when ok then 'FIXED' else 'OPEN' end as status, name, info from t order by n;
