/* =====================================================================
   Test feedback: the stars and comment a student gives a test right after submitting it.
   Private (not shown on the store). Server: cbt_admin_test_reviews (supabase_v67_test_reviews.sql)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('reviews', 'manage');
const F = { tests: [], items: [] };
const stars = n => raw('<span style="letter-spacing:1px;white-space:nowrap">' + '<span style="color:#f5a524">★</span>'.repeat(n) + '<span style="color:var(--line-2)">★</span>'.repeat(5 - n) + '</span>');
async function load(force) {
  return AX.cache.get('testfb', async () => { const r = await AX.api.call('cbt_admin_test_reviews', 'get'); if (r.ok) { F.tests = r.tests || []; F.items = r.items || []; } return r; }, 30000, force);
}

AX.mod({
  id: 'testfb', title: 'Test feedback', icon: 'star', group: 'Communication', order: 21, perm: 'reviews',
  sub: 'How students rated each test, right after submitting it.',
  async render(ctx) {
    ctx.head({ title: 'Test feedback', sub: 'Stars and a short comment from students, asked right after they submit a test. Only you and your team see these.' });
    AX.set(ctx.el, UI.skeleton(5));
    const r = await load(true);
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v67_test_reviews.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    const tid = ctx.q.t || '', low = ctx.q.f === 'low';
    const n = F.items.length, avg = n ? F.items.reduce((s, x) => s + x.rating, 0) / n : 0, lowN = F.items.filter(x => x.rating <= 2).length;
    const tt = id => F.tests.find(t => t.id === id) || {};
    const base = F.items.filter(x => (!tid || x.test_id === tid) && (!low || x.rating <= 2));
    AX.set(ctx.el, h`<div class="grid g3">
        <div class="kpi glass hero gold"><div class="k-l">${icon('star', 16)} Average rating</div><div class="row" style="align-items:flex-end;gap:12px"><div class="k-v">${n ? avg.toFixed(1) : '—'}</div><div style="padding-bottom:6px">${stars(Math.round(avg))}</div></div><div class="xs mut">${n} rating${n === 1 ? '' : 's'} (newest 500)</div></div>
        <div class="kpi"><div class="k-l">${icon('fileText', 16)} Tests rated</div><div class="k-v">${F.tests.length}</div></div>
        <div class="kpi"><div class="k-l">${icon('alert', 16)} 1–2 stars</div><div class="k-v">${lowN}</div><div class="xs mut">Read these first</div></div></div>
      <div class="card mt16"><div class="card-h">${icon('list', 18)}<h3>By test</h3></div>
        ${F.tests.length ? h`<div class="col">${join(F.tests, t => h`<a class="row" style="padding:10px 0;border-top:1px solid var(--line);gap:12px;text-decoration:none;color:inherit" href="${AX.link('testfb', { t: t.id })}">
            <div class="grow"><b>${t.title}</b><div class="xs mut">${t.series || ''} · last ${fmt.dt(t.last)}</div></div>${t.low ? UI.pill(t.low + ' low', 'bad') : ''}<span class="num b">${(+t.avg).toFixed(1)}</span>${stars(Math.round(+t.avg))}<span class="xs mut" style="width:56px;text-align:right">${t.n} rating${t.n === 1 ? '' : 's'}</span></a>`)}</div>`
          : UI.empty({ icon: 'star', title: 'No ratings yet', text: 'Students are asked “How was your test?” right after they submit.' })}</div>
      <div class="row wrap mt16" style="gap:12px"><div class="chips"><a class="chip ${!low ? 'on' : ''}" href="${AX.link('testfb', tid ? { t: tid } : {})}">All</a><a class="chip ${low ? 'on' : ''}" href="${AX.link('testfb', Object.assign({ f: 'low' }, tid ? { t: tid } : {}))}">1–2 stars</a></div>
        ${tid ? h`<a class="chip on" href="${AX.link('testfb', low ? { f: 'low' } : {})}">${tt(tid).title || 'Test'} ✕</a>` : ''}
        <div class="inp-wrap search" style="width:min(280px,100%)">${icon('search', 16)}<input class="inp sm" data-act="q" placeholder="Search name, mobile, text"></div></div>
      <div class="col gap16 mt16" id="tf-list"></div>`);
    const row = x => h`<div class="card"><div class="row top">${UI.avatar(x.name, x.mobile)}
        <div class="grow"><div class="row wrap gap6"><b>${x.name}</b>${stars(x.rating)}</div>
          <div class="xs mut">${fmt.mobile(x.mobile)} · ${tt(x.test_id).title || 'Test'} · ${fmt.dt(x.at)}</div>
          ${x.body ? h`<p class="mt8" style="white-space:pre-wrap;line-height:1.6">${x.body}</p>` : ''}</div>
        ${can() ? h`<button class="ibtn sm" data-act="del" data-id="${x.id}" aria-label="Delete">${icon('trash', 15)}</button>` : ''}</div></div>`;
    const drawList = (q = '') => { q = q.trim().toLowerCase(); const L = base.filter(x => !q || (x.name + ' ' + x.mobile + ' ' + x.body).toLowerCase().includes(q));
      AX.set('#tf-list', L.length ? join(L, row) : h`<div class="card">${UI.empty({ icon: 'star', title: n ? 'Nothing here' : 'No ratings yet', text: n ? 'Try another filter or search.' : 'They appear here as students submit tests.' })}</div>`); };
    drawList();
    AX.act(ctx.el, {
      retry: () => ctx.reload(),
      async del(el) { const x = F.items.find(i => i.id === el.dataset.id); if (!x || !(await UI.confirm({ title: 'Delete the rating by ' + x.name + '?', text: 'This cannot be undone.', yes: 'Delete', tone: 'danger' }))) return;
        const r2 = await AX.api.call('cbt_admin_test_reviews', 'delete', { id: x.id }); if (!r2.ok) return UI.err(r2); UI.toast('Rating deleted'); AX.cache.drop('testfb'); ctx.reload(); }
    });
    AX.act(ctx.el, { q: AX.u.debounce(el => drawList(el.value), 200) }, 'input');
  }
});
})();
