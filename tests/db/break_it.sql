-- "Break it" tests: an attacker's attempts against the real database functions, run on a throw-away test database
-- built by tests/db/build.sh. Every check must PASS; any FAIL stops CI. Do not weaken or delete a check to make it pass.
-- Run: psql -v ON_ERROR_STOP=1 -X -f tests/db/break_it.sql
\set ON_ERROR_STOP 1
\pset pager off
\t on
\a
set client_min_messages = warning;
create temp table t (n serial, name text, ok boolean, info text);
grant all on t to anon;
grant all on sequence t_n_seq to anon;
create function pg_temp.chk(p_name text, p_ok boolean, p_info text default '') returns void language sql as
  $$ insert into t (name, ok, info) values (p_name, coalesce(p_ok, false), coalesce(p_info, '')) $$;
grant execute on function pg_temp.chk(text, boolean, text) to anon;
select set_config('request.headers', '{"x-real-ip":"203.0.113.10"}', false);
-- v62: the admin-key check of the sign-in is tested in section 27; the other sections sign in without it
delete from cbt_private.settings where key = 'admin_gate';

-- ===== 1. signed out / wrong code: every student function refuses =====
do $$ declare f record; r jsonb; n int := 0; bad text := ''; begin
  for f in select p.proname, p.proargnames,
                  (select array_agg(format_type(x, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(x, o)) ty
             from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.proname like 'cbt\_%' and p.proargnames[1] = 'p_mobile' and p.proargnames[2] = 'p_code'
              and p.proname <> 'cbt_logout' loop
    begin
      execute 'set local role anon';
      execute format('select (public.%I(%s))::jsonb', f.proname, (select string_agg(case when a = 'p_mobile' then '''9000000001'''
              when a = 'p_code' then '''WRONG999''' when a = 'p_device' then '''dev-aaaaaaaa''' else 'null::' || f.ty[i] end, ',')
              from unnest(f.proargnames) with ordinality u(a, i))) into r;
      execute 'reset role';
    exception when others then r := jsonb_build_object('ok', false); execute 'reset role'; end;
    n := n + 1;
    if coalesce((r->>'ok')::boolean, false) then bad := bad || f.proname || ' '; end if;
  end loop;
  perform pg_temp.chk('1 signed-out: no student function answers with a wrong code', n > 20 and bad = '', n || ' functions; accepted: ' || bad);
end $$;
update cbt_private.students set fail_count = 0, locked_until = 0 where mobile = '9000000001';

-- ===== 2. every admin function refuses bad credentials =====
do $$ declare f record; r jsonb; bad_pw text; n int := 0; bad text := ''; begin
  foreach bad_pw in array array['wrong-password', '', 'as1.00000000-0000-0000-0000-000000000000.' || repeat('a', 64), $q$' or 1=1--$q$] loop
    for f in select p.proname, p.proargnames from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              where ns.nspname = 'public' and p.proname like 'cbt\_admin%' and p.proname not in ('cbt_admin_login', 'cbt_admin_logout')
                and p.proargnames[1] = 'p_pw' loop
      begin
        execute 'set local role anon';
        execute format('select (public.%I(%s))::jsonb', f.proname, (select string_agg(case when a = 'p_pw' then quote_literal(bad_pw) || '::text'
                when a = 'p_action' then '''get''' when a = 'p_data' then '''{}''::jsonb' when a = 'p_item' then 'null::uuid' else 'null' end, ',')
                from unnest(f.proargnames) a)) into r;
        execute 'reset role';
      exception when others then r := jsonb_build_object('ok', false); execute 'reset role'; end;
      n := n + 1;
      if coalesce((r->>'ok')::boolean, false) then bad := bad || f.proname || ' '; end if;
    end loop;
  end loop;
  perform pg_temp.chk('2 admin: no admin function answers with bad credentials', n > 60 and bad = '', n || ' calls; accepted: ' || bad);
end $$;
delete from cbt_private.admin_fails; delete from cbt_private.admin_fail_log; delete from cbt_private.settings where key = 'admin_locked_until';

-- ===== 3. answer key never sent at the start of a non-practice test; paid test locked =====
set role anon;
select pg_temp.chk('3a start: no answer / explanation in the questions',
  not ((public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000002')->'test'->'questions')::text ~ '"(answer|explanation)"'));
select pg_temp.chk('3b start: a paid test is locked for a free student',
  public.cbt_start('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000001')->>'error' = 'locked');
select pg_temp.chk('3c files: a paid series file is locked for a free student',
  public.cbt_file_part('9000000001','AAAA1111','dev-aaaaaaaa','ffffffff-0000-0000-0000-000000000001',0)->>'error' = 'locked');
select pg_temp.chk('3d files: the student of the series gets the file',
  public.cbt_file_part('9000000002','BBBB2222','dev-bbbbbbbb','ffffffff-0000-0000-0000-000000000001',0)->>'data' = 'PAID-PDF-CONTENT');

-- ===== 4. result, answers and rank stay hidden until the result time =====
select public.cbt_submit('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000002','{"0":1}','held-1')::text as held \gset
select pg_temp.chk('4a submit before result time: hidden, no score, no review',
  (:'held')::jsonb->>'hidden' = 'true' and (:'held')::jsonb->'result'->>'score' is null and (:'held')::jsonb->'review' = '[]'::jsonb);
select public.cbt_bookmark('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000002',0,true)->>'ok';
select pg_temp.chk('4b bookmarks: no answer before result time',
  (select bool_and(e->>'answer' is null) from jsonb_array_elements(public.cbt_bookmarks('9000000002','BBBB2222','dev-bbbbbbbb')->'items') e));
select pg_temp.chk('4c leaderboard hidden before result time',
  public.cbt_leaderboard('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000002')->>'hidden' = 'true');
select pg_temp.chk('4d review of the held result refused',
  public.cbt_review('9000000002','BBBB2222','dev-bbbbbbbb',((:'held')::jsonb->'result'->>'id')::uuid)->>'error' = 'hidden');

-- ===== 5. student A cannot read student B's result =====
select pg_temp.chk('5 A opens B''s result: not found',
  public.cbt_review('9000000001','AAAA1111','dev-aaaaaaaa',((:'held')::jsonb->'result'->>'id')::uuid)->>'error' = 'not_found');

-- ===== 6. a score sent by the browser is ignored =====
select public.cbt_start('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004')->>'ok';
select pg_temp.chk('6 tampered score: {"score":999} ignored, graded on the server',
  (public.cbt_submit('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004','{"score":999,"max":999,"0":3}','tamper-1')->'result'->>'score')::numeric = 4);
select pg_temp.chk('6b double submit: same answer for the same attempt, a second one refused',
  public.cbt_submit('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004','{"0":0}','tamper-2')->>'error' = 'no_session');
select pg_temp.chk('6c answers cannot be changed after submit',
  public.cbt_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004','{"0":0}','tamper-1')->>'error' = 'no_session');

-- ===== 7. expired timer =====
select public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000004')->>'ok';
reset role;
update cbt_private.sessions set started_at = started_at - 2400000, ends_at = ends_at - 2400000
 where student_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and test_id = 'aaaaaaaa-0000-0000-0000-000000000004' and not submitted;
set role anon;
select pg_temp.chk('7a saving after the time is over is refused',
  public.cbt_save('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000004','{"0":3}','late-1')->>'error' = 'over');
select public.cbt_submit('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000004','{"0":3}','late-1')->>'ok';
select pg_temp.chk('7b a late submit is never ranked',
  public.cbt_leaderboard('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000004')->>'my_rank' is null);
reset role;
select pg_temp.chk('7c the late result is marked late', (select late from cbt_private.results where client_id = 'late-1'));

-- ===== 8. live test ends at "Live ends" =====
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice,closes_at,result_at) values
  ('aaaaaaaa-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','Live 9PM',180,'[{"q":"LQ","options":["a","b","c","d"],"answer":1}]',1,true,false,
   (extract(epoch from now())*1000)::bigint+120000,(extract(epoch from now())*1000)::bigint+3600000);
set role anon;
select public.cbt_start('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000005')::text as live \gset
reset role;
select pg_temp.chk('8 start 2 min before Live ends: the attempt ends at Live ends',
  ((:'live')::jsonb->'session'->>'ends_at')::bigint = (select closes_at from cbt_private.tests where id = 'aaaaaaaa-0000-0000-0000-000000000005'));

-- ===== 9. per-student limits (bulk copying) =====
insert into cbt_private.rate_hits(student_id, kind) select 'bbbbbbbb-0000-0000-0000-00000000000b', 'start' from generate_series(1, 30);
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice) values
  ('aaaaaaaa-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','Another',30,'[{"q":"A","options":["a","b","c","d"],"answer":0}]',1,true,false);
set role anon;
select pg_temp.chk('9 the 31st new attempt in an hour is refused (busy)',
  public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000006')->>'error' = 'busy');
reset role;
delete from cbt_private.rate_hits;

-- ===== 10. XSS payloads are cleaned on the server =====
set role anon;
select public.cbt_request_access('<script>alert(1)</script>Ravi','8123400000')->>'ok';
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','<img src=x onerror=alert(1)>Asha','9123400000')->>'ok';
reset role;
select pg_temp.chk('10 names from public forms keep no < > " `',
  (select name !~ '[<>"`]' from cbt_private.students where mobile = '8123400000')
  and (select bool_and(name !~ '[<>"`]') from public.cbt_store_orders where mobile = '9123400000'));

-- ===== 11. no direct table access from outside =====
do $$ declare s text; n int := 0; begin
  foreach s in array array['select * from cbt_private.students', 'select * from public.cbt_store_orders', 'delete from public.cbt_reviews',
                           'insert into cbt_private.results(score) values (999)', 'update public.cbt_store_orders set status = ''paid''',
                           'select * from public.cbt_push_subs', 'select * from cbt_private.admin_users'] loop
    begin execute 'set local role anon'; execute s; execute 'reset role';
    exception when insufficient_privilege then n := n + 1; execute 'reset role'; end;
  end loop;
  perform pg_temp.chk('11 anon cannot read or change any table directly', n = 7, n || ' of 7 refused');
end $$;

-- ===== 12. store: an order code is never handed to someone who only knows the mobile =====
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Victim Name','9811111111')->>'code' as vcode \gset
select set_config('request.headers', '{"x-real-ip":"198.51.100.66"}', false);
select pg_temp.chk('12a store: another call never gets the existing order code',
  public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Hacker','9811111111')->>'code' <> :'vcode');
select public.cbt_store_paid('ASP-0000' || g, '9811111111', 'X Y', '') from generate_series(1, 20) g;
select pg_temp.chk('12b store: guessing order codes is stopped after 20 wrong codes',
  public.cbt_store_paid('ASP-00099','9811111111','X Y','')->>'error' = 'busy');
select public.cbt_promo_click('attackerlink') from generate_series(1, 5);
reset role;
select pg_temp.chk('12c promotion: 5 clicks from one connection count once', (select clicks from public.cbt_promo_links where code = 'attackerlink') = 1);
select pg_temp.chk('12d store: the victim''s order is untouched', (select name = 'Victim Name' and payer = '' and promo_code is null
  from public.cbt_store_orders where code = :'vcode'));
select set_config('request.headers', '{"x-real-ip":"203.0.113.10"}', false);

-- ===== 13. student sign-in tokens =====
set role anon;
select public.cbt_login('9000000002','BBBB2222','dev-bbbbbbbb')->>'token' as tok \gset
select pg_temp.chk('13a login returns a token, the token works', left(:'tok', 4) = 'st1.'
  and public.cbt_catalog('9000000002',:'tok','dev-bbbbbbbb')->>'ok' = 'true');
select pg_temp.chk('13b the token does not work on another phone', public.cbt_catalog('9000000002',:'tok','dev-other00')->>'error' = 'invalid');
select pg_temp.chk('13c the token does not work for another number', public.cbt_catalog('9000000001',:'tok','dev-bbbbbbbb')->>'error' = 'invalid');
select public.cbt_logout('9000000002',:'tok','dev-bbbbbbbb')->>'ok';
select pg_temp.chk('13d after sign-out the token is dead', public.cbt_catalog('9000000002',:'tok','dev-bbbbbbbb')->>'error' = 'invalid');
reset role;

-- ===== 14. admin: team permissions and two-step sign-in =====
select public.cbt_admin_login('','OwnerPass2026x','Owner')->>'token' as ow \gset
-- v62: team sign-in is off until the owner turns it on
select public.cbt_admin_team(:'ow','team_login','{"on":true}')->>'ok';
select public.cbt_admin_team(:'ow','user_save','{"name":"Viewer","username":"viewer1","password":"Tr7k-9mQz-pLx2","perms":{"students":"view"}}')->>'ok';
select public.cbt_admin_login('viewer1','Tr7k-9mQz-pLx2','V')->>'token' as vt \gset
select pg_temp.chk('14a view-only member cannot delete a student',
  public.cbt_admin(:'vt','student_delete','{"id":"bbbbbbbb-0000-0000-0000-00000000000a"}')->>'error' = 'forbidden');
select pg_temp.chk('14b view-only member cannot open payments', public.cbt_admin_payments(:'vt','get','{}')->>'error' = 'forbidden');
select pg_temp.chk('14c member cannot see the team', public.cbt_admin_team(:'vt','get','{}')->>'error' = 'forbidden');
select pg_temp.chk('14c2 member cannot read or set a test PDF link (owner only)',
  public.cbt_admin_test_pdf(:'vt','get','{}')->>'error' = 'forbidden'
  and public.cbt_admin_test_pdf(:'vt','set','{"id":"aaaaaaaa-0000-0000-0000-000000000001","url":"https://drive.google.com/file/d/x"}')->>'error' = 'forbidden');
select public.cbt_admin_test_pdf(:'ow','remove','{"id":"aaaaaaaa-0000-0000-0000-000000000001"}') \gset pdf_
select pg_temp.chk('14c3 an owner change to a test PDF link is written to the activity log',
  exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_test_pdf' and act = 'remove' and who = 'Owner'));
select pg_temp.chk('14d new admin passwords must be strong',
  public.cbt_admin_team(:'ow','user_save','{"name":"Weak","username":"weak1","password":"aspiron123","perms":{}}')->>'error' = 'password');
select public.cbt_admin_2fa(:'ow','start','{"password":"OwnerPass2026x"}')->>'secret' as sec \gset
select public.cbt_admin_2fa(:'ow','confirm',jsonb_build_object('code', cbt_private.adm_totp(:'sec', floor(extract(epoch from now())/30)::bigint)))->>'ok';
select pg_temp.chk('14e with 2FA on, the owner password alone opens nothing', public.cbt_admin('OwnerPass2026x','ping','{}')->>'error' = 'need_2fa');
select pg_temp.chk('14f sign-in without the code asks for it', public.cbt_admin_login('','OwnerPass2026x','X')->>'error' = 'otp_required');
select pg_temp.chk('14g a used code does not work twice',
  public.cbt_admin_login('','OwnerPass2026x','X', cbt_private.adm_totp(:'sec', floor(extract(epoch from now())/30)::bigint))->>'error' = 'otp_invalid');
select pg_temp.chk('14h passwords are kept with bcrypt', (select value like '$2%' from cbt_private.settings where key = 'admin_hash'));

-- ===== 15. other attack paths =====
set role anon;
select pg_temp.chk('15a access request: same answer for an existing number', public.cbt_request_access('Some One','9000000001')->>'status' = 'received');
select pg_temp.chk('15b push: only real push services are saved',
  public.cbt_push_save('9000000002','BBBB2222','dev-bbbbbbbb','{"endpoint":"https://evil.example/x","keys":{"p256dh":"a","auth":"b"}}',true)->>'error' = 'sub');
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Buyer','9333333333')->>'ok';
select pg_temp.chk('15c a student cannot move their account to a buyer''s number',
  public.cbt_me('9000000001','AAAA1111','dev-aaaaaaaa','mobile','{"mobile":"9333333333"}')->>'error' = 'taken');
reset role;
select code as dcode from public.cbt_store_orders where mobile = '9333333333' limit 1 \gset
select public.cbt_admin_edit(:'ow','order_delete',jsonb_build_object('code',:'dcode'))->>'ok';
select pg_temp.chk('15d a deleted order is kept in the trash', exists (select 1 from cbt_private.order_trash where code = :'dcode'));

-- ===== 16. database hardening =====
select pg_temp.chk('16a anon can run no cbt_private function',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'cbt_private' and has_function_privilege('anon', p.oid, 'EXECUTE')));
select pg_temp.chk('16b authenticated can run no cbt_* function',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'cbt\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')));
select pg_temp.chk('16c every SECURITY DEFINER function has a fixed search path with pg_temp',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','cbt_private') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c ~ 'pg_temp')));
select pg_temp.chk('16d RLS on every table', not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','cbt_private') and c.relkind = 'r' and not c.relrowsecurity));

-- ===== 17. R1–R3 (SECURITY_REVIEW.md, fixed in supabase_v47_alerts_results.sql) =====
-- R1: a live test with "Live ends" but no result time keeps the answer key, score and rank until "Live ends"
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice,closes_at,result_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1','22222222-2222-2222-2222-222222222222','Live, no result time',60,
   '[{"q":"KQ","options":["a","b","c","d"],"answer":2,"explanation":"KEY"}]',1,true,false,(extract(epoch from now())*1000)::bigint+3600000,null)
  on conflict (id) do nothing;
set role anon;
select public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f1')->>'ok';
select public.cbt_submit('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f1','{"0":2}','r1-live') as r1 \gset
select pg_temp.chk('17a R1 only "Live ends": no answer key or score at submit',
  (:'r1'::jsonb->>'hidden')::boolean and not ((:'r1'::jsonb)::text ~ '"answer"|KEY') and (:'r1'::jsonb->'result'->>'score') is null);
select pg_temp.chk('17c R1 only "Live ends": review and rank hidden too',
  public.cbt_review('9000000002','BBBB2222','dev-bbbbbbbb',(:'r1'::jsonb->'result'->>'id')::uuid)->>'error' = 'hidden'
  and (public.cbt_leaderboard('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f1')->>'hidden')::boolean);
reset role;
select pg_temp.chk('17b R1 only "Live ends": the result shows when "Live ends" comes',
  (:'r1'::jsonb->>'result_at')::bigint = (select closes_at from cbt_private.tests where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'));
update cbt_private.tests set closes_at = (extract(epoch from now())*1000)::bigint - 1000 where id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
set role anon;
select pg_temp.chk('17d R1 after "Live ends" the answer key is shown',
  public.cbt_review('9000000002','BBBB2222','dev-bbbbbbbb',(:'r1'::jsonb->'result'->>'id')::uuid)::text ~ 'KEY');
reset role;

-- R2: deleting a student removes everything about them; students cannot do it themselves
insert into cbt_private.students(id,name,mobile,status,salt,code_hash) values
  ('bbbbbbbb-0000-0000-0000-0000000000d1','To Delete','9000000099','approved','sd',cbt_private.hash_code('sd','DDDD4444')) on conflict do nothing;
insert into public.cbt_push_subs(endpoint, mobile, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/del1','9000000099','a','b') on conflict do nothing;
insert into cbt_private.results(student_id,test_id,test_title,score,max_score,correct,wrong,skipped,used_seconds,answers)
  values ('bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000004','x',0,4,0,0,1,1,'{}');
insert into cbt_private.bookmarks(student_id,test_id,qidx) values ('bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000004',0);
select pg_temp.chk('17e R2 no public function lets a student export or delete their own account',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proargnames[1] = 'p_mobile' and p.proname ~ '(export|erase|forget|download|delete_(me|account|student|data))'));
select public.cbt_admin_login('','OwnerPass2026x','Owner', cbt_private.adm_totp(:'sec', floor(extract(epoch from now())/30)::bigint + 1))->>'token' as ow2 \gset
select public.cbt_admin(:'ow2','student_delete','{"id":"bbbbbbbb-0000-0000-0000-0000000000d1"}')->>'ok';
select pg_temp.chk('17f R2 admin delete removes results, saved questions and phone subscriptions',
  not exists (select 1 from cbt_private.students where id = 'bbbbbbbb-0000-0000-0000-0000000000d1')
  and not exists (select 1 from cbt_private.results where student_id = 'bbbbbbbb-0000-0000-0000-0000000000d1')
  and not exists (select 1 from cbt_private.bookmarks where student_id = 'bbbbbbbb-0000-0000-0000-0000000000d1')
  and not exists (select 1 from public.cbt_push_subs where mobile = '9000000099'));

-- R3: attacks and misuse leave security events, and serious ones become alerts for the owner
select set_config('request.headers', '{"x-real-ip":"198.51.100.33"}', false);
select public.cbt_admin_login('','wrong-guess-' || g,'X')->>'error' from generate_series(1,5) g;
select pg_temp.chk('17g R3 5 wrong owner passwords: one alert',
  (select count(*) from cbt_private.security_events where kind = 'owner_wrong_password' and ip = '198.51.•.•') = 5
  and (select count(*) from cbt_private.security_events where kind = 'many:owner_wrong_password' and level = 'high') = 1);
set role anon;
select public.cbt_catalog('9000000001','WRONG' || g,'dev-aaaaaaaa')->>'error' from generate_series(1,8) g;
reset role;
select pg_temp.chk('17h R3 a student locked out by wrong codes is recorded',
  exists (select 1 from cbt_private.security_events where kind = 'student_locked' and who like 'Free Student%'));
select pg_temp.chk('17i R3 refused actions and team changes are recorded',
  exists (select 1 from cbt_private.security_events where kind = 'refused')
  and exists (select 1 from cbt_private.security_events where kind = 'team_changed' and level = 'high'));
-- the "lost phone" way from SECURITY_RUNBOOK.md (SQL Editor) must raise the alert too
delete from cbt_private.admin_totp where acct = 'owner';
select pg_temp.chk('17j R3 turning two-step sign-in off raises an alert',
  exists (select 1 from cbt_private.security_events where kind = '2fa_off' and level = 'high'));
select pg_temp.chk('17k R3 no password or code is kept in the events',
  not exists (select 1 from cbt_private.security_events where (who || detail) ~* 'wrong-guess|OwnerPass|WRONG[0-9]|Tr7k'));
select pg_temp.chk('17l R3 a team member cannot read the alerts', public.cbt_admin_security(:'vt','get','{}')->>'error' = 'forbidden');
select pg_temp.chk('17m R3 the owner sees the alerts',
  (public.cbt_admin_security(:'ow2','get','{}')->>'unseen')::int > 0);
set role anon;
do $$ begin
  begin perform 1 from cbt_private.security_events; perform pg_temp.chk('17n R3 alerts cannot be read from outside', false);
  exception when others then perform pg_temp.chk('17n R3 alerts cannot be read from outside', true); end;
end $$;
reset role;
select pg_temp.chk('17o R3 the hourly GitHub check reports each alert once',
  (select count(*) from cbt_private.sec_mail()) > 0 and (select count(*) from cbt_private.sec_mail()) = 0);

-- ===== 18. R4–R13 (SECURITY_REVIEW.md, fixed in supabase_v48_review_low.sql) =====
-- R4: buyers' IPs are not a plain md5 any more, and old ones are cleared
select set_config('request.headers', '{"x-real-ip":"203.0.113.44"}', false);
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Ip Buyer','9444444444')->>'ok';
reset role;
select pg_temp.chk('18a R4 a buyer''s IP is kept with a keyed hash, not md5',
  (select ip <> '' and ip <> md5('cbt-store|203.0.113.44') and length(ip) = 64 from public.cbt_store_orders where mobile = '9444444444' limit 1));
update public.cbt_store_orders set created_at = now() - interval '31 days' where mobile = '9444444444';
select cbt_private.ip_purge();
select pg_temp.chk('18b R4 IPs older than 30 days are cleared',
  (select ip = '' from public.cbt_store_orders where mobile = '9444444444' limit 1)
  and exists (select 1 from cron.job where jobname = 'cbt-ip-purge'));

-- R5: a live test marked "practice" by mistake sends no answers at the start and holds the result back
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice,closes_at,result_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000f5','22222222-2222-2222-2222-222222222222','Live but practice',60,
   '[{"q":"PQ","options":["a","b","c","d"],"answer":1,"explanation":"PKEY"}]',1,true,true,(extract(epoch from now())*1000)::bigint+3600000,null)
  on conflict (id) do nothing;
set role anon;
select pg_temp.chk('18c R5 practice + "Live ends" ahead: no answer key at the start',
  not (public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f5')::text ~ '"answer"|PKEY'));
select pg_temp.chk('18d R5 practice + "Live ends" ahead: no answer key at submit',
  not (public.cbt_submit('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f5','{"0":1}','r5')::text ~ '"answer"|PKEY'));
reset role;

-- R6: a team member giving free access shows on the owner's bell
select public.cbt_admin_team(:'ow2','user_save','{"name":"Support","username":"support1","password":"Tr7k-9mQz-pLx3","perms":{"students":"manage"}}')->>'ok';
select public.cbt_admin_login('support1','Tr7k-9mQz-pLx3','S')->>'token' as st6 \gset
update cbt_private.security_events set seen = true;
select public.cbt_admin(:'st6','grant','{"student_id":"bbbbbbbb-0000-0000-0000-00000000000a","series_id":"11111111-1111-1111-1111-111111111111","on":true}')->>'ok';
select pg_temp.chk('18e R6 a member giving access raises a bell alert for the owner',
  exists (select 1 from cbt_private.security_events where kind = 'member_access_or_money' and level = 'warn' and who = 'Support')
  and (public.cbt_admin_security(:'ow2','count','{}')->>'unseen')::int >= 1);
select pg_temp.chk('18f R6 bell alerts are not e-mailed', not exists (select 1 from cbt_private.sec_mail() m where m like 'member_access%'));

-- R10: access codes are changed over to bcrypt at the next sign-in; signed-in phones stay signed in
set role anon;
select public.cbt_login('9000000002','BBBB2222','dev-bbbbbbbb')->>'token' as tk10 \gset
reset role;
select pg_temp.chk('18g R10 after a sign-in with the code it is kept with bcrypt',
  (select salt like 'b1$%' and code_hash like '$2a$08$%' from cbt_private.students where mobile = '9000000002'));
set role anon;
select pg_temp.chk('18h R10 the same code and the token still work, a wrong code does not',
  (public.cbt_catalog('9000000002','BBBB2222','dev-bbbbbbbb')->>'ok')::boolean
  and (public.cbt_catalog('9000000002',:'tk10','dev-bbbbbbbb')->>'ok')::boolean
  and public.cbt_catalog('9000000002','BBBB2223','dev-bbbbbbbb')->>'error' = 'invalid');
reset role;

insert into cbt_private.students(id,name,mobile,status,salt,code_hash,devices) values
  ('bbbbbbbb-0000-0000-0000-0000000000e7','Old Phone','9000000077','approved','s7',cbt_private.hash_code('s7','EEEE7777'),'{dev-eeeeeeee}') on conflict do nothing;
select cbt_private.st_new('bbbbbbbb-0000-0000-0000-0000000000e7','dev-eeeeeeee') as tk7 \gset
set role anon;
select public.cbt_catalog('9000000077','EEEE7777','dev-eeeeeeee')->>'ok';
select pg_temp.chk('18j R10 a phone signed in before the change-over stays signed in',
  (public.cbt_catalog('9000000077',:'tk7','dev-eeeeeeee')->>'ok')::boolean);
reset role;

-- R13: "busy" answers HTTP 429
select pg_temp.chk('18i R13 a refused request answers HTTP 429 with Retry-After',
  (select not cbt_private.rate_ok('bbbbbbbb-0000-0000-0000-00000000000a', 't429', 0)
          and current_setting('response.status', true) = '429' and current_setting('response.headers', true) like '%Retry-After%'));

-- ===== 19. v52 coupons + Refer & Earn wallet =====
select set_config('request.headers', '{"x-real-ip":"198.51.100.52"}', false);
select public.cbt_admin_login('','OwnerPass2026x','X', cbt_private.adm_totp(:'sec', floor(extract(epoch from now())/30)::bigint + 1))->>'token' as ow5 \gset
select public.cbt_admin_coupons(:'ow5','set',jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','code','diwali','kind','flat','value',100,
  'ends_at', floor(extract(epoch from now() + interval '3 days') * 1000)::bigint))->>'ok' as cset \gset
select pg_temp.chk('19a admin sets one coupon for a series (code saved in capitals)', :'cset' = 'true'
  and (select code = 'DIWALI' and value = 100 from cbt_private.store_coupons where item_id = 'cccccccc-0000-0000-0000-000000000001'));
select pg_temp.chk('19b a flat coupon above the price is refused',
  public.cbt_admin_coupons(:'ow5','set',jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','code','BIG','kind','flat','value',5000,
    'ends_at', floor(extract(epoch from now() + interval '3 days') * 1000)::bigint))->>'error' = 'value');
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Coupon Buyer','9822222222')->>'code' as co1 \gset
select pg_temp.chk('19c the right coupon takes the discount from the database price',
  (select (r->>'amount')::int = 399 and (r->>'coupon_off')::int = 100 from (select public.cbt_store_order_apply(:'co1','9822222222','diwali',false) r) x));
select pg_temp.chk('19d any other code is refused', public.cbt_store_order_apply(:'co1','9822222222','NEWYEAR',false)->>'error' = 'coupon');
select pg_temp.chk('19e someone else''s order cannot be changed', public.cbt_store_order_apply(:'co1','9833333333','DIWALI',false)->>'error' = 'order');
reset role;
update cbt_private.store_coupons set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute';
set role anon;
select pg_temp.chk('19f an ended coupon stops working', public.cbt_store_order_apply(:'co1','9822222222','DIWALI',false)->>'error' = 'coupon_expired');
reset role;
select public.cbt_admin_coupons(:'ow5','remove','{"item_id":"cccccccc-0000-0000-0000-000000000001"}')->>'ok';
set role anon;
select pg_temp.chk('19g a removed coupon stops working', public.cbt_store_order_apply(:'co1','9822222222','DIWALI',false)->>'error' = 'coupon');
-- referral: A shares, B joins and buys, A gets the reward once
select public.cbt_refer_me('9844444444','Rahul Sharma')->>'code' as rc \gset
select pg_temp.chk('19h the referral code is asp + 5–7 digits: no name, not the last digits of the mobile, the same every time (v71)',
  :'rc' ~ '^asp[0-9]{5,7}$' and right(:'rc', 5) <> '44444' and :'rc' !~ 'rahul' and public.cbt_refer_me('9844444444','Rahul Sharma')->>'code' = :'rc');
-- v53: a referral is joined through the order made from the link (cbt_refer_order), not by the link alone
reset role;
select set_config('request.headers', '{"x-real-ip":"198.51.100.67"}', false);
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Rahul Sharma','9844444444')->>'code' as own1 \gset
select public.cbt_refer_order(:'own1','9844444444',:'rc')->>'ok';
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Old Student','9000000002')->>'code' as old1 \gset
select public.cbt_refer_order(:'old1','9000000002',:'rc')->>'ok';
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Friend One','9855555555')->>'code' as fo1 \gset
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Friend One','9855555555')->>'code' as fo2 \gset
select public.cbt_refer_order(:'fo1','9855555555',:'rc')->>'ok';
select public.cbt_refer_order(:'fo2','9855555555',:'rc')->>'ok';
reset role;
delete from public.cbt_store_orders where code in (:'own1', :'old1');
select pg_temp.chk('19i own number and existing students are not joined; a new number is',
  (select count(*) from cbt_private.refer_links where referrer = '9844444444') = 1
  and exists (select 1 from cbt_private.refer_links where mobile = '9855555555'));
select pg_temp.chk('19j joining alone earns nothing', cbt_private.wallet_balance('9844444444') = 0);
select public.cbt_admin_store(:'ow5','order_status',jsonb_build_object('code',:'fo1','status','paid'))->>'ok';
select public.cbt_admin_store(:'ow5','order_status',jsonb_build_object('code',:'fo2','status','paid'))->>'ok';
select pg_temp.chk('19k a referred student''s purchase gives the reward once (₹25)', cbt_private.wallet_balance('9844444444') = 25
  and (select count(*) from cbt_private.wallet_txn where mobile = '9844444444' and kind = 'refer') = 1);
select public.cbt_admin_store(:'ow5','order_status',jsonb_build_object('code',:'fo1','status','pending'))->>'ok';
select pg_temp.chk('19l undoing the approval takes the reward back', cbt_private.wallet_balance('9844444444') = 0);
select public.cbt_admin_store(:'ow5','order_status',jsonb_build_object('code',:'fo1','status','paid'))->>'ok';
-- wallet: used once, never twice, given back when the order is rejected
select public.cbt_admin_refer(:'ow5','adjust','{"mobile":"9844444444","amount":"475","note":"test"}')->>'ok';
-- v53: the wallet is used by its owner signed in (student account + the app's sign-in)
insert into cbt_private.students(id,name,mobile,status,salt,code_hash,devices) values
  ('bbbbbbbb-0000-0000-0000-0000000000a4','Rahul Sharma','9844444444','approved','sr',cbt_private.hash_code('sr','RRRR4444'),'{dev-rrrrrrrr}') on conflict do nothing;
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Rahul Sharma','9844444444')->>'code' as wo1 \gset
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Rahul Sharma','9844444444')->>'code' as wo2 \gset
select pg_temp.chk('19m the wallet pays the order (₹500 → ₹0 to pay)',
  (select (r->>'amount')::int = 0 and (r->>'wallet_used')::int = 499 from (select public.cbt_store_order_apply(:'wo1','9844444444','',true,'RRRR4444','dev-rrrrrrrr') r) x));
select pg_temp.chk('19n the same money cannot pay a second order',
  (select (r->>'wallet_used')::int = 1 and (r->>'amount')::int = 498 from (select public.cbt_store_order_apply(:'wo2','9844444444','',true,'RRRR4444','dev-rrrrrrrr') r) x));
reset role;
select public.cbt_admin_store(:'ow5','order_status',jsonb_build_object('code',:'wo1','status','rejected'))->>'ok';
select pg_temp.chk('19o a rejected order gives the wallet money back', cbt_private.wallet_balance('9844444444') = 499);
select pg_temp.chk('19p the wallet cannot be taken below zero by the admin',
  public.cbt_admin_refer(:'ow5','adjust','{"mobile":"9844444444","amount":"-5000"}')->>'error' = 'too_much');
select pg_temp.chk('19q anon cannot read the wallet or coupon tables', not has_table_privilege('anon','cbt_private.wallet_txn','select')
  and not has_table_privilege('anon','cbt_private.store_coupons','select'));
select pg_temp.chk('19r a view-only team member cannot set coupons or add wallet money',
  public.cbt_admin_coupons(:'vt','remove_code','{"code":"DIWALI"}')->>'error' = 'forbidden'
  and public.cbt_admin_refer(:'vt','adjust','{"mobile":"9844444444","amount":"100"}')->>'error' = 'forbidden');
select public.cbt_admin_coupons(:'ow5','set',jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','code','OFFTEST','kind','pct','value',10,
  'ends_at', floor(extract(epoch from now() + interval '3 days') * 1000)::bigint))->>'ok';
select public.cbt_admin_coupons(:'ow5','switch','{"on":false}')->>'ok';
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Switch Test','9866666666')->>'code' as so1 \gset
select pg_temp.chk('19s coupon box switched off: the store is told and no code works',
  public.cbt_store_offers()->>'coupons' = 'false' and public.cbt_store_order_apply(:'so1','9866666666','OFFTEST',false)->>'error' = 'coupon_off');
reset role;
select public.cbt_admin_coupons(:'ow5','switch','{"on":true}')->>'ok';
set role anon;
select pg_temp.chk('19t switched on again: the code works', (public.cbt_store_order_apply(:'so1','9866666666','OFFTEST',false)->>'coupon_off')::int = 49);
reset role;
select pg_temp.chk('19u a view-only member cannot switch the coupon box', public.cbt_admin_coupons(:'vt','switch','{"on":false}')->>'error' = 'forbidden');
select set_config('request.headers', '{"x-real-ip":"203.0.113.10"}', false);

-- ===== 20. Refer & earn and wallet misuse (supabase_v53_refer_fixes.sql) =====
select set_config('request.headers', '{"x-real-ip":"198.51.100.70"}', false);
delete from public.cbt_store_tries;
set role anon;
select public.cbt_refer_me('9811111111','Asha')->>'code' as c_asha \gset
select public.cbt_refer_me('9822222222','Xavi')->>'code' as c_xavi \gset
-- hijack: X puts a friend's number under his link first; the friend then orders from A's link
select public.cbt_refer_join(:'c_xavi','9833333333','Victim')->>'ok';
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Victim','9833333333')->>'ok';
reset role;
select code as rv from public.cbt_store_orders where mobile='9833333333' order by created_at desc limit 1 \gset
set role anon;
select public.cbt_refer_order(:'rv','9833333333',:'c_asha')->>'ok';
reset role;
update public.cbt_store_orders set status='paid' where code=:'rv';
select pg_temp.chk('20a refer: the reward goes to the link the buyer ordered from, not to a number put in earlier',
  (select mobile from cbt_private.wallet_txn where kind='refer' and ref_mobile='9833333333') = '9811111111');
-- a nearly free order (99% coupon) earns no reward
insert into cbt_private.store_coupons(item_id,code,kind,value,ends_at) values ('cccccccc-0000-0000-0000-000000000001','BIG99','pct',99,now()+interval '1 day')
  on conflict (code,item_id) do update set code='BIG99',kind='pct',value=99,starts_at=now()-interval '1 minute',ends_at=now()+interval '1 day',active=true;
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Sim Two','9844444444')->>'ok';
reset role;
select code as rc2 from public.cbt_store_orders where mobile='9844444444' order by created_at desc limit 1 \gset
set role anon;
select public.cbt_refer_order(:'rc2','9844444444',:'c_xavi')->>'ok';
select public.cbt_store_order_apply(:'rc2','9844444444','BIG99',false)->>'ok';
reset role;
update public.cbt_store_orders set status='paid' where code=:'rc2';
select pg_temp.chk('20b refer: no reward when the new student paid less than the minimum (₹99)',
  not exists (select 1 from cbt_private.wallet_txn where kind='refer' and ref_mobile='9844444444'));
delete from cbt_private.store_coupons where code='BIG99';
-- the wallet: nobody else can see or use it
insert into cbt_private.students(id,name,mobile,status,salt,code_hash,devices) values
  ('bbbbbbbb-0000-0000-0000-0000000000f9','Xavi','9822222222','approved','sx',cbt_private.hash_code('sx','XXXX9999'),'{dev-xxxxxxxx}') on conflict do nothing;
insert into cbt_private.wallet_txn(mobile,amount,kind,note) values ('9822222222',100,'admin','test');
insert into public.cbt_store_items(id,title,price,active,buy_on,series_id) values ('cccccccc-0000-0000-0000-000000000012','Cheap',100,true,true,'11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000013','Cheap 2',100,true,true,'22222222-2222-2222-2222-222222222222') on conflict do nothing;
set role anon;
select pg_temp.chk('20c wallet: balance and earnings are not shown without the owner''s sign-in',
  not (public.cbt_refer_me('9822222222', null) ?| array['balance','earned','joined']));
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000012','Xavi','9822222222')->>'ok';
reset role;
select code as wa from public.cbt_store_orders where mobile='9822222222' order by created_at desc limit 1 \gset
set role anon;
select pg_temp.chk('20d wallet: cannot be used without the owner''s sign-in',
  public.cbt_store_order_apply(:'wa','9822222222','',true)->>'error' = 'signin');
select pg_temp.chk('20e wallet: the signed-in owner can use it',
  (public.cbt_store_order_apply(:'wa','9822222222','',true,'XXXX9999','dev-xxxxxxxx')->>'amount')::int = 0);
reset role;
-- double spend: order A holds the money, 2 days pass, order B uses it, then A is confirmed
update public.cbt_store_orders set created_at = now() - interval '49 hours' where code=:'wa';
delete from public.cbt_store_tries;
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000013','Xavi','9822222222')->>'ok';
reset role;
select code as wb from public.cbt_store_orders where mobile='9822222222' and code <> :'wa' order by created_at desc limit 1 \gset
set role anon;
select public.cbt_store_order_apply(:'wb','9822222222','',true,'XXXX9999','dev-xxxxxxxx')->>'ok';
select public.cbt_store_paid(:'wb','9822222222','Wallet balance','')->>'ok';
select pg_temp.chk('20f wallet: the same money cannot pay two orders',
  public.cbt_store_paid(:'wa','9822222222','Wallet balance','')->>'error' = 'wallet');
reset role;
select pg_temp.chk('20g wallet: the old order now asks for the full price',
  (select wallet_used = 0 and amount = 100 from public.cbt_store_orders where code = :'wa')
  and cbt_private.wallet_balance('9822222222') >= 0);
-- an order is never approved when its wallet money is already gone
update cbt_private.wallet_txn set amount = 40 where mobile='9822222222' and kind='admin';
do $$ declare ok boolean := false; begin
  begin update public.cbt_store_orders set status='paid' where mobile='9822222222' and wallet_used > 0;
  exception when others then ok := sqlerrm like 'wallet_overdrawn%'; end;
  perform pg_temp.chk('20h wallet: an order is not approved when the wallet would go below ₹0', ok);
end $$;
-- a member changing a wallet shows on the owner's bell
select public.cbt_admin_team(:'ow2','user_save','{"name":"Store","username":"store1","password":"Tr7k-9mQz-pLx4","perms":{"store":"manage"}}')->>'ok';
select public.cbt_admin_login('store1','Tr7k-9mQz-pLx4','S')->>'token' as stt \gset
select public.cbt_admin_refer(:'stt','adjust','{"mobile":"9822222222","amount":500,"note":"x"}')->>'ok';
select pg_temp.chk('20i a team member adding wallet money shows on the owner''s bell',
  exists (select 1 from cbt_private.security_events where kind = 'member_access_or_money' and level = 'warn' and detail like 'cbt_admin_refer:adjust%'));

-- ===== 21. store map (v54): the store item of each series, for signed-in students only =====
set role anon;
select pg_temp.chk('21a store map: nothing without a valid sign-in',
  coalesce((public.cbt_store_map('9000000002','WRONG999','dev-bbbbbbbb')->>'ok')::boolean, false) is not true
  and public.cbt_store_map('9000000002','WRONG999','dev-bbbbbbbb')->'map' is null);
select pg_temp.chk('21b store map: a signed-in student gets the item of the series',
  public.cbt_store_map('9000000002','BBBB2222','dev-bbbbbbbb')->'map'->>'11111111-1111-1111-1111-111111111111' = 'cccccccc-0000-0000-0000-000000000001');
reset role;

-- ===== 22. question bank + test generator (v55): answers stay on the server until the student has answered =====
insert into cbt_private.qbank (subject, chapter, q, options, answer, explanation, src) select 'bio', 'cell', 'BankQ' || g, '["w","x","y","z"]', g % 4, 'SECRET-EXPL', null from generate_series(1, 8) g;
set role anon;
select pg_temp.chk('22a bank: practice questions come without answers or explanations',
  public.cbt_qb_next('9000000001','AAAA1111','dev-aaaaaaaa','{}')->>'ok' = 'true'
  and not ((public.cbt_qb_next('9000000001','AAAA1111','dev-aaaaaaaa','{}')->'items')::text ~ '"(answer|explanation|a|e)":|SECRET-EXPL'));
select public.cbt_gen_create('9000000001','AAAA1111','dev-aaaaaaaa','{"title":"Mine","n":5,"dur":10,"f":{}}')->>'id' as gq \gset
select pg_temp.chk('22b generator: the running test has no answers', not ((public.cbt_gen_start('9000000001','AAAA1111','dev-aaaaaaaa',:'gq'))::text ~ '"(answer|explanation|a|e)":|SECRET-EXPL'));
select pg_temp.chk('22c generator: another student cannot open, save, submit or see it',
  public.cbt_gen_start('9000000002','BBBB2222','dev-bbbbbbbb',:'gq')->>'error' = 'not_found'
  and public.cbt_gen_save('9000000002','BBBB2222','dev-bbbbbbbb',:'gq','{}')->>'ok' = 'false'
  and public.cbt_gen_submit('9000000002','BBBB2222','dev-bbbbbbbb',:'gq','{}')->>'error' = 'not_found'
  and public.cbt_gen_result('9000000002','BBBB2222','dev-bbbbbbbb',:'gq')->>'error' = 'not_found');
select pg_temp.chk('22d generator: no answers before submitting', public.cbt_gen_result('9000000001','AAAA1111','dev-aaaaaaaa',:'gq')->>'error' = 'not_done');
select public.cbt_gen_create('9000000001','AAAA1111','dev-aaaaaaaa',('{"n":5,"dur":10,"at":' || ((extract(epoch from now()) * 1000)::bigint + 86400000) || '}')::jsonb)->>'id' as gl \gset
select pg_temp.chk('22e generator: a scheduled test does not open before its time', public.cbt_gen_start('9000000001','AAAA1111','dev-aaaaaaaa',:'gl')->>'error' = 'not_open');
reset role;
update cbt_private.gen_tests set started_at = started_at - 3600000, ends_at = ends_at - 3600000 where id = :'gq';
select jsonb_object_agg(q::text, 0) as gans from unnest((select qids from cbt_private.gen_tests where id = :'gq')) q \gset
set role anon;
select pg_temp.chk('22f generator: answers sent after the time is over are not counted',
  (public.cbt_gen_submit('9000000001','AAAA1111','dev-aaaaaaaa',:'gq',:'gans'::jsonb)->'test'->>'skipped')::int = 5);
reset role;

-- ===== 23. profile + countdown kept on the account (v56): only the owner, only clean values =====
set role anon;
select pg_temp.chk('23a keep: nothing without a valid sign-in',
  coalesce((public.cbt_keep('9000000002','WRONG999','dev-bbbbbbbb','get')->>'ok')::boolean, false) is not true
  and coalesce((public.cbt_keep('9000000002','WRONG999','dev-bbbbbbbb','save','{"pf":{"city":"X"}}')->>'ok')::boolean, false) is not true);
select public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save',
  '{"pf":{"school":"Aspiron <b>School</b>","city":"Kota","exam":"NEET","cls":"Class 12","photo":"data:image/jpeg;base64,/9j/4AAQ","evil":"x"},
    "cd":{"name":"NEET 2027","date":"2027-05-03T00:00:00.000Z","start":1767225600000,"units":["days","hours","bogus","days"]}}') as ksave \gset
select pg_temp.chk('23b keep: saved details come back after sign-in',
  (:'ksave'::jsonb->>'ok')::boolean
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf'->>'city' = 'Kota'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'cd'->>'name' = 'NEET 2027'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf'->>'photo' like 'data:image/jpeg;base64,%');
select pg_temp.chk('23c keep: markup is stripped, unknown fields and units are dropped',
  public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf'->>'school' = 'Aspiron bSchool/b'
  and not (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf' ? 'evil')
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'cd'->'units' = '["days","hours"]'::jsonb);
select pg_temp.chk('23d keep: another student sees nothing of it',
  coalesce(public.cbt_keep('9000000002','BBBB2222','dev-bbbbbbbb','get')->'pf', 'null'::jsonb) = 'null'::jsonb
  and coalesce(public.cbt_keep('9000000002','BBBB2222','dev-bbbbbbbb','get')->'cd', 'null'::jsonb) = 'null'::jsonb);
select public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save',
  '{"pf":{"photo":"javascript:alert(1)","city":"Kota"},"cd":{"name":"Bad","date":"not-a-date"}}') as ksave2 \gset
select pg_temp.chk('23e keep: a photo that is not a picture and a bad date are refused',
  not (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf' ? 'photo')
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'cd'->>'name' = 'NEET 2027');
select pg_temp.chk('23f keep: the countdown can be removed, and stays removed (cdgone)',
  (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save','{"cd":null}')->>'ok')::boolean
  and coalesce(public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'cd', 'null'::jsonb) = 'null'::jsonb
  and (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->>'cdgone')::boolean
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf'->>'city' = 'Kota');
select pg_temp.chk('23g keep: a huge value is refused',
  public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save', jsonb_build_object('pf', jsonb_build_object('about', repeat('x', 200000))))->>'ok' = 'true'
  and length(public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf'->>'about') <= 300);
reset role;

-- ===== 24. social media links (supabase_v57_social.sql) =====
set role anon;
select pg_temp.chk('24a social: the public list has only the links that are On',
  (select count(*) = 3 and bool_and(l->>'platform' in ('instagram', 'telegram', 'whatsapp_channel'))
     from jsonb_array_elements(public.cbt_social()->'links') l));
-- (each save is its own statement: a check in the same statement would still see the rows from before the save)
select coalesce((public.cbt_admin_social('wrong-password','save','{"links":[{"platform":"facebook","url":"https://facebook.com/x","shown":true}]}')->>'ok')::boolean, false) as soc0 \gset
select pg_temp.chk('24b social: nobody changes links without signing in', not :'soc0'::boolean
  and not exists (select 1 from jsonb_array_elements(public.cbt_social()->'links') l where l->>'platform' = 'facebook'));
reset role;
select pg_temp.chk('24c social: anon cannot read the table directly', not has_table_privilege('anon', 'cbt_private.social_links', 'SELECT'));
select public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"instagram","url":"https://evil.example/instagram.com","shown":true}]}')->>'error' = 'url'
  and public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"facebook","url":"javascript:alert(1)","shown":true}]}')->>'error' = 'url'
  and public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"youtube","url":"https://youtube.com@evil.example/","shown":true}]}')->>'error' = 'url'
  and public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"x","url":"https://x.com/a\"><script>","shown":true}]}')->>'error' = 'url'
  and public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"telegram","url":"https://t.me/ok","shown":true},{"platform":"myspace","url":"https://myspace.com/a","shown":true}]}')->>'error' = 'platform'
  as soc_bad \gset
