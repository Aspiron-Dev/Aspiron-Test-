/* =====================================================================
   Payments: one ledger for approved store orders + payments added by hand (students from before the store),
   the "Not recorded" helper (quick ₹250 / Free / Other…), add / edit / delete, CSV, revenue by month.
   Also provides AX.money (shared with Students: money per student) and AX.addPayment({studentId, paymentId}).
   Server: supabase_v29_payments.sql (cbt_admin_payments get/add/update/delete). Students: cbt_admin students.
   Store orders count by mobile, hand-added payments by student_id — always read fresh (AX.data.payments(force)).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;

/* ---------- shared money helper ---------- */
const PMETH = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', free: 'Free / friend', other: 'Other' };
const PSHORT = { upi: 'UPI', cash: 'Cash', bank: 'Bank', free: 'Free', other: 'Other' };
const z2 = n => String(n).padStart(2, '0');
const isoDay = t => { const d = new Date(t); return isNaN(d) ? '' : d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()); };
// 'YYYY-MM-DD' (as the server stores paid_on) → local midnight ms (never a day early in any time zone)
const dayMs = v => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v)); if (m) return new Date(+m[1], m[2] - 1, +m[3]).getTime(); const t = Date.parse(v); return isNaN(t) ? null : t; };
const payErr = r => r.error === 'missing' ? 'Run supabase_v29_payments.sql in Supabase first.' : r.error === 'amount' ? 'Enter a valid amount (0 to 10,00,000).' : r.error === 'date' ? 'Check the date (from 2020 up to today).' : r.error === 'student' ? 'Student not found.' : r.error === 'payment' ? 'This payment was already deleted.' : r.error === 'method' ? 'Choose how they paid.' : AX.errText(r);

// build an index from the payments response: money of each student, one row list for the ledger
function build(P, students) {
  const list = (P && P.ok && P.payments) || [], orders = (P && P.ok && P.orders) || [];
  const byId = new Map(), byMob = new Map(), stById = new Map(), stByMob = new Map();
  (students || []).forEach(s => { stById.set(s.id, s); stByMob.set(s.mobile, s); });
  list.forEach(p => { if (!byId.has(p.student_id)) byId.set(p.student_id, []); byId.get(p.student_id).push(p); });
  orders.forEach(o => { if (!byMob.has(o.mobile)) byMob.set(o.mobile, []); byMob.get(o.mobile).push(o); });
  const of = s => {
    if (!s) return { man: [], sto: [], total: 0, n: 0 };
    const man = byId.get(s.id) || [], sto = byMob.get(s.mobile) || [];
    const total = man.reduce((a, p) => a + (Number(p.amount) || 0), 0) + sto.reduce((a, o) => a + (Number(o.amount) || 0), 0);
    return { man, sto, total, n: man.length + sto.length };
  };
  const rows = () => [
    ...orders.map(o => { const s = stByMob.get(o.mobile); return { k: 'store', id: o.code, amount: Number(o.amount) || 0, at: dayMs(o.at), name: (s && s.name) || o.name || 'Buyer', mobile: o.mobile || '', sid: s && s.id, what: o.item_title || 'Store order', code: o.code }; }),
    ...list.map(p => { const s = stById.get(p.student_id); return { k: Number(p.amount) === 0 || p.method === 'free' ? 'free' : 'man', id: p.id, amount: Number(p.amount) || 0, at: dayMs(p.paid_on), name: p.name || (s && s.name) || 'Deleted student', mobile: p.mobile || (s && s.mobile) || '', sid: s ? s.id : null, what: PSHORT[p.method] || p.method || '', method: p.method, note: p.note || '', p }; })
  ].sort((a, b) => (b.at || 0) - (a.at || 0));
  return { ok: !!(P && P.ok), missing: !!(P && P.error === 'missing'), error: P && !P.ok ? P : null, list, orders, of, rows };
}
// fresh data: students + payments (force = read again from the server)
async function money(force) {
  const [S, P] = await Promise.all([AX.data.students(force), AX.can('payments') ? AX.data.payments(force) : Promise.resolve({ ok: false, error: 'forbidden' })]);
  return { S, P, students: (S.ok && S.students) || [], M: build(P, (S.ok && S.students) || []) };
}
const chip = (x) => h`<span class="pill ${x.k === 'store' ? 'info' : x.k === 'free' ? 'vio' : 'gold'}">${x.k === 'store' ? 'Store' : x.k === 'free' ? 'Free' : 'Added by you'}</span>`;
// money per day for the last n days (oldest first): [{t, label, full, value, count}] — rows from build().rows()
function daily(rows, n) {
  const out = [], t0 = new Date(); t0.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) { const a = new Date(t0); a.setDate(a.getDate() - i); const b = new Date(a); b.setDate(b.getDate() + 1); out.push({ t: +a, e: +b, label: i === 0 ? 'Today' : String(a.getDate()), full: a.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), value: 0, count: 0 }); }
  (rows || []).forEach(x => { if (!x.at || !x.amount) return; const d = out.find(y => x.at >= y.t && x.at < y.e); if (d) { d.value += x.amount; d.count++; } });
  out.forEach(d => { d.title = d.full + ': ' + fmt.inr(d.value) + ' · ' + fmt.plural(d.count, 'payment'); });
  return out;
}
AX.money = { PMETH, PSHORT, isoDay, dayMs, build, load: money, err: payErr, chip, daily };

