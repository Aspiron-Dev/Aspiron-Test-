-- =====================================================================
--  v81: size limits on submitting a test (finding V1 of the input-validation review)
--  Before: a signed-in student could submit a huge answers object (e.g. 50,000 answers for a 1-question test)
--  and a client id of any length, and all of it was saved in results. Now:
--   * cbt_submit refuses answers that are not an object or are longer than 60,000 characters (the same limit
--     cbt_save already has). The app sends about 3.6 KB for a 200-question test, so real students never reach it.
--   * the client id is cut to 80 characters (the app sends a 36-character id).
--   * grading saves only answers and times of the test's real questions (0 … questions-1), never other keys.
--  Score, marks and the grading itself are unchanged.
--  Run after v80. Safe to run again. (If v30 or v41 is ever run again, run this file again after it.)
-- =====================================================================

-- ---------- grading: keep only the test's real questions ----------
create or replace function cbt_private.grade_session(p_sess cbt_private.sessions, p_answers jsonb, p_client_id text, p_t bigint)
returns cbt_private.results language plpgsql security definer set search_path = cbt_private, pg_temp as $$
-- grades one attempt and saves the result; p_t = moment of the submit (ms). v81: only keys 0 … n-1 are kept.
declare x record; r cbt_private.results%rowtype;
        n int; i int; c int := 0; w int := 0; sk int := 0; ans int; key int; used int; clean jsonb; tm jsonb := '{}'::jsonb;
begin
  select * into x from tests where id = p_sess.test_id;
  n := jsonb_array_length(x.data);
  for i in 0..n-1 loop
    key := case when (x.data->i->>'answer') ~ '^[0-3]$' then (x.data->i->>'answer')::int else null end;
    ans := case when jsonb_typeof(p_answers) = 'object' and (p_answers->>(i::text)) ~ '^[0-3]$'
                then (p_answers->>(i::text))::int else null end;
    if ans is null or key is null then sk := sk + 1;
    elsif ans = key then c := c + 1;
    else w := w + 1;
    end if;
  end loop;

  used := least(((p_t - p_sess.started_at)/1000)::int, x.duration*60);
  clean := case when jsonb_typeof(p_answers) = 'object'
    then coalesce((select jsonb_object_agg(e.k, e.v) from jsonb_each(p_answers) as e(k,v)
                   where e.k ~ '^(0|[1-9][0-9]{0,3})$' and e.k::int < n and e.v::text ~ '^[0-3]$'),'{}'::jsonb)
    else '{}'::jsonb end;

  if jsonb_typeof(p_answers) = 'object' and jsonb_typeof(p_answers->'_t') = 'object' then
    select coalesce(jsonb_object_agg(e.k, least(greatest(floor((e.v #>> '{}')::numeric),0),3600)::int), '{}'::jsonb) into tm
    from (select k, v from jsonb_each(p_answers->'_t') as z(k,v)
          where k ~ '^(0|[1-9][0-9]{0,3})$' and k::int < n and jsonb_typeof(v) = 'number' limit 400) e;
  end if;

  insert into results(student_id,test_id,test_title,score,max_score,correct,wrong,skipped,used_seconds,answers,late,client_id,times,created_at)
  values (p_sess.student_id,p_sess.test_id,x.title,c*x.correct_marks - w*x.wrong_marks,n*x.correct_marks,c,w,sk,used,clean,
          p_t > p_sess.ends_at + 120000, left(p_client_id, 80), tm, to_timestamp(p_t / 1000.0))
  returning * into r;

  update sessions set submitted = true where id = p_sess.id;

  return r;
end $$;
revoke all on function cbt_private.grade_session(cbt_private.sessions, jsonb, text, bigint) from public, anon, authenticated;

-- ---------- cbt_submit (v41 + size limits) ----------
CREATE OR REPLACE FUNCTION public.cbt_submit(p_mobile text, p_code text, p_device text, p_test uuid, p_answers jsonb, p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess cbt_private.sessions%rowtype; r cbt_private.results%rowtype;
  v_cid text := left(p_client_id, 80);
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  -- v81: the same limit as cbt_save (a 200-question test is about 3.6 KB)
  if p_answers is not null and (jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text) > 60000) then
    return jsonb_build_object('ok',false,'error','bad_request');
  end if;

  select * into r from results where student_id = sid and client_id = v_cid and v_cid is not null;
  if found then
    if res_hidden(r.test_id) then return hidden_result(r); end if;
    return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(r.test_id),r.test_id,r.lang));
  end if;

  select * into x from tests where id = p_test;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;

  -- locked, so the server's auto-submit cannot grade the same attempt at the same moment
  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted for update;
  if not found then
    -- the server may have just auto-submitted this attempt (same client id): give that result back
    select * into r from results where student_id = sid and client_id = v_cid and v_cid is not null;
    if found then
      if res_hidden(r.test_id) then return hidden_result(r); end if;
      return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(r.test_id),r.test_id,r.lang));
    end if;
    return jsonb_build_object('ok',false,'error','no_session');
  end if;

  -- time over, and this attempt was auto-saved on the server while it ran: grade that saved copy at the end time (not late)
  if t > sess.ends_at + 120000 and sess.answers is not null then
    r := grade_session(sess, sess.answers, coalesce(sess.client_id, v_cid), sess.ends_at);
  else
    r := grade_session(sess, p_answers, v_cid, t);
  end if;

  if res_hidden(p_test) then return hidden_result(r); end if;
  return jsonb_build_object('ok',true,'result',result_json_t(r) || jsonb_build_object('lang',r.lang),'review',qs_lang(review_json(p_test),p_test,r.lang));
end $function$;

-- check (should be true, true)
select pg_get_functiondef('public.cbt_submit(text,text,text,uuid,jsonb,text)'::regprocedure) like '%v81: the same limit%' as submit_v81,
       pg_get_functiondef('cbt_private.grade_session(cbt_private.sessions,jsonb,text,bigint)'::regprocedure) like '%e.k::int < n%' as grade_v81;
