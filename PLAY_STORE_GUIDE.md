# Play Store par Aspiron Education app kaise daalein (step-by-step)

Ye guide ek non-technical owner ke liye likhi gayi hai. Website (`https://aspironeducation.com`) hi app ban jaayegi: ek chhota Android "wrapper" banta hai jo website ko full-screen app ki tarah khol deta hai. Naya code likhne ki zaroorat nahi.

## Pehle samajh lo: kharcha, samay aur 3 zaroori rules

**Kharcha**
- Google Play Developer account: **$25 (lagbhag ₹2,100, exchange rate ke hisaab se badalta hai), sirf ek baar.** Ye Google ko dena padega, isliye ye aapka faisla hai.
- Baaki sab tools free hain: PWABuilder (browser mein), GitHub Pages (pehle se chal raha hai), Play Console ka upload.
- Mera kaam: is repo mein koi paid service, workflow ya billing add nahi ki gayi hai.

**Rule 1: Payment (sabse zaroori)**
Store abhi UPI se test series bechta hai. Google Play ke rules ke hisaab se app ke andar **digital content** (test series, subscription) bechna aam taur par Google Play Billing se hota hai, UPI se nahi. Agar app mein UPI payment khula raha to Play review mein **reject** ho sakta hai. Teen rasta hai:
1. App mein sirf dekhne ka content rakhein aur kharidne ke liye website par bhejein (Google ke "external purchase" rules padh lein, kuch shart hain).
2. Play Billing add karvayein (developer ka kaam, Google ka commission lagta hai).
3. Pehle Google Play Payments policy khud padh kar faisla karein.

Ye faisla hone se pehle Play Console par publish na karein. Exact current rule ke liye Google Play Console ki "Payments policy" dekhein.

**Rule 2: Account delete**
Jin apps mein login hota hai, Google ko users ke liye **account delete karne ka rasta** chahiye. Hamari `privacy.html` (section 6) mein ye likha hai; uska link Play Console mein dena hoga.

**Rule 3: Testers**
Naye personal developer accounts ko aksar pehle **closed testing** karni padti hai: Console mein jo number dikhe (aksar 12–20) utne testers, lagaatar 14 din tak. Iske baad hi Production par release ho sakti hai. Testers ki Gmail list pehle se taiyaar rakhein (friends / students).

---

## Step 1: Google Play Console account banao ($25)

1. `https://play.google.com/console` par apne Gmail se sign up karein.
2. Account type: **Personal**.
3. Identity verification: ID proof aur address maangte hain. Pura karne mein 1–2 din lag sakte hain.
4. $25 ka payment **debit/credit card** se karein.

## Step 2: App file (`.aab`) banao: PWABuilder (free, browser mein)

Is step mein koi installation nahi. Sirf browser chahiye.

1. `https://www.pwabuilder.com` kholo.
2. Box mein URL daalo: `https://aspironeducation.com` → **Start**.
3. Report mein score dekho (manifest, icons, service worker). Ye sab already theek hai.
4. **Package for stores** → **Android** choose karo.
5. Options bharo:
   - **Package ID:** `com.aspironeducation.app` (ye ek baar Play par upload ke baad badal nahi sakta, isliye sochkar rakhein)
   - **App name:** Aspiron Education
   - **Launcher name:** Aspiron
   - **App version:** 1.0.0, **Version code:** 1
   - **Signing key:** "Create new" choose karo
   - **Theme / background color:** `#f8f6f1` (app ki ivory theme)
6. **Generate** → zip file download hogi.

Zip ke andar milega:
- `app-release-signed.aab`: **Play Console par ye upload hoga.**
- `app-release-signed.apk`: sirf apne phone par test karne ke liye.
- `signing-key.keystore` aur ek password file: **sabse zaroori.**
- `assetlinks.json`: Step 3 mein kaam aayega.

> **⚠️ Signing key ko bachaiye:** `.keystore` file aur password **do alag jagah** safe rakhein (jaise private Google Drive aur ek pendrive). Ye kho gayi to aap app ko kabhi update nahi kar paoge. Ise kisi bhi website ya GitHub par upload na karein (`.gitignore` mein ye files pehle se block hain).

## Step 3: Website ko app se jodo (`assetlinks.json`)

Iske bina app khulegi to upar browser ka URL bar dikhega, yani full-screen app nahi lagegi.

