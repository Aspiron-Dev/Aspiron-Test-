-- =====================================================================
--  v45: SECURITY_MAP checklist C + D fixes
--  - Access request form gives the same answer for every number (no "already approved / rejected"), so it cannot
--    be used to find out who studies here.
--  - A student changing their own mobile number cannot take a number that has someone else's store order,
--    "Notify me", rejected request or (90 days) another student's previous number.
--  - Phone notifications are only saved for the real push services (Google, Mozilla, Apple, Microsoft), so the
--    server never sends requests to other addresses. Test alerts and notifications keep the 10-digit number.
--  Run after v44, then run supabase_v35_admin_team.sql again. Safe to run again.
--  Re-run this file after re-running v10, v12, v36, v42 or v44.
-- =====================================================================

create or replace function public.cbt_push_save(p_mobile text, p_code text, p_device text, p_sub jsonb default null, p_on boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a jsonb; v_ep text;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_ep := left(coalesce(p_sub->>'endpoint', ''), 1000);
  -- v45: only the real push services (Google, Mozilla, Apple, Microsoft): the server never posts to any other address
  if v_ep !~ '^https://' or (p_on and v_ep !~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/') then return jsonb_build_object('ok', false, 'error', 'sub'); end if;
  if not p_on then
    delete from public.cbt_push_subs where endpoint = v_ep;
    return jsonb_build_object('ok', true);
  end if;
  if coalesce(p_sub#>>'{keys,p256dh}', '') = '' or coalesce(p_sub#>>'{keys,auth}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  insert into public.cbt_push_subs (endpoint, mobile, p256dh, auth)
  values (v_ep, right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10), left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100))
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.cbt_push_save(text, text, text, jsonb, boolean) to anon, authenticated;

create or replace function public.cbt_push_rotate(p_old text, p_sub jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text := left(coalesce(p_old, ''), 1000); v_ep text := left(coalesce(p_sub->>'endpoint', ''), 1000); m text;
begin
  if v_old !~ '^https://' or v_ep !~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or coalesce(p_sub#>>'{keys,p256dh}', '') = '' or coalesce(p_sub#>>'{keys,auth}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  select mobile into m from public.cbt_push_subs where endpoint = v_old;
  if m is null then return jsonb_build_object('ok', false, 'error', 'unknown'); end if;
  insert into public.cbt_push_subs (endpoint, mobile, p256dh, auth)
  values (v_ep, m, left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100))
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now();
  if v_old <> v_ep then delete from public.cbt_push_subs where endpoint = v_old; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cbt_push_rotate(text, jsonb) to anon, authenticated;

create or replace function public.cbt_alert_set(p_mobile text, p_code text, p_device text, p_test text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; t jsonb; v_at timestamptz; v_raw text; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  if not p_on then
    delete from public.cbt_test_alerts where mobile = v_m and test_id = p_test;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  select x.value into t from jsonb_array_elements(coalesce(c->'tests', '[]'::jsonb)) as x where x.value->>'id' = p_test limit 1;
  if t is null then return jsonb_build_object('ok', false, 'error', 'test'); end if;
  v_raw := t->>'opens_at';
  if coalesce(v_raw, '') = '' then return jsonb_build_object('ok', false, 'error', 'not_scheduled'); end if;
  v_at := case when v_raw ~ '^[0-9.]+$' then to_timestamp(v_raw::numeric / 1000) else v_raw::timestamptz end;
  if v_at <= now() then return jsonb_build_object('ok', false, 'error', 'already_live'); end if;
  insert into public.cbt_test_alerts (mobile, test_id, title, opens_at)
  values (v_m, p_test, left(coalesce(t->>'title', 'Your test'), 120), v_at)
  on conflict (mobile, test_id) do update set title = excluded.title, opens_at = excluded.opens_at, sent_at = null;
  return jsonb_build_object('ok', true, 'on', true, 'opens_at', (extract(epoch from v_at) * 1000)::bigint);
end; $$;
grant execute on function public.cbt_alert_set(text, text, text, text, boolean) to anon, authenticated;
-- numbers saved before in another format (+91…, spaces) → 10 digits
update public.cbt_test_alerts a set mobile = right(regexp_replace(a.mobile, '\D', '', 'g'), 10)
 where a.mobile !~ '^[0-9]{10}$' and not exists (select 1 from public.cbt_test_alerts b
       where b.mobile = right(regexp_replace(a.mobile, '\D', '', 'g'), 10) and b.test_id = a.test_id);
update public.cbt_push_subs set mobile = right(regexp_replace(mobile, '\D', '', 'g'), 10) where mobile !~ '^[0-9]{10}$';

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

  -- v45: a student (not the admin) cannot take a number that belongs to someone else's store order, waiting list,
  -- rejected request or (in the last 90 days) another student's previous number: that would move their purchase
  if not p_admin and (
       (to_regclass('public.cbt_store_orders') is not null and exists (select 1 from public.cbt_store_orders where mobile = v_new))
    or (to_regclass('public.cbt_store_notify') is not null and exists (select 1 from public.cbt_store_notify where mobile = v_new))
    or exists (select 1 from cbt_private.request_blocks where mobile = v_new)
    or exists (select 1 from cbt_private.mobile_changes where old_mobile = v_new and student_id <> p_sid and at > now() - interval '90 days')) then
    return 'taken';
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
  -- v45: the same answer whether or not the number already has an account (or was rejected), so nobody can use
  -- this form to find out who studies here
  if found or exists (select 1 from request_blocks where mobile = m) then return jsonb_build_object('ok',true,'status','received'); end if;
  if (select count(*) from students where status = 'pending' and created_at > now() - interval '7 days') >= 1000
     or (v_ip <> '' and (select count(*) from access_requests where ip = v_ip and created_at > now() - interval '1 hour') >= 5) then
    return jsonb_build_object('ok',false,'error','busy');
  end if;
  insert into students(name,mobile,status) values (n,m,'pending');
  insert into access_requests(ip) values (v_ip);
  return jsonb_build_object('ok',true,'status','received');
end $$;
grant execute on function public.cbt_request_access(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'v45 installed: same answer on access requests, safe number change, push services only' as status;
