/* =====================================================================
   Store — setup of the public store page and its numbers.
   Tabs: Overview (sales, funnel, payments to verify) · Items (test series cards) · Layout (sections / rows / order)
         · Explore pages (description, demo tests) · Coming soon (Buy now on/off, waiting lists) · Settings (UPI + history)
   Server: cbt_admin_store (get, save_item, delete_item, save_settings, series_cover) · cbt_admin_series_cover ·
           cbt_admin_store_schedule · cbt_store_schedules (public) · cbt_admin_store_audit · cbt_admin_store_launch ·
           cbt_admin_store_layout · cbt_admin_store_explore
   SQL: supabase_v13_store, v17, v18, v19, v20, v28, v30_store_explore, v31_store_soon, v32_store_layout
   Uses AX.sto from m-orders.js (loaded first).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const CFG = AX.cfg || {};
const S = AX.sto;
const DAY = 864e5;
const ms = t => AX.fmt.ms(t) || 0;
const COLORS = [['blue', 'Blue', '#2563eb'], ['green', 'Green', '#059669'], ['purple', 'Purple', '#7c3aed'], ['orange', 'Orange', '#ea580c'], ['red', 'Red', '#dc2626'], ['dark', 'Dark', '#1e293b']];
const hex = c => (COLORS.find(x => x[0] === c) || COLORS[0])[2];
const SECI = [[/full|complete|mock|grand|all india/i, 'layers'], [/subject/i, 'book'], [/chapter|unit/i, 'fileText'], [/topic/i, 'target'], [/pyq|previous|past/i, 'history'], [/crash|revision|rapid|short/i, 'zap'], [/free|demo/i, 'gift']];
const secIcon = n => (SECI.find(([r]) => r.test(n || '')) || [0, 'sparkle'])[1];
const clean40 = v => String(v || '').replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const TABS = [{ id: 'overview', title: 'Overview', icon: 'chart' }, { id: 'items', title: 'Items', icon: 'layers' }, { id: 'layout', title: 'Layout', icon: 'grid' },
  { id: 'explore', title: 'Explore pages', icon: 'compass' }, { id: 'soon', title: 'Coming soon', icon: 'bell' }, { id: 'settings', title: 'Payment settings', icon: 'settings' }];
const T = { day: null, money: null, cf: '', dp: '30', tab: 'overview', cat: null, notify: undefined, demos: undefined, sched: undefined, view: null };
const can = () => AX.can('store', 'manage');
const D = () => S.cur || { items: [], orders: [], settings: {} };

/* ---------- data ---------- */
async function extras(force) {
  const [n, x, s] = await Promise.all([
    AX.cache.get('store:notify', () => AX.api.call('cbt_admin_store_launch', 'get'), 30000, force),
    AX.cache.get('store:demos', () => AX.api.call('cbt_admin_store_explore', 'get'), 30000, force),
    AX.cache.get('store:sched', () => AX.api.rpc('cbt_store_schedules', {}, { auth: false }), 60000, force)
  ]);
  T.notify = n.ok ? (n.notify || []).reduce((m, r) => ((m[r.item_id] = m[r.item_id] || []).push(r), m), {}) : n.error === 'missing' ? null : undefined;
  T.demos = x.ok ? (x.demos || []).reduce((m, r) => ((m[r.item_id] = m[r.item_id] || {})[r.slot] = r, m), {}) : x.error === 'missing' ? null : 'err';
  T.sched = s.ok ? (s.items || []).reduce((m, r) => (m[r.id] = r, m), {}) : null;
}
async function loadAll(force) {
  const [d, c] = await Promise.all([S.load(force), AX.data.catalog()]);
  T.cat = c && c.ok ? c : { series: [], tests: [] };
  if (d.ok) await extras(force);
  return d;
}
// after a store change: refetch and repaint the visible tab
async function refresh() {
  AX.cache.drop('store');
  await loadAll(true);
  AX.emit('data:changed');
  if (T.view && T.view.alive()) T.view.paint();
}
const series = id => (T.cat.series || []).find(s => s.id === id);
const v32 = () => { const it = D().items; return !it.length || 'section' in it[0]; };
const visible = x => !T.cf || !x.course || x.course === T.cf;
const sold = x => D().orders.filter(o => o.item_id === x.id && S.seg(o) === 'done').length;
const waiting = x => ((T.notify || {})[x.id] || []);
const nextOrd = () => Math.max(0, ...D().items.map(x => x.sort_order || 0)) + 10;
// sections in the saved order, then any others; series without a section last — exactly as store.js does
function groups() {
  const set = D().settings, Sx = (set.sections || []).map(x => String(x).trim()).filter(Boolean), ord = Sx.map(x => x.toLowerCase()), G = new Map();
  const L = D().items.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const x of L) { const n = String(x.section || '').trim(), k = n.toLowerCase(); if (!G.has(k)) G.set(k, { k, name: Sx[ord.indexOf(k)] || n, items: [] }); G.get(k).items.push(x); }
  const rank = k => k ? (ord.includes(k) ? ord.indexOf(k) : 1e6) : 2e6;
  return [...G.values()].map((g, i) => Object.assign(g, { i })).sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i);
}
function sectionNames() {
  const m = new Map();
  for (const v of [...(D().settings.sections || []), ...D().items.map(x => x.section), 'Full syllabus', 'Subject-wise', 'Chapter-wise', 'Topic-wise']) { const t = String(v || '').trim(); if (t && !m.has(t.toLowerCase())) m.set(t.toLowerCase(), t); }
  return [...m.values()];
}
// auto-fill a store item from a series (same rules as before)
function auto(s) {
  const n = (T.cat.tests || []).filter(t => t.series_id === s.id).length, d = String(s.description || '').replace(/\r/g, '').trim();
  let parts = d.replace(/([.!?])\s+(?=[A-Z0-9₹])/g, '$1\n').split(/\n+|[••|;]/).map(x => x.replace(/^[\s\-*–>✓✔]+/, '').replace(/\s+/g, ' ').replace(/\.$/, '').trim()).filter(x => x.length > 1);
  parts = parts.map(x => x.length > 110 ? x.slice(0, 107).replace(/\s\S*$/, '') + '…' : x);
  const isList = /^[\s••\-*✓✔]/.test(d), sub = !isList && parts.length ? parts.shift() : '', f = [];
  if (n && !/\d+\s*(\+\s*)?(full[- ]?(length|syllabus)?\s*|mock\s*|chapter[- ]?wise\s*|part\s*|unit\s*)?tests?\b/i.test(d)) f.push(`${n} test${n > 1 ? 's' : ''} in this series`);
  for (const l of parts) if (f.length < 6 && !f.some(x => x.toLowerCase() === l.toLowerCase())) f.push(l);
  for (const l of ['All-India rank after every test', 'Detailed solutions & analysis']) if (f.length < 8) f.push(l);
  const pm = String(s.price_label || '').replace(/,/g, '').match(/\d+/);
  return { title: s.title, subtitle: sub.slice(0, 200), price: pm ? parseInt(pm[0], 10) : '', features: f, series_id: s.id, description: d.slice(0, 6000) };
}
async function seriesCover(sid) {
  const r = await AX.api.rpc('cbt_admin_series_cover', { p_series: sid });
  if (r.ok && r.cover) return r.cover;
  const x = await AX.api.call('cbt_admin_store', 'series_cover', { id: sid });
  return x.ok && x.cover ? x.cover : '';
}
// JPEG on white, longest side ≤ maxW, shrunk until ≤ 260 000 chars (same as the old panel)
function compress(src, maxW, q) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      let w = im.naturalWidth, hh = im.naturalHeight; const sc = Math.min(1, maxW / Math.max(w, 1)); w = Math.round(w * sc); hh = Math.round(hh * sc);
      const c = document.createElement('canvas'); c.width = w; c.height = hh; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(im, 0, 0, w, hh);
      let out = c.toDataURL('image/jpeg', q || .8), qq = q || .8;
      while (out.length > 260000 && qq > .45) { qq -= .1; out = c.toDataURL('image/jpeg', qq); }
      if (out.length > 260000) { const c2 = document.createElement('canvas'); c2.width = Math.round(w * .7); c2.height = Math.round(hh * .7); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); out = c2.toDataURL('image/jpeg', .6); }
      res(out);
    };
    im.onerror = () => res(null); im.src = src;
  });
}
// schedule / demo file: PDF or photo, max 5 MB
async function readDoc(f, fallbackName) {
  if (!f) return null;
  if (f.size > 5 * 1048576) { UI.toast('File is too big (max 5 MB)', { tone: 'bad' }); return null; }
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!pdf && !/^image\//.test(f.type)) { UI.toast('Use a PDF or a photo', { tone: 'bad' }); return null; }
  let data = await AX.u.fileToDataURL(f);
  if (pdf) data = data.replace(/^data:[^;]*;/, 'data:application/pdf;'); else data = (await compress(data, 1600, .82)) || data;
  return { data, name: (f.name.replace(/\.[^.]+$/, '') || fallbackName).slice(0, 80), size: Math.round(data.length * 3 / 4) };
}
const layErr = r => { UI.toast(r.error === 'missing' ? 'Run supabase_v32_store_layout.sql once in Supabase first' : r.error === 'network' ? 'No internet — try again' : 'Could not save — try again', { tone: 'bad' }); refresh(); };
let LQ = Promise.resolve();
const lay = (a, d) => (LQ = LQ.then(() => AX.api.call('cbt_admin_store_layout', a, d)));
const itemPayload = (x, over) => Object.assign({ id: x.id || '', title: x.title, subtitle: x.subtitle || '', price: x.price, mrp: x.mrp == null ? '' : x.mrp, badge: x.badge || '', color: x.color || 'blue', series_id: x.series_id || '', sort_order: x.sort_order || 0, active: x.active !== false, features: x.features || [], image: x.image || '' }, over || {});

/* ---------- shared pieces ---------- */
const cover = (x, cls) => h`<div class="st-cv ${cls || ''}" style="--cc:${hex(x.color)}">${x.image ? h`<img src="${x.image}" alt="" loading="lazy">` : h`<span>${(String(x.title || '?').trim()[0] || '?').toUpperCase()}</span>`}</div>`;
const courseTxt = c => c === 'neet' ? 'NEET' : c === 'jee' ? 'JEE' : 'NEET + JEE';
const storeLink = () => h`<div class="card st-link"><div class="row wrap"><span class="st-li">${icon('store', 20)}</span><div class="grow"><b>Your store page</b><div class="xs mut mono ell">${S.storeUrl()}</div></div>
  <div class="row gap6">${UI.copyBtn(S.storeUrl(), 'Copy')}<a class="btn xs ghost" href="store.html" target="_blank" rel="noopener">${icon('external', 13)} Open</a></div></div></div>`;
