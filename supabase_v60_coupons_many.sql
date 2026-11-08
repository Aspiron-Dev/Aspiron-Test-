-- =====================================================================
--  v60: Many coupon codes at the same time + limits + scratch card
--  1. Any number of codes can be live at once, on any series. Each code has its own discount per series, its own
--     start / end, and an optional limit: "valid for the first N orders" (max_uses). A code is never switched off
--     because another code was made. Edit or delete any code at any time (remove one series, or the whole code).
--  2. Store: each series shows how many of a code are left ("37 of 50 left"), without showing the code itself.
--  3. Scratch card: when a student taps Buy now and a live code exists, cbt_store_reveal gives one code to scratch.
--     A code marked private (scratch = false) is never shown there or on the store; it only works when typed.
--  Safety: a pending order holds a use of a limited code only for 24 h (or once payment details are sent), and the
--  limit is checked one order at a time, so it cannot be used up by unpaid orders or passed by two orders at once.
--  Run after v58 (and v59 is fine before it). Safe to run again. Then run supabase_v35_admin_team.sql again.
-- =====================================================================

-- ---------- many codes per series: id as the key; one row per (code, series) ----------
alter table cbt_private.store_coupons add column if not exists id uuid not null default gen_random_uuid();
alter table cbt_private.store_coupons add column if not exists max_uses int check (max_uses is null or max_uses between 1 and 1000000);
alter table cbt_private.store_coupons add column if not exists note text not null default '' check (length(note) <= 200);
-- false = a private code (e.g. for one promoter): it works when typed, but the scratch card and the store never show it
alter table cbt_private.store_coupons add column if not exists scratch boolean not null default true;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'cbt_private.store_coupons'::regclass and conname = 'store_coupons_pkey'
             and pg_get_constraintdef(oid) like 'PRIMARY KEY (item_id)') then
    alter table cbt_private.store_coupons drop constraint store_coupons_pkey;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_coupons_pk_id') then
    alter table cbt_private.store_coupons add constraint store_coupons_pk_id primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_coupons_code_item') then
    alter table cbt_private.store_coupons add constraint store_coupons_code_item unique (code, item_id);
  end if;
end $$;

-- how many orders a code has used, on any series: approved orders, and pending ones that can still be paid (made in the
-- last 24 h, or payment details sent). An unpaid order left behind stops holding a use, so a limit cannot be used up
-- by making orders that are never paid.
create or replace function cbt_private.coupon_used(p_code text) returns int
language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select count(*)::int from public.cbt_store_orders
   where coupon_code = p_code
     and (status = 'paid' or (status = 'pending' and (paid_at is not null or created_at > now() - interval '24 hours')))
$$;
revoke all on function cbt_private.coupon_used(text) from public, anon, authenticated;

