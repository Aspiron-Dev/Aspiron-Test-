/* =====================================================================
   Test builder — a full-screen workspace to create or edit one test.
   Steps: 1 Details · 2 Questions · 3 Import · 4 Schedule & access · 5 Review & publish.
   AX.openTest(testId | null, {seriesId, folderId, step:1-5, q:questionIndex, draft:key})
   Server (same calls as the old admin2/admin3): cbt_admin test_get · test_stage (batches of ≤40 questions / ≤450,000 chars)
   · test_save (stage_token + count, or details only) · folder_save (new folder by name) · cbt_admin_practice set.
   Question format (the student app reads it — never change it):
   {q, options:[4 strings], answer:0-3|null, explanation, sec, img:dataURL|null, oimg:[4 × dataURL|null], eimg:dataURL|null}
   A draft of every unpublished change is kept in localStorage ('cx_tdraft:<test id | new-…>').
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const L = 'ABCD', PAGE = 20, DK = 'cx_tdraft:';
const ms = v => { const x = AX.fmt.ms(v); return x ? Number(x) : null; };
const STEPS = [
  { id: 'details', t: 'Details', i: 'edit' },
  { id: 'questions', t: 'Questions', i: 'list' },
  { id: 'import', t: 'Import', i: 'upload' },
  { id: 'schedule', t: 'Schedule & access', i: 'calendar' },
  { id: 'publish', t: 'Review & publish', i: 'send' }
];

/* ---------- question kit (also used by m-import.js) ---------- */
const emptyQ = () => ({ q: '', options: ['', '', '', ''], answer: null, explanation: '', sec: '', img: null, oimg: [null, null, null, null], eimg: null });
const ansOf = a => Number.isInteger(a) && a >= 0 && a <= 3 ? a : typeof a === 'string' && /^[0-3]$/.test(a) ? Number(a) : null;
// hi = the Hindi text of the question (v41): {q, options:[4], explanation}; images and the answer key are shared
const normHi = h => h && typeof h === 'object' ? { q: String(h.q || ''), options: [0, 1, 2, 3].map(i => String((h.options && h.options[i]) || '')), explanation: String(h.explanation || '') } : null;
const hiEmpty = h => !h || (!h.q.trim() && h.options.every(o => !o.trim()) && !h.explanation.trim());
const normQ = q => ({ q: String(q.q || ''), options: [0, 1, 2, 3].map(i => String((q.options && q.options[i]) || '')), answer: ansOf(q.answer), explanation: String(q.explanation || ''),
  sec: String(q.sec || ''), img: q.img || null, oimg: [0, 1, 2, 3].map(i => (q.oimg && q.oimg[i]) || null), eimg: q.eimg || null, gap: !!q.gap, hi: hiEmpty(normHi(q.hi)) ? null : normHi(q.hi) });
// what Hindi is still missing: Hindi is needed wherever the English has text (an image-only option needs none)
function hiProblems(q) {
  const h = q.hi || { q: '', options: ['', '', '', ''], explanation: '' }, p = [];
  if (q.q.trim() && !h.q.trim()) p.push('Hindi question');
  q.options.forEach((o, j) => { if (o.trim() && !h.options[j].trim()) p.push('Hindi option ' + L[j]); });
  return p;
}
const hiOk = q => !hiProblems(q).length;
const hiSolMissing = q => !!q.explanation.trim() && !(q.hi && q.hi.explanation.trim());
function problems(q) {
  const p = [];
  if (q.gap && !q.q && !q.img) p.push('Question missing in the file');
  else if (!q.q.trim() && !q.img) p.push('Question text is empty');
  q.options.forEach((o, j) => { if (!o.trim() && !q.oimg[j]) p.push('Option ' + L[j] + ' is empty'); });
  if (q.answer == null) p.push('No correct answer set');
  return p;
}
const bad = q => problems(q).length > 0;
const short = p => p.replace('Question ', '').replace('is empty', 'empty').replace('No correct answer set', 'no answer');
// exactly the shape the old publish sent (the gap flag is not sent)
const outQ = q => ({ q: q.q, options: q.options, answer: q.answer, explanation: q.explanation, sec: q.sec || '', img: q.img || null, oimg: q.oimg, eimg: q.eimg || null });
AX.qkit = { emptyQ, normQ, problems, bad, short, outQ, hiProblems, hiOk };

/* ---------- live window rules (old liveCheck / liveFill) ---------- */
function liveError(m) {
  const op = m.opens_at, cl = m.closes_at, rs = m.result_at;
  if (cl && op && cl <= op) return 'Live end must be after the start time';
  if (rs && cl && rs < cl) return 'Result time must be after the live end time';
  if (rs && m.practice) return 'Practice tests show answers at once: clear the result time or turn practice off';
  return '';
}
function liveWarn(m) {
  const dur = +m.duration || 180;
  return m.result_at && m.closes_at && m.result_at < m.closes_at + dur * 60000 ? `Someone who starts just before the live end will still be writing when the result comes out (the test is ${dur} min). Their attempt then does not count for rank.` : '';
}
async function liveCheck(m) {
  const e = liveError(m); if (e) return e;
  const w = liveWarn(m);
  if (w && !(await UI.confirm({ title: 'Keep these times?', text: w + ' Keep these times?', yes: 'Keep times', no: 'Change times' }))) return null;
  return '';
}
// "live till 9 PM, result 10 PM" on the day the test starts (today if no start; next day if it starts after 9 PM)
function liveFill(m) {
  const st = m.opens_at || Date.now(), e = new Date(st); e.setHours(21, 0, 0, 0);
  if (st >= e.getTime()) e.setDate(e.getDate() + 1);
  m.closes_at = e.getTime(); m.result_at = e.getTime() + 3600000;
}
AX.liveRules = { liveError, liveWarn, liveFill };

/* ---------- state ---------- */
let B = null, WS = null, savedTick = null;
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => b.toString(16).padStart(2, '0')).join('');
const series = id => (B.cat.series || []).find(s => s.id === id);
const folders = sid => (B.cat.folders || []).filter(f => f.series_id === sid);

AX.css('builder', `
.ws{color:var(--tx)}
.ws-top .bw-tt{font-weight:750;font-size:15px}
.ws-rail .step{text-align:left}
.ws-rail .step .st{display:flex;flex-direction:column;align-items:flex-start;min-width:0;line-height:1.25}
.ws-rail .step small{font-size:11.5px;font-weight:600;color:var(--faint);max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-rail .step.bad .n{background:var(--warn-soft);color:var(--warn)}
.bw-rf{margin-top:18px;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--solid-2);font-size:12.5px}
.bw-rf .kv{font-size:12.5px;gap:6px 12px}
.bw-h{margin:4px 0 18px}
.bw-h h2{font-family:var(--font-display);font-size:26px;font-weight:600;letter-spacing:-.02em}
.bw-h p{color:var(--mut);margin-top:6px;max-width:68ch}
.bw-nav{display:flex;gap:10px;margin-top:22px;align-items:center}
.bw-nav .sp{flex:1}
.bw-fs{border:0;margin:0;padding:0;min-width:0}
.bw-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.bw-chips button{height:28px;padding:0 11px;border-radius:14px;border:1px solid var(--line-2);background:var(--solid-2);font-size:12.5px;font-weight:650;color:var(--tx-2)}
.bw-chips button:hover,.bw-chips button.on{border-color:var(--pri-line);color:var(--pri);background:var(--pri-soft)}
.bw-sw{display:flex;flex-direction:column;gap:14px}
.bq-tb{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bq-tb .search{flex:1;min-width:180px}
.bq-list{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.qcard{position:relative}
.qcard.bad{border-color:color-mix(in srgb,var(--warn) 45%,var(--line))}
.qcard.sel{border-color:var(--pri);box-shadow:0 0 0 3px var(--pri-soft)}
.qcard.flash{border-color:var(--pri);box-shadow:0 0 0 4px var(--pri-soft)}
.qcard .qt{cursor:pointer}
.qcard .qt.ro{cursor:default}
.qcard button.op{font:inherit;color:inherit;text-align:left;width:100%;cursor:pointer;transition:border-color var(--fast),background var(--fast)}
.qcard button.op:hover{border-color:var(--pri-line)}
.qcard button.op:disabled{cursor:default;opacity:1}
.qcard .op img{max-height:110px;margin-top:6px}
.qcard .qx{margin-top:10px;padding:9px 12px;border-radius:10px;background:var(--solid-2);border-left:3px solid var(--info);font-size:13px;color:var(--tx-2);white-space:pre-wrap;overflow-wrap:anywhere}
.qcard .qx b{color:var(--info);font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;display:block;margin-bottom:2px}
.qcard .qck{width:20px;height:20px;accent-color:var(--pri-2);margin:7px 0 0;flex:none}
.qcard .qa{display:flex;gap:2px;margin-left:auto}
.bq-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:26px}
.bq-bulk{position:sticky;bottom:12px;z-index:5;margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:16px}
.bq-pg{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px}
.bq-ed .lblrow{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.bq-ed .lblrow label{font-size:12.5px;font-weight:700;color:var(--tx-2)}
.bq-opt{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:14px;border:1px solid var(--line);background:var(--solid-2);transition:border-color var(--fast),background var(--fast)}
.bq-opt.key{border-color:color-mix(in srgb,var(--ok) 55%,transparent);background:var(--ok-soft)}
.bq-radio{width:38px;height:38px;flex:none;border-radius:50%;border:1.5px solid var(--line-2);background:var(--solid);font-weight:800;color:var(--mut);display:grid;place-items:center}
.bq-radio:hover{border-color:var(--ok);color:var(--ok)}
.bq-opt.key .bq-radio{background:var(--ok);border-color:var(--ok);color:#fff}
.bq-img{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}
.bq-img img{max-height:120px;max-width:100%;border-radius:10px;border:1px solid var(--line);background:#fff}
.bq-probs{display:flex;gap:6px;flex-wrap:wrap;min-height:22px}
.kg{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:6px}
.kr{display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:10px;border:1px solid var(--line);background:var(--solid-2)}
.kr.miss{border-color:color-mix(in srgb,var(--warn) 50%,transparent)}
.ex-prev{display:flex;flex-direction:column;gap:8px;font-size:13px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--solid-2)}
.kr .num{width:34px;font-weight:800;font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums}
.kr button{width:30px;height:30px;border-radius:8px;border:1px solid var(--line-2);background:var(--solid);font-weight:750;font-size:12.5px;color:var(--tx-2)}
.kr button.on{background:var(--ok);border-color:var(--ok);color:#fff}
.bs-tl{display:flex;flex-direction:column;gap:0;margin-top:4px}
.bs-ph{display:flex;gap:12px;padding:10px 0;position:relative}
.bs-ph .bd{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;background:var(--hover);color:var(--mut)}
.bs-ph.on .bd{background:var(--grad-pri);color:var(--pri-ink)}
.bs-ph .bd .ax-ic{width:16px;height:16px}
.bs-ph:not(:last-child)::after{content:"";position:absolute;left:14px;top:42px;bottom:-2px;width:2px;background:var(--line)}
.bs-ph .when{font-size:12px;font-weight:700;color:var(--pri)}
.bp-ck{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}
.bp-ck:first-child{border-top:0}
.bp-ck .ci{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;flex:none}
.bp-ck .ci.ok{background:var(--ok-soft);color:var(--ok)}.bp-ck .ci.warn{background:var(--warn-soft);color:var(--warn)}.bp-ck .ci.bad{background:var(--bad-soft);color:var(--bad)}
.bp-done{text-align:center;padding:30px 18px}
.bp-done .big{width:68px;height:68px;border-radius:22px;margin:0 auto 14px;display:grid;place-items:center;background:var(--grad-pri);color:var(--pri-ink);box-shadow:0 14px 34px color-mix(in srgb,var(--pri-2) 40%,transparent)}
.bp-done .big .ax-ic{width:32px;height:32px;stroke-width:2.2}
.bi-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.bi-tile{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:18px;border-radius:var(--r-lg);border:1px solid var(--line);background:var(--solid);text-align:left;color:var(--tx);transition:border-color var(--fast),transform var(--std) var(--ease)}
.bi-tile:hover{border-color:var(--pri-line);transform:translateY(-2px)}
.bi-tile .ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri)}
.bi-tile b{font-size:15px}
.bi-tile span{font-size:12.5px;color:var(--mut)}
@media (max-width:900px){.ws-rail .step small{display:none}.ws-top .hide-ph{display:none}.ws-main{padding-bottom:140px}}
@media (max-width:560px){.bq-hph{display:none}.bw-h h2{font-size:22px}.bw-nav .btn{flex:1}.qcard{padding:12px;gap:10px}.qcard .qn{width:30px;height:30px}}
`);

