-- =====================================================================
--  v61: The Tests page of the new student design (beta): the poster and the filter.
--
--  • Poster: one picture at the top of the Tests page, edge to edge, under the search bar and behind the two big
--    buttons (Test Series Store / My Test Series). Change it any time (Diwali, Holi, a new batch …) from
--    Admin → Tests page. Best size 1080 × 1350 px (4 : 5). An optional link opens when a student taps it.
--  • Filter: the lists the student can pick from (Exam: NEET, JEE … · Class: 11th, 12th, Dropper · Subject:
--    Physics, Chemistry …) and, for each store test series, which of them it belongs to. All set in the admin.
--  • Nothing in the store, the orders or the classic app changes. Students read it with cbt_store_look (public,
--    read only, like cbt_store); only the admin can change it (cbt_admin_store_look, Store permission).
--
--  Run ONCE in Supabase → SQL Editor (after v60). Safe to run again (it never overwrites what the admin saved).
--  Then run supabase_v35_admin_team.sql again (team members with Store access can use Tests page after that).
--  Until this runs, the app shows a plain poster and guesses the filter from the series name and its course.
-- =====================================================================

create table if not exists cbt_private.store_look (
  id         int primary key default 1 check (id = 1),
  poster     text  not null default '',                   -- data:image/jpeg;base64,… ('' = none)
  link       text  not null default '',                   -- '' | https://… | #/… | store.html#…
  exams      jsonb not null default '["NEET","JEE"]'::jsonb,
  classes    jsonb not null default '["Class 11","Class 12","Dropper"]'::jsonb,
  subjects   jsonb not null default '["Physics","Chemistry","Biology","Maths"]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table cbt_private.store_look enable row level security;
revoke all on cbt_private.store_look from public, anon, authenticated;
insert into cbt_private.store_look (id) values (1) on conflict (id) do nothing;

-- which exams / classes / subjects each store test series is for (empty list = all of them)
create table if not exists cbt_private.store_item_tags (
  item_id  uuid primary key references public.cbt_store_items(id) on delete cascade,
  exams    jsonb not null default '[]'::jsonb,
  classes  jsonb not null default '[]'::jsonb,
  subjects jsonb not null default '[]'::jsonb
);
alter table cbt_private.store_item_tags enable row level security;
revoke all on cbt_private.store_item_tags from public, anon, authenticated;

-- a list of short names: an array of 0..20 strings, each 1..30 characters, no < > " or backslash, no repeats
create or replace function cbt_private.look_list_ok(p jsonb, p_min int) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between p_min and 20
     and not exists (select 1 from jsonb_array_elements(p) v
                      where jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 30
                         or (v #>> '{}') ~ '[<>"\\]' or (v #>> '{}') <> btrim(v #>> '{}'))
     and (select count(distinct lower(v #>> '{}')) from jsonb_array_elements(p) v) = jsonb_array_length(p)
$$;
-- every name of p is in the list l
create or replace function cbt_private.look_in(p jsonb, l jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array' and not exists (select 1 from jsonb_array_elements(p) v where not (l @> jsonb_build_array(v)))
$$;
revoke all on function cbt_private.look_list_ok(jsonb, int), cbt_private.look_in(jsonb, jsonb) from public, anon, authenticated;

-- Students (no sign-in needed, nothing private): the poster, the lists and the tags of the live store items
create or replace function public.cbt_store_look()
returns jsonb language sql security definer set search_path = cbt_private, public, pg_temp stable as $$
  select jsonb_build_object('ok', true,
    'poster', l.poster, 'link', l.link, 'exams', l.exams, 'classes', l.classes, 'subjects', l.subjects,
    'tags', coalesce((select jsonb_object_agg(t.item_id::text, jsonb_build_object('e', t.exams, 'c', t.classes, 's', t.subjects))
                        from store_item_tags t join public.cbt_store_items i on i.id = t.item_id where i.active), '{}'::jsonb))
  from store_look l where l.id = 1
$$;
revoke all on function public.cbt_store_look() from public;
grant execute on function public.cbt_store_look() to anon, authenticated;

-- Admin: 'get' (everything + every store item) · 'save' {poster?, link, exams, classes, subjects, tags:{item_id:{e,c,s}}}
-- poster: leave it out = keep, '' = remove, data:image/jpeg|png|webp;base64,… = new picture.
-- 'save' checks everything first and saves nothing if one thing is wrong.
create or replace function public.cbt_admin_store_look(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_link text; v_img text; v_e jsonb; v_c jsonb; v_s jsonb; k text; x jsonb;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return (select jsonb_build_object('ok', true, 'poster', l.poster, 'link', l.link, 'exams', l.exams, 'classes', l.classes,
              'subjects', l.subjects, 'updated_at', floor(extract(epoch from l.updated_at) * 1000)::bigint,
              'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'course', i.course, 'section', i.section,
                          'active', i.active, 'image', i.image <> '',
                          'e', coalesce(t.exams, '[]'::jsonb), 'c', coalesce(t.classes, '[]'::jsonb), 's', coalesce(t.subjects, '[]'::jsonb))
                          order by i.sort_order, i.created_at)
                         from public.cbt_store_items i left join store_item_tags t on t.item_id = i.id), '[]'::jsonb))
              from store_look l where l.id = 1);
  end if;

  if p_action = 'save' then
    -- 1. check everything
    v_link := btrim(coalesce(p_data->>'link', ''));
    if length(v_link) > 300 or (v_link <> '' and v_link !~ '^(https://|#/|store\.html#)[^\s"''<>\\]*$') then
      return jsonb_build_object('ok', false, 'error', 'link');
    end if;
    v_img := p_data->>'poster';
    if v_img is not null and v_img <> '' and (v_img !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(v_img) > 900000) then
      return jsonb_build_object('ok', false, 'error', 'image');
    end if;
    v_e := coalesce(p_data->'exams', 'null'); v_c := coalesce(p_data->'classes', 'null'); v_s := coalesce(p_data->'subjects', 'null');
    if not look_list_ok(v_e, 1) then return jsonb_build_object('ok', false, 'error', 'list', 'list', 'exams'); end if;
    if not look_list_ok(v_c, 0) then return jsonb_build_object('ok', false, 'error', 'list', 'list', 'classes'); end if;
    if not look_list_ok(v_s, 0) then return jsonb_build_object('ok', false, 'error', 'list', 'list', 'subjects'); end if;
    if p_data ? 'tags' then
      if jsonb_typeof(p_data->'tags') <> 'object' then return jsonb_build_object('ok', false, 'error', 'data'); end if;
      for k, x in select key, value from jsonb_each(p_data->'tags') loop
        if k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (select 1 from public.cbt_store_items where id = k::uuid) then
          return jsonb_build_object('ok', false, 'error', 'item');
        end if;
        if jsonb_typeof(x) <> 'object' or not look_in(coalesce(x->'e', '[]'), v_e) or not look_in(coalesce(x->'c', '[]'), v_c)
           or not look_in(coalesce(x->'s', '[]'), v_s) then
          return jsonb_build_object('ok', false, 'error', 'tags', 'item', k);
        end if;
      end loop;
    end if;
    -- 2. save
    update store_look set link = v_link, exams = v_e, classes = v_c, subjects = v_s,
           poster = case when v_img is null then poster else v_img end, updated_at = now() where id = 1;
    if p_data ? 'tags' then
      for k, x in select key, value from jsonb_each(p_data->'tags') loop
        insert into store_item_tags (item_id, exams, classes, subjects)
        values (k::uuid, coalesce(x->'e', '[]'), coalesce(x->'c', '[]'), coalesce(x->'s', '[]'))
        on conflict (item_id) do update set exams = excluded.exams, classes = excluded.classes, subjects = excluded.subjects;
      end loop;
    end if;
    -- a name taken out of a list is taken off every series too
    update store_item_tags t set
      exams    = coalesce((select jsonb_agg(v) from jsonb_array_elements(t.exams) v where v_e @> jsonb_build_array(v)), '[]'::jsonb),
      classes  = coalesce((select jsonb_agg(v) from jsonb_array_elements(t.classes) v where v_c @> jsonb_build_array(v)), '[]'::jsonb),
      subjects = coalesce((select jsonb_agg(v) from jsonb_array_elements(t.subjects) v where v_s @> jsonb_build_array(v)), '[]'::jsonb)
     where true;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_store_look(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_store_look(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v61 installed: Tests page poster and filter — now run supabase_v35_admin_team.sql again' as status;
