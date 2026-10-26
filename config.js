// ---- SETTINGS ----
// The Supabase "publishable" key is meant to be public. Never put an admin
// password or a "secret" / "service_role" key in this file.
window.CBT_CONFIG = {
  SUPABASE_URL: "https://klvvhbqkhbdzysgpykpr.supabase.co",
  SUPABASE_KEY: "sb_publishable_pt-b8kuOOsxyyAz277qsNA_q6e8D2G3",
  SITE_NAME: "CBT Test Series",
  // Student support (chat only, no calls) — shown everywhere a student can ask for help: app, store, payment verify
  SUPPORT_URL: "https://t.me/Students_support_teams",      // Telegram
  SUPPORT_WA: "https://wa.me/message/47QZ42AJBL4AE1",      // WhatsApp: a wa.me link, or a number with country code ("" hides WhatsApp)
  SUPPORT_WA_NUMBER: "917665619133",   // WhatsApp number of the support team: used only inside the WhatsApp buttons (never shown as text), so the message is already written in the chat, like Telegram
  TG_CHANNEL: "https://t.me/+1gxzLpz91LtmNDM9",   // Telegram channel link put in messages sent to students (leave "" to hide)
  SHORT_URL: "https://aspiron-dev.github.io/Aspiron-Test-/",   // website link put in messages sent to students (opens instantly, no shortener)
  // Web Push (notifications when the app is closed). Public key only — the private key lives in Supabase secrets.
  VAPID_PUBLIC: "BMbCxWsFmWCBrfBf073L9m9uo1zkwhVvGrbe7C21ho2ToTvcXFTgpjjKsSxLjoT-O8UMyx1qXSRJ_gMAbQyN9TA"
};