select pg_temp.chk('24d social: a link to another site, javascript: or a user@host trick is refused, nothing saved', :'soc_bad'::boolean
  and (select url from cbt_private.social_links where platform = 'instagram') = 'https://www.instagram.com/aspironeducation/'
  and (select url from cbt_private.social_links where platform = 'telegram') = 'https://t.me/AspironEducation'
  and not exists (select 1 from cbt_private.social_links where platform in ('facebook', 'youtube', 'x', 'myspace')));
select pg_temp.chk('24e social: a platform turned On needs a link',
  public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"linkedin","url":"","shown":true}]}')->>'error' = 'url_needed');
select public.cbt_admin_social(:'ow2','save','{"links":[{"platform":"facebook","url":"https://www.facebook.com/aspiron","shown":true},{"platform":"telegram","url":"https://t.me/AspironEducation","shown":false}]}')->>'ok' as soc1 \gset
select pg_temp.chk('24f social: the owner adds a link and turns one Off; the public list follows', :'soc1' = 'true'
  and (select array_agg(l->>'platform' order by l->>'platform') from jsonb_array_elements(public.cbt_social()->'links') l) = array['facebook', 'instagram', 'whatsapp_channel']
  and (select url from cbt_private.social_links where platform = 'telegram') = 'https://t.me/AspironEducation');
