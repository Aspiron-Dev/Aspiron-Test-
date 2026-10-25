-- =====================================================================
--  v30: Promotion links — one tracking link per influencer or campaign.
--  A student who opens  store.html?ref=CODE  is tied to that link, and every order they
--  make is counted for it. The admin panel (Store → Promotions) shows clicks, leads, paid
--  orders, revenue, commission owed and profit, and lets you pause a link, change its
--  commission, mark a bad order as not counted, and record the payouts you make.
--  Commission is paid only on paid, counted orders. The commission is saved on the order
--  when it is marked paid, so changing a link's commission later does not change past payouts.
--  Only the admin password can read or change the tables. Students and the store page only
--  call cbt_promo_click and cbt_promo_attach, and those return just ok.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
--  Needs v13 (store) and v29 (payments).
-- =====================================================================

alter table public.cbt_store_orders add column if not exists promo_code  text;
alter table public.cbt_store_orders add column if not exists promo_rate  int;
alter table public.cbt_store_orders add column if not exists promo_valid boolean not null default true;
alter table public.cbt_store_orders add column if not exists promo_note  text not null default '';
create index if not exists cbt_store_orders_promo on public.cbt_store_orders (promo_code) where promo_code is not null;

create table if not exists public.cbt_promo_links (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  name       text not null default '' check (length(name) <= 80),
  contact    text not null default '' check (length(contact) <= 120),   -- influencer's handle or number (admin only)
  commission int  not null default 25 check (commission between 0 and 100000),   -- ₹ paid per counted paid order
  claimed    int  check (claimed is null or claimed between 0 and 10000000),   -- what the influencer says they brought
  active     boolean not null default true,
  clicks     int  not null default 0,
  note       text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.cbt_promo_payouts (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.cbt_promo_links (id) on delete cascade,
  amount     int  not null check (amount between 1 and 10000000),
  paid_on    date not null default current_date,
  note       text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists cbt_promo_payouts_link on public.cbt_promo_payouts (link_id);

alter table public.cbt_promo_links enable row level security;     -- no policies: only the functions below
alter table public.cbt_promo_payouts enable row level security;
revoke all on public.cbt_promo_links from anon, authenticated;
revoke all on public.cbt_promo_payouts from anon, authenticated;

-- When an order becomes paid, save the link's commission on that order (once).
create or replace function public.cbt_promo_snapshot() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and new.promo_code is not null and new.promo_rate is null then
    new.promo_rate := coalesce((select l.commission from public.cbt_promo_links l where l.code = new.promo_code), 0);
  end if;
  return new;
end; $$;
drop trigger if exists cbt_promo_snapshot_trg on public.cbt_store_orders;
create trigger cbt_promo_snapshot_trg before insert or update on public.cbt_store_orders
  for each row execute function public.cbt_promo_snapshot();

-- Store page: one click counted per link per visit (the page remembers it for the session).
create or replace function public.cbt_promo_click(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.cbt_promo_links set clicks = clicks + 1
   where code = lower(btrim(coalesce(p_code, ''))) and active;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_promo_click(text) to anon, authenticated;

-- Store page: tie a new pending order to the link. The first link wins; a paused link is ignored.
create or replace function public.cbt_promo_attach(p_order text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c text := lower(btrim(coalesce(p_code, '')));
begin
  update public.cbt_store_orders set promo_code = v_c
   where code = upper(btrim(coalesce(p_order, ''))) and promo_code is null and status = 'pending'
     and exists (select 1 from public.cbt_promo_links l where l.code = v_c and l.active);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_promo_attach(text, text) to anon, authenticated;

-- Admin panel: every action needs the admin password.
create or replace function public.cbt_admin_promos(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_id uuid; v_c text; v_n text; v_ct text; v_note text; v_comm int; v_cl int;
        v_on boolean; v_amt int; v_day date; v_ord text; v_valid boolean;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'links', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
          select l.id, l.code, l.name, l.contact, l.commission, l.claimed, l.active, l.clicks, l.note, l.created_at,
                 (select count(*) from public.cbt_store_orders o where o.promo_code = l.code and o.promo_valid and o.status <> 'rejected') as leads,
                 (select count(*) from public.cbt_store_orders o where o.promo_code = l.code and o.promo_valid and o.status = 'paid') as paid_n,
                 (select coalesce(sum(o.amount), 0) from public.cbt_store_orders o where o.promo_code = l.code and o.promo_valid and o.status = 'paid') as revenue,
                 (select coalesce(sum(o.promo_rate), 0) from public.cbt_store_orders o where o.promo_code = l.code and o.promo_valid and o.status = 'paid') as earned,
                 (select coalesce(sum(p.amount), 0) from public.cbt_promo_payouts p where p.link_id = l.id) as paid_out,
                 (select count(*) from public.cbt_store_orders o where o.promo_code = l.code) as orders_all
            from public.cbt_promo_links l) x), '[]'::jsonb),
      'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'link_id', p.link_id, 'amount', p.amount,
                    'paid_on', p.paid_on, 'note', p.note) order by p.paid_on desc, p.created_at desc)
                  from public.cbt_promo_payouts p), '[]'::jsonb));
  end if;

  if p_action = 'orders' then
    v_c := lower(btrim(coalesce(p_data->>'code', '')));
    return jsonb_build_object('ok', true,
      'orders', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.name, 'mobile', o.mobile,
                    'item_title', o.item_title, 'amount', o.amount, 'status', o.status, 'valid', o.promo_valid,
                    'rate', o.promo_rate, 'note', o.promo_note, 'at', o.created_at, 'paid_at', o.paid_at)
                    order by o.created_at desc)
                  from (select * from public.cbt_store_orders where promo_code = v_c order by created_at desc limit 500) o), '[]'::jsonb));
  end if;

  if p_action in ('create', 'update') then
    v_n    := left(btrim(regexp_replace(coalesce(p_data->>'name', ''), '[<>"`\r\t]', '', 'g')), 80);
    v_ct   := left(btrim(regexp_replace(coalesce(p_data->>'contact', ''), '[<>"`\r\t]', '', 'g')), 120);
    v_note := left(btrim(regexp_replace(coalesce(p_data->>'note', ''), '[<>\r\t]', '', 'g')), 500);
    if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    if coalesce(p_data->>'commission', '') !~ '^[0-9]{1,6}$' then return jsonb_build_object('ok', false, 'error', 'commission'); end if;
    v_comm := (p_data->>'commission')::int;
    if coalesce(p_data->>'claimed', '') = '' then v_cl := null;
    elsif p_data->>'claimed' ~ '^[0-9]{1,8}$' then v_cl := (p_data->>'claimed')::int;
    else return jsonb_build_object('ok', false, 'error', 'claimed'); end if;
  end if;

  if p_action = 'create' then
    v_c := lower(btrim(coalesce(p_data->>'code', '')));
    if v_c !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' then return jsonb_build_object('ok', false, 'error', 'code'); end if;
    if exists (select 1 from public.cbt_promo_links where code = v_c) then return jsonb_build_object('ok', false, 'error', 'exists'); end if;
    insert into public.cbt_promo_links (code, name, contact, commission, claimed, note)
    values (v_c, v_n, v_ct, v_comm, v_cl, v_note) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'code', v_c);
  end if;

  if p_action = 'update' then
    if coalesce(p_data->>'id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    v_id := (p_data->>'id')::uuid;
    if coalesce(p_data->>'active', '') !~ '^(true|false)$' and p_data ? 'active' then return jsonb_build_object('ok', false, 'error', 'active'); end if;
    -- the code never changes: links already shared would stop working
    update public.cbt_promo_links set name = v_n, contact = v_ct, commission = v_comm, claimed = v_cl, note = v_note,
           active = coalesce((p_data->>'active')::boolean, active)
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'delete' then
    if coalesce(p_data->>'id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    v_id := (p_data->>'id')::uuid;
    -- a link with orders or payouts is kept for the records: pause it instead
    if exists (select 1 from public.cbt_store_orders o join public.cbt_promo_links l on l.code = o.promo_code where l.id = v_id)
       or exists (select 1 from public.cbt_promo_payouts p where p.link_id = v_id) then
      return jsonb_build_object('ok', false, 'error', 'has_data');
    end if;
    delete from public.cbt_promo_links where id = v_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'set_valid' then
    v_ord   := upper(btrim(coalesce(p_data->>'order', '')));
    v_valid := coalesce((p_data->>'valid')::boolean, true);
    v_note  := left(btrim(regexp_replace(coalesce(p_data->>'note', ''), '[<>\r\t]', '', 'g')), 500);
    update public.cbt_store_orders set promo_valid = v_valid, promo_note = v_note
     where code = v_ord and promo_code is not null;
    if not found then return jsonb_build_object('ok', false, 'error', 'order'); end if;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'payout_add' then
    if coalesce(p_data->>'link_id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    v_id := (p_data->>'link_id')::uuid;
    if coalesce(p_data->>'amount', '') !~ '^[0-9]{1,8}$' or (p_data->>'amount')::int < 1 then
      return jsonb_build_object('ok', false, 'error', 'amount');
    end if;
    v_amt  := (p_data->>'amount')::int;
    v_note := left(btrim(regexp_replace(coalesce(p_data->>'note', ''), '[<>\r\t]', '', 'g')), 300);
    if coalesce(p_data->>'paid_on', '') = '' then v_day := current_date;
    elsif p_data->>'paid_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_day := (p_data->>'paid_on')::date;
    else return jsonb_build_object('ok', false, 'error', 'date'); end if;
    if not exists (select 1 from public.cbt_promo_links where id = v_id) then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    insert into public.cbt_promo_payouts (link_id, amount, paid_on, note) values (v_id, v_amt, v_day, v_note);
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'payout_delete' then
    if coalesce(p_data->>'id', '') !~* '^[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'error', 'payout'); end if;
    delete from public.cbt_promo_payouts where id = (p_data->>'id')::uuid;
    if not found then return jsonb_build_object('ok', false, 'error', 'payout'); end if;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'ping' then return a; end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_promos(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
