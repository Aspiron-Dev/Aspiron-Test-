-- =====================================================================
-- v80: Access check (Admin → Students & accounts → Access check). OWNER ONLY, READ ONLY.
--
-- For every PAID series (read from the series table, so a series made later shows up by itself) it lists the
-- students who HAVE the series and what payment is on record for it:
--   order  = a paid store order for an item linked to THIS series (also: an order that was later deleted from
--            Orders and is kept in order_trash, and an order made with an earlier mobile number of the student)
--   other  = no paid order for this series, but a payment is on record: a hand-added payment (it does not name a
--            series) or a paid order for another / unlinked item
--   none   = no payment record at all
-- "none" is NOT "did not pay": students who joined before the store were paid by hand and may never have been
-- recorded. This page only shows; nothing is changed, nobody loses access.
--
-- Run in Supabase → SQL Editor: THIS file first, then supabase_v35_admin_team.sql (adds the owner-only rule).
-- Needs v44 (mobile_changes) and v46 (order_trash). Creates only a function (create / grant / revoke).
-- =====================================================================
create or replace function public.cbt_admin_access_check(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; v jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  -- owner only (a team member has a session user id)
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_action <> 'get' then return jsonb_build_object('ok', false, 'error', 'action'); end if;

  with
  ser as (select id, title, sort_order from series where coalesce(is_free, false) = false),
  acc as (select a.student_id, a.series_id from series_access a join ser on ser.id = a.series_id),
  -- every number a student has had: the current one (always) and earlier ones (only for orders placed before the change).
  -- Numbers that are not 10 digits (empty, no mobile) never match anything.
  nums as (select id as student_id, right(regexp_replace(mobile, '[^0-9]', '', 'g'), 10) as m, 'infinity'::timestamptz as until from students
           union all
           select student_id, right(regexp_replace(old_mobile, '[^0-9]', '', 'g'), 10), at from mobile_changes),
  items as (select id, case when series_id ~ '^[0-9a-fA-F-]{36}$' then series_id::uuid end as series_id from public.cbt_store_items),
  orders as (
    select right(regexp_replace(o.mobile, '[^0-9]', '', 'g'), 10) as m, i.series_id, o.code, coalesce(o.amount, 0) as amount,
           coalesce(o.paid_at, o.created_at) as ts, o.created_at as placed, false as trashed
      from public.cbt_store_orders o left join items i on i.id = o.item_id where o.status = 'paid'
    union all
    select right(regexp_replace(coalesce(t.data->>'mobile', ''), '[^0-9]', '', 'g'), 10), i.series_id, t.code, coalesce(nullif(t.data->>'amount', '')::numeric, 0)::int,
           coalesce(nullif(t.data->>'paid_at', '')::timestamptz, t.at), coalesce(nullif(t.data->>'created_at', '')::timestamptz, t.at), true
      from (select distinct on (code) * from order_trash order by code, id desc) t
      left join items i on i.id::text = t.data->>'item_id'
     where t.data->>'status' = 'paid' and not exists (select 1 from public.cbt_store_orders o2 where o2.code = t.code)
  ),
  -- each paid order once per student it belongs to (one join, then totals)
  mo as (select distinct on (n.student_id, o.code) n.student_id, o.series_id, o.code, o.amount, o.ts, o.trashed
           from orders o join nums n on n.m = o.m and length(n.m) = 10 and o.placed <= n.until
            -- a reused number: an order placed while an earlier student still had it is not the new holder's
            and not exists (select 1 from nums e where e.m = n.m and e.student_id <> n.student_id and e.until < n.until and o.placed <= e.until)
          order by n.student_id, o.code),
  od as (select student_id, series_id, count(*) as n, sum(amount) as amt, max(ts) as ts, (array_agg(code order by ts desc))[1] as code, bool_or(trashed) as trashed
           from mo group by student_id, series_id),
  ot as (select student_id, count(*) as n from mo group by student_id),
  pm as (select student_id, count(*) as n, sum(amount) as amt, max(paid_on) as on_ from public.cbt_payments group by student_id),
  rws as (
    select ac.series_id, ac.student_id, s.name, s.mobile, s.created_at as joined,
           coalesce(od.n, 0) as orders, coalesce(od.amt, 0) as order_amt, od.ts as order_at, od.code as order_code, coalesce(od.trashed, false) as order_trashed,
           coalesce(ot.n, 0) - coalesce(od.n, 0) as other_orders, coalesce(pm.n, 0) as manual_n, coalesce(pm.amt, 0) as manual_amt, pm.on_ as manual_on,
           case when od.n > 0 then 'order' when pm.n > 0 or coalesce(ot.n, 0) - coalesce(od.n, 0) > 0 then 'other' else 'none' end as b
      from acc ac
      join students s on s.id = ac.student_id
      left join od on od.student_id = ac.student_id and od.series_id is not distinct from ac.series_id
      left join ot on ot.student_id = ac.student_id
      left join pm on pm.student_id = ac.student_id
  )
  select jsonb_build_object('ok', true, 'at', cbt_private.now_ms(),
    'series', coalesce(jsonb_agg(jsonb_build_object(
      'id', ser.id, 'title', ser.title,
      'access', (select count(*) from rws where rws.series_id = ser.id),
      'order', (select count(*) from rws where rws.series_id = ser.id and rws.b = 'order'),
      'other', (select count(*) from rws where rws.series_id = ser.id and rws.b = 'other'),
      'none', (select count(*) from rws where rws.series_id = ser.id and rws.b = 'none'),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.student_id, 'name', r.name, 'mobile', r.mobile, 'joined', (extract(epoch from r.joined) * 1000)::bigint, 'b', r.b,
          'orders', r.orders, 'amt', r.order_amt, 'at', (extract(epoch from r.order_at) * 1000)::bigint, 'code', r.order_code, 'trashed', r.order_trashed,
          'other', r.other_orders, 'manual', r.manual_n, 'manual_amt', r.manual_amt, 'manual_on', (extract(epoch from r.manual_on::timestamp) * 1000)::bigint)
        order by case r.b when 'none' then 0 when 'other' then 1 else 2 end, r.name) from rws r where r.series_id = ser.id), '[]'::jsonb)
    ) order by ser.sort_order, ser.title), '[]'::jsonb))
  into v from ser;
  return v;
end $$;
revoke all on function public.cbt_admin_access_check(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_access_check(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v80 installed — now run supabase_v35_admin_team.sql again' as status;
