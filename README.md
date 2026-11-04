# Aspiron Education

Static website on GitHub Pages + Supabase (database functions). No build step: upload the files and they are live.

**Pending work, task by task:** `PENDING.md`.

## Pages
| Page | What it is | Scripts |
|---|---|---|
| `index.html` | Student app (tests, results, mistakes, tracker, PYQ, reviews, Refer & earn) | `config.js`, `app1.js` … `app22.js`, `pyq-syllabus.js` |
| `cp-dt764twzf54s5m.html` | Admin panel (needs the private access key + admin password) | `config.js`, `parser.js`, `qrcode.js`, `cx/core.js`, `cx/ui.js`, `cx/amsg.js`, `cx/lang.js`, `cx/m-*.js`, `cx/shell.js` |
| `store.html` | Public store, in the admin console's design (menu on the left on computers, menu bar at the bottom on phones): name + mobile + course (NEET / JEE) once; pages Home (the student's course in rows by section — Full syllabus, Subject-wise …, arranged in Store setup), Search, Reviews, Help and Profile (details, course, theme, the last order); NEET / JEE switch at the top, Explore page (description, schedule, demo tests, reviews), Coming soon · Notify me, UPI payment, verify on Telegram / WhatsApp (message + payment screenshot), light / dark / auto theme | `store-theme.js`, `store.css`, `config.js`, `qrcode.js`, `store.js` `store.html?ref=CODE` is a promotion link: the visit and the orders made after it are counted in Admin → Store → Promotions. Links: `#/search`, `#/reviews`, `#/help`, `#/me` open a page, `#x=<id>` a series' Explore page |
| `admin.html` | Decoy "404" page (the real admin page has a hidden name) | – |

Scripts load in number order; a later file adds to or replaces functions of earlier ones.
After changing a script, raise its `?v=` number in the page that loads it so phones get the new copy — **always**: the service worker keeps a file with the same number on the phone and never asks for it again. A file loaded by several pages (e.g. `config.js`) must have the same number on all of them.

Other files: `sw.js` (installable app, always loads the newest pages), `manifest.webmanifest` /
`cp-dt764twzf54s5m.webmanifest` (app icons and names), `pyq-data/` (past papers for the admin PYQ import),
`lib/` (exact copies of pdf.js 3.11.174, JSZip 3.10.1 and Tesseract.js 5.1.1 from npm, so the admin page runs no script from a third-party CDN;
the OCR worker and language data still load from jsDelivr / tessdata as before),
`supabase/functions/send-push` (phone notifications and 🔔 test-live alerts).

## Brand: name, logo, start-up animation (`index.html`, `config.js`, `manifest.webmanifest`)
- **Name:** "Aspiron Education" everywhere (`SITE_NAME` in `config.js`, page titles, app name on the home screen, store, messages). Under ASPIRON it is always **EDUCATION** (never "Study Hub").
- **Logo:** the letters, cap, swoosh and star are traced from the official logo into vector shapes, kept once in the hidden `#bsprite` at the top of `index.html` (`#bA` the A, `#bCap` + `#bArc` + `#bTas` the cap and tassel, `#bSw` swoosh, `#bSt` star, `#bWord` ASPIRON, `#bEdu` + `#bLnL` / `#bLnR` EDUCATION and its lines). Dark parts take the text colour, so the logo turns white in dark mode; the gold is the `#bG` gradient.
- **Header:** ASPIRON in the logo's own letters (the cut P and R), spaced out, navy-to-slate colour, with a small grey EDUCATION below as real text, so it stays sharp (`.brand .bmk`). A soft shine passes over the name every 8 s (16 s in lite mode), never while the app is in the background or in a test. No glow behind the name (it looked smudgy); the shine that sweeps over the letters takes the colour picked in Theme settings: `--brand-glow` / `--brand-shine` are defined in the CSS, and `brandGlow()` (`app1.js`, run from `syncTheme()`) writes the chosen colour into the root variable after every colour or mode change. There is no profile picture in the header any more — the menu opens the profile (*View Profile*). The name's shape is a mask (`data:` SVG in the CSS), so the shine is moved by the phone's graphics chip.
- **Start-up animation** (`#splash`): the A rises, the gold swoosh sweeps across, the cap drops onto the A and its tassel swings, the star sparkles, then ASPIRON / EDUCATION appear with a shine (about 1.8 s, tap to skip). Every part is its own small layer and only `transform` / `opacity` move, so it stays smooth while the scripts load underneath. It plays in full once per app launch; a reload in the same session shows the logo only briefly. With *reduce motion* on, the logo shows without movement.
- **Sound:** a soft whoosh, tap and chime made in the browser (no sound file). It plays only where the phone allows sound without a tap (the installed app on Android; not on iPhone). Students can turn it off: Settings → *Opening Sound* (`cbt_snd`).
- **Lite mode** (`html[data-lite]`, set in the `<head>` before the first paint): phones with 4 cores or fewer or 2 GB memory or less, data saver on, or battery at 20% or less and not charging. It keeps the frosted header and menu bar (lighter blur) but drops the blur behind sheets and the menu drawer, uses the plain page slide instead of the full-page transition, and stops decorative loops. Decorations that used to loop for ever (home card glow, live-test pulse, notification bell) now play a few times and stop, for everyone.
- **Faster opening:** Google Fonts no longer hold up the first paint, and the service worker serves every file that has a `?v=` number straight from the phone (fetched once per new number). **So a changed script or style must get a new `?v=` number, or phones keep the old copy.** Pages themselves still always come from the network first.
- **App icons:** `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` show the logo symbol on ivory. Phones that installed the app pick up the new icon and name by themselves (Android can take a day or so).

