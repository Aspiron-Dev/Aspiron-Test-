-- =====================================================================
--  v65: Student login with email + password or Google (Supabase Auth)
--  • A student signs in with Supabase Auth (email + password, or Google). The app then asks this database for the
--    usual sign-in token (st1.…, supabase_v42), so every other function works exactly as before.
--  • A login is joined to ONE student account (students.auth_uid):
--      - an existing student joins it once with mobile number + access code (student_link);
--      - a new student sends a request with name + mobile (student_request); after the admin approves,
--        the login alone is enough (no access code to type).
--  • Only a login with a confirmed email counts (Google logins are confirmed by Google).
--  • Status, block, the 2-device limit and sign-out work as with the access code.
--  • The three student_* functions are called with the student's Supabase login, so with the "authenticated" role.
--    They are not named cbt_*: supabase_v35_admin_team.sql keeps every cbt_* function closed to that role, and
--    re-running it must not close these. Nothing else is open to "authenticated".
--  Run in Supabase → SQL Editor after v64. Safe to run again (also after re-running v35).
--  Admin: unjoin a login from a student (e.g. the student lost that Google account):
--    update cbt_private.students set auth_uid = null where mobile = '9876543210';
-- =====================================================================

alter table cbt_private.students add column if not exists auth_uid uuid;
create unique index if not exists students_auth_uid on cbt_private.students (auth_uid) where auth_uid is not null;

-- wrong access codes typed while joining, per login (10 an hour)
create table if not exists cbt_private.auth_link_tries (uid uuid not null, at timestamptz not null default now());
create index if not exists auth_link_tries_uid on cbt_private.auth_link_tries (uid, at desc);
alter table cbt_private.auth_link_tries enable row level security;
revoke all on cbt_private.auth_link_tries from public, anon, authenticated;

-- the Supabase login of this request: only a confirmed, not banned, not deleted user
create or replace function cbt_private.auth_user() returns uuid
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select u.id from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null
     and (u.banned_until is null or u.banned_until < now()) and u.deleted_at is null
$$;
revoke all on function cbt_private.auth_user() from public, anon, authenticated;

-- a new sign-in token for this student and phone, after the usual checks (status, block, device limit)
create or replace function cbt_private.auth_issue(p_sid uuid, p_device text) returns jsonb
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_tok text; a jsonb; s students%rowtype; v_salt text;
begin
  if p_device is null or length(p_device) < 8 then return jsonb_build_object('ok', false, 'error', 'device'); end if;
  select * into s from students where id = p_sid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  if s.status in ('pending', 'blocked') then return jsonb_build_object('ok', false, 'error', s.status); end if;
  -- approved without an access code (joined by a login request): a random code nobody knows, so a token can be made;
  -- a code the admin gives later replaces it (the phone then signs in again with the login)
  if s.code_hash is null then
    v_salt := 'b1$' || left(translate(encode(adm_rand(18), 'base64'), '+=/', '..x'), 22);
    update students set salt = v_salt, code_hash = hash_code(v_salt, encode(adm_rand(24), 'hex'))
     where id = p_sid and code_hash is null;
  end if;
  v_tok := st_new(p_sid, p_device);
  a := public.cbt_login(s.mobile, v_tok, p_device);
  if not coalesce((a->>'ok')::boolean, false) then
    delete from student_tokens where id = split_part(v_tok, '.', 2)::uuid;
    return a;
  end if;
  return a || jsonb_build_object('token', v_tok);
end $$;
revoke all on function cbt_private.auth_issue(uuid, text) from public, anon, authenticated;

-- signed in with Supabase: the joined student gets a token; not joined yet → 'not_linked'
create or replace function public.student_signin(p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_uid uuid := auth_user(); v_sid uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select id into v_sid from students where auth_uid = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  return auth_issue(v_sid, p_device);
end $$;
revoke all on function public.student_signin(text) from public, anon;
grant execute on function public.student_signin(text) to authenticated;

-- join this login to an existing student: mobile number + the access code (once)
create or replace function public.student_link(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_uid uuid := auth_user(); v_sid uuid; c jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select id into v_sid from students where auth_uid = v_uid;
  if found then return auth_issue(v_sid, p_device); end if;
  if (select count(*) from auth_link_tries where uid = v_uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  -- only the real access code, never a sign-in token
  if coalesce(p_code, '') like 'st1.%' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  c := check_code(p_mobile, p_code);
  if not coalesce((c->>'ok')::boolean, false) then
    insert into auth_link_tries (uid) values (v_uid);
    delete from auth_link_tries where at < now() - interval '2 hours';
    return c;
  end if;
  update students set auth_uid = v_uid where id = (c->>'id')::uuid and auth_uid is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  return auth_issue((c->>'id')::uuid, p_device);
end $$;
revoke all on function public.student_link(text, text, text) from public, anon;
grant execute on function public.student_link(text, text, text) to authenticated;

-- new student: request access with this login. The answer is the same whether or not the number is new
-- (it never tells whether a number has an account); a number that is already taken is not joined.
create or replace function public.student_request(p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_uid uuid := auth_user(); v_m text := norm_mobile(p_mobile); v_new boolean; r jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  if exists (select 1 from students where auth_uid = v_uid) then return jsonb_build_object('ok', true, 'status', 'pending'); end if;
  v_new := not exists (select 1 from students where mobile = v_m);
  r := public.cbt_request_access(p_name, p_mobile);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  if v_new then
    update students set auth_uid = v_uid where mobile = v_m and status = 'pending' and auth_uid is null;
  end if;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;
revoke all on function public.student_request(text, text) from public, anon;
grant execute on function public.student_request(text, text) to authenticated;
