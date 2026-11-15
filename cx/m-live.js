/* =====================================================================
   Live monitor, series first.
   · "Live now": one board per test that is open right now (any series). Computer: side by side. Phone: one screen
     per test, swipe left / right (or the arrows / dots). The student list below belongs to the open board.
   · "Series & history": every series, then its tests (live first, then newest first, searchable), then one test.
   Numbers: cbt_admin3 live_tests / live (base setup). Series names and dates come from the catalog (cbt_admin catalog).
   Polling: the open board every 15 s, the other live boards at most once a minute (the free plan has an egress limit).
   Home shares the same numbers (AX.live). Countdowns tick every second on the server clock (skew).
   Links: #/live · #/live/history · #/live/history/<series> · #/live/<testId>.
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
const LV = { id: null, seg: 'writing', q: '', skew: 0, cache: new Map(), err: new Map(), tests: [], cat: null, timers: [], panes: [], hq: '', hn: 30, hf: 'all' };
const flight = new Map();
const now = () => Date.now() + LV.skew;
const ms = t => fmt.ms(t) || 0;
const mmss = s => { s = Math.max(0, Math.round(s)); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (hh ? hh + ':' : '') + String(m).padStart(hh ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
const pct = x => x.max ? Math.round(x.score * 100 / x.max) : 0;
const tone = p => p >= 60 ? 'ok' : p >= 35 ? 'warn' : 'bad';
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const stuLink = () => /^https:\/\//.test(AX.cfg.SHORT_URL || '') ? AX.cfg.SHORT_URL : siteUrl();
const cq = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const isOpen = t => !!t && Number(t.open_now) > 0;
const inWin = c => !!c && c.active !== false && ms(c.opens_at) > 0 && ms(c.opens_at) <= now() && ms(c.closes_at) > now();   // a definite window
const SEGS = [
  { k: 'writing', t: 'Writing now', short: 'Writing', icon: 'pulse', tone: 'pri' },
  { k: 'done', t: 'Submitted', short: 'Submitted', icon: 'checkCircle', tone: 'ok' },
  { k: 'waiting', t: 'Not started', short: 'Not started', icon: 'clock', tone: 'mut' },
  { k: 'expired', t: 'Time over, not submitted', short: 'Time over', icon: 'alert', tone: 'warn' }
];
const EMPTY = { writing: 'Nobody is writing this test right now.', done: 'No submissions yet.', waiting: 'Everyone has started 🎉', expired: 'None.' };
const stop = () => { LV.timers.forEach(t => clearInterval(t)); LV.timers = []; };

/* ---------- one test's numbers: cached, shared with Home ---------- */
const cnt = x => { const n = { writing: ((x && x.writing) || []).length, done: ((x && x.done) || []).length, waiting: ((x && x.waiting) || []).length, expired: ((x && x.expired) || []).length }; n.el = Math.max(Number(x && x.eligible) || 0, n.writing + n.done + n.waiting + n.expired); return n; };
function pull(id) {
  if (flight.has(id)) return flight.get(id);
  const p = AX.api.call('cbt_admin3', 'live', { id }).then(x => {
    flight.delete(id);
    if (x && x.ok) { LV.cache.set(id, { x, at: Date.now() }); LV.err.delete(id); LV.skew = (Number(x.now) || Date.now()) - Date.now(); } else LV.err.set(id, x || { ok: false, error: 'server' });
    return x;
  });
  flight.set(id, p); return p;
}
const isLive = id => isOpen(rowOf(id)) || inWin(cTest(id));
AX.live = { watchMs: 0, catEvery: 5, pull, get: id => LV.cache.get(id), counts: cnt, fresh: (id, age) => { const c = LV.cache.get(id); return c && Date.now() - c.at < age ? c : null; } };
async function reread(withCat) {
  // live_tests every time; the catalog (can be big) only now and then, through its own cache
  const [r, cat] = await Promise.all([AX.api.call('cbt_admin3', 'live_tests'), withCat ? AX.data.catalog() : null]);
  if (r && r.ok) LV.tests = r.tests || [];
  if (cat && cat.ok) LV.cat = cat;
  return liveIds();
}
const sameSet = (a, b) => a.slice().sort().join() === b.slice().sort().join();
const watch = (ctx, ids) => { let k = 0; LV.timers.push(setInterval(async () => {
  if (!ctx.alive()) return stop();
  if (document.hidden) return;
  const n = await reread(++k % (AX.live.catEvery || 5) === 0);
  if (ctx.alive() && !sameSet(n, ids)) ctx.reload();
}, AX.live.watchMs || 60000)); };
AX.openLive = id => AX.go('live' + (id ? '/' + encodeURIComponent(id) : ''));

