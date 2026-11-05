// ---- SETTINGS ----
// The Supabase "publishable" key is meant to be public. Never put an admin
// password or a "secret" / "service_role" key in this file.
window.CBT_CONFIG = {
  SUPABASE_URL: "https://klvvhbqkhbdzysgpykpr.supabase.co",
  SUPABASE_KEY: "sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3",
  SITE_NAME: "Aspiron Education",
  // Student support (chat only, no calls) — shown everywhere a student can ask for help: app, store, payment verify
  SUPPORT_URL: "https://t.me/Students_support_teams",      // Telegram
  SUPPORT_WA: "https://wa.me/message/47QZ42AJBL4AE1",      // WhatsApp: a wa.me link, or a number with country code ("" hides WhatsApp)
  SUPPORT_WA_NUMBER: "917665619133",   // WhatsApp number of the support team: used only inside the WhatsApp buttons (never shown as text), so the message is already written in the chat, like Telegram
  TG_CHANNEL: "https://t.me/+1gxzLpz91LtmNDM9",   // Telegram channel link put in messages sent to students (leave "" to hide)
  SHORT_URL: "https://aspironeducation.com/",   // website link put in messages sent to students (opens instantly, no shortener)
  // Social media links are managed in Admin → Social media (supabase_v57_social.sql). These are only the fallback, used
  // until that SQL file is installed (or on a first visit with no internet). Full https:// links; "" = hidden.
  SOCIAL: {
    youtube: "",
    instagram: "https://www.instagram.com/aspironeducation/",
    telegram: "https://t.me/AspironEducation",
    facebook: "",
    whatsapp_channel: "https://whatsapp.com/channel/0029VbE8vNvBvvsddM1RDV0u"
  },
  // Web Push (notifications when the app is closed). Public key only — the private key lives in Supabase secrets.
  VAPID_PUBLIC: "BMbCxWsFmWCBrfBf073L9m9uo1zkwhVvGrbe7C21ho2ToTvcXFTgpjjKsSxLjoT-O8UMyx1qXSRJ_gMAbQyN9TA"
};

