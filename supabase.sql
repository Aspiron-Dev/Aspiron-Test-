-- =====================================================================
--  CBT TEST SERIES  v2
--  Approval + unique access code per student + series / folders / tests
--  + free / paid series + server-side marking.
--
--  HOW TO RUN (2 small steps)
--   1. Supabase > SQL Editor > New query > paste this whole file > Run.
--      (You can run it again any time, it is safe to repeat.)
--   2. Open a NEW query, type this ONE line with your own admin password
--      (at least 8 characters) between the quotes, and Run it:
--
--         select cbt_private.set_admin_password('your-admin-password');
--
--      Run step 2 again whenever you want to change the admin password.
--
--  SAFETY: everything lives in a private schema that the public API cannot
--  see. The website can only talk to the functions below, and every
--  function checks the student's code (or the admin password) first.
-- =====================================================================

create schema if not exists cbt_private;
revoke all on schema cbt_private from public, anon, authenticated;

-- ---- close the old open table from version 1 (if it exists) ----------
do $$
begin
  if to_regclass('public.attempts') is not null then
    execute 'drop policy if exists "anon can insert" on public.attempts';
    execute 'drop policy if exists "anon can read" on public.attempts';
    execute 'alter table public.attempts enable row level security';
    execute 'revoke all on public.attempts from anon, authenticated';
  end if;
end $$;

-- ---- tables -----------------------------------------------------------
create table if not exists cbt_private.settings (
  key text primary key,
  value text
);

create table if not exists cbt_private.students (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  mobile text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','blocked')),
  salt text,
  code_hash text,
  devices text[] not null default '{}',
  max_devices int not null default 2,
  fail_count int not null default 0,
  locked_until bigint not null default 0,
  last_seen timestamptz
);

create table if not exists cbt_private.series (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text not null default '',
  is_free boolean not null default true,
  price_label text not null default '',
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists cbt_private.folders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  series_id uuid not null references cbt_private.series(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists cbt_private.tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  series_id uuid not null references cbt_private.series(id) on delete cascade,
  folder_id uuid references cbt_private.folders(id) on delete set null,
  title text not null,
  duration int not null default 180,
  correct_marks numeric not null default 4,
  wrong_marks numeric not null default 1,
  lock_back boolean not null default false,
  free_preview boolean not null default false,
  question_count int not null default 0,
  data jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists cbt_private.series_access (
  student_id uuid not null references cbt_private.students(id) on delete cascade,
  series_id uuid not null references cbt_private.series(id) on delete cascade,
  primary key (student_id, series_id)
);

create table if not exists cbt_private.sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references cbt_private.students(id) on delete cascade,
  test_id uuid not null references cbt_private.tests(id) on delete cascade,
  started_at bigint not null,
  ends_at bigint not null,
  submitted boolean not null default false
);
create unique index if not exists sessions_one_open on cbt_private.sessions(student_id, test_id) where not submitted;

create table if not exists cbt_private.results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_id uuid not null references cbt_private.students(id) on delete cascade,
  test_id uuid references cbt_private.tests(id) on delete set null,
  test_title text not null,
  score numeric not null,
  max_score numeric not null,
  correct int not null,
  wrong int not null,
  skipped int not null,
  used_seconds int not null default 0,
  answers jsonb not null default '{}'::jsonb,
  late boolean not null default false,
  client_id text,
  unique (student_id, client_id)
);
create index if not exists results_test_idx on cbt_private.results(test_id);
create index if not exists results_student_idx on cbt_private.results(student_id);

alter table cbt_private.settings      enable row level security;
alter table cbt_private.students      enable row level security;
alter table cbt_private.series        enable row level security;
alter table cbt_private.folders       enable row level security;
alter table cbt_private.tests         enable row level security;
alter table cbt_private.series_access enable row level security;
alter table cbt_private.sessions      enable row level security;
alter table cbt_private.results       enable row level security;

-- ---- small helpers (private) -----------------------------------------
create or replace function cbt_private.now_ms() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp())*1000)::bigint $$;

