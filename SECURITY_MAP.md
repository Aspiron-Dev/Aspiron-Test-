# Security map — Aspiron CBT

Snapshot of `main` (2026-11-01, after v42, v43 and v35.3). Documentation only: nothing here changes how the app works.
Legend: **[T]** = a test was run on a local copy of the database (production base export + every repo SQL file, fake data only) or in Chromium · **[C]** = code read only · **[P]** = needs a look at production (no access from here).

---

## 1. How it fits together
- **Website:** static files on GitHub Pages (no server code). No custom domain yet.
- **Backend:** Supabase Postgres. The browser calls **RPC functions** only, through PostgREST with the public *publishable* key. No table is readable or writable directly by the browser.
- **Private data** lives in schema `cbt_private`, which is not exposed to the API. The public `cbt_*` tables have RLS on and no policies, so nobody can read or write them directly.
- **Auth:** Supabase Auth is **not used**.
  - Students: mobile + 8-character access code, then a sign-in token `st1.…` (v42).
  - Admin: owner password + TOTP 2FA → session `as1.…`; team members get username + password (+ optional 2FA) → session.
- **One Edge Function** (`send-push`, uses the service role) and **two pg_cron jobs** (`cbt-test-alerts` every minute, `cbt-autosubmit` every 5 minutes).
- **Backup:** GitHub Actions `db-backup.yml`, daily, AES-256 encrypted, kept as a 90-day artifact.

## 2. Pages and routes
| Page | Who | Gate | Routes |
|---|---|---|---|
| `index.html` (student app) | Approved students | Mobile + code → token in `localStorage.cbt_auth`; every RPC re-checks it on the server | `#/` home, `#/series`, `#/s/<series>`, `#/f/<folder>`, `#/t/<test>` (test), `#/r` results, `#/m` mistakes, `#/b` bookmarks, `#/n` notices, `#/pyq/…`, `#/h/…`, `#/help` |
| `store.html` | Anyone | None (public catalogue, orders) | `?ref=<promo>`, `#x=<item>` |
| `cp-dt764twzf54s5m.html` (admin console, `cx/`) | Owner, team | Page gate: `#k=<access key>` (SHA-256 in page, obscurity only) → sign-in (password + 2FA) → session `as1.…`; permissions checked in the DB per call | `#/home`, `#/students` (all, requests), `#/payments`, `#/tests` (library, all), `#/results` (all, insights), `#/live`, `#/reports`, `#/integrity`, `#/pyq`, `#/orders`, `#/store` (items, layout, explore, soon, settings), `#/promos`, `#/messages` (notices, banners, push), `#/reviews`, `#/team` (members, sessions, activity, security), `#/settings` |
| `cp-dt764twzf54s5m-old.html` (old admin panel, backup) | Owner | Same page gate; signs in through `cbt_admin_login` (password + code) | Tabs inside the page |
| `admin.html` | Anyone | Decoy "404" | – |
| `sw.js` | – | Caches same-origin files only; Supabase answers are never cached | – |

## 3. API surface (RPC functions callable with the publishable key)
| Group | Functions | Check inside |
|---|---|---|
| **No login** | `cbt_store`, `cbt_store_explore`, `cbt_store_demo`, `cbt_store_schedule(s)`, `cbt_store_reviews`, `cbt_store_langs`, `cbt_banners`, `cbt_store_order(_lang)`, `cbt_store_paid`, `cbt_store_notify`, `cbt_promo_click`, `cbt_promo_attach`, `cbt_request_access`, `cbt_push_rotate`, `cbt_admin_login`, `cbt_logout`, `cbt_moved` (token only: a phone whose number the admin changed finds its new number) | Per-IP / per-mobile limits; order code + mobile for order changes; 20 wrong codes/h per connection |
| **Student** (mobile + code/token + device) | `cbt_login`, `cbt_catalog`, `cbt_start`, `cbt_save`, `cbt_submit`, `cbt_review`, `cbt_mistakes`, `cbt_bookmark(s)`, `cbt_report`, `cbt_leaderboard`, `cbt_overall`, `cbt_insights`, `cbt_file_part`, `cbt_cover`, `cbt_notice(_img)`, `cbt_ann_read`, `cbt_lang`, `cbt_pyq_summary`, `cbt_pyq_chapter`, `cbt_alert_list/set`, `cbt_push_save/has`, `cbt_devices`, `cbt_me` (own name / email / mobile; mobile 2× per 30 days), `cbt_device_swap/ping`, `cbt_suspension`, `cbt_my_flags`, `cbt_review_save/mine/delete` | `cbt_private.auth` (8 wrong codes → 15 min lock, device limit, token check) |
| **Admin** (session or owner password) | `cbt_admin`, `cbt_admin2`, `cbt_admin3`, `cbt_admin_*` (store, orders, payments, promos, banners, ann, pyq, reviews, cheat, team, 2fa, me, …) | `cbt_private.admin_ok` → session + per-module permission (`admin_need`); every change written to `admin_audit` |
| **Server only** | `cbt_push_targets` (service role, from `send-push`), `cbt_private.autosubmit` (cron) | Not granted to anon |

