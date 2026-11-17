/* =====================================================================
   Question of the Day: the stories on the student Home. Pick Question bank questions for a day; students see one circle per subject.
   Server: cbt_admin_qotd (supabase_v87_qotd.sql) · questions come from cbt_admin_qbank (the Question bank page writes new ones).
   Only text questions can be picked (no picture); a question of a live test waits for its result time.
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('content', 'manage');
const call = (a, d) => AX.api.call('cbt_admin_qotd', a, d || {});
const bank = (a, d) => AX.api.call('cbt_admin_qbank', a, d || {});
const load = force => AX.cache.get('qotd', () => call('list', {}), 20000, force);
const missing = r => r && (r.error === 'missing' || (r.error === 'server' && (r.status === 404 || r.status === 400)));
// subject and chapter names come from pyq-syllabus.js (the same file the Question bank page loads)
let sylP = null;
const syl = () => sylP || (sylP = window.PYQ_SYL ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'pyq-syllabus.js?v=3'; s.onload = res; s.onerror = () => { sylP = null; rej(new Error('syllabus')); }; document.head.appendChild(s); }));
const SUBS = () => { try { return window.qbSubjects ? window.qbSubjects() : window.PYQ_SYL.NEET.subjects; } catch (e) { return []; } };
const subName = s => { const x = SUBS().find(y => y.id === s); return x ? x.name : (s ? String(s).replace(/\b\w/g, c => c.toUpperCase()) : 'General'); };
const chapName = (s, c) => { if (!c) return ''; const x = SUBS().find(y => y.id === s), ch = x && x.chapters.find(y => y.id === c); return ch ? ch.name : c; };
const dayName = (d, today) => { const t = new Date(d + 'T00:00:00'), diff = Math.round((t - new Date(today + 'T00:00:00')) / 864e5), nm = t.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return diff === 0 ? 'Today · ' + nm : diff === 1 ? 'Tomorrow · ' + nm : diff === -1 ? 'Yesterday · ' + nm : nm; };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const setupBox = () => h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v87_qotd.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again, and refresh this page.' })}</div>`;
let CUR = null;
const changed = msg => { AX.cache.drop('qotd'); if (msg) UI.toast(msg); if (CUR && CUR.ctx.alive()) CUR.ctx.reload(); };

AX.mod({
  id: 'qotd', title: 'Question of the Day', short: 'QOTD', icon: 'target', group: 'Tests & questions', order: 45, perm: 'content',
  sub: 'Stories on the student Home: pick questions from the Question bank for a day.',
  async render(ctx) {
    CUR = { ctx };
    AX.set(ctx.el, UI.skeleton(4));
    try { await syl(); } catch (e) { /* names fall back to the stored ids */ }
    const r = await load(true);
    if (!ctx.alive()) return;
    ctx.head({ title: 'Question of the Day', sub: 'Students see one story circle per subject on Home. Pick 3 to 5 questions per subject for each day.',
      actions: can() ? h`<button class="btn pri" data-act="add" data-day="${(r && r.today) || ''}">${icon('plus', 16)} Add questions</button>` : '' });
    if (missing(r)) return AX.set(ctx.el, setupBox());
    if (!r || !r.ok) { AX.set(ctx.el, UI.errorBox(r || {})); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    const items = r.items || [], today = r.today, days = [...new Set(items.map(x => x.day))].sort().reverse();
    const up = days.filter(d => d >= today).reverse(), past = days.filter(d => d < today);
    const todayN = items.filter(x => x.day === today).length;
    const card = d => { const L = items.filter(x => x.day === d), subs = [...new Set(L.map(x => x.s))];
      return h`<section class="card pad0 qd-day ${d === today ? 'now' : ''}"><div class="qd-dh"><div class="grow"><b>${dayName(d, today)}</b><div class="xs mut">${fmt.plural(L.length, 'question')} · ${subs.map(subName).join(', ')}</div></div>${can() ? h`<button class="btn xs soft" data-act="add" data-day="${d}">${icon('plus', 13)} Add</button>` : ''}</div>
        <div class="list">${join(L, x => h`<div class="li qd-row"><span class="pill info">${subName(x.s)}</span>
          <div class="grow"><div class="t qd-q">${x.q}</div><div class="s">${[chapName(x.s, x.c), 'Right answer ' + 'ABCD'[x.a], x.n ? fmt.plural(x.n, 'answer') + ' · ' + Math.round(x.r * 100 / x.n) + '% right' : 'No answers yet'].filter(Boolean).join(' · ')}</div>
            <div class="row wrap gap6">${x.held ? UI.pill('Hidden: live test, waits for its result', 'warn') : ''}${x.pic ? UI.pill('Has a picture: students do not see it', 'bad') : ''}${x.on ? '' : UI.pill('Switched off in the bank', 'bad')}</div></div>
          ${can() ? h`<button class="ibtn sm" data-act="move" data-id="${x.id}" data-day="${x.day}" aria-label="Move to another day" title="Move to another day">${icon('calendar', 16)}</button><button class="ibtn sm" data-act="remove" data-id="${x.id}" aria-label="Take off" title="Take off">${icon('trash', 16)}</button>` : ''}</div>`)}</div></section>`; };
    AX.set(ctx.el, h`<div class="callout ${todayN ? 'ok' : 'info'}">${icon(todayN ? 'check' : 'info')}<div class="sm">${todayN ? h`<b>Today has ${fmt.plural(todayN, 'question')}.</b> Students see them as story circles on Home.` : h`<b>Nothing is set for today.</b> Students see no stories. ${can() ? 'Tap “Add questions”.' : ''}`}
        The day changes at midnight, India time. A student can answer a question once; the right answer and explanation show after they answer.</div></div>
      ${!days.length ? h`<div class="card mt16">${UI.empty({ icon: 'target', title: 'No questions on any day yet', text: 'Pick questions from the Question bank. Write new ones there first.', action: can() ? h`<button class="btn pri" data-act="add" data-day="${today}">${icon('plus', 16)} Add questions</button>` : '' })}</div>` : ''}
      ${up.length ? h`<div class="mt16">${join(up, card)}</div>` : ''}
      ${past.length ? h`<h3 class="mt24 qd-h">Earlier</h3><div>${join(past, card)}</div>` : ''}`);
    AX.act(ctx.el, { retry: () => ctx.reload() });
    const ph = document.getElementById('ax-ph');
    const A = {
      add: el => addModal(el.dataset.day || today, today),
      move: el => moveModal(el.dataset.id, el.dataset.day, today),
      async remove(el) { if (!(await UI.confirm({ title: 'Take this question off the day?', text: 'Students’ answers to it are removed too. The question stays in the Question bank.', yes: 'Take off', tone: 'danger' }))) return;
        const x = await call('remove', { id: el.dataset.id }); if (!x.ok) return UI.err(x); changed('Taken off'); }
    };
    AX.act(ctx.el, A); if (ph) AX.act(ph, A);
  }
});

