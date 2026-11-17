/* =====================================================================
   Doubts: a student asks a doubt on a question of a test they took; a teacher answers here.
   Server: cbt_admin_doubts (supabase_v87_doubts.sql). Who may use it: the Messaging module
   (View = read, Full access = answer / close / delete). Every word a student typed is shown only through h`` (escaped).
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('messaging', 'manage');
const D = { items: [], waiting: 0, v87: false };
async function load() {
  return AX.cache.get('doubts', async () => { const r = await AX.api.call('cbt_admin_doubts', 'get', {}); if (r.ok) { D.items = r.items || []; D.waiting = +r.waiting || 0; D.v87 = !!r.v87; } return r; });
}

AX.mod({
  id: 'doubts', title: 'Doubts', icon: 'msg', group: 'Communication', order: 22, perm: 'messaging',
  sub: 'Questions students ask on their test results. Answer them here; the student sees the answer in My Doubts.',
  async render(ctx) {
    const f = ctx.q.f || 'open', sid = ctx.q.s || '';
    ctx.head({ title: 'Doubts', sub: 'Students ask from a question of a test they took (once its result is out). Your answer shows in their My Doubts. Student mobile numbers are only visible here.' });
    AX.set(ctx.el, UI.skeleton(4));
    AX.cache.drop('doubts');
    const [r, cat] = await Promise.all([load(), AX.data.catalog()]);
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, h`<div class="card">${r.error === 'missing' || r.error === 'server'
        ? UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v87_doubts.sql once in Supabase (SQL Editor), then run supabase_v35_admin_team.sql again.', action: h`<button class="btn" data-act="retry">Check again</button>` })
        : UI.empty({ icon: 'msg', title: 'Could not load doubts', text: AX.errText(r), action: h`<button class="btn" data-act="retry">Try again</button>` })}</div>`);
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    const ser = id => ((cat.ok && cat.series) || []).find(s => s.id === id);
    const cnt = k => k === 'all' ? D.items.length : D.items.filter(x => x.status === k).length;
    const sids = [...new Set(D.items.map(x => x.series_id).filter(Boolean))];
    const base = D.items.filter(x => (f === 'all' || x.status === f) && (!sid || x.series_id === sid));
    AX.set(ctx.el, h`<div class="row wrap" style="gap:12px"><div class="chips">${join([['open', 'Waiting'], ['answered', 'Answered'], ['closed', 'Closed'], ['all', 'All']], ([k, l]) => h`<a class="chip ${f === k ? 'on' : ''} ${k === 'open' && cnt('open') ? 'alert' : ''}" href="${AX.link('doubts', Object.assign({ f: k }, sid ? { s: sid } : {}))}">${l}<em>${cnt(k)}</em></a>`)}</div><span class="grow"></span>
        ${sids.length > 1 ? h`<select class="inp sm" style="width:auto;max-width:220px" data-act="ser"><option value="">All series</option>${join(sids, s => h`<option value="${s}" ${s === sid ? AX.raw('selected') : ''}>${(ser(s) || {}).title || 'Series'}</option>`)}</select>` : ''}
        <div class="inp-wrap search" style="width:min(280px,100%)">${icon('search', 16)}<input class="inp sm" data-act="q" placeholder="Search name, mobile, text"></div></div>
      <div class="col gap16 mt16" id="db-list"></div>`);
    const row = x => h`<div class="card"><div class="row top">${UI.avatar(x.student, x.mobile)}
          <div class="grow"><div class="row wrap gap6"><b>${x.student || 'Student'}</b>${x.status === 'open' ? UI.pill('Waiting', 'warn') : x.status === 'answered' ? UI.pill('Answered', 'ok') : UI.pill('Closed', 'bad')}${x.subject ? UI.pill(x.subject, 'gold') : ''}</div>
            <div class="xs mut">${fmt.mobile(x.mobile)} · ${(ser(x.series_id) || {}).title || 'Series'} · ${x.test || 'Test'} · Question ${(+x.qidx || 0) + 1} · ${fmt.dt(x.at)}</div>
            ${x.q ? h`<p class="mt8 sm mut" style="border-left:3px solid var(--line);padding-left:10px">${x.q}</p>` : ''}
            <p class="mt8" style="white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere">${x.body}</p>
            ${x.answer ? h`<div class="well mt12 sm"><b>Your answer${x.ans_at ? ' · ' + fmt.dt(x.ans_at) : ''}:</b><div style="white-space:pre-wrap;overflow-wrap:anywhere">${x.answer}</div></div>` : ''}</div></div>
          <div class="row wrap mt12 end">${x.test_id ? h`<button class="btn sm ghost" data-act="openq" data-id="${x.id}">${icon('eye', 14)} Question</button>` : ''}
            ${can() ? h`<button class="btn sm ${x.status === 'open' ? 'pri' : ''}" data-act="ans" data-id="${x.id}">${icon('msg', 14)} ${x.answer ? 'Edit answer' : 'Answer'}</button>
              ${x.status === 'open' ? h`<button class="btn sm" data-act="close" data-id="${x.id}">Close</button>` : ''}<button class="ibtn sm" data-act="del" data-id="${x.id}" aria-label="Delete">${icon('trash', 15)}</button>` : ''}</div></div>`;
    const drawList = (q = '') => { q = q.trim().toLowerCase(); const L = base.filter(x => !q || (x.student + ' ' + x.mobile + ' ' + x.body + ' ' + x.test + ' ' + x.subject).toLowerCase().includes(q));
      AX.set('#db-list', L.length ? join(L, row) : h`<div class="card">${UI.empty({ icon: 'msg', title: D.items.length ? 'No doubts here' : 'No doubts yet', text: D.items.length ? 'Try another filter or search.' : 'Students ask from a question of a test result in the app. They show here as soon as they are sent.' })}</div>`); };
    drawList();
    const act = async (id, action, data, msg) => { const x = await AX.api.call('cbt_admin_doubts', action, Object.assign({ id }, data || {})); if (!x.ok) return UI.err(x); UI.toast(msg || 'Saved'); AX.cache.drop('doubts'); AX.emit('data:changed'); ctx.reload(); };
    AX.act(ctx.el, {
      openq: el => { const x = D.items.find(i => i.id === el.dataset.id); if (x && x.test_id) AX.openTest(x.test_id, { q: +x.qidx || 0 }); },
      async ans(el) { const x = D.items.find(i => i.id === el.dataset.id); if (!x) return;
        const v = await UI.prompt({ title: 'Answer ' + (x.student || 'the student'), label: 'The student sees this in My Doubts. To add a button, write [button text](https://link).', value: x.answer || '', multiline: true, yes: 'Send answer' });
        if (v === null) return; act(x.id, 'answer', { answer: v }, 'Answer sent'); },
      async close(el) { const x = D.items.find(i => i.id === el.dataset.id); if (!x) return; if (!(await UI.confirm({ title: 'Close this doubt without an answer?', text: 'The student sees it as closed.', yes: 'Close' }))) return; act(x.id, 'close', {}, 'Closed'); },
      async del(el) { const x = D.items.find(i => i.id === el.dataset.id); if (!x) return; if (!(await UI.confirm({ title: 'Delete this doubt?', text: 'It also disappears from the student’s My Doubts. This cannot be undone.', yes: 'Delete', tone: 'danger' }))) return; act(x.id, 'delete', {}, 'Doubt deleted'); }
    });
    AX.act(ctx.el, { ser: el => AX.go('doubts', Object.assign({ f }, el.value ? { s: el.value } : {})) }, 'change');
    AX.act(ctx.el, { q: AX.u.debounce(el => drawList(el.value), 200) }, 'input');
  },
  async attention() {
    const r = await load(); if (!r.ok) return [];
    const n = D.items.filter(x => x.status === 'open').length;
    return n ? [{ title: 'Doubts waiting for an answer', sub: 'Students are waiting in My Doubts', count: n, go: '#/doubts?f=open', icon: 'msg', tone: 'gold', badge: true }] : [];
  }
});
})();