## Coupons and Refer & earn (`supabase_v52_coupons_refer.sql`, `store.js`, `app22.js`, `cx/m-offers.js`)
- **Coupons — Admin → Coupons & Refer → Coupons → New coupon:** a code (e.g. `DIWALI`), *Works till* (and an optional start), then a discount on each series: % off or ₹ off (Biology ₹100 off, Chemistry 20% off …). A series left empty does not take that code. **Each series has one coupon only**: only that code works for it, any other code is refused; a new code on a series replaces its old one. *Remove* stops it at once on every series; at the end time it stops by itself. *Message* copies a ready WhatsApp text with the code and the discounts. **Coupon box on the store** (switch at the top of the Coupons tab): off = students do not see “Have a coupon code?” at all and no code works (checked in the database too); on = the box is back. Your coupons are kept either way. (Needs `supabase_v52_coupons_refer.sql` run again, then `supabase_v35_admin_team.sql`.)
- **Store checkout:** step 1 (Pay) has *Have a coupon code?* → **Apply**. The discount is worked out in the database from the database price; the UPI amount, QR and the Telegram / WhatsApp message show the new amount (price, coupon, wallet, amount). The amount cannot change any more after “I have already paid”. Wrong codes count towards the store's 20-wrong-tries-an-hour limit.
- **Refer & earn — store page:** menu → *Refer & earn* (also a card on Home and on Profile). Every student gets the link `store.html?r=<first name + last 5 digits>` (e.g. `rahul43210`) with Share, WhatsApp and Copy message, and sees friends joined, friends bought, total earned and wallet balance. **Student app:** Profile → *Refer & earn* (and a card on Home, which can be hidden for 7 days) — the same link: it always opens the **store**, never the app; the app page also lists the friends (first name, last 3 digits, bought or not).
- **Who counts:** a **new** number (no paid order, no student account yet, not the sharer's own number) that opens the link and enters its details on the store is *joined* (the first link wins). Joining gives nothing. When you approve that student's **first** paid order (amount above ₹0), the sharer gets the reward — **₹25** by default (Coupons & Refer → Refer & earn → Settings; can be paused). Undo / reject / delete of that order takes the reward back.
- **Wallet:** cannot be withdrawn. At checkout the student turns on **Use wallet balance**: it pays part of the price, or all of it (then there is no UPI step — *Confirm order*, and the order shows *Wallet balance* in Orders to approve as usual). The money is held by the order; a rejected or deleted order, or a pending order left unpaid for 48 h, gives it back by itself. Orders show the price, coupon and wallet used. Admin → Refer & earn lists every sharer (joined, bought, earned, used, balance, details) and **Wallet** adds or removes money by hand (never below ₹0).
- **Safety note:** the store has no sign-in yet — the wallet belongs to the mobile number typed on the store. An order paid with the wallet always needs your approval; approve it only when the student messages you from that number (the order card says so). The planned email / password sign-in for the store closes this.
- **Setup:** run `supabase_v52_coupons_refer.sql` once (after v48 or later), then `supabase_v35_admin_team.sql` again. Until then the store hides the coupon box, the Refer & earn pages say “coming soon” and the admin section asks for the setup. A mobile number changed later (v44) does not move its wallet / referral code — add the money to the new number by hand (Refer & earn → Wallet).

## Refer & earn safety (`supabase_v53_refer_fixes.sql`)
- The reward goes only to the link the new student ordered from (the code is kept on that order); putting someone's number under your link earlier gives nothing.
- No reward when the new student paid less than **₹99** by UPI (Admin → Coupons & Refer → Refer & earn → *Reward only if the new student paid at least*).
- The wallet is seen and used only by its owner, signed in to the student app on the same phone; nobody can see or spend another number's wallet.
- Wallet money cannot pay two orders: an unconfirmed order gives it back after 48 h (it then asks for the full price), and an order is never approved when its wallet money is already used.
- A team member changing wallets, the reward or coupons shows on the owner's bell (Security alerts).
- **Setup:** run `supabase_v53_refer_fixes.sql` (after v52), then `supabase_v35_admin_team.sql` again.

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

## Edit a student's details, number changes, rejected requests, order amount (`supabase_v44_edit_details.sql`, `app20.js`)
- **Admin → Students → a student → Account → Details:** name, **mobile number** and **email**. A new number moves everywhere at once (sign-in, store orders, payments, phone notifications, 🔔 test alerts, reviews, Notify me). The access code stays the same and the student's phones stay signed in (the app finds its new number by itself). The header shows "Number changed · old: …" and Account → **Mobile number history** lists every old → new number, when and by whom.
- **Student app → Profile → Account details (saved online):** the student changes their own name and email, and their mobile number with **Change** (typed twice; at most 2 changes in 30 days; a number that already has an account is refused). The admin sees the change in the history.
- **Wrong store amount** (e.g. order made for ₹399 but ₹250 was paid): Students → student → Payments → ✏️ on the Store row, or Orders → the order → **Amount**. The new amount counts everywhere at once; the first amount is kept and shown as "was ₹399" with your note.
- **Delete any order:** Orders → every section (Payment done, Not paid yet, Approved, Rejected, All) → 🗑 on the order. It is removed for good; an approved order's payment stops counting (the series stays unlocked — remove it on the student's page if needed). Access requests there also have **Delete** and **Reject**. A full copy of every deleted order (and who deleted it) stays in `cbt_private.order_trash` (`supabase_v46_order_trash.sql`; how to see or restore one is at the top of that file).
- **Access requests:** **Delete** removes a request (they can ask again). **Reject** removes it and stops that number from asking again (the website says the request was not accepted). **Rejected numbers** at the bottom of the requests page → **Allow again**.
- **Setup:** run `supabase_v44_edit_details.sql`, then `supabase_v35_admin_team.sql` again. Re-run v44 after re-running v34 or v42. Until then the panel and app work as before (name only).

