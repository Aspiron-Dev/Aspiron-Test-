// Admin console: two-step sign-in set-up, sign-in with the code, recovery code, team page (1280 px and 390 px).
// The REAL pages in Chromium; every Supabase call is answered by the real SQL functions in the throw-away test
// database built by tests/db/build.sh. Prints PASS/FAIL per check and exits 1 on any failure.
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8767, BASE = `http://127.0.0.1:${PORT}/`;
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
async function rpcRoute(route) {
  const req = route.request(), fn = req.url().split('/rpc/')[1].split('?')[0];
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
  await q(`select set_config('request.headers', '{"x-real-ip":"9.9.9.9","user-agent":"e2e"}', false)`);
  await q(`delete from cbt_private.admin_totp; delete from cbt_private.admin_fails; delete from cbt_private.admin_sessions; delete from cbt_private.admin_users`);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const code = async (sec, plus) => (await q(`select cbt_private.adm_totp($1, floor(extract(epoch from now())/30)::bigint + $2) c`, [sec, plus]))[0].c;
  const br = await chromium.launch();
  for (const vw of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    await q(`delete from cbt_private.admin_totp; delete from cbt_private.admin_fails; delete from cbt_private.admin_sessions`);
    const tag = vw.width + 'px';
    // v62: the sign-in needs the admin page key (the test page has no gate script, so the key is put in place here)
    await q(`update cbt_private.settings set value = encode(sha256(convert_to('aspiron-admin:e2eKey2026', 'UTF8')), 'hex') where key = 'admin_gate'`);
    const ctx = await br.newContext({ viewport: vw }); await ctx.addInitScript(() => { try { localStorage.setItem('adm_k', 'e2eKey2026'); } catch (e) {} }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' @ ' + (e.stack||'').split('\n').slice(1,3).join(' '))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort());
    await page.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await page.goto(BASE + 'cp-dt764twzf54s5m.html'); await page.waitForSelector('#lg-p');
    await page.fill('#lg-p', 'OwnerPass2026x'); await page.click('#lg-go'); await page.waitForSelector('#ax-page');
    ok(true, tag + ' owner signs in with password (2FA off)');
    await page.goto(BASE + 'cp-dt764twzf54s5m.html#/settings'); await page.waitForSelector('#st-2fa [data-act=on]');
    await page.click('#st-2fa [data-act=on]'); await page.fill('#t1 [name=password]', 'wrong'); await page.click('.modal [data-act=next]'); await page.waitForTimeout(400);
    ok(/wrong/i.test(await page.textContent('.modal [data-err=password]')), tag + ' wrong password refused in set-up');
    await page.fill('#t1 [name=password]', 'OwnerPass2026x'); await page.click('.modal [data-act=next]'); await page.waitForSelector('#t2');
    ok(await page.$('.modal svg rect, .modal svg path') !== null, tag + ' QR code shown');
    const sec = (await q(`select pending from cbt_private.admin_totp where acct='owner'`))[0].pending;
    ok((await page.textContent('.modal')).replace(/\s/g, '').includes(sec), tag + ' setup key shown');
    await page.screenshot({ path: `../../tfa/setup_${tag}.png` });
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); ok(!ovf, tag + ' no horizontal scroll');
    await page.fill('#t2 [name=code]', '000000'); await page.click('.modal [data-act=confirm]'); await page.waitForTimeout(400);
    ok(/wrong code/i.test(await page.textContent('.modal [data-err=code]')), tag + ' wrong code refused');
    await page.fill('#t2 [name=code]', await code(sec, 0)); await page.click('.modal [data-act=confirm]'); await page.waitForSelector('.modal [data-act=done]');
    const codes = await page.$$eval('.modal .well span', a => a.map(x => x.textContent));
    ok(codes.length === 10, tag + ' 10 recovery codes shown');
    await page.screenshot({ path: `../../tfa/codes_${tag}.png` });
    await page.click('.modal [data-act=done]'); await page.waitForTimeout(600);
    ok(/On/.test(await page.textContent('#st-2fa .card-h')), tag + ' card says On');
    // sign out → sign in needs the code
    await page.evaluate(() => AX.signOut()); await page.waitForSelector('#lg-p');
    await page.fill('#lg-p', 'OwnerPass2026x'); await page.click('#lg-go'); await page.waitForTimeout(600);
    ok(await page.isVisible('#lg-o'), tag + ' code field appears after password');
    await page.fill('#lg-o', '123456'); await page.click('#lg-go'); await page.waitForTimeout(600);
    ok(/wrong code/i.test(await page.textContent('#lg-e')), tag + ' wrong code at sign-in refused');
    await page.screenshot({ path: `../../tfa/login_${tag}.png` });
    await page.fill('#lg-o', await code(sec, 1)); await page.click('#lg-go'); await page.waitForSelector('#ax-page');
    ok(true, tag + ' sign-in with password + code works');
    // raw password no longer works anywhere
    const raw = (await q(`select public.cbt_admin('OwnerPass2026x','ping','{}') r`))[0].r;
    ok(raw.error === 'need_2fa', tag + ' password alone refused by the database');
    // a recovery code signs in once, in place of the authenticator code
    const rc = (await q(`select public.cbt_admin_login('', 'OwnerPass2026x', 'e2e', $1, 'e2eKey2026') r`, [codes[0]]))[0].r;
    ok(rc.ok === true && /^as1\./.test(rc.token || ''), tag + ' sign-in with a recovery code works');
    const rc2 = (await q(`select public.cbt_admin_login('', 'OwnerPass2026x', 'e2e', $1, 'e2eKey2026') r`, [codes[0]]))[0].r;
    ok(rc2.ok !== true, tag + ' the same recovery code is refused the second time');
    await page.goto(BASE + 'cp-dt764twzf54s5m.html#/team/members'); await page.waitForTimeout(1500);
    ok(/2-step on/.test(await page.textContent('#ax-page')), tag + ' team page shows owner 2-step on');
    ok(/Team sign-in/.test(await page.textContent('#ax-page')) && await page.$('[name=tlog]') !== null, tag + ' team page has the team sign-in switch');
    // R3: security alerts (the recovery code and the wrong code above), shown safely, and the bell counts them
    await q(`select cbt_private.sec_event('team_changed','high','<img src=x onerror="window.__x=1">','<b>x</b>')`);
    await page.goto(BASE + 'cp-dt764twzf54s5m.html#/team/alerts?c=all'); await page.waitForTimeout(1500);   // 'all': the XSS row is an admin change
    const al = await page.textContent('#ax-page');
    ok(/Recovery code used/.test(al) && /Wrong two-step code/.test(al), tag + ' security alerts list the recovery code and wrong code');
    ok(/Get alerts on Telegram/.test(al) && await page.$('#tg-tok') !== null, tag + ' Telegram alerts set-up is offered');
    ok(!(await page.evaluate(() => window.__x)) && await page.$('#ax-page img[src=x]') === null, tag + ' alert text is shown as text, not HTML');
    await page.click('.tl-i[data-act=open]'); await page.waitForSelector('.drawer');
    const dr = await page.textContent('.drawer');
    ok(/IP address/.test(dr) && /Device/.test(dr) && /Group/.test(dr), tag + ' an alert opens with its address, device and group');
    await page.click('.drawer [data-close]'); await page.waitForTimeout(400);
    await page.click('[data-act=seen]'); await page.waitForTimeout(1200);
    ok((await q(`select count(*)::int n from cbt_private.security_events where level = 'high' and not seen`))[0].n === 0, tag + ' mark as seen works');
    ok(!errs.length, tag + ' no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
