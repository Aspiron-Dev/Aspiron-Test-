/* =====================================================================
   Question bank: the questions students practise (app → Question bank) and build their own tests from
   (app → Test generator). Each question is tagged with subject, chapter, topic, level, type and source.
   Server: cbt_admin_qbank (supabase_v55_qbank.sql). Chapter tagging: pyq-syllabus.js (loaded when this page opens).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const EXAM = 'NEET';
const can = () => AX.can('content', 'manage');
const call = (a, d) => AX.api.call('cbt_admin_qbank', a, d || {});
let sylP = null;
const syl = () => sylP || (sylP = window.PYQ_SYL ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'pyq-syllabus.js?v=3'; s.onload = res; s.onerror = () => { sylP = null; rej(new Error('pyq-syllabus.js')); }; document.head.appendChild(s); }));
const SUBS = () => window.qbSubjects ? window.qbSubjects() : window.PYQ_SYL[EXAM].subjects;
// best chapter + topic for a question (NEET subjects and Maths), same scoring as pyqTag
const tag = (text, hint) => {
  const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' '; let best = null;
  SUBS().forEach(s => { if (hint && hint !== s.id) return; s.chapters.forEach(c => c.topics.forEach(tp => { let sc = 0; tp.kw.forEach(k => { if (k && t.includes(k)) sc += 1 + (k.includes(' ') ? 2 : 0) + (k.length > 8 ? 1 : 0); });
    if (sc && (!best || sc > best.score || (sc === best.score && !c.old && best.old))) best = { subject: s.id, chapter: c.id, topic: tp.name, score: sc, old: c.old }; })); });
  return best;
};
const LV = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const TY = [['mcq', 'Multiple choice'], ['statement', 'Statement based'], ['match', 'Match the following'], ['fill', 'Fill in the blanks'], ['assertion', 'Assertion & reason']];
const SR = [['ncert', 'NCERT based'], ['pyq', 'Previous year (PYQ)'], ['extra', 'Extra · out of NCERT']];
const lbl = (L, k) => (L.find(x => x[0] === k) || [k, k])[1];
const subName = s => { const x = SUBS().find(y => y.id === s); return x ? x.name : (s || 'General'); };
const chapName = (s, c) => { if (!c) return '— no chapter —'; const x = SUBS().find(y => y.id === s), ch = x && x.chapters.find(y => y.id === c); return ch ? ch.name : c; };
// same rules as cbt_private.qb_type in the SQL
const qType = q => { q = String(q || ''); return /(match|column|list)[ -]*(i|1|a)\b[\s\S]*(column|list)[ -]*(ii|2|b)\b/i.test(q) || /match the following|match list|match column/i.test(q) ? 'match'
  : /assertion/i.test(q) && /reason/i.test(q) ? 'assertion' : /statement/i.test(q) ? 'statement' : /_{3,}|\.{5,}|fill in the blank/i.test(q) ? 'fill' : 'mcq'; };
const opt = (L, v) => join(L, ([k, l]) => h`<option value="${k}" ${k === v ? raw('selected') : ''}>${l}</option>`);
const sbOpts = s => h`${join(SUBS(), x => h`<option value="${x.id}" ${x.id === s ? raw('selected') : ''}>${x.name}</option>`)}${s && !SUBS().some(x => x.id === s) ? h`<option value="${s}" selected>${s}</option>` : ''}`;
const chOpts = (s, c) => { const x = SUBS().find(y => y.id === s); return h`<option value="">— no chapter —</option>${x ? join([11, 12], cl => h`<optgroup label="Class ${cl}">${join(x.chapters.filter(y => y.cls === cl), y => h`<option value="${y.id}" ${y.id === c ? raw('selected') : ''}>${y.name}${y.old ? ' (old)' : ''}</option>`)}</optgroup>`) : ''}`; };
const tpOpts = (s, c, t) => { const x = SUBS().find(y => y.id === s), ch = x && x.chapters.find(y => y.id === c); return h`<option value="">— topic —</option>${ch ? join(ch.topics, y => h`<option ${y.name === t ? raw('selected') : ''}>${y.name}</option>`) : ''}${t && !(ch && ch.topics.some(y => y.name === t)) ? h`<option selected>${t}</option>` : ''}`; };
const missing = r => r && (r.error === 'missing' || (r.error === 'server' && (r.status === 404 || r.status === 400)));
const setupBox = () => h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v55_qbank.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again, then refresh.' })}</div>`;
const B = { rows: null, test: null, src: 'ncert', lv: 'medium', sel: new Set(), f: { s: '', c: '', l: '', y: '', o: '', on: '', q: '' }, page: 0 };

AX.mod({
  id: 'qbank', title: 'Question bank', short: 'Q bank', icon: 'db', group: 'Tests & questions', order: 62, perm: 'content',
  sub: 'Questions for practice and the student test generator.',
  async render(ctx) {
    const tab = ctx.parts[0] === 'browse' ? 'browse' : 'add';
    ctx.head({ title: 'Question bank', sub: 'Students practise these questions without limit (Question bank) and make their own scheduled tests from them (Test generator).',
      tabs: [{ id: 'add', title: 'Overview & add', icon: 'plus', href: '#/qbank' }, { id: 'browse', title: 'All questions', icon: 'search', href: '#/qbank/browse' }], tab });
    AX.set(ctx.el, UI.skeleton(5));
    try { await syl(); } catch (e) { AX.set(ctx.el, UI.errorBox({ error: 'server', detail: 'Could not load pyq-syllabus.js' })); return; }
    if (tab === 'browse') return browse(ctx);
    return overview(ctx);
  }
});
AX.creates.push({ label: 'Bank question', icon: 'db', perm: ['content', 'manage'], run() { AX.go('qbank'); setTimeout(() => editQ(null, () => AX.go('qbank')), 300); } });

/* ---------- overview: numbers + ways to add ---------- */
async function overview(ctx) {
  const [r, cat] = await Promise.all([call('stats'), AX.data.catalog()]);
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, missing(r) ? setupBox() : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const rows = r.rows || [], on = rows.filter(x => x[5]);
  const sum = (L, i) => { const m = {}; L.forEach(x => { m[x[i]] = (m[x[i]] || 0) + x[6]; }); return m; };
  const bySub = sum(on, 0), byLv = sum(on, 2), bySr = sum(on, 4), byTy = sum(on, 3);
  const tests = ((cat.ok && cat.tests) || []), added = r.tests || {};
  const kv = (m, L) => join(L, ([k, l]) => h`<div class="row" style="padding:4px 0"><span class="grow sm">${l}</span><b>${fmt.num(m[k] || 0)}</b></div>`);
  AX.set(ctx.el, h`<div class="kpis">${UI.kpi({ label: 'Questions in the bank', value: fmt.num(r.total), icon: 'db', hero: true })}${UI.kpi({ label: 'Switched on', value: fmt.num(on.reduce((a, x) => a + x[6], 0)), icon: 'check', tone: 'ok' })}${UI.kpi({ label: 'Students practising', value: fmt.num(r.practised), icon: 'users', tone: 'info' })}${UI.kpi({ label: 'Tests made by students', value: fmt.num(r.gen), icon: 'wand', tone: 'gold' })}</div>
    <div class="grid g3 mt16">
      <div class="card"><div class="card-h"><h3>Subjects</h3></div>${join(Object.keys(bySub), k => h`<div class="row" style="padding:4px 0"><span class="grow sm">${subName(k)}</span><b>${fmt.num(bySub[k])}</b></div>`)}${Object.keys(bySub).length ? '' : h`<p class="sm mut">None yet</p>`}</div>
      <div class="card"><div class="card-h"><h3>Level</h3></div>${kv(byLv, LV)}<div class="divider"></div>${kv(bySr, SR)}</div>
      <div class="card"><div class="card-h"><h3>Question type</h3></div>${kv(byTy, TY)}</div></div>
    ${can() ? h`
    <div class="card mt16"><div class="card-h">${icon('book')}<h3>Previous year questions</h3><span class="grow"></span>${UI.pill(fmt.num(r.pyq) + ' of ' + fmt.num(r.pyq_all) + ' in the bank', r.pyq >= r.pyq_all ? 'ok' : 'warn')}</div>
      <p class="sm mut">Copies every PYQ from the PYQ bank (with its chapter and topic, source "PYQ", level Medium). Questions with a diagram are skipped. Safe to press again after you add new papers — nothing is doubled.</p>
      <div class="row end mt12"><button class="btn pri" data-act="pyq" ${r.pyq_all ? '' : raw('disabled')}>${icon('download', 16)} Add all PYQs to the bank</button></div></div>
    <div class="card mt16" id="qk-add"><div class="card-h">${icon('wand')}<h3>Add the questions of a test</h3></div>
      <p class="sm mut">Choose a test, its source and usual level. Every question is tagged with a chapter, topic and type automatically — check them and save. <b>Add only tests whose live time is over</b>: students can practise these questions at once.</p>
      <div class="form-grid mt12"><div class="fld"><label>Test</label><select class="inp" id="qk-t"><option value="">Select a test…</option>${join(tests, t => h`<option value="${t.id}">${t.title} (${t.questions || '?'} Q)${added[t.id] ? ' ✓ in bank' : ''}</option>`)}</select></div>
        <div class="fld"><label>Source</label><select class="inp" id="qk-s">${opt(SR, B.src)}</select></div>
        <div class="fld"><label>Level</label><select class="inp" id="qk-l">${opt(LV, B.lv)}</select></div></div>
      <div class="row end mt12"><button class="btn pri" data-act="load">${icon('wand', 16)} Load & auto-tag questions</button></div><div id="qk-prev"></div></div>
    <div class="card mt16"><div class="card-h">${icon('plus')}<h3>Add one question</h3><span class="grow"></span><button class="btn" data-act="one">${icon('plus', 15)} New question</button></div><p class="sm mut">Type a question with its 4 options, answer and explanation.</p></div>
    ${Object.keys(added).length ? h`<div class="section-t">Tests in the bank · ${Object.keys(added).length}</div><div class="card pad0 list">${join(Object.keys(added), id => { const t = tests.find(x => x.id === id); return h`<div class="li"><div class="grow"><div class="t">${t ? t.title : 'Deleted test'}</div><div class="s">${fmt.plural(added[id], 'question')}</div></div><button class="btn sm" data-act="rmtest" data-id="${id}">${icon('trash', 14)} Remove from bank</button></div>`; })}</div>` : ''}`
    : h`<div class="callout info mt16">${icon('info')}<div class="sm">You can view the bank. Adding or changing questions needs Tests & content → Full.</div></div>`}`);
  B.rows = null;
  AX.act(ctx.el, {
    retry: () => ctx.reload(),
    async pyq(btn) { await UI.busy(btn, async () => { const x = await call('import_pyq'); if (!x.ok) return UI.err(x); UI.toast(fmt.num(x.added) + ' PYQs in the bank'); ctx.reload(); }); },
    one() { editQ(null, () => ctx.reload()); },
    async rmtest(el) { if (!(await UI.confirm({ title: 'Remove this test\'s questions from the bank?', text: 'Students will no longer practise them. The test itself is not changed.', yes: 'Remove', tone: 'danger' }))) return; const x = await call('remove_test', { test: el.dataset.id }); if (!x.ok) return UI.err(x); UI.toast(fmt.plural(x.deleted, 'question') + ' removed'); ctx.reload(); },
    async load(btn) {
      const id = ctx.el.querySelector('#qk-t').value; B.src = ctx.el.querySelector('#qk-s').value; B.lv = ctx.el.querySelector('#qk-l').value;
      if (!id) return UI.toast('Select the test first', { tone: 'warn' });
      await UI.busy(btn, async () => {
        const x = await AX.api.admin('test_get', { id });
        if (!x.ok || !x.test) return UI.toast('Could not load the test', { tone: 'bad' });
        B.test = id;
        B.rows = (x.test.data || []).map((q, i) => [q, i]).filter(([q]) => q && (q.q || q.img) && (q.options || []).length >= 4 && q.answer >= 0 && q.answer <= 3).map(([q, i]) => {
          const hint = window.pyqSubjOf(q.sec), t = tag([q.q, ...(q.options || []), q.explanation].join(' '), hint) || {};
          return { i, q: q.q || '', options: q.options.slice(0, 4), answer: q.answer, explanation: q.explanation || '', img: q.img || null, oimg: q.oimg || null,
            subject: t.subject || hint || (q.sec ? String(q.sec).toLowerCase().slice(0, 30) : 'bio'), chapter: t.chapter || '', topic: t.topic || '', level: B.lv, qtype: qType(q.q), sure: (t.score || 0) >= 2 };
        });
        const skipped = (x.test.data || []).length - B.rows.length;
        if (skipped) UI.toast(skipped + ' question(s) without 4 options or an answer are skipped', { tone: 'warn' });
        preview(ctx);
      });
    }
  });
}
function preview(ctx) {
  const box = ctx.el.querySelector('#qk-prev'); if (!box || !B.rows) return;
  const R = B.rows, unsure = R.filter(r => !r.sure || !r.chapter).length;
  AX.set(box, h`<div class="divider"></div><div class="row wrap"><div class="grow"><b>${R.length} questions</b> · ${lbl(SR, B.src)}</div>${UI.pill((R.length - unsure) + ' auto-tagged · ' + unsure + ' to check', unsure ? 'warn' : 'ok')}</div>
    <div class="col gap6 mt12" style="max-height:60vh;overflow:auto;padding-right:4px">${join(R.map((r, i) => [r, i]), ([r, i]) => h`<div class="well" style="${r.sure && r.chapter ? '' : 'border-color:color-mix(in srgb,var(--warn) 50%,transparent);background:var(--warn-soft)'}"><div class="row top"><b class="pill">${r.i + 1}</b><div class="grow sm">${r.q.slice(0, 220)}${r.q.length > 220 ? '…' : ''}${r.img ? ' 🖼' : ''}</div></div>
      <div class="grid g3 mt8"><select class="inp sm" data-i="${i}" data-k="subject">${sbOpts(r.subject)}</select><select class="inp sm" data-i="${i}" data-k="chapter">${chOpts(r.subject, r.chapter)}</select><select class="inp sm" data-i="${i}" data-k="topic">${tpOpts(r.subject, r.chapter, r.topic)}</select>
        <select class="inp sm" data-i="${i}" data-k="level">${opt(LV, r.level)}</select><select class="inp sm" data-i="${i}" data-k="qtype">${opt(TY, r.qtype)}</select></div></div>`)}</div>
    <div class="row end mt12"><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} Save ${R.length} questions to the bank</button></div>`);
  if (box.__w) return;
  box.__w = 1;
  box.addEventListener('change', e => {
    const s = e.target.closest('select[data-i]'); if (!s) return; const r = B.rows[+s.dataset.i], k = s.dataset.k;
    r[k] = s.value; r.sure = true;
    if (k === 'subject') { r.chapter = ''; r.topic = ''; }
    if (k === 'chapter') { const x = SUBS().find(y => y.id === r.subject), c = x && x.chapters.find(y => y.id === r.chapter); r.topic = c && c.topics[0] ? c.topics[0].name : ''; }
    if (['subject', 'chapter'].includes(k)) preview(ctx);
  });
  AX.act(box, {
    cancel() { B.rows = null; AX.set(box, ''); },
    async save(btn) {
      const items = B.rows.map(r => ({ subject: r.subject, chapter: r.chapter, topic: r.topic, level: r.level, qtype: r.qtype, source: B.src, q: r.q, options: r.options, answer: r.answer, explanation: r.explanation, img: r.img, oimg: r.oimg, src: 'test:' + B.test + ':' + r.i }));
      let n = 0, u = 0; btn.disabled = true;
      for (let i = 0; i < items.length; i += 50) {
        btn.textContent = 'Saving… ' + Math.min(i + 50, items.length) + '/' + items.length;
        const r = await call('add', { items: items.slice(i, i + 50) });
        if (!r.ok) { btn.disabled = false; btn.textContent = 'Try again'; return UI.toast('Could not save — ' + AX.errText(r), { tone: 'bad' }); }
        n += r.added || 0; u += r.updated || 0;
      }
      UI.toast(n + ' added' + (u ? ', ' + u + ' updated' : '')); B.rows = null; ctx.reload();
    }
  });
}