## Security documents
`SECURITY_REPORT.md` (summary, status, top risks, manual checklist) · `SECURITY_REVIEW.md` (attacker review, open findings)
· `SECURITY_MAP.md` (map + every check) · `SECURITY_RUNBOOK.md` (what to do in an incident) · `RESTORE.md` (backups) · `tests/` (break-it tests).

## Security checks (repository)
- `scripts/check-exposed.sh --local` scans the repository; `scripts/check-exposed.sh` asks the live site for files that must not be served. `.github/workflows/security.yml` runs gitleaks (whole history) on every push and the live check every Monday.
- Pre-commit hook against committing secrets: `git config core.hooksPath .githooks` (uses gitleaks if installed). `.env.example` lists the secret names; the values live only in Supabase / GitHub settings.
- `send-push` answers browsers only from the site's own addresses: `https://aspironeducation.com`, `https://www.aspironeducation.com` and the old `https://aspiron-dev.github.io` (Edge Function secret `ALLOWED_ORIGINS`, comma separated). Full map: `SECURITY_MAP.md`.

## Rank in one fixed order (`supabase_v50_rank_order.sql`)
- No two students share a rank: 1. more marks, 2. fewer wrong answers, 3. more marks in Biology, 4. Chemistry, 5. Physics, 6. less time, 7. submitted earlier. Used by the student leaderboard / "Your rank" and Admin → Results → a test → Top students (`cbt_admin_ranks`).
- **Setup:** `supabase_v49_v50_all_in_one.sql` runs v49 + v50 + v35 in one go.

