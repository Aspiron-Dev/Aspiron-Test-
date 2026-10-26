/* =====================================================================
   Aspiron Control — shell
   sign-in · layout (sidebar / top bar / phone tab bar) · router · command palette · attention centre
   session heartbeat · quick create · profile menu
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI } = AX;
const S = AX.session;
const GROUPS = ['', 'People', 'Academics', 'Commerce', 'Engagement', 'Workspace'];
let ATT = [], ATT_AT = 0, CUR = null, ROUTE_N = 0;

/* ---------- boot ---------- */
AX.boot = async () => {
  AX.theme.set(AX.ls.get('cx_theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  if (!AX.url) { document.body.innerHTML = '<p style="padding:24px">config.js is missing.</p>'; return; }
  if (!S.load()) return login();
  splash();
  const r = await check();
  if (r.ok) return start();
  S.clear();
  login(r.error === 'network' ? 'network' : r.error);
};
function splash() {
  document.body.innerHTML = AX.html(h`<div class="lg-wrap"><div class="col" style="align-items:center;gap:18px"><div class="lg-mark">${icon('shield')}</div><span class="spin" style="color:var(--pri)"></span></div></div>`);
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
  expired: 'Your sign-in expired after a week without use. Please sign in again.',
  disabled: 'This team account has been paused by the owner.',
  invalid: 'Please sign in again.', network: 'No internet connection. Check it and try again.', locked: 'Too many wrong attempts. Try again in 15 minutes.'
};
function login(reason) {
  UI.closeAll();
  const mode = AX.ls.get('cx_lmode', 'owner');
  document.body.innerHTML = AX.html(h`<div class="lg-wrap"><form class="lg-card glass" id="lg" autocomplete="on" novalidate>
    <div class="lg-mark">${icon('shield')}</div>
    <div class="lg-t">Aspiron Control</div>
    <div class="lg-s">Sign in to the admin console</div>
    ${reason && LOST[reason] ? h`<div class="callout warn mt16">${icon('info')}<div>${LOST[reason]}</div></div>` : ''}
    <div class="seg mt24" style="width:100%" id="lgm"><button type="button" data-m="owner" class="${mode === 'owner' ? 'on' : ''}" style="flex:1">${icon('crown', 15)} Owner</button><button type="button" data-m="team" class="${mode === 'team' ? 'on' : ''}" style="flex:1">${icon('team', 15)} Team member</button></div>
    <div class="col gap16 mt16">
      <div class="fld ${mode === 'owner' ? 'hide' : ''}" id="lgu"><label for="lg-u">Username</label><div class="inp-wrap">${icon('user')}<input class="inp" id="lg-u" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. ravi.k"></div></div>
      <div class="fld"><label for="lg-p">Password</label><div class="inp-wrap">${icon('key')}<input class="inp" id="lg-p" name="p" type="password" autocomplete="current-password" placeholder="Your password" style="padding-right:46px"><button type="button" class="ibtn sm suffix" data-eye aria-label="Show password">${icon('eye', 17)}</button></div></div>
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
    f.querySelector('#lgu').classList.toggle('hide', m === 'owner'); (m === 'owner' ? f.querySelector('#lg-p') : f.querySelector('#lg-u')).focus();
  });
  setTimeout(() => (m === 'owner' ? f.querySelector('#lg-p') : f.querySelector('#lg-u')).focus(), 50);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const u = m === 'team' ? f.querySelector('#lg-u').value.trim() : '', p = f.querySelector('#lg-p').value, er = f.querySelector('#lg-e');
    er.textContent = '';
    if (m === 'team' && !u) { er.textContent = 'Enter your username.'; return; }
    if (!p) { er.textContent = 'Enter the password.'; return; }
    await UI.busy(f.querySelector('#lg-go'), async () => {
      let r = await AX.api.rpc('cbt_admin_login', { p_user: u, p_pw: p, p_device: AX.u.device() }, { auth: false });
      if (r.error === 'missing') {
        // the database is not updated yet (supabase_v35_admin_team.sql): the owner can still sign in the old way
        if (m === 'team') { er.textContent = 'Team accounts are not set up yet. The owner must run supabase_v35_admin_team.sql in Supabase.'; return; }
        const c = await AX.api.rpc('cbt_admin', { p_pw: p, p_action: 'ping', p_data: {} }, { auth: false });
        if (!c.ok) { er.textContent = c.error === 'not_set' ? 'The admin password is not set yet. In Supabase → SQL Editor run: select cbt_private.set_admin_password(\'your-password\');' : AX.errText(c); return; }
        S.token = p; S.legacy = true; S.me = { owner: true, name: 'Owner', perms: {} }; S.save(false);
        return start();
      }
      if (!r.ok) {
        er.textContent = r.error === 'invalid' ? (m === 'team' ? 'Wrong username or password.' : 'Wrong password.')
          : r.error === 'locked' ? 'Too many wrong attempts. Try again in ' + (r.wait ? r.wait + ' min' : '15 minutes') + '.'
          : r.error === 'not_set' ? 'The admin password is not set yet. In Supabase → SQL Editor run: select cbt_private.set_admin_password(\'your-password\');'
          : AX.errText(r);
        f.querySelector('#lg-p').select(); return;
      }
      S.token = r.token; S.legacy = false; S.me = r.me; S.save(f.querySelector('#lg-r').checked);
      start();
    });
  });
}
AX.on('auth:lost', reason => { if (!S.token) return; S.clear(); login(reason); });
AX.signOut = async (all) => {
  if (!S.legacy) await AX.api.rpc('cbt_admin_logout', {});
  S.clear(); location.hash = ''; login();
};

/* ---------- app shell ---------- */
function navItems() {
  return Object.values(AX.mods).filter(m => m.nav && AX.allowed(m)).sort((a, b) => GROUPS.indexOf(a.group || '') - GROUPS.indexOf(b.group || '') || a.order - b.order);
}
function navHtml(cur) {
  let g = null; const out = [];
  navItems().forEach(m => {
    if ((m.group || '') !== g) { g = m.group || ''; if (g) out.push(h`<div class="ax-ng">${g}</div>`); }
    const n = badgeOf(m.id);
    out.push(h`<a class="ax-ni ${cur === m.id ? 'on' : ''}" href="#/${m.id}" title="${m.title}">${icon(m.icon)}<span class="lt">${m.title}</span>${n ? h`<span class="nb">${n > 99 ? '99+' : n}</span>` : ''}</a>`);
  });
  return join(out);
}
function badgeOf(id) { return ATT.filter(a => a.mod === id && a.badge).reduce((s, a) => s + (a.count || 0), 0); }
function meCard() {
  const me = S.me || {};
  return h`<button class="ax-me" id="ax-me" aria-label="Account menu">${UI.avatar(me.name || 'Owner', me.username || 'owner', 'sm')}<div class="grow"><div class="b sm ell">${me.name || 'Owner'}</div><div class="xs mut ell">${me.owner ? (S.legacy ? 'Owner · basic sign-in' : 'Owner · full access') : 'Team · @' + (me.username || '')}</div></div>${icon('moreV', 16)}</button>`;
}
function start() {
  document.body.innerHTML = AX.html(h`<div class="ax-app">
    <aside class="ax-side glass"><a class="ax-brand" href="#/home"><span class="mk">${icon('shield')}</span><span class="grow"><div class="bt">Aspiron</div><div class="bs">Control</div></span></a>
      <nav class="ax-nav" id="ax-nav" aria-label="Main"></nav><div id="ax-mewrap">${meCard()}</div></aside>
    <div class="ax-main">
      <header class="ax-top glass"><button class="ibtn ax-menu-btn" id="ax-menu" aria-label="Menu" style="display:none">${icon('menu')}</button>
        <div class="crumb" id="ax-crumb"></div>
        <button class="ax-sbtn" id="ax-search" aria-label="Search">${icon('search', 17)}<span>Search students, orders, tests…</span><span class="kbd">Ctrl K</span></button>
        <button class="ibtn" id="ax-new" aria-label="Create">${icon('plus')}</button>
        <button class="ibtn" id="ax-bell" aria-label="Needs attention">${icon('bell')}</button>
        <button class="ibtn" id="ax-theme" aria-label="Theme">${icon(AX.theme.get() === 'dark' ? 'sun' : 'moon')}</button>
      </header>
      ${S.legacy ? h`<div class="callout gold" style="margin:14px 28px 0;border-radius:14px">${icon('info')}<div class="sm"><b>Team accounts and sign-in sessions are off.</b> Run <span class="mono">supabase_v35_admin_team.sql</span> once in Supabase → SQL Editor to add team members, permissions, the activity log and remote sign-out. Until then you are signed in with the password for this tab only.</div></div>` : ''}
      <main class="ax-page" id="ax-page"></main>
    </div></div>
    <nav class="ax-bottom glass" id="ax-bottom" aria-label="Main"></nav>`);
  if (matchMedia('(max-width:759px)').matches) document.getElementById('ax-menu').style.display = 'none';
  drawNav();
  const $ = id => document.getElementById(id);
  $('ax-search').onclick = palette;
  $('ax-new').onclick = e => createMenu(e.currentTarget);
  $('ax-bell').onclick = e => attention(e.currentTarget);
  $('ax-theme').onclick = () => { AX.theme.toggle(); AX.set($('ax-theme'), icon(AX.theme.get() === 'dark' ? 'sun' : 'moon')); };
  document.querySelector('.ax-side').addEventListener('click', e => { if (e.target.closest('#ax-me')) profileMenu(e.target.closest('#ax-me')); });
  window.onhashchange = route;
  if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', '#/home');
  route();
  refreshAttention();
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
  AX.set(nav, navHtml(cur));
  const prim = ['home', 'students', 'tests', 'orders'].map(id => AX.mods[id]).filter(m => m && AX.allowed(m));
  AX.set('#ax-bottom', h`${join(prim, m => { const n = badgeOf(m.id); return h`<a href="#/${m.id}" class="${cur === m.id ? 'on' : ''}">${icon(m.icon)}<span>${m.short || m.title}</span>${n ? h`<span class="nb">${n > 99 ? '99+' : n}</span>` : ''}</a>`; })}<button id="ax-more" class="${prim.some(m => m.id === cur) ? '' : 'on'}">${icon('grid')}<span>Menu</span></button>`);
  const more = document.getElementById('ax-more'); if (more) more.onclick = navSheet;
  const bell = document.getElementById('ax-bell'), tot = ATT.reduce((s, a) => s + (a.count || 0), 0);
  if (bell) AX.set(bell, h`${icon('bell')}${tot ? h`<span class="dot">${tot > 99 ? '99+' : tot}</span>` : ''}`);
  const mw = document.getElementById('ax-mewrap'); if (mw) AX.set(mw, meCard());
}
AX.redrawNav = drawNav;

/* ---------- privacy screen + auto sign-out after 15 minutes without use ---------- */
let LAST = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => addEventListener(ev, () => { LAST = Date.now(); }, { passive: true, capture: true }));
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
function navSheet() {
  const me = S.me || {};
  UI.modal({ title: null, size: 'narrow', foot: null,
    body: h`<div class="row" style="padding:4px 4px 12px">${UI.avatar(me.name || 'Owner', me.username || 'owner')}<div class="grow"><div class="b">${me.name || 'Owner'}</div><div class="xs mut">${me.owner ? 'Owner' : '@' + me.username}</div></div><button class="ibtn line" data-close data-act="theme" aria-label="Theme">${icon(AX.theme.get() === 'dark' ? 'sun' : 'moon')}</button><button class="ibtn line" data-close data-act="out" aria-label="Sign out">${icon('logout')}</button></div><nav class="ax-nav navsheet" data-close>${navHtml(CUR && CUR.mod)}</nav>`,
    onOpen(el) { AX.act(el, { theme() { AX.theme.toggle(); }, out() { AX.signOut(); } }); } });
}
function profileMenu(anchor) {
  const me = S.me || {};
  UI.menu(anchor, [
    { head: (me.name || 'Owner') + (me.owner ? ' · Owner' : ' · Team') },
    !S.legacy ? { label: me.owner ? 'Team & access' : 'My sign-ins', icon: 'team', fn: () => AX.go('team') } : null,
    { label: AX.theme.get() === 'dark' ? 'Light theme' : 'Dark theme', icon: AX.theme.get() === 'dark' ? 'sun' : 'moon', fn: () => { AX.theme.toggle(); drawNav(); } },
    { label: 'Settings', icon: 'settings', fn: () => AX.go('settings') },
    { label: 'Open student website', icon: 'external', href: 'index.html' },
    { sep: true },
    { label: 'Sign out', icon: 'logout', tone: 'danger', fn: () => AX.signOut() }
  ]);
}
async function heartbeat() {
  if (!S.token || S.legacy) return;
  const r = await AX.api.rpc('cbt_admin_me', {});
  if (!r.ok) return;           // auth errors already send the user to sign-in
  const before = JSON.stringify(S.me && S.me.perms);
  S.me = r.me; S.id = r.session; S.save(!!AX.ls.get('cx_tok', null));
  if (JSON.stringify(r.me.perms) !== before) { UI.toast('Your access was updated by the owner'); drawNav(); route(); }
}

/* ---------- router ---------- */
function route() {
  const p = AX.parseHash();
  let m = AX.mods[p.mod];
  if (!m) { history.replaceState(null, '', '#/home'); m = AX.mods.home; p.mod = 'home'; p.parts = []; }
  UI.closeAll();
  const n = ++ROUTE_N;
  CUR = { mod: m.id, parts: p.parts, q: p.q };
  drawNav();
  AX.set('#ax-crumb', h`${m.group ? h`<span>${m.group}</span>${icon('chevR', 14)}` : ''}<b class="ell">${m.title}</b>`);
  const page = document.getElementById('ax-page');
  page.innerHTML = '<div class="ph" id="ax-ph"></div><nav class="ptabs hide" id="ax-tabs"></nav><div id="ax-body"></div>';
  const body = document.getElementById('ax-body');
  window.scrollTo(0, 0);
  const ctx = {
    el: body, mod: m, parts: p.parts, q: p.q,
    alive: () => n === ROUTE_N,
    head(o) {
      if (n !== ROUTE_N) return;
      AX.set('#ax-ph', h`<div class="pt"><h1>${o.title || m.title}</h1>${o.sub ? h`<p class="ps">${o.sub}</p>` : ''}</div>${o.actions ? h`<div class="pa">${o.actions}</div>` : ''}`);
      const tb = document.getElementById('ax-tabs');
      if (o.tabs && o.tabs.length) { tb.classList.remove('hide'); AX.set(tb, join(o.tabs.filter(t => !t.perm || AX.can(...[].concat(t.perm))), t => h`<a href="${t.href || '#/' + m.id + '/' + t.id}" class="${t.id === o.tab ? 'on' : ''}">${t.icon ? icon(t.icon, 16) : ''}${t.title}${t.count ? h`<em>${t.count}</em>` : ''}</a>`)); }
      else tb.classList.add('hide');
      if (o.crumb) AX.set('#ax-crumb', h`${m.group ? h`<span>${m.group}</span>${icon('chevR', 14)}` : ''}<a href="#/${m.id}">${m.title}</a>${icon('chevR', 14)}<b class="ell">${o.crumb}</b>`);
      document.title = (o.title || m.title) + ' · Aspiron Control';
    },
    reload: () => route()
  };
  if (!AX.allowed(m)) { ctx.head({ title: m.title }); AX.set(body, UI.noAccess(m.title)); return; }
  ctx.head({ title: m.title, sub: m.sub });
  AX.set(body, UI.skeleton(5));
  Promise.resolve().then(() => m.render(ctx)).catch(err => {
    console.error(err);
    if (n === ROUTE_N) AX.set(body, h`<div class="card">${UI.empty({ tone: 'bad', icon: 'alert', title: 'This page hit a problem', text: String(err && err.message || err), action: h`<button class="btn sm" onclick="location.reload()">${icon('refresh', 15)} Reload</button>` })}</div>`);
  });
}
AX.route = route;
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => AX.boot());
else setTimeout(() => AX.boot(), 0);
})();
