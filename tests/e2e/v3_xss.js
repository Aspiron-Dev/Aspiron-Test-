// New student design (v3.js): every text that comes from the server is put on the page as text, never as code.
// A script payload is written into names, titles, notices, banners, questions and files of the throw-away test
// database; the student signs in and the main screens of the new design are opened at phone and computer size.
// PASS only if the payload never runs and no <img onerror> / <svg onload> element is created from it.
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8771, BASE = `http://127.0.0.1:${PORT}/`;
const SUPA = /SUPABASE_URL:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'))[1];
const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const db = new Client();   // PGHOST / PGUSER / PGDATABASE of the throw-away test database (tests/db/build.sh)
const q = async (sql, args) => (await db.query(sql, args)).rows;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const X = `<img src=x onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=(window.__x||0)+1"></svg>`;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
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

(async () => {
  await db.connect();
  await q(`select set_config('request.headers', '{"x-real-ip":"4.4.4.9"}', false)`);
  // the payload everywhere a student can see server text
  await q(`update cbt_private.students set name = $1, fail_count = 0, locked_until = 0, devices = '{}' where mobile = '9000000002'`, ['Paid ' + X]);
  await q(`update cbt_private.series set title = title || $1, description = $1`, [X]);
  await q(`update cbt_private.tests set title = title || $1`, [X]);
  await q(`update cbt_private.tests set data = jsonb_build_array(jsonb_build_object('q', 'Q ' || $1::text, 'options', jsonb_build_array($1::text, 'b', 'c', 'd'), 'answer', 1, 'explanation', $1::text))
           where id = 'aaaaaaaa-0000-0000-0000-000000000004'`, [X]);
  await q(`update cbt_private.series_files set title = title || $1`, [X]);
  await q(`insert into cbt_private.folders (series_id, title) values ('22222222-2222-2222-2222-222222222222', $1)`, ['Folder ' + X]);
  await q(`insert into cbt_private.announcements (title, body, link_label) values ($1, $1, $1)`, ['Notice ' + X]);
  await q(`update public.cbt_banners set title = $1, body = $1`, [X]);
  await q(`update public.cbt_store_items set title = title || $1`, [X]);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  for (const vw of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
    const tag = vw.width + 'px';
    const c = await br.newContext({ viewport: vw });
    await c.addInitScript(() => { try { localStorage.setItem('cbt_v3', 'true'); } catch (e) {} });
    const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort());
    await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await p.goto(BASE + 'index.html'); await p.waitForSelector('#lp');
    await p.evaluate(() => { lpLogin(); login('code'); }); await p.waitForSelector('#ph');
    await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3500);
    for (const h of ['#/', '#/x/test', '#/x/tools', '#/x/lib', '#/x/stats', '#/notices', '#/x/test']) {
      await p.evaluate(h2 => { location.hash = h2; }, h); await p.waitForTimeout(1300);
    }
    // the open mock (question, options and explanation carry the payload)
    await p.evaluate(() => { try { openTest('aaaaaaaa-0000-0000-0000-000000000004'); } catch (e) {} }); await p.waitForTimeout(1500);
    const ran = await p.evaluate(() => window.__x || 0);
    const made = await p.evaluate(() => {
      const all = [document, ...[...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.shadowRoot)];
      return all.reduce((n, r) => n + r.querySelectorAll('img[src="x"][onerror], svg[onload]').length, 0);
    });
    const shown = await p.evaluate(() => {
      const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot);
      return (host ? host.shadowRoot.textContent : '') + document.body.textContent;
    });
    ok(ran === 0, tag + ' new design: no payload ran (' + ran + ')');
    ok(made === 0, tag + ' new design: no element made from server text (' + made + ')');
    ok(/onerror=/.test(shown), tag + ' new design: the payload is shown as plain text (so the screens really drew it)');
    ok(!errs.length, tag + ' no page errors ' + errs.join(' | '));
    await c.close();
  }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