1. Zip ki `assetlinks.json` kholo. Usme `sha256_cert_fingerprints` ki value hogi.
2. **Play Console → Setup → App integrity** mein jaao. Wahan **"App signing key certificate"** ka **SHA-256** fingerprint dikhega (Play App Signing ke liye ye Google ki key hai aur alag hoti hai). Ye bhi copy karo.
3. Dono fingerprints ko ek hi file mein daalo. Format ye hona chahiye:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aspironeducation.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:...(aapki upload key ka SHA-256)",
        "DD:EE:FF:...(Play App Signing key ka SHA-256)"
      ]
    }
  }
]
```

4. Ye file GitHub repo mein is path par upload karein: **`.well-known/assetlinks.json`** (folder ka naam dot se shuru hota hai, yahi sahi hai).
5. Browser mein `https://aspironeducation.com/.well-known/assetlinks.json` kholo. JSON dikhna chahiye. Agar 404 aaye to 2–3 minute ruk kar dobara dekhein (GitHub Pages ko time lagta hai).

## Step 4: Apne phone par test karo

1. `app-release-signed.apk` phone par bhejo aur install karo (Settings mein "unknown apps se install" allow karna hoga).
2. Check karo:
   - App full-screen khulti hai, upar URL bar nahi dikhta.
   - Login, test dena, results, store sab chalta hai.
   - Phone band karke dobara kholne par bhi sab theek hai.

## Step 5: Play Console mein app banao aur details bharo

**Create app:** naam, default language (English / Hindi), App (not game), Free.

**Store listing** (Grow → Store presence → Main store listing):
- **Short description** (80 characters tak): NEET aur JEE ke online mock tests, rank aur analysis.
- **Full description** (4000 tak): kya milta hai, kaise kaam karta hai, kaun use kar sakta hai.
- **App icon:** 512×512 PNG, repo ki `icon-512.png` use karein.
- **Feature graphic:** 1024×500 PNG. (Ye main banane mein madad kar sakta hoon.)
- **Phone screenshots:** kam se kam 2, phone se lee gayi (login ke baad ke pages).

**App content** (Policy → App content):
- **Privacy policy URL:** `https://aspironeducation.com/privacy.html`
- **Ads:** No (agar koi ad nahi hai).
- **App access:** reviewer ke liye ek **demo student login** (email aur password) dena hoga, warna review ruk sakta hai.
- **Target audience:** students ki age ke hisaab se. 13 saal se chhote bachon ko target karne par extra rules lagte hain, isliye sochkar choose karein.
- **Content rating:** questionnaire bharein (aam taur par education app ke liye simple).
- **Data safety:** batana padega ki kaunsa data (naam, email, phone, payment record) collect hota hai aur kyun. Ye `privacy.html` se milta hua hona chahiye.
- **Account deletion:** link `privacy.html` ka section 6 ya app ka delete option.

## Step 6: Upload karo aur test shuru karo

1. **Testing → Closed testing → Create track** → `app-release-signed.aab` upload karo.
2. Testers ki Gmail list add karo (12–20, jo Console maange).
3. Release review ke liye bhejo.
4. 14 din baad, testers ki shart poori ho to **Production** par **Create new release** karke wahi (ya naya) `.aab` daalo. Review aam taur par 1–7 din leta hai (naye account ke liye zyada bhi ho sakta hai).

## Step 7: Baad mein update kaise karein

- **Website mein badlaav** (naya page, price, text, design): kuch nahi karna. Website live hote hi app mein dikh jaata hai.
- **App ka naam, icon, package ya Android version badalna:** naya `.aab` banana padega, **version code badhakar** (2, 3…), **usi signing key** se. Phir Production par upload.

---

## Kaun kya karega

| Kaam | Kaun | Kab |
|---|---|---|
| Google Play account, $25, ID verification | **Aap** | Sabse pehle |
| PWABuilder se `.aab` banana | **Aap** (5 min, browser se) | Step 2 |
| Signing key ka backup | **Aap** | Step 2 ke turant baad |
| `.well-known/assetlinks.json` GitHub par upload | **Aap** (Console se fingerprint lekar) | Step 3 |
| Payment ka faisla (Rule 1) | **Aap** | Publish se pehle |
| Screenshots, demo login, testers list | **Aap** | Step 5–6 |
| Store text, privacy/data safety ke jawab ka draft | Mujhse maango | Kabhi bhi |
| Feature graphic (1024×500) design | Mujhse maango | Step 5 |
| Website ya repo mein code badlaav | Mujhse maango | Jab zaroorat ho |

## Aam problems

- **Upar URL bar dikh raha hai:** `assetlinks.json` galat hai ya `.well-known` par nahi mila. Fingerprint dobara check karein (dono, upload aur Play App Signing).
- **Review mein reject:** message padhein. Aam wajah: payment policy, account delete, demo login missing, privacy link.
- **Phone par purani version:** Play Store se app delete karke dobara install karein.

Agar kisi step par atak jaayein to screenshot ya error message bhejein, main wahin se aage guide kar dunga.
