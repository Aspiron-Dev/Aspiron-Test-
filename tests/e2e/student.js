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
// the email / Google login screen (app28.js) comes first: open the access-code screen
const codeScreen = async pg => { await pg.waitForSelector('#em'); await pg.evaluate(() => login('code')); await pg.waitForSelector('#ph'); };
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
  await q(`select set_config('request.headers', '{"x-real-ip":"4.4.4.4"}', false)`);
  await q(`update cbt_private.students set fail_count=0, locked_until=0, devices='{}' where mobile in ('9000000001','9000000002')`);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  // these checks cover the classic pages: the new design is the default now, so they choose the classic design first
  const mk = async (vw) => { const c = await br.newContext({ viewport: vw || { width: 390, height: 844 } }); await c.addInitScript(() => { try { if (localStorage.getItem('cbt_v3') === null) localStorage.setItem('cbt_v3', 'false'); } catch (e) {} }); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); await p.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p.route(SUPA + '/rest/v1/rpc/**', rpcRoute); return { c, p, errs }; };
  // 1. student login keeps a token, not the code
  let { c, p, errs } = await mk();
  await p.goto(BASE + 'index.html'); await codeScreen(p);
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(2500);
  let au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && /^st1\./.test(au.code), 'login stores a token (not the code)');
  ok(!(await p.content()).includes('BBBB2222'), 'code not in the page');
  await p.reload(); await p.waitForTimeout(2500);
  ok(await p.$('#ph') === null && await p.$('#em') === null, 'still signed in after reload (token works)');
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
  ok(await p.$('#ph') === null && await p.$('#em') === null, 'stays signed in during the swap');
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
           on conflict (code,item_id) do update set code='DIWALI', kind='pct', value=20, starts_at=now()-interval '1 minute', ends_at=now()+interval '5 days', active=true`);
  ({ c, p, errs } = await mk());
  await p.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('store_me', JSON.stringify({ name: 'Aman Gupta', mobile: '9822200002', course: 'neet' })); } });
  await p.goto(BASE + 'store.html?r=' + rcode); await p.waitForTimeout(2500);
  ok((await q(`select referrer from cbt_private.refer_links where mobile='9822200002'`)).length === 0, 'refer: opening the link alone joins nobody (v53)');
  await p.click('[data-buy]'); await p.waitForTimeout(700); if (await p.$('[data-scrnext]')) await p.click('[data-scrnext]'); await p.waitForSelector('#cpi'); await p.waitForTimeout(800);
  ok((await q(`select referrer from cbt_private.refer_links where mobile='9822200002'`)).length === 1
     && (await q(`select refer_code from public.cbt_store_orders where mobile='9822200002' and refer_code is not null`)).length === 1, 'refer: the new student\'s own order from the link joins them to the sharer');
  await p.fill('#cpi', 'WRONG1'); await p.click('[data-cpgo]'); await p.waitForTimeout(800);
  ok(/does not work/.test(await p.textContent('#cper')), 'coupon: a wrong code is refused');
  await p.fill('#cpi', 'diwali'); await p.press('#cpi', 'Enter'); await p.waitForTimeout(1200);
  ok((await p.textContent('.amt b')).includes('400'), 'coupon: DIWALI 20% takes ₹499 to ₹400');
  await q(`insert into cbt_private.wallet_txn(mobile,amount,kind,note) values ('9822200002',450,'admin','e2e')`);
  // v53: without the student app's sign-in the wallet is not offered
  await p.evaluate(() => { WAL = null; payStep(); }); await p.waitForTimeout(1200);
  ok(!(await p.$('[data-wal]')), 'wallet: not offered without the student app sign-in');
  await q(`insert into cbt_private.students(name,mobile,status,salt,code_hash,devices) values ('Aman Gupta','9822200002','approved','sa',cbt_private.hash_code('sa','AMAN2222'),'{dev-aman0002}') on conflict do nothing`);
  await p.evaluate(() => { localStorage.setItem('cbt_auth', JSON.stringify({ mobile: '9822200002', code: 'AMAN2222', name: 'Aman Gupta' })); localStorage.setItem('cbt_dev', JSON.stringify('dev-aman0002')); });
  await p.evaluate(() => { WAL = null; payStep(); }); await p.waitForSelector('[data-wal]');
  await p.click('[data-wal]'); await p.waitForSelector('[data-walgo]');
  const wo = (await q(`select amount, wallet_used, coupon_off from public.cbt_store_orders where mobile='9822200002' order by created_at desc limit 1`))[0];
  ok(wo.amount === 0 && wo.wallet_used === 400 && wo.coupon_off === 99, 'wallet: pays the rest of the order (₹0 left to pay)');
  await p.click('[data-close]'); await p.waitForTimeout(500); await p.evaluate(() => go('refer')); await p.waitForTimeout(1500);
  ok(/aman00002/.test(await p.textContent('#rfbox')) && /₹50/.test(await p.textContent('#rfbox')), 'refer page: own link and wallet balance');
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'refer page: no sideways scroll on a phone');
  ok(!errs.length, 'no page errors (coupon / wallet / refer) ' + errs.join(' | ')); await c.close();
  // 5c. Edit name on the summary makes a new order: the coupon stays on it (same amount in the summary and in Orders)
  ({ c, p, errs } = await mk());
  await p.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('store_me', JSON.stringify({ name: 'Janvi', mobile: '9988360846', course: 'neet' })); } });
  await p.goto(BASE + 'store.html'); await p.waitForTimeout(2500);
  await p.click('[data-buy]'); await p.waitForTimeout(700); if (await p.$('[data-scrnext]')) await p.click('[data-scrnext]'); await p.waitForSelector('#cpi'); await p.fill('#cpi', 'DIWALI'); await p.click('[data-cpgo]'); await p.waitForTimeout(1200);
  await p.click('[data-step=paid]'); await p.waitForSelector('#py'); await p.fill('#py', 'janvi'); await p.click('[data-paidgo]'); await p.waitForSelector('[data-edit]');
  await p.click('[data-edit]'); await p.waitForSelector('#en'); await p.fill('#en', 'Janvi Sharma'); await p.click('#esave'); await p.waitForTimeout(2000);
  const eo = (await q(`select amount, coupon_off from public.cbt_store_orders where mobile='9988360846' and name='Janvi Sharma'`))[0];
  ok(eo && eo.amount === 400 && eo.coupon_off === 99 && (await p.textContent('.sum')).includes('₹400'), 'coupon: kept on the new order after Edit name (summary and order ₹400)');
  ok(!errs.length, 'no page errors (edit keeps coupon) ' + errs.join(' | ')); await c.close();
  // 6. checklist C/D in the app: banner link, file view, access request message
  ({ c, p, errs } = await mk());
  await p.goto(BASE + 'index.html'); await codeScreen(p);
  await p.fill('#ph', '9000000002'); await p.fill('#cd', 'BBBB2222'); await p.click('#lbtn'); await p.waitForTimeout(3000);
  const hrefs = await p.$$eval('a[href]', a => a.map(x => x.getAttribute('href')));
  ok(!hrefs.some(h => /^javascript:/i.test(h)), 'no javascript: link from a banner (' + hrefs.filter(h => /example|javascript/.test(h)).join(',') + ')');
  await p.evaluate(() => openFile('ffffffff-0000-0000-0000-000000000002')); await p.waitForTimeout(1500);
  const view = await p.$$eval('.modal a', a => a.map(x => x.textContent.trim()));
  ok(!view.some(t => /View/.test(t)), 'HTML file offered only as a download, never opened: ' + view.join('|'));
  await p.evaluate(() => { try { closeModal(); } catch (e) {} location.hash = '#/refer'; }); await p.waitForTimeout(2000);
  ok(/store\?r=paid00002$/.test(await p.textContent('.rfu span')), 'app refer page: the link opens the store with the student\'s code');
  ok(!errs.length, 'no page errors (checklist C/D) ' + errs.join(' | ')); await c.close();
  ({ c, p, errs } = await mk());
  await p.goto(BASE + 'index.html'); await codeScreen(p);
  await p.evaluate(() => login('request')); await p.waitForTimeout(500);
  const inputs = await p.$$eval('#rq input', a => a.map(x => x.id));
  await p.fill('#' + inputs[0], 'Some One'); await p.fill('#' + inputs[1], '9000000001');
  await p.click('#rbtn'); await p.waitForTimeout(1500);
  const rqTxt = await p.textContent('#rq');
  ok(/Request received/.test(rqTxt) && !/already approved/i.test(rqTxt), 'access request: same message for an existing number');
  await c.close();
  // 7. profile + exam countdown kept on the account (v56): a fresh browser gets them back, a removed countdown stays removed
  await q(`update cbt_private.students set keep='{}', devices='{}', fail_count=0, locked_until=0 where mobile='9000000002'`);
  const signIn = async pg => { await pg.goto(BASE + 'index.html'); await codeScreen(pg); await pg.fill('#ph', '9000000002'); await pg.fill('#cd', 'BBBB2222'); await pg.click('#lbtn'); await pg.waitForTimeout(3000); };
  let c2, p2, errs2;
  ({ c, p, errs } = await mk()); await signIn(p);
  await p.evaluate(() => { pfSave({ school: 'Aspiron Coaching', city: 'Kota', exam: 'NEET', photo: 'data:image/jpeg;base64,/9j/4AAQ' });
    LS.set(cdKey(), { name: 'NEET 2027', date: '2027-05-03T00:00:00.000Z', start: Date.now(), units: ['days', 'hours'] }); });
  await p.waitForTimeout(3000);
  const kp = (await q(`select keep from cbt_private.students where mobile='9000000002'`))[0].keep;
  ok(kp.pf && kp.pf.city === 'Kota' && kp.cd && kp.cd.name === 'NEET 2027', 'profile + countdown: saved on the account');
  ({ c: c2, p: p2, errs: errs2 } = await mk()); await signIn(p2); await p2.waitForTimeout(1500);
  const back = await p2.evaluate(() => ({ pf: pfGet(), cd: cdGet() }));
  ok(back.pf.city === 'Kota' && /^data:image\/jpeg/.test(back.pf.photo || '') && back.cd && back.cd.name === 'NEET 2027', 'profile + countdown: a fresh browser gets them back after sign-in');
  await p2.evaluate(() => LS.del(cdKey())); await p2.waitForTimeout(2500);
  await p.reload(); await p.waitForSelector('#app'); await p.waitForTimeout(3500);
  ok(!(await p.evaluate(() => cdGet())), 'countdown: removed on one phone, it is gone on the other too (and not sent back)');
  ok(!errs.length && !errs2.length, 'no page errors (profile + countdown) ' + errs.concat(errs2).join(' | ')); await c.close(); await c2.close();

  // 8. email + password login (app28.js + supabase_v65): join with the access code once, then the login alone signs in
  await q(`delete from auth.users where email in ('e2e@example.com')`);
  await q(`insert into auth.users(id,email,email_confirmed_at) values ('e2e00000-0000-0000-0000-000000000001','e2e@example.com',now())`);
  await q(`update cbt_private.students set auth_uid=null, devices='{}', fail_count=0, locked_until=0 where mobile='9000000001'`);
  await q(`delete from cbt_private.auth_link_tries`);
  const authRoute = async (route) => {
    const u = route.request().url(), b = JSON.parse(route.request().postData() || '{}');
    if (/token\?grant_type=password/.test(u)) {
      if (b.email === 'e2e@example.com' && b.password === 'Right1234') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: fakeJwt('e2e00000-0000-0000-0000-000000000001', b.email), refresh_token: 'r', expires_in: 3600 }) });
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
    }
    if (/logout/.test(u)) { calls.push('sb_logout'); return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  ({ c, p, errs } = await mk()); await p.route(SUPA + '/auth/v1/**', authRoute);
  await p.goto(BASE + 'index.html'); await p.waitForSelector('#em');
  ok(!!(await p.$('.lgo')) && /Continue with Google/.test(await p.textContent('.lgo')), 'login screen: Google button shown');
  await p.fill('#em', 'e2e@example.com'); await p.fill('#pw', 'Wrong1234'); await p.click('#abtn'); await p.waitForTimeout(800);
  ok(/incorrect/.test(await p.textContent('#er')), 'email login: wrong password is refused');
  await p.fill('#pw', 'Right1234'); await p.click('#abtn'); await p.waitForSelector('#cd', { timeout: 5000 }).catch(() => {});
  ok(/e2e@example\.com/.test(await p.textContent('.au3-mail').catch(() => '')), 'email login: a new login is asked to join a student account');
  await p.fill('#ph', '9000000001'); await p.fill('#cd', 'WRONG999'); await p.click('#abtn'); await p.waitForTimeout(1200);
  ok(/incorrect/i.test(await p.textContent('#er')) && !(await p.evaluate(() => localStorage.getItem('cbt_auth'))), 'join: a wrong code is refused');
  await p.fill('#cd', 'AAAA1111'); await p.click('#abtn'); await p.waitForTimeout(3000);
  au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && au.mobile === '9000000001' && /^st1\./.test(au.code), 'join: the right code signs in with a normal token');
  ok(!(await p.evaluate(() => sessionStorage.getItem('cbt_sb'))) && calls.includes('sb_logout'), 'join: the Supabase session is ended, only the app token is kept');
  ok((await q(`select auth_uid from cbt_private.students where mobile='9000000001'`))[0].auth_uid === 'e2e00000-0000-0000-0000-000000000001', 'join: the login is joined to the student');
  ok(!errs.length, 'no page errors (email login) ' + errs.join(' | ')); await c.close();
  ({ c, p, errs } = await mk()); await p.route(SUPA + '/auth/v1/**', authRoute);
  await p.goto(BASE + 'index.html'); await p.waitForSelector('#em');
  await p.fill('#em', 'e2e@example.com'); await p.fill('#pw', 'Right1234'); await p.click('#abtn'); await p.waitForTimeout(3000);
  au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && au.mobile === '9000000001' && await p.$('#cd') === null, 'email login: next time the login alone signs in (no code)');
  ok(!errs.length, 'no page errors (email login again) ' + errs.join(' | ')); await c.close();
  // 9. back from Google: the login in the address is taken and the address cleaned
  ({ c, p, errs } = await mk()); await p.route(SUPA + '/auth/v1/**', authRoute);
  await p.goto(BASE + 'index.html#access_token=' + fakeJwt('e2e00000-0000-0000-0000-000000000001', 'e2e@example.com') + '&refresh_token=r&expires_in=3600&token_type=bearer');
  await p.waitForTimeout(3500);
  au = await p.evaluate(() => JSON.parse(localStorage.getItem('cbt_auth')));
  ok(au && au.mobile === '9000000001' && !/access_token/.test(p.url()), 'Google return: signed in, token gone from the address');
  ok(!errs.length, 'no page errors (Google return) ' + errs.join(' | ')); await c.close();
  ({ c, p, errs } = await mk());
  await p.goto(BASE + 'index.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await p.waitForSelector('#em'); await p.waitForTimeout(500);
  ok(/expired/.test(await p.textContent('#er')) && !/error=/.test(p.url()), 'expired email link: clear message on the login screen');
  ok(!errs.length, 'no page errors (expired link) ' + errs.join(' | ')); await c.close();
  // the new design is the default: a student who never chose a design gets it right after signing in
  await q(`update cbt_private.students set fail_count=0, locked_until=0, devices='{}' where mobile = '9000000002'`);
  { const c2 = await br.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA), r => r.abort()); await p2.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await p2.goto(BASE + 'index.html'); await codeScreen(p2); await p2.fill('#ph', '9000000002'); await p2.fill('#cd', 'BBBB2222'); await p2.click('#lbtn'); await p2.waitForTimeout(3500);
    const st = await p2.evaluate(() => [document.body.classList.contains('v3on'), document.body.classList.contains('v3old'), !!document.getElementById('v3host')]);
    ok(st[0] && !st[1] && st[2], 'new design is the default after sign-in (' + st.join(',') + ')');
    const vp = await p2.getAttribute('meta[name=viewport]', 'content'); ok(/user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp), 'no pinch / double-tap zoom: ' + vp);
    ok(!e2.length, 'no page errors (new design default) ' + e2.join(' | ')); await c2.close(); }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
