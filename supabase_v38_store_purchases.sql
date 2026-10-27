-- =====================================================================
--  v38: Store purchases by mobile number. Every student who already bought a series — on any phone, also before
--  v37 — sees "Let's study" instead of "Buy now" on it, and Profile shows their purchase history.
--  A series counts as bought when the student's account is approved (not pending or blocked) and either
--    • their store order for it is approved (Orders → Approve & unlock) and, if it is linked to a series in
--      Store → Items, the series is still unlocked for them (or free), or
--    • the linked series is unlocked for them (for example given by the team before the store existed).
--  The history lists the approved store orders (series, amount, date, order code), then the series given by the team.
--  Hand-added payments (Admin → Payments) stay private to the admin panel.
--  One network can look up at most 30 different numbers an hour, so nobody can list everyone's purchases.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v37).  Safe to run again.
-- =====================================================================

alter table public.cbt_store_orders add column if not exists paid_at timestamptz;   -- from v20 / v29

create table if not exists public.cbt_store_mine_log (
  ip     text not null,
  mobile text not null,
  at     timestamptz not null default now()
);
create index if not exists cbt_store_mine_log_ip on public.cbt_store_mine_log (ip, at desc);
alter table public.cbt_store_mine_log enable row level security;
revoke all on public.cbt_store_mine_log from anon, authenticated;

create or replace function public.cbt_store_purchases(p_mobile text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m   text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
  h     json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_raw text := btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  v_ip  text := case when v_raw = '' then '' else md5('cbt-mine|' || v_raw) end;
  v_st  uuid;
begin
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  -- a phone or network may look up a few numbers (a family), not hundreds
  if v_ip <> '' then
    if (select count(distinct mobile) from public.cbt_store_mine_log
         where ip = v_ip and mobile <> v_m and at > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('ok', false, 'error', 'busy');
    end if;
    if not exists (select 1 from public.cbt_store_mine_log where ip = v_ip and mobile = v_m and at > now() - interval '10 minutes') then
      insert into public.cbt_store_mine_log (ip, mobile) values (v_ip, v_m);
    end if;
    if random() < 0.02 then delete from public.cbt_store_mine_log where at < now() - interval '1 day'; end if;
  end if;

  select s.id into v_st from cbt_private.students s
   where s.mobile = cbt_private.norm_mobile(v_m) and s.status::text not in ('pending', 'blocked')
   limit 1;
  if v_st is null then return jsonb_build_object('ok', true, 'items', '[]'::jsonb, 'history', '[]'::jsonb); end if;

  return (
    with it as (
      select i.id, i.title,
             case when i.series_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then i.series_id::uuid end as sid
        from public.cbt_store_items i),
    acc as (   -- store series whose linked series is unlocked for the student now
      select it.id from it
       where it.sid is not null
         and exists (select 1 from cbt_private.series_access ac where ac.student_id = v_st and ac.series_id = it.sid)),
    paid as (  -- the student's approved store orders
      select o.code, o.item_id, o.item_title, o.amount, coalesce(o.paid_at, o.created_at) as at
        from public.cbt_store_orders o
       where o.mobile = v_m and o.status = 'paid'),
    own as (
      select p.item_id as id from paid p join it on it.id = p.item_id
       where it.sid is null or it.id in (select id from acc)
          or exists (select 1 from cbt_private.series sr where sr.id = it.sid and sr.is_free)
      union
      select id from acc)
    select jsonb_build_object('ok', true,
      'items', coalesce((select jsonb_agg(distinct id) from own), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(q.x order by q.at desc nulls last) from (
          select p.at, jsonb_build_object('item', p.item_id, 'title', coalesce(nullif(it.title, ''), p.item_title),
                                          'amount', p.amount, 'at', p.at, 'code', p.code) as x
            from paid p left join it on it.id = p.item_id
          union all
          select null::timestamptz, jsonb_build_object('item', a.id, 'title', it.title, 'amount', null, 'at', null, 'code', null)
            from acc a join it on it.id = a.id
           where not exists (select 1 from paid p where p.item_id = a.id)
        ) q), '[]'::jsonb)));
end $$;
revoke all on function public.cbt_store_purchases(text) from public;
grant execute on function public.cbt_store_purchases(text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v38 installed: store purchases by mobile number' as status;
