-- =====================================================================
--  v38: Store cleanup — removes the "Let's study" function from v37 (supabase_v37_store_study.sql). That feature was
--  dropped before it went live: after verification the admin sends the student the main website link by hand.
--  An unused public function is only one more thing to keep safe, so it goes.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again, and safe if v37 was never run.
-- =====================================================================

drop function if exists public.cbt_store_mine(text, text[]);
-- (never released either: purchases by mobile number and its look-up log)
drop function if exists public.cbt_store_purchases(text);
drop table if exists public.cbt_store_mine_log;

notify pgrst, 'reload schema';
select 'v38 installed: store cleanup (Let''s study removed)' as status;
