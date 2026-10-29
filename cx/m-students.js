/* =====================================================================
   Students: directory (KPIs, segments, search, sort, batch filter, bulk access), access requests (approve / reject,
   one by one or many), add students (one or many) with the exact access-code message, CSV exports and the
   student 360° drawer (AX.openStudent): overview, series access, results, payments, devices, account.
   Server: cbt_admin (students, student_add/approve/code/block/devices_reset/update/delete, grant, results,
   result_delete), cbt_admin2 students_export, cbt_admin_payments get (money), cbt_admin_cheat (suspension).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const CFG = AX.cfg || {};
const DAY = 864e5, PAGE = 80;
const V = { s: 'all', q: '', o: 'new', b: 'all', more: 0, sel: new Set(), rsel: new Set(), ctx: null, D: null, tab: 'all' };
let DR = null;   // the open 360 drawer: {api, id, tab}

/* ---------- helpers ---------- */
const nameOf = s => String((s && s.name) || '').trim() || 'Unnamed';
const first = s => nameOf(s).split(' ')[0];
const pct = r => r.max ? Math.round(r.score * 100 / r.max) : 0;
const tone = p => p >= 60 ? 'ok' : p >= 35 ? 'warn' : 'bad';
const seenCls = s => !s.last_seen ? 'never' : Date.now() - s.last_seen < 15 * 60e3 ? 'live' : Date.now() - s.last_seen < DAY ? 'today' : Date.now() - s.last_seen < 7 * DAY ? 'week' : 'old';
const seenTxt = s => !s.last_seen ? 'Never opened' : seenCls(s) === 'live' ? 'Online now' : 'Seen ' + fmt.ago(s.last_seen);
const fmtCode = c => String(c || '').slice(0, 4) + '-' + String(c || '').slice(4);
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const stuLink = () => /^https:\/\//.test(CFG.SHORT_URL || '') ? CFG.SHORT_URL : siteUrl();
// the message sent to a student with their login (cx/amsg.js: per test series when a series is unlocked)
const stuMsg = o => AX.amsg.make(o);
AX.stuMsg = stuMsg;
const msgHtml = m => raw(AX.esc(m).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>'));
const remindMsg = s => `Hi ${first(s)}, a new test is waiting for you. Open ${stuLink()} and attempt it today. All the best! 💪`;

/* ---------- data ---------- */
async function load(force) {
  const canR = AX.can('results'), canP = AX.can('payments');
  const [S, C, R, P] = await Promise.all([
    AX.data.students(force), AX.data.catalog(),
    canR ? AX.data.results() : Promise.resolve({ ok: false, error: 'forbidden' }),
    canP ? AX.data.payments(force) : Promise.resolve({ ok: false, error: 'forbidden' })
  ]);
  if (!S.ok) return { ok: false, r: S };
  const students = S.students || [];
  const series = (C.ok && C.series) || [];
  const paid = series.filter(x => !x.is_free);
  const paidSet = new Set(paid.map(x => x.id));
  const perf = new Map(), byMob = new Map();
  ((R.ok && R.results) || []).forEach(r => {
    if (!byMob.has(r.mobile)) byMob.set(r.mobile, []); byMob.get(r.mobile).push(r);
    const p = perf.get(r.mobile) || { n: 0, sum: 0, best: -Infinity, last: 0 }, x = pct(r);
    p.n++; p.sum += x; p.best = Math.max(p.best, x); if (r.at > p.last) { p.last = r.at; p.lt = r.title; p.lp = x; }
    perf.set(r.mobile, p);
  });
  perf.forEach(p => { p.avg = Math.round(p.sum / p.n); });
  byMob.forEach(l => l.sort((a, b) => b.at - a.at));
  const M = AX.money ? AX.money.build(P, students) : null;
  V.D = { students, series, paid, paidSet, perf, results: byMob, resultsOk: !!R.ok, M, payOk: !!P.ok, payMissing: P.error === 'missing', at: Date.now() };
  return { ok: true };
}
const isPaid = s => (s.access || []).some(id => V.D.paidSet.has(id));
const money = s => V.D && V.D.M && V.D.payOk ? V.D.M.of(s) : null;
const SEGS = [['all', 'All'], ['today', 'Active today'], ['active', 'Active 7d'], ['inactive', 'Inactive'], ['new', 'New'], ['paid', 'Paid'], ['free', 'Free'], ['blocked', 'Blocked']];
function segTest(k, s) {
  const now = Date.now();
  switch (k) {
    case 'today': return s.last_seen && now - s.last_seen < DAY;
    case 'active': return s.last_seen && now - s.last_seen < 7 * DAY;
    case 'inactive': return s.status !== 'blocked' && (!s.last_seen || now - s.last_seen >= 7 * DAY);
    case 'new': return s.created && now - s.created < 7 * DAY;
    case 'paid': return isPaid(s);
    case 'free': return !isPaid(s);
    case 'blocked': return s.status === 'blocked';
    default: return true;
  }
}
const members = () => V.D.students.filter(s => s.status !== 'pending');
const pending = () => V.D.students.filter(s => s.status === 'pending').sort((a, b) => (b.created || 0) - (a.created || 0));
function shown() {
  const q = V.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  let L = members().filter(s => segTest(V.s, s) && (V.b === 'all' || (s.access || []).includes(V.b)) && (!q || nameOf(s).toLowerCase().includes(q) || (qd && String(s.mobile).includes(qd))));
  const P = V.D.perf, avg = (s, d) => { const p = P.get(s.mobile); return p ? p.avg : d; };
  const cmp = {
    new: (a, b) => (b.created || 0) - (a.created || 0), name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
    seen: (a, b) => (b.last_seen || 0) - (a.last_seen || 0), tests: (a, b) => (b.attempts || 0) - (a.attempts || 0),
    hi: (a, b) => avg(b, -1) - avg(a, -1), lo: (a, b) => avg(a, 999) - avg(b, 999),
    money: (a, b) => ((money(b) || {}).total || 0) - ((money(a) || {}).total || 0)
  }[V.o] || ((a, b) => 0);
  return L.sort(cmp);
}
// after a change: drop what changed, tell everyone (the listener below reloads and redraws)
function changed(what) { AX.cache.drop('students'); if (what) [].concat(what).forEach(k => AX.cache.drop(k)); AX.emit('data:changed', { what: 'students' }); }
async function act(action, data) { const r = await AX.api.admin(action, data); if (!r.ok) UI.err(r); return r; }

/* ---------- CSS ---------- */
AX.css('students', `
.sx-k{grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}
.sx-k .kpi .k-l span,.sx-k .kpi .k-f span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sx-k .kpi{padding:14px 14px 12px}
.sx-k .kpi .k-v{font-size:27px}
.sx-k .kpi.btnk{cursor:pointer;font:inherit;border:1px solid var(--glass-brd)}
.sx-k .kpi.btnk:hover{transform:translateY(-2px);border-color:var(--pri-line);text-decoration:none}
.sx-k .kpi.btnk.on{border-color:var(--pri);box-shadow:0 0 0 3px var(--pri-soft),var(--shadow)}
@media (max-width:1440px){.sx-k{grid-template-columns:repeat(4,minmax(0,1fr))}.sx-k .kpi.hero{grid-column:span 2}}
@media (max-width:759px){.sx-k{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sx-k .kpi.hero{grid-column:1/-1}.sx-k .kpi .k-v{font-size:24px}.sx-k .kpi .k-f{display:none}.sx-k .kpi.hero .k-f{display:flex}}
.sx-req{display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px 16px;border-radius:var(--r-lg);border:1px solid color-mix(in srgb,var(--gold) 40%,transparent);background:var(--gold-soft);color:var(--tx);text-decoration:none!important}
.sx-req:hover{border-color:var(--gold)}
.sx-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:18px 0 12px}
.sx-tools .search{flex:1 1 260px;min-width:0}
.sx-tools select.inp{width:auto;min-width:0;max-width:220px}
.sx-lh{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:12.5px;color:var(--mut);min-height:28px}
.sx-row{display:grid;grid-template-columns:26px minmax(0,2.1fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.5fr) 112px 76px;gap:14px;align-items:center;padding:11px 16px;border-top:1px solid var(--line);cursor:pointer;transition:background var(--fast)}
.sx-row:first-child{border-top:0}
.sx-row:hover{background:var(--hover)}
.sx-row.on{background:var(--pri-soft)}
.sx-row.hd{cursor:default;background:var(--solid-2);font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:10px 16px}
.sx-row.hd:hover{background:var(--solid-2)}
.sx-row input[type=checkbox],.sx-rq input[type=checkbox],.sx-lh input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:var(--pri-2);cursor:pointer}
.sx-stu{display:flex;align-items:center;gap:12px;min-width:0}
.sx-avw{position:relative;flex:none}
.sx-avw .sd{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;border:2px solid var(--solid);background:var(--faint)}
.sx-avw .sd.live{background:var(--ok)}.sx-avw .sd.today{background:var(--pri)}.sx-avw .sd.week{background:var(--gold)}.sx-avw .sd.never{display:none}
.sx-nm{font-weight:700;display:flex;align-items:center;gap:6px;min-width:0}
.sx-nm .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sx-nm .pill{height:19px;font-size:10.5px;padding:0 7px}
.sx-sub{font-size:12.5px;color:var(--mut)}
.sx-act{font-size:13px;min-width:0}
.sx-act .live{color:var(--ok);font-weight:700}
.sx-sc{min-width:0;white-space:nowrap}
@media (max-width:1400px) and (min-width:760px){.sx-best{display:none}}
.sx-sc .bar-meter{height:6px;margin-top:5px;max-width:120px}
.sx-sc .bar-meter i{background:var(--c)}
.sx-acc{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.sx-ac{display:inline-flex;align-items:center;gap:4px;height:24px;max-width:100%;padding:0 9px;border-radius:999px;border:1px dashed var(--line-2);background:transparent;color:var(--mut);font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sx-ac.on{border-style:solid;border-color:transparent;background:var(--ok-soft);color:var(--ok)}
button.sx-ac:hover{border-color:var(--pri);color:var(--pri)}
button.sx-ac.on:hover{background:var(--bad-soft);color:var(--bad)}
.sx-ac .ax-ic{width:12px;height:12px;stroke-width:2.4}
.sx-pay{justify-self:start}
.sx-ops{display:flex;gap:2px;justify-content:flex-end}
.sx-bulk{position:sticky;bottom:16px;z-index:20;margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px 10px 16px;border-radius:18px;background:var(--glass-2);border:1px solid var(--pri-line);box-shadow:var(--shadow-pop);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
.sx-bulk select.inp{width:auto;max-width:200px}
.sx-rq{display:flex;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
.sx-rq:first-child{border-top:0}
.sx-rq .ops{display:flex;gap:6px;margin-left:auto}
/* 360 drawer */
.s3-hd{display:flex;gap:14px;align-items:flex-start;min-width:0}
.s3-hd h2{font-family:var(--font-display);font-size:23px;font-weight:600;letter-spacing:-.01em}
.s3-ct{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.s3-tabs{position:sticky;top:-18px;z-index:3;display:flex;gap:2px;margin:-18px -20px 18px;padding:6px 14px 0;background:var(--solid);border-bottom:1px solid var(--line)}
.s3-tabs button{display:flex;align-items:center;gap:7px;height:42px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--mut);font-weight:700;font-size:13.5px;margin-bottom:-1px;white-space:nowrap}
.s3-tabs button:hover{color:var(--tx)}
.s3-tabs button.on{color:var(--tx);border-bottom-color:var(--pri)}
.s3-tabs button em{font-style:normal;font-size:10.5px;font-weight:800;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--hover);display:grid;place-items:center}
.s3-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.s3-tile{border-radius:14px;background:var(--solid-2);border:1px solid var(--line);padding:12px 14px;min-width:0}
.s3-tile .l{font-size:11.5px;font-weight:700;color:var(--mut)}
.s3-tile .v{font-family:var(--font-display);font-size:24px;font-weight:600;margin-top:4px;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.s3-tile .v.sm{font-family:var(--font);font-size:15px;font-weight:700;margin-top:8px}
.s3-li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line);min-width:0}
.s3-li:first-child{border-top:0}
.s3-amt{font-family:var(--font-display);font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.s3-step{display:inline-flex;align-items:center;gap:6px}
.s3-step b{min-width:42px;text-align:center;font-family:var(--font-display);font-size:24px}
.s3-dz{border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);background:color-mix(in srgb,var(--bad-soft) 50%,transparent)}
.s3-msg{white-space:pre-wrap;font-size:13px;line-height:1.55;max-height:220px;overflow:auto}
@media (max-width:759px){
  .sx-hp{display:none!important}
  .sx-tools .search{flex-basis:100%}
  .sx-tools select.inp{flex:1;max-width:none}
  .sx-row.hd{display:none}
  .sx-row{grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"ck stu pay" "ck act sc" "ck acc acc";row-gap:8px;column-gap:12px;padding:13px 14px}
  .sx-row>.ck{grid-area:ck;align-self:start;padding-top:10px}
  .sx-row>.sx-stu{grid-area:stu}.sx-row>.sx-act{grid-area:act}.sx-row>.sx-sc{grid-area:sc;justify-self:end;text-align:right}
  .sx-row>.sx-acc{grid-area:acc}.sx-row>.sx-pay{grid-area:pay;justify-self:end;align-self:start;margin-top:4px}.sx-row>.sx-ops{display:none}
  .sx-row>.sx-acc:empty{display:none}
  .sx-sc .bar-meter{display:none}
  .sx-bulk{bottom:calc(86px + env(safe-area-inset-bottom));padding:10px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .sx-bulk>b{order:0;align-self:center}
  .sx-bulk>[data-act=clear]{order:1;justify-self:end}
  .sx-bulk select.inp{order:2;grid-column:1/-1;max-width:none;width:100%}
  .sx-bulk>[data-act=bulk]{order:3}
  .sx-bulk>[data-act=copyNums],.sx-bulk>[data-act=selCsv]{order:4}
  .sx-rq .ops{margin-left:0;width:100%}.sx-rq .ops .btn{flex:1}
  .s3-tabs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));padding:4px 6px 0;margin:-18px -20px 16px}
  .s3-tabs button{flex-direction:column;gap:2px;height:52px;padding:0 2px;font-size:10.5px}
  .s3-tabs button em{display:none}
  .s3-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .s3-hd h2{font-size:20px}
  .s3-hd{gap:12px}
  .s3-hd>.av.lg{width:44px;height:44px;border-radius:14px;font-size:17px}
  .s3-ct{gap:4px}
  .s3-ct .ibtn.sm{width:30px;height:30px}
}`);

/* ---------- module ---------- */
AX.mod({
  id: 'students', title: 'Students', short: 'Students', icon: 'users', group: 'People', order: 10, perm: 'students',
  sub: 'Everyone who can use the test series: access, codes, devices, results and payments.',
  async render(ctx) {
    V.ctx = ctx; V.more = 0;
    const sub = ctx.parts[0] || '';
    V.tab = sub === 'requests' ? 'requests' : 'all';
    if (ctx.q.s && SEGS.some(x => x[0] === ctx.q.s)) V.s = ctx.q.s;
    if (ctx.q.q != null) V.q = ctx.q.q;
    head(ctx);
    AX.set(ctx.el, h`${UI.skeleton(7, 'kpi')}<div class="mt16">${UI.skeleton(7)}</div>`);
    const r = await load(true);
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, UI.errorBox(r.r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    head(ctx);
    wire(ctx);
    if (V.tab === 'requests') drawRequests(); else drawDirectory();
    if (sub && sub !== 'requests') openStudent(sub, ctx.q.tab);
  },
  async search(q) {
    const r = await AX.data.students(); if (!r.ok) return [];
    const qd = q.replace(/\D/g, '');
    return (r.students || []).filter(s => nameOf(s).toLowerCase().includes(q) || (qd.length >= 3 && String(s.mobile).includes(qd))).slice(0, 8)
      .map(s => ({ g: 'Students', title: nameOf(s), sub: fmt.mobile(s.mobile) + ' · ' + seenTxt(s), icon: 'user', go: '#/students/' + s.id, tag: s.status === 'pending' ? 'Request' : s.status === 'blocked' ? 'Blocked' : '', tone: s.status === 'pending' ? 'gold' : 'bad' }));
  },
  async attention() {
    const r = await AX.data.students(); if (!r.ok) return [];
    const n = (r.students || []).filter(s => s.status === 'pending').length;
    return n ? [{ title: fmt.plural(n, 'access request'), sub: 'Students waiting to join', count: n, go: '#/students/requests', icon: 'userPlus', tone: 'gold', badge: true }] : [];
  }
});
AX.creates.push({ label: 'Student', icon: 'userPlus', perm: ['students', 'manage'], run() { addStudent(); } });
AX.actions.push({ label: 'Export students CSV', icon: 'download', perm: ['students'], run() { exportCsv(); } });
AX.actions.push({ label: 'New access code for a student', icon: 'key', perm: ['students', 'manage'], run() { codeFor(); } });
AX.actions.push({ label: 'Access requests', icon: 'userPlus', perm: ['students'], run() { AX.go('students/requests'); } });

// keep the page and the open 360 drawer in step with every change, from any module
AX.on('data:changed', AX.u.debounce(async () => {
  const c = AX.current && AX.current();
  const page = c && c.mod === 'students' && V.ctx && V.ctx.alive() && document.getElementById('sx-body');
  if (!page && !DR) return;
  const r = await load(true);
  if (!r.ok) return;
  if (page && V.ctx.alive()) { head(V.ctx); if (V.tab === 'requests') drawRequests(); else drawDirectory(true); }
  if (DR) drawDrawer();
}, 200));

function head(ctx) {
  const can = AX.can('students', 'manage'), D = V.D;
  const n = D ? members().length : null, req = D ? pending().length : 0;
  const tot = D && D.payOk ? D.M.rows().reduce((a, x) => a + x.amount, 0) : null;
  ctx.head({ title: 'Students', sub: D ? fmt.plural(n, 'student') + (tot != null ? ' · ' + fmt.inr(tot) + ' collected' : '') + (req ? ' · ' + fmt.plural(req, 'request') + ' waiting' : '') : 'Everyone who can use the test series.',
    tabs: [{ id: 'all', title: 'Directory', icon: 'users', href: '#/students' }, { id: 'requests', title: 'Access requests', icon: 'userPlus', count: req }], tab: V.tab,
    actions: h`<button class="btn" data-act="exp">${icon('download', 16)} Export</button>${AX.can('payments') ? h`<a class="btn sx-hp" href="#/payments">${icon('wallet', 16)} Payments</a>` : ''}${can ? h`<button class="btn pri" data-act="add">${icon('userPlus', 17)} Add student</button>` : ''}` });
  const ph = document.getElementById('ax-ph');
  if (ph && !ph.__sx) {
    ph.__sx = 1;
    AX.act(ph, {
      add: () => addStudent(),
      exp: el => UI.menu(el, [{ head: 'Download' }, { label: 'All students (CSV)', icon: 'users', fn: exportCsv },
        V.sel.size ? { label: 'Selected students (' + V.sel.size + ')', icon: 'check', fn: selCsv } : null,
        AX.can('payments') ? { label: 'Payments (CSV)', icon: 'wallet', fn: () => AX.paymentsCsv ? AX.paymentsCsv() : AX.go('payments') } : null])
    });
  }
}

/* ---------- page wiring (one listener per page body) ---------- */
function wire(ctx) {
  const el = ctx.el;
  AX.set(el, h`<div id="sx-body"></div>`);
  AX.act(el, {
    seg: b => { V.s = b.dataset.v; V.more = 0; drawDirectory(); },
    open: (b, ev) => { if (ev.target.closest('a,input,button:not([data-act=open])')) return; openStudent(b.dataset.id); },
    noop: () => {},
    sel: b => { b.checked ? V.sel.add(b.dataset.id) : V.sel.delete(b.dataset.id); drawList(); },
    selAll: b => { const L = shown().slice(0, PAGE * (V.more + 1)); if (b.checked) L.forEach(s => V.sel.add(s.id)); else L.forEach(s => V.sel.delete(s.id)); drawList(); },
    clear: () => { V.sel.clear(); drawList(); },
    acc: b => toggleAccess(b.dataset.id, b.dataset.ser, b),
    more: () => { V.more++; drawList(); },
    bulk: b => bulkAccess(b.dataset.on === '1', b),
    copyNums: async () => { const l = V.D.students.filter(s => V.sel.has(s.id)).map(s => s.mobile); if (await AX.u.copy(l.join(', '))) UI.toast(fmt.plural(l.length, 'number') + ' copied'); },
    selCsv: () => selCsv(),
    reset: () => { V.s = 'all'; V.q = ''; V.b = 'all'; V.more = 0; drawDirectory(); },
    add: () => addStudent(),
    // requests
    approve: b => approve(b.dataset.id, b),
    reject: b => reject([b.dataset.id]),
    rsel: b => { b.checked ? V.rsel.add(b.dataset.id) : V.rsel.delete(b.dataset.id); drawRequests(); },
    rselAll: b => { pending().forEach(s => b.checked ? V.rsel.add(s.id) : V.rsel.delete(s.id)); drawRequests(); },
    approveMany: b => approveMany(b.dataset.all ? pending().map(s => s.id) : [...V.rsel], b),
    rejectMany: () => reject([...V.rsel])
  });
  el.addEventListener('input', AX.u.debounce(e => { if (e.target.id === 'sx-q') { V.q = e.target.value; V.more = 0; drawList(); drawSegs(); } }, 120));
  el.addEventListener('change', e => {
    if (e.target.id === 'sx-o') { V.o = e.target.value; drawList(); }
    if (e.target.id === 'sx-b') { V.b = e.target.value; V.more = 0; drawList(); drawSegs(); }
  });
}

/* ---------- directory ---------- */
function counts() {
  const L = members(), c = {};
  SEGS.forEach(([k]) => { c[k] = L.filter(s => segTest(k, s)).length; });
  return c;
}
function kbtn(o) {
  return h`<button type="button" class="kpi glass btnk ${o.tone || ''} ${o.hero ? 'hero' : ''} ${o.on ? 'on' : ''}" ${o.href ? '' : raw('data-act="seg"')} data-v="${o.v || ''}"><div class="k-l">${icon(o.icon, 16)}<span>${o.label}</span></div><div class="k-v">${o.value}</div><div class="k-f"><span>${o.foot || ''}</span></div></button>`;
}
function drawDirectory(keepTools) {
  const body = document.getElementById('sx-body'); if (!body) return;
  const D = V.D, c = counts(), req = pending().length;
  if (!keepTools || !document.getElementById('sx-q')) {
    AX.set(body, h`<div class="kpis sx-k" id="sx-k"></div><div id="sx-rq"></div>
      <div class="sx-tools"><div class="inp-wrap search">${icon('search', 17)}<input class="inp" id="sx-q" type="search" value="${V.q}" placeholder="Search name or mobile…" autocomplete="off" aria-label="Search students"></div>
        <select class="inp" id="sx-o" aria-label="Sort">${join([['new', 'Newest first'], ['name', 'Name A–Z'], ['seen', 'Last seen'], ['tests', 'Most tests'], ['hi', 'Highest score'], ['lo', 'Lowest score']].concat(D.payOk ? [['money', 'Paid the most']] : []), ([v, l]) => h`<option value="${v}" ${V.o === v ? raw('selected') : ''}>${l}</option>`)}</select>
        ${D.paid.length ? h`<select class="inp" id="sx-b" aria-label="Batch"><option value="all">All batches</option>${join(D.paid, x => h`<option value="${x.id}" ${V.b === x.id ? raw('selected') : ''}>${x.title} (${members().filter(s => (s.access || []).includes(x.id)).length})</option>`)}</select>` : ''}</div>
      <div class="chips" id="sx-seg" style="margin-bottom:14px"></div>
      <div id="sx-list"></div>`);
    const q = document.getElementById('sx-q');
    if (q && !UI.isPhone() && !UI.top()) setTimeout(() => { if (document.activeElement === document.body) q.focus({ preventScroll: true }); }, 30);
  }
  AX.set('#sx-k', h`${kbtn({ label: 'Students', value: fmt.num(c.all), icon: 'users', hero: true, v: 'all', on: V.s === 'all', foot: c.new ? '+' + c.new + ' this week' : 'none new this week' })}
    ${kbtn({ label: 'Active today', value: fmt.num(c.today), icon: 'live', tone: 'info', v: 'today', on: V.s === 'today', foot: AX.fmt.pct(c.today, c.all) + ' of all' })}
    ${kbtn({ label: 'Active 7d', value: fmt.num(c.active), icon: 'activity', v: 'active', on: V.s === 'active', foot: AX.fmt.pct(c.active, c.all) + ' of all' })}
    ${kbtn({ label: 'Paid', value: fmt.num(c.paid), icon: 'crown', tone: 'gold', v: 'paid', on: V.s === 'paid', foot: AX.fmt.pct(c.paid, c.all) + ' of all' })}
    ${kbtn({ label: 'Inactive 7d+', value: fmt.num(c.inactive), icon: 'clock', tone: 'warn', v: 'inactive', on: V.s === 'inactive', foot: 'send a reminder' })}
    ${kbtn({ label: 'Blocked', value: fmt.num(c.blocked), icon: 'ban', tone: 'bad', v: 'blocked', on: V.s === 'blocked', foot: 'cannot sign in' })}
    <a class="kpi glass vio" href="#/students/requests"><div class="k-l">${icon('userPlus', 16)}<span>Requests</span></div><div class="k-v">${fmt.num(req)}</div><div class="k-f"><span>${req ? 'review now →' : 'all clear'}</span></div></a>`);
  AX.set('#sx-rq', req ? h`<a class="sx-req" href="#/students/requests"><span class="av sm" style="--c:#c9a45c">${icon('userPlus', 15)}</span><div class="grow"><b>${fmt.plural(req, 'new access request')}</b><div class="xs mut">${join(pending().slice(0, 3), (s, i) => h`${i ? ', ' : ''}${nameOf(s)}`)}${req > 3 ? ' and ' + (req - 3) + ' more' : ''}</div></div><span class="btn sm gold">Review</span></a>` : '');
  drawSegs(); drawList();
}
function drawSegs() {
  const c = counts();
  AX.set('#sx-seg', join(SEGS.filter(([k]) => k === 'all' || c[k] || V.s === k), ([k, l]) => h`<button type="button" class="chip ${V.s === k ? 'on' : ''}" data-act="seg" data-v="${k}">${l}<em>${c[k]}</em></button>`));
  AX.$$('#sx-k .btnk').forEach(b => b.classList.toggle('on', b.dataset.v === V.s));
}
function payChip(s) {
  const m = money(s); if (!m) return '';
  return m.total > 0 ? UI.pill(fmt.inr(m.total), 'ok') : m.n ? UI.pill('Free', 'vio') : UI.pill('Not recorded', 'warn');
}
function accChips(s, can) {
  return join(V.D.paid, x => { const on = (s.access || []).includes(x.id), t = x.title.length > 22 ? x.title.slice(0, 21) + '…' : x.title;
    return can ? h`<button type="button" class="sx-ac ${on ? 'on' : ''}" data-act="acc" data-id="${s.id}" data-ser="${x.id}" title="${on ? 'Remove access to ' : 'Give access to '}${x.title}">${icon(on ? 'check' : 'plus')}${t}</button>`
      : on ? h`<span class="sx-ac on" title="${x.title}">${icon('check')}${t}</span>` : ''; });
}
function avatarW(s, size) { return h`<span class="sx-avw">${UI.avatar(nameOf(s), s.id || s.mobile, size)}<span class="sd ${seenCls(s)}"></span></span>`; }
function row(s, can) {
  const p = V.D.perf.get(s.mobile), isNew = s.created && Date.now() - s.created < 7 * DAY, live = seenCls(s) === 'live';
  return h`<div class="sx-row ${V.sel.has(s.id) ? 'on' : ''}" data-act="open" data-id="${s.id}">
    <span class="ck"><input type="checkbox" data-act="sel" data-id="${s.id}" ${V.sel.has(s.id) ? raw('checked') : ''} aria-label="Select ${nameOf(s)}"></span>
    <div class="sx-stu">${avatarW(s)}<div style="min-width:0"><div class="sx-nm"><span class="t">${nameOf(s)}</span>${s.status === 'blocked' ? UI.pill('Blocked', 'bad') : ''}${isNew ? UI.pill('New', 'info') : ''}</div><div class="sx-sub mono">${fmt.mobile(s.mobile)}</div></div></div>
    <div class="sx-act"><div class="${live ? 'live' : ''}">${seenTxt(s)}</div><div class="xs mut">${fmt.plural(p ? p.n : (s.attempts || 0), 'test')} · ${s.devices || 0}/${s.max_devices || 2} phones</div></div>
    <div class="sx-sc" title="${p ? 'Average ' + p.avg + '% · best ' + p.best + '%' : ''}">${p ? h`<div class="sm"><b>${p.avg}%</b> <span class="mut xs">avg</span><span class="xs faint sx-best"> · best ${p.best}%</span></div><div class="bar-meter" style="--c:var(--${tone(p.avg)})"><i style="width:${Math.max(3, Math.min(100, p.avg))}%"></i></div>` : h`<span class="xs faint">No tests yet</span>`}</div>
    <div class="sx-acc">${accChips(s, can)}</div>
    <div class="sx-pay">${payChip(s)}</div>
    <div class="sx-ops"><a class="ibtn sm" href="${AX.u.wa(s.mobile, 'Hi ' + first(s) + ', ')}" target="_blank" rel="noopener" data-act="noop" aria-label="WhatsApp ${nameOf(s)}" title="WhatsApp">${icon('whatsapp', 17)}</a><button class="ibtn sm" data-act="open" data-id="${s.id}" aria-label="Open ${nameOf(s)}">${icon('chevR', 17)}</button></div>
  </div>`;
}
function drawList() {
  const el = document.getElementById('sx-list'); if (!el) return;
  const can = AX.can('students', 'manage'), L = shown(), lim = PAGE * (V.more + 1), S = L.slice(0, lim);
  [...V.sel].forEach(id => { if (!V.D.students.some(s => s.id === id && s.status !== 'pending')) V.sel.delete(id); });
  const allOn = S.length && S.every(s => V.sel.has(s.id));
  if (!members().length) {
    return AX.set(el, h`<div class="card">${UI.empty({ icon: 'users', title: 'No students yet', text: 'Add a student, or share the website link so students can request access.', action: can ? h`<button class="btn pri sm" data-act="add">${icon('userPlus', 15)} Add student</button>` : '' })}</div>`);
  }
  AX.set(el, h`<div class="sx-lh"><input type="checkbox" data-act="selAll" ${allOn ? raw('checked') : ''} aria-label="Select all shown"><span>${L.length === members().length ? fmt.plural(L.length, 'student') : L.length + ' of ' + members().length + ' shown'}</span><span class="grow"></span>${V.sel.size ? h`<span class="pill pri">${V.sel.size} selected</span>` : ''}</div>
    ${L.length ? h`<div class="card pad0"><div class="sx-row hd"><span></span><span>Student</span><span>Activity</span><span>Score</span><span>Series access</span><span>${V.D.payOk ? 'Paid' : ''}</span><span></span></div>${join(S, s => row(s, can))}</div>
      ${L.length > S.length ? h`<div class="row mt12" style="justify-content:center"><button class="btn sm" data-act="more">Show ${Math.min(PAGE, L.length - S.length)} more · ${L.length - S.length} left</button></div>` : ''}`
    : h`<div class="card">${UI.empty({ icon: 'search', title: 'No students match', text: 'Try another filter, or clear the search.', action: h`<button class="btn sm" data-act="reset">${icon('x', 15)} Clear filters</button>` })}</div>`}
    ${V.sel.size ? h`<div class="sx-bulk" role="region" aria-label="Selected students"><b class="sm">${V.sel.size} selected</b>
      ${can && V.D.paid.length ? h`<select class="inp sm" id="sx-bs" aria-label="Series">${join(V.D.paid, x => h`<option value="${x.id}">${x.title}</option>`)}</select><button class="btn sm pri" data-act="bulk" data-on="1" data-busy="Working…">${icon('unlock', 15)} Give access</button><button class="btn sm" data-act="bulk" data-on="0" data-busy="Working…">${icon('lock', 15)} Remove</button>` : ''}
      <button class="btn sm ghost" data-act="copyNums">${icon('copy', 15)} Copy numbers</button><button class="btn sm ghost" data-act="selCsv">${icon('download', 15)} CSV</button><button class="btn sm ghost" data-act="clear">${icon('x', 15)} Clear</button></div>` : ''}`);
}
// the login message with the current code; with a series: that series' approval message and Telegram link
async function msgSheet(s, sid) {
  await AX.amsg.load();
  const ser = sid && V.D ? V.D.series.find(x => x.id === sid) : null;
  const msg = stuMsg({ sid, name: nameOf(s), title: ser ? ser.title : '', mobile: s.mobile, keep: true });
  UI.modal({ title: ser ? 'Message for ' + ser.title : 'Login message', sub: 'Uses their current code — they already know it.', size: 'narrow', body: h`<div class="well s3-msg">${msgHtml(msg)}</div>`,
    foot: h`<a class="btn soft" href="${AX.u.wa(s.mobile, msg)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><a class="btn" href="${AX.u.tg(s.mobile)}" target="_blank" rel="noopener" data-act="tg">${icon('telegram', 16)} Telegram</a><button class="btn" data-act="cp">${icon('copy', 16)} Copy</button><span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    onOpen(m) { AX.act(m, { async cp() { if (await AX.u.copy(msg)) UI.toast('Message copied'); }, tg() { AX.u.copy(AX.u.tgText(msg)); UI.toast('Message copied — paste it in Telegram'); } }); } });
}
async function toggleAccess(id, ser, btn) {
  if (!AX.can('students', 'manage')) return;
  const s = V.D.students.find(x => x.id === id); if (!s) return;
  const on = !(s.access || []).includes(ser);
  if (btn) btn.disabled = true;
  const r = await act('grant', { student_id: id, series_id: ser, on });
  if (btn) btn.disabled = false;
  if (!r.ok) return;
  s.access = on ? [...new Set([...(s.access || []), ser])] : (s.access || []).filter(x => x !== ser);
  const t = (V.D.series.find(x => x.id === ser) || {}).title || 'series';
  UI.toast(on ? 'Access to ' + t + ' given to ' + first(s) : 'Access to ' + t + ' removed', on ? { action: { label: 'Send message', fn: () => msgSheet(s, ser) } } : {});
  if (document.getElementById('sx-list')) drawList();
  if (DR && DR.id === id) drawDrawer();
  changed();
}
async function bulkAccess(on, btn) {
  const sel = document.getElementById('sx-bs'); if (!sel) return;
  const ser = sel.value, ids = [...V.sel], t = (V.D.series.find(x => x.id === ser) || {}).title;
  const ok = await UI.confirm({ title: (on ? 'Give access to ' : 'Remove access from ') + fmt.plural(ids.length, 'student') + '?', text: (on ? 'They can open every test in ' : 'They will no longer open the tests in ') + t + '.', yes: on ? 'Give access' : 'Remove access', tone: on ? '' : 'danger' });
  if (!ok) return;
  let n = 0, i = 0;
  await UI.busy(btn, async () => {
    for (const id of ids) {
      i++; btn.innerHTML = '<span class="spin"></span><span>' + i + ' of ' + ids.length + '</span>';
      const r = await AX.api.admin('grant', { student_id: id, series_id: ser, on });
      if (r.ok) { n++; const s = V.D.students.find(x => x.id === id); if (s) s.access = on ? [...new Set([...(s.access || []), ser])] : (s.access || []).filter(x => x !== ser); }
    }
  });
  V.sel.clear();
  UI.toast((on ? 'Access given to ' : 'Access removed from ') + fmt.plural(n, 'student') + (n < ids.length ? ' · ' + (ids.length - n) + ' failed' : ''), { tone: n < ids.length ? 'warn' : 'ok' });
  drawDirectory(true); changed();
}
function selCsv() {
  const l = V.D.students.filter(s => V.sel.has(s.id));
  AX.u.csvDownload('selected-students.csv', [['Name', 'Mobile', 'Status', 'Tests', 'Average %', 'Last seen'], ...l.map(s => { const p = V.D.perf.get(s.mobile); return [s.name, s.mobile, s.status, s.attempts, p ? p.avg : '', s.last_seen ? new Date(s.last_seen).toLocaleString('en-IN') : 'never']; })]);
}
async function exportCsv() {
  UI.toast('Preparing students CSV…');
  const r = await AX.api.call('cbt_admin2', 'students_export');
  if (!r.ok) return UI.err(r, 'supabase_v6_update.sql');
  AX.u.csvDownload('students.csv', [['Name', 'Mobile', 'Status', 'Batches / paid series', 'Tests taken', 'Attempts', 'Average %', 'Joined', 'Last seen'], ...(r.rows || []).map(x => [x.name, x.mobile, x.status, x.batches, x.tests, x.attempts, x.avg_pct == null ? '' : x.avg_pct, x.joined, x.last_seen])]);
  UI.toast('Students CSV downloaded');
}

/* ---------- access requests ---------- */
async function drawRequests() {
  const body = document.getElementById('sx-body'); if (!body) return;
  const L = pending(), can = AX.can('students', 'manage');
  [...V.rsel].forEach(id => { if (!L.some(s => s.id === id)) V.rsel.delete(id); });
  let orders = null;
  if (AX.can('store') && L.length) { const c = AX.cache.peek('store'); if (c) { const st = await c; if (st && st.ok) orders = st.orders || []; } else AX.data.store().then(st => { if (st && st.ok && document.getElementById('sx-reqs')) drawRequests(); }); }
  if (!document.getElementById('sx-body')) return;
  const hasOrder = s => orders && orders.some(o => o.mobile === s.mobile);
  const allOn = L.length && L.every(s => V.rsel.has(s.id));
  AX.set(body, h`<div id="sx-reqs">${L.length ? h`<div class="callout info" style="margin-bottom:14px">${icon('info')}<div class="sm">These students asked for access on the website. <b>Approve</b> gives them an access code to send on WhatsApp or Telegram. <b>Reject</b> removes the request; they can ask again.</div></div>
      ${can ? h`<div class="sx-lh"><input type="checkbox" data-act="rselAll" ${allOn ? raw('checked') : ''} aria-label="Select all requests"><span>${fmt.plural(L.length, 'request')}</span><span class="grow"></span>
        ${V.rsel.size ? h`<button class="btn sm danger" data-act="rejectMany">${icon('x', 15)} Reject ${V.rsel.size}</button><button class="btn sm pri" data-act="approveMany" data-busy="Approving…">${icon('check', 15)} Approve ${V.rsel.size}</button>` : L.length > 1 ? h`<button class="btn sm soft" data-act="approveMany" data-all="1" data-busy="Approving…">${icon('check', 15)} Approve all ${L.length}</button>` : ''}</div>` : ''}
      <div class="card pad0">${join(L, s => h`<div class="sx-rq">${can ? h`<input type="checkbox" data-act="rsel" data-id="${s.id}" ${V.rsel.has(s.id) ? raw('checked') : ''} aria-label="Select ${nameOf(s)}">` : ''}
        ${UI.avatar(nameOf(s), s.id)}<div class="grow" style="min-width:150px"><div class="row gap6 wrap"><b>${nameOf(s)}</b>${hasOrder(s) ? UI.pill('Has a store order', 'info') : ''}</div><div class="xs mut"><span class="mono">${fmt.mobile(s.mobile)}</span> · requested ${fmt.ago(s.created)}</div></div>
        <div class="ops"><a class="btn sm ghost" href="${AX.u.wa(s.mobile, 'Hi ' + first(s) + ', ')}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp', 15)}</a><button class="btn sm ghost" data-act="open" data-id="${s.id}">${icon('user', 15)} Profile</button>
          ${can ? h`<button class="btn sm danger" data-act="reject" data-id="${s.id}">Reject</button><button class="btn sm pri" data-act="approve" data-id="${s.id}" data-busy="">${icon('check', 15)} Approve & get code</button>` : ''}</div></div>`)}</div>`
    : h`<div class="card">${UI.empty({ icon: 'checkCircle', title: 'No access requests', text: 'When a student asks for access on the website, they show up here. You can also add a student yourself.', action: can ? h`<button class="btn pri sm" data-act="add">${icon('userPlus', 15)} Add student</button>` : '' })}</div>`}</div>`);
}
async function approve(id, btn) {
  const go = async () => {
    const r = await AX.api.admin('student_approve', { id });
    if (!r.ok) return UI.err(r);
    V.rsel.delete(id); changed();
    showCode(r.name, r.mobile, r.code, 'Approved ✓');
  };
  return btn ? UI.busy(btn, go) : go();
}
async function reject(ids) {
  ids = ids.filter(Boolean); if (!ids.length) return;
  const one = ids.length === 1 && V.D.students.find(s => s.id === ids[0]);
  const ok = await UI.confirm({ title: one ? 'Reject the request from ' + nameOf(one) + '?' : 'Reject ' + ids.length + ' requests?', text: 'The request is removed. They can ask again from the website.', yes: 'Reject', tone: 'danger' });
  if (!ok) return;
  let n = 0;
  for (const id of ids) { const r = await AX.api.admin('student_delete', { id }); if (r.ok) { n++; V.rsel.delete(id); } else if (ids.length === 1) UI.err(r); }
  if (n) UI.toast(n === 1 ? 'Request removed' : n + ' requests removed');
  if (DR && ids.includes(DR.id)) DR.api.close();
  changed();
}
async function approveMany(ids, btn) {
  ids = ids.filter(Boolean); if (!ids.length) return;
  const ok = await UI.confirm({ title: 'Approve ' + fmt.plural(ids.length, 'request') + '?', text: 'Each student gets an access code. You will see all the codes next, with a button to send each one.', yes: 'Approve all' });
  if (!ok) return;
  const out = [];
  await UI.busy(btn, async () => {
    let i = 0;
    for (const id of ids) {
      i++; btn.innerHTML = '<span class="spin"></span><span>' + i + ' of ' + ids.length + '</span>';
      const s = V.D.students.find(x => x.id === id), r = await AX.api.admin('student_approve', { id });
      out.push(r.ok ? { name: r.name, mobile: r.mobile, code: r.code } : { name: nameOf(s), mobile: s ? s.mobile : '', error: AX.errText(r) });
      V.rsel.delete(id);
    }
  });
  changed();
  codesModal('Approved ' + out.filter(x => x.code).length + ' of ' + out.length, out);
}

/* ---------- codes: one code, or a list of codes ---------- */
function showCode(name, mobile, code, title) {
  const msg = stuMsg({ name, mobile, code });
  UI.modal({ title: title || 'Access code ready', sub: name + ' · ' + fmt.mobile(mobile),
    icon: h`<span class="pill gold" style="height:28px;width:28px;padding:0;justify-content:center">${icon('key', 15)}</span>`,
    body: h`<div class="code-big" aria-label="Access code">${fmtCode(code)}</div>
      <p class="sm mut mt12" style="line-height:1.55">Save or send this code now. For safety it is stored only in scrambled form, so it cannot be shown again. If it is lost, create a new code.</p>
      <div class="section-t" style="margin-top:16px">Message preview</div><div class="well s3-msg">${msgHtml(msg)}</div>
      <p class="xs mut mt8">Telegram: the message is copied first — paste it in the chat that opens.</p>`,
    foot: h`<a class="btn soft" href="${AX.u.wa(mobile, msg)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><a class="btn" href="${AX.u.tg(mobile)}" target="_blank" rel="noopener" data-act="tg">${icon('telegram', 16)} Telegram</a><button class="btn" data-act="copy">${icon('copy', 16)} Copy message</button><span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    sticky: true,
    onOpen(el) { AX.act(el, { async copy() { if (await AX.u.copy(msg)) UI.toast('Message copied'); }, tg() { AX.u.copy(AX.u.tgText(msg)); UI.toast('Message copied — paste it in Telegram'); } }); }
  });
}
function codesModal(title, rows) {
  const okRows = rows.filter(x => x.code), all = okRows.map(x => x.name + ' | ' + x.mobile + ' | ' + fmtCode(x.code)).join('\n');
  UI.modal({ title, sub: okRows.length ? 'Copy this list now — the codes cannot be shown again.' : '', size: 'wide', sticky: true,
    body: h`<div class="card pad0 flat">${join(rows, (x, i) => h`<div class="s3-li" style="padding:12px 16px">${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><b class="ell" style="display:block">${x.name}</b><div class="xs mut mono">${fmt.mobile(x.mobile)}</div></div>
        ${x.code ? h`<span class="mono b" style="color:var(--gold);letter-spacing:.08em">${fmtCode(x.code)}</span><a class="ibtn sm line" href="${AX.u.wa(x.mobile, stuMsg({ name: x.name, mobile: x.mobile, code: x.code }))}" target="_blank" rel="noopener" aria-label="Send on WhatsApp" title="Send on WhatsApp">${icon('whatsapp', 16)}</a><button class="ibtn sm line" data-act="cp" data-i="${i}" aria-label="Copy message" title="Copy message">${icon('copy', 16)}</button>` : UI.pill(x.error || 'Failed', 'bad')}</div>`)}</div>`,
    foot: h`${okRows.length ? h`<button class="btn" data-act="all">${icon('copy', 16)} Copy all codes</button>` : ''}<span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    onOpen(el) { AX.act(el, { async all() { if (await AX.u.copy(all)) UI.toast('All codes copied'); }, async cp(b) { const x = rows[+b.dataset.i]; if (await AX.u.copy(stuMsg({ name: x.name, mobile: x.mobile, code: x.code }))) UI.toast('Message for ' + x.name + ' copied'); } }); }
  });
}

/* ---------- add students ---------- */
function addStudent() {
  if (!AX.can('students', 'manage')) return UI.toast('You can only view students.', { tone: 'warn' });
  let mode = 'one';
  UI.modal({ title: 'Add students', sub: 'They get an access code at once. Send it on WhatsApp or Telegram.', size: 'wide',
    body: h`<div class="seg" style="margin-bottom:16px" id="am-seg"><button type="button" class="on" data-m="one">${icon('user', 15)} One student</button><button type="button" data-m="many">${icon('users', 15)} Many at once</button></div>
      <form id="am1" class="form-grid" autocomplete="off" onsubmit="return false">${AX.f.input({ name: 'name', label: 'Full name', placeholder: 'Rahul Sharma', max: 60 })}${AX.f.input({ name: 'mobile', label: 'Mobile number', type: 'tel', inputmode: 'numeric', placeholder: '10-digit number', max: 16 })}</form>
      <form id="am2" class="hide" onsubmit="return false">${AX.f.textarea({ name: 'lines', label: 'One student per line: name, mobile', rows: 7, placeholder: 'Rahul Sharma, 9876543210\nPriya Singh, 9123456780' })}<div class="hint xs mut mt8" id="am2c">Paste from a spreadsheet or WhatsApp. Each line needs a name and a 10-digit number.</div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go" data-busy="Creating…">${icon('key', 16)} <span id="am-go">Create & get code</span></button>`,
    onOpen(el, close) {
      const f1 = el.querySelector('#am1'), f2 = el.querySelector('#am2');
      el.querySelector('#am-seg').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; el.querySelectorAll('#am-seg button').forEach(x => x.classList.toggle('on', x === b)); f1.classList.toggle('hide', mode !== 'one'); f2.classList.toggle('hide', mode === 'one'); AX.set(el.querySelector('#am-go'), mode === 'one' ? 'Create & get code' : 'Create all & get codes'); (mode === 'one' ? f1.querySelector('input') : f2.querySelector('textarea')).focus(); });
      const parse = () => String(f2.querySelector('textarea').value || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => { const m = line.match(/(\+?\d[\d\s\-]{8,}\d)/); if (!m) return { line, error: 'no mobile number found' }; return { line, mobile: m[1].replace(/\D/g, '').slice(-10), name: line.replace(m[1], '').replace(/^[\s,;:|\-–]+|[\s,;:|\-–]+$/g, '') }; });
      f2.addEventListener('input', () => { const L = parse(); AX.set(el.querySelector('#am2c'), L.length ? h`<b>${L.filter(x => !x.error).length}</b> ready${L.some(x => x.error) ? h` · <span style="color:var(--bad)">${L.filter(x => x.error).length} without a number</span>` : ''}` : 'Paste from a spreadsheet or WhatsApp. Each line needs a name and a 10-digit number.'); });
      f1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-act=go]').click(); } });
      AX.act(el, { async go(btn) {
        if (mode === 'one') {
          AX.f.clearErrors(f1);
          const d = AX.f.read(f1), name = String(d.name || '').trim().replace(/\s+/g, ' '), mobile = String(d.mobile || '').replace(/\D/g, '').slice(-10);
          if (name.length < 2) return AX.f.error(f1, 'name', 'Please enter a name.');
          if (mobile.length !== 10) return AX.f.error(f1, 'mobile', 'Please enter a valid 10-digit mobile number.');
          await UI.busy(btn, async () => {
            const r = await AX.api.admin('student_add', { name, mobile });
            if (!r.ok) {
              if (r.error === 'exists') return AX.f.error(f1, 'mobile', 'This mobile number already has an account. Use the student’s Account → New access code.');
              if (r.error === 'name') return AX.f.error(f1, 'name', 'Please enter a name.');
              if (r.error === 'mobile') return AX.f.error(f1, 'mobile', 'Please enter a valid 10-digit mobile number.');
              return UI.err(r);
            }
            close(); changed(); showCode(r.name || name, r.mobile || mobile, r.code, 'Access code ready');
          });
        } else {
          const L = parse(); if (!L.length) return UI.toast('Paste at least one line: name, mobile', { tone: 'warn' });
          const out = [];
          await UI.busy(btn, async () => {
            let i = 0;
            for (const x of L) {
              i++; btn.innerHTML = '<span class="spin"></span><span>Creating ' + i + ' of ' + L.length + '…</span>';
              if (x.error) { out.push({ name: x.line, mobile: '', error: x.error }); continue; }
              const r = await AX.api.admin('student_add', { name: x.name, mobile: x.mobile });
              out.push(r.ok ? { name: r.name || x.name, mobile: r.mobile || x.mobile, code: r.code } : { name: x.name || x.line, mobile: x.mobile, error: r.error === 'exists' ? 'already has an account' : r.error === 'name' || r.error === 'mobile' ? 'invalid' : AX.errText(r) });
            }
          });
          close(); changed();
          codesModal(out.filter(x => x.code).length + ' created, ' + out.filter(x => !x.code).length + ' skipped', out);
        }
      } });
      setTimeout(() => { if (!UI.isPhone()) f1.querySelector('input').focus(); }, 60);
    }
  });
}
// "New code for a student" — find anyone by name or number
async function codeFor() {
  const r = await AX.data.students(); if (!r.ok) return UI.err(r);
  UI.modal({ title: 'New code for a student', sub: 'A new code signs the student out of all their phones. Use it only if they lost their code.', size: 'narrow',
    body: h`<div class="inp-wrap">${icon('search', 17)}<input class="inp" id="cf-q" type="search" placeholder="Type to search…" autocomplete="off"></div><div class="list mt12" id="cf-r"><div class="sm mut">Type at least 2 letters or digits.</div></div>`,
    onOpen(el, close) {
      const i = el.querySelector('#cf-q');
      i.addEventListener('input', () => { const q = i.value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
        const L = q.length < 2 ? [] : (r.students || []).filter(s => (qd && s.mobile.includes(qd)) || nameOf(s).toLowerCase().includes(q)).slice(0, 8);
        AX.set(el.querySelector('#cf-r'), q.length < 2 ? h`<div class="sm mut">Type at least 2 letters or digits.</div>` : L.length ? join(L, s => h`<div class="s3-li">${UI.avatar(nameOf(s), s.id, 'sm')}<div class="grow"><b class="ell" style="display:block">${nameOf(s)}</b><div class="xs mut">${fmt.mobile(s.mobile)} · ${s.status}</div></div><button class="btn sm" data-act="nc" data-id="${s.id}">${icon('key', 14)} New code</button></div>`) : h`<div class="sm mut">No student found.</div>`); });
      AX.act(el, { nc(b) { close(); newCode((r.students || []).find(s => s.id === b.dataset.id)); } });
      setTimeout(() => i.focus(), 60);
    } });
}
async function newCode(s) {
  if (!s) return;
  if (s.status === 'pending') return approve(s.id);
  const ok = await UI.confirm({ title: 'Create a new access code for ' + nameOf(s) + '?', text: 'The old code and all their devices will stop working. They sign in again with the new code.', yes: 'Create new code' });
  if (!ok) return;
  const r = await act('student_code', { id: s.id });
  if (!r.ok) return;
  changed(); showCode(r.name || nameOf(s), r.mobile || s.mobile, r.code, 'New access code');
}

