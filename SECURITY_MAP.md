# Security map — Aspiron CBT

Snapshot of `main` (2026-11-02, after v42–v45 and v35.3; checklists A–G). Documentation only: nothing here changes how the app works.
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
| **Student** (mobile + code/token + device) | `cbt_login`, `cbt_catalog`, `cbt_start`, `cbt_save`, `cbt_submit`, `cbt_review`, `cbt_mistakes`, `cbt_bookmark(s)`, `cbt_report`, `cbt_leaderboard`, `cbt_overall`, `cbt_insights`, `cbt_file_part`, `cbt_cover`, `cbt_notice(_img)`, `cbt_ann_read`, `cbt_lang`, `cbt_pyq_summary`, `cbt_pyq_chapter`, `cbt_alert_list/set`, `cbt_push_save/has`, `cbt_devices`, `cbt_me` (own name / email / mobile; mobile 2× per 30 days), `cbt_device_swap/ping`, `cbt_suspension`, `cbt_my_flags`, `cbt_review_save/mine/delete`, `cbt_store_map` (store item id of each series; ids only), `cbt_keep` (own profile details + exam countdown; values checked and cut to size, photo must be a small data:image) | `cbt_private.auth` (8 wrong codes → 15 min lock, device limit, token check) |
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
| public.cbt_store_orders | Orders (deleted ones kept in `cbt_private.order_trash`, v46) | ⚠ mobile, payer, utr, ip hash | store page, admin |
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

### C. Auth & admin
| # | Check | Status | Evidence |
|---|---|---|---|
| 23 | Server-side authentication on every protected function | **PASS** [T] | All 37 student RPCs with a wrong code → none answers ok (only `cbt_logout`, which does nothing without a valid token). 96 admin calls with bad credentials → all refused. |
| 24 | User id from the verified session, never from the request | **PASS** [T] | Student id comes from `cbt_private.auth`, admin/member from the `as1.` session; no RPC takes a student id. v45: test alerts and push subscriptions store the verified 10-digit number, not the raw text sent. |
| 25 | Admin actions checked on the server | **PASS** [T] | Per-module permission in `admin_session_ok`/`admin_need` (v35); a view-only member gets `forbidden` for delete, payments, store, file times. |
| 26 | MFA for admin accounts | **PASS** [T] | Owner: TOTP on. Team: the owner can now **require** it (Team & access → "Require two-step sign-in"); until then a member gets `need_2fa_setup` for everything but setting it up (v35.3). |
| 27 | Generic login / sign-up errors | **PASS** [T] | Unknown mobile and wrong code → same `invalid`; unknown team username and wrong password → same `invalid`. v45: the access-request form answers `received` for new, existing and rejected numbers alike. (`pending`/`locked` are still shown at sign-in so a waiting student knows why.) |
| 28 | Password hashing; no passwords in logs or answers | **PASS** [T] | Admin/team: bcrypt (v35.3). Student codes: salted sha256 (32-bit codes), phones keep tokens instead. Audit log stores names, never passwords. |
| 29 | Password policy, weak/breached passwords blocked | **PASS** [T] | 10+ chars, letters + numbers, obvious words blocked (server, `adm_pw_weak`). New admin/team passwords are also checked against haveibeenpwned (k-anonymity: only 5 hex chars of the SHA-1 leave the browser; `cx/m-team.js`). |
| 30 | Reset / magic / verification links | **N/A** | No e-mail links exist: owner resets via SQL Editor (`set_admin_password`), members via the owner, students get a new code from the admin. |
| 31 | Links built from APP_URL, not Host header | **N/A** | Static site, no server building links; messages use `config.js` `SHORT_URL`. |
| 32 | Redirect allowlist / no open redirect | **PASS** [C] | No redirect parameter is read anywhere; navigation is hash routes inside the app. |
| 33 | Session cookies HttpOnly/Secure/SameSite | **N/A** | No cookies. Admin sessions expire after 30 days unused (180 days max); student tokens after 180 days unused. |
| 34 | Logout and password change end sessions | **PASS** [T] | Admin logout revokes the session; owner/member password change signs out other sessions; `set_admin_password` (SQL Editor reset) now signs the owner out everywhere (v35.3). Student sign-out revokes the token; a new code from the admin ends all tokens. |
| 35 | No sensitive token in localStorage (or risk understood) | **PASS** (risk accepted) | Student token and "keep me signed in" admin session are in localStorage (needed without cookies/server). Mitigations: escaped output everywhere, tokens revocable, expiring, bound to the phone id (students), 2FA for admins. |
| 36 | No seed/test/debug/demo routes in production | **PASS** [C] | Only the 5 pages listed; no test page, no debug endpoint (`send-push` `mode:"info"` returns only true/false for secrets being set). |

