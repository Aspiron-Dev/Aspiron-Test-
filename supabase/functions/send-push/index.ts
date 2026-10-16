// Supabase Edge Function: send-push
// Sends a phone notification to every student who turned notifications on,
// even when the website / app is closed.
//
// Needs these secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC   – same value as VAPID_PUBLIC in config.js
//   VAPID_PRIVATE  – the private key (never put this in GitHub)
//   VAPID_SUBJECT  – optional, e.g. mailto:you@example.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Body: { pw, title, body, url?, tag? }   (pw = admin password, checked with cbt_admin 'ping')

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let b: Record<string, string> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "body" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // admin password check (same password as the admin panel)
  const { data: auth, error: aerr } = await db.rpc("cbt_admin", { p_pw: b.pw || "", p_action: "ping", p_data: {} });
  if (aerr || !auth || !(auth as { ok?: boolean }).ok) return json({ ok: false, error: (auth as { error?: string })?.error || "invalid" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC"), priv = Deno.env.get("VAPID_PRIVATE");
  if (!pub || !priv) return json({ ok: false, error: "vapid_missing" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

  const payload = JSON.stringify({
    title: String(b.title || "New notice").slice(0, 80),
    body: String(b.body || "").slice(0, 200),
    url: String(b.url || "#/n").slice(0, 300),
    tag: String(b.tag || "ann-" + Date.now()).slice(0, 80),
  });

  const { data: subs, error } = await db.from("cbt_push_subs").select("endpoint,p256dh,auth");
  if (error) return json({ ok: false, error: "db" }, 500);

  let sent = 0, gone = 0, failed = 0;
  const dead: string[] = [];
  const list = subs || [];
  for (let i = 0; i < list.length; i += 50) {
    await Promise.all(list.slice(i, i + 50).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { dead.push(s.endpoint); gone++; } else failed++;
      }
    }));
  }
  if (dead.length) await db.from("cbt_push_subs").delete().in("endpoint", dead);
  return json({ ok: true, sent, removed: gone, failed, total: list.length });
});
