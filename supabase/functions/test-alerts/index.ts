// Supabase Edge Function: test-alerts
// Called every minute by pg_cron (see supabase_v12_test_alerts.sql).
// Sends "test is LIVE now" to every student who tapped 🔔 on that test, once, as soon as it opens.
//
// Uses the same secrets as send-push: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (optional).
// Deploy with JWT verification OFF (the cron call has no login); it is safe because it only
// sends alerts that are already due, and marks each one sent so it never repeats.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const pub = Deno.env.get("VAPID_PUBLIC"), priv = Deno.env.get("VAPID_PRIVATE");
  if (!pub || !priv) return json({ ok: false, error: "vapid_missing" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

  const now = new Date();
  // claim the due alerts first (sent_at set), so two runs never send the same alert twice
  const { data: due, error } = await db.from("cbt_test_alerts")
    .update({ sent_at: now.toISOString() })
    .is("sent_at", null)
    .lte("opens_at", now.toISOString())
    .gte("opens_at", new Date(now.getTime() - 6 * 3600e3).toISOString())   // skip very old ones
    .select("mobile,test_id,title");
  if (error) return json({ ok: false, error: "db" }, 500);

  await db.from("cbt_test_alerts").delete().lt("opens_at", new Date(now.getTime() - 7 * 864e5).toISOString());
  if (!due || !due.length) return json({ ok: true, sent: 0 });

  const mobiles = [...new Set(due.map((d) => d.mobile))];
  const { data: subs } = await db.from("cbt_push_subs").select("endpoint,mobile,p256dh,auth").in("mobile", mobiles);

  let sent = 0, failed = 0;
  const dead: string[] = [];
  const jobs: Promise<void>[] = [];
  for (const a of due) {
    const payload = JSON.stringify({
      title: "🔴 LIVE now: " + String(a.title).slice(0, 60),
      body: "Your test has started. Tap to attempt it now.",
      url: "#/",
      tag: "live-" + a.test_id,
    });
    for (const s of (subs || []).filter((x) => x.mobile === a.mobile)) {
      jobs.push(webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3 * 3600, urgency: "high" })
        .then(() => { sent++; })
        .catch((e) => { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) dead.push(s.endpoint); else failed++; }));
    }
  }
  await Promise.all(jobs);
  if (dead.length) await db.from("cbt_push_subs").delete().in("endpoint", dead);
  return json({ ok: true, alerts: due.length, sent, failed, removed: dead.length });
});
