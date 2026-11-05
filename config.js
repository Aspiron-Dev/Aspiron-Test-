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
  // Social media profile links. Full https:// URL only; leave "" to hide that link everywhere on the website.
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

// Social links, joined with " · ". Returns "" when none are filled in, so nothing shows until a link is added.
// Round icon buttons (inline SVG, colour follows the text colour). Inline SVG is allowed by the page CSP.
window.socialLinksHTML = function () {
  const S = (window.CBT_CONFIG && CBT_CONFIG.SOCIAL) || {};
  const sv = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const icons = {
    instagram: { label: "Instagram", svg: sv('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>') },
    facebook:  { label: "Facebook",  svg: sv('<path d="M15 3h-2.5C10.6 3 9.5 4.3 9.5 6.5V10H7v3h2.5v8h3v-8H15l.5-3h-3V7c0-.8.3-1.2 1.2-1.2H15z"/>') },
    youtube:   { label: "YouTube",   svg: sv('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>') },
    telegram:  { label: "Telegram",  svg: sv('<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l7-6"/>') },
    whatsapp_channel: { label: "WhatsApp Channel", svg: sv('<path d="M3 20.5l1.2-3.9A8.5 8.5 0 1 1 7.6 19z"/><path d="M9 8.8c0 2.6 2.6 5.2 5.2 5.2l.9-1.3-2-1-.7.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.7-1-2z"/>') }
  };
  const btns = Object.keys(icons)
    .filter(k => /^https:\/\/[^\s"'<>]+$/.test(S[k] || ""))
    .map(k => `<a class="soc-btn" href="${S[k]}" target="_blank" rel="noopener" aria-label="${icons[k].label}" title="${icons[k].label}">${icons[k].svg}</a>`)
    .join("");
  return btns ? `<span class="soc-row">${btns}</span>` : "";
};
// Fills every element marked data-social (store footer, contact page) and hides it when empty.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-social]").forEach(function (el) {
    const h = window.socialLinksHTML();
    const label = el.getAttribute("data-social-label");
    el.innerHTML = h ? (label ? "<b>" + label + "</b> " : "") + h : "";
    el.hidden = !h;
  });
});
