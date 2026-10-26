// Supabase Edge Function: send-push
// Sends a phone notification to the students who turned notifications on, even when the website / app is closed.
//
// Needs these secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC   – same value as VAPID_PUBLIC in config.js
//   VAPID_PRIVATE  – the private key (never put this in GitHub)
//   VAPID_SUBJECT  – optional but recommended, e.g. mailto:you@yourmail.com (a real address; Apple can refuse example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with "Verify JWT" OFF (the site calls it with the public key only; the admin password is checked here).
//
// Body: { pw, title, body, url?, tag?, series?, after?, limit? }   (pw = admin password / session, checked with cbt_admin 'ping')
//   series = test series ids → only students of those series (supabase_v36_notice_audience.sql); empty = everyone.
//   limit  = phones per call. The admin panel sends `limit` and calls again with `after` = the returned `next` until `done`,
//            so a big list never runs past the function's time limit (that used to stop sending part-way).
//            Without `limit` (an old panel) everything is sent in one call, as before.
// Body: { mode: "due" }   → called every minute by pg_cron (several workers at once, see v36):
//   sends "test is LIVE now" to students who tapped 🔔 on that test, once, when it opens.
//   No password needed: it only sends alerts that are already due and marks each one sent.
// Body: { mode: "info", vapid? } → { v: 2, vapid: secrets set?, key_ok: does `vapid` match VAPID_PUBLIC? } (no password; no secrets returned)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PAGE_MAX = 200;    // phones per call at most
const DUE_ALERTS = 100;  // "LIVE now" alerts per worker per minute
const AT_ONCE = 25;      // notifications in flight at the same time

// deno-lint-ignore no-explicit-any
type DB = any;
type Sub = { endpoint: string; p256dh: string; auth: string; mobile?: string };
type Stats = { sent: number; removed: number; failed: number; codes: Record<string, number>; sample: string[]; dead: string[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "body" }, 400); }

  const pub = Deno.env.get("VAPID_PUBLIC") || "", priv = Deno.env.get("VAPID_PRIVATE") || "";
  if (b.mode === "info") return json({ ok: true, v: 2, vapid: !!(pub && priv), key_ok: typeof b.vapid === "string" ? b.vapid === pub : null });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (b.mode === "due") return dueAlerts(db, pub, priv, Number(b.w) || 1);

  // admin password check (same password / session as the admin panel)
  const { data: auth, error: aerr } = await db.rpc("cbt_admin", { p_pw: String(b.pw || ""), p_action: "ping", p_data: {} });
  if (aerr || !auth || !(auth as { ok?: boolean }).ok) return json({ ok: false, error: (auth as { error?: string })?.error || "invalid" }, 401);

  if (!pub || !priv) return json({ ok: false, error: "vapid_missing" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

  const payload = JSON.stringify({
    title: String(b.title || "New notice").slice(0, 80),
    body: String(b.body || "").slice(0, 200),
    url: String(b.url || "#/n").slice(0, 300),
    tag: String(b.tag || "ann-" + Date.now()).slice(0, 80),
  });
  const series = (Array.isArray(b.series) ? b.series : [])
    .filter((x): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)).slice(0, 40);
  const paged = b.limit !== undefined && b.limit !== null;
  const limit = paged ? Math.min(Math.max(Math.floor(Number(b.limit)) || 120, 1), PAGE_MAX) : PAGE_MAX;
  let after = String(b.after || "");

  const st: Stats = { sent: 0, removed: 0, failed: 0, codes: {}, sample: [], dead: [] };
  let total = 0, done = false;
  for (;;) {
    const page = await targets(db, series, after, limit);
    if (page.error) return json({ ok: false, error: page.error, detail: page.detail }, 500);
    const list = page.rows;
    total += list.length;
    await sendMany(list.map((s) => ({ s, payload, ttl: 86400 })), st);
    if (list.length) after = list[list.length - 1].endpoint;
    done = list.length < limit;
    if (done || paged) break;          // the panel asks for the next page itself
  }
  await removeDead(db, st);
  return json({ ok: true, v: 2, sent: st.sent, removed: st.removed, failed: st.failed, total, done, next: after,
                codes: st.codes, sample: st.sample, hint: hint(st) });
});

// one page of phones, in endpoint order
async function targets(db: DB, series: string[], after: string, limit: number): Promise<{ rows: Sub[]; error?: string; detail?: string }> {
  const r = await db.rpc("cbt_push_targets", { p_series: series.length ? series : null, p_after: after, p_limit: limit });
  if (!r.error) return { rows: (r.data || []) as Sub[] };
  // v36 not installed yet: a series notice must never go to everyone
  if (series.length) return { rows: [], error: "setup", detail: "Run supabase_v36_notice_audience.sql to send to chosen series." };
  const q = await db.from("cbt_push_subs").select("endpoint,p256dh,auth,mobile").gt("endpoint", after).order("endpoint").limit(limit);
  if (q.error) return { rows: [], error: "db" };
  return { rows: (q.data || []) as Sub[] };
}

