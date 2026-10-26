/* =====================================================================
   PYQ bank: past NEET papers, chapter / topic tagged. Students see chapter-, topic- and year-wise analysis
   and which questions repeat (PYQ Analysis in the app).
   Server: cbt_admin_pyq (supabase_v11_pyq.sql). Tagging: pyq-syllabus.js (loaded when this page opens).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const EXAM = 'NEET';
const can = () => AX.can('content', 'manage');
const P = { papers: [], total: 0, rows: null, paper: '', year: 0, only: false, ready: [] };
let sylP = null;
const syl = () => sylP || (sylP = window.PYQ_SYL ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'pyq-syllabus.js?v=2'; s.onload = res; s.onerror = () => { sylP = null; rej(new Error('pyq-syllabus.js')); }; document.head.appendChild(s); }));
const S = () => window.PYQ_SYL[EXAM];
const subj = id => S().subjects.find(s => s.id === id) || S().subjects[0];
const chap = (sid, cid) => (subj(sid).chapters || []).find(c => c.id === cid);
const SUBJ_SHORT = { phy: 'Phy', chem: 'Chem', bio: 'Bio' };
const chOpts = (sid, cid, blank) => h`${blank ? h`<option value="">— chapter —</option>` : ''}${join([11, 12], cl => h`<optgroup label="Class ${cl}">${join(subj(sid).chapters.filter(c => c.cls === cl), c => h`<option value="${c.id}" ${c.id === cid ? raw('selected') : ''}>${c.name}${c.old ? ' (old)' : ''}</option>`)}</optgroup>`)}`;
const tpOpts = (sid, cid, tp) => { const c = chap(sid, cid); return h`<option value="">— topic —</option>${c ? join(c.topics, t => h`<option ${t.name === tp ? raw('selected') : ''}>${t.name}</option>`) : ''}`; };
const sbOpts = sid => join(S().subjects, s => h`<option value="${s.id}" ${s.id === sid ? raw('selected') : ''}>${s.name}</option>`);
const call = (a, d) => AX.api.call('cbt_admin_pyq', a, Object.assign({ exam: EXAM }, d || {}));

AX.mod({
  id: 'pyq', title: 'PYQ bank', icon: 'book', group: 'Academics', order: 60, perm: 'content',
  sub: 'Past papers, tagged by chapter and topic.',
  async render(ctx) {
    const paper = ctx.parts[0] === 'paper' ? ctx.parts[1] : null;
    ctx.head({ title: 'PYQ bank', sub: 'Add past NEET papers. Students see chapter-wise, topic-wise and year-wise analysis in PYQ Analysis, and which questions repeat.', crumb: paper || undefined });
    AX.set(ctx.el, UI.skeleton(5));
    try { await syl(); } catch (e) { AX.set(ctx.el, UI.errorBox({ error: 'server', detail: 'Could not load pyq-syllabus.js' })); return; }
    const r = await call('papers');
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v11_pyq.sql once in Supabase → SQL Editor, then refresh.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    P.papers = r.items || []; P.total = r.total || 0;
    if (paper) return browse(ctx, paper);
    return overview(ctx);
  }
});
AX.creates.push({ label: 'PYQ paper', icon: 'book', perm: ['content', 'manage'], run() { AX.go('pyq'); } });

async function overview(ctx) {
  const have = new Set(P.papers.map(p => p.paper));
  const left = S().papers.filter(p => !have.has(p)).length;
  const cat = await AX.data.catalog();
  let idx = []; try { const x = await fetch('pyq-data/index.json', { cache: 'no-cache' }); if (x.ok) idx = (await x.json()).filter(i => (i.exam || 'NEET') === EXAM); } catch (e) {}
  if (!ctx.alive()) return;
  P.ready = idx.filter(i => !have.has(i.paper));
  const tests = (cat.ok && cat.tests) || [];
  AX.set(ctx.el, h`<div class="kpis">${UI.kpi({ label: 'Questions in the bank', value: fmt.num(P.total), icon: 'db', hero: true })}${UI.kpi({ label: 'Papers added', value: P.papers.length, icon: 'book', tone: 'info' })}${UI.kpi({ label: 'Papers left', value: left, icon: 'clock', tone: 'gold', foot: 'from the NEET list' })}</div>
    ${idx.length ? h`<div class="card mt16"><div class="card-h">${icon('download')}<h3>Ready-made papers</h3><span class="grow"></span>${can() && P.ready.length > 1 ? h`<button class="btn sm pri" data-act="all">Add all ${P.ready.length}</button>` : ''}</div>
      <div class="list">${join(idx, i => h`<div class="li" style="padding:10px 0"><span class="av sm" style="--c:#c9a45c">${icon('book', 14)}</span><div class="grow"><div class="t">${i.paper}</div><div class="s">${i.n} questions · answers checked · own explanations</div></div>${have.has(i.paper) ? UI.pill('In bank', 'ok') : can() ? h`<button class="btn sm" data-act="imp" data-f="${i.file}">${icon('plus', 14)} Add</button>` : ''}</div>`)}</div></div>` : ''}
    ${can() ? h`<div class="card mt16" id="pq-add"><div class="card-h">${icon('plus')}<h3>Add a paper from a test</h3></div>
      <p class="sm mut">1) Create the paper as a normal test (Test studio → import the PDF) or pick one you have. 2) Choose it here with its paper name. 3) Check the auto-tagged chapters and save.</p>
      <div class="form-grid mt12"><div class="fld"><label>Test</label><select class="inp" id="pq-t"><option value="">Select a test…</option>${join(tests, t => h`<option value="${t.id}">${t.title} (${t.questions || '?'} Q)</option>`)}</select></div>
        <div class="fld"><label>Paper</label><select class="inp" id="pq-p"><option value="">Choose the paper…</option>${join(S().papers.slice().reverse(), p => h`<option value="${p}" ${have.has(p) ? raw('disabled') : ''}>${p}${have.has(p) ? ' ✓' : ''}</option>`)}<option value="__c">Other…</option></select></div></div>
      <div class="row end mt12"><button class="btn pri" data-act="load">${icon('wand', 16)} Load & auto-tag questions</button></div><div id="pq-prev"></div></div>` : ''}
    <div class="section-t">Papers in the bank · ${P.papers.length}</div>
    <div class="card pad0 list">${P.papers.length ? join(P.papers, p => h`<div class="li"><span class="av sm" style="--c:${AX.u.hue(p.paper)}">${String(p.year).slice(2)}</span><div class="grow"><div class="t">${p.paper}</div><div class="s">${p.year} · ${fmt.plural(p.n, 'question')} · ${(p.subjects || []).map(s => SUBJ_SHORT[s] || s).join(', ')}</div></div>
        <a class="btn sm" href="#/pyq/paper/${encodeURIComponent(p.paper)}">${icon('tag', 14)} Check tags</a>${can() ? h`<button class="ibtn sm" data-act="delp" data-p="${p.paper}" aria-label="Delete paper">${icon('trash', 15)}</button>` : ''}</div>`)
      : UI.empty({ icon: 'book', title: 'No papers yet', text: 'Add a ready-made paper or one of your tests above.' })}</div>`);
  AX.act(ctx.el, {
    retry: () => ctx.reload(),
    async imp(el) { await UI.busy(el, async () => { if (await importFile(el.dataset.f, el)) ctx.reload(); }); },
    async all(el) { el.disabled = true; for (let i = 0; i < P.ready.length; i++) { el.textContent = 'Adding ' + P.ready[i].paper + ' (' + (i + 1) + '/' + P.ready.length + ')…'; if (!(await importFile(P.ready[i].file, null, true))) { el.disabled = false; el.textContent = 'Try again'; return ctx.reload(); } } UI.toast(P.ready.length + ' papers added'); ctx.reload(); },
    async delp(el) { const p = el.dataset.p; if (!(await UI.confirm({ title: 'Delete "' + p + '"?', text: 'All its questions are removed from the PYQ bank.', yes: 'Delete paper', tone: 'danger' }))) return; const x = await call('delete_paper', { paper: p }); if (!x.ok) return UI.err(x); UI.toast('Deleted'); ctx.reload(); },
    async load(btn) {
      const id = ctx.el.querySelector('#pq-t').value, sel = ctx.el.querySelector('#pq-p'); let paper = sel.value;
      if (!id) return UI.toast('Select the test first', { tone: 'warn' });
      if (paper === '__c') { paper = await UI.prompt({ title: 'Paper name', label: 'Exam and year, e.g. NEET 2026', placeholder: 'NEET 2026', max: 60 }); if (!paper) return; }
      if (!paper) return UI.toast('Choose which paper it is', { tone: 'warn' });
      const year = +((paper.match(/((?:19|20)\d\d)/) || [])[1] || 0);
      if (!year) return UI.toast('The paper name must contain the year, e.g. NEET 2024', { tone: 'warn' });
      if (have.has(paper)) return UI.toast(paper + ' is already in the bank', { tone: 'warn' });
      await UI.busy(btn, async () => {
        const r = await AX.api.admin('test_get', { id });
        if (!r.ok || !r.test) return UI.toast('Could not load the test', { tone: 'bad' });
        const Q = (r.test.data || []).filter(q => q && (q.q || q.img));
        P.paper = paper; P.year = year; P.only = false;
        P.rows = Q.map((q, i) => { const hint = window.pyqSubjOf(q.sec), t = window.pyqTag(EXAM, [q.q, ...(q.options || []), q.explanation].join(' '), hint) || {};
          return { qno: i + 1, q: q.q || '', options: (q.options || []).slice(0, 4), answer: q.answer, explanation: q.explanation || '', has_img: !!(q.img || (q.oimg || []).some(Boolean)), subject: t.subject || hint || 'bio', chapter: t.chapter || '', topic: t.topic || '', sure: (t.score || 0) >= 2 && (!hint || t.subject === hint) }; });
        preview(ctx);
      });
    }
  });
}
async function importFile(f, btn, quiet) {
  if (!/^[a-z0-9-]+\.json$/.test(f)) return false;
  let d; try { d = await (await fetch('pyq-data/' + f, { cache: 'no-cache' })).json(); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.items)) { UI.toast('Could not load ' + f, { tone: 'bad' }); return false; }
  if (P.papers.some(p => p.paper === d.paper)) { if (!quiet) UI.toast(d.paper + ' is already in the bank', { tone: 'warn' }); return true; }
  const items = d.items.map(x => Object.assign({}, x, { rkey: window.pyqKey(x.q) }));
  let n = 0;
  for (let i = 0; i < items.length; i += 100) {
    const r = await AX.api.call('cbt_admin_pyq', 'bulk', { exam: d.exam || EXAM, items: items.slice(i, i + 100) });
    if (!r.ok) { UI.toast('Could not save — ' + AX.errText(r), { tone: 'bad' }); return false; }
    n += r.added || 0;
  }
  P.papers.push({ paper: d.paper });
  if (!quiet) UI.toast(n + ' questions added from ' + d.paper);
  return true;
}
function preview(ctx) {
  const box = ctx.el.querySelector('#pq-prev'); if (!box || !P.rows) return;
  const R = P.rows, unsure = R.filter(r => !r.sure || !r.chapter).length;
  AX.set(box, h`<div class="divider"></div><div class="row wrap"><div class="grow"><b>${P.paper}</b> · ${R.length} questions</div>${UI.pill((R.length - unsure) + ' auto-tagged · ' + unsure + ' to check', unsure ? 'warn' : 'ok')}<button class="btn sm" data-act="only">${P.only ? 'Show all' : 'Show only to check'}</button></div>
    <div class="col gap6 mt12" style="max-height:60vh;overflow:auto;padding-right:4px">${join(R.map((r, i) => [r, i]).filter(([r]) => !(P.only && r.sure && r.chapter)), ([r, i]) => h`<div class="well" style="${r.sure && r.chapter ? '' : 'border-color:color-mix(in srgb,var(--warn) 50%,transparent);background:var(--warn-soft)'}"><div class="row top"><b class="pill">${r.qno}</b><div class="grow sm">${r.q.slice(0, 220)}${r.q.length > 220 ? '…' : ''}${r.has_img ? ' 🖼' : ''}</div></div>
      <div class="grid g3 mt8"><select class="inp sm" data-i="${i}" data-k="subject">${sbOpts(r.subject)}</select><select class="inp sm" data-i="${i}" data-k="chapter">${chOpts(r.subject, r.chapter, true)}</select><select class="inp sm" data-i="${i}" data-k="topic">${tpOpts(r.subject, r.chapter, r.topic)}</select></div></div>`)}</div>
    <div class="row end mt12"><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} Save ${R.length} questions to the PYQ bank</button></div>`);
  if (!box.__w) {
    box.__w = 1;
    box.addEventListener('change', e => {
      const s = e.target.closest('select[data-i]'); if (!s) return; const r = P.rows[+s.dataset.i], k = s.dataset.k;
      r[k] = s.value; r.sure = true;
      if (k === 'subject') { r.chapter = ''; r.topic = ''; }
      if (k === 'chapter') { const c = chap(r.subject, r.chapter); r.topic = c && c.topics[0] ? c.topics[0].name : ''; }
      preview(ctx);
    });
    AX.act(box, {
      only() { P.only = !P.only; preview(ctx); },
      cancel() { P.rows = null; AX.set(box, ''); },
      async save(btn) {
        const miss = P.rows.filter(r => !r.chapter).length;
        if (miss && !(await UI.confirm({ title: miss + (miss > 1 ? ' questions have' : ' question has') + ' no chapter', text: 'They will be skipped. Continue?', yes: 'Continue' }))) return;
        const items = P.rows.filter(r => r.chapter).map(r => ({ subject: r.subject, chapter: r.chapter, topic: r.topic, year: P.year, paper: P.paper, qno: r.qno, q: r.q, options: r.options, answer: r.answer, explanation: r.explanation, has_img: r.has_img, rkey: window.pyqKey(r.q) }));
        let n = 0; btn.disabled = true;
        for (let i = 0; i < items.length; i += 100) {
          btn.textContent = 'Saving… ' + Math.min(i + 100, items.length) + '/' + items.length;
          const r = await call('bulk', { items: items.slice(i, i + 100) });
          if (!r.ok) { btn.disabled = false; btn.textContent = 'Try again'; return UI.toast('Could not save — ' + AX.errText(r), { tone: 'bad' }); }
          n += r.added || 0;
        }
        UI.toast(n + ' questions added from ' + P.paper); P.rows = null; ctx.reload();
      }
    });
  }
}
async function browse(ctx, paper) {
  const r = await call('list', { paper });
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const L = r.items || [];
  ctx.head({ title: paper, sub: 'Check the subject, chapter and topic of each question. Changes save as you pick.', crumb: paper, actions: h`<a class="btn" href="#/pyq">${icon('arrowL', 16)} All papers</a>` });
  const row = (x, i) => h`<div class="li" style="align-items:flex-start;flex-wrap:wrap"><b class="pill">${x.qno}</b><div class="grow" style="min-width:220px"><div class="sm">${String(x.q || '').slice(0, 200)}</div>
      ${can() ? h`<div class="grid g3 mt8"><select class="inp sm" data-i="${i}" data-k="subject">${sbOpts(x.subject)}</select><select class="inp sm" data-i="${i}" data-k="chapter">${chOpts(x.subject, x.chapter, false)}</select><select class="inp sm" data-i="${i}" data-k="topic">${tpOpts(x.subject, x.chapter, x.topic)}</select></div>`
        : h`<div class="xs mut mt4">${subj(x.subject).name} · ${(chap(x.subject, x.chapter) || {}).name || '—'} · ${x.topic || '—'}</div>`}</div>
      ${can() ? h`<button class="ibtn sm" data-act="delq" data-i="${i}" aria-label="Delete question">${icon('trash', 15)}</button>` : ''}</div>`;
  AX.set(ctx.el, h`<div class="card pad0 list" id="pq-list">${L.length ? join(L, row) : UI.empty({ icon: 'book', title: 'No questions in this paper' })}</div>`);
  const list = ctx.el.querySelector('#pq-list');
  list.addEventListener('change', async e => {
    const s = e.target.closest('select[data-i]'); if (!s) return; const i = +s.dataset.i, x = L[i], k = s.dataset.k;
    x[k] = s.value;
    if (k === 'subject') { const c = subj(x.subject).chapters[0]; x.chapter = c ? c.id : ''; x.topic = c && c.topics[0] ? c.topics[0].name : ''; }
    if (k === 'chapter') { const c = chap(x.subject, x.chapter); x.topic = c && c.topics[0] ? c.topics[0].name : ''; }
    const y = await call('update', { id: x.id, subject: x.subject, chapter: x.chapter || '', topic: x.topic || '' });
    if (!y.ok) return UI.err(y);
    UI.toast('Saved');
    const tmp = document.createElement('div'); tmp.innerHTML = AX.html(row(x, i)); s.closest('.li').replaceWith(tmp.firstElementChild);
  });
  AX.act(ctx.el, {
    retry: () => ctx.reload(),
    async delq(el) { const x = L[+el.dataset.i]; if (!(await UI.confirm({ title: 'Delete question ' + x.qno + ' from the bank?', yes: 'Delete', tone: 'danger' }))) return; const y = await call('delete', { id: x.id }); if (!y.ok) return UI.err(y); UI.toast('Deleted'); ctx.reload(); }
  });
}
})();
