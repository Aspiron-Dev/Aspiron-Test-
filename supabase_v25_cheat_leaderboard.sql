-- =====================================================================
--  v25: Leaderboards with cheating reports (needs v24)
--  • Test leaderboard: a student whose result in this test is marked as cheating goes to the LAST places,
--    always appears in the list with a 🚩 Cheating tag (seen by everyone), and is left out of the class
--    average, topper score, percentile and score bands.
--  • Overall leaderboard: a test marked as cheating does not count in that student's average.
--  Same as the original functions otherwise. Run ONCE in Supabase → SQL Editor → paste → Run. Safe to run again.
-- =====================================================================

create or replace function public.cbt_leaderboard(p_mobile text, p_code text, p_device text, p_test uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'cbt_private', 'pg_temp'
as $function$
declare a jsonb; sid uuid; total int; myrank int; top jsonb; avg_sc numeric; top_sc numeric; my_sc numeric;
        mx numeric; pctl int; dist jsonb; mybk int; below int; honest int; mych boolean;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select max(max_score) into mx from results where test_id = p_test;

  with b as (select rs.student_id, max(rs.score) sc,
                    exists (select 1 from public.cbt_cheat_flags f where f.student_id = rs.student_id and f.test_id = p_test::text) ch
             from results rs where rs.test_id = p_test group by rs.student_id),
       -- cheaters are ranked after everyone else
       r as (select b.student_id, b.sc, b.ch, rank() over (order by b.ch, b.sc desc) rk from b)
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
    with b as (select max(rs.score) sc from results rs where rs.test_id = p_test
                 and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = rs.student_id and f.test_id = p_test::text)
               group by rs.student_id),
         k as (select least(9, greatest(0, floor(b.sc / mx * 10)::int)) bk from b)
    select coalesce(jsonb_agg(coalesce((select count(*) from k where k.bk = g), 0) order by g), '[]'::jsonb)
      into dist from generate_series(0,9) g;
    mybk := case when my_sc is null or mych then null else least(9, greatest(0, floor(my_sc / mx * 10)::int)) end;
  end if;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'top',coalesce(top,'[]'::jsonb),
    'avg',avg_sc,'top_score',top_sc,'my_score',my_sc,'max',mx,'percentile',pctl,
    'dist',coalesce(dist,'[]'::jsonb),'my_bucket',mybk,'my_cheat',coalesce(mych,false));
end $function$;

create or replace function public.cbt_overall(p_mobile text, p_code text, p_device text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'cbt_private', 'pg_temp'
as $function$
declare a jsonb; sid uuid; total int; myrank int; mypct numeric; top jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  with b as (select rs.student_id, rs.test_id, max(rs.score / nullif(rs.max_score,0) * 100) p
             from results rs join tests tp on tp.id = rs.test_id and not tp.practice where rs.test_id is not null
               and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = rs.student_id and f.test_id = rs.test_id::text)
             group by rs.student_id, rs.test_id),
       s as (select student_id, round(avg(p),1) pc, count(*) n from b group by student_id),
       r as (select s.*, rank() over (order by s.pc desc nulls last) rk from s)
  select (select count(*) from r), (select rk from r where student_id = sid), (select pc from r where student_id = sid),
         (select coalesce(jsonb_agg(jsonb_build_object('name',short_name(st.name),'pct',r.pc,'rank',r.rk,'tests',r.n,'me',(r.student_id = sid))
                  order by r.rk, st.name),'[]'::jsonb) from r join students st on st.id = r.student_id where r.rk <= 5)
  into total, myrank, mypct, top;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'my_pct',mypct,'top',coalesce(top,'[]'::jsonb));
end $function$;

notify pgrst, 'reload schema';