// ---- Social media links: website footer, store, Contact page, student app menu ----
// Every platform the site knows, in the order shown. The keys and sites match supabase_v57_social.sql
// (cbt_private.social_hosts): a link must be https:// on that platform's own site, or it is not shown.
window.SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], hint: "https://www.instagram.com/yourpage",
    icon: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>' },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], hint: "https://www.facebook.com/yourpage",
    icon: '<path d="M15 3h-2.5C10.6 3 9.5 4.3 9.5 6.5V10H7v3h2.5v8h3v-8H15l.5-3h-3V7c0-.8.3-1.2 1.2-1.2H15z"/>' },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], hint: "https://www.youtube.com/@yourchannel",
    icon: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>' },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"], hint: "https://x.com/yourname",
    icon: '<path d="M4 4h4.5L20 20h-4.5z"/><path d="M20 4l-6.6 7.3M4 20l6.6-7.3"/>' },
  { key: "telegram", label: "Telegram", hosts: ["t.me", "telegram.me"], hint: "https://t.me/yourchannel",
    icon: '<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l7-6"/>' },
  { key: "whatsapp_channel", label: "WhatsApp Channel", hosts: ["whatsapp.com"], hint: "https://whatsapp.com/channel/…",
    icon: '<path d="M3 20.5l1.2-3.9A8.5 8.5 0 1 1 7.6 19z"/><path d="M9 8.8c0 2.6 2.6 5.2 5.2 5.2l.9-1.3-2-1-.7.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.7-1-2z"/>' },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"], hint: "https://www.linkedin.com/company/yourpage",
    icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.5v.01M12 17v-6.5M12 13.5c0-1.9 1.1-3 2.6-3S17 11.6 17 13.5V17"/>' },
  { key: "pinterest", label: "Pinterest", hosts: ["pinterest.com", "pinterest.co.in", "pin.it"], hint: "https://www.pinterest.com/yourname",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M11.2 20.6l1.5-7.1M11.6 15c.5.4 1.2.6 1.9.6 2.2 0 3.7-1.9 3.7-4.4 0-2.6-2.1-4.4-4.8-4.4-3 0-5 2-5 4.6 0 1.1.4 2.2 1.2 2.7"/>' },
  { key: "threads", label: "Threads", hosts: ["threads.net", "threads.com"], hint: "https://www.threads.net/@yourname",
    icon: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.3a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>' }
];
(function () {
  if (typeof document === "undefined") return;   // the service worker loads this file too: settings only there
  const P = window.SOCIAL_PLATFORMS;
  // same check as cbt_private.social_url_ok in the database
  const urlOk = window.socialUrlOk = function (key, u) {
    const p = P.find(x => x.key === key);
    if (!p || typeof u !== "string" || u.length > 300 || !/^https:\/\/[^\s"'<>\\]+$/.test(u)) return false;
    const m = /^https:\/\/([^/?#:@]+)(?:[/?#:]|$)/.exec(u); if (!m) return false;
    const host = m[1].toLowerCase();
    return p.hosts.some(h => host === h || host.endsWith("." + h));
  };
  window.socialIcon = (key, size) => {
    const p = P.find(x => x.key === key), s = size || 18;
    return p ? `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p.icon}</svg>` : "";
  };
  // the links from the database (Admin → Social media), kept on this device so they show at once next time.
  // null = not loaded yet: the fallback in CBT_CONFIG.SOCIAL is used.
  let cur = null;
  try { const c = JSON.parse(localStorage.getItem("cbt_social") || "null"); if (c && typeof c === "object" && !Array.isArray(c)) cur = c; } catch (e) {}
  window.socialLinks = () => { const S = cur || (window.CBT_CONFIG && CBT_CONFIG.SOCIAL) || {}; return P.filter(p => urlOk(p.key, S[p.key])).map(p => ({ key: p.key, label: p.label, url: S[p.key] })); };
  // round icon buttons; "" when none, so nothing (not even a heading) shows
  window.socialLinksHTML = function () {
    const btns = window.socialLinks().map(l => `<a class="soc-btn" href="${l.url}" target="_blank" rel="noopener" aria-label="${l.label}" title="${l.label}">${window.socialIcon(l.key)}</a>`).join("");
    return btns ? `<span class="soc-row">${btns}</span>` : "";
  };
  // fills every element marked data-social (store footer, Contact page), hides it when empty, and tells the app
  function fill() {
    const h = window.socialLinksHTML();
    document.querySelectorAll("[data-social]").forEach(function (el) {
      const label = el.getAttribute("data-social-label");
      el.innerHTML = h ? (label ? "<b>" + label + "</b> " : "") + h : "";
      el.hidden = !h;
    });
    try { document.dispatchEvent(new Event("social:change")); } catch (e) {}
  }
  let loading = null;
  // fetch the current links once per page (public, read only: supabase_v57_social.sql → cbt_social)
  window.socialLoad = function () {
    if (loading) return loading;
    const C = window.CBT_CONFIG || {};
    loading = fetch(C.SUPABASE_URL + "/rest/v1/rpc/cbt_social", { method: "POST", body: "{}",
        headers: { apikey: C.SUPABASE_KEY, Authorization: "Bearer " + C.SUPABASE_KEY, "Content-Type": "application/json" } })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j || j.ok !== true || !Array.isArray(j.links)) return;   // SQL not installed yet, or offline: keep what we have
        const m = {};
        j.links.forEach(l => { if (l && typeof l.platform === "string" && urlOk(l.platform, l.url)) m[l.platform] = l.url; });
        const changed = JSON.stringify(m) !== JSON.stringify(cur);
        cur = m;
        try { localStorage.setItem("cbt_social", JSON.stringify(m)); } catch (e) {}
        if (changed) fill();
      })
      .catch(() => {});
    return loading;
  };
  // pages with a data-social spot load the links by themselves; the student app calls socialLoad() (app27.js)
  document.addEventListener("DOMContentLoaded", function () {
    fill();
    if (document.querySelector("[data-social]")) window.socialLoad();
  });
})();
