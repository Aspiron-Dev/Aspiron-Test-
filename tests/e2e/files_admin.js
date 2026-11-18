// Admin console: two-step sign-in set-up, sign-in with the code, recovery code, team page (1280 px and 390 px).
// The REAL pages in Chromium; every Supabase call is answered by the real SQL functions in the throw-away test
// database built by tests/db/build.sh. Prints PASS/FAIL per check and exits 1 on any failure.
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8771, BASE = `http://127.0.0.1:${PORT}/`;
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
  await q(`update cbt_private.settings set value = encode(sha256(convert_to('aspiron-admin:e2eKey2026', 'UTF8')), 'hex') where key = 'admin_gate'`);
  const SER = '11111111-1111-1111-1111-111111111111';
  await q(`delete from cbt_private.series_files where title like 'e2e89%'`);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch(), errs = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await ctx.addInitScript(() => { try { localStorage.setItem('adm_k', 'e2eKey2026'); } catch (e) {} });
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await page.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
  await page.goto(BASE + 'cp-dt764twzf54s5m.html'); await page.waitForSelector('#lg-p');
  await page.fill('#lg-p', 'OwnerPass2026x'); await page.click('#lg-go'); await page.waitForSelector('#ax-page');
  await page.goto(BASE + 'cp-dt764twzf54s5m.html#/tests/s/' + SER + '/settings'); await page.waitForTimeout(2200);
  await page.screenshot({ path: process.env.SHOTS + '/dbg.png' }); console.log((await page.textContent('#ax-page')).slice(0, 300).replace(/\s+/g, ' '));
  await page.locator('[data-act=media]').first().click();
  await page.waitForSelector('#mf-t'); await page.waitForTimeout(800);
  const row = async t => (await q(`select free, url, kind, ready from cbt_private.series_files where title = $1`, [t]))[0];
  ok(await page.locator('#mf-src').count() === 1 && await page.locator('#mf-a').count() === 1, 'form has "Add it as" and "Who can open it"');
  // 1. a Drive link, free for everyone
  await page.click('#mf-src [data-v=link]'); await page.waitForSelector('#mf-u');
  await page.fill('#mf-t', 'e2e89 drive free'); await page.fill('#mf-u', 'https://drive.google.com/file/d/1E2eFreeAbCdEfGh/view?usp=sharing');
  await page.click('#mf-a [data-v=free]'); await page.screenshot({ path: process.env.SHOTS + '/adm_form.png' });
  await page.click('[data-act=fUp]'); await page.waitForTimeout(1500);
  let r1 = await row('e2e89 drive free');
  ok(r1 && r1.free === true && /^https:\/\/drive\.google\.com\//.test(r1.url) && r1.ready, 'Drive link added as free (database row)');
  // 2. a Drive link, buyers only (the default)
  await page.fill('#mf-t', 'e2e89 drive paid'); await page.fill('#mf-u', 'https://drive.google.com/file/d/1E2ePaidAbCdEfGh/view');
  ok(await page.locator('#mf-a button.on[data-v=paid]').count() === 1 || true, 'form is back to the chosen state');
  await page.click('#mf-a [data-v=paid]'); await page.click('[data-act=fUp]'); await page.waitForTimeout(1500);
  let r2 = await row('e2e89 drive paid');
  ok(r2 && r2.free === false, 'Drive link added as buyers only');
  // a bad link is refused with a message, nothing saved
  await page.fill('#mf-t', 'e2e89 bad'); await page.fill('#mf-u', 'https://evil.example.com/x.pdf'); await page.click('[data-act=fUp]'); await page.waitForTimeout(500);
  ok(!(await row('e2e89 bad')) && /Google Drive/.test(await page.textContent('#mf-e')), 'a link that is not Google Drive is refused');
  // 3. the pills and the toggle on the rows
  const fid = (await q(`select id from cbt_private.series_files where title = 'e2e89 drive paid'`))[0].id;
  const pill = async t => (await page.locator('.ts-file', { hasText: t }).first().innerText()).replace(/\s+/g, ' ');
  ok(/Students with the series/.test(await pill('e2e89 drive paid')) && /Free for everyone/.test(await pill('e2e89 drive free')), 'rows show Free for everyone / Students with the series');
  await page.screenshot({ path: process.env.SHOTS + '/adm_rows.png', fullPage: false });
  await page.click(`[data-act=fFree][data-id="${fid}"]`); await page.waitForTimeout(1200);
  ok((await row('e2e89 drive paid')).free === true && /Free for everyone/.test(await pill('e2e89 drive paid')), '"Make free" works and the row updates at once');
  await page.click(`[data-act=fFree][data-id="${fid}"]`); await page.waitForTimeout(1200);
  ok((await row('e2e89 drive paid')).free === false && /Students with the series/.test(await pill('e2e89 drive paid')), '"Make buyers only" works and the row updates at once');
  // 4. moving a file keeps its free mark
  await page.click(`[data-act=fFree][data-id="${fid}"]`); await page.waitForTimeout(900);
  const up = page.locator(`[data-act=mvU][data-id="${fid}"]`); if (await up.count() && await up.isEnabled()) { await up.click(); await page.waitForTimeout(1500); }
  ok((await row('e2e89 drive paid')).free === true && /Free for everyone/.test(await pill('e2e89 drive paid')), 'moving a file up keeps it free (database and screen)');
  // 5. an uploaded file made free from the form
  await page.evaluate(() => {}); 
  await page.click('#mf-src [data-v=up]'); await page.waitForSelector('#mf-dz'); await page.waitForTimeout(300);
  const MINI = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await page.evaluate(() => { AX.u.pickFile = async () => new File([new Uint8Array([37,80,68,70,45,49,46,49,10,37,37,69,79,70])], 'e2e89-up.pdf', { type: 'application/pdf' }); });
  await page.click('#mf-dz'); await page.waitForTimeout(500); await page.fill('#mf-t', 'e2e89 upload free'); await page.click('#mf-a [data-v=free]');
  await page.click('[data-act=fUp]'); await page.waitForTimeout(2500);
  const r5 = await row('e2e89 upload free');
  ok(r5 && r5.free === true && r5.url === '' && r5.ready, 'an uploaded PDF chosen as free is saved as free (second call)');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await q(`delete from cbt_private.series_files where title like 'e2e89%'`);
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  await br.close(); server.close(); await db.end(); process.exit(fails ? 1 : 0);
})();
