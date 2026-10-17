-- =====================================================================
--  v16: Store — find a series' cover photo even if it is saved in an unknown table / column.
--  Replaces cbt_admin_series_cover from v15. Also lets the store keep its own copy of each series photo.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13, v14).  Safe to run again.
-- =====================================================================

-- the store's own copy of a series photo (saved whenever the admin uploads a cover)
create table if not exists public.cbt_store_covers (
  series_id  text primary key,
  image      text not null,
  updated_at timestamptz not null default now()
);
alter table public.cbt_store_covers enable row level security;
revoke all on public.cbt_store_covers from anon, authenticated;

create or replace function public.cbt_admin_series_cover(p_pw text, p_series text, p_set text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; t record; j text; v text; sc int; best text; best_sc int := -99; best_from text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if coalesce(p_series, '') = '' then return jsonb_build_object('ok', false, 'error', 'series'); end if;

  -- admin uploaded a cover: keep a copy for the store, and update store items of this series
  if p_set is not null then
    if p_set = '' then
      delete from public.cbt_store_covers where series_id = p_series;
    elsif p_set ~ '^data:image/' and length(p_set) <= 600000 then
      insert into public.cbt_store_covers (series_id, image) values (p_series, p_set)
        on conflict (series_id) do update set image = excluded.image, updated_at = now();
      update public.cbt_store_items set image = p_set where series_id = p_series;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  select image into v from public.cbt_store_covers where series_id = p_series;
  if v is not null then return jsonb_build_object('ok', true, 'cover', v, 'from', 'cbt_store_covers'); end if;

  -- look through every table: a row that mentions this series id and holds an image
  for t in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
             and table_name not in ('cbt_store_items', 'cbt_store_orders', 'cbt_store_settings', 'cbt_store_covers',
                                    'cbt_pyq', 'cbt_push_subs', 'cbt_test_alerts', 'cbt_banners') loop
    begin
      execute format('select row_to_json(x)::text from public.%I x where row_to_json(x)::text like $1 and row_to_json(x)::text like $2
                      order by (row_to_json(x)::text ilike ''%%cover%%'') desc limit 1', t.table_name)
        into j using '%' || p_series || '%', '%data:image/%';
      if j is not null then
        v := substring(j from 'data:image/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+');
        if v is not null then
          sc := 0;
          if t.table_name ilike '%cover%' then sc := sc + 4; end if;
          if j ilike '%"cover%' or j ilike '%"kind":"cover"%' then sc := sc + 3; end if;
          if t.table_name ilike '%series%' then sc := sc + 2; end if;
          if t.table_name ilike '%test%' or t.table_name ilike '%result%' or t.table_name ilike '%notice%' or j ilike '%"questions"%' then sc := sc - 6; end if;
          if sc > best_sc then best_sc := sc; best := v; best_from := t.table_name; end if;
        end if;
      end if;
    exception when others then null;
    end;
  end loop;
  if best is not null and best_sc >= 0 then return jsonb_build_object('ok', true, 'cover', best, 'from', best_from); end if;
  return jsonb_build_object('ok', false, 'error', 'no_cover');
end; $$;
grant execute on function public.cbt_admin_series_cover(text, text, text) to anon, authenticated;
drop function if exists public.cbt_admin_series_cover(text, text);

notify pgrst, 'reload schema';