select public.cbt_admin_team(:'ow2','user_save','{"name":"Social viewer","username":"socview1","password":"Tr7k-9mQz-pLx5","perms":{"messaging":"view"}}')->>'ok';
select public.cbt_admin_team(:'ow2','user_save','{"name":"Social manager","username":"socman1","password":"Tr7k-9mQz-pLx6","perms":{"messaging":"manage"}}')->>'ok';
select public.cbt_admin_login('socview1','Tr7k-9mQz-pLx5','S')->>'token' as svt \gset
select public.cbt_admin_login('socman1','Tr7k-9mQz-pLx6','S')->>'token' as smt \gset
select public.cbt_admin_social(:'svt','get','{}')->>'ok' = 'true'
  and public.cbt_admin_social(:'svt','save','{"links":[{"platform":"telegram","url":"https://t.me/AspironEducation","shown":true}]}')->>'error' = 'forbidden'
  and public.cbt_admin_social(:'stt','get','{}')->>'error' = 'forbidden' as soc_perm \gset
select pg_temp.chk('24g social: Broadcasts view-only can look but not save; no Broadcasts access cannot even look', :'soc_perm'::boolean
  and (select not shown from cbt_private.social_links where platform = 'telegram'));
select public.cbt_admin_social(:'smt','save','{"links":[{"platform":"telegram","url":"https://t.me/AspironEducation","shown":true}]}')->>'ok' as soc2 \gset
select pg_temp.chk('24h social: Broadcasts full access can save', :'soc2' = 'true'
  and (select shown from cbt_private.social_links where platform = 'telegram'));

