/* =====================================================================
   Aspiron Control — shell
   sign-in · layout (sidebar / top bar / phone tab bar) · router · command palette · attention centre
   session heartbeat · quick create · profile menu
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI } = AX;
const S = AX.session;
const GROUPS = ['', 'Students & accounts', 'Tests & questions', 'Analytics', 'Content & storage', 'Sales & billing', 'Communication', 'Costs & integrations', 'Team & security'];
let ATT = [], ATT_AT = 0, CUR = null, ROUTE_N = 0;

/* ---------- owner profile (supabase_v72_owner_profile.sql): name, mobile, e-mail the owner typed in ---------- */
let PROF = null;
const applyProf = () => { if (PROF && PROF.name && S.me && S.me.owner) S.me.name = PROF.name; };
async function loadProf() {
  if (S.legacy || !AX.isOwner()) return;
  const r = await AX.api.call('cbt_admin_profile', 'get');
  if (r.ok) { PROF = r; applyProf(); drawNav(); const b = document.getElementById('ax-prof'); if (b) AX.set(b, UI.avatar(S.me.name || 'Owner', 'owner', 'sm')); }
}

/* ---------- boot ---------- */
AX.boot = async () => {
  // v13 redesign: light is the new default; a theme saved automatically by the old version is reset once
  if (!AX.ls.get('cx_th2', null)) { AX.ls.del('cx_theme'); AX.ls.set('cx_th2', 1); }
  AX.theme.set(AX.ls.get('cx_theme', 'light'));
  if (!AX.url) { document.body.innerHTML = '<p style="padding:24px">config.js is missing.</p>'; return; }
  if (!S.load()) return login();
  splash();
  const r = await check();
  if (r.ok) return start();
  // only a real sign-in problem forgets the session; no internet or a server hiccup keeps it for the next try
  if (['invalid', 'signed_out', 'expired', 'disabled', 'not_set', 'locked', 'need_2fa'].includes(r.error)) { S.clear(); return login(r.error); }
  return offline(r);
};
function splash() {
  document.body.innerHTML = AX.html(h`<div class="lg-wrap"><div class="col" style="align-items:center;gap:18px"><div class="lg-mark"><img src="admin-icon-192.png" alt="Aspiron" width="56" height="56"></div><span class="spin" style="color:var(--pri)"></span></div></div>`);
}
async function check() {
  if (S.legacy) return AX.api.admin('ping');
  const r = await AX.api.rpc('cbt_admin_me', {});
  if (r.ok) { S.me = r.me; S.id = r.session; S.save(!!AX.ls.get('cx_tok', null)); }
  return r;
}

