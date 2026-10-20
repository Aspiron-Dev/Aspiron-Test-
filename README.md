# Aspiron CBT Test Series

Static website on GitHub Pages + Supabase (database functions). No build step: upload the files and they are live.

## Pages
| Page | What it is | Scripts |
|---|---|---|
| `index.html` | Student app (tests, results, mistakes, tracker, PYQ, reviews) | `config.js`, `app1.js` … `app15.js`, `pyq-syllabus.js` |
| `cp-dt764twzf54s5m.html` | Admin panel (needs the private access key + admin password) | `config.js`, `parser.js`, `admin1.js` … `admin18.js`, `pyq-syllabus.js` |
| `store.html` | Public store: name + mobile once, paid series, Explore page (description, schedule, demo tests, reviews), Coming soon · Notify me, UPI payment, verify on Telegram / WhatsApp (message + payment screenshot), ratings & reviews, light / dark theme | `store-theme.js`, `config.js`, `qrcode.js`, `store.js` |
| `admin.html` | Decoy "404" page (the real admin page has a hidden name) | – |

Scripts load in number order; a later file adds to or replaces functions of earlier ones.
After changing a script, raise its `?v=` number in the page that loads it so phones get the new copy.

Other files: `sw.js` (installable app, always loads the newest pages), `manifest.webmanifest` /
`cp-dt764twzf54s5m.webmanifest` (app icons and names), `pyq-data/` (past papers for the admin PYQ import),
`lib/` (exact copies of pdf.js 3.11.174, JSZip 3.10.1 and Tesseract.js 5.1.1 from npm, so the admin page runs no script from a third-party CDN;
the OCR worker and language data still load from jsDelivr / tessdata as before),
`supabase/functions/send-push` (phone notifications and 🔔 test-live alerts).

## Supabase SQL (run once each, in this order, in SQL Editor — on top of the original base setup)
`supabase_v9_banners` → `v10_push` → `v11_pyq` → `v12_test_alerts` → `v13_store` → `v17_store_fix` →
`v18_store_schedule` → `v19_store_security` → `v20_store_payer` → `v21_devices` → `v22_alerts_via_send_push` →
`v23_reviews` → `v24_cheating` → `v25_cheat_leaderboard` → `v26_lift_fix` → `v27_lift_fix2` → `v28_store_followup` → `v29_payments` → `v30_store_explore` → `v31_store_soon`. Every file is safe to run again. `supabase_check_alerts.sql` only reads (for checking alerts). `supabase_security_check.sql` only reads too: it lists the permissions, RLS and public functions, so run it after any database change.

Never put the admin password or a secret / service_role key in `config.js` or anywhere in this repository.
