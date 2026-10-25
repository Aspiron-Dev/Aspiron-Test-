-- =====================================================================
--  v31: Store — "Coming soon" series. Turn Buy now off for a series that is not launched yet: the store
--  shows "Coming soon · Notify me" instead, students leave their name + mobile, and the admin panel lists
--  them (Store setup → 🔔 waiting) to message on WhatsApp at launch, with a log of who was told.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 / v17 / v19).  Safe to run again.
-- =====================================================================

alter table public.cbt_store_items add column if not exists buy_on boolean not null default true;

-- Public: what the store page shows (as in v17, plus buy_on)
create or replace function public.cbt_store()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true,
    'settings', (select jsonb_build_object('upi', upi, 'payee', payee, 'telegram', telegram, 'note', note) from public.cbt_store_settings where id = 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle, 'price', price, 'mrp', mrp, 'badge', badge,
              'features', features, 'color', color, 'image', image, 'buy_on', buy_on) order by sort_order, created_at) from public.cbt_store_items where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store() to anon, authenticated;

-- No new orders for a series whose Buy now is off, whatever function tries to add one
create or replace function public.cbt_store_orders_open() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.cbt_store_items where id = new.item_id and not buy_on) then
    raise exception 'This test series is coming soon (Buy now is off)';
  end if;
  return new;
end; $$;
drop trigger if exists cbt_store_orders_open on public.cbt_store_orders;
create trigger cbt_store_orders_open before insert on public.cbt_store_orders for each row execute function public.cbt_store_orders_open();

-- "Notify me" requests: one per mobile per series
create table if not exists public.cbt_store_notify (
  item_id     uuid not null references public.cbt_store_items(id) on delete cascade,
  mobile      text not null,
  name        text not null default '',
  ip          text not null default '',
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (item_id, mobile)
);
create index if not exists cbt_store_notify_ip on public.cbt_store_notify (ip, created_at desc);
alter table public.cbt_store_notify enable row level security;
revoke all on public.cbt_store_notify from anon, authenticated;

-- Public: student taps "Notify me" on a coming-soon series. Anti-spam: per device (IP) and overall.
create or replace function public.cbt_store_notify(p_item uuid, p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.cbt_store_items;
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
        v_raw text := btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
        v_ip text := case when v_raw = '' then '' else md5('cbt-store|' || v_raw) end;
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
     or (select count(*) from public.cbt_store_notify where created_at > now() - interval '1 hour') >= 1000 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  insert into public.cbt_store_notify (item_id, mobile, name, ip) values (it.id, v_m, v_n, v_ip);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_store_notify(uuid, text, text) to anon, authenticated;

-- Admin: 'get' (every request) · 'buy' (Buy now on / off) · 'notified' (log that one student, or every
--        student not told yet, was messaged) · 'delete' (remove one request)
create or replace function public.cbt_admin_store_launch(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_item uuid; v_m text := right(regexp_replace(coalesce(p_data->>'mobile', ''), '\D', '', 'g'), 10);
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'notify', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'mobile', mobile, 'name', name,
      'created_at', created_at, 'notified_at', notified_at) order by created_at desc) from public.cbt_store_notify), '[]'::jsonb));
  end if;

  v_item := nullif(p_data->>'item', '')::uuid;
  if v_item is null or not exists (select 1 from public.cbt_store_items where id = v_item) then
    return jsonb_build_object('ok', false, 'error', 'item');
  end if;

  if p_action = 'buy' then
    update public.cbt_store_items set buy_on = coalesce((p_data->>'on')::boolean, true) where id = v_item;
    return jsonb_build_object('ok', true);
  elsif p_action = 'notified' then
    update public.cbt_store_notify set notified_at = now()
     where item_id = v_item and (case when v_m = '' then notified_at is null else mobile = v_m end);
    return jsonb_build_object('ok', true);
  elsif p_action = 'delete' then
    delete from public.cbt_store_notify where item_id = v_item and mobile = v_m;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_store_launch(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
