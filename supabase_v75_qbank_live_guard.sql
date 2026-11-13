-- =====================================================================
--  v75: Question bank — no answer key of a live test before its result (security review A1)
--  The questions of a test can be put into the bank (Admin → Question bank → "Add the questions of a test"). Until now
--  nothing stopped this while the test was still live, and then any student could practise those questions and see
--  their answers before the result time.
--  Now: (1) the admin cannot add the questions of a test before its result time (they are counted as "held");
--  (2) questions of such a test already in the bank are not shown in practice, not picked for students' own tests,
--  and their answers are not given, until the result time (then they appear by themselves).
--  Run after v74, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

-- true = this bank question may be shown: not from a test, or from a test whose result is out
create or replace function cbt_private.qb_src_open(p_src text) returns boolean
language plpgsql stable security definer set search_path = cbt_private, pg_temp as $$
begin
  if coalesce(p_src, '') !~ '^test:[0-9a-f-]{36}:' then return true; end if;
  return not res_hidden(substring(p_src from 6 for 36)::uuid);
exception when others then
  return false;   -- an unreadable test id: keep it hidden
end $$;
revoke all on function cbt_private.qb_src_open(text) from public, anon, authenticated;

-- practice and students' own tests pick only questions that may be shown (was: immutable, active + tags)
create or replace function cbt_private.qb_match(b cbt_private.qbank, f jsonb) returns boolean language sql stable
  security definer set search_path = cbt_private, pg_temp as $$
  select b.active and cbt_private.qb_tags(b, f) and cbt_private.qb_src_open(b.src)
$$;
revoke all on function cbt_private.qb_match(cbt_private.qbank, jsonb) from public, anon, authenticated;

create or replace function public.cbt_qb_check(p_mobile text, p_code text, p_device text, p_q uuid, p_choice int)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; b qbank%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if p_choice is null or p_choice not between 0 and 3 then return jsonb_build_object('ok', false, 'error', 'invalid_choice'); end if;
  select * into b from qbank where id = p_q and active and qb_src_open(src);   -- v75: not a live test's question
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not rate_ok(sid, 'qbc', 800) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into qb_log (student_id, qid, choice, ok) values (sid, b.id, p_choice, p_choice = b.answer)
  on conflict (student_id, qid) do update set choice = excluded.choice, ok = excluded.ok, tries = qb_log.tries + 1, at = now();
  return jsonb_build_object('ok', true, 'right', p_choice = b.answer, 'answer', b.answer, 'explanation', b.explanation);
end $$;
grant execute on function public.cbt_qb_check(text, text, text, uuid, int) to anon, authenticated;