function moveModal(id, day, today) {
  UI.modal({ title: 'Move to another day', size: 'narrow',
    body: h`<div class="fld"><label for="qm-d">Day</label><input class="inp" id="qm-d" type="date" value="${day}" min="${addDays(today, -1)}" max="${addDays(today, 365)}"></div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go">${icon('check', 16)} Move</button>`,
    onOpen(m, close) { AX.act(m, { async go(b) { const d = m.querySelector('#qm-d').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return UI.toast('Pick a day', { tone: 'warn' });
      await UI.busy(b, async () => { const x = await call('move', { id, date: d }); if (!x.ok) return UI.toast(x.error === 'exists' ? 'This question is already on that day' : x.error === 'full' ? 'That day already has 40 questions' : 'Could not move it', { tone: 'warn' }); close(true); changed('Moved'); }); } }); } });
}

// pick questions from the Question bank (search + subject), then put them on a day
function addModal(day, today) {
  const sel = new Set(); let f = { s: '', q: '' }, page = 0, rows = [], total = 0, busy = false;
  const body = () => h`<div class="fld"><label for="qa-d">Show on</label><div class="row gap8 wrap"><input class="inp" id="qa-d" type="date" value="${day}" min="${addDays(today, -1)}" max="${addDays(today, 365)}" style="width:auto">
      <button class="btn xs ghost" data-act="dayTo" data-d="${today}">Today</button><button class="btn xs ghost" data-act="dayTo" data-d="${addDays(today, 1)}">Tomorrow</button></div></div>
    <div class="row gap8 wrap mt12"><div class="inp-wrap search grow">${icon('search', 16)}<input class="inp sm" id="qa-q" type="search" placeholder="Search the Question bank…" value="${f.q}" autocomplete="off"></div>
      <select class="inp sm" id="qa-s" aria-label="Subject" style="width:auto"><option value="">All subjects</option>${join(SUBS(), x => h`<option value="${x.id}" ${x.id === f.s ? raw('selected') : ''}>${x.name}</option>`)}</select></div>
    <div id="qa-l" class="mt12"></div>`;
  const list = m => {
    const L = m.querySelector('#qa-l');
    AX.set(L, rows.length ? h`<div class="card pad0 list qa-list">${join(rows, x => h`<label class="li qa-r ${x.img ? 'off' : ''}"><input type="checkbox" data-id="${x.id}" ${sel.has(x.id) ? raw('checked') : ''} ${x.img ? raw('disabled') : ''}>
        <span class="pill info">${subName(x.s)}</span><span class="grow"><span class="t qd-q">${x.q}</span><span class="s">${[chapName(x.s, x.c), x.img ? 'Has a picture: cannot be used' : '', x.src && /^test:/.test(x.src) ? 'From a test' : ''].filter(Boolean).join(' · ')}</span></span></label>`)}</div>
      ${rows.length < total ? h`<div class="row center mt12"><button class="btn sm" data-act="more">Show more · ${total - rows.length} left</button></div>` : ''}`
      : h`<div class="card">${UI.empty({ icon: 'db', title: busy ? 'Loading…' : 'No questions found', text: busy ? '' : 'The Question bank has nothing for this search. Write new questions on the Question bank page.' })}</div>`);
    const n = m.querySelector('#qa-go'); if (n) { n.disabled = !sel.size; n.querySelector('span').textContent = sel.size ? 'Add ' + fmt.plural(sel.size, 'question') : 'Add'; }
  };
  const fetchRows = async (m, more) => {
    busy = true; if (!more) { rows = []; page = 0; list(m); }
    const r = await bank('list', { f: f.s ? { s: [f.s] } : {}, q: f.q, on: true, page }); busy = false;
    if (!r.ok) { AX.set(m.querySelector('#qa-l'), UI.errorBox(r)); return; }
    total = r.total || 0; rows = rows.concat(r.items || []); list(m);
  };
  UI.modal({ title: 'Add questions to a day', sub: 'Pick from the Question bank. Only text questions work as stories.', size: 'lg', body: body(),
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" id="qa-go" data-act="go" disabled>${icon('check', 16)}<span>Add</span></button>`,
    onOpen(m, close) {
      fetchRows(m);
      const go = AX.u.debounce(() => { f.q = m.querySelector('#qa-q').value.trim(); fetchRows(m); }, 300);
      m.querySelector('#qa-q').addEventListener('input', go);
      m.querySelector('#qa-s').addEventListener('change', e => { f.s = e.target.value; fetchRows(m); });
      m.addEventListener('change', e => { const c = e.target.closest('input[data-id]'); if (!c) return; c.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id); list(m); });
      AX.act(m, {
        dayTo: b => { m.querySelector('#qa-d').value = b.dataset.d; },
        more: async () => { page++; await fetchRows(m, true); },
        async go(b) { const d = m.querySelector('#qa-d').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return UI.toast('Pick a day', { tone: 'warn' });
          await UI.busy(b, async () => { const x = await call('add', { date: d, ids: [...sel] });
            if (!x.ok) return UI.toast(x.error === 'full' ? 'That day is full (40 questions)' + (x.added ? ' · ' + x.added + ' added' : '') : x.error === 'date' ? 'Pick today or a later day' : 'Could not add', { tone: 'warn', ms: 5000 });
            const bits = [x.skipped ? x.skipped + ' skipped (already there or switched off)' : '', x.pic ? x.pic + ' with a picture' : '', x.held ? x.held + ' held back (live test)' : ''].filter(Boolean);
            close(true); changed('Added ' + x.added + (bits.length ? ' · ' + bits.join(' · ') : '')); });
        }
      });
    } });
}

AX.css('qotd', `
.qd-day{margin-top:14px}
.qd-day.now{border-color:var(--pri-line)}
.qd-dh{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line);background:var(--solid-2)}
.qd-h{font-size:14px;font-weight:700;color:var(--mut)}
.qd-row{align-items:flex-start}
.qd-q{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;white-space:normal}
.qa-list{max-height:min(52vh,480px);overflow:auto}
.qa-r{display:flex;align-items:flex-start;gap:10px;cursor:pointer;border-top:1px solid var(--line);padding:10px 14px}
.qa-r:first-child{border-top:0}
.qa-r.off{opacity:.5;cursor:default}
.qa-r .t,.qa-r .s{display:block}
.qa-r input{margin-top:3px;flex:none}
`);
})();
