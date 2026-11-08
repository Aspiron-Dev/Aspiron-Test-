/* =====================================================================
   Tests page (new student design): the poster at the top of the Tests page, and the filter students use there
   (Exam · Class · Subject) with, for each store test series, which of them it is for.
   Server: cbt_admin_store_look (supabase_v61_tests_page.sql) · permission: Store (view = look, full = save)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI } = AX;
const can = () => AX.can('store', 'manage');
const LINK_RE = /^(https:\/\/|#\/|store\.html#)[^\s"'<>\\]*$/;
const LISTS = [['exams', 'e', 'Exam', 'NEET, JEE'], ['classes', 'c', 'Class', 'Class 11, Class 12, Dropper'], ['subjects', 's', 'Subject', 'Physics, Chemistry, Biology, Maths']];
// "NEET, JEE ,neet" → ["NEET","JEE"] (trimmed, no repeats, at most 20, each at most 30 characters)
const split = v => { const out = []; String(v || '').split(',').map(x => x.trim().replace(/[<>"\\]/g, '').slice(0, 30)).filter(Boolean)
  .forEach(x => { if (!out.some(y => y.toLowerCase() === x.toLowerCase())) out.push(x); }); return out.slice(0, 20); };

AX.mod({
  id: 'look', title: 'Tests page', short: 'Tests page', icon: 'image', group: 'Commerce', order: 22, perm: 'store',
  sub: 'Poster and filter of the Tests page in the new student design.',
  async render(ctx) {
    ctx.head({ title: 'Tests page', sub: 'The poster at the top of the Tests page (new student design) and the filter students use there: Exam, Class and Subject.' });
    AX.set(ctx.el, UI.skeleton(4));
    const r = await AX.api.call('cbt_admin_store_look', 'get');
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing'
        ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v61_tests_page.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again. Until then students see a plain poster and a filter guessed from the series names.' })}</div>`
        : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    const edit = can();
    const S = { poster: undefined, lists: { exams: r.exams || [], classes: r.classes || [], subjects: r.subjects || [] }, tags: {} };
    (r.items || []).forEach(i => { S.tags[i.id] = { e: i.e || [], c: i.c || [], s: i.s || [] }; });
    const posterNow = () => S.poster !== undefined ? S.poster : r.poster;
    const prev = () => posterNow()
      ? h`<img src="${posterNow()}" alt="" style="width:100%;max-width:360px;aspect-ratio:4/5;object-fit:cover;border-radius:14px;display:block">`
      : h`<div class="dropzone" data-act="pick" style="max-width:360px;aspect-ratio:4/5">${icon('image', 22)}<div class="b mt8">Choose poster</div><div class="xs">JPG / PNG · 4 : 5 (1080 × 1350)</div></div>`;
    const itemRow = i => h`<div class="card"><div class="row" style="gap:10px"><div class="grow"><b>${i.title}</b><div class="xs mut">${[i.course ? i.course.toUpperCase() : 'NEET and JEE', i.section, i.active ? '' : 'hidden in the store'].filter(Boolean).join(' · ')}</div></div></div>
      ${join(LISTS, ([k, t, label]) => S.lists[k].length ? h`<div class="mt12"><div class="xs mut b" style="margin-bottom:6px">${label}</div><div class="chips">${join(S.lists[k], v =>
        h`<button type="button" class="chip ${S.tags[i.id][t].includes(v) ? 'on' : ''}" data-act="tag" data-id="${i.id}" data-t="${t}" data-v="${v}" ${edit ? '' : raw('disabled')}>${v}</button>`)}</div></div>` : '')}</div>`;
    const items = () => (r.items || []).length ? join(r.items, itemRow) : h`<div class="card">${UI.empty({ icon: 'store', title: 'No store test series yet', text: 'Add them in Store first.' })}</div>`;
    const draw = () => AX.set(ctx.el, h`<div class="col gap16">
      <div class="callout info">${icon('info')}<div class="sm">Students see this in the <b>new design</b> (beta) of the app, on the <b>Tests</b> tab. The search bar sits on the top of the poster and the two big buttons on its bottom, so keep the top 15% and the bottom 25% of the picture plain.</div></div>
      <div class="card"><div class="card-h">${icon('image')}<h3>Poster</h3><span class="grow"></span>${edit ? '' : UI.pill('View only')}</div>
        <div class="row wrap" style="gap:16px;align-items:flex-start"><div id="lk-prev" style="flex:1 1 220px;max-width:360px">${prev()}</div>
          <div class="col gap12" style="flex:1 1 240px">
            ${edit ? h`<div class="row wrap" style="gap:8px"><button type="button" class="btn sm" data-act="pick">${icon('image', 15)} ${posterNow() ? 'Change poster' : 'Choose poster'}</button>${posterNow() ? h`<button type="button" class="btn sm ghost" data-act="rm">${icon('trash', 15)} Remove</button>` : ''}</div>` : ''}
            <form id="lk-f" autocomplete="off" novalidate>${AX.f.input({ name: 'link', label: 'Link when tapped (optional)', value: r.link || '', max: 300, inputmode: 'url', disabled: !edit, placeholder: 'https://… or store.html#x=<series id>', hint: 'Empty = the poster is only a picture.' })}</form>
            <p class="xs mut">Best size 1080 × 1350 px (4 : 5). Diwali, Holi, a new batch: change it any time. No poster = students see a plain dark card.</p></div></div></div>
      <div class="card"><div class="card-h">${icon('filter')}<h3>Filter lists</h3></div>
        <p class="sm mut">What students can pick in the filter. Separate the names with commas. Exam needs at least one.</p>
        <div class="grid g2 mt12">${join(LISTS, ([k, , label, ph]) => h`<div class="fld"><label for="lk-${k}">${label}</label><input class="inp" id="lk-${k}" data-list="${k}" value="${S.lists[k].join(', ')}" placeholder="${ph}" maxlength="400" ${edit ? '' : raw('disabled')}></div>`)}</div></div>
      <div class="card"><div class="card-h">${icon('layers')}<h3>Which series is for what</h3></div>
        <p class="sm mut">Tap to mark each store test series. Leave a row empty = it shows for every choice of that row (for example a full package for every subject).</p></div>
      <div class="grid g2" id="lk-items" style="align-items:start">${items()}</div>
      ${edit ? h`<div class="row end"><button type="button" class="btn pri" data-act="save">${icon('check', 16)} Save</button></div>` : ''}</div>`);
    draw();
    // a list typed in → the chips below follow (only that part is drawn again, so a tap on Save is never lost) (names taken out of a list leave every series)
    ctx.el.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.list; if (!k) return;
      S.lists[k] = split(e.target.value); const t = LISTS.find(x => x[0] === k)[1];
      Object.values(S.tags).forEach(g => { g[t] = g[t].filter(v => S.lists[k].includes(v)); }); AX.set(ctx.el.querySelector('#lk-items'), items()); });
    if (!edit) return;
    AX.act(ctx.el, {
      async pick() { const file = await AX.u.pickFile('image/*'); if (!file) return;
        try { S.poster = await AX.u.poster(file, { w: 1080, h: 1350, limit: 600000 }); const y = scrollY; draw(); scrollTo(0, y); } catch (e) { UI.toast('Could not use this image', { tone: 'bad' }); } },
      rm() { S.poster = ''; const y = scrollY; draw(); scrollTo(0, y); },
      tag(el) { const g = S.tags[el.dataset.id][el.dataset.t], v = el.dataset.v, i = g.indexOf(v); i > -1 ? g.splice(i, 1) : g.push(v); el.classList.toggle('on', i < 0); },
      async save(btn) {
        const f = ctx.el.querySelector('#lk-f'); AX.f.clearErrors(f);
        ctx.el.querySelectorAll('[data-list]').forEach(i => { S.lists[i.dataset.list] = split(i.value); });
        const link = String(AX.f.read(f).link || '').trim();
        if (link && !LINK_RE.test(link)) return AX.f.error(f, 'link', 'Link must start with https://, #/ or store.html#');
        if (!S.lists.exams.length) return UI.toast('Add at least one exam (for example NEET)', { tone: 'bad' });
        const data = { link, exams: S.lists.exams, classes: S.lists.classes, subjects: S.lists.subjects, tags: S.tags };
        if (S.poster !== undefined) data.poster = S.poster;
        await UI.busy(btn, async () => {
          const x = await AX.api.call('cbt_admin_store_look', 'save', data);
          if (!x.ok) return x.error === 'link' ? AX.f.error(f, 'link', 'That link does not look right') : x.error === 'image' ? UI.toast('The poster is too big. Try a smaller picture.', { tone: 'bad' })
            : x.error === 'list' ? UI.toast('Check the ' + ({ exams: 'Exam', classes: 'Class', subjects: 'Subject' }[x.list] || '') + ' list', { tone: 'bad' }) : UI.err(x);
          UI.toast('Saved. Students see it the next time they open the app.'); AX.emit('data:changed'); ctx.reload();
        });
      }
    });
  },
  async search(q) {
    const words = 'tests page poster filter exam class subject banner diwali holi'.split(' ');
    return q.length >= 3 && words.some(w => w.startsWith(q)) ? [{ g: 'Pages', title: 'Tests page', sub: 'Poster and filter (new design)', icon: 'image', go: '#/look' }] : [];
  }
});
AX.actions.push({ label: 'Tests page poster and filter', icon: 'image', perm: ['store'], run() { AX.go('look'); } });
})();