## Answer sheet of an attempt (`supabase_v49_answer_sheet.sql`)
- Admin → Results → the list icon on a result opens its **answer sheet**: every question with the student's option, the correct option today, right / wrong / skipped, seconds spent, and the medium (हिंदी attempts show the Hindi text next to the English).
- It counts the score again with today's answer key. If that differs from the saved score, the key or marks were changed after the attempt; **Re-grade** (Results · manage) saves the new score. It also lists saves of the test after the attempt and the student's other attempts of that test.
- **Setup:** run `supabase_v49_answer_sheet.sql` (after v48), then `supabase_v35_admin_team.sql` again.

## Low-risk review fixes (`supabase_v48_review_low.sql`)
- Buyers' IP addresses: keyed hash, cleared after 30 days (nightly job). A test marked practice that still has a Live ends / result time ahead gives no instant answers until then (the admin is warned).
- Team members giving access or changing orders / payments show on the owner's bell. Promotions → orders mark an order from the promoter's own number.
- Student access codes are changed over to bcrypt at the next sign-in with the code (signed-in phones stay signed in). "Too many requests" answers HTTP 429.
- Admin console: no inline script allowed (CSP). `send-push` can use a new secret key (`SB_SECRET_KEY`, SECURITY_RUNBOOK.md §7); the backup can use a read-only login (BACKUP.md).
- **Setup:** run `supabase_v48_review_low.sql` (after v47), then `supabase_v35_admin_team.sql` again; redeploy `send-push`.

## Results, data deletion and security alerts (`supabase_v47_alerts_results.sql`)
- **Result time:** score, rank and answer key stay hidden until the result time; a live test with only **Live ends** keeps them hidden until Live ends.
- **Delete student** (Admin → Students) now removes everything about the student (results, saved questions, reports, phones, notifications, reviews, number history). Store orders and payments stay. Students cannot download or delete their data themselves; they ask on chat (privacy notice, section 6).
- **Security alerts:** Admin → Team & access → **Security alerts** (owner only, also on the bell): wrong passwords, wrong 2FA codes, locked sign-ins, student lock-outs, too many requests, refused actions, team / password / 2FA changes, recovery codes, members giving access or changing orders. Serious ones fail the GitHub check **Security alerts** every hour, so GitHub e-mails you (uses the `SUPABASE_DB_URL` secret of the backup).
- **Setup:** run `supabase_v47_alerts_results.sql` (after v46), then `supabase_v35_admin_team.sql` again.

## Checklist C + D fixes (`supabase_v45_checklist_cd.sql`)
- The access-request form gives the same answer for every number; a student changing their own number cannot take a number with someone else's store order, "Notify me", rejected request or recent previous owner; push subscriptions only for the real push services.
- In `supabase_v35_admin_team.sql`: Team & access → **Require two-step sign-in for the team**; a password reset in the SQL Editor signs the owner out everywhere.
- Also in v35 (runs last): the `authenticated` role (Supabase Auth, not used here) can run no `cbt_*` function, and trigger functions cannot be called directly; the website's `anon` access is kept function by function.
- App: banner links only http/https or `#/`; a file opens in "View" only if its first bytes are a real PDF/photo. Admin: new passwords are checked against leaked-password lists.
- **Setup:** run `supabase_v45_checklist_cd.sql` (after v44), then `supabase_v35_admin_team.sql` again, then redeploy `send-push`.