/* ---------- browse, filter, bulk tag ---------- */
async function browse(ctx) {
  const F = B.f, f = {};
  if (F.s) f.s = [F.s]; if (F.c) f.c = [F.c === '-' ? '' : F.c]; if (F.l) f.l = [F.l]; if (F.y) f.y = [F.y]; if (F.o) f.o = [F.o];
  const r = await call('list', { f, q: F.q, on: F.on === '' ? null : F.on === '1', page: B.page });
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, missing(r) ? setupBox() : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const L = r.items || [], pages = Math.max(1, Math.ceil(r.total / 50)), m = can();
  B.sel = new Set([...B.sel].filter(id => L.some(x => x.id === id)));
  const sel = (k, inner) => h`<select class="inp sm" data-f="${k}">${inner}</select>`;
  AX.set(ctx.el, h`<div class="card"><div class="grid g3">
      ${sel('s', h`<option value="">All subjects</option>${join(SUBS(), x => h`<option value="${x.id}" ${x.id === F.s ? raw('selected') : ''}>${x.name}</option>`)}`)}
      ${sel('c', F.s ? h`<option value="">All chapters</option><option value="-" ${F.c === '-' ? raw('selected') : ''}>— no chapter —</option>${join(SUBS().find(x => x.id === F.s).chapters, c => h`<option value="${c.id}" ${c.id === F.c ? raw('selected') : ''}>${c.name}</option>`)}` : h`<option value="">Choose a subject for chapters</option>`)}
      ${sel('l', h`<option value="">All levels</option>${opt(LV, F.l)}`)}${sel('y', h`<option value="">All types</option>${opt(TY, F.y)}`)}${sel('o', h`<option value="">All sources</option>${opt(SR, F.o)}`)}
      ${sel('on', h`<option value="">On and off</option><option value="1" ${F.on === '1' ? raw('selected') : ''}>Switched on</option><option value="0" ${F.on === '0' ? raw('selected') : ''}>Switched off</option>`)}</div>
    <div class="row mt8"><input class="inp sm grow" id="qk-q" placeholder="Search question text…" value="${F.q}"><button class="btn sm" data-act="find">${icon('search', 14)} Search</button></div></div>
    ${m ? h`<div class="card mt12" id="qk-bulk"><div class="row wrap gap6"><b class="sm">${B.sel.size} selected</b><button class="btn sm ghost" data-act="all">Select page</button><span class="grow"></span>
      <select class="inp sm" style="width:auto" data-b="level"><option value="">Set level…</option>${opt(LV, '')}</select><select class="inp sm" style="width:auto" data-b="qtype"><option value="">Set type…</option>${opt(TY, '')}</select><select class="inp sm" style="width:auto" data-b="source"><option value="">Set source…</option>${opt(SR, '')}</select>
      <button class="btn sm" data-act="off">Switch off</button><button class="btn sm" data-act="onq">Switch on</button><button class="btn sm danger" data-act="del">${icon('trash', 14)} Delete</button></div></div>` : ''}
    <div class="section-t">${fmt.plural(r.total, 'question')}${pages > 1 ? ' · page ' + (B.page + 1) + ' of ' + pages : ''}</div>
    <div class="card pad0 list">${L.length ? join(L, x => h`<div class="li" style="align-items:flex-start">${m ? h`<input type="checkbox" data-sel="${x.id}" ${B.sel.has(x.id) ? raw('checked') : ''} style="margin-top:4px" aria-label="Select">` : ''}
        <div class="grow" style="min-width:0"><div class="t" style="white-space:normal">${x.q || '(image question)'}${x.img ? ' 🖼' : ''}</div>
        <div class="row wrap gap6 mt8">${UI.pill(subName(x.s), 'info')}${UI.pill(chapName(x.s, x.c))}${UI.pill(lbl(LV, x.l), x.l === 'hard' ? 'bad' : x.l === 'easy' ? 'ok' : 'warn')}${UI.pill(lbl(TY, x.y))}${UI.pill(lbl(SR, x.o), 'gold')}${x.on ? '' : UI.pill('Off', 'bad')}<span class="xs mut">Answer ${'ABCD'[x.a]}</span></div></div>
        <button class="ibtn sm" data-act="edit" data-id="${x.id}" aria-label="Edit">${icon('edit', 15)}</button></div>`)
      : UI.empty({ icon: 'db', title: 'No questions here', text: 'Change the filters, or add questions on the Overview & add tab.' })}</div>
    ${pages > 1 ? h`<div class="row end mt12"><button class="btn sm" data-act="prev" ${B.page ? '' : raw('disabled')}>Previous</button><button class="btn sm" data-act="next" ${B.page + 1 < pages ? '' : raw('disabled')}>Next</button></div>` : ''}`);
  B.ctx = ctx;
  if (!ctx.el.__qk) ctx.el.__qk = 1, ctx.el.addEventListener('change', e => {
    const ctx = B.ctx; if (!ctx || !ctx.el.contains(e.target) || !ctx.el.querySelector('#qk-q')) return;
    const s = e.target.closest('[data-f]');
    if (s) { F[s.dataset.f] = s.value; if (s.dataset.f === 's') F.c = ''; B.page = 0; browse(ctx); return; }
    const c = e.target.closest('[data-sel]');
    if (c) { if (c.checked) B.sel.add(c.dataset.sel); else B.sel.delete(c.dataset.sel); const b = ctx.el.querySelector('#qk-bulk b'); if (b) b.textContent = B.sel.size + ' selected'; return; }
    const b = e.target.closest('[data-b]');
    if (b && b.value) { const k = b.dataset.b, v = b.value; b.value = ''; bulk(ctx, { [k]: v }); }
  });
  const q = ctx.el.querySelector('#qk-q'); if (q) q.addEventListener('keydown', e => { if (e.key === 'Enter') { F.q = q.value.trim(); B.page = 0; browse(ctx); } });
  AX.act(ctx.el, {
    retry: () => ctx.reload(),
    find() { F.q = ctx.el.querySelector('#qk-q').value.trim(); B.page = 0; browse(ctx); },
    all() { L.forEach(x => B.sel.add(x.id)); browse(ctx); },
    prev() { B.page = Math.max(0, B.page - 1); browse(ctx); },
    next() { B.page++; browse(ctx); },
    off() { bulk(ctx, { active: false }); },
    onq() { bulk(ctx, { active: true }); },
    async del() {
      if (!B.sel.size) return UI.toast('Select questions first', { tone: 'warn' });
      if (!(await UI.confirm({ title: 'Delete ' + fmt.plural(B.sel.size, 'question') + '?', text: 'They leave the bank for good. Tests students already made lose these questions.', yes: 'Delete', tone: 'danger' }))) return;
      const x = await call('delete', { ids: [...B.sel] }); if (!x.ok) return UI.err(x); UI.toast(fmt.plural(x.deleted, 'question') + ' deleted'); B.sel.clear(); browse(ctx);
    },
    edit(el) { editQ(el.dataset.id, () => browse(ctx)); }
  });
}
async function bulk(ctx, d) {
  if (!B.sel.size) return UI.toast('Select questions first', { tone: 'warn' });
  const x = await call('set', Object.assign({ ids: [...B.sel] }, d)); if (!x.ok) return UI.err(x);
  UI.toast(fmt.plural(x.changed, 'question') + ' changed'); browse(ctx);
}

