-- =====================================================================
--  v49: Answer sheet of one attempt (Admin → Results → a result → Answer sheet)
--  For a student who says "my answers were right but the result shows them wrong":
--  • every question of that attempt: the student's option, the correct option NOW, right / wrong / skipped,
--    seconds spent, and the medium the attempt was written in (English / हिंदी, with the Hindi text)
--  • the score counted again with today's answer key; when it differs from the saved score, the answer key
--    (or marks) were changed after the attempt
--  • changes of the test saved in the admin panel after the attempt (from the activity log)
--  • Re-grade: saves the score counted with today's answer key on that attempt (needs Results · manage)
--  Run after v48, then run supabase_v35_admin_team.sql AGAIN (permission check for cbt_admin_sheet). Safe to run again.
-- =====================================================================

create or replace function public.cbt_admin_sheet(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); r results%rowtype; x tests%rowtype; s students%rowtype;
        hi jsonb; n int; i int; key int; ans int; c int := 0; w int := 0; sk int := 0; qs jsonb := '[]'::jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action not in ('get', 'regrade') then return jsonb_build_object('ok', false, 'error', 'action'); end if;

  select * into r from results where id = nullif(d->>'id', '')::uuid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into x from tests where id = r.test_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'test_gone'); end if;
  select * into s from students where id = r.student_id;
  if r.lang = 'hi' then select h.data into hi from test_hi h where h.test_id = x.id; end if;

  n := jsonb_array_length(x.data);
  for i in 0..n-1 loop
    key := case when (x.data->i->>'answer') ~ '^[0-3]$' then (x.data->i->>'answer')::int end;
    ans := case when jsonb_typeof(r.answers) = 'object' and (r.answers->>(i::text)) ~ '^[0-3]$' then (r.answers->>(i::text))::int end;
    if ans is null or key is null then sk := sk + 1; elsif ans = key then c := c + 1; else w := w + 1; end if;
    if p_action = 'get' then
      qs := qs || jsonb_build_array(jsonb_build_object(
        'q', left(coalesce(x.data->i->>'q', ''), 600), 'options', coalesce(x.data->i->'options', '[]'::jsonb),
        'img', (coalesce(x.data->i->>'img', '') <> ''), 'sec', coalesce(x.data->i->>'sec', ''),
        'key', key, 'mine', ans, 'time', case when jsonb_typeof(r.times) = 'object' then r.times->(i::text) end,
        'hq', case when hi is not null then left(coalesce(hi->i->>'q', ''), 600) end,
        'hoptions', case when hi is not null then hi->i->'options' end));
    end if;
  end loop;

  if p_action = 'regrade' then
    update results set correct = c, wrong = w, skipped = sk, score = c * x.correct_marks - w * x.wrong_marks,
           max_score = n * x.correct_marks
     where id = r.id returning * into r;
    return jsonb_build_object('ok', true, 'score', r.score, 'max', r.max_score, 'correct', c, 'wrong', w, 'skipped', sk);
  end if;

  return jsonb_build_object('ok', true,
    'result', jsonb_build_object('id', r.id, 'at', (extract(epoch from r.created_at) * 1000)::bigint, 'lang', r.lang,
      'score', r.score, 'max', r.max_score, 'correct', r.correct, 'wrong', r.wrong, 'skipped', r.skipped,
      'used', r.used_seconds, 'late', r.late),
    'student', jsonb_build_object('name', s.name, 'mobile', s.mobile),
    'test', jsonb_build_object('id', x.id, 'title', x.title, 'correct', x.correct_marks, 'wrong', x.wrong_marks,
      'hi_paper', exists (select 1 from test_hi h where h.test_id = x.id)),
    'now', jsonb_build_object('correct', c, 'wrong', w, 'skipped', sk, 'score', c * x.correct_marks - w * x.wrong_marks,
      'max', n * x.correct_marks),
    'questions', qs,
    -- the test saved again in the admin panel after this attempt
    'edits', coalesce((select jsonb_agg(jsonb_build_object('at', (extract(epoch from a.at) * 1000)::bigint, 'who', a.who, 'act', a.act) order by a.at)
                       from (select * from admin_audit a2 where a2.at > r.created_at and a2.result = ''
                               and a2.act in ('test_save', 'test_set', 'test_clear')
                               and (a2.detail = x.title or a2.detail = x.id::text) order by a2.at limit 50) a), '[]'::jsonb),
    -- every attempt of this student in this test
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'at', (extract(epoch from o.created_at) * 1000)::bigint,
                           'score', o.score, 'max', o.max_score) order by o.created_at)
                          from results o where o.student_id = r.student_id and o.test_id = r.test_id), '[]'::jsonb));
end $$;
revoke all on function public.cbt_admin_sheet(text, text, jsonb) from public;
grant execute on function public.cbt_admin_sheet(text, text, jsonb) to anon, authenticated;
