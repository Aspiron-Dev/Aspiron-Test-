# Security report — Aspiron CBT (item 86)

Date: 2026-11-01. Scope: student app, store, admin console (+ old backup panel), Supabase database (all `supabase_v*.sql`),
Edge Function `send-push`, GitHub repository and workflows. Details: `SECURITY_MAP.md` (map + checklists A–G),
`SECURITY_REVIEW.md` (attacker review, open findings), `SECURITY_RUNBOOK.md`, `RESTORE.md`, `tests/`.

## A. Executive summary
1. The app is in a much stronger state than at the start of the audit: 0 Security Advisor errors, server-checked logins and
   permissions everywhere, 2FA + bcrypt for admins, sign-in tokens for students, encrypted daily backups, secret scanning.
2. 45 "break it" attacks run on every push against the real SQL and pass; browser tests cover the student app, store and admin.
3. Both High findings (F1 paid PDFs, F2 pdf.js) and the Medium ones found so far (F3, F4, G1, G9) are fixed, plus the Low/Info
   items listed below; 3 Medium findings remain open (R1 answer key in a live window without a result time, R2 data-deletion /
   privacy rights, R3 no security alerts) — their fixes wait for your go-ahead.
4. Limits of this audit: production was never accessed directly (tests ran on a copy built from code + the 20 Oct export);
   GitHub Pages cannot send security headers.
5. This does not mean the app is "fully secure"; it means the known risks are listed, tested where possible and ranked.

## B. Status of every check (evidence in `SECURITY_MAP.md`)
| Area | Items | PASS | Open / partial | N/A |
|---|---|---|---|---|
| A. Test series | 1–11 | 1–11 | — (R1 found later, see R1) | 11-webhook |
| B. Supabase / DB | 12–22 | 12–19, 21, 22 (0 errors; 83 warnings by design) | 20 (backup role R11) | 16 (no buckets) |
| C. Auth & admin | 23–36 | 23–29, 32, 34–36 | — | 30, 31, 33 |
| D. Input & frontend | 37–46 | 37–41, 43–46 | — | 42 |
| E. Secrets & repo | 47–54 | 47–53 | 54 (public repo, accepted) | 50 (no leak) |
| F. Dependencies | 55–59 | 55–59 | — | — |
| G. Network & deploy | 60–69 | 60, 61, 63–66 | 62 (headers need a domain), 67 (Supabase API listing, accepted) | 68, 69 |
| H. Monitoring & accounts | 70–75 | 71, 75 | 70 & 72 (R3), 73 & 74 (owner's manual items, R7) | — |
| I. Privacy & recovery | 76–80 | 79 (restore drill), 80 (runbook) | 76 (R4), 77 (R2) | 78 (no e-mail sent) |
| J. AI | 81–82 | — | — | 81, 82 (no AI feature) |
| K. Final | 83–87 | 83, 85, 86, 87 | 84 (fixes after go-ahead) | — |

Notes: 70 — admin actions, refused calls, sign-ins, role/permission and 2FA changes are logged (`admin_audit`); failed sign-ins
and lock-outs are counters only. 71 — no password/token in the audit log or Edge Function logs. 75 — Supabase Free with spend
cap, no card; GitHub free; no SMS/e-mail/AI. 76 — only name, mobile, optional e-mail, device ids; no analytics or error tracker.

## C. Findings by severity
| Severity | Fixed | Open |
|---|---|---|
| Critical | — | — |
| High | F1 (paid PDFs open to any student), F2 (pdf.js crafted PDF) | — |
| Medium | F3 (order takeover by mobile), F4 (no backup), G1 (question-bank copying), G9 (purchase hijack by number change) | R1, R2, R3 |
| Low | F5–F9, G3, G4, G5, G10, G11; checklist items 26, 27, 29, 34, 40, 43, 45, 48, 49, 53, 55, 56, 59, 61, 64 | R4–R9 |
| Info | F10, F12–F14, G8 (F11, G2, G7 accepted / decided) | R10–R13 (accepted) |

## D. Top 5 risks now
1. **R1** — answer key reaches early finishers when a test has "Live ends" but no result time (until fixed: always fill both).
2. **R2** — personal-data rights and an outdated privacy notice (DPDP Act 2023).
3. **R3** — attacks or insider misuse would not raise any alert.
4. **Insider access** — a member with Full access can give series/approve orders (logged only); keep team small, use View.
5. **Production drift** — the live database may differ from the repository; run new SQL in the README order, v35 last.

## E. Fix order (after your go-ahead, one at a time)
R1 → R2 → R3 (+R6 alerts) → R4 → R5 → R7 (with you, in the dashboard) → R8 → R9 → R10/R11 (optional).

## F. Testing plan from here
- Every push / PR: `tests.yml` (45 database attacks + student/admin browser tests) and `security.yml` (gitleaks, repo files).
- After every change to `main` and every Monday: live-site check (`scripts/check-exposed.sh`).
- 1st of every month: backup restore drill; daily: encrypted backup.
- Every new feature: add its attack checks to `tests/db/break_it.sql`; move an open finding there once fixed; never weaken a check.
- Every 3 months or before a big launch: repeat this review (SECURITY_MAP checklists).

## G. Unresolved risks and audit limitations
- No direct production access: production functions and foreign keys were checked only through the 20 Oct export, your
  screenshots (Security Advisor 0 errors, SSL on, no buckets/views) and repository code.
- The live website could not be fetched from this environment; the live checks run in GitHub Actions instead.
- Open: R1–R13 (above). Accepted: function names public, account sharing by copying a phone's browser data, HTTP 200 "busy".
- Third parties not audited: Supabase, GitHub, Google Fonts, jsDelivr/Tesseract data, push services.

## Manual checklist (only you can do these)
- [ ] 2-step login ON: GitHub, Supabase, the Gmail of both, Telegram, domain registrar (when bought).
- [ ] GitHub → Settings → Code security: Secret scanning + Push protection ON; Pages → Enforce HTTPS ON.
- [ ] Supabase → Settings → API Keys: check legacy keys (R7) — do **not** disable without testing notifications.
- [ ] Team & access: remove people who left; give View instead of Full where possible; turn on "Require two-step sign-in".
- [ ] Keep the backup password, 2FA recovery codes and SECURITY_RUNBOOK contacts on paper, offline.
- [ ] Actions → Backup restore drill → Run workflow once now; check green monthly.
- [ ] Never change Supabase → Data API settings (exposed schema must stay `public`).
- [ ] Before a test: fill both "Live ends" and "Result time" (until R1 is fixed).
