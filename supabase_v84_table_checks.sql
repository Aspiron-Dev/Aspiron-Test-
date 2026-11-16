-- =====================================================================
--  v84: database rules (CHECK constraints) on results, students and tests (finding V3 of the input-validation review)
--  Until now only the functions kept these tables sane. These rules are a second wall: even if a function ever has a
--  bug, the table itself refuses impossible values (negative counts, huge text, an unknown student status …).
--  The limits are wide on purpose: nothing the app or the admin panel writes today comes near them.
--  Each rule is added on its own. If old rows already break a rule, that rule is SKIPPED (no row is changed or deleted)
--  and the table at the end says which rule and how many rows. Everything else is still added.
--  Run after v83. Safe to run again (rules already there are left as they are). If a test is running right now and a
--  table is busy, a rule may be skipped with "busy": just run the file again later.
-- =====================================================================
create temp table if not exists v84_report (n int, tbl text, rule text, result text, bad_rows bigint);
truncate v84_report;

do $$
declare r record; v_bad bigint; i int := 0;
begin
  set local lock_timeout = '3s';
  for r in select * from (values
    -- results (a test attempt)
    ('results',  'v84_results_counts',   'coalesce(correct, 0) >= 0 and coalesce(wrong, 0) >= 0 and coalesce(skipped, 0) >= 0'),
    ('results',  'v84_results_time',     'used_seconds is null or used_seconds between 0 and 200000'),
    ('results',  'v84_results_max',      'max_score is null or max_score >= 0'),
    ('results',  'v84_results_sizes',    'coalesce(length(client_id), 0) <= 200 and coalesce(length(test_title), 0) <= 2000
                                          and coalesce(octet_length(answers::text), 0) <= 200000 and coalesce(octet_length(times::text), 0) <= 200000'),
    -- students
    ('students', 'v84_students_status',  'status::text in (''pending'', ''approved'', ''blocked'')'),
    ('students', 'v84_students_mobile',  'mobile ~ ''^[0-9]{10}$'' or mobile = '''''),
    ('students', 'v84_students_text',    'length(name) <= 200 and coalesce(length(email), 0) <= 500'),
    ('students', 'v84_students_counts',  'fail_count >= 0 and lock_fails >= 0 and locked_until >= 0 and max_devices between 0 and 50
                                          and coalesce(cardinality(devices), 0) <= 50'),
    ('students', 'v84_students_keep',    'octet_length(keep::text) <= 1000000'),
    -- tests
    ('tests',    'v84_tests_duration',   'duration between 1 and 10000'),
    ('tests',    'v84_tests_marks',      'correct_marks between 0 and 1000 and wrong_marks between 0 and 1000'),
    ('tests',    'v84_tests_questions',  'question_count >= 0 and jsonb_typeof(data) = ''array'''),
    ('tests',    'v84_tests_title',      'length(title) <= 2000')
  ) as t(tbl, rule, expr)
  loop
    i := i + 1;
    if exists (select 1 from pg_constraint where conname = r.rule and conrelid = ('cbt_private.' || r.tbl)::regclass) then
      insert into v84_report values (i, r.tbl, r.rule, 'already there', null);
      continue;
    end if;
    begin
      execute format('select count(*) from cbt_private.%I where not (%s)', r.tbl, r.expr) into v_bad;
    exception when others then
      insert into v84_report values (i, r.tbl, r.rule, 'SKIPPED: ' || sqlerrm, null);
      continue;
    end;
    if v_bad > 0 then
      insert into v84_report values (i, r.tbl, r.rule, 'SKIPPED: old rows break it (nothing changed)', v_bad);
      continue;
    end if;
    begin
      execute format('alter table cbt_private.%I add constraint %I check (%s)', r.tbl, r.rule, r.expr);
      insert into v84_report values (i, r.tbl, r.rule, 'added', 0);
    exception when lock_not_available then
      insert into v84_report values (i, r.tbl, r.rule, 'SKIPPED: busy, run this file again later', null);
    when others then
      insert into v84_report values (i, r.tbl, r.rule, 'SKIPPED: ' || sqlerrm, null);
    end;
  end loop;
end $$;

-- the result: every row should say "added" (or "already there" on a second run)
select tbl, rule, result, bad_rows from v84_report order by n;
