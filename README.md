# Aspiron CBT Test Series

Static website on GitHub Pages + Supabase (database functions). No build step: upload the files and they are live.

## Pages
| Page | What it is | Scripts |
|---|---|---|
| `index.html` | Student app (tests, results, mistakes, tracker, PYQ, reviews) | `config.js`, `app1.js` … `app17.js`, `pyq-syllabus.js` |
| `cp-dt764twzf54s5m.html` | Admin panel (needs the private access key + admin password) | `config.js`, `parser.js`, `qrcode.js`, `cx/core.js`, `cx/ui.js`, `cx/amsg.js`, `cx/m-*.js`, `cx/shell.js` |
| `store.html` | Public store, in the admin console's design (menu on the left on computers, menu bar at the bottom on phones): name + mobile + course (NEET / JEE) once; pages Home (the student's course in rows by section — Full syllabus, Subject-wise …, arranged in Store setup), Search, Reviews, Help and Profile (details, course, theme, the last order); NEET / JEE switch at the top, Explore page (description, schedule, demo tests, reviews), Coming soon · Notify me, UPI payment, verify on Telegram / WhatsApp (message + payment screenshot), light / dark / auto theme | `store-theme.js`, `store.css`, `config.js`, `qrcode.js`, `store.js` `store.html?ref=CODE` is a promotion link: the visit and the orders made after it are counted in Admin → Store → Promotions. Links: `#/search`, `#/reviews`, `#/help`, `#/me` open a page, `#x=<id>` a series' Explore page |
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

## Notices by test series, "Haan, padh liya" and phone notifications (`supabase_v36_notice_audience.sql`)
- **Who gets it:** a notice or a phone notification goes to *Everyone* or only to the students of chosen test series (Admin → Broadcasts → "Who gets it"). A student is in a series' group when the series is free or the student has access to it, so a student who gets a series later joins its group by themselves (and sees its older notices); a student without that series never sees them. The database filters `cbt_notice`, so no copy of the app can show them.
- **"Haan, padh liya":** every notice on the student's Notifications page has the button (and "Sab padh liya" for all); the admin sees "N read" on each notice and who read it.
- **Delivery:** the admin panel sends phone notifications page by page (150 phones per call) so a long list is never cut off by the Edge Function time limit, and shows sent / failed with the reason ("Check setup" tells if the VAPID key in Supabase is not the one in `config.js`). Only approved students get them. The student app subscribes again when its key is old, re-registers a phone the server dropped (checked once a day), moves the phone to the new student on sign-in and removes it on sign-out; `sw.js` follows a push address that the browser changed (`cbt_push_rotate`). "Test is LIVE" alerts are claimed 100 at a time by 4 workers per minute, and an alert that failed only because the push service was busy is tried again the next minute.
- **Setup order:** run `supabase_v36_notice_audience.sql`, run `supabase_v35_admin_team.sql` again, then deploy `supabase/functions/send-push` again (Verify JWT off). The live function address is `…/functions/v1/Send-push` (capital S); the site and the minute job call that address. Set the secret `VAPID_SUBJECT` to a real `mailto:` address. Until the function is deployed, the panel refuses to send a test-series notification (it never falls back to everyone).

## Approval message and Telegram channel per test series (`supabase_v40_series_msg.sql`, `cx/amsg.js`)
- **Where:** Admin → Test studio → open a series → **Approval message & Telegram** (also in the series ⋮ menu; **Approval messages** on the library page lists every series). The message you write there is exactly what the student gets when you approve a payment for that series (Orders → Approve & unlock, or Students → give access → *Send message*).
- **Words that are filled in:** `{name}` `{series}` `{order}` `{mobile}` `{code}` `{website}` `{telegram}`. A line whose word is empty (no order code, no Telegram link) is left out. Write `*bold*` / `_italic_` as on WhatsApp.
- **Telegram link per series:** each series can have its own channel, so Biology students no longer get the Chemistry link. A series without one uses the default link (Default message → Telegram link, else `TG_CHANNEL` in `config.js`); the list shows which series still use the default.
- **Telegram copy:** Telegram cannot be pre-filled, so the message is copied. The copy now uses Telegram's own `**bold**` / `__italic__`, which Telegram turns into bold / italic, so no stray `*` stars show. WhatsApp still gets `*bold*`.
- **Notice / phone notification to one series:** the same series page has **Notice to this series** and **Phone notification** — the series is already chosen, and only its students see it (uses v36).
- **Setup:** run `supabase_v40_series_msg.sql` once, then `supabase_v35_admin_team.sql` again. Until then every series uses the built-in message and the `config.js` link.

