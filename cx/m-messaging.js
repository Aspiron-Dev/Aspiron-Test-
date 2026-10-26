/* =====================================================================
   Broadcasts: notices (bell + Home of the student app), home banners, phone notifications.
   Server: cbt_admin_ann (base setup), cbt_admin_banners (v9), cbt_admin_push_count (v10), send-push Edge Function,
   cbt_admin_ann_aud (v36: who gets a notice — everyone or chosen test series — and who has read it).
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('messaging', 'manage');
const LINK_RE = /^(https?:\/\/|#\/)/i;

// image compression like the old panel: width capped, JPEG, kept under ~260k characters
async function squeeze(file, maxW, q) {
  let d = await AX.u.compressImage(file, { max: maxW, quality: q });
  while (d.length > 260000 && q > 0.45) { q -= 0.1; d = await AX.u.compressImage(file, { max: maxW, quality: q }); }
  if (d.length > 260000) d = await AX.u.compressImage(file, { max: Math.round(maxW * 0.7), quality: 0.6 });
  return d;
}
// sends page by page (AX.api.push) and says how it went: sent / failed (with the reason) / old addresses removed
async function push(o) {
  const t = UI.toast(o.series && o.series.length ? 'Sending to the chosen test series…' : 'Sending…');
  const r = await AX.api.push(o, x => { if (t && t.set) t.set('Sending… ' + fmt.num(x.sent) + ' sent'); });
  if (r.ok === false && !r.partial) {
    if (r.error === 'missing') return UI.toast('Phone notifications are not set up yet (send-push function).', { tone: 'warn' }), r;
    if (r.error === 'old_push') return UI.toast('Deploy the new send-push function first (supabase/functions/send-push). It is needed to send to chosen test series only.', { tone: 'bad' }), r;
    if (r.error === 'setup') return UI.toast('Run supabase_v36_notice_audience.sql first, to send to chosen test series only.', { tone: 'bad' }), r;
    return UI.toast('Phone notification failed: ' + (r.detail || r.error || 'error'), { tone: 'bad' }), r;
  }
  const why = r.hint ? ' ' + r.hint : '';
  if (r.partial) UI.toast('Stopped after ' + fmt.plural(r.sent, 'phone') + ' (' + (r.detail || r.error) + '). Send again to reach the rest.', { tone: 'bad' });
  else if (!r.total) UI.toast(o.series && o.series.length ? 'No phone in the chosen test series has notifications on yet' : 'No phones have turned on notifications yet', { tone: 'warn' });
  else if (r.failed) UI.toast('Sent to ' + fmt.num(r.sent) + ' of ' + fmt.plural(r.total, 'phone') + ' · ' + fmt.num(r.failed) + ' failed.' + why, { tone: 'warn' });
  else UI.toast('Sent to ' + fmt.plural(r.sent, 'phone') + (r.removed ? ' · ' + fmt.plural(r.removed, 'old address', 'old addresses') + ' removed' : ''));
  return r;
}

/* ---------- who gets it: everyone, or the students of chosen test series (v36) ---------- */
let AUD = null;        // cbt_admin_ann_aud 'get': {students, push_students, push_phones, audiences:{noticeId:[seriesIds]}, reads:{noticeId:n}, series:[…]}
const audOn = () => !!(AUD && AUD.ok);
async function audLoad() { AUD = await AX.api.call('cbt_admin_ann_aud', 'get'); return AUD; }
const audOf = id => (audOn() && AUD.audiences && AUD.audiences[id]) || [];
const serName = id => ((audOn() && AUD.series || []).find(s => s.id === id) || {}).title || 'Removed series';
function audPills(id) {
  if (!audOn()) return '';
  const a = audOf(id);
  return a.length ? join(a, x => UI.pill(serName(x), 'vio')) : UI.pill('Everyone', 'info');
}
function audPicker(sel) {
  if (!audOn()) return AUD && AUD.error === 'missing' ? h`<div class="callout info full">${icon('info')}<div class="sm">To send to one test series only (e.g. only Biology students), run <b>supabase_v36_notice_audience.sql</b> once in Supabase.</div></div>` : '';
  sel = sel || [];
  const list = AUD.series || [];
  return h`<div class="fld full" data-aud><label>Who gets it</label>
    ${AX.f.seg({ name: 'aud', value: sel.length ? 'series' : 'all', options: [{ value: 'all', label: 'Everyone' }, { value: 'series', label: 'Chosen test series' }] })}
    <div class="col gap6 mt8" data-aud-list ${sel.length ? '' : raw('hidden')}>${list.length ? join(list, s => AX.f.check({ name: 'as_' + s.id, value: sel.includes(s.id),
        label: s.title + (s.free ? ' (free)' : ''),
        hint: fmt.plural(s.students, 'student') + ' · ' + fmt.plural(s.phones, 'phone') + ' with notifications on' + (s.free ? ' · a free series = every student' : '') + (s.active === false ? ' · hidden series' : '') }))
      : h`<span class="sm mut">No test series yet.</span>`}</div>
    <div class="xs mut mt8" data-aud-sum></div></div>`;
}
// → [] everyone · [ids] chosen series · null "chosen series" but none ticked
function audRead(root) {
  const w = root.querySelector('[data-aud]'); if (!w) return [];
  const d = AX.f.read(w);
  if (d.aud !== 'series') return [];
  const ids = Object.keys(d).filter(k => k.indexOf('as_') === 0 && d[k]).map(k => k.slice(3));
  return ids.length ? ids : null;
}
function audWire(root) {
  const w = root.querySelector('[data-aud]'); if (!w) return;
  const sum = w.querySelector('[data-aud-sum]'), lst = w.querySelector('[data-aud-list]');
  let seq = 0;
  const upd = AX.u.debounce(async () => {
    const ids = audRead(root);
    lst.hidden = AX.f.read(w).aud !== 'series';
    if (ids === null) { sum.textContent = 'Tick at least one test series.'; return; }
    if (!ids.length) { sum.textContent = 'Every student (' + fmt.plural(AUD.students, 'student') + ') sees it · ' + fmt.plural(AUD.push_phones, 'phone') + ' get the phone notification.'; return; }
    const my = ++seq; sum.textContent = 'Counting…';
    const r = await AX.api.call('cbt_admin_ann_aud', 'preview', { series: ids });
    if (my !== seq || !sum.isConnected) return;
    sum.textContent = r.ok ? 'Only ' + fmt.plural(r.students, 'student') + ' of these series see it · ' + fmt.plural(r.phones, 'phone') + ' get the phone notification. Other students do not.' : 'Could not count the students.';
  }, 200);
  AX.f.wireSeg(w, upd); w.addEventListener('change', upd); upd();
}