/* ---------- module state ---------- */
const V = { seg: 'all', q: '', more: 0, ctx: null, D: null, day: null };
const SEGS = [['all', 'All'], ['store', 'Store'], ['man', 'Added by you'], ['free', 'Free'], ['none', 'Not recorded']];
const activeSt = L => L.filter(s => s.status !== 'pending');
const PAGE = 60;

AX.css('payments', `
.px-top{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:14px;margin-top:14px}
@media (max-width:900px){.px-top{grid-template-columns:minmax(0,1fr)}}
.px-kpis .kpi.btnk{cursor:pointer;border:1px solid var(--glass-brd);font:inherit}
.px-kpis .kpi.btnk:hover{transform:translateY(-2px);border-color:var(--pri-line)}
.px-kpis .kpi.btnk.on{border-color:var(--warn)}
.px-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:22px 0 14px}
.px-tools .search{flex:1;min-width:260px;max-width:380px}
.px-row{display:grid;grid-template-columns:38px minmax(0,1.4fr) minmax(0,1.6fr) 120px 110px 40px;gap:14px;align-items:center;padding:12px 16px;border-top:1px solid var(--line)}
.px-row:first-child{border-top:0}
.px-row.hd{background:var(--solid-2);font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:10px 16px}
.px-row .nm{font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.px-row button.nm{border:0;background:none;padding:0;text-align:left;color:var(--tx);cursor:pointer;font:inherit;font-weight:700;max-width:100%}
.px-row button.nm:hover{color:var(--pri)}
.px-row .amt{font-family:var(--font-display);font-weight:600;font-size:17px;text-align:right;font-variant-numeric:tabular-nums}
.px-row .amt.free{color:var(--vio);font-family:var(--font);font-size:13px;font-weight:800}
.px-row .det{display:flex;gap:6px;align-items:center;min-width:0;font-size:13px;color:var(--tx-2)}
.px-row .det>*{flex:none}
.px-row .det>.ell{flex:0 1 auto}
.px-row .det .mono{color:var(--mut);font-size:12px}
.px-row .dt{font-size:13px;color:var(--mut)}
.px-mdt{display:none}
.px-un button.nm{border:0;background:none;padding:0;text-align:left;color:var(--tx);cursor:pointer;font:inherit;font-weight:700}
.px-un button.nm:hover{color:var(--pri)}
.px-un{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
.px-un:first-child{border-top:0}
.px-un .acts{display:flex;gap:6px;margin-left:auto}
.px-legend{display:flex;flex-direction:column;gap:10px;font-size:13px}
.px-legend .r{display:flex;align-items:center;gap:10px}
.px-legend i{width:10px;height:10px;border-radius:3px;flex:none}
.px-legend b{margin-left:auto;font-variant-numeric:tabular-nums}
.px-pick{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.px-pick button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:12px;border:1px solid var(--line);background:var(--solid-2);text-align:left;color:var(--tx)}
.px-pick button:hover{border-color:var(--pri-line)}
.px-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
@media (max-width:759px){
  .px-row.hd{display:none}
  .px-row{grid-template-columns:32px minmax(0,1fr) auto;grid-template-areas:"av who amt" "av det ed";row-gap:4px;column-gap:12px;padding:12px 14px}
  .px-row>.pav{grid-area:av;align-self:start}
  .px-row>.who{grid-area:who}
  .px-row>.det{grid-area:det}
  .px-row>.dt{display:none}
  .px-row>.amt{grid-area:amt}
  .px-row>.ed{grid-area:ed;justify-self:end}
  .px-mdt{display:inline!important}
  .px-un .acts{margin-left:0;width:100%}
  .px-un .acts .btn{flex:1}
  .px-tools .search{max-width:none;min-width:0;flex-basis:100%}
}`);

