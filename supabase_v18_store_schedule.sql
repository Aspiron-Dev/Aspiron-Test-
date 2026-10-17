-- =====================================================================
--  v18: Store — schedule file (PDF or photo) for each test series; students can view and download it.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13 / v17).  Safe to run again.
-- =====================================================================

create table if not exists public.cbt_store_files (
  item_id    uuid primary key references public.cbt_store_items(id) on delete cascade,
  name       text not null default 'Schedule',
  mime       text not null,
  size       int  not null default 0,
  data       text not null,                    -- data: URL
  updated_at timestamptz not null default now()
);
alter table public.cbt_store_files enable row level security;
revoke all on public.cbt_store_files from anon, authenticated;

-- Public: which store items have a schedule (small list, no file data)
create or replace function public.cbt_store_schedules()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', f.item_id, 'name', f.name, 'mime', f.mime, 'size', f.size))
    from public.cbt_store_files f join public.cbt_store_items i on i.id = f.item_id and i.active), '[]'::jsonb));
$$;
grant execute on function public.cbt_store_schedules() to anon, authenticated;

-- Public: the schedule file of one item (only for items shown on the store)
create or replace function public.cbt_store_schedule(p_item uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce((select jsonb_build_object('ok', true, 'name', f.name, 'mime', f.mime, 'data', f.data)
    from public.cbt_store_files f join public.cbt_store_items i on i.id = f.item_id and i.active where f.item_id = p_item),
    jsonb_build_object('ok', false, 'error', 'none'));
$$;
grant execute on function public.cbt_store_schedule(uuid) to anon, authenticated;

-- Admin: add / replace / remove the schedule of a store item (empty data = remove)
create or replace function public.cbt_admin_store_schedule(p_pw text, p_item uuid, p_data text default '', p_name text default 'Schedule')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_mime text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if coalesce(p_data, '') = '' then
    delete from public.cbt_store_files where item_id = p_item;
    return jsonb_build_object('ok', true);
  end if;
  v_mime := substring(p_data from '^data:([a-z]+/[a-z0-9.+-]+);base64,');
  if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false, 'error', 'type');
  end if;
  if length(p_data) > 7000000 then return jsonb_build_object('ok', false, 'error', 'size'); end if;
  if not exists (select 1 from public.cbt_store_items where id = p_item) then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  insert into public.cbt_store_files (item_id, name, mime, size, data)
  values (p_item, left(coalesce(nullif(btrim(p_name), ''), 'Schedule'), 80), v_mime, (length(p_data) * 3 / 4), p_data)
  on conflict (item_id) do update set name = excluded.name, mime = excluded.mime, size = excluded.size, data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_admin_store_schedule(text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
