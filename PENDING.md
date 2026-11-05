# Pending kaam: task list (Aspiron Education)

Shuru: 4 Nov 2026. Ek-ek task karke chalenge. Jo task ho jaye, uska `[ ]` badal kar `[x]` kar do.
**Cloudflare sabse aakhir me (Phase 7).**

**Kaun karega:** 👤 Aap (owner) · 🤖 Claude (isi repo me code) · 👥 Dono milkar

**Ye order kyon:**
- Naam, logo aur email sabse pehle chahiye, kyunki legal pages, homepage aur payment gateway teeno me lagte hain.
- Legal pages ke bina Razorpay / Cashfree approve nahi karte.
- Cloudflare aakhir me, taaki DNS ek hi baar shift ho aur saare records (email, Search Console) ek saath copy ho jayein.

**Har 🤖 task ke baad:** Claude branch par push karega → aap PR merge karoge → yahan tick.

---

## Phase 1: Jo pehle se bana hai, use on karo (👤 Aap, lagbhag 1 ghanta)
Live database Claude ko nahi dikhta. Jo kaam pehle hi ho chuka ho, use seedha tick kar do.

- [x] **1.1 SQL files chalao.** Supabase → SQL Editor me, isi order me:
  `supabase_v47_alerts_results.sql` → `supabase_v35_admin_team.sql` → `supabase_v48_review_low.sql` → `supabase_v35_admin_team.sql`
  → `supabase_v49_v50_all_in_one.sql` → `supabase_v51_test_pdf.sql` → `supabase_v52_coupons_refer.sql` → `supabase_v35_admin_team.sql`.
  *Kaise pata chalega ho gaya:* Admin → Coupons & Refer khulta hai aur "setup" nahi maangta.
- [x] **1.2 `send-push` redeploy karo** (Verify JWT off rakhna). Edge Function secret `VAPID_SUBJECT` me ek asli `mailto:` email daalo
  (Task 2.3 ke baad naya email daal dena). *Check:* Admin → Broadcasts se test notification phone par aata hai.
- [x] **1.3 2FA on karo:** GitHub, Supabase, dono Gmail, Telegram, domain registrar.
- [x] **1.4 GitHub settings:** Settings → Code security → Secret scanning + Push protection ON. Settings → Pages → Enforce HTTPS ON.
- [x] **1.5 GitHub Actions** → "Backup restore drill" → Run workflow. "Security alerts" → Run workflow. *Check:* dono green.
- [x] **1.6 Admin → Team & access:** jo log chale gaye unhe hatao, jahan ho sake Full ki jagah View do, "Require two-step sign-in" ON karo.
- [ ] **1.7 R11, backup ke liye read-only login:** `supabase_backup_role.sql` chalao + GitHub secret `SUPABASE_BACKUP_DB_URL` (`BACKUP.md` → "Read-only login").
- [ ] **1.8 R7, purani Supabase keys band karo:** `SECURITY_RUNBOOK.md` §7 (naya secret key → test notification → tab legacy keys off).
  Notification test kiye bina keys band mat karna.
- [ ] **1.9** Backup password aur 2FA recovery codes kagaz par likh kar offline rakho.

## Phase 2: Brand aur email (pehchaan)
- [ ] **2.1 👤 Naam aur logo final karo.** Ye chahiye:
  - Poora naam jo har jagah dikhega (jaise "Aspiron Education")
  - Chhota naam, phone icon ke neeche dikhne wala (lagbhag 12 letters)
  - Tagline
  - Logo PNG, 1024×1024, transparent background
  - Brand colour

  Tool: Canva.
- [ ] **2.2 🤖 Branding lagana:** `config.js` (SITE_NAME), `manifest.webmanifest`, page titles, app icons (192 / 512 / maskable / apple-touch),
  app aur store ka header. Admin console ka naam ("Aspiron Control") waisa hi rahega. *Check:* phone par app install karo, naam aur icon sahi dikhein.
- [ ] **2.3 👥 Professional email:** Zoho Mail (free plan) → domain add karo → registrar ke DNS me ye records daalo:
  TXT (verify), MX, SPF, DKIM, DMARC → `support@aspironeducation.com` banao (chaho to `admin@` bhi). Claude records ki list aur check me madad karega.
  *Check:* Gmail se support@ par mail bhejo aur jawab do. mail-tester.com par score 9 ya usse zyada.
  **Saare DNS records yahan note kar lo, Cloudflare (Phase 7) me copy karne honge.**
  - [ ] Naya email `VAPID_SUBJECT` (1.2) me daalo.

## Phase 3: Public pages (legal, homepage, SEO)
- [ ] **3.1 👤 Business details do:**
  - Legal naam (proprietor ya firm)
  - Poora address
  - Support email
  - Refund ka niyam (jaise "series start hone se 7 din pehle tak poora refund, koi test attempt karne ke baad refund nahi")
  - Grievance officer ka naam + email (DPDP Act 2023 ke liye)
  - GST number (agar hai)
- [x] **3.2 🤖 Legal pages, public address par:** ✅ bane: privacy.html, terms.html, refund.html (refund + delivery), contact.html. Baaki: email (aaj) aur address milte hi Contact page me jodna. `privacy.html`, `terms.html`, `refund.html`, `contact.html`, aur Delivery policy
  (digital product ka access kab milta hai, ye payment gateway maangte hain). App aur store me inke links lagenge.
  App ke andar wale Terms aur privacy notice inhi se match karenge. 👤 Ek baar CA / lawyer se padhwa lena.
