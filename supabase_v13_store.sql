-- =====================================================================
--  v13: Store page (store.html) — paid test series list, UPI payment, Telegram screenshot
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
--  Products, UPI ID, payee name and Telegram can ONLY be changed with the admin password.
-- =====================================================================

create table if not exists public.cbt_store_items (
  id         uuid primary key default gen_random_uuid(),
  title      text    not null,
  subtitle   text    not null default '',
  price      int     not null,                 -- ₹, what the student pays
  mrp        int,                              -- ₹, shown struck-through (optional)
  badge      text    not null default '',      -- e.g. "Bestseller"
  features   jsonb   not null default '[]'::jsonb,   -- list of short lines
  color      text    not null default 'blue',
  series_id  text    not null default '',      -- which series to unlock (for the admin)
  active     boolean not null default true,
  sort_order int     not null default 0,
  created_at timestamptz not null default now()
);
alter table public.cbt_store_items enable row level security;
revoke all on public.cbt_store_items from anon, authenticated;

create table if not exists public.cbt_store_settings (
  id         int primary key default 1 check (id = 1),
  upi        text not null default 'shyamsunder.net@axl',
  payee      text not null default 'SHYAM SUNDER',
  telegram   text not null default 'Students_support_teams',
  note       text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.cbt_store_settings (id) values (1) on conflict (id) do nothing;
alter table public.cbt_store_settings enable row level security;
revoke all on public.cbt_store_settings from anon, authenticated;

-- every "Buy" creates an order with a short code; the code goes in the UPI note and the Telegram message,
-- so the admin can match each screenshot to one order (an old or someone else's screenshot won't match)
create table if not exists public.cbt_store_orders (
  code       text primary key,
  item_id    uuid,
  item_title text not null default '',
  amount     int  not null default 0,
  name       text not null,
  mobile     text not null,
  status     text not null default 'pending',   -- pending | paid | rejected
  created_at timestamptz not null default now()
);
create index if not exists cbt_store_orders_at on public.cbt_store_orders (created_at desc);
create index if not exists cbt_store_orders_mob on public.cbt_store_orders (mobile, created_at desc);
alter table public.cbt_store_orders enable row level security;
revoke all on public.cbt_store_orders from anon, authenticated;

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

alter table public.cbt_store_orders add column if not exists ip text not null default '';
create index if not exists cbt_store_orders_ip on public.cbt_store_orders (ip, created_at desc);

-- Public: student taps "Buy" → order code. Price is taken from the database, never from the page.
-- Anti-spam: same mobile + series within 24 h gets its old code back; limits per device (IP), per mobile and overall.
create or replace function public.cbt_store_order(p_item uuid, p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.cbt_store_items; o public.cbt_store_orders; v_code text; i int := 0;
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
  select * into o from public.cbt_store_orders where mobile = v_m and item_id = it.id and status = 'pending' and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  if found then
    update public.cbt_store_orders set name = v_n, amount = it.price, item_title = it.title where code = o.code;
    return jsonb_build_object('ok', true, 'code', o.code, 'amount', it.price, 'title', it.title);
  end if;
  if (v_ip <> '' and (select count(*) from public.cbt_store_orders where ip = v_ip and created_at > now() - interval '1 hour') >= 8)
     or (select count(*) from public.cbt_store_orders where mobile = v_m and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.cbt_store_orders where created_at > now() - interval '1 hour') >= 1500 then
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


notify pgrst, 'reload schema';
