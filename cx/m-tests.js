/* =====================================================================
   Test studio — the library: series → folders → tests.
   Routes: #/tests (library) · #/tests/s/<seriesId> (one series) · #/tests/all?f=live|sched|pending|draft|practice|attention (every test)
   Server (cbt_admin, same calls as the old panel): catalog · series_save/delete · folder_save/delete · test_save (details only)
   · test_delete · series_cover (+ cbt_admin_series_cover to keep the store copy in sync) · file_put (300,000-char chunks) / file_delete
   · cbt_admin2 duplicate · cbt_admin_practice set. The builder (m-builder.js) and import (m-import.js) do the rest.
   Exposes: AX.shareTest(id), AX.shareSeries(id).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const ms = v => { const x = AX.fmt.ms(v); return x ? Number(x) : null; };
const siteUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const COV = new Map();      // series id → cover data URL ('' = none)
let CUR = null, C = null, offT = null;
const canM = () => AX.can('content', 'manage');
const bySort = (a, b) => (+a.sort_order || 0) - (+b.sort_order || 0);

/* ---------- status of a test ---------- */
function status(t, prac) {
  const now = Date.now(), o = ms(t.opens_at), c = ms(t.closes_at), r = ms(t.result_at), p = prac && prac.has(String(t.id));
  if (t.active === false) return { k: 'draft', label: 'Draft', tone: '', icon: 'eyeOff', sub: 'Hidden from students' };
  if (o && now < o) return { k: 'sched', label: 'Scheduled', tone: 'info', icon: 'calendar', sub: 'Opens ' + fmt.dt(o) };
  if (c && now < c) return { k: 'live', label: 'Live now', tone: 'ok', icon: 'live', sub: 'Live till ' + fmt.dt(c), live: true };
  if (r && now < r) return { k: 'pending', label: 'Result pending', tone: 'gold', icon: 'clock', sub: 'Result ' + fmt.dt(r) };
  if (c) return { k: 'ended', label: 'Ended', tone: '', icon: 'checkCircle', sub: r ? 'Result out ' + fmt.dt(r) : 'Live ended ' + fmt.dt(c) };
  if (p) return { k: 'practice', label: 'Practice', tone: 'vio', icon: 'zap', sub: 'Instant answers' };
  return { k: 'open', label: 'Open', tone: 'pri', icon: 'play', sub: 'Students can start any time' };
}
const stPill = s => s.live ? h`<span class="pill ok"><span class="live-dot"></span> Live now</span>` : UI.pill(s.label, s.tone);
const FILTERS = [['all', 'All'], ['live', 'Live now'], ['sched', 'Scheduled'], ['pending', 'Result pending'], ['open', 'Open'], ['ended', 'Ended'], ['draft', 'Drafts'], ['practice', 'Practice'], ['attention', 'Need attention']];
const match = (t, f) => f === 'all' ? true : f === 'attention' ? (t.problems || 0) > 0 : f === 'practice' ? C.practice.has(String(t.id)) : status(t, C.practice).k === f;

AX.css('tests', `
.ts-tool{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:22px 0 14px}
.ts-tool .search{flex:1;min-width:200px;max-width:420px}
.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}
.ts-sc{display:flex;flex-direction:column;cursor:pointer;transition:transform var(--std) var(--ease),border-color var(--std)}
.ts-sc:hover{transform:translateY(-3px);border-color:var(--pri-line)}
.ts-sc.off .ts-cv{filter:saturate(.35)}
.ts-cv{--c:#14b8a6;position:relative;aspect-ratio:16/7;overflow:hidden;display:grid;place-items:center;background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--c) 90%,#fff) 0%,var(--c) 45%,color-mix(in srgb,var(--c) 45%,#020617) 100%)}
.ts-cv img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ts-mono{font-family:var(--font-display);font-size:38px;font-weight:600;color:rgba(255,255,255,.94);letter-spacing:-.02em;text-shadow:0 4px 18px rgba(0,0,0,.25)}
.ts-cvp{position:absolute;left:10px;top:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;z-index:1}
.ts-cvp .pill{background:rgba(6,10,20,.6);color:#fff;border-color:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.ts-sb{padding:14px 16px 10px;flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.ts-t{font-size:15.5px;font-weight:750;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ts-cnt{font-size:12.5px;color:var(--mut)}
.ts-sf{display:flex;align-items:center;gap:6px;padding:10px 12px 12px 16px;border-top:1px solid var(--line)}
.ts-new{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:250px;border:1.5px dashed var(--line-2);border-radius:var(--r-lg);color:var(--mut);background:transparent;font-weight:700;transition:border-color var(--fast),color var(--fast)}
.ts-new:hover{border-color:var(--pri);color:var(--pri)}
.ts-new .e-ic{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri)}
.ts-hero{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr)}
.ts-hero .ts-cv{aspect-ratio:auto;min-height:190px;height:100%}
.ts-hb{padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}
@media (max-width:760px){.ts-hero{grid-template-columns:minmax(0,1fr)}.ts-hero .ts-cv{aspect-ratio:16/7;min-height:0}}
.ts-fold{margin-top:16px}
.ts-fh{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line);background:var(--solid-2);min-width:0}
.ts-fh .fi{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);flex:none}
.ts-tr{cursor:pointer;align-items:center}
.ts-ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;flex:none;background:var(--hover);color:var(--mut)}
.ts-ic.ok{background:var(--ok-soft);color:var(--ok)}.ts-ic.info{background:var(--info-soft);color:var(--info)}.ts-ic.gold{background:var(--gold-soft);color:var(--gold)}.ts-ic.vio{background:var(--vio-soft);color:var(--vio)}.ts-ic.pri{background:var(--pri-soft);color:var(--pri)}
.ts-ta{display:flex;gap:2px;align-items:center;flex:none}
.ts-meta{font-size:12.5px;color:var(--mut);margin-top:2px;overflow-wrap:anywhere}
.ts-none{padding:14px 16px;font-size:13px;color:var(--faint)}
.ts-ro{display:flex;flex-direction:column;gap:6px}
.ts-ro .r{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:12px;border:1px solid var(--line);background:var(--solid-2)}
.ts-ro .r b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
.ts-ro .r .n{width:22px;color:var(--faint);font-weight:800;font-size:12px}
.ts-cvbox{border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.ts-cvbox .ts-cv{aspect-ratio:16/7}
.ts-file{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.ts-file:first-child{border-top:0}
@media (max-width:620px){.ts-ta .wide{display:none}.ts-tool .search{max-width:none}}
`);

