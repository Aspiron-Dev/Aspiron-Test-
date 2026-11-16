-- =====================================================================
--  v85: Resources tab — choose the folder of an answer-key PDF, and arrange the folders
--  • An answer-key PDF (Google Drive link on a test) can go in any folder of the series' Resources, for example
--    "Schedule" or "Cumulative". Empty = in the test's own folder (as before), so every link already saved stays put.
--  • The admin can arrange the Resources folders of a series (Schedule on top, then any info folder, then the rest).
--    The order is a list of folder names per series. A folder that is not in the list comes after the listed ones,
--    in today's order.
--  Nothing is deleted. Safe to run again.
--  Run in Supabase → SQL Editor after v84, then run supabase_v35_admin_team.sql AGAIN (it re-wraps the two admin
--  functions changed here; until then only the owner's password can use them).
-- =====================================================================

alter table cbt_private.test_pdfs add column if not exists folder text not null default '';
alter table cbt_private.series_meta add column if not exists res_order jsonb not null default '[]'::jsonb;

-- a folder name as the admin types it: no markup characters, no line breaks, at most 60 letters
create or replace function cbt_private.res_folder(p text) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[<>\\\r\n\t]', '', 'g')), 60)
$$;
revoke all on function cbt_private.res_folder(text) from public, anon, authenticated;

-- ---------- admin: answer-key PDF per test (now with a folder) ----------
-- actions: get | set {id, url, label, folder} | remove {id}
create or replace function public.cbt_admin_test_pdf(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_id text := btrim(coalesce(d->>'id', ''));
  v_url text := btrim(coalesce(d->>'url', ''));
  v_label text := left(btrim(coalesce(d->>'label', '')), 80);
  v_folder text := cbt_private.res_folder(d->>'folder');
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    delete from test_pdfs p where not exists (select 1 from tests t where t.id::text = p.test_id);
    return jsonb_build_object('ok', true, 'v85', true, 'items', coalesce((select jsonb_object_agg(test_id,
      jsonb_build_object('url', url, 'label', label, 'folder', folder)) from test_pdfs), '{}'::jsonb));
  end if;

  if not exists (select 1 from tests t where t.id::text = v_id) then
    return jsonb_build_object('ok', false, 'error', 'test');
  end if;

  if p_action = 'set' then
    if length(v_url) > 500 or v_url !~ '^https://(drive|docs)\.google\.com/[A-Za-z0-9/_?=&%.#~+-]+$' then
      return jsonb_build_object('ok', false, 'error', 'url');
    end if;
    insert into test_pdfs (test_id, url, label, folder) values (v_id, v_url, v_label, v_folder)
    on conflict (test_id) do update set url = excluded.url, label = excluded.label, folder = excluded.folder, updated_at = now();
    return jsonb_build_object('ok', true);
  elsif p_action = 'remove' then
    delete from test_pdfs where test_id = v_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_test_pdf(text, text, jsonb) to anon, authenticated;

-- ---------- students: answer-key PDFs (same rules as v77, plus the folder) ----------
create or replace function public.cbt_test_pdfs(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; t bigint := cbt_private.now_ms();
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_object_agg(p.test_id, jsonb_build_object('url', p.url, 'label', p.label, 'folder', p.folder))
      from cbt_private.test_pdfs p
      join cbt_private.tests tt on tt.id::text = p.test_id
      join jsonb_array_elements(coalesce(c->'series', '[]'::jsonb)) s on s.value->>'id' = tt.series_id::text
     where coalesce((s.value->>'unlocked')::boolean, false)
       and tt.active
       and (tt.practice or coalesce(tt.result_at, tt.closes_at) is null or coalesce(tt.result_at, tt.closes_at) <= t)), '{}'::jsonb));
end $$;
grant execute on function public.cbt_test_pdfs(text, text, text) to anon, authenticated;

