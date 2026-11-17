// Files in a series (new design): only a Schedule file can be downloaded, the folder page shows the folder name once.
// Real pages in Chromium + the real SQL in the throw-away test database. Prints PASS/FAIL, exits 1 on a failure.
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

const MINI_PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (Hello PDF) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
(async () => {
  await db.connect();
  await q(`update cbt_private.students set fail_count=0, locked_until=0, devices='{}'`);
  const SER = '11111111-1111-1111-1111-111111111111', b64 = MINI_PDF.toString('base64');
  await q(`delete from cbt_private.file_parts where file_id in ('eeeeeeee-0000-0000-0000-0000000000f1','eeeeeeee-0000-0000-0000-0000000000f2')`);
  await q(`delete from cbt_private.series_files where id in ('eeeeeeee-0000-0000-0000-0000000000f1','eeeeeeee-0000-0000-0000-0000000000f2')`);
  await q(`insert into cbt_private.series_files (id, series_id, title, kind, file_name, mime, size, parts, ready, folder, sort_order) values
    ('eeeeeeee-0000-0000-0000-0000000000f1',$1,'CHEMISTRY PRO TEST PLANNER','schedule','planner.pdf','application/pdf',1000,1,true,'',0),
    ('eeeeeeee-0000-0000-0000-0000000000f2',$1,'Cumulative Test 1','notes','cum1.pdf','application/pdf',1000,1,true,'Cumulative Test',1)`, [SER]);
  await q(`insert into cbt_private.file_parts (file_id, n, data) values ('eeeeeeee-0000-0000-0000-0000000000f1',0,$1),('eeeeeeee-0000-0000-0000-0000000000f2',0,$1)`, [b64]);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const errs = [];
  const c = await br.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
  await p.goto(BASE + 'index.html'); await codeScreen(p);
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3500);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h && [...h.shadowRoot.querySelectorAll('button')].find(x => /^Skip/.test(x.textContent.trim())); if (b) b.click(); }); await p.waitForTimeout(400); }
  await p.evaluate(sid => { location.hash = '#/s/' + sid; }, SER); await p.waitForTimeout(2500);
  await p.locator('[data-a="xt"][data-v="r"]').click(); await p.waitForTimeout(1000);
  // Schedule folder
  await p.locator('[data-a="resOpen"]', { hasText: 'Schedule' }).first().click(); await p.waitForTimeout(900);
  ok(await p.locator('.rs3h').count() === 0, 'folder page: no second copy of the folder name (no header block)');
  const sRow = p.locator('[data-a="fileOpen"][data-kind="schedule"]').first();
  ok((await sRow.getAttribute('aria-label') || '').startsWith('Download'), 'schedule row is marked Download (download icon, not the eye)');
  await sRow.click(); await p.waitForTimeout(2500);
  const dl = p.locator('a[download]').first();
  ok(await dl.count() === 1, 'schedule file sheet has a Download button');
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), dl.click()]);
  ok(/\.pdf$/i.test(d.suggestedFilename()), 'Download saves a .pdf file (' + d.suggestedFilename() + ')');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  // Cumulative Test (notes) folder
  await p.locator('#scrBack').click(); await p.waitForTimeout(700);
  await p.locator('[data-a="resOpen"]', { hasText: 'Cumulative Test' }).first().click(); await p.waitForTimeout(900);
  const nRow = p.locator('[data-a="fileOpen"][data-kind="notes"]').first();
  ok((await nRow.getAttribute('aria-label') || '').startsWith('View'), 'notes row keeps the View (eye) mark');
  await nRow.click(); await p.waitForTimeout(2500);
  ok(await p.locator('a[download]').count() === 0, 'notes file sheet has NO download link (view only)');
  ok(await p.locator('.sheet a.btn', { hasText: 'View' }).count() >= 1, 'notes file sheet has View');
  // a Google Drive test PDF (answer key): the sheet has View and a direct Download, both to Google; our side stores nothing
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const TID = 'aaaaaaaa-0000-0000-0000-0000000000e5';
  await q(`delete from cbt_private.test_pdfs where test_id=$1`, [TID]); await q(`delete from cbt_private.tests where id=$1`, [TID]);
  await q(`insert into cbt_private.tests (id, series_id, title, duration, data, question_count, sort_order, practice) select $1, series_id, 'Drive PDF test', 30, data, question_count, 50, true from cbt_private.tests where id='aaaaaaaa-0000-0000-0000-000000000001'`, [TID]);
  await q(`insert into cbt_private.test_pdfs (test_id, url, label) values ($1, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing', 'Drive PDF test answer key')`, [TID]);
  await p.reload(); await p.waitForTimeout(3500);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.app')); const b = h && [...h.shadowRoot.querySelectorAll('button')].find(x => /^Skip/.test(x.textContent.trim())); if (b) b.click(); }); await p.waitForTimeout(300); }
  await p.evaluate(sid => { location.hash = '#/s/' + sid; }, SER); await p.waitForTimeout(2500);
  await p.locator('[data-a="xt"][data-v="r"]').click(); await p.waitForTimeout(1200);
  await p.locator('[data-a="resOpen"]', { hasText: /answer keys?|Tests/i }).first().click(); await p.waitForTimeout(900);
  const pRow = p.locator('[data-a="pdfOpen"]').first();
  ok(await pRow.count() === 1, 'Drive PDF row is in the folder');
  await pRow.click(); await p.waitForTimeout(700);
  const hv = await p.locator('.sheet a', { hasText: 'View' }).first().getAttribute('href'), hd = await p.locator('.sheet a', { hasText: 'Download' }).first().getAttribute('href');
  ok(/^https:\/\/drive\.google\.com\/file\/d\/1AbCdEfGhIjKlMnOpQrStUv/.test(hv || ''), 'Drive PDF: View goes to Google Drive');
  ok(hd === 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUv', 'Drive PDF: Download is the direct Google download link (' + hd + ')');
  await q(`delete from cbt_private.test_pdfs where test_id=$1`, [TID]); await q(`delete from cbt_private.tests where id=$1`, [TID]);
  ok(await p.evaluate(() => fileDlName('Plan: A/B?', 'application/pdf') === 'Plan AB.pdf' && fileDlName('x.PDF', 'application/pdf') === 'x.PDF' && fileDlName('pic', 'image/png') === 'pic.png' && fileDlName('raw', '') === 'raw' && fileDlName('', 'application/pdf') === 'file.pdf'), 'download name: unsafe characters removed, right extension, no "undefined"');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await q(`delete from cbt_private.file_parts where file_id in ('eeeeeeee-0000-0000-0000-0000000000f1','eeeeeeee-0000-0000-0000-0000000000f2')`);
  await q(`delete from cbt_private.series_files where id in ('eeeeeeee-0000-0000-0000-0000000000f1','eeeeeeee-0000-0000-0000-0000000000f2')`);
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  await br.close(); server.close(); await db.end(); process.exit(fails ? 1 : 0);
})();
