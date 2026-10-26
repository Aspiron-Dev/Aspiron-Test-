/* =====================================================================
   Team & access (owner): team members + permissions, where the panel is signed in, activity log, password.
   A team member sees only "My sign-ins" and can change their own password.
   Server: supabase_v35_admin_team.sql (cbt_admin_team, cbt_admin_login, cbt_admin_me, cbt_admin_logout)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const T = { users: [], sessions: [], audit: [], current: null, at: 0 };
const LEVELS = [{ value: '', label: 'No access' }, { value: 'view', label: 'View' }, { value: 'manage', label: 'Full' }];
const ROLES = [
  { id: 'support', t: 'Student support', d: 'Students, orders and payments', p: { students: 'manage', store: 'manage', payments: 'view', results: 'view' } },
  { id: 'academic', t: 'Test creator', d: 'Tests, questions, results', p: { content: 'manage', results: 'view', integrity: 'view' } },
  { id: 'commerce', t: 'Store manager', d: 'Store, orders, payments, promotions', p: { store: 'manage', payments: 'manage', promotions: 'manage', students: 'view' } },
  { id: 'marketing', t: 'Marketing', d: 'Banners, notices, reviews, promotions', p: { messaging: 'manage', reviews: 'manage', promotions: 'view' } },
  { id: 'viewer', t: 'Viewer', d: 'Can see everything, change nothing', p: Object.fromEntries(AX.MODS.map(m => [m, 'view'])) }
];
// readable names for the activity log
const ACT = {
  'session:sign_in': 'Signed in', 'session:sign_out': 'Signed out',
  'cbt_admin:student_add': 'Added a student', 'cbt_admin:student_approve': 'Approved an access request', 'cbt_admin:student_code': 'Made a new access code',
  'cbt_admin:student_block': 'Blocked / unblocked a student', 'cbt_admin:student_devices_reset': 'Reset devices', 'cbt_admin:student_update': 'Edited a student',
  'cbt_admin:student_delete': 'Deleted a student', 'cbt_admin:grant': 'Changed series access', 'cbt_admin:series_save': 'Saved a series', 'cbt_admin:series_delete': 'Deleted a series',
  'cbt_admin:folder_save': 'Saved a folder', 'cbt_admin:folder_delete': 'Deleted a folder', 'cbt_admin:test_save': 'Saved a test', 'cbt_admin:test_delete': 'Deleted a test',
  'cbt_admin:test_stage': 'Uploaded questions', 'cbt_admin:series_cover': 'Changed a series cover', 'cbt_admin:file_put': 'Uploaded a file', 'cbt_admin:file_delete': 'Deleted a file',
  'cbt_admin:report_status': 'Resolved a question report', 'cbt_admin:report_delete': 'Deleted a question report', 'cbt_admin:result_delete': 'Deleted a result',
  'cbt_admin:set_password': 'Changed the admin password', 'cbt_admin:ping': 'Sent a phone notification',
  'cbt_admin2:duplicate': 'Duplicated a test', 'cbt_admin_practice:set': 'Changed practice mode',
  'cbt_admin_store:save_item': 'Saved a store item', 'cbt_admin_store:delete_item': 'Deleted a store item', 'cbt_admin_store:save_settings': 'Changed store settings',
  'cbt_admin_store:order_status': 'Changed an order status', 'cbt_admin_store_order:contacted': 'Logged a follow-up', 'cbt_admin_store_order:note': 'Wrote an order note',
  'cbt_admin_store_schedule:call': 'Uploaded a schedule', 'cbt_admin_store_layout:place': 'Arranged the store', 'cbt_admin_store_layout:order': 'Reordered the store', 'cbt_admin_store_layout:sections': 'Edited store sections',
  'cbt_admin_store_explore:desc': 'Edited a series page', 'cbt_admin_store_explore:demo_save': 'Saved a demo test', 'cbt_admin_store_explore:demo_delete': 'Removed a demo test',
  'cbt_admin_store_launch:buy': 'Turned Buy now on/off', 'cbt_admin_store_launch:notified': 'Marked the waiting list notified', 'cbt_admin_store_launch:delete': 'Removed from a waiting list',
  'cbt_admin_payments:add': 'Added a payment', 'cbt_admin_payments:update': 'Edited a payment', 'cbt_admin_payments:delete': 'Deleted a payment',
  'cbt_admin_promos:create': 'Created a promotion link', 'cbt_admin_promos:update': 'Edited a promotion link', 'cbt_admin_promos:payout_add': 'Recorded a payout', 'cbt_admin_promos:payout_delete': 'Deleted a payout', 'cbt_admin_promos:set_valid': 'Changed an order count', 'cbt_admin_promos:delete': 'Deleted a promotion link',
  'cbt_admin_banners:save': 'Saved a banner', 'cbt_admin_banners:toggle': 'Switched a banner', 'cbt_admin_banners:delete': 'Deleted a banner', 'cbt_admin_banners:order': 'Reordered banners',
  'cbt_admin_ann:save': 'Saved a notice', 'cbt_admin_ann:toggle': 'Switched a notice', 'cbt_admin_ann:delete': 'Deleted a notice',
  'cbt_admin_reviews:status': 'Moderated a review', 'cbt_admin_reviews:reply': 'Replied to a review', 'cbt_admin_reviews:pin': 'Pinned a review', 'cbt_admin_reviews:delete': 'Deleted a review', 'cbt_admin_reviews:remove_photo': 'Removed a review photo', 'cbt_admin_reviews:moderate': 'Changed review moderation',
  'cbt_admin_cheat:flag': 'Tagged cheating', 'cbt_admin_cheat:unflag': 'Removed a cheating tag', 'cbt_admin_cheat:suspend': 'Suspended a student', 'cbt_admin_cheat:lift': 'Lifted a suspension',
  'cbt_admin_pyq:bulk': 'Added PYQ questions', 'cbt_admin_pyq:update': 'Edited a PYQ question', 'cbt_admin_pyq:delete': 'Deleted a PYQ question', 'cbt_admin_pyq:delete_paper': 'Deleted a PYQ paper',
  'cbt_admin_team:user_save': 'Saved a team member', 'cbt_admin_team:user_delete': 'Removed a team member', 'cbt_admin_team:session_revoke': 'Signed out a session',
  'cbt_admin_team:sessions_revoke': 'Signed out sessions', 'cbt_admin_team:owner_password': 'Changed the owner password', 'cbt_admin_team:self_password': 'Changed own password', 'cbt_admin_team:self_revoke': 'Signed out own session'
};
const actName = a => ACT[a.fn + ':' + a.act] || (a.fn.replace(/^cbt_admin_?/, '') || 'admin') + ' · ' + a.act.replace(/_/g, ' ');
const permText = p => { const k = Object.keys(p || {}); if (!k.length) return 'No access yet'; return k.map(m => (AX.MOD_INFO[m] || { t: m }).t + (p[m] === 'manage' ? '' : ' (view)')).join(' · '); };
const devIcon = d => /iphone|android|ipad/i.test(d || '') ? 'smartphone' : 'monitor';
const isOnline = s => s.active && Date.now() - Date.parse(s.last_seen) < 180000;

async function load(force) {
  if (!force && T.at && Date.now() - T.at < 15000) return { ok: true };
  const r = await AX.api.call('cbt_admin_team', 'get');
  if (r.ok) { T.users = r.users || []; T.sessions = r.sessions || []; T.audit = r.audit || []; T.current = r.current; T.at = Date.now(); }
  return r;
}

AX.mod({
  id: 'team', title: 'Team & access', short: 'Team', icon: 'team', group: 'Workspace', order: 10, perm: 'any',
  sub: 'Who can use the admin console, what each person may do, and where it is signed in.',
  async render(ctx) {
    if (AX.session.legacy) {
      ctx.head({ title: 'Team & access' });
      return AX.set(ctx.el, h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time database update needed', text: 'Run supabase_v35_admin_team.sql once in Supabase → SQL Editor. Then sign out and sign in again to add team members, choose their permissions, see where the panel is signed in and sign out any device.' })}</div>`);
    }
    if (!AX.isOwner()) return renderSelf(ctx);
    const tab = ctx.parts[0] || 'members';
    ctx.head({ title: 'Team & access', sub: 'Give each person only the access they need. Every change is checked by the database and written to the activity log.',
      tabs: [{ id: 'members', title: 'Members', icon: 'users' }, { id: 'sessions', title: 'Where signed in', icon: 'device' }, { id: 'activity', title: 'Activity log', icon: 'history' }, { id: 'security', title: 'Password', icon: 'key' }], tab,
      actions: tab === 'members' ? h`<button class="btn pri" data-act="add">${icon('userPlus', 17)} Add member</button>` : tab === 'sessions' ? h`<button class="btn danger" data-act="outAll">${icon('logout', 16)} Sign out everyone else</button>` : '' });
    const ph = document.getElementById('ax-ph');
    if (ph && !ph.__w) { ph.__w = 1; AX.act(ph, { add: () => editMember(null, ctx), outAll: () => revokeAll(ctx) }); }
    if (tab === 'security') return security(ctx);
    AX.set(ctx.el, UI.skeleton(4));
    const r = await load(true);
    if (!ctx.alive()) return;
    if (!r.ok) { AX.set(ctx.el, UI.errorBox(r, 'supabase_v35_admin_team.sql')); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    if (tab === 'sessions') return sessions(ctx);
    if (tab === 'activity') return activity(ctx);
    members(ctx);
  },
  attention() { return []; },
  search(q) {
    if (!AX.isOwner() || AX.session.legacy) return [];
    return T.users.filter(u => (u.name + ' ' + u.username).toLowerCase().includes(q)).map(u => ({ g: 'Team', title: u.name, sub: '@' + u.username, icon: 'team', go: '#/team/members' }));
  }
});
AX.creates.push({ label: 'Team member', icon: 'userPlus', perm: ['owner'], run() { AX.go('team/members'); setTimeout(() => editMember(null, null), 250); } });

/* ---------- members ---------- */
function members(ctx) {
  const act = T.sessions.filter(s => s.active);
  const online = T.users.filter(u => u.online).length;
  AX.set(ctx.el, h`<div class="kpis">
      ${UI.kpi({ label: 'Team members', value: T.users.length, icon: 'team', foot: T.users.filter(u => u.active).length + ' active' })}
      ${UI.kpi({ label: 'Online now', value: online + (act.some(s => !s.user_id && isOnline(s)) ? 1 : 0), icon: 'live', tone: 'info', foot: 'in the last 3 minutes' })}
      ${UI.kpi({ label: 'Signed-in devices', value: act.length, icon: 'device', tone: 'gold', foot: 'owner + team', go: '#/team/sessions' })}
      ${UI.kpi({ label: 'Refused requests', value: T.audit.filter(a => a.result === 'refused').length, icon: 'shield', tone: 'bad', foot: 'latest 300 log entries', go: '#/team/activity?f=refused' })}
    </div>
    <div class="section-t">Owner</div>
    <div class="card row" style="gap:14px">${UI.avatar('Owner', 'owner', 'lg')}<div class="grow"><div class="row gap6"><b class="lg">You</b>${UI.pill('Owner', 'gold')}</div><div class="sm mut">Full access to everything, including this page. Signed in on ${fmt.plural(act.filter(s => !s.user_id).length, 'device')}.</div></div><a class="btn sm" href="#/team/sessions">${icon('device', 15)} Devices</a></div>
    <div class="section-t">Team members</div>
    ${T.users.length ? h`<div class="grid g2">${join(T.users, u => {
      const ss = T.sessions.filter(s => s.user_id === u.id && s.active);
      return h`<div class="card"><div class="row top">${UI.avatar(u.name, u.username)}<div class="grow"><div class="row gap6 wrap"><b class="ell">${u.name}</b>${!u.active ? UI.pill('Paused', 'warn') : u.online ? h`<span class="pill ok"><span class="live-dot"></span> Online</span>` : ''}</div><div class="xs mut mono">@${u.username}</div></div>
        <button class="ibtn sm" data-act="menu" data-id="${u.id}" aria-label="More">${icon('moreV', 17)}</button></div>
        <div class="chips mt12">${Object.keys(u.perms || {}).length ? join(AX.MODS.filter(m => (u.perms || {})[m]), m => h`<span class="pill ${u.perms[m] === 'manage' ? 'pri' : ''}">${AX.MOD_INFO[m].t}${u.perms[m] === 'manage' ? '' : ' · view'}</span>`) : UI.pill('No access yet', 'warn')}</div>
        ${u.note ? h`<p class="sm mut mt12">${u.note}</p>` : ''}
        <div class="divider"></div>
        <div class="row xs mut wrap"><span>${icon('clock', 13)} Last sign-in ${u.last_login ? fmt.ago(u.last_login) : 'never'}</span><span>·</span><span>${fmt.plural(ss.length, 'device')}</span><span class="grow"></span><button class="btn xs" data-act="edit" data-id="${u.id}">${icon('edit', 13)} Edit access</button></div></div>`;
    })}</div>` : h`<div class="card">${UI.empty({ icon: 'team', title: 'No team members yet', text: 'Add a person, give them a username and password, and choose exactly what they can see or change. You stay the only owner.', action: h`<button class="btn pri" data-act="add">${icon('userPlus', 17)} Add first member</button>` })}</div>`}`);
  AX.act(ctx.el, {
    add: () => editMember(null, ctx),
    edit: el => editMember(T.users.find(u => u.id === el.dataset.id), ctx),
    menu: el => {
      const u = T.users.find(x => x.id === el.dataset.id);
      UI.menu(el, [
        { label: 'Edit access', icon: 'edit', fn: () => editMember(u, ctx) },
        { label: 'Set a new password', icon: 'key', fn: () => newPassword(u, ctx) },
        { label: 'Sign out all their devices', icon: 'logout', fn: () => revokeUser(u, ctx) },
        { label: u.active ? 'Pause account' : 'Resume account', icon: u.active ? 'pause' : 'play', fn: () => pause(u, ctx) },
        { sep: true }, { label: 'Remove from team', icon: 'trash', tone: 'danger', fn: () => removeMember(u, ctx) }
      ]);
    }
  });
}
function genPw() { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = new Uint32Array(12); crypto.getRandomValues(s); return [...s].map(x => a[x % a.length]).join('').replace(/^(.{4})(.{4})/, '$1-$2-'); }
function panelLink() { const k = AX.ls.get('adm_k', null) || (() => { try { return localStorage.getItem('adm_k'); } catch (e) { return ''; } })(); return location.origin + location.pathname.replace(/zz-cxtest\.html$/, 'cp-dt764twzf54s5m.html') + (k ? '#k=' + k : ''); }
function editMember(u, ctx) {
  const isNew = !u; u = u || { name: '', username: '', perms: {}, active: true, note: '' };
  let perms = Object.assign({}, u.perms || {});
  const matrix = () => join(AX.MODS, m => h`<div class="li" style="padding:12px 0"><div class="grow"><div class="b">${AX.MOD_INFO[m].t}</div><div class="xs mut">${AX.MOD_INFO[m].d}</div></div>
      <div class="seg" data-pm="${m}">${join(LEVELS, l => h`<button type="button" data-v="${l.value}" class="${(perms[m] || '') === l.value ? 'on' : ''}">${l.label}</button>`)}</div></div>`);
  const m = UI.drawer({
    title: isNew ? 'Add team member' : 'Edit ' + u.name, sub: isNew ? 'They sign in with the username and password you set here.' : '@' + u.username, size: 'wide',
    body: h`<form id="mf" class="col gap20" autocomplete="off">
      <div class="form-grid">
        ${AX.f.input({ name: 'name', label: 'Full name', value: u.name, max: 60, required: true, placeholder: 'e.g. Ravi Kumar' })}
        ${AX.f.input({ name: 'username', label: 'Username', value: u.username, max: 30, placeholder: 'e.g. ravi.k', hint: '3–30 letters, numbers, dot, dash or underscore', auto: 'off' })}
        <div class="fld full"><label for="f-password">${isNew ? 'Password' : 'New password (leave empty to keep the current one)'}</label><div class="row"><div class="inp-wrap grow"><input class="inp mono" id="f-password" name="password" type="text" value="${isNew ? genPw() : ''}" autocomplete="new-password" placeholder="${isNew ? '' : 'Unchanged'}" maxlength="72"></div><button type="button" class="btn" data-act="gen">${icon('sparkle', 16)} Generate</button></div><div class="hint">At least 8 characters. ${isNew ? 'Share it privately; they can change it after signing in.' : 'A new password signs them out everywhere.'}</div><div class="err" data-err="password"></div></div>
        ${AX.f.input({ name: 'note', label: 'Note (only you see this)', value: u.note, max: 200, placeholder: 'e.g. Handles WhatsApp support, evening shift', full: true })}
      </div>
      <div><div class="row between wrap"><div><div class="b lg">What can they do?</div><div class="sm mut">View = can see. Full = can see and change. Team & access, passwords and sessions stay with the owner.</div></div></div>
        <div class="chips mt12">${join(ROLES, r => h`<button type="button" class="chip" data-role="${r.id}" title="${r.d}">${r.t}</button>`)}<button type="button" class="chip" data-role="none">Clear all</button></div>
        <div class="card flat mt12" style="padding:4px 16px" id="pm">${matrix()}</div></div>
      ${!isNew ? AX.f.switch({ name: 'active', value: u.active !== false, label: 'Account active', hint: 'Pausing signs them out at once; they cannot sign in until you resume.' }) : ''}
    </form>`,
    foot: h`${!isNew ? h`<button class="btn ghost danger" data-act="del">${icon('trash', 16)} Remove</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} ${isNew ? 'Add member' : 'Save changes'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#mf'); UI.wire(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-pm] button'); if (b) { const g = b.parentElement; perms[g.dataset.pm] = b.dataset.v; if (!b.dataset.v) delete perms[g.dataset.pm]; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return; }
        const r = e.target.closest('[data-role]'); if (r) { const ro = ROLES.find(x => x.id === r.dataset.role); perms = ro ? Object.assign({}, ro.p) : {}; AX.set(el.querySelector('#pm'), matrix()); return; }
      });
      AX.act(el, {
        gen() { f.querySelector('[name=password]').value = genPw(); },
        del() { close(); removeMember(u, ctx); },
        async save(btn) {
          AX.f.clearErrors(f);
          const d = AX.f.read(f);
          d.username = String(d.username || '').trim().toLowerCase(); d.name = String(d.name || '').trim();
          if (d.name.length < 2) return AX.f.error(f, 'name', 'Enter the full name');
          if (!/^[a-z0-9._-]{3,30}$/.test(d.username) || d.username === 'owner') return AX.f.error(f, 'username', '3–30 letters, numbers, dot, dash or underscore');
          if ((isNew || d.password) && String(d.password).length < 8) return AX.f.error(f, 'password', 'At least 8 characters');
          if (!Object.keys(perms).length && !(await UI.confirm({ title: 'No access selected', text: 'This member will be able to sign in but will not see any section. Save anyway?', yes: 'Save anyway' }))) return;
          await UI.busy(btn, async () => {
            const r = await AX.api.call('cbt_admin_team', 'user_save', { id: isNew ? null : u.id, name: d.name, username: d.username, password: d.password || '', perms, note: d.note || '', active: isNew ? true : !!d.active });
            if (!r.ok) {
              if (r.error === 'taken') return AX.f.error(f, 'username', 'This username is already used');
              if (r.error === 'username') return AX.f.error(f, 'username', 'Use 3–30 letters, numbers, dot, dash or underscore');
              if (r.error === 'password') return AX.f.error(f, 'password', 'At least 8 characters');
              return UI.err(r);
            }
            close(); T.at = 0;
            if (isNew || d.password) share(d.name, d.username, d.password, isNew);
            else UI.toast('Access updated for ' + d.name);
            if (ctx && ctx.alive()) ctx.reload();
          });
        }
      });
    }
  });
}
function share(name, username, password, isNew) {
  const link = panelLink();
  const msg = `Hi ${name.split(' ')[0]}, ${isNew ? 'you have been added to the Aspiron admin team' : 'your Aspiron admin password was changed'}.\n\nOpen: ${link}\nSign in as "Team member"\nUsername: ${username}\nPassword: ${password}\n\nPlease keep these private. You can change the password after signing in.`;
  window._cxShare = msg;
  UI.modal({ title: isNew ? 'Member added' : 'Password changed', sub: 'Send these sign-in details privately.', size: 'narrow',
    body: h`<div class="callout ok">${icon('checkCircle')}<div><b>${name}</b> can sign in now.</div></div>
      <dl class="kv mt16"><dt>Username</dt><dd class="mono">${username}</dd><dt>Password</dt><dd class="mono">${password}</dd><dt>Link</dt><dd class="xs mono">${link}</dd></dl>
      <div class="well mt16 sm" style="white-space:pre-wrap">${msg}</div>`,
    foot: h`<button class="btn" data-act="copy">${icon('copy', 16)} Copy</button><a class="btn soft" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    onOpen(el) { AX.act(el, { async copy() { if (await AX.u.copy(window._cxShare)) UI.toast('Copied'); } }); } });
}
async function newPassword(u, ctx) {
  const pw = genPw();
  const ok = await UI.confirm({ title: 'Set a new password for ' + u.name + '?', text: 'They will be signed out on every device and need the new password to sign in.', yes: 'Set new password' });
  if (!ok) return;
  const r = await AX.api.call('cbt_admin_team', 'user_save', { id: u.id, name: u.name, username: u.username, password: pw, perms: u.perms, note: u.note, active: u.active });
  if (!r.ok) return UI.err(r);
  T.at = 0; share(u.name, u.username, pw, false); if (ctx && ctx.alive()) ctx.reload();
}
async function pause(u, ctx) {
  if (u.active && !(await UI.confirm({ title: 'Pause ' + u.name + '?', text: 'They are signed out at once and cannot sign in until you resume the account.', yes: 'Pause account', tone: 'danger' }))) return;
  const r = await AX.api.call('cbt_admin_team', 'user_save', { id: u.id, name: u.name, username: u.username, password: '', perms: u.perms, note: u.note, active: !u.active });
  if (!r.ok) return UI.err(r);
  UI.toast(u.active ? u.name + ' is paused' : u.name + ' can sign in again'); T.at = 0; ctx.reload();
}
async function removeMember(u, ctx) {
  if (!(await UI.confirm({ title: 'Remove ' + u.name + '?', text: 'Their account is deleted and every device they use is signed out. Their past actions stay in the activity log.', yes: 'Remove', tone: 'danger', typeWord: 'REMOVE' }))) return;
  const r = await AX.api.call('cbt_admin_team', 'user_delete', { id: u.id });
  if (!r.ok) return UI.err(r);
  UI.toast(u.name + ' removed'); T.at = 0; if (ctx && ctx.alive()) ctx.reload();
}
async function revokeUser(u, ctx) {
  if (!(await UI.confirm({ title: 'Sign out ' + u.name + ' everywhere?', text: 'Every device they are signed in on is signed out now. They can sign in again with their password.', yes: 'Sign out', tone: 'danger' }))) return;
  const r = await AX.api.call('cbt_admin_team', 'sessions_revoke', { user_id: u.id });
  if (!r.ok) return UI.err(r);
  UI.toast(fmt.plural(r.count || 0, 'session') + ' signed out'); T.at = 0; ctx.reload();
}
async function revokeAll(ctx) {
  const c = await UI.confirm({ title: 'Sign out everyone else?', text: 'Every other session — your other devices and all team members — is signed out now. This device stays signed in.', yes: 'Sign out everyone', tone: 'danger' });
  if (!c) return;
  const r = await AX.api.call('cbt_admin_team', 'sessions_revoke', {});
  if (!r.ok) return UI.err(r);
  UI.toast(fmt.plural(r.count || 0, 'session') + ' signed out'); T.at = 0; ctx.reload();
}

/* ---------- where signed in ---------- */
function sessions(ctx) {
  const act = T.sessions.filter(s => s.active), ended = T.sessions.filter(s => !s.active).slice(0, 30);
  const row = s => h`<div class="li"><span class="av" style="--c:${s.user_id ? AX.u.hue(s.who) : '#c9a45c'}">${icon(devIcon(s.device), 18)}</span>
    <div class="grow"><div class="row gap6 wrap"><b>${s.device || 'Unknown device'}</b>${s.id === T.current ? UI.pill('This device', 'pri') : ''}${isOnline(s) ? h`<span class="pill ok"><span class="live-dot"></span> Active now</span>` : ''}</div>
      <div class="xs mut">${s.who}${s.user_id ? '' : ' (owner)'} · ${s.ip ? 'IP ' + s.ip + ' · ' : ''}signed in ${fmt.ago(s.created_at)}${s.active ? ' · last active ' + fmt.ago(s.last_seen) : ' · ended ' + fmt.ago(s.revoked_at || s.expires_at) + (s.revoked_by ? ' by ' + s.revoked_by : ' (expired)')}</div></div>
    ${s.active && s.id !== T.current ? h`<button class="btn sm danger" data-act="out" data-id="${s.id}">${icon('logout', 14)} Sign out</button>` : ''}</div>`;
  AX.set(ctx.el, h`<div class="callout info">${icon('info')}<div class="sm">This is every place the admin console is signed in. If you see a device you do not recognise, sign it out and change that person's password. A session also ends by itself after 7 days without use.</div></div>
    <div class="section-t">Signed in now · ${act.length}</div>
    <div class="card pad0 list">${act.length ? join(act, row) : UI.empty({ icon: 'device', title: 'No other sessions' })}</div>
    ${ended.length ? h`<div class="section-t">Recently ended</div><div class="card pad0 list" style="opacity:.8">${join(ended, row)}</div>` : ''}`);
  AX.act(ctx.el, {
    async out(el) {
      const s = T.sessions.find(x => x.id === el.dataset.id);
      if (!(await UI.confirm({ title: 'Sign out this device?', text: (s.who || '') + ' · ' + (s.device || '') + ' will be signed out now.', yes: 'Sign out', tone: 'danger' }))) return;
      const r = await AX.api.call('cbt_admin_team', 'session_revoke', { id: s.id });
      if (!r.ok) return UI.err(r);
      UI.toast('Signed out'); T.at = 0; ctx.reload();
    }
  });
}

/* ---------- activity log ---------- */
function activity(ctx) {
  const f = ctx.q.f || 'all', who = ctx.q.who || '';
  const people = [...new Set(T.audit.map(a => a.who))];
  let L = T.audit;
  if (f === 'changes') L = L.filter(a => a.fn !== 'session' && a.result !== 'refused');
  if (f === 'refused') L = L.filter(a => a.result === 'refused');
  if (f === 'signins') L = L.filter(a => a.fn === 'session');
  if (who) L = L.filter(a => a.who === who);
  const day = a => new Date(a.at).toDateString();
  let last = '';
  AX.set(ctx.el, h`<div class="row wrap gap16" style="margin-bottom:16px"><div class="chips">${join([['all', 'All'], ['changes', 'Changes'], ['signins', 'Sign-ins'], ['refused', 'Refused']], ([k, l]) => h`<a class="chip ${f === k ? 'on' : ''} ${k === 'refused' ? 'alert' : ''}" href="${AX.link('team/activity', Object.assign({ f: k }, who ? { who } : {}))}">${l}<em>${k === 'all' ? T.audit.length : k === 'refused' ? T.audit.filter(a => a.result === 'refused').length : k === 'signins' ? T.audit.filter(a => a.fn === 'session').length : T.audit.filter(a => a.fn !== 'session' && a.result !== 'refused').length}</em></a>`)}</div>
      <span class="grow"></span><select class="inp sm" style="width:auto" data-act="who" aria-label="Person"><option value="">Everyone</option>${join(people, p => h`<option ${p === who ? raw('selected') : ''}>${p}</option>`)}</select>
      <button class="btn sm" data-act="csv">${icon('download', 15)} CSV</button></div>
    <div class="card">${L.length ? h`<div class="timeline">${join(L, a => { const d = day(a), head = d !== last ? (last = d, h`<div class="section-t" style="margin:6px 0 10px">${fmt.day(a.at)}</div>`) : ''; return h`${head}<div class="tl-i ${a.result === 'refused' ? 'bad' : a.fn === 'session' ? 'mut' : a.result ? 'gold' : ''}"><div class="row wrap gap6"><b>${a.who}</b><span class="tx2">${actName(a)}</span>${a.detail ? h`<span class="pill">${a.detail}</span>` : ''}${a.result === 'refused' ? UI.pill('Refused · no permission', 'bad') : a.result ? UI.pill('Failed: ' + a.result, 'warn') : ''}</div><div class="xs mut">${fmt.time(a.at)}${a.ip ? ' · ' + a.ip : ''}</div></div>`; })}</div>`
      : UI.empty({ icon: 'history', title: 'Nothing here yet', text: 'Changes made from the console show up here: who did what, and when.' })}
      ${T.more !== false && T.audit.length >= 300 ? h`<div class="row end mt12"><button class="btn sm" data-act="more">Load older</button></div>` : ''}</div>`);
  T.view = L;
  if (ctx.el.__act) return;      // the listeners below read T and the route, so they are added once per page
  ctx.el.__act = 1;
  AX.act(ctx.el, {
    csv() { AX.u.csvDownload('activity-log.csv', [['Time', 'Who', 'Action', 'Detail', 'Result', 'IP'], ...(T.view || L).map(a => [new Date(a.at).toLocaleString('en-IN'), a.who, actName(a), a.detail, a.result || 'done', a.ip])]); },
    async more(b) { await UI.busy(b, async () => { const r = await AX.api.call('cbt_admin_team', 'get', { before: T.audit[T.audit.length - 1].id }); if (r.ok) { const old = r.audit || []; T.more = old.length >= 300; T.audit = T.audit.concat(old.filter(a => !T.audit.some(x => x.id === a.id))); activity(ctx); } }); }
  });
  AX.act(ctx.el, { who: el => AX.go('team/activity', Object.assign({ f }, el.value ? { who: el.value } : {})) }, 'change');
}

/* ---------- owner password ---------- */
function score(p) { let s = 0; if (p.length >= 10) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return Math.min(4, s); }
function security(ctx) {
  AX.set(ctx.el, h`<div class="grid g2" style="align-items:start">
    <form class="card" id="pf" autocomplete="off"><div class="card-h">${icon('key')}<h3>Change the owner password</h3></div>
      <div class="col gap16">${AX.f.input({ name: 'current', label: 'Current password', type: 'password', auto: 'current-password' })}
      ${AX.f.input({ name: 'new_pw', label: 'New password', type: 'password', auto: 'new-password', hint: 'At least 10 characters with letters, numbers and a symbol.' })}
      <div class="bar-meter"><i id="pw-m" style="width:0%"></i></div>
      ${AX.f.input({ name: 'again', label: 'Repeat the new password', type: 'password', auto: 'new-password' })}
      <button class="btn pri" data-act="save" type="button">${icon('check', 16)} Change password</button></div></form>
    <div class="col gap16"><div class="callout gold">${icon('shieldCheck')}<div class="sm"><b>What happens</b><br>Your other devices are signed out. Team members keep working with their own passwords. The old style of signing in with this password (backup panel, phone-notification sender) uses the new password at once.</div></div>
      <div class="card"><div class="card-h">${icon('info')}<h3>Good habits</h3></div><ul class="sm tx2" style="margin:0;padding-left:18px;line-height:1.8"><li>Give each person their own team account. Never share the owner password.</li><li>Use View access when someone only needs to look.</li><li>Check “Where signed in” now and then and sign out devices you don't know.</li><li>Pause an account the day someone stops working with you.</li></ul></div></div></div>`);
  const f = ctx.el.querySelector('#pf'); UI.wire(f);
  f.querySelector('[name=new_pw]').addEventListener('input', e => { const s = score(e.target.value); const m = f.querySelector('#pw-m'); m.style.width = (s * 25) + '%'; m.style.background = s < 2 ? 'var(--bad)' : s < 3 ? 'var(--warn)' : ''; });
  AX.act(f, { async save(btn) {
    AX.f.clearErrors(f); const d = AX.f.read(f);
    if (!d.current) return AX.f.error(f, 'current', 'Enter your current password');
    if (d.new_pw.length < 10 || score(d.new_pw) < 3) return AX.f.error(f, 'new_pw', 'Use at least 10 characters with letters, numbers and a symbol');
    if (d.new_pw !== d.again) return AX.f.error(f, 'again', 'The two passwords are different');
    await UI.busy(btn, async () => {
      const r = await AX.api.call('cbt_admin_team', 'owner_password', { current: d.current, new_pw: d.new_pw });
      if (!r.ok) return r.error === 'current_pw' ? AX.f.error(f, 'current', 'The current password is wrong') : UI.err(r);
      f.reset(); UI.toast('Password changed. Your other devices were signed out.');
    });
  } });
}

/* ---------- a team member's own page ---------- */
async function renderSelf(ctx) {
  ctx.head({ title: 'My account', sub: 'Your sign-ins and password. The owner decides what you can see and change.' });
  const r = await AX.api.call('cbt_admin_team', 'self_sessions');
  if (!ctx.alive()) return;
  const me = AX.session.me || {}, ss = (r.ok && r.sessions) || [];
  AX.set(ctx.el, h`<div class="grid g2" style="align-items:start">
    <div class="col gap16"><div class="card"><div class="row">${UI.avatar(me.name, me.username, 'lg')}<div class="grow"><b class="lg">${me.name}</b><div class="sm mut mono">@${me.username}</div></div></div>
      <div class="section-t">Your access</div><div class="chips">${Object.keys(me.perms || {}).length ? join(AX.MODS.filter(m => me.perms[m]), m => UI.pill(AX.MOD_INFO[m].t + (me.perms[m] === 'manage' ? ' · full' : ' · view'), me.perms[m] === 'manage' ? 'pri' : '')) : UI.pill('No access yet — ask the owner', 'warn')}</div></div>
      <div class="card pad0"><div class="card-h" style="padding:16px 16px 0">${icon('device')}<h3>Signed in on</h3></div><div class="list">${ss.length ? join(ss, s => h`<div class="li">${icon(devIcon(s.device), 18)}<div class="grow"><b>${s.device || 'Device'}</b> ${s.id === r.current ? UI.pill('This device', 'pri') : ''}<div class="xs mut">${s.ip ? 'IP ' + s.ip + ' · ' : ''}last active ${fmt.ago(s.last_seen)}</div></div>${s.id !== r.current ? h`<button class="btn sm danger" data-act="out" data-id="${s.id}">Sign out</button>` : ''}</div>`) : UI.empty({ icon: 'device', title: 'Only this device' })}</div></div></div>
    <form class="card" id="sp" autocomplete="off"><div class="card-h">${icon('key')}<h3>Change my password</h3></div><div class="col gap16">
      ${AX.f.input({ name: 'current', label: 'Current password', type: 'password', auto: 'current-password' })}
      ${AX.f.input({ name: 'new_pw', label: 'New password', type: 'password', auto: 'new-password', hint: 'At least 8 characters.' })}
      ${AX.f.input({ name: 'again', label: 'Repeat new password', type: 'password', auto: 'new-password' })}
      <button class="btn pri" type="button" data-act="pw">${icon('check', 16)} Change password</button></div></form></div>`);
  UI.wire(ctx.el);
  AX.act(ctx.el, {
    async out(el) { const x = await AX.api.call('cbt_admin_team', 'self_revoke', { id: el.dataset.id }); if (!x.ok) return UI.err(x); UI.toast('Signed out'); ctx.reload(); },
    async pw(btn) {
      const f = ctx.el.querySelector('#sp'); AX.f.clearErrors(f); const d = AX.f.read(f);
      if (d.new_pw.length < 8) return AX.f.error(f, 'new_pw', 'At least 8 characters');
      if (d.new_pw !== d.again) return AX.f.error(f, 'again', 'The two passwords are different');
      await UI.busy(btn, async () => { const x = await AX.api.call('cbt_admin_team', 'self_password', { current: d.current, new_pw: d.new_pw }); if (!x.ok) return x.error === 'current_pw' ? AX.f.error(f, 'current', 'The current password is wrong') : UI.err(x); f.reset(); UI.toast('Password changed. Other devices were signed out.'); });
    }
  });
}
})();
