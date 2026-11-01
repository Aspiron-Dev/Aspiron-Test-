-- =====================================================================
--  v42: Fixes from the security audit (F1, F3, F5, F8, F9)
--  F1  Files (PDFs) of a paid series open only for students who have that series (or when the series is free).
--  F3  Store: an order code is never given out again, so knowing a buyer's mobile number is not enough to
--      change their order (name, payer, UTR, promotion link). Wrong order codes from one connection are limited.
--  F5  Student sign-in: after the access code is typed once, the phone keeps a sign-in token instead of the code.
--      A token ends on sign-out, after 180 days without use, and when the admin gives the student a new code.
--  F8  Promotion links: one click per connection per link per hour.
--  F9  Waiting list / store / notify limits cannot be filled up by old or mass requests.
--  Run in Supabase → SQL Editor after v41, then run supabase_v35_admin_team.sql again. Safe to run again.
--  Re-run this file after re-running v19, v20, v21, v31, v34 or v39 (they replace some of the same functions).
-- =====================================================================

-- ---------- F5: sign-in tokens ----------
create table if not exists cbt_private.student_tokens (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references cbt_private.students(id) on delete cascade,
  device      text not null default '',
  token_hash  text not null,
  code_hash   text not null,               -- the access code at sign-in: a new code from the admin ends the token
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);
create index if not exists student_tokens_student on cbt_private.student_tokens (student_id, last_seen desc);
revoke all on cbt_private.student_tokens from public, anon, authenticated;

-- token = "st1.<id>.<secret>"; only the sha256 of the secret is stored
create or replace function cbt_private.st_ok(p_sid uuid, p_code_hash text, p_tok text) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_id uuid; r student_tokens%rowtype;
begin
  if coalesce(p_tok, '') !~ '^st1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$' then return false; end if;
  v_id := split_part(p_tok, '.', 2)::uuid;
  select * into r from student_tokens where id = v_id;
  if not found or r.student_id <> p_sid or r.expires_at < now() or r.code_hash is distinct from p_code_hash
     or r.token_hash <> encode(sha256(convert_to(split_part(p_tok, '.', 3), 'UTF8')), 'hex') then
    return false;
  end if;
  if r.last_seen < now() - interval '1 hour' then
    update student_tokens set last_seen = now(), expires_at = now() + interval '180 days' where id = v_id;
  end if;
  return true;
end $$;
revoke all on function cbt_private.st_ok(uuid, text, text) from public, anon, authenticated;

create or replace function cbt_private.st_new(p_sid uuid, p_device text) returns text
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_sec text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  insert into student_tokens (student_id, device, token_hash, code_hash)
  values (p_sid, left(coalesce(p_device, ''), 80), encode(sha256(convert_to(v_sec, 'UTF8')), 'hex'), (select code_hash from students where id = p_sid))
  returning id into v_id;
  -- at most 10 per student (the newest)
  delete from student_tokens where student_id = p_sid and (expires_at < now()
    or id not in (select id from student_tokens where student_id = p_sid order by last_seen desc limit 10));
  return 'st1.' || v_id::text || '.' || v_sec;
end $$;
revoke all on function cbt_private.st_new(uuid, text) from public, anon, authenticated;

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
begin
  select * into s from students where mobile = m;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  -- a sign-in token from cbt_login (supabase_v42): the phone keeps this instead of the access code
  if coalesce(p_code, '') like 'st1.%' then
    v_tok := cbt_private.st_ok(s.id, s.code_hash, p_code);
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
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;
revoke all on function cbt_private.auth(text, text, text) from public, anon, authenticated;

