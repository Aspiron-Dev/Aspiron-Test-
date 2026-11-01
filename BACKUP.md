# Database backup (free, automatic, encrypted)

Every night at 3 AM (India) GitHub copies the whole Supabase database (students, codes, series, tests, results,
orders, payments, team), **locks it with your backup password (AES-256)** and keeps the locked file here in GitHub:
**Actions → Database backup → a run → Artifacts**. Each day's file is kept for 90 days.
Without the backup password the file is useless to anyone. The repository is public, so anyone signed in to GitHub
can download these locked files; that is why the backup password must be long and kept only on paper.
Nothing is committed to the repository. Workflow: `.github/workflows/db-backup.yml`.

## One-time setup (phone is enough, about 10 minutes)
Open github.com in the phone browser, switch on **Desktop site** (browser menu ⋮), open this repository →
**Settings → Secrets and variables → Actions → New repository secret**, and add 2 secrets:

1. **SUPABASE_DB_URL**: Supabase → your project → **Connect** (top) → **Session pooler** → copy the URI and put your
   database password in place of `[YOUR-PASSWORD]`, e.g.
   `postgresql://postgres.xxxx:YOUR-DB-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
   Use *Session pooler*, not *Direct connection* (GitHub cannot reach the direct address).
   Forgot the database password? Supabase → Project Settings → Database → **Reset database password**. The website
   and the admin panel do not use it, so nothing else changes.
2. **BACKUP_PASSWORD**: a new password of 16+ characters only for backups. **Write it on paper and keep it safe.
   If it is lost, the backups can never be opened.** Do not reuse the admin or database password, and never send it to anyone.

Then: **Actions → Database backup → Run workflow**. After 2–3 minutes the run shows a green tick and an artifact
`aspiron-db-<date>.dump.gpg`. If a run fails, GitHub emails you.

Optional, later (needs a computer once): also copy each backup to Google Drive. Add a 3rd secret **RCLONE_CONFIG**:
install rclone (rclone.org/downloads), run `rclone config` → `n` → name **gdrive** → storage **drive** → leave client
id/secret empty → scope **3 (drive.file)** → defaults → log in with Google; then paste the output of
`rclone config show gdrive`. Files then also appear in Drive → `Aspiron-Backups`.

## Check now and then
- Once a month: Actions → Database backup: the latest runs have green ticks.
- If the database password changes, update the SUPABASE_DB_URL secret, or the backup stops (GitHub emails you).

## Restore (if data is lost)
Needs the newest `.dump.gpg` (download it from the run's Artifacts; it comes inside a .zip) and the backup password.
On a computer with PostgreSQL 17 tools and gpg (or ask Claude to do it in a session):
1. `gpg -d -o backup.dump aspiron-db-<date>.dump.gpg` (asks for the backup password)
2. Restore into the Supabase project (an empty or new one):
   `pg_restore --no-owner --clean --if-exists -d "<SUPABASE_DB_URL>" backup.dump`
3. In Supabase SQL Editor run `notify pgrst, 'reload schema';`. The website and admin panel work again as before.
4. Run `supabase_security_check.sql` and check that the anon role still cannot read the private tables.

## Safety notes
- The secrets can only be used by the workflow; GitHub hides them in logs. Only people with admin access to this
  repository can change them: keep that list short and keep two-step sign-in on for the GitHub account.
- If the database password or the backup password ever leaks, change it in Supabase / in the secret.