function courseChips() {
  if (!v32() || !D().items.length) return '';
  const cnt = c => D().items.filter(x => !c || !x.course || x.course === c).length;
  return h`<div class="chips" role="tablist" aria-label="Show the series for">${join([['', 'All'], ['neet', 'NEET'], ['jee', 'JEE']], ([k, l]) => h`<button class="chip ${T.cf === k ? 'on' : ''}" data-act="cf" data-v="${k}">${l}<em>${cnt(k)}</em></button>`)}</div>`;
}

/* ---------- page ---------- */
AX.mod({
  id: 'store', title: 'Store', short: 'Store', icon: 'store', group: 'Commerce', order: 20, perm: 'store',
  sub: 'What students see on the store page: series, prices, photos, layout, payment details — and how it sells.',
  async render(ctx) {
    T.tab = TABS.some(t => t.id === ctx.parts[0]) ? ctx.parts[0] : 'overview';
    const tab = T.tab, m = can();
    ctx.head({ title: 'Store', sub: 'What students see on the store page — series, prices, photos, layout and payment details — and how it sells.', tabs: TABS, tab,
      actions: h`<a class="btn ghost" href="store.html" target="_blank" rel="noopener">${icon('external', 16)} Preview store</a>${m && tab === 'items' ? h`<button class="btn" data-act="pick">${icon('zap', 16)} Add from your series</button><button class="btn pri" data-act="add">${icon('plus', 16)} Add item</button>` : ''}` });
    const ph = document.getElementById('ax-ph');
    if (ph) AX.act(ph, { pick: () => pickSeries(), add: () => editItem(null) });
    const d = await loadAll(tab === 'overview');
    // money comes from the payments ledger (every approved order + payments added by hand), same numbers as Payments
    if (tab === 'overview' && AX.can('payments') && AX.money) { const P = await AX.data.payments(true); T.money = P && P.ok ? AX.money.build(P, []).rows() : null; } else if (tab === 'overview') T.money = null;
    if (!ctx.alive()) return;
    if (!d.ok) { AX.set(ctx.el, UI.errorBox(d, 'supabase_v13_store.sql')); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    T.view = { alive: ctx.alive, paint: () => paint(ctx) };
    AX.act(ctx.el, ACTS);
    AX.act(ctx.el, CHG, 'change');
    const off = AX.on('orders:changed', async x => { if (!ctx.alive()) return off(); if (!(x && x.soft)) await loadAll(false); if (ctx.alive()) paint(ctx); });
    paint(ctx);
  },
  search(q) {
    const r = S.cur; if (!r || !r.items) return [];
    return r.items.filter(x => String(x.title || '').toLowerCase().includes(q)).slice(0, 5).map(x => ({ g: 'Store', title: x.title, sub: fmt.inr(x.price) + (x.active === false ? ' · hidden' : ''), icon: 'store', run: () => { AX.go('store/items'); setTimeout(() => editItem(x), 350); }, go: '#/store/items' }));
  }
});
AX.creates.push({ label: 'Store item', icon: 'store', perm: ['store', 'manage'], async run() { AX.go('store/items'); await loadAll(false); setTimeout(() => editItem(null), 300); } });

function paint(ctx) {
  const f = { overview, items, layout, explore, soon, settings }[T.tab];
  f(ctx.el);
}

/* ---------- Overview ---------- */
function overview(el) {
  const d = D(), now = Date.now();
  const from = T.dp === 'all' ? 0 : new Date().setHours(0, 0, 0, 0) - (Number(T.dp) - 1) * DAY;
  const O = d.orders.filter(o => ms(o.created_at) >= from), done = O.filter(o => S.seg(o) === 'done'), paidStep = O.filter(o => S.seg(o) !== 'unpaid');
  // money by the day it was paid: payments ledger when allowed, else approved orders by payment date
  const money = T.money || d.orders.filter(o => S.seg(o) === 'done').map(o => ({ at: ms(o.paid_at || o.created_at), amount: Number(o.amount) || 0, k: 'store' }));
  const pick = T.day != null ? { t: T.day, e: T.day + DAY } : null;
  const inRange = x => pick ? x.at >= pick.t && x.at < pick.e : x.at >= from;
  const rev = money.filter(inRange).reduce((s, x) => s + (x.amount || 0), 0), revN = money.filter(x => inRange(x) && x.amount).length;
  const ver = d.orders.filter(o => S.seg(o) === 'verify').sort((a, b) => ms(b.paid_at || b.created_at) - ms(a.paid_at || a.created_at));
  const un = O.filter(o => S.seg(o) === 'unpaid').sort((a, b) => ms(b.created_at) - ms(a.created_at));
  const req = d.students ? S.requests(d).length : 0;
  const pct = (a, c) => c ? Math.round(a * 100 / c) : 0;
  // revenue per day (approved orders, by order date), last 14 days
  const days = []; for (let i = 13; i >= 0; i--) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - i); days.push({ t: t.getTime(), v: 0, n: 0 }); }
  money.forEach(o => { const t = o.at; const b = days.find((x, i) => t >= x.t && (i === 13 || t < days[i + 1].t)); if (b && o.amount) { b.v += o.amount; b.n++; } });
  const tot14 = days.reduce((s, x) => s + x.v, 0);
  const bySeries = Object.values(O.reduce((m, o) => { const k = o.item_title || '—'; const g = m[k] = m[k] || { t: k, n: 0, p: 0, v: 0 }; g.n++; if (S.seg(o) === 'done') { g.p++; g.v += Number(o.amount) || 0; } return m; }, {})).sort((a, b) => b.v - a.v || b.n - a.n);
  const DPL = { 1: 'Today', 7: '7 days', 30: '30 days', all: 'All time' };
  const funnel = [['Tapped Buy now', O.length, 'cart'], ['Paid + sent UTR', paidStep.length, 'wallet'], ['Approved & unlocked', done.length, 'checkCircle']];
  AX.set(el, h`${req ? h`<a class="card st-banner" href="#/orders/req"><span class="st-li gold">${icon('userPlus', 20)}</span><div class="grow"><b>${fmt.plural(req, 'new access request')}</b><div class="sm mut">Approve and give the access code</div></div>${icon('chevR', 18)}</a>` : ''}
    <div class="row wrap between" style="margin-bottom:14px"><div class="chips">${join(['1', '7', '30', 'all'], k => h`<button class="chip ${T.dp === k ? 'on' : ''}" data-act="dp" data-v="${k}">${DPL[k]}</button>`)}</div></div>
    <div class="kpis">
      ${UI.kpi({ label: 'Money received · ' + (pick ? new Date(pick.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : DPL[T.dp]), value: fmt.inr(rev), icon: 'rupee', hero: true, foot: fmt.plural(revN, 'payment') + ' · all time ' + fmt.inr(money.reduce((a, x) => a + (x.amount || 0), 0)) })}
      ${UI.kpi({ label: 'To verify', value: ver.length, icon: 'wallet', tone: ver.length ? 'gold' : '', go: '#/orders/verify', foot: ver.length ? 'Payment done · tap to check' : 'All checked' })}
      ${UI.kpi({ label: 'Not paid yet', value: un.length, icon: 'clock', tone: 'info', go: '#/orders/unpaid', foot: 'Follow up · counselling' })}
      ${UI.kpi({ label: 'Orders', value: d.orders.length >= 300 && T.dp === 'all' ? '300+' : O.length, icon: 'cart', tone: 'vio', foot: d.orders.length >= 300 ? 'latest 300 orders counted' : pct(done.length, O.length) + '% became paid' })}
    </div>
    <div class="grid st-2 mt16">
      <div class="card"><div class="card-h">${icon('filter')}<h3 class="grow">Where students stop</h3><span class="xs mut">${DPL[T.dp]}</span></div>
        <div class="col gap16">${join(funnel, ([l, n, ic], i) => h`<div><div class="row between sm"><span class="row gap6 tx2">${icon(ic, 15)}${l}</span><b class="num">${fmt.num(n)}${i ? h` <span class="xs mut">${pct(n, funnel[0][1])}%</span>` : ''}</b></div><div class="bar-meter mt8 ${i === 2 ? '' : 'gold'}"><i style="width:${O.length ? Math.max(n ? 3 : 0, pct(n, O.length)) : 0}%"></i></div></div>`)}</div></div>
      <div class="card"><div class="card-h">${icon('bars')}<h3 class="grow">Money per day · last 14 days</h3><b class="num">${fmt.inr(tot14)}</b></div>
        <div class="day-read">${pick ? h`<span class="mut sm">${new Date(pick.t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><b>${fmt.inr(rev)}</b><span class="mut sm">${fmt.plural(revN, 'payment')}</span><a href="#" class="sm" data-act="dayAll">Clear</a>` : h`<span class="mut sm">Tap a day to see its money</span>`}</div>
        ${UI.chart.bars(days.map((x, i) => ({ label: i === 13 ? 'Today' : String(new Date(x.t).getDate()), value: x.v, title: new Date(x.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ': ' + fmt.inr(x.v) + ' · ' + fmt.plural(x.n, 'payment') })), { money: true, height: 160, pick: true, sel: pick ? days.findIndex(x => x.t === pick.t) : -1, label: 'Money received per day for the last 14 days' })}</div>
    </div>
    <div class="grid st-2 mt16">
      <div class="card pad0"><div class="card-h st-ch">${icon('wallet')}<h3 class="grow">Payments to verify</h3><a class="btn xs ghost" href="#/orders/verify">See all ${icon('chevR', 13)}</a></div>
        <div class="list">${ver.length ? join(ver.slice(0, 4), o => h`<div class="li">${UI.avatar(o.name, o.mobile, 'sm')}<div class="grow"><a class="t ell" href="#" data-act="open" data-code="${o.code}" style="display:block;color:var(--tx)">${o.name}</a><div class="s ell">${o.item_title} · ${fmt.inr(o.amount)} · UTR ${o.utr || '—'}</div></div>${can() ? h`<button class="btn sm pri" data-act="approve" data-code="${o.code}" data-busy="…" ${S.canApprove() ? '' : raw('disabled')}>${icon('unlock', 14)} Approve</button>` : ''}</div>`) : UI.empty({ icon: 'checkCircle', title: 'Nothing to verify', text: 'Payments students send show up here.' })}</div></div>
      <div class="card pad0"><div class="card-h st-ch">${icon('phone')}<h3 class="grow">Follow up</h3><a class="btn xs ghost" href="#/orders/unpaid">See all ${icon('chevR', 13)}</a></div>
        <div class="list">${un.length ? join(un.slice(0, 4), o => h`<div class="li">${UI.avatar(o.name, o.mobile, 'sm')}<div class="grow"><a class="t ell" href="#" data-act="open" data-code="${o.code}" style="display:block;color:var(--tx)">${o.name}</a><div class="s ell">${o.item_title} · ${fmt.ago(o.created_at)}${o.contact_n ? ' · contacted ' + o.contact_n + '×' : ''}</div></div><a class="ibtn line ic-wa" href="${S.links(o.mobile, S.ordMsg(o)).wa}" target="_blank" rel="noopener" data-act="contact" data-code="${can() ? o.code : ''}" aria-label="WhatsApp ${o.name}">${icon('whatsapp', 18)}</a></div>`) : UI.empty({ icon: 'checkCircle', title: 'Everyone who ordered has paid' })}</div></div>
    </div>
    <div class="section-t">By test series · ${DPL[T.dp]}</div>
    <div class="card pad0 list">${bySeries.length ? join(bySeries, g => h`<div class="li"><div class="grow"><div class="t ell">${g.t}</div><div class="s">${fmt.plural(g.n, 'order')} · ${g.p} paid (${pct(g.p, g.n)}%)</div><div class="bar-meter mt8" style="max-width:320px"><i style="width:${pct(g.p, g.n)}%"></i></div></div><b class="num lg">${fmt.inr(g.v)}</b></div>`) : UI.empty({ icon: 'cart', title: 'No orders in this period' })}</div>
    <div class="mt16">${storeLink()}</div>`);
}

/* ---------- Items ---------- */
function itemCard(x) {
  const w = waiting(x).length, sc = T.sched && T.sched[x.id], ser = x.series_id && series(x.series_id), n = sold(x), m = can();
  const off = x.mrp && x.mrp > x.price ? Math.round((x.mrp - x.price) * 100 / x.mrp) : 0;
  return h`<article class="card pad0 st-card ${x.active === false ? 'off' : ''}">
    <div class="st-top">${cover(x)}<div class="st-tags">${x.active === false ? UI.pill('Hidden', '') : ''}${x.buy_on === false ? UI.pill('Coming soon', 'warn') : ''}${x.badge ? UI.pill(x.badge, 'gold') : ''}</div></div>
    <div class="st-b">
      <div><b class="st-tt">${x.title}</b>${x.subtitle ? h`<div class="xs mut st-sub">${x.subtitle}</div>` : ''}</div>
      <div class="row gap6 wrap"><span class="st-price">${fmt.inr(x.price)}</span>${x.mrp ? h`<s class="mut sm">${fmt.inr(x.mrp)}</s>` : ''}${off ? UI.pill(off + '% off', 'ok') : ''}</div>
      <div class="st-meta">${v32() ? h`<span>${icon('target', 13)} ${courseTxt(x.course)}</span>` : ''}${x.section ? h`<span>${icon(secIcon(x.section), 13)} ${x.section}</span>` : ''}<span>${icon('list', 13)} ${fmt.plural((x.features || []).length, 'feature')}</span>${sc ? h`<span>${icon('calendar', 13)} Schedule</span>` : ''}<span>${icon('checkCircle', 13)} ${n} sold</span>${w ? h`<span class="st-w">${icon('bell', 13)} ${w} waiting</span>` : ''}</div>
      <div class="xs ${ser ? 'mut' : ''}">${x.series_id ? h`${icon('unlock', 13)} Unlocks: <b class="tx2">${ser ? ser.title : 'series'}</b>` : h`<span style="color:var(--warn)">${icon('alert', 13)} Not linked to a series — Approve can’t unlock it</span>`}</div>
      <div class="row gap6 st-ft">${m ? h`<button class="btn sm grow" data-act="edit" data-id="${x.id}">${icon('edit', 14)} Edit</button>` : h`<a class="btn sm grow" href="store.html#p=${x.id}" target="_blank" rel="noopener">${icon('eye', 14)} View</a>`}<button class="ibtn sm line" data-act="imenu" data-id="${x.id}" aria-label="More for ${x.title}">${icon('moreV', 16)}</button></div>
    </div></article>`;
}
function items(el) {
  const d = D(), L = d.items.filter(visible), on = d.items.filter(x => x.active !== false).length, m = can();
  AX.set(el, h`<div class="row wrap between" style="margin-bottom:14px"><div><b>${fmt.plural(d.items.length, 'test series', 'test series')}</b> <span class="sm mut">· ${on} shown · ${d.items.length - on} hidden</span></div>
      <div class="row wrap gap6">${courseChips()}${m && d.items.some(x => x.series_id) ? h`<button class="btn sm" data-act="resync" data-busy="Updating…">${icon('refresh', 14)} Update all from series</button>` : ''}</div></div>
    ${!v32() ? h`<div class="callout warn sm" style="margin-bottom:14px">${icon('db', 16)}<div><b>One-time setup for NEET / JEE and sections.</b> Open Supabase → SQL Editor, paste <span class="mono">supabase_v32_store_layout.sql</span> and press Run. Then refresh.</div></div>` : ''}
    ${d.items.length && !('image' in d.items[0]) ? h`<div class="callout warn sm" style="margin-bottom:14px">${icon('image', 16)}<div><b>Photos are switched off in the database.</b> Run <span class="mono">supabase_v17_store_fix.sql</span> once in Supabase → SQL Editor, then save the photo again.</div></div>` : ''}
    ${L.length ? h`<div class="st-grid">${join(L, itemCard)}</div>` : h`<div class="card">${UI.empty({ icon: 'store', title: d.items.length ? 'No series for this course' : 'No test series on the store yet', text: 'Add your series with one tap: name, description, tests and cover photo are taken from Test studio.', action: m ? h`<div class="row wrap" style="justify-content:center"><button class="btn pri" data-act="pick">${icon('zap', 16)} Add from your series</button><button class="btn" data-act="add">${icon('plus', 16)} Add manually</button></div>` : '' })}</div>`}`);
}
function itemMenu(btn, x) {
  const m = can();
  UI.menu(btn, [
    m ? { label: 'Edit', icon: 'edit', fn: () => editItem(x) } : null,
    { label: 'Explore page', icon: 'compass', fn: () => editExplore(x) },
    { label: 'Waiting list' + (waiting(x).length ? ' · ' + waiting(x).length : ''), icon: 'bell', fn: () => waitList(x) },
    m ? { label: x.active === false ? 'Show on the store' : 'Hide from the store', icon: x.active === false ? 'eye' : 'eyeOff', fn: () => toggleActive(x) } : null,
    { label: 'View on the store', icon: 'external', href: 'store.html#p=' + x.id },
    { label: 'Copy link to this series', icon: 'link', fn: () => AX.u.copy(S.storeUrl() + '#x=' + x.id).then(() => UI.toast('Link copied')) },
    m ? { sep: true } : null,
    m ? { label: 'Delete from the store', icon: 'trash', tone: 'danger', fn: () => delItem(x) } : null
  ]);
}
async function toggleActive(x) {
  const r = await AX.api.call('cbt_admin_store', 'save_item', itemPayload(x, { active: x.active === false }));
  if (!r.ok) return UI.err(r);
  UI.toast(x.active === false ? x.title + ' is shown on the store' : x.title + ' is hidden'); refresh();
}
async function delItem(x, close) {
  if (!(await UI.confirm({ title: 'Delete “' + x.title + '” from the store?', text: 'The card, its schedule, demo tests and waiting list are removed. Old orders stay.', yes: 'Delete', tone: 'danger' }))) return;
  const r = await AX.api.call('cbt_admin_store', 'delete_item', { id: x.id });
  if (!r.ok) return UI.toast('Could not delete. ' + AX.errText(r), { tone: 'bad' });
  if (close) close();
  UI.toast('Deleted'); refresh();
}

/* ---------- add / edit an item ---------- */
function preview(x, img) {
  const f = (x.features || []).slice(0, 3);
  return h`<div class="st-prev">${cover(Object.assign({}, x, { image: img }), 'big')}${x.badge ? h`<span class="st-pb">${x.badge}</span>` : ''}
    <div class="st-pbody"><b class="st-tt">${x.title || 'Name of the series'}</b>${x.subtitle ? h`<div class="xs mut st-sub">${x.subtitle}</div>` : ''}
      ${f.length ? h`<ul class="st-pf">${join(f, l => h`<li>${icon('check', 13)}<span>${l}</span></li>`)}</ul>` : ''}
      <div class="row gap6 mt8"><span class="st-price">${x.price ? fmt.inr(x.price) : '₹ —'}</span>${x.mrp ? h`<s class="mut sm">${fmt.inr(x.mrp)}</s>` : ''}</div>
      <div class="st-pbtn" style="--cc:${hex(x.color)}">${x.buy_on === false ? 'Coming soon · Notify me' : 'Buy now'}</div></div></div>`;
}
function placeFields(course, section, pre) {
  const S2 = sectionNames();
  return h`<div class="fld"><label>Show for</label>${AX.f.seg({ name: 'course', value: course || '', options: [{ value: '', label: 'NEET + JEE' }, { value: 'neet', label: 'NEET only' }, { value: 'jee', label: 'JEE only' }] })}</div>
    <div class="fld"><label for="${pre}-sec">Section — one row on the store</label><input class="inp" id="${pre}-sec" name="section" maxlength="40" list="${pre}-secl" autocomplete="off" value="${section || ''}" placeholder="e.g. Full syllabus"><datalist id="${pre}-secl">${join(S2, t => h`<option value="${t}">`)}</datalist>
      <div class="chips mt8">${join(S2.slice(0, 10), t => h`<button type="button" class="chip st-sp" data-sec="${t}">${t}</button>`)}</div></div>`;
}
function wirePlace(el) {
  AX.f.wireSeg(el);
  el.addEventListener('click', e => { const b = e.target.closest('[data-sec]'); if (!b) return; const i = el.querySelector('[name=section]'); i.value = b.dataset.sec; i.dispatchEvent(new Event('input', { bubbles: true })); });
}
function editItem(x0) {
  if (!can()) return UI.toast('You can view the store but not change it.', { tone: 'warn' });
  const isNew = !x0;
  const x = Object.assign({ title: '', subtitle: '', price: '', mrp: '', badge: '', features: [], color: 'blue', series_id: '', active: true, sort_order: nextOrd(), course: '', section: '', buy_on: true }, x0 ? JSON.parse(JSON.stringify(x0)) : {});
  let img = x.image || '', pendSched = null, fillDesc = '';
  const sch = () => { const s = !isNew && T.sched && T.sched[x.id]; return pendSched ? h`${icon('fileText', 15)} <b>${pendSched.name}</b> · ${kb(pendSched.size)} <span class="mut">(saved when you press Save)</span>` : s ? h`${icon('fileText', 15)} <b>${s.name || 'Schedule'}</b> · ${kb(s.size || 0)}` : T.sched === null ? h`<span class="mut">Schedules list is not available (supabase_v18_store_schedule.sql).</span>` : h`<span class="mut">No schedule yet</span>`; };
  const photo = () => h`${img ? h`<img class="st-thumb" src="${img}" alt="">` : h`<span class="st-thumb ph">${icon('image', 20)}</span>`}<div class="grow xs mut">${img ? 'Photo on the card · ' + kb(img.length * 3 / 4) : 'No photo — a coloured card with the first letter is shown'}</div>`;
  UI.drawer({ title: isNew ? 'Add test series' : 'Edit test series', sub: isNew ? 'It appears on the store page as a card.' : x.title, size: 'wide',
    body: h`<div class="st-ed"><div class="st-edp"><div class="lbl" style="margin-bottom:8px">Preview — how students see it</div><div id="st-pv">${preview(x, img)}</div></div>
      <form class="col gap20 st-edf" id="st-f" autocomplete="off">
        <section class="col gap16"><div class="st-sh">${icon('tag', 16)} Card</div>
          <div class="form-grid">
            ${AX.f.input({ name: 'title', label: 'Name', value: x.title, max: 80, placeholder: 'e.g. NEET 2027 All India Test Series', full: true })}
            ${AX.f.input({ name: 'subtitle', label: 'Short description on the card (optional)', value: x.subtitle, max: 200, placeholder: 'e.g. NEET 2026 · 20 chapter tests + 5 full tests', full: true })}
            ${AX.f.input({ name: 'price', label: 'Price ₹', type: 'number', value: x.price, min: 1, inputmode: 'numeric' })}
            ${AX.f.input({ name: 'mrp', label: 'MRP ₹ (optional, shown struck)', type: 'number', value: x.mrp == null ? '' : x.mrp, min: 0, inputmode: 'numeric' })}
            ${AX.f.input({ name: 'badge', label: 'Badge (optional)', value: x.badge, max: 24, placeholder: 'e.g. Bestseller' })}
            <div class="fld"><label>Card colour</label><div class="st-sw" role="radiogroup">${join(COLORS, ([k, l, c]) => h`<button type="button" class="${x.color === k ? 'on' : ''}" data-col="${k}" style="--cc:${c}" title="${l}" aria-label="${l}"></button>`)}</div><input type="hidden" name="color" value="${x.color}"></div>
          </div>
          <div class="fld"><label>Photo on the store card</label><div class="row st-photo" id="st-ph">${photo()}</div>
            <div class="row wrap gap6"><button type="button" class="btn sm" data-act="img">${icon('upload', 14)} Upload</button><button type="button" class="btn sm" data-act="imgser">${icon('image', 14)} Use series cover</button><button type="button" class="btn sm ghost" data-act="imgrm">${icon('trash', 14)} Remove</button></div></div>
        </section>
        <section class="col gap16"><div class="st-sh">${icon('unlock', 16)} Unlocks</div>
          <div class="fld"><label for="f-series_id">Which series does a paid order unlock?</label><div class="row"><select class="inp grow" id="f-series_id" name="series_id"><option value="">— Not linked —</option>${join(T.cat.series || [], s => h`<option value="${s.id}" ${s.id === x.series_id ? raw('selected') : ''}>${s.title}</option>`)}</select><button type="button" class="btn" data-act="fill" data-busy="Filling…">${icon('wand', 15)} Fill from series</button></div>
            <div class="hint">Fill from series copies the name, description, price, features and cover photo.</div></div>
        </section>
        ${v32() ? h`<section class="col gap16"><div class="st-sh">${icon('grid', 16)} Where it shows</div>${placeFields(x.course, x.section, 'st')}</section>` : ''}
        <section class="col gap16"><div class="st-sh">${icon('list', 16)} What you get</div>
          ${AX.f.textarea({ name: 'features', label: 'Points on the card and the Explore page — one per line', value: (x.features || []).join('\n'), rows: 5, placeholder: '20 full-length tests\nAll-India rank after every test' })}</section>
        <section class="col gap16"><div class="st-sh">${icon('calendar', 16)} Schedule for students</div>
          <div class="well sm row" id="st-sch">${sch()}</div>
          <div class="row wrap gap6"><button type="button" class="btn sm" data-act="sch">${icon('upload', 14)} Upload PDF or photo</button>${!isNew && T.sched && T.sched[x.id] ? h`<button type="button" class="btn sm ghost" data-act="schrm">${icon('trash', 14)} Remove</button>` : ''}<span class="xs mut">Up to 5 MB.${isNew ? '' : ' Uploads right away.'}</span></div></section>
        <section class="col gap16"><div class="st-sh">${icon('eye', 16)} Visibility</div>
          ${AX.f.switch({ name: 'active', value: x.active !== false, label: 'Show on the store page' })}
          ${AX.f.switch({ name: 'buy_on', value: x.buy_on !== false, label: 'Buy now is on', hint: 'Turn off for a series that is not launched yet: students see “Coming soon · Notify me”.' })}</section>
      </form></div>`,
    foot: h`${!isNew ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)} Delete</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save" data-busy="Saving…">${icon('check', 16)} ${isNew ? 'Add to store' : 'Save'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#st-f'); UI.wire(f); if (v32()) wirePlace(f);
      const read = () => { const v = AX.f.read(f); return Object.assign({}, x, { title: v.title.trim(), subtitle: v.subtitle.trim(), price: parseInt(v.price, 10) || '', mrp: v.mrp === '' ? '' : parseInt(v.mrp, 10) || 0, badge: v.badge.trim(), color: v.color, series_id: v.series_id, features: String(v.features || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20), active: v.active, buy_on: v.buy_on, course: v.course != null ? v.course : x.course, section: v.section != null ? clean40(v.section) : x.section }); };
      const pv = () => AX.set(el.querySelector('#st-pv'), preview(read(), img));
      const ph = () => { AX.set(el.querySelector('#st-ph'), photo()); pv(); };
      f.addEventListener('input', pv); f.addEventListener('change', pv);
      f.addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (!b) return; f.querySelector('[name=color]').value = b.dataset.col; f.querySelectorAll('[data-col]').forEach(z => z.classList.toggle('on', z === b)); pv(); });
      AX.act(el, {
        async img() { const fl = await AX.u.pickFile('image/*'); if (!fl) return; const d = await compress(await AX.u.fileToDataURL(fl), 900, .78); if (!d) return UI.toast('Could not read the photo', { tone: 'bad' }); img = d; ph(); },
        async imgser(b) { const sid = f.querySelector('[name=series_id]').value; if (!sid) return UI.toast('Choose the series first (Unlocks)', { tone: 'warn' }); await UI.busy(b, async () => { const c = await seriesCover(sid); if (c) { img = c; ph(); UI.toast('Cover photo taken from the series'); } else UI.toast('This series has no cover photo', { tone: 'warn' }); }); },
        imgrm() { img = ''; ph(); },
        async fill(b) {
          const sid = f.querySelector('[name=series_id]').value, s = series(sid); if (!s) return UI.toast('Choose the series first', { tone: 'warn' });
          await UI.busy(b, async () => {
            const a = auto(s); f.querySelector('[name=title]').value = a.title; f.querySelector('[name=subtitle]').value = a.subtitle; if (a.price) f.querySelector('[name=price]').value = a.price; f.querySelector('[name=features]').value = a.features.join('\n');
            fillDesc = a.description;
            const c = await seriesCover(sid); if (c) img = c; ph();
            UI.toast(c ? 'Filled from the series' : 'Filled (no cover photo on this series)');
          });
        },
        async sch(b) {
          const fl = await AX.u.pickFile('application/pdf,image/*'); const d = await readDoc(fl, 'Schedule'); if (!d) return;
          if (isNew) { pendSched = d; AX.set(el.querySelector('#st-sch'), sch()); return; }
          await UI.busy(b, async () => { const r = await AX.api.rpc('cbt_admin_store_schedule', { p_item: x.id, p_data: d.data, p_name: d.name }); if (!r.ok) return UI.toast(r.error === 'size' ? 'File is too big (max 5 MB)' : r.error === 'type' ? 'Use a PDF or a photo' : AX.errText(r, 'supabase_v18_store_schedule.sql'), { tone: 'bad' }); if (T.sched) T.sched[x.id] = { id: x.id, name: d.name, size: d.size }; AX.cache.drop('store:sched'); AX.set(el.querySelector('#st-sch'), sch()); UI.toast('Schedule uploaded'); });
        },
        async schrm() { if (!(await UI.confirm({ title: 'Remove the schedule?', text: 'Students will no longer see the schedule of this series.', yes: 'Remove', tone: 'danger' }))) return; const r = await AX.api.rpc('cbt_admin_store_schedule', { p_item: x.id, p_data: '', p_name: '' }); if (!r.ok) return UI.err(r); if (T.sched) delete T.sched[x.id]; AX.cache.drop('store:sched'); AX.set(el.querySelector('#st-sch'), sch()); UI.toast('Schedule removed'); },
        del() { delItem(x, close); },
        async save(btn) {
          AX.f.clearErrors(f); const v = read();
          if (!v.title) return AX.f.error(f, 'title', 'Enter the name');
          if (!(v.price > 0)) return AX.f.error(f, 'price', 'Enter the price');
          if (v.price > 200000) return AX.f.error(f, 'price', 'Price can be at most ₹2,00,000');
          if (v.mrp !== '' && (v.mrp < 0 || v.mrp > 1000000)) return AX.f.error(f, 'mrp', 'Check the MRP');
          await UI.busy(btn, async () => {
            let image = img; if (image && image.length > 700000) image = (await compress(image, 800, .7)) || image;
            const r = await AX.api.call('cbt_admin_store', 'save_item', itemPayload(v, { id: isNew ? '' : x.id, image, sort_order: x.sort_order || nextOrd() }));
            if (!r.ok) return UI.toast(r.error === 'fields' ? 'Enter the name and a price above 0' : 'Could not save. ' + AX.errText(r), { tone: 'bad' });
            btn.dataset.saved = '1';
            const id = r.id || x.id; let warn = '';
            if (isNew && pendSched) { const s = await AX.api.rpc('cbt_admin_store_schedule', { p_item: id, p_data: pendSched.data, p_name: pendSched.name }); if (!s.ok) warn = 'Saved — but the schedule could not be uploaded. Open Edit and try again.'; }
            if (fillDesc && T.demos !== null) { const s = await AX.api.call('cbt_admin_store_explore', 'desc', { item: id, description: fillDesc }); if (!s.ok) warn = 'Saved — but the Explore page description could not be saved.'; }
            if (v32() && (v.course !== (x0 ? x0.course || '' : '') || v.section !== (x0 ? x0.section || '' : ''))) { const s = await lay('place', { item: id, course: v.course || '', section: v.section || '' }); if (!s.ok) warn = s.error === 'missing' ? 'Saved — but run supabase_v32_store_layout.sql once in Supabase to set NEET / JEE and the section' : 'Saved — but NEET / JEE and the section could not be saved. Try again.'; }
            if (v.buy_on !== (x0 ? x0.buy_on !== false : true)) { const s = await AX.api.call('cbt_admin_store_launch', 'buy', { item: id, on: v.buy_on }); if (!s.ok) warn = s.error === 'missing' ? 'Saved — but run supabase_v31_store_soon.sql once in Supabase to turn Buy now off' : 'Saved — but Buy now could not be changed. Try again.'; }
            close();
            await refresh();
            const it = D().items.find(z => z.id === id);
            if (image && it && 'image' in it && !it.image) UI.toast('The photo was not saved. Run supabase_v17_store_fix.sql once in Supabase, then save the photo again.', { tone: 'warn', ms: 7000 });
            else UI.toast(warn || (isNew ? 'Added to the store' : 'Saved'), warn ? { tone: 'warn', ms: 6000 } : {});
          });
        }
      });
    } });
}
// several series at once, with one price each
function pickSeries() {
  if (!can()) return;
  if (!(T.cat.series || []).length) return UI.toast('No series yet. Create one in Test studio first.', { tone: 'warn' });
  const used = new Set(D().items.map(x => x.series_id).filter(Boolean)), L = T.cat.series.filter(s => !used.has(s.id));
  if (!L.length) return UI.toast('All your series are already on the store');
  UI.modal({ title: 'Add from your series', sub: 'Name, description, number of tests and cover photo are taken from the series. Check the price, then add.', size: 'wide',
    body: h`<form id="pk" class="col gap16"><div class="card flat pad0 list">${join(L, s => { const a = auto(s), n = (T.cat.tests || []).filter(t => t.series_id === s.id).length; return h`<div class="li st-pk"><label class="check grow"><input type="checkbox" name="pk_${s.id}" ${s.is_free ? '' : raw('checked')}><span><b>${s.title}</b><span class="xs mut" style="display:block">${fmt.plural(n, 'test')}${s.is_free ? ' · free series' : ''}${s.has_cover ? ' · has photo' : ''}</span>${a.subtitle ? h`<span class="xs tx2" style="display:block">“${a.subtitle}”</span>` : ''}<span class="xs faint" style="display:block">${a.features.slice(0, 3).join(' · ')}</span></span></label><div class="st-pp"><input class="inp sm" type="number" min="1" inputmode="numeric" name="pp_${s.id}" value="${a.price}" placeholder="₹ price" aria-label="Price for ${s.title}"></div></div>`; })}</div>
      ${v32() ? h`<div class="form-grid">${placeFields('', '', 'pk')}</div>` : ''}<div class="err sm" id="pk-e" style="color:var(--bad);font-weight:650"></div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go" data-busy="Adding…">${icon('plus', 16)} Add selected</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#pk'); if (v32()) wirePlace(f);
      AX.act(el, { async go(btn) {
        const v = AX.f.read(f), sel = L.filter(s => v['pk_' + s.id]), e = el.querySelector('#pk-e');
        if (!sel.length) return (e.textContent = 'Select at least one series');
        if (sel.some(s => !(parseInt(v['pp_' + s.id], 10) > 0))) return (e.textContent = 'Enter the price for every selected series');
        e.textContent = '';
        const course = v.course || '', section = clean40(v.section || '');
        let ord = nextOrd(), n = 0, warn = '';
        await UI.busy(btn, async () => {
          for (const s of sel) {
            n++; btn.querySelector('span') && (btn.querySelector('span').textContent = 'Adding ' + n + '/' + sel.length + '…');
            const a = auto(s), c = await seriesCover(s.id);
            const r = await AX.api.call('cbt_admin_store', 'save_item', { id: '', title: a.title, subtitle: a.subtitle, price: parseInt(v['pp_' + s.id], 10), mrp: '', badge: '', color: COLORS[(D().items.length + n - 1) % 6][0], series_id: s.id, sort_order: ord, active: true, features: a.features, image: c || '' });
            if (!r.ok) { UI.toast('Could not add ' + s.title + '. ' + AX.errText(r), { tone: 'bad' }); await refresh(); return; }
            ord += 10;
            if (a.description) await AX.api.call('cbt_admin_store_explore', 'desc', { item: r.id, description: a.description });
            if ((course || section) && !warn) { const p = await lay('place', { item: r.id, course, section }); if (!p.ok) warn = p.error === 'missing' ? ' — run supabase_v32_store_layout.sql once in Supabase, then set NEET / JEE and the section in Edit' : ' — NEET / JEE and the section could not be set, set them in Edit'; }
          }
          close(); UI.toast(fmt.plural(sel.length, 'series', 'series') + ' added to the store' + warn, warn ? { tone: 'warn', ms: 6000 } : {}); refresh();
        });
      } });
    } });
}
async function resync(btn) {
  const L = D().items.filter(x => x.series_id && series(x.series_id));
  if (!L.length) return UI.toast('No store item is linked to a series', { tone: 'warn' });
  if (!(await UI.confirm({ title: 'Update ' + fmt.plural(L.length, 'item') + ' from their series?', yes: 'Update all',
    text: 'Name, short description, features, photo and Explore description are copied again from Test studio. Price, MRP, badge, colour, visibility and order stay as they are. Changes you typed by hand in those fields are replaced.' }))) return;
  await UI.busy(btn, async () => {
    let n = 0, im = 0;
    for (const x of L) {
      const s = series(x.series_id), a = auto(s), c = await seriesCover(s.id); if (c) im++;
      const r = await AX.api.call('cbt_admin_store', 'save_item', itemPayload(x, { title: a.title, subtitle: a.subtitle, features: a.features, image: c || x.image || '' }));
      if (!r.ok) { UI.toast('Could not update ' + x.title + '. ' + AX.errText(r), { tone: 'bad' }); break; }
      if (a.description && T.demos !== null) await AX.api.call('cbt_admin_store_explore', 'desc', { item: x.id, description: a.description });
      n++;
    }
    UI.toast(n + ' updated · photos found for ' + im + (im < n ? ' — upload the rest in Edit' : ''));
    await refresh();
  });
}

