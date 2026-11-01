# Security review — thinking like an attacker (item 83)

Date: 2026-11-01. Code: `main` + this branch. Method: every way a student, a buyer, a team member or a stranger could
cheat or break in, tried against the real SQL functions in a throw-away test database (`tests/db`) and the real pages in
Chromium (`tests/e2e`). **[T]** = tested, **[C]** = code read. Findings R1–R13 are **not fixed yet** — they wait for the
owner's go-ahead (item 84) and will be fixed one by one in severity order.

## 1. What an attacker tried that FAILS today (kept as CI tests — `tests/db/break_it.sql`, 45 checks)
| Attack | Result |
|---|---|
| Call any of the 36 student functions signed out / with a wrong code | refused [T] |
| Call any admin function (96 calls) with no / wrong / forged session / `' or 1=1--` | refused [T] |
| Read the answer key at the start of a live test (English and Hindi) | not sent [T] |
| Open a paid test or a paid series' PDF from a free account | `locked` [T] |
| See score, rank, answers, bookmarks' answers, mistakes before the result time | hidden [T] |
| Student A opens student B's result | `not_found` [T] |
| Send `{"score":999}` with the answers | ignored, graded on the server [T] |
| Submit twice / change answers after submit | same result / `no_session` [T] |
| Keep writing after the time is over; submit late | save `over`; late result never ranked [T] |
| Start at 8:58 with "Live ends" 9:00 to get 3 hours | the attempt ends at 9:00 [T] |
| Copy the question bank (start many tests quickly) | 31st new attempt in an hour → `busy` [T] |
| Put `<script>` / `<img onerror>` in names and forms | stripped on the server; escaped in every page [T] |
| Read or change any table directly with the public key | `permission denied` [T] |
| Take over someone's order knowing only their mobile; guess order codes; inflate promo clicks | blocked [T] |
| Reuse a stolen student token on another phone / number, or after sign-out | `invalid` [T] |
| Team member with view access deletes, opens payments, opens the team page | `forbidden` [T] |
| Owner password alone with two-step sign-in on; reuse a TOTP code | `need_2fa` / `otp_invalid` [T] |
| Point push notifications at another server (SSRF) | refused [T] |
| Move an account onto a buyer's number to steal the purchase | `taken` [T] |
| Delete a paid order to hide it | kept in `order_trash` [T] |
| Frame a page (clickjacking), run script from a banner link or an uploaded HTML file | blocked [T] |