/* ---------- student 360° drawer ---------- */
const TABS = [['overview', 'Overview', 'grid'], ['access', 'Access', 'unlock'], ['results', 'Results', 'trophy'], ['payments', 'Payments', 'wallet'], ['devices', 'Devices', 'smartphone'], ['account', 'Account', 'settings']];
const cheat = force => AX.can('integrity') ? AX.cache.get('cheat', () => AX.api.call('cbt_admin_cheat', 'get'), 30000, force) : Promise.resolve({ ok: false, error: 'forbidden' });
function findStudent(x) {
  if (!V.D || x == null) return null;
  const k = String(x), d = k.replace(/\D/g, '').slice(-10);
  return V.D.students.find(s => s.id === k) || (/^[\d\s+()-]{10,}$/.test(k) ? V.D.students.find(s => s.mobile === d) : null);
}
async function openStudent(x, tab) {
  if (!V.D || Date.now() - V.D.at > 30000) { const r = await load(false); if (!r.ok) return UI.err(r.r); }
  let s = findStudent(x);
  if (!s) { const r = await load(true); if (!r.ok) return UI.err(r.r); s = findStudent(x); }
  if (!s) return UI.toast('This student was not found. They may have been deleted.', { tone: 'warn' });
  if (DR) DR.api.close();
  const c = AX.current && AX.current(), onPage = c && c.mod === 'students';
  DR = { id: s.id, tab: TABS.some(t => t[0] === tab) ? tab : 'overview', cheat: null };
  DR.api = UI.drawer({ size: 'wide', title: nameOf(s), head: h`<div id="s3-head"></div>`, body: h`<div id="s3-body"></div>`,
    onClose() { DR = null; if (onPage && /^#\/students\/[^/?]+/.test(location.hash) && !/^#\/students\/requests/.test(location.hash)) history.replaceState(null, '', '#/students' + (V.tab === 'requests' ? '/requests' : '')); },
    onOpen(el) { wireDrawer(el); }
  });
  if (onPage && !location.hash.includes(s.id)) history.replaceState(null, '', '#/students/' + s.id);
  drawDrawer();
  if (AX.can('integrity')) cheat().then(r => { if (DR && r.ok) { DR.cheat = r; drawDrawer(); } });
}
AX.openStudent = (x, tab) => openStudent(x, tab);

function statusPill(s, su) {
  return su ? UI.pill('Suspended', 'bad', true) : s.status === 'blocked' ? UI.pill('Blocked', 'bad', true) : s.status === 'pending' ? UI.pill('Access request', 'gold', true) : seenCls(s) === 'live' ? h`<span class="pill ok"><span class="live-dot"></span> Online now</span>` : UI.pill('Active', 'ok', true);
}
const suspOf = s => DR && DR.cheat && DR.cheat.ok ? (DR.cheat.suspended || []).find(x => x.mobile === s.mobile) : null;
function drawDrawer() {
  if (!DR) return;
  const el = DR.api.el, s = V.D.students.find(x => x.id === DR.id);
  if (!s) { DR.api.close(); return; }
  const su = suspOf(s), M = money(s), R = V.D.results.get(s.mobile) || [];
  AX.set(el.querySelector('#s3-head'), h`<div class="s3-hd">${UI.avatar(nameOf(s), s.id || s.mobile, 'lg')}<div class="grow"><div class="row gap6 wrap"><h2 class="ell">${nameOf(s)}</h2>${statusPill(s, su)}${isPaid(s) ? UI.pill('Paid', 'gold') : ''}</div>
      <div class="s3-ct"><span class="mono b" style="margin-right:6px;align-self:center">${fmt.mobile(s.mobile)}</span>
        <a class="ibtn sm line" href="${AX.u.tel(s.mobile)}" aria-label="Call" title="Call">${icon('phone', 15)}</a>
        <a class="ibtn sm line" href="${AX.u.wa(s.mobile, 'Hi ' + first(s) + ', ')}" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp">${icon('whatsapp', 15)}</a>
        <a class="ibtn sm line" href="${AX.u.tg(s.mobile)}" target="_blank" rel="noopener" aria-label="Telegram" title="Telegram">${icon('telegram', 15)}</a>
        <button class="ibtn sm line" data-copy="${s.mobile}" aria-label="Copy number" title="Copy number">${icon('copy', 15)}</button></div>
      <div class="xs mut mt8">Joined ${fmt.date(s.created)} · ${seenTxt(s)} · ${s.devices || 0}/${s.max_devices || 2} phones</div></div></div>`);
  const counts = { results: R.length || '', payments: M ? M.n || '' : '' };
  AX.set(el.querySelector('#s3-body'), h`<nav class="s3-tabs" role="tablist">${join(TABS, ([k, l, ic]) => h`<button type="button" role="tab" class="${DR.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}" aria-selected="${DR.tab === k ? 'true' : 'false'}">${icon(ic, 16)}<span>${l}</span>${counts[k] ? h`<em>${counts[k]}</em>` : ''}</button>`)}</nav>
    ${s.status === 'pending' ? h`<div class="callout gold" style="margin-bottom:16px">${icon('userPlus')}<div class="grow"><b>Access request</b><div class="sm">Requested ${fmt.ago(s.created)}. Approve to create their access code.</div>${AX.can('students', 'manage') ? h`<div class="row mt8"><button class="btn sm pri" data-act="dApprove" data-busy="">${icon('check', 15)} Approve & get code</button><button class="btn sm danger" data-act="dReject">Reject</button></div>` : ''}</div></div>` : ''}
    <div id="s3-tab">${tabHtml(s, DR.tab, su, M, R)}</div>`);
}
function tabHtml(s, tab, su, M, R) {
  const can = AX.can('students', 'manage'), p = V.D.perf.get(s.mobile);
  if (tab === 'overview') {
    const acc = V.D.paid.filter(x => (s.access || []).includes(x.id));
    return h`<div class="s3-tiles">
        <div class="s3-tile"><div class="l">Tests</div><div class="v">${p ? p.n : s.attempts || 0}</div></div>
        <div class="s3-tile"><div class="l">Average</div><div class="v" style="color:${p ? 'var(--' + tone(p.avg) + ')' : ''}">${p ? p.avg + '%' : '—'}</div></div>
        <div class="s3-tile"><div class="l">Best</div><div class="v">${p ? p.best + '%' : '—'}</div></div>
        <div class="s3-tile"><div class="l">Last seen</div><div class="v sm">${!s.last_seen ? 'Never' : seenCls(s) === 'live' ? 'Now' : fmt.ago(s.last_seen)}</div></div></div>
      ${p && p.lt ? h`<div class="well sm mt12 row">${icon('trophy', 16)}<span class="grow">Last test: <b>${p.lt}</b> · ${p.lp}% · ${fmt.ago(p.last)}</span></div>` : ''}
      <div class="row wrap mt12 gap6"><a class="btn sm soft" href="${AX.u.wa(s.mobile, 'Hi ' + first(s) + ', ')}" target="_blank" rel="noopener">${icon('whatsapp', 15)} WhatsApp</a><a class="btn sm" href="${AX.u.wa(s.mobile, remindMsg(s))}" target="_blank" rel="noopener">${icon('bell', 15)} Remind to study</a><a class="btn sm" href="${AX.u.tel(s.mobile)}">${icon('phone', 15)} Call</a><button class="btn sm ghost" data-copy="${s.mobile}">${icon('copy', 15)} Copy number</button></div>
      <div class="grid g2 mt16">
        <div class="card flat tight"><div class="card-h">${icon('unlock', 16)}<h3>Series access</h3><span class="grow"></span><button class="btn xs ghost" data-act="tab" data-v="access">Manage</button></div>${acc.length ? h`<div class="chips">${join(acc, x => UI.pill(x.title, 'ok'))}</div>` : h`<div class="sm mut">${V.D.paid.length ? 'No paid series unlocked yet.' : 'No paid series yet.'}</div>`}</div>
        <div class="card flat tight"><div class="card-h">${icon('wallet', 16)}<h3>Payments</h3><span class="grow"></span>${AX.can('payments') ? h`<button class="btn xs ghost" data-act="tab" data-v="payments">View</button>` : ''}</div>${!AX.can('payments') ? h`<div class="sm mut">Needs Payments access.</div>` : M ? h`<div class="s3-amt" style="font-size:24px">${M.total ? fmt.inr(M.total) : M.n ? 'Free' : '—'}</div><div class="xs mut">${M.n ? fmt.plural(M.n, 'payment') : 'No payment recorded'}</div>` : h`<div class="sm mut">${V.D.payMissing ? 'Payments are not set up yet.' : 'Could not load payments.'}</div>`}</div></div>
      <div class="section-t">Recent results</div>
      ${!AX.can('results') ? h`<div class="sm mut">Needs Results access.</div>` : R.length ? h`<div class="card flat tight" style="padding:4px 14px">${join(R.slice(0, 5), x => resRow(x))}</div>${R.length > 5 ? h`<div class="row mt8"><button class="btn xs ghost" data-act="tab" data-v="results">All ${R.length} results ${icon('arrowR', 13)}</button></div>` : ''}` : h`<div class="sm mut">No tests taken yet.</div>`}`;
  }
  if (tab === 'access') {
    const free = V.D.series.filter(x => x.is_free);
    return h`<p class="sm mut" style="margin-bottom:12px">Switch on a paid series to unlock all its tests for ${first(s)}. ${can ? '' : 'You can only view this.'}</p>
      ${V.D.paid.length ? h`<div class="card flat" style="padding:4px 16px">${join(V.D.paid, x => { const on = (s.access || []).includes(x.id); return h`<div class="s3-li"><span class="av sm" style="--c:${AX.u.hue(x.id)}">${icon('layers', 15)}</span><div class="grow"><b class="ell" style="display:block">${x.title}</b><div class="xs mut">${x.price_label || 'Paid series'}${x.active === false ? ' · hidden' : ''}</div></div>
          <label class="sw"><input type="checkbox" data-act="dAcc" data-ser="${x.id}" ${on ? raw('checked') : ''} ${can ? '' : raw('disabled')} aria-label="Access to ${x.title}"><i></i></label></div>`; })}</div>`
        : h`<div class="card flat">${UI.empty({ icon: 'layers', title: 'No paid series yet', text: 'Create one in Test studio. Free series are open to everyone.' })}</div>`}
      ${free.length ? h`<div class="xs mut mt12">${icon('info', 13)} Open to everyone: ${free.map(x => x.title).join(', ')}</div>` : ''}`;
  }
  if (tab === 'results') {
    if (!AX.can('results')) return h`<div class="card flat">${UI.empty({ tone: 'lock', icon: 'lock', title: 'Needs Results access', text: 'Ask the owner for Results access to see this student’s scores.' })}</div>`;
    if (!V.D.resultsOk) return h`<div class="card flat">${UI.empty({ tone: 'bad', icon: 'alert', title: 'Could not load results' })}</div>`;
    return R.length ? h`<div class="card flat" style="padding:4px 16px">${join(R, x => resRow(x, true))}</div><p class="xs mut mt8">Deleting a result lets the student attempt that test again.</p>`
      : h`<div class="card flat">${UI.empty({ icon: 'trophy', title: 'No results yet', text: first(s) + ' has not finished a test.' })}</div>`;
  }
  if (tab === 'payments') {
    if (!AX.can('payments')) return h`<div class="card flat">${UI.empty({ tone: 'lock', icon: 'lock', title: 'Needs Payments access' })}</div>`;
    if (V.D.payMissing) return h`<div class="callout warn">${icon('db')}<div class="sm">Run <b>supabase_v29_payments.sql</b> once in Supabase to record payments.</div></div>`;
    if (!M) return h`<div class="card flat">${UI.empty({ tone: 'bad', icon: 'alert', title: 'Could not load payments' })}</div>`;
    const pm = AX.can('payments', 'manage'), L = [...M.sto.map(o => ({ k: 'store', o, at: AX.money.dayMs(o.at) })), ...M.man.map(x => ({ k: Number(x.amount) === 0 || x.method === 'free' ? 'free' : 'man', x, at: AX.money.dayMs(x.paid_on) }))].sort((a, b) => b.at - a.at);
    return h`<div class="row wrap" style="margin-bottom:12px"><div class="grow"><div class="xs mut">Total paid</div><div class="s3-amt" style="font-size:28px">${M.total ? fmt.inr(M.total) : M.n ? 'Free' : '₹0'}</div></div>${pm ? h`<button class="btn pri sm" data-act="dPay">${icon('plus', 15)} Add payment</button>` : ''}</div>
      ${L.length ? h`<div class="card flat" style="padding:4px 16px">${join(L, r => r.k === 'store'
          ? h`<div class="s3-li"><div class="grow"><div class="row gap6 wrap">${AX.money.chip(r)}<b class="ell">${r.o.item_title || 'Store order'}</b></div><div class="xs mut mt4">${fmt.date(r.at)} · <button class="btn xs ghost mono" style="height:20px;padding:0 4px" data-act="dOrder" data-code="${r.o.code}">${r.o.code}</button></div></div><span class="s3-amt">${fmt.inr(r.o.amount)}</span></div>`
          : h`<div class="s3-li"><div class="grow"><div class="row gap6 wrap">${AX.money.chip(r)}<b>${AX.money.PSHORT[r.x.method] || r.x.method}</b></div><div class="xs mut mt4">${fmt.date(r.at)}${r.x.note ? ' · ' + r.x.note : ''}</div></div><span class="s3-amt">${Number(r.x.amount) ? fmt.inr(r.x.amount) : 'Free'}</span>${pm ? h`<button class="ibtn sm" data-act="dPayEdit" data-id="${r.x.id}" aria-label="Edit payment">${icon('edit', 16)}</button>` : ''}</div>`)}</div>`
        : h`<div class="card flat">${UI.empty({ icon: 'wallet', title: 'No payment recorded', text: 'Joined before the store? Add what they paid.', action: pm ? h`<button class="btn sm" data-act="dPay">${icon('plus', 15)} Add payment</button>` : '' })}</div>`}`;
  }
  if (tab === 'devices') {
    const d = s.devices || 0, mx = s.max_devices || 2;
    return h`<div class="card flat"><div class="row"><span class="av" style="--c:#0ea5e9">${icon('smartphone', 18)}</span><div class="grow"><div class="b lg">${d} of ${mx} phones in use</div><div class="xs mut">A phone counts once the student signs in on it with their code.</div></div></div>
        <div class="bar-meter mt12 ${d >= mx ? 'gold' : ''}"><i style="width:${Math.min(100, Math.round(d / (mx || 1) * 100))}%"></i></div>
        ${can ? h`<div class="row mt16 wrap"><button class="btn" data-act="dReset" data-busy="Resetting…">${icon('refresh', 16)} Reset devices</button><span class="xs mut grow" style="min-width:180px">Signs out every phone. They sign in again with the same code.</span></div>` : ''}</div>
      <div class="card flat mt16"><div class="card-h">${icon('device', 16)}<h3>Maximum phones</h3></div><p class="sm mut">How many phones can use this account at the same time (1–10).</p>
        <div class="row mt12 wrap"><div class="s3-step"><button class="ibtn line" data-act="dMax" data-v="-1" ${can ? '' : raw('disabled')} aria-label="Fewer">${icon('minus')}</button><b id="s3-max">${mx}</b><button class="ibtn line" data-act="dMax" data-v="1" ${can ? '' : raw('disabled')} aria-label="More">${icon('plus')}</button></div><span class="grow"></span>${can ? h`<button class="btn pri sm hide" id="s3-maxsave" data-act="dMaxSave">${icon('check', 15)} Save</button>` : ''}</div>
        <p class="xs faint mt12">The code message tells students it works on up to 2 phones.</p></div>`;
  }
  // account
  return h`${can ? h`<form class="card flat" id="s3-name" onsubmit="return false"><div class="card-h">${icon('user', 16)}<h3>Details</h3></div><div class="row top wrap"><div class="grow" style="min-width:200px">${AX.f.input({ name: 'name', label: 'Full name', value: nameOf(s), max: 60 })}</div><button class="btn" style="margin-top:24px" data-act="dName" data-busy="Saving…">${icon('check', 16)} Save</button></div></form>` : ''}
    <div class="card flat mt16"><div class="card-h">${icon('key', 16)}<h3>Access code</h3></div>
      <p class="sm mut">Codes are stored scrambled, so the current one cannot be shown. A new code signs ${first(s)} out of all phones.</p>
      <div class="row wrap mt12">${can ? h`<button class="btn" data-act="dCode">${icon('key', 16)} ${s.status === 'pending' ? 'Approve & get code' : 'New access code'}</button>` : ''}<button class="btn ghost" data-act="dMsg">${icon('whatsapp', 16)} Send login message (current code)</button></div></div>
    <div class="card flat mt16"><div class="card-h">${icon('ban', 16)}<h3>${s.status === 'blocked' ? 'Blocked' : 'Block'}</h3></div>
      <p class="sm mut">${s.status === 'blocked' ? first(s) + ' cannot sign in. Unblock to let them use their code again.' : 'A blocked student cannot sign in. Nothing is deleted.'}</p>
      ${can && s.status !== 'pending' ? h`<div class="row mt12"><button class="btn ${s.status === 'blocked' ? 'pri' : 'danger'}" data-act="dBlock" data-busy="">${icon(s.status === 'blocked' ? 'unlock' : 'ban', 16)} ${s.status === 'blocked' ? 'Unblock' : 'Block student'}</button></div>` : ''}</div>
    ${AX.can('integrity') ? h`<div class="card flat mt16" style="${su ? 'border-color:var(--bad)' : ''}"><div class="card-h">${icon('shield', 16)}<h3>${su ? 'Suspended' : 'Suspension'}</h3></div>
      ${!DR.cheat ? h`<div class="skel line"></div>` : !DR.cheat.ok ? h`<p class="sm mut">${AX.errText(DR.cheat, 'supabase_v24_cheating.sql')}</p>` : su ? h`<p class="sm">${su.until ? 'Until ' + fmt.dt(su.until) : 'Until you lift it'}${su.reason ? h` · <span class="mut">${su.reason}</span>` : ''}</p>${AX.can('integrity', 'manage') ? h`<div class="row mt12"><button class="btn pri" data-act="dLift" data-busy="">${icon('checkCircle', 16)} Lift suspension</button></div>` : ''}`
        : h`<p class="sm mut">Block the app with a notice and a Support button (e.g. for cheating).</p>${AX.can('integrity', 'manage') ? h`<div class="row mt12"><button class="btn danger" data-act="dSusp">${icon('shield', 16)} Suspend…</button></div>` : ''}`}</div>` : ''}
    ${can ? h`<div class="card flat mt16 s3-dz"><div class="card-h" style="color:var(--bad)">${icon('trash', 16)}<h3>Delete student</h3></div><p class="sm mut">Deletes ${nameOf(s)} permanently. Their results are deleted too. Payments stay in the ledger.</p><div class="row mt12"><button class="btn danger solid" data-act="dDel">${icon('trash', 16)} Delete permanently</button></div></div>` : ''}`;
}
function resRow(x, full) {
  const p = pct(x);
  return h`<div class="s3-li"><span class="pill ${tone(p)}" style="min-width:52px;justify-content:center">${p}%</span><div class="grow"><b class="ell" style="display:block">${x.title}</b><div class="xs mut">${fmt.dt(x.at)} · ${x.score}/${x.max}${full ? ' · ✓' + x.correct + ' ✗' + x.wrong + ' –' + x.skipped + ' · ' + Math.round((x.used || 0) / 60) + ' min' : ''}</div></div>
    ${x.late ? UI.pill('Late', 'warn') : ''}${full && AX.openAnalytics && x.test_id ? h`<button class="ibtn sm" data-act="dAna" data-id="${x.test_id}" aria-label="Test analytics" title="Test analytics">${icon('chart', 16)}</button>` : ''}${full && AX.can('results', 'manage') ? h`<button class="ibtn sm" data-act="dResDel" data-id="${x.id}" aria-label="Delete result" title="Delete result">${icon('trash', 16)}</button>` : ''}</div>`;
}
function wireDrawer(el) {
  const cur = () => V.D.students.find(x => x.id === (DR && DR.id));
  let max = null;
  AX.act(el, {
    tab(b) { DR.tab = b.dataset.v; max = null; drawDrawer(); el.querySelector('.m-b').scrollTop = 0; },
    dApprove: b => approve(DR.id, b),
    dReject: () => reject([DR.id]),
    dAcc: b => { b.checked = !b.checked; toggleAccess(DR.id, b.dataset.ser); },
    dPay: () => AX.addPayment && AX.addPayment({ studentId: DR.id }),
    dPayEdit: b => AX.addPayment && AX.addPayment({ paymentId: b.dataset.id }),
    dOrder: b => AX.openOrder ? AX.openOrder(b.dataset.code) : AX.go('orders', { q: b.dataset.code }),
    dAna: b => AX.openAnalytics(b.dataset.id),
    async dResDel(b) {
      const R = V.D.results.get((cur() || {}).mobile) || [], x = R.find(r => r.id === b.dataset.id); if (!x) return;
      if (!(await UI.confirm({ title: 'Delete this result?', text: x.title + ' · ' + x.score + '/' + x.max + '. The student can attempt the test again.', yes: 'Delete result', tone: 'danger' }))) return;
      const r = await act('result_delete', { id: x.id }); if (!r.ok) return;
      UI.toast('Result deleted'); changed('results');
    },
    async dReset(b) {
      const s = cur(); if (!s) return;
      if (!(await UI.confirm({ title: 'Reset devices for ' + nameOf(s) + '?', text: 'Every phone is signed out. They sign in again with the same code.', yes: 'Reset devices' }))) return;
      await UI.busy(b, async () => { const r = await act('student_devices_reset', { id: s.id }); if (r.ok) { s.devices = 0; UI.toast('Devices reset'); drawDrawer(); changed(); } });
    },
    dMax(b) { const s = cur(); if (max == null) max = s.max_devices || 2; max = Math.max(1, Math.min(10, max + Number(b.dataset.v))); AX.set(el.querySelector('#s3-max'), String(max)); const sv = el.querySelector('#s3-maxsave'); if (sv) sv.classList.toggle('hide', max === (s.max_devices || 2)); },
    async dMaxSave(b) {
      const s = cur(); if (!s || max == null) return;
      await UI.busy(b, async () => { const r = await act('student_update', { id: s.id, name: nameOf(s), max_devices: max }); if (r.ok) { s.max_devices = max; max = null; UI.toast('Saved · up to ' + s.max_devices + ' phones'); drawDrawer(); changed(); } });
    },
    async dName(b) {
      const s = cur(), f = el.querySelector('#s3-name'); AX.f.clearErrors(f);
      const name = String(AX.f.read(f).name || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) return AX.f.error(f, 'name', 'Enter a name');
      await UI.busy(b, async () => { const r = await act('student_update', { id: s.id, name, max_devices: s.max_devices || 2 }); if (r.ok) { s.name = name; UI.toast('Saved'); drawDrawer(); changed(); } });
    },
    dCode: () => newCode(cur()),
    dMsg: () => msgSheet(cur()),
    async dBlock(b) {
      const s = cur(), block = s.status !== 'blocked';
      if (block && !(await UI.confirm({ title: 'Block ' + nameOf(s) + '?', text: 'They cannot sign in until you unblock them. Their results and access stay.', yes: 'Block', tone: 'danger' }))) return;
      await UI.busy(b, async () => { const r = await act('student_block', { id: s.id, block }); if (r.ok) { s.status = block ? 'blocked' : s.has_code === false ? 'pending' : 'approved'; UI.toast(block ? 'Student blocked' : 'Student unblocked'); drawDrawer(); changed(); } });
    },
    dSusp: () => suspendForm(cur()),
    async dLift(b) {
      const s = cur();
      if (!(await UI.confirm({ title: 'Lift suspension?', text: nameOf(s) + ' can use the app and website again at once. The suspension notice goes away on their phone.', yes: 'Yes, lift it' }))) return;
      await UI.busy(b, async () => { const r = await AX.api.call('cbt_admin_cheat', 'lift', { mobile: s.mobile }); if (!r.ok) return UI.err(r); UI.toast('Suspension lifted'); AX.cache.drop('cheat'); DR.cheat = await cheat(true); changed('cheat'); });
    },
    async dDel() {
      const s = cur();
      if (!(await UI.confirm({ title: 'Delete ' + nameOf(s) + ' permanently?', text: 'Their account, access and results are deleted. This cannot be undone.', yes: 'Delete', tone: 'danger', typeWord: 'DELETE' }))) return;
      const r = await act('student_delete', { id: s.id }); if (!r.ok) return;
      DR.api.close(); UI.toast('Student deleted'); V.sel.delete(s.id); changed('results');
    }
  });
}
function suspendForm(s) {
  const DUR = [['', 'Until I lift it'], ['24', '24 hours'], ['72', '3 days'], ['168', '7 days'], ['720', '30 days']];
  UI.modal({ title: 'Suspend ' + nameOf(s), sub: 'The app and website show a full-screen notice with a Support button instead of the tests. Nothing else is deleted.', size: 'narrow',
    body: h`<form id="sf" class="col gap16" onsubmit="return false">${AX.f.select({ name: 'hours', label: 'How long', value: '', options: DUR.map(([value, label]) => ({ value, label })) })}${AX.f.textarea({ name: 'reason', label: 'Message the student sees', rows: 4, max: 500, value: 'You were found cheating in the test "". Your ID is suspended. Talk to the support team within 24 hours to solve this.' })}</form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn danger solid" data-act="go" data-busy="Suspending…">${icon('shield', 16)} Suspend now</button>`,
    onOpen(el, close) { AX.act(el, { async go(b) {
      const d = AX.f.read(el.querySelector('#sf'));
      await UI.busy(b, async () => { const r = await AX.api.call('cbt_admin_cheat', 'suspend', { mobile: s.mobile, hours: d.hours, reason: String(d.reason || '').trim() }); if (!r.ok) return UI.err(r); close(); UI.toast('Suspended'); AX.cache.drop('cheat'); if (DR) DR.cheat = await cheat(true); changed('cheat'); });
    } }); } });
}
})();