### D. Input & frontend
| # | Check | Status | Evidence |
|---|---|---|---|
| 37 | Server-side validation (type, length, range, enum) | **PASS** [C] | Every student/public RPC trims and limits lengths, checks formats (mobile, UTR, e-mail, push endpoint), ranges (rating 1–5, qidx) and enums (report kind, language); unknown JSON keys are ignored (never stored). |
| 38 | Mass assignment (role, score) | **PASS** [T] | `{"score":999}` ignored; no RPC writes a client object to a table; member permissions are filtered to known modules/levels. |
| 39 | XSS (questions, names, comments, innerHTML) | **PASS** [T] | Student app `esc()`, admin console `AX.h` (auto-escape); names/notes stripped of `<>"\`` on the server. |
| 40 | User links only http/https | **PASS** [T] | Notices `safeUrl` (http/https), banners now http/https or an app page `#/…` only (`app8.js`, was able to take `javascript:`). |
| 41 | SQL injection | **PASS** [T] | All RPC parameters are bound; dynamic SQL only via `format(%I, %L)`; `' or 1=1--` attempts fail. |
| 42 | CSRF / state-changing GET | **N/A** | No cookies; every call is a POST RPC. |
| 43 | File upload: type by bytes, size, no SVG/HTML | **PASS** [T] | Admin uploads: PDF, PNG, JPEG, WebP only (no SVG); photos re-encoded; review photos `data:image/(jpeg|png|webp)` ≤30 KB. Student app now checks a file's first bytes: only a real PDF/photo can be viewed, anything else is a download only. Store files: type allowlist. Files live in the DB (no public bucket). |
| 44 | Bulk question upload, formula injection | **PASS** [C] | Admin-only import (PDF/Word/text via pdf.js/JSZip, eval off). CSV exports prefix `= + - @` (`cx/core.js:296`). |
| 45 | SSRF | **PASS** [T] | The only server-side fetch is `send-push` → push endpoints, now limited to Google/Mozilla/Apple/Microsoft push hosts in the DB (v45) and in the function. |
| 46 | No console.log / debug / secrets in comments | **PASS** [T] | No `console.log`/`debug` in app code; history scan found no secrets. |