/* ---------- open / close ---------- */
AX.openTest = async (id, o = {}) => {
  if (!AX.can('content')) return UI.toast('You do not have access to tests', { tone: 'warn' });
  const qi = o.question != null ? +o.question : o.q != null ? +o.q : null;
  if (B) {
    if (id && B.id === id) { if (qi != null) focusQ(qi); else if (o.step) go(o.step); return; }
    if (!(await closeWs())) return;
  }
  const ro = !AX.can('content', 'manage');
  mountShell();
  const cat = await AX.data.catalog();
  if (!cat || !cat.ok) { unmount(); return UI.err(cat || {}); }
  const st = { id: id || null, ro, cat, key: id || ('new-' + Date.now().toString(36) + AX.u.uid().slice(0, 4)), step: o.step || (id || qi != null ? 2 : 1), Q: [], qDirty: false, dirty: false, published: false,
    view: { page: 0, filter: 'all', sec: null, find: '', sel: new Set(), selMode: false }, results: 0, practice0: false, savedAt: null,
    lang: 'en', hiDirty: false, hiServer: null, noLang: '' };
  if (id) {
    const r = await AX.api.admin('test_get', { id });
    if (!WS) return;
    if (!r.ok || !r.test) { unmount(); return UI.err(r.ok ? { error: 'not_found' } : r); }
    const t = r.test, row = (cat.tests || []).find(x => x.id === id) || {};
    st.practice0 = cat.practice ? cat.practice.has(String(id)) : !!t.practice;
    st.meta = { title: t.title || '', series_id: t.series_id || '', folder_id: t.folder_id || '', folderNew: '', duration: t.duration == null ? 180 : t.duration,
      correct: t.correct_marks != null ? t.correct_marks : (t.correct != null ? t.correct : 4), wrong: t.wrong_marks != null ? t.wrong_marks : (t.wrong != null ? t.wrong : 1),
      lock_back: !!t.lock_back, free_preview: !!t.free_preview, active: t.active !== false, sort_order: t.sort_order || 0,
      opens_at: ms(t.opens_at), closes_at: ms(t.closes_at), result_at: ms(t.result_at), practice: st.practice0 };
    st.Q = (t.data || []).map(normQ);
    st.results = row.results || 0;
    st.published = true;
    // v41: the Hindi text of the questions, kept next to the test
    const hr = await AX.api.call('cbt_admin_lang', 'test_get', { id });
    if (!WS) return;
    if (!hr.ok) st.noLang = hr.error || 'server';
    else if (Array.isArray(hr.hi) && hr.hi.length === st.Q.length) {
      st.Q.forEach((q, i) => { const x = normHi(hr.hi[i]); q.hi = hiEmpty(x) ? null : x; });
      st.hiServer = { ready: !!hr.ready, fresh: !!hr.fresh, done: hr.done || 0 };
    } else if (hr.hi) st.hiServer = { ready: false, fresh: false, done: hr.done || 0, lost: true };
  } else {
    const sid = o.seriesId || ((cat.series || [])[0] || {}).id || '';
    const maxSort = Math.max(0, ...(cat.tests || []).filter(t => t.series_id === sid).map(t => +t.sort_order || 0));
    st.meta = { title: '', series_id: sid, folder_id: o.folderId || '', folderNew: '', duration: 180, correct: 4, wrong: 1, lock_back: false, free_preview: false, active: true,
      sort_order: maxSort + 1, opens_at: null, closes_at: null, result_at: null, practice: false };
  }
  // an unsaved draft on this device?
  const dkey = o.draft || (id ? id : null);
  const d = dkey ? AX.ls.get(DK + dkey, null) : null;
  if (d && d.meta && Array.isArray(d.Q) && !ro) {
    const use = o.draft ? true : await UI.confirm({ title: 'Continue your unsaved changes?', text: 'You changed this test on this device ' + fmt.ago(d.at) + ' and did not publish. Restore those changes?', yes: 'Restore changes', no: 'Use the published test' });
    if (!WS) return;
    if (use) { st.key = d.key || dkey; st.meta = Object.assign(st.meta, d.meta); st.Q = d.Q.map(normQ); st.qDirty = !!d.qDirty || !id; st.hiDirty = !!d.hiDirty; st.dirty = true; st.savedAt = d.at; if (d.step) st.step = d.step; }
    else AX.ls.del(DK + dkey);
  }
  B = st;
  render();
  if (qi != null) setTimeout(() => focusQ(qi), 60);
};
// jump to question i (0-based), highlight it and, for editors, open it
function focusQ(i) { if (!B) return; jumpQ(i); if (!B.ro && i >= 0 && i < B.Q.length) setTimeout(() => { if (B && !UI.top()) editQ(i); }, 350); }
AX.builderOpen = () => !!B;
AX.testDrafts = () => {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(DK)) { const d = AX.ls.get(k, null); if (d && d.meta) out.push({ key: k.slice(DK.length), id: d.id || null, title: d.meta.title || 'Untitled test', at: d.at, count: (d.Q || []).length, series_id: d.meta.series_id }); } } } catch (e) {}
  return out.sort((a, b) => b.at - a.at);
};
AX.dropTestDraft = key => AX.ls.del(DK + key);