/* ---------- series: the catalog knows which series a test belongs to; live_tests only has the series name ---------- */
const CT = () => (LV.cat && LV.cat.ok && LV.cat.tests) || [];
const CS = () => (LV.cat && LV.cat.ok && LV.cat.series) || [];
const cTest = id => CT().find(t => t.id === id) || null;
const rowOf = id => LV.tests.find(t => t.id === id) || null;
const serId = id => { const c = cTest(id); return c ? c.series_id : null; };
const serName = id => { const s = CS().find(x => x.id === serId(id)); return s ? s.title : ((rowOf(id) || {}).series || ''); };
const serKey = id => serId(id) || ((rowOf(id) || {}).series ? 'n:' + rowOf(id).series : 'other');
const titleOf = id => { const c = LV.cache.get(id); return (c && c.x.test && c.x.test.title) || (rowOf(id) || {}).title || (cTest(id) || {}).title || 'Test'; };
const liveIds = () => {
  const ord = new Map(CS().map((s, i) => [s.id, i])), at = id => ord.has(serId(id)) ? ord.get(serId(id)) : 99, set = new Set(LV.tests.filter(isOpen).map(t => t.id));
  CT().forEach(t => { if (inWin(t)) set.add(t.id); });
  return [...set].sort((a, b) => at(a) - at(b) || ms((cTest(a) || {}).opens_at) - ms((cTest(b) || {}).opens_at));
};
// series cards: catalog series first, then series names that only live_tests knows
function groups() {
  const live = new Set(liveIds()), out = [];
  CS().forEach(s => { const ids = CT().filter(t => t.series_id === s.id).map(t => t.id); if (ids.length || [...live].some(i => serId(i) === s.id)) out.push({ key: s.id, title: s.title, free: !!s.is_free, ids }); });
  const have = new Set(CT().map(t => t.id)), extra = new Map();
  LV.tests.filter(t => !have.has(t.id)).forEach(t => { const k = t.series ? 'n:' + t.series : 'other'; if (!extra.has(k)) extra.set(k, { key: k, title: t.series || 'Other tests', free: false, ids: [] }); extra.get(k).ids.push(t.id); });
  return out.concat([...extra.values()]).map(g => Object.assign(g, { live: g.ids.filter(i => live.has(i)).length }));
}
const metaOf = id => { const c = cTest(id); if (c) return c; const r = rowOf(id) || {}; return { id, title: r.title, opens_at: r.opens_at, closes_at: r.closes_at, result_at: r.result_at }; };
const stateOf = (id, live) => { if (live.has(id)) return 'live'; const m = metaOf(id), o = ms(m.opens_at), c = ms(m.closes_at); return o && o > now() ? 'soon' : o || (c && c <= now()) ? 'ended' : 'any'; };

