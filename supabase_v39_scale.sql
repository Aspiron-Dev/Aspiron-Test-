-- =====================================================================
--  v39: Ready for 500-1000 students at the same time
--  1. Indexes for the queries every student runs (start, auto-save, submit, home page, leaderboard), so they
--     stay fast however many results and attempts pile up. An index is only added when none like it exists.
--  2. auth() (run by every student request) no longer locks and rewrites the student's row each time; it writes
--     only when something changed (wrong code, new device, last_seen older than 5 minutes). Auto-save every few
--     seconds from 1000 phones was 1000 row rewrites a few seconds apart.
--  3. Overall rank (home page "Leaderboard", Insights): it ranked every result of every test on each request.
--     Now it is worked out at most once every 30 seconds and kept in a table; each request only reads it.
--     A new result shows in the overall rank within 30 seconds (the test leaderboard is still instant).
--  Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run (after v38). Safe to run again.
--  If you re-run an older file that replaces cbt_private.auth or cbt_overall (v34_attack_fixes, v30_result_time,
--  v25_cheat_leaderboard), run this file again afterwards.
-- =====================================================================

begin;

-- ---------- 1. indexes (only when no index already starts with the same columns) ----------
do $$
declare
  ix record;
  have boolean;
begin
  for ix in select * from (values
      ('students',      'students_mobile_ix',      array['mobile'],                         'mobile',                                     ''),
      ('sessions',      'sessions_open_ix',        array['student_id','test_id'],           'student_id, test_id',                        'where not submitted'),
      ('sessions',      'sessions_due_ix',         array['ends_at'],                        'ends_at',                                    'where not submitted and answers is not null'),
      ('results',       'results_test_ix',         array['test_id','student_id'],           'test_id, student_id, created_at',            ''),
      ('results',       'results_student_ix',      array['student_id','created_at'],        'student_id, created_at desc',                ''),
      ('series_access', 'series_access_st_ix',     array['student_id','series_id'],         'student_id, series_id',                      ''),
      ('bookmarks',     'bookmarks_student_ix',    array['student_id'],                     'student_id',                                 ''),
      ('tests',         'tests_series_ix',         array['series_id'],                      'series_id',                                  '')
    ) v(tbl, name, cols, def, pred)
  loop
    if to_regclass('cbt_private.' || ix.tbl) is null then continue; end if;
    -- an existing index (any name) whose first columns are these; a partial one counts only for a partial one here
    select exists (
      select 1 from pg_index i
      where i.indrelid = ('cbt_private.' || ix.tbl)::regclass
        and (i.indpred is null or ix.pred <> '')
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(i.indkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
              where k.ord <= array_length(ix.cols, 1)) = ix.cols
    ) into have;
    if not have then
      execute format('create index if not exists %I on cbt_private.%I (%s) %s', ix.name, ix.tbl, ix.def, ix.pred);
    end if;
  end loop;
end $$;


