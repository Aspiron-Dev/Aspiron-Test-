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
    await ctx.close();
  }
  await br.close(); server.close(); await db.end();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
