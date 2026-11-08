# Security runbook — what to do if something goes wrong

Keep calm, act in this order, write down what you did and when (incident log at the bottom). Backups: `RESTORE.md`.
Map of everything: `SECURITY_MAP.md`.

## 0. Signs that something is wrong
- GitHub e-mail **"Security alerts" failed**, or the red bell: Admin → Team & access → **Security alerts** (what, who, when).
- Admin → Team & access → **Activity log**: changes you did not make, many "Refused", sign-ins from unknown devices/IPs.
- Team & access → **Where signed in**: a device you do not know.
- Many students saying "signed out" / "locked", sudden wrong-code locks, odd orders or payments.
- GitHub e-mails: "Run failed" (backup, security checks), secret-scanning alerts. Supabase e-mails about usage.

## 1. Admin panel account stolen (password / session / phone)
1. From a safe device: sign in → Team & access → **Sign out everyone else**.
2. Team & access → Password: change the owner password (signs out the owner's other sessions).
   Locked out? Supabase → SQL Editor: `select cbt_private.set_admin_password('NEW-long-password');` (signs the owner out everywhere).
3. Lost phone: sign in with a recovery code; Settings → Two-step sign-in → turn it off and on again (new QR, new codes).
   No codes either: SQL Editor `delete from cbt_private.admin_totp where acct = 'owner';`, then set it up again at once.
4. A team member: Team & access → member → **Pause account** / Sign out all their devices / Set a new password.
5. Check the Activity log for what was changed (orders approved, series given, students deleted, notices sent) and
   undo it. Deleted orders are in `cbt_private.order_trash` (`RESTORE.md` B).

## 1b. Someone keeps trying to sign in to the admin panel
Admin → Team & access → Security alerts → *Risky sign-ins*: tap an alert for the address; **Block** it. Keep *Team sign-in*
off (Members) when nobody uses it. Sign-ins without the admin key are refused by the database before any password check,
and 15 wrong passwords in 24 hours block an address for 7 days by themselves. Locked out yourself:
SQL Editor `delete from cbt_private.admin_ip_blocks;` (blocks) or `delete from cbt_private.settings where key = 'admin_gate';` (key check).

## 2. A student's code is being shared / misused
Admin → Students → the student → new access code (all their phones are signed out at once) → Reset devices if needed.

## 3. A key or password leaked (chat, screenshot, GitHub)
| What leaked | Do this |
|---|---|
| Supabase **secret / service_role** key | Supabase → Settings → API Keys → create a new secret key, then revoke the old one. The Edge Function gets its key from Supabase automatically; check `send-push` still works (test notification). |
| **Database password** | Supabase → Database → Settings → Reset database password → update the GitHub secret `SUPABASE_DB_URL` → run Actions → Database backup. |
| **BACKUP_PASSWORD** | New long password in the GitHub secret (and on paper). Old backups stay locked with the old one — keep it on paper until they expire (90 days). |
| **VAPID_PRIVATE** | Only if really leaked: new key pair (see `supabase/functions/send-push`), public key in `config.js`; students' phones re-subscribe on next open. |
| **GitHub account / token** | GitHub → Settings → Password + Sessions (sign out others), revoke tokens, check repository → Settings → Collaborators and Deploy keys, check recent commits. |
| Publishable key | It is public by design; nothing to do. |
After any rotation: call once with the old key/password and confirm it is refused.

## 4. Data may have left (database breach)
1. Find the start: Supabase → Logs; Admin Activity log; GitHub security alerts.
2. Close the door first (sections 1 and 3), then keep a copy: Actions → Database backup → Run workflow.
3. **Tell the people affected and the Data Protection Board of India** as the DPDP Act 2023 and its Rules require for a
   personal-data breach (what happened, what data, what you did, whom to contact). Get legal advice on the deadline and wording.
4. Give affected students new access codes; ask the team to change their passwords.

## 5. Website or database broken / defaced
- Code: GitHub → the last good commit → revert the bad pull request (or restore the file) → GitHub Pages republishes.
- Database: `RESTORE.md` A. Store: turn "Buy now" off while fixing.

## 6. Too much traffic / attack (spam requests, store orders, login floods)
The built-in limits answer "busy" / "locked" by themselves. Check Supabase → Reports for errors; if it continues,
Supabase → Database → Network restrictions is **not** the tool (it would stop GitHub backups) — contact Supabase support.

## 7. Turning off the legacy Supabase keys (R7) — once, when you have 10 minutes
1. Supabase → Settings → **API Keys** → Secret keys: copy a secret key (`sb_secret_…`; create one if there is none).
2. Edge Functions → **Secrets** → add `SB_SECRET_KEY` = that key. Edge Functions → send-push → deploy the newest
   `supabase/functions/send-push/index.ts` (from GitHub).
3. Admin → Messaging → send yourself a test notification. It must arrive.
4. Settings → API Keys → **Legacy API keys** → Disable. Send a test notification again, open the app once (sign in,
   start a practice test). If anything fails: enable the legacy keys again (same page) and tell the developer.
5. The website and the "test is live" alerts use the publishable key (`sb_publishable_…`), so they are not affected.
A leaked secret key later: create a new one, put it in `SB_SECRET_KEY`, redeploy, then delete the old key.

## Contacts and accounts (fill in, keep offline)
Supabase owner e-mail · GitHub owner · domain registrar (when bought) · who in the team can act.

## Incident log
| Date | What happened | What was done | By |
|---|---|---|---|
| | | | |