function mountShell() {
  WS = document.createElement('div');
  WS.className = 'ws'; WS.setAttribute('role', 'dialog'); WS.setAttribute('aria-modal', 'true'); WS.setAttribute('aria-label', 'Test builder');
  WS.innerHTML = AX.html(h`<div class="ws-top glass"><button class="ibtn" data-act="close" aria-label="Close builder">${icon('x')}</button>
      <div class="grow"><div class="bw-tt ell" id="bw-t">Loading…</div><div class="xs mut ell" id="bw-s"></div></div>
      <span class="xs mut hide-ph" id="bw-saved"></span><span id="bw-ta"></span></div>
    <div class="ws-body"><nav class="ws-rail glass" id="bw-rail" aria-label="Steps"></nav><main class="ws-main" id="bw-main"><div class="ws-inner" id="bw-in">${UI.skeleton(6)}</div></main></div>`);
  document.body.appendChild(WS);
  document.body.style.overflow = 'hidden';
  AX.act(WS, ACTS);
  WS.addEventListener('input', onField); WS.addEventListener('change', onField);
  UI.wire(WS);
  clearInterval(savedTick); savedTick = setInterval(savedText, 30000);
}
function unmount() {
  clearInterval(savedTick);
  if (WS) { WS.remove(); WS = null; }
  B = null;
  if (!UI.top()) document.body.style.overflow = '';
}
async function closeWs() {
  if (!B) { unmount(); return true; }
  if (B.dirty && !B.ro) {
    const ok = await UI.confirm({ title: 'Close the test builder?', tone: B.draftFail ? 'danger' : '',
      text: B.draftFail ? 'Your changes are not published, and this device could not keep a draft (the images are too big). If you close now they are lost.' : 'Your changes are not published yet. They stay saved as a draft on this device — open Test studio to continue later.',
      yes: B.draftFail ? 'Close and lose changes' : 'Close', no: 'Keep editing' });
    if (!ok) return false;
  }
  unmount();
  return true;
}
AX.closeTest = closeWs;
document.addEventListener('keydown', e => {
  if (!B || !WS || UI.top()) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { e.preventDefault(); closeWs(); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); if (!B.ro) { saveDraft(); UI.toast(B.draftFail ? 'Could not keep a draft on this device' : 'Draft saved on this device', B.draftFail ? { tone: 'warn' } : {}); } }
  else if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(+e.key); }
});
window.addEventListener('beforeunload', e => { if (B && B.dirty && !B.ro) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

/* ---------- drafts ---------- */
const saveSoon = AX.u.debounce(() => saveDraft(), 700);
function saveDraft() {
  if (!B || B.ro || !B.dirty) return;
  const d = { v: 1, key: B.key, id: B.id, meta: B.meta, Q: B.Q, qDirty: B.qDirty, hiDirty: B.hiDirty, step: B.step, at: Date.now() };
  try { localStorage.setItem(DK + B.key, JSON.stringify(d)); B.savedAt = d.at; B.draftFail = false; }
  catch (e) { B.draftFail = true; }
  savedText();
}
function savedText() {
  const el = WS && WS.querySelector('#bw-saved'); if (!el || !B) return;
  el.textContent = B.ro ? '' : B.draftFail ? 'Draft too big for this device' : B.dirty ? (B.savedAt ? 'Draft saved ' + fmt.ago(B.savedAt) : 'Unsaved changes') : B.published ? 'All changes published' : '';
}
function dirty(q) {
  if (!B || B.ro) return;
  B.dirty = true; if (q) B.qDirty = true;
  saveSoon(); chrome();
}
// only the Hindi text changed: the English questions are not uploaded again
function dirtyHi() {
  if (!B || B.ro) return;
  B.dirty = true; B.hiDirty = true;
  saveSoon(); chrome();
}

/* ---------- chrome: top bar + rail ---------- */
function stats() {
  const n = B.Q.length, nb = B.Q.filter(bad).length, na = B.Q.filter(q => q.answer == null).length;
  const hiAny = B.Q.some(q => q.hi), hiDone = B.Q.filter(q => q.hi && hiOk(q)).length, hiMiss = hiAny ? B.Q.filter(q => !hiOk(q)).length : 0;
  return { n, nb, na, max: n * (+B.meta.correct || 0), hiAny, hiDone, hiMiss, hiAll: hiAny && !hiMiss && n > 0, hiSol: hiAny ? B.Q.filter(hiSolMissing).length : 0 };
}
function schedLine(m) {
  if (m.practice) return 'Practice mode';
  if (!m.opens_at && !m.closes_at && !m.result_at) return 'Open any time';
  return m.opens_at ? 'Opens ' + fmt.dt(m.opens_at) : m.closes_at ? 'Live till ' + fmt.dt(m.closes_at) : 'Result ' + fmt.dt(m.result_at);
}
function chrome() {
  if (!WS || !B) return;
  const m = B.meta, s = series(m.series_id), st = stats();
  const f = (B.cat.folders || []).find(x => x.id === m.folder_id);
  AX.set(WS.querySelector('#bw-t'), h`${m.title || 'Untitled test'}${B.ro ? h` <span class="pill">View only</span>` : ''}`);
  WS.querySelector('#bw-s').textContent = [s ? s.title : 'No series', f ? f.title : m.folderNew || '', fmt.plural(st.n, 'question'), B.id ? (B.published && !B.dirty ? 'Published' : 'Unpublished changes') : 'New test'].filter(Boolean).join(' · ');
  AX.set(WS.querySelector('#bw-ta'), B.ro ? '' : B.step === 5 ? '' : h`<button class="btn pri sm" data-act="step" data-s="5">${icon('send', 15)}<span>${B.id ? 'Review & update' : 'Review & publish'}</span></button>`);
  const done = { 1: !!(m.title.trim() && m.series_id), 2: st.n > 0 && !st.nb, 3: false, 4: !liveError(m), 5: B.published && !B.dirty };
  const warn = { 1: !(m.title.trim() && m.series_id), 2: st.n > 0 && st.nb > 0, 4: !!liveError(m) };
  const sub = { 1: m.title.trim() ? m.title : 'Name, series, marks', 2: st.n ? fmt.plural(st.n, 'question') + (st.nb ? ' · ' + st.nb + ' to fix' : '') : 'No questions yet', 3: 'Text, PDF, Word, photo', 4: schedLine(m), 5: B.published && !B.dirty ? 'Published' : B.id ? 'Update when ready' : 'Not published yet' };
  AX.set(WS.querySelector('#bw-rail'), h`${join(STEPS, (x, i) => h`<button class="step ${B.step === i + 1 ? 'on' : ''} ${done[i + 1] && B.step !== i + 1 ? 'done' : ''} ${warn[i + 1] && B.step !== i + 1 && (i !== 0 || B.id) ? 'bad' : ''}" data-act="step" data-s="${i + 1}" ${B.step === i + 1 ? raw('aria-current="step"') : ''}>
      <span class="n">${done[i + 1] && B.step !== i + 1 ? icon('check', 14) : i + 1}</span><span class="st"><span>${x.t}</span><small>${sub[i + 1]}</small></span></button>`)}
    <div class="bw-rf rail-x"><dl class="kv"><dt>Questions</dt><dd class="num">${st.n}</dd><dt>To fix</dt><dd class="num" style="color:${st.nb ? 'var(--warn)' : 'var(--ok)'}">${st.nb || 'None'}</dd><dt>Max marks</dt><dd class="num">${fmt.num(st.max)}</dd><dt>Time</dt><dd>${+m.duration || 180} min</dd><dt>हिंदी</dt><dd class="num" style="color:${st.hiAll ? 'var(--ok)' : st.hiAny ? 'var(--warn)' : 'var(--mut)'}">${st.hiAny ? st.hiDone + ' / ' + st.n : 'Not added'}</dd></dl>
      <div class="xs faint mt12">${B.ro ? 'You can look but not change this test.' : raw('<span class="kbd">Alt 1–5</span> steps · <span class="kbd">Ctrl S</span> save draft · <span class="kbd">Esc</span> close')}</div></div>`);
  savedText();
}
function go(n) {
  if (!B) return;
  B.step = Math.max(1, Math.min(5, n));
  render();
  const mn = WS.querySelector('#bw-main'); if (mn) mn.scrollTop = 0;
  if (B.dirty) saveSoon();
}
function render() {
  if (!WS || !B) return;
  chrome();
  const v = [vDetails, vQuestions, vImport, vSchedule, vPublish][B.step - 1]();
  AX.set(WS.querySelector('#bw-in'), v);
  if (B.step === 2) fillList();
}
const navBtns = (back, next, nextLabel) => h`<div class="bw-nav">${back ? h`<button class="btn ghost" data-act="step" data-s="${back}">${icon('arrowL', 16)} Back</button>` : ''}<span class="sp"></span>${next ? h`<button class="btn pri" data-act="step" data-s="${next}">${nextLabel || 'Continue'} ${icon('arrowR', 16)}</button>` : ''}</div>`;
const sw = (name, on, label, hint) => h`<label class="sw"><input type="checkbox" data-m="${name}" ${on ? raw('checked') : ''}><i></i><span>${label}${hint ? h`<span class="xs mut" style="display:block;font-weight:500">${hint}</span>` : ''}</span></label>`;

/* ---------- step 1: details ---------- */
function vDetails() {
  const m = B.meta, fl = folders(m.series_id), st = stats();
  const ser = B.cat.series || [];
  return h`<div class="bw-h"><h2>Test details</h2><p>Give the test a clear name students will recognise, choose where it appears, and set the marking.</p></div>
  <fieldset class="bw-fs" ${B.ro ? raw('disabled') : ''}>
  <div class="card"><div class="form-grid">
    <div class="fld full"><label for="bd-title">Test name</label><input class="inp" id="bd-title" data-m="title" value="${m.title}" placeholder="e.g. NEET Mock Test 1" maxlength="120" autocomplete="off"><div class="err" id="bd-terr"></div></div>
    <div class="fld"><label for="bd-ser">Series</label><select class="inp" id="bd-ser" data-m="series_id">${ser.length ? '' : h`<option value="">No series yet</option>`}${join(ser, s => h`<option value="${s.id}" ${s.id === m.series_id ? raw('selected') : ''}>${s.title}${s.is_free ? ' · Free' : s.price_label ? ' · ' + s.price_label : ' · Paid'}</option>`)}</select>
      ${ser.length ? '' : h`<div class="hint">Create a series in Test studio first.</div>`}</div>
    <div class="fld"><label for="bd-fol">Folder</label><select class="inp" id="bd-fol" data-m="folder_id"><option value="">No folder (directly in the series)</option>${join(fl, f => h`<option value="${f.id}" ${f.id === m.folder_id ? raw('selected') : ''}>${f.title}${f.active === false ? ' (hidden)' : ''}</option>`)}<option value="__new" ${m.folder_id === '__new' ? raw('selected') : ''}>+ New folder…</option></select></div>
    ${m.folder_id === '__new' ? h`<div class="fld full"><label for="bd-fnew">New folder name</label><input class="inp" id="bd-fnew" data-m="folderNew" value="${m.folderNew}" placeholder="e.g. Day 1" maxlength="80"><div class="hint">It is created when you publish. If a folder with this name already exists, the test goes into it.</div></div>` : ''}
  </div></div>
  <div class="card mt16"><div class="card-h">${icon('target')}<h3>Marking & time</h3><span class="grow"></span><span class="pill pri num">Max ${fmt.num(st.max)} marks</span></div>
    <div class="form-grid">
      <div class="fld"><label for="bd-dur">Duration (minutes)</label><input class="inp num" id="bd-dur" type="number" inputmode="numeric" min="1" max="600" data-m="duration" value="${m.duration}">
        <div class="bw-chips">${join([60, 90, 120, 180, 200], x => h`<button type="button" class="${+m.duration === x ? 'on' : ''}" data-act="dur" data-v="${x}">${x === 60 ? '1 h' : x === 90 ? '1 h 30' : x === 120 ? '2 h' : x === 180 ? '3 h' : '3 h 20'}</button>`)}</div></div>
      <div class="fld"><label for="bd-ord">Order in the list</label><input class="inp num" id="bd-ord" type="number" inputmode="numeric" data-m="sort_order" value="${m.sort_order}"><div class="hint">Smaller numbers show first.</div></div>
      <div class="fld"><label for="bd-pm">Marks for a correct answer</label><input class="inp num" id="bd-pm" type="number" step="0.25" inputmode="decimal" data-m="correct" value="${m.correct}"></div>
      <div class="fld"><label for="bd-nm">Negative marks for a wrong answer</label><input class="inp num" id="bd-nm" type="number" step="0.25" inputmode="decimal" data-m="wrong" value="${m.wrong}"><div class="hint">Enter 1 for −1. Use 0 for no negative marking.</div></div>
    </div>
    <div class="bw-chips mt12"><span class="xs mut" style="align-self:center;margin-right:4px">Presets</span><button type="button" data-act="preset" data-v="neet">NEET · 180 min · +4 / −1</button><button type="button" data-act="preset" data-v="jee">JEE · 180 min · +4 / −1</button><button type="button" data-act="preset" data-v="none">No negative</button></div></div>
  <div class="card mt16"><div class="card-h">${icon('settings')}<h3>Options</h3></div><div class="bw-sw">
    ${sw('active', m.active, 'Visible to students', 'Turn off to keep it as a hidden draft while you work on it.')}
    ${sw('free_preview', m.free_preview, 'Free preview', 'Anyone can open it, even if the series is paid. Good for a demo test.')}
    ${sw('lock_back', m.lock_back, 'Lock going back', 'Students cannot return to earlier questions.')}
  </div></div></fieldset>
  ${navBtns(0, 2, 'Questions')}`;
}

/* ---------- step 2: questions ---------- */
function secList() {
  const out = []; B.Q.forEach(q => { const n = q.sec || ''; const x = out.find(y => y.name === n); if (x) x.n++; else out.push({ name: n, n: 1 }); });
  return out;
}
function vis() {
  const v = B.view, f = v.find.trim().toLowerCase();
  const out = [];
  B.Q.forEach((q, i) => {
    if (v.filter === 'bad' && !bad(q)) return;
    if (v.filter === 'nohi' && hiOk(q)) return;
    if (v.sec != null && (q.sec || '') !== v.sec) return;
    if (f && !(q.q + '\n' + q.options.join('\n') + '\n' + q.explanation + '\n' + q.sec + (q.hi ? '\n' + q.hi.q + '\n' + q.hi.options.join('\n') + '\n' + q.hi.explanation : '')).toLowerCase().includes(f)) return;
    out.push(i);
  });
  return out;
}
function vQuestions() {
  const st = stats(), v = B.view, secs = secList();
  if (!st.n) return h`<div class="bw-h"><h2>Questions</h2><p>Add questions one by one, or import a whole paper from text, PDF, Word or a photo.</p></div>
    <div class="card">${UI.empty({ icon: 'list', title: 'No questions yet', text: 'Import the question paper in one go — the questions, options and answer key are found for you. Or type them in.',
      action: B.ro ? '' : h`<div class="row wrap" style="justify-content:center"><button class="btn pri" data-act="step" data-s="3">${icon('upload', 16)} Import a paper</button><button class="btn" data-act="qadd">${icon('plus', 16)} Add a question</button></div>` })}</div>${navBtns(1, 3, 'Import')}`;
  return h`<div class="bw-h"><h2>Questions</h2><p>${fmt.plural(st.n, 'question')} · ${st.nb ? h`<b style="color:var(--warn)">${st.nb} need attention</b>` : h`<b style="color:var(--ok)">all look complete</b>`}${st.na ? ' · ' + st.na + ' without an answer' : ''}. ${B.ro ? '' : 'Tap an option to mark it correct.'}</p></div>
    <div class="card tight"><div class="bq-tb">
      <div class="inp-wrap search">${icon('search', 16)}<input class="inp sm" id="bq-find" type="search" placeholder="Find in questions…" value="${v.find}" autocomplete="off" aria-label="Find in questions"></div>
      ${B.ro ? '' : h`<button class="btn sm pri" data-act="qadd">${icon('plus', 15)} Add</button>
      <button class="btn sm" data-act="keymodal">${icon('key', 15)} <span>Answer key</span></button>
      <button class="btn sm" data-act="expmodal">${icon('book', 15)} <span>Explanations</span></button>
      <button class="btn sm" data-act="himodal">${icon('globe', 15)} <span>हिंदी</span></button>
      <button class="btn sm" data-act="secmodal">${icon('layers', 15)} <span>Sections</span></button>
      <button class="ibtn sm line" data-act="qtools" aria-label="More tools">${icon('more', 17)}</button>`}
    </div>
    <div class="row wrap gap6 mt12 bq-lg"><div class="seg" role="group" aria-label="Show questions in">${join([['en', 'English'], ['hi', 'हिंदी']], x => h`<button type="button" class="${B.lang === x[0] ? 'on' : ''}" data-act="qlang" data-l="${x[0]}">${x[1]}</button>`)}</div>
      <span class="xs mut grow">${st.hiAll ? h`<b style="color:var(--ok)">Hindi ready ✓</b> — Hindi-medium students get this test in Hindi.${st.hiSol ? ' ' + fmt.plural(st.hiSol, 'solution') + ' still only in English.' : ''}` : st.hiAny ? h`<b style="color:var(--warn)">Hindi ${st.hiDone} of ${st.n}</b> — until every question has Hindi, Hindi-medium students get the whole test in English.` : 'No Hindi yet. Switch to हिंदी to type it, or use the हिंदी button to import a Hindi paper.'}</span></div>
    <div class="chips mt12">
      <button class="chip ${v.filter === 'all' && v.sec == null ? 'on' : ''}" data-act="qf" data-f="all">All<em>${st.n}</em></button>
      ${st.nb ? h`<button class="chip alert ${v.filter === 'bad' ? 'on' : ''}" data-act="qf" data-f="bad">Need attention<em>${st.nb}</em></button>` : ''}
      ${st.hiMiss || (B.lang === 'hi' && !st.hiAll) ? h`<button class="chip alert ${v.filter === 'nohi' ? 'on' : ''}" data-act="qf" data-f="nohi">Hindi missing<em>${st.hiAny ? st.hiMiss : st.n}</em></button>` : ''}
      ${secs.length > 1 || (secs[0] && secs[0].name) ? join(secs, s => h`<button class="chip ${v.sec === s.name ? 'on' : ''}" data-act="qsec" data-sec="${s.name}">${s.name || 'No section'}<em>${s.n}</em></button>`) : ''}
    </div></div>
    <div id="bq-list"></div>
    ${navBtns(1, 4, 'Schedule')}`;
}
function cardHtml(i) {
  const q = B.Q[i], pr = problems(q), v = B.view, ro = B.ro;
  if (B.lang === 'hi') return cardHi(i);
  return h`<div class="qcard ${pr.length ? 'bad' : ''} ${v.sel.has(i) ? 'sel' : ''}" id="bq-${i}" data-i="${i}">
    ${v.selMode ? h`<input type="checkbox" class="qck" data-act="qsel" data-i="${i}" ${v.sel.has(i) ? raw('checked') : ''} aria-label="Select question ${i + 1}">` : ''}
    <div class="qn">${i + 1}</div>
    <div class="grow">
      <div class="bq-meta">${q.sec ? UI.pill(q.sec, 'info') : ''}${join(pr, p => UI.pill(short(p), 'warn'))}${B.Q.some(x => x.hi) && !hiOk(q) ? UI.pill('No Hindi', 'warn') : ''}
        <span class="qa">${ro ? '' : h`<button class="ibtn sm" data-act="qedit" data-i="${i}" aria-label="Edit question ${i + 1}" title="Edit">${icon('edit', 16)}</button>`}<button class="ibtn sm" data-act="qmenu" data-i="${i}" aria-label="More for question ${i + 1}">${icon('moreV', 16)}</button></span></div>
      <div class="qt ${ro ? 'ro' : ''}" data-act="${ro ? '' : 'qedit'}" data-i="${i}">${q.q || (q.img ? '' : h`<span class="faint">${q.gap ? 'Question missing in the file — tap to type it' : 'No question text'}</span>`)}</div>
      ${q.img ? h`<img src="${q.img}" alt="Diagram for question ${i + 1}" loading="lazy">` : ''}
      <div class="opts">${join(q.options, (o, j) => h`<button type="button" class="op ${q.answer === j ? 'key' : ''}" data-act="qkey" data-i="${i}" data-j="${j}" ${ro ? raw('disabled') : ''} title="${ro ? '' : 'Mark ' + L[j] + ' as the correct answer'}"><b>${L[j]}</b><span class="grow">${o || (q.oimg[j] ? '' : h`<span class="faint">empty</span>`)}${q.oimg[j] ? h`<img src="${q.oimg[j]}" alt="Option ${L[j]} image" loading="lazy">` : ''}</span>${q.answer === j ? icon('checkCircle', 16) : ''}</button>`)}</div>
      ${q.explanation || q.eimg ? h`<div class="qx"><b>Explanation</b>${q.explanation}${q.eimg ? h`<img src="${q.eimg}" alt="Explanation image" loading="lazy">` : ''}</div>` : ''}
    </div></div>`;
}
// the same card with the Hindi text (images and answer from the English question)
function cardHi(i) {
  const q = B.Q[i], hp = hiProblems(q), v = B.view, ro = B.ro, hq = q.hi || { q: '', options: ['', '', '', ''], explanation: '' };
  return h`<div class="qcard ${hp.length ? 'bad' : ''} ${v.sel.has(i) ? 'sel' : ''}" id="bq-${i}" data-i="${i}" lang="hi">
    ${v.selMode ? h`<input type="checkbox" class="qck" data-act="qsel" data-i="${i}" ${v.sel.has(i) ? raw('checked') : ''} aria-label="Select question ${i + 1}">` : ''}
    <div class="qn">${i + 1}</div>
    <div class="grow">
      <div class="bq-meta">${q.sec ? UI.pill(q.sec, 'info') : ''}${hp.length ? UI.pill(hp.length === 1 ? hp[0].replace('Hindi ', 'Hindi: ') : 'Hindi: ' + hp.length + ' missing', 'warn') : UI.pill('हिंदी ✓', 'ok')}${hiSolMissing(q) ? UI.pill('Solution only English', '') : ''}
        <span class="qa">${ro ? '' : h`<button class="ibtn sm" data-act="qedit" data-i="${i}" aria-label="Edit question ${i + 1}" title="Edit">${icon('edit', 16)}</button>`}<button class="ibtn sm" data-act="qmenu" data-i="${i}" aria-label="More for question ${i + 1}">${icon('moreV', 16)}</button></span></div>
      <div class="qt ${ro ? 'ro' : ''}" data-act="${ro ? '' : 'qedit'}" data-i="${i}">${hq.q || (q.q ? h`<span class="faint">हिंदी प्रश्न नहीं है — tap to add. English: ${q.q.slice(0, 140)}${q.q.length > 140 ? '…' : ''}</span>` : '')}</div>
      ${q.img ? h`<img src="${q.img}" alt="Diagram for question ${i + 1}" loading="lazy">` : ''}
      <div class="opts">${join(q.options, (o, j) => h`<button type="button" class="op ${q.answer === j ? 'key' : ''}" data-act="qkey" data-i="${i}" data-j="${j}" ${ro ? raw('disabled') : ''}><b>${L[j]}</b><span class="grow">${hq.options[j] || (o ? h`<span class="faint">${o}</span>` : '')}${q.oimg[j] ? h`<img src="${q.oimg[j]}" alt="Option ${L[j]} image" loading="lazy">` : ''}</span>${q.answer === j ? icon('checkCircle', 16) : ''}</button>`)}</div>
      ${hq.explanation || q.eimg ? h`<div class="qx"><b>हल · Solution</b>${hq.explanation}${q.eimg ? h`<img src="${q.eimg}" alt="Explanation image" loading="lazy">` : ''}</div>` : ''}
    </div></div>`;
}
function fillList() {
  const box = WS && WS.querySelector('#bq-list'); if (!box) return;
  const v = B.view, list = vis(), pages = Math.max(1, Math.ceil(list.length / PAGE));
  if (v.page >= pages) v.page = pages - 1;
  const sl = list.slice(v.page * PAGE, v.page * PAGE + PAGE);
  const pg = pages > 1 ? h`<div class="bq-pg"><button class="btn sm ghost" data-act="qpage" data-p="${v.page - 1}" ${v.page ? '' : raw('disabled')}>${icon('chevL', 15)} Previous</button><span class="sm mut num">Page ${v.page + 1} of ${pages} · ${list.length} shown</span><button class="btn sm ghost" data-act="qpage" data-p="${v.page + 1}" ${v.page < pages - 1 ? '' : raw('disabled')}>Next ${icon('chevR', 15)}</button></div>` : '';
  AX.set(box, h`${pg}<div class="bq-list">${sl.length ? join(sl, cardHtml) : h`<div class="card">${UI.empty({ icon: 'search', title: 'No question matches', text: 'Try another word or clear the filter.', action: h`<button class="btn sm" data-act="qf" data-f="all">Show all questions</button>` })}</div>`}</div>${pg}
    ${!B.ro && !v.selMode ? h`<div class="row mt16" style="justify-content:center"><button class="btn soft" data-act="qadd">${icon('plus', 16)} Add a question</button></div>` : ''}
    ${v.selMode ? h`<div class="bq-bulk glass"><b class="sm">${v.sel.size} selected</b><button class="btn xs ghost" data-act="selall">Select all shown</button><span class="grow"></span>
      <button class="btn xs" data-act="bulksec" ${v.sel.size ? '' : raw('disabled')}>${icon('layers', 13)} Set section</button><button class="btn xs danger" data-act="bulkdel" ${v.sel.size ? '' : raw('disabled')}>${icon('trash', 13)} Delete</button><button class="btn xs pri" data-act="seldone">Done</button></div>` : ''}`);
}
function refreshQ() { if (B.step === 2) { const f = WS.querySelector('#bq-find'), had = f && document.activeElement === f; render(); if (had) { const n = WS.querySelector('#bq-find'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } else chrome(); }
function jumpQ(i) {
  if (!B || i < 0 || i >= B.Q.length) { if (B && B.step !== 2) go(2); return; }
  const v = B.view;
  if (!vis().includes(i)) { v.filter = 'all'; v.sec = null; v.find = ''; }
  v.page = Math.floor(vis().indexOf(i) / PAGE);
  B.step = 2; render();
  const e = WS.querySelector('#bq-' + i);
  if (e) { e.scrollIntoView({ block: 'center' }); e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 1800); }
}
function qMenu(el, i) {
  const q = B.Q[i];
  UI.menu(el, [{ head: 'Question ' + (i + 1) },
    !B.ro && { label: 'Edit', icon: 'edit', fn: () => editQ(i) },
    !B.ro && { label: 'Duplicate', icon: 'copy', fn: () => { B.Q.splice(i + 1, 0, normQ(JSON.parse(JSON.stringify(q)))); dirty(true); refreshQ(); UI.toast('Question ' + (i + 1) + ' duplicated'); } },
    !B.ro && i > 0 && { label: 'Move up', icon: 'chevU', fn: () => moveQ(i, i - 1) },
    !B.ro && i < B.Q.length - 1 && { label: 'Move down', icon: 'chevD', fn: () => moveQ(i, i + 1) },
    !B.ro && { label: 'Move to number…', icon: 'sort', fn: async () => { const v = await UI.prompt({ title: 'Move question ' + (i + 1), label: 'New number (1 – ' + B.Q.length + ')', type: 'number', value: i + 1 }); if (v == null) return; const n = Math.max(1, Math.min(B.Q.length, parseInt(v, 10) || 1)) - 1; moveQ(i, n); } },
    !B.ro && { label: 'Set section…', icon: 'layers', fn: () => setSection([i]) },
    { label: 'Copy question text', icon: 'copy', fn: async () => { if (await AX.u.copy(q.q + '\n' + q.options.map((o, j) => '(' + L[j] + ') ' + o).join('\n'))) UI.toast('Copied'); } },
    !B.ro && { sep: true },
    !B.ro && { label: 'Delete', icon: 'trash', tone: 'danger', fn: () => delQ([i]) }
  ]);
}
function moveQ(a, b) {
  const [x] = B.Q.splice(a, 1); B.Q.splice(b, 0, x); dirty(true); B.view.sel.clear();
  jumpQ(b);
}
function delQ(idx) {
  const keep = idx.slice().sort((a, b) => a - b).map(i => ({ i, q: B.Q[i] }));
  for (let k = keep.length - 1; k >= 0; k--) B.Q.splice(keep[k].i, 1);
  B.view.sel.clear(); dirty(true); refreshQ();
  UI.toast(keep.length === 1 ? 'Question ' + (keep[0].i + 1) + ' deleted' : fmt.plural(keep.length, 'question') + ' deleted', { action: { label: 'Undo', fn: () => { if (!B) return; keep.forEach(x => B.Q.splice(x.i, 0, x.q)); dirty(true); refreshQ(); } } });
}
async function setSection(idx) {
  const names = secList().map(s => s.name).filter(Boolean);
  const v = await UI.prompt({ title: idx.length === 1 ? 'Section for question ' + (idx[0] + 1) : 'Section for ' + idx.length + ' questions', label: 'Section / subject name', value: idx.length === 1 ? B.Q[idx[0]].sec : '', hint: names.length ? 'Used now: ' + names.join(', ') + '. Leave empty for no section.' : 'e.g. Physics. Leave empty for no section.', required: false });
  if (v == null) return;
  idx.forEach(i => { B.Q[i].sec = v.trim(); });
  dirty(true); refreshQ();
}
function qTools(el) {
  UI.menu(el, [
    { label: 'Find & replace', icon: 'search', fn: findModal },
    { label: B.view.selMode ? 'Stop selecting' : 'Select several', icon: 'checkCircle', fn: () => { B.view.selMode = !B.view.selMode; B.view.sel.clear(); fillList(); } },
    { label: 'Import more questions', icon: 'upload', fn: () => go(3) },
    { label: 'Download as .json file', icon: 'download', fn: () => AX.u.download((B.meta.title || 'test').replace(/[^\w]+/g, '_') + '.json', JSON.stringify({ title: B.meta.title, duration: +B.meta.duration || 180, correct: +B.meta.correct, wrong: +B.meta.wrong, lockBack: !!B.meta.lock_back, questions: B.Q.map(outQ) }), 'application/json') },
    { sep: true },
    { label: 'Delete all questions', icon: 'trash', tone: 'danger', fn: async () => { if (await UI.confirm({ title: 'Delete all ' + B.Q.length + ' questions?', text: 'The questions are removed from this editor. The published test changes only when you publish.', yes: 'Delete all', tone: 'danger' })) delQ(B.Q.map((q, i) => i)); } }
  ]);
}

/* ---------- question editor ---------- */
function editQ(i, lang) {
  if (B.ro) return;
  const isNew = i >= B.Q.length;
  const w = isNew ? Object.assign(emptyQ(), { sec: (B.Q[B.Q.length - 1] || {}).sec || '' }) : normQ(JSON.parse(JSON.stringify(B.Q[i])));
  if (!w.hi) w.hi = { q: '', options: ['', '', '', ''], explanation: '' };
  const names = secList().map(s => s.name).filter(Boolean);
  let changed = false, changedHi = false, tab = lang === 'hi' ? 'hi' : 'en';
  const imgCtl = (t, label) => { const v = t === 'q' ? w.img : t === 'e' ? w.eimg : w.oimg[t]; return h`<div class="bq-img">${v ? h`<img src="${v}" alt=""><button type="button" class="btn xs ghost danger" data-act="imgRm" data-t="${t}">${icon('trash', 13)} Remove image</button>` : h`<button type="button" class="btn xs ghost" data-act="imgAdd" data-t="${t}">${icon('image', 13)} ${label}</button><button type="button" class="btn xs ghost" data-act="imgCrop" data-t="${t}">${icon('scan', 13)} Crop from PDF</button>`}</div>`; };
  const optHtml = j => h`<div class="bq-opt ${w.answer === j ? 'key' : ''}" data-oj="${j}"><button type="button" class="bq-radio" data-act="ans" data-j="${j}" aria-label="Mark ${L[j]} correct" title="Mark ${L[j]} as the correct answer">${L[j]}</button>
    <div class="grow"><input class="inp" name="o${j}" value="${w.options[j]}" placeholder="Option ${L[j]}" aria-label="Option ${L[j]}"><div data-slotw="${j}">${imgCtl(j, 'Option image')}</div></div></div>`;
  const hiOptHtml = j => h`<div class="bq-opt ${w.answer === j ? 'key' : ''}" data-oj="${j}"><span class="bq-radio" aria-hidden="true">${L[j]}</span>
    <div class="grow"><input class="inp" name="ho${j}" lang="hi" value="${w.hi.options[j]}" placeholder="${w.options[j] ? 'English: ' + w.options[j].slice(0, 90) : w.oimg[j] ? 'Image option — Hindi not needed' : 'विकल्प ' + L[j]}" aria-label="Hindi option ${L[j]}">${w.oimg[j] ? h`<div class="bq-img"><img src="${w.oimg[j]}" alt=""></div>` : ''}</div></div>`;
  const probsHtml = () => {
    const p = problems(w), hp = tab === 'hi' || !hiEmpty(w.hi) ? hiProblems(w) : [];
    return p.length || hp.length ? h`${join(p, x => UI.pill(x, 'warn'))}${join(hp, x => UI.pill(x + ' missing', 'warn'))}` : UI.pill(hiEmpty(w.hi) ? 'Looks complete' : 'English + हिंदी complete', 'ok');
  };
  const m = UI.modal({
    title: isNew ? 'New question ' + (i + 1) : 'Question ' + (i + 1), sub: isNew ? 'Type the question, the four options and tap the correct one.' : fmt.plural(B.Q.length, 'question') + ' in this test', size: 'wide', sticky: true,
    body: h`<div class="bq-ed col gap16">
      <div class="row wrap gap6"><div class="seg" id="be-lg" role="tablist" aria-label="Language">${join([['en', 'English'], ['hi', 'हिंदी (Hindi)']], x => h`<button type="button" role="tab" data-v="${x[0]}" class="${tab === x[0] ? 'on' : ''}" aria-selected="${tab === x[0] ? 'true' : 'false'}">${x[1]}</button>`)}</div><span class="grow"></span></div>
      <div class="bq-probs" id="be-pr">${probsHtml()}</div>
      <div id="be-hi" class="col gap16 ${tab === 'hi' ? '' : 'hide'}">
        <div class="callout info">${icon('info')}<div class="sm">Hindi-medium students see this text. The images, the section and the correct answer are the same as in English — set them on the English tab.</div></div>
        <div><div class="lblrow"><label for="be-hq">प्रश्न · Question in Hindi</label></div>
          ${w.q ? h`<div class="well xs mut" style="margin-bottom:6px;white-space:pre-wrap;max-height:110px;overflow:auto">${w.q}</div>` : ''}
          <textarea class="inp" id="be-hq" name="hq" rows="5" lang="hi" placeholder="यहाँ हिंदी में प्रश्न लिखें या paste करें">${w.hi.q}</textarea>${w.img ? h`<div class="bq-img"><img src="${w.img}" alt=""></div>` : ''}</div>
        <div class="col gap6"><div class="lbl">विकल्प · Options in Hindi${w.answer != null ? ' · correct: ' + L[w.answer] : ''}</div>${join([0, 1, 2, 3], hiOptHtml)}</div>
        <div><div class="lblrow"><label for="be-hx">हल · Solution in Hindi (optional)</label></div>
          ${w.explanation ? h`<div class="well xs mut" style="margin-bottom:6px;white-space:pre-wrap;max-height:90px;overflow:auto">${w.explanation}</div>` : ''}
          <textarea class="inp" id="be-hx" name="hx" rows="3" lang="hi" placeholder="${w.explanation ? 'Empty = Hindi students see the English solution' : 'हल यहाँ लिखें'}">${w.hi.explanation}</textarea></div>
      </div>
      <div id="be-en" class="col gap16 ${tab === 'hi' ? 'hide' : ''}">
      <div><div class="lblrow"><label for="be-q">Question</label><span class="grow"></span><button type="button" class="btn xs ghost" data-act="expand" data-f="q">${icon('external', 13)} Full screen</button></div>
        <textarea class="inp" id="be-q" name="q" rows="5" placeholder="Type or paste the question. You can also paste a screenshot here.">${w.q}</textarea><div data-slotw="q">${imgCtl('q', 'Add diagram')}</div></div>
      <div class="col gap6"><div class="lbl">Options · tap a letter to mark the correct answer</div>${join([0, 1, 2, 3], optHtml)}</div>
      <div class="fld"><label for="be-sec">Section / subject</label><input class="inp" id="be-sec" name="sec" value="${w.sec}" list="be-secl" placeholder="e.g. Physics (optional)" maxlength="60"><datalist id="be-secl">${join(names, n => h`<option value="${n}">`)}</datalist></div>
      <div><div class="lblrow"><label for="be-x">Explanation (optional)</label><span class="grow"></span><button type="button" class="btn xs ghost" data-act="expand" data-f="explanation">${icon('external', 13)} Full screen</button></div>
        <textarea class="inp" id="be-x" name="explanation" rows="3" placeholder="Shown with the answer key and in practice mode">${w.explanation}</textarea><div data-slotw="e">${imgCtl('e', 'Explanation image')}</div></div>
      </div>
    </div>`,
    foot: h`${!isNew ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)}<span class="bq-hph">Delete</span></button>` : ''}
      <button class="ibtn line" data-act="prev" ${i > 0 ? '' : raw('disabled')} aria-label="Previous question">${icon('chevL')}</button><button class="ibtn line" data-act="next" aria-label="Next question">${icon('chevR')}</button>
      <span class="sp"></span><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn pri" data-act="save" title="Ctrl + Enter">${icon('check', 16)} Save</button>`,
    onOpen(el, close) {
      const pr = el.querySelector('#be-pr');
      const upd = () => { AX.set(pr, probsHtml()); };
      const slot = t => { const x = el.querySelector('[data-slotw="' + t + '"]'); AX.set(x, imgCtl(t === 'q' || t === 'e' ? t : +t, t === 'q' ? 'Add diagram' : t === 'e' ? 'Explanation image' : 'Option image')); upd(); };
      const setImg = (t, v) => { if (t === 'q') w.img = v; else if (t === 'e') w.eimg = v; else w.oimg[+t] = v; changed = true; slot(t); };
      el.querySelector('#be-lg').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return; tab = b.dataset.v;
        el.querySelectorAll('#be-lg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        el.querySelector('#be-hi').classList.toggle('hide', tab !== 'hi'); el.querySelector('#be-en').classList.toggle('hide', tab === 'hi');
        upd();
        setTimeout(() => { if (!UI.isPhone()) el.querySelector(tab === 'hi' ? '#be-hq' : '#be-q').focus(); }, 30);
      });
      el.addEventListener('input', e => {
        const n = e.target.name; if (!n) return;
        if (n === 'hq' || n === 'hx' || /^ho[0-3]$/.test(n)) {
          changedHi = true;
          if (n === 'hq') w.hi.q = e.target.value; else if (n === 'hx') w.hi.explanation = e.target.value; else w.hi.options[+n[2]] = e.target.value;
          upd(); return;
        }
        changed = true;
        if (n === 'q' || n === 'explanation' || n === 'sec') w[n] = e.target.value;
        else if (/^o[0-3]$/.test(n)) w.options[+n[1]] = e.target.value;
        upd();
      });
      el.querySelector('#be-q').addEventListener('paste', async e => {
        const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.type && x.type.startsWith('image/'));
        if (!it) return; e.preventDefault();
        const d = AX.compressDataUrl ? await AX.compressDataUrl(await AX.u.fileToDataURL(it.getAsFile()), 900, 0.8) : null;
        if (d) { setImg('q', d); UI.toast('Image added to the question'); } else UI.toast('Could not use this image', { tone: 'bad' });
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() && close(true); } });
      const save = () => {
        const q = normQ(w); q.gap = w.gap && !w.q && !w.img;
        if (isNew) { if (!q.q.trim() && !q.img && q.options.every(o => !o.trim())) return true; B.Q.push(q); }
        else B.Q[i] = q;
        if (changed || isNew) dirty(true);
        if (changedHi) dirtyHi();
        return true;
      };
      const leave = async () => { if ((changed || changedHi) && !(await UI.confirm({ title: 'Discard changes to this question?', yes: 'Discard', tone: 'danger', no: 'Keep editing' }))) return; close(true); };
      AX.act(el, {
        ans(b) { const j = +b.dataset.j; w.answer = w.answer === j ? null : j; changed = true; el.querySelectorAll('[data-oj]').forEach(o => o.classList.toggle('key', +o.dataset.oj === w.answer)); upd(); },
        async imgAdd(b) {
          const t = b.dataset.t, f = await AX.u.pickFile('image/*'); if (!f) return;
          await UI.busy(b, async () => { const d = AX.compressDataUrl ? await AX.compressDataUrl(await AX.u.fileToDataURL(f), t === 'q' || t === 'e' ? 900 : 520, 0.8) : null; if (d) setImg(t, d); else UI.toast('Could not use this image', { tone: 'bad' }); });
        },
        async imgCrop(b) { const t = b.dataset.t; if (!AX.cropFromPdf) return; const d = await AX.cropFromPdf({ title: 'Crop for question ' + (i + 1) + (t === 'e' ? ' · explanation' : t === 'q' ? '' : ' · option ' + L[+t]), maxW: t === 'q' || t === 'e' ? 900 : 520 }); if (d) { setImg(t, d); UI.toast('Image added'); } },
        imgRm(b) { setImg(b.dataset.t, null); },
        async expand(b) {
          const f = b.dataset.f, ta = el.querySelector(f === 'q' ? '#be-q' : '#be-x');
          const v = AX.textEditor ? await AX.textEditor({ title: 'Question ' + (i + 1) + (f === 'q' ? ' text' : ' explanation'), value: ta.value }) : null;
          if (v != null && v !== ta.value) { ta.value = v; w[f] = v; changed = true; upd(); }
        },
        save() { if (save()) { close(true); refreshQ(); if (isNew) setTimeout(() => jumpQ(B.Q.length - 1), 30); } },
        cancel: leave,
        del() { close(true); delQ([i]); },
        prev() { save(); close(true); refreshQ(); editQ(i - 1, tab); },
        next() { save(); close(true); refreshQ(); editQ(isNew ? B.Q.length : i + 1, tab); }
      });
      el.closest('.ov').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); leave(); } });
      setTimeout(() => { if (!UI.isPhone()) el.querySelector(tab === 'hi' ? '#be-hq' : '#be-q').focus(); }, 80);
    }
  });
  return m;
}