## 4. Tables
All `public` tables: **RLS on, no policies, no grants to anon/authenticated** **[T]**. `cbt_private`: no schema USAGE for anon/authenticated **[T]**. Columns marked ⚠ are sensitive.

| Schema.table | Holds | ⚠ Sensitive columns | Written by |
|---|---|---|---|
| cbt_private.students | Student accounts | ⚠ mobile, salt, code_hash, devices | admin, `auth` (devices, locks) |
| cbt_private.student_tokens | Sign-in tokens | ⚠ token_hash, code_hash, device | `cbt_login`, `cbt_logout` |
| cbt_private.series, folders, tests, test_hi, series_lang, series_files, file_parts, test_stage | Content (questions **with answer keys**, PDFs) | ⚠ tests.data / test_hi.data (answers) | admin |
| cbt_private.series_access | Who has which series | – | admin, order approval |
| cbt_private.sessions, results, bookmarks, mistake_done, reports, overall_rank, rank_built | Attempts and scores | – | `cbt_start/save/submit`, cron |
| cbt_private.announcements, ann_audience, ann_reads, approve_msgs, student_lang | Notices, settings per student | – | admin, student |
| cbt_private.settings | Admin password hash, locks, misc | ⚠ admin_hash, admin_salt | admin |
| cbt_private.admin_users, admin_sessions, admin_totp, admin_audit, admin_fails, admin_fail_log(_team), admin_known, access_requests | Admin team, sessions, 2FA, logs, locks | ⚠ pw_hash, token_hash, TOTP secret, recovery hashes, IP hashes | admin sign-in |
| public.cbt_store_items, settings, covers, demos, files, audit | Store catalogue | – | admin |
| public.cbt_store_orders | Orders | ⚠ mobile, payer, utr, ip hash | store page, admin |
| public.cbt_store_notify, cbt_store_tries | Waiting lists, wrong-code counter | ⚠ mobile, ip hash | store page |
| public.cbt_payments | Payments added by admin | – | admin |
| cbt_private.mobile_changes | Every mobile number change (old → new, by admin / student) | – | admin (info) |
| cbt_private.request_blocks | Rejected access-request numbers (cannot ask again) | – | admin |
| public.cbt_promo_links, payouts, clicks | Promotion links | ip hash | admin, store page |
| public.cbt_reviews, cbt_review_settings | Reviews | ⚠ mobile, photo | student, admin |
| public.cbt_push_subs, cbt_test_alerts | Phone notifications | ⚠ mobile, push endpoint | student, cron |
| public.cbt_device_info, cbt_device_swaps | Device list | device id | student |
| public.cbt_banners, cbt_pyq, cbt_cheat_flags, cbt_suspensions | Banners, PYQ bank, integrity | – | admin |

**Views:** none in the repo's SQL **[T]** (production: [P]).

## 5. Storage buckets
None. The code never uses Supabase Storage **[C]** (no `storage/v1` call). PDFs, covers, demos and photos are stored in database tables, served only through the RPCs above. Production buckets: **[P]** (`select id, public from storage.buckets;`).

## 6. Keys and secrets
| Key / secret | Where it lives | Public? |
|---|---|---|
| Supabase publishable key | `config.js:6`; also in the cron job SQL (`supabase_v12/v22/v36`) | Yes, by design |
| VAPID public key | `config.js:15` | Yes |
| VAPID private key, VAPID_SUBJECT | Supabase → Edge Functions → Secrets | No |
| Service role key | Edge Function environment only (`send-push/index.ts:51`) | No; never in git **[T]** |
| Database password / URL | GitHub secret `SUPABASE_DB_URL` (backup) | No |
| Backup password | GitHub secret `BACKUP_PASSWORD` + owner's paper | No |
| RCLONE_CONFIG | GitHub secret (optional, unset) | No |
| Admin page access key | Owner's bookmark (`#k=…`); only its SHA-256 is in the page | No |
| Admin password, team passwords | bcrypt in `cbt_private.settings` / `admin_users` | No |
| TOTP secrets, recovery codes | `cbt_private.admin_totp` (secret plain, codes sha256) | No |
| Student access codes | sha256 + salt in `students`; phones keep tokens, not codes | No |
| Git history | 238+ commits, all branches scanned: no secret found **[T]** | – |