/* ---------- a board: one test's numbers ---------- */
const board = (id, active) => {
  const c = LV.cache.get(id), x = c && c.x, d = x || {}, t = d.test || {}, ct = cTest(id) || {}, r = rowOf(id) || {}, e = LV.err.get(id);
  const n = cnt(x), w = k => n.el ? n[k] * 100 / n.el : 0, ser = serName(id);
  const opens = ms(t.opens_at) || ms(ct.opens_at), closes = ms(ct.closes_at) || ms(r.closes_at), live = isLive(id);
  const when = opens && opens > now() ? h`<span>Opens ${fmt.dt(opens)} · <b class="lv-cd" data-open="${opens}">in ${mmss((opens - now()) / 1000)}</b></span>`
    : closes && live ? (closes > now() ? h`<span>Ends ${fmt.dt(closes)} · <b class="lv-cd" data-end="${closes}">in ${mmss((closes - now()) / 1000)}</b></span>` : h`<span>Ended ${fmt.dt(closes)}</span>`)
    : opens ? h`<span>Opened ${fmt.dt(opens)}</span>` : h`<span>Open any time</span>`;
  return h`<div class="lv-board glass ${active ? 'on' : ''}">
    <div class="lv-bh"><div class="grow">${ser ? h`<div class="lv-ser ell">${icon('layers', 13)} ${ser}</div>` : ''}<h3 class="ell" title="${t.title || r.title || ct.title || ''}">${t.title || r.title || ct.title || 'Test'}</h3>
      <div class="row wrap gap6 mt4 xs mut"><span class="pill">${t.questions || ct.questions || 0} Q · ${t.duration || ct.duration || 0} min${t.max ? ' · max ' + t.max : ''}</span>${t.active === false || ct.active === false ? UI.pill('Hidden', 'warn') : ''}${when}</div></div>
      ${live ? h`<span class="pill ok lv-now"><span class="live-dot"></span> ${n.writing ? n.writing + ' writing' : 'Live'}</span>` : n.writing ? h`<span class="pill ok lv-now"><span class="live-dot"></span> ${n.writing} writing</span>` : ''}</div>
    ${e && !x ? h`<div class="lv-e mt12">${icon('alert', 15)} <span>${e.error === 'missing' ? 'Setup is missing for this test.' : 'Could not load the numbers.'}</span> <button class="btn xs" data-act="retry" data-id="${id}">${icon('refresh', 13)} Try again</button></div>`
      : h`<div class="lv-stats">${join(SEGS, s => h`<button type="button" class="lv-stat ${s.tone} ${active && LV.seg === s.k ? 'on' : ''}" data-act="seg" data-id="${id}" data-k="${s.k}"><span class="k-l">${icon(s.icon, 15)}<span>${s.short}</span></span><span class="k-v">${x ? fmt.num(n[s.k]) : '–'}</span><span class="k-f">${x && n.el ? Math.round(w(s.k)) + '% of ' + fmt.num(n.el) : ' '}</span></button>`)}</div>
      <div class="lv-bar" role="img" aria-label="${n.done} submitted, ${n.writing} writing, ${n.expired} time over, ${n.waiting} not started"><i class="done" style="width:${w('done')}%"></i><i class="writing" style="width:${w('writing')}%"></i><i class="expired" style="width:${w('expired')}%"></i></div>
      <div class="xs mut lv-cap">${x ? h`${fmt.plural(n.el, 'student')} can take this test · updated ${new Date(c.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Loading…'}</div>`}</div>`;
};

AX.mod({
  id: 'live', title: 'Live monitor', short: 'Live', icon: 'live', group: 'Tests & questions', order: 15, perm: 'results',
  sub: 'Every test that is live now, by series. Older tests are in Series & history.',
  async render(ctx) {
    stop(); LV.refreshFn = null;
    const p0 = ctx.parts[0] || '', p1 = ctx.parts[1] ? decodeURIComponent(ctx.parts[1]) : '';
    ctx.head({ title: 'Live monitor', sub: 'Every test that is live now, by series. Older tests are in Series & history.', tabs: [{ id: 'now', title: 'Live now', icon: 'live', href: '#/live' }, { id: 'history', title: 'Series & history', icon: 'layers', href: '#/live/history' }], tab: p0 === 'history' ? 'history' : 'now',
      actions: h`<button class="btn sm" data-act="refresh">${icon('refresh', 15)} Refresh</button>` });
    AX.set(ctx.el, h`${UI.skeleton(1)}<div class="mt16">${UI.skeleton(4, 'kpi')}</div><div class="mt16">${UI.skeleton(5)}</div>`);
    const [r, cat] = await Promise.all([AX.api.call('cbt_admin3', 'live_tests'), AX.data.catalog()]);
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v8_update.sql in Supabase → SQL Editor once, then refresh this page.' })}</div>` : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    LV.tests = r.tests || []; LV.cat = cat;
    const live = liveIds();
    // fix the header count now that the live tests are known
    ctx.head({ title: 'Live monitor', sub: 'Every test that is live now, by series. Older tests are in Series & history.', tabs: [{ id: 'now', title: 'Live now', icon: 'live', href: '#/live', count: live.length || 0 }, { id: 'history', title: 'Series & history', icon: 'layers', href: '#/live/history' }], tab: p0 === 'history' ? 'history' : 'now',
      crumb: p0 && p0 !== 'history' && !live.includes(p0) ? titleOf(p0) : '', actions: h`<button class="btn sm" data-act="refresh">${icon('refresh', 15)} Refresh</button>` });
    const ph = document.getElementById('ax-ph'); if (ph) AX.act(ph, { refresh: () => (LV.refreshFn ? LV.refreshFn() : ctx.reload()) });

    if (p0 === 'history') return historyTab(ctx, p1);
    // a single test (older or not open now) or the live boards
    let ids;
    if (p0) { ids = live.includes(p0) ? live : [p0]; if (p0 !== LV.id) { LV.id = p0; LV.seg = 'writing'; LV.q = ''; } }
    else {
      if (!live.length) return noneLive(ctx);
      ids = live; if (!ids.includes(LV.id)) { LV.id = ids[0]; LV.seg = 'writing'; LV.q = ''; }
    }
    boards(ctx, ids, !!p0 && !live.includes(p0));
  }
});

