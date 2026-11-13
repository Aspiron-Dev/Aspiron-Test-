-- =====================================================================
--  v76: Low findings of the security review: A3 (push) and A5 (access-code guessing)
--  A3  Moving a phone's notifications to a new subscription (the browser renews it now and then) now needs the old
--      subscription's secret key, which only that phone has. Knowing the old link alone moves nothing any more.
--  A5  Wrong access codes are counted per address too: 100 wrong codes (or unknown numbers) in an hour from one
--      address stop code sign-ins from it for the rest of that hour, and the owner gets an alert. Students who are
--      already signed in (sign-in token) are never stopped. (A4, sign-out, is in the app: app1.js / app18.js.)
--  Run after v75. Safe to run again.
-- =====================================================================
create table if not exists cbt_private.code_fail_ips (ip text not null, at timestamptz not null default now());
create index if not exists code_fail_ips_k on cbt_private.code_fail_ips (ip, at desc);
alter table cbt_private.code_fail_ips enable row level security;
revoke all on cbt_private.code_fail_ips from public, anon, authenticated;

create or replace function cbt_private.code_ip_blocked(p_ip text) returns boolean
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select coalesce(p_ip, '') <> '' and (select count(*) from code_fail_ips where ip = p_ip and at > now() - interval '1 hour') >= 100
$$;
create or replace function cbt_private.code_ip_fail(p_ip text) returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare n int;
begin
  if coalesce(p_ip, '') = '' then return; end if;
  insert into code_fail_ips (ip) values (p_ip);
  if random() < 0.02 then delete from code_fail_ips where at < now() - interval '2 hours'; end if;
  select count(*) into n from code_fail_ips where ip = p_ip and at > now() - interval '1 hour';
  if n = 100 and to_regprocedure('cbt_private.sec_event(text,text,text,text)') is not null then
    perform sec_event('many:code_guessing', 'high', '', '100 wrong access codes in an hour from one address: code sign-in stopped there for the hour');
  end if;
exception when others then null;
end $$;
revoke all on function cbt_private.code_ip_blocked(text), cbt_private.code_ip_fail(text) from public, anon, authenticated;

-- ---------- A3 ----------
drop function if exists public.cbt_push_rotate(text, jsonb);
create or replace function public.cbt_push_rotate(p_old text, p_sub jsonb, p_old_auth text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text := left(coalesce(p_old, ''), 1000); v_ep text := left(coalesce(p_sub->>'endpoint', ''), 1000); m text;
begin
  if v_old !~ '^https://' or v_ep !~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or coalesce(p_sub#>>'{keys,p256dh}', '') = '' or coalesce(p_sub#>>'{keys,auth}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  -- v76 (review A3): only the phone that had the old subscription knows its secret 'auth' key; without it, nothing moves
  select mobile into m from public.cbt_push_subs
   where endpoint = v_old and coalesce(p_old_auth, '') <> ''
     and rtrim(translate(auth, '+/', '-_'), '=') = rtrim(translate(p_old_auth, '+/', '-_'), '=');
  if m is null then return jsonb_build_object('ok', false, 'error', 'unknown'); end if;
  insert into public.cbt_push_subs (endpoint, mobile, p256dh, auth)
  values (v_ep, m, left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100))
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now();
  if v_old <> v_ep then delete from public.cbt_push_subs where endpoint = v_old; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_push_rotate(text, jsonb, text) to anon;
revoke all on function public.cbt_push_rotate(text, jsonb, text) from public, authenticated;

-- ---------- A5: auth (from v48) ----------
CREATE OR REPLACE FUNCTION cbt_private.auth(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  s cbt_private.students%rowtype;
  m text := cbt_private.norm_mobile(p_mobile);
  c text := cbt_private.norm_code(p_code);
  t bigint := cbt_private.now_ms();
  v_tok boolean := false;
  v_ip text := coalesce(cbt_private.adm_raw_ip(), '');
begin
  -- v76 (review A5): an address that sent 100 wrong codes in an hour cannot try codes for a while (tokens still work)
  if coalesce(p_code, '') not like 'st1.%' and cbt_private.code_ip_blocked(v_ip) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  select * into s from students where mobile = m;
  if not found then
    if coalesce(p_code, '') not like 'st1.%' then perform cbt_private.code_ip_fail(v_ip); end if;
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  -- a sign-in token from cbt_login (supabase_v42): the phone keeps this instead of the access code
  if coalesce(p_code, '') like 'st1.%' then
    v_tok := cbt_private.st_ok(s.id, s.code_hash, p_code, p_device);
    if not v_tok then return jsonb_build_object('ok',false,'error','invalid'); end if;
  end if;
  if s.locked_until > t and not v_tok then
    -- A lock is often caused by someone else typing wrong codes for this number. The student's own phone
    -- (already registered on the account) with the right code keeps working; at most 30 tries per lock.
    if not (p_device is not null and p_device = any(s.devices) and s.lock_fails < 30) then
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
    if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
      update students set lock_fails = lock_fails + 1 where id = s.id;
      perform cbt_private.code_ip_fail(v_ip);
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
  end if;
  if s.status = 'pending' then
    return jsonb_build_object('ok',false,'error','pending');
  end if;
  if not v_tok and (s.code_hash is null or s.code_hash <> hash_code(s.salt, c)) then
    -- counted in the update itself, so wrong codes sent at the same moment are all counted
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
      lock_fails   = case when fail_count + 1 >= 8 then 0 else lock_fails end,
      fail_count   = case when fail_count + 1 >= 8 then 0 else fail_count + 1 end
    where id = s.id;
    perform cbt_private.code_ip_fail(v_ip);
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.status = 'blocked' then
    return jsonb_build_object('ok',false,'error','blocked');
  end if;
  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('ok',false,'error','device');
  end if;
  if not (p_device = any(s.devices)) then
    -- the limit is checked again inside the update, so two new phones signing in at once cannot both get in
    update students set devices = array_append(devices, p_device)
     where id = s.id and not (p_device = any(devices)) and coalesce(array_length(devices,1),0) < max_devices;
    if not found and not exists (select 1 from students where id = s.id and p_device = any(devices)) then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
  end if;
  if s.fail_count <> 0 or s.last_seen is null or s.last_seen < now() - interval '5 minutes' then
    update students set fail_count = 0, last_seen = now() where id = s.id;
  end if;
  -- v48 (R10): the right access code was typed: keep it with bcrypt from now on (the phone's tokens keep working)
  if not v_tok and coalesce(s.salt, '') not like 'b1$%' then perform code_upgrade(s.id, s.salt, s.code_hash, c); end if;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;
revoke all on function cbt_private.auth(text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
select 'v76 installed' as status;
