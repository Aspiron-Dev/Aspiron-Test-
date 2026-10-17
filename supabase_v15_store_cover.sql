-- =====================================================================
--  v15: Store — find a series' cover photo wherever it is saved (any column), for "Add from your series"
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 + v14).  Safe to run again.
-- =====================================================================

create or replace function public.cbt_admin_series_cover(p_pw text, p_series text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; t record; v text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  -- every text / json column of every cbt_ table that has an id or series_id column
  for t in select c.table_name, c.column_name, k.column_name as key_col
           from information_schema.columns c
           join information_schema.columns k on k.table_schema = 'public' and k.table_name = c.table_name and k.column_name in ('series_id', 'id')
           where c.table_schema = 'public' and c.table_name like 'cbt%' and c.table_name not like 'cbt_store%'
             and c.table_name not in ('cbt_pyq', 'cbt_push_subs', 'cbt_test_alerts', 'cbt_banners')
             and c.data_type in ('text', 'character varying', 'jsonb', 'json')
           order by (k.column_name = 'series_id') desc, (c.column_name ilike '%cover%') desc loop
    begin
      execute format('select %I::text from public.%I where %I::text = $1 and %I::text like $2 limit 1',
                     t.column_name, t.table_name, t.key_col, t.column_name) into v using p_series, '%data:image/%';
      if v is not null then
        v := substring(v from 'data:image/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+');
        if v is not null then return jsonb_build_object('ok', true, 'cover', v, 'from', t.table_name || '.' || t.column_name); end if;
      end if;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('ok', false, 'error', 'no_cover');
end; $$;
grant execute on function public.cbt_admin_series_cover(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
