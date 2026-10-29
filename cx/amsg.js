/* =====================================================================
   Approval messages — the message a student gets when their payment for a series is approved, and the Telegram
   channel link in it, set per test series (a series without its own uses the default). Loaded after cx/ui.js,
   before the modules: m-orders.js and m-students.js make their messages with AX.amsg.make().
   Telegram does not use WhatsApp's *bold* / _italic_: AX.u.tgText() turns them into Telegram's **bold** / __italic__,
   so no stray stars show there.
   Server: cbt_admin_series_msg get | set | reset (supabase_v40_series_msg.sql)
   Exposes: AX.amsg.load(force) · make(o) · tgFor(sid) · edit(sid) · manage() · AX.u.tgText(msg)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const CFG = AX.cfg || {};
const MSGLINE = '━━━━━━━━━━━━━━━━';
const TG_RE = /^https:\/\/t\.me\/[A-Za-z0-9_+/=-]+$/;
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const stuLink = () => /^https:\/\//.test(CFG.SHORT_URL || '') ? CFG.SHORT_URL : siteUrl();
const cfgTg = () => /^https:\/\/t\.me\//.test(CFG.TG_CHANNEL || '') ? CFG.TG_CHANNEL : '';
const canEdit = () => AX.can('content', 'manage');

// WhatsApp *bold* _italic_ ~strike~ → Telegram **bold** __italic__ ~~strike~~ (Telegram makes them bold / italic and hides the marks)
AX.u.tgText = m => String(m || '').replace(/\*([^*\n]+)\*/g, '**$1**').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1__$2__').replace(/(^|\s)~([^~\n]+)~(?=\s|$)/g, '$1~~$2~~');
// WhatsApp-style preview (escaped first)
const msgHtml = m => raw(AX.esc(m).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>').replace(/(^|\s)~([^~\n]+)~(?=\s|$)/g, '$1<s>$2</s>'));

// the words that are filled in (shown as buttons in the editor)
const KEYS = [['name', 'Student name'], ['series', 'Series name'], ['order', 'Order code'], ['mobile', 'Mobile'], ['code', 'Access code'], ['website', 'Website link'], ['telegram', 'Telegram link']];
// the built-in message, written with the words above (same text as before)
const DEFAULT_BODY = ['Hi *{name}* 👋', '', 'Your payment for *"{series}"* is verified ✅', '🧾 Order: *{order}*', MSGLINE,
  '📢 *Join our Telegram channel*', '{telegram}', MSGLINE, '📱 *Open website*', '{website}', '',
  '🔑 *Login with*', 'Mobile: *{mobile}*', 'Access code: *{code}*', MSGLINE,
  '🔓 Your series is unlocked. All the best! 💪', '_Keep your code private. It works on up to 2 phones._'].join('\n');

/* ---------- data ---------- */
const A = AX.amsg = { D: null };
A.load = async (force) => {
  const r = await AX.cache.get('amsg', () => AX.api.call('cbt_admin_series_msg', 'get'), 60000, force);
  A.D = r && r.ok ? r : { ok: false, error: (r && r.error) || 'server', items: {} };
  return A.D;
};
const row = k => (A.D && A.D.items && A.D.items[k]) || null;
A.tgFor = sid => (sid && row(sid) && row(sid).tg) || (row('default') && row('default').tg) || cfgTg();
A.bodyFor = sid => (sid && row(sid) && row(sid).body) || (row('default') && row('default').body) || '';

// fill the words in; a line whose words are all empty (e.g. no order code, no Telegram link) is left out
const fill = (body, v) => String(body).split('\n').filter(line => {
  const ks = (line.match(/\{(\w+)\}/g) || []).map(k => k.slice(1, -1)).filter(k => k in v);
  return !ks.length || ks.some(k => v[k]);
}).join('\n').replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m);

// the message for a student. sid = the series that was unlocked (title = its name); without a title it is a plain approval.
A.make = ({ sid, name, title, order, mobile, code, keep }) => {
  const tg = A.tgFor(sid);
  const c = code ? code.slice(0, 4) + '-' + code.slice(4) : '';
  const body = title ? A.bodyFor(sid) : '';
  if (body) return fill(body, { name: name || '', series: title, order: order || '', mobile: mobile || '', code: c || (keep ? 'your current code' : '______'),
    website: stuLink(), telegram: tg, site: CFG.SITE_NAME || '' });
  return [`Hi *${name}* 👋`, '',
    title ? `Your payment for *"${title}"* is verified ✅` : `Your access to *${CFG.SITE_NAME || 'the test series'}* is approved ✅`,
    ...(order ? [`🧾 Order: *${order}*`] : []),
    MSGLINE,
    ...(tg ? ['📢 *Join our Telegram channel*', tg, MSGLINE] : []),
    '📱 *Open website*', stuLink(), '',
    '🔑 *Login with*', `Mobile: *${mobile}*`, code ? `Access code: *${c}*` : keep ? 'Access code: *your current code*' : 'Access code: ______',
    MSGLINE,
    title ? '🔓 Your series is unlocked. All the best! 💪' : 'All the best for your preparation! 💪',
    '_Keep your code private. It works on up to 2 phones._'].join('\n');
};

