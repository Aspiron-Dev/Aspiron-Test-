-- =====================================================================
--  v34: Fixes found in a security review ("think like a hacker")
--  1. Login lock: anyone who knows a student's mobile number could type 8 wrong codes and lock that student
--     out for 15 minutes, again and again, even in the middle of a live test. Now the student's own phone
--     (already registered on the account) with the right code keeps working while the number is locked.
--  2. Access requests: one person could fill the waiting list (300) with fake requests; now at most 5 new
--     requests per hour from one connection, and names cannot carry HTML.
--  3. Promotion links: anyone who guessed an order code could attach their promotion link to someone
--     else's order and claim the commission. Now the order's mobile number must match too, and only
--     within 2 hours of the order.
--  4. Admin panel: anyone could send 10 wrong admin passwords and lock the admin out for 15 minutes, again and
--     again. Now wrong passwords lock only the connection they come from; the whole panel locks only after
--     100 wrong passwords in an hour (someone guessing at scale).
--  Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run (after v30_promotions and v33). Safe to run again.
-- =====================================================================

begin;

alter table cbt_private.students add column if not exists lock_fails int not null default 0;

create table if not exists cbt_private.access_requests (ip text not null default '', created_at timestamptz not null default now());
create index if not exists access_requests_ip on cbt_private.access_requests (ip, created_at desc);
revoke all on cbt_private.access_requests from public, anon, authenticated;

create table if not exists cbt_private.admin_fails (ip text primary key, fails int not null default 0, locked_until bigint not null default 0);
create table if not exists cbt_private.admin_fail_log (at timestamptz not null default now());
revoke all on cbt_private.admin_fails from public, anon, authenticated;
revoke all on cbt_private.admin_fail_log from public, anon, authenticated;

-- ---------- auth ----------
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
begin
  select * into s from students where mobile = m for update;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.locked_until > t then
    -- A lock is often caused by someone else typing wrong codes for this number. The student's own phone
    -- (already registered on the account) with the right code keeps working; at most 30 tries per lock.
    if not (p_device is not null and p_device = any(s.devices) and s.lock_fails < 30) then
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
    if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
      update students set lock_fails = lock_fails + 1 where id = s.id;
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
  end if;
  if s.status = 'pending' then
    return jsonb_build_object('ok',false,'error','pending');
  end if;
  if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
      fail_count   = case when fail_count + 1 >= 8 then 0 else fail_count + 1 end,
      lock_fails   = case when fail_count + 1 >= 8 then 0 else lock_fails end
    where id = s.id;
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.status = 'blocked' then
    return jsonb_build_object('ok',false,'error','blocked');
  end if;
  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('ok',false,'error','device');
  end if;
  if not (p_device = any(s.devices)) then
    if coalesce(array_length(s.devices,1),0) >= s.max_devices then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
    update students set devices = array_append(devices, p_device) where id = s.id;
  end if;
  update students set fail_count = 0, last_seen = now() where id = s.id;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;

-- ---------- cbt_request_access ----------
CREATE OR REPLACE FUNCTION public.cbt_request_access(p_name text, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  m text := cbt_private.norm_mobile(p_mobile);
  n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name,''),'[<>"`]','','g'),'\s+',' ','g')),60);
  s record; fnd boolean;
  h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_raw text := btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  v_ip text := case when v_raw = '' then '' else md5('cbt-access|' || v_raw) end;
begin
  if length(n) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
  if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
  select * into s from students where mobile = m;
  fnd := found;
  if fnd then
    return jsonb_build_object('ok',true,'status',s.status);
  end if;
  if (select count(*) from students where status = 'pending') >= 300
     or (v_ip <> '' and (select count(*) from access_requests where ip = v_ip and created_at > now() - interval '1 hour') >= 5) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  insert into students(name,mobile,status) values (n,m,'pending');
  insert into access_requests(ip) values (v_ip);
  return jsonb_build_object('ok',true,'status','pending');
end $function$;


-- ---------- admin_ok: wrong passwords lock only the connection they come from ----------
create or replace function cbt_private.admin_ok(p_pw text)
returns text language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  t bigint := cbt_private.now_ms();
  h text; sl text; lk bigint; f cbt_private.admin_fails%rowtype;
  hd json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_raw text := btrim(coalesce(hd->>'cf-connecting-ip', hd->>'x-real-ip', split_part(coalesce(hd->>'x-forwarded-for', ''), ',', 1), ''));
  v_ip text := md5('cbt-admin|' || v_raw);
begin
  select value into h from settings where key = 'admin_hash';
  if h is null then return 'not_set'; end if;
  select value into sl from settings where key = 'admin_salt';
  -- the whole panel locks only after many wrong passwords in an hour (someone guessing from many places)
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
  return null;
end $$;
revoke all on function cbt_private.admin_ok(text) from public, anon, authenticated;

-- ---------- cbt_promo_attach: order code AND the order's mobile number, within 2 hours of the order ----------
drop function if exists public.cbt_promo_attach(text, text);
create or replace function public.cbt_promo_attach(p_order text, p_code text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c text := lower(btrim(coalesce(p_code, '')));
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  update public.cbt_store_orders set promo_code = v_c
   where code = upper(btrim(coalesce(p_order, ''))) and mobile = v_m and promo_code is null and status = 'pending'
     and created_at > now() - interval '2 hours'
     and exists (select 1 from public.cbt_promo_links l where l.code = v_c and l.active);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_promo_attach(text, text, text) to anon, authenticated;

-- old access requests are only needed for the hourly limit
delete from cbt_private.access_requests where created_at < now() - interval '2 days';

commit;

notify pgrst, 'reload schema';

select 'v34 installed: login lock, admin lock, access requests, promotion links' as status;