## Live test end time, rank cut-off and limits (`supabase_v43_test_rules.sql`)
- A live test attempt ends at **Live ends** at the latest: started at 8:58 with Live ends 9:00 → auto-submitted at 9:00. No new attempt until the result time; after it, re-attempts are open, but the test rank and the overall rank count only first attempts submitted by Live ends (+2 minutes).
- Per student per hour: 30 new attempts, 120 opened reviews, 60 PYQ chapters (stops bulk copying of the question bank); a sign-in token works only with its own phone.
- Admin → Tests → Cover & files → **Opens at** on a file: students can open it only from that time (e.g. solutions after the test).
- **Setup:** run `supabase_v43_test_rules.sql`, then `supabase_v35_admin_team.sql` again. Re-run v43 after re-running v11, v30, v33, v39, v41 or v42. See `SECURITY_MAP.md` for the full security map.

## Security fixes from the audit (`supabase_v42_audit_fixes.sql`)
- Files (PDFs) of a paid series open only for students who have that series.
- Store: an order code is never handed out again (a new order every time); 20 wrong order codes an hour from one connection are refused.
- Student sign-in: after the code is typed once, the phone keeps a sign-in token (`st1.…`), not the code. It ends on sign-out, after 180 days without use, or when the admin gives a new code. Phones that still keep a code switch to a token by themselves on the next open.
- Promotion clicks: one per connection per link per hour. Waiting list: only the last 7 days count towards its limit.
- Admin (in `supabase_v35_admin_team.sql`): a connection that signed in correctly in the last 60 days is not stopped by the shared lock. `send-push` accepts only an admin sign-in session (redeploy it).
- All pages refuse to show inside another site's frame; pdf.js runs with `isEvalSupported: false`.
- **Setup:** run `supabase_v42_audit_fixes.sql`, then `supabase_v35_admin_team.sql` again, then redeploy `supabase/functions/send-push` (Verify JWT off).
- Also in `supabase_v35_admin_team.sql` (v35.3): admin and team passwords are kept with bcrypt (an old password changes to bcrypt at its next correct sign-in); every admin request starts with clean permission notes; no `cbt_private` function can be run from outside and every SECURITY DEFINER function has `pg_temp` last in its search path. `send-push` no longer returns internal error text.