/* ---------- Layout ---------- */
function layout(el) {
  const m = can();
  if (!v32()) return AX.set(el, h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup for sections and NEET / JEE', text: 'Open Supabase → SQL Editor → New query, paste supabase_v32_store_layout.sql and press Run. Then refresh this page.' })}</div>`);
  const G = groups().filter(g => g.items.some(visible)), named = groups().filter(g => g.k);
  AX.set(el, h`<div class="row wrap between" style="margin-bottom:14px">${courseChips()}<span class="xs mut">${T.cf ? 'Showing what ' + T.cf.toUpperCase() + ' students see.' : 'Showing every series.'}</span></div>
    <div class="callout info sm" style="margin-bottom:16px">${icon('info', 16)}<div>Each <b>section</b> is one row on the store, top to bottom. Inside a row, series show <b>left → right</b> in the order below. Use the arrows to rearrange — changes save at once.</div></div>
    ${G.length ? h`<div class="col gap16">${join(G, g => { const vis = g.items.filter(visible), ni = named.indexOf(g);
      return h`<section class="card pad0 st-row"><header class="st-rh"><span class="st-li">${icon(g.k ? secIcon(g.name) : 'sparkle', 18)}</span><div class="grow"><b>${g.k ? g.name : 'No section'}</b><div class="xs mut">${g.k ? fmt.plural(vis.length, 'series', 'series') + ' · one row on the store' : 'Shown last as “More test series” — choose a section for these'}</div></div>
        ${m && g.k ? h`<div class="row gap4"><button class="ibtn sm line" data-act="secren" data-k="${g.k}" aria-label="Rename section" title="Rename">${icon('edit', 15)}</button><button class="ibtn sm line" data-act="secmv" data-k="${g.k}" data-d="-1" aria-label="Move row up" title="Move row up" ${ni <= 0 ? raw('disabled') : ''}>${icon('chevU', 16)}</button><button class="ibtn sm line" data-act="secmv" data-k="${g.k}" data-d="1" aria-label="Move row down" title="Move row down" ${ni < 0 || ni >= named.length - 1 ? raw('disabled') : ''}>${icon('chevD', 16)}</button></div>` : ''}</header>
        <ol class="st-ol">${join(vis, (x, i) => h`<li class="${x.active === false ? 'off' : ''}"><span class="st-n">${i + 1}</span>${cover(x, 'sm')}<div class="grow"><div class="b ell sm">${x.title}</div><div class="xs mut">${fmt.inr(x.price)} · ${courseTxt(x.course)}${x.active === false ? ' · hidden' : ''}</div></div>
          ${m ? h`<div class="row gap4"><button class="ibtn sm line" data-act="mv" data-id="${x.id}" data-d="-1" aria-label="Move left" title="Move left (earlier)" ${i === 0 ? raw('disabled') : ''}>${icon('chevU', 16)}</button><button class="ibtn sm line" data-act="mv" data-id="${x.id}" data-d="1" aria-label="Move right" title="Move right (later)" ${i === vis.length - 1 ? raw('disabled') : ''}>${icon('chevD', 16)}</button><button class="ibtn sm line" data-act="mvto" data-id="${x.id}" aria-label="Move to another section" title="Move to another section">${icon('arrowR', 16)}</button></div>` : ''}</li>`)}</ol></section>`; })}</div>`
      : h`<div class="card">${UI.empty({ icon: 'grid', title: 'Nothing to arrange yet', text: 'Add series in Items first.' })}</div>`}`);
}
async function secFix(G) {
  const list = G.filter(g => g.k).map(g => g.name), cur = (D().settings.sections || []).map(x => String(x).trim()).filter(Boolean);
  if (JSON.stringify(list) === JSON.stringify(cur)) return;
  D().settings.sections = list;
  const r = await lay('sections', { list }); if (!r.ok) layErr(r);
}
async function move(id, dir) {
  const G = groups(), g = G.find(z => z.items.some(x => x.id === id)); if (!g) return;
  const vis = g.items.filter(visible), i = vis.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= vis.length) return;
  const a = g.items.indexOf(vis[i]), b = g.items.indexOf(vis[j]); [g.items[a], g.items[b]] = [g.items[b], g.items[a]];
  g.items.forEach((x, n) => { x.sort_order = (n + 1) * 10; });
  T.view.paint();
  await secFix(G);
  const r = await lay('order', { ids: g.items.map(x => x.id) }); if (!r.ok) layErr(r);
}
async function secMove(k, dir) {
  const list = groups().filter(g => g.k).map(g => g.name), i = list.findIndex(n => n.toLowerCase() === k), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; D().settings.sections = list; T.view.paint();
  const r = await lay('sections', { list }); if (!r.ok) layErr(r);
}
async function secRename(k) {
  const g = groups().find(z => z.k === k); if (!g) return;
  const v = await UI.prompt({ title: 'Rename section', label: 'New name of this row on the store', value: g.name, max: 40, hint: 'Using the name of another section joins the two rows.' });
  if (v == null) return; const n = clean40(v); if (!n || n === g.name) return;
  for (const x of g.items) { const r = await lay('place', { item: x.id, course: x.course || '', section: n }); if (!r.ok) return layErr(r); x.section = n; }
  const seen = new Set(), list = groups().filter(z => z.k).map(z => z.k === n.toLowerCase() ? n : z.name).filter(z => !seen.has(z.toLowerCase()) && seen.add(z.toLowerCase()));
  D().settings.sections = list; const r = await lay('sections', { list }); if (!r.ok) return layErr(r);
  UI.toast('Renamed'); T.view.paint();
}
function moveTo(btn, x) {
  const names = groups().filter(g => g.k).map(g => g.name);
  const go = async (sec) => {
    const r = await lay('place', { item: x.id, course: x.course || '', section: sec }); if (!r.ok) return layErr(r);
    x.section = sec; x.sort_order = nextOrd();
    const list = groups().filter(g => g.k).map(g => g.name); D().settings.sections = list;
    const s = await lay('sections', { list }); if (!s.ok) return layErr(s);
    UI.toast(sec ? 'Moved to ' + sec : 'Section removed'); T.view.paint();
    lay('order', { ids: groups().find(g => g.k === sec.toLowerCase()).items.map(z => z.id) });
  };
  UI.menu(btn, [{ head: 'Move to section' }, ...names.filter(n => n.toLowerCase() !== String(x.section || '').trim().toLowerCase()).map(n => ({ label: n, icon: secIcon(n), fn: () => go(n) })),
    { label: 'New section…', icon: 'plus', fn: async () => { const v = await UI.prompt({ title: 'New section', label: 'Name of the new row', max: 40, placeholder: 'e.g. Crash courses' }); const n = clean40(v); if (n) go(n); } },
    x.section ? { sep: true } : null, x.section ? { label: 'No section', icon: 'x', fn: () => go('') } : null]);
}