/* ---------- one question: add or edit ---------- */
async function editQ(id, done) {
  let q = { subject: 'phy', chapter: '', topic: '', level: 'medium', qtype: 'mcq', source: 'extra', q: '', options: ['', '', '', ''], answer: 0, explanation: '', active: true };
  if (id) { const r = await call('get', { id }); if (!r.ok || !r.item) return UI.err(r.ok ? { error: 'not_found' } : r); q = r.item; }
  const m = can();
  const form = () => h`<div class="form-grid">
    <div class="fld"><label>Subject</label><select class="inp" name="subject">${sbOpts(q.subject)}</select></div>
    <div class="fld"><label>Chapter</label><select class="inp" name="chapter">${chOpts(q.subject, q.chapter)}</select></div>
    <div class="fld"><label>Topic</label><select class="inp" name="topic">${tpOpts(q.subject, q.chapter, q.topic)}</select></div>
    <div class="fld"><label>Level</label><select class="inp" name="level">${opt(LV, q.level)}</select></div>
    <div class="fld"><label>Type</label><select class="inp" name="qtype">${opt(TY, q.qtype)}</select></div>
    <div class="fld"><label>Source</label><select class="inp" name="source">${opt(SR, q.source)}</select></div></div>
    ${AX.f.textarea({ name: 'q', label: 'Question', value: q.q, rows: 4, full: true, max: 6000 })}
    <div class="form-grid mt8">${join([0, 1, 2, 3], i => AX.f.input({ name: 'o' + i, label: 'Option ' + 'ABCD'[i], value: (q.options || [])[i] || '', max: 2000 }))}</div>
    <div class="fld mt8"><label>Right answer</label><select class="inp" name="answer">${join([0, 1, 2, 3], i => h`<option value="${i}" ${i === q.answer ? raw('selected') : ''}>${'ABCD'[i]}</option>`)}</select></div>
    ${AX.f.textarea({ name: 'explanation', label: 'Explanation (shown after the student answers)', value: q.explanation, rows: 3, full: true, max: 6000 })}
    ${id ? AX.f.switch({ name: 'active', label: 'Switched on (students can get this question)', value: q.active }) : ''}
    ${q.img ? h`<p class="xs mut mt8">This question has a picture (kept as it is).</p>` : ''}`;
  UI.modal({ title: id ? 'Edit question' : 'New question', size: 'wide', body: form(),
    foot: m ? h`<button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 15)} Save</button>` : h`<button class="btn" data-close>Close</button>`,
    onOpen(el, close) {
      el.addEventListener('change', e => {
        const s = e.target; if (s.name !== 'subject' && s.name !== 'chapter') return;
        const sub = el.querySelector('[name=subject]').value, ch = s.name === 'subject' ? '' : el.querySelector('[name=chapter]').value;
        if (s.name === 'subject') AX.set(el.querySelector('[name=chapter]'), chOpts(sub, ''));
        AX.set(el.querySelector('[name=topic]'), tpOpts(sub, ch, ''));
      });
      AX.act(el, {
        async save(btn) {
          const d = AX.f.read(el);
          const o = [d.o0, d.o1, d.o2, d.o3].map(x => String(x || '').trim());
          if (!String(d.q || '').trim() && !q.img) return UI.toast('Type the question', { tone: 'warn' });
          if (o.some(x => !x) && !(q.oimg || []).some(Boolean)) return UI.toast('Fill all 4 options', { tone: 'warn' });
          const item = { id: id || undefined, subject: d.subject, chapter: d.chapter, topic: d.topic, level: d.level, qtype: d.qtype, source: d.source, q: String(d.q || '').trim(), options: o, answer: +d.answer, explanation: String(d.explanation || '').trim(), active: id ? !!d.active : true };
          await UI.busy(btn, async () => {
            const r = id ? await call('save', item) : await call('add', { items: [item] });
            if (!r.ok) return UI.err(r);
            UI.toast(id ? 'Saved' : 'Question added'); close(); done && done();
          });
        }
      });
    } });
}
})();
