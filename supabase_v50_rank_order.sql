-- =====================================================================
--  v50: Rank in one fixed order — no two students get the same rank
--  A test's rank (student leaderboard, "Your rank", admin Top students) now follows these rules, one after another:
--    1. more marks
--    2. fewer wrong answers
--    3. more marks in Biology (sections named Biology / Botany / Zoology / जीव विज्ञान …)
--    4. more marks in Chemistry
--    5. more marks in Physics
--    6. less time taken
--    7. submitted earlier
--  So ranks go 1, 2, 3, 4 … and never repeat. As before only each student's first attempt counts, only if on time,
--  and students marked for cheating come last.
--  Run after v49, then supabase_v35_admin_team.sql again (permission check for cbt_admin_ranks). Safe to run again.
--  If you re-run v47_alerts_results, run this file again afterwards (both replace cbt_leaderboard).
-- =====================================================================

-- marks of one subject in one attempt: questions whose section name matches p_pat (+correct, −wrong, 0 skipped)
create or replace function cbt_private.sec_marks(p_data jsonb, p_ans jsonb, p_pat text, p_cm numeric, p_wm numeric)
returns numeric language sql immutable as $$
  select coalesce(sum(case when coalesce(e.v->>'answer', '') !~ '^[0-3]$' or coalesce(p_ans->>((e.n - 1)::text), '') !~ '^[0-3]$' then 0
                           when (e.v->>'answer') = (p_ans->>((e.n - 1)::text)) then p_cm else -p_wm end), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_data) = 'array' then p_data else '[]'::jsonb end) with ordinality e(v, n)
  where coalesce(e.v->>'sec', '') ~* p_pat
$$;
revoke all on function cbt_private.sec_marks(jsonb, jsonb, text, numeric, numeric) from public, anon, authenticated;

-- every ranked student of a test, in the rank order above (1, 2, 3 … no ties)
create or replace function cbt_private.test_ranks(p_test uuid)
returns table(o_student uuid, o_result uuid, o_rank bigint, o_score numeric, o_cheat boolean)
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  with x as (select t.data, t.correct_marks cm, t.wrong_marks wm,
                    case when not t.practice then coalesce(t.closes_at, t.result_at) end cut
               from tests t where t.id = p_test),
       f1 as (select distinct on (rs.student_id) rs.* from results rs where rs.test_id = p_test
              order by rs.student_id, rs.created_at),
       b as (select f1.student_id, f1.id rid, f1.score sc, f1.wrong wr, f1.used_seconds us, f1.created_at ca,
                    exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = p_test::text) ch,
                    sec_marks(x.data, f1.answers, '(bio|botany|zoology|जीव|वनस्पति|प्राणि)', x.cm, x.wm) bio,
                    sec_marks(x.data, f1.answers, '(chem|रसायन)', x.cm, x.wm) chem,
                    sec_marks(x.data, f1.answers, '(phy|भौतिक)', x.cm, x.wm) phy
               from f1, x
              where not f1.late and (x.cut is null or f1.created_at <= to_timestamp((x.cut + 120000) / 1000.0)))
  select b.student_id, b.rid,
         row_number() over (order by b.ch, b.sc desc, b.wr asc, b.bio desc, b.chem desc, b.phy desc, b.us asc, b.ca asc, b.rid),
         b.sc, b.ch
    from b
$$;
revoke all on function cbt_private.test_ranks(uuid) from public, anon, authenticated;

-- ---------- cbt_leaderboard (from v47; v50: rank from test_ranks, 1, 2, 3 … without ties) ----------
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
  -- v43: rank = first attempts submitted by "Live ends" (+2 min to reach the server); without it, by the result time
  select res_at(id), case when not practice then coalesce(closes_at, result_at) end into ra, cut
    from tests where id = p_test;
  if ra is not null and ra > now_ms() then
    return jsonb_build_object('ok',true,'hidden',true,'result_at',ra,'total',0,'my_rank',null,'top','[]'::jsonb,
      'dist','[]'::jsonb,'my_cheat',false);
  end if;
  perform autosubmit(null, p_test);   -- expired, auto-saved attempts of this test get their result before ranking

  select max(max_score) into mx from results where test_id = p_test;

  -- v50: one row per student (their FIRST attempt, on time), in ONE order with no ties — see cbt_private.test_ranks
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
               where not f1.late and (cut is null or f1.created_at <= to_timestamp((cut + 120000) / 1000.0))
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
grant execute on function public.cbt_leaderboard(text, text, text, uuid) to anon, authenticated;

-- ---------- admin: the same ranks for Admin → Results → a test → Top students ----------
create or replace function public.cbt_admin_ranks(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb);
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action <> 'get' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  perform autosubmit(null, nullif(d->>'id', '')::uuid);
  return jsonb_build_object('ok', true, 'ranks', coalesce((
    select jsonb_agg(jsonb_build_object('mobile', s.mobile, 'rank', r.o_rank, 'result_id', r.o_result, 'cheat', r.o_cheat) order by r.o_rank)
      from test_ranks(nullif(d->>'id', '')::uuid) r join students s on s.id = r.o_student), '[]'::jsonb));
end $$;
revoke all on function public.cbt_admin_ranks(text, text, jsonb) from public;
grant execute on function public.cbt_admin_ranks(text, text, jsonb) to anon, authenticated;