create or replace function cbt_private.norm_mobile(p text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(p,''),'\D','','g'),10) $$;

create or replace function cbt_private.norm_code(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p,''),'[^0-9A-Za-z]','','g')) $$;

create or replace function cbt_private.hash_code(p_salt text, p_code text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(p_salt,'')||':'||coalesce(p_code,''),'UTF8')),'hex') $$;

create or replace function cbt_private.new_code() returns text
language sql volatile as $$ select upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)) $$;

create or replace function cbt_private.short_name(n text) returns text
language sql immutable as $$
  select split_part(btrim(coalesce(n,'')),' ',1)
      || case when split_part(btrim(coalesce(n,'')),' ',2) <> '' then ' ' || left(split_part(btrim(coalesce(n,'')),' ',2),1) || '.' else '' end
$$;

-- checks mobile + code + device. Never raises, so failed-attempt counters are kept.
create or replace function cbt_private.auth(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  s cbt_private.students%rowtype;
  m text := cbt_private.norm_mobile(p_mobile);
  c text := cbt_private.norm_code(p_code);
  t bigint := cbt_private.now_ms();
begin
  select * into s from students where mobile = m for update;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;
  if s.locked_until > t then
    return jsonb_build_object('ok',false,'error','locked','wait',ceil((s.locked_until - t)/60000.0)::int);
  end if;
  if s.status = 'pending' then
    return jsonb_build_object('ok',false,'error','pending');
  end if;
  if s.code_hash is null or s.code_hash <> hash_code(s.salt, c) then
    update students set
      locked_until = case when fail_count + 1 >= 8 then t + 900000 else locked_until end,
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
    if coalesce(array_length(s.devices,1),0) >= s.max_devices then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
    update students set devices = array_append(devices, p_device) where id = s.id;
  end if;
  update students set fail_count = 0, last_seen = now() where id = s.id;
  return jsonb_build_object('ok',true,'id',s.id,'name',s.name,'mobile',s.mobile);
end $$;

-- admin password check (null = OK, otherwise an error code)
create or replace function cbt_private.admin_ok(p_pw text)
returns text language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  t bigint := cbt_private.now_ms();
  h text; sl text; lk bigint; fl int;
begin
  select value into h from settings where key = 'admin_hash';
  if h is null then return 'not_set'; end if;
  select value into sl from settings where key = 'admin_salt';
  select value::bigint into lk from settings where key = 'admin_locked_until';
  if coalesce(lk,0) > t then return 'locked'; end if;
  if h <> hash_code(sl, coalesce(p_pw,'')) then
    select value::int into fl from settings where key = 'admin_fail';
    fl := coalesce(fl,0) + 1;
    if fl >= 10 then
      insert into settings values ('admin_locked_until',(t + 900000)::text)
        on conflict (key) do update set value = excluded.value;
      fl := 0;
    end if;
    insert into settings values ('admin_fail',fl::text)
      on conflict (key) do update set value = excluded.value;
    return 'invalid';
  end if;
  insert into settings values ('admin_fail','0')
    on conflict (key) do update set value = excluded.value;
  return null;
end $$;

create or replace function cbt_private.set_admin_password(p text)
returns text language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare sl text;
begin
  if p is null or p like 'PUT-YOUR%' or p = 'your-admin-password' then
    raise exception 'Type your own admin password between the quotes (minimum 8 characters).';
  end if;
  if length(p) < 8 then
    raise exception 'Admin password must be at least 8 characters.';
  end if;
  sl := gen_random_uuid()::text;
  insert into settings values ('admin_salt', sl)                on conflict (key) do update set value = excluded.value;
  insert into settings values ('admin_hash', hash_code(sl,p))   on conflict (key) do update set value = excluded.value;
  insert into settings values ('admin_fail','0')                on conflict (key) do update set value = excluded.value;
  insert into settings values ('admin_locked_until','0')        on conflict (key) do update set value = excluded.value;
  return 'Admin password saved.';
end $$;

create or replace function cbt_private.result_json(r cbt_private.results)
returns jsonb language sql stable as $$
  select jsonb_build_object('id',r.id,'test_id',r.test_id,'title',r.test_title,'score',r.score,'max',r.max_score,
    'correct',r.correct,'wrong',r.wrong,'skipped',r.skipped,'used',r.used_seconds,
    'at',(extract(epoch from r.created_at)*1000)::bigint,'late',r.late,'answers',r.answers)
$$;

create or replace function cbt_private.review_json(p_test uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('q',e.v->'q','options',e.v->'options','answer',e.v->'answer',
           'explanation',coalesce(e.v->'explanation','""'::jsonb)) order by e.n),'[]'::jsonb)
  from cbt_private.tests t, jsonb_array_elements(t.data) with ordinality as e(v,n)
  where t.id = p_test
