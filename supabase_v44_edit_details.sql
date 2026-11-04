-- =====================================================================
--  v44: Edit everything about a student
--  • Admin: change a student's name, mobile number and email (Students → student → Account → Details).
--    A new mobile number moves everywhere at once: sign-in, store orders, payments, phone notifications,
--    🔔 test alerts, reviews and "Notify me". The student's sign-in keeps working (tokens are per student).
--    Every number change is kept: the admin sees "old number → new number", when and who changed it.
--  • Student: in the app (Profile → Account details) change their name, email and mobile number themselves
--    (mobile: at most 2 changes in 30 days; the new number must not belong to another account).
--  • Access requests: "Reject" now stops that number from asking again (it no longer keeps coming back);
--    "Delete" only removes the request. Admin → Students → Access requests → Rejected numbers → Allow again.
--  • Store orders: the admin can correct an order's amount (e.g. ₹399 → ₹250 that was really paid), with a note.
--    The first amount is kept and shown as "was ₹399".
--  • Store orders: any order (to verify, not paid, approved, rejected) can be deleted for good.
--  Run in Supabase → SQL Editor after v43, then run supabase_v35_admin_team.sql again. Safe to run again.
--  Re-run this file after re-running v34 or v42 (they replace cbt_request_access).
-- =====================================================================

alter table cbt_private.students add column if not exists email text not null default '';

-- every mobile number change (old → new)
create table if not exists cbt_private.mobile_changes (
  id          bigserial primary key,
  student_id  uuid not null,
  old_mobile  text not null,
  new_mobile  text not null,
  by_who      text not null default 'admin',          -- 'admin' | 'student'
  at          timestamptz not null default now()
);
create index if not exists mobile_changes_st on cbt_private.mobile_changes (student_id, at desc);
create index if not exists mobile_changes_old on cbt_private.mobile_changes (old_mobile);
revoke all on cbt_private.mobile_changes from public, anon, authenticated;

-- numbers whose access request was rejected: they cannot ask again until the admin allows them
create table if not exists cbt_private.request_blocks (
  mobile  text primary key,
  name    text not null default '',
  note    text not null default '',
  at      timestamptz not null default now()
);
revoke all on cbt_private.request_blocks from public, anon, authenticated;

-- store orders: a corrected amount keeps the first one
alter table public.cbt_store_orders add column if not exists amount_was int;
alter table public.cbt_store_orders add column if not exists amount_note text not null default '';

-- ---------- move a student to a new mobile number, everywhere ----------
-- returns null when done, else an error word: mobile | not_found | taken
create or replace function cbt_private.move_mobile(p_sid uuid, p_new text, p_by text, p_admin boolean)
returns text language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare v_old text; v_new text := right(regexp_replace(coalesce(p_new, ''), '\D', '', 'g'), 10); o record;
begin
  if v_new !~ '^[6-9][0-9]{9}$' then return 'mobile'; end if;
  select mobile into v_old from cbt_private.students where id = p_sid for update;
  if not found then return 'not_found'; end if;
  if v_old = v_new then return null; end if;
  select id, status into o from cbt_private.students where mobile = v_new;
  if found then
    -- only the admin may replace a waiting access request that used the new number
    if p_admin and o.status = 'pending' then delete from cbt_private.students where id = o.id;
    else return 'taken'; end if;
  end if;

  update cbt_private.students set mobile = v_new where id = p_sid;

  if to_regclass('public.cbt_store_orders') is not null then
    update public.cbt_store_orders set mobile = v_new where mobile = v_old;
  end if;
  if to_regclass('public.cbt_push_subs') is not null then
    update public.cbt_push_subs set mobile = v_new where mobile = v_old;
  end if;
  if to_regclass('public.cbt_test_alerts') is not null then
    delete from public.cbt_test_alerts a where a.mobile = v_new
      and exists (select 1 from public.cbt_test_alerts b where b.mobile = v_old and b.test_id = a.test_id);
    update public.cbt_test_alerts set mobile = v_new where mobile = v_old;
  end if;
  if to_regclass('public.cbt_reviews') is not null then
    update public.cbt_reviews set mobile = v_new where student_id = p_sid or mobile = v_old;
  end if;
  if to_regclass('public.cbt_store_notify') is not null then
    delete from public.cbt_store_notify a where a.mobile = v_new
      and exists (select 1 from public.cbt_store_notify b where b.mobile = v_old and b.item_id = a.item_id);
    update public.cbt_store_notify set mobile = v_new where mobile = v_old;
  end if;
  delete from cbt_private.request_blocks where mobile = v_new;

  insert into cbt_private.mobile_changes (student_id, old_mobile, new_mobile, by_who) values (p_sid, v_old, v_new, p_by);
  return null;
end $$;
revoke all on function cbt_private.move_mobile(uuid, text, text, boolean) from public, anon, authenticated;

