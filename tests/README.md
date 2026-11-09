# Security tests

Everything here runs against a **throw-away** PostgreSQL, never the real Supabase database. No secret is needed.

- `db/build.sh` builds the test database: Supabase stand-ins (`00`), mock tables (`01`), the exported base functions (`02`),
  every `supabase_v*.sql` in README order, then fake data (`seed.sql`). Add new SQL files to its `ORDER` list.
- `db/break_it.sql`: an attacker's attempts (signed out, student A vs B, tampered score, expired timer, live end time,
  hidden answers, rate limits, XSS payloads, direct table access, store/promo abuse, tokens, admin permissions, 2FA,
  database hardening). Every check must PASS. **Never weaken or delete a check to make it pass.**
- `db/open_findings.sql`: open findings from `SECURITY_REVIEW.md`, written as the safe behaviour (they show OPEN until fixed).
- `e2e/v3_xss.js`: the new student design (v3.js) with a script payload in every name, title, notice, banner, question and file; it must never run (phone and computer size). Run it by hand like the others (not in CI, to keep Actions minutes low).
- `e2e/student.js`, `e2e/admin.js`: the real pages in Chromium, every Supabase call answered by the test database.

Run locally (PostgreSQL 16 + Node 20):
```
export PGHOST=localhost PGUSER=postgres PGPASSWORD=… ; createdb breakit
PGDATABASE=breakit bash tests/db/build.sh && PGDATABASE=breakit psql -v ON_ERROR_STOP=1 -f tests/db/break_it.sql
createdb e2e && PGDATABASE=e2e bash tests/db/build.sh
(cd tests/e2e && npm ci && npx playwright install chromium) && PGDATABASE=e2e node tests/e2e/student.js && PGDATABASE=e2e node tests/e2e/admin.js
```
CI: `.github/workflows/tests.yml` on every push and pull request.
