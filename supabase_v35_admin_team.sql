-- =====================================================================
--  v35: Admin team, sign-in sessions and permissions (for the new admin panel)
--
--  • The owner (the admin password) can add team members with their own username + password and choose,
--    module by module, what each one may do: no access / view only / full access.
--  • Every sign-in to the admin panel is a session: the owner sees where the panel is signed in
--    (device, browser, approximate IP, last active) and can sign out any session, or everyone.
--  • Every change made from the panel is written to an activity log (who, what, when, done or refused).
--  • Permissions are checked HERE in the database on every request, not only hidden in the panel.
--
--  How it works: every public.cbt_admin… function is moved to cbt_private.<name>__core and a small wrapper with
--  the same name and arguments takes its place. The wrapper notes which function/action is being called, runs
--  the real function (which checks the password/session in cbt_private.admin_ok as before) and logs the change.
--  The old admin password keeps working exactly as before (it is the owner).
--
--  Run in Supabase → SQL Editor after v34. Safe to run again.
--  RUN IT AGAIN whenever another SQL file (re)creates a cbt_admin… function (for example after re-running
--  v30_result_time): until then team members cannot use that part; the owner's password always works.
--  v34 (re-run) keeps sessions working: its admin_ok hands session tokens to the v35 check.
-- =====================================================================

create table if not exists cbt_private.admin_users (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  username     text not null unique,
  salt         text not null,
  pw_hash      text not null,
  perms        jsonb not null default '{}'::jsonb,     -- {"students":"view","content":"manage",…}
  active       boolean not null default true,
  note         text not null default '',
  fail_count   int not null default 0,
  locked_until bigint not null default 0,
  created_at   timestamptz not null default now(),
  last_login   timestamptz
);
create table if not exists cbt_private.admin_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references cbt_private.admin_users(id) on delete cascade,   -- null = the owner
  token_hash  text not null,
  device      text not null default '',
  ua          text not null default '',
  ip          text not null default '',          -- shortened, e.g. 49.36.•.•
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked_at  timestamptz,
  revoked_by  text
);
create index if not exists admin_sessions_user on cbt_private.admin_sessions (user_id, last_seen desc);
create table if not exists cbt_private.admin_audit (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  sid      uuid,
  uid      uuid,
  who      text not null default '',
  fn       text not null default '',
  act      text not null default '',
  detail   text not null default '',
  result   text not null default '',             -- '' = done, 'refused' = no permission, else the error
  ip       text not null default ''
);
alter table cbt_private.admin_audit add column if not exists result text not null default '';
create index if not exists admin_audit_at on cbt_private.admin_audit (at desc);
revoke all on cbt_private.admin_users, cbt_private.admin_sessions, cbt_private.admin_audit from public, anon, authenticated;

-- ---------- small helpers ----------
create or replace function cbt_private.adm_hd() returns json language sql stable as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json)
$$;
-- the caller's address (same headers as v34), used for the lock keys and, shortened, for display
create or replace function cbt_private.adm_raw_ip() returns text language sql stable as $$
  select btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''))
    from (select cbt_private.adm_hd() h) x
$$;
create or replace function cbt_private.adm_ip() returns text language plpgsql stable as $$
declare v text := cbt_private.adm_raw_ip();
begin
  if v ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' then return split_part(v, '.', 1) || '.' || split_part(v, '.', 2) || '.•.•'; end if;
  if v like '%:%' then return split_part(v, ':', 1) || ':' || split_part(v, ':', 2) || ':…'; end if;
  return '';