create or replace function cbt_private.clean_email(p text) returns text language sql immutable as $$
  select left(lower(btrim(regexp_replace(coalesce(p, ''), '[<>"`\s]', '', 'g'))), 120)
$$;
revoke all on function cbt_private.clean_email(text) from public, anon, authenticated;

-- ---------- admin ----------
--  info        {id}                         → email, number changes, corrected orders of this student
--  student_save {id, name, mobile, email}   → saves; a new mobile moves everywhere
--  req_reject  {id, note}                   → removes a waiting request and stops the number from asking again
--  req_blocked                              → the rejected numbers
--  req_allow   {mobile}                     → the number can ask again
--  order_edit  {code, amount, note}         → corrects a store order's amount
--  order_delete {code}                      → deletes a store order for good (any status); access already given stays
create or replace function public.cbt_admin_edit(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb); s record; v_sid uuid; v_e text; v_nm text; v_em text;
        v_amt int; v_code text; o record; v_old text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'info' then
    v_sid := nullif(d->>'id', '')::uuid;
    select id, mobile, email into s from cbt_private.students where id = v_sid;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'email', s.email,
      'changes', coalesce((select jsonb_agg(jsonb_build_object('old', c.old_mobile, 'new', c.new_mobile, 'by', c.by_who,
                    'at', (extract(epoch from c.at) * 1000)::bigint) order by c.at desc)
                  from cbt_private.mobile_changes c where c.student_id = s.id), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(jsonb_build_object('code', o2.code, 'amount_was', o2.amount_was, 'amount_note', o2.amount_note))
                  from public.cbt_store_orders o2 where o2.mobile = s.mobile and o2.amount_was is not null), '[]'::jsonb));
  end if;

  if p_action = 'student_save' then
    v_sid := nullif(d->>'id', '')::uuid;
    select id, mobile into s from cbt_private.students where id = v_sid;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    v_nm := left(btrim(regexp_replace(regexp_replace(coalesce(d->>'name', ''), '[<>"`]', '', 'g'), '\s+', ' ', 'g')), 60);
    if length(v_nm) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    v_em := cbt_private.clean_email(d->>'email');
    if v_em <> '' and v_em !~ '^[^@]+@[^@]+\.[^@]+$' then return jsonb_build_object('ok', false, 'error', 'email'); end if;
    v_old := s.mobile;
    if coalesce(d->>'mobile', '') <> '' then
      v_e := cbt_private.move_mobile(s.id, d->>'mobile', 'admin', true);
      if v_e is not null then return jsonb_build_object('ok', false, 'error', v_e); end if;
    end if;
    update cbt_private.students set name = v_nm, email = case when d ? 'email' then v_em else email end where id = s.id;
    return jsonb_build_object('ok', true, 'name', v_nm, 'email', (select email from cbt_private.students where id = s.id), 'old_mobile', v_old,
      'mobile', (select mobile from cbt_private.students where id = s.id));
  end if;

  if p_action = 'req_reject' then
    v_sid := nullif(d->>'id', '')::uuid;
    select id, name, mobile, status into s from cbt_private.students where id = v_sid;
    if not found then return jsonb_build_object('ok', true); end if;
    if s.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
    insert into cbt_private.request_blocks (mobile, name, note) values (s.mobile, coalesce(s.name, ''), left(btrim(coalesce(d->>'note', '')), 200))
      on conflict (mobile) do update set name = excluded.name, note = excluded.note, at = now();
    delete from cbt_private.students where id = s.id;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'req_blocked' then
    return jsonb_build_object('ok', true, 'blocked', coalesce((select jsonb_agg(jsonb_build_object('mobile', b.mobile, 'name', b.name, 'note', b.note,
               'at', (extract(epoch from b.at) * 1000)::bigint) order by b.at desc) from cbt_private.request_blocks b), '[]'::jsonb));
  end if;

  if p_action = 'req_allow' then
    delete from cbt_private.request_blocks where mobile = right(regexp_replace(coalesce(d->>'mobile', ''), '\D', '', 'g'), 10);
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'order_edit' then
    v_code := upper(btrim(coalesce(d->>'code', '')));
    v_amt := nullif(regexp_replace(coalesce(d->>'amount', ''), '\D', '', 'g'), '')::int;
    if v_amt is null or v_amt < 0 or v_amt > 1000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
    select * into o from public.cbt_store_orders where code = v_code for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'order'); end if;
    update public.cbt_store_orders
       set amount_was = case when coalesce(amount_was, amount) = v_amt then null else coalesce(amount_was, amount) end,
           amount = v_amt,
           amount_note = left(btrim(regexp_replace(coalesce(d->>'note', ''), '[<>\r\t]', '', 'g')), 200)
     where code = v_code;
    return jsonb_build_object('ok', true, 'amount', v_amt);
  end if;

  if p_action = 'order_delete' then
    v_code := upper(btrim(coalesce(d->>'code', '')));
    delete from public.cbt_store_orders where code = v_code;
    if not found then return jsonb_build_object('ok', false, 'error', 'order'); end if;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_edit(text, text, jsonb) to anon, authenticated;

