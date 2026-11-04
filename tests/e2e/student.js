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
  if (p === '/cp-dt764twzf54s5m.html' || p === '/cp-dt764twzf54s5m-old.html') { // test only: drop the admin key gate
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

const MINI_PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (Hello PDF) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
(async () => {
  await db.connect();
  await q(`select set_config('request.headers', '{"x-real-ip":"4.4.4.4"}', false)`);
  await q(`update cbt_private.students set fail_count=0, locked_until=0, devices='{}' where mobile in ('9000000001','9000000002')`);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const mk = async (vw) => { const c = await br.newContext({ viewport: vw || { width: 390, height: 844 } }); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute); return { c, p, errs }; };
  // 1. student login keeps a token, not the code
  let { c, p, errs } = await mk();
  await p.goto(BASE + 'index.html'); await p.waitForSelector('#ph');
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(2500);
  let au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && /^st1\./.test(au.code), 'login stores a token (not the code)');
  ok(!(await p.content()).includes('BBBB2222'), 'code not in the page');
  await p.reload(); await p.waitForTimeout(2500);
  ok(await p.$('#ph') === null, 'still signed in after reload (token works)');
  const tok = au.code;
  await p.evaluate(() => doSignOut()); await p.waitForTimeout(6500);
  const after = (await q(`select public.cbt_catalog('9000000002', $1, 'x-device-1') r`, [tok]))[0].r;
  ok(after.error === 'invalid', 'token stops after sign-out');
  ok(!errs.length, 'no page errors (login) ' + errs.join(' | ')); await c.close();
  // 2. a phone that still keeps the old code is switched to a token on open
  ({ c, p, errs } = await mk());
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('cbt_auth', JSON.stringify({ mobile: '9000000002', code: 'BBBB2222', name: 'Paid Student' })); } });
  await p.goto(BASE + 'index.html'); await p.waitForTimeout(3000);
  au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && /^st1\./.test(au.code), 'old saved code swapped for a token');
  ok(await p.$('#ph') === null, 'stays signed in during the swap');
  ok(!errs.length, 'no page errors (swap) ' + errs.join(' | ')); await c.close();
  // 3. frame blocking
  ({ c, p, errs } = await mk());
  await p.route('http://evil.test/', r => r.fulfill({ contentType: 'text/html', body: `<iframe sandbox="allow-scripts allow-same-origin" src="${BASE}index.html" width=300 height=300></iframe>` }));
  await p.goto('http://evil.test/'); await p.waitForTimeout(2000);
  const fr = p.frames().find(f => f.url().startsWith(BASE));
  const disp = fr ? await fr.evaluate(() => document.documentElement.style.display) : 'navigated-away';
  ok(disp === 'none' || disp === 'navigated-away' || !p.url().startsWith('http://evil.test'), 'page hides itself inside another site\'s frame (' + disp + ')');
  await c.close();
  // 4. pdf.js with isEvalSupported:false still reads a PDF
  ({ c, p, errs } = await mk());
  await p.route(BASE + 'pdftest.html', r => r.fulfill({ contentType: 'text/html', body: '<script src="lib/pdfjs-3.11.174/pdf.min.js"></script>' }));
  await p.goto(BASE + 'pdftest.html');
  const txt = await p.evaluate(async (b64) => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs-3.11.174/pdf.worker.min.js';
    const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)); const d = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const pg = await d.getPage(1); const t = await pg.getTextContent(); return t.items.map(i => i.str).join(''); }, MINI_PDF.toString('base64'));
  ok(txt.includes('Hello PDF'), 'PDF still reads with eval off: ' + txt); await c.close();
  // 5. store: buy gives a new code, order page works
  ({ c, p, errs } = await mk());
  await p.addInitScript(() => { localStorage.setItem('store_me', JSON.stringify({ name: 'Test Buyer', mobile: '9876543210', course: 'neet' })); });
  await p.goto(BASE + 'store.html'); await p.waitForTimeout(2500);
  const r1 = await p.evaluate(async () => await rpc('cbt_store_order', { p_item: 'cccccccc-0000-0000-0000-000000000001', p_name: 'Test Buyer', p_mobile: '9876543210' }));
  const r2 = await p.evaluate(async () => await rpc('cbt_store_order', { p_item: 'cccccccc-0000-0000-0000-000000000001', p_name: 'Other', p_mobile: '9876543210' }));
  ok(r1.ok && r2.ok && r1.code !== r2.code, 'store: an existing order code is never handed out again');
  const pd = await p.evaluate(async (code) => await rpc('cbt_store_paid', { p_code: code, p_mobile: '9876543210', p_payer: 'Test Buyer', p_utr: 'UTR123456' }), r1.code);
  ok(pd.ok && pd.status === 'pending', 'store: buyer can still save payer + UTR');
  ok(!errs.length, 'no page errors (store) ' + errs.join(' | ')); await c.close();
  // 5b. v52: referral link, coupon box and wallet at checkout (the price is set on the server only)
  const rcode = (await q(`select public.cbt_refer_me('9811100001','Priya Verma') r`))[0].r.code;
  await q(`insert into cbt_private.store_coupons(item_id,code,kind,value,ends_at) values ('cccccccc-0000-0000-0000-000000000001','DIWALI','pct',20,now()+interval '5 days')
           on conflict (item_id) do update set code='DIWALI', kind='pct', value=20, starts_at=now()-interval '1 minute', ends_at=now()+interval '5 days', active=true`);
  ({ c, p, errs } = await mk());
  await p.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('store_me', JSON.stringify({ name: 'Aman Gupta', mobile: '9822200002', course: 'neet' })); } });
  await p.goto(BASE + 'store.html?r=' + rcode); await p.waitForTimeout(2500);
  ok((await q(`select referrer from cbt_private.refer_links where mobile='9822200002'`)).length === 1, 'refer: a new student who opens the link is joined to the sharer');
  await p.click('[data-buy]'); await p.waitForSelector('#cpi');
  await p.fill('#cpi', 'WRONG1'); await p.click('[data-cpgo]'); await p.waitForTimeout(800);
  ok(/does not work/.test(await p.textContent('#cper')), 'coupon: a wrong code is refused');
  await p.fill('#cpi', 'diwali'); await p.press('#cpi', 'Enter'); await p.waitForTimeout(1200);
  ok((await p.textContent('.amt b')).includes('400'), 'coupon: DIWALI 20% takes ₹499 to ₹400');
  await q(`insert into cbt_private.wallet_txn(mobile,amount,kind,note) values ('9822200002',450,'admin','e2e')`);
  await p.evaluate(() => { WAL = null; payStep(); }); await p.waitForSelector('[data-wal]');
  await p.click('[data-wal]'); await p.waitForSelector('[data-walgo]');
  const wo = (await q(`select amount, wallet_used, coupon_off from public.cbt_store_orders where mobile='9822200002' order by created_at desc limit 1`))[0];
  ok(wo.amount === 0 && wo.wallet_used === 400 && wo.coupon_off === 99, 'wallet: pays the rest of the order (₹0 left to pay)');
  await p.click('[data-close]'); await p.waitForTimeout(500); await p.evaluate(() => go('refer')); await p.waitForTimeout(1500);
  ok(/aman00002/.test(await p.textContent('#rfbox')) && /₹50/.test(await p.textContent('#rfbox')), 'refer page: own link and wallet balance');
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'refer page: no sideways scroll on a phone');
  ok(!errs.length, 'no page errors (coupon / wallet / refer) ' + errs.join(' | ')); await c.close();
  // 6. checklist C/D in the app: banner link, file view, access request message
  ({ c, p, errs } = await mk());
  await p.goto(BASE + 'index.html'); await p.waitForSelector('#ph');
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3000);
  const hrefs = await p.$$eval('a[href]', a => a.map(x => x.getAttribute('href')));
  ok(!hrefs.some(h => /^javascript:/i.test(h)), 'no javascript: link from a banner (' + hrefs.filter(h => /example|javascript/.test(h)).join(',') + ')');
  await p.evaluate(() => openFile('ffffffff-0000-0000-0000-000000000002')); await p.waitForTimeout(1500);
  const view = await p.$$eval('.modal a', a => a.map(x => x.textContent.trim()));
  ok(!view.some(t => /View/.test(t)), 'HTML file offered only as a download, never opened: ' + view.join('|'));
  await p.evaluate(() => { try { closeModal(); } catch (e) {} location.hash = '#/refer'; }); await p.waitForTimeout(2000);
  ok(/store\.html\?r=paid00002$/.test(await p.textContent('.rfu span')), 'app refer page: the link opens the store with the student\'s code');
  ok(!errs.length, 'no page errors (checklist C/D) ' + errs.join(' | ')); await c.close();
  ({ c, p, errs } = await mk());
  await p.goto(BASE + 'index.html'); await p.waitForSelector('#ph');
  await p.evaluate(() => login('request')); await p.waitForTimeout(500);
  const inputs = await p.$$eval('#rq input', a => a.map(x => x.id));
  await p.fill('#' + inputs[0], 'Some One'); await p.fill('#' + inputs[1], '9000000001');
  await p.click('#rbtn'); await p.waitForTimeout(1500);
  const rqTxt = await p.textContent('#rq');
  ok(/Request received/.test(rqTxt) && !/already approved/i.test(rqTxt), 'access request: same message for an existing number');
  await c.close();
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
