-- =====================================================================
--  v59: Monthly money summary for the Payments page
--  cbt_admin_money(p_pw, 'month', {month:'YYYY-MM'}) returns one month's numbers, all counted the same way:
--    • Sales (list price) of store orders approved in the month, minus the coupon discounts → Net sales
--    • Cash by UPI = amount actually paid on those orders
--    • Wallet used on those orders (money the students had already paid us or got from referrals)
--    • Discount given = coupon discounts on those orders
--    • Returned to wallet = money the admin put back into students' wallets (overpayments, gifts) minus money taken back out (net)
--    • Referral rewards = rewards added to wallets for students who bought through a link
--    • Promotion commission = commission owed to promoters on those orders (counted orders only)
--    • Earnings after returns = Net sales − Returned to wallet
--    • Profit = Earnings after returns − Referral rewards − Promotion commission
--  Read-only. Needs payments:view. Safe to run again.
-- =====================================================================

create or replace function public.cbt_admin_money(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); v_from timestamptz; v_to timestamptz;
        r record; w record; v_ret int := 0;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if p_action <> 'month' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  if coalesce(d->>'month', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then return jsonb_build_object('ok', false, 'error', 'date'); end if;
  v_from := to_timestamp(d->>'month' || '-01', 'YYYY-MM-DD') at time zone 'Asia/Kolkata';
  v_to   := v_from + interval '1 month';

  -- store orders approved in the month (by the day they were paid; older orders by the day they were made)
  select count(*) filter (where true) as n,
         coalesce(sum(coalesce(o.list_price, o.amount + coalesce(o.coupon_off, 0) + coalesce(o.wallet_used, 0))), 0) as list_total,
         coalesce(sum(coalesce(o.coupon_off, 0)), 0) as discount,
         coalesce(sum(o.amount), 0) as upi,
         coalesce(sum(coalesce(o.wallet_used, 0)), 0) as wallet_used,
         count(*) filter (where o.refer_code is not null) as refer_n,
         coalesce(sum(coalesce(o.list_price, o.amount + coalesce(o.coupon_off, 0) + coalesce(o.wallet_used, 0)))
           filter (where o.refer_code is not null), 0) as refer_sales,
         coalesce(sum(coalesce(o.promo_rate, 0)) filter (where o.promo_valid), 0) as promo
    into r
    from public.cbt_store_orders o
   where o.status = 'paid'
     and coalesce(o.paid_at, o.created_at) >= v_from and coalesce(o.paid_at, o.created_at) < v_to;

  -- wallet movements in the month
  select coalesce(sum(amount) filter (where kind = 'admin' and amount > 0), 0) as put,
         coalesce(sum(-amount) filter (where kind = 'admin' and amount < 0), 0) as taken,
         coalesce(sum(amount) filter (where kind = 'refer'), 0) as rewards,
         count(*) filter (where kind = 'refer') as reward_n
    into w
    from cbt_private.wallet_txn
   where at >= v_from and at < v_to;

  return jsonb_build_object('ok', true, 'month', d->>'month',
    'orders', r.n,
    'sales', r.list_total,
    'discount', r.discount,
    'net_sales', r.list_total - r.discount,
    'upi', r.upi,
    'wallet_used', r.wallet_used,
    'returned', w.put - w.taken,
    'returned_in', w.put,
    'returned_out', w.taken,
    'rewards', w.rewards,
    'reward_n', w.reward_n,
    'refer_orders', r.refer_n,
    'refer_sales', r.refer_sales,
    'promo', r.promo,
    'after_returns', (r.list_total - r.discount) - (w.put - w.taken),
    'profit', (r.list_total - r.discount) - (w.put - w.taken) - w.rewards - r.promo,
    'entries', coalesce((select jsonb_agg(x order by x.at desc) from (
        select t.kind, t.amount, t.order_code, t.note, t.public_note,
               coalesce(s.name, 'Student') as name, t.mobile,
               floor(extract(epoch from t.at) * 1000)::bigint as at
          from cbt_private.wallet_txn t
          left join cbt_private.students s on s.mobile = t.mobile
         where t.at >= v_from and t.at < v_to
         order by t.at desc limit 200) x), '[]'::jsonb));
end $$;
revoke all on function public.cbt_admin_money(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_money(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v59 installed: monthly money summary (cbt_admin_money)' as status;