## 2. Findings (open)
| # | Sev | Finding | Where | What an attacker gets | Fix (after go-ahead) | Verify |
|---|---|---|---|---|---|---|
| **R1** | **Medium** | A test with **"Live ends" but no result time** returns the full answer key to whoever submits first, while others are still writing it. [T] | `cbt_private.res_hidden` `supabase_v30_result_time.sql:24`, used by `cbt_submit` `supabase_v41_medium.sql:291` | Finish early → forward the key (WhatsApp) to friends still in the live window → inflated ranks. | Treat results as hidden until `coalesce(result_at, closes_at)`: change `res_hidden` / `res_visible` (one place, used everywhere). | `tests/db/open_findings.sql` R1 turns FIXED; move it to `break_it.sql`. |
| **R2** | **Medium** | Personal data rights (DPDP Act 2023): no way for a student to get or delete their data; admin "Delete student" removes only the student row (results, reviews, push subscriptions, test alerts, device info stay); the in-app notice still says profile details stay "on your own phone" though e-mail and number history are now stored online. [T] (mock) / [P] (FK cascades in production) | `student_delete` `supabase_v30_result_time.sql:566`; notice `app6.js:546` | Not an attack — a legal / trust risk: data kept after a deletion request, notice not accurate. | Admin "Delete student" removes or anonymises every related row (orders/payments kept for accounts, without the mobile); student "Download my data" + "Ask to delete my account" (owner approves); update the privacy notice (what is stored, why, how long, how to ask). | Open finding R2 turns FIXED; manual read of the new notice. |
| **R3** | **Medium** | No alerts and no lasting record of attacks: failed admin/team sign-ins and wrong 2FA codes are only counters, student lock-outs and rate-limit hits are not logged, nobody is told when a new admin is added or many sign-ins fail. Admin actions, refused calls and sign-ins **are** logged (`admin_audit`). [C] | `admin_fails` / `adm_fail` (v35), `auth` lock (`supabase_v43_test_rules.sql:91`), `rate_ok` (v43) | Brute force or abuse goes unnoticed until damage is done. | `security_events` table (kind, hashed IP, when) written at: wrong admin/team password, wrong code, student lock, `busy`, new team member, permission change; owner bell + "Security" card with 24 h counts and thresholds; daily summary in the Activity log. | Wrong passwords ×10 → event rows + owner bell. |
| R4 | Low | IPs are stored as `md5('cbt-store|' || ip)` etc. — reversible for IPv4 by trying all addresses; kept forever in store orders / notify. [C] | `supabase_v42_audit_fixes.sql:204,312` | A database leak reveals buyers' IP addresses. | Keyed hash (secret kept in `cbt_private.settings`) and clear IPs after 30 days. | Hash differs from plain md5; rows older than 30 days have no IP. |
| R5 | Low | A test marked **practice** sends answers at start; if a live test is marked practice by mistake, the key leaks. [C] | `cbt_start` `supabase_v43_test_rules.sql:175` | Answer key of a live test (admin mistake). | Server: no answers at start while the test has a future "Live ends"/result time; admin form warns when practice + live times are set together. | Practice test with Live ends → no answers at start. |
| R6 | Low | Insider abuse: a member with Students "Full" can give a paid series free; Store "Full" can approve an order without payment. Logged, but nobody is told. [C] | `admin_need` `supabase_v35_admin_team.sql:284` | Free access given away quietly. | Owner alert (R3) for grants/approvals by members; weekly "free grants" list. | Member grants a series → owner bell. |
| R7 | Low | Supabase may still have the **legacy** JWT `anon`/`service_role` keys enabled next to the new keys. [P] | Supabase → Settings → API Keys | A legacy key copied long ago still works. | Check whether anything uses them (Edge Function env, cron); if not, disable legacy keys and test notifications. | Old key refused; notifications still sent. |
| R8 | Low | Self-referral: a buyer can open their own promotion link before buying. [C] | `cbt_promo_attach` `supabase_v42_audit_fixes.sql:264` | Commission on one's own purchase (only if the admin pays it). | Admin payout screen flags orders whose mobile = the promoter's contact. | Flag shown. |
| R9 | Low | Admin page CSP still allows `unsafe-inline` + `unsafe-eval` (OCR, old panel). [C] | `cp-dt764twzf54s5m.html:21` | Makes any future XSS in the admin page easier. | Remove the old panel when no longer needed; test OCR with `wasm-unsafe-eval`. | Admin works with the stricter CSP. |
| R10 | Info | Student codes: salted sha256 of 8 hex chars (accepted: phones keep tokens; codes only checked when typed). | `hash_code` | A full DB leak lets codes be guessed offline. | bcrypt on next code login (with token re-pointing). | — |
| R11 | Info | Backup uses the full `postgres` login (G6). | `SUPABASE_DB_URL` secret | A leaked GitHub secret = full DB access. | Read-only role, tested on Supabase first. | — |
| R12 | Info | Security headers need a custom domain behind Cloudflare (`SECURITY_MAP.md` §11). | GitHub Pages | Clickjacking only stopped by script. | When a domain is added. | — |
| R13 | Info | Limits answer `{"error":"busy"}` with HTTP 200 instead of 429 + Retry-After (PostgREST RPC). | v42, v43 | — | Accepted: the app shows a wait message. | — |

Accepted / by design: account sharing by copying a whole phone's browser data; function names visible in the public repo
and the Supabase API listing (security never depends on hiding them).