-- ---------- student: apply a code to his own order (as v53, plus the limit) ----------
drop function if exists public.cbt_store_order_apply(text, text, text, boolean, text, text);
create or replace function public.cbt_store_order_apply(p_code text, p_mobile text, p_coupon text, p_wallet boolean,
                                                        p_auth text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare o public.cbt_store_orders; it public.cbt_store_items; c cbt_private.store_coupons; a jsonb;
        v_m text := cbt_private.m10(p_mobile);
        v_cc text := upper(left(regexp_replace(coalesce(p_coupon, ''), '[^A-Za-z0-9_-]', '', 'g'), 24));
        v_off int := 0; v_after int; v_avail int; v_use int := 0;
begin
  if public.cbt_store_too_many() then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  if coalesce(p_wallet, false) then
    a := cbt_private.auth(v_m, p_auth, p_device);
    if not coalesce((a->>'ok')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  end if;
  perform cbt_private.wallet_release(v_m);
  select * into o from public.cbt_store_orders where code = upper(btrim(coalesce(p_code, ''))) and mobile = v_m for update;
  if not found then perform public.cbt_store_wrong(); return jsonb_build_object('ok', false, 'error', 'order'); end if;
  if o.status <> 'pending' or coalesce(o.payer, '') <> '' or o.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select * into it from public.cbt_store_items where id = o.item_id and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'item'); end if;

  if v_cc <> '' and not coalesce((select coupons_on from cbt_private.refer_settings where id = 1), true) then
    return jsonb_build_object('ok', false, 'error', 'coupon_off');
  end if;
  if v_cc <> '' then
    select * into c from cbt_private.store_coupons where item_id = it.id and code = v_cc and active;
    if not found then perform public.cbt_store_wrong(); return jsonb_build_object('ok', false, 'error', 'coupon'); end if;
    if now() < c.starts_at then return jsonb_build_object('ok', false, 'error', 'coupon_soon'); end if;
    if now() >= c.ends_at then return jsonb_build_object('ok', false, 'error', 'coupon_expired'); end if;
    if c.max_uses is not null then perform pg_advisory_xact_lock(hashtext('cbt-coupon|' || c.code)); end if;
    if c.max_uses is not null and cbt_private.coupon_used(c.code) >= c.max_uses
       and not (coalesce(o.coupon_code, '') = c.code) then
      return jsonb_build_object('ok', false, 'error', 'coupon_used_up');
    end if;
    v_off := case when c.kind = 'pct' then floor(it.price * c.value / 100.0)::int else least(c.value, it.price) end;
  end if;
  v_after := greatest(0, it.price - v_off);

  perform pg_advisory_xact_lock(hashtext('cbt-wallet|' || v_m));
  v_avail := greatest(0, cbt_private.wallet_balance(v_m) + coalesce(o.wallet_used, 0));
  if coalesce(p_wallet, false) then v_use := least(v_avail, v_after); end if;

  update public.cbt_store_orders set list_price = it.price, item_title = it.title, coupon_code = nullif(v_cc, ''), coupon_off = v_off,
         wallet_used = v_use, amount = v_after - v_use
   where code = o.code;
  return jsonb_build_object('ok', true, 'code', o.code, 'amount', v_after - v_use, 'list_price', it.price, 'coupon_code', nullif(v_cc, ''),
    'coupon_off', v_off, 'wallet_used', v_use, 'wallet_left', v_avail - v_use, 'title', it.title,
    'coupon_ends', case when v_cc <> '' then floor(extract(epoch from c.ends_at) * 1000)::bigint end);
end $$;
grant execute on function public.cbt_store_order_apply(text, text, text, boolean, text, text) to anon;

-- ---------- store page: how many are left of each live coupon, WITHOUT the codes ----------
create or replace function public.cbt_store_coupons_public()
returns jsonb language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select jsonb_build_object('ok', true, 'on', coalesce((select coupons_on from cbt_private.refer_settings where id = 1), true),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'kind', c.kind, 'value', c.value,
        'ends_at', floor(extract(epoch from c.ends_at) * 1000)::bigint,
        'total', c.max_uses,
        'left', case when c.max_uses is null then null else greatest(0, c.max_uses - cbt_private.coupon_used(c.code)) end))
      from cbt_private.store_coupons c
     where c.active and c.scratch and now() >= c.starts_at and now() < c.ends_at
       and (c.max_uses is null or cbt_private.coupon_used(c.code) < c.max_uses)), '[]'::jsonb))
$$;
grant execute on function public.cbt_store_coupons_public() to anon;

-- ---------- scratch card: one live code for this series (the student scratches it, copies it, pastes it) ----------
create or replace function public.cbt_store_reveal(p_item uuid)
returns jsonb language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select coalesce((select jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'value', c.value,
      'ends_at', floor(extract(epoch from c.ends_at) * 1000)::bigint,
      'total', c.max_uses,
      'left', case when c.max_uses is null then null else greatest(0, c.max_uses - cbt_private.coupon_used(c.code)) end)
    from cbt_private.store_coupons c
   where c.item_id = p_item and c.active and c.scratch and now() >= c.starts_at and now() < c.ends_at
     and coalesce((select coupons_on from cbt_private.refer_settings where id = 1), true)
     and (c.max_uses is null or cbt_private.coupon_used(c.code) < c.max_uses)
   order by random() limit 1), jsonb_build_object('ok', true, 'code', null))
