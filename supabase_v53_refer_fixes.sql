-- =====================================================================
--  v53: Refer & Earn and wallet — misuse fixes (review of v52)
--  1. Wallet money cannot be spent twice: a pending order keeps holding its wallet money until it is paid, rejected
--     or deleted; an unconfirmed one is released after 48 h by taking the wallet money off the order (it then shows
--     the full amount to pay). Confirming checks the wallet again, and an order is never approved if the wallet
--     would go below ₹0.
--  2. The reward is given only for the order the new student made themselves from the link (the code is kept on
--     that order). Putting someone's number under your link in advance gives nothing.
--  3. The reward is given only when the new student paid at least ₹99 by UPI (Admin can change it: min_paid).
--  4. Wallet balance and wallet payment need the student's sign-in (the student app on the same phone);
--     nobody can see or use another number's wallet any more.
--  5. A team member changing wallets, the referral reward or coupons shows on the owner's bell.
--  Run after v52, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

alter table cbt_private.refer_settings add column if not exists min_paid int not null default 99;
alter table public.cbt_store_orders add column if not exists refer_code text;
-- orders made before this file keep the earlier rule (the number's first link) so nobody loses a reward
insert into cbt_private.settings (key, value) select 'refer_v53_at', (extract(epoch from now()) * 1000)::bigint::text
where not exists (select 1 from cbt_private.settings where key = 'refer_v53_at');

-- ---------- 1. wallet: held by every pending order; stale ones give it back by taking it off the order ----------
create or replace function cbt_private.wallet_balance(p_mobile text) returns int
language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select (coalesce((select sum(amount) from cbt_private.wallet_txn where mobile = p_mobile), 0)
        - coalesce((select sum(wallet_used) from public.cbt_store_orders o where o.mobile = p_mobile and o.wallet_used > 0
                     and o.status in ('paid', 'pending')), 0))::int
$$;
create or replace function cbt_private.wallet_release(p_mobile text) returns void
language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
begin
  update public.cbt_store_orders set amount = amount + wallet_used, wallet_used = 0
   where wallet_used > 0 and status = 'pending' and paid_at is null and created_at < now() - interval '48 hours'
     and (p_mobile is null or mobile = p_mobile);
end $$;
revoke all on function cbt_private.wallet_balance(text), cbt_private.wallet_release(text) from public, anon, authenticated;
select cbt_private.wallet_release(null);
do $$ begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'cbt-wallet-release') then perform cron.unschedule('cbt-wallet-release'); end if;
    perform cron.schedule('cbt-wallet-release', '41 * * * *', 'select cbt_private.wallet_release(null)');
  end if;
end $$;

-- an order that uses the wallet is never approved when the wallet would go below ₹0 (the money was used elsewhere)
create or replace function cbt_private.wallet_guard() returns trigger
language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
begin
  if new.status = 'paid' and old.status <> 'paid' and coalesce(new.wallet_used, 0) > 0 then
    perform pg_advisory_xact_lock(hashtext('cbt-wallet|' || new.mobile));
    if cbt_private.wallet_balance(new.mobile) < 0 then
      raise exception 'wallet_overdrawn: this order uses wallet money that was already used by another order (%). Reject it, or ask for the rest by UPI.', new.code;
    end if;
  end if;
  return new;
end $$;
revoke all on function cbt_private.wallet_guard() from public, anon, authenticated;
drop trigger if exists cbt_store_orders_wallet_guard on public.cbt_store_orders;
create trigger cbt_store_orders_wallet_guard before update of status on public.cbt_store_orders
  for each row execute function cbt_private.wallet_guard();

