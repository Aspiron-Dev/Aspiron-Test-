-- Open findings from SECURITY_REVIEW.md that are NOT fixed yet (waiting for the owner's go-ahead).
-- Each check describes the SAFE behaviour, so it FAILS today and must PASS once the finding is fixed;
-- then move it into break_it.sql. CI shows these as a separate, non-blocking step so the open risks stay visible.
\set ON_ERROR_STOP 1
\pset pager off
\t on
\a
set client_min_messages = warning;
create temp table t (n serial, name text, ok boolean, info text);
grant all on t to anon; grant all on sequence t_n_seq to anon;
create function pg_temp.chk(p_name text, p_ok boolean, p_info text default '') returns void language sql as
  $$ insert into t (name, ok, info) values (p_name, coalesce(p_ok, false), coalesce(p_info, '')) $$;
grant execute on function pg_temp.chk(text, boolean, text) to anon;
select set_config('request.headers', '{"x-real-ip":"203.0.113.77"}', false);
-- test database only: start from a clean owner sign-in (break_it.sql turns two-step sign-in on)
delete from cbt_private.admin_totp; delete from cbt_private.admin_fails; delete from cbt_private.settings where key in ('admin_locked_until','team_locked_until');

-- R1: a test with "Live ends" but no result time gives the answer key to whoever submits first, while others still write it
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice,closes_at,result_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1','22222222-2222-2222-2222-222222222222','Live, no result time',60,
   '[{"q":"KQ","options":["a","b","c","d"],"answer":2,"explanation":"KEY"}]',1,true,false,(extract(epoch from now())*1000)::bigint+3600000,null)
  on conflict (id) do nothing;
set role anon;
select public.cbt_start('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f1')->>'ok';
select pg_temp.chk('R1 live window without result time: no answer key at submit',
  not ((public.cbt_submit('9000000002','BBBB2222','dev-bbbbbbbb','aaaaaaaa-0000-0000-0000-0000000000f1','{}','open-r1')->'review')::text ~ '"answer"'));
reset role;

-- R2: deleting a student leaves their rows behind (results, reviews, push subscriptions, alerts, device info)
insert into cbt_private.students(id,name,mobile,status,salt,code_hash) values
  ('bbbbbbbb-0000-0000-0000-0000000000d1','To Delete','9000000099','approved','sd',cbt_private.hash_code('sd','DDDD4444')) on conflict do nothing;
insert into public.cbt_push_subs(endpoint, mobile, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/del1','9000000099','a','b') on conflict do nothing;
insert into cbt_private.results(student_id,test_id,test_title,score,max_score,correct,wrong,skipped,used_seconds,answers)
  values ('bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000004','x',0,4,0,0,1,1,'{}');
select public.cbt_admin_login('','OwnerPass2026x','Owner')->>'token' as ow \gset
select public.cbt_admin(:'ow','student_delete','{"id":"bbbbbbbb-0000-0000-0000-0000000000d1"}')->>'ok';
select pg_temp.chk('R2 deleting a student removes their results and phone subscriptions',
  not exists (select 1 from cbt_private.results where student_id = 'bbbbbbbb-0000-0000-0000-0000000000d1')
  and not exists (select 1 from public.cbt_push_subs where mobile = '9000000099'));

\t off
\a
select case when ok then 'FIXED' else 'OPEN' end as status, name, info from t order by n;
