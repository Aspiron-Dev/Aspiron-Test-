# Database backup (free, automatic, encrypted)

Every night at 3 AM (India) GitHub copies the whole Supabase database, **locks it with your backup password
(AES-256)** and puts it in your Google Drive folder `Aspiron-Backups`. The last 90 days are kept.
Without the backup password the files are useless to anyone, even if they open your Drive.
Nothing is stored in this repository. Workflow: `.github/workflows/db-backup.yml`.

## One-time setup (about 15 minutes, needs a laptop/computer once)
Add 3 secrets in GitHub → this repository → **Settings → Secrets and variables → Actions → New repository secret**:

1. **SUPABASE_DB_URL** — Supabase → Project → **Connect** → *Session pooler* → copy the URI and put your
   database password in it, e.g. `postgresql://postgres.xxxx:YOUR-DB-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
   (Use *Session pooler*, not *Direct connection*: GitHub cannot reach the direct address.)
2. **BACKUP_PASSWORD** — a new long password (16+ characters) only for backups. **Write it on paper and keep it safe.
   If it is lost, the backups can never be opened.** Do not reuse the admin or database password.
3. **RCLONE_CONFIG** — on a computer: install rclone (rclone.org/downloads), run `rclone config` →
   `n` (new) → name **gdrive** → storage **drive** → leave client id/secret empty → scope **3 (drive.file)** →
   accept the defaults → log in with your Google account in the browser. Then run `rclone config show gdrive`
   and paste the whole output (it starts with `[gdrive]`) as the secret.

Then: GitHub → **Actions → Database backup → Run workflow**. In a few minutes a file `aspiron-db-<date>.dump.gpg`
appears in Google Drive → `Aspiron-Backups`. If a run fails, GitHub emails you.

## Restore (if data is lost)
1. Download the newest `.dump.gpg` from Drive.
2. On a computer with PostgreSQL 17 tools and gpg:
   `gpg -d -o backup.dump aspiron-db-<date>.dump.gpg` (asks for the backup password)
3. Restore into the Supabase project (an empty or new one):
   `pg_restore --no-owner --no-privileges --clean --if-exists -d "<SUPABASE_DB_URL>" backup.dump`
4. In Supabase SQL Editor run `notify pgrst, 'reload schema';`. The website and admin panel work again as before.

## Safety notes
- The 3 secrets can only be used by the workflow; GitHub hides them in logs. Only people with admin access to this
  repository can change them — keep that list short.
- The Google login gives rclone access only to files it creates (drive.file), not your whole Drive.
- If the database password or backup password ever leaks, change it in Supabase / in the secret.
