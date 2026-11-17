// Admin console tour: every page of the menu, at computer and phone size, light and dark. By hand (not in CI).
// PASS per page: it renders (no "hit a problem"), no page errors, no horizontal scroll on phones. Screenshots in tests/e2e/shots/.
// The REAL pages in Chromium; every Supabase call is answered by the real SQL functions in the throw-away test
// database built by tests/db/build.sh. Prints PASS/FAIL per check and exits 1 on any failure.
const { chromium } = require('playwright');
const { Client } = require('pg');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8769, BASE = `http://127.0.0.1:${PORT}/`;
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
let LIVE = [], liveCalls = 0, STU = {};   // STU: ids of a student who has the PAID series and one who has not   // rows of live_tests, built in the set-up below
const stubLive = id => {   // the shape the panel reads from cbt_admin3 live: counts differ per test
  const k = Math.max(0, LIVE.findIndex(t => t.id === id)), t0 = Date.now(), P = i => ({ id: 'st' + k + '-' + i, name: 'Student ' + k + '-' + i, mobile: '9876' + String(500000 + k * 1000 + i) });
  const row = LIVE.find(t => t.id === id) || { title: 'Old test' };
  return { ok: true, now: t0, eligible: 240, test: { title: row.title, questions: 45, duration: 45, max: 180, active: true, opens_at: t0 - 3600e3 },
    writing: Array.from({ length: 3 + k }, (_, i) => Object.assign(P(i), { started: t0 - 600e3, ends: t0 + 2100e3 })),
    done: Array.from({ length: 12 + k * 7 }, (_, i) => Object.assign(P(100 + i), { score: 100 - i, max: 180, correct: 30, wrong: 5, skipped: 10, used: 1800, at: t0 - 300e3, late: false })),
    waiting: Array.from({ length: 20 }, (_, i) => Object.assign(P(200 + i), i === 0 ? { id: STU.paid } : i === 1 ? { id: STU.free } : i === 2 && STU.chem ? { id: STU.chem[0] } : i === 3 && STU.chem ? { id: STU.chem[1] } : {}, { seen: t0 - 86400e3, devices: 1, max_devices: 2 })), expired: [] };
};
async function rpcRoute(route) {
  const req = route.request(), fn = req.url().split('/rpc/')[1].split('?')[0];
  if (!/^[a-z0-9_]+$/.test(fn)) return route.fulfill({ status: 400, body: '{}' });
  let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
  const keys = Object.keys(body).filter(k => /^p_[a-z0-9_]+$/.test(k));
  const vals = keys.map(k => body[k] === null || body[k] === undefined ? null : typeof body[k] === 'object' ? JSON.stringify(body[k]) : String(body[k]));
  calls.push(fn);
  if (fn === 'cbt_admin3' && (body.p_action === 'live_tests' || body.p_action === 'live')) {
    if (body.p_action === 'live') liveCalls++;
    const out = body.p_action === 'live_tests' ? { ok: true, tests: LIVE } : stubLive((body.p_data || {}).id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  }
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
  await q(`delete from cbt_private.admin_totp; delete from cbt_private.admin_fails; delete from cbt_private.admin_sessions`);
  await q(`update cbt_private.settings set value = encode(sha256(convert_to('aspiron-admin:e2eKey2026', 'UTF8')), 'hex') where key = 'admin_gate'`);
  await q(`insert into storage.objects (bucket_id, name, metadata) values ('notes','bio/cell-notes.pdf','{"size":4200000,"mimetype":"application/pdf"}'),('covers','neet-2027.png','{"size":350000,"mimetype":"image/png"}')`);
  await q(`delete from cbt_private.ops_costs`);
  await q(`insert into cbt_private.ops_costs (service, month, amount, note, due_ms) values ('Supabase', to_char(now(),'YYYY-MM'), 1650, 'Pro plan', (extract(epoch from now() + interval '3 days')*1000)::bigint)`);
  await q(`insert into cbt_private.settings values ('ops_budget','{"Supabase":2000,"GitHub Pages":500}') on conflict (key) do update set value = excluded.value`);
  // long names, to catch overlaps on phones: an order waiting to be verified and a coupon on a long series name
  await q(`update public.cbt_store_items set title = 'NEET ASPIRON TEST SERIES ( Coming soon ) 2027' where id = 'cccccccc-0000-0000-0000-000000000001'`);
  await q(`insert into public.cbt_store_orders (code, item_id, item_title, amount, name, mobile, status, payer, utr, paid_at, lang) values ('ASP-TOUR1', 'cccccccc-0000-0000-0000-000000000001', 'PHYSICS PRO TEST SERIES', 299, 'Tour Student', '9877700001', 'pending', 'Tour Student', '875931003890', now(), 'hi') on conflict do nothing`);
  await q(`insert into cbt_private.store_coupons (item_id, code, kind, value, active, starts_at, ends_at) select 'cccccccc-0000-0000-0000-000000000001', 'TOURLONG', 'flat', 100, true, now(), now() + interval '9 days' where not exists (select 1 from cbt_private.store_coupons where code = 'TOURLONG')`);
  await q(`update cbt_private.tests set opens_at = (extract(epoch from now() - interval '1 hour') * 1000)::bigint, closes_at = (extract(epoch from now() + interval '2 hours') * 1000)::bigint where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004')`);
  await q(`insert into cbt_private.tests select (jsonb_populate_record(null::cbt_private.tests, to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'title', 'Old mock ' || g, 'opens_at', (extract(epoch from now() - (g || ' days')::interval) * 1000)::bigint, 'closes_at', (extract(epoch from now() - (g || ' days')::interval + interval '3 hours') * 1000)::bigint, 'result_at', null))).* from cbt_private.tests t, generate_series(1, 40) g where t.id = 'aaaaaaaa-0000-0000-0000-000000000001'`);
  STU = { paid: (await q(`select s.id from cbt_private.students s join cbt_private.series_access a on a.student_id = s.id where a.series_id = '11111111-1111-1111-1111-111111111111' limit 1`))[0].id };
  STU.free = (await q(`select id from cbt_private.students where id <> $1 limit 1`, [STU.paid]))[0].id;
  LIVE = (await q(`select t.id, t.title, s.title as series, case when t.title in ('Paid Live', 'Free Live') then 1 else 0 end as open_now from cbt_private.tests t join cbt_private.series s on s.id = t.series_id order by s.created_at, t.opens_at desc nulls last limit 12`)).map(r => ({ id: r.id, title: r.title, series: r.series, open_now: r.open_now }));
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  const br = await chromium.launch();
  for (const theme of ['light', 'dark']) for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const tag = vw.width + 'px ' + theme;
    const ctx = await br.newContext({ viewport: vw });
    await ctx.addInitScript(t => { try { localStorage.setItem('adm_k', 'e2eKey2026'); localStorage.setItem('cx_th2', '1'); localStorage.setItem('cx_theme', JSON.stringify(t)); } catch (e) {} }, theme);
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.route(u => !u.href.startsWith(BASE) && !u.href.startsWith(SUPA) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u.href), r => r.abort());   // the real fonts, for the screenshots
    await page.route(SUPA + '/rest/v1/rpc/**', rpcRoute);
    await page.goto(BASE + 'cp-dt764twzf54s5m.html'); await page.waitForSelector('#lg-p');
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(__dirname, 'shots', `login_${vw.width}_${theme}.png`) });
    await page.fill('#lg-p', 'OwnerPass2026x'); await page.click('#lg-go'); await page.waitForSelector('#ax-page');
    const mods = await page.evaluate(() => Object.values(AX.mods).filter(m => m.nav !== false && AX.allowed(m)).map(m => m.id));
    for (const id of mods) {
      errs.length = 0;
      await page.goto(BASE + 'cp-dt764twzf54s5m.html#/' + id); await page.waitForTimeout(1300);
      const txt = await page.textContent('#ax-page');
      const ovf = vw.width < 500 && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      ok(!/hit a problem/.test(txt) && !errs.length && !ovf, `${tag} #/${id}${errs.length ? ' errors: ' + errs.join(' | ') : ''}${ovf ? ' horizontal scroll' : ''}`);
      if (id === 'tests' && vw.width < 500) { await page.click('#ax-more'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(__dirname, 'shots', `more_${vw.width}_${theme}.png`) }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); 
        await page.click('#ax-menu'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(__dirname, 'shots', `menu_${vw.width}_${theme}.png`) }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      if (id === 'offers' && theme === 'light' && vw.width > 500) {   // wallet: add ₹200, then remove ₹50, through the real dialog
        const wal = async (dir, amt) => { await page.goto(BASE + 'cp-dt764twzf54s5m.html#/offers/refer'); await page.waitForSelector('[data-act=adj][data-m=""]'); await page.click('[data-act=adj][data-m=""]'); await page.waitForSelector('#af');
          await page.fill('#af [name=mobile]', '9866600001'); if (dir === 'remove') await page.click('#af [data-seg=dir] [data-v=remove]'); await page.fill('#af [name=amount]', amt); await page.fill('#af [name=note]', 'tour');
          if (dir === 'remove') await page.screenshot({ path: path.join(__dirname, 'shots', 'wallet_remove.png') }); await page.click('.modal [data-act=ok]'); await page.waitForTimeout(900); };
        await wal('add', '200'); await wal('remove', '50');
        ok((await q(`select cbt_private.wallet_balance('9866600001') b`))[0].b === 150, tag + ' wallet: add ₹200 then remove ₹50 leaves ₹150');
      }
      if (id === 'students' && vw.width < 500 && theme === 'light') { await page.click('[data-act=open][data-id] .sx-name, [data-act=open][data-id]'); await page.waitForSelector('.s3-tabs'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(__dirname, 'shots', 'student_drawer_390.png') }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      if (id === 'home' && theme === 'light' && vw.width > 500) {   // owner profile: save through the form, the name shows at once
        await page.click('#ax-prof'); await page.click('.modal [data-act=edit]'); await page.waitForSelector('#pf');
        await page.fill('#pf [name=name]', 'Sanjay Joshi'); await page.fill('#pf [name=mobile]', '9876543210'); await page.fill('#pf [name=email]', 'owner@example.com');
        await page.screenshot({ path: path.join(__dirname, 'shots', 'profile_edit.png') }); await page.click('.modal [data-act=save]'); await page.waitForTimeout(1200);
        ok((await q(`select value::jsonb->>'mobile' m from cbt_private.settings where key = 'owner_profile'`))[0].m === '9876543210' && /Sanjay/.test(await page.textContent('#ax-page')), tag + ' owner profile: saved, and the name shows on the page');
      }
      if (id === 'home') { await page.click('#ax-prof'); await page.waitForTimeout(500); ok(/Sign out/.test(await page.textContent('.modal')), tag + ' profile sheet opens'); await page.screenshot({ path: path.join(__dirname, 'shots', `profile_${vw.width}_${theme}.png`) }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      if (['home', 'storage', 'billing', 'students', 'orders', 'offers', 'tests', 'team'].includes(id)) await page.screenshot({ path: path.join(__dirname, 'shots', `${id}_${vw.width}_${theme}.png`), fullPage: vw.width > 500 });
    }
    if (theme === 'light') {   // live monitor + Home: series boards, swipe, history, search
      const U = x => BASE + 'cp-dt764twzf54s5m.html#/' + x, phone = vw.width < 500, sh = n => page.screenshot({ path: path.join(__dirname, 'shots', n + '_' + vw.width + '.png') });
      await page.goto(U('live')); await page.waitForSelector('.lv-pane .lv-board .k-v'); await page.waitForTimeout(1200);
      const titles = await page.$$eval('.lv-pane h3', a => a.map(x => x.textContent.trim()));
      ok(titles.length === 3 && ['Paid Live', 'Free Live', 'Open mock'].every(t => titles.includes(t)), tag + ' live: one board per live test ' + titles.join('|'));
      const sers = (await page.$$eval('.lv-ser', a => a.map(x => x.textContent.trim()))).join('|');
      ok(/PAID Series/.test(sers) && /FREE Series/.test(sers), tag + ' live: every board names its series: ' + sers);
      ok((await page.isVisible('.lv-dots')) === phone, tag + ' live: dots only when boards do not all fit (' + phone + ')');
      ok(/\d/.test(await page.textContent('.lv-pane .k-v')) && !/Loading/.test(await page.textContent('.lv-pane')), tag + ' live: numbers are filled in');
      const nots = await page.$$eval('.lv-pane', a => Object.fromEntries(a.map(p => [p.querySelector('h3').textContent.trim(), p.querySelector('.lv-stat.mut .k-v').textContent.trim()])));
      ok(nots['Paid Live'] === '1' && nots['Free Live'] === '20' && nots['Open mock'] === '20' && /have this series/.test(await page.textContent('.lv-pane:first-child')), tag + ' live: "Not started" counts only the students who have the series (free series: everyone) ' + JSON.stringify(nots));
      await sh('live');
      if (phone) await page.evaluate(() => { const r = document.getElementById('lv-row'), p = document.querySelectorAll('.lv-pane')[1]; r.scrollTo({ left: p.offsetLeft }); });
      else await page.click('.lv-pane:nth-child(2) .lv-bh');
      await page.waitForTimeout(700);
      ok(new RegExp(titles[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.textContent('#lv-for')) && (await page.$$eval('.lv-pane', a => a.findIndex(x => x.classList.contains('on')))) === 1, tag + ' live: ' + (phone ? 'swiping' : 'tapping') + ' to the 2nd board opens its student list');
      if (phone) { await page.click('.lv-dot:nth-child(3)'); await page.waitForTimeout(700); ok((await page.$$eval('.lv-dot', a => a.findIndex(x => x.classList.contains('on')))) === 2 && (await page.$$eval('.lv-pane', a => a.findIndex(x => x.classList.contains('on')))) === 2, tag + ' live: a dot jumps to that board'); }
      const c0 = liveCalls; await page.click('#ax-ph [data-act=refresh]'); await page.waitForTimeout(1200);
      ok(liveCalls - c0 >= 3, tag + ' live: Refresh asks for new numbers for every board (' + (liveCalls - c0) + ' calls)');
      // a test that opens while the page is open gets its board without a reload (the check runs every 1.5 s here, once a minute for real)
      await page.evaluate(() => { AX.live.watchMs = 1500; AX.live.catEvery = 1; }); await page.goto(U('live')); await page.waitForSelector('.lv-pane .lv-board .k-v');
      const nid = (await q(`insert into cbt_private.tests select (jsonb_populate_record(null::cbt_private.tests, to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'title', 'Late mock', 'opens_at', (extract(epoch from now() - interval '1 minute') * 1000)::bigint, 'closes_at', (extract(epoch from now() + interval '1 hour') * 1000)::bigint))).* from cbt_private.tests t where t.id = 'aaaaaaaa-0000-0000-0000-000000000002' returning id`))[0].id;
      LIVE.push({ id: nid, title: 'Late mock', series: 'FREE Series', open_now: 0 }); await page.evaluate(() => { AX.cache.drop('catalog'); }); await page.waitForTimeout(4500);
      ok((await page.$$eval('.lv-pane', a => a.length)) === 4 && (await page.$$eval('.lv-pane h3', a => a.map(x => x.textContent.trim()))).includes('Late mock'), tag + ' live: a test that opens later gets its board by itself');
      await q(`delete from cbt_private.tests where id = $1`, [nid]); LIVE.pop(); await page.evaluate(() => { AX.live.watchMs = 0; AX.live.catEvery = 5; AX.cache.drop('catalog'); });
      // a series made later: its live board counts only its own students, and the access check lists it — no code change
      const CS = '33333333-3333-3333-3333-333333333333';
      await q(`insert into cbt_private.series (id, title, is_free) values ($1, 'CHEM Series', false)`, [CS]);
      STU.chem = (await q(`insert into cbt_private.students (id, name, mobile, status, salt, code_hash) values (gen_random_uuid(), 'Chem A', '9100000011', 'approved', 'x', 'x'), (gen_random_uuid(), 'Chem B', '9100000012', 'approved', 'x', 'x') returning id`)).map(r => r.id);
      await q(`insert into cbt_private.series_access (student_id, series_id) select id, $1 from cbt_private.students where mobile in ('9100000011', '9100000012')`, [CS]);
      const cid = (await q(`insert into cbt_private.tests select (jsonb_populate_record(null::cbt_private.tests, to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'title', 'Chem Live', 'series_id', $1::text, 'opens_at', (extract(epoch from now() - interval '1 minute') * 1000)::bigint, 'closes_at', (extract(epoch from now() + interval '1 hour') * 1000)::bigint))).* from cbt_private.tests t where t.id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id`, [CS]))[0].id;
      LIVE.push({ id: cid, title: 'Chem Live', series: 'CHEM Series', open_now: 0 });
      await page.goto(U('home')); await page.evaluate(() => { AX.cache.drop('catalog'); AX.cache.drop('students'); AX.cache.drop('access_check'); }); await page.goto(U('live'));
      await page.waitForSelector('.lv-pane .lv-board .k-v'); await page.waitForTimeout(1800);
      const nots2 = await page.$$eval('.lv-pane', a => Object.fromEntries(a.map(p => [p.querySelector('h3').textContent.trim(), p.querySelector('.lv-stat.mut .k-v').textContent.trim()])));
      ok(nots2['Chem Live'] === '2' && nots2['Paid Live'] === '1' && nots2['Free Live'] === '20', tag + ' new series: its live board counts only its own 2 students, the others are unchanged ' + JSON.stringify(nots2));
      await page.goto(U('access')); await page.waitForSelector('.ac-card'); await page.waitForTimeout(300);
      const acs = await page.$$eval('.ac-card', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      ok(acs.some(c => /CHEM Series/.test(c) && /2 students have it/.test(c)) && acs.some(c => /PAID Series/.test(c)) && !acs.some(c => /FREE Series/.test(c)), tag + ' access check: every paid series is listed, the new one too, the free one is not: ' + acs.map(x => x.slice(0, 34)).join(' / '));
      await sh('access');
      // like on a phone: scrolled down, tap the card (not its title) → that series and its students are on screen at once
      const vs0 = page.viewportSize(); await page.setViewportSize({ width: vs0.width, height: 300 });   // short screen, so the page really scrolls
      const bar = await page.$('.ac-card:has-text("CHEM Series") .ac-bar');
      await bar.evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
      ok(await page.evaluate(() => scrollY > 0), tag + ' access check: (test set-up) the card list is scrolled down');
      const bb = await bar.boundingBox();
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForSelector('#ac-rows .ac-row'); await page.waitForTimeout(400);
      const inView = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      const backSeen = await page.evaluate(() => scrollY === 0); await page.setViewportSize(vs0); await page.waitForTimeout(200);
      ok(backSeen && await inView('#ac-rows .ac-row') && (await page.$$eval('.ac-card', a => a.length)) === 1 && /access\/33333333-3333-3333-3333-333333333333$/.test(page.url()), tag + ' access check: a tap on the card (scrolled down) shows that series\' students on screen, without the other cards');
      await page.click('.ac-card .ac-chip.bad'); await page.waitForTimeout(400);
      ok(/\/none$/.test(page.url()) && (await page.$$eval('#ac-rows .ac-row', a => a.length)) === 2, tag + ' access check: a number on the card filters the list');
      // opening and closing a student does not redraw the list (the place in a long list is kept)
      await page.evaluate(() => { document.getElementById('ac-rows').dataset.mark = '1'; });
      await page.click('#ac-rows .ac-row'); await page.waitForSelector('.drawer'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      ok(await page.$eval('#ac-rows', e => e.dataset.mark === '1'), tag + ' access check: closing a student keeps the list as it was');
      await sh('access_open');
      await page.click('.ac-back'); await page.waitForSelector('.ac-card'); await page.waitForTimeout(300);
      ok((await page.$$eval('.ac-card', a => a.length)) >= 2, tag + ' access check: "All series" goes back to every card');
      await page.goto(U('access/' + CS + '/none')); await page.waitForSelector('#ac-rows .ac-row'); await page.waitForTimeout(300);
      ok((await page.$$eval('#ac-rows .ac-row', a => a.length)) === 2 && /No payment record/.test(await page.textContent('#ac-rows')), tag + ' access check: the students without a payment record are listed');
      await page.click('#ac-rows .ac-row'); await page.waitForSelector('.drawer'); ok(/Chem/.test(await page.textContent('.drawer')), tag + ' access check: a row opens the student'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await q(`delete from cbt_private.tests where id = $1`, [cid]); await q(`delete from cbt_private.series_access where series_id = $1`, [CS]); await q(`delete from cbt_private.students where mobile in ('9100000011', '9100000012')`); await q(`delete from cbt_private.series where id = $1`, [CS]);
      LIVE.pop(); STU.chem = null; await page.evaluate(() => { AX.cache.drop('catalog'); AX.cache.drop('students'); AX.cache.drop('access_check'); });
      // a series shaped like the owner's (5 folders: one hidden, two empty; 7 tests; long titles) — every action is one tab away
      const BS = '44444444-4444-4444-4444-444444444444';
      await q(`insert into cbt_private.series (id, title, is_free, price_label) values ($1, 'BIOLOGY PRO TEST SERIES NEET 2027 with a long name', false, '399 ₹')`, [BS]);
      const FO = (await q(`insert into cbt_private.folders (series_id, title, sort_order, active) values ($1, 'Prectice sheets', 1, false), ($1, 'PRO - TEST', 2, true), ($1, 'Cumulative test', 3, true), ($1, 'Full Syllabus', 4, true), ($1, 'DEMO TEST', 5, true) returning id, title`, [BS]));
      const fid = n => FO.find(f => f.title === n).id;
      for (const [t, f, i] of [['Cell Unit of life Prectice sheet', 'Prectice sheets', 1], ['Cell Cycle and division Prectice sheet', 'Prectice sheets', 2], ['Pro Test 01 :- Cell unit of life', 'PRO - TEST', 1], ['Pro test 02 :- Biomolecules', 'PRO - TEST', 2], ['Pro test 03 - Cell Cycle and Cell Devison', 'PRO - TEST', 3], ['Breathing & Exchange of Gases', 'DEMO TEST', 1], ['Morphology in flowering plants', 'DEMO TEST', 2]])
        await q(`insert into cbt_private.tests select (jsonb_populate_record(null::cbt_private.tests, to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'title', $2::text, 'series_id', $1::text, 'folder_id', $3::text, 'sort_order', $4::int, 'opens_at', null))).* from cbt_private.tests t where t.id = 'aaaaaaaa-0000-0000-0000-000000000001'`, [BS, t, fid(f), i]);
      await page.evaluate(() => AX.cache.drop('catalog'));
      await page.goto(U('tests/s/' + BS)); await page.waitForSelector('.ts-tr'); await page.waitForTimeout(500);
      const tabsTxt = await page.$$eval('#ax-tabs a', a => a.map(x => x.textContent.replace(/\d+/g, '').trim()));
      const firstOk = await page.$eval('.ts-tr', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100; });
      ok(JSON.stringify(tabsTxt) === '["Tests","Settings","Messages"]' && firstOk, tag + ' series page: tabs Tests / Settings / Messages, and the first test is on the first screen ' + JSON.stringify(tabsTxt) + ' ' + firstOk);
      ok((await page.$$eval('.ts-fold', a => a.length)) === 5 && (await page.$$eval('.ts-tr', a => a.length)) === 7 && (await page.$$('[data-act=newFolder]')).length === 1, tag + ' series page: every folder and test, New folder next to them');
      await sh('series_tests');
      const cb = await page.$eval('#ax-crumb', e => ({ t: e.textContent, r: Math.max(...[...e.children].map(c => c.getBoundingClientRect().right)) }));
      const sx = await page.$eval('#ax-search', e => e.getBoundingClientRect().left);
      ok(/BIOLOGY PRO/.test(cb.t) && !(await page.$('#ax-crumb .cb-tab')) && cb.r <= sx + 1, tag + ' series page: the top trail names the series and stays clear of the search button ' + JSON.stringify(cb.t) + ' ' + Math.round(cb.r) + '/' + Math.round(sx));
      ok(!(await page.$('#ax-tabs a em')), tag + ' series page: no red number on the Tests tab');
      ok((await page.$$('#ax-ph [data-act=editS]')).length === 1, tag + ' series page: Edit is still in the header');
      const acts = async tb => { await page.click('#ax-tabs a:has-text("' + tb + '")'); await page.waitForSelector('.ts-act'); await page.waitForTimeout(300); return page.$$eval('.ts-act', a => a.map(x => x.dataset.act)); };
      const sa = await acts('Settings'); await sh('series_settings');
      ok(['editS', 'media', 'sMedium', 'arrangeRes', 'delS'].every(x => sa.includes(x)) && /\/settings$/.test(page.url()), tag + ' series page: Settings has name/price, cover & files, medium, resources order, delete: ' + sa.join(','));
      ok(/399/.test(await page.textContent('.ts-act[data-act=editS]')) && /No cover photo/.test(await page.textContent('[data-act=media]')), tag + ' series page: each setting shows what it is set to now');
      await page.evaluate(() => AX.emit('tests:changed')); await page.waitForTimeout(800);
      ok((await page.$$('.ts-act[data-act=arrangeRes]')).length === 1, tag + ' series page: a save elsewhere redraws the same tab');
      const ma = await acts('Messages'); await sh('series_messages');
      ok(['amsg', 'ann', 'sNotice', 'sPush'].every(x => ma.includes(x)), tag + ' series page: Messages has approval message, announcements, notice, phone notification: ' + ma.join(','));
      await page.click('.ts-act[data-act=amsg]'); await page.waitForSelector('.modal,.drawer'); await page.waitForTimeout(300); ok(true, tag + ' series page: a message row opens its editor'); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.goto(U('tests')); await page.waitForSelector('[data-act=sMenu][data-id="' + BS + '"]'); await page.click('[data-act=sMenu][data-id="' + BS + '"]'); await page.waitForTimeout(400);
      const mt = await page.evaluate(() => document.body.innerText);
      ok(/Approval message & Telegram link/.test(mt) && /Cover photo & files/.test(mt) && /Delete series/.test(mt) && /Announcements/.test(mt), tag + ' series card menu: the same actions as the series page');
      ok(await page.$eval('.pop', p => { const r = p.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && p.scrollHeight >= p.clientHeight; }), tag + ' series card menu: fits on the screen (scrolls if long)');
      await page.mouse.click(2, 300); await page.waitForTimeout(300);
      ok(!(await page.$('.pop')), tag + ' series card menu: a tap outside closes it');
      await q(`DELETE FROM cbt_private.tests WHERE series_id = $1`, [BS]); await q(`DELETE FROM cbt_private.folders WHERE series_id = $1`, [BS]); await q(`DELETE FROM cbt_private.series WHERE id = $1`, [BS]);
      await page.evaluate(() => AX.cache.drop('catalog'));
      // Question of the Day: the page lists days with their questions, "Add questions" picks from the bank (a picture one cannot be picked), move and remove work
      await q(`insert into cbt_private.qbank (id, subject, q, options, answer, explanation) values
        ('d2d2d2d2-0000-0000-0000-000000000001', 'phy', 'Tour QOTD physics question one with a fairly long text to wrap on two lines of a phone screen, then some more words', '["a","b","c","d"]', 1, 'e1'),
        ('d2d2d2d2-0000-0000-0000-000000000002', 'bio', 'Tour QOTD biology question', '["a","b","c","d"]', 2, 'e2')`);
      await q(`insert into cbt_private.qbank (id, subject, q, options, answer, explanation, img) values ('d2d2d2d2-0000-0000-0000-000000000003', 'chem', 'Tour QOTD picture question', '["a","b","c","d"]', 0, 'e3', 'data:image/png;base64,AAAA')`);
      await q(`insert into cbt_private.qotd (qid, show_on, sort) values ('d2d2d2d2-0000-0000-0000-000000000001', cbt_private.qotd_day(), 0)`);
      await page.evaluate(() => AX.cache.drop('qotd')); await page.goto(U('qotd')); await page.waitForSelector('.qd-day'); await page.waitForTimeout(400);
      ok(/Today/.test(await page.textContent('.qd-day.now')) && /Tour QOTD physics/.test(await page.textContent('.qd-day.now')) && /No answers yet/.test(await page.textContent('.qd-day.now')) && (await page.$$('.callout.ok')).length === 1, tag + ' question of the day: today is listed with its question and the "today has 1 question" note');
      await sh('qotd');
      await page.click('#ax-ph [data-act=add]'); await page.waitForSelector('.qa-r'); await page.waitForTimeout(400);
      const rowsT = await page.$$eval('.qa-r', a => a.map(x => ({ off: x.classList.contains('off'), t: x.textContent })));
      ok(rowsT.length === 3 && rowsT.some(x => x.off && /picture/.test(x.t)), tag + ' question of the day: the add dialog lists the bank, a picture question is greyed out');
      await page.selectOption('#qa-s', 'phy'); await page.waitForTimeout(700);
      const chOk = await page.$$eval('#qa-c option', a => a.length > 1) && !(await page.$eval('#qa-c', e => e.disabled));
      ok(chOk && (await page.$$('.qa-r')).length === 1, tag + ' question of the day: choosing a subject offers its chapters and narrows the list');
      await page.selectOption('#qa-s', ''); await page.waitForTimeout(700);
      await page.fill('#qa-q', 'biology'); await page.waitForTimeout(800);
      ok((await page.$$('.qa-r')).length === 1, tag + ' question of the day: search narrows the list');
      await page.click('.qa-r input'); await page.waitForTimeout(200);
      ok(/Add 1 question/.test(await page.textContent('#qa-go')), tag + ' question of the day: the button counts the picked questions');
      await page.click('[data-act=dayTo][data-d]:has-text("Tomorrow")'); await page.click('#qa-go'); await page.waitForTimeout(1500);
      ok(/Tour QOTD biology/.test(await page.textContent('#ax-body')) && /Tomorrow/.test(await page.textContent('#ax-body')), tag + ' question of the day: the picked question is on tomorrow');
      await page.click('.qd-row:has-text("Tour QOTD biology") [data-act=remove]'); await page.waitForSelector('#cf-yes'); await page.click('#cf-yes'); await page.waitForTimeout(1200);
      ok(!/Tour QOTD biology/.test(await page.textContent('#ax-body')), tag + ' question of the day: take-off removes it');
      await q(`DELETE FROM cbt_private.qotd WHERE qid::text LIKE 'd2d2d2d2%'`); await q(`DELETE FROM cbt_private.qbank WHERE id::text LIKE 'd2d2d2d2%'`); await page.evaluate(() => AX.cache.drop('qotd'));
      await page.goto(U('live/history')); await page.waitForSelector('.lv-sc-card'); await page.waitForTimeout(300);
      const cards = await page.$$eval('.lv-sc-card', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      ok(cards.length >= 2 && cards.some(c => /PAID Series/.test(c) && /1 live/.test(c)) && cards.some(c => /FREE Series/.test(c) && /2 live/.test(c)), tag + ' history: series first, with how many are live: ' + cards.join(' / '));
      await sh('history');
      await page.click('.lv-sc-card:has-text("PAID Series")'); await page.waitForSelector('#lv-hl .li'); await page.waitForTimeout(300);
      ok(/Paid Live/.test(await page.textContent('#lv-hl .li .t')) && (await page.$$eval('#lv-hl .li', a => a.length)) === 30, tag + ' history: live test first, 30 at a time');
      await page.click('[data-act=more]'); await page.waitForTimeout(300);
      ok((await page.$$eval('#lv-hl .li', a => a.length)) === 41, tag + ' history: "show more" lists all 41 tests of the series');
      await page.fill('[data-act=hq]', 'Old mock 7'); await page.waitForTimeout(500);
      ok((await page.$$eval('#lv-hl .li', a => a.length)) === 1, tag + ' history: search finds one test among many');
      await sh('series');
      await page.click('#lv-hl .li'); await page.waitForSelector('.lv-pane .lv-board .k-v'); await page.waitForTimeout(900);
      ok((await page.$$eval('.lv-pane', a => a.length)) === 1 && /Old mock 7/.test(await page.textContent('.lv-pane h3')) && /PAID Series/.test(await page.textContent('.btn.ghost[href*="history"]')), tag + ' history: an older test opens as one board, with a way back to its series');
      await page.goto(U('home')); await page.waitForSelector('.hm-lc'); await page.waitForTimeout(1500);
      const hc = await page.$$eval('.hm-lc', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      ok(hc.length === 3 && (await page.$$eval('[data-lcn=writing]', a => a.every(x => /\d/.test(x.textContent)))), tag + ' home: all live tests at once, with numbers: ' + hc.map(x => x.slice(0, 40)).join(' / '));
      ok((await page.textContent('[data-lc="aaaaaaaa-0000-0000-0000-000000000001"] [data-lcn=waiting]')) === '1', tag + ' home: the paid series card counts only the students who have the series');
      await sh('homelive');
    }
    await ctx.close();
  }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