/* ---------- nothing is live: say when the next test opens ---------- */
function noneLive(ctx) {
  watch(ctx, []);
  const next = CT().filter(t => t.active && ms(t.opens_at) > now()).sort((a, b) => ms(a.opens_at) - ms(b.opens_at)).slice(0, 4);
  AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'live', title: 'No test is live right now', text: next.length ? 'The next ones are below. Finished tests are in Series & history.' : 'Live tests show here the moment they open. Finished tests are in Series & history.', action: h`<a class="btn sm pri" href="#/live/history">${icon('layers', 15)} Series & history</a>` })}</div>
    ${next.length ? h`<div class="section-t">Opening next</div><div class="card pad0 list">${join(next, t => h`<a class="li click" href="#/live/${encodeURIComponent(t.id)}" style="color:var(--tx);text-decoration:none"><span class="av sm" style="--c:#6366f1">${icon('calendar', 15)}</span><div class="grow"><div class="t ell">${t.title}</div><div class="s ell">${serName(t.id) || '—'} · opens ${fmt.dt(t.opens_at)}</div></div>${UI.pill(fmt.ago(t.opens_at), 'info')}</a>`)}</div>` : ''}`);
}

/* ---------- the boards (live now, or one older test) + the student list of the open board ---------- */
function boards(ctx, ids, single) {
  LV.panes = ids;
  if (!single) watch(ctx, ids);
  const site = stuLink(), canReset = AX.can('students', 'manage');
  AX.set(ctx.el, h`${single ? h`<div class="row gap6 mb8"><a class="btn xs ghost" href="#/live/history/${encodeURIComponent(serKey(ids[0]))}">${icon('chevL', 14)} ${serName(ids[0]) || 'Series & history'}</a></div>` : ''}
    <div class="lv-rw"><div class="lv-row" id="lv-row" data-c="${ids.length}">${join(ids, id => h`<section class="lv-pane" id="lv-p-${id}" data-id="${id}"></section>`)}</div>
      <div class="lv-dots" data-c="${ids.length}"><button type="button" class="ibtn sm" data-act="prev" aria-label="Previous test">${icon('chevL', 17)}</button><span class="lv-dotl">${join(ids, id => h`<button type="button" class="lv-dot" data-act="go" data-id="${id}" aria-label="${titleOf(id)}"></button>`)}</span><button type="button" class="ibtn sm" data-act="next" aria-label="Next test">${icon('chevR', 17)}</button></div></div>
    <div class="lv-for mt16" id="lv-for"></div>
    <div class="lv-tools mt12"><div id="lv-seg" class="lv-segw"></div><div id="lv-csv"></div><div class="inp-wrap search lv-q">${icon('search', 16)}<input class="inp sm" type="search" data-act="q" placeholder="Search name or mobile" value="${LV.q}" aria-label="Search students"></div></div>
    <div id="lv-list" class="mt12"></div>`);

  const cur = () => { const c = LV.cache.get(LV.id); return c ? c.x : null; };
  const list = k => (cur() && cur()[k]) || [];
  const paneOf = id => document.getElementById('lv-p-' + id);
  const drawPane = id => { const el = paneOf(id); if (el) { AX.set(el, board(id, id === LV.id)); el.classList.toggle('on', id === LV.id); } };
  const drawDots = () => ctx.el.querySelectorAll('.lv-dot').forEach(b => b.classList.toggle('on', b.dataset.id === LV.id));
  const drawAll = () => { ids.forEach(drawPane); drawDots(); };

  const rows = () => {
    const d = cur(), t = (d && d.test) || {}, q = LV.q.trim().toLowerCase(), k = LV.seg;
    const all = list(k), L = all.map((x, i) => [x, i]).filter(([x]) => !q || String(x.name || '').toLowerCase().includes(q) || String(x.mobile || '').includes(q));
    if (!all.length) return AX.set('#lv-list', h`<div class="card">${UI.empty({ icon: k === 'waiting' ? 'checkCircle' : k === 'done' ? 'inbox' : k === 'expired' ? 'checkCircle' : 'pulse', title: EMPTY[k] })}</div>`);
    if (!L.length) return AX.set('#lv-list', h`<div class="card">${UI.empty({ icon: 'search', title: 'No student matches', text: 'Try another name or mobile number.' })}</div>`);
    const V = L.slice(0, 300), tn = now();
    const who = x => h`${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><div class="t ell">${x.name}</div>`;
    const wa = (m, text) => h`<a class="btn sm soft lv-wa" href="${AX.u.wa(m, text)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${icon('whatsapp', 15)}<span>WhatsApp</span></a>`;
    const row = ([x, i]) => {
      if (k === 'writing') {
        const left = (x.ends - tn) / 1000, span = Math.max(1, x.ends - x.started), f = Math.max(0, Math.min(100, (x.ends - tn) * 100 / span));
        return h`<div class="li lv-w ${left < 300 ? 'low' : ''}" data-row>${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · started ${fmt.time(x.started)}</div>
          <div class="lv-tb"><i data-tb="${x.started}|${x.ends}" style="width:${f}%"></i></div></div><div class="lv-left"><b class="num" data-te="${x.ends}">${mmss(left)}</b><span class="xs mut">left</span></div></div>`;
      }
      if (k === 'done') {
        const p = pct(x);
        return h`<div class="li"><span class="lv-rk">${i + 1}</span>${who(x)}<div class="s"><span class="num">✓${x.correct} ✗${x.wrong} –${x.skipped}</span> · ${Math.round((x.used || 0) / 60)} min · ${fmt.time(x.at)}</div></div>
          ${x.late ? UI.pill('late', 'warn') : ''}<div class="lv-sc2"><b class="num">${x.score}<span class="mut">/${x.max}</span></b><span class="lv-p ${tone(p)}">${p}%</span></div></div>`;
      }
      if (k === 'waiting') {
        const full = (x.devices || 0) >= (x.max_devices || 0) && x.max_devices != null;
        return h`<div class="li lv-ww">${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · seen ${fmt.ago(x.seen)} · <span class="${full ? 't-bad' : ''}">devices ${x.devices || 0}/${x.max_devices}</span></div></div>
          <div class="lv-acts">${full && canReset ? h`<button class="btn sm" data-act="reset" data-id="${x.id}" data-busy="Resetting" title="All device slots are used — reset so the student can sign in">${icon('smartphone', 15)}<span>Reset devices</span></button>` : ''}${wa(x.mobile, `Hi ${x.name}, "${t.title || titleOf(LV.id)}" is live now. Open ${site} and start your test. All the best!`)}</div></div>`;
      }
      return h`<div class="li lv-ww">${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · ended ${fmt.ago(x.ends)} · answers may still arrive when their phone is back online</div></div>
        <div class="lv-acts">${wa(x.mobile, `Hi ${x.name}, your time for "${t.title || titleOf(LV.id)}" is over. Please open ${site} once with internet so your answers are submitted.`)}</div></div>`;
    };
    AX.set('#lv-list', h`<div class="card pad0 list lv-list">${join(V, row)}</div>${L.length > V.length ? h`<div class="xs mut mt8">Showing ${V.length} of ${L.length}. Search to find someone.</div>` : ''}`);
  };
  const drawList = () => {
    const d = cur();
    AX.set('#lv-for', ids.length > 1 || serName(LV.id) ? h`<span class="lv-fi">${icon('users', 15)}</span><span class="grow ell">Students of <b>${titleOf(LV.id)}</b>${serName(LV.id) ? h` <span class="mut">· ${serName(LV.id)}</span>` : ''}</span>` : '');
    if (!d) { AX.set('#lv-seg', ''); AX.set('#lv-csv', ''); const e = LV.err.get(LV.id); return AX.set('#lv-list', e ? UI.errorBox(e, 'supabase_v8_update.sql') : UI.skeleton(4)); }
    const n = cnt(d);
    AX.set('#lv-seg', h`<div class="seg" role="tablist">${join(SEGS, s => h`<button type="button" class="${LV.seg === s.k ? 'on' : ''}" data-act="seg" data-id="${LV.id}" data-k="${s.k}">${s.short} <b class="lv-sc">${n[s.k]}</b></button>`)}</div>`);
    AX.set('#lv-csv', LV.seg === 'done' && n.done ? h`<button class="btn sm" data-act="csv">${icon('download', 15)} Download CSV</button>` : '');
    rows();
  };
  const load = async (id, quiet) => {
    const x = await pull(id);
    if (!ctx.alive()) return;
    if (!x.ok && !quiet) UI.toast(x.error === 'missing' ? AX.errText(x, 'supabase_v8_update.sql') : 'Could not load the numbers', { tone: 'bad' });
    drawPane(id); if (id === LV.id) drawList();
  };
  const setActive = (id, keepSeg) => {
    if (id === LV.id) return;
    LV.id = id; if (!keepSeg) LV.seg = 'writing'; LV.q = '';
    const qi = ctx.el.querySelector('[data-act=q]'); if (qi) qi.value = '';
    try { history.replaceState(null, '', '#/live/' + encodeURIComponent(id)); } catch (e) {}
    drawAll(); drawList(); load(id, false);
  };
  const go = id => { const p = paneOf(id), row = document.getElementById('lv-row'); if (p && row) row.scrollTo({ left: p.offsetLeft, behavior: 'smooth' }); setActive(id, false); };
  const tick = () => {
    if (!ctx.alive()) return stop();
    const tn = now();
    document.querySelectorAll('#lv-list [data-te]').forEach(e => { const s = (Number(e.dataset.te) - tn) / 1000; e.textContent = mmss(s); const r = e.closest('[data-row]'); if (r) r.classList.toggle('low', s < 300); });
    document.querySelectorAll('#lv-list [data-tb]').forEach(e => { const [a, b] = e.dataset.tb.split('|').map(Number); e.style.width = Math.max(0, Math.min(100, (b - tn) * 100 / Math.max(1, b - a))) + '%'; });
    document.querySelectorAll('.lv-pane [data-open]').forEach(e => { const s = (Number(e.dataset.open) - tn) / 1000; e.textContent = s > 0 ? 'in ' + mmss(s) : 'now'; });
    document.querySelectorAll('.lv-pane [data-end]').forEach(e => { const s = (Number(e.dataset.end) - tn) / 1000; e.textContent = s > 0 ? 'in ' + mmss(s) : 'ended'; });
  };
  const csv = () => {
    const d = cur(); if (!d) return;
    const rowsC = [['Rank', 'Name', 'Mobile', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Minutes', 'Late', 'Submitted at'],
      ...list('done').map((x, i) => [i + 1, x.name, x.mobile, x.score, x.max, x.correct, x.wrong, x.skipped, Math.round(x.used / 60), x.late ? 'yes' : '', new Date(x.at).toLocaleString('en-IN')])];
    AX.u.download(String(titleOf(LV.id)).replace(/[^\w ]+/g, '') + '-live-results.csv', '﻿' + rowsC.map(r => r.map(cq).join(',')).join('\n'), 'text/csv;charset=utf-8');
    UI.toast('Downloaded');
  };
  AX.act(ctx.el, {
    retry: b => load((b && b.dataset.id) || LV.id, false),
    seg(b) { const id = b.dataset.id || LV.id; if (id !== LV.id) setActive(id, true); LV.seg = b.dataset.k; drawAll(); drawList(); },
    go: b => go(b.dataset.id),
    prev: () => { const i = ids.indexOf(LV.id); if (i > 0) go(ids[i - 1]); },
    next: () => { const i = ids.indexOf(LV.id); if (i < ids.length - 1) go(ids[i + 1]); },
    csv,
    async reset(b) {
      await UI.busy(b, async () => {
        const x = await AX.api.admin('student_devices_reset', { id: b.dataset.id });
        if (!x.ok) return UI.err(x);
        AX.cache.drop('students'); AX.emit('data:changed');
        UI.toast('Devices reset — student can sign in now');
      });
      load(LV.id, true);
    }
  });
  AX.act(ctx.el, { q: AX.u.debounce(el => { LV.q = el.value; rows(); }, 150) }, 'input');
  // a click on a board makes it the open one (computer: all boards are visible)
  ctx.el.querySelectorAll('.lv-pane').forEach(p => p.addEventListener('click', e => { if (!e.target.closest('[data-act]')) setActive(p.dataset.id, false); }));
  // swiping (phone) or scrolling the row picks the first visible board
  const row = document.getElementById('lv-row');
  row.addEventListener('scroll', AX.u.debounce(() => {
    const p = row.querySelector('.lv-pane'); if (!p || !ctx.alive()) return;
    const i = Math.max(0, Math.min(ids.length - 1, Math.round(row.scrollLeft / (p.offsetWidth + 14))));
    if (ids[i] !== LV.id) setActive(ids[i], false);
  }, 90), { passive: true });

  // Refresh: new numbers for every board, and the list of live tests read again
  LV.refreshFn = () => {
    Promise.all(ids.map(id => load(id, id !== LV.id))).then(() => { if (ctx.alive()) UI.toast('Numbers updated'); });
    if (!single) reread(true).then(n => { if (ctx.alive() && !sameSet(n, ids)) ctx.reload(); });
  };
  // first paint: what is cached (if fresh), then the numbers; the open board right away, the others one after another
  drawAll(); drawList();
  const first = [LV.id, ...ids.filter(i => i !== LV.id)];
  first.forEach((id, i) => { if (!AX.live.fresh(id, 20000)) setTimeout(() => { if (ctx.alive()) load(id, true); }, i * 250); });
  const p = paneOf(LV.id), r0 = document.getElementById('lv-row'); if (p && r0) r0.scrollLeft = p.offsetLeft;
  LV.timers.push(setInterval(() => {
    if (!ctx.alive()) return stop();
    if (document.hidden) return;
    ids.forEach(id => { const c = LV.cache.get(id); if (c && !isLive(id)) return; if (id === LV.id || !c || Date.now() - c.at > 55000) load(id, true); });
  }, 15000));
  LV.timers.push(setInterval(tick, 1000));
  const vis = () => { if (!ctx.alive()) return document.removeEventListener('visibilitychange', vis); const c = LV.cache.get(LV.id); if (!document.hidden && (!c || Date.now() - c.at > 15000)) load(LV.id, true); };
  document.addEventListener('visibilitychange', vis);
}