/* ---------- sign in ---------- */
const LOST = {
  signed_out: 'You were signed out. The owner may have ended this session, or it was signed out from another device.',
  expired: 'Your sign-in expired after 30 days without use. Please sign in again.',
  disabled: 'This team account has been paused by the owner.',
  need_2fa: 'Two-step sign-in is on. Sign in with your password and the code from your authenticator app.',
  invalid: 'Please sign in again.', network: 'No internet connection. Check it and try again.', locked: 'Too many wrong attempts. Try again in 15 minutes.'
};
function login(reason) {
  UI.closeAll(); window.onhashchange = null;
  const mode = AX.ls.get('cx_lmode', 'owner');
  document.body.innerHTML = AX.html(h`<div class="lg-wrap"><aside class="lg-side" aria-hidden="true"><div class="in"><img src="admin-icon-192.png" alt="" width="56" height="56">
    <h2>Run Aspiron from one place.</h2><p>Tests, students, orders, storage and costs — on your phone or computer.</p>
    <ul><li>${icon('shield')} Two-step sign-in and private page key</li><li>${icon('history')} Every change is written to the activity log</li><li>${icon('lock')} Permissions checked on the server</li></ul></div></aside><form class="lg-card glass" id="lg" autocomplete="on" novalidate>
    <div class="lg-mark"><img src="admin-icon-192.png" alt="Aspiron" width="56" height="56"></div>
    <div class="lg-t">Aspiron Control</div>
    <div class="lg-s">Sign in to the admin console</div>
    ${reason && LOST[reason] ? h`<div class="callout warn mt16">${icon('info')}<div>${LOST[reason]}</div></div>` : ''}
    <div class="seg mt24" style="width:100%" id="lgm"><button type="button" data-m="owner" class="${mode === 'owner' ? 'on' : ''}" style="flex:1">${icon('crown', 15)} Owner</button><button type="button" data-m="team" class="${mode === 'team' ? 'on' : ''}" style="flex:1">${icon('team', 15)} Team member</button></div>
    <div class="col gap16 mt16">
      <div class="fld ${mode === 'owner' ? 'hide' : ''}" id="lgu"><label for="lg-u">Username</label><div class="inp-wrap">${icon('user')}<input class="inp" id="lg-u" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. ravi.k"></div></div>
      <div class="fld"><label for="lg-p">Password</label><div class="inp-wrap">${icon('key')}<input class="inp" id="lg-p" name="p" type="password" autocomplete="current-password" placeholder="Your password" style="padding-right:46px"><button type="button" class="ibtn sm suffix" data-eye aria-label="Show password">${icon('eye', 17)}</button></div></div>
      <div class="fld hide" id="lgo"><label for="lg-o">Code from your authenticator app</label><div class="inp-wrap">${icon('shield')}<input class="inp mono" id="lg-o" inputmode="numeric" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" maxlength="11" placeholder="6-digit code"></div><div class="hint">Lost your phone? Type one of your recovery codes instead.</div></div>
      <label class="check"><input type="checkbox" id="lg-r" checked><span>Keep me signed in on this device<span class="xs mut" style="display:block">You can sign this device out any time from Team & access.</span></span></label>
      <div class="err sm" id="lg-e" role="alert" style="min-height:20px;color:var(--bad);font-weight:650"></div>
      <button class="btn pri lg block" id="lg-go" type="submit">${icon('arrowR')} Sign in</button>
    </div>
    <div class="lg-foot">${icon('lock', 14)}<span>Protected session · every change is logged</span></div>
  </form></div>`);
  const f = document.getElementById('lg'); UI.wire(f);
  let m = mode;
  f.querySelector('#lgm').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return; m = b.dataset.m; AX.ls.set('cx_lmode', m);
    f.querySelectorAll('#lgm button').forEach(x => x.classList.toggle('on', x === b));
    f.querySelector('#lgu').classList.toggle('hide', m === 'owner'); f.querySelector('#lgo').classList.add('hide'); f.querySelector('#lg-o').value = ''; (m === 'owner' ? f.querySelector('#lg-p') : f.querySelector('#lg-u')).focus();
  });
  setTimeout(() => (m === 'owner' ? f.querySelector('#lg-p') : f.querySelector('#lg-u')).focus(), 50);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const u = m === 'team' ? f.querySelector('#lg-u').value.trim() : '', p = f.querySelector('#lg-p').value, er = f.querySelector('#lg-e');
    er.textContent = '';
    if (m === 'team' && !u) { er.textContent = 'Enter your username.'; return; }
    if (!p) { er.textContent = 'Enter the password.'; return; }
    await UI.busy(f.querySelector('#lg-go'), async () => {
      const o = f.querySelector('#lg-o').value.trim(), args = { p_user: u, p_pw: p, p_device: AX.u.device(), p_gate: (() => { try { return localStorage.getItem('adm_k') || ''; } catch (e) { return ''; } })() };   // v62: the page key, checked by the database too
      if (o) args.p_otp = o;           // only sent once the server asked for it (older databases do not know it)
      let r = await AX.api.rpc('cbt_admin_login', args, { auth: false });
      if (r.error === 'missing') {
        // the database is not updated yet (supabase_v35_admin_team.sql): the owner can still sign in the old way
        if (m === 'team') { er.textContent = 'Team accounts are not set up yet. The owner must run supabase_v35_admin_team.sql in Supabase.'; return; }
        const c = await AX.api.rpc('cbt_admin', { p_pw: p, p_action: 'ping', p_data: {} }, { auth: false });
        if (!c.ok) { er.textContent = c.error === 'not_set' ? 'The admin password is not set yet. In Supabase → SQL Editor run: select cbt_private.set_admin_password(\'your-password\');' : AX.errText(c); return; }
        S.token = p; S.legacy = true; S.me = { owner: true, name: 'Owner', perms: {} }; S.save(false);
        return start();
      }
      if (r.error === 'gate') { er.textContent = 'This phone does not have the admin key. Open the panel once from your private link (the one with #k=…), then sign in.'; return; }
      if (['otp_required', 'otp_invalid', 'otp_locked'].includes(r.error)) {
        const of = f.querySelector('#lg-o');
        f.querySelector('#lgo').classList.remove('hide');
        er.textContent = r.error === 'otp_required' ? 'Enter the 6-digit code from your authenticator app.'
          : r.error === 'otp_invalid' ? 'Wrong code. Use the newest code in the app (and check the time on your phone).'
          : 'Too many wrong codes. Try again in 15 minutes.';
        of.value = ''; of.focus(); return;
      }
      if (!r.ok) {
        er.textContent = r.error === 'invalid' ? (m === 'team' ? 'Wrong username or password.' : 'Wrong password.')
          : r.error === 'locked' ? 'Too many wrong attempts. Try again in ' + (r.wait ? r.wait + ' min' : '15 minutes') + '.'
          : r.error === 'not_set' ? 'The admin password is not set yet. In Supabase → SQL Editor run: select cbt_private.set_admin_password(\'your-password\');'
          : AX.errText(r);
        f.querySelector('#lg-p').select(); return;
      }
      const keep = f.querySelector('#lg-r').checked;
      S.token = r.token; S.legacy = false; S.me = r.me; S.save(keep);
      // "Keep me signed in" = no 15-minute auto sign-out on this device (it can be turned on again in Settings)
      AX.ls.set('cx_autolock', !keep); AX.ls.set('cx_al2', 1);
      start();
    });
  });
}
AX.on('auth:lost', reason => { if (!S.token) return; S.clear(); login(reason); });
function offline(r) {
  document.body.innerHTML = AX.html(h`<div class="lg-wrap"><div class="lg-card glass" style="text-align:center"><div class="lg-mark" style="margin:0 auto">${icon('globe')}</div>
    <div class="lg-t">Can't reach the server</div><div class="lg-s">${AX.errText(r)} You are still signed in.</div>
    <button class="btn pri lg block mt24" id="rt">${icon('refresh')} Try again</button><button class="btn ghost block mt8" id="so">Sign in again</button></div></div>`);
  document.getElementById('rt').onclick = () => AX.boot();
  document.getElementById('so').onclick = () => { S.clear(); login(); };
}
AX.signOut = async (all) => {
  if (!S.legacy) await AX.api.rpc('cbt_admin_logout', {});
  S.clear(); window.onhashchange = null; history.replaceState(null, '', location.pathname + location.search); login();
};

