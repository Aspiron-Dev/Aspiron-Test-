-- Test-only stand-ins for the parts of Supabase that a plain PostgreSQL does not have (roles, pg_cron, pg_net).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists cron; create schema if not exists net;
create table if not exists cron.job(jobid serial, jobname text, schedule text, command text);
create or replace function cron.schedule(n text, s text, c text) returns int language sql as $$ insert into cron.job(jobname,schedule,command) values(n,s,c) returning jobid $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
-- pg_net stand-in: every request is written to net.test_log (tests read it); responses can be put in net._http_response
create table if not exists net.test_log (id bigserial primary key, method text, url text, body jsonb, at timestamptz default now());
create table if not exists net._http_response (id bigint primary key, status_code int, content text, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ insert into net.test_log (method, url, body) values ('POST', url, body) returning id $$;
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ insert into net.test_log (method, url) values ('GET', url) returning id $$;
-- Supabase Auth stand-in: auth.users and auth.uid() (reads the "sub" of the request's JWT, like Supabase)
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
  banned_until timestamptz, deleted_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;

-- Supabase Storage (v70 reads file sizes from it)
create schema if not exists storage;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  metadata jsonb, created_at timestamptz default now());