- [ ] **3.3 👤 Homepage ke liye content do:**
  - Courses: NEET / JEE, kaunsi series, fees
  - Toppers: photo + naam + marks (unki permission ke saath)
  - Faculty: photo, naam, subject, experience
  - 4–6 student reviews aur 6–8 FAQ
  - Social links: YouTube, Instagram, Telegram
- [ ] **3.4 🤖 Homepage banana:** hero, courses, results, faculty, reviews, FAQ, contact, aur footer me legal links. "Login" (app) aur
  "Buy test series" (store) ke buttons. Student app kis address par khulega, ye isi task me decide karenge, taaki phone me
  installed app, notifications aur purane links na tootein. *Check:* phone aur computer dono par sahi dikhe, PageSpeed 85 ya usse zyada.
- [ ] **3.5 🤖 SEO:**
  - Har public page par title + description
  - Open Graph tags, taaki WhatsApp par link ka preview aaye
  - `robots.txt` aur `sitemap.xml`
  - Admin aur andar ke app pages search me na aayein (noindex)

  👤 Preview image, 1200×630 (Canva). *Check:* WhatsApp par link bhejne par photo + title dikhe.
- [ ] **3.6 👤 Google Search Console:** URL-prefix property `https://aspironeducation.com/` → "HTML file" se verify karo (file 🤖 repo me daal dega;
  isse DNS nahi chhedna padta aur Cloudflare par shift karne ke baad bhi verify bana rehta hai) → sitemap submit karo.
  Bing Webmaster Tools → "Import from Google Search Console". Agar coaching ka physical centre hai to Google Business Profile bhi banao.

## Phase 4: Payment gateway aur store login
- [ ] **4.1 👤 Razorpay ya Cashfree me se ek choose karo aur KYC apply karo.** Chahiye: PAN, bank account, address proof, business / proprietor proof.
  Approval me kuch din lagte hain, isliye legal pages (3.2) live hote hi apply kar dena. Form me website aur legal pages ke links dena.
- [ ] **4.2 🤖 Gateway jodna:**
  - Supabase Edge Functions banenge (order create + webhook signature check)
  - Payment hote hi order approve, series unlock aur approval message apne aap
  - Coupon aur wallet wala amount sahi lage
  - Manual UPI backup ke liye rahega

  👤 Key ID aur Secret sirf Supabase secrets me daalna, repo me kabhi nahi.
  *Check:* test mode me ₹1 ka order → series apne aap unlock. Galat signature → refuse. Iske break-it tests bhi add honge.
- [ ] **4.3 👥 Store login (wallet ki safety ke liye):** Email OTP, Supabase Auth se. Email bhejne ke liye Brevo ya Resend (free plan;
  domain verify 2.3 ke DNS ke saath hoga). SMS OTP baad me (DLT registration + har SMS ka kharcha). *Check:* bina login wallet use nahi hota.

## Phase 5: Safai aur speed
- [ ] **5.1 Purana admin panel hatana:** 👤 confirm karo ki naya admin console poori tarah use ho raha hai, phir 🤖 purana panel hatayega
  (`cp-dt764twzf54s5m-old.html` aur `admin1.js`–`admin19.js`). Isse security finding R9 bhi kam hoti hai.
- [ ] **5.2 🤖 Band kiya hua "New look" design** (`design-v2.css`) hatana ya rakhna (👤 aapka faisla). README ka purana section bhi theek hoga.
- [ ] **5.3 🤖 Speed:** fonts 5 se 2, posters aur banners WebP me. pagespeed.web.dev ki report pehle aur baad me.

## Phase 6: Launch se pehle
- [ ] **6.1 👤 Supabase Pro** (lagbhag $25/month, current price check kar lena): bade live test (500+ students) se pehle le lo. Spend cap ON rakhna.
- [ ] **6.2 👤 UptimeRobot (free):** `https://aspironeducation.com/` aur `store.html` monitor karo, alert email / Telegram par.
- [ ] **6.3 👥 Practice launch:** 20–30 students ke saath poora flow chala kar dekho: live test → result → payment → notification.

## Phase 7: Cloudflare (sabse aakhir me)
- [ ] **7.1 👤 Cloudflare account (free) → Add site.** Cloudflare purane DNS records khud import karta hai. **Check karo** ki list me ye sab hain:
  email (MX, SPF, DKIM, DMARC), Brevo / Resend, aur GitHub Pages ke records.
- [ ] **7.2 👤 Nameservers badlo:** registrar me Cloudflare wale nameservers lagao. Poori tarah lagne me kuch ghante lagte hain.
- [ ] **7.3 👥 DNS records:** `@` ke liye 4 A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
  `www` ke liye CNAME `aspiron-dev.github.io`. Pehle "DNS only" (grey cloud) rakhna. GitHub Pages me domain aur HTTPS check karo,
  phir proxy ON (orange cloud) aur SSL/TLS mode = Full.
- [ ] **7.4 👥 Security headers:** `SECURITY_MAP.md` §11 wale headers, Rules → Transform Rules → Response headers me.
  CSP `frame-ancestors` pehle ek hafta Report-Only rakhna. *Check:* securityheaders.com par grade A. R12 band.
- [ ] **7.5 👤 Cloudflare Web Analytics ON** (sirf homepage aur store par). 🤖 CSP aur privacy notice update karega.
- [ ] **7.6 🤖 Aakhri check:** `scripts/check-exposed.sh` ka live check aur saare tests green. README aur SECURITY docs update.

## Phase 8: Optional
- [ ] **8.1 Play Store app:** PWABuilder → Android package → Google Play Console ($25, ek baar ka) → `.well-known/assetlinks.json`.
