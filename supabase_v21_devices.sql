-- =====================================================================
--  v21: "Already signed in on 2 phones" — the student sees both phones and can sign one out
--  to sign in on the new phone. Limit stays the same (max_devices, usually 2). Max 2 swaps per 24 h.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
--  Uses the existing login table cbt_private.students; it only removes ONE device id from the
--  student's own list when the student asks (with the correct mobile + access code).
-- =====================================================================

-- friendly name + last use of each phone (shown in the list)
create table if not exists public.cbt_device_info (
  student_id uuid not null,
  device     text not null,
  label      text not null default '',
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (student_id, device)
);
alter table public.cbt_device_info enable row level security;
revoke all on public.cbt_device_info from anon, authenticated;

-- every phone a student removed themselves (for the 2-per-day limit and for the admin)
create table if not exists public.cbt_device_swaps (
  id         bigserial primary key,
  student_id uuid not null,
  removed    text not null,
  added      text not null,
  at         timestamptz not null default now()
);
create index if not exists cbt_device_swaps_st on public.cbt_device_swaps (student_id, at desc);
alter table public.cbt_device_swaps enable row level security;
revoke all on public.cbt_device_swaps from anon, authenticated;

-- check mobile + access code exactly like cbt_private.auth does (same lock after 8 wrong tries),
-- but WITHOUT the device check, so a student on a 3rd phone can see their phones
create or replace function cbt_private.check_code(p_mobile text, p_code text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare s cbt_private.students%rowtype; m text := cbt_private.norm_mobile(p_mobile); c text := cbt_private.norm_code(p_code); t bigint := cbt_private.now_ms();
begin
  select * into s from students where mobile = m for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if s.locked_until > t then return jsonb_build_object('ok', false, 'error', 'locked', 'wait', ceil((s.locked_until - t) / 60000.0)::int); end if;
  if s.status = 'pending' then return jsonb_build_object('ok', false, 'error', 'pending'); end if;
  if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
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

-- the phones list for this student; device ids are never sent back, only a short fingerprint
create or replace function public.cbt_devices(p_mobile text, p_code text, p_device text, p_label text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; s cbt_private.students%rowtype; v_used int;
begin
  a := cbt_private.check_code(p_mobile, p_code);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  select * into s from cbt_private.students where id = (a->>'id')::uuid;
  select count(*) into v_used from public.cbt_device_swaps where student_id = s.id and at > now() - interval '24 hours';
  return jsonb_build_object('ok', true, 'max', s.max_devices, 'swaps_left', greatest(0, 2 - v_used),
    'this_ok', p_device = any(coalesce(s.devices, '{}')),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'key', left(md5('dev|' || d), 12),
        'label', coalesce(nullif(i.label, ''), 'Phone ' || n),
        'last', (extract(epoch from coalesce(i.last_seen, s.last_seen)) * 1000)::bigint,
        'this', d = p_device) order by n)
      from unnest(coalesce(s.devices, '{}')) with ordinality as x(d, n)
      left join public.cbt_device_info i on i.student_id = s.id and i.device = x.d), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_devices(text, text, text, text) to anon, authenticated;

-- sign one phone out and sign in on this one (same rules as a normal login after that)
create or replace function public.cbt_device_swap(p_mobile text, p_code text, p_device text, p_remove text, p_label text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; s cbt_private.students%rowtype; v_old text; v_used int;
begin
  if p_device is null or length(p_device) < 8 then return jsonb_build_object('ok', false, 'error', 'device'); end if;
  a := cbt_private.check_code(p_mobile, p_code);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  select * into s from cbt_private.students where id = (a->>'id')::uuid for update;
  select d into v_old from unnest(coalesce(s.devices, '{}')) as x(d) where left(md5('dev|' || d), 12) = p_remove and d <> p_device limit 1;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select count(*) into v_used from public.cbt_device_swaps where student_id = s.id and at > now() - interval '24 hours';
  if v_used >= 2 then return jsonb_build_object('ok', false, 'error', 'swap_limit'); end if;
  update cbt_private.students set devices = array_remove(devices, v_old) where id = s.id;
  delete from public.cbt_device_info where student_id = s.id and device = v_old;
  insert into public.cbt_device_swaps (student_id, removed, added) values (s.id, v_old, p_device);
  a := cbt_private.auth(p_mobile, p_code, p_device);     -- registers this phone, exactly like a login
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  insert into public.cbt_device_info (student_id, device, label) values (s.id, p_device, left(coalesce(p_label, ''), 60))
    on conflict (student_id, device) do update set label = excluded.label, last_seen = now();
  return jsonb_build_object('ok', true, 'name', a->>'name', 'mobile', a->>'mobile', 'now', cbt_private.now_ms());
end; $$;
grant execute on function public.cbt_device_swap(text, text, text, text, text) to anon, authenticated;

-- the app tells us the phone's name (e.g. "Android · Chrome") after sign-in and once a day
create or replace function public.cbt_device_ping(p_mobile text, p_code text, p_device text, p_label text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  insert into public.cbt_device_info (student_id, device, label) values ((a->>'id')::uuid, p_device, left(coalesce(p_label, ''), 60))
    on conflict (student_id, device) do update set label = case when excluded.label <> '' then excluded.label else cbt_device_info.label end, last_seen = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_device_ping(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