/* ---------- app shell ---------- */
function navItems() {
  return Object.values(AX.mods).filter(m => m.nav && AX.allowed(m)).sort((a, b) => GROUPS.indexOf(a.group || '') - GROUPS.indexOf(b.group || '') || a.order - b.order);
}
// sections of the rail: group → [short name, icon]
const SECT = { '': ['Home', 'home'], 'Students & accounts': ['Students', 'users'], 'Tests & questions': ['Tests', 'layers'], 'Analytics': ['Analytics', 'chart'],
  'Content & storage': ['Storage', 'db'], 'Sales & billing': ['Sales', 'cart'], 'Communication': ['Messages', 'megaphone'], 'Costs & integrations': ['Costs', 'rupee'], 'Team & security': ['Security', 'shield'] };
const groupOf = id => { const m = AX.mods[id]; return m ? m.group || '' : ''; };
const sections = () => { const items = navItems(); return GROUPS.map(x => ({ g: x, L: items.filter(m => (m.group || '') === x) })).filter(x => x.L.length).map(x => Object.assign(x, { name: (SECT[x.g] || [x.g])[0], ic: (SECT[x.g] || [0, 'grid'])[1], n: x.L.reduce((t, m) => t + badgeOf(m.id), 0) })); };
const nb = n => n ? h`<span class="nb">${n > 99 ? '99+' : n}</span>` : '';
// side menu (computers): every section is a row; the open section shows its pages under it
function railHtml(cur) {
  const g = groupOf(cur);
  return join(sections(), x => { const on = g === x.g, many = x.L.length > 1;
    return h`<div class="ax-sec ${on ? 'on' : ''}"><a class="ax-sh" href="#/${x.L[0].id}" title="${x.g || 'Command centre'}"><span class="si">${icon(x.ic)}</span><span class="st">${x.g || 'Command centre'}</span>${on && many ? '' : nb(x.n)}${many ? icon(on ? 'chevD' : 'chevR', 15) : ''}</a>
      ${on && many ? h`<div class="ax-sp">${join(x.L, m => h`<a class="${cur === m.id ? 'on' : ''}" href="#/${m.id}"><span class="st">${m.title}</span>${nb(badgeOf(m.id))}</a>`)}</div>` : ''}</div>`; });
}
const PRIM = ['', 'Students & accounts', 'Tests & questions', 'Sales & billing'];   // the sections of the phone bottom bar
// menu drawer (phones): one line per page, under the name of its section. all = every section; else only those not in the bottom bar
function menuHtml(cur, all) {
  return join(sections().filter(x => all || !PRIM.includes(x.g)), x => h`${x.g ? h`<div class="md-g">${x.g}</div>` : ''}
    ${join(x.L, m => h`<a class="md-i ${cur === m.id ? 'on' : ''}" href="#/${m.id}"><span class="si">${icon(m.icon)}</span><span class="grow ell">${m.title}</span>${nb(badgeOf(m.id))}</a>`)}`);
}
function subHtml(cur) {
  const g = groupOf(cur), L = navItems().filter(m => (m.group || '') === g);
  return L.length < 2 ? '' : join(L, m => { const n = badgeOf(m.id); return h`<a class="${cur === m.id ? 'on' : ''}" href="#/${m.id}">${icon(m.icon, 16)}<span>${m.title}</span>${n ? h`<em>${n > 99 ? '99+' : n}</em>` : ''}</a>`; });
}
function badgeOf(id) { return ATT.filter(a => a.mod === id && a.badge).reduce((s, a) => s + (a.count || 0), 0); }
function meCard() {
  const me = S.me || {};
  return h`<button class="ax-me" id="ax-me" aria-label="Account menu">${UI.avatar(me.name || 'Owner', me.username || 'owner', 'sm')}<div class="grow"><div class="b sm ell">${me.name || 'Owner'}</div><div class="xs mut ell">${me.owner ? (S.legacy ? 'Owner · basic sign-in' : 'Owner · full access') : 'Team · @' + (me.username || '')}</div></div>${icon('moreV', 16)}</button>`;
}
function start() {
  document.body.innerHTML = AX.html(h`<div class="ax-app">
    <aside class="ax-side"><a class="ax-brand" href="#/home" title="Aspiron Control"><span class="mk"><img src="admin-icon-192.png" alt="Aspiron" width="40" height="40"></span><span class="bn"><b>Aspiron</b><span>Control</span></span></a>
      <nav class="ax-rail-nav" id="ax-nav" aria-label="Sections"></nav><div id="ax-mewrap">${meCard()}</div></aside>
    <div class="ax-main">
      <header class="ax-top glass"><button class="ibtn ax-menu-btn" id="ax-menu" aria-label="Menu: all sections">${icon('menu')}</button>
        <div class="crumb" id="ax-crumb"></div>
        <button class="ax-sbtn" id="ax-search" aria-label="Search">${icon('search', 17)}<span>Search students, orders, tests…</span><span class="kbd">Ctrl K</span></button>
        <button class="ibtn" id="ax-new" aria-label="Create">${icon('plus')}</button>
        <button class="ibtn" id="ax-bell" aria-label="Needs attention">${icon('bell')}</button>
        <button class="ibtn" id="ax-theme" aria-label="Theme">${icon(AX.theme.get() === 'dark' ? 'sun' : 'moon')}</button>
        <button class="ax-prof" id="ax-prof" aria-label="Your profile">${UI.avatar((S.me || {}).name || 'Owner', (S.me || {}).username || 'owner', 'sm')}</button>
      </header>
      ${S.legacy ? h`<div class="callout gold" style="margin:14px 28px 0;border-radius:14px">${icon('info')}<div class="sm"><b>Team accounts and sign-in sessions are off.</b> Run <span class="mono">supabase_v35_admin_team.sql</span> once in Supabase → SQL Editor to add team members, permissions, the activity log and remote sign-out. Until then you are signed in with the password for this tab only.</div></div>` : ''}
      <nav class="ax-sub hide" id="ax-sub" aria-label="Pages of this section"></nav>
      <main class="ax-page" id="ax-page"></main>
    </div></div>
    <nav class="ax-bottom glass" id="ax-bottom" aria-label="Main"></nav>`);
  drawNav();
  const $ = id => document.getElementById(id);
  $('ax-search').onclick = palette;
  $('ax-crumb').onclick = e => { if (e.target.closest('[data-act=back]')) goBack(); };
  $('ax-new').onclick = e => createMenu(e.currentTarget);
  $('ax-menu').onclick = () => navSheet(true);
  $('ax-prof').onclick = profile;
  $('ax-bell').onclick = e => attention(e.currentTarget);
  $('ax-theme').onclick = () => { AX.theme.toggle(); AX.set($('ax-theme'), icon(AX.theme.get() === 'dark' ? 'sun' : 'moon')); };
  document.querySelector('.ax-side').addEventListener('click', e => { if (e.target.closest('#ax-me')) profile(); });
  window.onhashchange = route;
  // the installed app opens with ?app=control (its app id); keep the address short
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', '#/home');
  route();
  refreshAttention(); loadProf();
  clearInterval(AX._hb); AX._hb = setInterval(() => { if (!document.hidden) heartbeat(); }, 60000);
  clearInterval(AX._att); AX._att = setInterval(() => { if (!document.hidden) refreshAttention(); }, 120000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && document.getElementById('ax-page')) { heartbeat(); if (Date.now() - ATT_AT > 60000) refreshAttention(); } });