-- ---------- student: own details ----------
--  get                       → name, mobile, email, changes left this month
--  save   {name, email}
--  mobile {mobile}           → the new number (the phone keeps its sign-in; it must use the new number from now on)
create or replace function public.cbt_me(p_mobile text, p_code text, p_device text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_sid uuid; s record; d jsonb := coalesce(p_data, '{}'::jsonb); v_nm text; v_em text; v_e text; v_n int;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if not coalesce((a->>'ok')::boolean, false) then return a; end if;
  v_sid := (a->>'id')::uuid;
  select id, name, mobile, email into s from cbt_private.students where id = v_sid;
  select count(*) into v_n from cbt_private.mobile_changes where student_id = v_sid and by_who = 'student' and at > now() - interval '30 days';

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'name', s.name, 'mobile', s.mobile, 'email', s.email, 'mobile_left', greatest(0, 2 - v_n));
  end if;

  if p_action = 'save' then
    v_nm := left(btrim(regexp_replace(regexp_replace(coalesce(d->>'name', ''), '[<>"`]', '', 'g'), '\s+', ' ', 'g')), 60);
    if length(v_nm) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
    v_em := cbt_private.clean_email(d->>'email');
    if v_em <> '' and v_em !~ '^[^@]+@[^@]+\.[^@]+$' then return jsonb_build_object('ok', false, 'error', 'email'); end if;
    update cbt_private.students set name = v_nm, email = v_em where id = v_sid;
    return jsonb_build_object('ok', true, 'name', v_nm, 'email', v_em);
  end if;

  if p_action = 'mobile' then
    if v_n >= 2 then return jsonb_build_object('ok', false, 'error', 'mobile_limit'); end if;
    v_e := cbt_private.move_mobile(v_sid, d->>'mobile', 'student', false);
    if v_e is not null then return jsonb_build_object('ok', false, 'error', v_e); end if;
    return jsonb_build_object('ok', true, 'mobile', (select mobile from cbt_private.students where id = v_sid));
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_me(text, text, text, text, jsonb) to anon, authenticated;

-- ---------- a phone still using the old number (the admin changed it): find the new number ----------
-- only with the phone's own sign-in token (st1.…), so nobody learns a new number by guessing the old one
create or replace function public.cbt_moved(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_old text := cbt_private.norm_mobile(p_mobile); s record;
begin
  if coalesce(p_code, '') not like 'st1.%' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if exists (select 1 from cbt_private.students where mobile = v_old) then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  for s in select st.id, st.mobile, st.code_hash, st.status from cbt_private.mobile_changes c join cbt_private.students st on st.id = c.student_id
            where c.old_mobile = v_old order by c.at desc limit 3 loop
    if s.status <> 'blocked' and cbt_private.st_ok(s.id, s.code_hash, p_code, p_device) then
      return jsonb_build_object('ok', true, 'mobile', s.mobile);
    end if;
  end loop;
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;
grant execute on function public.cbt_moved(text, text, text) to anon, authenticated;

-- ---------- access request: a rejected number cannot ask again (same as v42 otherwise) ----------
create or replace function public.cbt_request_access(p_name text, p_mobile text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  m text := cbt_private.norm_mobile(p_mobile);
  n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name,''),'[<>"`]','','g'),'\s+',' ','g')),60);
  s record;
  h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_raw text := btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  v_ip text := case when v_raw = '' then '' else md5('cbt-access|' || v_raw) end;
begin
  if length(n) < 2 then return jsonb_build_object('ok',false,'error','name'); end if;
  if m !~ '^[0-9]{10}$' then return jsonb_build_object('ok',false,'error','mobile'); end if;
  select * into s from students where mobile = m;
  if found then return jsonb_build_object('ok',true,'status',s.status); end if;
  if exists (select 1 from request_blocks where mobile = m) then return jsonb_build_object('ok',false,'error','rejected'); end if;
  if (select count(*) from students where status = 'pending' and created_at > now() - interval '7 days') >= 1000
     or (v_ip <> '' and (select count(*) from access_requests where ip = v_ip and created_at > now() - interval '1 hour') >= 5) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  insert into students(name,mobile,status) values (n,m,'pending');
  insert into access_requests(ip) values (v_ip);
  return jsonb_build_object('ok',true,'status','pending');
end $$;
grant execute on function public.cbt_request_access(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v44 installed: edit name / mobile / email, number history, rejected requests, order amount' as status;