/* ---------- answer key / sections / find & replace ---------- */
function keyModal() {
  let mode = 'tap';
  const count = () => B.Q.filter(q => q.answer != null).length;
  const tapHtml = () => h`<p class="sm mut" style="margin-bottom:10px">Tap the correct letter for each question. It is saved at once. Tap again to clear.</p>
    <div class="kg">${join(B.Q, (q, i) => h`<div class="kr ${q.answer == null ? 'miss' : ''}" data-kr="${i}"><span class="num">${i + 1}</span>${join([0, 1, 2, 3], j => h`<button type="button" class="${q.answer === j ? 'on' : ''}" data-act="ka" data-i="${i}" data-j="${j}" aria-label="Question ${i + 1} answer ${L[j]}">${L[j]}</button>`)}</div>`)}</div>`;
  const pasteHtml = () => h`<div class="fld"><label for="kt">Answer key</label><textarea class="inp mono" id="kt" rows="8" placeholder="1. B   2. D   3. A   4. C …   or 1-2, 2-4, 3-1 …"></textarea>
    <div class="hint" id="kc">Answers are matched by question number: 1 is the first question in this test.</div></div>`;
  UI.modal({
    title: 'Answer key', sub: 'Every question in this test, by number.', size: 'wide',
    body: h`<div class="row between wrap" style="margin-bottom:14px"><div class="seg" id="km"><button type="button" class="on" data-v="tap">Tap answers</button><button type="button" data-v="paste">Paste a key</button></div><span class="pill ${count() === B.Q.length ? 'ok' : 'warn'}" id="kcount">${count()} of ${B.Q.length} answered</span></div><div id="kb">${tapHtml()}</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Done</button><button class="btn pri hide" data-act="apply" id="kap">${icon('check', 16)} Apply key</button>`,
    onOpen(el) {
      const cnt = () => { const c = count(), p = el.querySelector('#kcount'); p.textContent = c + ' of ' + B.Q.length + ' answered'; p.className = 'pill ' + (c === B.Q.length ? 'ok' : 'warn'); };
      el.querySelector('#km').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return; mode = b.dataset.v;
        el.querySelectorAll('#km button').forEach(x => x.classList.toggle('on', x === b));
        AX.set(el.querySelector('#kb'), mode === 'tap' ? tapHtml() : pasteHtml());
        el.querySelector('#kap').classList.toggle('hide', mode === 'tap');
        if (mode === 'paste') { const t = el.querySelector('#kt'); t.focus(); t.addEventListener('input', () => { const r = window.CBTParser ? CBTParser.parseKey(t.value) : { count: 0 }; el.querySelector('#kc').textContent = r.count ? r.count + ' answers found. They replace the current answers for those numbers.' : 'No answers found yet. Use one answer per number, e.g. 1. B 2. D'; }); }
      });
      AX.act(el, {
        ka(b) { const i = +b.dataset.i, j = +b.dataset.j; B.Q[i].answer = B.Q[i].answer === j ? null : j; const r = el.querySelector('[data-kr="' + i + '"]'); r.classList.toggle('miss', B.Q[i].answer == null); r.querySelectorAll('button').forEach((x, k) => x.classList.toggle('on', B.Q[i].answer === k)); dirty(true); cnt(); },
        apply() {
          const t = el.querySelector('#kt'); if (!t || !window.CBTParser) return;
          const r = CBTParser.parseKey(t.value); if (!r.count) return UI.toast('No answers found in the text', { tone: 'warn' });
          let n = 0; Object.keys(r.map).forEach(k => { const i = +k - 1; if (B.Q[i]) { B.Q[i].answer = r.map[k]; n++; } });
          dirty(true); cnt(); UI.toast(fmt.plural(n, 'answer') + ' applied');
          mode = 'tap'; el.querySelectorAll('#km button').forEach(x => x.classList.toggle('on', x.dataset.v === 'tap')); AX.set(el.querySelector('#kb'), tapHtml()); el.querySelector('#kap').classList.add('hide');
        }
      });
    },
    onClose() { refreshQ(); }
  });
}
/* ---------- explanations: paste or read a solutions file, matched to questions by number ---------- */
function explainModal() {
  let text = '', images = [], over = false, takeAns = true;
  const has = () => B.Q.filter(q => q.explanation || q.eimg).length;
  const parse = () => window.CBTParser && CBTParser.parseExplain ? CBTParser.parseExplain(text) : { map: {}, ans: {}, count: 0 };
  const clean = x => x.replace(/\s*⟦IMG:\d+⟧\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  const sumHtml = () => {
    const r = parse(), nums = Object.keys(r.map).map(Number).filter(n => B.Q[n - 1]);
    const out = Object.keys(r.map).length - nums.length, fill = nums.filter(n => over || !(B.Q[n - 1].explanation || B.Q[n - 1].eimg)).length;
    const an = Object.keys(r.ans).filter(n => B.Q[n - 1] && B.Q[n - 1].answer == null).length;
    if (!text.trim()) return h`<div class="hint">Paste the solutions, or read them from a file. Each one starts with its question number: <span class="mono">1.</span> <span class="mono">Q1)</span> <span class="mono">Sol. 1</span> …</div>`;
    if (!nums.length) return h`<div class="callout warn">${icon('info')}<div class="sm">No explanations found yet. Start each one on a new line with its question number, e.g. <span class="mono">1. Because …</span></div></div>`;
    return h`<div class="callout ok">${icon('checkCircle')}<div class="sm"><b>${fmt.plural(nums.length, 'explanation')} found</b> (questions ${nums[0]}–${nums[nums.length - 1]}). ${fill} will be added${over ? '' : ' to questions that have none yet'}.${out ? ' ' + out + ' have no matching question and are skipped.' : ''}${takeAns && an ? ' ' + fmt.plural(an, 'missing answer') + ' will be filled from them too.' : ''}</div></div>
      <div class="ex-prev mt12">${join(nums.slice(0, 4), n => h`<div><b>Q${n}</b>${r.ans[n] != null ? h` <span class="pill ok">${L[r.ans[n]]}</span>` : ''} <span class="tx2">${clean(r.map[n]).slice(0, 160) || '—'}${clean(r.map[n]).length > 160 ? '…' : ''}</span>${/⟦IMG:\d+⟧/.test(r.map[n]) ? h` <span class="pill info">picture</span>` : ''}</div>`)}${nums.length > 4 ? h`<div class="xs mut">…and ${nums.length - 4} more</div>` : ''}</div>`;
  };
  UI.modal({
    title: 'Explanations', sub: 'Add the solution of every question at once. They are matched by question number.', size: 'wide',
    body: h`<div class="row between wrap" style="margin-bottom:12px"><span class="pill ${has() === B.Q.length ? 'ok' : 'warn'}">${has()} of ${B.Q.length} have an explanation</span>
        <button type="button" class="btn sm" data-act="exfile">${icon('upload', 15)} From a file (PDF, Word, photo, text)</button></div>
      <div class="im-st hide" id="ex-st" style="margin-bottom:12px"></div>
      <div class="fld"><label for="ex-t">Solutions text</label><textarea class="inp" id="ex-t" rows="10" placeholder="1. (B) Mitochondria make ATP, so …&#10;2. Ans: C — Because …&#10;3. …"></textarea></div>
      <div class="col gap6 mt8"><label class="row gap6 sm" style="align-items:flex-start"><input type="checkbox" id="ex-over" style="margin-top:3px"><span>Replace explanations that are already there</span></label>
        <label class="row gap6 sm" style="align-items:flex-start"><input type="checkbox" id="ex-ans" checked style="margin-top:3px"><span>Also fill a missing answer when the solution says it, e.g. 1. (B) …</span></label></div>
      <div class="mt12" id="ex-sum">${sumHtml()}</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="exapply">${icon('check', 16)} Add explanations</button>`,
    onOpen(el, close) {
      const ta = el.querySelector('#ex-t'), sum = () => AX.set(el.querySelector('#ex-sum'), sumHtml());
      const st = (t, tone) => { const b = el.querySelector('#ex-st'); b.className = 'im-st ' + (tone || ''); b.textContent = t; };
      ta.addEventListener('input', () => { text = ta.value; if (!/⟦IMG:\d+⟧/.test(text)) images = []; sum(); });
      el.querySelector('#ex-over').addEventListener('change', e => { over = e.target.checked; sum(); });
      el.querySelector('#ex-ans').addEventListener('change', e => { takeAns = e.target.checked; sum(); });
      AX.act(el, {
        async exfile() {
          if (!AX.readTextFile) return UI.toast('The file reader did not load. Reload the page.', { tone: 'bad' });
          const f = await AX.u.pickFile('.pdf,.docx,.txt,.md,image/*,application/pdf'); if (!f) return;
          st('Reading ' + f.name + '…');
          try {
            const r = await AX.readTextFile(f, (t, p) => st(t + (p != null ? ' ' + Math.round(p * 100) + '%' : '')));
            text = r.text || ''; images = r.images || []; ta.value = text;
            const n = parse().count;
            st(n ? 'Done. Found ' + fmt.plural(n, 'explanation') + '. Check below, then press Add.' + (r.ocr || r.scanned ? ' OCR can make mistakes.' : '') : 'No numbered explanations found in this file. You can fix the text below.', n ? 'ok' : 'bad');
          } catch (err) { st('Could not read this file: ' + err.message, 'bad'); }
          sum();
        },
        async exapply(b) {
          const r = parse(); if (!r.count) return UI.toast('No explanations found in the text', { tone: 'warn' });
          await UI.busy(b, async () => {
            let n = 0, a = 0;
            for (const k of Object.keys(r.map)) {
              const q = B.Q[+k - 1]; if (!q) continue;
              if (takeAns && r.ans[k] != null && q.answer == null) { q.answer = r.ans[k]; a++; }
              if (!over && (q.explanation || q.eimg)) continue;
              const raw0 = r.map[k], im = raw0.match(/⟦IMG:(\d+)⟧/), t = clean(raw0);
              if (!t && !im) continue;
              q.explanation = t;
              if (im && images[+im[1]]) q.eimg = (AX.compressDataUrl ? await AX.compressDataUrl(images[+im[1]], 900) : null) || images[+im[1]];
              n++;
            }
            dirty(true); close();
            UI.toast(fmt.plural(n, 'explanation') + ' added' + (a ? ' · ' + fmt.plural(a, 'answer') + ' filled' : ''));
          });
        }
      });
    },
    onClose() { refreshQ(); }
  });
}
/* ---------- Hindi: paste or read a Hindi paper / Hindi solutions, matched to the questions by number ---------- */
// Hindi papers often number options (अ)(ब)(स)(द) or (क)(ख)(ग)(घ) and questions "प्रश्न 1." — turned into what the parser reads
const hiNorm = t => String(t || '').replace(/\r/g, '').replace(/^(\s*)प्रश्न\s*(?:संख्या|सं\.?)?\s*(?=\d)/gm, '$1')
  .replace(/(^|\s)\(\s*(?:अ|क)\s*\)/g, '$1(A)').replace(/(^|\s)\(\s*(?:ब|ख)\s*\)/g, '$1(B)')
  .replace(/(^|\s)\(\s*(?:स|ग)\s*\)/g, '$1(C)').replace(/(^|\s)\(\s*(?:द|घ)\s*\)/g, '$1(D)');
const blankHi = () => ({ q: '', options: ['', '', '', ''], explanation: '' });
function enPaper() {
  return B.Q.map((q, i) => (i + 1) + '. ' + (q.q || '[image]') + '\n' + q.options.map((o, j) => '(' + L[j] + ') ' + (o || '[image]')).join('\n') + (q.explanation ? '\nSolution: ' + q.explanation : '')).join('\n\n');
}
function hiModal() {
  if (!B.Q.length) return UI.toast('Add or import the English questions first, then their Hindi', { tone: 'warn' });
  let text = '', mode = 'paper', over = false;
  const P = window.CBTParser;
  const parse = () => {
    if (!P || !text.trim()) return { n: 0 };
    if (mode === 'sol') { const r = P.parseExplain(hiNorm(text)); return { n: r.count, map: r.map }; }
    const r = P.parse(hiNorm(text), ''); return { n: r.questions.length, qs: r.questions };
  };
  const sumHtml = () => {
    const r = parse(), N = B.Q.length;
    if (!text.trim()) return h`<div class="hint">${mode === 'paper' ? 'Paste the Hindi question paper. Question 1 of the Hindi paper becomes the Hindi of question 1 here, and so on. Options can be (A)…(D), (1)…(4), (अ)…(द) or (क)…(घ).' : 'Paste the Hindi solutions. Each starts with its question number: 1. … 2. …'}</div>`;
    if (!r.n) return h`<div class="callout warn">${icon('info')}<div class="sm">Nothing found yet. Start each ${mode === 'paper' ? 'question' : 'solution'} on a new line with its number, e.g. <span class="mono">1.</span></div></div>`;
    if (mode === 'sol') { const nums = Object.keys(r.map).map(Number).filter(n => B.Q[n - 1]); return h`<div class="callout ok">${icon('checkCircle')}<div class="sm"><b>${fmt.plural(nums.length, 'Hindi solution')} found</b>${nums.length ? ' (questions ' + nums[0] + '–' + nums[nums.length - 1] + ')' : ''}.</div></div>`; }
    const full = r.qs.filter(q => q.q && q.options.every(Boolean)).length;
    return h`<div class="callout ${r.n === N ? 'ok' : 'warn'}">${icon(r.n === N ? 'checkCircle' : 'info')}<div class="sm"><b>${fmt.plural(r.n, 'Hindi question')} found</b> · this test has ${N}. ${full} have the question and all 4 options.${r.n !== N ? ' The count is different — check that the Hindi paper has the same questions in the same order.' : ''}</div></div>
      <div class="ex-prev mt8" lang="hi">${join(r.qs.slice(0, 2), (q, i) => h`<div><b>${i + 1}.</b> ${q.q.slice(0, 160)}<div class="xs mut">${q.options.map((o, j) => '(' + L[j] + ') ' + o.slice(0, 40)).join('   ')}</div></div>`)}</div>`;
  };
  UI.modal({
    title: 'Hindi version · हिंदी', sub: 'Add the Hindi text of the questions. Images and the answer key stay the same as in English.', size: 'wide',
    body: h`<div class="row between wrap gap6" style="margin-bottom:12px"><div class="seg" id="hm-m"><button type="button" class="on" data-v="paper">Hindi paper</button><button type="button" data-v="sol">Hindi solutions</button></div>
        <span class="pill ${stats().hiAll ? 'ok' : 'warn'}">${stats().hiDone} of ${B.Q.length} in Hindi</span></div>
      <div class="fld"><textarea class="inp" id="hm-t" rows="10" lang="hi" placeholder="1. कोशिका का ऊर्जा केंद्र कौन सा है?\n(A) केंद्रक  (B) माइटोकॉन्ड्रिया  (C) राइबोसोम  (D) लाइसोसोम\n\n2. …"></textarea></div>
      <div class="row wrap gap6 mt8"><button class="btn sm" data-act="hmfile">${icon('upload', 15)} Read from a file</button><button class="btn sm ghost" data-act="hmcopy">${icon('copy', 15)} Copy English paper (to translate)</button><span class="im-st xs" id="hm-st"></span></div>
      <div id="hm-sum" class="mt12">${sumHtml()}</div>
      <label class="row gap6 sm mt12" style="align-items:flex-start"><input type="checkbox" id="hm-over" style="margin-top:3px"><span>Replace Hindi that is already there</span></label>
      <div class="xs mut mt8">Tip: a PDF typed in an old Hindi font (Kruti Dev, Chanakya…) is read as wrong letters. Use a Unicode PDF or Word file, or paste the text.</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="hmapply">${icon('check', 16)} Add Hindi</button>`,
    onOpen(el, close) {
      const ta = el.querySelector('#hm-t'), sum = () => AX.set(el.querySelector('#hm-sum'), sumHtml());
      const st = (t, tone) => { const b = el.querySelector('#hm-st'); b.className = 'im-st xs ' + (tone || ''); b.textContent = t; };
      ta.addEventListener('input', () => { text = ta.value; sum(); });
      el.querySelector('#hm-over').addEventListener('change', e => { over = e.target.checked; });
      el.querySelector('#hm-m').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return; mode = b.dataset.v;
        el.querySelectorAll('#hm-m button').forEach(x => x.classList.toggle('on', x === b)); sum();
      });
      AX.act(el, {
        async hmcopy() { if (await AX.u.copy(enPaper())) UI.toast('English paper copied — translate it, keep the numbers, and paste it here'); },
        async hmfile() {
          if (!AX.readTextFile) return UI.toast('The file reader did not load. Reload the page.', { tone: 'bad' });
          const f = await AX.u.pickFile('.pdf,.docx,.txt,.md,image/*,application/pdf'); if (!f) return;
          st('Reading ' + f.name + '…');
          try {
            const r = await AX.readTextFile(f, (t, p) => st(t + (p != null ? ' ' + Math.round(p * 100) + '%' : '')));
            text = String(r.text || '').replace(/\s*⟦IMG:\d+⟧\s*/g, ' '); ta.value = text;
            st(parse().n ? 'Done. Check below, then press Add Hindi.' + (r.ocr || r.scanned ? ' OCR can make mistakes.' : '') : 'Nothing numbered found in this file. You can fix the text above.', parse().n ? 'ok' : 'bad');
          } catch (err) { st('Could not read this file: ' + err.message, 'bad'); }
          sum();
        },
        hmapply() {
          const r = parse(); if (!r.n) return UI.toast('Nothing found in the text', { tone: 'warn' });
          let n = 0;
          if (mode === 'sol') {
            for (const k of Object.keys(r.map)) {
              const q = B.Q[+k - 1], t = String(r.map[k] || '').trim(); if (!q || !t) continue;
              const x = q.hi || blankHi(); if (!over && x.explanation.trim()) continue;
              x.explanation = t; q.hi = x; n++;
            }
          } else {
            r.qs.forEach((p, i) => {
              const q = B.Q[i]; if (!q) return;
              const x = q.hi || blankHi(); let ch = false;
              if (p.q && (over || !x.q.trim())) { x.q = p.q; ch = true; }
              p.options.forEach((o, j) => { if (o && (over || !x.options[j].trim())) { x.options[j] = o; ch = true; } });
              if (ch) { q.hi = x; n++; }
            });
          }
          if (!n) return UI.toast('Nothing new to add (the Hindi is already there — tick “Replace” to overwrite)', { tone: 'warn' });
          B.lang = 'hi'; dirtyHi(); close();
          UI.toast(fmt.plural(n, 'question') + ' got Hindi' + (mode === 'sol' ? ' solutions' : ''));
          go(2);
        }
      });
    },
    onClose() { refreshQ(); }
  });
}
function secModal() {
  let S = [];
  { let cur = null; B.Q.forEach(q => { const n = q.sec || ''; if (cur && cur.name === n) cur.count++; else S.push(cur = { name: n, count: 1 }); }); if (!S.some(x => x.name)) S = []; else S = S.map(x => ({ name: x.name || 'General', count: x.count })); }
  const rows = () => S.length ? h`${join(S, (s, i) => h`<div class="row" style="margin-bottom:8px"><input class="inp sm" style="flex:2" value="${s.name}" placeholder="Section name" data-si="${i}" data-k="name" aria-label="Section name"><input class="inp sm num" style="flex:1;max-width:110px" type="number" min="0" value="${s.count}" data-si="${i}" data-k="count" aria-label="Questions"><span class="xs mut">questions</span><button class="ibtn sm" data-act="rm" data-i="${i}" aria-label="Remove">${icon('x', 15)}</button></div>`)}
    <div class="sm mut" id="ssum">Total ${S.reduce((a, x) => a + (+x.count || 0), 0)} of ${B.Q.length} questions</div>` : h`<div class="well sm mut">No sections. The test shows all questions together. For NEET or JEE, students see subject tabs when sections are set.</div>`;
  UI.modal({
    title: 'Subjects / sections', sub: 'Students see one tab per section, in this order. Sections are given to questions from the top, by count.', size: 'wide',
    body: h`<div class="bw-chips" style="margin:0 0 14px"><button type="button" data-act="pre" data-v="neet">NEET · Physics, Chemistry, Botany, Zoology (45 each)</button><button type="button" data-act="pre" data-v="jee">JEE · Physics, Chemistry, Mathematics (30 each)</button></div><div id="sr">${rows()}</div>
      <button class="btn sm ghost mt8" data-act="add">${icon('plus', 15)} Add section</button>`,
    foot: h`<button class="btn ghost danger" data-act="none">No sections</button><span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="apply">${icon('check', 16)} Apply to questions</button>`,
    onOpen(el, close) {
      const redraw = () => AX.set(el.querySelector('#sr'), rows());
      el.addEventListener('input', e => { const t = e.target; if (t.dataset.si == null) return; const s = S[+t.dataset.si]; if (t.dataset.k === 'count') s.count = +t.value || 0; else s.name = t.value; const x = el.querySelector('#ssum'); if (x) x.textContent = `Total ${S.reduce((a, y) => a + (+y.count || 0), 0)} of ${B.Q.length} questions`; });
      AX.act(el, {
        pre(b) { S = b.dataset.v === 'neet' ? [{ name: 'Physics', count: 45 }, { name: 'Chemistry', count: 45 }, { name: 'Botany', count: 45 }, { name: 'Zoology', count: 45 }] : [{ name: 'Physics', count: 30 }, { name: 'Chemistry', count: 30 }, { name: 'Mathematics', count: 30 }]; redraw(); },
        add() { S.push({ name: '', count: 0 }); redraw(); },
        rm(b) { S.splice(+b.dataset.i, 1); redraw(); },
        none() { B.Q.forEach(q => q.sec = ''); dirty(true); close(true); refreshQ(); UI.toast('Sections removed'); },
        apply() {
          if (!B.Q.length) return UI.toast('Add the questions first', { tone: 'warn' });
          let i = 0;
          for (const s of S) { const n = Math.max(0, +s.count || 0); for (let k = 0; k < n && i < B.Q.length; k++) B.Q[i++].sec = (s.name || '').trim(); }
          if (i < B.Q.length) { const last = S.length ? (S[S.length - 1].name || '').trim() : ''; for (; i < B.Q.length; i++) B.Q[i].sec = last; }
          dirty(true); close(true); B.view.sec = null; refreshQ(); UI.toast('Sections applied');
        }
      });
    }
  });
}
function findModal() {
  const count = (f, cs) => { if (!f) return 0; let n = 0; const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); B.Q.forEach(q => [q.q, ...q.options, q.explanation].forEach(t => { n += (String(t).match(re) || []).length; })); return n; };
  UI.modal({
    title: 'Find & replace', sub: 'Changes the question text, options and explanations of every question.', size: 'narrow',
    body: h`<div class="col gap16"><div class="fld"><label for="fr-f">Find</label><input class="inp" id="fr-f" autocomplete="off" value="${B.view.find}"><div class="hint" id="fr-n"></div></div>
      <div class="fld"><label for="fr-r">Replace with</label><input class="inp" id="fr-r" autocomplete="off"></div>
      <label class="check"><input type="checkbox" id="fr-c"><span>Match upper / lower case</span></label></div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Close</button><button class="btn pri" data-act="go">Replace all</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#fr-f'), r = el.querySelector('#fr-r'), c = el.querySelector('#fr-c'), n = el.querySelector('#fr-n');
      const upd = () => { const x = count(f.value, c.checked); n.textContent = f.value ? (x ? x + ' matches' : 'No match') : ''; };
      f.addEventListener('input', upd); c.addEventListener('change', upd); upd();
      AX.act(el, { go() {
        const x = count(f.value, c.checked); if (!x) return UI.toast('Nothing to replace', { tone: 'warn' });
        const re = new RegExp(f.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), c.checked ? 'g' : 'gi'), to = r.value;
        B.Q.forEach(q => { q.q = q.q.replace(re, () => to); q.options = q.options.map(o => o.replace(re, () => to)); q.explanation = q.explanation.replace(re, () => to); });
        dirty(true); close(true); refreshQ(); UI.toast(fmt.plural(x, 'match', 'matches') + ' replaced');
      } });
    }
  });
}

/* ---------- step 3: import ---------- */
function vImport() {
  const st = stats();
  const tile = (src, ic, t, s) => h`<button class="bi-tile" data-act="imp" data-src="${src}" ${B.ro ? raw('disabled') : ''}><span class="ic">${icon(ic, 21)}</span><b>${t}</b><span>${s}</span></button>`;
  return h`<div class="bw-h"><h2>Import questions</h2><p>Bring in a whole paper at once. Files are read on this device — nothing is uploaded until you publish. You check every question before it is added.</p></div>
    ${B.ro ? h`<div class="callout info">${icon('lock')}<div class="sm">You have view access only.</div></div>` : h`<div class="bi-tiles">
      ${tile('paste', 'fileText', 'Paste text', 'Copy the paper from anywhere and paste it')}
      ${tile('pdf', 'pdf', 'PDF', 'Typed PDFs are read directly; scans with OCR')}
      ${tile('docx', 'doc', 'Word (.docx)', 'Text and pictures are picked up')}
      ${tile('image', 'image', 'Photo (OCR)', 'A clear photo or screenshot of the paper')}
      ${tile('json', 'db', 'Old test file', 'A .json file saved from the old panel')}
      ${tile('key', 'key', 'Answer key only', 'Paste or upload just the key')}
      ${tile('exp', 'book', 'Explanations only', 'Solutions from text, PDF, Word or a photo')}
      ${tile('hi', 'globe', 'Hindi version · हिंदी', 'Hindi text of these questions and solutions')}
    </div>`}
    <div class="callout info mt16">${icon('info')}<div class="sm"><b>What works best</b><br>Each question starts with its number (<span class="mono">1.</span> or <span class="mono">Q1.</span>), options are <span class="mono">(A)…(D)</span> or <span class="mono">(1)…(4)</span>, and subject headings like <i>Physics</i> start a section. A key after the words “Answer key” is found automatically.</div></div>
    ${st.n ? h`<div class="card mt16 row wrap">${icon('list')}<div class="grow"><b>${fmt.plural(st.n, 'question')} in this test now</b><div class="xs mut">When you import you can add the new questions after these, or replace them.</div></div><button class="btn sm" data-act="step" data-s="2">See questions</button></div>` : ''}
    ${navBtns(2, 4, 'Schedule')}`;
}
async function doImport(src) {
  if (src === 'exp') {
    if (!B.Q.length) return UI.toast('Add or import the questions first, then the explanations', { tone: 'warn' });
    return explainModal();
  }
  if (src === 'hi') return hiModal();
  if (src === 'key') {
    if (!B.Q.length) return UI.toast('Add or import the questions first, then the key', { tone: 'warn' });
    return keyModal();
  }
  if (!AX.importQuestions) return UI.toast('The import tool did not load. Reload the page.', { tone: 'bad' });
  const r = await AX.importQuestions({ source: src, existing: B.Q.length });
  if (!r || !B) return;
  const qs = (r.questions || []).map(normQ);
  if (r.mode === 'replace') B.Q = qs; else B.Q = B.Q.concat(qs);
  const j = r.meta || {};
  if (j.title && (!B.meta.title || r.json)) B.meta.title = j.title;
  if (r.json) { if (j.duration) B.meta.duration = j.duration; if (j.correct != null) B.meta.correct = j.correct; if (j.wrong != null) B.meta.wrong = j.wrong; if (j.lockBack != null) B.meta.lock_back = !!j.lockBack; }
  B.view = Object.assign(B.view, { filter: 'all', sec: null, find: '', page: 0 });
  dirty(true);
  UI.toast(fmt.plural(qs.length, 'question') + (r.mode === 'replace' ? ' imported (replaced the old ones)' : ' added'));
  if (r.mode !== 'replace' && B.Q.length > qs.length) { go(2); jumpQ(B.Q.length - qs.length); } else go(2);
}

/* ---------- step 4: schedule & access ---------- */
function phases(m) {
  const dur = +m.duration || 180, now = Date.now(), out = [];
  if (m.opens_at) out.push({ ic: 'lock', t: 'Before it opens', d: 'Students see the test with “Opens ' + fmt.dt(m.opens_at) + '” and cannot start it.', on: now < m.opens_at, when: 'until ' + fmt.dt(m.opens_at) });
  out.push({ ic: 'play', t: m.closes_at ? 'Live' : 'Open', d: (m.closes_at ? 'Students can start until ' + fmt.dt(m.closes_at) + '.' : 'Students can start any time.') + ' Each attempt gets the full ' + dur + ' minutes.' + (m.practice ? ' Practice mode: the correct answer and explanation show right after each question.' : ''),
    on: (!m.opens_at || now >= m.opens_at) && (!m.closes_at || now < m.closes_at), when: (m.opens_at ? fmt.dt(m.opens_at) : 'From publishing') + (m.closes_at ? ' → ' + fmt.dt(m.closes_at) : '') });
  if (m.closes_at) out.push({ ic: 'clock', t: 'Live has ended', d: m.result_at ? 'No new start. Students who wrote it see only “Submitted” — no score, rank or answer key yet.' : 'No new start after the live end. Scores show straight after each attempt (no result time set).', on: now >= m.closes_at && (!m.result_at || now < m.result_at), when: 'from ' + fmt.dt(m.closes_at) });
  else if (m.result_at) out.push({ ic: 'clock', t: 'Waiting for the result', d: 'Students who finish see only “Submitted” until the result time.', on: now < m.result_at, when: 'until ' + fmt.dt(m.result_at) });
  if (m.result_at) out.push({ ic: 'trophy', t: 'Result & answer key', d: 'Score, rank and the answer key with explanations show by themselves. Rank counts each student’s first attempt.', on: now >= m.result_at, when: fmt.dt(m.result_at) });
  else if (!m.closes_at) out.push({ ic: 'trophy', t: 'Result', d: m.practice ? 'Answers are shown during the test.' : 'Each student sees the score, rank and answer key as soon as they submit.', on: false, when: 'Straight away' });
  return out;
}
function vSchedule() {
  const m = B.meta, err = liveError(m), warn = liveWarn(m);
  return h`<div class="bw-h"><h2>Schedule & access</h2><p>Decide when students can start, when a live test closes, and when results and the answer key appear. Times are as per this device.</p></div>
  <fieldset class="bw-fs" ${B.ro ? raw('disabled') : ''}>
  <div class="card"><div class="card-h">${icon('calendar')}<h3>Times</h3><span class="grow"></span>${m.opens_at || m.closes_at || m.result_at ? h`<button type="button" class="btn xs ghost" data-act="clrTimes">${icon('x', 13)} Clear all</button>` : ''}</div>
    <div class="bw-chips" style="margin:0 0 14px"><button type="button" data-act="fill">${icon('zap', 13)} Live till 9 PM, result 10 PM</button><button type="button" data-act="openNow">Open now · no live window</button>${m.closes_at && !m.result_at ? h`<button type="button" data-act="res1h">Result 1 h after live ends</button>` : ''}</div>
    <div id="bs-f" class="form-grid">
      ${UI.dtField({ name: 'opens_at', label: 'Opens at', value: m.opens_at, placeholder: 'Open now', title: 'When can students start?', hint: 'Empty = students can start as soon as you publish.' })}
      ${UI.dtField({ name: 'closes_at', label: 'Live ends', value: m.closes_at, placeholder: 'No end', title: 'Live ends — no new start after', hint: 'No new start after this time. Empty = never closes.', min: m.opens_at || undefined })}
      ${UI.dtField({ name: 'result_at', label: 'Result & answer key at', value: m.result_at, placeholder: 'Straight after submitting', title: 'When do results and the answer key show?', hint: 'Until then students only see “Submitted”.', full: true, min: m.closes_at || m.opens_at || undefined })}
    </div>
    ${err ? h`<div class="callout bad mt16">${icon('alert')}<div class="sm"><b>${err}</b></div></div>` : warn ? h`<div class="callout warn mt16">${icon('info')}<div class="sm">${warn}</div></div>` : ''}
  </div>
  <div class="card mt16"><div class="card-h">${icon('zap')}<h3>Practice mode</h3></div>
    ${sw('practice', m.practice, 'Instant answers (practice)', 'After each question students see the correct answer and the explanation. Not for ranked live tests.')}
    ${m.practice && m.result_at ? h`<div class="callout bad mt12">${icon('alert')}<div class="sm">Practice tests show answers at once: clear the result time or turn practice off.</div></div>` : ''}
  </div></fieldset>
  <div class="card mt16"><div class="card-h">${icon('eye')}<h3>What students will see</h3></div>
    <div class="bs-tl">${join(phases(m), p => h`<div class="bs-ph ${p.on ? 'on' : ''}"><span class="bd">${icon(p.ic)}</span><div class="grow"><div class="row wrap gap6"><b>${p.t}</b>${p.on ? UI.pill('Now', 'pri') : ''}</div><div class="when">${p.when}</div><div class="sm tx2">${p.d}</div></div></div>`)}</div>
    <div class="xs mut mt8">${m.active ? 'Visible to students' : 'Hidden from students (turn on “Visible to students” in Details)'}${m.free_preview ? ' · Free preview: open even if the series is paid' : ''}${m.lock_back ? ' · Going back is locked' : ''}</div>
  </div>
  ${navBtns(3, 5, 'Review & publish')}`;
}

/* ---------- step 5: review & publish ---------- */
function vPublish() {
  const m = B.meta, st = stats(), s = series(m.series_id), err = liveError(m);
  const f = (B.cat.folders || []).find(x => x.id === m.folder_id);
  if (B.justPublished) {
    const p = B.justPublished;
    return h`<div class="card bp-done"><div class="big">${icon('check')}</div><h2 class="disp" style="font-size:28px">${p.update ? 'Test updated' : 'Test published'}</h2>
      <p class="mut mt8">“${m.title}” ${m.active ? (m.opens_at && m.opens_at > Date.now() ? 'opens for students on ' + fmt.dt(m.opens_at) : 'is live for students now') : 'is saved but hidden from students'}.${p.metaOnly ? ' Questions were unchanged, so only the details and schedule were saved.' : ''}</p>
      <div class="row wrap mt24" style="justify-content:center"><button class="btn" data-act="pubShare">${icon('link', 16)} Share link</button>${AX.can('results') ? h`<button class="btn" data-act="pubAna">${icon('chart', 16)} Analytics</button>` : ''}<button class="btn" data-act="pubEdit">${icon('edit', 16)} Keep editing</button><button class="btn" data-act="pubNew">${icon('plus', 16)} New test</button><button class="btn pri" data-act="pubDone">${icon('check', 16)} Done</button></div></div>`;
  }
  const secs = secList();
  const ck = (tone, t, d, s2) => h`<div class="bp-ck"><span class="ci ${tone}">${icon(tone === 'ok' ? 'check' : tone === 'warn' ? 'info' : 'alert', 15)}</span><div class="grow"><b>${t}</b>${d ? h`<div class="xs mut">${d}</div>` : ''}</div>${s2 ? h`<button class="btn xs ghost" data-act="step" data-s="${s2}">Fix</button>` : ''}</div>`;
  const missing = B.Q.filter(q => q.answer == null).length, other = B.Q.filter(q => bad(q) && q.answer != null).length + B.Q.filter(q => q.answer == null && problems(q).length > 1).length;
  const blockers = !m.title.trim() || !m.series_id || !st.n || !!err || (m.folder_id === '__new' && !m.folderNew.trim());
  return h`<div class="bw-h"><h2>Review & ${B.id ? 'update' : 'publish'}</h2><p>${B.id ? 'Check the summary, then update. Students see the change at once.' : 'Check the summary, then publish. Students see the test at once (or at the opening time).'}</p></div>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h">${icon('shieldCheck')}<h3>Checklist</h3></div>
      ${m.title.trim() ? ck('ok', 'Test name', m.title) : ck('bad', 'Add a test name', 'Students see this name', 1)}
      ${m.series_id ? ck('ok', 'Series', (s ? s.title : '') + (f ? ' · ' + f.title : m.folder_id === '__new' ? ' · new folder “' + (m.folderNew || '') + '”' : '')) : ck('bad', 'Choose a series', 'Create one in Test studio first', 1)}
      ${m.folder_id === '__new' && !m.folderNew.trim() ? ck('bad', 'Name the new folder', '', 1) : ''}
      ${st.n ? ck('ok', fmt.plural(st.n, 'question'), secs.some(x => x.name) ? secs.map(x => (x.name || 'No section') + ' ' + x.n).join(' · ') : 'No sections') : ck('bad', 'Add at least one question', '', 2)}
      ${st.n ? (missing ? ck('warn', missing + ' without a correct answer', 'They are counted as wrong for nobody — fix them before students attempt.', 2) : ck('ok', 'Every question has an answer')) : ''}
      ${st.n && st.nb - missing > 0 ? ck('warn', (st.nb - missing) + ' with an empty option or text', 'You can still publish.', 2) : ''}
      ${err ? ck('bad', err, '', 4) : ck('ok', 'Schedule', schedLine(m) + (m.closes_at ? ' · live till ' + fmt.dt(m.closes_at) : '') + (m.result_at ? ' · result ' + fmt.dt(m.result_at) : ''))}
      ${liveWarn(m) ? ck('warn', 'Result comes out before late starters finish', 'You will be asked to confirm.', 4) : ''}
      ${!m.active ? ck('warn', 'Hidden from students', 'Turn on “Visible to students” in Details when ready.', 1) : ''}
      ${hiCheck(ck, st)}
    </div>
    <div class="col gap16"><div class="card"><div class="card-h">${icon('fileText')}<h3>Summary</h3></div>
      <dl class="kv"><dt>Questions</dt><dd>${st.n}</dd><dt>Marking</dt><dd>+${m.correct} / −${m.wrong} · max ${fmt.num(st.max)}</dd><dt>Duration</dt><dd>${+m.duration || 180} min</dd>
        <dt>Opens</dt><dd>${m.opens_at ? fmt.dt(m.opens_at) : 'When published'}</dd><dt>Live ends</dt><dd>${m.closes_at ? fmt.dt(m.closes_at) : '—'}</dd><dt>Result</dt><dd>${m.result_at ? fmt.dt(m.result_at) : 'Straight after submitting'}</dd>
        <dt>Mode</dt><dd>${m.practice ? 'Practice (instant answers)' : 'Normal test'}</dd><dt>Medium</dt><dd>${st.hiAll ? 'English + हिंदी' : st.hiAny ? 'English (Hindi ' + st.hiDone + '/' + st.n + ')' : 'English only'}</dd><dt>Access</dt><dd>${[m.active ? 'Visible' : 'Hidden', m.free_preview ? 'Free preview' : '', m.lock_back ? 'No going back' : ''].filter(Boolean).join(' · ')}</dd>
        ${B.id ? h`<dt>Attempts</dt><dd>${B.results}</dd>` : ''}</dl></div>
      ${B.ro ? h`<div class="callout info">${icon('lock')}<div class="sm">View access only — you cannot publish.</div></div>` : h`<div class="card glass" id="bp-box">
        ${B.id && !B.qDirty ? h`<div class="xs mut" style="margin-bottom:10px">Questions are unchanged, so only the details and schedule${B.hiDirty ? ' and the Hindi text' : ''} will be saved.</div>` : B.id && B.results ? h`<div class="callout warn" style="margin-bottom:12px">${icon('info')}<div class="xs">${fmt.plural(B.results, 'student')} already attempted it. Their scores stay. If you removed or reordered questions, old question reports may point to a different question.</div></div>` : ''}
        <button class="btn pri lg block" data-act="publish" ${blockers ? raw('disabled') : ''}>${icon('send', 18)} ${B.id ? 'Update test' : 'Publish test'}</button>
        <div id="bp-prog" class="hide mt12"><div class="progress"><i style="width:0%"></i></div><div class="xs mut mt8" id="bp-st"></div></div>
        ${blockers ? h`<div class="xs mut mt8" style="text-align:center">Fix the red items first.</div>` : ''}</div>`}
    </div></div>
  ${navBtns(4, 0)}`;
}
// the Hindi line of the checklist
function hiCheck(ck, st) {
  if (st.hiAny && B.noLang) return ck('bad', 'Hindi cannot be saved yet', B.noLang === 'missing' ? 'Run supabase_v41_medium.sql in Supabase, then publish again. The English test is saved.' : 'Could not load the Hindi part (' + B.noLang + ').');
  if (!st.hiAny) return ck('ok', 'English only', 'Hindi-medium students also get this test in English. To add Hindi: Questions → हिंदी.');
  if (st.hiAll) return ck('ok', 'Hindi ready · हिंदी ✓', 'Hindi-medium students get every question in Hindi.' + (st.hiSol ? ' ' + fmt.plural(st.hiSol, 'solution') + ' only in English (shown in English to them).' : ''));
  return ck('warn', 'Hindi ' + st.hiDone + ' of ' + st.n, 'Incomplete Hindi is never shown: Hindi-medium students get the whole test in English until every question has Hindi.', 2);
}
// save the Hindi text next to the test (after the test itself, so it fits the questions just saved)
async function saveHi(id, metaOnly) {
  const any = B.Q.some(q => q.hi);
  if (B.noLang === 'missing' && !any) return { ok: true, skip: true };
  const need = B.hiDirty || (!metaOnly && (any || B.hiServer)) || (B.hiServer && !B.hiServer.fresh && any);
  if (!need) return { ok: true, skip: true };
  const r = any ? await AX.api.call('cbt_admin_lang', 'test_set', { id, data: B.Q.map(q => q.hi || blankHi()) }) : await AX.api.call('cbt_admin_lang', 'test_clear', { id });
  if (r.ok) { B.hiDirty = false; B.noLang = ''; B.hiServer = any && !r.cleared ? { ready: !!r.ready, fresh: true, done: r.done || 0 } : null; AX.cache.drop('lang'); }
  return r;
}
async function resolveFolder(sid, m) {
  if (m.folder_id && m.folder_id !== '__new') return (B.cat.folders || []).some(f => f.id === m.folder_id && f.series_id === sid) ? m.folder_id : null;
  const name = (m.folder_id === '__new' ? m.folderNew : '').trim(); if (!name) return null;
  const f = (B.cat.folders || []).find(x => x.series_id === sid && String(x.title).trim().toLowerCase() === name.toLowerCase());
  if (f) return f.id;
  const r = await AX.api.admin('folder_save', { series_id: sid, title: name });
  if (!r.ok) throw new Error('Could not create the folder');
  return r.id;
}
async function publish(btn) {
  if (!B || B.ro) return;
  const m = B.meta;
  if (!B.Q.length) return UI.toast('No questions yet', { tone: 'warn' });
  const title = m.title.trim(), sid = m.series_id;
  if (!title) return UI.toast('Please enter a test name', { tone: 'warn' });
  if (!sid) return UI.toast('Please choose a series', { tone: 'warn' });
  const n = B.Q.filter(bad).length;
  if (B.qDirty || !B.id) { if (n && !(await UI.confirm({ title: 'Publish with problems?', text: `${n} question(s) have problems (missing answer or option). Publish anyway?`, yes: 'Publish anyway', no: 'Fix first' }))) return; }
  const dur = +m.duration || 180;
  const lw = await liveCheck(Object.assign({}, m, { duration: dur }));
  if (lw === null) return; if (lw) return UI.toast(lw, { tone: 'bad' });
  const prog = WS.querySelector('#bp-prog'), bar = prog.querySelector('i'), st = WS.querySelector('#bp-st');
  prog.classList.remove('hide'); btn.disabled = true; btn.classList.add('busy');
  const set = (p, t) => { bar.style.width = p + '%'; st.textContent = t; };
  const metaOnly = !!B.id && !B.qDirty;
  try {
    set(3, 'Preparing…');
    const fid = await resolveFolder(sid, m);
    const base = { id: B.id || null, series_id: sid, folder_id: fid, title, duration: dur, correct: +m.correct, wrong: +m.wrong, lock_back: !!m.lock_back, free_preview: !!m.free_preview,
      active: m.active !== false, sort_order: parseInt(m.sort_order, 10) || 0, opens_at: m.opens_at || null, closes_at: m.closes_at || null, result_at: m.result_at || null };
    let r;
    if (metaOnly) {
      set(40, 'Saving details…');
      r = await AX.api.admin('test_save', base);
    } else {
      const token = rnd(); let batch = [], size = 0, part = 0, sent = 0;
      const flush = async () => {
        if (!batch.length) return;
        const x = await AX.api.admin('test_stage', { token, n: part, questions: batch });
        if (!x.ok) throw new Error('upload failed (' + (x.error || '') + ')');
        part++; sent += batch.length; batch = []; size = 0;
        set(5 + Math.round(sent * 85 / B.Q.length), `Uploading… ${sent} of ${B.Q.length}`);
      };
      for (const q of B.Q) { const o = outQ(q), len = JSON.stringify(o).length; if (batch.length && (size + len > 450000 || batch.length >= 40)) await flush(); batch.push(o); size += len; }
      await flush();
      set(93, 'Saving the test…');
      r = await AX.api.admin('test_save', Object.assign(base, { stage_token: token, count: B.Q.length }));
    }
    if (!r.ok) throw new Error(r.error === 'incomplete' ? 'upload was incomplete, please try again' : r.error === 'questions' ? 'add at least one question' : r.error === 'result_before_close' ? 'result time must be after the live end time' : r.error === 'title' ? 'please enter a test name' : r.error === 'series' ? 'the series no longer exists' : r.error === 'forbidden' ? 'you do not have permission' : (r.detail || AX.errText(r)));
    // practice mode is a separate call, after test_save (as before)
    if (!B.id || !!m.practice !== B.practice0) {
      const p = await AX.api.call('cbt_admin_practice', 'set', { id: r.id, on: !!m.practice });
      if (p.ok) B.practice0 = !!m.practice; else if (m.practice) UI.toast('Practice mode needs the v5 SQL update in Supabase', { tone: 'warn', ms: 6000 });
    }
    set(97, 'Saving the Hindi…');
    const hr = await saveHi(r.id, metaOnly);
    if (!hr.ok) { B.noLang = hr.error || 'server'; UI.toast('The test is saved, but the Hindi text could not be saved' + (hr.error === 'missing' ? ': run supabase_v41_medium.sql in Supabase' : ' (' + AX.errText(hr) + ')') + '. Publish again to retry.', { tone: 'bad', ms: 9000 }); }
    set(100, 'Done');
    const wasNew = !B.id;
    AX.ls.del(DK + B.key);
    B.id = r.id; B.key = r.id; B.qDirty = false; B.dirty = !hr.ok; B.published = true; B.draftFail = false;
    if (!hr.ok) { B.hiDirty = true; saveDraft(); }
    m.folder_id = fid || ''; m.folderNew = '';
    AX.cache.drop('catalog'); AX.emit('data:changed'); AX.emit('tests:changed', { id: r.id });
    const cat = await AX.data.catalog(true); if (cat && cat.ok && B) B.cat = cat;
    if (!B) return;
    B.justPublished = { update: !wasNew, metaOnly };
    UI.toast(wasNew ? 'Published ✓' : 'Updated ✓');
    render();
  } catch (err) {
    UI.toast('Could not publish: ' + err.message, { tone: 'bad', ms: 6000 });
    if (st) st.textContent = 'Failed: ' + err.message;
    bar.style.width = '0%';
  } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('busy'); } }
}

/* ---------- events ---------- */
function onField(e) {
  if (!B || B.ro) return;
  const el = e.target;
  if (el.id === 'bq-find') { if (e.type === 'input') { B.view.find = el.value; B.view.page = 0; findSoon(); } return; }
  if (el.type === 'hidden' && e.type === 'change' && ['opens_at', 'closes_at', 'result_at'].includes(el.name)) {
    B.meta[el.name] = el.value ? Number(el.value) : null; dirty(); render(); return;
  }
  const k = el.dataset && el.dataset.m; if (!k) return;
  if (el.type === 'checkbox') { if (e.type !== 'change') return; B.meta[k] = el.checked; dirty(); if (k === 'practice') render(); else chrome(); return; }
  if (el.tagName === 'SELECT' && e.type !== 'change') return;
  B.meta[k] = el.value;
  dirty();
  if (k === 'series_id') { B.meta.folder_id = ''; render(); }
  else if (k === 'folder_id') { render(); if (el.value === '__new') setTimeout(() => { const x = WS.querySelector('#bd-fnew'); if (x) x.focus(); }, 30); }
  else if (k === 'correct' || k === 'duration') { const p = WS.querySelector('.card-h .pill.num'); if (p) p.textContent = 'Max ' + fmt.num(stats().max) + ' marks'; WS.querySelectorAll('[data-act=dur]').forEach(b => b.classList.toggle('on', +b.dataset.v === +B.meta.duration)); }
}
const findSoon = AX.u.debounce(() => { if (B && B.step === 2) fillList(); }, 200);
const ACTS = {
  close: () => closeWs(),
  step: el => go(+el.dataset.s),
  dur(el) { B.meta.duration = +el.dataset.v; dirty(); render(); },
  preset(el) { const v = el.dataset.v; if (v === 'none') B.meta.wrong = 0; else Object.assign(B.meta, { duration: 180, correct: 4, wrong: 1 }); dirty(); render(); },
  qadd: () => editQ(B.Q.length),
  qedit: el => editQ(+el.dataset.i, B.lang),
  qlang(el) { B.lang = el.dataset.l === 'hi' ? 'hi' : 'en'; if (B.view.filter === 'nohi' && B.lang === 'en' && !B.Q.some(q => q.hi)) B.view.filter = 'all'; refreshQ(); },
  himodal: () => hiModal(),
  qkey(el) { if (B.ro) return; const i = +el.dataset.i, j = +el.dataset.j, q = B.Q[i]; q.answer = q.answer === j ? null : j; dirty(true); const c = WS.querySelector('#bq-' + i); if (c) { const t = document.createElement('div'); t.innerHTML = AX.html(cardHtml(i)); c.replaceWith(t.firstElementChild); } chrome(); },
  qmenu: el => qMenu(el, +el.dataset.i),
  qtools: el => qTools(el),
  qf(el) { B.view.filter = el.dataset.f; B.view.sec = null; B.view.page = 0; if (el.dataset.f === 'all') B.view.find = ''; refreshQ(); },
  qsec(el) { B.view.sec = B.view.sec === el.dataset.sec ? null : el.dataset.sec; B.view.filter = 'all'; B.view.page = 0; refreshQ(); },
  qpage(el) { B.view.page = Math.max(0, +el.dataset.p); fillList(); const l = WS.querySelector('#bq-list'); if (l) l.scrollIntoView({ block: 'start' }); },
  qsel(el) { const i = +el.dataset.i; if (el.checked) B.view.sel.add(i); else B.view.sel.delete(i); const c = WS.querySelector('#bq-' + i); if (c) c.classList.toggle('sel', el.checked); const b = WS.querySelector('.bq-bulk b'); if (b) b.textContent = B.view.sel.size + ' selected'; WS.querySelectorAll('.bq-bulk [data-act=bulksec],.bq-bulk [data-act=bulkdel]').forEach(x => { x.disabled = !B.view.sel.size; }); },
  selall() { vis().forEach(i => B.view.sel.add(i)); fillList(); },
  seldone() { B.view.selMode = false; B.view.sel.clear(); fillList(); },
  bulksec() { setSection([...B.view.sel]); },
  async bulkdel() { const n = B.view.sel.size; if (!(await UI.confirm({ title: 'Delete ' + fmt.plural(n, 'question') + '?', text: 'They are removed from this editor. You can undo right after.', yes: 'Delete', tone: 'danger' }))) return; delQ([...B.view.sel]); },
  keymodal: () => keyModal(),
  expmodal: () => explainModal(),
  secmodal: () => secModal(),
  imp: el => doImport(el.dataset.src),
  fill() { liveFill(B.meta); dirty(); render(); UI.toast('Live till ' + fmt.dt(B.meta.closes_at) + ', result ' + fmt.time(B.meta.result_at)); },
  openNow() { B.meta.opens_at = null; B.meta.closes_at = null; B.meta.result_at = null; dirty(); render(); },
  clrTimes() { B.meta.opens_at = null; B.meta.closes_at = null; B.meta.result_at = null; dirty(); render(); },
  res1h() { B.meta.result_at = B.meta.closes_at + 3600000; dirty(); render(); },
  publish: el => publish(el),
  pubShare() { if (AX.shareTest) AX.shareTest(B.id); },
  pubAna() { const id = B.id; unmount(); if (AX.openAnalytics) AX.openAnalytics(id); else AX.go('results'); },
  pubEdit() { B.justPublished = null; go(2); },
  pubNew() { const sid = B.meta.series_id, fid = B.meta.folder_id; unmount(); AX.openTest(null, { seriesId: sid, folderId: fid }); },
  pubDone() { unmount(); }
};
})();
