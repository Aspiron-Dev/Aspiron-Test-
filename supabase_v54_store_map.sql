-- =====================================================================
--  v54: which store item sells which test series (student app → Test series)
--
--  • The student app's Test series page shows the store's price, offer, badge, reviews and a "Buy now" button on
--    every series. Without this file it finds the store item by its NAME, so a store item named differently from its
--    test series (e.g. "NEET Series" for "PAID Series") shows "Get access" instead of "Buy now".
--  • cbt_store_map gives the exact link the admin set in Store → Items (the item's series), for signed-in students only.
--    It returns ids the student already sees: series ids are in cbt_catalog, store item ids are public (cbt_store).
--  • Read only. Nothing about prices, orders or access changes.
--
--  Run in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

create or replace function public.cbt_store_map(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  -- one item per series: the first active one in the store's order
  return jsonb_build_object('ok', true, 'map', coalesce((
    select jsonb_object_agg(m.series_id, m.item_id) from (
      select distinct on (i.series_id) i.series_id, i.id::text as item_id
        from public.cbt_store_items i
        join series s on s.id::text = i.series_id and s.active
       where i.active and i.series_id <> ''
       order by i.series_id, i.sort_order, i.created_at) m), '{}'::jsonb));
end $$;
-- the site calls with the public (anon) key; like every cbt_* function, not open to the authenticated role
revoke all on function public.cbt_store_map(text, text, text) from public, authenticated;
grant execute on function public.cbt_store_map(text, text, text) to anon;

notify pgrst, 'reload schema';