end $$;
create or replace function cbt_private.adm_sha(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;
create or replace function cbt_private.adm_secret() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
-- wrong-password counter for one connection and one kind ('admin' = owner, 'team' = team sign-in, 'pw' = password checks
-- inside the panel). 10 wrong in a row lock that connection for 15 minutes. Returns true when the connection is locked.
create or replace function cbt_private.adm_locked(p_kind text) returns boolean language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select exists (select 1 from admin_fails where ip = md5('cbt-' || p_kind || '|' || adm_raw_ip()) and locked_until > cbt_private.now_ms())
$$;
create or replace function cbt_private.adm_fail(p_kind text, p_ok boolean) returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare k text := md5('cbt-' || p_kind || '|' || adm_raw_ip()); t bigint := cbt_private.now_ms();
begin
  if p_ok then update admin_fails set fails = 0 where ip = k; return; end if;
  insert into admin_fails as a (ip, fails) values (k, 1)
    on conflict (ip) do update set
      locked_until = case when a.fails + 1 >= 10 then t + 900000 else a.locked_until end,
      fails        = case when a.fails + 1 >= 10 then 0 else a.fails + 1 end;
end $$;
revoke all on function cbt_private.adm_hd(), cbt_private.adm_raw_ip(), cbt_private.adm_ip(), cbt_private.adm_sha(text), cbt_private.adm_secret(),
  cbt_private.adm_locked(text), cbt_private.adm_fail(text, boolean) from public, anon, authenticated;

-- ---------- which permission a function + action needs ----------
-- 'module:view' | 'module:manage' | 'any' (every signed-in member) | 'any_write' (same, but logged)
-- | 'owner' | 'owner_read' | 'ping' | null (unknown = refused for team members)
create or replace function cbt_private.admin_need(p_fn text, p_act text) returns text language sql immutable as $$
  select case p_fn
    when 'cbt_admin' then case
      when p_act = 'ping' then 'ping'
      when p_act in ('catalog', 'usage') then 'any'
      when p_act = 'students' then 'students:view'
      when p_act in ('student_add', 'student_approve', 'student_code', 'student_block', 'student_devices_reset',
                     'student_update', 'student_delete', 'grant') then 'students:manage'
      when p_act in ('test_get', 'reports') then 'content:view'
      when p_act in ('series_save', 'series_delete', 'folder_save', 'folder_delete', 'test_save', 'test_delete', 'test_stage',
                     'series_cover', 'file_put', 'file_delete', 'report_status', 'report_delete') then 'content:manage'
      when p_act in ('results', 'bookmark_stats') then 'results:view'
      when p_act = 'result_delete' then 'results:manage'
      when p_act = 'set_password' then 'password_only'
    end
    -- base-setup functions (their code is not in this repository)
    when 'cbt_admin2' then case when p_act = 'overview' then 'any' when p_act = 'analytics' then 'results:view'
                                when p_act = 'duplicate' then 'content:manage' when p_act = 'students_export' then 'students:view' end
    when 'cbt_admin3' then case when p_act = 'activity' then 'students:view' when p_act in ('live_tests', 'live') then 'results:view' end
    when 'cbt_admin_ann' then case when p_act in ('list', 'img') then 'messaging:view' else 'messaging:manage' end
    when 'cbt_admin_ann_aud'        then case when p_act = 'set' or p_act = 'forget' then 'messaging:manage' else 'messaging:view' end   -- v36
    when 'cbt_admin_practice' then case when p_act = 'list' then 'any' else 'content:manage' end
    when 'cbt_admin_pyq'            then case when p_act in ('list', 'papers') then 'content:view' else 'content:manage' end
    when 'cbt_admin_series_cover'   then case when p_act = 'get' then 'content:view' else 'content:manage' end
    when 'cbt_admin_cheat'          then case when p_act = 'get' then 'integrity:view' else 'integrity:manage' end
    when 'cbt_admin_payments'       then case when p_act = 'get' then 'payments:view' else 'payments:manage' end
    when 'cbt_admin_store'          then case when p_act in ('get', 'series_cover') then 'store:view' else 'store:manage' end
    when 'cbt_admin_store_audit'    then 'store:view'
    when 'cbt_admin_store_explore'  then case when p_act = 'get' then 'store:view' else 'store:manage' end
    when 'cbt_admin_store_launch'   then case when p_act = 'get' then 'store:view' else 'store:manage' end
    when 'cbt_admin_store_layout'   then 'store:manage'
    when 'cbt_admin_store_order'    then 'store:manage'
    when 'cbt_admin_store_schedule' then 'store:manage'
    when 'cbt_admin_promos'         then case when p_act in ('get', 'orders', 'ping') then 'promotions:view' else 'promotions:manage' end
    when 'cbt_admin_banners'        then case when p_act = 'list' then 'messaging:view' else 'messaging:manage' end
    when 'cbt_admin_push_count'     then 'messaging:view'
    when 'cbt_admin_reviews'        then case when p_act = 'get' then 'reviews:view' else 'reviews:manage' end
    when 'cbt_admin_me'             then 'any'
    when 'cbt_admin_team'           then case when p_act = 'self_sessions' then 'any'
                                              when p_act in ('self_password', 'self_revoke') then 'any_write'
                                              when p_act = 'get' then 'owner_read' else 'owner' end
  end
$$;
revoke all on function cbt_private.admin_need(text, text) from public, anon, authenticated;

-- ---------- a session token: "as1.<session id>.<secret>" ----------
create or replace function cbt_private.admin_session_ok(p_tok text)
returns text language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  v_id uuid; v_sec text; r record; v_need text; v_mod text; v_lvl text; v_have text;
  v_fn text := coalesce(current_setting('cbt.fn', true), '');
  v_act text := coalesce(current_setting('cbt.act', true), '');
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
begin
  if p_tok !~ '^as1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$' then return 'invalid'; end if;
  v_id := split_part(p_tok, '.', 2)::uuid; v_sec := split_part(p_tok, '.', 3);
  select s.*, u.name as uname, u.perms, u.active into r
    from admin_sessions s left join admin_users u on u.id = s.user_id where s.id = v_id;
  if not found or r.token_hash <> adm_sha(v_sec) then return 'invalid'; end if;
  if r.revoked_at is not null then return 'signed_out'; end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.user_id is not null and r.active is not true then return 'disabled'; end if;
  if r.last_seen < now() - interval '30 seconds' then
    update admin_sessions set last_seen = now(), expires_at = least(now() + interval '7 days', created_at + interval '30 days') where id = v_id;
  end if;
  perform set_config('cbt.sid', v_id::text, true);
  perform set_config('cbt.uid', coalesce(r.user_id::text, ''), true);
  perform set_config('cbt.who', case when r.user_id is null then 'Owner' else r.uname end, true);

  v_need := admin_need(v_fn, v_act);
  -- the send-push function on the server checks the sender with a bare 'ping'
  if v_need = 'ping' and v_role = 'service_role' then v_need := 'messaging:manage'; end if;
  perform set_config('cbt.need', coalesce(v_need, ''), true);

  -- changing the admin password with a session (no current password) is never allowed: use Team & access → Password
  if v_need = 'password_only' then perform set_config('cbt.denied', '1', true); return 'forbidden'; end if;
  if r.user_id is not null then
    if v_need is null or v_need in ('owner', 'owner_read', 'ping') then
      perform set_config('cbt.denied', '1', true); return 'forbidden';
    end if;
    if v_need not in ('any', 'any_write') then
      v_mod := split_part(v_need, ':', 1); v_lvl := split_part(v_need, ':', 2);
      v_have := coalesce(r.perms->>v_mod, '');
      if not (v_have = 'manage' or (v_have = 'view' and v_lvl = 'view')) then
        perform set_config('cbt.denied', '1', true); return 'forbidden';
      end if;
    end if;
  end if;
  return null;
end $$;
revoke all on function cbt_private.admin_session_ok(text) from public, anon, authenticated;

-- ---------- activity log: every change (not reads) and every refused request, written after it ran ----------
create or replace function cbt_private.admin_after(p_res jsonb, p_fn text)
returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_need text := coalesce(current_setting('cbt.need', true), ''); v_denied boolean := coalesce(current_setting('cbt.denied', true), '') = '1';
begin
  -- only the outer call counts (a function that checks the password through cbt_admin 'ping' calls a wrapper too)
  if p_fn is distinct from nullif(current_setting('cbt.fn', true), '') then return; end if;
  if coalesce(current_setting('cbt.logged', true), '') = '1' then return; end if;
  if not v_denied and not (v_need like '%:manage' or v_need in ('owner', 'any_write', 'password_only')) then return; end if;
  perform set_config('cbt.logged', '1', true);
  insert into admin_audit (sid, uid, who, fn, act, detail, result, ip)
  values (nullif(current_setting('cbt.sid', true), '')::uuid, nullif(current_setting('cbt.uid', true), '')::uuid,
          coalesce(nullif(current_setting('cbt.who', true), ''), 'Owner'), p_fn, coalesce(current_setting('cbt.act', true), ''),
          left(coalesce(current_setting('cbt.detail', true), ''), 120),
          case when v_denied then 'refused' when coalesce((p_res->>'ok')::boolean, false) then '' else left(coalesce(p_res->>'error', 'failed'), 40) end,
          adm_ip());
  if random() < 0.01 then delete from admin_audit where at < now() - interval '180 days'; end if;
end $$;
revoke all on function cbt_private.admin_after(jsonb, text) from public, anon, authenticated;
drop function if exists cbt_private.admin_log(text);

-- ---------- admin_ok: the password (owner, as before) or a session ----------
create or replace function cbt_private.admin_ok(p_pw text)
returns text language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  t bigint := cbt_private.now_ms();
  h text; sl text; lk bigint; f cbt_private.admin_fails%rowtype;
  v_ip text := md5('cbt-admin|' || cbt_private.adm_raw_ip());
begin
  if coalesce(p_pw, '') like 'as1.%' then return cbt_private.admin_session_ok(p_pw); end if;

  -- (unchanged from v34) wrong passwords lock only the connection they come from
  select value into h from settings where key = 'admin_hash';
  if h is null then return 'not_set'; end if;
  select value into sl from settings where key = 'admin_salt';
  select value::bigint into lk from settings where key = 'admin_locked_until';
  if coalesce(lk,0) > t then return 'locked'; end if;
  select * into f from admin_fails where ip = v_ip;
  if found and f.locked_until > t then return 'locked'; end if;
  if h <> hash_code(sl, coalesce(p_pw,'')) then
    insert into admin_fails as a (ip, fails) values (v_ip, 1)
      on conflict (ip) do update set
        locked_until = case when a.fails + 1 >= 10 then t + 900000 else a.locked_until end,
        fails        = case when a.fails + 1 >= 10 then 0 else a.fails + 1 end;
    insert into admin_fail_log default values;
    delete from admin_fail_log where at < now() - interval '2 hours';
    if (select count(*) from admin_fail_log where at > now() - interval '1 hour') >= 100 then
      insert into settings values ('admin_locked_until',(t + 900000)::text)
        on conflict (key) do update set value = excluded.value;
      delete from admin_fail_log;
    end if;
    return 'invalid';
  end if;
  update admin_fails set fails = 0 where ip = v_ip;
  perform set_config('cbt.who', 'Owner (password)', true);
  perform set_config('cbt.need', coalesce(cbt_private.admin_need(coalesce(current_setting('cbt.fn', true), ''),
                                                                  coalesce(current_setting('cbt.act', true), '')), ''), true);
  return null;
end $$;
revoke all on function cbt_private.admin_ok(text) from public, anon, authenticated;

-- ---------- wrap every public.cbt_admin… function (once; again after it is re-created) ----------
do $do$
declare f record; v_act text; v_det text; v_call text; i int;
begin
  for f in
    select p.oid, p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_identity_arguments(p.oid) as idargs,
           format_type(p.prorettype, null) as ret,
           p.proargnames, (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality as x(t, o)) as types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'cbt\_admin%'
       and p.proname not in ('cbt_admin_login', 'cbt_admin_me', 'cbt_admin_logout', 'cbt_admin_team')
       and p.prorettype in ('jsonb'::regtype, 'json'::regtype) and p.proretset = false
       and p.proargnames is not null and p.proargnames[1] = 'p_pw'
  loop
    if pg_get_functiondef(f.oid) like '%cbt-wrap-v35.2%' then continue; end if;
    if pg_get_functiondef(f.oid) like '%cbt-wrap-v35%' then
      -- an older wrapper: the real function is already in cbt_private; only the wrapper is made again
      execute format('drop function public.%I(%s)', f.proname, f.idargs);
    else
      -- the real function: moved to cbt_private.<name>__core
      execute format('drop function if exists cbt_private.%I(%s)', f.proname || '__core', f.idargs);
      execute format('alter function public.%I(%s) set schema cbt_private', f.proname, f.idargs);
      execute format('alter function cbt_private.%I(%s) rename to %I', f.proname, f.idargs, f.proname || '__core');
      execute format('revoke all on function cbt_private.%I(%s) from public, anon, authenticated', f.proname || '__core', f.idargs);
    end if;
    v_act := case when 'p_action' = any(f.proargnames) then 'coalesce(p_action, '''')'
                  when 'p_set' = any(f.proargnames) then 'case when p_set is null then ''get'' else ''set'' end'
                  else '''call''' end;
    -- a short note of what was changed, for the activity log
    v_det := '''''';
    i := array_position(f.proargnames, 'p_data');
    if i is not null and f.types[i] = 'jsonb' then
      v_det := 'coalesce(p_data->>''title'', p_data->>''name'', p_data->>''mobile'', p_data->>''code'', p_data->>''id'', '''')';
    end if;
    if 'p_code' = any(f.proargnames) then v_det := 'coalesce(p_code, '''')'; end if;
    if 'p_series' = any(f.proargnames) then v_det := 'coalesce(p_series, '''')'; end if;
    if 'p_item' = any(f.proargnames) then v_det := 'coalesce(p_item::text, '''')'; end if;
    select string_agg(format('%I => %I', a, a), ', ') into v_call from unnest(f.proargnames) a;
    execute format($f$
      create function public.%I(%s) returns %s language plpgsql security definer set search_path = cbt_private, pg_temp as $w$
      declare r %s;
      begin
        -- cbt-wrap-v35.2: note what is being called (only the first, outer call counts), run the real function, log changes
        if coalesce(current_setting('cbt.fn', true), '') = '' then
          perform set_config('cbt.fn', %L, true);
          perform set_config('cbt.act', %s, true);
          perform set_config('cbt.detail', left(%s, 120), true);
        end if;
        r := cbt_private.%I(%s);
        perform cbt_private.admin_after(r::jsonb, %L);
        return r;
      end $w$ $f$, f.proname, f.args, f.ret, f.ret, f.proname, v_act, v_det, f.proname || '__core', v_call, f.proname);
    execute format('grant execute on function public.%I(%s) to anon, authenticated', f.proname, f.idargs);
  end loop;
end $do$;

-- ---------- sign in: owner (username empty + admin password) or a team member ----------
create or replace function public.cbt_admin_login(p_user text, p_pw text, p_device text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; u admin_users%rowtype; v_sec text; v_sid uuid; t bigint := cbt_private.now_ms();
  v_name text := lower(btrim(coalesce(p_user, '')));
  hd json := adm_hd();
begin
  perform set_config('cbt.fn', 'cbt_admin_login', true);
  if coalesce(p_pw, '') = '' or p_pw like 'as1.%' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  if v_name = '' or v_name = 'owner' then
    e := admin_ok(p_pw);                           -- the owner: same checks and locks as before
    if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  else
    -- wrong passwords lock only the connection they come from (10 tries, 15 minutes), with a counter separate from
    -- the owner's, so nobody can lock a member (or the owner) out from elsewhere, and unknown usernames look the same
    if adm_locked('team') then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
    select * into u from admin_users where username = v_name;
    if not found or u.pw_hash <> hash_code(u.salt, p_pw) then
      perform adm_fail('team', false);
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    perform adm_fail('team', true);
    if not u.active then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;
    update admin_users set fail_count = 0, last_login = now() where id = u.id;
  end if;

  v_sec := adm_secret();
  insert into admin_sessions (user_id, token_hash, device, ua, ip)
  values (u.id, adm_sha(v_sec), left(regexp_replace(coalesce(p_device, ''), '[<>"`\r\n\t]', '', 'g'), 80),
          left(coalesce(hd->>'user-agent', ''), 300), adm_ip())
  returning id into v_sid;
  insert into admin_audit (sid, uid, who, fn, act, detail, ip)
  values (v_sid, u.id, coalesce(u.name, 'Owner'), 'session', 'sign_in', left(regexp_replace(coalesce(p_device, ''), '[<>"`\r\n\t]', '', 'g'), 80), adm_ip());
  delete from admin_sessions where (revoked_at is not null or expires_at < now()) and last_seen < now() - interval '60 days';
  return jsonb_build_object('ok', true, 'token', 'as1.' || v_sid::text || '.' || v_sec,
    'me', jsonb_build_object('id', u.id, 'name', coalesce(u.name, 'Owner'), 'username', coalesce(u.username, ''),
                             'owner', u.id is null, 'perms', coalesce(u.perms, '{}'::jsonb)));
end $$;
grant execute on function public.cbt_admin_login(text, text, text) to anon, authenticated;

-- ---------- who am I (checks the session; the panel calls it on start and every minute) ----------
create or replace function public.cbt_admin_me(p_pw text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; u admin_users%rowtype; v_uid uuid;
begin
  perform set_config('cbt.fn', 'cbt_admin_me', true); perform set_config('cbt.act', 'me', true);
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  v_uid := nullif(current_setting('cbt.uid', true), '')::uuid;
  if v_uid is not null then select * into u from admin_users where id = v_uid; end if;
  return jsonb_build_object('ok', true, 'session', nullif(current_setting('cbt.sid', true), ''),
    'me', jsonb_build_object('id', u.id, 'name', coalesce(u.name, 'Owner'), 'username', coalesce(u.username, ''),
                             'owner', v_uid is null, 'perms', coalesce(u.perms, '{}'::jsonb)));
end $$;
grant execute on function public.cbt_admin_me(text) to anon, authenticated;

-- ---------- sign out this session ----------
create or replace function public.cbt_admin_logout(p_pw text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_id uuid;
begin
  if coalesce(p_pw, '') !~ '^as1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  v_id := split_part(p_pw, '.', 2)::uuid;
  update admin_sessions set revoked_at = now(), revoked_by = 'self'
   where id = v_id and token_hash = adm_sha(split_part(p_pw, '.', 3)) and revoked_at is null;
  if found then
    insert into admin_audit (sid, uid, who, fn, act, ip)
    select v_id, s.user_id, coalesce(u.name, 'Owner'), 'session', 'sign_out', adm_ip()
      from admin_sessions s left join admin_users u on u.id = s.user_id where s.id = v_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_admin_logout(text) to anon, authenticated;

-- ---------- team, sessions and activity (owner; a member can change their own password and see their own sessions) ----------
create or replace function cbt_private.admin_team_core(p_pw text, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_id uuid; v_uid uuid; v_sid uuid; v_un text; v_nm text; v_pw text;
  v_perms jsonb; k text; v text; sl text; n int; h text; asl text;
  v_mods text[] := array['students', 'payments', 'content', 'results', 'integrity', 'store', 'promotions', 'messaging', 'reviews'];
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  v_uid := nullif(current_setting('cbt.uid', true), '')::uuid;
  v_sid := nullif(current_setting('cbt.sid', true), '')::uuid;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'current', v_sid,
      'users', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'perms', u.perms,
                   'active', u.active, 'note', u.note, 'created_at', u.created_at, 'last_login', u.last_login,
                   'online', exists (select 1 from admin_sessions s where s.user_id = u.id and s.revoked_at is null
                                      and s.expires_at > now() and s.last_seen > now() - interval '3 minutes'))
                   order by u.created_at) from admin_users u), '[]'::jsonb),
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'who', coalesce(u.name, 'Owner'),
                   'device', s.device, 'ua', s.ua, 'ip', s.ip, 'created_at', s.created_at, 'last_seen', s.last_seen,
                   'expires_at', s.expires_at, 'revoked_at', s.revoked_at, 'revoked_by', s.revoked_by,
                   'active', s.revoked_at is null and s.expires_at > now())
                   order by (s.revoked_at is null and s.expires_at > now()) desc, s.last_seen desc)
                 from (select * from admin_sessions order by last_seen desc limit 200) s left join admin_users u on u.id = s.user_id), '[]'::jsonb),
      'audit', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.at, 'who', a.who, 'uid', a.uid, 'sid', a.sid,
                   'fn', a.fn, 'act', a.act, 'detail', a.detail, 'result', a.result, 'ip', a.ip) order by a.id desc)
                 from (select * from admin_audit where (d->>'before') is null or id < (d->>'before')::bigint
                        order by id desc limit 300) a), '[]'::jsonb));

  elsif p_action = 'user_save' then
    v_id := nullif(d->>'id', '')::uuid;
    v_nm := left(btrim(regexp_replace(coalesce(d->>'name', ''), '[<>"`\r\n\t]', '', 'g')), 60);
    v_un := lower(btrim(coalesce(d->>'username', '')));
    v_pw := coalesce(d->>'password', '');
    perform set_config('cbt.detail', left(v_nm || ' (' || v_un || ')', 120), true);
    if v_nm = '' then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    if v_un !~ '^[a-z0-9._-]{3,30}$' or v_un = 'owner' then return jsonb_build_object('ok', false, 'error', 'username'); end if;
    if (v_id is null or v_pw <> '') and length(v_pw) < 8 then return jsonb_build_object('ok', false, 'error', 'password'); end if;
    v_perms := '{}'::jsonb;
    for k, v in select * from jsonb_each_text(coalesce(d->'perms', '{}'::jsonb)) loop
      if k = any(v_mods) and v in ('view', 'manage') then v_perms := v_perms || jsonb_build_object(k, v); end if;
    end loop;
    if exists (select 1 from admin_users where username = v_un and id is distinct from v_id) then
      return jsonb_build_object('ok', false, 'error', 'taken');
    end if;
    if v_id is null then
      sl := gen_random_uuid()::text;
      insert into admin_users (name, username, salt, pw_hash, perms, active, note)
      values (v_nm, v_un, sl, hash_code(sl, v_pw), v_perms, coalesce((d->>'active')::boolean, true), left(coalesce(d->>'note', ''), 200))
      returning id into v_id;
    else
      update admin_users set name = v_nm, username = v_un, perms = v_perms, active = coalesce((d->>'active')::boolean, active),
             note = left(coalesce(d->>'note', note), 200) where id = v_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'user'); end if;
      if v_pw <> '' then
        sl := gen_random_uuid()::text;
        update admin_users set salt = sl, pw_hash = hash_code(sl, v_pw), fail_count = 0, locked_until = 0 where id = v_id;
        -- a new password signs the member out everywhere
        update admin_sessions set revoked_at = now(), revoked_by = 'Owner (new password)' where user_id = v_id and revoked_at is null;
      end if;
      if not coalesce((d->>'active')::boolean, true) then
        update admin_sessions set revoked_at = now(), revoked_by = 'Owner (paused)' where user_id = v_id and revoked_at is null;
      end if;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'user_delete' then
    v_id := nullif(d->>'id', '')::uuid;
    select name into v_nm from admin_users where id = v_id;
    perform set_config('cbt.detail', left(coalesce(v_nm, ''), 120), true);
    delete from admin_users where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'session_revoke' then
    v_id := nullif(d->>'id', '')::uuid;
    if v_id = v_sid then return jsonb_build_object('ok', false, 'error', 'current'); end if;
    select coalesce(u.name, 'Owner') || ' · ' || s.device into v_nm from admin_sessions s left join admin_users u on u.id = s.user_id where s.id = v_id;
    perform set_config('cbt.detail', left(coalesce(v_nm, ''), 120), true);
    update admin_sessions set revoked_at = now(), revoked_by = 'Owner' where id = v_id and revoked_at is null;
    return jsonb_build_object('ok', true);

  elsif p_action = 'sessions_revoke' then
    -- everyone except this session; or only one member's sessions (user_id); or only the owner's other sessions (owner_only)
    update admin_sessions set revoked_at = now(), revoked_by = 'Owner'
     where revoked_at is null and id is distinct from v_sid
       and (case when coalesce((d->>'owner_only')::boolean, false) then user_id is null
                 when nullif(d->>'user_id', '') is not null then user_id = (d->>'user_id')::uuid
                 else true end);
    get diagnostics n = row_count;
    perform set_config('cbt.detail', n || ' session(s)', true);
    return jsonb_build_object('ok', true, 'count', n);

  elsif p_action = 'owner_password' then
    -- the owner changes the admin password: needs the current one; other owner sessions are signed out
    if adm_locked('pw') then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
    select value into h from settings where key = 'admin_hash';
    select value into asl from settings where key = 'admin_salt';
    if h is null or h <> hash_code(asl, coalesce(d->>'current', '')) then perform adm_fail('pw', false); return jsonb_build_object('ok', false, 'error', 'current_pw'); end if;
    perform adm_fail('pw', true);
    if length(coalesce(d->>'new_pw', '')) < 8 then return jsonb_build_object('ok', false, 'error', 'short'); end if;
    perform set_admin_password(d->>'new_pw');
    update admin_sessions set revoked_at = now(), revoked_by = 'Owner (new password)'
     where user_id is null and revoked_at is null and id is distinct from v_sid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'self_password' then
    if v_uid is null then return jsonb_build_object('ok', false, 'error', 'owner'); end if;
    if adm_locked('pw') then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
    if not exists (select 1 from admin_users where id = v_uid and pw_hash = hash_code(salt, coalesce(d->>'current', ''))) then
      perform adm_fail('pw', false); return jsonb_build_object('ok', false, 'error', 'current_pw');
    end if;
    perform adm_fail('pw', true);
    if length(coalesce(d->>'new_pw', '')) < 8 then return jsonb_build_object('ok', false, 'error', 'short'); end if;
    sl := gen_random_uuid()::text;
    update admin_users set salt = sl, pw_hash = hash_code(sl, d->>'new_pw') where id = v_uid;
    update admin_sessions set revoked_at = now(), revoked_by = 'self (new password)'
     where user_id = v_uid and revoked_at is null and id is distinct from v_sid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'self_sessions' then
    return jsonb_build_object('ok', true, 'current', v_sid,
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'device', s.device, 'ip', s.ip, 'created_at', s.created_at,
                   'last_seen', s.last_seen, 'active', s.revoked_at is null and s.expires_at > now()) order by s.last_seen desc)
                 from admin_sessions s where s.user_id is not distinct from v_uid and s.revoked_at is null and s.expires_at > now()), '[]'::jsonb));

  elsif p_action = 'self_revoke' then
    update admin_sessions set revoked_at = now(), revoked_by = 'self'
     where id = nullif(d->>'id', '')::uuid and user_id is not distinct from v_uid and id <> v_sid and revoked_at is null;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function cbt_private.admin_team_core(text, text, jsonb) from public, anon, authenticated;

create or replace function public.cbt_admin_team(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare r jsonb;
begin
  perform set_config('cbt.fn', 'cbt_admin_team', true); perform set_config('cbt.act', coalesce(p_action, ''), true);
  r := cbt_private.admin_team_core(p_pw, p_action, p_data);
  perform cbt_private.admin_after(r, 'cbt_admin_team');
  return r;
end $$;
grant execute on function public.cbt_admin_team(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
-- what was wrapped (team members can use these, as their permissions allow); anything listed as "not wrapped" works for the owner only
select p.proname as admin_function,
       case when pg_get_functiondef(p.oid) like '%cbt-wrap-v35%' then 'wrapped'
            when p.proname in ('cbt_admin_login', 'cbt_admin_me', 'cbt_admin_logout', 'cbt_admin_team') then 'team (v35)'
            else 'not wrapped (owner only)' end as status
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'cbt\_admin%' order by 1;
select 'v35 installed: admin team, sessions, permissions, activity log' as status;
