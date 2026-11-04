-- =====================================================================
--  v54: Free booking. For a series (usually "Coming soon"), the admin can turn on "Free booking" (Admin → Store →
--  Edit, or Store → Coming soon). The store then shows "Book free" instead of "Notify me" / "Buy now": the student
--  books it with their name + mobile, no payment. The booking is a store order of ₹0 marked "Free booking" in
--  Admin → Orders, where you approve & unlock it like any order (for example when the series launches).
--  One free booking per mobile per series; the same limits as orders against spam.
--  Run ONCE in Supabase → SQL Editor (after v53). Safe to run again. Then run supabase_v35_admin_team.sql again
--  (this file re-creates cbt_admin_store_launch).
-- =====================================================================

alter table public.cbt_store_items  add column if not exists free_book boolean not null default false;
alter table public.cbt_store_orders add column if not exists free      boolean not null default false;

-- Public: what the store page shows (as in v32, plus free_book)
create or replace function public.cbt_store()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true,
    'settings', (select jsonb_build_object('upi', upi, 'payee', payee, 'telegram', telegram, 'note', note, 'sections', sections) from public.cbt_store_settings where id = 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle, 'price', price, 'mrp', mrp, 'badge', badge,
              'features', features, 'color', color, 'image', image, 'buy_on', buy_on, 'course', course, 'section', section, 'free_book', free_book)
              order by sort_order, created_at) from public.cbt_store_items where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store() to anon, authenticated;

-- No paid orders for a series whose Buy now is off (as in v31); a free booking is allowed when Free booking is on
create or replace function public.cbt_store_orders_open() returns trigger language plpgsql as $$
begin
  if new.free then
    if not exists (select 1 from public.cbt_store_items where id = new.item_id and free_book) then
      raise exception 'Free booking is off for this test series';
    end if;
  elsif exists (select 1 from public.cbt_store_items where id = new.item_id and not buy_on) then
    raise exception 'This test series is coming soon (Buy now is off)';
  end if;
  return new;
end; $$;

-- Public: "Book free" → a ₹0 order marked free (or the student's earlier free booking of this series)
create or replace function public.cbt_store_book(p_item uuid, p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.cbt_store_items; o public.cbt_store_orders; v_code text; i int := 0;
        v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_ip text := public.cbt_store_ip();
begin
  if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  select * into it from public.cbt_store_items where id = p_item and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  if not it.free_book then return jsonb_build_object('ok', false, 'error', 'off'); end if;
  select * into o from public.cbt_store_orders
   where item_id = it.id and mobile = v_m and free and status <> 'rejected' order by created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'code', o.code, 'title', it.title, 'status', o.status, 'already', true);
  end if;
  if (v_ip <> '' and (select count(*) from public.cbt_store_orders where ip = v_ip and created_at > now() - interval '1 hour') >= 8)
     or (select count(*) from public.cbt_store_orders where mobile = v_m and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.cbt_store_orders where created_at > now() - interval '1 hour') >= 20000 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  loop
    v_code := 'ASP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from public.cbt_store_orders where code = v_code) or i > 5; i := i + 1;
  end loop;
  insert into public.cbt_store_orders (code, item_id, item_title, amount, name, mobile, ip, free)
  values (v_code, it.id, it.title, 0, v_n, v_m, v_ip, true);
  return jsonb_build_object('ok', true, 'code', v_code, 'title', it.title, 'status', 'pending');
end; $$;
revoke all on function public.cbt_store_book(uuid, text, text) from public;
grant execute on function public.cbt_store_book(uuid, text, text) to anon, authenticated;

-- Admin (as in v31, plus 'free' = Free booking on / off): 'get' · 'buy' · 'free' · 'notified' · 'delete'
create or replace function public.cbt_admin_store_launch(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_item uuid; v_m text := right(regexp_replace(coalesce(p_data->>'mobile', ''), '\D', '', 'g'), 10);
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'notify', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'mobile', mobile, 'name', name,
      'created_at', created_at, 'notified_at', notified_at) order by created_at desc) from public.cbt_store_notify), '[]'::jsonb),
      'free', coalesce((select jsonb_object_agg(id, free_book) from public.cbt_store_items), '{}'::jsonb));
  end if;

  v_item := nullif(p_data->>'item', '')::uuid;
  if v_item is null or not exists (select 1 from public.cbt_store_items where id = v_item) then
    return jsonb_build_object('ok', false, 'error', 'item');
  end if;

  if p_action = 'buy' then
    update public.cbt_store_items set buy_on = coalesce((p_data->>'on')::boolean, true) where id = v_item;
    return jsonb_build_object('ok', true);
  elsif p_action = 'free' then
    update public.cbt_store_items set free_book = coalesce((p_data->>'on')::boolean, false) where id = v_item;
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
select 'v54 installed: free booking — now run supabase_v35_admin_team.sql again' as status;
