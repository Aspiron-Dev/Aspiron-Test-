-- =====================================================================
--  v23: Ratings & reviews — a student whose paid series is UNLOCKED can give it stars and a review.
--  Reviews show on the store page with the student's name (first name + initial) and, if they choose,
--  their profile photo. Mobile number and other personal details are never sent to the store page.
--  The admin panel (admin password) can hide / show, pin, reply to and delete any review.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again. Needs v13 (store).
-- =====================================================================

create table if not exists public.cbt_reviews (
  id         uuid primary key default gen_random_uuid(),
  series_id  text not null,
  student_id uuid not null,
  mobile     text not null default '',            -- admin only, never sent to the store page
  name       text not null default '',            -- shown name, e.g. "Rahul S." (taken from the login, not typed)
  photo      text not null default '',            -- small profile photo, only if the student chose to show it
  rating     int  not null check (rating between 1 and 5),
  body       text not null default '',
  status     text not null default 'shown',       -- shown | pending | hidden
  pinned     boolean not null default false,
  reply      text not null default '',            -- admin's public reply
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, student_id)
);
create index if not exists cbt_reviews_series on public.cbt_reviews (series_id, status);
alter table public.cbt_reviews enable row level security;   -- no policies: only the functions below can read/write
revoke all on public.cbt_reviews from anon, authenticated;

-- one switch: should new / edited reviews wait for the admin before showing?
create table if not exists public.cbt_review_settings (
  id       int primary key default 1 check (id = 1),
  moderate boolean not null default false
);
insert into public.cbt_review_settings (id) values (1) on conflict (id) do nothing;
alter table public.cbt_review_settings enable row level security;
revoke all on public.cbt_review_settings from anon, authenticated;

-- "Rahul Kumar Sharma" → "Rahul S."
create or replace function public.cbt_review_name(p text)
returns text language plpgsql immutable as $$
declare w text[] := array_remove(regexp_split_to_array(btrim(regexp_replace(coalesce(p, ''), '[^[:alpha:][:space:]]', '', 'g')), '\s+'), '');
        n int := coalesce(array_length(w, 1), 0);
begin
  if n = 0 then return 'Student'; end if;
  if n = 1 then return left(initcap(w[1]), 30); end if;
  return left(initcap(w[1]), 30) || ' ' || upper(left(w[n], 1)) || '.';
end; $$;

-- is this series unlocked for this student? (taken from the student's own catalog, so it can't be faked)
create or replace function public.cbt_review_can(p_mobile text, p_code text, p_device text, p_series text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(c->'series', '[]'::jsonb)) s
                 where s->>'id' = p_series and coalesce((s->>'unlocked')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'not_unlocked');
  end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.cbt_review_can(text, text, text, text) from public, anon, authenticated;

