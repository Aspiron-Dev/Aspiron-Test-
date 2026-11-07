-- =====================================================================
--  v58: Wallet history for the student + "put it in the wallet" for overpayments
--  1. The student (store page and student app) sees the history of their wallet: referral rewards and money the
--     admin added (e.g. "₹100 extra paid for ASP-XXXXX — kept in your wallet"). Who in the team did it is NOT shown.
--  2. Nothing here lets money leave a wallet except a purchase: there is no withdrawal function at all.
--  Run after v56 (or after v53 at least), then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

-- the admin's note for the student: a separate short line the team writes on purpose (the internal note stays private)
alter table cbt_private.wallet_txn add column if not exists public_note text not null default '';

-- refer_info (used by the store page, the app and the refer checks) now also returns the last 30 wallet entries
create or replace function cbt_private.refer_info(p_mobile text) returns jsonb
language sql stable security definer set search_path = cbt_private, public, pg_temp as $$
  select jsonb_build_object('ok', true,
    'code', (select code from cbt_private.refer_codes where mobile = p_mobile),
    'reward', s.reward, 'active', s.active,
    'joined', (select count(*) from cbt_private.refer_links where referrer = p_mobile),
    'bought', (select count(*) from cbt_private.wallet_txn where mobile = p_mobile and kind = 'refer'),
    'earned', (select coalesce(sum(amount), 0) from cbt_private.wallet_txn where mobile = p_mobile and kind = 'refer'),
    'balance', greatest(0, cbt_private.wallet_balance(p_mobile)),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'amount', h.amount,
        'kind', h.kind,
        'order', h.order_code,
        'note', case when h.kind = 'refer' then 'Referral reward' else coalesce(nullif(h.public_note, ''), 'Added by us') end,
        'at', floor(extract(epoch from h.at) * 1000)::bigint) order by h.at desc)
      from (select * from cbt_private.wallet_txn where mobile = p_mobile order by at desc limit 30) h), '[]'::jsonb))
  from cbt_private.refer_settings s where s.id = 1
$$;

-- admin: put money in a wallet. Same as adjust (v52) plus an optional line the student sees and an order it belongs to.
create or replace function public.cbt_admin_refer_put(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); v_m text; v_amt int; v_note text; v_pub text; v_ord text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if p_action <> 'add' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  v_m := cbt_private.m10(d->>'mobile');
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  if coalesce(d->>'amount', '') !~ '^[0-9]{1,6}$' or (d->>'amount')::int < 1 or (d->>'amount')::int > 100000 then
    return jsonb_build_object('ok', false, 'error', 'amount');
  end if;
  v_amt  := (d->>'amount')::int;
  v_note := left(btrim(regexp_replace(coalesce(d->>'note', ''), '[<>\r\t]', '', 'g')), 300);
  v_pub  := left(btrim(regexp_replace(coalesce(d->>'public_note', ''), '[<>"`\r\n\t]', '', 'g')), 120);
  v_ord  := nullif(upper(btrim(coalesce(d->>'order', ''))), '');
  if v_ord is not null and not exists (select 1 from public.cbt_store_orders where code = v_ord and mobile = v_m) then
    return jsonb_build_object('ok', false, 'error', 'order');
  end if;
  insert into cbt_private.wallet_txn (mobile, amount, kind, order_code, note, public_note, who)
  values (v_m, v_amt, 'admin', v_ord, v_note, v_pub, coalesce(nullif(current_setting('cbt.who', true), ''), 'Owner'));
  return jsonb_build_object('ok', true, 'balance', cbt_private.wallet_balance(v_m));
end $$;
revoke all on function public.cbt_admin_refer_put(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_refer_put(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v58 installed: wallet history for the student; put money in a wallet from an order' as status;
