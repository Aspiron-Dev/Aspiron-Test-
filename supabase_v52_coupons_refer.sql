-- =====================================================================
--  v52: Store coupons + Refer & Earn (wallet)
--
--  COUPONS (Admin → Coupons & Refer → Coupons)
--   • Every store item (test series) has at most ONE coupon: a code (e.g. DIWALI), a discount (% or ₹) and an
--     end time (and an optional start time). Only that code works for that series; every other code is refused.
--   • The same code can be put on many series with a different discount each (DIWALI: Biology ₹100 off,
--     Chemistry 20% off …). Removing it (or the end time passing) stops it at once.
--   • The discount is worked out only here, from the price in the database — never from the page.
--     Wrong codes count towards the store's "20 wrong tries an hour" limit (same as wrong order codes).
--
--  REFER & EARN (store page → Refer & earn, student app → Me → Refer & earn)
--   • Every student gets a link  store.html?r=<first name + last 5 digits of the mobile>  (e.g. rahul43210).
--     The link always opens the STORE (never the app).
--   • A new student who opens the link and gives name + mobile on the store is "joined" for the referrer
--     (only new numbers: no earlier paid order, no student account yet, not the referrer's own number;
--     the first link wins). Joining earns nothing.
--   • When that student's FIRST paid order is approved (status → paid, amount > 0) the referrer gets the reward
--     (default ₹25, Admin can change it or pause the programme). Undo / reject / delete of that order takes it back.
--   • The reward goes into a store WALLET. It can never be withdrawn; it can be used for any order on the store
--     (part of the price, or all of it). The wallet amount used is held by the order; a rejected / deleted order
--     (or a pending order left unpaid for 48 h) gives it back by itself.
--   • Admin can see every referrer (joined, bought, earned, used, balance) and add / remove wallet money by hand.
--
--  Run ONCE in Supabase → SQL Editor (after v48 or later). Safe to run again. Then run supabase_v35_admin_team.sql
--  again (it wraps the two new admin functions and gives them their Store permissions).
-- =====================================================================

create schema if not exists cbt_private;

-- ---------- tables (only the functions below can read or change them) ----------
create table if not exists cbt_private.store_coupons (
  item_id    uuid primary key references public.cbt_store_items (id) on delete cascade,
  code       text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  kind       text not null check (kind in ('pct', 'flat')),
  value      int  not null,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint store_coupons_value check ((kind = 'pct' and value between 1 and 100) or (kind = 'flat' and value between 1 and 200000)),
  constraint store_coupons_time check (ends_at > starts_at)
);
create index if not exists store_coupons_code on cbt_private.store_coupons (code);

