-- =====================================================================
--  v86: Every student's FIRST attempt gets a rank in that test, whenever it was taken
--
--  Before: a test's rank (leaderboard, "Your rank", percentile, admin Top students) counted only first attempts submitted
--  during the live window ("Live ends", or the result time). A student who missed the live test and took it 3–10 days
--  later never got a rank in it.
--  Now: each student's FIRST attempt of the test is ranked, whether it was taken live or days later. Second and later
--  attempts never count (as before). A first attempt submitted late (more than 2 minutes after its own timer ended, e.g.
--  kept offline) still does not count, as before. Students marked for cheating still come last.
--  Only the per-test rank changes. The overall rank (cbt_overall) is unchanged.
--  Ranks of a held-back test are still shown only after its result time.
--
--  Run in Supabase → SQL Editor after v85. Safe to run again. (If v47, v49_v50_all_in_one or v50 is run again, run this after it.)
-- =====================================================================

-- every ranked student of a test, in the v50 rank order (1, 2, 3 … no ties)
create or replace function cbt_private.test_ranks(p_test uuid)
returns table(o_student uuid, o_result uuid, o_rank bigint, o_score numeric, o_cheat boolean)
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  with x as (select t.data, t.correct_marks cm, t.wrong_marks wm from tests t where t.id = p_test),
       f1 as (select distinct on (rs.student_id) rs.* from results rs where rs.test_id = p_test
              order by rs.student_id, rs.created_at),
       b as (select f1.student_id, f1.id rid, f1.score sc, f1.wrong wr, f1.used_seconds us, f1.created_at ca,
                    exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = p_test::text) ch,
                    sec_marks(x.data, f1.answers, '(bio|botany|zoology|जीव|वनस्पति|प्राणि)', x.cm, x.wm) bio,
                    sec_marks(x.data, f1.answers, '(chem|रसायन)', x.cm, x.wm) chem,
                    sec_marks(x.data, f1.answers, '(phy|भौतिक)', x.cm, x.wm) phy
               from f1, x
              where not f1.late)   -- v86: the FIRST attempt counts whenever it was taken (live or days later); only a late submit does not
  select b.student_id, b.rid,
         row_number() over (order by b.ch, b.sc desc, b.wr asc, b.bio desc, b.chem desc, b.phy desc, b.us asc, b.ca asc, b.rid),
         b.sc, b.ch
    from b
$$;
revoke all on function cbt_private.test_ranks(uuid) from public, anon, authenticated;

-- ---------- cbt_leaderboard (from v50; v86: the score bands use the same first attempts) ----------
CREATE OR REPLACE FUNCTION public.cbt_leaderboard(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; total int; myrank int; top jsonb; avg_sc numeric; top_sc numeric; my_sc numeric;
        mx numeric; pctl int; dist jsonb; mybk int; below int; honest int; mych boolean; ra bigint; cut bigint;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  -- ra = when a held-back test's results are shown (v47: the result time, or else "Live ends"; null = at once, e.g. practice)
  -- (v86: `cut` is no longer used for the rank: a first attempt counts whenever it was taken)
  select res_at(id), case when not practice then coalesce(closes_at, result_at) end into ra, cut
    from tests where id = p_test;
  if ra is not null and ra > now_ms() then
    return jsonb_build_object('ok',true,'hidden',true,'result_at',ra,'total',0,'my_rank',null,'top','[]'::jsonb,
      'dist','[]'::jsonb,'my_cheat',false);
  end if;
  perform autosubmit(null, p_test);   -- expired, auto-saved attempts of this test get their result before ranking

  select max(max_score) into mx from results where test_id = p_test;

  -- v86: one row per student: their FIRST attempt (live or later, not a late submit), in ONE order — see cbt_private.test_ranks
  with r as (select o_student student_id, o_score sc, o_cheat ch, o_rank rk from test_ranks(p_test))
  select (select count(*) from r), (select rk from r where student_id = sid),
         (select coalesce(jsonb_agg(jsonb_build_object('name',short_name(s.name),'score',r.sc,'rank',r.rk,'me',(r.student_id = sid),'cheat',r.ch)
                  order by r.rk, s.name),'[]'::jsonb) from r join students s on s.id = r.student_id where r.rk <= 10 or r.ch),
         (select round(avg(sc),1) from r where not ch), (select max(sc) from r where not ch), (select sc from r where student_id = sid),
         (select count(*) from r where not ch and sc <= (select sc from r where student_id = sid)),
         (select count(*) from r where not ch), (select ch from r where student_id = sid)
  into total, myrank, top, avg_sc, top_sc, my_sc, below, honest, mych;

  pctl := case when mych then 0
               when coalesce(honest,0) > 0 and my_sc is not null then round(100.0*below/honest)::int else null end;

  if coalesce(mx,0) > 0 then
    with b as (select f1.score sc from (select distinct on (rs.student_id) rs.* from results rs where rs.test_id = p_test
                   order by rs.student_id, rs.created_at) f1
               where not f1.late
                 and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = p_test::text)),
         k as (select least(9, greatest(0, floor(b.sc / mx * 10)::int)) bk from b)
    select coalesce(jsonb_agg(coalesce((select count(*) from k where k.bk = g), 0) order by g), '[]'::jsonb)
      into dist from generate_series(0,9) g;
    mybk := case when my_sc is null or mych then null else least(9, greatest(0, floor(my_sc / mx * 10)::int)) end;
  end if;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'top',coalesce(top,'[]'::jsonb),
    'avg',avg_sc,'top_score',top_sc,'my_score',my_sc,'max',mx,'percentile',pctl,
    'dist',coalesce(dist,'[]'::jsonb),'my_bucket',mybk,'my_cheat',coalesce(mych,false));
end $function$;
revoke all on function public.cbt_leaderboard(text, text, text, uuid) from public, authenticated;
grant execute on function public.cbt_leaderboard(text, text, text, uuid) to anon;

notify pgrst, 'reload schema';
