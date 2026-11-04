-- =====================================================================
--  v54: Pre-booking. For a series that is "Coming soon" (Buy now off), the admin can turn on "Pre-booking"
--  (Admin → Store → Edit). The store then shows "Pre-book" instead of "Notify me": the student pays the full price
--  now, with the same checkout as Buy now (UPI → payment details → verify on Telegram / WhatsApp). The order comes to
--  Admin → Orders tagged "Pre-booking"; approve & unlock it like any order (for example when the series launches).
--  Turning Pre-booking off stops new pre-bookings at once (checked in the database too).
--  Run ONCE in Supabase → SQL Editor (after v53). Safe to run again. Then run supabase_v35_admin_team.sql again
--  (this file re-creates cbt_admin_store_launch).
-- =====================================================================

alter table public.cbt_store_items  add column if not exists prebook boolean not null default false;
alter table public.cbt_store_orders add column if not exists prebook boolean not null default false;

-- Public: what the store page shows (as in v32, plus prebook)
create or replace function public.cbt_store()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true,
    'settings', (select jsonb_build_object('upi', upi, 'payee', payee, 'telegram', telegram, 'note', note, 'sections', sections) from public.cbt_store_settings where id = 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle, 'price', price, 'mrp', mrp, 'badge', badge,
              'features', features, 'color', color, 'image', image, 'buy_on', buy_on, 'course', course, 'section', section, 'prebook', prebook)
              order by sort_order, created_at) from public.cbt_store_items where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store() to anon, authenticated;

-- No orders for a series whose Buy now is off (as in v31) — unless Pre-booking is on: then the order is a pre-booking
create or replace function public.cbt_store_orders_open() returns trigger language plpgsql as $$
declare it record;
begin
  select buy_on, prebook into it from public.cbt_store_items where id = new.item_id;
  if found and not it.buy_on then
    if not it.prebook then raise exception 'This test series is coming soon (Buy now is off)'; end if;
    new.prebook := true;
  end if;
  return new;
end; $$;

-- Admin (as in v31, plus 'prebook' = Pre-booking on / off): 'get' · 'buy' · 'prebook' · 'notified' · 'delete'
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
  elsif p_action = 'prebook' then
    update public.cbt_store_items set prebook = coalesce((p_data->>'on')::boolean, false) where id = v_item;
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
select 'v54 installed: pre-booking — now run supabase_v35_admin_team.sql again' as status;