/* ---------- module ---------- */
AX.mod({
  id: 'tests', title: 'Test studio', short: 'Tests', icon: 'layers', group: 'Academics', order: 10, perm: 'content',
  sub: 'Series, folders and tests. Changes are live for students at once.',
  async render(ctx) {
    const p = ctx.parts;
    CUR = { ctx, view: p[0] === 's' && p[1] ? 'series' : p[0] === 'all' ? 'all' : 'library', sid: p[1] || null, q: '' };
    if (offT) offT();
    offT = AX.on('tests:changed', () => { if (!CUR || !CUR.ctx.alive()) { if (offT) { offT(); offT = null; } return; } draw(false); });
    if (!ctx.el.__w) {
      ctx.el.__w = 1;
      AX.act(ctx.el, ACTS);
      ctx.el.addEventListener('input', e => { if (e.target.id === 'ts-q') { CUR.q = e.target.value.trim().toLowerCase(); qSoon(); } });
    }
    await draw(true);
  },
  async search(q) {
    if (!AX.can('content')) return [];
    const c = await AX.data.catalog(); if (!c || !c.ok) return [];
    const ser = id => (c.series.find(s => s.id === id) || {}).title || '';
    const out = c.series.filter(s => String(s.title).toLowerCase().includes(q)).slice(0, 5).map(s => ({ g: 'Series', title: s.title, sub: (s.is_free ? 'Free' : s.price_label || 'Paid') + ' · ' + fmt.plural(c.tests.filter(t => t.series_id === s.id).length, 'test'), icon: 'layers', go: '#/tests/s/' + s.id }));
    c.tests.filter(t => String(t.title).toLowerCase().includes(q)).slice(0, 8).forEach(t => { const st = status(t, c.practice); out.push({ g: 'Tests', title: t.title, sub: ser(t.series_id) + ' · ' + fmt.plural(t.questions || 0, 'question'), icon: 'fileText', tag: st.label, tone: st.tone, run: () => AX.openTest(t.id) }); });
    return out;
  },
  async attention() {
    if (!AX.can('content')) return [];
    const c = await AX.data.catalog(); if (!c || !c.ok) return [];
    const n = c.tests.filter(t => t.active !== false && (t.problems || 0) > 0).length;
    return n ? [{ title: fmt.plural(n, 'test') + ' with questions missing an answer', sub: 'Students cannot score those questions', count: n, go: '#/tests/all?f=attention', icon: 'alert', tone: 'gold' }] : [];
  }
});
AX.creates.push({ label: 'New test', icon: 'fileText', perm: ['content', 'manage'], run() { AX.openTest(null, CUR && CUR.view === 'series' ? { seriesId: CUR.sid } : {}); } });
AX.creates.push({ label: 'New series', icon: 'layers', perm: ['content', 'manage'], run() { if (!location.hash.startsWith('#/tests')) AX.go('tests'); setTimeout(() => seriesModal(null), 120); } });
AX.actions.push({ label: 'Open Test studio · all tests', icon: 'list', perm: ['content'], run() { AX.go('tests/all'); } });

