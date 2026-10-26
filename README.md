# Aspiron CBT Test Series

Static website on GitHub Pages + Supabase (database functions). No build step: upload the files and they are live.

## Pages
| Page | What it is | Scripts |
|---|---|---|
| `index.html` | Student app (tests, results, mistakes, tracker, PYQ, reviews) | `config.js`, `app1.js` … `app17.js`, `pyq-syllabus.js` |
| `cp-dt764twzf54s5m.html` | Admin panel (needs the private access key + admin password) | `config.js`, `parser.js`, `admin1.js` … `admin19.js`, `pyq-syllabus.js` |
| `store.html` | Public store: name + mobile + course (NEET / JEE) once, the student's course in rows by section (Full syllabus, Subject-wise …, arranged in Store setup), search + NEET / JEE switch at the top, Explore page (description, schedule, demo tests, reviews), Coming soon · Notify me, UPI payment, verify on Telegram / WhatsApp (message + payment screenshot), ratings & reviews, light / dark theme | `store-theme.js`, `config.js`, `qrcode.js`, `store.js` `store.html?ref=CODE` is a promotion link: the visit and the orders made after it are counted in Admin → Store → Promotions |
| `admin.html` | Decoy "404" page (the real admin page has a hidden name) | – |

Scripts load in number order; a later file adds to or replaces functions of earlier ones.
After changing a script, raise its `?v=` number in the page that loads it so phones get the new copy.

Other files: `sw.js` (installable app, always loads the newest pages), `manifest.webmanifest` /
`cp-dt764twzf54s5m.webmanifest` (app icons and names), `pyq-data/` (past papers for the admin PYQ import),
`lib/` (exact copies of pdf.js 3.11.174, JSZip 3.10.1 and Tesseract.js 5.1.1 from npm, so the admin page runs no script from a third-party CDN;
the OCR worker and language data still load from jsDelivr / tessdata as before),
`supabase/functions/send-push` (phone notifications and 🔔 test-live alerts).

## Live tests: result time and auto-save (`supabase_v30_result_time.sql`)
- In the admin test form, a test can get **Live ends** (no new start after it) and **Result & answer key at**. The link "Fill: live till 9 PM, result 10 PM" fills both for the start day.
- Until the result time, a student who submits sees only "Test submitted ✓ — result, rank and answer key after …": no score, rank, answer key, mistakes, insights or bookmarked answers for that test. After it, everything shows by itself. Tests without a result time and practice tests show results at once, as before.
- Leaderboards and the overall rank count each student's **first** attempt of a test, only if it was on time (and, for a test with a result time, submitted before that time). Re-attempts are allowed for practice and show in the student's own results.
- While a test runs, the answers are also saved online every few seconds. If a student leaves (Back, closed app, lost network at the end) and does not come back, the server submits the saved answers at the end time, on time.
- The answer key is never sent to the phone during a test: `cbt_start` leaves answers out unless the test is **practice**. So for a live test keep practice off, and the key only reaches the student through the server after the result time. The key can be entered the day before without any risk.
- When a student switches app or tab during a test (or on the instructions page), a warning in English pops up on return (`app3.js`, `leaveWarn`). The count is kept with the test progress on the phone only; nothing is sent to the server.
- **One attempt while live** (`supabase_v33_live_one_attempt.sql`, `app17.js`): a student who has submitted a live test cannot start it again until the result time (or "Live ends" if no result time is set); the row shows "Submitted · Result & re-attempt after …". After that time it can be re-attempted any number of times (rank still counts only the first attempt). Practice tests are not affected.

## Admin console (`cx/`) and team access (`supabase_v35_admin_team.sql`)
- The admin console is built from `cx/core.js`, `cx/ui.js`, `cx/shell.js`, one `cx/m-*.js` file per section and `cx/cx.css`; see `cx/README.md` for how modules are written.
- **Owner** signs in with the admin password. **Team members** get their own username + password from *Team & access*, with No access / View / Full per section (Students, Payments, Tests & content, Results, Integrity, Store & orders, Promotions, Messaging, Reviews). The database checks these permissions on every request (every `cbt_admin…` function is wrapped by v35).
- Every sign-in is a session: *Team & access → Where signed in* shows device, approximate IP and last activity, and can sign out any session or everyone. Sessions end after 7 days without use (30 days at most). *Activity log* lists every change and every refused request.
- Before v35 is run, the owner can still sign in with the password (no team, sessions or log).

 (run once each, in this order, in SQL Editor — on top of the original base setup)
`supabase_v9_banners` → `v10_push` → `v11_pyq` → `v12_test_alerts` → `v13_store` → `v17_store_fix` →
`v18_store_schedule` → `v19_store_security` → `v20_store_payer` → `v21_devices` → `v22_alerts_via_send_push` →
`v23_reviews` → `v24_cheating` → `v25_cheat_leaderboard` → `v26_lift_fix` → `v27_lift_fix2` → `v28_store_followup` → `v29_payments` → `v30_promotions` → `v30_store_explore` → `v31_store_soon` → `v30_result_time` → `v32_store_layout` → `v33_live_one_attempt` → `v34_attack_fixes` → `v35_admin_team`. Every file is safe to run again; if you re-run an older file (for example `v25_cheat_leaderboard`), run `v30_result_time`, `v33_live_one_attempt` and `v34_attack_fixes` again afterwards, because it replaces some of the same functions. Run `v35_admin_team` again after any file that (re)creates a `cbt_admin…` function or `cbt_private.admin_ok` (for example after re-running v30_result_time or v34): until then team members cannot use that part (the owner is never affected). `supabase_check_alerts.sql` only reads (for checking alerts). `supabase_security_check.sql` only reads too: it lists the permissions, RLS and public functions, so run it after any database change.

Never put the admin password or a secret / service_role key in `config.js` or anywhere in this repository.