### E. Secrets & repository
| # | Check | Status | Evidence |
|---|---|---|---|
| 47 | No secret in the frontend files | **PASS** [T] | `scripts/check-exposed.sh --local` and gitleaks: only public values (publishable key, VAPID public key). |
| 48 | Env variables: no secret with a public prefix, `.env` ignored, `.env.example`, no insecure fallback | **PASS** [C] | No `.env` anywhere (history included); `.gitignore` covers `.env*`, keys, dumps; `.env.example` lists the secret **names** only. Secrets live in Supabase / GitHub dashboards. |
| 49 | Full history scan (gitleaks), all branches | **PASS** [T] | gitleaks 8.21.2 over 16 branches / all commits: 14 hits, all public by design (publishable key, VAPID public key, PYQ question ids); real secrets **0**. With `.gitleaks.toml`: "no leaks found". |
| 50 | Rotate leaked keys | **N/A** | No key has leaked. If one ever does: make a new key in Supabase → put it where it is used (Edge Function secret / GitHub secret / `config.js` for the publishable key) → deploy → delete the old key → call once with the old key and expect 401. |
| 51 | Exposed files (.env, .git, backups, dumps, .DS_Store, .map) | **PASS** [C] · live check weekly | None in the repository; no `.nojekyll`, so GitHub Pages does not serve dot-folders; no `.map` files (Tesseract's map reference points to a missing file). `security.yml` asks the live site every Monday. |
| 52 | `scripts/check-exposed.sh` | **PASS** [T] | `--local` (repository) and live-site modes; exit code 1 on any finding; never prints secret values. |
| 53 | Pre-commit scan + GitHub secret scanning + push protection | **PASS** repo · **[P]** settings | `.githooks/pre-commit` (gitleaks if installed, else patterns; turn on with `git config core.hooksPath .githooks`); `security.yml` runs gitleaks on every push/PR. **GitHub → Settings → Code security → Secret scanning + Push protection: turn ON** (free for public repos). |
| 54 | No answer key / question bank / admin logic in the public repo | **NEEDS REVIEW** | Tests, questions and answer keys live only in the database. In the repo: SQL code (admin logic — security does not depend on hiding it) and `pyq-data/` (old AIPMT papers with answers, public papers). A private repo needs a paid GitHub plan for Pages. |

### F. Dependencies
| # | Check | Status | Evidence |
|---|---|---|---|
| 55 | npm audit / Critical-High updates | **PASS** [T] | No npm packages in the site. `lib/` = exact npm copies (sha256 match): pdf.js 3.11.174 (CVE-2024-4367 closed with `isEvalSupported:false`), JSZip 3.10.1, Tesseract 5.1.1. Edge Function: `web-push@3.6.7`, `@supabase/supabase-js@2.118.0` (now pinned; was `@2`). |
| 56 | Fake/hallucinated packages, lockfile | **PASS** [T] | All 5 packages exist on npm with these exact versions; no lockfile needed for a static site (vendored copies), the Edge Function pins exact versions. |
| 57 | Unused packages, dead files/routes | **PASS** [T] | Every page/script/lib file is referenced; `admin.html` is the deliberate decoy. The old admin panel (`cp-…-old.html`, `admin*.js`) is a working backup — remove it when no longer needed. |
| 58 | SRI on CDN scripts | **PASS** [C] (n/a) | No CDN `<script>` tags: libraries are served from `lib/`. Left from CDNs: Google Fonts CSS (SRI not possible) and Tesseract's OCR worker/language data loaded by the library inside a worker. |
| 59 | Dependabot / Renovate | **PASS** | `.github/dependabot.yml` (GitHub Actions, weekly). |

### G. Network & deploy
| # | Check | Status | Evidence |
|---|---|---|---|
| 60 | HTTP → HTTPS | **PASS** [P] | `*.github.io` is on the browsers' HSTS preload list; `check-exposed.sh` checks the redirect weekly. Keep **Settings → Pages → Enforce HTTPS** on. |
| 61 | HSTS, no mixed content | **PASS** [C] | HSTS preloaded for github.io; every resource is https/self; `upgrade-insecure-requests` in every page's CSP. |
| 62 | Security headers | **PASS** (what Pages allows) · **NEEDS REVIEW** with a domain | CSP (meta) on every page incl. the decoy, `Referrer-Policy` (meta), frame-busting script (clickjacking). GitHub Pages cannot send `frame-ancestors`, `X-Content-Type-Options`, `Permissions-Policy`: add them when a custom domain is put behind Cloudflare (see §11). |
| 63 | Rate limiting (login, sign-up, OTP, reset, submit, search) | **PASS** [T] | Student code 8 tries/15 min; admin 10/15 min per connection + 100/h shared; OTP 5 per account; access requests 5/h per connection; new attempts 30/h, reviews 120/h, PYQ 60/h per student; store 8 orders/h per connection, 20 wrong codes/h. Answers are `{"error":"busy"/"locked","wait":…}` with HTTP 200 (PostgREST RPC), not 429. |
| 64 | CORS exact allowlist | **PASS** Edge Function · **[P]** PostgREST | `send-push` now answers only `https://aspironeducation.com`, `https://www.aspironeducation.com` and the old `https://aspiron-dev.github.io` (secret `ALLOWED_ORIGINS`). Supabase's REST API sends `*` and cannot be changed; harmless because nothing uses cookies. |
| 65 | Generic errors, no stack trace / SQL / path | **PASS** [T] | RPCs answer short error codes; `send-push` crash text stays in its logs. Admin console shows a database message only to signed-in admins. |
| 66 | Debug mode off | **PASS** [C] | Static site; no debug flag or console logging. |
| 67 | Source maps, /docs, /swagger, /graphql | **PASS** site · **NEEDS REVIEW** Supabase | No source maps served. Supabase's REST root lists the API (functions) to anyone with the publishable key — the same names are in this public repo; check Supabase → Settings → API for an option to turn the OpenAPI listing off. GraphQL: turn off `pg_graphql` if it is enabled (not used). |
| 68 | Preview/staging behind a password | **N/A** | No preview or staging deployments. |
| 69 | Domain: registrar MFA, lock, DNS | **N/A** (no domain yet) | When buying one: registrar 2-step login + transfer lock; DNS `CNAME` to GitHub Pages or Cloudflare; then add it to `ALLOWED_ORIGINS`. |

### H–K. Monitoring, privacy, AI, final (details and evidence: `SECURITY_REPORT.md`, `SECURITY_REVIEW.md`)
| # | Check | Status |
|---|---|---|
| 70 | Security logging | **PASS** — `admin_audit` + `cbt_private.security_events` (wrong passwords / 2FA codes, locks, student lock-outs, rate limits, refused, team / password / 2FA changes) `supabase_v47_alerts_results.sql`; tests `break_it.sql` 17g–17o |
| 71 | No secrets in logs | **PASS** [C] |
| 72 | Alerts (brute force, 5xx, new admin) | **PASS** (5xx: N/A, Supabase) — owner bell + Team → Security alerts; hourly `security-alerts.yml` fails → GitHub e-mail |
| 73 | MFA on owner accounts | **Manual** — owner's checklist in `SECURITY_REPORT.md` |
| 74 | Access review, old keys | **Partial** — Team & access review by owner; legacy keys: `send-push` ready for `SB_SECRET_KEY`, owner turns legacy keys off (R7) |
| 75 | Spending alerts | **PASS** — Free plan, spend cap, no card, nothing paid |
| 76 | Data minimised, no analytics | **PASS** — no trackers; IPs keyed-hashed, cleared after 30 days (R4, v48, test 18a/18b) |
| 77 | Export / delete / privacy notice (DPDP) | **PASS (owner's choice)** — no self-service export/delete (owner decision); request on chat → admin delete removes all student data (trigger `student_wipe`, test 17f); notice updated `app6.js` section 6 |
| 78 | SPF/DKIM/DMARC | **N/A** — the app sends no e-mail |
| 79 | Backup restore test, RESTORE.md | **PASS** — `restore-drill.yml` monthly + `RESTORE.md` |
| 80 | SECURITY_RUNBOOK.md | **PASS** |
| 81–82 | AI feature | **N/A** — none |
| 83 | Attacker review | **PASS** — `SECURITY_REVIEW.md` (R1–R13) |
| 84 | Fixes after go-ahead | **Waiting** for the owner |
| 85 | Break-it tests in CI | **PASS** — `tests/` + `tests.yml` (45 DB checks + browser), open findings shown separately |
| 86 | Final report | **PASS** — `SECURITY_REPORT.md` |
| 87 | Live G checks after deploy, tests every push | **PASS** — `security.yml` (after every change to main + weekly), `tests.yml` (every push) |

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
| G9 | Medium · **fixed v45** | A student could change their own mobile number (v44) to a buyer's number before the order was approved, so the purchase would land on their account. | A student cannot take a number that has a store order, "Notify me", rejected request or another student's previous number (90 days). | Change to a buyer's number → `taken`. |
| G10 | Low · **fixed** | Banner links accepted `javascript:`; a file uploaded as HTML/SVG could run script when a student pressed "View"; push endpoints could point at any server (SSRF). | http/https or `#/` links only; first-byte check before viewing; push host allowlist (v45 + `send-push`). | Browser + DB tests. |
| G11 | Low · **fixed v46** | PR #102 lets an admin/member with Store "Full" access delete any order, even a paid one; only its code stayed in the activity log, so a deleted payment left no record. Permission check itself is correct (tested: no login → `invalid`, Store view → `forbidden`, Store full → deleted and logged). | Trigger keeps a full copy of every deleted order and who deleted it in `cbt_private.order_trash` (owner-only, restorable). | Delete → row in `order_trash` with name, amount, UTR, who; restore with the SQL in v46. |

## 10. Needs a look in production (read-only)
1. Supabase → **Advisors → Security Advisor**: screenshot of the list (B22).
2. Supabase → **Database → Settings**: "Enforce SSL" and "Network restrictions" (B20).
3. SQL Editor: `select id, public from storage.buckets;` (B16) and `select schemaname, viewname from pg_views where schemaname in ('public','cbt_private');` (B15).
4. GitHub and Supabase accounts: 2-step login on; repository collaborators with write access.

## 11. Headers to add when a custom domain goes behind Cloudflare
`Strict-Transport-Security: max-age=31536000; includeSubDomains` · `X-Content-Type-Options: nosniff` · `Content-Security-Policy: frame-ancestors 'none'` (start as `Content-Security-Policy-Report-Only` for a week) · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` · and add the domain to the Edge Function secret `ALLOWED_ORIGINS`.
