-- =====================================================================
-- v73: students' phone numbers and e-mails are protected in the database.
-- Run supabase_v35_admin_team.sql FIRST (the cutting itself is there, in the wrapper around every admin function),
-- then this file once.
--
-- New team permission "contacts" (Team & access → a member → Contact details). An account without it gets every
-- phone number as 98•••••210 and every e-mail as ab•••@gmail.com from the DATABASE, in every admin function at once:
-- if such an account is ever stolen, the thief cannot read or export the students' contact details.
-- The owner, and every member with the permission, see everything in the panel exactly as before.
--
-- This file: one time only, every team member that exists today gets the permission, so nothing changes for the
-- team until the owner takes it away from an account that does not need it. New members get it from their preset.
-- =====================================================================
do $$ begin
  if to_regprocedure('cbt_private.mask_contacts(jsonb)') is null then
    raise exception 'Run supabase_v35_admin_team.sql first, then this file';
  end if;
  if not exists (select 1 from cbt_private.settings where key = 'contacts_perm_seeded') then
    update cbt_private.admin_users set perms = perms || '{"contacts": "view"}'::jsonb where not (perms ? 'contacts');
    insert into cbt_private.settings values ('contacts_perm_seeded', '1') on conflict (key) do nothing;
  end if;
end $$;

select 'v73 installed: contact details are cut for accounts without the Contact details permission' as status;