$$;

-- =====================================================================
--  STUDENT FUNCTIONS (callable by the website)
-- =====================================================================

create or replace function public.cbt_request_access(p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  m text := cbt_private.norm_mobile(p_mobile);
  n text := left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),60);
  s record; fnd boolean;
begin
  if length(n) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
  if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
  select * into s from students where mobile = m;
  fnd := found;
  if fnd then
    return jsonb_build_object('ok',true,'status',s.status);
  end if;
  if (select count(*) from students where status = 'pending') >= 300 then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  insert into students(name,mobile,status) values (n,m,'pending');
  return jsonb_build_object('ok',true,'status','pending');
end $$;

create or replace function public.cbt_login(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  return jsonb_build_object('ok',true,'name',a->>'name','mobile',a->>'mobile','now',now_ms());
end $$;

create or replace function public.cbt_catalog(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  ser jsonb; fol jsonb; tst jsonb; res jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',sr.id,'title',sr.title,'description',sr.description,'is_free',sr.is_free,'price_label',sr.price_label,
      'unlocked',(sr.is_free or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id))
    ) order by sr.sort_order, sr.created_at),'[]'::jsonb)
  into ser from series sr where sr.active;

  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'series_id',f.series_id,'title',f.title)
           order by f.sort_order, f.created_at),'[]'::jsonb)
  into fol from folders f join series sr on sr.id = f.series_id and sr.active where f.active;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'series_id',x.series_id,'folder_id',x.folder_id,'title',x.title,'duration',x.duration,
      'questions',x.question_count,'correct',x.correct_marks,'wrong',x.wrong_marks,'free_preview',x.free_preview,'lock_back',x.lock_back,
      'locked', not (sr.is_free or x.free_preview or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id)),
      'attempts',coalesce(r.cnt,0),'best',r.best,'best_max',r.best_max,
      'in_progress',exists(select 1 from sessions se where se.student_id = sid and se.test_id = x.id and not se.submitted and se.ends_at > t)
    ) order by x.sort_order, x.created_at),'[]'::jsonb)
  into tst
  from tests x
  join series sr on sr.id = x.series_id and sr.active
  left join folders f on f.id = x.folder_id
  left join lateral (select count(*)::int cnt, max(rs.score) best, max(rs.max_score) best_max
                     from results rs where rs.student_id = sid and rs.test_id = x.id) r on true
  where x.active and (x.folder_id is null or f.active);

  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'test_id',q.test_id,'title',q.test_title,'score',q.score,
           'max',q.max_score,'correct',q.correct,'wrong',q.wrong,'skipped',q.skipped,'used',q.used_seconds,
           'at',(extract(epoch from q.created_at)*1000)::bigint,'late',q.late) order by q.created_at desc),'[]'::jsonb)
  into res
  from (select * from results where student_id = sid order by created_at desc limit 300) q;

  return jsonb_build_object('ok',true,'now',t,'name',a->>'name','series',ser,'folders',fol,'tests',tst,'results',res);
end $$;

