-- =====================================================================
--  v19: Store security — stronger anti-spam on orders (per device, per mobile, reuse of open orders),
--  stricter checks on payment details. Run ONCE in Supabase → SQL Editor → paste → Run.  Safe to run again.
-- =====================================================================

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

-- Hard rules inside the database: whatever function saves them, bad values are refused.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cbt_store_settings_safe') then
    alter table public.cbt_store_settings add constraint cbt_store_settings_safe check (
      upi ~ '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$' and payee !~ '[<>"`]' and telegram ~ '^[A-Za-z0-9_]{0,40}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cbt_store_items_safe') then
    alter table public.cbt_store_items add constraint cbt_store_items_safe check (
      price between 1 and 200000 and (mrp is null or mrp between 0 and 1000000)
      and (image = '' or image ~ '^(data:image/(jpeg|png|webp|gif);base64,|https://)')
      and color in ('blue', 'green', 'purple', 'orange', 'red', 'dark')) not valid;
  end if;
end $$;

-- a changes log for payment details (who/when cannot be faked from the page; only the admin functions write here)
create table if not exists public.cbt_store_audit (
  id bigserial primary key, at timestamptz not null default now(), upi text, payee text, telegram text
);
alter table public.cbt_store_audit enable row level security;
revoke all on public.cbt_store_audit from anon, authenticated;
create or replace function public.cbt_store_settings_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.upi is distinct from old.upi or new.payee is distinct from old.payee or new.telegram is distinct from old.telegram then
    insert into public.cbt_store_audit (upi, payee, telegram) values (new.upi, new.payee, new.telegram);
  end if;
  return new;
end; $$;
drop trigger if exists cbt_store_settings_log on public.cbt_store_settings;
create trigger cbt_store_settings_log after update on public.cbt_store_settings for each row execute function public.cbt_store_settings_log();

create or replace function public.cbt_admin_store_audit(p_pw text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc)
    from (select at, upi, payee, telegram from public.cbt_store_audit order by at desc limit 10) x), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_admin_store_audit(text) to anon, authenticated;

notify pgrst, 'reload schema';
