-- =====================================================================
--  v30: Store — "Explore test series" page: a full description and two demo tests (PDF or photo)
--  for each test series. Students see them on store.html (Description · Resources · Reviews);
--  only the admin panel (admin password) can change them, in Store setup → Edit.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 / v17 / v18).  Safe to run again.
--  Without this file the Explore page still opens; descriptions and demo tests just stay empty.
-- =====================================================================

alter table public.cbt_store_items add column if not exists description text not null default '';

-- Demo test 1 and 2 of each store item. A slot can have a name and no file yet ("Coming soon").
create table if not exists public.cbt_store_demos (
  item_id    uuid not null references public.cbt_store_items(id) on delete cascade,
  slot       int  not null check (slot between 1 and 2),
  title      text not null default '',
  name       text not null default '',
  mime       text not null default '',
  size       int  not null default 0,
  data       text not null default '',             -- data: URL ('' = no file yet)
  updated_at timestamptz not null default now(),
  primary key (item_id, slot)
);
alter table public.cbt_store_demos enable row level security;
revoke all on public.cbt_store_demos from anon, authenticated;

-- Public: description + demo tests (no file data) of the items shown on the store
create or replace function public.cbt_store_explore()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'description', i.description,
    'demos', coalesce((select jsonb_agg(jsonb_build_object('slot', d.slot, 'title', d.title, 'mime', d.mime, 'size', d.size) order by d.slot)
                       from public.cbt_store_demos d where d.item_id = i.id), '[]'::jsonb)))
    from public.cbt_store_items i where i.active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store_explore() to anon, authenticated;

-- Public: the file of one demo test (only for items shown on the store)
create or replace function public.cbt_store_demo(p_item uuid, p_slot int)
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce((select jsonb_build_object('ok', true, 'title', d.title, 'name', d.name, 'mime', d.mime, 'data', d.data)
    from public.cbt_store_demos d join public.cbt_store_items i on i.id = d.item_id and i.active
    where d.item_id = p_item and d.slot = p_slot and d.data <> ''), jsonb_build_object('ok', false, 'error', 'none'));
$$;
grant execute on function public.cbt_store_demo(uuid, int) to anon, authenticated;

-- Admin: 'get' (demo tests of every item, no file data) · 'desc' (save the description)
--        'demo_save' (name and/or a new file of demo test 1 or 2) · 'demo_delete' (remove a demo test)
create or replace function public.cbt_admin_store_explore(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_item uuid; v_slot int; v_data text; v_mime text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'demos', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'slot', slot, 'title', title,
      'name', name, 'mime', mime, 'size', size) order by item_id, slot) from public.cbt_store_demos), '[]'::jsonb));
  end if;

  v_item := nullif(p_data->>'item', '')::uuid;
  if v_item is null or not exists (select 1 from public.cbt_store_items where id = v_item) then
    return jsonb_build_object('ok', false, 'error', 'item');
  end if;

  if p_action = 'desc' then
    update public.cbt_store_items set description = left(coalesce(p_data->>'description', ''), 6000) where id = v_item;
    return jsonb_build_object('ok', true);
  end if;

  v_slot := nullif(p_data->>'slot', '')::int;
  if v_slot is null or v_slot not between 1 and 2 then return jsonb_build_object('ok', false, 'error', 'slot'); end if;

  if p_action = 'demo_delete' then
    delete from public.cbt_store_demos where item_id = v_item and slot = v_slot;
    return jsonb_build_object('ok', true);

  elsif p_action = 'demo_save' then
    v_data := coalesce(p_data->>'data', '');
    if v_data <> '' then
      v_mime := substring(v_data from '^data:([a-z]+/[a-z0-9.+-]+);base64,');
      if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
        return jsonb_build_object('ok', false, 'error', 'type');
      end if;
      if length(v_data) > 7000000 then return jsonb_build_object('ok', false, 'error', 'size'); end if;
    end if;
    insert into public.cbt_store_demos as d (item_id, slot, title, name, mime, size, data)
    values (v_item, v_slot, left(btrim(coalesce(p_data->>'title', '')), 120), left(btrim(coalesce(p_data->>'name', '')), 80),
            coalesce(v_mime, ''), case when v_data = '' then 0 else length(v_data) * 3 / 4 end, v_data)
    on conflict (item_id, slot) do update set title = excluded.title, updated_at = now(),
      name = case when v_data = '' then d.name else excluded.name end,
      mime = case when v_data = '' then d.mime else excluded.mime end,
      size = case when v_data = '' then d.size else excluded.size end,
      data = case when v_data = '' then d.data else excluded.data end;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_store_explore(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
