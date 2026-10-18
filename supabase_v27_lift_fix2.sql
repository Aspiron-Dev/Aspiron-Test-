-- =====================================================================
--  v27: fix "Could not save (server)" when lifting a suspension (v26 was not enough).
--  In this database a signed-in student's status is 'approved' (not 'active'), and the database refuses
--  any other word. Lifting now gives back the exact status the student had before; suspensions saved
--  before this fix get the status most signed-in students have. Run ONCE in Supabase → SQL Editor →
--  New query → paste → Run.  Safe to run again. The table at the end shows the statuses in use.
-- =====================================================================

-- set a blocked student's status to one word; false if the database does not accept that word
-- (the status column's allowed words differ between setups, e.g. 'approved' instead of 'active')
create or replace function cbt_private.cheat_status(p_id uuid, p_to text)
returns boolean language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
begin
  execute format('update cbt_private.students set status = %L where id = $1 and status::text = %L', p_to, 'blocked') using p_id;
  return true;
exception when others then
  return false;
end; $$;
revoke all on function cbt_private.cheat_status(uuid, text) from public, anon, authenticated;

-- end a suspension: give the student their previous status back (only if it is still our block)
create or replace function cbt_private.cheat_lift(p_id uuid)
returns void language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare s public.cbt_suspensions; v text;
begin
  select * into s from public.cbt_suspensions where student_id = p_id and active for update;
  if not found then return; end if;
  -- a student who was already blocked before the suspension stays blocked
  if s.prev_status <> 'blocked' and not cbt_private.cheat_status(p_id, s.prev_status) then
    -- older suspensions saved 'active': use the status most signed-in students have (e.g. 'approved')
    select status::text into v from cbt_private.students where status::text not in ('pending', 'blocked')
      group by 1 order by count(*) desc limit 1;
    if not ((v is not null and cbt_private.cheat_status(p_id, v))
            or cbt_private.cheat_status(p_id, 'approved') or cbt_private.cheat_status(p_id, 'active')) then
      raise exception 'cheat_lift: the database did not accept any status to unblock this student';
    end if;
  end if;
  update public.cbt_suspensions set active = false, lifted_at = now() where student_id = p_id;
end; $$;
revoke all on function cbt_private.cheat_lift(uuid) from public, anon, authenticated;

-- Student (also while suspended): is my account suspended, why, and until when?
-- The access code is checked first (same lock after 8 wrong tries), so nobody can look up someone else.
create or replace function public.cbt_suspension(p_mobile text, p_code text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_id uuid; s public.cbt_suspensions;
begin
  a := cbt_private.check_code(p_mobile, p_code);
  if coalesce((a->>'ok')::boolean, false) then
    -- not blocked any more (e.g. unblocked from the Students page): close an old suspension quietly
    update public.cbt_suspensions set active = false, lifted_at = now() where student_id = (a->>'id')::uuid and active;
    return jsonb_build_object('ok', true, 'suspended', false);
  end if;
  if a->>'error' <> 'blocked' then return a; end if;            -- wrong code, locked, pending …
  select id into v_id from cbt_private.students where mobile = cbt_private.norm_mobile(p_mobile);
  select * into s from public.cbt_suspensions where student_id = v_id and active;
  if not found then return jsonb_build_object('ok', true, 'suspended', false, 'blocked', true); end if;
  if s.until is not null and s.until <= now() then
    perform cbt_private.cheat_lift(v_id);
    return jsonb_build_object('ok', true, 'suspended', false, 'ended', true);
  end if;
  return jsonb_build_object('ok', true, 'suspended', true, 'reason', s.reason,
    'until', case when s.until is null then null else (extract(epoch from s.until) * 1000)::bigint end,
    'since', (extract(epoch from s.created_at) * 1000)::bigint);
end; $$;
grant execute on function public.cbt_suspension(text, text) to anon, authenticated;

-- Student: which of my tests are marked as cheating (for the tag on my results)
create or replace function public.cbt_my_flags(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'tests', coalesce((select jsonb_agg(test_id) from public.cbt_cheat_flags
    where student_id = (a->>'id')::uuid), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_my_flags(text, text, text) to anon, authenticated;

-- Admin: list / flag / unflag / suspend / lift
create or replace function public.cbt_admin_cheat(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; st cbt_private.students%rowtype; v_h numeric;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  -- end suspensions whose time is over (so the list is always right)
  perform cbt_private.cheat_lift(student_id) from public.cbt_suspensions where active and until is not null and until <= now();

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'flags', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'test_id', f.test_id, 'result_id', f.result_id, 'note', f.note,
                 'at', f.created_at, 'name', s.name, 'mobile', s.mobile) order by f.created_at desc)
               from public.cbt_cheat_flags f left join cbt_private.students s on s.id = f.student_id), '[]'::jsonb),
      'suspended', coalesce((select jsonb_agg(jsonb_build_object('mobile', s.mobile, 'name', s.name, 'reason', x.reason, 'until', x.until,
                 'at', x.created_at) order by x.created_at desc)
               from public.cbt_suspensions x join cbt_private.students s on s.id = x.student_id where x.active), '[]'::jsonb));
  end if;

  select * into st from cbt_private.students where mobile = cbt_private.norm_mobile(p_data->>'mobile');
  if not found then return jsonb_build_object('ok', false, 'error', 'student'); end if;

  if p_action = 'flag' then
    if coalesce(p_data->>'test_id', '') = '' then return jsonb_build_object('ok', false, 'error', 'test'); end if;
    insert into public.cbt_cheat_flags (student_id, test_id, result_id, note)
    values (st.id, left(p_data->>'test_id', 80), left(coalesce(p_data->>'result_id', ''), 80), left(coalesce(p_data->>'note', ''), 300))
    on conflict (student_id, test_id) do update set note = excluded.note, result_id = excluded.result_id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'unflag' then
    delete from public.cbt_cheat_flags where student_id = st.id and test_id = p_data->>'test_id';
    return jsonb_build_object('ok', true);

  elsif p_action = 'suspend' then
    v_h := nullif(p_data->>'hours', '')::numeric;
    if v_h is not null and (v_h <= 0 or v_h > 8760) then return jsonb_build_object('ok', false, 'error', 'hours'); end if;
    insert into public.cbt_suspensions (student_id, reason, until, prev_status, active, created_at, lifted_at)
    values (st.id, left(coalesce(p_data->>'reason', ''), 500), case when v_h is null then null else now() + v_h * interval '1 hour' end,
            st.status::text, true, now(), null)
    on conflict (student_id) do update set reason = excluded.reason, until = excluded.until, created_at = now(), lifted_at = null,
      -- already suspended: keep the status from before the first suspension
      prev_status = case when public.cbt_suspensions.active then public.cbt_suspensions.prev_status else excluded.prev_status end,
      active = true;
    update cbt_private.students set status = 'blocked' where id = st.id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'lift' then
    perform cbt_private.cheat_lift(st.id);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_cheat(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- check: the status words in use and how many students have each
select status::text as status, count(*) as students from cbt_private.students group by 1 order by 2 desc;
