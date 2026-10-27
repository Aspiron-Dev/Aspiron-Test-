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
        ${!AX.session.legacy ? h`<div class="card" id="st-2fa"><div class="card-h">${icon('shieldCheck')}<h3>Two-step sign-in</h3></div>${UI.skeleton(2)}</div>` : ''}
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
        UI.modal({ title: 'Install as an app', size: 'narrow', body: h`<ol class="sm tx2" style="line-height:1.9;padding-left:18px;margin:0"><li>Android (Chrome): menu <b>⋮</b> → <b>Add to Home screen</b> / <b>Install app</b>.</li><li>Phone says <b>“Could not open app”</b>? Remove the old icon (long-press → <b>Uninstall</b>), refresh this page and install again. Still failing? Use <b>⋮</b> → <b>Add to Home screen</b> → <b>Create shortcut</b>: it opens in Chrome and always works.</li><li>iPhone (Safari): <b>Share</b> → <b>Add to Home Screen</b>.</li><li>Computer (Chrome / Edge): the install icon in the address bar.</li></ol>` });
      },
      out() { AX.signOut(); }
    });
    ctx.el.querySelector('[name=lock]').addEventListener('change', e => { AX.autoLock.set(e.target.checked); UI.toast(e.target.checked ? 'Will sign out after 15 minutes without use' : 'Stays signed in'); });
    if (!AX.session.legacy) tfaCard(ctx);
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
/* ---------- two-step sign-in (supabase_v35: cbt_admin_2fa) ---------- */
async function tfaCard(ctx) {
  const box = ctx.el.querySelector('#st-2fa'); if (!box) return;
  const r = await AX.api.call('cbt_admin_2fa', 'status');
  if (!ctx.alive()) return;
  const head = h`<div class="card-h">${icon('shieldCheck')}<h3>Two-step sign-in</h3><span class="grow"></span>${r.ok ? UI.pill(r.enabled ? 'On' : 'Off', r.enabled ? 'ok' : 'warn') : ''}</div>`;
  if (!r.ok) return AX.set(box, h`${head}<p class="sm mut">${r.error === 'missing' ? 'Run supabase_v35_admin_team.sql again in Supabase → SQL Editor to turn this on.' : AX.errText(r)}</p>`);
  AX.set(box, r.enabled
    ? h`${head}<p class="sm tx2">After the password, the console asks for the 6-digit code from your authenticator app. On since ${fmt.date(r.enabled_at)}.</p>
        <p class="sm ${r.recovery_left < 3 ? '' : 'mut'} mt8">${r.recovery_left} of 10 recovery codes left${r.recovery_left < 3 ? ' — make new ones.' : '.'}</p>
        <div class="row wrap mt12"><button class="btn sm" data-act="codes">${icon('key', 15)} New recovery codes</button><button class="btn sm ghost danger" data-act="off">Turn off</button></div>`
    : h`${head}<p class="sm tx2">Turn this on so that a password alone is not enough: after the password, the console asks for a 6-digit code from a free app on your phone (Google Authenticator or Microsoft Authenticator). Someone who learns the password still cannot get in.</p>
        <button class="btn pri sm mt12" data-act="on">${icon('shieldCheck', 15)} Turn on</button>`);
  if (!box.__w) { box.__w = 1; AX.act(box, { on: () => tfaSetup(ctx), off: () => tfaOff(ctx), codes: () => tfaCodes(ctx) }); }
}
function showCodes(api, codes, done) {
  const txt = 'Aspiron Control — recovery codes (each works once)\n\n' + codes.map(c => c.slice(0, 5) + '-' + c.slice(5)).join('\n');
  api.set(h`<div class="callout gold">${icon('info')}<div class="sm"><b>Save these recovery codes now.</b> If you lose your phone, each code signs you in once instead of the 6-digit code. They are shown only this one time.</div></div>
    <div class="well mono mt16" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:15px">${join(codes, c => h`<span>${c.slice(0, 5)}-${c.slice(5)}</span>`)}</div>`);
  api.foot(h`<button class="btn" data-act="copy">${icon('copy', 16)} Copy</button><button class="btn" data-act="dl">${icon('download', 16)} Download</button><span class="sp"></span><button class="btn pri" data-act="done">${icon('check', 16)} I saved them</button>`);
  AX.act(api.el, { async copy() { if (await AX.u.copy(txt)) UI.toast('Copied'); }, dl() { AX.u.download('aspiron-recovery-codes.txt', txt); }, done() { api.close(); done && done(); } });
}
function tfaSetup(ctx) {
  UI.modal({ title: 'Turn on two-step sign-in', size: 'narrow', sticky: true,
    body: h`<form id="t1" class="col gap16" autocomplete="off"><p class="sm tx2">First confirm it is you.</p>${AX.f.input({ name: 'password', label: 'Your password', type: 'password', auto: 'current-password' })}</form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="next">Continue</button>`,
    onOpen(el, close, api) {
      UI.wire(el);
      let sec = null;
      AX.act(el, {
        async next(btn) {
          const f = el.querySelector('#t1'); AX.f.clearErrors(f); const d = AX.f.read(f);
          if (!d.password) return AX.f.error(f, 'password', 'Enter your password');
          await UI.busy(btn, async () => {
            const r = await AX.api.call('cbt_admin_2fa', 'start', { password: d.password });
            if (!r.ok) return r.error === 'current_pw' ? AX.f.error(f, 'password', 'The password is wrong') : UI.err(r);
            sec = r;
            let qr = '';
            try { const q = qrcode(0, 'M'); q.addData(r.uri); q.make(); qr = q.createSvgTag(4, 8); } catch (e) {}
            api.set(h`<form id="t2" class="col gap16" autocomplete="off">
              <ol class="sm tx2" style="margin:0;padding-left:18px;line-height:1.8"><li>Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone (free).</li><li>In the app tap <b>+</b> → <b>Scan a QR code</b> and scan this. On the same phone? Choose <b>Enter a setup key</b> and paste the key.</li><li>Type the 6-digit code the app shows.</li></ol>
              ${qr ? h`<div style="display:flex;justify-content:center"><div style="background:#fff;padding:6px;border-radius:12px;line-height:0">${AX.raw(qr)}</div></div>` : ''}
              <div class="row wrap" style="justify-content:center"><span class="mono sm" style="word-break:break-all">${r.secret.replace(/(.{4})/g, '$1 ').trim()}</span>${UI.copyBtn(r.secret, 'Copy key')}</div>
              ${AX.f.input({ name: 'code', label: '6-digit code from the app', inputmode: 'numeric', auto: 'one-time-code', max: 7, placeholder: '123456' })}</form>`);
            api.foot(h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="confirm">${icon('check', 16)} Turn on</button>`);
            UI.wire(api.body);
          });
        },
        async confirm(btn) {
          const f = el.querySelector('#t2'); AX.f.clearErrors(f); const code = String(AX.f.read(f).code || '').replace(/\s/g, '');
          if (!/^\d{6}$/.test(code)) return AX.f.error(f, 'code', 'Type the 6 digits from the app');
          await UI.busy(btn, async () => {
            const r = await AX.api.call('cbt_admin_2fa', 'confirm', { code });
            if (!r.ok) return r.error === 'otp_invalid' ? AX.f.error(f, 'code', 'Wrong code. Type the newest code in the app (and check the time on your phone).') : UI.err(r);
            UI.toast('Two-step sign-in is on' + (r.signed_out ? '. Your other devices were signed out.' : ''));
            showCodes(api, r.codes || [], () => ctx.alive() && tfaCard(ctx));
          });
        }
      });
    } });
}
function tfaOff(ctx) {
  UI.modal({ title: 'Turn off two-step sign-in?', size: 'narrow',
    body: h`<form id="t3" class="col gap16" autocomplete="off"><div class="callout warn">${icon('info')}<div class="sm">Then the password alone opens the console again. Keep it on unless you have a good reason.</div></div>
      ${AX.f.input({ name: 'password', label: 'Your password', type: 'password', auto: 'current-password' })}${AX.f.input({ name: 'code', label: '6-digit code (or a recovery code)', auto: 'one-time-code', max: 11 })}</form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-act="go">Turn off</button>`,
    onOpen(el, close) {
      UI.wire(el);
      AX.act(el, { async go(btn) {
        const f = el.querySelector('#t3'); AX.f.clearErrors(f); const d = AX.f.read(f);
        if (!d.password) return AX.f.error(f, 'password', 'Enter your password');
        if (!d.code) return AX.f.error(f, 'code', 'Enter the code');
        await UI.busy(btn, async () => {
          const r = await AX.api.call('cbt_admin_2fa', 'off', { password: d.password, code: d.code });
          if (!r.ok) return r.error === 'current_pw' ? AX.f.error(f, 'password', 'The password is wrong') : r.error === 'otp_invalid' ? AX.f.error(f, 'code', 'Wrong code') : UI.err(r);
          close(); UI.toast('Two-step sign-in is off', { tone: 'warn' }); if (ctx.alive()) tfaCard(ctx);
        });
      } });
    } });
}
function tfaCodes(ctx) {
  UI.modal({ title: 'New recovery codes', size: 'narrow', sticky: true,
    body: h`<form id="t4" class="col gap16" autocomplete="off"><p class="sm tx2">The old recovery codes stop working.</p>${AX.f.input({ name: 'code', label: '6-digit code from the app', inputmode: 'numeric', auto: 'one-time-code', max: 7 })}</form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="go">Make new codes</button>`,
    onOpen(el, close, api) {
      UI.wire(el);
      AX.act(el, { async go(btn) {
        const f = el.querySelector('#t4'); AX.f.clearErrors(f); const code = String(AX.f.read(f).code || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(code)) return AX.f.error(f, 'code', 'Type the 6 digits from the app');
        await UI.busy(btn, async () => {
          const r = await AX.api.call('cbt_admin_2fa', 'recovery', { code });
          if (!r.ok) return r.error === 'otp_invalid' ? AX.f.error(f, 'code', 'Wrong code') : UI.err(r);
          showCodes(api, r.codes || [], () => ctx.alive() && tfaCard(ctx));
        });
      } });
    } });
}
AX.actions.push({ label: 'Switch light / dark theme', icon: 'sun', run() { AX.theme.toggle(); AX.redrawNav(); } });
AX.actions.push({ label: 'Sign out', icon: 'logout', run() { AX.signOut(); } });
})();