AX.mod({
  id: 'messages', title: 'Broadcasts', icon: 'megaphone', group: 'Engagement', order: 10, perm: 'messaging',
  sub: 'Notices, home banners and phone notifications for students.',
  async render(ctx) {
    const tab = ctx.parts[0] || 'notices';
    ctx.head({ title: 'Broadcasts', sub: 'Talk to your students: notices in the app, banners on their Home, and notifications on their phone — to everyone or to one test series.',
      tabs: [{ id: 'notices', title: 'Notices', icon: 'bell' }, { id: 'banners', title: 'Home banners', icon: 'image' }, { id: 'push', title: 'Phone notification', icon: 'smartphone' }], tab,
      actions: can() ? (tab === 'notices' ? h`<button class="btn pri" data-act="newN">${icon('plus', 16)} New notice</button>` : tab === 'banners' ? h`<button class="btn pri" data-act="newB">${icon('plus', 16)} New banner</button>` : '') : '' });
    AX.act(document.getElementById('ax-ph'), { newN: () => notice(null, ctx), newB: () => banner(null, ctx) });
    if (tab === 'banners') return banners(ctx);
    if (tab === 'push') return pushPage(ctx);
    return notices(ctx);
  }
});
AX.creates.push({ label: 'Notice', icon: 'bell', perm: ['messaging', 'manage'], run() { AX.go('messages/notices'); setTimeout(() => notice(null, null), 300); } });
AX.creates.push({ label: 'Phone notification', icon: 'send', perm: ['messaging', 'manage'], run() { AX.go('messages/push'); } });