create table if not exists cbt_private.refer_settings (
  id     int primary key default 1 check (id = 1),
  reward int not null default 25 check (reward between 0 and 10000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into cbt_private.refer_settings (id) values (1) on conflict (id) do nothing;
-- the store's coupon box on / off (Admin → Coupons & Refer → Coupons → "Coupon box on the store"); off = no box, no code works
alter table cbt_private.refer_settings add column if not exists coupons_on boolean not null default true;

-- one referral code per mobile number
create table if not exists cbt_private.refer_codes (
  mobile     text primary key check (mobile ~ '^[6-9][0-9]{9}$'),
  code       text not null unique check (code ~ '^[a-z]{2,10}[0-9]{5}[0-9]{0,2}$'),
  name       text not null default '',
  ip         text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists refer_codes_ip on cbt_private.refer_codes (ip, created_at desc);

-- who brought whom: one row per new student (the first link wins)
create table if not exists cbt_private.refer_links (
  mobile   text primary key check (mobile ~ '^[6-9][0-9]{9}$'),     -- the new student
  referrer text not null check (referrer ~ '^[6-9][0-9]{9}$'),
  code     text not null,
  name     text not null default '',
  ip       text not null default '',
  at       timestamptz not null default now(),
  check (mobile <> referrer)
);
create index if not exists refer_links_ref on cbt_private.refer_links (referrer, at desc);
create index if not exists refer_links_ip on cbt_private.refer_links (ip, at desc);

-- money put INTO a wallet: rewards (kind 'refer') and admin changes (kind 'admin', + or −).
-- Money taken OUT of a wallet is the wallet_used of the student's own orders (see wallet_balance).
create table if not exists cbt_private.wallet_txn (
  id         bigserial primary key,
  mobile     text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  amount     int  not null check (amount between -100000 and 100000 and amount <> 0),
  kind       text not null check (kind in ('refer', 'admin')),
  order_code text,
  ref_mobile text,
  note       text not null default '' check (length(note) <= 300),
  who        text not null default '',
  at         timestamptz not null default now()
);
create index if not exists wallet_txn_mobile on cbt_private.wallet_txn (mobile, at desc);
create unique index if not exists wallet_txn_one_reward on cbt_private.wallet_txn (ref_mobile) where kind = 'refer';
create index if not exists wallet_txn_order on cbt_private.wallet_txn (order_code) where order_code is not null;

alter table cbt_private.store_coupons  enable row level security;
alter table cbt_private.refer_settings enable row level security;
alter table cbt_private.refer_codes    enable row level security;
alter table cbt_private.refer_links    enable row level security;
alter table cbt_private.wallet_txn     enable row level security;
revoke all on cbt_private.store_coupons, cbt_private.refer_settings, cbt_private.refer_codes, cbt_private.refer_links,
              cbt_private.wallet_txn from public, anon, authenticated;
revoke all on sequence cbt_private.wallet_txn_id_seq from public, anon, authenticated;

-- an order remembers its full price, the coupon and the wallet money used; amount = what is paid by UPI
alter table public.cbt_store_orders add column if not exists list_price  int;
alter table public.cbt_store_orders add column if not exists coupon_code text;
alter table public.cbt_store_orders add column if not exists coupon_off  int not null default 0;
alter table public.cbt_store_orders add column if not exists wallet_used int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cbt_store_orders_offers') then
    alter table public.cbt_store_orders add constraint cbt_store_orders_offers
      check (coupon_off >= 0 and wallet_used >= 0 and amount >= 0) not valid;
  end if;
end $$;
create index if not exists cbt_store_orders_wallet on public.cbt_store_orders (mobile) where wallet_used > 0;
create index if not exists cbt_store_orders_coupon on public.cbt_store_orders (coupon_code) where coupon_code is not null;

-- ---------- helpers ----------
create or replace function cbt_private.m10(p text) returns text language sql immutable set search_path = pg_temp as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

-- wallet money free to use: rewards + admin changes − money held by the student's own orders
-- (an approved order; or a pending one whose payment details were sent, or made in the last 48 hours)
create or replace function cbt_private.wallet_balance(p_mobile text) returns int
language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select (coalesce((select sum(amount) from cbt_private.wallet_txn where mobile = p_mobile), 0)
        - coalesce((select sum(wallet_used) from public.cbt_store_orders o where o.mobile = p_mobile and o.wallet_used > 0
                     and (o.status = 'paid' or (o.status = 'pending' and (o.paid_at is not null or o.created_at > now() - interval '48 hours')))), 0))::int
$$;

-- the referral code for a number: first name (a–z) + last 5 digits; another number with the same → one more digit
create or replace function cbt_private.refer_code_for(p_mobile text, p_name text, p_ip text) returns text
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v text; base text; i int := 0;
begin
  select code into v from cbt_private.refer_codes where mobile = p_mobile;
  if v is not null then return v; end if;
  base := left(lower(regexp_replace(split_part(btrim(coalesce(p_name, '')), ' ', 1), '[^A-Za-z]', '', 'g')), 10);
  if length(base) < 2 then base := 'student'; end if;
  base := base || right(p_mobile, 5);
  v := base;
  while exists (select 1 from cbt_private.refer_codes where code = v) loop
    i := i + 1; v := base || i::text;
    if i > 99 then return null; end if;
  end loop;
  insert into cbt_private.refer_codes (mobile, code, name, ip) values (p_mobile, v, left(btrim(coalesce(p_name, '')), 60), coalesce(p_ip, ''))
    on conflict (mobile) do nothing;
  return (select code from cbt_private.refer_codes where mobile = p_mobile);
end $$;

-- what a student sees about their own referrals (only numbers, no names of others)
create or replace function cbt_private.refer_info(p_mobile text) returns jsonb
language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select jsonb_build_object('ok', true,
    'code', (select code from cbt_private.refer_codes where mobile = p_mobile),
    'reward', s.reward, 'active', s.active,
    'joined', (select count(*) from cbt_private.refer_links where referrer = p_mobile),
    'bought', (select count(*) from cbt_private.wallet_txn where mobile = p_mobile and kind = 'refer'),
    'earned', (select coalesce(sum(amount), 0) from cbt_private.wallet_txn where mobile = p_mobile and kind = 'refer'),
    'balance', greatest(0, cbt_private.wallet_balance(p_mobile)))
  from cbt_private.refer_settings s where s.id = 1
$$;

revoke all on function cbt_private.m10(text), cbt_private.wallet_balance(text), cbt_private.refer_code_for(text, text, text),
  cbt_private.refer_info(text) from public, anon, authenticated;

-- ---------- reward when a referred student's first order is approved; taken back on undo / reject / delete ----------
create or replace function cbt_private.refer_on_order() returns trigger
language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare l record; s record;
begin
  if tg_op = 'DELETE' then
    delete from cbt_private.wallet_txn where kind = 'refer' and order_code = old.code;
    return old;
  end if;
  if old.status = 'paid' and new.status <> 'paid' then
    delete from cbt_private.wallet_txn where kind = 'refer' and order_code = old.code;
  elsif new.status = 'paid' and old.status <> 'paid' and coalesce(new.amount, 0) > 0 then
    select * into s from cbt_private.refer_settings where id = 1;
    select * into l from cbt_private.refer_links where mobile = new.mobile;
    if found and s.active and s.reward > 0 and l.referrer <> new.mobile
       and not exists (select 1 from cbt_private.wallet_txn where kind = 'refer' and ref_mobile = new.mobile) then
      insert into cbt_private.wallet_txn (mobile, amount, kind, order_code, ref_mobile, note)
      values (l.referrer, s.reward, 'refer', new.code, new.mobile, left('Referral: ' || coalesce(new.name, '') || ' · ' || coalesce(new.item_title, ''), 300))
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function cbt_private.refer_on_order() from public, anon, authenticated;
drop trigger if exists cbt_store_orders_refer on public.cbt_store_orders;
create trigger cbt_store_orders_refer after update of status or delete on public.cbt_store_orders
  for each row execute function cbt_private.refer_on_order();

-- ---------- store page: apply a coupon and / or the wallet to the student's own pending order ----------
-- p_coupon '' = no coupon. The order must belong to this mobile, be pending, made in the last 24 h and have no payment
-- details yet (after "I have already paid" the amount cannot change any more).
create or replace function public.cbt_store_order_apply(p_code text, p_mobile text, p_coupon text, p_wallet boolean)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare o public.cbt_store_orders; it public.cbt_store_items; c cbt_private.store_coupons;
        v_m text := cbt_private.m10(p_mobile);
        v_cc text := upper(left(regexp_replace(coalesce(p_coupon, ''), '[^A-Za-z0-9_-]', '', 'g'), 24));
        v_off int := 0; v_after int; v_avail int; v_use int := 0;
begin
  if public.cbt_store_too_many() then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
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
    v_off := case when c.kind = 'pct' then floor(it.price * c.value / 100.0)::int else least(c.value, it.price) end;
  end if;
  v_after := greatest(0, it.price - v_off);

  -- one wallet change at a time per number (two orders at the same second cannot both use the same money)
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
grant execute on function public.cbt_store_order_apply(text, text, text, boolean) to anon;

-- ---------- store page: my referral link and wallet (made the first time) ----------
create or replace function public.cbt_refer_me(p_mobile text, p_name text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare v_m text := cbt_private.m10(p_mobile); v_ip text := public.cbt_store_ip();
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
begin
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  -- p_name null = only read (the checkout asks for the wallet balance); with a name the code is made the first time
  if p_name is not null and not exists (select 1 from cbt_private.refer_codes where mobile = v_m) then
    if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    if v_ip <> '' and (select count(*) from cbt_private.refer_codes where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('ok', false, 'error', 'busy');
    end if;
    if cbt_private.refer_code_for(v_m, v_n, v_ip) is null then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  end if;
  return cbt_private.refer_info(v_m);
end $$;
grant execute on function public.cbt_refer_me(text, text) to anon;

-- ---------- store page: a new student opened someone's link (always answers ok; says nothing about anyone) ----------
create or replace function public.cbt_refer_join(p_ref text, p_mobile text, p_name text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare v_m text := cbt_private.m10(p_mobile); v_ip text := public.cbt_store_ip(); r record;
        v_c text := lower(left(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'), 20));
begin
  if v_m !~ '^[6-9][0-9]{9}$' or v_c = '' then return jsonb_build_object('ok', true); end if;
  select * into r from cbt_private.refer_codes where code = v_c;
  if not found or r.mobile = v_m then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from cbt_private.refer_links where mobile = v_m)
     or exists (select 1 from public.cbt_store_orders where mobile = v_m and status = 'paid')
     or exists (select 1 from cbt_private.students where mobile = v_m)
     or (v_ip <> '' and (select count(*) from cbt_private.refer_links where ip = v_ip and at > now() - interval '1 hour') >= 5) then
    return jsonb_build_object('ok', true);
  end if;
  insert into cbt_private.refer_links (mobile, referrer, code, name, ip)
  values (v_m, r.mobile, v_c, left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60), v_ip)
  on conflict (mobile) do nothing;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_refer_join(text, text, text) to anon;

-- ---------- student app (signed in): my link, wallet and the students I brought ----------
create or replace function public.cbt_refer_app(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; s record; r jsonb;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if not coalesce((a->>'ok')::boolean, false) then return a; end if;
  select name, mobile into s from cbt_private.students where id = (a->>'id')::uuid;
  if s.mobile !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  perform cbt_private.refer_code_for(s.mobile, s.name, '');
  r := cbt_private.refer_info(s.mobile);
  -- the students I brought: first name and the last 3 digits only
  return r || jsonb_build_object('list', coalesce((select jsonb_agg(jsonb_build_object(
      'name', split_part(coalesce(nullif(l.name, ''), 'Student'), ' ', 1), 'mobile', '•••••••' || right(l.mobile, 3),
      'at', floor(extract(epoch from l.at) * 1000)::bigint,
      'bought', exists (select 1 from cbt_private.wallet_txn t where t.kind = 'refer' and t.ref_mobile = l.mobile)) order by l.at desc)
    from (select * from cbt_private.refer_links where referrer = s.mobile order by at desc limit 100) l), '[]'::jsonb));
end $$;
grant execute on function public.cbt_refer_app(text, text, text) to anon;

-- ---------- admin: coupons ----------
--  get                                                  → items + their coupon + how often it was used
--  set     {item_id, code, kind 'pct'|'flat', value, ends_at ms, starts_at ms?, active?}
--  bulk    {code, ends_at ms, starts_at ms?, items:[{item_id, kind, value}]}   (the same code on many series)
--  remove  {item_id}       remove_code {code}            (the coupon stops working at once)
create or replace function public.cbt_admin_coupons(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); x jsonb; v_cc text; v_k text; v_v int; v_end timestamptz; v_st timestamptz;
        v_item uuid; n int := 0;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'now', floor(extract(epoch from now()) * 1000)::bigint,
      'on', coalesce((select coupons_on from cbt_private.refer_settings where id = 1), true),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'price', i.price, 'active', i.active,
          'course', to_jsonb(i)->>'course', 'section', to_jsonb(i)->>'section') order by i.sort_order, i.created_at) from public.cbt_store_items i), '[]'::jsonb),
      'coupons', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'code', c.code, 'kind', c.kind, 'value', c.value, 'active', c.active,
          'starts_at', floor(extract(epoch from c.starts_at) * 1000)::bigint, 'ends_at', floor(extract(epoch from c.ends_at) * 1000)::bigint,
          'used', (select count(*) from public.cbt_store_orders o where o.item_id = c.item_id and o.coupon_code = c.code and o.status <> 'rejected'),
          'paid', (select count(*) from public.cbt_store_orders o where o.item_id = c.item_id and o.coupon_code = c.code and o.status = 'paid'),
          'off_total', (select coalesce(sum(o.coupon_off), 0) from public.cbt_store_orders o where o.item_id = c.item_id and o.coupon_code = c.code and o.status = 'paid')))
        from cbt_private.store_coupons c), '[]'::jsonb));
  end if;

  if p_action in ('set', 'bulk') then
    v_cc := upper(btrim(coalesce(d->>'code', '')));
    if v_cc !~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' then return jsonb_build_object('ok', false, 'error', 'code'); end if;
    if coalesce(d->>'ends_at', '') !~ '^[0-9]{10,14}$' then return jsonb_build_object('ok', false, 'error', 'ends_at'); end if;
    v_end := to_timestamp((d->>'ends_at')::bigint / 1000.0);
    v_st := case when coalesce(d->>'starts_at', '') ~ '^[0-9]{10,14}$' then to_timestamp((d->>'starts_at')::bigint / 1000.0) else now() end;
    if v_end <= now() or v_end <= v_st then return jsonb_build_object('ok', false, 'error', 'ends_at'); end if;
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
      insert into cbt_private.store_coupons (item_id, code, kind, value, starts_at, ends_at, active, updated_at)
      values (v_item, v_cc, v_k, v_v, v_st, v_end, coalesce((x->>'active')::boolean, true), now())
      on conflict (item_id) do update set code = excluded.code, kind = excluded.kind, value = excluded.value, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, active = excluded.active, updated_at = now();
      n := n + 1;
    end loop;
    return jsonb_build_object('ok', true, 'saved', n);
  end if;

  if p_action = 'switch' then
    if coalesce(d->>'on', '') !~ '^(true|false)$' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    update cbt_private.refer_settings set coupons_on = (d->>'on')::boolean, updated_at = now() where id = 1;
    return jsonb_build_object('ok', true, 'on', (d->>'on')::boolean);
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
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_coupons(text, text, jsonb) to anon;

