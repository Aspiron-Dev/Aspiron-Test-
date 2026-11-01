# Restore — getting the data back

Backups: every night at 3 AM (India) `db-backup.yml` saves the whole database (`public` + `cbt_private`), locked with
`BACKUP_PASSWORD` (AES-256), as a GitHub Actions artifact kept 90 days (Actions → Database backup → a run → Artifacts).
Restore test: `restore-drill.yml` restores the newest backup into a throw-away database on the 1st of every month and
fails loudly if students, series, tests or the sign-in function are missing. Run it now: Actions → Backup restore drill → Run workflow.

## What you need
- The backup password (on paper). Without it a backup can never be opened.
- A computer with PostgreSQL 17 tools (`pg_restore`, `psql`) and `gpg` — or ask Claude to do it in a session.
- The database address from Supabase → Connect → Session pooler (same as the `SUPABASE_DB_URL` secret).

## A. Everything is gone or broken (restore the whole database)
1. **Stop changes first:** Admin → Store → turn "Buy now" off if orders are coming in; tell the team not to edit.
2. Download the newest good backup: GitHub → Actions → Database backup → the last green run → Artifacts →
   `aspiron-db-<date>.dump.gpg` (it comes inside a .zip; unzip it).
3. Unlock it: `gpg -d -o backup.dump aspiron-db-<date>.dump.gpg` (asks for the backup password).
4. Restore — into the same project (it replaces what is there) or into a new empty Supabase project:
   `pg_restore --no-owner --clean --if-exists -d "<SUPABASE_DB_URL>" backup.dump`
   Errors about Supabase's own objects (`schema "public" already exists`, roles) are normal.
5. Supabase → SQL Editor: `notify pgrst, 'reload schema';`
6. If it is a **new** project: put its URL and publishable key in `config.js`, deploy `send-push` there with its secrets,
   and change the GitHub secret `SUPABASE_DB_URL`.
7. Check: run `supabase_security_check.sql`; open the student app (sign in) and the admin panel; Security Advisor shows 0 errors.
8. Delete `backup.dump` and the unzipped file from the computer.

## B. One thing was deleted by mistake
- **A store order:** it is in the trash (v46). SQL Editor:
  `select at, who, code, data->>'name' name, data->>'amount' amount from cbt_private.order_trash order by at desc;` then
  `insert into public.cbt_store_orders select * from jsonb_populate_record(null::public.cbt_store_orders,
     (select data from cbt_private.order_trash where code = 'ASP-XXXXX' order by id desc limit 1));`
- **Anything else (a test, a series, a student):** restore the newest backup into a *new, empty* Supabase project
  (steps A2–A5, without touching the live one), copy the missing rows across with the SQL Editor, then delete that project.

## C. After any restore
- Students keep their sign-in (tokens are in the backup); if the backup is older than a new access code, that student
  signs in with the code again.
- Admin sessions and two-step sign-in are in the backup too; if in doubt, Team & access → "Sign out everyone else".
- Note in `SECURITY_RUNBOOK.md` → incident log what happened and which backup was used.
