-- =====================================================================
--  v64: The test series page of the new student design (beta): validity, upgrade plans, test syllabus, promo banner.
--
--  • For each test series (Admin → Series page): when it starts and ends (shown as "Starts on … · Ends on …";
--    after the end date the series moves to Expired), the lines "This series includes …", and the upgrade plans: store
--    items the student can move up to (shown under "Choose a plan" with their price and an Upgrade now button).
--  • For each test: a short syllabus (the "View syllabus" button under the test).
--  • One promo banner on the Tests tab of every series page (picture + optional link).
--  • Students read it with cbt_series_meta (public, read only: dates, plan names, syllabus text; nothing private).
--    Only the admin can change it (cbt_admin_series_meta, Store permission). Nothing else changes.
--
--  Run ONCE in Supabase → SQL Editor (after v63). Safe to run again (it never overwrites what the admin saved).
--  Then run supabase_v35_admin_team.sql again.
-- =====================================================================

create table if not exists cbt_private.series_meta (
  series_id  uuid primary key references cbt_private.series(id) on delete cascade,
  starts_at  bigint,                                   -- ms; null = not shown
  ends_at    bigint,                                   -- ms; null = no end
  features   jsonb not null default '[]'::jsonb,       -- ["Full syllabus tests", …]
  upgrades   jsonb not null default '[]'::jsonb,       -- [{"item":"<store item id>","label":"Pro"}]
  updated_at timestamptz not null default now()
);
alter table cbt_private.series_meta enable row level security;
revoke all on cbt_private.series_meta from public, anon, authenticated;

create table if not exists cbt_private.test_meta (
  test_id  uuid primary key references cbt_private.tests(id) on delete cascade,
  syllabus text not null default ''
);
alter table cbt_private.test_meta enable row level security;
revoke all on cbt_private.test_meta from public, anon, authenticated;

-- the promo banner sits with the Tests page look (v61)
alter table cbt_private.store_look add column if not exists promo text not null default '';
alter table cbt_private.store_look add column if not exists promo_link text not null default '';

-- plain text: no < > or backslash, trimmed, cut to size
create or replace function cbt_private.meta_txt(p text, n int) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[<>\\]', '', 'g')), n)
$$;
revoke all on function cbt_private.meta_txt(text, int) from public, anon, authenticated;

-- Students (no sign-in needed): what the series pages show
create or replace function public.cbt_series_meta()
returns jsonb language sql security definer set search_path = cbt_private, public, pg_temp stable as $$
  select jsonb_build_object('ok', true,
    'series', coalesce((select jsonb_object_agg(m.series_id::text, jsonb_build_object('s', m.starts_at, 'e', m.ends_at, 'f', m.features, 'u', m.upgrades))
                          from series_meta m join series s on s.id = m.series_id where s.active), '{}'::jsonb),
    'syl', coalesce((select jsonb_object_agg(t.test_id::text, t.syllabus)
                       from test_meta t join tests x on x.id = t.test_id where x.active and t.syllabus <> ''), '{}'::jsonb),
    'promo', coalesce((select promo from store_look where id = 1), ''),
    'promo_link', coalesce((select promo_link from store_look where id = 1), ''))
$$;
revoke all on function public.cbt_series_meta() from public;
grant execute on function public.cbt_series_meta() to anon, authenticated;