$$;
grant execute on function public.cbt_store_reveal(uuid) to anon;

-- ---------- admin: codes ----------
--  get                 → items, every code row (with used / left / orders)
--  set / bulk          → add a code on series (several series at once). A code that already exists on a series is changed.
--  update_code {code, ends_at?, starts_at?, max_uses?, active?, note?}  → changes every series of that code
--  remove_one {item_id, code}  → removes that code from one series
--  remove_code {code}          → removes the code from every series
--  remove {item_id}            → (old) removes every code of one series
--  switch {on}                 → coupon box on / off (kept from v52)
create or replace function public.cbt_admin_coupons(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); x jsonb; v_cc text; v_k text; v_v int; v_end timestamptz; v_st timestamptz;
        v_item uuid; v_max int; n int := 0; v_on boolean;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'now', floor(extract(epoch from now()) * 1000)::bigint,
      'on', coalesce((select coupons_on from cbt_private.refer_settings where id = 1), true),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'price', i.price, 'active', i.active,
          'course', to_jsonb(i)->>'course', 'section', to_jsonb(i)->>'section') order by i.sort_order, i.created_at) from public.cbt_store_items i), '[]'::jsonb),
      'coupons', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'item_id', c.item_id, 'code', c.code, 'kind', c.kind, 'value', c.value,
          'active', c.active, 'note', c.note, 'max_uses', c.max_uses, 'scratch', c.scratch,
          'used', cbt_private.coupon_used(c.code),
          'left', case when c.max_uses is null then null else greatest(0, c.max_uses - cbt_private.coupon_used(c.code)) end,
          'starts_at', floor(extract(epoch from c.starts_at) * 1000)::bigint, 'ends_at', floor(extract(epoch from c.ends_at) * 1000)::bigint,
          'paid', (select count(*) from public.cbt_store_orders o where o.item_id = c.item_id and o.coupon_code = c.code and o.status = 'paid'),
          'off_total', (select coalesce(sum(o.coupon_off), 0) from public.cbt_store_orders o where o.item_id = c.item_id and o.coupon_code = c.code and o.status = 'paid'))
        order by c.code, c.item_id) from cbt_private.store_coupons c), '[]'::jsonb));
  end if;

  if p_action in ('set', 'bulk') then
    v_cc := upper(btrim(coalesce(d->>'code', '')));
    if v_cc !~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' then return jsonb_build_object('ok', false, 'error', 'code'); end if;
    if coalesce(d->>'ends_at', '') !~ '^[0-9]{10,14}$' then return jsonb_build_object('ok', false, 'error', 'ends_at'); end if;
    v_end := to_timestamp((d->>'ends_at')::bigint / 1000.0);
    v_st := case when coalesce(d->>'starts_at', '') ~ '^[0-9]{10,14}$' then to_timestamp((d->>'starts_at')::bigint / 1000.0) else now() end;
    if v_end <= now() or v_end <= v_st then return jsonb_build_object('ok', false, 'error', 'ends_at'); end if;
    if coalesce(d->>'max_uses', '') ~ '^[0-9]{1,7}$' and (d->>'max_uses')::int >= 1 then v_max := (d->>'max_uses')::int; else v_max := null; end if;
    for x in select * from jsonb_array_elements(case when p_action = 'bulk' then coalesce(d->'items', '[]'::jsonb) else jsonb_build_array(d) end) loop
      if coalesce(x->>'item_id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'item'); end if;
      v_item := (x->>'item_id')::uuid;
      if not exists (select 1 from public.cbt_store_items where id = v_item) then return jsonb_build_object('ok', false, 'error', 'item'); end if;
      v_k := coalesce(x->>'kind', '');
      if v_k not in ('pct', 'flat') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
      if coalesce(x->>'value', '') !~ '^[0-9]{1,6}$' then return jsonb_build_object('ok', false, 'error', 'value', 'item_id', v_item); end if;
      v_v := (x->>'value')::int;
      if (v_k = 'pct' and v_v not between 1 and 100) or (v_k = 'flat' and (v_v < 1 or v_v > (select price from public.cbt_store_items where id = v_item))) then
        return jsonb_build_object('ok', false, 'error', 'value', 'item_id', v_item);
      end if;
      insert into cbt_private.store_coupons (item_id, code, kind, value, starts_at, ends_at, active, max_uses, note, scratch, updated_at)
      values (v_item, v_cc, v_k, v_v, v_st, v_end, coalesce((x->>'active')::boolean, true), v_max, left(coalesce(d->>'note', ''), 200),
              coalesce((d->>'scratch')::boolean, true), now())
      on conflict (code, item_id) do update set kind = excluded.kind, value = excluded.value, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, active = excluded.active, max_uses = excluded.max_uses, note = excluded.note,
        scratch = excluded.scratch, updated_at = now();
      n := n + 1;
    end loop;
    return jsonb_build_object('ok', true, 'saved', n);
  end if;

  if p_action = 'update_code' then
    v_cc := upper(btrim(coalesce(d->>'code', '')));
    if not exists (select 1 from cbt_private.store_coupons where code = v_cc) then return jsonb_build_object('ok', false, 'error', 'code'); end if;
    if coalesce(d->>'ends_at', '') ~ '^[0-9]{10,14}$' then
      update cbt_private.store_coupons set ends_at = to_timestamp((d->>'ends_at')::bigint / 1000.0), updated_at = now() where code = v_cc;
    end if;
    if coalesce(d->>'starts_at', '') ~ '^[0-9]{10,14}$' then
      update cbt_private.store_coupons set starts_at = to_timestamp((d->>'starts_at')::bigint / 1000.0), updated_at = now() where code = v_cc;
    end if;
    if d ? 'max_uses' then
      v_max := case when coalesce(d->>'max_uses', '') ~ '^[0-9]{1,7}$' and (d->>'max_uses')::int >= 1 then (d->>'max_uses')::int else null end;
      update cbt_private.store_coupons set max_uses = v_max, updated_at = now() where code = v_cc;
    end if;
    if d ? 'active' then update cbt_private.store_coupons set active = (d->>'active')::boolean, updated_at = now() where code = v_cc; end if;
    if d ? 'scratch' then update cbt_private.store_coupons set scratch = coalesce((d->>'scratch')::boolean, true), updated_at = now() where code = v_cc; end if;
    if d ? 'note' then update cbt_private.store_coupons set note = left(coalesce(d->>'note', ''), 200), updated_at = now() where code = v_cc; end if;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'remove_one' then
    if coalesce(d->>'item_id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'item'); end if;
    delete from cbt_private.store_coupons where item_id = (d->>'item_id')::uuid and code = upper(btrim(coalesce(d->>'code', '')));
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'remove' then
    if coalesce(d->>'item_id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'item'); end if;
    delete from cbt_private.store_coupons where item_id = (d->>'item_id')::uuid;
    return jsonb_build_object('ok', true);
  end if;
  if p_action = 'remove_code' then
    delete from cbt_private.store_coupons where code = upper(btrim(coalesce(d->>'code', '')));
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'removed', n);
  end if;
  if p_action = 'switch' then
    if coalesce(d->>'on', '') !~ '^(true|false)$' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    update cbt_private.refer_settings set coupons_on = (d->>'on')::boolean, updated_at = now() where id = 1;
    return jsonb_build_object('ok', true, 'on', (d->>'on')::boolean);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_coupons(text, text, jsonb) to anon;

-- only the website's anon role may call the public ones
revoke all on function public.cbt_store_coupons_public(), public.cbt_store_reveal(uuid) from public, authenticated;
grant execute on function public.cbt_store_coupons_public(), public.cbt_store_reveal(uuid) to anon;

notify pgrst, 'reload schema';
select 'v60 installed: many coupon codes, limits, scratch card' as status;