// send with a few at a time; one more try for a passing problem (busy push service, network); dead addresses are noted
async function sendMany(jobs: { s: Sub; payload: string; ttl: number; done?: (ok: boolean, passing: boolean) => void }[], st: Stats) {
  for (let i = 0; i < jobs.length; i += AT_ONCE) {
    await Promise.all(jobs.slice(i, i + AT_ONCE).map(async (j) => {
      for (let attempt = 0; ; attempt++) {
        try {
          await webpush.sendNotification({ endpoint: j.s.endpoint, keys: { p256dh: j.s.p256dh, auth: j.s.auth } }, j.payload,
                                         { TTL: j.ttl, urgency: "high", timeout: 10000 });
          st.sent++; j.done?.(true, false);
          return;
        } catch (e) {
          const err = e as { statusCode?: number; body?: string; message?: string };
          const code = err.statusCode || 0;
          if (code === 404 || code === 410) { st.dead.push(j.s.endpoint); j.done?.(false, false); return; }
          const passing = code === 0 || code === 429 || code >= 500;
          if (passing && attempt === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
          st.failed++;
          const k = String(code || "network");
          st.codes[k] = (st.codes[k] || 0) + 1;
          if (st.sample.length < 3) st.sample.push((k + " " + String(err.body || err.message || "")).replace(/\s+/g, " ").slice(0, 160));
          j.done?.(false, passing);
          return;
        }
      }
    }));
  }
}

async function removeDead(db: DB, st: Stats) {
  for (let i = 0; i < st.dead.length; i += 100) {
    const part = st.dead.slice(i, i + 100);
    const { error } = await db.from("cbt_push_subs").delete().in("endpoint", part);
    if (!error) st.removed += part.length;
  }
}

// a short sentence for the admin when phones did not get it
function hint(st: Stats): string {
  if (!st.failed) return "";
  const c = st.codes;
  if ((c["401"] || 0) + (c["403"] || 0) >= st.failed / 2)
    return "The push service refused the key: VAPID_PUBLIC / VAPID_PRIVATE in Supabase secrets must be one pair, and VAPID_PUBLIC must be the same as in config.js. Set VAPID_SUBJECT to a real mailto: address.";
  if (c["400"] || c["413"]) return "The push service did not accept the message (check VAPID_SUBJECT, and keep the text short).";
  if (c["429"] || Object.keys(c).some((k) => k === "network" || Number(k) >= 500)) return "The push service was busy or not reachable. Try again in a few minutes.";
  return "";
}

// ---------- "test is LIVE now" alerts (the 🔔 on a scheduled test) ----------
async function dueAlerts(db: DB, pub: string, priv: string, worker: number) {
  if (!pub || !priv) return json({ ok: false, error: "vapid_missing" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

  const now = new Date();
  // claim the due alerts first (sent_at set), a batch per worker, so two workers never send the same alert twice
  let due: { mobile: string; test_id: string; title: string }[] = [];
  let canRelease = true;
  const c = await db.rpc("cbt_alerts_claim", { p_limit: DUE_ALERTS });
  if (!c.error) due = c.data || [];
  else {
    // v36 not installed yet: the old way (one worker)
    canRelease = false;
    if (worker !== 1) return json({ ok: true, alerts: 0, sent: 0 });
    const { data, error } = await db.from("cbt_test_alerts")
      .update({ sent_at: now.toISOString() })
      .is("sent_at", null)
      .lte("opens_at", now.toISOString())
      .gte("opens_at", new Date(now.getTime() - 6 * 3600e3).toISOString())   // skip very old ones
      .select("mobile,test_id,title");
    if (error) return json({ ok: false, error: "db" }, 500);
    due = data || [];
  }

  if (worker === 1) await db.from("cbt_test_alerts").delete().lt("opens_at", new Date(now.getTime() - 7 * 864e5).toISOString());
  if (!due.length) return json({ ok: true, alerts: 0, sent: 0 });

  const mobiles = [...new Set(due.map((d) => d.mobile))];
  const { data: subs } = await db.from("cbt_push_subs").select("endpoint,mobile,p256dh,auth").in("mobile", mobiles);

  const st: Stats = { sent: 0, removed: 0, failed: 0, codes: {}, sample: [], dead: [] };
  // per alert: delivered to at least one phone? / only passing problems?
  const res = due.map(() => ({ phones: 0, ok: 0, passing: 0 }));
  const jobs: Parameters<typeof sendMany>[0] = [];
  due.forEach((a, i) => {
    const payload = JSON.stringify({
      title: "🔴 LIVE now: " + String(a.title).slice(0, 60),
      body: "Your test has started. Tap to attempt it now.",
      url: "#/",
      tag: "live-" + a.test_id,
    });
    for (const s of ((subs || []) as Sub[]).filter((x) => x.mobile === a.mobile)) {
      res[i].phones++;
      jobs.push({ s, payload, ttl: 3 * 3600, done: (ok, passing) => { if (ok) res[i].ok++; else if (passing) res[i].passing++; } });
    }
  });
  await sendMany(jobs, st);
  await removeDead(db, st);
  // nothing reached the student only because of a passing problem: try again next minute (for up to 30 minutes)
  let again = 0;
  if (canRelease) {
    for (let i = 0; i < due.length; i++) {
      const r = res[i];
      if (r.phones && !r.ok && r.passing) { await db.rpc("cbt_alerts_release", { p_mobile: due[i].mobile, p_test: due[i].test_id }); again++; }
    }
  }
  return json({ ok: true, alerts: due.length, sent: st.sent, failed: st.failed, removed: st.removed, again, codes: st.codes });
}
