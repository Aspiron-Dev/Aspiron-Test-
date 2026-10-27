-- =====================================================================
--  v37: Store "Let's study" — when the admin approves a store order (Orders → Approve & unlock), the store shows
--  "Let's study" instead of "Buy now" on that series. It opens the main website, where the student signs in with
--  their mobile number and access code.
--  The store asks with the order codes saved on the student's phone + their mobile number, so nobody can look up
--  someone else's purchases by typing a number. A series counts only while the order is approved (paid), the
--  student's account is approved (not pending or blocked) and the series is still unlocked for them.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 … v36).  Safe to run again.
--  Without it the store simply keeps showing "Buy now".
-- =====================================================================

create or replace function public.cbt_store_mine(p_mobile text, p_codes text[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
  v_codes text[];
begin
  if v_m !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'mobile'); end if;
  -- at most 20 codes, only real order codes (ASP-XXXXX)
  select coalesce(array_agg(c), '{}') into v_codes
    from (select distinct upper(btrim(x)) as c from unnest((coalesce(p_codes, '{}'::text[]))[1:20]) as x) q
   where c ~ '^ASP-[0-9A-F]{5}$';
  if cardinality(v_codes) = 0 then return jsonb_build_object('ok', true, 'items', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(distinct o.item_id)
      from public.cbt_store_orders o
      join public.cbt_store_items it on it.id = o.item_id
      join cbt_private.students st on st.mobile = cbt_private.norm_mobile(o.mobile) and st.status::text not in ('pending', 'blocked')
      cross join lateral (select case when it.series_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                      then it.series_id::uuid end as sid) z
     where o.code = any(v_codes) and o.mobile = v_m and o.status = 'paid'
       -- a series linked in Store → Items must still be unlocked for the student (or free)
       and (z.sid is null
            or exists (select 1 from cbt_private.series sr where sr.id = z.sid and sr.is_free)
            or exists (select 1 from cbt_private.series_access ac where ac.student_id = st.id and ac.series_id = z.sid))
  ), '[]'::jsonb));
end $$;
revoke all on function public.cbt_store_mine(text, text[]) from public;
grant execute on function public.cbt_store_mine(text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v37 installed: store Let''s study' as status;