-- Student: my review of this series (to show / edit it)
create or replace function public.cbt_review_mine(p_mobile text, p_code text, p_device text, p_series text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; r public.cbt_reviews;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  select * into r from public.cbt_reviews where series_id = p_series and student_id = (a->>'id')::uuid;
  if not found then return jsonb_build_object('ok', true, 'review', null); end if;
  return jsonb_build_object('ok', true, 'review', jsonb_build_object('rating', r.rating, 'body', r.body, 'status', r.status,
    'reply', r.reply, 'photo', r.photo <> '', 'name', r.name, 'at', (extract(epoch from r.updated_at) * 1000)::bigint));
end; $$;
grant execute on function public.cbt_review_mine(text, text, text, text) to anon, authenticated;

-- Student: add or change my review. Only for a series that is unlocked for me. One review per series.
create or replace function public.cbt_review_save(p_mobile text, p_code text, p_device text, p_series text,
                                                  p_rating int, p_body text default '', p_photo text default '')
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; c jsonb; r public.cbt_reviews; v_id uuid; v_st text; v_mod boolean;
        v_body text := left(btrim(regexp_replace(coalesce(p_body, ''), '[<>\r\t]', '', 'g')), 600);
        v_ph text := case when coalesce(p_photo, '') ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(p_photo) <= 30000
                          then p_photo else '' end;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then return jsonb_build_object('ok', false, 'error', 'rating'); end if;
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_id := (a->>'id')::uuid;
  c := public.cbt_review_can(p_mobile, p_code, p_device, p_series);
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  select moderate into v_mod from public.cbt_review_settings where id = 1;
  select * into r from public.cbt_reviews where series_id = p_series and student_id = v_id;
  if found then
    if r.updated_at > now() - interval '20 seconds' then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
    -- a review the admin hid stays hidden; otherwise an edit waits again when checking is on
    v_st := case when r.status = 'hidden' then 'hidden' when coalesce(v_mod, false) then 'pending' else 'shown' end;
    update public.cbt_reviews set rating = p_rating, body = v_body, photo = v_ph, status = v_st,
      name = public.cbt_review_name(a->>'name'), mobile = coalesce(a->>'mobile', mobile), updated_at = now()
    where id = r.id;
  else
    v_st := case when coalesce(v_mod, false) then 'pending' else 'shown' end;
    insert into public.cbt_reviews (series_id, student_id, mobile, name, photo, rating, body, status)
    values (p_series, v_id, coalesce(a->>'mobile', p_mobile), public.cbt_review_name(a->>'name'), v_ph, p_rating, v_body, v_st);
  end if;
  return jsonb_build_object('ok', true, 'status', v_st);
end; $$;
grant execute on function public.cbt_review_save(text, text, text, text, int, text, text) to anon, authenticated;

-- Student: remove my review
create or replace function public.cbt_review_delete(p_mobile text, p_code text, p_device text, p_series text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  delete from public.cbt_reviews where series_id = p_series and student_id = (a->>'id')::uuid;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cbt_review_delete(text, text, text, text) to anon, authenticated;

-- Public (store page, no login): rating summary + shown reviews for every item on the store.
-- Only name, photo, stars, text, date and the admin's reply. No mobile, no ids.
create or replace function public.cbt_store_reviews()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(x.o), '[]'::jsonb)) from (
    select jsonb_build_object('id', i.id,
      'count', (select count(*) from public.cbt_reviews r where r.series_id = i.series_id and r.status = 'shown'),
      'avg',   (select round(avg(rating)::numeric, 1) from public.cbt_reviews r where r.series_id = i.series_id and r.status = 'shown'),
      'stars', (select jsonb_build_array(count(*) filter (where rating = 5), count(*) filter (where rating = 4), count(*) filter (where rating = 3),
                                         count(*) filter (where rating = 2), count(*) filter (where rating = 1))
                from public.cbt_reviews r where r.series_id = i.series_id and r.status = 'shown'),
      'list',  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'photo', photo, 'rating', rating, 'body', body, 'reply', reply,
                           'pinned', pinned, 'at', (extract(epoch from created_at) * 1000)::bigint) order by pinned desc, created_at desc)
                         from (select * from public.cbt_reviews r where r.series_id = i.series_id and r.status = 'shown'
                               order by pinned desc, created_at desc limit 30) r), '[]'::jsonb)) as o
    from public.cbt_store_items i where i.active and i.series_id <> ''
  ) x;
$$;
grant execute on function public.cbt_store_reviews() to anon, authenticated;

-- Admin: see every review (with mobile), hide / show, pin, reply, delete, and the "check first" switch
create or replace function public.cbt_admin_reviews(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'moderate', (select moderate from public.cbt_review_settings where id = 1),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'series_id', series_id, 'mobile', mobile, 'name', name, 'photo', photo,
                 'rating', rating, 'body', body, 'status', status, 'pinned', pinned, 'reply', reply,
                 'created_at', created_at, 'updated_at', updated_at) order by updated_at desc)
               from (select * from public.cbt_reviews order by updated_at desc limit 1000) r), '[]'::jsonb));

  elsif p_action = 'status' then
    if p_data->>'status' not in ('shown', 'pending', 'hidden') then return jsonb_build_object('ok', false, 'error', 'status'); end if;
    update public.cbt_reviews set status = p_data->>'status' where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'pin' then
    update public.cbt_reviews set pinned = coalesce((p_data->>'pinned')::boolean, false) where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'reply' then
    update public.cbt_reviews set reply = left(btrim(regexp_replace(coalesce(p_data->>'reply', ''), '[<>\r\t]', '', 'g')), 400) where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'remove_photo' then
    update public.cbt_reviews set photo = '' where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then
    delete from public.cbt_reviews where id = v_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'moderate' then
    update public.cbt_review_settings set moderate = coalesce((p_data->>'on')::boolean, false) where id = 1;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_reviews(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