create or replace function public.cbt_start(p_mobile text, p_code text, p_device text, p_test uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess record; qs jsonb; allowed boolean;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select tt.*, sr.is_free as s_free, sr.active as s_active into x
  from tests tt join series sr on sr.id = tt.series_id where tt.id = p_test;
  if not found or not x.active or not x.s_active then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  allowed := x.s_free or x.free_preview
             or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id);
  if not allowed then return jsonb_build_object('ok',false,'error','locked'); end if;

  update sessions set submitted = true
   where student_id = sid and test_id = p_test and not submitted and ends_at < t - 120000;

  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted;
  if not found then
    insert into sessions(student_id,test_id,started_at,ends_at)
    values (sid,p_test,t,t + x.duration::bigint*60000) returning * into sess;
  end if;

  select jsonb_agg(jsonb_build_object('q',e.v->'q','options',e.v->'options') order by e.n)
  into qs from jsonb_array_elements(x.data) with ordinality as e(v,n);

  return jsonb_build_object('ok',true,'now',t,
    'session',jsonb_build_object('id',sess.id,'started_at',sess.started_at,'ends_at',sess.ends_at),
    'test',jsonb_build_object('id',x.id,'title',x.title,'duration',x.duration,'correct',x.correct_marks,
            'wrong',x.wrong_marks,'lock_back',x.lock_back,'questions',coalesce(qs,'[]'::jsonb)));
end $$;

