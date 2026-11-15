// Result-ready alert (v79): the bell on a result that is still held back, the server row, and the #/h route to Test history.
// Real pages in Chromium + the real SQL in the throw-away test database. Prints PASS/FAIL, exits 1 on a failure.
// Student app + store: sign-in token, frame blocking, PDF reading, store orders, banner links, file viewing, access request.
// The REAL pages in Chromium; every Supabase call is answered by the real SQL functions in the throw-away test
// database built by tests/db/build.sh. Prints PASS/FAIL per check and exits 1 on any failure.
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8768, BASE = `http://127.0.0.1:${PORT}/`;
const SUPA = /SUPABASE_URL:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'))[1];
const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const db = new Client();   // PGHOST / PGUSER / PGDATABASE … of the throw-away test database (tests/db/build.sh)
const q = async (sql, args) => (await db.query(sql, args)).rows;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  let body = fs.readFileSync(f);
  if (p === '/cp-dt764twzf54s5m.html') { // test only: drop the admin key gate
    const s = body.toString(), a = s.indexOf('<script>(function(){'), b = s.indexOf('</script>', a);
    body = Buffer.from(s.slice(0, a) + s.slice(b + 9));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(body);
});

const calls = [];
// the landing page (app29.js) comes first, then Login / Register opens the email / Google screen (app28.js): open the access-code screen
const toLogin = async pg => { await pg.waitForSelector('#lp .lp-login'); await pg.evaluate(() => lpLogin()); await pg.waitForSelector('#em'); };
const codeScreen = async pg => { await toLogin(pg); await pg.evaluate(() => login('code')); await pg.waitForSelector('#ph'); };
// a Supabase login (test only: an unsigned JWT; its "sub" goes to request.jwt.claims like PostgREST does)
const fakeJwt = (sub, email) => ['e30', Buffer.from(JSON.stringify({ sub, email, role: 'authenticated' })).toString('base64url'), 'x'].join('.');
const jwtClaims = h => { const m = /^Bearer\s+([^.]+)\.([^.]+)\.[^.]*$/.exec(h || ''); if (!m) return ''; try { return Buffer.from(m[2], 'base64url').toString(); } catch (e) { return ''; } };
async function rpcRoute(route) {
  const req = route.request(), fn = req.url().split('/rpc/')[1].split('?')[0];
  await q(`select set_config('request.jwt.claims', $1, false)`, [jwtClaims(req.headers()['authorization'])]);
  if (!/^[a-z0-9_]+$/.test(fn)) return route.fulfill({ status: 400, body: '{}' });
  let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
  const keys = Object.keys(body).filter(k => /^p_[a-z0-9_]+$/.test(k));
  const vals = keys.map(k => body[k] === null || body[k] === undefined ? null : typeof body[k] === 'object' ? JSON.stringify(body[k]) : String(body[k]));
  calls.push(fn);
  try {
    const r = await q(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, vals);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r[0].r) });
  } catch (e) {
    if (!/does not exist/.test(e.message)) console.log('SQL ERROR in', fn, ':', e.message);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: e.message }) });
  }
}

(async () => {
  await db.connect();
  await q(`update cbt_private.students set fail_count=0, locked_until=0, devices='{}'`);
  const TID = 'aaaaaaaa-0000-0000-0000-0000000000e2';
  await q(`delete from cbt_private.tests where id=$1`, [TID]);
  await q(`insert into cbt_private.tests (id, series_id, title, duration, data, question_count, sort_order, opens_at, closes_at, result_at) select $1, series_id, 'Waiting test', 45, data, 45, 21, cbt_private.now_ms() - 3600000, cbt_private.now_ms() + 600000, cbt_private.now_ms() + 3600000 from cbt_private.tests where id='aaaaaaaa-0000-0000-0000-000000000001'`, [TID]);
  const sid = (await q(`select id from cbt_private.students where mobile='9000000002'`))[0].id;
  await q(`insert into cbt_private.results (student_id, test_id, test_title, score, max_score, correct, wrong, skipped, used_seconds, answers) values ($1,$2,'Waiting test',0,180,0,0,45,60,'{}')`, [sid, TID]);
  await q(`delete from public.cbt_result_alerts`);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const errs = [];
  const c = await br.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
  await p.goto(BASE + 'index.html'); await codeScreen(p);
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3500);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h && [...h.shadowRoot.querySelectorAll('button')].find(x => /^Skip/.test(x.textContent.trim())); if (b) b.click(); }); await p.waitForTimeout(400); }
  const sh = sel => p.evaluate(sel => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); return h ? h.shadowRoot.querySelector(sel) !== null : false; }, sel);
  const click = sel => p.evaluate(sel => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h.shadowRoot.querySelector(sel); if (b) b.click(); return !!b; }, sel);
  // the phone side: notifications allowed (the browser prompt cannot be answered in a test)
  await p.evaluate(() => { LS.set('cbt_np', 1); pushSync = async () => {}; Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => 'granted' }); });
  await p.evaluate(() => { location.hash = '#/h'; }); await p.waitForTimeout(1800);
  ok(await sh('.hs3-w'), '#/h opens Test history with the waiting-for-result card');
  ok(await sh('[data-a="raBell"]'), 'the Notify me bell shows on the waiting card');
  await click('[data-a="raBell"]'); await p.waitForTimeout(1200);
  const n = Number((await q(`select count(*) n from public.cbt_result_alerts where mobile='9000000002' and test_id=$1 and sent_at is null`, [TID]))[0].n);
  ok(n === 1, 'tapping the bell saves one alert on the server');
  ok(await sh('.hs3-bell.on'), 'the bell shows "Alert on"');
  await click('[data-a="raBell"]'); await p.waitForTimeout(1000);
  const n2 = Number((await q(`select count(*) n from public.cbt_result_alerts where test_id=$1`, [TID]))[0].n);
  ok(n2 === 0 && !(await sh('.hs3-bell.on')), 'tapping again turns it off');
  await click('[data-a="raBell"]'); await p.waitForTimeout(1000);
  await p.reload(); await p.waitForTimeout(3500);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h && [...h.shadowRoot.querySelectorAll('button')].find(x => /^Skip/.test(x.textContent.trim())); if (b) b.click(); }); await p.waitForTimeout(300); }
  await p.evaluate(() => { location.hash = '#/h'; }); await p.waitForTimeout(1800);
  ok(await sh('.hs3-bell.on'), 'after a reload the bell state comes from the server');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await q(`delete from public.cbt_result_alerts`); await q(`delete from cbt_private.results where test_id=$1`, [TID]); await q(`delete from cbt_private.sessions where test_id=$1`, [TID]);
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  await br.close(); server.close(); await db.end(); process.exit(fails ? 1 : 0);
})();
