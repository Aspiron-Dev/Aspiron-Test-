/* =====================================================================
   Question reports: problems students found in questions or answer keys, plus the most bookmarked questions.
   Server: cbt_admin reports / report_status / report_delete / bookmark_stats
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('content', 'manage');
const KIND = { wrong_answer: 'Answer looks wrong', wrong_question: 'Question wrong / unclear', missing_option: 'Option missing / incorrect', bad_image: 'Image problem', other: 'Other' };
const KEY = n => n == null || n === '' || n < 0 ? 'not set' : 'ABCD'[n] || String(n);
const load = force => AX.cache.get('reports', () => AX.api.admin('reports'), 30000, force);
const openQ = (tid, qi) => { if (AX.openTest && can()) AX.openTest(tid, { question: qi }); else UI.toast('Open the test in Test studio to edit this question', { tone: 'warn' }); };

AX.mod({
  id: 'reports', title: 'Question reports', short: 'Reports', icon: 'flag', group: 'Academics', order: 40, perm: 'content',
  sub: 'Problems students found in questions and answers.',
  async render(ctx) {
    const tab = ctx.parts[0] || 'reports', f = ctx.q.f || 'open';
    AX.set(ctx.el, UI.skeleton(4));
    const r = await load(true);
    if (!ctx.alive()) return;
    const all = (r.ok && r.reports) || [];
    ctx.head({ title: 'Question reports', sub: 'Problems students found in questions or answer keys. Fix the question, then mark the report resolved.',
      tabs: [{ id: 'reports', title: 'Reported questions', icon: 'flag', count: all.filter(x => x.status === 'open').length }, { id: 'bookmarks', title: 'Most bookmarked', icon: 'star' }], tab });
    if (tab === 'bookmarks') return bookmarks(ctx);
    if (!r.ok) { AX.set(ctx.el, UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    const L = f === 'all' ? all : all.filter(x => x.status === f);
    const cnt = k => k === 'all' ? all.length : all.filter(x => x.status === k).length;
    AX.set(ctx.el, h`<div class="chips">${join([['open', 'Open'], ['resolved', 'Resolved'], ['rejected', 'Rejected'], ['all', 'All']], ([k, l]) => h`<a class="chip ${f === k ? 'on' : ''} ${k === 'open' && cnt('open') ? 'alert' : ''}" href="${AX.link('reports', { f: k })}">${l}<em>${cnt(k)}</em></a>`)}</div>
      <div class="col gap16 mt16">${L.length ? join(L, x => h`<div class="card"><div class="row top"><span class="av" style="--c:${x.status === 'open' ? '#f59e0b' : x.status === 'resolved' ? '#10b981' : '#64748b'}">${icon('flag', 17)}</span>
          <div class="grow"><div class="row wrap gap6"><b>${x.title} · Q${x.qidx + 1}</b>${x.status === 'open' ? UI.pill('Open', 'warn') : x.status === 'resolved' ? UI.pill('Resolved', 'ok') : UI.pill('Rejected')}${UI.pill(KIND[x.kind] || x.kind, 'info')}</div>
            <div class="xs mut">${x.student} · ${fmt.mobile(x.mobile)} · ${fmt.ago(x.at)}</div>
            ${x.note ? h`<p class="mt8"><b>“${x.note}”</b></p>` : ''}
            <div class="well mt8 sm" style="white-space:pre-wrap">${x.q || '(question has no text)'}</div>
            <div class="xs mut mt8">Current answer key: <b class="tx2">${KEY(x.answer)}</b></div></div></div>
          <div class="row wrap end mt12">${x.test_id ? h`<button class="btn sm" data-act="open" data-t="${x.test_id}" data-q="${x.qidx}">${icon('edit', 14)} Open question</button>` : ''}
            ${can() ? h`${x.status !== 'resolved' ? h`<button class="btn sm soft" data-act="set" data-id="${x.id}" data-v="resolved">${icon('check', 14)} Mark resolved</button>` : ''}${x.status === 'open' ? h`<button class="btn sm" data-act="set" data-id="${x.id}" data-v="rejected">Reject</button>` : ''}<button class="ibtn sm" data-act="del" data-id="${x.id}" aria-label="Delete">${icon('trash', 15)}</button>` : ''}</div></div>`)
        : h`<div class="card">${UI.empty({ icon: 'checkCircle', title: f === 'open' ? 'No open reports' : 'Nothing here', text: 'When a student taps “Report a problem” on a question, it shows up here.' })}</div>`}</div>`);
    AX.act(ctx.el, {
      retry: () => ctx.reload(),
      open: el => openQ(el.dataset.t, +el.dataset.q),
      async set(el) { const x = await AX.api.admin('report_status', { id: el.dataset.id, status: el.dataset.v }); if (!x.ok) return UI.err(x); UI.toast(el.dataset.v === 'resolved' ? 'Marked resolved' : 'Rejected'); AX.cache.drop('reports'); AX.emit('data:changed'); ctx.reload(); },
      async del(el) { if (!(await UI.confirm({ title: 'Delete this report?', yes: 'Delete', tone: 'danger' }))) return; const x = await AX.api.admin('report_delete', { id: el.dataset.id }); if (!x.ok) return UI.err(x); UI.toast('Deleted'); AX.cache.drop('reports'); AX.emit('data:changed'); ctx.reload(); }
    });
  },
  async attention() {
    const r = await load(); if (!r.ok) return [];
    const n = (r.reports || []).filter(x => x.status === 'open').length;
    return n ? [{ title: 'Question reports', sub: 'Students found a problem in a question', count: n, go: '#/reports', icon: 'flag', tone: 'gold', badge: true }] : [];
  }
});
async function bookmarks(ctx) {
  AX.set(ctx.el, UI.skeleton(4));
  const r = await AX.api.admin('bookmark_stats');
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const L = r.items || [];
  AX.set(ctx.el, h`<div class="callout info">${icon('info')}<div class="sm">Questions students saved most often — usually the hard or important ones. Good material for revision tests.</div></div>
    <div class="card pad0 list mt16">${L.length ? join(L, x => h`<div class="li"><span class="pill gold" style="min-width:48px;justify-content:center">${x.count}★</span><div class="grow"><div class="t ell">${x.title} · Q${x.qidx + 1}</div><div class="s ell">${x.q || '(image question)'}</div>${(x.students || []).length ? h`<div class="xs faint ell">${x.students.join(', ')}</div>` : ''}</div><button class="btn sm" data-act="open" data-t="${x.test_id}" data-q="${x.qidx}">Open</button></div>`)
      : UI.empty({ icon: 'star', title: 'Nobody has bookmarked a question yet' })}</div>`);
  AX.act(ctx.el, { retry: () => ctx.reload(), open: el => openQ(el.dataset.t, +el.dataset.q) });
}
})();