-- ---------- 2. auth: read without locking; write only when something changes ----------
CREATE OR REPLACE FUNCTION cbt_private.auth(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  s cbt_private.students%rowtype;
  m text := cbt_private.norm_mobile(p_mobile);
  c text := cbt_private.norm_code(p_code);
  t bigint := cbt_private.now_ms();
begin
  select * into s from students where mobile = m;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.locked_until > t then
    -- A lock is often caused by someone else typing wrong codes for this number. The student's own phone
    -- (already registered on the account) with the right code keeps working; at most 30 tries per lock.
    if not (p_device is not null and p_device = any(s.devices) and s.lock_fails < 30) then
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
    if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
      update students set lock_fails = lock_fails + 1 where id = s.id;
      return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
    end if;
  end if;
  if s.status = 'pending' then
    return jsonb_build_object('ok',false,'error','pending');
  end if;
  if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
    -- counted in the update itself, so wrong codes sent at the same moment are all counted
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
      lock_fails   = case when fail_count + 1 >= 8 then 0 else lock_fails end,
      fail_count   = case when fail_count + 1 >= 8 then 0 else fail_count + 1 end
    where id = s.id;
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.status = 'blocked' then
    return jsonb_build_object('ok',false,'error','blocked');
  end if;
  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('ok',false,'error','device');
  end if;
  if not (p_device = any(s.devices)) then
    -- the limit is checked again inside the update, so two new phones signing in at once cannot both get in
    update students set devices = array_append(devices, p_device)
     where id = s.id and not (p_device = any(devices)) and coalesce(array_length(devices,1),0) < max_devices;
    if not found and not exists (select 1 from students where id = s.id and p_device = any(devices)) then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
  end if;
  if s.fail_count <> 0 or s.last_seen is null or s.last_seen < now() - interval '5 minutes' then
    update students set fail_count = 0, last_seen = now() where id = s.id;
  end if;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $function$;
revoke all on function cbt_private.auth(text, text, text) from public, anon, authenticated;


-- ---------- 3. overall rank, worked out at most every 30 seconds ----------
create table if not exists cbt_private.overall_rank (student_id uuid primary key, pc numeric, n int, rk int);
create index if not exists overall_rank_rk on cbt_private.overall_rank (rk);
create table if not exists cbt_private.rank_built (k text primary key, at timestamptz not null);
revoke all on cbt_private.overall_rank from public, anon, authenticated;
revoke all on cbt_private.rank_built from public, anon, authenticated;

create or replace function cbt_private.overall_refresh()
returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare built timestamptz;
begin
  select at into built from rank_built where k = 'overall';
  if built is not null and built > now() - interval '30 seconds' then return; end if;
  if built is null then
    perform pg_advisory_xact_lock(hashtext('cbt_overall_rank'));          -- first time: wait for the one building it
  elsif not pg_try_advisory_xact_lock(hashtext('cbt_overall_rank')) then
    return;                                                              -- someone is building it now: use the current copy
  end if;
  select at into built from rank_built where k = 'overall';
  if built is not null and built > now() - interval '30 seconds' then return; end if;

  perform autosubmit(null, null);   -- expired, auto-saved attempts get their result before ranking

  delete from overall_rank;
  -- per student and test: the FIRST attempt, if not late and (for held-back tests) after the result time and submitted before it
  insert into overall_rank (student_id, pc, n, rk)
  with b as (select f1.student_id, f1.test_id, f1.score / nullif(f1.max_score,0) * 100 p
             from (select distinct on (rs.student_id, rs.test_id) rs.*, tp.result_at ra
                   from results rs join tests tp on tp.id = rs.test_id and not tp.practice where rs.test_id is not null
                   order by rs.student_id, rs.test_id, rs.created_at) f1
             where not f1.late and (f1.ra is null or (f1.ra <= now_ms() and f1.created_at <= to_timestamp(f1.ra / 1000.0)))
               and not exists (select 1 from public.cbt_cheat_flags f where f.student_id = f1.student_id and f.test_id = f1.test_id::text)),
       s as (select student_id, round(avg(p),1) pc, count(*) n from b group by student_id)
  select s.student_id, s.pc, s.n, rank() over (order by s.pc desc nulls last) from s;

  insert into rank_built (k, at) values ('overall', now()) on conflict (k) do update set at = excluded.at;
end $$;
revoke all on function cbt_private.overall_refresh() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cbt_overall(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare a jsonb; sid uuid; total int; myrank int; mypct numeric; top jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  perform overall_refresh();

  select (select count(*) from overall_rank), r.rk, r.pc into total, myrank, mypct
    from (select 1) one left join overall_rank r on r.student_id = sid;
  select coalesce(jsonb_agg(jsonb_build_object('name',short_name(st.name),'pct',r.pc,'rank',r.rk,'tests',r.n,'me',(r.student_id = sid))
           order by r.rk, st.name),'[]'::jsonb) into top
    from overall_rank r join students st on st.id = r.student_id where r.rk <= 5;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'my_pct',mypct,'top',coalesce(top,'[]'::jsonb));
end $function$;
grant execute on function public.cbt_overall(text, text, text) to anon, authenticated;

commit;

-- check: should list the new indexes (or the ones that were already there) and show one 'overall' row after a home page visit
-- select indexname, tablename from pg_indexes where schemaname = 'cbt_private' order by tablename;
-- select * from cbt_private.rank_built;
