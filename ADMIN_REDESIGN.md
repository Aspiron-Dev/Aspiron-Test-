# Admin panel redesign — audit, route register and plan

Source of truth: *Aspiron Admin Panel Redesign Brief* (owner's PDF). Same app, same database, same routes — nothing new
was built next to it. Every claim below names the file it comes from.

## 1. Audit (Phase 1)

**Architecture.** Static site on GitHub Pages (`CNAME`, `_config.yml`), no build step. The admin console is
`cp-dt764twzf54s5m.html` (hidden name; `admin.html` is a decoy 404). It loads `config.js`, `cx/core.js` (safe HTML,
API, permissions, router), `cx/ui.js` (components), one `cx/m-*.js` per page and `cx/shell.js` (sign-in, layout,
navigation). Data = Supabase PostgreSQL, reached only through `SECURITY DEFINER` RPC functions (`supabase_v*.sql`).

**Auth and RBAC (server side).** `supabase_v35_admin_team.sql`:
- Owner (password) or team member (username + password) → session token `as1.…`, 30 days idle / 180 days max,
  revocable (`admin_session_ok`). Page key gate (`cp-dt764twzf54s5m.html` + `admin_gate`, v62).
- Two-step sign-in (TOTP + recovery codes), owner can require it for the team (`cbt_admin_2fa`).
- Permissions: 9 modules × view / manage (`AX.MODS` in `cx/core.js`; `admin_need()` maps every function + action to
  what it needs). Unknown function = refused for team members. Hidden buttons are not the security: the wrapper
  around every `cbt_admin*` function checks it in the database.
- Activity log: every change and every refused call → `admin_audit` (who, function, action, detail, result, IP).
- Security alerts: `security_events` (v47/v62) → bell, Team & access → Security alerts, Telegram (v63), daily
  GitHub e-mail (`.github/workflows/security-alerts.yml`).

**Payments.** UPI to the owner's account; the student sends the screenshot on Telegram / WhatsApp; an admin approves the
order (`cbt_admin_store_order`). Payment success is never taken from the browser. There is **no payment gateway and so
no webhook** yet (Razorpay / Cashfree waits for the legal pages — `PENDING.md` Phase 3).

**Storage.** Test PDFs and images are stored inside database tables (`cbt_admin_files`, `file_parts`); Supabase
Storage is only read if it is used. Student PDFs are served through functions that check access (`cbt_file_part`).

**Connected services (evidence).**
| Service | Evidence | Cost today |
|---|---|---|
| Supabase (DB, Edge Function) | `config.js` SUPABASE_URL, `supabase/functions/send-push` | Free plan |
| GitHub Pages | `CNAME` | Free |
| GitHub Actions | `.github/workflows/*.yml` | Free minutes |
| Web Push (VAPID) | `config.js` VAPID_PUBLIC, `sw.js` | Free |
| Telegram bot | `supabase_v63_telegram_alerts.sql` | Free |
| Google Fonts, jsDelivr (OCR files), pwnedpasswords | CSP in `cp-dt764twzf54s5m.html` | Free |

**Tests (run for this change, real database, real browser).** `tests/db/break_it.sql`: 220 checks pass.
`tests/e2e/admin.js`, `xss_admin_store.js`, `student.js`, new `admin_tour.js` (every menu page × computer/phone ×
light/dark): see the commit message for the counts.

### Risks and gaps found (vs the brief)
| # | Finding | Status |
|---|---|---|
| A1 | **Bug:** Admin → PYQ bank → Papers always failed ("column reference n is ambiguous", `supabase_v11_pyq.sql`). | **Fixed** (v11 + v70, test 35h) |
| A2 | No view of storage use / free-plan limits; Supabase Free pauses or refuses writes when full. | **Done:** Storage page (v70) |
| A3 | No place for bills, budgets, renewals. | **Done:** Billing & costs page (v70) |
| A4 | Phone / e-mail shown in full to everyone with "students" view (brief §7 wants masked + reveal logged). | Open — Phase 4 |
| A5 | Roles are per-module switches, not the 7 named roles of the brief. | Open — presets on top of the same switches (Phase 7) |
| A6 | Re-login before refund / role change / export / delete. Today: confirm dialog (+ password for team changes). | Open — Phase 7 |
| A7 | No payment gateway → no webhook / idempotency to build yet. | Waits for gateway (owner) |
| A8 | Bandwidth, Actions minutes, Edge Function calls: only the provider can see them. | Shown as "Not available from provider" |
| A9 | GitHub Pages cannot send HTTP security headers (CSP is a meta tag). | Cloudflare step, `PENDING.md` Phase 7 |

## 2. Route register (old → new)
Routes did not change (no redirect needed); only the menu groups did.
| Route | Module file | New group | Server function(s) | Permission | Test |
|---|---|---|---|---|---|
| `#/home` | m-home.js | Command centre | cbt_admin2 overview … | any | tour ✓ |
| `#/students` | m-students.js | Students & accounts | cbt_admin students…, cbt_admin_edit | students | tour ✓ |
| `#/tests` | m-tests/builder/import.js | Tests & questions | cbt_admin test_*, cbt_admin_files | content | tour ✓ |
| `#/live` | m-live.js | Tests & questions | cbt_admin3 live | results | tour ✓ |
| `#/reports` | m-reports.js | Tests & questions | cbt_admin reports | content | tour ✓ |
| `#/integrity` | m-integrity.js | Tests & questions | cbt_admin_cheat, cbt_admin_suspects | integrity | tour ✓ |
| `#/pyq` | m-pyq.js | Tests & questions | cbt_admin_pyq | content | tour ✓, 35h |
| `#/qbank` | m-qbank.js | Tests & questions | cbt_admin_qbank | content | tour ✓ |
| `#/results` | m-results.js | Analytics | cbt_admin results, cbt_admin_sheet, cbt_admin_ranks | results | tour ✓ |
| `#/storage` **new** | m-ops.js | Content & storage | cbt_admin_ops storage | owner | tour ✓, 35a–b |
| `#/orders` | m-orders.js | Sales & billing | cbt_admin_store_order … | store | tour ✓ |
| `#/payments` | m-payments.js | Sales & billing | cbt_admin_payments, cbt_admin_money | payments | tour ✓ |
| `#/store`, `#/look`, `#/seriespage` | m-store/look/seriespage.js | Sales & billing | cbt_admin_store* | store | tour ✓ |
| `#/offers` | m-offers.js | Sales & billing | cbt_admin_coupons, cbt_admin_refer | store | tour ✓ |
| `#/promos` | m-promos.js | Sales & billing | cbt_admin_promos | promotions | tour ✓ |
| `#/messages`, `#/social` | m-messaging/social.js | Communication | cbt_admin_ann, banners, push | messaging | tour ✓ |
| `#/reviews`, `#/testfb` | m-reviews/testfb.js | Communication | cbt_admin_reviews, cbt_admin_test_reviews | reviews | tour ✓ |
| `#/billing` **new** | m-ops.js | Costs & integrations | cbt_admin_ops costs / budget_set / cost_* | owner | tour ✓, 35a–g |
| `#/team` | m-team.js | Team & security | cbt_admin_team, cbt_admin_security, cbt_admin_telegram | any (owner tabs) | tour ✓, admin.js |
| `#/settings` | m-settings.js | Team & security | cbt_admin_2fa … | any | tour ✓, admin.js |

## 3. Design (v3 "Graphite & Champagne")
Same family as the student app (`v3.css`): warm paper, graphite, champagne-gold, Geist. New structure, not a recolour:
- **Menu:** a floating graphite rail of 9 sections (Home, Students, Tests, Analytics, Storage, Sales, Messages, Costs,
  Security); the pages of the open section are a strip under the top bar. Phones: floating dock + a tile menu.
- **Page:** one dark hero card per page (title, subtitle, actions; the main action is gold), then white cards.
- **Motion:** one entrance per page, numbers count up once, cards lean towards the pointer on computers;
  all off with "reduce motion".
- Files: `cx/cx2.css` (looks), `cx/shell.js` (rail, strip, motion). `cx/cx.css` stays the base layer. Routes, data
  and permissions did not change. Light is the default; dark is one tap away.

## 4. What next, and which model
| Phase | Work | Model |
|---|---|---|
| 4 | Student profile: mask phone/e-mail by default, "Reveal" logged in the activity log (A4); profile polish | **Opus** (SQL + permission) then Sonnet (screens) |
| 5 | Payment gateway (after legal pages): webhook verify, idempotency, refunds, GST invoice | **Fable** (rules review) + Opus |
| 6 | Integration health cards + issues list; provider usage via a free Edge Function (needs owner's provider tokens) | Opus + Sonnet |
| 7 | Role presets (Super Admin … Security Auditor) on top of today's switches; re-login for refund/export/delete (A5, A6) | Opus + **Fable** review |
| 8 | Release checklist, changelog | Haiku |