-- ---------- admin: refer & earn ----------
--  get                       → settings, every referrer with joined / bought / earned / used / balance, totals
--  detail   {mobile}         → the students they brought, wallet entries, orders paid with the wallet
--  settings {reward, active}
--  adjust   {mobile, amount (+ adds, − removes), note}
create or replace function public.cbt_admin_refer(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); v_m text; v_amt int; v_note text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'settings', (select jsonb_build_object('reward', reward, 'active', active) from cbt_private.refer_settings where id = 1),
      'people', coalesce((select jsonb_agg(to_jsonb(x) order by x.earned desc, x.joined desc, x.created_at desc) from (
          select k.mobile, k.code, k.name, floor(extract(epoch from k.created_at) * 1000)::bigint as created_at,
                 (select count(*) from cbt_private.refer_links l where l.referrer = k.mobile) as joined,
                 (select count(*) from cbt_private.wallet_txn t where t.mobile = k.mobile and t.kind = 'refer') as bought,
                 (select coalesce(sum(amount), 0) from cbt_private.wallet_txn t where t.mobile = k.mobile and t.kind = 'refer') as earned,
                 (select coalesce(sum(amount), 0) from cbt_private.wallet_txn t where t.mobile = k.mobile and t.kind = 'admin') as adjusted,
                 (select coalesce(sum(wallet_used), 0) from public.cbt_store_orders o where o.mobile = k.mobile and o.status = 'paid') as spent,
                 cbt_private.wallet_balance(k.mobile) as balance
            from cbt_private.refer_codes k order by k.created_at desc limit 1000) x
          where x.joined > 0 or x.earned <> 0 or x.adjusted <> 0 or x.spent > 0 or x.balance <> 0), '[]'::jsonb),
      'codes', (select count(*) from cbt_private.refer_codes),
      'joined', (select count(*) from cbt_private.refer_links),
      'bought', (select count(*) from cbt_private.wallet_txn where kind = 'refer'),
      'earned', (select coalesce(sum(amount), 0) from cbt_private.wallet_txn where kind = 'refer'),
      'spent', (select coalesce(sum(wallet_used), 0) from public.cbt_store_orders where status = 'paid'));
  end if;

  if p_action = 'detail' then
    v_m := cbt_private.m10(d->>'mobile');
    return jsonb_build_object('ok', true, 'mobile', v_m, 'balance', cbt_private.wallet_balance(v_m),
      'code', (select code from cbt_private.refer_codes where mobile = v_m),
      'links', coalesce((select jsonb_agg(jsonb_build_object('mobile', l.mobile, 'name', l.name, 'at', floor(extract(epoch from l.at) * 1000)::bigint,
          'bought', exists (select 1 from cbt_private.wallet_txn t where t.kind = 'refer' and t.ref_mobile = l.mobile)) order by l.at desc)
        from (select * from cbt_private.refer_links where referrer = v_m order by at desc limit 300) l), '[]'::jsonb),
      'txns', coalesce((select jsonb_agg(jsonb_build_object('amount', t.amount, 'kind', t.kind, 'order', t.order_code, 'note', t.note, 'who', t.who,
          'at', floor(extract(epoch from t.at) * 1000)::bigint) order by t.at desc)
        from (select * from cbt_private.wallet_txn where mobile = v_m order by at desc limit 300) t), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'item_title', o.item_title, 'wallet_used', o.wallet_used, 'amount', o.amount,
          'status', o.status, 'at', o.created_at) order by o.created_at desc)
        from (select * from public.cbt_store_orders where mobile = v_m and wallet_used > 0 order by created_at desc limit 100) o), '[]'::jsonb));
  end if;

  if p_action = 'settings' then
    if coalesce(d->>'reward', '') !~ '^[0-9]{1,5}$' or (d->>'reward')::int > 10000 then return jsonb_build_object('ok', false, 'error', 'reward'); end if;
    update cbt_private.refer_settings set reward = (d->>'reward')::int, active = coalesce((d->>'active')::boolean, active), updated_at = now() where id = 1;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'adjust' then
    v_m := cbt_private.m10(d->>'mobile');
    if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
    if coalesce(d->>'amount', '') !~ '^-?[0-9]{1,6}$' or (d->>'amount')::int = 0 or abs((d->>'amount')::int) > 100000 then
      return jsonb_build_object('ok', false, 'error', 'amount');
    end if;
    v_amt := (d->>'amount')::int;
    v_note := left(btrim(regexp_replace(coalesce(d->>'note', ''), '[<>\r\t]', '', 'g')), 300);
    if v_amt < 0 and cbt_private.wallet_balance(v_m) + v_amt < 0 then return jsonb_build_object('ok', false, 'error', 'too_much'); end if;
    insert into cbt_private.wallet_txn (mobile, amount, kind, note, who)
    values (v_m, v_amt, 'admin', v_note, coalesce(nullif(current_setting('cbt.who', true), ''), 'Owner'));
    return jsonb_build_object('ok', true, 'balance', cbt_private.wallet_balance(v_m));
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
-- ---------- store page: which offers are on (coupon box, Refer & earn) ----------
create or replace function public.cbt_store_offers()
returns jsonb language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select jsonb_build_object('ok', true, 'coupons', coupons_on, 'refer', active, 'reward', reward) from cbt_private.refer_settings where id = 1
$$;

-- only the website's anon role may call these (never PUBLIC / authenticated)
revoke all on function public.cbt_admin_coupons(text, text, jsonb), public.cbt_admin_refer(text, text, jsonb),
  public.cbt_store_order_apply(text, text, text, boolean), public.cbt_refer_me(text, text), public.cbt_refer_join(text, text, text),
  public.cbt_refer_app(text, text, text), public.cbt_store_offers() from public, authenticated;
grant execute on function public.cbt_admin_coupons(text, text, jsonb), public.cbt_admin_refer(text, text, jsonb),
  public.cbt_store_order_apply(text, text, text, boolean), public.cbt_refer_me(text, text), public.cbt_refer_join(text, text, text),
  public.cbt_refer_app(text, text, text), public.cbt_store_offers() to anon;

notify pgrst, 'reload schema';
select 'v52 installed: store coupons + Refer & Earn wallet — now run supabase_v35_admin_team.sql again' as status;