/* ---------- Explore pages ---------- */
function explore(el) {
  const d = D();
  if (T.demos === null) return AX.set(el, h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'Explore pages are not set up yet', text: 'Run supabase_v30_store_explore.sql once in Supabase → SQL Editor to add a full description and demo tests for each series.' })}</div>`);
  AX.set(el, h`<div class="callout info sm" style="margin-bottom:16px">${icon('compass', 16)}<div>Every series has an <b>Explore page</b> on the store: a full description, “What you get” and up to two demo tests (PDF or photo) students can open before buying.</div></div>
    ${T.demos === 'err' ? h`<div class="callout bad sm" style="margin-bottom:16px">${icon('alert', 16)}<div>Could not load the demo tests. <a href="#" data-act="xreload">Try again</a></div></div>` : ''}
    ${d.items.length ? h`<div class="card pad0 list">${join(d.items, x => { const dm = (T.demos || {})[x.id] || {}; const has = !!String(x.description || '').trim();
      return h`<div class="li st-xr">${cover(x, 'sm')}<div class="grow"><div class="t ell">${x.title}</div><div class="row wrap gap6 mt4">${UI.pill(has ? 'Description' : 'No description', has ? 'ok' : 'warn', true)}${join([1, 2], n => dm[n] ? UI.pill('Demo ' + n + (dm[n].name ? '' : ' · title only'), dm[n].name ? 'ok' : '', true) : UI.pill('Demo ' + n + ' · coming soon', '', false))}${UI.pill(fmt.plural((x.features || []).length, 'point'), '')}</div></div>
        <div class="row gap6"><a class="ibtn sm line" href="store.html#x=${x.id}" target="_blank" rel="noopener" aria-label="Preview Explore page" title="Preview">${icon('external', 15)}</a><button class="btn sm" data-act="xedit" data-id="${x.id}">${icon('edit', 14)} ${can() ? 'Edit page' : 'View'}</button></div></div>`; })}</div>`
      : h`<div class="card">${UI.empty({ icon: 'compass', title: 'No series on the store yet', text: 'Add a series in Items first.' })}</div>`}`);
}
function editExplore(x) {
  if (T.demos === null) return UI.toast('Run supabase_v30_store_explore.sql once in Supabase first', { tone: 'warn' });
  const m = can();
  const slot = n => { const dm = ((T.demos || {})[x.id] || {})[n];
    return h`<div class="card flat st-demo" data-slot="${n}"><div class="row"><span class="st-li">${icon('fileText', 18)}</span><div class="grow"><b>Demo test ${n}</b><div class="xs mut">${dm && dm.name ? h`${dm.name} · ${kb(dm.size || 0)}` : 'No file — students see “Coming soon”'}</div></div>${dm ? UI.pill('Saved', 'ok') : ''}</div>
      <div class="fld mt12"><label for="dm-t${n}">Title shown to students</label><input class="inp" id="dm-t${n}" maxlength="120" value="${dm ? dm.title || '' : ''}" placeholder="${n === 1 ? 'e.g. Breathing and Exchange of Gases' : 'Name (optional)'}" ${m ? '' : raw('disabled')}></div>
      ${m ? h`<div class="row wrap gap6 mt12"><button class="btn sm" data-act="dup" data-n="${n}" data-busy="Uploading…">${icon('upload', 14)} ${dm && dm.name ? 'Replace file' : 'Upload PDF or photo'}</button><button class="btn sm ghost" data-act="dtitle" data-n="${n}" data-busy="Saving…">${icon('check', 14)} Save title</button>${dm ? h`<button class="btn sm ghost danger" data-act="ddel" data-n="${n}">${icon('trash', 14)} Remove</button>` : ''}<span class="xs mut">Up to 5 MB · saves at once</span></div>` : ''}</div>`; };
  UI.drawer({ title: 'Explore page', sub: x.title, size: 'wide',
    body: h`<div class="col gap20"><div class="fld"><div class="row between"><label for="xp-d">Full description</label>${m && x.series_id ? h`<button class="btn xs ghost" data-act="dfill">${icon('wand', 13)} Fill from series</button>` : ''}</div>
        <textarea class="inp" id="xp-d" rows="10" maxlength="6000" ${m ? '' : raw('disabled')} placeholder="What the series covers, how tests are scheduled, who it is for…">${x.description || ''}</textarea>
        <div class="row between"><span class="xs mut" id="xp-n">${String(x.description || '').length} / 6000</span>${m ? h`<button class="btn sm pri" data-act="dsave" data-busy="Saving…">${icon('check', 14)} Save description</button>` : ''}</div></div>
      <div><div class="lbl" style="margin-bottom:8px">What you get</div>${(x.features || []).length ? h`<ul class="st-pf">${join(x.features, l => h`<li>${icon('check', 13)}<span>${l}</span></li>`)}</ul>` : h`<p class="sm mut">No points yet.</p>`}${m ? h`<button class="btn xs ghost mt8" data-act="feat">${icon('edit', 13)} Edit points in the item</button>` : ''}</div>
      <div class="grid g2" id="xp-s">${slot(1)}${slot(2)}</div></div>`,
    foot: h`<a class="btn ghost" href="store.html#x=${x.id}" target="_blank" rel="noopener">${icon('external', 15)} Preview</a><span class="sp"></span><button class="btn" data-close>Close</button>`,
    onOpen(el, close) {
      const ta = el.querySelector('#xp-d');
      ta.addEventListener('input', () => { el.querySelector('#xp-n').textContent = ta.value.length + ' / 6000'; });
      const redraw = () => AX.set(el.querySelector('#xp-s'), h`${slot(1)}${slot(2)}`);
      const save = async (n, data, name) => {
        const dm = ((T.demos || {})[x.id] || {})[n], ti = el.querySelector('#dm-t' + n).value.trim().slice(0, 120) || name || (dm && dm.title) || 'Demo test ' + n;
        const r = await AX.api.call('cbt_admin_store_explore', 'demo_save', { item: x.id, slot: n, title: ti, name: name || '', data: data || '' });
        if (!r.ok) return UI.toast(r.error === 'size' ? 'File is too big (max 5 MB)' : r.error === 'type' ? 'Use a PDF or a photo' : 'Could not save demo test ' + n + '. ' + AX.errText(r), { tone: 'bad' });
        AX.cache.drop('store:demos'); await extras(false); redraw(); UI.toast(data ? 'Demo test ' + n + ' uploaded' : 'Title saved'); if (T.view && T.view.alive()) T.view.paint();
      };
      AX.act(el, {
        async dsave(b) { await UI.busy(b, async () => { const r = await AX.api.call('cbt_admin_store_explore', 'desc', { item: x.id, description: ta.value.slice(0, 6000) }); if (!r.ok) return UI.err(r, 'supabase_v30_store_explore.sql'); x.description = ta.value; UI.toast('Description saved'); refresh(); }); },
        dfill() { const s = series(x.series_id); if (!s) return UI.toast('Link the item to a series first', { tone: 'warn' }); const a = auto(s); if (!a.description) return UI.toast('This series has no description', { tone: 'warn' }); ta.value = a.description; ta.dispatchEvent(new Event('input')); UI.toast('Filled — press Save description'); },
        feat() { close(); editItem(x); },
        async dup(b) { const fl = await AX.u.pickFile('application/pdf,image/*'); const d = await readDoc(fl, 'Demo test ' + b.dataset.n); if (!d) return; await UI.busy(b, () => save(+b.dataset.n, d.data, d.name)); },
        dtitle: b => UI.busy(b, () => save(+b.dataset.n, '', '')),
        async ddel(b) { const n = +b.dataset.n; if (!(await UI.confirm({ title: 'Remove demo test ' + n + '?', text: 'Students will see “Coming soon” in its place.', yes: 'Remove', tone: 'danger' }))) return; const r = await AX.api.call('cbt_admin_store_explore', 'demo_delete', { item: x.id, slot: n }); if (!r.ok) return UI.err(r); AX.cache.drop('store:demos'); await extras(false); redraw(); UI.toast('Demo test removed'); if (T.view && T.view.alive()) T.view.paint(); }
      });
    } });
}

/* ---------- Coming soon ---------- */
const launchMsg = (x, r) => `Hi ${String(r.name || '').split(' ')[0] || 'there'}! 🎉 ${x.title} is now live on ${CFG.SITE_NAME || 'our store'}. See it and buy here: ${S.storeUrl()}#x=${x.id}`;
function soon(el) {
  const d = D(), m = can();
  if (T.notify === null) return AX.set(el, h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'Coming soon is not set up yet', text: 'Run supabase_v31_store_soon.sql once in Supabase → SQL Editor. Then you can turn Buy now off for a series that is not launched and collect a waiting list.' })}</div>`);
  const tot = d.items.reduce((s, x) => s + waiting(x).filter(r => !r.notified_at).length, 0);
  AX.set(el, h`<div class="kpis" style="margin-bottom:16px">${UI.kpi({ label: 'Coming soon', value: d.items.filter(x => x.buy_on === false).length, icon: 'bell', tone: 'gold', foot: 'series with Buy now off' })}${UI.kpi({ label: 'Waiting to hear', value: tot, icon: 'users', tone: 'info', foot: 'not notified yet' })}</div>
    <div class="callout info sm" style="margin-bottom:16px">${icon('info', 16)}<div>Turn <b>Buy now</b> off for a series that is not launched yet: students see “Coming soon · Notify me” and leave their number. When you launch, turn it on and message everyone on the waiting list.</div></div>
    ${d.items.length ? h`<div class="card pad0 list">${join(d.items, x => { const W = waiting(x), left = W.filter(r => !r.notified_at).length;
      return h`<div class="li st-sr">${cover(x, 'sm')}<div class="grow"><div class="t ell">${x.title}</div><div class="s">${x.buy_on === false ? 'Coming soon · students can join the waiting list' : 'Live · students can buy'}</div>
          <button class="btn xs ${W.length ? 'soft' : 'ghost'} mt8" data-act="wait" data-id="${x.id}">${icon('users', 13)} ${W.length ? fmt.plural(W.length, 'person', 'people') + ' waiting' + (left ? ' · ' + left + ' to notify' : ' · all notified') : 'Nobody waiting'}</button></div>
        <label class="sw st-swr" title="Buy now"><input type="checkbox" data-act="buy" data-id="${x.id}" ${x.buy_on !== false ? raw('checked') : ''} ${m ? '' : raw('disabled')}><i></i><span class="xs b">${x.buy_on !== false ? 'Buy now on' : 'Off'}</span></label></div>`; })}</div>`
      : h`<div class="card">${UI.empty({ icon: 'bell', title: 'No series on the store yet' })}</div>`}`);
}
async function setBuy(input, x) {
  const on = input.checked;
  if (!on && !(await UI.confirm({ title: 'Turn Buy now off for “' + x.title + '”?', text: 'Students see “Coming soon · Notify me” and cannot order this series until you turn it on again.', yes: 'Turn off' }))) { input.checked = true; return; }
  const r = await AX.api.call('cbt_admin_store_launch', 'buy', { item: x.id, on });
  if (!r.ok) { input.checked = !on; return UI.toast(r.error === 'missing' ? 'Run supabase_v31_store_soon.sql once in Supabase first' : 'Could not change Buy now. ' + AX.errText(r), { tone: 'bad' }); }
  x.buy_on = on;
  UI.toast(on ? x.title + ' is live — message the waiting list' : x.title + ' shows Coming soon', on && waiting(x).some(r2 => !r2.notified_at) ? { action: { label: 'Waiting list', fn: () => waitList(x) } } : {});
  refresh();
}
function waitList(x) {
  if (T.notify === null) return UI.toast('Run supabase_v31_store_soon.sql once in Supabase first', { tone: 'warn' });
  const m = can();
  const body = () => { const W = waiting(x);
    return h`<p class="sm tx2" style="line-height:1.6;margin-bottom:14px">${x.buy_on === false ? h`Buy now is <b>off</b> — students see “Coming soon”. When you launch, turn Buy now on, then message everyone here.` : h`Buy now is <b>on</b> — the series is live. Message everyone who is not notified yet.`} Tap WhatsApp: the launch message opens and the student is marked as notified.</p>
      ${W.length ? h`<div class="card flat pad0 list">${join(W, r => h`<div class="li">${UI.avatar(r.name, r.mobile, 'sm')}<div class="grow"><div class="t ell">${r.name || 'Student'} <span class="mut" style="font-weight:600">· ${fmt.mobile(S.m10(r.mobile))}</span></div><div class="s">Asked ${fmt.ago(r.created_at)}${r.notified_at ? h` · <span style="color:var(--ok)">notified ${fmt.ago(r.notified_at)}</span>` : ''}</div></div>
        <a class="btn sm ${r.notified_at ? 'ghost' : 'soft'}" href="${S.links(r.mobile, launchMsg(x, r)).wa}" target="_blank" rel="noopener" data-act="wa" data-m="${r.mobile}">${icon('whatsapp', 15)} <span>WhatsApp</span></a>${m ? h`<button class="ibtn sm" data-act="wdel" data-m="${r.mobile}" aria-label="Remove ${r.name || ''}" title="Remove from the list">${icon('x', 15)}</button>` : ''}</div>`)}</div>` : UI.empty({ icon: 'bell', title: 'Nobody has tapped “Notify me” yet' })}`; };
  const foot = () => { const W = waiting(x), left = W.filter(r => !r.notified_at).length; return W.length ? h`<button class="btn" data-act="copy">${icon('copy', 15)} Copy ${fmt.plural(W.length, 'number')}</button><span class="sp"></span>${left && m ? h`<button class="btn pri" data-act="all">${icon('check', 15)} Mark ${left} as notified</button>` : h`<button class="btn" data-close>Close</button>`}` : h`<span class="sp"></span><button class="btn" data-close>Close</button>`; };
  UI.drawer({ title: 'Waiting for ' + x.title, sub: fmt.plural(waiting(x).length, 'person', 'people') + ' asked to be told when it launches', body: body(), foot: foot(),
    onOpen(el) {
      const redraw = () => { AX.set(el.querySelector('.m-b'), body()); AX.set(el.querySelector('.m-f'), foot()); };
      const mark = async (mobile) => {
        const r = await AX.api.call('cbt_admin_store_launch', 'notified', { item: x.id, mobile: mobile || '' });
        if (!r.ok) return UI.err(r);
        const now = new Date().toISOString(); waiting(x).forEach(z => { if (mobile ? z.mobile === mobile : !z.notified_at) z.notified_at = z.notified_at || now; });
        AX.cache.drop('store:notify'); redraw(); if (T.view && T.view.alive()) T.view.paint();
      };
      AX.act(el, {
        wa: b => { if (m) mark(b.dataset.m); },
        copy: () => AX.u.copy(waiting(x).map(r => r.mobile).join(', ')).then(() => UI.toast('Numbers copied')),
        async all() { if (!(await UI.confirm({ title: 'Mark everyone as notified?', text: 'Everyone on this list who is not notified yet is marked as notified.', yes: 'Mark as notified' }))) return; await mark(''); UI.toast('Marked as notified'); },
        async wdel(b) { const r0 = waiting(x).find(z => z.mobile === b.dataset.m); if (!(await UI.confirm({ title: 'Remove ' + ((r0 && r0.name) || 'this student') + '?', text: 'They are taken off the waiting list for this series.', yes: 'Remove', tone: 'danger' }))) return; const r = await AX.api.call('cbt_admin_store_launch', 'delete', { item: x.id, mobile: b.dataset.m }); if (!r.ok) return UI.err(r); T.notify[x.id] = waiting(x).filter(z => z.mobile !== b.dataset.m); AX.cache.drop('store:notify'); redraw(); UI.toast('Removed from the list'); if (T.view && T.view.alive()) T.view.paint(); }
      });
    } });
}

/* ---------- Payment settings ---------- */
function settings(el) {
  const st = D().settings, m = can();
  AX.set(el, h`<div class="grid st-2" style="align-items:start">
    <form class="card" id="ps" autocomplete="off"><div class="card-h">${icon('wallet')}<h3 class="grow">Payment details</h3>${st.updated_at ? h`<span class="xs mut">changed ${fmt.ago(st.updated_at)}</span>` : ''}</div>
      <p class="sm mut" style="margin:-4px 0 16px">Shown on the store page when a student pays. Every change of the UPI ID, name or Telegram is recorded.</p>
      <div class="col gap16">
        ${AX.f.input({ name: 'upi', label: 'UPI ID', value: st.upi || '', placeholder: 'name@bank', auto: 'off', disabled: !m, hint: 'Students pay to this UPI ID. Check it twice.' })}
        ${AX.f.input({ name: 'payee', label: 'Name shown in UPI apps', value: st.payee || '', max: 60, disabled: !m })}
        ${AX.f.input({ name: 'note', label: 'Small note on the payment step (optional)', value: st.note || '', max: 300, placeholder: 'e.g. Unlocked within 2 hours (9 am – 9 pm)', disabled: !m })}
        ${AX.f.input({ name: 'telegram', label: 'Telegram username (optional)', value: st.telegram || '', max: 60, placeholder: 'e.g. aspiron_support', disabled: !m, hint: 'Not used by the store — student support uses SUPPORT_URL in config.js.' })}
        ${m ? h`<button type="button" class="btn pri" data-act="pset" data-busy="Saving…">${icon('check', 16)} Save payment details</button>` : h`<div class="callout gold sm">${icon('lock', 16)}<div>View only — ask the owner for full Store access to change these.</div></div>`}
      </div></form>
    <div class="col gap16">${storeLink()}
      <div class="card"><div class="card-h">${icon('history')}<h3 class="grow">Change history</h3><button class="btn xs ghost" data-act="audit">${icon('refresh', 13)} Load</button></div>
        <div id="ps-h"><p class="sm mut">Every change of the UPI ID, payee name or Telegram. If you see a change you did not make, change your password at once.</p></div></div></div></div>`);
  loadAudit(el);
}
async function loadAudit(el) {
  const box = el.querySelector('#ps-h'); if (!box) return;
  AX.set(box, h`<div class="skel line"></div><div class="skel line" style="width:70%"></div>`);
  const r = await AX.api.rpc('cbt_admin_store_audit', {});
  if (!box.isConnected) return;
  if (!r.ok) return AX.set(box, h`<p class="sm" style="color:var(--bad)">${r.error === 'missing' ? 'Run supabase_v19_store_security.sql once in Supabase to record changes.' : AX.errText(r)}</p>`);
  const L = r.items || [];
  AX.set(box, L.length ? h`<div class="timeline">${join(L, a => h`<div class="tl-i gold"><div class="b mono sm">${a.upi || '—'}</div><div class="xs tx2">${a.payee || '—'} · Telegram: ${a.telegram || '—'}</div><div class="xs mut">${fmt.dt(a.at)}</div></div>`)}</div><p class="xs faint">Latest 10 changes.</p>` : h`<p class="sm mut">No changes yet.</p>`);
}
async function saveSettings(btn) {
  const f = btn.closest('form'); AX.f.clearErrors(f);
  const v = AX.f.read(f), upi = v.upi.trim(), payee = v.payee.trim(), note = v.note.trim(), tg = v.telegram.trim().replace(/^(https?:\/\/)?(t\.me\/)?@?/, '');
  if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(upi)) return AX.f.error(f, 'upi', 'Enter a valid UPI ID, e.g. name@bank');
  if (/[<>"`]/.test(payee)) return AX.f.error(f, 'payee', 'Remove < > " ` from the name');
  if (!/^[A-Za-z0-9_]{0,40}$/.test(tg)) return AX.f.error(f, 'telegram', 'Telegram username: only letters, numbers and _');
  if (!(await UI.confirm({ title: 'Change payment details?', yes: 'Save',
    text: h`<span class="kv" style="display:grid"><span class="mut">UPI</span><b class="mono">${upi}</b><span class="mut">Name</span><b>${payee || '—'}</b><span class="mut">Telegram</span><b>${tg || '—'}</b></span><span style="display:block;margin-top:12px">Students will pay to this UPI ID.</span>` }))) return;
  await UI.busy(btn, async () => {
    const r = await AX.api.call('cbt_admin_store', 'save_settings', { upi, payee, telegram: tg, note });
    if (!r.ok) return r.error === 'upi' ? AX.f.error(f, 'upi', 'Enter a valid UPI ID') : UI.toast('Could not save. ' + AX.errText(r), { tone: 'bad' });
    Object.assign(D().settings, { upi, payee, telegram: tg, note });
    UI.toast('Payment details saved'); refresh();
  });
}

