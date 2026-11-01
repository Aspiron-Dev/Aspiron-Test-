-- =====================================================================
--  R11 (optional): a READ-ONLY database login for the GitHub backup and the hourly security-alert check,
--  so the GitHub secret no longer holds the full "postgres" login.
--  1. Replace PUT-A-LONG-PASSWORD-HERE below with a new long password (letters and digits only, 24+ characters).
--     Do not reuse the database password. Run this in Supabase → SQL Editor.
--  2. GitHub → Settings → Secrets → Actions → New secret SUPABASE_BACKUP_DB_URL =
--     the same connection string as SUPABASE_DB_URL, with the user changed to  cbt_backup.klvvhbqkhbdzysgpykpr
--     and the password changed to the new one.
--  3. Actions → Database backup → Run workflow, and Actions → Security alerts → Run workflow: both must be green.
--  4. Only then delete the secret SUPABASE_DB_URL (the workflows use SUPABASE_BACKUP_DB_URL when it is set).
--  It can read every table (to back it up) and run only the alert check; it cannot change any data.
--  Safe to run again (it sets the password again). Never commit this file with the real password in it.
-- =====================================================================
do $$
declare pw text := 'PUT-A-LONG-PASSWORD-HERE';
begin
  if pw like 'PUT-%' or length(pw) < 24 or pw !~ '^[A-Za-z0-9]+$' then
    raise exception 'Put a new password (24+ letters and digits) in place of PUT-A-LONG-PASSWORD-HERE first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'cbt_backup') then
    execute format('create role cbt_backup login bypassrls noinherit connection limit 3 password %L', pw);
  else
    execute format('alter role cbt_backup login bypassrls noinherit connection limit 3 password %L', pw);
  end if;
end $$;
-- read everything in the two schemas the backup takes (row-level security is bypassed only to read, for the backup)
grant usage on schema public, cbt_private to cbt_backup;
grant select on all tables in schema public, cbt_private to cbt_backup;
grant select on all sequences in schema public, cbt_private to cbt_backup;
alter default privileges in schema public grant select on tables to cbt_backup;
alter default privileges in schema cbt_private grant select on tables to cbt_backup;
alter default privileges in schema public grant select on sequences to cbt_backup;
alter default privileges in schema cbt_private grant select on sequences to cbt_backup;
-- the hourly alert check (it marks alerts as reported; nothing else)
grant execute on function cbt_private.sec_mail() to cbt_backup;
-- a stuck statement stops after 15 minutes
alter role cbt_backup set statement_timeout = '15min';
-- check: should list cbt_backup with bypassrls = true and no superuser / createrole
select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = 'cbt_backup';