document.addEventListener('keydown', e => {
  if (!document.getElementById('ax-page')) return;
  const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
  else if (e.key === '/' && !typing && !UI.top()) { e.preventDefault(); palette(); }
});
function drawNav() {
  const cur = CUR && CUR.mod;
  const nav = document.getElementById('ax-nav'); if (!nav) return;
  AX.set(nav, railHtml(cur));
  const sub = document.getElementById('ax-sub'), sh = subHtml(cur); AX.set(sub, sh); sub.classList.toggle('hide', !sh);
  // phones: Home, Students, Tests, Sales open their section (its pages are the strip at the top); More = the other sections
  const all = sections(), gcur = groupOf(cur), prim = PRIM.map(g => all.find(x => x.g === g)).filter(Boolean);
  const rest = all.filter(x => !prim.includes(x)), moreOn = !prim.some(x => x.g === gcur);
  AX.set('#ax-bottom', h`${join(prim, x => h`<a href="#/${x.L[0].id}" class="${x.g === gcur ? 'on' : ''}"><span class="bi">${icon(x.ic)}${nb(x.n)}</span><span class="bt">${x.name}</span></a>`)}<button id="ax-more" class="${moreOn ? 'on' : ''}" aria-label="More sections"><span class="bi">${icon('grid')}${nb(rest.reduce((t, x) => t + x.n, 0))}</span><span class="bt">More</span></button>`);
  const more = document.getElementById('ax-more'); if (more) more.onclick = () => navSheet(false);
  const bell = document.getElementById('ax-bell'), tot = ATT.reduce((s, a) => s + (a.count || 0), 0);
  if (bell) AX.set(bell, h`${icon('bell')}${tot ? h`<span class="dot">${tot > 99 ? '99+' : tot}</span>` : ''}`);
  const mw = document.getElementById('ax-mewrap'); if (mw) AX.set(mw, meCard());
}
AX.redrawNav = drawNav;