/* ---------- notices ---------- */
let NL = [];
async function notices(ctx) {
  AX.set(ctx.el, UI.skeleton(4));
  const [r, pc] = await Promise.all([AX.api.call('cbt_admin_ann', 'list'), AX.api.rpc('cbt_admin_push_count', {}), audLoad()]);
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Notices need the base database update (supabase_v7_update.sql). Run it once in Supabase → SQL Editor.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  NL = r.items || [];
  AX.set(ctx.el, h`${pushCard(pc)}
    <div class="callout info mt16">${icon('info')}<div class="sm">Students see notices under the 🔔 bell in the app. A notice for chosen test series is shown only to the students of those series${audOn() ? '' : ' (needs supabase_v36_notice_audience.sql)'}. Students can tap <b>“Haan, padh liya”</b> on each notice.</div></div>
    <div class="col gap16 mt16">${NL.length ? join(NL, n => h`<div class="card row top" style="gap:14px;${n.active ? '' : 'opacity:.62'}">
        <span class="av" style="--c:${n.active ? '#14b8a6' : '#64748b'}">${icon('bell', 18)}</span>
        <div class="grow"><div class="row wrap gap6"><b>${n.title || (n.text || '').slice(0, 50) || 'Photo'}</b>${n.active ? UI.pill('Live', 'ok', true) : UI.pill('Hidden')}${n.img ? UI.pill('Image', 'info') : ''}${n.link ? UI.pill('Link', 'vio') : ''}</div>
          ${audOn() ? h`<div class="row wrap gap6 mt6"><span class="xs mut">For:</span>${audPills(n.id)}</div>` : ''}
          ${n.text ? h`<p class="sm tx2 mt4" style="white-space:pre-wrap">${n.text.length > 220 ? n.text.slice(0, 220) + '…' : n.text}</p>` : ''}
          <div class="row wrap gap6 mt8"><span class="xs mut">${fmt.dt(n.at)}${n.link ? ' · ' + (n.label || 'Open link') + ' → ' + n.link : ''}</span>
            ${audOn() ? h`<button class="btn sm ghost" data-act="reads" data-id="${n.id}" title="Students who tapped “Haan, padh liya”">${icon('check', 14)} ${fmt.num((AUD.reads || {})[n.id] || 0)} read</button>` : ''}</div></div>
        ${can() ? h`<div class="row gap6"><button class="btn sm" data-act="edit" data-id="${n.id}">${icon('edit', 14)} Edit</button><button class="ibtn sm line" data-act="more" data-id="${n.id}" aria-label="More">${icon('moreV', 16)}</button></div>` : ''}</div>`)
      : h`<div class="card">${UI.empty({ icon: 'bell', title: 'No notices yet', text: 'Write a notice — e.g. "Mock Test 5 is live at 9 PM". Send it to everyone or only to one test series, and to students\' phones.', action: can() ? h`<button class="btn pri" data-act="new">${icon('plus', 16)} New notice</button>` : '' })}</div>`}</div>`);
  AX.act(ctx.el, {
    retry: () => ctx.reload(), new: () => notice(null, ctx), test: () => pushForm(true), check: btn => pushCheck(btn),
    edit: el => notice(NL.find(x => x.id === el.dataset.id), ctx),
    reads: el => readers(NL.find(x => x.id === el.dataset.id)),
    more(el) {
      const n = NL.find(x => x.id === el.dataset.id);
      UI.menu(el, [
        { label: n.active ? 'Hide from students' : 'Show to students', icon: n.active ? 'eyeOff' : 'eye', fn: async () => { const x = await AX.api.call('cbt_admin_ann', 'toggle', { id: n.id, active: !n.active }); if (!x.ok) return UI.err(x); UI.toast(n.active ? 'Hidden' : 'Shown to students'); ctx.reload(); } },
        { label: 'Send to phones now', icon: 'send', fn: () => pushForm(false, { title: n.title || 'New notice', body: (n.text || '').slice(0, 180) || 'Tap to read', url: '#/n', tag: 'ann-' + n.id, series: audOf(n.id) }) },
        { label: 'Who read it', icon: 'check', fn: () => readers(n) },
        { sep: true },
        { label: 'Delete', icon: 'trash', tone: 'danger', fn: async () => { if (!(await UI.confirm({ title: 'Delete this notice?', text: 'Students will no longer see it.', yes: 'Delete', tone: 'danger' }))) return; const x = await AX.api.call('cbt_admin_ann', 'delete', { id: n.id }); if (!x.ok) return UI.err(x); if (audOn()) AX.api.call('cbt_admin_ann_aud', 'forget', { id: n.id }); UI.toast('Deleted'); ctx.reload(); } }
      ]);
    }
  });
}
function pushCard(pc) {
  const reach = pc && pc.ok && audOn() && AUD.students ? h` <span class="sm mut">(${fmt.num(AUD.push_students)} of ${fmt.plural(AUD.students, 'student')} have turned them on; the others see notices only in the app.)</span>` : '';
  return h`<div class="card glass row wrap" style="gap:14px"><span class="av" style="--c:#6366f1">${icon('smartphone', 18)}</span>
    <div class="grow">${pc && pc.ok ? h`<b>${fmt.num(pc.students)} students</b> on <b>${fmt.plural(pc.phones, 'phone')}</b> get notices on their phone, even when the app is closed.${reach}` : h`<b>Phone notifications are not set up yet.</b> <span class="sm mut">Run supabase_v10_push.sql and deploy the send-push function.</span>`}</div>
    ${can() && pc && pc.ok ? h`<div class="row gap6"><button class="btn sm ghost" data-act="check">${icon('shield', 15)} Check setup</button><button class="btn sm" data-act="test">${icon('send', 15)} Send a notification</button></div>` : ''}</div>`;
}
// is the send-push function the new one, with the same key as config.js?
async function pushCheck(btn) {
  await UI.busy(btn, async () => {
    const r = await AX.api.pushInfo();
    if (!r.ok) return UI.toast(r.error === 'missing' ? 'The send-push function is not deployed.' : r.error === 'network' ? 'No internet connection.' : 'send-push is the old version: deploy supabase/functions/send-push again (needed for test-series notifications and batch sending).', { tone: 'warn' });
    if (!r.vapid) return UI.toast('send-push has no VAPID keys: add VAPID_PUBLIC and VAPID_PRIVATE in Supabase → Edge Functions → Secrets.', { tone: 'bad' });
    if (r.key_ok === false) return UI.toast('The VAPID_PUBLIC secret in Supabase is not the same as VAPID_PUBLIC in config.js, so phones refuse the notifications. Make them the same key pair.', { tone: 'bad' });
    UI.toast('Phone notifications are set up correctly ✓');
  });
}
// who tapped "Haan, padh liya"
function readers(n) {
  if (!n) return;
  if (!audOn()) return UI.toast('Read marks need supabase_v36_notice_audience.sql.', { tone: 'warn' });
  UI.modal({ title: 'Who read it', sub: n.title || (n.text || '').slice(0, 60) || 'Notice', size: 'narrow', body: UI.skeleton(3),
    async onOpen(el, close, api) {
      const r = await AX.api.call('cbt_admin_ann_aud', 'readers', { id: n.id });
      if (!el.isConnected) return;
      if (!r.ok) return api.set(UI.errorBox(r));
      const pct = r.audience ? Math.round(r.count * 100 / r.audience) : 0;
      api.set(h`<div class="row wrap gap6"><b>${fmt.num(r.count)} of ${fmt.plural(r.audience, 'student')}</b><span class="sm mut">tapped “Haan, padh liya” (${pct}%)</span></div>
        <div class="row wrap gap6 mt8"><span class="xs mut">For:</span>${audPills(n.id)}</div>
        <div class="col gap6 mt16">${r.items.length ? join(r.items, x => h`<div class="row" style="gap:10px">${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><div class="b sm">${x.name}</div><div class="xs mut">${x.mobile}</div></div><span class="xs mut">${fmt.ago(x.at)}</span></div>`)
          : h`<p class="sm mut">Nobody has marked it as read yet.</p>`}</div>`);
    } });
}
function notice(n, ctx) {
  const isNew = !n; n = n || { title: '', text: '', link: '', label: '', active: true };
  let img;          // undefined = keep, '' = remove, data URL = replace
  const m = UI.modal({ title: isNew ? 'New notice' : 'Edit notice', sub: 'Students see it under the bell; the newest also shows on their Home.', size: 'wide',
    body: h`<form id="nf" class="form-grid" autocomplete="off">
      ${AX.f.input({ name: 'title', label: 'Title (optional)', value: n.title, max: 80, placeholder: 'e.g. Test 5 today', full: true })}
      ${AX.f.textarea({ name: 'text', label: 'Message', value: n.text, max: 600, rows: 5, placeholder: 'Write the notice…', full: true })}
      ${AX.f.input({ name: 'link', label: 'Link (optional)', value: n.link, inputmode: 'url', placeholder: 'https://… or #/series' })}
      ${AX.f.input({ name: 'label', label: 'Button text', value: n.label, max: 40, placeholder: 'Open link' })}
      <div class="fld full"><label>Image (optional)</label><div class="row wrap"><div id="nprev" class="well grow" style="min-height:64px;display:flex;align-items:center;justify-content:center">${n.img ? h`<span class="spin"></span>` : h`<span class="sm mut">No image</span>`}</div><div class="col gap6"><button type="button" class="btn sm" data-act="pick">${icon('image', 15)} Choose image</button><button type="button" class="btn sm ghost" data-act="rm">${icon('trash', 15)} Remove</button></div></div></div>
      ${audPicker(isNew ? [] : audOf(n.id))}
      <div class="full col gap10">${AX.f.switch({ name: 'active', value: n.active !== false, label: 'Show to students' })}
      ${AX.f.switch({ name: 'push', value: isNew, label: 'Also send to students\' phones', hint: 'A phone notification, even if the app is closed — to the same students.' })}</div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('send', 16)} ${isNew ? 'Publish' : 'Save'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#nf'), prev = el.querySelector('#nprev');
      const show = src => AX.set(prev, src ? h`<img src="${src}" alt="" style="max-height:140px;border-radius:10px">` : h`<span class="sm mut">No image</span>`);
      if (n.img) AX.api.call('cbt_admin_ann', 'img', { id: n.id }).then(r => show(r.ok ? r.image : null));
      audWire(el);
      AX.act(el, {
        async pick() { const file = await AX.u.pickFile('image/*'); if (!file) return; try { img = await squeeze(file, 900, 0.8); show(img); } catch (e) { UI.toast('Could not use this image', { tone: 'bad' }); } },
        rm() { img = ''; show(null); },
        async save(btn) {
          AX.f.clearErrors(f); const d = AX.f.read(f);
          const hasImg = img ? true : img === '' ? false : !!n.img;
          if (!d.title.trim() && !d.text.trim() && !hasImg) return AX.f.error(f, 'text', 'Write a message or add an image');
          if (d.link.trim() && !LINK_RE.test(d.link.trim())) return AX.f.error(f, 'link', 'Start with https:// (or #/ for a page in the app)');
          const series = audRead(f);
          if (series === null) return UI.toast('Tick at least one test series (or choose Everyone).', { tone: 'bad' });
          const data = { id: isNew ? null : n.id, title: d.title, text: d.text, link: d.link.trim(), label: d.label, active: d.active };
          if (img !== undefined) data.image = img;
          // a notice for chosen series must never be live for everyone, not even for a moment:
          // an existing notice gets its audience first; a new one is saved hidden, gets its audience, then goes live
          const aim = audOn() && (series.length || !isNew);
          const goLive = data.active;
          if (aim && isNew && series.length) data.active = false;
          await UI.busy(btn, async () => {
            if (aim && !isNew) { const a = await AX.api.call('cbt_admin_ann_aud', 'set', { id: n.id, series }); if (!a.ok) return UI.err(a); }
            const r = await AX.api.call('cbt_admin_ann', 'save', data);
            if (!r.ok) return r.error === 'link' ? AX.f.error(f, 'link', 'That link does not look right') : r.error === 'image' ? UI.toast('Image is too big', { tone: 'bad' }) : r.error === 'limit' ? UI.toast('Too many notices (100). Delete some.', { tone: 'bad' }) : UI.err(r);
            let id = r.id || data.id;
            if (aim && isNew && series.length) {
              if (!id) {   // the base save did not return the id: find the new (hidden) notice
                const l = await AX.api.call('cbt_admin_ann', 'list');
                const it = l.ok && (l.items || []).filter(x => !x.active && (x.title || '') === data.title && (x.text || '') === data.text).sort((a, b) => b.at - a.at)[0];
                id = it && it.id;
              }
              const a = id ? await AX.api.call('cbt_admin_ann_aud', 'set', { id, series }) : { ok: false, error: 'id' };
              if (!a.ok) { close(); UI.toast('Saved as hidden: could not set the test series (' + (a.error || 'error') + '). Edit it and try again.', { tone: 'bad' }); if (ctx && ctx.alive()) ctx.reload(); return; }
              if (goLive) { const t = await AX.api.call('cbt_admin_ann', 'toggle', { id, active: true }); if (!t.ok) { close(); UI.err(t); if (ctx && ctx.alive()) ctx.reload(); return; } }
            }
            close(); UI.toast(isNew ? (series.length ? 'Published for ' + fmt.plural(series.length, 'test series', 'test series') : 'Published') : 'Saved');
            if (goLive && d.push) await push({ title: d.title.trim() || 'New notice', body: d.text.trim().slice(0, 180) || 'Tap to read', url: '#/n', tag: 'ann-' + (id || Date.now()), series });
            if (ctx && ctx.alive()) ctx.reload();
          });
        }
      });
    }
  });
}

/* ---------- phone notification ---------- */
function pushForm(isTest, pre) {
  pre = pre || { title: isTest ? 'Test notification' : '', body: isTest ? 'Notifications are working 🎉' : '', url: '#/n' };
  const open = async () => {
    if (!AUD) await audLoad();
    UI.modal({ title: 'Send a phone notification', sub: 'Goes to the students you choose who turned on notifications.', size: 'narrow',
      body: h`<form id="pf" class="col gap16">${AX.f.input({ name: 'title', label: 'Title', value: pre.title, max: 60 })}${AX.f.textarea({ name: 'body', label: 'Message', value: pre.body, max: 180, rows: 3 })}
        ${AX.f.select({ name: 'url', label: 'Opens', value: pre.url || '#/n', options: [{ value: '#/n', label: 'Notices' }, { value: '#/', label: 'Home' }, { value: '#/s', label: 'Test series' }] })}
        ${audPicker(pre.series || [])}</form>`,
      foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="send">${icon('send', 16)} Send now</button>`,
      onOpen(el, close) {
        audWire(el);
        AX.act(el, { async send(btn) {
          const f = el.querySelector('#pf'), d = AX.f.read(f); if (!d.title.trim()) return AX.f.error(f, 'title', 'Write a title');
          const series = audRead(f); if (series === null) return UI.toast('Tick at least one test series (or choose Everyone).', { tone: 'bad' });
          await UI.busy(btn, async () => { const r = await push(Object.assign({}, pre, { title: d.title.trim(), body: d.body.trim() || 'Tap to read', url: d.url, series })); if (r.ok !== false) close(); });
        } });
      } });
  };
  open();
}
async function pushPage(ctx) {
  AX.set(ctx.el, UI.skeleton(3));
  const [pc] = await Promise.all([AX.api.rpc('cbt_admin_push_count', {}), audLoad()]);
  if (!ctx.alive()) return;
  AX.set(ctx.el, h`<div class="grid g2" style="align-items:start"><div class="col gap16">${pushCard(pc)}
      <div class="card"><div class="card-h">${icon('send')}<h3>Write a notification</h3></div>${can() ? h`<form id="pf" class="col gap16">${AX.f.input({ name: 'title', label: 'Title', max: 60, placeholder: 'e.g. Mock Test 6 is live' })}${AX.f.textarea({ name: 'body', label: 'Message', max: 180, rows: 3, placeholder: 'e.g. Starts at 9 PM. All the best!' })}${AX.f.select({ name: 'url', label: 'Opens', value: '#/n', options: [{ value: '#/n', label: 'Notices' }, { value: '#/', label: 'Home' }, { value: '#/s', label: 'Test series' }] })}${audPicker([])}<button class="btn pri" type="button" data-act="send">${icon('send', 16)} Send now</button></form>` : h`<p class="sm mut">You can view but not send.</p>`}</div></div>
    <div class="card"><div class="card-h">${icon('smartphone')}<h3>Preview</h3></div><div class="well" style="border-radius:18px"><div class="row"><span class="av sm" style="--c:#14b8a6">${icon('shield', 14)}</span><div class="grow"><div class="b sm" id="pv-t">Title</div><div class="xs mut" id="pv-b">Message</div></div><span class="xs faint">now</span></div></div><p class="xs mut mt12">Test-live alerts (🔔 on a test) are sent by the server automatically every minute; nothing to do here.</p></div></div>`);
  const f = ctx.el.querySelector('#pf');
  if (f) {
    audWire(f);
    f.addEventListener('input', () => { const d = AX.f.read(f); ctx.el.querySelector('#pv-t').textContent = d.title || 'Title'; ctx.el.querySelector('#pv-b').textContent = d.body || 'Message'; });
    AX.act(ctx.el, { test: () => pushForm(true), check: btn => pushCheck(btn), async send(btn) {
      const d = AX.f.read(f); if (!d.title.trim()) return AX.f.error(f, 'title', 'Write a title');
      const series = audRead(f); if (series === null) return UI.toast('Tick at least one test series (or choose Everyone).', { tone: 'bad' });
      if (!(await UI.confirm(series.length ? { title: 'Send to the chosen test series?', text: 'Only students of ' + series.map(serName).join(', ') + ' who turned on notifications get this now.', yes: 'Send now' }
                                           : { title: 'Send to every phone?', text: 'All students who turned on notifications get this now.', yes: 'Send now' }))) return;
      await UI.busy(btn, async () => { const r = await push({ title: d.title.trim(), body: d.body.trim() || 'Tap to read', url: d.url, series }); if (r.ok !== false && ctx.alive()) ctx.reload(); });
    } });
  } else AX.act(ctx.el, { test: () => pushForm(true), check: btn => pushCheck(btn) });
}