create or replace function cbt_private.check_code(p_mobile text, p_code text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare s cbt_private.students%rowtype; m text := cbt_private.norm_mobile(p_mobile); c text := cbt_private.norm_code(p_code); t bigint := cbt_private.now_ms();
        v_tok boolean := false;
begin
  select * into s from students where mobile = m for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  -- a sign-in token from cbt_login (supabase_v42): the phone keeps this instead of the access code
  if coalesce(p_code, '') like 'st1.%' then
    v_tok := cbt_private.st_ok(s.id, s.code_hash, p_code);
    if not v_tok then return jsonb_build_object('ok',false,'error','invalid'); end if;
  end if;
  if s.locked_until > t and not v_tok then return jsonb_build_object('ok', false, 'error', 'locked', 'wait', ceil((s.locked_until - t) / 60000.0)::int); end if;
  if s.status = 'pending' then return jsonb_build_object('ok', false, 'error', 'pending'); end if;
  if not v_tok and (s.code_hash is null or s.code_hash <> hash_code(s.salt, c)) then
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
      fail_count   = case when fail_count + 1 >= 8 then 0 else fail_count + 1 end
    where id = s.id;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if s.status = 'blocked' then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  return jsonb_build_object('ok', true, 'id', s.id);
end; $$;
revoke all on function cbt_private.check_code(text, text) from public, anon, authenticated;

-- sign in: with the access code the answer carries a new token (the app keeps that, not the code)
create or replace function public.cbt_login(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  return jsonb_build_object('ok', true, 'name', a->>'name', 'mobile', a->>'mobile', 'now', now_ms())
      || case when coalesce(p_code, '') like 'st1.%' then '{}'::jsonb
              else jsonb_build_object('token', st_new((a->>'id')::uuid, p_device)) end;
end $$;
grant execute on function public.cbt_login(text, text, text) to anon, authenticated;

-- sign out: the token stops working everywhere
create or replace function public.cbt_logout(p_mobile text, p_code text, p_device text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  if coalesce(p_code, '') ~ '^st1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$' then
    delete from student_tokens k using students s
     where k.id = split_part(p_code, '.', 2)::uuid and s.id = k.student_id and s.mobile = norm_mobile(p_mobile)
       and k.token_hash = encode(sha256(convert_to(split_part(p_code, '.', 3), 'UTF8')), 'hex');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_logout(text, text, text) to anon, authenticated;

-- ---------- F1: a file opens only for students who have its series ----------
create or replace function public.cbt_file_part(p_mobile text, p_code text, p_device text, p_file uuid, p_n integer)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; f record; d text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  select fl.*, sr.is_free into f from series_files fl join series sr on sr.id = fl.series_id and sr.active where fl.id = p_file and fl.ready;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (f.is_free or exists (select 1 from series_access ac where ac.student_id = (a->>'id')::uuid and ac.series_id = f.series_id)) then
    return jsonb_build_object('ok',false,'error','locked');
  end if;
  select data into d from file_parts where file_id = p_file and n = p_n;
  return jsonb_build_object('ok',true,'data',d,'parts',f.parts,'mime',f.mime,'name',f.file_name);
end $$;
grant execute on function public.cbt_file_part(text, text, text, uuid, integer) to anon, authenticated;

-- ---------- F3 + F9: store ----------
-- wrong order codes per connection (cbt_store_paid / cbt_promo_attach)
create table if not exists public.cbt_store_tries (ip text not null, at timestamptz not null default now());
create index if not exists cbt_store_tries_ip on public.cbt_store_tries (ip, at desc);
alter table public.cbt_store_tries enable row level security;
revoke all on public.cbt_store_tries from public, anon, authenticated;

create or replace function public.cbt_store_ip() returns text language sql stable set search_path = public, pg_temp as $$
  select case when v = '' then '' else md5('cbt-store|' || v) end
  from (select btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), '')) v
          from (select coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json) h) x) y
$$;
revoke all on function public.cbt_store_ip() from public, anon, authenticated;

-- true = this connection sent too many wrong order codes in the last hour
create or replace function public.cbt_store_too_many() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) >= 20 from public.cbt_store_tries where ip = public.cbt_store_ip() and at > now() - interval '1 hour'
$$;
create or replace function public.cbt_store_wrong() returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.cbt_store_tries (ip) values (public.cbt_store_ip());
  delete from public.cbt_store_tries where at < now() - interval '2 hours';
$$;
revoke all on function public.cbt_store_too_many(), public.cbt_store_wrong() from public, anon, authenticated;