/* ---------- privacy screen + auto sign-out after 15 minutes without use ---------- */
let LAST = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => addEventListener(ev, () => { LAST = Date.now(); }, { passive: true, capture: true }));
// once: forget an auto sign-out switch saved by an older version, so a device that keeps the sign-in is not signed out
if (!AX.ls.get('cx_al2', null)) { AX.ls.del('cx_autolock'); AX.ls.set('cx_al2', 1); }
AX.autoLock = {
  get() { const v = AX.ls.get('cx_autolock', null); return v == null ? (S.legacy || !AX.ls.get('cx_tok', null)) : !!v; },
  set(v) { AX.ls.set('cx_autolock', !!v); }
};
setInterval(() => {
  if (!S.token || !document.getElementById('ax-page') || !AX.autoLock.get()) return;
  if (Date.now() - LAST > 15 * 60000) { AX.signOut().then(() => UI.toast('Signed out after 15 minutes without use', { tone: 'warn', ms: 6000 })); }
}, 30000);
const priv = on => { if (S.token && document.getElementById('ax-page')) document.body.classList.toggle('privacy', on); };
document.addEventListener('visibilitychange', () => priv(document.hidden));
addEventListener('blur', () => priv(true)); addEventListener('focus', () => priv(false));
function navSheet(all) {
  UI.drawer({ title: all ? 'Menu' : 'More', size: all ? 'side left' : 'side', body: h`<nav class="ax-md" data-close aria-label="Pages">${menuHtml(CUR && CUR.mod, all)}</nav>` });
}
// profile: who is signed in, and everything about the own account in one place
function profile() {
  const me = S.me || {}, name = me.name || 'Owner';
  const row = (act, ic, t, sub) => h`<button class="li click pf-row" data-close data-act="${act}"><span class="si">${icon(ic)}</span><span class="grow"><span class="t">${t}</span>${sub ? h`<span class="s">${sub}</span>` : ''}</span>${icon('chevR', 16)}</button>`;
  UI.modal({ title: null, size: 'narrow', foot: null,
    body: h`<div class="pf-head">${UI.avatar(name, me.username || 'owner', 'lg')}<div class="grow"><div class="pf-n">${name}</div><div class="sm mut">${me.owner ? 'Owner · full access' : 'Team member · @' + (me.username || '')}</div></div></div>
      <div class="list pf-list">
        ${me.owner && !S.legacy ? row('edit', 'edit', 'Edit profile', PROF && PROF.mobile ? AX.fmt.mobile(PROF.mobile) + (PROF.email ? ' · ' + PROF.email : '') : 'Your name, mobile number and e-mail') : ''}
        ${!S.legacy ? row('pw', 'key', 'Password', 'Change your sign-in password') : ''}
        ${!S.legacy ? row('tfa', 'shieldCheck', 'Two-step sign-in', 'Authenticator app and recovery codes') : ''}
        ${!S.legacy ? row('dev', 'device', 'Where you are signed in', 'See and sign out your devices') : ''}
        ${row('theme', AX.theme.get() === 'dark' ? 'sun' : 'moon', AX.theme.get() === 'dark' ? 'Light theme' : 'Dark theme')}
        ${row('set', 'settings', 'Settings', 'This device, shortcuts, links')}
        ${row('site', 'external', 'Open student website')}
      </div><button class="btn danger block mt16" data-close data-act="out">${icon('logout')} Sign out</button>`,
    onOpen(el) { AX.act(el, { edit: editProfile, pw: () => AX.go('team/security'), tfa: () => AX.go('settings'), dev: () => AX.go('team/sessions'), theme() { AX.theme.toggle(); drawNav(); },
      set: () => AX.go('settings'), site: () => window.open('./', '_blank', 'noopener'), out: () => AX.signOut() }); } });
}
function editProfile() {
  const p = PROF || {};
  UI.modal({ title: 'Your profile', sub: 'Only shown inside this admin panel. Students never see it.', size: 'narrow',
    body: h`<form id="pf" class="col gap16" autocomplete="off" novalidate>
      ${AX.f.input({ name: 'name', label: 'Your name', value: p.name || '', max: 60, placeholder: 'e.g. Sanjay Joshi', auto: 'name' })}
      ${AX.f.input({ name: 'mobile', label: 'Mobile number', value: p.mobile || '', type: 'tel', inputmode: 'numeric', max: 14, placeholder: '10-digit number', auto: 'tel' })}
      ${AX.f.input({ name: 'email', label: 'E-mail', value: p.email || '', type: 'email', inputmode: 'email', max: 120, placeholder: 'you@example.com', auto: 'email' })}</form>`,
    foot: h`<button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save" data-busy="Saving…">${icon('check', 16)} Save</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#pf');
      AX.act(el, { async save(b) {
        AX.f.clearErrors(f); const v = AX.f.read(f), mb = String(v.mobile).replace(/\D/g, '').slice(-10);
        if (v.name.trim().length < 2) return AX.f.error(f, 'name', 'Type your name');
        if (v.mobile.trim() && !/^[6-9]\d{9}$/.test(mb)) return AX.f.error(f, 'mobile', 'Enter a 10-digit mobile number');
        if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.email.trim())) return AX.f.error(f, 'email', 'This e-mail does not look right');
        await UI.busy(b, async () => {
          const r = await AX.api.call('cbt_admin_profile', 'save', { name: v.name.trim(), mobile: mb, email: v.email.trim() });
          if (!r.ok) return r.detail && ['name', 'mobile', 'email'].includes(r.detail) ? AX.f.error(f, r.detail, 'Please check this') : UI.toast(AX.errText(r, 'supabase_v72_owner_profile.sql'), { tone: 'bad' });
          PROF = r; applyProf(); S.save(!!AX.ls.get('cx_tok', null)); close(); UI.toast('Profile saved'); drawNav();
          const pb = document.getElementById('ax-prof'); if (pb) AX.set(pb, UI.avatar(S.me.name, 'owner', 'sm'));
          if (CUR && CUR.mod === 'home') route();
        });
      } });
    } });
}
async function heartbeat() {
  if (!S.token || S.legacy) return;
  const r = await AX.api.rpc('cbt_admin_me', {});
  if (!r.ok) return;           // auth errors already send the user to sign-in
  const before = JSON.stringify(S.me && S.me.perms);
  S.me = r.me; applyProf(); S.id = r.session; S.save(!!AX.ls.get('cx_tok', null));
  if (JSON.stringify(r.me.perms) !== before) { UI.toast('Your access was updated by the owner'); drawNav(); route(); }
}

/* ---------- router ---------- */
// top-left trail: a back arrow on every page but home; the group name goes home, the module name goes to its first page
const NAV = [];
// tab = {title, href} of the open tab (shown when the page has tabs), sub = name of an opened item (student, test…)
function crumb(m, sub, tab) {
  const back = m.id !== 'home' || CUR.parts.length ? h`<button type="button" class="ibtn sm line cb-back" data-act="back" aria-label="Back" title="Back">${icon('chevL', 16)}</button>` : '';
  const grp = m.group ? h`<a href="#/home" class="cb-grp">${m.group}</a>${icon('chevR', 14)}` : '';
  const sep = icon('chevR', 14), last = sub || (tab && tab.title);
  if (!last) return h`${back}${grp}<b class="ell">${m.title}</b>`;
  return h`${back}${grp}<a href="#/${m.id}" class="cb-mod">${m.title}</a>${sep}${sub && tab ? h`<a href="${tab.href}" class="cb-tab">${tab.title}</a>${sep}` : ''}<b class="ell">${last}</b>`;
}
function goBack() { if (NAV.length > 1) history.back(); else AX.go(CUR.mod !== 'home' && CUR.parts.length ? CUR.mod : 'home'); }
function route() {
  const p = AX.parseHash();
  let m = AX.mods[p.mod];
  if (!m) { history.replaceState(null, '', '#/home'); m = AX.mods.home; p.mod = 'home'; p.parts = []; }
  UI.closeAll();
  const n = ++ROUTE_N;
  CUR = { mod: m.id, parts: p.parts, q: p.q };
  drawNav();
  const hs = location.hash; if (NAV[NAV.length - 2] === hs) NAV.pop(); else if (NAV[NAV.length - 1] !== hs) NAV.push(hs);
  AX.set('#ax-crumb', crumb(m));
  const page = document.getElementById('ax-page');
  page.innerHTML = '<div class="ph" id="ax-ph"></div><nav class="ptabs hide" id="ax-tabs"></nav><div id="ax-body"></div>';
  const body = document.getElementById('ax-body');
  window.scrollTo(0, 0); page.classList.remove('enter'); void page.offsetWidth; page.classList.add('enter');
  const ctx = {
    el: body, mod: m, parts: p.parts, q: p.q,
    alive: () => n === ROUTE_N,
    head(o) {
      if (n !== ROUTE_N) return;
      AX.set('#ax-ph', h`<span class="ph-ic" aria-hidden="true">${icon(m.icon, 24)}</span><div class="pt"><h1>${o.title || m.title}</h1>${o.sub ? h`<p class="ps">${o.sub}</p>` : ''}</div>${o.actions ? h`<div class="pa">${o.actions}</div>` : ''}`);
      const tb = document.getElementById('ax-tabs');
      if (o.tabs && o.tabs.length) { tb.classList.remove('hide'); AX.set(tb, join(o.tabs.filter(t => !t.perm || AX.can(...[].concat(t.perm))), t => h`<a href="${t.href || '#/' + m.id + '/' + t.id}" class="${t.id === o.tab ? 'on' : ''}">${t.icon ? icon(t.icon, 16) : ''}${t.title}${t.count ? h`<em>${t.count}</em>` : ''}</a>`)); }
      else tb.classList.add('hide');
      const ot = o.tabs && o.tab != null && o.tabs.find(t => t.id === o.tab), tab = ot ? { title: ot.title, href: ot.href || '#/' + m.id + '/' + ot.id } : null;
      if (o.crumb || tab) AX.set('#ax-crumb', crumb(m, o.crumb, tab));
      document.title = (o.title || m.title) + ' · Aspiron Control';
    },
    reload: () => route()
  };
  if (!AX.allowed(m)) { ctx.head({ title: m.title }); AX.set(body, UI.noAccess(m.title)); return; }
  ctx.head({ title: m.title, sub: m.sub });
  AX.set(body, UI.skeleton(5));
  Promise.resolve().then(() => m.render(ctx)).catch(err => {
    console.error(err);
    if (n === ROUTE_N) AX.set(body, h`<div class="card">${UI.empty({ tone: 'bad', icon: 'alert', title: 'This page hit a problem', text: String(err && err.message || err), action: h`<button class="btn sm" data-reload>${icon('refresh', 15)} Reload</button>` })}</div>`);
  });
}
AX.route = route;

/* ---------- motion: numbers count up once, cards lean a little towards the pointer (computers only) ---------- */
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches, FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
new MutationObserver(() => {
  if (CALM) return;
  document.querySelectorAll('#ax-body .k-v:not([data-cu])').forEach(el => {
    el.dataset.cu = 1;
    const t = el.textContent, m = /^(\D*)([\d,]+)(\D*)$/.exec(t.trim()); if (!m) return;
    const to = Number(m[2].replace(/,/g, '')); if (!(to > 0) || to > 1e9) return;
    const t0 = performance.now(), step = now => { const k = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? m[1] + Math.round(to * e).toLocaleString('en-IN') + m[3] : t; if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}).observe(document.documentElement, { childList: true, subtree: true });
if (FINE && !CALM) {
  let last = null;
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('.kpi, .ax-page > .ph');
    if (last && last !== el) { last.style.transform = ''; last = null; }
    if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5, a = el.classList.contains('ph') ? 2 : 6;
    el.style.transform = `perspective(900px) rotateX(${(-y * a).toFixed(2)}deg) rotateY(${(x * a).toFixed(2)}deg) translateZ(0)`; last = el;
  }, { passive: true });
}
AX.current = () => CUR;

/* ---------- attention centre ---------- */
async function refreshAttention() {
  ATT_AT = Date.now();
  const mods = Object.values(AX.mods).filter(m => m.attention && AX.allowed(m));
  const res = await Promise.all(mods.map(m => Promise.resolve().then(() => m.attention()).then(a => (a || []).map(x => Object.assign({ mod: m.id }, x))).catch(() => [])));
  ATT = res.flat().filter(a => a.count);
  drawNav();
  AX.emit('attention', ATT);
}
AX.refreshAttention = refreshAttention;
AX.getAttention = () => ATT.slice();
AX.on('data:changed', AX.u.debounce(refreshAttention, 800));
function attention(anchor) {
  const tot = ATT.reduce((s, a) => s + (a.count || 0), 0);
  UI.modal({
    title: 'Needs attention', sub: tot ? AX.fmt.plural(tot, 'item') + ' waiting for you' : 'All clear', size: 'narrow',
    body: ATT.length ? h`<div class="list card pad0 flat">${join(ATT.sort((a, b) => (b.tone === 'bad') - (a.tone === 'bad')), a => h`<a class="li click" href="${a.go}" data-close style="color:var(--tx);text-decoration:none"><span class="av sm" style="--c:${a.tone === 'bad' ? '#ef4444' : a.tone === 'gold' ? '#c9a45c' : '#14b8a6'}">${icon(a.icon || 'bell', 15)}</span><div class="grow"><div class="t">${a.title}</div>${a.sub ? h`<div class="s">${a.sub}</div>` : ''}</div><span class="pill ${a.tone || 'pri'}">${a.count}</span>${icon('chevR', 16)}</a>`)}</div>`
      : UI.empty({ icon: 'checkCircle', title: 'Nothing waiting', text: 'Payments to verify, access requests, question reports and new reviews show up here.' }),
    foot: h`<button class="btn ghost sm" data-act="ref">${icon('refresh', 15)} Refresh</button><span class="sp"></span><button class="btn ghost" data-close>Close</button>`,
    onOpen(el, close) { AX.act(el, { async ref(b) { await UI.busy(b, refreshAttention); close(); attention(anchor); } }); }
  });
}

/* ---------- quick create ---------- */
function createMenu(anchor) {
  const list = AX.creates.filter(c => !c.perm || AX.can(...c.perm));
  if (!list.length) return UI.toast('Nothing to create with your access', { tone: 'warn' });
  UI.menu(anchor, [{ head: 'Create' }, ...list.map(c => ({ label: c.label, icon: c.icon, fn: c.run }))]);
}

/* ---------- command palette ---------- */
function palette() {
  if (document.querySelector('.cmdk')) return;
  let items = [], sel = 0, seq = 0;
  const it = UI.modal({ title: null, foot: null, size: '', body: '', sheet: false });
  const ov = it.el.parentElement; it.el.remove();
  const box = document.createElement('div'); box.className = 'cmdk'; ov.appendChild(box);
  box.innerHTML = AX.html(h`<div class="ci">${icon('search', 20)}<input id="ck" placeholder="Search students, orders, tests, or type a command…" autocomplete="off" spellcheck="false"><button class="ibtn sm" data-close aria-label="Close">${icon('x')}</button></div><div class="cr" id="ckr"></div><div class="cf"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">Enter</span> open</span><span><span class="kbd">Esc</span> close</span></div>`);
  const inp = box.querySelector('#ck'), res = box.querySelector('#ckr');
  const base = () => {
    const nav = navItems().map(m => ({ g: 'Go to', title: m.title, sub: m.group || '', icon: m.icon, go: '#/' + m.id }));
    const acts = AX.actions.concat(AX.creates).filter(a => !a.perm || AX.can(...a.perm)).map(a => ({ g: 'Actions', title: a.label, icon: a.icon || 'zap', run: a.run }));
    return { nav, acts };
  };
  const draw = () => {
    let g = null;
    AX.set(res, items.length ? join(items, (x, i) => { const head = x.g !== g ? (g = x.g, h`<div class="cg">${x.g}</div>`) : ''; return h`${head}<button class="co ${i === sel ? 'on' : ''}" data-i="${i}"><span class="ic">${icon(x.icon || 'arrowR', 17)}</span><span class="grow"><div class="b ell">${x.title}</div>${x.sub ? h`<div class="xs mut ell">${x.sub}</div>` : ''}</span>${x.tag ? UI.pill(x.tag, x.tone) : ''}</button>`; })
      : h`<div class="empty" style="padding:30px">${icon('search', 22)}<span class="sm">No match. Try a name, mobile number, order code, UTR or test title.</span></div>`);
    const on = res.querySelector('.co.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const search = AX.u.debounce(async () => {
    const q = inp.value.trim().toLowerCase(), n = ++seq, { nav, acts } = base();
    const lx = x => x.title.toLowerCase().includes(q) || (x.sub || '').toLowerCase().includes(q);
    items = q ? nav.filter(lx).concat(acts.filter(lx)) : nav.slice(0, 8).concat(acts.slice(0, 6));
    sel = 0; draw();
    if (q.length < 2) return;
    const prov = Object.values(AX.mods).filter(m => m.search && AX.allowed(m));
    const found = (await Promise.all(prov.map(m => Promise.resolve().then(() => m.search(q)).catch(() => [])))).flat();
    if (n !== seq) return;
    items = found.slice(0, 30).concat(items); sel = 0; draw();
  }, 180);
  const open = x => { if (!x) return; it.close(); if (x.run) x.run(); else if (x.go) location.hash = x.go; };
  inp.addEventListener('input', search);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); open(items[sel]); }
  });
  res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) open(items[+b.dataset.i]); });
  box.addEventListener('click', e => { if (e.target.closest('[data-close]')) it.close(); });
  search(); setTimeout(() => inp.focus(), 30);
}
AX.palette = palette;

// installable app: the browser offers "Install app" only when a service worker controls the page (sw.js, network-first)
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => AX.boot());
else setTimeout(() => AX.boot(), 0);
})();