## Many students at once (`supabase_v39_scale.sql`, `app1.js`, `app3.js`)
Made for 500–1000 students taking a test at the same time.
- **Database:** indexes for start, auto-save, submit, home page and leaderboard (added only where none exists). The sign-in check that runs on every request no longer rewrites the student's row each time (only on a wrong code, a new phone, or every 5 minutes for "last seen"). The overall rank (home page leaderboard, Insights) is worked out at most once every 30 seconds and kept in a table, instead of ranking every result on every visit, so a new result shows there within 30 seconds; the test leaderboard is still instant.
- **App:** auto-save during a test goes to the server at most every 10–15 s (answers are still kept on the phone at once, and sent when the app is closed or hidden). When time runs out, phones submit within a random 0–5 s instead of all in the same second (still on time: the server allows 2 minutes). A failed submit is tried again after 5, 10, 20 … 60 s with a little randomness. Requests that are safe to repeat (loading tests, starting a test, auto-save, results, leaderboards …) are tried up to 2 more times when the server says it is busy.
- **Setup:** run `supabase_v39_scale.sql` once; re-run it after re-running v34, v30 or v25.

## Admin console (`cx/`) and team access (`supabase_v35_admin_team.sql`)
- The admin console is built from `cx/core.js`, `cx/ui.js`, `cx/shell.js`, one `cx/m-*.js` file per section and `cx/cx.css`; see `cx/README.md` for how modules are written.
- **Owner** signs in with the admin password. **Team members** get their own username + password from *Team & access*, with No access / View / Full per section (Students, Payments, Tests & content, Results, Integrity, Store & orders, Promotions, Messaging, Reviews). The database checks these permissions on every request (every `cbt_admin…` function is wrapped by v35).
- Every sign-in is a session: *Team & access → Where signed in* shows device, approximate IP and last activity, and can sign out any session or everyone. Sessions end after 7 days without use (30 days at most). *Activity log* lists every change and every refused request.
- Before v35 is run, the owner can still sign in with the password (no team, sessions or log).
- **Two-step sign-in (2FA)**, in v35: Settings → *Two-step sign-in* → Turn on (password, scan the QR code with Google / Microsoft Authenticator, type the code, save the 10 recovery codes). From then on that account needs the password **and** the 6-digit code; for the owner the password alone opens nothing anywhere (backup panel included, which also asks for the code). The owner sees who has it on in *Team & access* and can reset a member's (lost phone). Owner lost the phone and the recovery codes: Supabase → SQL Editor → `delete from cbt_private.admin_totp where acct = 'owner';`
- **Passwords and limits:** new admin and team passwords need 10+ characters with letters and numbers (not "aspiron", "admin", "password"…). Wrong passwords lock that connection for 15 minutes after 10 tries; 100 wrong owner passwords (or 100 wrong team passwords) in an hour from everywhere lock that sign-in for 15 minutes; 5 wrong codes lock the account's codes for 15 minutes.

 (run once each, in this order, in SQL Editor — on top of the original base setup)
`supabase_v9_banners` → `v10_push` → `v11_pyq` → `v12_test_alerts` → `v13_store` → `v17_store_fix` →
`v18_store_schedule` → `v19_store_security` → `v20_store_payer` → `v21_devices` → `v22_alerts_via_send_push` →
`v23_reviews` → `v24_cheating` → `v25_cheat_leaderboard` → `v26_lift_fix` → `v27_lift_fix2` → `v28_store_followup` → `v29_payments` → `v30_promotions` → `v30_store_explore` → `v31_store_soon` → `v30_result_time` → `v32_store_layout` → `v33_live_one_attempt` → `v34_attack_fixes` → `v35_admin_team` → `v36_notice_audience` (then run `v35_admin_team` once more) → `v38_store_cleanup` (only removes the unused store function of the dropped v37 “Let's study”; safe if v37 was never run) → `v39_scale` → `v40_series_msg` (then run `v35_admin_team` once more). Every file is safe to run again; if you re-run an older file (for example `v25_cheat_leaderboard`), run `v30_result_time`, `v33_live_one_attempt`, `v34_attack_fixes` and `v39_scale` again afterwards, because it replaces some of the same functions. Run `v35_admin_team` again after any file that (re)creates a `cbt_admin…` function (for example after re-running v30_result_time): until then team members cannot use that part (the owner's password always works). `supabase_check_alerts.sql` only reads (for checking alerts). `supabase_security_check.sql` only reads too: it lists the permissions, RLS and public functions, so run it after any database change.

Never put the admin password or a secret / service_role key in `config.js` or anywhere in this repository.
