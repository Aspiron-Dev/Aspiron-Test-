/* =====================================================================
   Series page (new student design): for each test series its validity (starts / ends), the lines "This series
   includes", the upgrade plans (store items the student can move up to) and a short syllabus for each test; plus one
   banner shown on the Tests tab of every series page.
   Server: cbt_admin_series_meta (supabase_v64_series_page.sql) · permission: Store (view = look, full = save)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI } = AX;
const can = () => AX.can('store', 'manage');
const LINK_RE = /^(https:\/\/|#\/|store\.html#)[^\s"'<>\\]*$/;
const ERR = { date: 'The end must be after the start.', upgrades: 'Pick at most 4 plans that are still in the store.', features: 'Too many lines (20 at most).', series: 'This series no longer exists.', link: 'That link does not look right', image: 'The picture is too big. Try a smaller one.' };

AX.mod({
  id: 'seriespage', title: 'Series page', short: 'Series page', icon: 'layers', group: 'Sales & billing', order: 23, perm: 'store',
  sub: 'Validity, upgrade plans, syllabus and banner of each test series page (new design).',
  async render(ctx) {
    ctx.head({ title: 'Series page', sub: 'What students see when they open a test series in the new design: when it starts and ends, what it includes, the plans they can upgrade to, a syllabus for each test, and a banner on the Tests tab.' });
    AX.set(ctx.el, UI.skeleton(4));
    const r = await AX.api.call('cbt_admin_series_meta', 'get');
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing'
        ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v64_series_page.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again. Until then the series pages show no dates, plans or syllabus.' })}</div>`
        : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    const edit = can(), items = r.items || [];
    let promo;   // undefined = keep, '' = remove, data URL = new
    const promoNow = () => promo !== undefined ? promo : r.promo;
    const promoBox = () => promoNow()
      ? h`<img src="${promoNow()}" alt="" style="width:100%;max-width:520px;aspect-ratio:2.6/1;object-fit:cover;border-radius:14px;display:block">`
      : h`<div class="dropzone" data-act="pPick" style="max-width:520px">${icon('image', 22)}<div class="b mt8">Choose banner</div><div class="xs">JPG / PNG · 1300 × 500 px</div></div>`;
    const sCard = s => {
      const up = new Map((s.u || []).map(u => [u.item, u.label || '']));
      return h`<details class="card" data-sid="${s.id}"><summary class="row" style="cursor:pointer;gap:10px;list-style:none">
          <div class="grow"><b>${s.title}</b><div class="xs mut">${[s.is_free ? 'Free' : 'Premium', s.active ? '' : 'hidden', s.e ? 'ends ' + AX.fmt.date(s.e) : 'no end date', (s.u || []).length ? (s.u || []).length + ' plan(s)' : ''].filter(Boolean).join(' · ')}</div></div>${icon('chevR', 18)}</summary>
        <form class="col gap16 mt12" data-form="${s.id}" autocomplete="off" novalidate>
          <div class="grid g2">${UI.dtField({ name: 'starts_at', label: 'Starts on', value: s.s || null, clear: true })}${UI.dtField({ name: 'ends_at', label: 'Ends on (moves to Expired after this)', value: s.e || null, clear: true })}</div>
          ${AX.f.textarea({ name: 'features', label: 'This series includes (one per line)', value: (s.f || []).join('\n'), rows: 5, placeholder: 'Full syllabus mock tests\nAll India rank after every test\nDetailed solutions', disabled: !edit })}
          <div class="fld"><label>Upgrade plans (store items the student can move up to, at most 4)</label>
            <div class="col gap8">${items.length ? join(items, it => h`<div class="row wrap" style="gap:10px">
              <label class="check" style="flex:1 1 200px"><input type="checkbox" data-up="${it.id}" ${up.has(it.id) ? raw('checked') : ''} ${edit ? '' : raw('disabled')}><span>${it.title} <span class="xs mut">₹${it.price}${it.active ? '' : ' · hidden'}</span></span></label>
              <input class="inp" style="flex:1 1 160px" data-lab="${it.id}" maxlength="40" placeholder="Name shown (e.g. Pro)" value="${up.get(it.id) || ''}" ${edit ? '' : raw('disabled')}></div>`) : h`<span class="sm mut">No store items yet.</span>`}</div></div>
          ${edit ? h`<div class="row end"><button type="button" class="btn pri" data-act="sSave" data-sid="${s.id}">${icon('check', 16)} Save series</button></div>` : ''}
          <div class="fld"><label>Syllabus of each test (shown under "View syllabus")</label>
            <div class="col gap12">${(s.tests || []).length ? join(s.tests, t => h`<div class="col gap8"><b class="sm">${t.title}</b>
              <textarea class="inp" rows="2" data-syl="${t.id}" maxlength="1500" placeholder="e.g. Mole concept, Atomic structure" ${edit ? '' : raw('disabled')}>${t.syllabus || ''}</textarea>
              ${edit ? h`<div class="row end"><button type="button" class="btn sm" data-act="tSave" data-tid="${t.id}">${icon('check', 14)} Save syllabus</button></div>` : ''}</div>`) : h`<span class="sm mut">No tests in this series yet.</span>`}</div></div>
        </form></details>`;
    };
    AX.set(ctx.el, h`<div class="col gap16">
      <div class="callout info">${icon('info')}<div class="sm">Students see this in the <b>new design</b> (beta): My Test Series shows the dates, and the series page has <b>Description</b> (plans, what it includes), <b>Resources</b> (the files you upload in Tests → series), <b>Tests</b> and <b>Reviews</b>. Test groups on the Tests tab are the series' folders.</div></div>
      <div class="card"><div class="card-h">${icon('image')}<h3>Banner on the Tests tab</h3><span class="grow"></span>${edit ? '' : UI.pill('View only')}</div>
        <div id="sp-prev">${promoBox()}</div>
        ${edit ? h`<div class="row wrap mt12" style="gap:8px"><button type="button" class="btn sm" data-act="pPick">${icon('image', 15)} Choose banner</button><button type="button" class="btn sm ghost" data-act="pRm">${icon('trash', 15)} Remove</button></div>` : ''}
        <form id="sp-pf" class="mt12" autocomplete="off" novalidate>${AX.f.input({ name: 'link', label: 'Link when tapped (optional)', value: r.promo_link || '', max: 300, inputmode: 'url', disabled: !edit, placeholder: 'https://… or store.html#x=<item id>' })}</form>
        ${edit ? h`<div class="row end mt12"><button type="button" class="btn pri" data-act="pSave">${icon('check', 16)} Save banner</button></div>` : ''}</div>
      <div class="section-t">Test series</div>
      ${(r.series || []).length ? join(r.series, sCard) : h`<div class="card">${UI.empty({ icon: 'layers', title: 'No test series yet' })}</div>`}</div>`);
    UI.wire(ctx.el);
    if (!edit) return;
    AX.act(ctx.el, {
      async pPick() { const f = await AX.u.pickFile('image/*'); if (!f) return;
        try { promo = await AX.u.poster(f, { w: 1300, h: 500, limit: 380000 }); AX.set(ctx.el.querySelector('#sp-prev'), promoBox()); } catch (e) { UI.toast('Could not use this image', { tone: 'bad' }); } },
      pRm() { promo = ''; AX.set(ctx.el.querySelector('#sp-prev'), promoBox()); },
      async pSave(btn) { const f = ctx.el.querySelector('#sp-pf'); AX.f.clearErrors(f); const link = String(AX.f.read(f).link || '').trim();
        if (link && !LINK_RE.test(link)) return AX.f.error(f, 'link', 'Link must start with https://, #/ or store.html#');
        const data = { link }; if (promo !== undefined) data.promo = promo;
        await UI.busy(btn, async () => { const x = await AX.api.call('cbt_admin_series_meta', 'save_promo', data);
          if (!x.ok) return x.error === 'link' ? AX.f.error(f, 'link', ERR.link) : UI.toast(ERR[x.error] || 'Could not save', { tone: 'bad' });
          r.promo = promoNow(); promo = undefined; UI.toast('Banner saved'); }); },
      async sSave(btn) { const sid = btn.dataset.sid, f = ctx.el.querySelector(`[data-form="${sid}"]`), d = AX.f.read(f);
        const ups = [...f.querySelectorAll('[data-up]')].filter(c => c.checked).map(c => ({ item: c.dataset.up, label: (f.querySelector(`[data-lab="${c.dataset.up}"]`).value || '').trim() }));
        if (ups.length > 4) return UI.toast('Pick at most 4 plans', { tone: 'bad' });
        if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) return UI.toast(ERR.date, { tone: 'bad' });
        const features = String(d.features || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20);
        await UI.busy(btn, async () => { const x = await AX.api.call('cbt_admin_series_meta', 'save_series', { series_id: sid, starts_at: d.starts_at || null, ends_at: d.ends_at || null, features, upgrades: ups });
          if (!x.ok) return UI.toast(ERR[x.error] || 'Could not save', { tone: 'bad' });
          UI.toast('Saved. Students see it the next time they open the series.'); AX.emit('data:changed'); }); },
      async tSave(btn) { const tid = btn.dataset.tid, ta = ctx.el.querySelector(`[data-syl="${tid}"]`);
        await UI.busy(btn, async () => { const x = await AX.api.call('cbt_admin_series_meta', 'save_syllabus', { test_id: tid, syllabus: ta.value.trim() });
          if (!x.ok) return UI.err(x); UI.toast('Syllabus saved'); }); }
    });
  },
  async search(q) {
    const words = 'series page validity upgrade plan syllabus banner expiry ends starts'.split(' ');
    return q.length >= 3 && words.some(w => w.startsWith(q)) ? [{ g: 'Pages', title: 'Series page', sub: 'Validity, plans, syllabus, banner', icon: 'layers', go: '#/seriespage' }] : [];
  }
});
AX.actions.push({ label: 'Series page: validity, plans, syllabus', icon: 'layers', perm: ['store'], run() { AX.go('seriespage'); } });
})();