/* ---------- Series & history ---------- */
function historyTab(ctx, key) {
  const live = new Set(liveIds()), G = groups(), g = key ? G.find(x => x.key === key) : null;
  if (key && !g) { AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'layers', title: 'Series not found', text: 'It may have been deleted.', action: h`<a class="btn sm" href="#/live/history">All series</a>` })}</div>`); return; }
  if (!g) {
    if (!G.length) return AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'layers', title: 'No tests yet', text: 'Series and their tests show here once they exist.' })}</div>`);
    const last = ids => { const t = Math.max(0, ...ids.map(i => ms(metaOf(i).opens_at))); return t ? fmt.day(t) : ''; };
    AX.set(ctx.el, h`<div class="lv-sg">${join(G, s => h`<a class="card lv-sc-card" style="color:var(--tx)" href="#/live/history/${encodeURIComponent(s.key)}">
      <span class="lv-sci">${icon('layers', 20)}</span><div class="grow"><b class="ell">${s.title}</b><div class="xs mut ell">${fmt.plural(s.ids.length, 'test')}${last(s.ids) ? ' · latest ' + last(s.ids) : ''}</div></div>
      ${s.live ? h`<span class="pill ok"><span class="live-dot"></span> ${s.live} live</span>` : ''}${s.free ? UI.pill('Free') : ''}${icon('chevR', 16)}</a>`)}</div>`);
    return;
  }
  const ordered = g.ids.slice().sort((a, b) => {
    const sa = stateOf(a, live), sb = stateOf(b, live), rank = { live: 0, soon: 1, ended: 2, any: 3 }, ma = metaOf(a), mb = metaOf(b);
    if (sa !== sb) return rank[sa] - rank[sb];
    return sa === 'soon' ? ms(ma.opens_at) - ms(mb.opens_at) : (ms(mb.opens_at) - ms(ma.opens_at)) || (Number(ma.sort_order) || 0) - (Number(mb.sort_order) || 0);
  });
  const draw = () => {
    const q = LV.hq.trim().toLowerCase(), cnts = { all: ordered.length, live: 0, soon: 0, ended: 0, any: 0 };
    ordered.forEach(i => { cnts[stateOf(i, live)]++; });
    const L = ordered.filter(i => (LV.hf === 'all' || stateOf(i, live) === LV.hf) && (!q || String(metaOf(i).title || '').toLowerCase().includes(q)));
    const V = L.slice(0, LV.hn), ST = { live: ['Live', 'ok', 'live', '#10b981'], soon: ['Upcoming', 'info', 'calendar', '#6366f1'], ended: ['Ended', '', 'history', '#94a3b8'], any: ['Open any time', '', 'unlock', '#c9a45c'] };
    AX.set('#lv-hl', L.length ? h`<div class="card pad0 list">${join(V, i => { const m = metaOf(i), s = stateOf(i, live), o = ms(m.opens_at);
      return h`<a class="li click" href="#/live/${encodeURIComponent(i)}" style="color:var(--tx);text-decoration:none"><span class="av sm" style="--c:${ST[s][3]}">${icon(ST[s][2], 15)}</span>
        <div class="grow"><div class="t ell">${m.title || 'Test'}</div><div class="s ell">${o ? fmt.dt(o) : 'No fixed time'}${m.result_at ? ' · result ' + fmt.day(ms(m.result_at)) : ''}</div></div>
        ${s === 'live' ? h`<span class="pill ok"><span class="live-dot"></span> Live</span>` : UI.pill(ST[s][0], ST[s][1])}${icon('chevR', 16)}</a>`; })}</div>${L.length > V.length ? h`<div class="row center mt12"><button class="btn sm" data-act="more">Show ${Math.min(30, L.length - V.length)} more · ${L.length - V.length} left</button></div>` : ''}`
      : h`<div class="card">${UI.empty({ icon: 'search', title: q || LV.hf !== 'all' ? 'No test matches' : 'No tests here yet', text: q || LV.hf !== 'all' ? 'Try another word or filter.' : '' })}</div>`);
    AX.set('#lv-hf', join([['all', 'All'], ['live', 'Live'], ['soon', 'Upcoming'], ['ended', 'Ended']].filter(([k]) => k === 'all' || cnts[k]), ([k, t]) => h`<button type="button" class="chip ${LV.hf === k ? 'on' : ''}" data-act="hf" data-k="${k}">${t}<em>${cnts[k]}</em></button>`));
  };
  AX.set(ctx.el, h`<div class="row gap6 mb8"><a class="btn xs ghost" href="#/live/history">${icon('chevL', 14)} All series</a></div>
    <div class="lv-hh"><span class="lv-sci">${icon('layers', 20)}</span><div class="grow"><h3 class="ell">${g.title}</h3><div class="xs mut">${fmt.plural(g.ids.length, 'test')}${g.live ? ' · ' + g.live + ' live now' : ''}</div></div></div>
    <div class="lv-tools mt12"><div class="chips" id="lv-hf"></div><div class="inp-wrap search lv-q">${icon('search', 16)}<input class="inp sm" type="search" data-act="hq" placeholder="Search tests in this series" value="${LV.hq}" aria-label="Search tests"></div></div>
    <div id="lv-hl" class="mt12"></div>`);
  draw();
  AX.act(ctx.el, { hf(b) { LV.hf = b.dataset.k; LV.hn = 30; draw(); }, more() { LV.hn += 30; draw(); } });
  AX.act(ctx.el, { hq: AX.u.debounce(el => { LV.hq = el.value; LV.hn = 30; draw(); }, 150) }, 'input');
}