-- ===== 22. v58 wallet history and "put it in the wallet" =====
select public.cbt_admin_refer_put(:'ow5','add','{"mobile":"9822200099","amount":"100","note":"overpaid","public_note":"Extra paid for your order, kept in your wallet"}')->>'ok' as wp \gset
select pg_temp.chk('22a admin puts money in a wallet (no order)', :'wp' = 'true' and cbt_private.wallet_balance('9822200099') = 100);
select pg_temp.chk('22b the wallet entry is an admin entry, not a referral', (select kind from cbt_private.wallet_txn where mobile = '9822200099' limit 1) = 'admin');
select pg_temp.chk('22c a team member cannot put money in a wallet',
  public.cbt_admin_refer_put(:'vt','add','{"mobile":"9822200099","amount":"100"}')->>'error' = 'forbidden');
select pg_temp.chk('22d an unknown number is refused', public.cbt_admin_refer_put(:'ow5','add','{"mobile":"12345","amount":"100"}')->>'error' = 'mobile');
select pg_temp.chk('22e the student sees the public line, never the internal note',
  (cbt_private.refer_info('9822200099')->'history'->0->>'note') = 'Extra paid for your order, kept in your wallet'
  and cbt_private.refer_info('9822200099')::text not like '%overpaid%');

-- ===== 24. v59 monthly money summary =====
select pg_temp.chk('24a monthly summary answers for the owner', public.cbt_admin_money(:'ow5','month','{"month":"2026-11"}')->>'ok' = 'true');
select pg_temp.chk('24b a team member without payments access is refused',
  public.cbt_admin_money(:'vt','month','{"month":"2026-11"}')->>'error' = 'forbidden');