/* ---------- delegated actions (wired once per page) ---------- */
const byId = id => D().items.find(x => x.id === id);
const ACTS = {
  retry: () => AX.route(),
  dp: el => { T.dp = el.dataset.v; T.day = null; T.view.paint(); },

  dayAll: () => { T.day = null; T.view.paint(); },
  cf: el => { T.cf = el.dataset.v; T.view.paint(); },
  open: el => S.openOrder(el.dataset.code),
  approve: el => UI.busy(el, () => S.approve(el.dataset.code)),
  contact: el => S.onContact(el),
  // a day bar on the overview chart (data-pick) or "Add from your series"
  pick: el => { if (el.dataset.pick == null) return pickSeries(); const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - (13 - Number(el.dataset.pick))); T.day = t.getTime(); T.view.paint(); },
  add: () => editItem(null),
  edit: el => editItem(byId(el.dataset.id)),
  imenu: el => itemMenu(el, byId(el.dataset.id)),
  resync: el => resync(el),
  mv: el => move(el.dataset.id, +el.dataset.d),
  mvto: el => moveTo(el, byId(el.dataset.id)),
  secmv: el => secMove(el.dataset.k, +el.dataset.d),
  secren: el => secRename(el.dataset.k),
  xedit: el => editExplore(byId(el.dataset.id)),
  async xreload() { AX.cache.drop('store:demos'); await extras(false); T.view.paint(); },
  wait: el => waitList(byId(el.dataset.id)),
  pset: el => saveSettings(el),
  audit: el => loadAudit(el.closest('.grid'))
};
const CHG = { buy: el => setBuy(el, byId(el.dataset.id)) };