create or replace function public.cbt_gen_result(p_mobile text, p_code text, p_device text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; g gen_tests%rowtype;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into g from gen_tests where id = p_id and student_id = sid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.submitted_at is null and g.started_at is not null and g.ends_at + 120000 < now_ms() then
    perform gen_mark(g.id, null); select * into g from gen_tests where id = p_id;
  end if;
  if g.submitted_at is null then return jsonb_build_object('ok', false, 'error', 'not_done'); end if;
  return jsonb_build_object('ok', true, 'test', gen_card(g),
    'questions', coalesce((select jsonb_agg(qb_open(b) || jsonb_build_object('a', case when qb_src_open(b.src) then b.answer end, 'e', case when qb_src_open(b.src) then b.explanation else '' end, 'my', (g.answers->>b.id::text)::int) order by u.o)
                             from unnest(g.qids) with ordinality u(id, o) join qbank b on b.id = u.id), '[]'::jsonb));
end $$;
grant execute on function public.cbt_gen_result(text, text, text, uuid) to anon, authenticated;

create or replace function public.cbt_admin_qbank(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end; x jsonb;
  f jsonb; v_ids uuid[]; v_cnt int := 0; v_upd int := 0; v_q text; v_page int; v_id uuid; v_new boolean; v_held int := 0;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  f := case when jsonb_typeof(d->'f') = 'object' then d->'f' else '{}'::jsonb end;
  v_ids := case when jsonb_typeof(d->'ids') = 'array'
                then array(select v::uuid from jsonb_array_elements_text(d->'ids') v where v ~ '^[0-9a-f-]{36}$' limit 2000) else '{}' end;

  if p_action = 'stats' then
    return jsonb_build_object('ok', true, 'total', (select count(*) from qbank),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(subject, chapter, level, qtype, source, active, n))
                          from (select subject, chapter, level, qtype, source, active, count(*) n from qbank group by 1, 2, 3, 4, 5, 6) x), '[]'::jsonb),
      'tests', coalesce((select jsonb_object_agg(t, n) from (select split_part(src, ':', 2) t, count(*) n from qbank where src like 'test:%' group by 1) x), '{}'::jsonb),
      'pyq', (select count(*) from qbank where src like 'pyq:%'),
      'pyq_all', (select count(*) from public.cbt_pyq where not has_img and answer between 0 and 3 and jsonb_array_length(options) = 4),
      'practised', (select count(distinct student_id) from qb_log),
      'gen', (select count(*) from gen_tests));

  elsif p_action = 'list' then
    v_q := lower(left(coalesce(d->>'q', ''), 80));
    v_page := greatest(0, least(1000, case when d->>'page' ~ '^\d{1,4}$' then (d->>'page')::int else 0 end));
    return jsonb_build_object('ok', true,
      'total', (select count(*) from qbank b where qb_tags(b, f) and (d->>'on' is null or b.active = (d->>'on')::boolean)
                  and (v_q = '' or position(v_q in lower(b.q)) > 0)),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 's', subject, 'c', chapter, 't', topic, 'l', level, 'y', qtype, 'o', source,
                  'q', left(q, 300), 'img', img is not null, 'a', answer, 'on', active, 'src', src) order by created_at desc, id)
                  from (select * from qbank b where qb_tags(b, f) and (d->>'on' is null or b.active = (d->>'on')::boolean)
                          and (v_q = '' or position(v_q in lower(b.q)) > 0)
                        order by created_at desc, id offset v_page * 50 limit 50) l), '[]'::jsonb));

  elsif p_action = 'get' then
    return jsonb_build_object('ok', true, 'item', (select to_jsonb(b) from qbank b where id = (d->>'id')::uuid));

  elsif p_action in ('add', 'save') then
    for x in select * from jsonb_array_elements(case when p_action = 'save' then jsonb_build_array(d) when jsonb_typeof(d->'items') = 'array' then d->'items' else '[]'::jsonb end) loop
      exit when v_cnt + v_upd >= 300;
      if coalesce(btrim(x->>'q'), '') = '' and coalesce(x->>'img', '') = '' then continue; end if;
      if jsonb_typeof(x->'options') is distinct from 'array' or jsonb_array_length(x->'options') <> 4 then continue; end if;
      if coalesce(x->>'answer', '') !~ '^[0-3]$' then continue; end if;
      -- v75 (review A1): the questions of a live test whose result is not out yet never go into the bank
      if not qb_src_open(x->>'src') then v_held := v_held + 1; continue; end if;
      if p_action = 'save' and x->>'id' ~ '^[0-9a-f-]{36}$' then
        update qbank set subject = left(coalesce(x->>'subject', subject), 30), chapter = left(coalesce(x->>'chapter', chapter), 40),
               topic = left(coalesce(x->>'topic', topic), 80),
               level = case when x->>'level' in ('easy', 'medium', 'hard') then x->>'level' else level end,
               qtype = case when x->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then x->>'qtype' else qtype end,
               source = case when x->>'source' in ('ncert', 'pyq', 'extra') then x->>'source' else source end,
               q = left(x->>'q', 6000), options = x->'options', answer = (x->>'answer')::int,
               explanation = left(coalesce(x->>'explanation', ''), 6000), active = coalesce((x->>'active')::boolean, active)
         where id = (x->>'id')::uuid;
        get diagnostics v_cnt = row_count;
        continue;
      end if;
      insert into qbank (subject, chapter, topic, level, qtype, source, q, options, answer, explanation, img, oimg, src)
      values (left(coalesce(x->>'subject', ''), 30), left(coalesce(x->>'chapter', ''), 40), left(coalesce(x->>'topic', ''), 80),
              case when x->>'level' in ('easy', 'medium', 'hard') then x->>'level' else 'medium' end,
              case when x->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then x->>'qtype' else qb_type(coalesce(x->>'q', '')) end,
              case when x->>'source' in ('ncert', 'pyq', 'extra') then x->>'source' else 'extra' end,
              left(coalesce(x->>'q', ''), 6000), x->'options', (x->>'answer')::int, left(coalesce(x->>'explanation', ''), 6000),
              case when length(coalesce(x->>'img', '')) between 1 and 600000 then x->>'img' end,
              case when jsonb_typeof(x->'oimg') = 'array' and length((x->'oimg')::text) <= 1200000 then x->'oimg' end,
              case when x->>'src' ~ '^test:[0-9a-f-]{36}:\d{1,4}$' then x->>'src' end)
      on conflict (src) do update set subject = excluded.subject, chapter = excluded.chapter, topic = excluded.topic, level = excluded.level,
              qtype = excluded.qtype, source = excluded.source, q = excluded.q, options = excluded.options, answer = excluded.answer,
              explanation = excluded.explanation, img = excluded.img, oimg = excluded.oimg
      returning (xmax = 0) into v_new;
      if v_new then v_cnt := v_cnt + 1; else v_upd := v_upd + 1; end if;
    end loop;
    return jsonb_build_object('ok', true, 'added', v_cnt, 'updated', v_upd, 'held', v_held);

  elsif p_action = 'set' then   -- the same tag for many questions
    update qbank set level = case when d->>'level' in ('easy', 'medium', 'hard') then d->>'level' else level end,
           qtype = case when d->>'qtype' in ('mcq', 'statement', 'match', 'fill', 'assertion') then d->>'qtype' else qtype end,
           source = case when d->>'source' in ('ncert', 'pyq', 'extra') then d->>'source' else source end,
           active = case when d ? 'active' then coalesce((d->>'active')::boolean, active) else active end
     where id = any (v_ids);
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'changed', v_cnt);

  elsif p_action = 'delete' then
    delete from qbank where id = any (v_ids);
    get diagnostics v_cnt = row_count;
    delete from qb_log where qid = any (v_ids);
    return jsonb_build_object('ok', true, 'deleted', v_cnt);

  elsif p_action = 'remove_test' then   -- take a test's questions out of the bank again
    delete from qbank where src like 'test:' || (d->>'test')::uuid::text || ':%';
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'deleted', v_cnt);

  elsif p_action = 'import_pyq' then   -- every PYQ with 4 options and an answer (diagram questions are skipped)
    insert into qbank (subject, chapter, topic, level, qtype, source, q, options, answer, explanation, src)
    select p.subject, p.chapter, p.topic, 'medium', qb_type(p.q), 'pyq', p.q, p.options, p.answer, p.explanation, 'pyq:' || p.id
      from public.cbt_pyq p
     where not p.has_img and p.answer between 0 and 3 and jsonb_array_length(p.options) = 4
    on conflict (src) do update set subject = excluded.subject, chapter = excluded.chapter, topic = excluded.topic,
           q = excluded.q, options = excluded.options, answer = excluded.answer, explanation = excluded.explanation;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('ok', true, 'added', v_cnt);
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;
grant execute on function public.cbt_admin_qbank(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v75 installed — now run supabase_v35_admin_team.sql again' as status;
