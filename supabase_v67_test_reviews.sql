-- =====================================================================
--  v67: a rating for every test (test feedback)
--
--  • After a student submits a test, the app now asks "How was this test?": stars and a comment of at least
--    15 letters, about that one test. The series review on the store (v23) stays as it is.
--  • test_reviews keeps one rating per student per test (it can be changed). Only a student who submitted the test
--    can rate it. These ratings are private: they are not shown on the store, only to the admin.
--  • Admin → Test feedback: every test with its average and number of ratings, and the comments (with name and mobile).
--    Who can see it: Reviews = View; deleting a rating needs Reviews = Full access.
--
--  Run in Supabase → SQL Editor once (after v66), then run supabase_v35_admin_team.sql again. Safe to run again.
--  Before it is run the app asks for the series review after a test, as before.
-- =====================================================================

create table if not exists cbt_private.test_reviews (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references cbt_private.tests(id) on delete cascade,
  student_id  uuid not null references cbt_private.students(id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (test_id, student_id)
);
create index if not exists test_reviews_test on cbt_private.test_reviews (test_id, updated_at desc);
revoke all on cbt_private.test_reviews from public, anon, authenticated;

-- the student's own rating of one test (null when not rated yet)
create or replace function public.cbt_test_review_mine(p_mobile text, p_code text, p_device text, p_test text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; v_tid uuid; r cbt_private.test_reviews;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  begin v_tid := p_test::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'test'); end;
  select * into r from cbt_private.test_reviews where test_id = v_tid and student_id = (a->>'id')::uuid;
  return jsonb_build_object('ok', true, 'review', case when found then jsonb_build_object('rating', r.rating, 'body', r.body) end);
end $$;

-- rate a test you submitted: 1–5 stars and a comment of 15–600 letters (no markup characters)
create or replace function public.cbt_test_review_save(p_mobile text, p_code text, p_device text, p_test text, p_rating int, p_body text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; v_sid uuid; v_tid uuid; r cbt_private.test_reviews;
        v_body text := left(btrim(regexp_replace(coalesce(p_body, ''), '[<>"`\r\t]', '', 'g')), 600);
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then return jsonb_build_object('ok', false, 'error', 'rating'); end if;
  if length(v_body) < 15 then return jsonb_build_object('ok', false, 'error', 'short'); end if;
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_sid := (a->>'id')::uuid;
  begin v_tid := p_test::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'test'); end;
  if not exists (select 1 from cbt_private.results where student_id = v_sid and test_id = v_tid) then
    return jsonb_build_object('ok', false, 'error', 'not_taken');
  end if;
  select * into r from cbt_private.test_reviews where test_id = v_tid and student_id = v_sid;
  if found then
    if r.updated_at > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
    update cbt_private.test_reviews set rating = p_rating, body = v_body, updated_at = now() where id = r.id;
  else
    insert into cbt_private.test_reviews (test_id, student_id, rating, body) values (v_tid, v_sid, p_rating, v_body)
    on conflict (test_id, student_id) do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cbt_test_review_mine(text, text, text, text) from public, authenticated;
revoke all on function public.cbt_test_review_save(text, text, text, text, int, text) from public, authenticated;
grant execute on function public.cbt_test_review_mine(text, text, text, text) to anon;
grant execute on function public.cbt_test_review_save(text, text, text, text, int, text) to anon;

-- admin: every rated test with its average, and the newest 500 ratings; delete one
create or replace function public.cbt_admin_test_reviews(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_id uuid;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'tests', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'series', s.title,
                  'n', x.n, 'avg', x.av, 'low', x.low, 'last', x.last) order by x.last desc)
                from (select test_id, count(*) n, round(avg(rating), 2) av, count(*) filter (where rating <= 2) low, max(updated_at) last
                        from test_reviews group by test_id) x
                join tests t on t.id = x.test_id left join series s on s.id = t.series_id), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(y) from (
                select jsonb_build_object('id', r.id, 'test_id', r.test_id, 'rating', r.rating, 'body', r.body, 'at', r.updated_at,
                         'name', st.name, 'mobile', st.mobile) y
                  from test_reviews r join students st on st.id = r.student_id
                 order by r.updated_at desc limit 500) z), '[]'::jsonb));
  end if;
  if p_action = 'delete' then
    begin v_id := (p_data->>'id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'id'); end;
    delete from test_reviews where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_test_reviews(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_test_reviews(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v67 installed: test feedback — now run supabase_v35_admin_team.sql again' as status;