-- every call makes a new order (the store page keeps its own order for 24 h); an existing order code is never returned
create or replace function public.cbt_store_order(p_item uuid, p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.cbt_store_items; v_code text; i int := 0;
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_ip text := public.cbt_store_ip();
begin
  if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  select * into it from public.cbt_store_items where id = p_item and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  if (v_ip <> '' and (select count(*) from public.cbt_store_orders where ip = v_ip and created_at > now() - interval '1 hour') >= 8)
     or (select count(*) from public.cbt_store_orders where mobile = v_m and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.cbt_store_orders where created_at > now() - interval '1 hour') >= 20000 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  loop
    v_code := 'ASP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from public.cbt_store_orders where code = v_code) or i > 5; i := i + 1;
  end loop;
  insert into public.cbt_store_orders (code, item_id, item_title, amount, name, mobile, ip) values (v_code, it.id, it.title, it.price, v_n, v_m, v_ip);
  return jsonb_build_object('ok', true, 'code', v_code, 'amount', it.price, 'title', it.title);
end; $$;
grant execute on function public.cbt_store_order(uuid, text, text) to anon, authenticated;

create or replace function public.cbt_store_paid(p_code text, p_mobile text, p_payer text, p_utr text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.cbt_store_orders; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_p text := left(btrim(regexp_replace(coalesce(p_payer, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_u text := upper(left(regexp_replace(coalesce(p_utr, ''), '[^A-Za-z0-9]', '', 'g'), 30));
begin
  if length(v_p) < 2 then return jsonb_build_object('ok', false, 'error', 'payer'); end if;
  if v_u <> '' and length(v_u) < 6 then return jsonb_build_object('ok', false, 'error', 'utr'); end if;
  if public.cbt_store_too_many() then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  select * into o from public.cbt_store_orders where code = upper(btrim(coalesce(p_code, ''))) and mobile = v_m;
  if not found then perform public.cbt_store_wrong(); return jsonb_build_object('ok', false, 'error', 'order'); end if;
  if o.status <> 'pending' then return jsonb_build_object('ok', true, 'status', o.status); end if;
  update public.cbt_store_orders set payer = v_p, utr = v_u, paid_at = now() where code = o.code;
  return jsonb_build_object('ok', true, 'status', 'pending',
    'utr_seen', v_u <> '' and exists (select 1 from public.cbt_store_orders where utr = v_u and code <> o.code));
end; $$;
grant execute on function public.cbt_store_paid(text, text, text, text) to anon, authenticated;

create or replace function public.cbt_promo_attach(p_order text, p_code text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c text := lower(btrim(coalesce(p_code, '')));
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  if public.cbt_store_too_many() then return jsonb_build_object('ok', true); end if;
  if not exists (select 1 from public.cbt_store_orders where code = upper(btrim(coalesce(p_order, ''))) and mobile = v_m) then
    perform public.cbt_store_wrong(); return jsonb_build_object('ok', true);
  end if;
  update public.cbt_store_orders set promo_code = v_c
   where code = upper(btrim(coalesce(p_order, ''))) and mobile = v_m and promo_code is null and status = 'pending'
     and created_at > now() - interval '2 hours'
     and exists (select 1 from public.cbt_promo_links l where l.code = v_c and l.active);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_promo_attach(text, text, text) to anon, authenticated;

-- ---------- F8: one click per connection per link per hour ----------
create table if not exists public.cbt_promo_clicks (code text not null, ip text not null, at timestamptz not null default now());
create index if not exists cbt_promo_clicks_k on public.cbt_promo_clicks (code, ip, at desc);
alter table public.cbt_promo_clicks enable row level security;
revoke all on public.cbt_promo_clicks from public, anon, authenticated;

create or replace function public.cbt_promo_click(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c text := lower(btrim(coalesce(p_code, ''))); v_ip text := public.cbt_store_ip();
begin
  if v_ip = '' or not exists (select 1 from public.cbt_promo_links where code = v_c and active)
     or exists (select 1 from public.cbt_promo_clicks where code = v_c and ip = v_ip and at > now() - interval '1 hour') then
    return jsonb_build_object('ok', true);
  end if;
  insert into public.cbt_promo_clicks (code, ip) values (v_c, v_ip);
  update public.cbt_promo_links set clicks = clicks + 1 where code = v_c and active;
  if random() < 0.02 then delete from public.cbt_promo_clicks where at < now() - interval '2 hours'; end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_promo_click(text) to anon, authenticated;

-- ---------- F9: limits that a crowd cannot fill ----------
-- waiting list: only requests of the last 7 days count towards the 1000 limit (5 an hour per connection, as before)
create or replace function public.cbt_request_access(p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  m text := cbt_private.norm_mobile(p_mobile);
  n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name,''),'[<>"`]','','g'),'\s+',' ','g')),60);
  s record;
  h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_raw text := btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  v_ip text := case when v_raw = '' then '' else md5('cbt-access|' || v_raw) end;
begin
  if length(n) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
  if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
  select * into s from students where mobile = m;
  if found then return jsonb_build_object('ok',true,'status',s.status); end if;
  if (select count(*) from students where status = 'pending' and created_at > now() - interval '7 days') >= 1000
     or (v_ip <> '' and (select count(*) from access_requests where ip = v_ip and created_at > now() - interval '1 hour') >= 5) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  insert into students(name,mobile,status) values (n,m,'pending');
  insert into access_requests(ip) values (v_ip);
  return jsonb_build_object('ok',true,'status','pending');
end $$;
grant execute on function public.cbt_request_access(text, text) to anon, authenticated;

-- "Notify me": the shared hourly limit is much higher (10 an hour per connection, as before)
create or replace function public.cbt_store_notify(p_item uuid, p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.cbt_store_items;
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_ip text := public.cbt_store_ip();
begin
  if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  select * into it from public.cbt_store_items where id = p_item and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  if it.buy_on then return jsonb_build_object('ok', false, 'error', 'open'); end if;
  if exists (select 1 from public.cbt_store_notify where item_id = it.id and mobile = v_m) then
    update public.cbt_store_notify set name = v_n where item_id = it.id and mobile = v_m;
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if (v_ip <> '' and (select count(*) from public.cbt_store_notify where ip = v_ip and created_at > now() - interval '1 hour') >= 10)
     or (select count(*) from public.cbt_store_notify where created_at > now() - interval '1 hour') >= 20000 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  insert into public.cbt_store_notify (item_id, mobile, name, ip) values (it.id, v_m, v_n, v_ip);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_store_notify(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v42 installed: paid files, store orders, sign-in tokens, promotion clicks, limits' as status;