## 7. Risky features
| Feature | Why risky | Current control |
|---|---|---|
| Admin PDF import (pdf.js 3.11.174) | Crafted PDFs (CVE-2024-4367) | `isEvalSupported: false` |
| OCR (Tesseract from jsDelivr) | Third-party code at run time | Pinned version; runs in a worker |
| Admin CSP allows `unsafe-inline` + `unsafe-eval` | Any HTML injection could run script | Every value escaped (`AX.h`, `esc()`) |
| Student app CSP allows `unsafe-inline` | Same | `esc()` everywhere; token (not code) on phone |
| File/image uploads (series files, covers, review photos) | Large / malicious content | Admin-only, except review photo (data:image only, ≤30 KB) |
| Store + manual UPI | Fake payment claims | Price from server; admin checks UTR in the bank before approving |
| Promotion links / commission | Fraud | Order code + mobile; 1 click per connection per hour |
| Push notifications (Edge Function with service role) | Mass messages | Only an admin session with Messaging permission |
| Notices with links | Phishing links in the student app | Admin-only; text escaped, only http(s) links |
| CSV export | Spreadsheet formulas | `cx/core.js:296` prefixes `= + - @` |
| Backup workflow | DB password in GitHub | GitHub secret; locked file; `contents: read` |

---

## 8. Checklist

### A. Test series
| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | Answers/solutions not sent during a test | **PASS** [T] | `cbt_start` (`supabase_v41_medium.sql:180`): `questions` has only q/options/img/sec; same for the Hindi version (`q_hi`). By design, **practice** tests send answers at start, and after a student's own submit the answer key comes back (live tests: only after the result time). |
| 2 | Paper only when the test opens, only to allowed students | **PASS** [T] | Before `opens_at` → `not_open` with no questions; no series access → `locked`. |
| 3 | Score and rank on the server | **PASS** [T] | `grade_session` (`supabase_v30_result_time.sql:54`) grades against the key in the DB; a `"score":999` sent by the browser is ignored (result 4). Rank is computed in `cbt_leaderboard` / `cbt_overall`. |
| 4 | Timer checked on the server, no late submit | **PASS** [T] | `ends_at` is set by the server and, for a live test, is never later than "Live ends" (start 8:58, Live ends 9:00 → ends 9:00; v43). `cbt_save` after the time → `over`; the server auto-submits the saved answers at the end time. A submit that arrives late is kept for the student only (late = true) and never ranked; the rank counts first attempts submitted by "Live ends" (+2 min). |
| 5 | One attempt (if the rule exists), no double submit | **PASS** [T] | Same client id twice → same result; another submit → `no_session`. Live tests: one attempt until the result time (v33). Non-live tests allow re-attempts by design; rank counts the first one. |
| 6 | Answers cannot change after submit | **PASS** [T] | `cbt_save` after submit → `no_session`; `results` has no client write access. |
| 7 | Solutions/PDFs only after the test, only to allowed users | **PASS** [T] | Review/explanations: after own submit and after the result time. Series PDFs: only students of the series (v42), and each file can get an "Opens at" time (v43, Tests → Cover & files) → before it `not_open`. |
| 8 | Stop question-bank scraping / bulk download | **PASS** [T] | Per student per hour: 30 new attempts, 120 reviews, 60 PYQ chapters → `busy` (v43). Copying slowly over many hours is still possible for a paying student. |
| 9 | Account sharing / session limit | **PASS** [T] (limits) | Device limit 2 + 2 swaps/day; a sign-in token works only with the phone id it was made for (v43). Someone who copies the whole browser storage of a phone can still share it; that cannot be stopped from a website. |
| 10 | Leaderboard shows no phone/email | **PASS** [T] | `top[]` keys: name (first name only), score, rank, me, cheat. |
| 11 | Paid access only after verified payment, no price tampering | **PASS** price [C] · **N/A** webhook | Amount comes from `cbt_store_items.price` on the server (`supabase_v42_audit_fixes.sql:221`). There is no payment gateway: access is granted only by an admin with Store permission after checking the UPI payment by hand. |