-- Admin: 'get' · 'save_series' {series_id, starts_at, ends_at, features[], upgrades[{item,label}]}
--        'save_syllabus' {test_id, syllabus} · 'save_promo' {promo? ('' = remove, left out = keep), link}
create or replace function public.cbt_admin_series_meta(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_sid uuid; v_tid uuid; v_s bigint; v_e bigint; v_f jsonb; v_u jsonb; x jsonb; v_link text; v_img text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'promo', coalesce((select promo from store_look where id = 1), ''),
      'promo_link', coalesce((select promo_link from store_look where id = 1), ''),
      'series', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'is_free', s.is_free, 'active', s.active,
           's', m.starts_at, 'e', m.ends_at, 'f', coalesce(m.features, '[]'::jsonb), 'u', coalesce(m.upgrades, '[]'::jsonb),
           'tests', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'syllabus', coalesce(tm.syllabus, ''))
                                order by t.sort_order, t.created_at)
                              from tests t left join test_meta tm on tm.test_id = t.id where t.series_id = s.id and t.active), '[]'::jsonb))
           order by s.sort_order, s.created_at)
         from series s left join series_meta m on m.series_id = s.id), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'price', i.price, 'active', i.active) order by i.sort_order, i.created_at)
                           from public.cbt_store_items i), '[]'::jsonb));
  end if;

  if p_action = 'save_series' then
    begin v_sid := (p_data->>'series_id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'series'); end;
    if not exists (select 1 from series where id = v_sid) then return jsonb_build_object('ok', false, 'error', 'series'); end if;
    begin v_s := nullif(p_data->>'starts_at', '')::bigint; v_e := nullif(p_data->>'ends_at', '')::bigint;
    exception when others then return jsonb_build_object('ok', false, 'error', 'date'); end;
    if v_s is not null and v_e is not null and v_e <= v_s then return jsonb_build_object('ok', false, 'error', 'date'); end if;
    v_f := coalesce(p_data->'features', '[]'::jsonb);
    if jsonb_typeof(v_f) <> 'array' or jsonb_array_length(v_f) > 20
       or exists (select 1 from jsonb_array_elements(v_f) v where jsonb_typeof(v) <> 'string') then
      return jsonb_build_object('ok', false, 'error', 'features');
    end if;
    v_f := coalesce((select jsonb_agg(cbt_private.meta_txt(v #>> '{}', 120)) from jsonb_array_elements(v_f) v
                      where cbt_private.meta_txt(v #>> '{}', 120) <> ''), '[]'::jsonb);
    v_u := coalesce(p_data->'upgrades', '[]'::jsonb);
    if jsonb_typeof(v_u) <> 'array' or jsonb_array_length(v_u) > 4 then return jsonb_build_object('ok', false, 'error', 'upgrades'); end if;
    for x in select value from jsonb_array_elements(v_u) loop
      if jsonb_typeof(x) <> 'object' or coalesce(x->>'item', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.cbt_store_items where id = (x->>'item')::uuid) then
        return jsonb_build_object('ok', false, 'error', 'upgrades');
      end if;
    end loop;
    v_u := coalesce((select jsonb_agg(jsonb_build_object('item', x2->>'item', 'label', cbt_private.meta_txt(x2->>'label', 40)))
                       from jsonb_array_elements(v_u) x2), '[]'::jsonb);
    insert into series_meta as m (series_id, starts_at, ends_at, features, upgrades, updated_at)
    values (v_sid, v_s, v_e, v_f, v_u, now())
    on conflict (series_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      features = excluded.features, upgrades = excluded.upgrades, updated_at = now();
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'save_syllabus' then
    begin v_tid := (p_data->>'test_id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'test'); end;
    if not exists (select 1 from tests where id = v_tid) then return jsonb_build_object('ok', false, 'error', 'test'); end if;
    insert into test_meta as t (test_id, syllabus) values (v_tid, cbt_private.meta_txt(p_data->>'syllabus', 1500))
    on conflict (test_id) do update set syllabus = excluded.syllabus;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'save_promo' then
    v_link := btrim(coalesce(p_data->>'link', ''));
    if length(v_link) > 300 or (v_link <> '' and v_link !~ '^(https://|#/|store\.html#)[^\s"''<>\\]*$') then
      return jsonb_build_object('ok', false, 'error', 'link');
    end if;
    v_img := p_data->>'promo';
    if v_img is not null and v_img <> '' and (v_img !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(v_img) > 500000) then
      return jsonb_build_object('ok', false, 'error', 'image');
    end if;
    update store_look set promo_link = v_link, promo = case when v_img is null then promo else v_img end, updated_at = now() where id = 1;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_series_meta(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_series_meta(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v64 installed: series page (validity, upgrade plans, syllabus, promo) — now run supabase_v35_admin_team.sql again' as status;
