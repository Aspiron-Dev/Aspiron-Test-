-- =====================================================================
--  v9: Home banners (promo slider on the student Home page)
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again.
-- =====================================================================

create table if not exists public.cbt_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default '',
  body        text        not null default '',
  image       text,                       -- data:image/... (compressed in the admin panel)
  link        text        not null default '',
  sort        int         not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);
alter table public.cbt_banners enable row level security;   -- no policies: only the functions below can read/write
revoke all on public.cbt_banners from anon, authenticated;

-- Students: list of live banners (no login needed, nothing private in it)
create or replace function public.cbt_banners()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'items', coalesce(
    (select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'text', body, 'img', image, 'link', link) order by sort, created_at)
       from public.cbt_banners where active), '[]'::jsonb));
$$;
grant execute on function public.cbt_banners() to anon, authenticated;

-- Admin: list / save / toggle / delete / order  (checks the admin password via the existing cbt_admin 'ping')
create or replace function public.cbt_admin_banners(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a      jsonb;
  v_id   uuid;
  v_link text;
  v_img  text;
  i      int := 0;
  x      text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then
    return a;
  end if;

  if p_action = 'list' then
    return jsonb_build_object('ok', true, 'items', coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'text', body, 'img', image, 'link', link, 'sort', sort, 'active', active) order by sort, created_at)
         from public.cbt_banners), '[]'::jsonb));

  elsif p_action = 'save' then
    v_link := left(trim(coalesce(p_data->>'link', '')), 500);
    if v_link <> '' and v_link !~* '^(https?://|#/)' then
      return jsonb_build_object('ok', false, 'error', 'link');
    end if;
    v_img := p_data->>'image';                      -- null = keep, '' = remove
    if v_img is not null and v_img <> '' and (v_img !~ '^data:image/(jpeg|png|webp);base64,' or length(v_img) > 1500000) then
      return jsonb_build_object('ok', false, 'error', 'image');
    end if;
    v_id := nullif(p_data->>'id', '')::uuid;
    if v_id is null then
      if (select count(*) from public.cbt_banners) >= 20 then
        return jsonb_build_object('ok', false, 'error', 'limit');
      end if;
      insert into public.cbt_banners (title, body, image, link, active, sort)
      values (left(coalesce(p_data->>'title', ''), 60), left(coalesce(p_data->>'text', ''), 120), nullif(v_img, ''), v_link,
              coalesce((p_data->>'active')::boolean, true),
              coalesce((select max(sort) + 1 from public.cbt_banners), 0))
      returning id into v_id;
    else
      update public.cbt_banners set
        title  = left(coalesce(p_data->>'title', ''), 60),
        body   = left(coalesce(p_data->>'text', ''), 120),
        link   = v_link,
        active = coalesce((p_data->>'active')::boolean, active),
        image  = case when v_img is null then image else nullif(v_img, '') end
      where id = v_id;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'toggle' then
    update public.cbt_banners set active = coalesce((p_data->>'active')::boolean, not active) where id = (p_data->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then
    delete from public.cbt_banners where id = (p_data->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'order' then
    for x in select jsonb_array_elements_text(coalesce(p_data->'ids', '[]'::jsonb)) loop
      update public.cbt_banners set sort = i where id = x::uuid;
      i := i + 1;
    end loop;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end;
$$;
grant execute on function public.cbt_admin_banners(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
