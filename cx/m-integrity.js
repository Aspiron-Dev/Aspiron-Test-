/* =====================================================================
   Integrity: results tagged as cheating (🚩 on the leaderboard, moved to last place) and account suspensions.
   Server: cbt_admin_cheat (supabase_v24_cheating.sql / v27). Every call first lifts expired suspensions.
   Other modules use AX.integrity: report(result), suspend(mobile, name, testTitle), lift(mobile, name),
   isFlagged(mobile, testId), isSuspended(mobile), panel(el, student).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('integrity', 'manage');
const CH = { flags: [], suspended: [], ok: false };
const DUR = [{ value: '', label: 'Until I lift it' }, { value: '24', label: '24 hours' }, { value: '72', label: '3 days' }, { value: '168', label: '7 days' }, { value: '720', label: '30 days' }];
const errText = r => r.error === 'missing' ? 'Run supabase_v24_cheating.sql in Supabase first' : r.error === 'student' ? 'Student not found' : AX.errText(r);
async function load(force) {
  return AX.cache.get('integrity', async () => { const r = await AX.api.call('cbt_admin_cheat', 'get'); if (r.ok) { CH.flags = r.flags || []; CH.suspended = r.suspended || []; CH.ok = true; } return r; }, 20000, force);
}
const changed = () => { AX.cache.drop('integrity'); AX.cache.drop('students'); AX.emit('data:changed'); AX.emit('integrity:changed'); };
const testTitle = async id => { const c = await AX.data.catalog(); return ((c.ok && c.tests) || []).find(t => t.id === id)?.title || 'Test'; };
const defaultMsg = t => `You were found cheating in the test "${t}". Your ID is suspended. Talk to the support team within 24 hours to solve this.`;
const susFields = (t) => h`${AX.f.select({ name: 'hours', label: 'How long', value: '', options: DUR })}${AX.f.textarea({ name: 'reason', label: 'Message the student sees', value: defaultMsg(t || 'this test'), max: 500, rows: 4 })}`;

const API = AX.integrity = {
  load, isFlagged: (m, t) => CH.flags.some(f => f.mobile === m && f.test_id === t), isSuspended: m => CH.suspended.find(s => s.mobile === m) || null,
  // r = a results row {id, student, mobile, test_id, title, score, max}
  async report(r) {
    const x = await load(); if (!x.ok) return UI.toast(errText(x), { tone: 'bad' });
    if (!r.test_id) return UI.toast('This result has no test id. Rename duplicate tests and try again.', { tone: 'warn' });
    const flagged = API.isFlagged(r.mobile, r.test_id), sus = API.isSuspended(r.mobile);
    UI.modal({ title: 'Report cheating', sub: r.student + ' · ' + fmt.mobile(r.mobile) + ' · ' + r.title + (r.max ? ' · ' + r.score + '/' + r.max : ''), size: 'narrow',
      body: flagged ? h`<div class="callout bad">${icon('flag')}<div class="sm">This result is already tagged as cheating.</div></div>`
        : h`<div class="callout warn">${icon('info')}<div class="sm">Everyone sees a <b>🚩 Cheating</b> tag next to this student on this test's leaderboard, and they move to the last place.</div></div>
          <form id="cf" class="col gap16 mt16">${AX.f.input({ name: 'note', label: 'Note (only for you)', max: 300, placeholder: 'e.g. Same answers as another student' })}
          ${sus ? UI.pill('Already suspended', 'bad') : h`${AX.f.switch({ name: 'sus', value: true, label: 'Also suspend this account', hint: 'The app shows a full-screen notice with a Support button until the time ends or you lift it.' })}<div id="cs" class="col gap16">${susFields(r.title)}</div>`}</form>`,
      foot: flagged ? h`<span class="sp"></span><button class="btn ghost" data-close>Close</button><button class="btn danger" data-act="unflag">Remove the cheating tag</button>`
        : h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn danger solid" data-act="save">${icon('flag', 15)} Mark as cheating</button>`,
      onOpen(el, close) {
        const f = el.querySelector('#cf');
        if (f) f.addEventListener('change', e => { if (e.target.name === 'sus') el.querySelector('#cs').classList.toggle('hide', !e.target.checked); });
        AX.act(el, {
          async unflag(b) { await UI.busy(b, async () => { const y = await AX.api.call('cbt_admin_cheat', 'unflag', { mobile: r.mobile, test_id: r.test_id }); if (!y.ok) return UI.toast(errText(y), { tone: 'bad' }); close(); changed(); UI.toast('Tag removed'); }); },
          async save(b) {
            const d = AX.f.read(f);
            await UI.busy(b, async () => {
              const y = await AX.api.call('cbt_admin_cheat', 'flag', { mobile: r.mobile, test_id: r.test_id, result_id: r.id, note: d.note || '' });
              if (!y.ok) return UI.toast(errText(y), { tone: 'bad' });
              if (d.sus && !sus) { const z = await AX.api.call('cbt_admin_cheat', 'suspend', { mobile: r.mobile, hours: d.hours || '', reason: (d.reason || '').trim() }); if (!z.ok) UI.toast('Marked, but could not suspend', { tone: 'warn' }); }
              close(); changed(); UI.toast('Marked as cheating');
            });
          }
        });
      } });
  },
  async suspend(mobile, name, tTitle) {
    UI.modal({ title: 'Suspend ' + (name || fmt.mobile(mobile)), sub: 'The app and website show a full-screen notice with a Support button instead of the tests. Nothing else is deleted.', size: 'narrow',
      body: h`<form id="sf" class="col gap16">${susFields(tTitle)}</form>`,
      foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn danger solid" data-act="go">${icon('ban', 15)} Suspend now</button>`,
      onOpen(el, close) { AX.act(el, { async go(b) { const d = AX.f.read(el.querySelector('#sf')); await UI.busy(b, async () => { const y = await AX.api.call('cbt_admin_cheat', 'suspend', { mobile, hours: d.hours || '', reason: (d.reason || '').trim() }); if (!y.ok) return UI.toast(errText(y), { tone: 'bad' }); close(); changed(); UI.toast('Suspended'); }); } }); } });
  },
  async lift(mobile, name) {
    if (!(await UI.confirm({ title: 'Lift the suspension?', text: (name || fmt.mobile(mobile)) + ' can use the app and website again at once. The notice goes away on their phone.', yes: 'Yes, lift it' }))) return false;
    const y = await AX.api.call('cbt_admin_cheat', 'lift', { mobile });
    if (!y.ok) { UI.toast(errText(y), { tone: 'bad' }); return false; }
    changed(); UI.toast('Suspension lifted'); return true;
  },
  // status card for a student's profile; s = {mobile, name}
  async panel(el, s) {
    const x = await load(); if (!el.isConnected) return;
    if (!x.ok) return AX.set(el, '');
    const sus = API.isSuspended(s.mobile), fl = CH.flags.filter(f => f.mobile === s.mobile);
    AX.set(el, h`<div class="card ${sus ? '' : 'flat'}" style="${sus ? 'border-color:color-mix(in srgb,var(--bad) 45%,transparent)' : ''}"><div class="row top">${icon(sus ? 'ban' : 'shield', 18)}<div class="grow">
        <b>${sus ? 'Suspended' : 'Not suspended'}</b><div class="sm mut">${sus ? (sus.until ? 'Until ' + fmt.dt(sus.until) : 'Until you lift it') + (sus.reason ? ' · ' + sus.reason : '') : 'Suspension blocks the app with a notice and a Support button (e.g. for cheating).'}</div>
        ${fl.length ? h`<div class="chips mt8">${join(fl, f => UI.pill('🚩 Cheating tag · ' + fmt.date(f.at), 'bad'))}</div>` : ''}</div>
        ${AX.can('integrity', 'manage') ? (sus ? h`<button class="btn sm" data-act="lift">Lift</button>` : h`<button class="btn sm danger" data-act="sus">Suspend…</button>`) : ''}</div></div>`);
    if (!el.__w) { el.__w = 1; AX.act(el, { lift: async () => { if (await API.lift(s.mobile, s.name)) API.panel(el, s); }, sus: () => API.suspend(s.mobile, s.name) }); }
    if (!el.__on) { el.__on = 1; const off = AX.on('integrity:changed', () => { if (el.isConnected) API.panel(el, s); else off(); }); }
  }
};

AX.mod({
  id: 'integrity', title: 'Integrity', icon: 'shieldCheck', group: 'Academics', order: 50, perm: 'integrity',
  sub: 'Cheating tags and suspensions.',
  async render(ctx) {
    ctx.head({ title: 'Integrity', sub: 'Report cheating from Results (🚩), suspend from here or from a student\'s profile. A suspended student sees a full-screen notice with a Support button until you lift it.' });
    AX.set(ctx.el, UI.skeleton(4));
    const [r, cat] = await Promise.all([load(true), AX.data.catalog()]);
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v24_cheating.sql once in Supabase → SQL Editor.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    const tt = id => ((cat.ok && cat.tests) || []).find(t => t.id === id)?.title || 'Test';
    AX.set(ctx.el, h`<div class="kpis">${UI.kpi({ label: 'Suspended now', value: CH.suspended.length, icon: 'ban', tone: 'bad' })}${UI.kpi({ label: 'Results tagged', value: CH.flags.length, icon: 'flag', tone: 'warn' })}${UI.kpi({ label: 'Students tagged', value: new Set(CH.flags.map(f => f.mobile)).size, icon: 'users' })}</div>
      <div class="section-t">Suspended now · ${CH.suspended.length}</div>
      <div class="col gap16">${CH.suspended.length ? join(CH.suspended, s => h`<div class="card row wrap" style="gap:14px;border-left:3px solid var(--bad)">${UI.avatar(s.name || 'Student', s.mobile)}<div class="grow"><b>${s.name || 'Student'}</b> <span class="xs mut">${fmt.mobile(s.mobile)}</span><div class="sm mut">Since ${fmt.dt(s.at)} · ${s.until ? 'until ' + fmt.dt(s.until) : 'until you lift it'}</div>${s.reason ? h`<p class="sm mt4">${s.reason}</p>` : ''}</div>
          <a class="btn sm" href="${AX.u.wa(s.mobile, 'Hi ' + String(s.name || '').split(' ')[0] + ', ')}" target="_blank" rel="noopener">${icon('whatsapp', 15)} WhatsApp</a>${can() ? h`<button class="btn sm soft" data-act="lift" data-m="${s.mobile}" data-n="${s.name || ''}">${icon('check', 15)} Lift suspension</button>` : ''}</div>`)
        : h`<div class="card">${UI.empty({ icon: 'checkCircle', title: 'Nobody is suspended' })}</div>`}</div>
      <div class="section-t">Results tagged as cheating · ${CH.flags.length}</div>
      <div class="card pad0 list">${CH.flags.length ? join(CH.flags, f => { const sus = API.isSuspended(f.mobile); return h`<div class="li"><span class="av sm" style="--c:#ef4444">${icon('flag', 14)}</span><div class="grow"><div class="t">${f.name || 'Student'} <span class="xs mut">${fmt.mobile(f.mobile)}</span></div><div class="s">${tt(f.test_id)} · ${fmt.dt(f.at)}${f.note ? ' · ' + f.note : ''}</div></div>
          ${sus ? UI.pill('Suspended', 'bad') : can() ? h`<button class="btn sm danger" data-act="sus" data-m="${f.mobile}" data-n="${f.name || ''}" data-t="${tt(f.test_id)}">Suspend</button>` : ''}${can() ? h`<button class="btn sm ghost" data-act="unflag" data-m="${f.mobile}" data-t="${f.test_id}">Remove tag</button>` : ''}</div>`; })
        : UI.empty({ icon: 'flag', title: 'No cheating reports', text: 'Tag a result from Results & analytics with the 🚩 button.' })}</div>`);
    AX.act(ctx.el, {
      retry: () => ctx.reload(),
      async lift(el) { if (await API.lift(el.dataset.m, el.dataset.n)) ctx.reload(); },
      sus: el => API.suspend(el.dataset.m, el.dataset.n, el.dataset.t),
      async unflag(el) {
        if (!(await UI.confirm({ title: 'Remove the cheating tag?', text: 'The 🚩 tag goes away and the student gets their real rank back on this test.', yes: 'Remove tag' }))) return;
        const y = await AX.api.call('cbt_admin_cheat', 'unflag', { mobile: el.dataset.m, test_id: el.dataset.t });
        if (!y.ok) return UI.toast(errText(y), { tone: 'bad' });
        changed(); UI.toast('Tag removed'); ctx.reload();
      }
    });
    const off = AX.on('integrity:changed', () => { if (ctx.alive()) ctx.reload(); else off(); });
  },
  async attention() {
    const r = await load(); if (!r.ok) return [];
    return CH.suspended.length ? [{ title: 'Students suspended', sub: 'Lift when the matter is solved', count: CH.suspended.length, go: '#/integrity', icon: 'ban', tone: 'gold' }] : [];
  }
});
})();
