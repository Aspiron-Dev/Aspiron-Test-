-- =====================================================================
--  v26: fix "Could not save (server)" when lifting a suspension.
--  The student status column is not plain text in this database, so giving the old status back failed.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again. (v24 already has this fix.)
-- =====================================================================

-- end a suspension: give the student their previous status back (only if it is still our block)
create or replace function cbt_private.cheat_lift(p_id uuid)
returns void language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare s public.cbt_suspensions;
begin
  select * into s from public.cbt_suspensions where student_id = p_id and active for update;
  if not found then return; end if;
  -- written as plain words so it works whatever type the status column has (text or enum);
  -- a student who was already blocked before the suspension stays blocked
  if s.prev_status = 'pending' then
    update cbt_private.students set status = 'pending' where id = p_id and status = 'blocked';
  elsif s.prev_status <> 'blocked' then
    update cbt_private.students set status = 'active' where id = p_id and status = 'blocked';
  end if;
  update public.cbt_suspensions set active = false, lifted_at = now() where student_id = p_id;
end; $$;
revoke all on function cbt_private.cheat_lift(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