### B. Supabase / database
| # | Check | Status | Evidence |
|---|---|---|---|
| 12 | RLS on every table, separate policies | **PASS** [T] | 23 public tables and every `cbt_private` table: RLS on, **no policies = deny all** (stricter than per-command policies, since the browser never touches tables). |
| 13 | WITH CHECK (user_id, score, rank, role, status) | **PASS** [T] | No client writes at all: insert/update/delete/select as anon → `permission denied`. Functions take the student id from `auth`, never from the request. |
| 14 | Admin role not in user_metadata | **PASS** [C] | Supabase Auth is not used; roles live in `cbt_private.admin_users` + `settings`. |
| 15 | Views (security_invoker) and SECURITY DEFINER functions | **PASS** [T] local · [P] prod | No views. Every definer function has a fixed `search_path` with `pg_temp` last; anon can run 0 `cbt_private` functions; 88 admin calls with bad credentials all refused. |
| 16 | Storage buckets private, no listing | **N/A** [C] · [P] | No buckets used by the code. |
| 17 | API sends only needed columns | **PASS** [T] | No student/public RPC returns hashes, salts, tokens, other students' mobiles or UTRs. Admin-only answers include mobile/UTR (needed) and the TOTP secret once at set-up. |
| 18 | Two accounts + signed out: no cross read/edit/delete | **PASS** [T] | B opening A's result → `not_found`; B's catalogue has only B's results; signed out → `invalid` on every student RPC; RPCs take no student id, so another student's rows cannot be addressed. |
| 19 | service_role only on the server | **PASS** [T] | Only in the Edge Function environment; history scan clean. |
| 20 | Least privilege, DB not open, TLS | **NEEDS REVIEW** [P] | anon = RPC execute only **PASS**. Network restrictions and "Enforce SSL" are dashboard settings. The backup uses the full `postgres` user (G6). |
| 21 | Backups on | **PASS** | `db-backup.yml` run #8 succeeded with 1 artifact (owner's screenshot, 2026-11-01). Free plan: no Supabase backups/PITR. |
| 22 | Security Advisor warnings fixed | **NEEDS REVIEW** [P] | Every function now has a fixed search path and every private table has RLS (v35.3) [T]. Expected left: "RLS enabled, no policy" (INFO, intended: no direct table access). Needs a screenshot from production. |

## 9. Findings
| # | Sev | Finding | Fix idea | Verify |
|---|---|---|---|---|
| G1 | Medium · **fixed v43** | A paid student can pull the whole question bank: start every test, submit blank, open the review (answer keys) in minutes; `cbt_pyq_chapter` returns whole chapters with answers. No per-student rate limit. (`supabase_v41_medium.sql:180,296`, `supabase_v11_pyq.sql:42`) | Per-student limits in SQL, e.g. 30 new test sessions/hour, 60 reviews/hour, 40 PYQ chapters/hour → `{"error":"busy"}`; alert in the Integrity page when hit. | Loop 31 `cbt_start` calls → the 31st is `busy`; a normal student is never stopped. |
| G2 | Low · **rule decided** | Late submit (time over, nothing auto-saved) is saved with its score (late, not ranked). (`cbt_submit`, `supabase_v41_medium.sql:249`) | If the rule is "no late submit": return `over` when `now > ends_at + 2 min` and no auto-saved copy exists (the auto-saved path stays). | Submit 10 minutes late → `over`, no result row. |
| G3 | Low · **fixed v43** | Series PDFs (e.g. solutions) are open to series members at any time, not after a test ends. | Optional "opens at" date per file, checked in `cbt_file_part`. | A file with a future date → `not_open`. |
| G4 | Low · **fixed v43** | The device limit trusts the device id sent by the phone; copying `localStorage` (token + device id) shares an account. | Bind tokens to their device and/or allow one active test session per student at a time. | A token used with another device id → `invalid`. |
| G5 | Low · **fixed v35.3** | ~28 helper functions without a fixed `search_path` (Advisor warning; not exploitable here, since none is SECURITY DEFINER). | `alter function … set search_path = cbt_private, pg_temp` in a loop. | Advisor shows no "search path mutable". |
| G6 | Low · open | The backup secret is the full `postgres` login: if GitHub secrets leak, the whole DB can be changed. | A read-only role `backup_ro` (SELECT + USAGE only) for `SUPABASE_DB_URL`. | Backup still green; `backup_ro` cannot update. |
| G7 | Info · limited by G1 | Practice tests send answers at start, and any submit returns that test's key, so keys can be shared between students. | Product rule; limit with G1. | – |
| G8 | Info · **fixed v35.3** | `cbt_private` tables have RLS off (safe today because the schema is not exposed). | `alter table … enable row level security` on all of them (owner functions keep working). | Advisor / query shows RLS on. |

## 10. Needs a look in production (read-only)
1. Supabase → **Advisors → Security Advisor**: screenshot of the list (B22).
2. Supabase → **Database → Settings**: "Enforce SSL" and "Network restrictions" (B20).
3. SQL Editor: `select id, public from storage.buckets;` (B16) and `select schemaname, viewname from pg_views where schemaname in ('public','cbt_private');` (B15).
4. GitHub and Supabase accounts: 2-step login on; repository collaborators with write access.
