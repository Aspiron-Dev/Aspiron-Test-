// Live-test guard (xguard.js): leaving the screen submits a live test once; practice and re-attempts are free; Back asks first; copy is blocked.
// The REAL pages in Chromium and the real SQL in the throw-away test database (tests/db/build.sh). Prints PASS/FAIL, exits 1 on a failure.
//  + store: sign-in token, frame blocking, PDF reading, store orders, banner links, file viewing, access request.
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
  const TID = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  await q(`delete from cbt_private.tests where id=$1`, [TID]);
  await q(`insert into cbt_private.tests (id, series_id, title, duration, data, question_count, sort_order, correct_marks, wrong_marks) select $1, series_id, 'Live guard test', 30, data, question_count, 20, 4, 1 from cbt_private.tests where id='aaaaaaaa-0000-0000-0000-000000000001'`, [TID]);
  const setT = (live, prac) => q(`update cbt_private.tests set practice=$2, opens_at = cbt_private.now_ms() - 60000, closes_at = ${live ? 'cbt_private.now_ms() + 3600000' : 'null'}, result_at = ${live ? 'cbt_private.now_ms() + 7200000' : 'cbt_private.now_ms() - 1000'} where id=$1`, [TID, !!prac]);
  const rows = async () => Number((await q(`select count(*) n from cbt_private.results r join cbt_private.students s on s.id=r.student_id where s.mobile='9000000002' and r.test_id=$1`, [TID]))[0].n);
  const clean = async () => { await q(`delete from cbt_private.results where test_id=$1`, [TID]); await q(`delete from cbt_private.sessions where test_id=$1`, [TID]); await q(`delete from cbt_private.rate_log`).catch(() => {}); };
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const errs = [];
  const boot = async () => {
    const c = await br.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await p.goto(BASE + 'index.html'); await codeScreen(p);
    await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3500);
    for (let i = 0; i < 6; i++) { await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h && [...h.shadowRoot.querySelectorAll('button')].find(x => /^Skip/.test(x.textContent.trim())); if (b) b.click(); }); await p.waitForTimeout(400); }
    return { c, p };
  };
  const start = async (p) => { await p.evaluate(id => { location.hash = '#/'; startTest(id); }, TID); await p.waitForTimeout(2500); };
  const goHidden = async (p) => p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const goVisible = async (p) => p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });

  // 1. live test: leaving the screen submits it, exactly once
  await setT(true, false); await clean(); let { c, p } = await boot(); await start(p);
  ok(await p.evaluate(() => INTEST && XG.on), 'live test: guard is on');
  ok(await p.evaluate(() => document.body.classList.contains('xg-on')) && !(await p.$('#xgWm')), 'live test: no watermark (removed by the owner) and no-select class');
  await goHidden(p); await p.waitForTimeout(2500);
  ok((await rows()) === 1, 'live test: going to the background submitted it once (results rows ' + (await rows()) + ')');
  ok(await p.evaluate(() => !INTEST && !Object.keys(localStorage).some(k => k.startsWith('cbt_prog_'))), 'live test: progress removed, test is over');
  await goVisible(p); await p.waitForTimeout(2500);
  ok((await rows()) === 1, 'live test: coming back does not submit a second result');
  ok(/submitted automatically/.test(await p.evaluate(() => document.body.innerText)), 'live test: the student is told why');
  await c.close();
  // 2. practice test: nothing happens
  await setT(false, true); await clean(); ({ c, p } = await boot()); await start(p);
  ok(await p.evaluate(() => INTEST && !XG.on), 'practice test: guard is off');
  await goHidden(p); await p.waitForTimeout(1500);
  ok((await rows()) === 0 && await p.evaluate(() => INTEST), 'practice test: leaving the screen does not submit');
  await c.close();
  // 3. re-attempt after the result time: not restricted
  await setT(false, false); await clean(); ({ c, p } = await boot()); await start(p);
  ok(await p.evaluate(() => INTEST && !XG.on), 're-attempt after the result time: guard is off');
  await goHidden(p); await p.waitForTimeout(1500);
  ok((await rows()) === 0, 're-attempt after the result time: leaving does not submit');
  await c.close();
  // 4. Back: a popup first; Stay keeps the test; Submit submits it
  await setT(true, false); await clean(); ({ c, p } = await boot()); await start(p);
  await p.goBack(); await p.waitForTimeout(800);
  ok(/Leave test\?/.test(await p.evaluate(() => document.body.innerText)), 'back: "Leave test?" popup shows');
  await p.evaluate(() => xgStay()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => INTEST && XG.on) && (await rows()) === 0, 'back: Stay keeps the test running');
  await p.goBack(); await p.waitForTimeout(800);
  ok(/Leave test\?/.test(await p.evaluate(() => document.body.innerText)), 'back: the popup shows again');
  await p.evaluate(() => xgSubmitNow()); await p.waitForTimeout(3500);
  ok((await rows()) === 1, 'back: Submit submits the test once');
  await c.close();
  // 5. copy / select blocked while live, free otherwise
  await setT(true, false); await clean(); ({ c, p } = await boot()); await start(p);
  const cp = () => p.evaluate(() => { const e = new Event('copy', { cancelable: true, bubbles: true }); document.dispatchEvent(e); const k = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true }); document.dispatchEvent(k); return [e.defaultPrevented, k.defaultPrevented]; });
  const r1 = await cp(); ok(r1[0] && r1[1], 'live test: copy and Ctrl+C are blocked');
  await c.close();
  await setT(false, true); await clean(); ({ c, p } = await boot()); await start(p);
  const r2 = await cp(); ok(!r2[0] && !r2[1], 'practice test: copy is not blocked');
  await c.close();
  // 6. a floating / split-screen app: the window loses focus; coming back in time keeps the test, staying away submits it
  await setT(true, false); await clean(); ({ c, p } = await boot()); await start(p);
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(600);
  ok(!!(await p.$('#xgBlur')), 'blur: a "come back" countdown shows');
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300);
  ok(!(await p.$('#xgBlur')) && await p.evaluate(() => INTEST) && (await rows()) === 0, 'blur: coming back in time keeps the test');
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(4800);
  ok((await rows()) === 1, 'blur: staying away more than the countdown submits the test');
  await c.close();
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await q(`delete from cbt_private.results where test_id=$1`, [TID]); await q(`delete from cbt_private.sessions where test_id=$1`, [TID]);
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  await br.close(); server.close(); await db.end(); process.exit(fails ? 1 : 0);
})();