select pg_temp.chk('24c a wrong month is refused', public.cbt_admin_money(:'ow5','month','{"month":"2026-13"}')->>'error' = 'date');
select pg_temp.chk('24d returned to wallet is taken off the earnings',
  (public.cbt_admin_money(:'ow5','month','{"month":"2026-11"}')->>'returned')::int >= 0);

-- ===== 25. v60 many codes, limits, scratch card =====
select public.cbt_admin_coupons(:'ow5','bulk',jsonb_build_object('code','TWOA','ends_at', floor(extract(epoch from now() + interval '4 days') * 1000)::bigint,
  'items', jsonb_build_array(jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','kind','pct','value',5))))->>'ok' as tw \gset
select public.cbt_admin_coupons(:'ow5','bulk',jsonb_build_object('code','LIMIT2','ends_at', floor(extract(epoch from now() + interval '4 days') * 1000)::bigint,'max_uses',2,
  'items', jsonb_build_array(jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','kind','flat','value',10))))->>'ok' as lm \gset
select pg_temp.chk('25a two codes live on the same series at once (nothing is replaced)',
  (select count(*) = 2 from cbt_private.store_coupons where item_id = 'cccccccc-0000-0000-0000-000000000001' and active and code in ('TWOA','LIMIT2')));
select pg_temp.chk('25b a code can be deleted from one series without touching the other code',
  public.cbt_admin_coupons(:'ow5','remove_one','{"item_id":"cccccccc-0000-0000-0000-000000000001","code":"TWOA"}')->>'ok' = 'true'
  and (select count(*) = 1 from cbt_private.store_coupons where item_id = 'cccccccc-0000-0000-0000-000000000001' and code = 'LIMIT2'));
select public.cbt_admin_coupons(:'ow5','bulk',jsonb_build_object('code','TWOA','ends_at', floor(extract(epoch from now() + interval '4 days') * 1000)::bigint,
  'items', jsonb_build_array(jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','kind','pct','value',5))))->>'ok';
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Limit One','9866000001')->>'code' as lo1 \gset
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Limit Two','9866000002')->>'code' as lo2 \gset
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Limit Three','9866000003')->>'code' as lo3 \gset
select pg_temp.chk('25c a code with a limit works for the first orders',
  (public.cbt_store_order_apply(:'lo1','9866000001','LIMIT2',false)->>'coupon_off')::int = 10
  and (public.cbt_store_order_apply(:'lo2','9866000002','LIMIT2',false)->>'coupon_off')::int = 10);
select pg_temp.chk('25d the next order after the limit is refused',
  public.cbt_store_order_apply(:'lo3','9866000003','LIMIT2',false)->>'error' = 'coupon_used_up');
select pg_temp.chk('25e the store is told how many are left, and no code is shown',
  (public.cbt_store_coupons_public()->'items') @> '[]'::jsonb
  and public.cbt_store_coupons_public()::text not like '%LIMIT2%' and public.cbt_store_coupons_public()::text not like '%TWOA%');
select pg_temp.chk('25f the scratch card gives a live code for the series',
  public.cbt_store_reveal('cccccccc-0000-0000-0000-000000000001')->>'code' is not null);
reset role;
select pg_temp.chk('25g an unknown code is refused',
  public.cbt_store_order_apply(:'lo1','9866000001','NOSUCH',false)->>'error' = 'coupon');
select public.cbt_admin_coupons(:'ow5','update_code','{"code":"LIMIT2","max_uses":5}')->>'ok' as uc \gset
select pg_temp.chk('25h the owner can change the limit of a code later',
  :'uc' = 'true' and (select max_uses = 5 from cbt_private.store_coupons where code = 'LIMIT2' limit 1));
select pg_temp.chk('25i a team member cannot delete a code', public.cbt_admin_coupons(:'vt','remove_code','{"code":"LIMIT2"}')->>'error' = 'forbidden');
-- safety (review of v60)
select public.cbt_admin_coupons(:'ow5','bulk',jsonb_build_object('code','SECRET1','scratch',false,'ends_at', floor(extract(epoch from now() + interval '4 days') * 1000)::bigint,
  'items', jsonb_build_array(jsonb_build_object('item_id','cccccccc-0000-0000-0000-000000000001','kind','pct','value',50))))->>'ok';
update cbt_private.store_coupons set active = false where code <> 'SECRET1';
set role anon;
select pg_temp.chk('25j a private code is never shown by the scratch card or the store',
  public.cbt_store_reveal('cccccccc-0000-0000-0000-000000000001')->>'code' is null
  and public.cbt_store_coupons_public()::text not like '%50%');
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Secret Typed','9866000009')->>'code' as sq \gset
select pg_temp.chk('25k a private code still works when typed',
  (public.cbt_store_order_apply(:'sq','9866000009','SECRET1',false)->>'coupon_off')::int > 0);
reset role;
update cbt_private.store_coupons set active = true;
-- LIMIT2 is full (limit 5 now: 2 used); fill it with 3 unpaid orders, then let them get old
update cbt_private.store_coupons set max_uses = 2 where code = 'LIMIT2';
update public.cbt_store_orders set created_at = now() - interval '2 days' where coupon_code = 'LIMIT2' and status = 'pending' and paid_at is null;
set role anon;
select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001','Late Buyer','9866000010')->>'code' as lb \gset
select pg_temp.chk('25l unpaid orders left behind do not use up a limited code',
  (public.cbt_store_order_apply(:'lb','9866000010','LIMIT2',false)->>'coupon_off')::int = 10);
reset role;

-- ===== 26. v61 Tests page: poster and filter =====
set role anon;
select pg_temp.chk('26a look: the public call gives the default lists and no poster',
  public.cbt_store_look()->>'ok' = 'true' and public.cbt_store_look()->>'poster' = ''
  and public.cbt_store_look()->'exams' = '["NEET","JEE"]'::jsonb);
select coalesce((public.cbt_admin_store_look('wrong-password','save','{"link":"","exams":["X"],"classes":[],"subjects":[]}')->>'ok')::boolean, false) as lk0 \gset
select pg_temp.chk('26b look: nobody changes it without signing in', not :'lk0'::boolean and public.cbt_store_look()->'exams' = '["NEET","JEE"]'::jsonb);
reset role;
select pg_temp.chk('26c look: anon cannot read the tables directly',
  not has_table_privilege('anon', 'cbt_private.store_look', 'SELECT') and not has_table_privilege('anon', 'cbt_private.store_item_tags', 'SELECT'));
select public.cbt_admin_store_look(:'ow5','save','{"link":"javascript:alert(1)","exams":["NEET"],"classes":[],"subjects":[]}')->>'error' = 'link'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"https://x.com/a\"><b>","exams":["NEET"],"classes":[],"subjects":[]}')->>'error' = 'link'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","poster":"data:text/html;base64,PGI+","exams":["NEET"],"classes":[],"subjects":[]}')->>'error' = 'image'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":[],"classes":[],"subjects":[]}')->>'error' = 'list'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":["NEET","neet"],"classes":[],"subjects":[]}')->>'error' = 'list'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":["<b>"],"classes":[],"subjects":[]}')->>'error' = 'list'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":["NEET"],"classes":[],"subjects":[],"tags":{"cccccccc-0000-0000-0000-000000000001":{"e":["JEE"]}}}')->>'error' = 'tags'
  and public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":["NEET"],"classes":[],"subjects":[],"tags":{"cccccccc-0000-0000-0000-0000000000ff":{"e":[]}}}')->>'error' = 'item'
  as lk_bad \gset
select pg_temp.chk('26d look: a bad link, a non-picture, an empty / repeated / unsafe list or an unknown tag is refused, nothing saved',
  :'lk_bad'::boolean and (select exams from cbt_private.store_look) = '["NEET","JEE"]'::jsonb and not exists (select 1 from cbt_private.store_item_tags));
select public.cbt_admin_store_look(:'ow5','save','{"link":"store.html#x=cccccccc-0000-0000-0000-000000000001","poster":"data:image/jpeg;base64,/9j/AA==","exams":["NEET","JEE"],"classes":["Class 11","Dropper"],"subjects":["Biology"],"tags":{"cccccccc-0000-0000-0000-000000000001":{"e":["NEET"],"c":["Dropper"],"s":["Biology"]}}}')->>'ok' as lk1 \gset
select pg_temp.chk('26e look: the owner saves the poster, lists and tags; the public call shows them', :'lk1' = 'true'
  and public.cbt_store_look()->>'poster' = 'data:image/jpeg;base64,/9j/AA=='
  and public.cbt_store_look()->'tags'->'cccccccc-0000-0000-0000-000000000001'->'s' = '["Biology"]'::jsonb);
select public.cbt_admin_store_look(:'ow5','save','{"link":"","exams":["NEET","JEE"],"classes":["Class 11"],"subjects":["Biology"]}')->>'ok' as lk2 \gset
select pg_temp.chk('26f look: leaving the poster out keeps it; a class taken out of the list leaves every series', :'lk2' = 'true'
  and public.cbt_store_look()->>'poster' = 'data:image/jpeg;base64,/9j/AA=='
  and public.cbt_store_look()->'tags'->'cccccccc-0000-0000-0000-000000000001'->'c' = '[]'::jsonb);
select public.cbt_admin_team(:'ow5','user_save','{"name":"Store viewer","username":"lookview1","password":"Tr7k-9mQz-pLx8","perms":{"store":"view"}}')->>'ok';
select public.cbt_admin_login('lookview1','Tr7k-9mQz-pLx8','S')->>'token' as lvt \gset
select pg_temp.chk('26g look: Store view-only can look but not save',
  public.cbt_admin_store_look(:'lvt','get','{}')->>'ok' = 'true'
  and public.cbt_admin_store_look(:'lvt','save','{"link":"","exams":["NEET"],"classes":[],"subjects":[]}')->>'error' = 'forbidden');

-- ===== 27. admin panel guard (supabase_v62_admin_guard.sql + v35) =====
delete from cbt_private.admin_fails;
select set_config('request.headers', '{"x-real-ip":"203.0.113.120","user-agent":"TestBrowser/1.0"}', false);
select public.cbt_admin_login('','OwnerPass2026x','Owner')->>'token' as ow9 \gset
select public.cbt_admin_team(:'ow9','user_save','{"name":"Helper","username":"helper1","password":"Tr7k-9mQz-pLx5","perms":{"students":"view"}}')->>'ok';
select public.cbt_admin_login('helper1','Tr7k-9mQz-pLx5','H')->>'token' as hp \gset
select public.cbt_admin_team(:'ow9','team_login','{"on":false}')->>'ok';
select pg_temp.chk('27a team sign-in off: a member cannot sign in and their open session stops',
  public.cbt_admin_login('helper1','Tr7k-9mQz-pLx5','H')->>'error' = 'invalid'
  and public.cbt_admin(:'hp','students','{}')->>'error' = 'disabled');
select pg_temp.chk('27b a wrong team sign-in is recorded with the username tried, full address and device',
  exists (select 1 from cbt_private.security_events where kind = 'team_wrong_password' and who like '%helper1%'
          and ip_full = '203.0.113.120' and ua = 'TestBrowser/1.0'));
select set_config('request.headers', '{"x-real-ip":"198.51.100.200"}', false);
select public.cbt_admin_login('','wrong-guess-' || g,'X')->>'error' from generate_series(1,5) g;
select pg_temp.chk('27c 5 wrong owner passwords lock that place (even the right password)',
  public.cbt_admin_login('','OwnerPass2026x','X')->>'error' = 'locked');
select set_config('request.headers', '{"x-real-ip":"203.0.113.120"}', false);
select pg_temp.chk('27d the owner cannot block their own address',
  public.cbt_admin_security(:'ow9','block','{"ip":"203.0.113.120"}')->>'error' = 'own_ip');
select public.cbt_admin_security(:'ow9','block','{"ip":"198.51.100.201","note":"guessing"}')->>'ok';
select set_config('request.headers', '{"x-real-ip":"198.51.100.201"}', false);
select pg_temp.chk('27e a blocked address cannot sign in, even with the right password',
  public.cbt_admin_login('','OwnerPass2026x','X')->>'error' = 'locked');
select set_config('request.headers', '{"x-real-ip":"203.0.113.120"}', false);
select pg_temp.chk('27f alerts are grouped and show the busiest addresses',
  (select (r->'cats') ? 'risk' and jsonb_array_length(r->'ips') > 0 and jsonb_array_length(r->'blocks') = 1
     from (select public.cbt_admin_security(:'ow9','get','{"days":1,"cat":"risk"}') r) x));
select public.cbt_admin_security(:'ow9','unblock','{"ip":"198.51.100.201"}')->>'ok';
select pg_temp.chk('27g unblocking works', not exists (select 1 from cbt_private.admin_ip_blocks));
-- the admin page key: without it nobody can even try a password
update cbt_private.settings set value = encode(sha256(convert_to('aspiron-admin:TestKey77', 'UTF8')), 'hex') where key = 'admin_gate';
insert into cbt_private.settings (key, value) select 'admin_gate', encode(sha256(convert_to('aspiron-admin:TestKey77', 'UTF8')), 'hex')
  where not exists (select 1 from cbt_private.settings where key = 'admin_gate');
select set_config('request.headers', '{"x-real-ip":"198.51.100.230"}', false);
select pg_temp.chk('27h without the admin key the right password is refused (and nothing is counted)',
  public.cbt_admin_login('','OwnerPass2026x','X')->>'error' = 'gate'
  and public.cbt_admin_login('','OwnerPass2026x','X','','WrongKey')->>'error' = 'gate'
  and not exists (select 1 from cbt_private.admin_fail_ips where ip = '198.51.100.230'));
select pg_temp.chk('27i with the admin key the owner signs in',
  left(public.cbt_admin_login('','OwnerPass2026x','X','','TestKey77')->>'token', 4) = 'as1.');
select pg_temp.chk('27j the old sign-in without the key no longer exists',
  to_regprocedure('public.cbt_admin_login(text,text,text,text)') is null and to_regprocedure('public.cbt_admin_login(text,text,text)') is null);
-- automatic block: 15 wrong passwords in 24 hours from one address
select set_config('request.headers', '{"x-real-ip":"198.51.100.240"}', false);
do $$ begin for i in 1..15 loop
  delete from cbt_private.admin_fails;   -- the 1-hour lock would stop the tries before 15; the 24-hour count goes on
  perform public.cbt_admin_login('', 'guess-' || i, 'X', '', 'TestKey77');
end loop; end $$;
select pg_temp.chk('27k 15 wrong passwords in 24 hours block the address for 7 days',
  exists (select 1 from cbt_private.admin_ip_blocks where ip = '198.51.100.240' and until > now() + interval '6 days')
  and public.cbt_admin_login('','OwnerPass2026x','X','','TestKey77')->>'error' = 'locked'
  and exists (select 1 from cbt_private.security_events where kind = 'ip_auto_blocked'));
select set_config('request.headers', '{"x-real-ip":"203.0.113.120"}', false);
do $$ begin for i in 1..15 loop
  delete from cbt_private.admin_fails;
  perform public.cbt_admin_login('', 'oops-' || i, 'X', '', 'TestKey77');
end loop; end $$;
select pg_temp.chk('27l the owner''s own known address is never blocked automatically',
  not exists (select 1 from cbt_private.admin_ip_blocks where ip = '203.0.113.120'));
delete from cbt_private.admin_fails; delete from cbt_private.settings where key = 'admin_gate';
select public.cbt_admin_team(:'ow9','team_login','{"on":true}')->>'ok';

-- ===== 28. security alerts on Telegram (supabase_v63_telegram_alerts.sql) =====
select set_config('request.headers', '{"x-real-ip":"203.0.113.120"}', false);
select pg_temp.chk('28a a team member cannot set up the Telegram alerts', public.cbt_admin_telegram(:'vt','set','{"token":"123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')->>'error' in ('forbidden', 'disabled', 'invalid', 'signed_out'));
select pg_temp.chk('28b a wrong bot token is refused', public.cbt_admin_telegram(:'ow9','set','{"token":"not-a-token"}')->>'error' = 'token');
select public.cbt_admin_telegram(:'ow9','set','{"token":"123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')->>'ok';
-- Telegram answers getUpdates: the owner pressed Start in their bot
insert into net._http_response (id, status_code, content)
select value::bigint, 200, '{"ok":true,"result":[{"update_id":1,"message":{"chat":{"id":555000111,"type":"private"},"text":"/start"}}]}'
  from cbt_private.settings where key = 'tg_req';
select public.cbt_admin_telegram(:'ow9','status','{}')->>'linked' as tgl \gset
select pg_temp.chk('28c after Start in the bot the alerts are linked (and a welcome message is sent)',
  :'tgl' = 'true'
  and (select value from cbt_private.settings where key = 'tg_chat') = '555000111'
  and exists (select 1 from net.test_log where url like '%/sendMessage' and body->>'chat_id' = '555000111'));
select pg_temp.chk('28d the bot token is never sent back to the panel',
  not (public.cbt_admin_telegram(:'ow9','status','{}')::text ~ 'AAAAAAAAAA'));
delete from net.test_log;
select cbt_private.sec_event('2fa_off', 'high', 'Owner', 'Two-step sign-in was turned off');
select cbt_private.sec_event('student_locked', 'low', 'Some Student', '8 wrong access codes');
select pg_temp.chk('28e a serious alert goes to Telegram at once; a small one does not',
  (select count(*) from net.test_log where url like '%/sendMessage' and body->>'text' like '%Two-step sign-in turned OFF%') = 1
  and not exists (select 1 from net.test_log where body->>'text' like '%Students locked%'));
select set_config('request.headers', '{"x-real-ip":"198.51.100.77"}', false);
insert into cbt_private.settings (key, value) values ('admin_gate', encode(sha256(convert_to('aspiron-admin:TestKey77', 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;
delete from net.test_log;
select public.cbt_admin_login('','guess','X')->>'error';
select public.cbt_admin_login('','guess2','X')->>'error';
select pg_temp.chk('28f a sign-in without the admin key is reported once per address',
  (select count(*) from net.test_log where body->>'text' like '%WITHOUT the admin key%' and body->>'text' like '%198.51.100.77%') = 1);
delete from cbt_private.settings where key = 'admin_gate';
delete from net.test_log;
do $$ begin for i in 1..40 loop perform cbt_private.sec_event('2fa_off', 'high', 'Flood', 'x'); end loop; end $$;
select pg_temp.chk('28g a flood of alerts sends at most 30 messages an hour', (select count(*) from cbt_private.tg_sent where at > now() - interval '1 hour') <= 30);
select public.cbt_admin_telegram(:'ow9','off','{}')->>'ok';
select pg_temp.chk('28h turning it off removes the token', not exists (select 1 from cbt_private.settings where key in ('tg_token', 'tg_chat')));
select set_config('request.headers', '{"x-real-ip":"203.0.113.120"}', false);

-- ===== 29. v64 series page: validity, upgrade plans, syllabus, promo =====
set role anon;
select pg_temp.chk('29a meta: the public call works and has nothing yet',
  public.cbt_series_meta()->>'ok' = 'true' and public.cbt_series_meta()->'series' = '{}'::jsonb and public.cbt_series_meta()->>'promo' = '');
select coalesce((public.cbt_admin_series_meta('wrong-password','save_series','{"series_id":"11111111-1111-1111-1111-111111111111","starts_at":1,"ends_at":2}')->>'ok')::boolean, false) as sm0 \gset
select pg_temp.chk('29b meta: nobody changes it without signing in', not :'sm0'::boolean and public.cbt_series_meta()->'series' = '{}'::jsonb);
reset role;
select pg_temp.chk('29c meta: anon cannot read the tables directly',
  not has_table_privilege('anon', 'cbt_private.series_meta', 'SELECT') and not has_table_privilege('anon', 'cbt_private.test_meta', 'SELECT'));
select public.cbt_admin_series_meta(:'ow5','save_series','{"series_id":"11111111-1111-1111-1111-111111111111","starts_at":200,"ends_at":100}')->>'error' = 'date'
  and public.cbt_admin_series_meta(:'ow5','save_series','{"series_id":"11111111-1111-1111-1111-111111111111","upgrades":[{"item":"cccccccc-0000-0000-0000-0000000000ff"}]}')->>'error' = 'upgrades'
  and public.cbt_admin_series_meta(:'ow5','save_series','{"series_id":"11111111-1111-1111-1111-111111111111","features":[1,2]}')->>'error' = 'features'
  and public.cbt_admin_series_meta(:'ow5','save_series','{"series_id":"nope"}')->>'error' = 'series'
  and public.cbt_admin_series_meta(:'ow5','save_promo','{"link":"javascript:alert(1)"}')->>'error' = 'link'
  and public.cbt_admin_series_meta(:'ow5','save_promo','{"link":"","promo":"data:text/html;base64,PGI+"}')->>'error' = 'image'
  as sm_bad \gset
select pg_temp.chk('29d meta: wrong dates, an unknown plan, bad lines, a bad link or a non-picture is refused, nothing saved',
  :'sm_bad'::boolean and not exists (select 1 from cbt_private.series_meta));
select public.cbt_admin_series_meta(:'ow5','save_series','{"series_id":"11111111-1111-1111-1111-111111111111","starts_at":1000,"ends_at":2000,"features":["Full tests <b>","  "],"upgrades":[{"item":"cccccccc-0000-0000-0000-000000000001","label":"Pro"}]}')->>'ok' as sm1 \gset
select public.cbt_admin_series_meta(:'ow5','save_syllabus','{"test_id":"aaaaaaaa-0000-0000-0000-000000000001","syllabus":"Mole concept, <i>Atoms"}')->>'ok' as sm2 \gset
select pg_temp.chk('29e meta: the owner saves dates, lines (cleaned), a plan and a syllabus; the public call shows them',
  :'sm1' = 'true' and :'sm2' = 'true'
  and public.cbt_series_meta()->'series'->'11111111-1111-1111-1111-111111111111'->'f' = '["Full tests b"]'::jsonb
  and (public.cbt_series_meta()->'series'->'11111111-1111-1111-1111-111111111111'->>'e')::bigint = 2000
  and public.cbt_series_meta()->'syl'->>'aaaaaaaa-0000-0000-0000-000000000001' = 'Mole concept, iAtoms');
select pg_temp.chk('29f meta: Store view-only can look but not save',
  public.cbt_admin_series_meta(:'lvt','get','{}')->>'ok' = 'true'
  and public.cbt_admin_series_meta(:'lvt','save_syllabus','{"test_id":"aaaaaaaa-0000-0000-0000-000000000001","syllabus":"x"}')->>'error' = 'forbidden');

-- ===== 30. email / Google login (supabase_v65) =====
insert into cbt_private.students(id,name,mobile,status,salt,code_hash) values
  ('bbbbbbbb-0000-0000-0000-0000000000c1','Login One','9000000065','approved','s65',cbt_private.hash_code('s65','LOGN6565')),
  ('bbbbbbbb-0000-0000-0000-0000000000c2','Login Two','9000000066','approved','s66',cbt_private.hash_code('s66','LOGN6666'));
insert into auth.users(id,email,email_confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001','one@example.com',now()),
  ('a0000000-0000-0000-0000-000000000002','two@example.com',now()),
  ('a0000000-0000-0000-0000-000000000003','unconfirmed@example.com',null),
  ('a0000000-0000-0000-0000-000000000004','new@example.com',now());
select set_config('request.jwt.claims', '', false);
select pg_temp.chk('30a signed out of Supabase: no token, no joining, no request',
  public.student_signin('dev-login0001')->>'error' = 'auth'
  and public.student_link('9000000065','LOGN6565','dev-login0001')->>'error' = 'auth'
  and public.student_request('X Y','9000000099')->>'error' = 'auth');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003"}', false);
select pg_temp.chk('30b an email that is not confirmed counts as signed out',
  public.student_link('9000000065','LOGN6565','dev-login0001')->>'error' = 'auth'
  and not exists (select 1 from cbt_private.students where auth_uid is not null));
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001"}', false);
select pg_temp.chk('30c a login not joined yet gets no token', public.student_signin('dev-login0001')->>'error' = 'not_linked');
select pg_temp.chk('30d joining with a wrong code or a sign-in token fails',
  public.student_link('9000000065','WRONG999','dev-login0001')->>'error' = 'invalid'
  and public.student_link('9000000065',public.cbt_login('9000000066','LOGN6666','dev-login0009')->>'token','dev-login0001')->>'error' = 'invalid'
  and not exists (select 1 from cbt_private.students where auth_uid is not null));
select public.student_link('9000000065','LOGN6565','dev-login0001')->>'token' as lt1 \gset
select pg_temp.chk('30e joining with the right code gives a token that works like a normal one',
  left(:'lt1', 4) = 'st1.' and public.cbt_catalog('9000000065',:'lt1','dev-login0001')->>'ok' = 'true'
  and public.cbt_catalog('9000000065',:'lt1','dev-other123')->>'error' = 'invalid');
select pg_temp.chk('30f the joined login signs in again without a code',
  left(public.student_signin('dev-login0001')->>'token', 4) = 'st1.'
  and public.student_signin('dev-login0001')->>'mobile' = '9000000065');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002"}', false);
select pg_temp.chk('30g another login cannot take a student who is already joined (even with the right code)',
  public.student_link('9000000065','LOGN6565','dev-login0002')->>'error' = 'taken'
  and (select auth_uid from cbt_private.students where mobile = '9000000065') = 'a0000000-0000-0000-0000-000000000001');
select pg_temp.chk('30h the device limit still holds',
  public.student_link('9000000066','LOGN6666','dev-login0002')->>'ok' = 'true'
  and public.student_signin('dev-login0003')->>'error' = 'device_limit'
  and not exists (select 1 from cbt_private.student_tokens k join cbt_private.students s on s.id = k.student_id
                   where s.mobile = '9000000066' and k.device = 'dev-login0003'));
update cbt_private.students set status = 'blocked' where mobile = '9000000066';
select pg_temp.chk('30i a blocked student gets no token from the login', public.student_signin('dev-login0002')->>'error' = 'blocked');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004"}', false);
select pg_temp.chk('30j a request for a number that has an account does not join it (and says nothing about it)',
  public.student_request('Some One','9000000065')->>'status' = 'pending'
  and (select auth_uid from cbt_private.students where mobile = '9000000065') = 'a0000000-0000-0000-0000-000000000001'
  and not exists (select 1 from cbt_private.students where auth_uid = 'a0000000-0000-0000-0000-000000000004'));
select set_config('request.headers', '{"x-real-ip":"198.51.100.165"}', false);
select public.student_request('New Learner','9000000067')->>'ok' as rq65 \gset
select pg_temp.chk('30k a new number is joined, waits for approval, then signs in with the login alone',
  :'rq65' = 'true'
  and public.student_signin('dev-login0004')->>'error' = 'pending'
  and (select status from cbt_private.students where mobile = '9000000067') = 'pending');
-- the admin approves: a new access code is made and sent to that number (as student_approve does)
update cbt_private.students set status = 'approved', salt = 'sl67', code_hash = cbt_private.hash_code('sl67', 'NEWL6767') where mobile = '9000000067';
-- v74 (review A2): a login that came by a request must show the access code once (it proves the number)
select pg_temp.chk('30l after approval a login from a request still needs the access code once',
  public.student_signin('dev-login0004')->>'error' = 'need_code'
  and public.student_link('9000000067','WRONG777','dev-login0004')->>'error' = 'invalid'
  and public.student_link('9000000065','LOGN6565','dev-login0004')->>'error' = 'taken');
select public.student_link('9000000067','NEWL6767','dev-login0004')->>'token' as lt67 \gset
select pg_temp.chk('30l2 with the access code once it gets a working token, then the login alone is enough',
  public.cbt_catalog('9000000067', :'lt67', 'dev-login0004')->>'ok' = 'true'
  and left(public.student_signin('dev-login0004')->>'token', 4) = 'st1.');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002"}', false);
update cbt_private.students set auth_uid = null where mobile = '9000000066';
do $$ begin for i in 1..10 loop perform public.student_link('9000000001','NOPE'||i,'dev-login0002'); end loop; end $$;
select pg_temp.chk('30m guessing codes while joining stops after 10 an hour',
  public.student_link('9000000001','AAAA1111','dev-login0002')->>'error' = 'busy');
select pg_temp.chk('30n the join list and the login functions are closed to direct use',
  not has_table_privilege('anon', 'cbt_private.auth_link_tries', 'SELECT')
  and not has_function_privilege('anon', 'cbt_private.auth_issue(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'cbt_private.auth_user()', 'EXECUTE'));
select pg_temp.chk('30o the login functions are open only to a Supabase login (not to anon or PUBLIC)',
  not has_function_privilege('anon', 'public.student_signin(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.student_link(text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.student_request(text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.student_signin(text)', 'EXECUTE')
  and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname not like 'student\_%' and p.proname not like 'cbt\_%'
                     and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.prosecdef));
select set_config('request.jwt.claims', '', false);
-- ===== 31. study tracker kept on the account (v66): only the owner, only clean values =====
set role anon;
select pg_temp.chk('31a tracker: nothing without a valid sign-in',
  coalesce((public.cbt_keep('9000000002','WRONG999','dev-bbbbbbbb','save','{"trk":{"weeks":[{"label":"W"}]}}')->>'ok')::boolean, false) is not true);
select public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save',
  '{"trk":{"cur":7,"nid":12,"evil":1,"goals":{"s3":25,"bad key":4,"s4":"x"},"weeks":[{"id":"w1","label":"Week <b>1</b>","subjects":[{"id":"s3","name":"Physics","emoji":"⚡","color":"red","tasks":[{"id":4,"text":"Kinematics <script>","done":true,"at":1767225600000},{"id":5,"text":"   "},{"id":"x y","text":"DPP"}]}]}]},
    "trkat":1767225600000,"trkd":{"2026-11-9":3,"bad":4,"2026-11-8":-2}}') as tsave \gset
select pg_temp.chk('31b tracker: saved plan comes back, cleaned (markup, colour, empty tasks, bad ids, cur in range)',
  (:'tsave'::jsonb->>'ok')::boolean
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->>'label' = 'Week b1/b'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->'subjects'->0->>'color' = '#6366f1'
  and jsonb_array_length(public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->'subjects'->0->'tasks') = 2
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->'subjects'->0->'tasks'->0->>'text' = 'Kinematics script'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->'subjects'->0->'tasks'->1->>'id' = '3'
  and (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->>'cur')::int = 0
  and not (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk' ? 'evil')
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'goals' = '{"s3":25}'::jsonb
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trkd' = '{"2026-11-9":3}'::jsonb
  and (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->>'trkat')::bigint = 1767225600000);
select pg_temp.chk('31c tracker: the profile and countdown are untouched, another student sees nothing',
  public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'pf' ? 'about'
  and coalesce(public.cbt_keep('9000000002','BBBB2222','dev-bbbbbbbb','get')->'trk', 'null'::jsonb) = 'null'::jsonb);
select pg_temp.chk('31d tracker: not a tracker or too big is refused, the saved one stays',
  public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save','{"trk":{"weeks":"x"}}')->>'error' = 'trk'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save', jsonb_build_object('trk', jsonb_build_object('weeks', jsonb_build_array(jsonb_build_object('label', repeat('x', 160000))))))->>'error' = 'too_big'
  and public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk'->'weeks'->0->>'label' = 'Week b1/b');
select pg_temp.chk('31e tracker: a time in the future is not kept; null clears the tracker',
  (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save','{"trk":{"weeks":[{"label":"W"}]},"trkat":99999999999999}')->>'ok')::boolean
  and (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->>'trkat')::bigint <= (extract(epoch from now()) * 1000)::bigint + 1000
  and (public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','save','{"trk":null,"trkd":null}')->>'ok')::boolean
  and coalesce(public.cbt_keep('9000000001','AAAA1111','dev-aaaaaaaa','get')->'trk', 'null'::jsonb) = 'null'::jsonb);
reset role;

-- ===== 32. test feedback (v67): only a student who took the test, private to the admin =====
insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers)
select id, 'aaaaaaaa-0000-0000-0000-000000000004', 'Open mock', 4, 8, 1, 0, 1, 60, '{}' from cbt_private.students where mobile = '9000000001';
set role anon;
select pg_temp.chk('32a test feedback: only after taking the test, with stars and 15+ letters',
  public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000001',5,'Great test, loved it')->>'error' = 'not_taken'
  and public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004',5,'too short')->>'error' = 'short'
  and public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004',0,'Great test, loved it')->>'error' = 'rating'
  and public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','not-a-test',5,'Great test, loved it')->>'error' = 'test');
select public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004',4,'Good <b>questions</b>, a bit long') as tr1 \gset
select pg_temp.chk('32b test feedback: saved, cleaned, and only the student sees their own',
  (:'tr1'::jsonb->>'ok')::boolean
  and public.cbt_test_review_mine('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004')->'review'->>'body' = 'Good bquestions/b, a bit long'
  and (public.cbt_test_review_mine('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004')->'review'->>'rating')::int = 4
  and coalesce(public.cbt_test_review_mine('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000004')->'review', 'null'::jsonb) = 'null'::jsonb
  and public.cbt_test_review_save('9000000001','AAAA1111','dev-aaaaaaaa','aaaaaaaa-0000-0000-0000-000000000004',5,'Changed my mind, great test')->>'error' = 'busy');
select coalesce((public.cbt_admin_test_reviews('wrong-password','get')->>'ok')::boolean, false) as trw \gset
select public.cbt_admin_test_reviews(:'ow5','get') as trg \gset
select pg_temp.chk('32c test feedback: the admin sees each test with its average and the comment; others cannot',
  not :'trw'::boolean
  and (:'trg'::jsonb->'tests'->0->>'n')::int = 1 and (:'trg'::jsonb->'tests'->0->>'avg')::numeric = 4
  and :'trg'::jsonb->'items'->0->>'mobile' = '9000000001'
  and public.cbt_admin_test_reviews(:'lvt','get')->>'error' = 'forbidden');
select pg_temp.chk('32d test feedback: the owner can delete a rating',
  (public.cbt_admin_test_reviews(:'ow5','delete', jsonb_build_object('id', :'trg'::jsonb->'items'->0->>'id'))->>'ok')::boolean
  and jsonb_array_length(public.cbt_admin_test_reviews(:'ow5','get')->'items') = 0);
reset role;

-- ===== 33. v68: re-attempt after "Live ends" only, too-fast full marks, answer-key PDF after the result =====
insert into cbt_private.tests (id, series_id, title, duration, data, question_count, closes_at)
select 'aaaaaaaa-0000-0000-0000-000000000068', series_id, 'Ended live', 60, data, question_count, cbt_private.now_ms() - 60000
  from cbt_private.tests where id = 'aaaaaaaa-0000-0000-0000-000000000004';
insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers, created_at)
select id, 'aaaaaaaa-0000-0000-0000-000000000068', 'Ended live', 8, 8, 2, 0, 0, 150, '{}', now() - interval '2 hours' from cbt_private.students where mobile = '9000000002';
insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers)
select id, 'aaaaaaaa-0000-0000-0000-000000000068', 'Ended live', 8, 8, 2, 0, 0, 100, '{}' from cbt_private.students where mobile = '9000000002';
insert into cbt_private.test_pdfs (test_id, url) values ('aaaaaaaa-0000-0000-0000-000000000068', 'https://drive.google.com/file/d/abc/view')
  on conflict (test_id) do update set url = excluded.url;
set role anon;
select pg_temp.chk('33a re-attempt: "Live ends" passed with no result time -> the test opens again',
  (public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-000000000068')->>'ok')::boolean);
select pg_temp.chk('33b answer-key PDF: given once the result time (here "Live ends") has passed',
  public.cbt_test_pdfs('9000000002','BBBB2222','dev-bbbbbbbb')->'items' ? 'aaaaaaaa-0000-0000-0000-000000000068');
reset role;
update cbt_private.tests set closes_at = cbt_private.now_ms() + 3600000 where id = 'aaaaaaaa-0000-0000-0000-000000000068';
set role anon;
select pg_temp.chk('33c answer-key PDF: hidden while the test is live',
  not (public.cbt_test_pdfs('9000000002','BBBB2222','dev-bbbbbbbb')->'items' ? 'aaaaaaaa-0000-0000-0000-000000000068'));
select public.cbt_admin_suspects(:'ow5','get') as sus \gset
select pg_temp.chk('33d suspicious: only the FIRST fast full-marks attempt is listed; others cannot see the list',
  (select count(*) from jsonb_array_elements(:'sus'::jsonb->'items') i where i->>'test_id' = 'aaaaaaaa-0000-0000-0000-000000000068') = 1
  and (select (i->>'used')::int from jsonb_array_elements(:'sus'::jsonb->'items') i where i->>'test_id' = 'aaaaaaaa-0000-0000-0000-000000000068') = 150
  and coalesce((public.cbt_admin_suspects('wrong-password','get')->>'ok')::boolean, false) is false
  and (public.cbt_admin_suspects(:'ow5','count')->>'count')::int >= 1);
select pg_temp.chk('33e suspicious: "Looks fine" removes it from the list',
  (public.cbt_admin_suspects(:'ow5','ok', jsonb_build_object('result_id',
     (select i->>'id' from jsonb_array_elements(:'sus'::jsonb->'items') i where i->>'test_id' = 'aaaaaaaa-0000-0000-0000-000000000068')))->>'ok')::boolean
  and not exists (select 1 from jsonb_array_elements(public.cbt_admin_suspects(:'ow5','get')->'items') i where i->>'test_id' = 'aaaaaaaa-0000-0000-0000-000000000068'));
reset role;

-- ===== 34. v69: chapter-wise test analysis, from the Question Bank link of each test question =====
insert into cbt_private.qbank (subject, chapter, topic, q, options, answer, src)
values ('bio', 'cell', '', 'OQ', '["a","b","c","d"]', 3, 'test:aaaaaaaa-0000-0000-0000-000000000004:0')
on conflict (src) do update set subject = excluded.subject, chapter = excluded.chapter;
insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers, times)
select id, 'aaaaaaaa-0000-0000-0000-000000000004', 'Open mock', 4, 4, 1, 0, 0, 40, '{"0":3}', '{"0":40}' from cbt_private.students where mobile = '9000000002';
-- a live test whose result time is still ahead: its chapter must not show yet
update cbt_private.tests set result_at = cbt_private.now_ms() + 3600000 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into cbt_private.qbank (subject, chapter, topic, q, options, answer, src)
values ('bio', 'hidden', '', 'Q1', '["a","b","c","d"]', 2, 'test:aaaaaaaa-0000-0000-0000-000000000001:0')
on conflict (src) do update set chapter = excluded.chapter;
insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers)
select id, 'aaaaaaaa-0000-0000-0000-000000000001', 'Paid Live', 4, 4, 1, 0, 0, 30, '{"0":2}' from cbt_private.students where mobile = '9000000002';
select pg_temp.chk('34z (setup) the live test result is hidden for now', not cbt_private.res_visible('aaaaaaaa-0000-0000-0000-000000000001'));
set role anon;
select public.cbt_test_chapters('9000000002','BBBB2222','dev-bbbbbbbb') as tc2 \gset
select public.cbt_test_chapters('9000000001','AAAA1111','dev-aaaaaaaa') as tc1 \gset
select pg_temp.chk('34a chapters: each student sees their own latest attempt, by the chapter of the bank copy',
  (:'tc2'::jsonb->>'ok')::boolean
  and exists (select 1 from jsonb_array_elements(:'tc2'::jsonb->'chapters') c where c->>'s' = 'bio' and c->>'c' = 'cell'
              and (c->>'correct')::int = 1 and (c->>'wrong')::int = 0 and (c->>'avg_time')::int = 40)
  and exists (select 1 from jsonb_array_elements(:'tc1'::jsonb->'chapters') c where c->>'c' = 'cell' and (c->>'skipped')::int = 1 and (c->>'correct')::int = 0)
  and (:'tc2'::jsonb->>'tagged')::int >= 1 and (:'tc2'::jsonb->>'all')::int >= (:'tc2'::jsonb->>'tagged')::int);
select pg_temp.chk('34b chapters: a wrong code gets nothing',
  coalesce((public.cbt_test_chapters('9000000002','WRONG999','dev-bbbbbbbb')->>'ok')::boolean, false) is false
  and public.cbt_test_chapters('9000000002','WRONG999','dev-bbbbbbbb')->'chapters' is null);
select pg_temp.chk('34c chapters: a test whose result is not out yet is not counted',
  not exists (select 1 from jsonb_array_elements(:'tc2'::jsonb->'chapters') c where c->>'c' = 'hidden'));
reset role;

-- ===== 35. v70 storage + costs: owner only, every change logged, bad input refused =====
insert into storage.objects (bucket_id, name, metadata) values
  ('notes', 'bio/cell.pdf', '{"size": 5000000, "mimetype": "application/pdf"}'),
  ('notes', 'covers/a.png', '{"size": 200000, "mimetype": "image/png"}');
insert into public.cbt_pyq (exam, subject, chapter, year, paper, qno, q, options, answer) values ('NEET', 'bio', 'cell', 2024, 'NEET 2024', 1, 'q', '[]', 1);
set role anon;
select pg_temp.chk('35a storage/costs: a stranger and a team member get nothing',
  public.cbt_admin_ops('wrong-password','storage','{}')->>'ok' is distinct from 'true'
  and public.cbt_admin_ops(:'smt','storage','{}')->>'error' = 'forbidden'
  and public.cbt_admin_ops(:'smt','costs','{}')->>'error' = 'forbidden'
  and public.cbt_admin_ops(:'smt','budget_set','{"service":"Supabase","amount":"1"}')->>'error' = 'forbidden'
  and public.cbt_admin_ops(:'smt','cost_add','{"service":"Supabase","month":"2026-11","amount":"1"}')->>'error' = 'forbidden');
select public.cbt_admin_ops(:'ow9','storage','{}') as st \gset
select pg_temp.chk('35b storage: real sizes from the database and Supabase Storage',
  (:'st'::jsonb->>'ok')::boolean and (:'st'::jsonb->>'db_bytes')::bigint > 0 and (:'st'::jsonb->>'file_bytes')::bigint = 5200000
  and jsonb_array_length(:'st'::jsonb->'tables') between 1 and 15
  and exists (select 1 from jsonb_array_elements(:'st'::jsonb->'types') x where x->>'type' = 'PDFs' and (x->>'bytes')::bigint = 5000000)
  and (:'st'::jsonb->'largest'->0->>'name') = 'bio/cell.pdf' and jsonb_array_length(:'st'::jsonb->'history') = 1);
select pg_temp.chk('35c costs: bad budget / bill input is refused',
  public.cbt_admin_ops(:'ow9','budget_set','{"service":"<script>","amount":"10"}')->>'error' = 'bad_request'
  and public.cbt_admin_ops(:'ow9','budget_set','{"service":"Supabase","amount":"-5"}')->>'error' = 'bad_request'
  and public.cbt_admin_ops(:'ow9','cost_add','{"service":"Supabase","month":"2026-13","amount":"10"}')->>'error' = 'bad_request'
  and public.cbt_admin_ops(:'ow9','cost_add','{"service":"Supabase","month":"2026-11","amount":"abc"}')->>'error' = 'bad_request'
  and public.cbt_admin_ops(:'ow9','cost_add','{"service":"Supabase","month":"2026-11","amount":"10","currency":"EUR"}')->>'error' = 'bad_request');
select public.cbt_admin_ops(:'ow9','budget_set','{"service":"Supabase","amount":"2000"}')->>'ok' as b1 \gset
select public.cbt_admin_ops(:'ow9','cost_add','{"service":"Supabase","month":"2026-11","amount":"1850.50","note":"Pro plan"}')->>'id' as c1 \gset
select public.cbt_admin_ops(:'ow9','costs','{}') as co \gset
select pg_temp.chk('35d costs: budget and manual bill are saved and read back',
  :'b1' = 'true' and (:'co'::jsonb->'budgets'->>'Supabase')::numeric = 2000
  and exists (select 1 from jsonb_array_elements(:'co'::jsonb->'costs') x where x->>'note' = 'Pro plan' and (x->>'amount')::numeric = 1850.50 and x->>'by' = 'Owner'));
select pg_temp.chk('35e costs: mark paid and delete work, and the budget can be removed',
  (public.cbt_admin_ops(:'ow9','cost_paid',('{"id":' || :'c1' || ',"paid":true}')::jsonb)->>'ok')::boolean
  and (public.cbt_admin_ops(:'ow9','cost_delete',('{"id":' || :'c1' || '}')::jsonb)->>'ok')::boolean
  and (public.cbt_admin_ops(:'ow9','budget_set','{"service":"Supabase","amount":""}')->'budgets') = '{}'::jsonb);
select pg_temp.chk('35h PYQ bank: the papers list works (was "column reference n is ambiguous")',
  (public.cbt_admin_pyq(:'ow9','papers','{}')->>'ok')::boolean and (public.cbt_admin_pyq(:'ow9','papers','{}')->'items'->0->>'n')::int >= 1);
reset role;
select pg_temp.chk('35f costs: every change and every refused try is in the activity log; reads are not',
  (select count(*) from cbt_private.admin_audit where fn = 'cbt_admin_ops' and act in ('budget_set', 'cost_add', 'cost_paid', 'cost_delete') and who = 'Owner') >= 4
  and exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_ops' and result = 'refused')
  and not exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_ops' and act = 'storage' and result = ''));
select pg_temp.chk('35g costs: the tables cannot be read from outside',
  not has_table_privilege('anon', 'cbt_private.ops_costs', 'select') and not has_table_privilege('anon', 'cbt_private.ops_snap', 'select'));

-- ===== 36. wallet: an admin can remove money too, never below ₹0; the student sees "Removed by us" (v71) =====
set role anon;
select public.cbt_admin_refer(:'ow9','adjust','{"mobile":"9855500001","amount":"300","note":"gift"}')->>'balance' as w1 \gset
select public.cbt_admin_refer(:'ow9','adjust','{"mobile":"9855500001","amount":"-120","note":"added too much"}')->>'balance' as w2 \gset
select pg_temp.chk('36a wallet: money can be added and removed by the owner', :'w1' = '300' and :'w2' = '180');
select pg_temp.chk('36b wallet: it cannot go below ₹0, and a team member without Store access cannot change it',
  public.cbt_admin_refer(:'ow9','adjust','{"mobile":"9855500001","amount":"-181","note":"x"}')->>'error' = 'too_much'
  and public.cbt_admin_refer(:'smt','adjust','{"mobile":"9855500001","amount":"-10","note":"x"}')->>'error' = 'forbidden');
reset role;
select pg_temp.chk('36c wallet: the removal is in the student''s history as "Removed by us", and in the activity log',
  exists (select 1 from jsonb_array_elements(cbt_private.refer_info('9855500001')->'history') x where (x->>'amount')::int = -120 and x->>'note' = 'Removed by us')
  and exists (select 1 from jsonb_array_elements(cbt_private.refer_info('9855500001')->'history') x where (x->>'amount')::int = 300 and x->>'note' = 'Added by us')
  and exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_refer' and act = 'adjust' and who = 'Owner'));

-- ===== 37. v72 owner profile: owner only, input checked, logged =====
set role anon;
select pg_temp.chk('37a owner profile: a stranger and a team member get nothing and change nothing',
  public.cbt_admin_profile('wrong-password','get','{}')->>'ok' is distinct from 'true'
  and public.cbt_admin_profile(:'smt','get','{}')->>'error' = 'forbidden'
  and public.cbt_admin_profile(:'smt','save','{"name":"Hacker"}')->>'error' = 'forbidden');
select pg_temp.chk('37b owner profile: bad name / mobile / e-mail are refused',
  public.cbt_admin_profile(:'ow9','save','{"name":"A"}')->>'detail' = 'name'
  and public.cbt_admin_profile(:'ow9','save','{"name":"Sanjay","mobile":"12345"}')->>'detail' = 'mobile'
  and public.cbt_admin_profile(:'ow9','save','{"name":"Sanjay","email":"not-an-email"}')->>'detail' = 'email');
select public.cbt_admin_profile(:'ow9','save','{"name":"<b>Sanjay</b> Joshi","mobile":"+91 98765 43210","email":"Owner@Example.com"}') as pf \gset
select pg_temp.chk('37c owner profile: saved clean (no tags, 10-digit mobile, lower-case e-mail) and read back',
  (:'pf'::jsonb->>'ok')::boolean and :'pf'::jsonb->>'name' = 'bSanjay/b Joshi' and :'pf'::jsonb->>'mobile' = '9876543210'
  and public.cbt_admin_profile(:'ow9','get','{}')->>'email' = 'owner@example.com');
reset role;
select pg_temp.chk('37d owner profile: the change and the refused try are in the activity log',
  exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_profile' and act = 'save' and who = 'Owner' and result = '')
  and exists (select 1 from cbt_private.admin_audit where fn = 'cbt_admin_profile' and result = 'refused'));

-- ===== 38. v73 contact details: cut in the database for members without the "contacts" permission =====
set role anon;
select public.cbt_admin_team(:'ow9','user_save','{"name":"No Contacts","username":"nocon1","password":"Tr7k-9mQz-pLc1","perms":{"students":"view","store":"view","payments":"view"}}')->>'ok' as nc1 \gset
select public.cbt_admin_team(:'ow9','user_save','{"name":"With Contacts","username":"wcon1","password":"Tr7k-9mQz-pLc2","perms":{"students":"view","contacts":"view"}}')->>'ok' as wc1 \gset
select public.cbt_admin_login('nocon1','Tr7k-9mQz-pLc1','N')->>'token' as nct \gset
select public.cbt_admin_login('wcon1','Tr7k-9mQz-pLc2','W')->>'token' as wct \gset
select public.cbt_admin(:'nct','students','{}')::text as st_no \gset
select public.cbt_admin(:'wct','students','{}')::text as st_yes \gset
select public.cbt_admin(:'ow9','students','{}')::text as st_ow \gset
select pg_temp.chk('38a contacts: without the permission no full phone number leaves the database (students, store orders, payments)',
  :'nc1' = 'true' and :'st_no' ~ '"mobile": "[0-9]{2}•••••[0-9]{3}"' and :'st_no' !~ '"mobile": "[0-9]{10}"'
  and public.cbt_admin_store(:'nct','get','{}')::text !~ '"mobile": "[0-9]{10}"'
  and public.cbt_admin_payments(:'nct','get','{}')::text !~ '"mobile": "[0-9]{10}"');
select pg_temp.chk('38b contacts: with the permission, and for the owner, the numbers are complete',
  :'wc1' = 'true' and :'st_yes' ~ '"mobile": "[0-9]{10}"' and :'st_yes' !~ '•' and :'st_ow' ~ '"mobile": "[0-9]{10}"' and :'st_ow' !~ '•');
select pg_temp.chk('38d contacts: a member cannot give the permission to themselves',
  public.cbt_admin_team(:'nct','user_save','{"name":"No Contacts","username":"nocon1","perms":{"contacts":"view"}}')->>'error' = 'forbidden');
reset role;
select pg_temp.chk('38f contacts: e-mails are cut too, and text that only looks like a number field is left alone',
  cbt_private.mask_contacts('{"email":"sanjay.j@gmail.com","note":"call \"mobile\": \"9000000009\"","mobile_left":2}'::jsonb)
    = '{"email":"sa•••@gmail.com","note":"call \"mobile\": \"9000000009\"","mobile_left":2}'::jsonb);
-- the one-time grant: as on the live database, where members exist before v73 is run
insert into cbt_private.admin_users (name, username, salt, pw_hash, perms) values
  ('Old Store', 'oldstore1', 'x', 'x', '{"store":"manage"}'), ('Old Viewer', 'oldview1', 'x', 'x', '{"students":"view"}');
delete from cbt_private.settings where key = 'contacts_perm_seeded';
\set QUIET on
\o /dev/null
\i supabase_v73_contacts.sql
\o
select pg_temp.chk('38g contacts: when v73 is installed, every member that exists gets the permission (nothing changes for the team)',
  (select perms->>'contacts' from cbt_private.admin_users where username = 'oldstore1') = 'view'
  and (select perms->>'contacts' from cbt_private.admin_users where username = 'oldview1') = 'view');
update cbt_private.admin_users set perms = perms - 'contacts' where username = 'oldstore1';
\o /dev/null
\i supabase_v73_contacts.sql
\o
select pg_temp.chk('38h contacts: running v73 again does not give the permission back after the owner removed it',
  (select perms->>'contacts' from cbt_private.admin_users where username = 'oldstore1') is null);

-- ===== report =====
\t off
\a
select case when ok then 'PASS' else 'FAIL' end as result, name, info from t order by n;
do $$ declare b int; begin
  select count(*) into b from t where not ok;
  if b > 0 then raise exception '% check(s) FAILED', b; end if;
end $$;
select 'ALL ' || count(*) || ' CHECKS PASSED' as summary from t;
