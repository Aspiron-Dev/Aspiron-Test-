/* =====================================================================
   Settings: appearance, this device (install as app), database storage, backup panel, shortcuts, sign out
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

AX.mod({
  id: 'settings', title: 'Settings', icon: 'settings', group: 'Workspace', order: 20, perm: 'any',
  sub: 'Appearance, this device and the database.',
  async render(ctx) {
    ctx.head({ title: 'Settings', sub: 'Appearance, this device and the database.' });
    const me = AX.session.me || {};
    const standalone = matchMedia('(display-mode: standalone)').matches;
    AX.set(ctx.el, h`<div class="grid g2" style="align-items:start">
      <div class="col gap16">
        <div class="card"><div class="card-h">${icon('sun')}<h3>Appearance</h3></div>
          <div class="seg" style="width:100%" data-act="theme">${join([['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']], ([v, l, i]) => h`<button type="button" data-v="${v}" class="${AX.theme.get() === v ? 'on' : ''}" style="flex:1">${icon(i, 15)} ${l}</button>`)}</div>
          <p class="xs mut mt8">Saved on this device only.</p></div>
        <div class="card"><div class="card-h">${icon('smartphone')}<h3>This device</h3></div>
          <dl class="kv"><dt>Signed in as</dt><dd>${me.name || 'Owner'}${me.owner ? ' (owner)' : ' (@' + me.username + ')'}</dd><dt>Device</dt><dd>${AX.u.device()}</dd><dt>Sign-in</dt><dd>${AX.session.legacy ? 'Password, this tab only' : AX.ls.get('cx_tok', null) ? 'Kept on this device' : 'Until this tab closes'}</dd></dl>
          <div class="mt16">${AX.f.switch({ name: 'lock', value: AX.autoLock && AX.autoLock.get(), label: 'Sign out after 15 minutes without use', hint: 'Recommended on a shared or office computer.' })}</div>
          <div class="row wrap mt16">${!standalone ? h`<button class="btn sm" data-act="install">${icon('download', 15)} Install as an app</button>` : UI.pill('Installed as an app', 'ok')}<button class="btn sm danger" data-act="out">${icon('logout', 15)} Sign out</button></div></div>
        <div class="card"><div class="card-h">${icon('zap')}<h3>Shortcuts</h3></div>
          <dl class="kv"><dt><span class="kbd">Ctrl K</span> or <span class="kbd">/</span></dt><dd>Search everything and run commands</dd><dt><span class="kbd">Esc</span></dt><dd>Close a window</dd><dt><span class="kbd">+</span> button</dt><dd>Create a student, test, payment…</dd></dl></div>
      </div>
      <div class="col gap16">
        <div class="card" id="st-db"><div class="card-h">${icon('db')}<h3>Database storage</h3></div>${UI.skeleton(3)}</div>
        ${me.owner ? h`<div class="card"><div class="card-h">${icon('history')}<h3>Backup panel</h3></div><p class="sm tx2">The previous admin panel is kept for a short time as a backup, in case you need something quickly. It uses the owner password.</p><a class="btn sm mt12" href="cp-dt764twzf54s5m-old.html" target="_blank" rel="noopener">${icon('external', 15)} Open backup panel</a></div>` : ''}
        <div class="card"><div class="card-h">${icon('globe')}<h3>Links</h3></div><div class="col gap6">
          <a class="btn sm ghost" style="justify-content:flex-start" href="index.html" target="_blank" rel="noopener">${icon('external', 15)} Student website / app</a>
          <a class="btn sm ghost" style="justify-content:flex-start" href="store.html" target="_blank" rel="noopener">${icon('store', 15)} Store</a></div></div>
      </div></div>`);
    AX.act(ctx.el, {
      theme(el, e) { const b = e.target.closest('button'); if (!b) return; AX.theme.set(b.dataset.v); el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); AX.redrawNav(); },
      async install() {
        if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') UI.toast('Installed'); return; }
        UI.modal({ title: 'Install as an app', size: 'narrow', body: h`<ol class="sm tx2" style="line-height:1.9;padding-left:18px;margin:0"><li>Android (Chrome): menu <b>⋮</b> → <b>Add to Home screen</b> / <b>Install app</b>.</li><li>iPhone (Safari): <b>Share</b> → <b>Add to Home Screen</b>.</li><li>Computer (Chrome / Edge): the install icon in the address bar.</li></ol>` });
      },
      out() { AX.signOut(); }
    });
    ctx.el.querySelector('[name=lock]').addEventListener('change', e => { AX.autoLock.set(e.target.checked); UI.toast(e.target.checked ? 'Will sign out after 15 minutes without use' : 'Stays signed in'); });
    const r = await AX.api.admin('usage');
    if (!ctx.alive()) return;
    const box = ctx.el.querySelector('#st-db');
    if (!r.ok) return AX.set(box, h`<div class="card-h">${icon('db')}<h3>Database storage</h3></div><p class="sm mut">${AX.errText(r)}</p>`);
    const lim = r.limit_bytes || 524288000, used = r.db_bytes || 0, pc = Math.min(100, Math.round(used * 100 / lim));
    const parts = [['Tests & questions', r.tests_bytes, '#14b8a6'], ['Files (PDFs)', r.files_bytes, '#6366f1'], ['Covers', r.covers_bytes, '#c9a45c'], ['Results', r.results_bytes, '#0ea5e9']];
    AX.set(box, h`<div class="card-h">${icon('db')}<h3>Database storage</h3><span class="grow"></span>${UI.pill(pc + '% used', pc > 85 ? 'bad' : pc > 65 ? 'warn' : 'ok')}</div>
      <div class="row wrap" style="gap:18px;align-items:center">${UI.chart.donut(parts.map(p => ({ label: p[0], value: p[1] || 0, color: p[2] })), { center: pc + '%', sub: 'of ' + fmt.bytes(lim), size: 128 })}
        <div class="col gap6 grow" style="min-width:180px">${join(parts, p => h`<div class="row sm"><i style="width:10px;height:10px;border-radius:3px;background:${p[2]};display:inline-block"></i><span class="grow tx2">${p[0]}</span><b class="num">${fmt.bytes(p[1] || 0)}</b></div>`)}</div></div>
      <div class="divider"></div>
      <div class="row wrap sm mut"><span>${fmt.num(r.students)} students</span>·<span>${fmt.num(r.tests)} tests</span>·<span>${fmt.num(r.results)} results</span>·<span>${fmt.bytes(used)} of ${fmt.bytes(lim)}</span></div>`);
  }
});
AX.actions.push({ label: 'Switch light / dark theme', icon: 'sun', run() { AX.theme.toggle(); AX.redrawNav(); } });
AX.actions.push({ label: 'Sign out', icon: 'logout', run() { AX.signOut(); } });
})();
