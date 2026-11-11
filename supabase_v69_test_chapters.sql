-- =====================================================================
--  v69: chapter-wise analysis of a student's TESTS (Analytics page)
--
--  A test question has no chapter of its own. When the admin adds a test's questions to the Question Bank
--  (Admin → Question bank → "From a test"), each one is saved with its subject and chapter and with
--  src = 'test:<test id>:<question number from 0>'. This function uses that link: for every test the student
--  took (latest attempt, only once the result is visible), each question that is in the bank is counted under
--  its chapter as right, wrong or skipped, with the average seconds spent on it.
--
--  Questions of tests that are not in the Question Bank yet are counted in "all" but not in "tagged", so the
--  page can say how much of the student's tests the chapter list covers.
--
--  Read only: no table is created or changed, no data is deleted. A student sees only their own numbers.
--  Run in Supabase → SQL Editor after v68. Safe to run again. Costs nothing (no cron, no extension, no storage).
-- =====================================================================

create or replace function public.cbt_test_chapters(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql stable security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; v_rows jsonb; v_all int; v_tag int;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  with latest as (   -- the latest attempt of every test whose result the student may see
    select distinct on (rs.test_id) rs.test_id, rs.answers, rs.times
      from results rs
     where rs.student_id = sid and rs.test_id is not null and res_visible(rs.test_id::text)
     order by rs.test_id, rs.created_at desc
     limit 300),
  q as (
    select b.subject, b.chapter,
           case when (e.v->>'answer') ~ '^[0-3]$' then (e.v->>'answer')::int end k,
           case when (l.answers->>((e.n - 1)::text)) ~ '^[0-3]$' then (l.answers->>((e.n - 1)::text))::int end ans,
           case when (l.times->>((e.n - 1)::text)) ~ '^[0-9]{1,6}$' then (l.times->>((e.n - 1)::text))::int end tm
      from latest l
      join tests t on t.id = l.test_id
      cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data) = 'array' then t.data else '[]'::jsonb end) with ordinality e(v, n)
      left join qbank b on b.src = 'test:' || l.test_id::text || ':' || (e.n - 1)::text)
  select coalesce((select jsonb_agg(jsonb_build_object('s', subject, 'c', chapter, 'total', tot, 'correct', c, 'wrong', w, 'skipped', sk, 'avg_time', tt)
                                     order by subject, chapter)
                     from (select subject, chapter, count(*) tot,
                                  count(*) filter (where ans is not null and k is not null and ans = k) c,
                                  count(*) filter (where ans is not null and k is not null and ans <> k) w,
                                  count(*) filter (where ans is null or k is null) sk,
                                  round(avg(tm) filter (where tm > 0)) tt
                             from q where chapter is not null and chapter <> '' group by 1, 2) z), '[]'::jsonb),
         (select count(*) from q),
         (select count(*) from q where chapter is not null and chapter <> '')
    into v_rows, v_all, v_tag;

  return jsonb_build_object('ok', true, 'chapters', v_rows, 'all', coalesce(v_all, 0), 'tagged', coalesce(v_tag, 0));
end $$;
revoke all on function public.cbt_test_chapters(text, text, text) from public, authenticated;
grant execute on function public.cbt_test_chapters(text, text, text) to anon;

notify pgrst, 'reload schema';
