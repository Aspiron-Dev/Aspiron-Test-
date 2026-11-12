-- =====================================================================
-- v72: the owner's profile (name, mobile, e-mail) for the admin panel.
-- Run in Supabase → SQL Editor, then run supabase_v35_admin_team.sql again (it wraps and logs the new function).
--   cbt_admin_profile(p_pw, 'get')                          → {name, mobile, email}
--   cbt_admin_profile(p_pw, 'save', {name, mobile, email})  → saved; written to the activity log
-- OWNER ONLY (team members are refused on the server). Kept in cbt_private.settings: nothing outside can read it.
-- It is only shown inside the admin panel; students and the store never get it.
-- =====================================================================
create or replace function public.cbt_admin_profile(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_name text; v_mobile text; v_email text; v jsonb;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  v := coalesce((select value::jsonb from settings where key = 'owner_profile'), '{}'::jsonb);
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'name', coalesce(v->>'name', ''), 'mobile', coalesce(v->>'mobile', ''), 'email', coalesce(v->>'email', ''));
  elsif p_action = 'save' then
    v_name := left(btrim(regexp_replace(coalesce(d->>'name', ''), '[<>\r\n\t]', '', 'g')), 60);
    v_mobile := right(regexp_replace(coalesce(d->>'mobile', ''), '[^0-9]', '', 'g'), 10);
    v_email := lower(btrim(coalesce(d->>'email', '')));
    if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'name'); end if;
    if v_mobile <> '' and v_mobile !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'mobile'); end if;
    if v_email <> '' and (length(v_email) > 120 or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') then
      return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'email');
    end if;
    v := jsonb_build_object('name', v_name, 'mobile', v_mobile, 'email', v_email);
    insert into settings values ('owner_profile', v::text) on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true, 'name', v_name, 'mobile', v_mobile, 'email', v_email);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_profile(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_profile(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v72 installed — now run supabase_v35_admin_team.sql again' as status;