/* ---------- banners ---------- */
let BL = [];
async function banners(ctx) {
  AX.set(ctx.el, UI.skeleton(4));
  const r = await AX.api.call('cbt_admin_banners', 'list');
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v9_banners.sql once in Supabase → SQL Editor, then refresh.' })}</div>` : UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  BL = r.items || [];
  AX.set(ctx.el, h`<div class="callout info">${icon('info')}<div class="sm">Banners slide at the top of every student's Home. Best image size <b>1200 × 560 px</b>. If no banner is live, students see the default ones.</div></div>
    <div class="grid g2 mt16">${BL.length ? join(BL, (b, i) => h`<div class="card pad0" style="${b.active ? '' : 'opacity:.6'}">
        ${b.img ? h`<img src="${b.img}" alt="" style="width:100%;aspect-ratio:1200/560;object-fit:cover;display:block">` : h`<div style="aspect-ratio:1200/560;background:var(--grad-pri);display:grid;place-items:center;padding:16px;color:var(--pri-ink);text-align:center"><div><b class="lg">${b.title || 'Text banner'}</b><div class="sm">${b.text || ''}</div></div></div>`}
        <div style="padding:14px 16px"><div class="row wrap gap6"><b class="ell grow">${b.title || '(no title)'}</b>${UI.pill('#' + (i + 1))}${b.active ? UI.pill('Live', 'ok', true) : UI.pill('Hidden')}</div><div class="xs mut ell mt4">${b.link || 'No link'}</div>
          ${can() ? h`<div class="row mt12"><button class="ibtn sm line" data-act="up" data-i="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">${icon('chevU', 16)}</button><button class="ibtn sm line" data-act="down" data-i="${i}" ${i === BL.length - 1 ? raw('disabled') : ''} aria-label="Move down">${icon('chevD', 16)}</button><span class="grow"></span><button class="btn sm" data-act="tog" data-i="${i}">${b.active ? 'Hide' : 'Show'}</button><button class="btn sm" data-act="edit" data-i="${i}">${icon('edit', 14)} Edit</button><button class="ibtn sm" data-act="del" data-i="${i}" aria-label="Delete">${icon('trash', 15)}</button></div>` : ''}</div></div>`)
      : h`<div class="card" style="grid-column:1/-1">${UI.empty({ icon: 'image', title: 'No banners yet', text: 'Add your first one — your All India Test Series, your WhatsApp channel, or a partner\'s course.', action: can() ? h`<button class="btn pri" data-act="new">${icon('plus', 16)} New banner</button>` : '' })}</div>`}</div>`);
  const move = async (i, d) => {
    const j = i + d; [BL[i], BL[j]] = [BL[j], BL[i]];
    const r2 = await AX.api.call('cbt_admin_banners', 'order', { ids: BL.map(x => x.id) });
    if (!r2.ok) UI.toast('Could not save the order', { tone: 'bad' });
    ctx.reload();
  };
  AX.act(ctx.el, {
    retry: () => ctx.reload(), new: () => banner(null, ctx), edit: el => banner(BL[+el.dataset.i], ctx),
    up: el => move(+el.dataset.i, -1), down: el => move(+el.dataset.i, 1),
    async tog(el) { const b = BL[+el.dataset.i]; const x = await AX.api.call('cbt_admin_banners', 'toggle', { id: b.id, active: !b.active }); if (!x.ok) return UI.err(x); UI.toast(b.active ? 'Banner hidden' : 'Banner is live'); ctx.reload(); },
    async del(el) { const b = BL[+el.dataset.i]; if (!(await UI.confirm({ title: 'Delete this banner?', yes: 'Delete', tone: 'danger' }))) return; const x = await AX.api.call('cbt_admin_banners', 'delete', { id: b.id }); if (!x.ok) return UI.err(x); UI.toast('Deleted'); ctx.reload(); }
  });
}
function banner(b, ctx) {
  const isNew = !b; b = b || { title: '', text: '', link: '', active: true };
  let img;
  UI.modal({ title: isNew ? 'New banner' : 'Edit banner', sub: 'Image 1200 × 560 px works best. No image? Students see a coloured card with the title and text.', size: 'wide',
    body: h`<form id="bf" class="form-grid" autocomplete="off">
      <div class="full" id="bprev">${b.img ? h`<img src="${b.img}" alt="" style="width:100%;aspect-ratio:1200/560;object-fit:cover;border-radius:14px">` : h`<div class="dropzone" data-act="pick">${icon('image', 22)}<div class="b mt8">Choose image</div><div class="xs">JPG / PNG, wide</div></div>`}</div>
      <div class="full row"><button type="button" class="btn sm" data-act="pick">${icon('image', 15)} ${b.img ? 'Change image' : 'Choose image'}</button><button type="button" class="btn sm ghost" data-act="rm">${icon('trash', 15)} Remove image</button></div>
      ${AX.f.input({ name: 'title', label: 'Title', value: b.title, max: 60, placeholder: 'e.g. AITS 2027 — Join now' })}
      ${AX.f.input({ name: 'text', label: 'Short text (for banners without image)', value: b.text, max: 120, placeholder: 'e.g. Real NEET pattern · All-India rank' })}
      ${AX.f.input({ name: 'link', label: 'Link when tapped', value: b.link, full: true, inputmode: 'url', placeholder: 'https://… or https://wa.me/91… or #/series' })}
      <div class="full">${AX.f.switch({ name: 'active', value: b.active !== false, label: 'Show to students' })}</div></form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">${icon('check', 16)} ${isNew ? 'Publish' : 'Save'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#bf');
      const show = src => AX.set(el.querySelector('#bprev'), src ? h`<img src="${src}" alt="" style="width:100%;aspect-ratio:1200/560;object-fit:cover;border-radius:14px">` : h`<div class="dropzone" data-act="pick">${icon('image', 22)}<div class="b mt8">Choose image</div></div>`);
      AX.act(el, {
        async pick() { const file = await AX.u.pickFile('image/*'); if (!file) return; try { img = await squeeze(file, 1200, 0.82); show(img); } catch (e) { UI.toast('Could not use this image', { tone: 'bad' }); } },
        rm() { img = ''; show(null); },
        async save(btn) {
          AX.f.clearErrors(f); const d = AX.f.read(f);
          const hasImg = img ? true : img === '' ? false : !!b.img;
          if (!hasImg && !d.title.trim()) return AX.f.error(f, 'title', 'Add an image or a title');
          if (d.link.trim() && !LINK_RE.test(d.link.trim())) return AX.f.error(f, 'link', 'Link must start with https:// (or #/ for a page in the app)');
          const data = { id: isNew ? null : b.id, title: d.title.trim(), text: d.text.trim(), link: d.link.trim(), active: d.active };
          if (img !== undefined) data.image = img;
          await UI.busy(btn, async () => {
            const r = await AX.api.call('cbt_admin_banners', 'save', data);
            if (!r.ok) return r.error === 'link' ? AX.f.error(f, 'link', 'That link does not look right') : r.error === 'image' ? UI.toast('Image is too big', { tone: 'bad' }) : r.error === 'limit' ? UI.toast('Too many banners (20). Delete some.', { tone: 'bad' }) : UI.err(r);
            close(); UI.toast(isNew ? 'Banner published' : 'Banner saved'); if (ctx && ctx.alive()) ctx.reload();
          });
        }
      });
    }
  });
}
})();
