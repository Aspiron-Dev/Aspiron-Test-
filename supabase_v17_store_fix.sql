-- =====================================================================
--  v17: STORE FIX — photos on store cards. Brings every store function to the latest version.
--  Run this ONE file in Supabase → SQL Editor → New query → paste → Run.  Safe to run any number of times,
--  and fine even if v13 / v14 / v15 / v16 were run before (in any order). Needs v13 to have been run once.
-- =====================================================================

alter table public.cbt_store_items add column if not exists image text not null default '';

-- Public: what the store page shows (no login)
create or replace function public.cbt_store()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true,
    'settings', (select jsonb_build_object('upi', upi, 'payee', payee, 'telegram', telegram, 'note', note) from public.cbt_store_settings where id = 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle, 'price', price, 'mrp', mrp, 'badge', badge,
              'features', features, 'color', color, 'image', image) order by sort_order, created_at) from public.cbt_store_items where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store() to anon, authenticated;

-- Admin: products / settings / orders
create or replace function public.cbt_admin_store(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_id uuid; t record; v_img text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'settings', (select to_jsonb(s) - 'id' from public.cbt_store_settings s where id = 1),
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by sort_order, created_at) from public.cbt_store_items i), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from (select * from public.cbt_store_orders order by created_at desc limit 300) o), '[]'::jsonb));

  elsif p_action = 'save_item' then
    v_id := nullif(p_data->>'id', '')::uuid;
    if coalesce(btrim(p_data->>'title'), '') = '' or coalesce((p_data->>'price')::int, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'fields'); end if;
    if v_id is null then
      insert into public.cbt_store_items (title, subtitle, price, mrp, badge, features, color, series_id, active, sort_order, image)
      values (left(p_data->>'title', 80), left(coalesce(p_data->>'subtitle', ''), 200), (p_data->>'price')::int, nullif(p_data->>'mrp', '')::int,
              left(coalesce(p_data->>'badge', ''), 24), coalesce(p_data->'features', '[]'::jsonb), left(coalesce(p_data->>'color', 'blue'), 12),
              left(coalesce(p_data->>'series_id', ''), 60), coalesce((p_data->>'active')::boolean, true), coalesce((p_data->>'sort_order')::int, 0),
              case when length(coalesce(p_data->>'image', '')) <= 1500000 then coalesce(p_data->>'image', '') else '' end)
      returning id into v_id;
    else
      update public.cbt_store_items set title = left(p_data->>'title', 80), subtitle = left(coalesce(p_data->>'subtitle', ''), 200), price = (p_data->>'price')::int,
        mrp = nullif(p_data->>'mrp', '')::int, badge = left(coalesce(p_data->>'badge', ''), 24), features = coalesce(p_data->'features', '[]'::jsonb),
        color = left(coalesce(p_data->>'color', 'blue'), 12), series_id = left(coalesce(p_data->>'series_id', ''), 60),
        active = coalesce((p_data->>'active')::boolean, true), sort_order = coalesce((p_data->>'sort_order')::int, 0),
        image = case when length(coalesce(p_data->>'image', '')) <= 1500000 then coalesce(p_data->>'image', '') else image end
      where id = v_id;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'delete_item' then
    delete from public.cbt_store_items where id = (p_data->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'save_settings' then
    if coalesce(p_data->>'upi', '') !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$' then return jsonb_build_object('ok', false, 'error', 'upi'); end if;
    update public.cbt_store_settings set upi = p_data->>'upi', payee = left(coalesce(p_data->>'payee', ''), 60),
      telegram = left(regexp_replace(coalesce(p_data->>'telegram', ''), '^(https?://)?(t\.me/)?@?', ''), 40),
      note = left(coalesce(p_data->>'note', ''), 300), updated_at = now() where id = 1;
    return jsonb_build_object('ok', true);

  elsif p_action = 'series_cover' then
    -- find the series' cover photo wherever the base setup keeps it (any cbt_ table with id + a cover column)
    for t in select c.table_name, c.column_name, k.column_name as key_col from information_schema.columns c
             join information_schema.columns k on k.table_schema = 'public' and k.table_name = c.table_name and k.column_name in ('id', 'series_id')
             where c.table_schema = 'public' and c.table_name like 'cbt%' and c.table_name not like 'cbt_store%'
               and c.column_name in ('cover', 'cover_img', 'cover_image', 'cover_url', 'image')
             order by (k.column_name = 'series_id') desc loop
      begin
        execute format('select %I::text from public.%I where %I::text = $1 limit 1', t.column_name, t.table_name, t.key_col) into v_img using p_data->>'id';
        if coalesce(v_img, '') ~ '^(data:image/|https://)' then return jsonb_build_object('ok', true, 'cover', v_img); end if;
      exception when others then null;
      end;
    end loop;
    return jsonb_build_object('ok', false, 'error', 'no_cover');

  elsif p_action = 'order_status' then
    update public.cbt_store_orders set status = p_data->>'status' where code = p_data->>'code' and p_data->>'status' in ('pending', 'paid', 'rejected');
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_store(text, text, jsonb) to anon, authenticated;


-- the store's own copy of a series photo (saved whenever the admin uploads a cover)
create table if not exists public.cbt_store_covers (
  series_id  text primary key,
  image      text not null,
  updated_at timestamptz not null default now()
);
alter table public.cbt_store_covers enable row level security;
revoke all on public.cbt_store_covers from anon, authenticated;

create or replace function public.cbt_admin_series_cover(p_pw text, p_series text, p_set text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; t record; j text; v text; sc int; best text; best_sc int := -99; best_from text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if coalesce(p_series, '') = '' then return jsonb_build_object('ok', false, 'error', 'series'); end if;

  -- admin uploaded a cover: keep a copy for the store, and update store items of this series
  if p_set is not null then
    if p_set = '' then
      delete from public.cbt_store_covers where series_id = p_series;
    elsif p_set ~ '^data:image/' and length(p_set) <= 1500000 then
      insert into public.cbt_store_covers (series_id, image) values (p_series, p_set)
        on conflict (series_id) do update set image = excluded.image, updated_at = now();
      update public.cbt_store_items set image = p_set where series_id = p_series;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  select image into v from public.cbt_store_covers where series_id = p_series;
  if v is not null then return jsonb_build_object('ok', true, 'cover', v, 'from', 'cbt_store_covers'); end if;

  -- look through every table: a row that mentions this series id and holds an image
  for t in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
             and table_name not in ('cbt_store_items', 'cbt_store_orders', 'cbt_store_settings', 'cbt_store_covers',
                                    'cbt_pyq', 'cbt_push_subs', 'cbt_test_alerts', 'cbt_banners') loop
    begin
      execute format('select row_to_json(x)::text from public.%I x where row_to_json(x)::text like $1 and row_to_json(x)::text like $2
                      order by (row_to_json(x)::text ilike ''%%cover%%'') desc limit 1', t.table_name)
        into j using '%' || p_series || '%', '%data:image/%';
      if j is not null then
        v := substring(j from 'data:image/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+');
        if v is not null then
          sc := 0;
          if t.table_name ilike '%cover%' then sc := sc + 4; end if;
          if j ilike '%"cover%' or j ilike '%"kind":"cover"%' then sc := sc + 3; end if;
          if t.table_name ilike '%series%' then sc := sc + 2; end if;
          if t.table_name ilike '%test%' or t.table_name ilike '%result%' or t.table_name ilike '%notice%' or j ilike '%"questions"%' then sc := sc - 6; end if;
          if sc > best_sc then best_sc := sc; best := v; best_from := t.table_name; end if;
        end if;
      end if;
    exception when others then null;
    end;
  end loop;
  if best is not null and best_sc >= 0 then return jsonb_build_object('ok', true, 'cover', best, 'from', best_from); end if;
  return jsonb_build_object('ok', false, 'error', 'no_cover');
end; $$;
grant execute on function public.cbt_admin_series_cover(text, text, text) to anon, authenticated;
drop function if exists public.cbt_admin_series_cover(text, text);

notify pgrst, 'reload schema';
