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
select public.cbt_admin_team(:'ow','user_save','{"name":"Viewer","username":"viewer1","password":"Tr7k-9mQz-pLx2","perms":{"students":"view"}}')->>'ok';
select public.cbt_admin_login('viewer1','Tr7k-9mQz-pLx2','V')->>'token' as vt \gset
select pg_temp.chk('14a view-only member cannot delete a student',
  public.cbt_admin(:'vt','student_delete','{"id":"bbbbbbbb-0000-0000-0000-00000000000a"}')->>'error' = 'forbidden');
select pg_temp.chk('14b view-only member cannot open payments', public.cbt_admin_payments(:'vt','get','{}')->>'error' = 'forbidden');
select pg_temp.chk('14c member cannot see the team', public.cbt_admin_team(:'vt','get','{}')->>'error' = 'forbidden');
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
select public.cbt_admin_team(:'ow2','user_save','{"name":"Support","username":"support1","password":"Qw8v-Lm3x-Zp7k","perms":{"students":"manage"}}')->>'ok';
select public.cbt_admin_login('support1','Qw8v-Lm3x-Zp7k','S')->>'token' as st6 \gset
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

-- ===== report =====
\t off
\a
select case when ok then 'PASS' else 'FAIL' end as result, name, info from t order by n;
do $$ declare b int; begin
  select count(*) into b from t where not ok;
  if b > 0 then raise exception '% check(s) FAILED', b; end if;
end $$;
select 'ALL ' || count(*) || ' CHECKS PASSED' as summary from t;