AX.css('live', `
.lv-rw{position:relative}
.lv-row{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;position:relative;-webkit-overflow-scrolling:touch;padding:2px 0 4px;overscroll-behavior-x:contain}
.lv-row::-webkit-scrollbar{display:none}
.lv-pane{flex:0 0 100%;min-width:0;scroll-snap-align:start;scroll-snap-stop:always;cursor:pointer}
@media (min-width:760px){.lv-row:not([data-c="1"]) .lv-pane{flex-basis:calc((100% - 14px)/2)}}
@media (min-width:1100px){.lv-row[data-c="1"] .lv-pane{flex-basis:100%}.lv-row[data-c="2"] .lv-pane{flex-basis:calc((100% - 14px)/2)}.lv-row:not([data-c="1"]):not([data-c="2"]) .lv-pane{flex-basis:calc((100% - 28px)/3)}}
.lv-dots{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px}
.lv-dotl{display:flex;gap:8px;align-items:center}
.lv-dot{width:9px;height:9px;padding:0;border-radius:50%;border:0;background:var(--line-2);transition:all .25s var(--ease)}
.lv-dot.on{width:24px;border-radius:5px;background:var(--pri)}
@media (min-width:1100px){.lv-dots[data-c="1"],.lv-dots[data-c="2"],.lv-dots[data-c="3"]{display:none}}
@media (min-width:760px) and (max-width:1099px){.lv-dots[data-c="1"],.lv-dots[data-c="2"]{display:none}}
@media (max-width:759px){.lv-dots[data-c="1"]{display:none}}
.lv-board{border-radius:var(--r-xl);padding:16px 16px 12px;height:100%;transition:border-color .2s,box-shadow .2s}
.lv-board.on{border-color:var(--pri-line);box-shadow:0 0 0 3px color-mix(in srgb,var(--pri) 12%,transparent)}
.lv-bh{display:flex;align-items:flex-start;gap:12px;min-width:0}
.lv-bh h3{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:-.015em}
.lv-ser{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--pri);margin-bottom:3px}
.lv-ser .ax-ic{flex:none}
.lv-cd{color:var(--pri);font-variant-numeric:tabular-nums}
.lv-now{flex:none}
.lv-e{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--bad)}
.lv-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
.lv-stat{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:10px 12px;border-radius:var(--r-lg);border:1px solid var(--line);background:color-mix(in srgb,var(--solid) 55%,transparent);text-align:left;min-width:0;transition:transform var(--fast),border-color var(--fast),background var(--fast)}
.lv-stat:hover{border-color:var(--line-2)}
.lv-stat .k-l{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--mut);min-width:0;max-width:100%}
.lv-stat .k-l span{min-width:0;line-height:1.3}
.lv-stat .k-v{font-family:var(--font-display);font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-top:2px;font-variant-numeric:lining-nums tabular-nums}
.lv-stat .k-f{font-size:11.5px;color:var(--faint);font-weight:650;min-height:15px}
.lv-stat.pri .k-l .ax-ic{color:var(--pri)}.lv-stat.ok .k-l .ax-ic{color:var(--ok)}.lv-stat.warn .k-l .ax-ic{color:var(--warn)}.lv-stat.mut .k-l .ax-ic{color:var(--mut)}
.lv-stat.on{border-color:var(--pri-line);background:var(--pri-soft)}
.lv-stat.on.ok{border-color:color-mix(in srgb,var(--ok) 40%,transparent);background:var(--ok-soft)}
.lv-stat.on.warn{border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:var(--warn-soft)}
.lv-stat.on.mut{border-color:var(--line-2);background:var(--hover)}
.lv-bar{display:flex;height:8px;border-radius:5px;background:var(--hover);overflow:hidden;margin-top:12px;border:1px solid var(--line)}
.lv-bar i{display:block;height:100%;transition:width .6s var(--ease)}
.lv-bar .done{background:var(--ok)}.lv-bar .writing{background:var(--grad-pri)}.lv-bar .expired{background:var(--warn)}
.lv-cap{margin-top:8px}
.lv-for{display:flex;align-items:center;gap:10px;font-size:14px;min-width:0}
.lv-for:empty{display:none}
.lv-fi{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri);flex:none}
.lv-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lv-segw{min-width:0;max-width:100%}
.lv-q{width:min(260px,100%);margin-left:auto}
.lv-sc{display:inline-grid;place-items:center;min-width:20px;height:18px;padding:0 5px;margin-left:4px;border-radius:9px;background:var(--hover);font-size:11px;font-weight:800}
.seg button.on .lv-sc{background:var(--pri-soft);color:var(--pri)}
.lv-list .li{gap:12px}
.lv-list .grow .s{white-space:normal}
.lv-tb{height:5px;border-radius:3px;background:var(--hover);overflow:hidden;margin-top:7px;max-width:320px}
.lv-tb i{display:block;height:100%;border-radius:3px;background:var(--grad-pri);transition:width 1s linear}
.lv-w.low .lv-tb i{background:var(--bad)}
.lv-left{display:flex;flex-direction:column;align-items:flex-end;flex:none;min-width:64px}
.lv-left b{font-size:17px;font-weight:800;letter-spacing:.01em}
.lv-w.low .lv-left b{color:var(--bad)}
.lv-rk{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;font-weight:800;font-size:12.5px;background:var(--hover);color:var(--tx-2);font-variant-numeric:tabular-nums}
.lv-sc2{display:flex;flex-direction:column;align-items:flex-end;flex:none;gap:2px}
.lv-p{font-size:12px;font-weight:800}.lv-p.ok{color:var(--ok)}.lv-p.warn{color:var(--warn)}.lv-p.bad{color:var(--bad)}
.lv-acts{display:flex;gap:8px;flex:none;align-items:center}
.t-bad{color:var(--bad)}
.lv-sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:12px}
.lv-sc-card{display:flex;align-items:center;gap:12px;color:var(--tx);text-decoration:none!important;padding:14px 16px;min-width:0;transition:transform var(--fast),border-color var(--fast)}
.lv-sc-card:hover{border-color:var(--pri-line);transform:translateY(-1px)}
.lv-sci{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:var(--pri-soft);color:var(--pri)}
.lv-hh{display:flex;align-items:center;gap:12px;min-width:0}
.lv-hh h3{font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:-.015em}
.mb8{margin-bottom:8px}
@media (max-width:759px){
  .lv-board{padding:14px 14px 10px}
  .lv-bh h3{font-size:18px}
  .lv-stat{padding:9px 11px}.lv-stat .k-v{font-size:24px}
  .lv-q{width:100%;margin-left:0}
  .lv-ww{flex-wrap:wrap}
  .lv-ww .lv-acts{width:100%;justify-content:flex-end;padding-left:42px}
  .lv-wa span,.lv-acts .btn span{display:inline}
}
`);
})();