AX.mod({
  id: 'payments', title: 'Payments', short: 'Payments', icon: 'wallet', group: 'People', order: 20, perm: 'payments',
  sub: 'Every payment: store orders you approved, and payments you add yourself.',
  async render(ctx) {
    V.ctx = ctx; V.more = 0;
    if (ctx.q.seg && SEGS.some(s => s[0] === ctx.q.seg)) V.seg = ctx.q.seg;
    const can = AX.can('payments', 'manage');
    ctx.head({ title: 'Payments', sub: 'Every payment: store orders you approved, and payments you add yourself — e.g. students who joined before the store.',
      actions: h`<button class="btn" data-act="csv">${icon('download', 16)} CSV</button>${can ? h`<button class="btn pri" data-act="add">${icon('plus', 17)} Add payment</button>` : ''}` });
    const ph = document.getElementById('ax-ph');
    if (ph) AX.act(ph, { csv: () => csv(), add: () => AX.addPayment({}) });
    AX.set(ctx.el, h`${UI.skeleton(4, 'kpi')}<div class="mt16">${UI.skeleton(6)}</div>`);
    const D = await money(true);
    if (!ctx.alive()) return;
    if (!D.S.ok) { AX.set(ctx.el, UI.errorBox(D.S)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    if (!D.P.ok && D.P.error !== 'missing') { AX.set(ctx.el, UI.errorBox(D.P, 'supabase_v29_payments.sql')); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    V.D = D;
    AX.set(ctx.el, h`${D.P.error === 'missing' ? h`<div class="callout warn" style="margin-bottom:14px">${icon('db')}<div><b>One-time setup needed to add payments</b><div class="sm mt4">Open Supabase → SQL Editor, paste <b>supabase_v29_payments.sql</b> and press Run once. Then refresh this page.</div></div></div>` : ''}
      <div id="px-top"></div>
      <div class="px-tools"><div class="chips" id="px-seg"></div><span class="grow"></span>
        <div class="inp-wrap search">${icon('search', 17)}<input class="inp" id="px-q" type="search" placeholder="Search name or mobile…" value="${V.q}" autocomplete="off" aria-label="Search payments"></div></div>
      <div id="px-list"></div>`);
    AX.act(ctx.el, {
      seg: el => { V.seg = el.dataset.v; V.more = 0; draw(); },
      pick: el => { const d = V.T && V.T.days[+el.dataset.pick]; if (!d) return; V.day = d.t; if (V.seg === 'none') V.seg = 'all'; V.more = 0; draw(); },
      dayAll: () => { V.day = null; V.more = 0; draw(); },
      none: () => { V.seg = 'none'; V.more = 0; draw(); document.getElementById('px-seg').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
      open: el => AX.openStudent ? AX.openStudent(el.dataset.sid) : AX.go('students/' + el.dataset.sid),
      order: el => AX.openOrder ? AX.openOrder(el.dataset.code) : AX.go('orders', { q: el.dataset.code }),
      edit: el => AX.addPayment({ paymentId: el.dataset.id }),
      quick: (el) => quick(el),
      other: el => AX.addPayment({ studentId: el.dataset.sid }),
      more: () => { V.more++; drawList(); },
      add: () => AX.addPayment({})
    });
    ctx.el.querySelector('#px-q').addEventListener('input', AX.u.debounce(e => { V.q = e.target.value; V.more = 0; drawList(); }, 120));
    draw();
  },
  async search(q) {
    if (q.length < 3 || !AX.can('payments')) return [];
    const c = AX.cache.peek('payments'); if (!c) return [];
    const P = await c; if (!P || !P.ok) return [];
    return (P.orders || []).filter(o => String(o.code).toLowerCase().includes(q)).slice(0, 4).map(o => ({ g: 'Payments', title: o.code + ' · ' + fmt.inr(o.amount), sub: (o.name || '') + ' · ' + (o.item_title || ''), icon: 'wallet', go: '#/payments?seg=store' }));
  }
});
AX.creates.push({ label: 'Payment', icon: 'wallet', perm: ['payments', 'manage'], run() { AX.addPayment({}); } });
AX.actions.push({ label: 'Export payments CSV', icon: 'download', perm: ['payments'], run() { csv(); } });
AX.actions.push({ label: 'Students with no payment recorded', icon: 'wallet', perm: ['payments'], run() { AX.go('payments', { seg: 'none' }); } });

// keep the open page in step with any change (store orders approved elsewhere, a payment added from a student…)
AX.on('data:changed', AX.u.debounce(async () => {
  const c = AX.current && AX.current();
  if (!c || c.mod !== 'payments' || !V.ctx || !V.ctx.alive() || !document.getElementById('px-list')) return;
  const D = await money(true);
  if (!V.ctx.alive() || !D.S.ok || !(D.P.ok || D.P.error === 'missing')) return;
  V.D = D; draw();
}, 250));

/* ---------- page ---------- */
function stats(D) {
  const R = D.M.rows(), m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const lm0 = new Date(m0); lm0.setMonth(lm0.getMonth() - 1);
  const sum = L => L.reduce((a, x) => a + (x.amount || 0), 0);
  const act = activeSt(D.students);
  const none = act.filter(s => !D.M.of(s).n);
  return { R, total: sum(R), month: sum(R.filter(x => x.at >= +m0)), last: sum(R.filter(x => x.at >= +lm0 && x.at < +m0)), act, paying: act.filter(s => D.M.of(s).total > 0).length, none,
    cnt: { all: R.length, store: R.filter(x => x.k === 'store').length, man: R.filter(x => x.k === 'man').length, free: R.filter(x => x.k === 'free').length, none: none.length },
    store: sum(R.filter(x => x.k === 'store')), man: sum(R.filter(x => x.k !== 'store')) };
}
function draw() {
  const D = V.D; if (!D) return;
  const T = V.T = stats(D);
  T.days = daily(T.R, 30);
  const si = V.day == null ? T.days.length - 1 : T.days.findIndex(d => d.t === V.day), sd = T.days[si < 0 ? T.days.length - 1 : si];
  const delta = T.last ? Math.round((T.month - T.last) * 100 / T.last) : null;
  const months = [];
  for (let i = 11; i >= 0; i--) { const a = new Date(); a.setDate(1); a.setHours(0, 0, 0, 0); a.setMonth(a.getMonth() - i); const b = new Date(a); b.setMonth(b.getMonth() + 1); months.push({ a: +a, b: +b, label: a.toLocaleDateString('en-IN', { month: 'short' }), full: a.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }); }
  const bars = months.map(m => { const v = T.R.filter(x => x.at >= m.a && x.at < m.b).reduce((s, x) => s + x.amount, 0); return { label: m.label, value: v, title: m.full + ': ' + fmt.inr(v), short: m.label + ' ' + String(new Date(m.a).getFullYear()).slice(2) + ' · ' + fmt.inr(v) }; });
  const best = bars.reduce((a, b) => b.value > a.value ? b : a, bars[0]);
  AX.set('#px-top', h`<div class="kpis px-kpis">
      ${UI.kpi({ label: 'Total collected', value: fmt.inr(T.total), icon: 'wallet', hero: true, foot: fmt.plural(T.R.length, 'payment') })}
      ${UI.kpi({ label: 'This month', value: fmt.inr(T.month), icon: 'calendar', tone: 'gold', delta, deltaUnit: '%', foot: delta == null ? new Date().toLocaleDateString('en-IN', { month: 'long' }) : 'vs ' + fmt.inr(T.last) + ' last month' })}
      ${UI.kpi({ label: 'Today', value: fmt.inr(T.days[T.days.length - 1].value), icon: 'clock', tone: 'info', foot: fmt.plural(T.days[T.days.length - 1].count, 'payment') + ' · ' + fmt.num(T.paying) + ' paying students' })}
      <button type="button" class="kpi glass warn btnk ${V.seg === 'none' ? 'on' : ''}" data-act="none"><div class="k-l">${icon('alert', 16)}<span>Not recorded</span></div><div class="k-v">${fmt.num(T.none.length)}</div><div class="k-f"><span>${T.none.length ? 'Add their old payments →' : 'Everyone has a payment'}</span></div></button>
    </div>
    <div class="card mt16"><div class="card-h">${icon('calendar')}<h3>Day by day · last 30 days</h3><span class="grow"></span><span class="sub">Tap a day</span></div>
      <div class="day-read"><span class="mut sm">${sd.full}</span><b>${fmt.inr(sd.value)}</b><span class="mut sm">${fmt.plural(sd.count, 'payment')}</span>${V.day != null ? h`<button class="btn xs ghost" data-act="dayAll">${icon('x', 13)} Show all days</button>` : ''}</div>
      ${UI.chart.bars(T.days, { money: true, height: 150, pick: true, sel: si < 0 ? T.days.length - 1 : si, label: 'Money received per day, last 30 days' })}</div>
    <div class="px-top">
      <div class="card"><div class="card-h">${icon('bars')}<h3>Revenue by month</h3><span class="grow"></span><span class="sub">${best && best.value ? 'Best · ' + best.short : 'Last 12 months'}</span></div>${UI.chart.bars(bars, { money: true, height: 160, label: 'Revenue by month' })}</div>
      <div class="card"><div class="card-h">${icon('chart')}<h3>Where it came from</h3></div>
        <div class="row gap16" style="align-items:center"><div style="width:120px;flex:none">${UI.chart.donut([{ label: 'Store', value: T.store, color: 'var(--info)' }, { label: 'Added by you', value: T.man, color: 'var(--gold)' }], { size: 120, center: fmt.short(T.total), sub: 'total ₹', label: 'Store vs added by you' })}</div>
        <div class="px-legend grow"><div class="r"><i style="background:var(--info)"></i>Store orders<b>${fmt.inr(T.store)}</b></div><div class="r"><i style="background:var(--gold)"></i>Added by you<b>${fmt.inr(T.man)}</b></div><div class="r xs mut"><i style="background:var(--vio)"></i>Free<b>${fmt.plural(T.cnt.free, 'student')}</b></div></div></div></div>
    </div>`);
  AX.set('#px-seg', join(SEGS, ([k, l]) => h`<button type="button" class="chip ${V.seg === k ? 'on' : ''} ${k === 'none' && T.cnt.none ? 'alert' : ''}" data-act="seg" data-v="${k}">${l}<em>${T.cnt[k]}</em></button>`));
  drawList();
}
function drawList() {
  const D = V.D, T = V.T, el = document.getElementById('px-list'); if (!D || !el) return;
  const q = V.q.trim().toLowerCase(), can = AX.can('payments', 'manage');
  const hit = (n, m) => !q || (String(n || '') + ' ' + String(m || '')).toLowerCase().includes(q);
  if (V.seg === 'none') {
    const L = T.none.filter(s => hit(s.name, s.mobile)).sort((a, b) => (a.created || 0) - (b.created || 0));
    const shown = L.slice(0, PAGE * (V.more + 1));
    return AX.set(el, L.length ? h`<div class="callout info" style="margin-bottom:12px">${icon('info')}<div class="sm">These students have no payment recorded yet — mostly students from before the store. ${can ? h`Tap an amount to add it. The date is the day their account was made; change it with <b>Other…</b>` : 'Ask someone with full Payments access to add them.'}</div></div>
      <div class="card pad0">${join(shown, s => h`<div class="px-un">${UI.avatar(s.name, s.id || s.mobile)}<div class="grow" style="min-width:150px"><button class="nm" data-act="open" data-sid="${s.id}">${s.name}</button><div class="xs mut">${fmt.mobile(s.mobile)}${s.created ? ' · joined ' + fmt.date(s.created) : ''}${s.status === 'blocked' ? ' · blocked' : ''}</div></div>
          ${can ? h`<div class="acts"><button class="btn sm soft" data-act="quick" data-sid="${s.id}" data-amt="250" data-busy="">₹250</button><button class="btn sm" data-act="quick" data-sid="${s.id}" data-amt="0" data-busy="">Free</button><button class="btn sm ghost" data-act="other" data-sid="${s.id}">Other…</button></div>` : ''}</div>`)}</div>
      ${L.length > shown.length ? h`<div class="row mt12" style="justify-content:center"><button class="btn sm" data-act="more">Show more (${L.length - shown.length})</button></div>` : ''}`
      : h`<div class="card">${UI.empty({ icon: 'checkCircle', title: q ? 'No student matches' : 'Every student has a payment recorded', text: q ? 'Try another name or number.' : 'Nice — nothing to add here.' })}</div>`);
  }
  const dayE = V.day != null ? V.day + 864e5 : null;
  const L = T.R.filter(x => (V.seg === 'all' || x.k === V.seg) && hit(x.name, x.mobile + ' ' + (x.code || '')) && (V.day == null || (x.at >= V.day && x.at < dayE)));
  const shown = L.slice(0, PAGE * (V.more + 1));
  AX.set(el, L.length ? h`<div class="card pad0"><div class="px-row hd"><span></span><span>Student</span><span>Details</span><span>Date</span><span style="text-align:right">Amount</span><span></span></div>
      ${join(shown, x => h`<div class="px-row ${x.k !== 'store' && can ? 'edit' : ''}">
        <span class="pav">${UI.avatar(x.name, x.sid || x.mobile, 'sm')}</span>
        <div class="who" style="min-width:0">${x.sid ? h`<button class="nm" data-act="open" data-sid="${x.sid}">${x.name}</button>` : h`<div class="nm">${x.name}</div>`}<div class="xs mut ell">${x.mobile ? fmt.mobile(x.mobile) : 'Account deleted'}<span class="px-mdt"> · ${x.at ? fmt.date(x.at) : '—'}</span></div></div>
        <div class="det">${chip(x)}<span class="ell">${x.what}</span>${x.code ? h`<button class="btn xs ghost mono" data-act="order" data-code="${x.code}" title="Open order">${x.code}</button>` : ''}${x.note ? h`<span class="xs mut ell" title="${x.note}">· ${x.note}</span>` : ''}</div>
        <span class="dt">${x.at ? fmt.date(x.at) : '—'}</span>
        <span class="amt ${x.amount ? '' : 'free'}">${x.amount ? fmt.inr(x.amount) : 'Free'}</span>
        <span class="ed">${x.k !== 'store' && can ? h`<button class="ibtn sm" data-act="edit" data-id="${x.id}" aria-label="Edit payment">${icon('edit', 16)}</button>` : ''}</span></div>`)}</div>
      ${L.length > shown.length ? h`<div class="row mt12" style="justify-content:center"><button class="btn sm" data-act="more">Show more (${L.length - shown.length})</button></div>` : ''}`
    : h`<div class="card">${UI.empty({ icon: 'wallet', title: q ? 'No payment matches your search' : 'No payments here yet', text: q ? 'Try another name, number or order code.' : V.seg === 'store' ? 'Store orders appear here as soon as you approve them in Orders.' : 'Add payments for students who paid you directly.', action: !q && can && V.seg !== 'store' ? h`<button class="btn pri sm" data-act="add">${icon('plus', 15)} Add payment</button>` : '' })}</div>`);
}

async function quick(btn) {
  const D = V.D, s = D && D.students.find(x => x.id === btn.dataset.sid); if (!s) return;
  const amount = Number(btn.dataset.amt);
  await UI.busy(btn, async () => {
    const r = await AX.api.call('cbt_admin_payments', 'add', { student_id: s.id, amount, method: amount ? 'upi' : 'free', paid_on: s.created ? isoDay(s.created) : '', note: 'Added later (before the store)' });
    if (!r.ok) return UI.toast(payErr(r), { tone: 'bad' });
    UI.toast((amount ? fmt.inr(amount) : 'Free') + ' added for ' + s.name);
    changed();
  });
}
function changed() { AX.cache.drop('payments'); AX.emit('data:changed', { what: 'payments' }); }

/* ---------- CSV (all payments, current data) ---------- */
async function csv() {
  const D = await money(true);
  if (!D.P.ok) return UI.err(D.P, 'supabase_v29_payments.sql');
  const R = D.M.rows();
  AX.u.csvDownload('payments.csv', [['Date', 'Name', 'Mobile', 'Amount', 'Type', 'Details', 'Note'], ...R.map(x => [x.at ? isoDay(x.at) : '', x.name, x.mobile, x.amount, x.k === 'store' ? 'Store' : x.k === 'free' ? 'Free' : 'Added', x.k === 'store' ? (x.what + ' · ' + x.code) : x.what, x.note || ''])]);
  UI.toast('Payments CSV downloaded');
}
AX.paymentsCsv = csv;

/* ---------- add / edit a payment: AX.addPayment({studentId, paymentId, onSaved}) ---------- */
AX.addPayment = async (o = {}) => {
  if (!AX.can('payments', 'manage')) return UI.toast('You can only view payments. Ask the owner for full Payments access.', { tone: 'warn' });
  const D = await money(false);
  if (!D.S.ok) return UI.err(D.S);
  if (!D.P.ok) return UI.err(D.P, 'supabase_v29_payments.sql');
  const p = o.paymentId ? D.M.list.find(x => x.id === o.paymentId) : null;
  if (o.paymentId && !p) return UI.toast('This payment was already deleted.', { tone: 'warn' });
  const all = activeSt(D.students);
  let sel = D.students.find(x => x.id === (o.studentId || (p && p.student_id))) || null;
  const on = p ? dayMs(p.paid_on) : sel && sel.created ? dayMs(isoDay(sel.created)) : dayMs(isoDay(Date.now()));
  const selHtml = s => s ? h`<div class="well row">${UI.avatar(s.name, s.id || s.mobile, 'sm')}<div class="grow"><b class="ell" style="display:block">${s.name}</b><div class="xs mut">${fmt.mobile(s.mobile)}${s.created ? ' · joined ' + fmt.date(s.created) : ''}</div></div>${!p ? h`<button type="button" class="btn xs ghost" data-act="change">Change</button>` : ''}</div>`
    : p ? h`<div class="well sm mut">${p.name || 'Deleted student'}</div>`
    : h`<div class="inp-wrap">${icon('search', 17)}<input class="inp" id="pf-q" type="search" placeholder="Type name or mobile…" autocomplete="off" aria-label="Find the student"></div><div class="px-pick" id="pf-res"></div>`;
  UI.modal({
    title: p ? 'Edit payment' : 'Add payment', sub: p ? 'Store orders cannot be edited here; this one was added by hand.' : 'For money a student paid you directly — for example before the store existed.',
    icon: h`<span class="pill gold" style="height:28px;width:28px;padding:0;justify-content:center">${icon('wallet', 15)}</span>`,
    body: h`<form id="pf" class="col gap16" autocomplete="off" onsubmit="return false">
      <div class="fld"><label>Student</label><div id="pf-sel">${selHtml(sel)}</div><div class="err" data-err="student"></div></div>
      <div class="fld"><label for="f-amount">Amount ₹</label><input class="inp" id="f-amount" name="amount" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 250" value="${p ? p.amount : ''}">
        <div class="px-quick">${join([250, 199, 299, 499], v => h`<button type="button" class="btn xs" data-act="amt" data-v="${v}">₹${v}</button>`)}<button type="button" class="btn xs" data-act="amt" data-v="0">Free (₹0)</button></div><div class="err" data-err="amount"></div></div>
      <div class="form-grid">
        ${UI.dtField({ name: 'paid_on', label: 'Date paid', value: on, time: false, clear: false, title: 'When did they pay?' })}
        ${AX.f.select({ name: 'method', label: 'How', value: p ? p.method : 'upi', options: Object.entries(PMETH).map(([value, label]) => ({ value, label })) })}
      </div>
      <div class="err" data-err="paid_on" style="margin-top:-10px"></div>
      ${AX.f.input({ name: 'note', label: 'Note (only for you)', value: p ? p.note : '', max: 300, placeholder: 'e.g. Paid in cash at the coaching' })}
    </form>`,
    foot: h`${p ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)} Delete</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} Save</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#pf'); UI.wire(f);
      const find = () => {
        const i = el.querySelector('#pf-q'), res = el.querySelector('#pf-res'); if (!i || !res) return;
        const q = i.value.trim().toLowerCase();
        const L = q.length < 2 ? [] : all.filter(s => s.mobile.includes(q.replace(/\D/g, '') || '\u0000') || String(s.name || '').toLowerCase().includes(q)).slice(0, 6);
        AX.set(res, L.length ? join(L, s => h`<button type="button" data-act="pick" data-id="${s.id}">${UI.avatar(s.name, s.id, 'sm')}<span class="grow"><b class="ell" style="display:block">${s.name}</b><span class="xs mut">${fmt.mobile(s.mobile)}</span></span><span class="xs" style="color:var(--pri);font-weight:700">Choose</span></button>`) : q.length >= 2 ? h`<div class="sm mut">No student found.</div>` : '');
      };
      el.addEventListener('input', e => { if (e.target.id === 'pf-q') find(); });
      AX.act(el, {
        change() { sel = null; AX.set(el.querySelector('#pf-sel'), selHtml(null)); setTimeout(() => { const i = el.querySelector('#pf-q'); if (i) i.focus(); }, 30); },
        pick(b) { sel = all.find(s => s.id === b.dataset.id); AX.set(el.querySelector('#pf-sel'), selHtml(sel)); AX.f.error(f, 'student', ''); if (sel && sel.created) UI.setDt(f.querySelector('.dtf'), dayMs(isoDay(sel.created))); },
        amt(b) { f.querySelector('[name=amount]').value = b.dataset.v; if (b.dataset.v === '0') f.querySelector('[name=method]').value = 'free'; else if (f.querySelector('[name=method]').value === 'free') f.querySelector('[name=method]').value = 'upi'; },
        async del() {
          const ok = await UI.confirm({ title: 'Delete this payment?', text: fmt.inr(p.amount) + ' · ' + fmt.date(dayMs(p.paid_on)) + ' · ' + (p.name || 'Student') + '. Totals update at once.', yes: 'Delete', tone: 'danger' });
          if (!ok) return;
          const r = await AX.api.call('cbt_admin_payments', 'delete', { id: p.id });
          if (!r.ok) return UI.toast(payErr(r), { tone: 'bad' });
          close(); UI.toast('Payment deleted'); changed(); if (o.onSaved) o.onSaved();
        },
        async save(btn) {
          AX.f.clearErrors(f); AX.f.error(f, 'student', ''); const ep = el.querySelector('[data-err=paid_on]'); ep.textContent = '';
          const d = AX.f.read(f);
          if (!p && !sel) { el.querySelector('[data-err=student]').textContent = 'Choose the student'; const i = el.querySelector('#pf-q'); if (i) i.focus(); return; }
          const amount = String(d.amount).trim() === '' ? NaN : Number(d.amount);
          if (!(Number.isInteger(amount) && amount >= 0 && amount <= 1000000)) return AX.f.error(f, 'amount', 'Enter the amount in whole rupees (0 for free)');
          const end = new Date(); end.setHours(23, 59, 59, 999);
          if (!d.paid_on) { ep.textContent = 'Choose the date'; return; }
          if (d.paid_on > +end) { ep.textContent = 'The date cannot be in the future'; return; }
          if (d.paid_on < new Date(2020, 0, 1).getTime()) { ep.textContent = 'The date must be after 1 Jan 2020'; return; }
          const data = { amount, paid_on: isoDay(d.paid_on), method: amount === 0 ? 'free' : d.method, note: String(d.note || '').trim() };
          await UI.busy(btn, async () => {
            const r = p ? await AX.api.call('cbt_admin_payments', 'update', Object.assign({ id: p.id }, data)) : await AX.api.call('cbt_admin_payments', 'add', Object.assign({ student_id: sel.id }, data));
            if (!r.ok) { if (r.error === 'amount') return AX.f.error(f, 'amount', payErr(r)); if (r.error === 'date') { ep.textContent = payErr(r); return; } return UI.toast(payErr(r), { tone: 'bad' }); }
            close(); UI.toast(p ? 'Payment saved' : (amount ? fmt.inr(amount) : 'Free') + ' added for ' + sel.name); changed(); if (o.onSaved) o.onSaved();
          });
        }
      });
      if (!sel && !p) setTimeout(() => { const i = el.querySelector('#pf-q'); if (i && !UI.isPhone()) i.focus(); }, 80);
    }
  });
};
})();
