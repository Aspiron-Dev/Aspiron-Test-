/* =====================================================================
   Access check (owner only, read only). Server: cbt_admin_access_check (supabase_v80_access_check.sql).
   For every PAID series (the server reads them from the series table, so a series made later shows up by itself):
   the students who HAVE the series, and what payment is on record for it.
     Paid order · Payment on record but the series is not named (a hand-added payment or an order for another series)
     · No payment record.  "No payment record" is NOT "did not pay" — students who joined before the store were paid by hand.
   Nothing is changed here. A row opens the student. Links: #/access · #/access/<seriesId> · #/access/<seriesId>/<order|other|none>
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
const B = {
  order: { t: 'Paid order for this series', tone: 'ok', ic: 'checkCircle', color: 'var(--ok)' },
  other: { t: 'Payment on record, series not named', tone: 'warn', ic: 'wallet', color: 'var(--warn)' },
  none: { t: 'No payment record', tone: 'bad', ic: 'alert', color: 'var(--bad)' }
};
const ST = { q: '', n: 60 };
const load = force => AX.cache.get('access_check', () => AX.api.call('cbt_admin_access_check', 'get'), 60000, force);
const link = (sid, b) => '#/access' + (sid ? '/' + encodeURIComponent(sid) + (b && b !== 'all' ? '/' + b : '') : '');
const detail = r => r.b === 'order'
  ? h`Order ${r.code} · ${fmt.inr(r.amt)}${r.at ? ' · ' + fmt.day(r.at) : ''}${r.trashed ? ' · the order was deleted from Orders' : ''}${r.orders > 1 ? ' · +' + (r.orders - 1) + ' more' : ''}`
  : r.b === 'other'
    ? h`${r.manual ? 'Hand-added payments ' + fmt.inr(r.manual_amt) + ' (' + r.manual + ')' + (r.manual_on ? ' · last ' + fmt.day(r.manual_on) : '') : ''}${r.manual && r.other ? ' · ' : ''}${r.other ? 'paid order for another series ×' + r.other : ''} · the series is not named`
    : h`No payment record · joined ${r.joined ? fmt.day(r.joined) : '—'}`;

AX.mod({
  id: 'access', title: 'Access check', short: 'Access', icon: 'shieldCheck', group: 'Students & accounts', order: 12, perm: 'owner',
  sub: 'Who has each paid series, and what payment is on record for it. Read only.',
  async render(ctx) {
    const sid = ctx.parts[0] ? decodeURIComponent(ctx.parts[0]) : '', bk = ['order', 'other', 'none'].includes(ctx.parts[1]) ? ctx.parts[1] : 'all';
    ctx.head({ title: 'Access check', sub: 'Who has each paid series, and what payment is on record for it. Read only.',
      actions: h`<button class="btn sm" data-act="csv">${icon('download', 15)} CSV</button><button class="btn sm" data-act="ref">${icon('refresh', 15)} Refresh</button>` });
    AX.set(ctx.el, h`${UI.skeleton(2)}<div class="mt16">${UI.skeleton(5)}</div>`);
    const r = await load(false);
    if (!ctx.alive()) return;
    const ph = document.getElementById('ax-ph');
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'In Supabase → SQL Editor run supabase_v80_access_check.sql, then supabase_v35_admin_team.sql, and refresh this page.' })}</div>` : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    const S = r.series || [], cur = S.find(x => x.id === sid) || null;
    if (ph) AX.act(ph, {
      ref: async b => { await UI.busy(b, async () => { AX.cache.drop('access_check'); ctx.reload(); }); },
      csv() {
        const lab = { order: 'Paid order for this series', other: 'Payment on record, series not named', none: 'No payment record' };
        AX.u.csvDownload('access-check.csv', [['Series', 'Name', 'Mobile', 'Result', 'Paid orders (this series)', 'Paid ₹ (this series)', 'Order code', 'Order deleted from Orders', 'Paid orders (other series)', 'Hand-added payments', 'Hand-added ₹', 'Joined'],
          ...S.flatMap(s => (s.rows || []).map(x => [s.title, x.name, x.mobile, lab[x.b], x.orders, x.amt, x.code || '', x.trashed ? 'yes' : '', x.other, x.manual, x.manual_amt, x.joined ? new Date(x.joined).toLocaleDateString('en-IN') : '']))]);
      }
    });
    if (!S.length) return AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'layers', title: 'No paid series yet', text: 'Series that are not free show here, with the students who have them.' })}</div>`);
    const card = s => { const t = Math.max(1, s.access), w = k => (s[k] || 0) * 100 / t;
      return h`<div class="card ac-card ${cur && cur.id === s.id ? 'on' : ''}"><a class="ac-h" href="${link(s.id)}"><b class="ell">${s.title}</b><span class="mut sm">${fmt.plural(s.access, 'student')} ${s.access === 1 ? 'has' : 'have'} it</span>${icon('chevR', 16)}</a>
        <div class="ac-bar" role="img" aria-label="${s.order} with a paid order, ${s.other} with a payment but no series named, ${s.none} with no payment record"><i style="width:${w('order')}%;background:var(--ok)"></i><i style="width:${w('other')}%;background:var(--warn)"></i><i style="width:${w('none')}%;background:var(--bad)"></i></div>
        <div class="ac-chips">${join(['order', 'other', 'none'], k => h`<a class="ac-chip ${B[k].tone}" href="${link(s.id, k)}" title="${B[k].t}">${icon(B[k].ic, 14)}<b class="num">${s[k]}</b><span>${k === 'order' ? 'Paid order' : k === 'other' ? 'Series not named' : 'No record'}</span></a>`)}</div></div>`; };
    // one series open: only its card and its students, at the top of the page (on a phone the list was far below the cards)
    const used = S.filter(s => s.access > 0), empty = S.filter(s => !s.access);
    AX.set(ctx.el, cur
      ? h`<a class="btn sm ac-back" href="#/access">${icon('chevL', 15)} All series</a><div class="ac-grid mt12">${card(cur)}</div><div id="ac-list" class="mt16"></div>`
      : h`<div class="callout info">${icon('info')}<div class="sm"><b>“No payment record” is not “did not pay”.</b> Students who joined before the store were paid by hand, and a hand-added payment does not say which series it was for. Look at each student before changing anything. This page only shows; nobody loses access from here.</div></div>
      <div class="ac-grid mt16">${join(used, card)}</div>${empty.length ? h`<div class="xs mut mt12 ac-empty">No students yet: ${empty.map(s => s.title).join(' · ')}</div>` : ''}<div id="ac-list" class="mt16"></div>`);
    if (cur) window.scrollTo(0, 0);
    if (!cur) return AX.set('#ac-list', h`<div class="xs mut">Tap a series, or one of its numbers, to see the students.</div>`);
    const rows = () => {
      const q = ST.q.trim().toLowerCase(), all = (cur.rows || []).filter(x => bk === 'all' || x.b === bk), L = all.filter(x => !q || String(x.name || '').toLowerCase().includes(q) || String(x.mobile || '').includes(q));
      const V = L.slice(0, ST.n);
      AX.set('#ac-rows', L.length ? h`<div class="card pad0 list">${join(V, x => h`<button type="button" class="li click ac-row" data-act="open" data-id="${x.id}">${UI.avatar(x.name || 'Student', x.mobile, 'sm')}<div class="grow"><div class="t ell">${x.name || 'Student'} <span class="mono mut xs">${fmt.mobile(x.mobile)}</span></div><div class="s ac-d">${detail(x)}</div></div><span class="pill ${B[x.b].tone}">${x.b === 'order' ? 'Paid order' : x.b === 'other' ? 'Series not named' : 'No record'}</span>${icon('chevR', 16)}</button>`)}</div>${L.length > V.length ? h`<div class="row center mt12"><button class="btn sm" data-act="more">Show ${Math.min(60, L.length - V.length)} more · ${L.length - V.length} left</button></div>` : ''}`
        : h`<div class="card">${UI.empty({ icon: 'search', title: q ? 'No student matches' : 'Nobody here', text: q ? 'Try another name or mobile number.' : 'No student in this group.' })}</div>`);
    };
    AX.set('#ac-list', h`<div class="ac-lh"><h3 class="ell">${cur.title}</h3><div class="chips">${join([['all', 'All', cur.access], ['order', 'Paid order', cur.order], ['other', 'Series not named', cur.other], ['none', 'No payment record', cur.none]], ([k, t, n]) => h`<a class="chip ${bk === k ? 'on' : ''}" href="${link(cur.id, k)}">${t}<em>${n}</em></a>`)}</div></div>
      <div class="inp-wrap search ac-q mt12">${icon('search', 16)}<input class="inp sm" type="search" data-act="q" placeholder="Search name or mobile" value="${ST.q}" aria-label="Search students"></div><div id="ac-rows" class="mt12"></div>`);
    rows();
    AX.act(ctx.el, { open: b => { const id = b.dataset.id; if (AX.openStudent) AX.openStudent(id); else AX.go('students/' + id); }, more: () => { ST.n += 60; rows(); }, retry: () => ctx.reload() });
    AX.act(ctx.el, { q: AX.u.debounce(el => { ST.q = el.value; ST.n = 60; rows(); }, 150) }, 'input');
  }
});

AX.css('access', `
.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.ac-card{display:flex;flex-direction:column;gap:10px;padding:14px 16px;position:relative}
.ac-h::after{content:'';position:absolute;inset:0;border-radius:inherit}   /* the whole card opens the series */
.ac-chips{position:relative;z-index:1}
.ac-card.on .ac-h::after{display:none}
.ac-card.on{border-color:var(--pri-line);box-shadow:0 0 0 3px color-mix(in srgb,var(--pri) 12%,transparent)}
.ac-h{display:flex;align-items:center;gap:10px;color:var(--tx);text-decoration:none!important;min-width:0}
.ac-h b{flex:1;min-width:0;font-size:15.5px}
.ac-bar{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--hover);border:1px solid var(--line)}
.ac-bar i{display:block;height:100%}
.ac-chips{display:flex;gap:8px;flex-wrap:wrap}
.ac-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9px;font-size:12.5px;font-weight:650;text-decoration:none!important;background:var(--hover);color:var(--tx-2)}
.ac-chip b{font-size:14px;color:var(--tx)}
.ac-chip.ok .ax-ic{color:var(--ok)}.ac-chip.warn .ax-ic{color:var(--warn)}.ac-chip.bad .ax-ic{color:var(--bad)}
.ac-chip:hover{background:var(--solid-3)}
.ac-chip,.ac-h{cursor:pointer;-webkit-tap-highlight-color:transparent}
.ac-chip:active,.ac-h:active{opacity:.7}
.ac-back{align-self:flex-start}
.ac-lh{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ac-lh h3{font-family:var(--font-display);font-size:20px;font-weight:600;letter-spacing:-.015em}
.ac-lh .chips{margin-left:auto}
.ac-q{width:min(320px,100%)}
.ac-row{width:100%;border:0;border-top:1px solid var(--line);background:none;text-align:left;color:var(--tx)}
.ac-row:first-child{border-top:0}
.ac-d{white-space:normal}
@media (max-width:759px){.ac-lh .chips{margin-left:0;width:100%}.ac-q{width:100%}.ac-row{flex-wrap:wrap}}
`);
})();
