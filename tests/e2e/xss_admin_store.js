// Admin console + store page: text from the database is always shown as text, never run as code.
// A script payload is written into (almost) every text column of the throw-away test database (names, notes,
// titles, orders, reviews, alerts, logs …). Then the owner signs in and EVERY admin page and tab is opened, and the
// store page is opened. PASS only if the payload never runs and no element is made from it.
// Run by hand like the other e2e tests (not in CI, to keep Actions minutes low).
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8772, BASE = `http://127.0.0.1:${PORT}/`;
const SUPA = /SUPABASE_URL:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'))[1];
const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const db = new Client();
const q = async (sql, args) => (await db.query(sql, args)).rows;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";
const X = `"'><img src=x onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=(window.__x||0)+1"></svg>`;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  let body = fs.readFileSync(f);
  if (p === '/cp-dt764twzf54s5m.html') {   // test only: drop the admin key gate script and the CSP (so a payload WOULD run if it got in)
    let s = body.toString(); const a = s.indexOf('<script>(function(){'), b = s.indexOf('</script>', a);
    s = s.slice(0, a) + s.slice(b + 9); s = s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    body = Buffer.from(s);
  }
  if (p === '/store.html') body = Buffer.from(body.toString().replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(body);
});
async function rpcRoute(route) {
  const req = route.request(), fn = req.url().split('/rpc/')[1].split('?')[0];
  if (!/^[a-z0-9_]+$/.test(fn)) return route.fulfill({ status: 400, body: '{}' });
  let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
  const keys = Object.keys(body).filter(k => /^p_[a-z0-9_]+$/.test(k));
  const vals = keys.map(k => body[k] === null || body[k] === undefined ? null : typeof body[k] === 'object' ? JSON.stringify(body[k]) : String(body[k]));
  try {
    const r = await q(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, vals);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r[0].r) });
  } catch (e) {
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: e.message }) });
  }
}
const probe = pg => pg.evaluate(() => {
  const roots = [document, ...[...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.shadowRoot)];
  return { ran: window.__x || 0, made: roots.reduce((n, r) => n + r.querySelectorAll('img[src="x"], svg[onload]').length, 0) };
});

(async () => {
  await db.connect();
  await q(`select set_config('request.headers', '{"x-real-ip":"4.4.4.8"}', false)`);
  // some rows to carry the payload: an order, a wrong sign-in (alert + log), a team member
  await q(`select public.cbt_store_order('cccccccc-0000-0000-0000-000000000001', 'Buyer One', '9812345678')`);
  await q(`delete from cbt_private.settings where key = 'admin_gate'`);
  await q(`select public.cbt_admin_login('', 'wrong-pass-1', 'X')`);
  const ow = (await q(`select public.cbt_admin_login('', 'OwnerPass2026x', 'Seed') r`))[0].r.token;
  await q(`select public.cbt_admin_team($1, 'team_login', '{"on":true}')`, [ow]);
  await q(`select public.cbt_admin_team($1, 'user_save', '{"name":"Member One","username":"member1","password":"Tr7k-9mQz-pLx6","perms":{"students":"view"}}')`, [ow]);
  // the payload into every text column that takes it (columns with a fixed format are skipped by their checks)
  await q(`do $$ declare r record; n int := 0; begin
      for r in select c.table_schema s, c.table_name t, c.column_name col from information_schema.columns c
                 join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name and b.table_type = 'BASE TABLE'
                where c.table_schema in ('cbt_private', 'public') and c.data_type = 'text'
                  and c.column_name !~ '^(id|key|value|code|mobile|salt|.*hash.*|status|kind|level|lang|username|endpoint|p256dh|auth|mime|ip|ip_full|token.*|secret|pending|recovery|referrer|old_mobile|new_mobile|test_id|series_id|item_id|k|acct|fn|act|result|device|cover|image|img|data|photo|poster|promo)$'
                  and c.table_name not in ('settings', 'admin_totp', 'student_tokens', 'admin_sessions', 'file_parts')
      loop
        begin
          execute format('update %I.%I set %I = left(coalesce(%I, ''''), 20) || %L', r.s, r.t, r.col, r.col, ${lit(X)});
          n := n + 1;
        exception when others then null; end;
      end loop;
      perform set_config('cbt.xss_cols', n::text, false);
    end $$`);
  const n = (await q(`select current_setting('cbt.xss_cols') n`))[0].n;
  ok(+n > 40, 'payload written into ' + n + ' text columns');
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();

  // ---- admin: every module and tab ----
  const c = await br.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort());
  await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
  await p.goto(BASE + 'cp-dt764twzf54s5m.html'); await p.waitForSelector('#lg-p');
  await p.fill('#lg-p', 'OwnerPass2026x'); await p.click('#lg-go'); await p.waitForSelector('#ax-page');
  let shown = 0;
  const routes = await p.evaluate(() => Object.values(AX.mods).flatMap(m => [m.id, ...(m.tabs || []).map(t => m.id + '/' + (t.id || t))]));
  for (const r of [...routes, 'team/members', 'team/sessions', 'team/activity', 'team/alerts?c=all', 'team/alerts?c=risk', 'team/security', 'students', 'orders', 'results', 'tests']) {
    await p.evaluate(h => { location.hash = '#/' + h; }, r); await p.waitForTimeout(900);
    // open the first row / card of the page too (detail drawers show more fields)
    await p.evaluate(() => { const b = document.querySelector('#ax-page [data-act=open], #ax-page .li.click, #ax-page tr[data-id]'); if (b) b.click(); }); await p.waitForTimeout(500);
    if (/onerror=/.test(await p.evaluate(() => document.body.textContent))) shown++;
    const s = await probe(p);
    if (s.ran || s.made) { ok(false, 'admin #/' + r + ': payload ran ' + s.ran + ' / elements ' + s.made); await p.evaluate(() => { window.__x = 0; }); }
    await p.evaluate(() => { const x = document.querySelector('.drawer [data-close], .modal [data-close]'); if (x) x.click(); }); await p.waitForTimeout(150);
  }
  const a = await probe(p);
  ok(a.ran === 0 && a.made === 0, 'admin: ' + routes.length + ' pages/tabs opened, the payload never ran');
  ok(shown >= 8, 'admin: the payload was really on the pages, as plain text (' + shown + ' pages)');
  ok(!errs.length, 'admin: no page errors ' + errs.slice(0, 3).join(' | ')); await c.close();

  // ---- store page (phone and computer) ----
  for (const vw of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
    const c2 = await br.newContext({ viewport: vw }); const p2 = await c2.newPage(); const e2 = [];
    p2.on('pageerror', e => e2.push(e.message));
    await p2.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort());
    await p2.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await p2.goto(BASE + 'store.html'); await p2.waitForTimeout(2500);
    await p2.evaluate(() => { const b = document.querySelector('[data-open], [data-item], .card[data-id]'); if (b) b.click(); }); await p2.waitForTimeout(1200);
    const s = await probe(p2);
    ok(s.ran === 0 && s.made === 0, vw.width + 'px store: the payload never ran (' + s.ran + '/' + s.made + ')');
    ok(!e2.length, vw.width + 'px store: no page errors ' + e2.slice(0, 3).join(' | ')); await c2.close();
  }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
