-- =====================================================================
-- v73: students' phone numbers and e-mails are hidden by default in the admin panel.
-- Run in Supabase → SQL Editor, then run supabase_v35_admin_team.sql again (the cutting itself is done there,
-- in the wrapper around every admin function).
--
-- 1. New team permission "contacts" (Team & access → a member → Contact details).
--    Without it the DATABASE cuts every phone number (98•••••210) and e-mail (ab•••@gmail.com) before the answer
--    leaves it, in every admin function at once. The owner always gets the full values.
-- 2. With it (and for the owner) the panel still shows them cut until "Show phone numbers" is pressed;
--    cbt_admin_contacts 'reveal' writes that press to the activity log (who, when, for which student if one is open).
-- 3. One time only: members who work with students or orders today (Students = Full or Store = Full) get the new
--    permission, so nobody's daily work stops. Everyone else starts without it; change it in Team & access.
-- =====================================================================
create or replace function public.cbt_admin_contacts(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action <> 'reveal' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  -- a member without the permission is refused (and that try is in the activity log too)
  if coalesce(current_setting('cbt.contacts', true), '') = '0' then
    perform set_config('cbt.denied', '1', true);
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cbt_admin_contacts(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_contacts(text, text, jsonb) to anon;

do $$ begin
  if not exists (select 1 from cbt_private.settings where key = 'contacts_perm_seeded') then
    update cbt_private.admin_users set perms = perms || '{"contacts": "view"}'::jsonb
     where (perms->>'students' = 'manage' or perms->>'store' = 'manage') and not (perms ? 'contacts');
    insert into cbt_private.settings values ('contacts_perm_seeded', '1') on conflict (key) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
select 'v73 installed — now run supabase_v35_admin_team.sql again' as status;