create or replace function public.cbt_submit(p_mobile text, p_code text, p_device text, p_test uuid, p_answers jsonb, p_client_id text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess record; r cbt_private.results%rowtype;
  n int; i int; c int := 0; w int := 0; sk int := 0; ans int; key int; used int; clean jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select * into r from results where student_id = sid and client_id = p_client_id and p_client_id is not null;
  if found then
    return jsonb_build_object('ok',true,'result',result_json(r),'review',review_json(r.test_id));
  end if;

  select * into x from tests where id = p_test;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;

  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted;
  if not found then return jsonb_build_object('ok',false,'error','no_session'); end if;

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

  used := least(((t - sess.started_at)/1000)::int, x.duration*60);
  clean := case when jsonb_typeof(p_answers) = 'object'
    then coalesce((select jsonb_object_agg(e.k, e.v) from jsonb_each(p_answers) as e(k,v)
                   where e.k ~ '^[0-9]+$' and e.v::text ~ '^[0-3]$'),'{}'::jsonb)
    else '{}'::jsonb end;

  insert into results(student_id,test_id,test_title,score,max_score,correct,wrong,skipped,used_seconds,answers,late,client_id)
  values (sid,p_test,x.title,c*x.correct_marks - w*x.wrong_marks,n*x.correct_marks,c,w,sk,used,clean,
          t > sess.ends_at + 120000, p_client_id)
  returning * into r;

  update sessions set submitted = true where id = sess.id;

  return jsonb_build_object('ok',true,'result',result_json(r),'review',review_json(p_test));
end $$;

create or replace function public.cbt_review(p_mobile text, p_code text, p_device text, p_result uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; r cbt_private.results%rowtype; rv jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  select * into r from results where id = p_result and student_id = sid;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  rv := case when r.test_id is null then '[]'::jsonb else review_json(r.test_id) end;
  return jsonb_build_object('ok',true,'result',result_json(r),'review',rv,'gone',(jsonb_array_length(rv) = 0));
end $$;

create or replace function public.cbt_leaderboard(p_mobile text, p_code text, p_device text, p_test uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; total int; myrank int; top jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  with b as (select rs.student_id, max(rs.score) sc from results rs where rs.test_id = p_test group by rs.student_id),
       r as (select b.student_id, b.sc, rank() over (order by b.sc desc) rk from b)
  select (select count(*) from r), (select rk from r where student_id = sid),
         (select coalesce(jsonb_agg(jsonb_build_object('name',short_name(s.name),'score',r.sc,'rank',r.rk,'me',(r.student_id = sid))
                  order by r.rk, s.name),'[]'::jsonb) from r join students s on s.id = r.student_id where r.rk <= 5)
  into total, myrank, top;

  return jsonb_build_object('ok',true,'total',coalesce(total,0),'my_rank',myrank,'top',coalesce(top,'[]'::jsonb));
end $$;

-- =====================================================================
--  ADMIN FUNCTION (one entry point, password checked on every call)
-- =====================================================================
create or replace function public.cbt_admin(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := coalesce(p_data,'{}'::jsonb);
  sid uuid; code text; sl text; m text; nm text; ex record; fnd boolean;
  ser uuid; fid uuid; ttl text; dur int; cm numeric; wm numeric; so int; qs jsonb; clean jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok',false,'error',e); end if;

  begin
    if p_action = 'ping' then
      return jsonb_build_object('ok',true);

    elsif p_action = 'students' then
      return jsonb_build_object('ok',true,'students',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',s.id,'name',s.name,'mobile',s.mobile,'status',s.status,
          'devices',coalesce(array_length(s.devices,1),0),'max_devices',s.max_devices,
          'created',(extract(epoch from s.created_at)*1000)::bigint,
          'last_seen',(extract(epoch from s.last_seen)*1000)::bigint,
          'has_code',(s.code_hash is not null),
          'access',(select coalesce(jsonb_agg(ac.series_id),'[]'::jsonb) from series_access ac where ac.student_id = s.id),
          'attempts',(select count(*) from results rs where rs.student_id = s.id)
        ) order by (s.status = 'pending') desc, s.created_at desc),'[]'::jsonb) from students s));

    elsif p_action = 'student_add' then
      m := norm_mobile(d->>'mobile');
      nm := left(btrim(regexp_replace(coalesce(d->>'name',''),'\s+',' ','g')),60);
      if length(nm) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
      if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
      select * into ex from students where mobile = m;
      fnd := found;
      if fnd and ex.code_hash is not null then
        return jsonb_build_object('ok',false,'error','exists');
      end if;
      code := new_code(); sl := gen_random_uuid()::text;
      if fnd then
        update students set name = nm, status = 'approved', salt = sl, code_hash = hash_code(sl,code),
               devices = '{}', fail_count = 0, locked_until = 0 where id = ex.id returning id into sid;
      else
        insert into students(name,mobile,status,salt,code_hash)
        values (nm,m,'approved',sl,hash_code(sl,code)) returning id into sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid,'code',code,'mobile',m,'name',nm);

    elsif p_action in ('student_approve','student_code') then
      sid := (d->>'id')::uuid; code := new_code(); sl := gen_random_uuid()::text;
      update students set status = case when status = 'pending' then 'approved' else status end,
             salt = sl, code_hash = hash_code(sl,code), devices = '{}', fail_count = 0, locked_until = 0
       where id = sid returning name, mobile into nm, m;
      if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
      return jsonb_build_object('ok',true,'code',code,'name',nm,'mobile',m);

    elsif p_action = 'student_block' then
      sid := (d->>'id')::uuid;
      update students set status = case when coalesce((d->>'block')::boolean,true) then 'blocked'
                                        when code_hash is null then 'pending' else 'approved' end
       where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_devices_reset' then
      sid := (d->>'id')::uuid;
      update students set devices = '{}', fail_count = 0, locked_until = 0 where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_update' then
      sid := (d->>'id')::uuid;
      update students set
        name = coalesce(nullif(left(btrim(coalesce(d->>'name','')),60),''), name),
        max_devices = greatest(1, least(10, coalesce(nullif(d->>'max_devices','')::int, max_devices)))
       where id = sid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'student_delete' then
      delete from students where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'grant' then
      sid := (d->>'student_id')::uuid; ser := (d->>'series_id')::uuid;
      if coalesce((d->>'on')::boolean,false) then
        insert into series_access(student_id,series_id) values (sid,ser) on conflict do nothing;
      else
        delete from series_access where student_id = sid and series_id = ser;
      end if;
      return jsonb_build_object('ok',true);

    elsif p_action = 'catalog' then
      return jsonb_build_object('ok',true,
        'series',(select coalesce(jsonb_agg(to_jsonb(sr) order by sr.sort_order, sr.created_at),'[]'::jsonb) from series sr),
        'folders',(select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order, f.created_at),'[]'::jsonb) from folders f),
        'tests',(select coalesce(jsonb_agg(jsonb_build_object(
            'id',x.id,'series_id',x.series_id,'folder_id',x.folder_id,'title',x.title,'duration',x.duration,
            'questions',x.question_count,'correct',x.correct_marks,'wrong',x.wrong_marks,'lock_back',x.lock_back,
            'free_preview',x.free_preview,'active',x.active,'sort_order',x.sort_order,
            'results',(select count(*) from results rs where rs.test_id = x.id)
          ) order by x.sort_order, x.created_at),'[]'::jsonb) from tests x));

    elsif p_action = 'series_save' then
      sid := nullif(d->>'id','')::uuid;
      if sid is null then
        if length(btrim(coalesce(d->>'title',''))) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
        insert into series(title,description,is_free,price_label,sort_order,active)
        values (btrim(d->>'title'), coalesce(d->>'description',''), coalesce((d->>'is_free')::boolean,true),
                coalesce(d->>'price_label',''), coalesce(nullif(d->>'sort_order','')::int,0), coalesce((d->>'active')::boolean,true))
        returning id into sid;
      else
        update series set
          title = coalesce(nullif(btrim(coalesce(d->>'title','')),''), title),
          description = coalesce(d->>'description', description),
          is_free = coalesce((d->>'is_free')::boolean, is_free),
          price_label = coalesce(d->>'price_label', price_label),
          sort_order = coalesce(nullif(d->>'sort_order','')::int, sort_order),
          active = coalesce((d->>'active')::boolean, active)
         where id = sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'series_delete' then
      delete from series where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'folder_save' then
      sid := nullif(d->>'id','')::uuid;
      if sid is null then
        if length(btrim(coalesce(d->>'title',''))) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
        insert into folders(series_id,title,sort_order,active)
        values ((d->>'series_id')::uuid, btrim(d->>'title'), coalesce(nullif(d->>'sort_order','')::int,0), coalesce((d->>'active')::boolean,true))
        returning id into sid;
      else
        update folders set
          title = coalesce(nullif(btrim(coalesce(d->>'title','')),''), title),
          sort_order = coalesce(nullif(d->>'sort_order','')::int, sort_order),
          active = coalesce((d->>'active')::boolean, active)
         where id = sid;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'folder_delete' then
      delete from folders where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'test_save' then
      sid := nullif(d->>'id','')::uuid;
      ser := (d->>'series_id')::uuid;
      if not exists (select 1 from series where id = ser) then return jsonb_build_object('ok',false,'error','series'); end if;
      fid := nullif(d->>'folder_id','')::uuid;
      if fid is not null and not exists (select 1 from folders where id = fid and series_id = ser) then fid := null; end if;
      ttl := btrim(coalesce(d->>'title',''));
      if length(ttl) < 1 then return jsonb_build_object('ok',false,'error','title'); end if;
      dur := greatest(1, least(600, coalesce(nullif(d->>'duration','')::int,180)));
      cm := coalesce(nullif(d->>'correct','')::numeric,4);
      wm := coalesce(nullif(d->>'wrong','')::numeric,1);
      so := coalesce(nullif(d->>'sort_order','')::int,0);

      qs := d->'questions'; clean := null;
      if qs is not null and jsonb_typeof(qs) = 'array' then
        if jsonb_array_length(qs) = 0 then return jsonb_build_object('ok',false,'error','questions'); end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'q',coalesce(q.v->>'q',''),
          'options',jsonb_build_array(coalesce(q.v->'options'->>0,''),coalesce(q.v->'options'->>1,''),
                                      coalesce(q.v->'options'->>2,''),coalesce(q.v->'options'->>3,'')),
          'answer',case when (q.v->>'answer') ~ '^[0-3]$' then to_jsonb((q.v->>'answer')::int) else 'null'::jsonb end,
          'explanation',coalesce(q.v->>'explanation','')
        ) order by q.n),'[]'::jsonb) into clean
        from jsonb_array_elements(qs) with ordinality as q(v,n);
      end if;

      if sid is null then
        if clean is null then return jsonb_build_object('ok',false,'error','questions'); end if;
        insert into tests(series_id,folder_id,title,duration,correct_marks,wrong_marks,lock_back,free_preview,active,sort_order,data,question_count)
        values (ser,fid,ttl,dur,cm,wm,coalesce((d->>'lock_back')::boolean,false),coalesce((d->>'free_preview')::boolean,false),
                coalesce((d->>'active')::boolean,true),so,clean,jsonb_array_length(clean))
        returning id into sid;
      else
        update tests set series_id = ser, folder_id = fid, title = ttl, duration = dur, correct_marks = cm, wrong_marks = wm,
               lock_back = coalesce((d->>'lock_back')::boolean,false), free_preview = coalesce((d->>'free_preview')::boolean,false),
               active = coalesce((d->>'active')::boolean,true), sort_order = so, updated_at = now(),
               data = coalesce(clean, data), question_count = coalesce(jsonb_array_length(clean), question_count)
         where id = sid;
        if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
      end if;
      return jsonb_build_object('ok',true,'id',sid);

    elsif p_action = 'test_get' then
      return jsonb_build_object('ok',true,'test',(select to_jsonb(x) from tests x where x.id = (d->>'id')::uuid));

    elsif p_action = 'test_delete' then
      delete from tests where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'results' then
      return jsonb_build_object('ok',true,'results',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',rs.id,'student',s.name,'mobile',s.mobile,'test_id',rs.test_id,'title',rs.test_title,
          'score',rs.score,'max',rs.max_score,'correct',rs.correct,'wrong',rs.wrong,'skipped',rs.skipped,
          'used',rs.used_seconds,'at',(extract(epoch from rs.created_at)*1000)::bigint,'late',rs.late
        ) order by rs.created_at desc),'[]'::jsonb)
        from (select r2.* from results r2
               where (nullif(d->>'test_id','') is null or r2.test_id = nullif(d->>'test_id','')::uuid)
               order by r2.created_at desc limit 3000) rs
        join students s on s.id = rs.student_id));

    elsif p_action = 'result_delete' then
      delete from results where id = (d->>'id')::uuid;
      return jsonb_build_object('ok',true);

    elsif p_action = 'set_password' then
      if length(coalesce(d->>'new_pw','')) < 8 then return jsonb_build_object('ok',false,'error','short'); end if;
      perform set_admin_password(d->>'new_pw');
      return jsonb_build_object('ok',true);
    end if;

    return jsonb_build_object('ok',false,'error','unknown_action');
  exception when others then
    return jsonb_build_object('ok',false,'error','bad_request','detail',sqlerrm);
  end;
end $$;

-- ---- let the website call the public functions ------------------------
grant execute on function public.cbt_request_access(text,text)                        to anon, authenticated;
grant execute on function public.cbt_login(text,text,text)                            to anon, authenticated;
grant execute on function public.cbt_catalog(text,text,text)                          to anon, authenticated;
grant execute on function public.cbt_start(text,text,text,uuid)                       to anon, authenticated;
grant execute on function public.cbt_submit(text,text,text,uuid,jsonb,text)           to anon, authenticated;
grant execute on function public.cbt_review(text,text,text,uuid)                      to anon, authenticated;
grant execute on function public.cbt_leaderboard(text,text,text,uuid)                 to anon, authenticated;
grant execute on function public.cbt_admin(text,text,jsonb)                           to anon, authenticated;

-- Nothing else to edit in this file. Now do step 2 from the top of the file
-- (set your admin password in a separate query).
notify pgrst, 'reload schema';