-- "I have already paid" / "Confirm order": a wallet order is checked again; "Wallet balance" never confirms an amount due
create or replace function public.cbt_store_paid(p_code text, p_mobile text, p_payer text, p_utr text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.cbt_store_orders; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_p text := left(btrim(regexp_replace(coalesce(p_payer, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_u text := upper(left(regexp_replace(coalesce(p_utr, ''), '[^A-Za-z0-9]', '', 'g'), 30));
begin
  if length(v_p) < 2 then return jsonb_build_object('ok', false, 'error', 'payer'); end if;
  if v_u <> '' and length(v_u) < 6 then return jsonb_build_object('ok', false, 'error', 'utr'); end if;
  if public.cbt_store_too_many() then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  perform cbt_private.wallet_release(v_m);
  select * into o from public.cbt_store_orders where code = upper(btrim(coalesce(p_code, ''))) and mobile = v_m;
  if not found then perform public.cbt_store_wrong(); return jsonb_build_object('ok', false, 'error', 'order'); end if;
  if o.status <> 'pending' then return jsonb_build_object('ok', true, 'status', o.status); end if;
  -- v53: a ₹0 "wallet" confirmation only while the wallet really covers it
  if v_p = 'Wallet balance' and coalesce(o.amount, 0) > 0 then return jsonb_build_object('ok', false, 'error', 'wallet', 'amount', o.amount); end if;
  if coalesce(o.wallet_used, 0) > 0 then
    perform pg_advisory_xact_lock(hashtext('cbt-wallet|' || v_m));
    if cbt_private.wallet_balance(v_m) < 0 then return jsonb_build_object('ok', false, 'error', 'wallet'); end if;
  end if;
  update public.cbt_store_orders set payer = v_p, utr = v_u, paid_at = now() where code = o.code;
  return jsonb_build_object('ok', true, 'status', 'pending',
    'utr_seen', v_u <> '' and exists (select 1 from public.cbt_store_orders where utr = v_u and code <> o.code));
end; $$;
grant execute on function public.cbt_store_paid(text, text, text, text) to anon, authenticated;

-- ---------- coupon + wallet on the student's own order (from v52; the wallet needs the sign-in) ----------
drop function if exists public.cbt_store_order_apply(text, text, text, boolean);
create or replace function public.cbt_store_order_apply(p_code text, p_mobile text, p_coupon text, p_wallet boolean,
                                                        p_auth text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare o public.cbt_store_orders; it public.cbt_store_items; c cbt_private.store_coupons; a jsonb;
        v_m text := cbt_private.m10(p_mobile);
        v_cc text := upper(left(regexp_replace(coalesce(p_coupon, ''), '[^A-Za-z0-9_-]', '', 'g'), 24));
        v_off int := 0; v_after int; v_avail int; v_use int := 0;
begin
  if public.cbt_store_too_many() then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  -- v53: the wallet is used only by its owner, signed in to the student app (sign-in token of the same number)
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
grant execute on function public.cbt_store_order_apply(text, text, text, boolean, text, text) to anon;

-- ---------- 2 + 3. the reward belongs to the order made from the link, with at least min_paid paid ----------
-- the store page calls this right after the new student's own order is made (only the buyer knows the order code)
create or replace function public.cbt_refer_order(p_order text, p_mobile text, p_ref text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare v_m text := cbt_private.m10(p_mobile); r record; o public.cbt_store_orders;
        v_c text := lower(left(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'), 20));
begin
  if v_m !~ '^[6-9][0-9]{9}$' or v_c = '' then return jsonb_build_object('ok', true); end if;
  select * into r from cbt_private.refer_codes where code = v_c;
  if not found or r.mobile = v_m then return jsonb_build_object('ok', true); end if;
  select * into o from public.cbt_store_orders where code = upper(btrim(coalesce(p_order, ''))) and mobile = v_m
     and status = 'pending' and refer_code is null and created_at > now() - interval '2 hours' for update;
  if not found then return jsonb_build_object('ok', true); end if;
  -- only new students: no paid order before and no student account
  if exists (select 1 from public.cbt_store_orders where mobile = v_m and status = 'paid')
     or exists (select 1 from cbt_private.students where mobile = v_m) then
    return jsonb_build_object('ok', true);
  end if;
  update public.cbt_store_orders set refer_code = v_c where code = o.code;
  insert into cbt_private.refer_links (mobile, referrer, code, name, ip)
  values (v_m, r.mobile, v_c, left(coalesce(o.name, ''), 60), public.cbt_store_ip()) on conflict (mobile) do nothing;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_refer_order(text, text, text) to anon;

create or replace function cbt_private.refer_on_order() returns trigger
language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare s record; v_ref text; v_cut bigint;
begin
  if tg_op = 'DELETE' then
    delete from cbt_private.wallet_txn where kind = 'refer' and order_code = old.code;
    return old;
  end if;
  if old.status = 'paid' and new.status <> 'paid' then
    delete from cbt_private.wallet_txn where kind = 'refer' and order_code = old.code;
  elsif new.status = 'paid' and old.status <> 'paid' then
    select * into s from cbt_private.refer_settings where id = 1;
    if not (s.active and s.reward > 0 and coalesce(new.amount, 0) >= coalesce(s.min_paid, 99)) then return new; end if;
    -- v53: the order's own link; orders made before v53 keep the number's first link
    v_cut := coalesce((select value::bigint from cbt_private.settings where key = 'refer_v53_at'), 0);
    if new.refer_code is not null then
      select mobile into v_ref from cbt_private.refer_codes where code = new.refer_code;
    elsif (extract(epoch from new.created_at) * 1000)::bigint < v_cut then
      select referrer into v_ref from cbt_private.refer_links where mobile = new.mobile;
    end if;
    if v_ref is null or v_ref = new.mobile then return new; end if;
    -- a new student: no paid order and no student account from before this order
    if exists (select 1 from public.cbt_store_orders where mobile = new.mobile and status = 'paid' and code <> new.code
                                                  and created_at < new.created_at)
       or exists (select 1 from cbt_private.students where mobile = new.mobile and created_at < new.created_at)
       or exists (select 1 from cbt_private.wallet_txn where kind = 'refer' and ref_mobile = new.mobile) then
      return new;
    end if;
    insert into cbt_private.wallet_txn (mobile, amount, kind, order_code, ref_mobile, note)
    values (v_ref, s.reward, 'refer', new.code, new.mobile, left('Referral: ' || coalesce(new.name, '') || ' · ' || coalesce(new.item_title, ''), 300))
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function cbt_private.refer_on_order() from public, anon, authenticated;

-- ---------- 4. the wallet only for its signed-in owner ----------
-- store page without a sign-in: the referral link only (nothing about the wallet or the friends)
create or replace function public.cbt_refer_me(p_mobile text, p_name text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare v_m text := cbt_private.m10(p_mobile); v_ip text := public.cbt_store_ip();
        v_n text := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>"`\r\n\t]', '', 'g')), 60);
begin
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  if p_name is not null and not exists (select 1 from cbt_private.refer_codes where mobile = v_m) then
    if length(v_n) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    if v_ip <> '' and (select count(*) from cbt_private.refer_codes where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('ok', false, 'error', 'busy');
    end if;
    if cbt_private.refer_code_for(v_m, v_n, v_ip) is null then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  end if;
  return (select jsonb_build_object('ok', true, 'signin', true, 'code', (select code from cbt_private.refer_codes where mobile = v_m),
                                    'reward', s.reward, 'active', s.active, 'min_paid', s.min_paid)
            from cbt_private.refer_settings s where s.id = 1);
end $$;
grant execute on function public.cbt_refer_me(text, text) to anon;

-- store page with the student app's sign-in on the same phone: link + wallet
create or replace function public.cbt_refer_wallet(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; s record;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if not coalesce((a->>'ok')::boolean, false) then return a; end if;
  select name, mobile into s from cbt_private.students where id = (a->>'id')::uuid;
  if s.mobile !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  perform cbt_private.refer_code_for(s.mobile, s.name, '');
  perform cbt_private.wallet_release(s.mobile);
  return cbt_private.refer_info(s.mobile) || jsonb_build_object('min_paid', (select min_paid from cbt_private.refer_settings where id = 1));
end $$;
grant execute on function public.cbt_refer_wallet(text, text, text) to anon;

-- joining by link alone gives nothing any more (v53): kept so older pages do not fail, but it records nothing
create or replace function public.cbt_refer_join(p_ref text, p_mobile text, p_name text)
returns jsonb language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select jsonb_build_object('ok', true)
$$;
grant execute on function public.cbt_refer_join(text, text, text) to anon;

-- admin: the minimum paid amount for a reward
create or replace function public.cbt_admin_refer_min(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb);
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if p_action = 'get' then return jsonb_build_object('ok', true, 'min_paid', (select min_paid from cbt_private.refer_settings where id = 1)); end if;
  if p_action = 'set' then
    if coalesce(d->>'min_paid', '') !~ '^[0-9]{1,6}$' then return jsonb_build_object('ok', false, 'error', 'min_paid'); end if;
    update cbt_private.refer_settings set min_paid = (d->>'min_paid')::int, updated_at = now() where id = 1;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_refer_min(text, text, jsonb) to anon;

-- ---------- 5. members' wallet / reward / coupon changes on the owner's bell ----------
create or replace function cbt_private.sec_t_audit() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare k text := new.fn || ':' || new.act;
begin
  if new.result = 'refused' then
    perform sec_event('refused', 'low', new.who, k);
  elsif new.result = '' then
    if k in ('cbt_admin_team:user_save', 'cbt_admin_team:user_delete', 'cbt_admin_team:team_2fa') then
      perform sec_event('team_changed', 'high', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    elsif k in ('cbt_admin_team:owner_password', 'cbt_admin:set_password') then
      perform sec_event('owner_password_changed', 'high', new.who, 'The owner password was changed');
    elsif k = 'session:sign_in' then
      if new.detail like '%recovery code used%' then
        perform sec_event('recovery_code_used', 'high', new.who, 'Signed in with a recovery code');
      end if;
      if new.ip <> '' and not exists (select 1 from admin_audit a where a.fn = 'session' and a.act = 'sign_in' and a.id <> new.id
                                         and a.uid is not distinct from new.uid and a.ip = new.ip and a.at > now() - interval '90 days') then
        perform sec_event('new_place_sign_in', 'info', new.who, left(new.detail, 80));
      end if;
    elsif new.uid is not null and (k in ('cbt_admin:grant', 'cbt_admin_store:order_status', 'cbt_admin_store_order:approve',
                                          'cbt_admin_payments:add', 'cbt_admin_payments:update', 'cbt_admin_payments:delete',
                                          'cbt_admin_edit:order_delete', 'cbt_admin:student_delete',
                                          -- v53: wallet money, referral reward and coupons changed by a member
                                          'cbt_admin_refer:adjust', 'cbt_admin_refer:settings', 'cbt_admin_coupons:set',
                                          'cbt_admin_coupons:bulk', 'cbt_admin_coupons:switch')) then
      perform sec_event('member_access_or_money', 'warn', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    end if;
  end if;
  return null;
end $$;

revoke all on function public.cbt_refer_order(text, text, text), public.cbt_refer_wallet(text, text, text), public.cbt_admin_refer_min(text, text, jsonb),
  public.cbt_store_order_apply(text, text, text, boolean, text, text), public.cbt_refer_me(text, text), public.cbt_refer_join(text, text, text) from public, authenticated;

notify pgrst, 'reload schema';
select 'v53 installed — now run supabase_v35_admin_team.sql again' as status;