AX.css('amsg', `
.am-keys{display:flex;flex-wrap:wrap;gap:6px}
.am-keys .btn{font-family:var(--font-mono,monospace)}
.am-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:760px){.am-grid{grid-template-columns:minmax(0,1fr)}}
.am-msg{white-space:pre-wrap;font-size:13px;line-height:1.55;max-height:420px;overflow:auto;overflow-wrap:anywhere}
.am-ta textarea{font-size:13px;line-height:1.5;min-height:300px}
.am-row{display:flex;align-items:center;gap:10px;padding:12px 4px;border-top:1px solid var(--line);min-width:0}
.am-row:first-child{border-top:0}
`);

const notReady = () => A.D && A.D.error === 'missing'
  ? h`<div class="callout warn">${icon('alert')}<div class="sm">Run <b>supabase_v40_series_msg.sql</b> once in Supabase (then <b>supabase_v35_admin_team.sql</b> again) to save messages per test series. Until then every series uses the built-in message and the Telegram link from config.js.</div></div>` : '';

/* ---------- editor: one series (or the default) ---------- */
A.edit = async (sid) => {
  await A.load(true);
  const cat = await AX.data.catalog();
  const isDef = !sid || sid === 'default', k = isDef ? 'default' : sid;
  const ser = !isDef && cat && cat.ok ? (cat.series || []).find(s => s.id === sid) : null;
  if (!isDef && !ser) return UI.toast('This series is not here any more.', { tone: 'warn' });
  const r0 = row(k), m = canEdit() && A.D.ok;
  const defTg = (row('default') && row('default').tg) || cfgTg();
  const sample = () => ({ name: 'Rahul Sharma', series: ser ? ser.title : 'NEET Test Series', order: 'AS7K2P', mobile: '9876543210', code: '4821-7730', website: stuLink(), site: CFG.SITE_NAME || '' });
  UI.modal({
    title: isDef ? 'Default approval message' : 'Approval message', size: 'xwide',
    sub: isDef ? 'Used for every series that has no message of its own.' : ser.title + ' — sent when you approve a payment for this series. Only these students get it.',
    body: h`${notReady()}<form id="am" class="col gap16" onsubmit="return false">
      ${AX.f.input({ name: 'tg', label: 'Telegram channel link' + (isDef ? ' (default)' : ' for this series'), value: r0 ? r0.tg : '', max: 200, inputmode: 'url', disabled: !m,
        placeholder: isDef ? (cfgTg() || 'https://t.me/…') : (defTg ? 'Empty = default: ' + defTg : 'https://t.me/…'),
        hint: isDef ? 'Used when a series has no link of its own. Empty = the link in config.js' + (cfgTg() ? ' (' + cfgTg() + ')' : '') + '.' : 'Put this series’ own channel here (e.g. the Biology channel for the Biology series). Empty = the default link.' })}
      <div class="am-grid">
        <div class="col gap10"><div class="am-ta">${AX.f.textarea({ name: 'body', label: 'Message', value: (r0 && r0.body) || (isDef ? '' : (row('default') && row('default').body)) || DEFAULT_BODY, rows: 16, max: 3000, disabled: !m })}</div>
          <div class="xs mut">Tap to add a word — it is filled in for each student:</div>
          <div class="am-keys">${join(KEYS, x => h`<button type="button" class="btn xs ghost" data-act="key" data-k="${x[0]}" title="${x[1]}" ${m ? '' : raw('disabled')}>{${x[0]}}</button>`)}</div>
          <div class="xs mut" style="line-height:1.6">Write it exactly as it should look on WhatsApp: <b>*bold*</b>, <i>_italic_</i>. On Telegram the stars are not shown — the copied message uses Telegram's own bold. A line whose word is empty (no order code, no Telegram link) is left out.</div></div>
        <div class="col gap6"><div class="lbl">Preview</div><div class="well am-msg" id="am-pv"></div><div class="xs faint">Sample student. The real name, mobile and access code are filled in when you approve.</div></div>
      </div></form>`,
    foot: h`${m && r0 ? h`<button class="btn ghost danger" data-act="reset">${icon('refresh', 16)} ${isDef ? 'Back to built-in' : 'Use the default'}</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>${m ? 'Cancel' : 'Close'}</button>${m ? h`<button class="btn pri" data-act="save">${icon('check', 16)} Save</button>` : ''}`,
    onOpen(el, close) {
      const f = el.querySelector('#am'), ta = f.querySelector('[name=body]'), tgI = f.querySelector('[name=tg]'), pv = el.querySelector('#am-pv');
      const draw = () => { const tg = tgI.value.trim() || (isDef ? cfgTg() : defTg); AX.set(pv, msgHtml(fill(ta.value, Object.assign(sample(), { telegram: tg })))); };
      draw(); f.addEventListener('input', draw);
      AX.act(el, {
        key(b) { const t = '{' + b.dataset.k + '}', s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || s; ta.value = ta.value.slice(0, s) + t + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length; draw(); },
        async reset(b) {
          if (!(await UI.confirm({ title: isDef ? 'Go back to the built-in message?' : 'Use the default message?', yes: 'Yes', text: isDef ? 'The default message and link you saved are removed.' : 'This series’ own message and Telegram link are removed. It gets the default message and link.' }))) return;
          await UI.busy(b, async () => { const r = await AX.api.call('cbt_admin_series_msg', 'reset', { id: k }); if (!r.ok) return UI.err(r); AX.cache.drop('amsg'); await A.load(true); close(true); UI.toast('Done'); AX.emit('amsg:changed'); });
        },
        async save(b) {
          AX.f.clearErrors(f);
          const tg = tgI.value.trim(), body = ta.value.replace(/\r/g, '').replace(/\s+$/, '');
          if (tg && !TG_RE.test(tg)) return AX.f.error(f, 'tg', 'Paste the full link, e.g. https://t.me/+AbCd123 or https://t.me/yourchannel');
          if (!body.trim()) return AX.f.error(f, 'body', 'Write the message (or tap “' + (isDef ? 'Back to built-in' : 'Use the default') + '”)');
          if (!/\{code\}/.test(body) && !(await UI.confirm({ title: 'No access code in the message', yes: 'Save anyway', text: 'The message has no {code}, so the student will not get their access code in it.' }))) return;
          // the text it would get anyway = keep only the link (so a later change of the default still reaches it)
          const inherited = isDef ? DEFAULT_BODY : (row('default') && row('default').body) || DEFAULT_BODY;
          const keepBody = body === inherited ? '' : body;
          await UI.busy(b, async () => {
            const r = await AX.api.call('cbt_admin_series_msg', 'set', { id: k, body: keepBody, tg });
            if (!r.ok) return r.error === 'tg' ? AX.f.error(f, 'tg', 'That link does not look right') : r.error === 'body' ? AX.f.error(f, 'body', 'The message is too long (3000 letters at most)') : UI.err(r);
            AX.cache.drop('amsg'); await A.load(true); close(true); UI.toast('Saved — the next approval uses it'); AX.emit('amsg:changed');
          });
        }
      });
    }
  });
};

/* ---------- every series at a glance ---------- */
A.manage = async () => {
  const [, cat] = await Promise.all([A.load(true), AX.data.catalog()]);
  const ser = (cat && cat.ok ? cat.series || [] : []).slice().sort((a, b) => (+a.sort_order || 0) - (+b.sort_order || 0));
  const defTg = (row('default') && row('default').tg) || cfgTg();
  const line = (k, title, sub) => {
    const r = row(k), own = !!(r && r.body), tg = r && r.tg;
    return h`<div class="am-row"><div class="grow" style="min-width:0"><b class="ell" style="display:block">${title}</b>
      <div class="row wrap gap6 mt6">${k === 'default' ? UI.pill(own ? 'Your message' : 'Built-in message', own ? 'pri' : '') : UI.pill(own ? 'Own message' : 'Default message', own ? 'pri' : '')}
        ${tg ? UI.pill('Telegram: own link', 'ok') : k === 'default' ? (defTg ? UI.pill('Telegram: config.js link') : UI.pill('No Telegram link', 'warn')) : defTg ? UI.pill('Telegram: default link', 'warn') : UI.pill('No Telegram link', 'warn')}</div>
      ${sub ? h`<div class="xs mut mt6 ell">${sub}</div>` : ''}</div>
      <button class="btn sm" data-act="ed" data-k="${k}">${icon(canEdit() ? 'edit' : 'eye', 15)} ${canEdit() ? 'Edit' : 'View'}</button></div>`;
  };
  UI.modal({ title: 'Approval messages', sub: 'What a student gets when you approve their payment, and which Telegram channel. Set it per test series.', size: 'wide',
    body: h`${notReady()}<div class="callout info" style="margin-bottom:12px">${icon('info')}<div class="sm">A series marked <b>Telegram: default link</b> sends the default channel. Give each series its own channel so Biology students do not get the Chemistry link.</div></div>
      <div class="card pad0" style="padding:4px 14px">${line('default', 'Default (every series without its own)', defTg)}${join(ser, s => line(s.id, s.title, row(s.id) && row(s.id).tg))}</div>`,
    onOpen(el, close) { AX.act(el, { ed(b) { close(); A.edit(b.dataset.k); } }); } });
};

AX.actions.push({ label: 'Approval messages (per test series)', icon: 'msg', perm: ['store'], run() { A.manage(); } });
})();