## English + हिंदी medium in the same series (`supabase_v41_medium.sql`, `app19.js`, `cx/lang.js`)
One test series, one store item, one price — each student gets the tests in their own medium.
- **Series:** Admin → Test studio → a series → **Medium → English + हिंदी**. The store then shows "English + हिंदी medium" on the card and Explore page, and asks *English medium / हिंदी माध्यम* at **Buy now**. The order keeps the medium (shown on the order in Admin → Orders and in the student's Telegram / WhatsApp message), and when you unlock the series for that student (Approve & unlock, or Students → access) their medium for that series is set by itself.
- **Making a test (6 simple steps, nothing mixed):** **1 Details** (name, series, marks) → **2 Questions** — only questions and options: English paper on the left, हिंदी paper on the right, both with the same tool (Paste text / PDF / Word / Photo with Hindi OCR / old file) and a review before adding; each Hindi question is shown next to the English one of the same number, and a different count is flagged. Hindi numbers (१ २ ३), "प्रश्न 1", (अ)…(द) and (क)…(घ) options are read. *Copy English paper* copies it to translate → **3 Answer key** — English key on the left, हिंदी key on the right (optional): a question has one answer for both languages, the Hindi key is checked against the English one and every difference is listed (tap the right letter to settle it) → **4 Solutions** (optional) — English and हिंदी solutions with the same tool → **5 Check & edit** — every question with an English | हिंदी switch; a question's हिंदी tab has its Hindi question, options and solution (images, section and answer are shared) → **6 Time & publish** — live / result times, checklist, Publish (the Hindi is saved with the test).
- **When Hindi is given:** only when **every** question and option has Hindi text, saved after the last change of the English questions. The builder, the series page and the test list show *हिंदी ✓*, *हिंदी 30/50* or *हिंदी out of date*. An incomplete or outdated Hindi is never mixed in: Hindi-medium students get that whole test in English, and their instructions page says so before the start. A Hindi solution left empty shows the English solution.
- **No switching mid-test:** the language is fixed by the server when the attempt starts (`sessions.lang`) and only that language is sent. Resume, refresh, another phone or a medium change while the test runs all keep it. The result, answer key and solutions of that attempt come in the same language (`results.lang`); mistakes and saved questions follow the student's current medium.
- **Student app:** the series page shows *Your medium* with **Change** (or asks to choose); the new instructions page shows questions, minutes, max marks, the marking scheme, the medium the questions will come in, the timer / palette / buttons rules and the live-test times — all in Hindi for a Hindi-medium student. The test bar shows a हिंदी badge, the leave-screen warning is in Hindi too, and the result shows the medium. The admin can see / change a student's medium in Students → the student → Access → *Medium*.
- **Setup:** run `supabase_v41_medium.sql` once, then `supabase_v35_admin_team.sql` again. Until then the app, store and panel work as before in English only. v41 replaces `cbt_start`, `cbt_submit`, `cbt_review`, `cbt_mistakes` and `cbt_bookmarks`: run it again after re-running `v30_result_time` or `v33_live_one_attempt`.

## Many students at once (`supabase_v39_scale.sql`, `app1.js`, `app3.js`)
Made for 500–1000 students taking a test at the same time.
- **Database:** indexes for start, auto-save, submit, home page and leaderboard (added only where none exists). The sign-in check that runs on every request no longer rewrites the student's row each time (only on a wrong code, a new phone, or every 5 minutes for "last seen"). The overall rank (home page leaderboard, Insights) is worked out at most once every 30 seconds and kept in a table, instead of ranking every result on every visit, so a new result shows there within 30 seconds; the test leaderboard is still instant.
- **App:** auto-save during a test goes to the server at most every 10–15 s (answers are still kept on the phone at once, and sent when the app is closed or hidden). When time runs out, phones submit within a random 0–5 s instead of all in the same second (still on time: the server allows 2 minutes). A failed submit is tried again after 5, 10, 20 … 60 s with a little randomness. Requests that are safe to repeat (loading tests, starting a test, auto-save, results, leaderboards …) are tried up to 2 more times when the server says it is busy.
- **Setup:** run `supabase_v39_scale.sql` once; re-run it after re-running v34, v30 or v25.

## Admin console (`cx/`) and team access (`supabase_v35_admin_team.sql`)
- The admin console is built from `cx/core.js`, `cx/ui.js`, `cx/shell.js`, one `cx/m-*.js` file per section and `cx/cx.css`; see `cx/README.md` for how modules are written.
- **Owner** signs in with the admin password. **Team members** get their own username + password from *Team & access*, with No access / View / Full per section (Students, Payments, Tests & content, Results, Integrity, Store & orders, Promotions, Messaging, Reviews). The database checks these permissions on every request (every `cbt_admin…` function is wrapped by v35).
- Every sign-in is a session: *Team & access → Where signed in* shows device, approximate IP and last activity, and can sign out any session or everyone. Sessions end after 30 days without use (180 days at most). With **Keep me signed in** ticked there is no 15-minute auto sign-out on that device (Settings can turn it on again). *Activity log* lists every change and every refused request.
- Before v35 is run, the owner can still sign in with the password (no team, sessions or log).
- **Two-step sign-in (2FA)**, in v35: Settings → *Two-step sign-in* → Turn on (password, scan the QR code with Google / Microsoft Authenticator, type the code, save the 10 recovery codes). From then on that account needs the password **and** the 6-digit code; for the owner the password alone opens nothing anywhere (backup panel included, which also asks for the code). The owner sees who has it on in *Team & access* and can reset a member's (lost phone). Owner lost the phone and the recovery codes: Supabase → SQL Editor → `delete from cbt_private.admin_totp where acct = 'owner';`
- **Passwords and limits:** new admin and team passwords need 10+ characters with letters and numbers (not "aspiron", "admin", "password"…). Wrong passwords lock that connection for 15 minutes after 10 tries; 100 wrong owner passwords (or 100 wrong team passwords) in an hour from everywhere lock that sign-in for 15 minutes; 5 wrong codes lock the account's codes for 15 minutes.

 (run once each, in this order, in SQL Editor — on top of the original base setup)
`supabase_v9_banners` → `v10_push` → `v11_pyq` → `v12_test_alerts` → `v13_store` → `v17_store_fix` →
`v18_store_schedule` → `v19_store_security` → `v20_store_payer` → `v21_devices` → `v22_alerts_via_send_push` →
`v23_reviews` → `v24_cheating` → `v25_cheat_leaderboard` → `v26_lift_fix` → `v27_lift_fix2` → `v28_store_followup` → `v29_payments` → `v30_promotions` → `v30_store_explore` → `v31_store_soon` → `v30_result_time` → `v32_store_layout` → `v33_live_one_attempt` → `v34_attack_fixes` → `v35_admin_team` → `v36_notice_audience` (then run `v35_admin_team` once more) → `v38_store_cleanup` (only removes the unused store function of the dropped v37 “Let's study”; safe if v37 was never run) → `v39_scale` → `v40_series_msg` (then run `v35_admin_team` once more) → `v41_medium` (then run `v35_admin_team` once more) → `v42_audit_fixes` → `v43_test_rules` → `v44_edit_details` → `v45_checklist_cd` → `v46_order_trash` → `v47_alerts_results` → `v48_review_low` → `v49_answer_sheet` → `v50_rank_order` (then `v35_admin_team` once more; `v49_v50_all_in_one` does these three). Every file is safe to run again; run `v42_audit_fixes` again after re-running v19, v20, v21, v31, v34 or v39; if you re-run an older file (for example `v25_cheat_leaderboard`), run `v30_result_time`, `v33_live_one_attempt`, `v34_attack_fixes`, `v39_scale`, `v41_medium`, `v43_test_rules`, `v47_alerts_results` and `v48_review_low` again afterwards (and v48 after any re-run of v47), because it replaces some of the same functions. Run `v35_admin_team` again after any file that (re)creates a `cbt_admin…` function (for example after re-running v30_result_time): until then team members cannot use that part (the owner's password always works). Then `v52_coupons_refer` (then `v35_admin_team` once more). `supabase_check_alerts.sql` only reads (for checking alerts). `supabase_security_check.sql` only reads too: it lists the permissions, RLS and public functions, so run it after any database change.

**Database backup:** every night GitHub Actions saves a locked (AES-256) copy of the whole database for 90 days (`.github/workflows/db-backup.yml`); setup from a phone and restore steps: `BACKUP.md`.

Never put the admin password or a secret / service_role key in `config.js` or anywhere in this repository.

## New look (Aspiron Lux) and Classic — `design-v2.css`, `app21.js`
> **Switched off.** The student app uses the original (Classic) design for everyone again; `design-v2.css` is not loaded
> and the Design switch is hidden. To bring the new look back: load `design-v2.css` in `index.html` again and set `ds` from `cbt_ds`
> in the theme script (see PR #121). The PDF notes button (`app21.js`, `supabase_v51_test_pdf.sql`) stays on in the original design.

- The student app opens in the **new look** by default. Theme settings (palette button) → **Design** → *New look* / *Classic*.
  Classic is the old design exactly (its CSS is untouched; `design-v2.css` only applies to `html[data-ds="v2"]`).
  The choice is saved on the phone (`cbt_ds`); each design keeps its own colour (`cbt_accent_v2` / `cbt_accent`). No data changes.
- Colours: Black (Dark / True Black) and Light, each with Champagne gold (default), Yellow, Emerald, Blue ice, Graphite, Rose.
- Menu (new look): Home · Tests · Library · Store · Me. Phones: bar at the bottom; computers/tablets: menu on the left.
  **Library** (`#/lib`): Mistakes, Saved, PYQ, Notes & PDFs (`#/notes`), tools (Marks calculator, Focus timer).
  **Me** (`#/me`): Results & ranks, Study tracker, Notices, Profile, Appearance, Help, Sign out.
- Look: flat surfaces, thin lines, one solid accent colour (no gradients or glow), serif page titles, underlined tabs.
- **PDF notes per test** (`supabase_v51_test_pdf.sql`, run once in Supabase): Admin → Test studio → a test's ⋯ menu → *PDF notes link*
  (owner only). Paste a Google Drive / Docs link shared as "Anyone with the link → Viewer". Students see a **PDF** button next to the
  test and the file in Library → Notes & PDFs. Only `https://drive.google.com/…` and `https://docs.google.com/…` links are accepted
  (checked on the server and in the app), and a student only gets links of tests they can open.
