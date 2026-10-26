/* =====================================================================
   Reviews: ratings from students with an unlocked series, shown on the store (first name + initial, photo if chosen).
   Server: cbt_admin_reviews (supabase_v23_reviews.sql)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('reviews', 'manage');
const R = { items: [], moderate: false, at: 0 };
const stars = n => raw('<span style="letter-spacing:1px;white-space:nowrap">' + '<span style="color:#f5a524">★</span>'.repeat(n) + '<span style="color:var(--line-2)">★</span>'.repeat(5 - n) + '</span>');
async function load(force) {
  return AX.cache.get('reviews', async () => { const r = await AX.api.call('cbt_admin_reviews', 'get'); if (r.ok) { R.items = r.items || []; R.moderate = !!r.moderate; R.at = Date.now(); } return r; }, 30000, force);
}

AX.mod({
  id: 'reviews', title: 'Reviews', icon: 'star', group: 'Engagement', order: 20, perm: 'reviews',
  sub: 'Ratings and reviews shown on the store.',
  async render(ctx) {
    const f = ctx.q.f || 'all';
    ctx.head({ title: 'Reviews', sub: 'Ratings from students whose series is unlocked. The store shows first name + initial and their photo (if they chose). Mobile numbers are only visible here.' });
    AX.set(ctx.el, UI.skeleton(5));
    const [r, cat] = await Promise.all([load(true), AX.data.catalog()]);
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v23_reviews.sql once in Supabase → SQL Editor.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    const ser = id => ((cat.ok && cat.series) || []).find(s => s.id === id);
    const shown = R.items.filter(x => x.status === 'shown'), avg = shown.length ? shown.reduce((s, x) => s + x.rating, 0) / shown.length : 0;
    const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: shown.filter(x => x.rating === n).length }));
    const sid = ctx.q.s || '';
    const base = R.items.filter(x => (f === 'all' || x.status === f) && (!sid || x.series_id === sid));
    const sids = [...new Set(R.items.map(x => x.series_id))];
    const cnt = k => k === 'all' ? R.items.length : R.items.filter(x => x.status === k).length;
    AX.set(ctx.el, h`<div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:stretch">
        <div class="kpi glass hero gold"><div class="k-l">${icon('star', 16)} Average rating on the store</div><div class="row" style="align-items:flex-end;gap:12px"><div class="k-v">${shown.length ? avg.toFixed(1) : '—'}</div><div style="padding-bottom:6px">${stars(Math.round(avg))}</div></div><div class="k-f">${fmt.plural(shown.length, 'review')} shown</div></div>
        <div class="card"><div class="col gap6">${join(dist, d => h`<div class="row sm"><span style="width:28px" class="b">${d.n}★</span><div class="bar-meter gold grow"><i style="width:${shown.length ? Math.round(d.c * 100 / shown.length) : 0}%"></i></div><span class="num mut" style="width:28px;text-align:right">${d.c}</span></div>`)}</div></div></div>
      <div class="card row wrap mt16" style="gap:14px"><span class="av" style="--c:${R.moderate ? '#c9a45c' : '#14b8a6'}">${icon('shieldCheck', 18)}</span><div class="grow"><b>Check reviews before they show</b><div class="sm mut">${R.moderate ? 'On — new and edited reviews wait here until you tap Show.' : 'Off — reviews show on the store straight away. You can still hide or delete any of them.'}</div></div>${can() ? h`<label class="sw"><input type="checkbox" data-act="mod" ${R.moderate ? raw('checked') : ''}><i></i></label>` : UI.pill(R.moderate ? 'On' : 'Off')}</div>
      <div class="row wrap mt16" style="gap:12px"><div class="chips">${join([['all', 'All'], ['pending', 'Waiting'], ['shown', 'Shown'], ['hidden', 'Hidden']], ([k, l]) => h`<a class="chip ${f === k ? 'on' : ''} ${k === 'pending' && cnt('pending') ? 'alert' : ''}" href="${AX.link('reviews', Object.assign({ f: k }, sid ? { s: sid } : {}))}">${l}<em>${cnt(k)}</em></a>`)}</div><span class="grow"></span>
        ${sids.length > 1 ? h`<select class="inp sm" style="width:auto;max-width:220px" data-act="ser"><option value="">All series</option>${join(sids, s => h`<option value="${s}" ${s === sid ? raw('selected') : ''}>${(ser(s) || {}).title || 'Series'}</option>`)}</select>` : ''}
        <div class="inp-wrap search" style="width:min(280px,100%)">${icon('search', 16)}<input class="inp sm" data-act="q" placeholder="Search name, mobile, text"></div></div>
      <div class="col gap16 mt16" id="rv-list"></div>`);
    const row = x => h`<div class="card"><div class="row top">${x.photo && /^data:image\//.test(x.photo) ? h`<img src="${x.photo}" alt="" class="av" style="object-fit:cover">` : UI.avatar(x.name, x.mobile)}
          <div class="grow"><div class="row wrap gap6"><b>${x.name}</b>${stars(x.rating)}${x.status === 'shown' ? UI.pill('Shown', 'ok') : x.status === 'pending' ? UI.pill('Waiting', 'warn') : UI.pill('Hidden', 'bad')}${x.pinned ? UI.pill('Pinned', 'gold') : ''}</div>
            <div class="xs mut">${fmt.mobile(x.mobile)} · ${(ser(x.series_id) || {}).title || 'Series'} · ${fmt.dt(x.updated_at)}</div>
            ${x.body ? h`<p class="mt8" style="white-space:pre-wrap;line-height:1.6">${x.body}</p>` : ''}
            ${x.reply ? h`<div class="well mt12 sm"><b>Your reply:</b> ${x.reply}</div>` : ''}</div></div>
          ${can() ? h`<div class="row wrap mt12 end">${x.status !== 'shown' ? h`<button class="btn sm soft" data-act="st" data-id="${x.id}" data-v="shown">${icon('eye', 14)} Show</button>` : h`<button class="btn sm" data-act="st" data-id="${x.id}" data-v="hidden">${icon('eyeOff', 14)} Hide</button>`}
            <button class="btn sm" data-act="pin" data-id="${x.id}">${icon('pin', 14)} ${x.pinned ? 'Unpin' : 'Pin to top'}</button><button class="btn sm" data-act="reply" data-id="${x.id}">${icon('msg', 14)} ${x.reply ? 'Edit reply' : 'Reply'}</button>
            ${x.photo ? h`<button class="btn sm ghost" data-act="photo" data-id="${x.id}">Remove photo</button>` : ''}<button class="ibtn sm" data-act="del" data-id="${x.id}" aria-label="Delete">${icon('trash', 15)}</button></div>` : ''}</div>`;
    const drawList = (q = '') => { q = q.trim().toLowerCase(); const L = base.filter(x => !q || (x.name + ' ' + x.mobile + ' ' + x.body).toLowerCase().includes(q));
      AX.set('#rv-list', L.length ? join(L, row) : h`<div class="card">${UI.empty({ icon: 'star', title: R.items.length ? 'No reviews here' : 'No reviews yet', text: R.items.length ? 'Try another filter or search.' : 'Students see “Rate this series” on an unlocked series in the app.' })}</div>`); };
    drawList();
    const act = async (id, action, data, msg) => { const x = await AX.api.call('cbt_admin_reviews', action, Object.assign({ id }, data || {})); if (!x.ok) return UI.err(x); UI.toast(msg || 'Saved'); AX.cache.drop('reviews'); AX.emit('data:changed'); ctx.reload(); };
    AX.act(ctx.el, {
      retry: () => ctx.reload(),
      st: el => act(el.dataset.id, 'status', { status: el.dataset.v }, el.dataset.v === 'shown' ? 'Shown on the store' : 'Hidden'),
      pin: el => { const x = R.items.find(i => i.id === el.dataset.id); act(x.id, 'pin', { pinned: !x.pinned }, x.pinned ? 'Unpinned' : 'Pinned to top'); },
      async reply(el) { const x = R.items.find(i => i.id === el.dataset.id); const v = await UI.prompt({ title: 'Reply to ' + x.name, label: 'Shown under the review on the store. Leave empty to remove the reply.', value: x.reply || '', multiline: true, required: false }); if (v === null) return; act(x.id, 'reply', { reply: v }, v ? 'Reply saved' : 'Reply removed'); },
      photo: el => act(el.dataset.id, 'remove_photo', {}, 'Photo removed'),
      async del(el) { const x = R.items.find(i => i.id === el.dataset.id); if (!(await UI.confirm({ title: 'Delete the review by ' + x.name + '?', text: 'This cannot be undone.', yes: 'Delete', tone: 'danger' }))) return; act(x.id, 'delete', {}, 'Review deleted'); },
      async mod(el) { const x = await AX.api.call('cbt_admin_reviews', 'moderate', { on: el.checked }); if (!x.ok) { el.checked = !el.checked; return UI.err(x); } UI.toast(el.checked ? 'New reviews will wait for you' : 'Reviews show straight away'); AX.cache.drop('reviews'); ctx.reload(); }
    });
    AX.act(ctx.el, { ser: el => AX.go('reviews', Object.assign({ f }, el.value ? { s: el.value } : {})) }, 'change');
    AX.act(ctx.el, { q: AX.u.debounce(el => drawList(el.value), 200) }, 'input');
  },
  async attention() {
    const r = await load(); if (!r.ok) return [];
    const n = R.items.filter(x => x.status === 'pending').length;
    return n ? [{ title: 'Reviews waiting', sub: 'Show or hide them on the store', count: n, go: '#/reviews?f=pending', icon: 'star', tone: 'gold', badge: true }] : [];
  }
});
})();