const qSoon = AX.u.debounce(() => { if (CUR && CUR.ctx.alive()) draw(false, true); }, 160);
async function draw(skel, keepFocus) {
  const ctx = CUR.ctx;
  if (skel) AX.set(ctx.el, h`${UI.skeleton(4, 'kpi')}<div class="mt16">${UI.skeleton(5)}</div>`);
  const cat = await AX.data.catalog();
  if (!ctx.alive()) return;
  if (!cat || !cat.ok) { ctx.head({ title: 'Test studio' }); AX.set(ctx.el, UI.errorBox(cat || {})); return; }
  C = cat; if (!C.practice) C.practice = new Set();
  const f = document.getElementById('ts-q'), had = keepFocus && f && document.activeElement === f, pos = had ? f.selectionStart : 0;
  if (CUR.view === 'series') vSeries(ctx); else if (CUR.view === 'all') vAll(ctx); else vLib(ctx);
  if (had) { const n = document.getElementById('ts-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
  const ph = document.getElementById('ax-ph');
  if (ph && !ph.__w) { ph.__w = 1; AX.act(ph, ACTS); }
  loadCovers();
}
const tabs = () => [{ id: 'library', title: 'Library', icon: 'layers', href: '#/tests' }, { id: 'all', title: 'All tests', icon: 'list', href: '#/tests/all' }];
const testsOf = (sid, fid) => C.tests.filter(t => t.series_id === sid && (fid === undefined || (t.folder_id || null) === (fid || null))).sort(bySort);

/* ---------- library ---------- */
function vLib(ctx) {
  const m = canM();
  ctx.head({ title: 'Test studio', sub: 'Series → folders → tests. Everything you change here is live for students at once.', tabs: tabs(), tab: 'library',
    actions: m ? h`<button class="btn" data-act="newSeries">${icon('plus', 16)} New series</button><button class="btn pri" data-act="newTest">${icon('fileText', 16)} New test</button>` : '' });
  const T = C.tests, st = T.map(t => status(t, C.practice));
  const live = st.filter(s => s.k === 'live').length, sched = st.filter(s => s.k === 'sched').length, att = T.filter(t => (t.problems || 0) > 0).length;
  const q = CUR.q, ser = C.series.slice().sort(bySort).filter(s => !q || (s.title + ' ' + (s.description || '')).toLowerCase().includes(q) || T.some(t => t.series_id === s.id && t.title.toLowerCase().includes(q)));
  const drafts = m ? AX.testDrafts().filter(d => !d.id || T.some(t => t.id === d.id)) : [];
  AX.set(ctx.el, h`<div class="kpis">
      ${UI.kpi({ label: 'Series', value: C.series.length, icon: 'layers', foot: C.series.filter(s => s.is_free).length + ' free · ' + C.series.filter(s => !s.is_free).length + ' paid' })}
      ${UI.kpi({ label: 'Tests', value: T.length, icon: 'fileText', tone: 'info', foot: fmt.num(T.reduce((a, t) => a + (t.questions || 0), 0)) + ' questions · ' + fmt.plural(T.filter(t => t.active === false).length, 'draft'), go: '#/tests/all' })}
      ${UI.kpi({ label: 'Live now', value: live, icon: 'live', tone: 'gold', foot: sched ? sched + ' scheduled' : 'none scheduled', go: '#/tests/all?f=' + (live ? 'live' : 'sched') })}
      ${UI.kpi({ label: 'Need attention', value: att, icon: 'alert', tone: att ? 'bad' : '', foot: att ? 'questions without an answer' : 'all complete', go: '#/tests/all?f=attention' })}
    </div>
    ${drafts.length ? h`<div class="card pad0 mt16"><div class="card-h" style="padding:14px 16px 4px">${icon('history')}<h3>Unpublished drafts on this device</h3><span class="grow"></span><span class="xs mut">Kept automatically</span></div><div class="list">${join(drafts, d => h`<div class="li"><span class="ts-ic gold">${icon('edit', 17)}</span><div class="grow"><div class="t ell">${d.title}</div><div class="s">${d.id ? 'Changes to a published test' : 'New test'} · ${fmt.plural(d.count, 'question')} · saved ${fmt.ago(d.at)}</div></div><button class="btn xs ghost" data-act="dropDraft" data-k="${d.key}">Discard</button><button class="btn xs soft" data-act="draft" data-k="${d.key}" data-id="${d.id || ''}">Continue</button></div>`)}</div></div>` : ''}
    <div class="ts-tool"><div class="inp-wrap search">${icon('search', 16)}<input class="inp sm" id="ts-q" type="search" placeholder="Find a series or test…" value="${CUR.q}" autocomplete="off" aria-label="Find a series or test"></div><span class="grow"></span>
      ${m && C.series.length > 1 ? h`<button class="btn sm ghost" data-act="reorderS">${icon('sort', 15)} Reorder series</button>` : ''}</div>
    ${C.series.length ? h`<div class="ts-grid">${join(ser, card)}${m && !q ? h`<button class="ts-new" data-act="newSeries"><span class="e-ic">${icon('plus', 22)}</span>New series<span class="xs mut" style="font-weight:600">e.g. NEET Test Series 2027</span></button>` : ''}</div>
      ${!ser.length ? h`<div class="card">${UI.empty({ icon: 'search', title: 'Nothing matches', text: 'Try another name.' })}</div>` : ''}`
      : h`<div class="card">${UI.empty({ icon: 'layers', title: 'No series yet', text: 'Create your first series, for example “NEET Test Series”. Then add folders and tests to it.', action: m ? h`<button class="btn pri" data-act="newSeries">${icon('plus', 16)} Create a series</button>` : '' })}</div>`}
    <div class="card row wrap mt24"><span class="ts-ic pri">${icon('globe', 18)}</span><div class="grow"><b>Student website</b><div class="xs mut mono ell">${siteUrl()}</div></div>${UI.copyBtn(siteUrl(), 'Copy')}<a class="btn xs soft" href="https://wa.me/?text=${encodeURIComponent((AX.cfg.SITE_NAME || 'Test series') + '\n' + siteUrl())}" target="_blank" rel="noopener">${icon('whatsapp', 13)} WhatsApp</a></div>`);
}
function card(s) {
  const T = C.tests.filter(t => t.series_id === s.id), st = T.map(t => status(t, C.practice)), F = C.folders.filter(f => f.series_id === s.id);
  const live = st.filter(x => x.k === 'live').length, sch = st.filter(x => x.k === 'sched').length, pr = T.filter(t => (t.problems || 0) > 0).length, dr = st.filter(x => x.k === 'draft').length;
  return h`<article class="card pad0 ts-sc ${s.active === false ? 'off' : ''}" data-act="openS" data-id="${s.id}" tabindex="0" aria-label="${s.title}">
    ${cover(s)}
    <div class="ts-sb"><div class="ts-t">${s.title}</div>${s.description ? h`<div class="xs mut ell">${s.description}</div>` : ''}
      <div class="ts-cnt">${fmt.plural(F.length, 'folder')} · ${fmt.plural(T.length, 'test')} · ${fmt.num(T.reduce((a, t) => a + (t.questions || 0), 0))} questions</div>
      <div class="row gap6 wrap">${live ? h`<span class="pill ok"><span class="live-dot"></span> ${live} live</span>` : ''}${sch ? UI.pill(sch + ' scheduled', 'info') : ''}${dr ? UI.pill(dr + ' draft' + (dr > 1 ? 's' : '')) : ''}${pr ? UI.pill(pr + ' to fix', 'warn') : ''}${(s.files || []).length ? UI.pill(fmt.plural(s.files.length, 'file'), '') : ''}</div></div>
    <div class="ts-sf">${canM() ? h`<button class="btn xs soft" data-act="newTestIn" data-sid="${s.id}">${icon('plus', 13)} Test</button>` : ''}<span class="grow"></span><span class="xs mut">Open ${icon('chevR', 13)}</span>
      <button class="ibtn sm" data-act="sMenu" data-id="${s.id}" aria-label="More for ${s.title}">${icon('moreV', 16)}</button></div></article>`;
}
function cover(s, cls) {
  const c = COV.get(s.id);
  return h`<div class="ts-cv ${cls || ''}" style="--c:${AX.u.hue(s.id)}" data-cv="${s.id}">${c ? h`<img src="${c}" alt="">` : h`<span class="ts-mono">${AX.u.initials(s.title)}</span>`}
    <div class="ts-cvp">${s.is_free ? UI.pill('Free', 'ok') : UI.pill(s.price_label || 'Paid', 'gold')}${s.active === false ? UI.pill('Hidden') : ''}</div></div>`;
}
let covBusy = false;
async function loadCovers() {
  if (covBusy || !C) return; covBusy = true;
  try {
    for (const s of C.series) {
      if (!s.has_cover || COV.has(s.id)) continue;
      if (!document.querySelector('[data-cv="' + s.id + '"]')) continue;
      const r = await AX.api.rpc('cbt_admin_series_cover', { p_series: s.id });
      const d = r && r.ok && typeof r.cover === 'string' && r.cover.startsWith('data:image') ? r.cover : '';
      COV.set(s.id, d);
      if (d) paintCover(s.id);
    }
  } finally { covBusy = false; }
}
function paintCover(sid) {
  const d = COV.get(sid);
  document.querySelectorAll('[data-cv="' + sid + '"]').forEach(el => {
    const old = el.querySelector('img,.ts-mono'); if (old) old.remove();
    if (d) { const i = document.createElement('img'); i.src = d; i.alt = ''; el.prepend(i); }
    else { const sp = document.createElement('span'); sp.className = 'ts-mono'; const s = C.series.find(x => x.id === sid); sp.textContent = AX.u.initials(s ? s.title : ''); el.prepend(sp); }
  });
}

/* ---------- one series ---------- */
function vSeries(ctx) {
  const s = C.series.find(x => x.id === CUR.sid), m = canM();
  if (!s) { ctx.head({ title: 'Series not found', crumb: 'Not found' }); return AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'layers', title: 'This series is not here any more', text: 'It may have been deleted.', action: h`<a class="btn" href="#/tests">${icon('arrowL', 15)} Back to the library</a>` })}</div>`); }
  ctx.head({ title: s.title, crumb: s.title, sub: s.description || (s.is_free ? 'Free series' : 'Paid series · ' + (s.price_label || '')),
    actions: h`<button class="btn" data-act="shareS" data-id="${s.id}">${icon('link', 16)} Share</button>${m ? h`<button class="btn" data-act="editS" data-id="${s.id}">${icon('edit', 16)} Edit</button><button class="btn pri" data-act="newTestIn" data-sid="${s.id}">${icon('plus', 16)} New test</button>` : ''}` });
  const F = C.folders.filter(f => f.series_id === s.id).sort(bySort), T = testsOf(s.id), root = T.filter(t => !t.folder_id || !F.some(f => f.id === t.folder_id));
  const st = T.map(t => status(t, C.practice));
  const q = CUR.q, fT = list => q ? list.filter(t => t.title.toLowerCase().includes(q)) : list;
  AX.set(ctx.el, h`<div class="card pad0 ts-hero">${cover(s)}
      <div class="ts-hb"><div class="row wrap gap6">${s.is_free ? UI.pill('Free for everyone', 'ok') : UI.pill('Paid · ' + (s.price_label || 'unlock per student'), 'gold')}${s.active === false ? UI.pill('Hidden from students', 'warn') : UI.pill('Visible to students', 'pri')}<span class="pill">Order ${s.sort_order || 0}</span></div>
        <div class="row wrap gap20"><div><div class="disp" style="font-size:26px">${T.length}</div><div class="xs mut">tests</div></div><div><div class="disp" style="font-size:26px">${F.length}</div><div class="xs mut">folders</div></div><div><div class="disp" style="font-size:26px">${fmt.num(T.reduce((a, t) => a + (t.questions || 0), 0))}</div><div class="xs mut">questions</div></div><div><div class="disp" style="font-size:26px">${fmt.num(T.reduce((a, t) => a + (t.results || 0), 0))}</div><div class="xs mut">attempts</div></div></div>
        <div class="row wrap gap6">${st.filter(x => x.k === 'live').length ? h`<span class="pill ok"><span class="live-dot"></span> ${st.filter(x => x.k === 'live').length} live now</span>` : ''}${st.filter(x => x.k === 'sched').length ? UI.pill(st.filter(x => x.k === 'sched').length + ' scheduled', 'info') : ''}${(s.files || []).length ? join(s.files, f => UI.pill(f.title + ' · ' + f.kind)) : h`<span class="xs mut">No syllabus or schedule files yet.</span>`}</div>
        ${m ? h`<div class="row wrap gap6"><button class="btn sm" data-act="media" data-id="${s.id}">${icon('image', 15)} Cover & files</button><button class="btn sm" data-act="newFolder" data-sid="${s.id}">${icon('folder', 15)} New folder</button>${F.length > 1 ? h`<button class="btn sm ghost" data-act="reorderF" data-sid="${s.id}">${icon('sort', 15)} Reorder folders</button>` : ''}</div>` : ''}</div></div>
    ${T.length > 6 ? h`<div class="ts-tool"><div class="inp-wrap search">${icon('search', 16)}<input class="inp sm" id="ts-q" type="search" placeholder="Find a test in this series…" value="${CUR.q}" autocomplete="off" aria-label="Find a test"></div></div>` : ''}
    ${!T.length && !F.length ? h`<div class="card mt16">${UI.empty({ icon: 'fileText', title: 'Nothing here yet', text: 'Add a folder (for example “Phase 1” or “Day 1”) or create the first test.', action: m ? h`<div class="row wrap" style="justify-content:center"><button class="btn pri" data-act="newTestIn" data-sid="${s.id}">${icon('plus', 16)} New test</button><button class="btn" data-act="newFolder" data-sid="${s.id}">${icon('folder', 16)} New folder</button></div>` : '' })}</div>` : ''}
    ${join(F, f => { const ft = fT(testsOf(s.id, f.id)); if (q && !ft.length) return ''; return h`<section class="card pad0 ts-fold"><div class="ts-fh"><span class="fi">${icon('folder', 17)}</span><div class="grow"><div class="row gap6 wrap"><b class="ell">${f.title}</b>${f.active === false ? UI.pill('Hidden', 'warn') : ''}</div><div class="xs mut">${fmt.plural(testsOf(s.id, f.id).length, 'test')}</div></div>
        ${m ? h`<button class="btn xs soft" data-act="newTestIn" data-sid="${s.id}" data-fid="${f.id}">${icon('plus', 13)} Test</button>` : ''}<button class="ibtn sm" data-act="fMenu" data-id="${f.id}" aria-label="More for folder ${f.title}">${icon('moreV', 16)}</button></div>
      <div class="list">${ft.length ? join(ft, t => testRow(t)) : h`<div class="ts-none">No tests in this folder yet.</div>`}</div></section>`; })}
    ${root.length && fT(root).length ? h`<section class="card pad0 ts-fold"><div class="ts-fh"><span class="fi" style="background:var(--pri-soft);color:var(--pri)">${icon('fileText', 17)}</span><div class="grow"><b>${F.length ? 'Not in a folder' : 'Tests'}</b><div class="xs mut">${fmt.plural(root.length, 'test')}</div></div>${m && root.length > 1 ? h`<button class="btn xs ghost" data-act="reorderT" data-sid="${s.id}" data-fid="">${icon('sort', 13)} Reorder</button>` : ''}</div>
      <div class="list">${join(fT(root), t => testRow(t))}</div></section>` : ''}`);
}
function testRow(t, wide) {
  const s = status(t, C.practice), m = canM(), p = C.practice.has(String(t.id));
  const ser = wide ? C.series.find(x => x.id === t.series_id) : null, fo = wide ? C.folders.find(f => f.id === t.folder_id) : null;
  return h`<div class="li ts-tr" data-act="openT" data-id="${t.id}">
    <span class="ts-ic ${s.tone}">${icon(s.icon, 18)}</span>
    <div class="grow"><div class="row gap6 wrap"><b class="ell" style="max-width:100%">${t.title}</b>${stPill(s)}${p && s.k !== 'practice' ? UI.pill('Practice', 'vio') : ''}${t.free_preview ? UI.pill('Free preview', 'pri') : ''}${t.problems ? UI.pill(t.problems + ' to fix', 'warn') : ''}${t.reports ? UI.pill(fmt.plural(t.reports, 'report'), 'bad') : ''}</div>
      <div class="ts-meta">${ser ? ser.title + (fo ? ' · ' + fo.title : '') + ' · ' : ''}${fmt.plural(t.questions || 0, 'question')} · ${t.duration} min · +${t.correct} / −${t.wrong} · ${fmt.plural(t.results || 0, 'attempt')} · ${s.sub}</div></div>
    <div class="ts-ta">${AX.can('results') ? h`<button class="ibtn sm wide" data-act="ana" data-id="${t.id}" aria-label="Analytics" title="Analytics">${icon('chart', 16)}</button>` : ''}${m ? h`<button class="btn xs wide" data-act="editT" data-id="${t.id}">${icon('edit', 13)} Edit</button>` : ''}<button class="ibtn sm" data-act="tMenu" data-id="${t.id}" aria-label="More for ${t.title}">${icon('moreV', 16)}</button></div></div>`;
}

/* ---------- all tests ---------- */
function vAll(ctx) {
  const f = CUR.ctx.q.f || 'all', q = CUR.q;
  ctx.head({ title: 'Test studio', sub: 'Every test in one list. Filter by what is live, scheduled or needs fixing.', tabs: tabs(), tab: 'all',
    actions: canM() ? h`<button class="btn pri" data-act="newTest">${icon('fileText', 16)} New test</button>` : '' });
  const rank = t => { const s = status(t, C.practice); return { live: 0, sched: 1, pending: 2, open: 3, practice: 3, ended: 4, draft: 5 }[s.k]; };
  const L = C.tests.filter(t => match(t, f) && (!q || t.title.toLowerCase().includes(q))).sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? ms(a.opens_at) - ms(b.opens_at) : 0) || String(a.title).localeCompare(String(b.title), 'en', { numeric: true }));
  AX.set(ctx.el, h`<div class="chips">${join(FILTERS, ([k, l]) => { const n = C.tests.filter(t => match(t, k)).length; return k !== 'all' && !n && f !== k ? '' : h`<a class="chip ${f === k ? 'on' : ''} ${k === 'attention' ? 'alert' : ''}" href="${AX.link('tests/all', k === 'all' ? null : { f: k })}">${k === 'live' ? raw('<span class="live-dot"></span>') : ''}${l}<em>${n}</em></a>`; })}</div>
    <div class="ts-tool"><div class="inp-wrap search">${icon('search', 16)}<input class="inp sm" id="ts-q" type="search" placeholder="Find a test…" value="${CUR.q}" autocomplete="off" aria-label="Find a test"></div><span class="grow"></span><span class="xs mut">${fmt.plural(L.length, 'test')}</span></div>
    <div class="card pad0"><div class="list">${L.length ? join(L, t => testRow(t, true)) : UI.empty({ icon: 'fileText', title: f === 'all' && !q ? 'No tests yet' : 'No test matches', text: f === 'attention' ? 'Every question in every test has an answer.' : 'Try another filter.', action: canM() && f === 'all' && !q ? h`<button class="btn pri" data-act="newTest">${icon('plus', 16)} New test</button>` : '' })}</div></div>`);
}

/* ---------- actions ---------- */
const T_ = id => C.tests.find(t => t.id === id), S_ = id => C.series.find(s => s.id === id), F_ = id => C.folders.find(f => f.id === id);
function changed(msg) { AX.cache.drop('catalog'); AX.emit('data:changed'); if (msg) UI.toast(msg); AX.emit('tests:changed'); }
const ACTS = {
  retry: () => CUR && CUR.ctx.reload(),
  newSeries: () => seriesModal(null),
  newTest: () => AX.openTest(null, CUR && CUR.view === 'series' ? { seriesId: CUR.sid } : {}),
  newTestIn: el => AX.openTest(null, { seriesId: el.dataset.sid, folderId: el.dataset.fid || '' }),
  openS: el => AX.go('tests/s/' + el.dataset.id),
  openT: el => AX.openTest(el.dataset.id),
  editT: el => AX.openTest(el.dataset.id, { step: 2 }),
  ana: el => openAna(el.dataset.id),
  shareS: el => AX.shareSeries(el.dataset.id),
  editS: el => seriesModal(S_(el.dataset.id)),
  media: el => mediaDrawer(el.dataset.id),
  newFolder: el => folderModal(el.dataset.sid, null),
  reorderS: () => reorder('Reorder series', C.series.slice().sort(bySort).map(s => ({ id: s.id, t: s.title, s: s.sort_order })), (x, n) => AX.api.admin('series_save', { id: x.id, sort_order: n })),
  reorderF: el => reorder('Reorder folders', C.folders.filter(f => f.series_id === el.dataset.sid).sort(bySort).map(f => ({ id: f.id, t: f.title, s: f.sort_order })), (x, n) => AX.api.admin('folder_save', { id: x.id, sort_order: n })),
  reorderT: el => reorderTests(el.dataset.sid, el.dataset.fid || null),
  sMenu: el => sMenu(el, S_(el.dataset.id)),
  fMenu: el => fMenu(el, F_(el.dataset.id)),
  tMenu: el => tMenu(el, T_(el.dataset.id)),
  draft: el => AX.openTest(el.dataset.id || null, { draft: el.dataset.k }),
  async dropDraft(el) { if (!(await UI.confirm({ title: 'Discard this draft?', text: 'The unpublished changes on this device are deleted. The published test (if any) stays as it is.', yes: 'Discard', tone: 'danger' }))) return; AX.dropTestDraft(el.dataset.k); draw(false); }
};
// keyboard: Enter on a focused series card opens it
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ts-sc')) AX.go('tests/s/' + e.target.dataset.id); });
function openAna(id) { if (AX.openAnalytics) AX.openAnalytics(id); else AX.go('results'); }

function sMenu(el, s) {
  const m = canM();
  UI.menu(el, [{ head: s.title },
    { label: 'Open', icon: 'arrowR', fn: () => AX.go('tests/s/' + s.id) },
    m && { label: 'New test in this series', icon: 'plus', fn: () => AX.openTest(null, { seriesId: s.id }) },
    m && { label: 'New folder', icon: 'folder', fn: () => folderModal(s.id, null) },
    m && { label: 'Edit series', icon: 'edit', fn: () => seriesModal(s) },
    m && { label: 'Cover & files', icon: 'image', fn: () => mediaDrawer(s.id) },
    { label: 'Share link', icon: 'link', fn: () => AX.shareSeries(s.id) },
    m && { sep: true },
    m && { label: 'Delete series', icon: 'trash', tone: 'danger', fn: () => delSeries(s) }
  ]);
}
function fMenu(el, f) {
  if (!canM()) return UI.menu(el, [{ head: f.title }, { label: 'Share link', icon: 'link', fn: () => share(f.title, siteUrl() + '#/f/' + f.id, f.title + '\n' + ((S_(f.series_id) || {}).title || '') + '\n\nOpen: ' + siteUrl() + '#/f/' + f.id, '#/f/' + f.id) }]);
  UI.menu(el, [{ head: f.title },
    { label: 'New test in this folder', icon: 'plus', fn: () => AX.openTest(null, { seriesId: f.series_id, folderId: f.id }) },
    { label: 'Edit folder', icon: 'edit', fn: () => folderModal(f.series_id, f) },
    testsOf(f.series_id, f.id).length > 1 && { label: 'Reorder tests', icon: 'sort', fn: () => reorderTests(f.series_id, f.id) },
    { label: f.active === false ? 'Show to students' : 'Hide from students', icon: f.active === false ? 'eye' : 'eyeOff', fn: async () => { const r = await AX.api.admin('folder_save', { id: f.id, series_id: f.series_id, active: f.active === false }); if (!r.ok) return UI.err(r); changed(f.active === false ? 'Folder is visible' : 'Folder hidden'); } },
    { label: 'Share link', icon: 'link', fn: () => share(f.title, siteUrl() + '#/f/' + f.id, f.title + '\n' + ((S_(f.series_id) || {}).title || '') + '\n\nOpen: ' + siteUrl() + '#/f/' + f.id, '#/f/' + f.id) },
    { sep: true },
    { label: 'Delete folder', icon: 'trash', tone: 'danger', fn: () => delFolder(f) }
  ]);
}
function tMenu(el, t) {
  const m = canM(), p = C.practice.has(String(t.id));
  UI.menu(el, [{ head: t.title },
    { label: m ? 'Edit questions' : 'View questions', icon: m ? 'edit' : 'eye', fn: () => AX.openTest(t.id, { step: 2 }) },
    m && { label: 'Details & marking', icon: 'settings', fn: () => AX.openTest(t.id, { step: 1 }) },
    m && { label: 'Schedule & access', icon: 'calendar', fn: () => AX.openTest(t.id, { step: 4 }) },
    AX.can('results') && { label: 'Analytics', icon: 'chart', fn: () => openAna(t.id) },
    { label: 'Share link', icon: 'link', fn: () => AX.shareTest(t.id) },
    m && { sep: true },
    m && { label: p ? 'Turn practice mode off' : 'Turn practice mode on', icon: 'zap', fn: () => setPractice(t, !p) },
    m && { label: t.active === false ? 'Show to students' : 'Hide from students', icon: t.active === false ? 'eye' : 'eyeOff', fn: async () => { const r = await metaSave(t, { active: t.active === false }); if (!r.ok) return UI.err(r); changed(t.active === false ? 'Visible to students' : 'Hidden from students'); } },
    m && { label: 'Move to…', icon: 'folder', fn: () => moveModal(t) },
    m && testsOf(t.series_id, t.folder_id || null).length > 1 && { label: 'Reorder tests here', icon: 'sort', fn: () => reorderTests(t.series_id, t.folder_id || null) },
    m && { label: 'Duplicate…', icon: 'copy', fn: () => dupModal(t) },
    m && { sep: true },
    m && { label: 'Delete test', icon: 'trash', tone: 'danger', fn: () => delTest(t) }
  ]);
}
// details-only test_save (no questions → the server keeps the questions). Every field is sent because missing ones fall back to defaults.
function metaSave(t, patch) {
  return AX.api.admin('test_save', Object.assign({ id: t.id, series_id: t.series_id, folder_id: t.folder_id || null, opens_at: ms(t.opens_at), closes_at: ms(t.closes_at), result_at: ms(t.result_at),
    title: t.title, duration: t.duration, correct: t.correct, wrong: t.wrong, sort_order: +t.sort_order || 0, lock_back: !!t.lock_back, free_preview: !!t.free_preview, active: t.active !== false }, patch || {}));
}
async function setPractice(t, on) {
  if (on && t.result_at) return UI.toast('Practice tests show answers at once: clear the result time or turn practice off', { tone: 'bad', ms: 6000, action: { label: 'Edit schedule', fn: () => AX.openTest(t.id, { step: 4 }) } });
  const r = await AX.api.call('cbt_admin_practice', 'set', { id: t.id, on });
  if (!r.ok) return on ? UI.toast('Practice mode needs the v5 SQL update in Supabase', { tone: 'bad' }) : UI.err(r);
  changed(on ? 'Practice mode on: answers show after each question' : 'Practice mode off');
}
async function delTest(t) {
  const ok = await UI.confirm({ title: 'Delete “' + t.title + '”?', tone: 'danger', typeWord: 'DELETE', yes: 'Delete test',
    text: 'Students’ past scores are kept, but they can no longer review the questions.' + (t.results ? ' ' + fmt.plural(t.results, 'attempt') + ' so far.' : '') });
  if (!ok) return;
  const r = await AX.api.admin('test_delete', { id: t.id });
  if (!r.ok) return UI.err(r);
  AX.dropTestDraft(t.id);
  changed('Test deleted');
}
async function delSeries(s) {
  const n = C.tests.filter(t => t.series_id === s.id).length;
  const ok = await UI.confirm({ title: 'Delete “' + s.title + '”?', tone: 'danger', typeWord: 'DELETE', yes: 'Delete series',
    text: `This deletes the series with all its folders and ${fmt.plural(n, 'test')}. Students’ past results are kept, but they will no longer be able to review these tests.` });
  if (!ok) return;
  const r = await AX.api.admin('series_delete', { id: s.id });
  if (!r.ok) return UI.err(r);
  UI.closeAll();
  if (CUR && CUR.view === 'series') { AX.cache.drop('catalog'); AX.emit('data:changed'); UI.toast('Series deleted'); AX.go('tests'); } else changed('Series deleted');
}
async function delFolder(f) {
  const ok = await UI.confirm({ title: 'Delete the folder “' + f.title + '”?', tone: 'danger', yes: 'Delete folder', text: 'Its tests stay in the series; they move out of the folder.' });
  if (!ok) return;
  const r = await AX.api.admin('folder_delete', { id: f.id });
  if (!r.ok) return UI.err(r);
  UI.closeAll(); changed('Folder deleted');
}

/* ---------- series / folder forms ---------- */
document.addEventListener('submit', e => { if (e.target.closest && e.target.closest('.modal,.drawer')) e.preventDefault(); }, true);
function seriesModal(s) {
  if (!canM()) return;
  const isNew = !s;
  const cs = (C && C.series) || [];
  s = s || { title: '', description: '', is_free: true, price_label: '', sort_order: Math.max(0, ...cs.map(x => +x.sort_order || 0)) + 1, active: true };
  UI.modal({
    title: isNew ? 'New series' : 'Edit series', sub: isNew ? 'A series holds folders and tests, e.g. “NEET Test Series 2027”.' : s.title,
    body: h`<form id="sf" class="col gap16">
      ${AX.f.input({ name: 'title', label: 'Series name', value: s.title, max: 120, placeholder: 'NEET Test Series 2027' })}
      ${AX.f.textarea({ name: 'description', label: 'Description (optional)', value: s.description, rows: 3, max: 600, placeholder: 'What is inside, who it is for' })}
      <div class="fld"><label>Type</label>${AX.f.seg({ name: 'is_free', value: s.is_free ? '1' : '0', options: [{ value: '1', label: 'Free for everyone' }, { value: '0', label: 'Paid — you unlock per student' }] })}</div>
      <div class="form-grid"><div id="sf-pw" class="${s.is_free ? 'hide' : ''}">${AX.f.input({ name: 'price_label', label: 'Price label', value: s.price_label, max: 40, placeholder: '₹499' })}</div>
        ${AX.f.input({ name: 'sort_order', label: 'Order', type: 'number', value: s.sort_order || 0, hint: 'Smaller numbers show first.' })}</div>
      ${AX.f.switch({ name: 'active', value: s.active !== false, label: 'Visible to students', hint: 'Hidden series do not show in the student app.' })}</form>`,
    foot: h`${!isNew ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)} Delete</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} ${isNew ? 'Create series' : 'Save'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#sf');
      AX.f.wireSeg(f, (n, v) => { if (n === 'is_free') f.querySelector('#sf-pw').classList.toggle('hide', v === '1'); });
      AX.act(el, {
        del() { close(); delSeries(s); },
        async save(b) {
          AX.f.clearErrors(f); const d = AX.f.read(f);
          if (!String(d.title || '').trim()) return AX.f.error(f, 'title', 'Please enter a name');
          await UI.busy(b, async () => {
            const r = await AX.api.admin('series_save', { id: isNew ? null : s.id, title: d.title.trim(), description: d.description || '', is_free: d.is_free === '1', price_label: d.is_free === '1' ? (d.price_label || '') : (d.price_label || ''), sort_order: +d.sort_order || 0, active: !!d.active });
            if (!r.ok) return r.error === 'title' ? AX.f.error(f, 'title', 'Please enter a name') : UI.err(r);
            close(true);
            if (isNew && r.id) { AX.cache.drop('catalog'); AX.emit('data:changed'); UI.toast('Series created'); AX.go('tests/s/' + r.id); }
            else changed('Saved');
          });
        }
      });
    }
  });
}
function folderModal(sid, fo) {
  if (!canM()) return;
  const isNew = !fo;
  const fs = ((C && C.folders) || []).filter(f => f.series_id === sid);
  fo = fo || { title: '', sort_order: Math.max(0, ...fs.map(x => +x.sort_order || 0)) + 1, active: true };
  UI.modal({
    title: isNew ? 'New folder' : 'Edit folder', sub: (S_(sid) || {}).title || '', size: 'narrow',
    body: h`<form id="ff" class="col gap16">${AX.f.input({ name: 'title', label: 'Folder name', value: fo.title, max: 80, placeholder: 'Day 1' })}
      ${AX.f.input({ name: 'sort_order', label: 'Order', type: 'number', value: fo.sort_order || 0, hint: 'Smaller numbers show first.' })}
      ${AX.f.switch({ name: 'active', value: fo.active !== false, label: 'Visible to students' })}
      ${!isNew ? h`<div class="xs mut">Deleting a folder keeps its tests; they move to the series itself.</div>` : ''}</form>`,
    foot: h`${!isNew ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)} Delete</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} Save</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#ff');
      f.querySelector('[name=title]').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-act=save]').click(); });
      AX.act(el, {
        del() { close(); delFolder(fo); },
        async save(b) {
          AX.f.clearErrors(f); const d = AX.f.read(f);
          if (!String(d.title || '').trim()) return AX.f.error(f, 'title', 'Please enter a name');
          await UI.busy(b, async () => {
            const r = await AX.api.admin('folder_save', { id: isNew ? null : fo.id, series_id: sid, title: d.title.trim(), sort_order: +d.sort_order || 0, active: !!d.active });
            if (!r.ok) return r.error === 'title' ? AX.f.error(f, 'title', 'Please enter a name') : UI.err(r);
            close(true); changed(isNew ? 'Folder created' : 'Saved');
          });
        }
      });
    }
  });
}
/* ---------- reorder ---------- */
function reorderTests(sid, fid) {
  const list = testsOf(sid, fid);
  reorder('Reorder tests', list.map(t => ({ id: t.id, t: t.title, s: t.sort_order })), (x, n) => metaSave(T_(x.id), { sort_order: n }));
}
function reorder(title, items, saveOne) {
  if (!canM()) return;
  let L = items.slice();
  const rows = () => h`<div class="ts-ro">${join(L, (x, i) => h`<div class="r"><span class="n">${i + 1}</span><b>${x.t}</b><button class="ibtn sm" data-act="mv" data-i="${i}" data-d="-1" ${i ? '' : raw('disabled')} aria-label="Move up">${icon('chevU', 16)}</button><button class="ibtn sm" data-act="mv" data-i="${i}" data-d="1" ${i < L.length - 1 ? '' : raw('disabled')} aria-label="Move down">${icon('chevD', 16)}</button></div>`)}</div>`;
  UI.modal({
    title, sub: 'Students see them in this order.', size: 'narrow',
    body: h`<div id="ro">${rows()}</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} Save order</button>`,
    onOpen(el, close) {
      AX.act(el, {
        mv(b) { const i = +b.dataset.i, j = i + +b.dataset.d; [L[i], L[j]] = [L[j], L[i]]; AX.set(el.querySelector('#ro'), rows()); const nb = el.querySelector('[data-act=mv][data-i="' + j + '"][data-d="' + b.dataset.d + '"]'); if (nb && !nb.disabled) nb.focus(); },
        async save(b) {
          const todo = L.map((x, i) => ({ x, n: i + 1 })).filter(y => +y.x.s !== y.n);
          if (!todo.length) return close(true);
          await UI.busy(b, async () => {
            for (const y of todo) { const r = await saveOne(y.x, y.n); if (!r.ok) { UI.err(r); changed(); return; } }
            close(true); changed('Order saved');
          });
        }
      });
    }
  });
}
/* ---------- move / duplicate ---------- */
function folderSelect(sid, cur) {
  return h`<option value="">No folder</option>${join(C.folders.filter(f => f.series_id === sid).sort(bySort), f => h`<option value="${f.id}" ${f.id === cur ? raw('selected') : ''}>${f.title}</option>`)}<option value="__new">+ New folder…</option>`;
}
function moveModal(t) {
  UI.modal({
    title: 'Move “' + t.title + '”', size: 'narrow',
    body: h`<form id="mvf" class="col gap16">
      <div class="fld"><label for="mv-s">Series</label><select class="inp" id="mv-s">${join(C.series.slice().sort(bySort), s => h`<option value="${s.id}" ${s.id === t.series_id ? raw('selected') : ''}>${s.title}</option>`)}</select></div>
      <div class="fld"><label for="mv-f">Folder</label><select class="inp" id="mv-f">${folderSelect(t.series_id, t.folder_id)}</select></div>
      <div class="fld hide" id="mv-nw"><label for="mv-n">New folder name</label><input class="inp" id="mv-n" maxlength="80" placeholder="e.g. Day 1"></div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go">${icon('check', 16)} Move</button>`,
    onOpen(el, close) {
      const s = el.querySelector('#mv-s'), f = el.querySelector('#mv-f'), nw = el.querySelector('#mv-nw');
      s.addEventListener('change', () => { AX.set(f, folderSelect(s.value, '')); nw.classList.add('hide'); });
      f.addEventListener('change', () => nw.classList.toggle('hide', f.value !== '__new'));
      AX.act(el, { async go(b) {
        await UI.busy(b, async () => {
          let fid = f.value || null;
          if (fid === '__new') {
            const name = el.querySelector('#mv-n').value.trim(); if (!name) return UI.toast('Type the folder name', { tone: 'warn' });
            const ex = C.folders.find(x => x.series_id === s.value && x.title.trim().toLowerCase() === name.toLowerCase());
            if (ex) fid = ex.id; else { const r = await AX.api.admin('folder_save', { series_id: s.value, title: name }); if (!r.ok) return UI.err(r); fid = r.id; }
          }
          const r = await metaSave(t, { series_id: s.value, folder_id: fid });
          if (!r.ok) return UI.err(r);
          close(true); changed('Moved');
        });
      } });
    }
  });
}
function dupModal(t) {
  UI.modal({
    title: 'Duplicate test', size: 'narrow', sub: t.title,
    body: h`<div class="callout info">${icon('info')}<div class="sm">Makes a copy with all questions. The copy is <b>hidden</b> until you show it, so you can edit it first. To <b>move</b> a test instead, use “Move to…”.</div></div>
      <form id="df" class="col gap16 mt16">${AX.f.input({ name: 'title', label: 'Name of the copy', value: t.title + ' (copy)', max: 120 })}
      <div class="fld"><label for="f-dser">Series</label><select class="inp" id="f-dser" name="series_id">${join(C.series.slice().sort(bySort), s => h`<option value="${s.id}" ${s.id === t.series_id ? raw('selected') : ''}>${s.title}</option>`)}</select></div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go" data-busy="Copying…">${icon('copy', 16)} Create copy</button>`,
    onOpen(el, close) {
      AX.act(el, { async go(b) {
        const f = el.querySelector('#df'), d = AX.f.read(f);
        if (!String(d.title || '').trim()) return AX.f.error(f, 'title', 'Please enter a name');
        await UI.busy(b, async () => {
          const r = await AX.api.call('cbt_admin2', 'duplicate', { id: t.id, title: d.title.trim(), series_id: d.series_id });
          if (!r.ok) return ['unknown', 'unknown_action', 'missing', 'server'].includes(r.error) ? UI.toast('Duplicating needs the v6 SQL update in Supabase', { tone: 'bad' }) : UI.err(r);
          close(true); AX.cache.drop('catalog'); AX.emit('data:changed'); AX.emit('tests:changed');
          UI.toast('Copy created (hidden)', r.id ? { action: { label: 'Open', fn: () => AX.openTest(r.id) } } : {});
        });
      } });
    }
  });
}
/* ---------- share ---------- */
function share(title, url, msg, tip) {
  UI.modal({
    title: 'Share “' + title + '”', size: 'narrow',
    body: h`<p class="sm tx2">Send this link anywhere — WhatsApp, Telegram, Instagram bio, banners. It opens this directly in the student app. New students can tap “Request access” and you approve them.</p>
      <div class="row mt16"><input class="inp mono sm grow" value="${url}" readonly aria-label="Link">${UI.copyBtn(url, 'Copy')}</div>
      <div class="well sm mt16" style="white-space:pre-wrap">${msg}</div>
      ${tip ? h`<p class="xs mut mt12">Tip: use <span class="mono">${tip}</span> as the link of a Home banner.</p>` : ''}`,
    foot: h`<a class="btn soft" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><a class="btn" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener">${icon('telegram', 16)} Telegram</a>${navigator.share ? h`<button class="btn" data-act="native">${icon('send', 16)} More</button>` : ''}<span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    onOpen(el) { AX.act(el, { async native() { try { await navigator.share({ title, text: msg, url }); } catch (e) {} } }); }
  });
}
AX.shareSeries = async id => {
  const c = C || await AX.data.catalog(); const s = (c.series || []).find(x => x.id === id); if (!s) return;
  const url = siteUrl() + '#/s/' + id;
  share(s.title, url, `${s.title}\n${s.description ? s.description + '\n' : ''}\nOpen: ${url}`, '#/s/' + id);
};
AX.shareTest = async id => {
  const c = (C && C.tests.some(t => t.id === id)) ? C : await AX.data.catalog(true); const t = ((c && c.tests) || []).find(x => x.id === id); if (!t) return;
  const s = (c.series || []).find(x => x.id === t.series_id) || {}, st = status(t, c.practice || new Set());
  const path = t.folder_id ? '#/f/' + t.folder_id : '#/s/' + t.series_id, url = siteUrl() + path;
  const when = st.k === 'sched' ? '🗓 ' + st.sub : st.k === 'live' ? '🔴 Live now · till ' + fmt.dt(t.closes_at) : '';
  share(t.title, url, `📝 ${t.title}\n${s.title || ''}\n${fmt.plural(t.questions || 0, 'question')} · ${t.duration} min${when ? '\n' + when : ''}\n\nOpen: ${url}`, path);
};

/* ---------- cover & files ---------- */
function mediaDrawer(sid) {
  if (!canM()) return;
  let kind = 'syllabus', file = null, busy = false;
  const body = () => {
    const s = S_(sid); if (!s) return UI.empty({ icon: 'layers', title: 'Series not found' });
    const cv = COV.get(sid);
    return h`<div class="section-t" style="margin-top:0">Cover photo</div>
      <div class="ts-cvbox">${cover(s)}</div>
      <p class="xs mut mt8">Shown on the series card for students and in the store. A wide photo works best (about 16 : 7). It is compressed automatically.</p>
      <div class="row wrap mt12"><button class="btn soft" data-act="cvUp">${icon('upload', 16)} ${s.has_cover ? 'Change photo' : 'Upload photo'}</button>${s.has_cover ? h`<button class="btn ghost danger" data-act="cvRm">${icon('trash', 15)} Remove</button>${cv === undefined ? '' : UI.pill('Cover set', 'ok')}` : ''}</div>
      <div class="section-t">Syllabus, schedule & notes</div>
      <div class="card flat tight">${(s.files || []).length ? join(s.files, f => h`<div class="ts-file"><span class="ts-ic ${f.kind === 'schedule' ? 'info' : f.kind === 'notes' ? 'vio' : 'gold'}">${icon(/\.pdf$/i.test(f.name || '') ? 'pdf' : 'image', 18)}</span><div class="grow"><b class="ell" style="display:block">${f.title}</b><div class="xs mut">${f.kind} · ${Math.round((f.size || 0) / 1024)} KB${f.name ? ' · ' + f.name : ''}</div></div><button class="btn xs danger" data-act="fDel" data-id="${f.id}">${icon('trash', 13)} Delete</button></div>`) : h`<div class="xs mut">No files yet. Students can open these from the series page.</div>`}</div>
      <div class="card flat mt12"><div class="card-h">${icon('upload')}<h3>Upload a file</h3></div><div class="col gap16">
        <div class="fld"><label for="mf-t">Name shown to students</label><input class="inp" id="mf-t" maxlength="80" placeholder="e.g. Full syllabus"></div>
        <div class="fld"><label>Type</label><div class="seg" id="mf-k">${join([['syllabus', 'Syllabus'], ['schedule', 'Schedule'], ['notes', 'Notes']], ([v, l]) => h`<button type="button" class="${kind === v ? 'on' : ''}" data-v="${v}">${l}</button>`)}</div></div>
        <div class="dropzone" data-act="fPick" id="mf-dz">${file ? h`${icon('fileText', 18)} <b>${file.name}</b> · ${fmt.bytes(file.size)} <span class="xs">(tap to change)</span>` : h`${icon('upload', 18)} <b>Choose a PDF or image</b> · up to 6 MB`}</div>
        <div id="mf-p" class="hide"><div class="progress"><i style="width:0%"></i></div><div class="xs mut mt8" id="mf-s"></div></div>
        <div class="err sm" id="mf-e"></div>
        <button class="btn pri" data-act="fUp" ${file ? '' : raw('disabled')}>${icon('upload', 16)} Upload file</button></div></div>`;
  };
  UI.drawer({
    title: 'Cover & files', sub: (S_(sid) || {}).title || '', body: body(),
    onOpen(el, close, api) {
      const redraw = () => { api.set(body()); };
      const refresh = async () => { AX.cache.drop('catalog'); const c = await AX.data.catalog(true); if (c && c.ok) C = c; redraw(); AX.emit('data:changed'); AX.emit('tests:changed'); };
      if (S_(sid) && S_(sid).has_cover && !COV.has(sid)) loadCovers().then(() => { if (el.isConnected) redraw(); });
      el.addEventListener('click', e => { const b = e.target.closest('#mf-k button'); if (!b) return; kind = b.dataset.v; el.querySelectorAll('#mf-k button').forEach(x => x.classList.toggle('on', x === b)); });
      AX.act(el, {
        async cvUp(b) {
          const f = await AX.u.pickFile('image/*'); if (!f) return;
          await UI.busy(b, async () => {
            let d = null;
            try { d = AX.compressDataUrl ? await AX.compressDataUrl(await AX.u.fileToDataURL(f), 900, 0.78) : await AX.u.compressImage(f, { max: 900, quality: 0.78 }); } catch (e) { d = null; }
            if (!d) return UI.toast('Could not save the photo', { tone: 'bad' });
            const r = await AX.api.admin('series_cover', { id: sid, cover: d });
            if (!r.ok) return r.error === 'image' ? UI.toast('This photo is too large. Try a smaller one.', { tone: 'bad' }) : UI.err(r);
            AX.api.rpc('cbt_admin_series_cover', { p_series: sid, p_set: d }).catch(() => {});   // keep the store copy in step
            COV.set(sid, d); UI.toast('Cover saved'); await refresh(); paintCover(sid);
          });
        },
        async cvRm(b) {
          if (!(await UI.confirm({ title: 'Remove the cover photo?', yes: 'Remove', tone: 'danger' }))) return;
          await UI.busy(b, async () => {
            const r = await AX.api.admin('series_cover', { id: sid, cover: '' });
            if (!r.ok) return UI.err(r);
            AX.api.rpc('cbt_admin_series_cover', { p_series: sid, p_set: '' }).catch(() => {});
            COV.set(sid, ''); UI.toast('Cover removed'); await refresh(); paintCover(sid);
          });
        },
        async fDel(b) {
          if (!(await UI.confirm({ title: 'Delete this file?', text: 'Students will no longer see it on the series page.', yes: 'Delete', tone: 'danger' }))) return;
          await UI.busy(b, async () => { const r = await AX.api.admin('file_delete', { id: b.dataset.id }); if (!r.ok) return UI.err(r); UI.toast('File deleted'); await refresh(); });
        },
        async fPick() { const f = await AX.u.pickFile('application/pdf,image/*'); if (!f) return; const t = el.querySelector('#mf-t').value; file = f; redraw(); el.querySelector('#mf-t').value = t || f.name.replace(/\.[a-z0-9]+$/i, ''); },
        async fUp(b) {
          if (busy) return;
          const er = el.querySelector('#mf-e'), set = (p, t) => { el.querySelector('#mf-p').classList.remove('hide'); el.querySelector('#mf-p i').style.width = p + '%'; el.querySelector('#mf-s').textContent = t; };
          er.textContent = '';
          if (!file) { er.textContent = 'Please choose a file.'; return; }
          if (file.size > 6 * 1024 * 1024) { er.textContent = 'This file is larger than 6 MB. Please compress it first.'; return; }
          const mime = file.type === 'application/pdf' ? 'application/pdf' : /^image\/(jpeg|png|webp)$/.test(file.type) ? file.type : '';
          if (!mime) { er.textContent = 'Only PDF, JPG, PNG or WebP files are allowed.'; return; }
          busy = true;
          await UI.busy(b, async () => {
            try {
              const b64 = (await AX.u.fileToDataURL(file)).split(',')[1], CH = 300000, n = Math.ceil(b64.length / CH);
              const title = el.querySelector('#mf-t').value.trim() || file.name.replace(/\.[a-z0-9]+$/i, '');
              let id = null;
              for (let k = 0; k < n; k++) {
                set(Math.round(k * 100 / n), `Uploading… ${Math.round(k * 100 / n)}%`);
                const r = await AX.api.admin('file_put', { id, series_id: sid, title, kind, name: file.name, mime, size: file.size, n: k, data: b64.slice(k * CH, (k + 1) * CH), last: k === n - 1 });
                if (!r.ok) throw new Error(r.error === 'too_big' ? 'file too big' : r.error === 'type' ? 'this file type is not allowed' : AX.errText(r));
                id = r.id;
              }
              set(100, 'Done');
              file = null; UI.toast('File uploaded'); await refresh();
            } catch (e) { er.textContent = 'Upload failed: ' + e.message; }
            finally { busy = false; }
          });
        }
      });
    }
  });
}
})();