AX.css('store', `
.st-2{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:900px){.st-2{grid-template-columns:minmax(0,1fr)}}
.st-banner{display:flex;align-items:center;gap:14px;margin-bottom:16px;color:var(--tx);text-decoration:none!important;border-color:color-mix(in srgb,var(--gold) 40%,var(--line));background:linear-gradient(100deg,var(--gold-soft),var(--solid) 60%)}
.st-li{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri);flex:none}
.st-li.gold{background:var(--gold-soft);color:var(--gold)}
.st-ch{padding:16px 16px 4px;margin:0}
.st-link .row{gap:12px}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:16px}
.st-card{display:flex;flex-direction:column;transition:transform var(--std) var(--ease),border-color var(--std)}
.st-card:hover{border-color:var(--pri-line)}
.st-card.off .st-top{opacity:.5;filter:grayscale(.6)}
.st-top{position:relative}
.st-cv{--cc:#2563eb;position:relative;aspect-ratio:16/8;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,color-mix(in srgb,var(--cc) 70%,#fff) 0%,var(--cc) 55%,color-mix(in srgb,var(--cc) 70%,#000) 100%);color:#fff}
.st-cv img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-cv span{font-family:var(--font-display);font-size:44px;font-weight:600;opacity:.9;text-shadow:0 4px 18px rgba(0,0,0,.25)}
.st-cv.sm{width:52px;height:40px;aspect-ratio:auto;border-radius:10px;flex:none}
.st-cv.sm span{font-size:18px}
.st-cv.big{border-radius:14px 14px 0 0}
.st-tags{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap}
.st-tags .pill{background:color-mix(in srgb,var(--solid) 88%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.st-tags .pill.warn{color:var(--warn)}.st-tags .pill.gold{color:var(--gold)}
.st-b{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1}
.st-tt{font-size:15px;font-weight:750;line-height:1.3;display:block;overflow-wrap:anywhere}
.st-sub{margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.st-price{font-family:var(--font-display);font-size:22px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:lining-nums tabular-nums}
.st-meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--mut)}
.st-meta span{display:inline-flex;align-items:center;gap:4px}
.st-meta .ax-ic,.st-b .xs .ax-ic{width:13px;height:13px}
.st-meta .st-w{color:var(--gold);font-weight:700}
.st-ft{margin-top:auto;padding-top:4px}
.st-ed{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:24px;align-items:start}
.st-edp{position:sticky;top:0;order:2}
.st-edf{order:1}
@media (max-width:860px){.st-ed{grid-template-columns:minmax(0,1fr)}.st-edp{position:static;order:0;max-width:320px;width:100%;margin:0 auto}}
.st-sh{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.st-sh .ax-ic{width:16px;height:16px;color:var(--pri)}
.st-prev{position:relative;border-radius:16px;border:1px solid var(--line-2);background:var(--solid-2);overflow:hidden;box-shadow:var(--shadow)}
.st-pb{position:absolute;right:10px;top:10px;padding:3px 10px;border-radius:999px;background:var(--grad-gold);color:#2a1d05;font-size:11.5px;font-weight:800}
.st-pbody{padding:14px}
.st-pf{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:13px}
.st-pf li{display:flex;gap:8px;align-items:flex-start}
.st-pf .ax-ic{width:14px;height:14px;color:var(--ok);margin-top:3px}
.st-pbtn{--cc:#2563eb;margin-top:12px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--cc);color:#fff;font-weight:750;font-size:14px}
.st-sw{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0}
.st-sw button{--cc:#2563eb;width:34px;height:34px;border-radius:50%;border:2px solid transparent;background:var(--cc);box-shadow:0 0 0 2px var(--solid) inset;cursor:pointer}
.st-sw button.on{border-color:var(--tx);transform:scale(1.06)}
.st-photo{gap:12px;margin-bottom:8px}
.st-thumb{width:96px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:var(--hover);display:grid;place-items:center;color:var(--faint)}
.st-pk{align-items:flex-start}
.st-pp{width:120px;flex:none}
@media (max-width:560px){.st-pk{flex-wrap:wrap}.st-pp{width:100%;padding-left:28px}}
.st-rh{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--glass-hi),transparent)}
.st-ol{list-style:none;margin:0;padding:6px 0}
.st-ol li{display:flex;align-items:center;gap:12px;padding:8px 16px;min-width:0}
.st-ol li.off{opacity:.55}
.st-ol li+li{border-top:1px dashed var(--line)}
.st-n{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:var(--hover);font-size:12px;font-weight:800;color:var(--mut);flex:none}
.ibtn[disabled]{opacity:.35;pointer-events:none}
.st-demo .st-li{width:36px;height:36px}
.st-xr,.st-sr{align-items:flex-start}
.st-swr{flex:none;margin-top:4px}
.st-swr span{min-width:72px}
@media (max-width:560px){.st-xr{flex-wrap:wrap}.st-xr>.row{width:100%;justify-content:flex-end}.st-swr span{display:none}}
`);
})();
