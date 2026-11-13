-- =====================================================================
--  v74: Email / Google login — the access code once, also after a request (security review A2)
--  A login that asked for access with a mobile number (student_request) never proved it owns that number. After the
--  admin approves, the student now types the access code ONCE (the admin sends it to that number on WhatsApp, as
--  always); from then on the login alone is enough. Logins joined with the code (student_link) are not affected.
--  Logins that joined by a request before this file also type the code once.
--  Run after v73. Safe to run again.
-- =====================================================================
alter table cbt_private.students add column if not exists auth_ok boolean;   -- true = this login proved the number (access code)
-- logins joined before v74: those that came with the code were joined by student_link; a request left auth_ok empty
-- (both look the same here, so every existing login types the code once — the safe side)

create or replace function public.student_signin(p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_uid uuid := auth_user(); v_sid uuid; v_ok boolean; v_st text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select id, auth_ok, status into v_sid, v_ok, v_st from students where auth_uid = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  -- v74: a login that joined by a request has not shown it owns the number yet: the access code once
  if v_ok is not true then
    if v_st = 'pending' then return jsonb_build_object('ok', false, 'error', 'pending'); end if;
    return jsonb_build_object('ok', false, 'error', 'need_code');
  end if;
  return auth_issue(v_sid, p_device);
end $$;
revoke all on function public.student_signin(text) from public, anon;
grant execute on function public.student_signin(text) to authenticated;

create or replace function public.student_link(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_uid uuid := auth_user(); v_sid uuid; c jsonb; v_ok boolean; v_m text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select id, auth_ok, mobile into v_sid, v_ok, v_m from students where auth_uid = v_uid;
  if found and v_ok is true then return auth_issue(v_sid, p_device); end if;
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
  -- v74: joined by a request: the code must be the code of THAT student (proves the number); then it is done
  if v_sid is not null then
    if (c->>'id')::uuid is distinct from v_sid then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
    update students set auth_ok = true where id = v_sid;
    return auth_issue(v_sid, p_device);
  end if;
  update students set auth_uid = v_uid, auth_ok = true where id = (c->>'id')::uuid and auth_uid is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  return auth_issue((c->>'id')::uuid, p_device);
end $$;
revoke all on function public.student_link(text, text, text) from public, anon;
grant execute on function public.student_link(text, text, text) to authenticated;

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
    update students set auth_uid = v_uid, auth_ok = false where mobile = v_m and status = 'pending' and auth_uid is null;   -- v74: code once after approval
  end if;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;
revoke all on function public.student_request(text, text) from public, anon;
grant execute on function public.student_request(text, text) to authenticated;

notify pgrst, 'reload schema';
select 'v74 installed' as status;