-- ---------- students: series page facts (same as v64, plus the folder order 'o') ----------
create or replace function public.cbt_series_meta()
returns jsonb language sql security definer set search_path = cbt_private, public, pg_temp stable as $$
  select jsonb_build_object('ok', true,
    'series', coalesce((select jsonb_object_agg(m.series_id::text, jsonb_build_object('s', m.starts_at, 'e', m.ends_at, 'f', m.features, 'u', m.upgrades, 'o', m.res_order))
                          from series_meta m join series s on s.id = m.series_id where s.active), '{}'::jsonb),
    'syl', coalesce((select jsonb_object_agg(t.test_id::text, t.syllabus)
                       from test_meta t join tests x on x.id = t.test_id where x.active and t.syllabus <> ''), '{}'::jsonb),
    'promo', coalesce((select promo from store_look where id = 1), ''),
    'promo_link', coalesce((select promo_link from store_look where id = 1), ''))
$$;
revoke all on function public.cbt_series_meta() from public;
grant execute on function public.cbt_series_meta() to anon, authenticated;

-- ---------- admin: series files (same as v77, plus 'order' and the order in 'get') ----------
-- actions: get {series_id} | set {id, at} | arrange {series_id, items[{id, folder, sort}]} | order {series_id, names[]}
create or replace function public.cbt_admin_files(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_t text; it jsonb; n int := 0; v_sid uuid; v_o jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'v85', true,
      'files', coalesce((select jsonb_object_agg(id::text, opens_at) from series_files
             where series_id::text = coalesce(d->>'series_id', '') and opens_at is not null), '{}'::jsonb),
      'layout', coalesce((select jsonb_object_agg(id::text, jsonb_build_object('folder', folder, 'sort', sort_order)) from series_files
             where series_id::text = coalesce(d->>'series_id', '')), '{}'::jsonb),
      'order', coalesce((select res_order from series_meta where series_id::text = coalesce(d->>'series_id', '')), '[]'::jsonb));
  elsif p_action = 'set' then
    update series_files set opens_at = case when coalesce(d->>'at', '') ~ '^[0-9]{10,14}$' then (d->>'at')::bigint end
     where id::text = coalesce(d->>'id', '') returning title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'arrange' then
    if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') > 300 then
      return jsonb_build_object('ok', false, 'error', 'items');
    end if;
    for it in select value from jsonb_array_elements(d->'items') loop
      update series_files
         set folder = left(btrim(regexp_replace(coalesce(it->>'folder', ''), '[<>\\\r\n\t]', '', 'g')), 60),
             sort_order = case when coalesce(it->>'sort', '') ~ '^[0-9]{1,5}$' then (it->>'sort')::int else sort_order end
       where id::text = coalesce(it->>'id', '') and series_id::text = coalesce(d->>'series_id', '');
      if found then n := n + 1; end if;
    end loop;
    perform set_config('cbt.detail', n || ' files', true);
    return jsonb_build_object('ok', true, 'n', n);
  elsif p_action = 'order' then
    begin v_sid := (d->>'series_id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'series'); end;
    if v_sid is null or not exists (select 1 from series where id = v_sid) then return jsonb_build_object('ok', false, 'error', 'series'); end if;
    if jsonb_typeof(d->'names') is distinct from 'array' or jsonb_array_length(d->'names') > 100
       or exists (select 1 from jsonb_array_elements(d->'names') v where jsonb_typeof(v) <> 'string') then
      return jsonb_build_object('ok', false, 'error', 'names');
    end if;
    -- clean names, no empty ones, no repeats (first one wins)
    select coalesce(jsonb_agg(x.nm order by x.i), '[]'::jsonb) into v_o from (
      select distinct on (lower(cbt_private.res_folder(v #>> '{}'))) cbt_private.res_folder(v #>> '{}') nm, i
        from jsonb_array_elements(d->'names') with ordinality u(v, i)
       where cbt_private.res_folder(v #>> '{}') <> ''
       order by lower(cbt_private.res_folder(v #>> '{}')), i) x;
    insert into series_meta as m (series_id, res_order, updated_at) values (v_sid, v_o, now())
    on conflict (series_id) do update set res_order = excluded.res_order, updated_at = now();
    perform set_config('cbt.detail', jsonb_array_length(v_o) || ' folders', true);
    return jsonb_build_object('ok', true, 'order', v_o);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_files(text, text, jsonb) to anon, authenticated;
