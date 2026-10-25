-- =====================================================================
--  v32: Store layout — NEET / JEE and sections. Each series has a course (NEET, JEE or both) and a section
--  (e.g. "Full syllabus", "Subject-wise"); the store shows the student's course only, one row per section,
--  left to right. The admin sets course + section in Store setup → Edit and arranges series (◀ ▶) and
--  sections (↑ ↓) in Store setup.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 / v17 / v31).  Safe to run again.
--  Without it the store shows every series in one row.
-- =====================================================================

alter table public.cbt_store_items add column if not exists buy_on  boolean not null default true;   -- from v31
alter table public.cbt_store_items add column if not exists course  text not null default '';        -- '' = NEET and JEE, 'neet', 'jee'
alter table public.cbt_store_items add column if not exists section text not null default '';        -- '' = "More test series"
alter table public.cbt_store_settings add column if not exists sections jsonb not null default '[]'::jsonb;   -- section order

-- Public: what the store page shows (as in v31, plus course, section and the section order)
create or replace function public.cbt_store()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true,
    'settings', (select jsonb_build_object('upi', upi, 'payee', payee, 'telegram', telegram, 'note', note, 'sections', sections) from public.cbt_store_settings where id = 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'subtitle', subtitle, 'price', price, 'mrp', mrp, 'badge', badge,
              'features', features, 'color', color, 'image', image, 'buy_on', buy_on, 'course', course, 'section', section)
              order by sort_order, created_at) from public.cbt_store_items where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store() to anon, authenticated;

-- Admin: 'place' (course + section of one series) · 'order' (series of a section, left to right)
--        'sections' (order of the sections, top to bottom)
create or replace function public.cbt_admin_store_layout(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_item uuid; v_course text := lower(btrim(coalesce(p_data->>'course', '')));
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'place' then
    v_item := nullif(p_data->>'item', '')::uuid;
    if v_item is null or not exists (select 1 from public.cbt_store_items where id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'item');
    end if;
    if v_course not in ('', 'neet', 'jee') then return jsonb_build_object('ok', false, 'error', 'course'); end if;
    update public.cbt_store_items set course = v_course,
      section = left(btrim(regexp_replace(coalesce(p_data->>'section', ''), '[<>"`\r\n\t]', '', 'g')), 40)
     where id = v_item;
    return jsonb_build_object('ok', true);

  elsif p_action = 'order' then
    update public.cbt_store_items t set sort_order = z.ord * 10
      from (select x::uuid as id, ord from jsonb_array_elements_text(coalesce(p_data->'ids', '[]'::jsonb)) with ordinality as e(x, ord)
             where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') z
     where t.id = z.id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'sections' then
    update public.cbt_store_settings set sections = coalesce((
      select jsonb_agg(t order by ord) from (
        select left(btrim(regexp_replace(x, '[<>"`\r\n\t]', '', 'g')), 40) as t, ord
          from jsonb_array_elements_text(coalesce(p_data->'list', '[]'::jsonb)) with ordinality as e(x, ord) limit 30) z
       where t <> ''), '[]'::jsonb)
     where id = 1;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_store_layout(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
