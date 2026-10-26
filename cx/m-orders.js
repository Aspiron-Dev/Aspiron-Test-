/* =====================================================================
   Orders — the money desk: payments to verify, students who did not pay, access requests, approved / rejected.
   Approve & unlock = create / approve the student (or keep their code), unlock the series, mark the order paid,
   then hand over the access code with a ready-to-send message.
   Also defines AX.sto (shared store helpers used by m-store.js) and AX.openOrder(code).
   Server: cbt_admin_store (get, order_status) · cbt_admin_store_order (contacted, note) ·
           cbt_admin (students, student_add, student_approve, student_code, grant, student_delete)
   SQL: supabase_v13_store.sql, v17, v20 (payer), v28 (follow-up)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const CFG = AX.cfg || {};
const DAY = 864e5;
const m10 = m => String(m || '').replace(/\D/g, '').slice(-10);
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const SITE = () => CFG.SITE_NAME || 'our test series';
const MSGLINE = '━━━━━━━━━━━━━━━━';
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const siteBase = () => /^https:\/\//.test(CFG.SHORT_URL || '') ? String(CFG.SHORT_URL).replace(/\/?$/, '/') : siteUrl();
const stuLink = () => /^https:\/\//.test(CFG.SHORT_URL || '') ? CFG.SHORT_URL : siteUrl();
const storeUrl = () => siteBase() + 'store.html';
const ms = t => AX.fmt.ms(t) || 0;
const SEGS = [
  { id: 'verify', t: 'Payment done', d: 'Verify the UTR, then approve & unlock', icon: 'wallet' },
  { id: 'unpaid', t: 'Not paid yet', d: 'Tapped Buy now, did not finish — follow up', icon: 'clock' },
  { id: 'req', t: 'Access requests', d: 'Asked for access on the website', icon: 'userPlus' },
  { id: 'done', t: 'Approved', d: 'Paid and unlocked', icon: 'checkCircle' },
  { id: 'rej', t: 'Rejected', d: 'Payment could not be matched', icon: 'ban' },
  { id: 'all', t: 'All', d: 'Every order', icon: 'list' }
];
const SEG_PILL = { verify: ['Payment done · verify', 'gold'], unpaid: ['Not paid', ''], done: ['Approved', 'ok'], rej: ['Rejected', 'bad'] };

/* ---------- shared store kit (AX.sto) ---------- */
const S = AX.sto = {};
S.m10 = m10; S.storeUrl = storeUrl; S.siteBase = siteBase; S.SITE = SITE; S.firstName = firstName;
S.seg = o => o.status === 'paid' ? 'done' : o.status === 'rejected' ? 'rej' : (o.payer || o.utr) ? 'verify' : 'unpaid';
S.cur = null;
// store data + students (if allowed). Never throws.
S.load = async (force) => {
  const [r, st] = await Promise.all([AX.data.store(force), AX.can('students') ? AX.data.students(force) : Promise.resolve(null)]);
  if (!r || !r.ok) return r || { ok: false, error: 'server' };
  const D = { ok: true, settings: r.settings || {}, items: r.items || [], orders: r.orders || [], students: st && st.ok ? (st.students || []) : null, stErr: st && !st.ok ? st : null };
  S.cur = D;
  return D;
};
S.dupUtr = (o, L) => { const u = String(o.utr || '').trim(); return !!u && (L || []).some(x => x.code !== o.code && String(x.utr || '').trim() === u); };
S.paidTwin = (o, L) => (L || []).find(x => x.code !== o.code && x.status === 'paid' && m10(x.mobile) === m10(o.mobile) && x.item_id === o.item_id) || null;
S.requests = D => (D.students || []).filter(s => s.status === 'pending').sort((a, b) => ms(b.created) - ms(a.created));
// after any order / student change: every view that shows money follows at once
S.changed = () => { ['store', 'payments', 'students'].forEach(k => AX.cache.drop(k)); AX.emit('data:changed'); AX.emit('orders:changed'); };

/* ---------- message templates (exact texts that are known to work) ---------- */
S.stuMsg = ({ name, title, order, mobile, code, keep }) => {
  const tg = /^https:\/\/t\.me\//.test(CFG.TG_CHANNEL || '') ? CFG.TG_CHANNEL : '';
  const c = code ? code.slice(0, 4) + '-' + code.slice(4) : '';
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
S.ordMsg = o => {
  const f = firstName(o.name), sg = S.seg(o);
  if (sg === 'done') return S.stuMsg({ name: o.name, title: o.item_title, order: o.code, mobile: o.mobile });
  if (sg === 'verify') return `Hi ${f} 👋\nWe have received your payment details for "${o.item_title}" (order ${o.code}).\nWe are checking it now and will send your login details shortly. 🙏`;
  if (sg === 'rej') return `Hi ${f}, we could not match your payment for "${o.item_title}" (order ${o.code}).\nPlease send the payment screenshot and the UTR number again, and we will check it at once.`;
  return `Hi ${f} 👋\nYou started buying "${o.item_title}" (${fmt.inr(o.amount)}) on ${SITE()}, but the payment is not complete yet.\nAny doubt about the series or the payment? Just reply here — we are happy to help. 😊\nComplete it here: ${storeUrl()}#p=${o.item_id || ''}\nOrder code: ${o.code}`;
};
S.reqMsg = s => `Hi ${firstName(s.name)} 👋\nWe received your request to join ${SITE()}. Which test series would you like? Reply here and we will help you get started.`;
// WhatsApp-style preview: *bold*, _italic_ (escaped first)
S.msgHtml = m => raw(AX.esc(m).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>'));
S.links = (mobile, msg) => { const m = m10(mobile); return { tel: 'tel:+91' + m, sms: 'sms:+91' + m + '?&body=' + encodeURIComponent(msg || ''), wa: 'https://wa.me/91' + m + (msg ? '?text=' + encodeURIComponent(msg) : ''), tg: 'https://t.me/+91' + m }; };
// call / SMS / WhatsApp / Telegram buttons. count = log a follow-up on the order code
S.contactBar = (mobile, msg, code) => {
  const L = S.links(mobile, msg), c = code && AX.can('store', 'manage') ? code : '';
  return h`<a class="ibtn line" href="${L.tel}" data-act="contact" data-code="${c}" title="Call" aria-label="Call">${icon('phone', 17)}</a>
    <a class="ibtn line" href="${L.sms}" data-act="contact" data-code="${c}" title="SMS" aria-label="SMS">${icon('msg', 17)}</a>
    <a class="ibtn line ic-wa" href="${L.wa}" target="_blank" rel="noopener" data-act="contact" data-code="${c}" title="WhatsApp" aria-label="WhatsApp">${icon('whatsapp', 18)}</a>
    <a class="ibtn line ic-tg" href="${L.tg}" target="_blank" rel="noopener" data-act="contact" data-tg="1" data-msg="${msg}" data-code="${c}" title="Telegram (message is copied first)" aria-label="Telegram">${icon('telegram', 17)}</a>`;
};
let FOLWARN = false;
S.contacted = async (code) => {
  const r = await AX.api.rpc('cbt_admin_store_order', { p_code: code, p_action: 'contacted', p_data: {} });
  if (!r.ok) { if (r.error === 'missing' && !FOLWARN) { FOLWARN = true; UI.toast('To count follow-ups, run supabase_v28_store_followup.sql once in Supabase', { tone: 'warn' }); } return; }
  const o = S.cur && S.cur.orders.find(x => x.code === code);
  if (o) { o.contact_n = r.contact_n; o.contacted_at = r.contacted_at; }
  setTimeout(() => AX.emit('orders:changed', { soft: true }), 400);
};
// one delegated handler for contact links (Telegram copies the message first — it cannot be prefilled)
S.onContact = (el) => {
  if (el.dataset.tg && el.dataset.msg) { AX.u.copy(el.dataset.msg).then(ok => { if (ok) UI.toast('Message copied — paste it in Telegram'); }); }
  if (el.dataset.code) S.contacted(el.dataset.code);
};

/* ---------- choice dialog: two (or more) clear options, never a silent default ---------- */
S.choose = (o) => new Promise(res => {
  let done = false;
  UI.modal({
    title: o.title, sub: o.sub, size: 'narrow',
    body: h`${o.text ? h`<p class="tx2 sm" style="line-height:1.6;margin-bottom:14px">${o.text}</p>` : ''}<div class="col gap6">${join(o.options, (x, i) => h`<button type="button" class="oc-opt ${x.tone || ''}" data-i="${i}"><span class="oc-oi">${icon(x.icon || 'arrowR', 18)}</span><span class="grow"><b>${x.label}</b>${x.rec ? h` <span class="pill pri">Recommended</span>` : ''}<span class="xs mut" style="display:block;margin-top:2px">${x.sub || ''}</span></span>${icon('chevR', 16)}</button>`)}</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button>`,
    onClose() { if (!done) res(null); },
    onOpen(el, close) { el.addEventListener('click', e => { const b = e.target.closest('.oc-opt'); if (!b) return; done = true; res(o.options[+b.dataset.i].v); close(true); }); }
  });
});

/* ---------- approve & unlock ---------- */
S.canApprove = () => AX.can('store', 'manage') && AX.can('students', 'manage');
S.approve = async (code) => {
  if (!AX.can('store', 'manage')) return UI.toast('You can view orders but not change them.', { tone: 'warn' });
  if (!AX.can('students', 'manage')) return UI.toast('Approving creates the student and unlocks the series, so it needs full access to Students. Ask the owner.', { tone: 'warn', ms: 6000 });
  const D = S.cur && S.cur.orders.some(x => x.code === code) ? S.cur : await S.load(false);
  if (!D.ok) return UI.err(D);
  const o = D.orders.find(x => x.code === code);
  if (!o) return UI.toast('This order is not in the list any more. Refresh the page.', { tone: 'warn' });
  const cat = await AX.data.catalog();
  const it = D.items.find(x => x.id === o.item_id), sid = it && it.series_id;
  const ser = sid && cat && cat.ok ? (cat.series || []).find(s => s.id === sid) : null;
  const twin = S.paidTwin(o, D.orders);
  if (twin && !(await UI.confirm({ title: 'Already approved for this series', tone: 'danger', yes: 'Approve anyway',
    text: h`<b>${o.name}</b> already has an approved order for <b>${o.item_title}</b> (order ${twin.code} · ${fmt.inr(twin.amount)}). Approving this one too counts the money twice. If it is the same payment, cancel and <b>Reject</b> this order.` }))) return;
  if (!sid && !(await UI.confirm({ title: 'Not linked to a series', yes: 'Continue without unlocking',
    text: h`“${o.item_title}” is not linked to a series in the store, so no series can be unlocked. Continue and only create the student and access code? You can link it in Store → Items.` }))) return;
  if (S.dupUtr(o, D.orders) && !(await UI.confirm({ title: 'This UTR is also in another order', tone: 'danger', yes: 'Approve anyway',
    text: h`UTR <b class="mono">${o.utr}</b> appears in another order too. Check the payment carefully in your bank / UPI app before you approve.` }))) return;

  const steps = []; let acc = null;
  const ok = t => steps.push({ t, tone: 'ok' }), warn = t => steps.push({ t, tone: 'bad' });
  const sr = await AX.data.students(true);
  if (!sr.ok) return UI.err(sr);
  let st = (sr.students || []).find(s => m10(s.mobile) === m10(o.mobile));
  if (st && st.status === 'blocked') return UI.toast('This student is blocked. Unblock them in Students first.', { tone: 'bad', ms: 5000 });
  if (!st) {
    const r = await AX.api.admin('student_add', { name: o.name, mobile: m10(o.mobile) });
    if (!r.ok) return UI.toast(r.error === 'exists' ? 'A student with this mobile already has a code. Refresh and try again.' : r.error === 'mobile' ? 'The mobile number on this order is not valid.' : r.error === 'name' ? 'The name on this order is too short.' : 'Could not create the student. ' + AX.errText(r), { tone: 'bad', ms: 5000 });
    acc = r.code || null; ok('New student created');
    if (r.id) st = { id: r.id, name: r.name || o.name };
    else { const s2 = await AX.data.students(true); st = s2.ok ? (s2.students || []).find(s => m10(s.mobile) === m10(o.mobile)) : null; }
  } else if (st.status === 'pending') {
    const r = await AX.api.admin('student_approve', { id: st.id });
    if (!r.ok) return UI.toast('Could not approve the student. ' + AX.errText(r), { tone: 'bad', ms: 5000 });
    acc = r.code || null; ok('Access request approved');
  } else {
    const ch = await S.choose({ title: st.name + ' already has an account', sub: fmt.mobile(st.mobile) + ' · has an access code',
      text: 'Choose what happens to their access code.',
      options: [{ v: 'keep', icon: 'key', label: 'Keep the current code', sub: 'They stay signed in. The message says “your current code”.', rec: true },
        { v: 'new', icon: 'refresh', label: 'Make a new code', sub: 'They are signed out on all phones and need the new code.', tone: 'warn' }] });
    if (!ch) return;
    if (ch === 'keep') ok('Existing account — current code kept');
    else { const r = await AX.api.admin('student_code', { id: st.id }); if (r.ok && r.code) { acc = r.code; ok('New access code made'); } else warn('Could not make a new code — the current code still works'); }
  }
  let unlocked = !sid;
  if (sid && st) {
    const r = await AX.api.admin('grant', { student_id: st.id, series_id: sid, on: true });
    if (r.ok) { unlocked = true; ok('Unlocked: ' + (ser ? ser.title : o.item_title)); } else warn('Could not unlock the series — unlock it in Students, then approve again');
  } else if (sid && !st) warn('Student not found after creating — unlock the series in Students');
  if (unlocked) {
    const r = await AX.api.call('cbt_admin_store', 'order_status', { code: o.code, status: 'paid' });
    if (r.ok) { o.status = 'paid'; ok('Order marked paid'); } else warn('Could not mark the order paid — tap Approve again');
  } else warn('Order left as “Payment done” so you can try again');
  S.changed();
  S.doneSheet({ title: unlocked ? 'Approved' : 'Partly done', name: o.name, mobile: o.mobile, code: o.code, steps, acc,
    msg: S.stuMsg({ name: o.name, title: o.item_title, order: o.code, mobile: o.mobile, code: acc, keep: !acc }) });
};
// result sheet: steps, the new code (shown once), message + WhatsApp / Telegram / Copy
S.doneSheet = ({ title, name, mobile, code, steps, acc, msg, sub }) => {
  const L = S.links(mobile, msg), bad = (steps || []).some(s => s.tone === 'bad');
  UI.modal({ title, sub: sub || [name, fmt.mobile(m10(mobile)), code].filter(Boolean).join(' · '), sticky: true, size: '',
    icon: h`<span class="oc-done ${bad ? 'bad' : ''}">${icon(bad ? 'alert' : 'check', 16)}</span>`,
    body: h`${steps && steps.length ? h`<ul class="oc-steps">${join(steps, s => h`<li class="${s.tone}">${icon(s.tone === 'bad' ? 'alert' : 'check', 15)}<span>${s.t}</span></li>`)}</ul>` : ''}
      ${acc ? h`<div class="code-big mt16">${acc.slice(0, 4)}-${acc.slice(4)}</div><p class="xs mut mt8" style="text-align:center">Send this code now — for safety it is stored scrambled and cannot be shown again.</p>` : ''}
      <div class="lbl mt16" style="margin-bottom:6px">Message for the student</div>
      <div class="well oc-msg">${S.msgHtml(msg)}</div>
      <p class="xs faint mt8">Telegram cannot fill in the message, so it is copied first — paste it in the chat that opens.</p>`,
    foot: h`<button class="btn" data-act="copy">${icon('copy', 16)} Copy</button><a class="btn soft" href="${L.wa}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><a class="btn soft" href="${L.tg}" target="_blank" rel="noopener" data-act="copy">${icon('telegram', 16)} Telegram</a><span class="sp"></span><button class="btn pri" data-close>Done</button>`,
    onOpen(el) { AX.act(el, { copy() { AX.u.copy(msg).then(x => UI.toast(x ? 'Message copied' : 'Copy failed', x ? {} : { tone: 'bad' })); } }); }
  });
};
S.setStatus = async (code, status, opt = {}) => {
  const D = S.cur; const o = D && D.orders.find(x => x.code === code); const before = o ? o.status : 'pending';
  const r = await AX.api.call('cbt_admin_store', 'order_status', { code, status });
  if (!r.ok) return UI.err(r);
  if (o) o.status = status;
  S.changed();
  UI.toast(opt.msg || 'Saved', opt.undo === false ? {} : { action: { label: 'Undo', fn: () => S.setStatus(code, before, { msg: 'Change undone', undo: false }) } });
};

/* ---------- access requests (pending students) ---------- */
S.approveReq = async (id) => {
  if (!AX.can('students', 'manage')) return UI.toast('Approving needs full access to Students.', { tone: 'warn' });
  const r = await AX.api.admin('student_approve', { id });
  if (!r.ok) return UI.toast('Could not approve. ' + AX.errText(r), { tone: 'bad' });
  S.changed();
  S.doneSheet({ title: 'Approved', name: r.name, mobile: r.mobile, steps: [{ t: 'Access request approved', tone: 'ok' }, { t: 'Access code made', tone: 'ok' }], acc: r.code,
    msg: S.stuMsg({ name: r.name, mobile: r.mobile, code: r.code }), sub: (r.name || '') + ' · ' + fmt.mobile(r.mobile || '') + ' · give the paid series from an order or the student’s page' });
};
S.rejectReq = async (s) => {
  if (!(await UI.confirm({ title: 'Reject ' + (s.name || 'this request') + '?', text: 'The request is removed. They can ask again from the website.', yes: 'Reject request', tone: 'danger' }))) return;
  const r = await AX.api.admin('student_delete', { id: s.id });
  if (!r.ok) return UI.err(r);
  UI.toast('Request removed'); S.changed();
};

/* ---------- note ---------- */
S.note = async (code) => {
  const o = S.cur && S.cur.orders.find(x => x.code === code); if (!o) return;
  const v = await UI.prompt({ title: 'Note · ' + o.name, label: 'Only your team sees this', value: o.note || '', multiline: true, required: false, yes: 'Save note', hint: 'e.g. “Will pay after 6 pm”, “Wants the schedule first”. Max 500 letters.' });
  if (v == null) return;
  const r = await AX.api.rpc('cbt_admin_store_order', { p_code: code, p_action: 'note', p_data: { note: v.slice(0, 500) } });
  if (!r.ok) return r.error === 'missing' ? UI.toast('Run supabase_v28_store_followup.sql once in Supabase first', { tone: 'warn' }) : UI.err(r);
  o.note = r.note != null ? r.note : v; UI.toast(v ? 'Note saved' : 'Note removed'); AX.emit('orders:changed', { soft: true });
};
S.openStudent = (mobile) => { if (AX.openStudent) AX.openStudent(m10(mobile)); else AX.go('students', { q: m10(mobile) }); };

/* ---------- order card ---------- */
function orderCard(o, D, full) {
  const sg = S.seg(o), P = SEG_PILL[sg], man = AX.can('store', 'manage'), apv = S.canApprove();
  const dup = S.dupUtr(o, D.orders), twin = sg !== 'done' && S.paidTwin(o, D.orders), msg = S.ordMsg(o);
  const it = D.items.find(x => x.id === o.item_id);
  const acts = !man ? '' : sg === 'verify' ? h`<button class="btn sm ghost" data-act="reject" data-code="${o.code}">${icon('x', 15)} Reject</button><button class="btn sm pri" data-act="approve" data-code="${o.code}" data-busy="Approving…" ${apv ? '' : raw('disabled title="Needs full access to Students"')}>${icon('unlock', 15)} Approve & unlock</button>`
    : sg === 'unpaid' ? h`<button class="btn sm ghost" data-act="remove" data-code="${o.code}">${icon('trash', 15)} Remove</button><button class="btn sm" data-act="anyway" data-code="${o.code}" data-busy="Approving…" title="Use only if the payment reached you another way" ${apv ? '' : raw('disabled')}>${icon('unlock', 15)} Approve anyway</button>`
    : sg === 'done' ? h`<button class="btn sm ghost" data-act="undo" data-code="${o.code}">${icon('undo', 15)} Undo</button><button class="btn sm" data-act="login" data-code="${o.code}">${icon('copy', 15)} Login message</button><button class="btn sm" data-act="student" data-m="${o.mobile}">${icon('user', 15)} Student</button>`
    : h`<button class="btn sm ghost" data-act="undo" data-code="${o.code}">${icon('undo', 15)} Undo</button>`;
  return h`<article class="card oc s-${sg}" data-code="${o.code}">
    <header class="row top">${UI.avatar(o.name, o.mobile || o.code)}<div class="grow"><button class="oc-name ell" data-act="open" data-code="${o.code}">${o.name || 'Student'}</button><div class="xs mut">${fmt.mobile(m10(o.mobile))} · ${fmt.ago(o.created_at)}</div></div>${UI.pill(P[0], P[1], true)}</header>
    <div class="oc-item"><div class="grow"><div class="xs mut">${icon('book', 13)} Series${it && !it.series_id ? h` · <span style="color:var(--warn)">not linked</span>` : ''}</div><b class="oc-t">${o.item_title || '—'}</b></div><div class="oc-amt">${fmt.inr(o.amount)}</div></div>
    ${o.payer || o.utr ? h`<div class="oc-pay"><div><div class="k">Paid from</div><div class="v">${o.payer || '—'}</div></div><div><div class="k">UTR</div><div class="v row gap4"><span class="mono ell">${o.utr || '—'}</span>${o.utr ? UI.copyBtn(o.utr) : ''}</div></div></div>` : ''}
    <div class="xs mut row wrap gap6"><span class="mono">${o.code}</span>${o.paid_at ? h`<span>· details sent ${fmt.ago(o.paid_at)}</span>` : ''}${full ? h`<span>· ordered ${fmt.dt(o.created_at)}</span>` : ''}</div>
    ${dup ? h`<div class="callout bad sm">${icon('alert', 16)}<div>This UTR is also in another order — check carefully.</div></div>` : ''}
    ${twin ? h`<div class="callout warn sm">${icon('info', 16)}<div>Already approved for this series in order <b class="mono">${twin.code}</b>. Approving again counts the money twice.</div></div>` : ''}
    ${o.contact_n || o.note ? h`<div class="oc-fol">${o.contact_n ? h`<div class="row gap6">${icon('phone', 14)}<span>Contacted ${o.contact_n}× · last ${fmt.ago(o.contacted_at)}</span></div>` : ''}${o.note ? h`<div class="row top gap6">${icon('edit', 14)}<span class="oc-note">${o.note}</span></div>` : ''}</div>` : ''}
    <footer class="oc-f"><div class="oc-con">${S.contactBar(o.mobile, msg, o.code)}${man ? h`<button class="ibtn line" data-act="note" data-code="${o.code}" title="Note" aria-label="Note">${icon('edit', 17)}</button>` : ''}</div><div class="oc-act">${acts}</div></footer>
  </article>`;
}
function reqCard(s, D) {
  const o = D.orders.find(x => m10(x.mobile) === m10(s.mobile) && x.status !== 'rejected'), man = AX.can('students', 'manage');
  return h`<article class="card oc s-req">
    <header class="row top">${UI.avatar(s.name, s.mobile)}<div class="grow"><b class="ell" style="display:block;font-size:15px">${s.name || 'Student'}</b><div class="xs mut">${fmt.mobile(m10(s.mobile))} · asked ${fmt.ago(s.created)}</div></div>${UI.pill('Access request', 'info', true)}</header>
    ${o ? h`<div class="callout info sm">${icon('cart', 16)}<div>Also has a store order: <b>${o.item_title}</b> · ${fmt.inr(o.amount)} · ${o.status === 'paid' ? 'approved' : (o.payer || o.utr) ? 'payment done' : 'not paid'} <a href="#" data-act="open" data-code="${o.code}">Open</a></div></div>` : h`<p class="sm mut">New student from the website. Approve to make their access code, then give the paid series from an order or their page.</p>`}
    <footer class="oc-f"><div class="oc-con">${S.contactBar(s.mobile, S.reqMsg(s), '')}</div><div class="oc-act">${man ? h`<button class="btn sm ghost" data-act="rreject" data-id="${s.id}">${icon('x', 15)} Reject</button><button class="btn sm pri" data-act="rapprove" data-id="${s.id}" data-busy="Approving…">${icon('key', 15)} Approve & get code</button>` : ''}</div></footer>
  </article>`;
}
// actions shared by the list and the order drawer
function cardActs(root, after) {
  const find = code => S.cur && S.cur.orders.find(x => x.code === code);
  AX.act(root, {
    contact: el => S.onContact(el),
    open: el => S.openOrder(el.dataset.code),
    approve: el => UI.busy(el, () => S.approve(el.dataset.code)).then(after),
    async anyway(el) {
      const o = find(el.dataset.code); if (!o) return;
      if (!(await UI.confirm({ title: 'Approve without a payment?', text: h`Use this only if the money reached you another way (cash, bank…). <b>${o.name}</b> gets access and the order counts as paid.`, yes: 'Continue' }))) return;
      await UI.busy(el, () => S.approve(o.code)); if (after) after();
    },
    reject: el => S.setStatus(el.dataset.code, 'rejected', { msg: 'Order rejected' }).then(after),
    remove: el => S.setStatus(el.dataset.code, 'rejected', { msg: 'Removed from “Not paid yet”' }).then(after),
    async undo(el) {
      const o = find(el.dataset.code); if (!o) return;
      if (o.status === 'paid' && !(await UI.confirm({ title: 'Move this order back to pending?', yes: 'Undo approval',
        text: 'The payment stops counting. The series stays unlocked and the access code does not change — remove the series on the student’s page if needed.' }))) return;
      await S.setStatus(o.code, 'pending', { msg: 'Moved back to pending', undo: false }); if (after) after();
    },
    login(el) { const o = find(el.dataset.code); if (o) AX.u.copy(S.stuMsg({ name: o.name, title: o.item_title, order: o.code, mobile: o.mobile })).then(x => UI.toast(x ? 'Login message copied — add the access code before sending' : 'Copy failed')); },
    student: el => S.openStudent(el.dataset.m),
    note: el => S.note(el.dataset.code),
    rapprove: el => UI.busy(el, () => S.approveReq(el.dataset.id)),
    rreject(el) { const s = (S.cur.students || []).find(x => x.id === el.dataset.id); if (s) S.rejectReq(s); }
  });
}

/* ---------- one order (drawer), from anywhere ---------- */
S.openOrder = async (code) => {
  code = String(code || '').trim().toUpperCase();
  const D = S.cur && S.cur.orders.some(x => x.code === code) ? S.cur : await S.load(false);
  if (!D.ok) return UI.err(D);
  if (!D.orders.some(x => x.code === code)) return UI.toast('Order ' + code + ' is not in the latest 300 orders.', { tone: 'warn' });
  let off = null;
  const paint = (api) => {
    const o = S.cur.orders.find(x => x.code === code); if (!o) return api.close();
    const sg = S.seg(o), others = S.cur.orders.filter(x => x.code !== o.code && m10(x.mobile) === m10(o.mobile));
    api.set(h`${orderCard(o, S.cur, true)}
      <div class="section-t">Timeline</div>
      <div class="card"><div class="timeline">
        <div class="tl-i mut"><b>Tapped Buy now</b><div class="xs mut">${fmt.dt(o.created_at)}</div></div>
        ${o.paid_at ? h`<div class="tl-i gold"><b>Sent payment details</b><div class="xs mut">${fmt.dt(o.paid_at)}${o.utr ? ' · UTR ' + o.utr : ''}</div></div>` : ''}
        ${o.contact_n ? h`<div class="tl-i"><b>Contacted ${o.contact_n}×</b><div class="xs mut">last ${fmt.dt(o.contacted_at)}</div></div>` : ''}
        ${sg === 'done' ? h`<div class="tl-i"><b>Approved & unlocked</b></div>` : sg === 'rej' ? h`<div class="tl-i bad"><b>Rejected</b></div>` : h`<div class="tl-i mut"><b class="mut">Waiting for you</b></div>`}
      </div></div>
      ${others.length ? h`<div class="section-t">Other orders from this number</div><div class="card pad0 list">${join(others, x => h`<a class="li click" href="#" data-act="open" data-code="${x.code}" style="color:var(--tx);text-decoration:none"><div class="grow"><div class="t ell">${x.item_title}</div><div class="s">${x.code} · ${fmt.ago(x.created_at)}</div></div><b class="num">${fmt.inr(x.amount)}</b>${UI.pill(SEG_PILL[S.seg(x)][0], SEG_PILL[S.seg(x)][1])}</a>`)}</div>` : ''}`);
  };
  const o0 = D.orders.find(x => x.code === code);
  UI.drawer({ title: 'Order ' + code, sub: (o0.item_title || '') + ' · ' + fmt.inr(o0.amount), body: '',
    onClose() { if (off) off(); },
    onOpen(el, close, api) {
      paint(api);
      cardActs(api.body, null);
      api.body.addEventListener('click', e => { const a = e.target.closest('[data-act=open]'); if (a && a.dataset.code !== code) close(); }, true);
      off = AX.on('orders:changed', async (x) => { if (!el.isConnected) return off(); if (!(x && x.soft)) await S.load(false); if (el.isConnected) paint(api); });
    } });
};
AX.openOrder = S.openOrder;

/* ---------- page ---------- */
const V = { seg: 'verify', q: '', d: 'all', day: null, limit: 40 };
const fromTo = () => {
  if (V.d === 'day' && V.day) return [V.day, V.day + DAY];
  if (V.d === 'all') return [0, Infinity];
  return [Date.now() - Number(V.d) * DAY, Infinity];
};
const D_LABEL = { all: 'All time', 1: 'Last 24 h', 7: 'Last 7 days', 30: 'Last 30 days' };
function counts(D) {
  const c = { all: D.orders.length, req: S.requests(D).length, verify: 0, unpaid: 0, done: 0, rej: 0 };
  D.orders.forEach(o => c[S.seg(o)]++);
  return c;
}
function listOf(D) {
  const q = V.q.trim().toLowerCase(), [a, b] = fromTo();
  let L = D.orders.filter(o => V.seg === 'all' || S.seg(o) === V.seg);
  L = L.filter(o => { const t = ms(o.created_at); return t >= a && t < b; });
  if (q) L = L.filter(o => [o.code, o.mobile, o.name, o.payer, o.utr, o.item_title].join(' ').toLowerCase().includes(q));
  const key = o => V.seg === 'verify' ? ms(o.paid_at || o.created_at) : ms(o.created_at);
  return L.sort((x, y) => key(y) - key(x));
}
const HINT = {
  verify: h`Match the <b>amount</b>, <b>paid-from name</b> and <b>UTR</b> with your bank / UPI app and the screenshot on Telegram, then tap <b>Approve & unlock</b> — it creates the student, makes the access code, unlocks the series and marks the order paid.`,
  unpaid: h`These students chose a series but did not pay. Call or message them to help — the message is written for you, and every contact is counted.`,
  req: h`New students who tapped “Request access” on the website. <b>Approve & get code</b> makes their access code; give the paid series from their order or the student’s page.`
};

AX.mod({
  id: 'orders', title: 'Orders', short: 'Orders', icon: 'cart', group: 'Commerce', order: 10, perm: 'store',
  sub: 'Verify payments, unlock series and follow up with students who did not pay.',
  async render(ctx) {
    const sg = SEGS.find(s => s.id === ctx.parts[0]); if (sg) V.seg = sg.id;
    if (ctx.q.q != null) V.q = ctx.q.q;
    V.limit = 40;
    ctx.head({ title: 'Orders', sub: 'Everyone who tapped Buy now on the store. Verify payments, unlock series and follow up with students who did not pay.',
      actions: h`<a class="btn ghost" href="store.html" target="_blank" rel="noopener">${icon('external', 16)} Store</a><button class="btn" data-act="csv">${icon('download', 16)} CSV</button><button class="btn" data-act="refresh">${icon('refresh', 16)} Refresh</button>` });
    const ph = document.getElementById('ax-ph');
    if (ph) AX.act(ph, { refresh: b => UI.busy(b, async () => { await S.load(true); if (ctx.alive()) paint(); }), csv: () => csv() });
    const D0 = await S.load(true);
    if (!ctx.alive()) return;
    if (!D0.ok) { AX.set(ctx.el, UI.errorBox(D0, 'supabase_v13_store.sql')); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
    AX.set(ctx.el, h`<div id="oc-k"></div><div class="oc-segs mt16" id="oc-s" role="tablist" aria-label="Order status"></div>
      <div class="oc-tools"><label class="inp-wrap search grow">${icon('search', 17)}<input class="inp" id="oc-q" type="search" placeholder="Search name, mobile, order code, UTR, paid-from…" value="${V.q}" autocomplete="off" aria-label="Search orders"></label>
        <button class="btn" data-act="when" id="oc-when">${icon('calendar', 16)} <span>${V.d === 'day' && V.day ? fmt.day(V.day) : D_LABEL[V.d]}</span>${icon('chevD', 15)}</button></div>
      <div id="oc-h"></div><div id="oc-l"></div>`);
    const $ = id => ctx.el.querySelector('#' + id);
    const paint = () => {
      const D = S.cur, c = counts(D), now = Date.now(), t0 = new Date().setHours(0, 0, 0, 0);
      const ver = D.orders.filter(o => S.seg(o) === 'verify'), paidT = D.orders.filter(o => S.seg(o) === 'done' && ms(o.paid_at || o.created_at) >= t0);
      const paid7 = D.orders.filter(o => S.seg(o) === 'done' && ms(o.created_at) >= now - 7 * DAY);
      const kp = (seg, label, value, foot, tone, ic, hero) => h`<button class="kpi glass ${tone} ${hero ? 'hero' : ''} ${V.seg === seg ? 'on' : ''}" data-act="seg" data-seg="${seg}"><div class="k-l">${icon(ic, 16)}<span>${label}</span></div><div class="k-v">${value}</div><div class="k-f"><span>${foot}</span></div></button>`;
      AX.set($('oc-k'), h`<div class="kpis oc-kpis">
        ${kp('verify', 'Waiting to verify', fmt.inr(ver.reduce((s, o) => s + (Number(o.amount) || 0), 0)), fmt.plural(ver.length, 'payment') + (ver.length ? ' · tap to check' : ' · all checked'), '', 'wallet', ver.length > 0)}
        ${kp('req', 'Access requests', c.req, D.students ? 'new students waiting' : 'needs Students access', 'gold', 'userPlus')}
        ${kp('unpaid', 'Not paid yet', c.unpaid, 'follow up · counselling', 'info', 'clock')}
        ${kp('done', 'Collected today', fmt.inr(paidT.reduce((s, o) => s + (Number(o.amount) || 0), 0)), fmt.inr(paid7.reduce((s, o) => s + (Number(o.amount) || 0), 0)) + ' in 7 days', 'vio', 'rupee')}</div>`);
      AX.set($('oc-s'), join(SEGS, s => h`<button class="chip ${V.seg === s.id ? 'on' : ''} ${(s.id === 'verify' || s.id === 'req') && c[s.id] ? 'alert' : ''}" data-act="seg" data-seg="${s.id}" role="tab" aria-selected="${V.seg === s.id ? 'true' : 'false'}">${icon(s.icon, 15)}${s.t}<em>${c[s.id]}</em></button>`));
      $('oc-when').classList.toggle('hide', V.seg === 'req');
      AX.set($('oc-h'), HINT[V.seg] ? h`<div class="callout info sm oc-hint">${icon('info', 16)}<div>${HINT[V.seg]}</div></div>` : '');
      drawList();
    };
    const drawList = () => {
      const D = S.cur, el = $('oc-l');
      if (V.seg === 'req') {
        if (!D.students) return AX.set(el, h`<div class="card">${UI.empty({ tone: 'lock', icon: 'lock', title: 'Access requests need Students access', text: D.stErr && D.stErr.error !== 'forbidden' ? AX.errText(D.stErr) : 'Ask the owner to give you access to Students to see and approve new students.' })}</div>`);
        const q = V.q.trim().toLowerCase();
        const L = S.requests(D).filter(s => !q || (s.name + ' ' + s.mobile).toLowerCase().includes(q));
        return AX.set(el, L.length ? h`<div class="oc-grid">${join(L, s => reqCard(s, D))}</div>` : h`<div class="card">${UI.empty({ icon: 'userPlus', title: q ? 'No request matches your search' : 'No new access requests', text: q ? 'Try a name or mobile number.' : 'New students who tap “Request access” on the website show up here.' })}</div>`);
      }
      const L = listOf(D), more = L.length > V.limit;
      const empty = V.q ? ['search', 'No order matches your search', 'Try a name, mobile, order code or UTR.'] : V.seg === 'verify' ? ['checkCircle', 'No payments waiting', 'When a student sends their UTR it shows up here for you to check.'] : V.seg === 'unpaid' ? ['checkCircle', 'Nobody is waiting', 'Everyone who ordered has paid.'] : ['inbox', 'No orders here', V.d !== 'all' ? 'Try a longer period.' : 'Orders from the store show up here.'];
      AX.set(el, L.length ? h`<div class="xs mut" style="margin:0 2px 10px">${fmt.plural(L.length, 'order')}${V.d !== 'all' ? ' · ' + (V.d === 'day' ? fmt.day(V.day) : D_LABEL[V.d]) : ''} · ${fmt.inr(L.reduce((s, o) => s + (Number(o.amount) || 0), 0))}</div>
        <div class="oc-grid">${join(L.slice(0, V.limit), o => orderCard(o, D, false))}</div>${more ? h`<div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-act="more">Show ${Math.min(40, L.length - V.limit)} more</button></div>` : ''}`
        : h`<div class="card">${UI.empty({ icon: empty[0], title: empty[1], text: empty[2], action: V.q || V.d !== 'all' ? h`<button class="btn sm" data-act="clear">${icon('x', 15)} Clear filters</button>` : '' })}</div>`);
    };
    const setSeg = (s) => { V.seg = s; V.limit = 40; history.replaceState(null, '', '#/orders/' + s); paint(); };
    cardActs(ctx.el, null);
    AX.act(ctx.el, {
      seg: el => setSeg(el.dataset.seg),
      more: () => { V.limit += 40; drawList(); },
      clear: () => { V.q = ''; V.d = 'all'; V.day = null; $('oc-q').value = ''; paint(); syncWhen(); },
      when(el) {
        UI.menu(el, [{ head: 'Ordered' }, ...['all', '1', '7', '30'].map(k => ({ label: D_LABEL[k], icon: V.d === k ? 'check' : 'calendar', fn: () => { V.d = k; V.day = null; syncWhen(); drawList(); } })),
          { sep: true }, { label: 'Pick a day…', icon: 'calendar', fn: async () => { const v = await UI.pickDateTime({ value: V.day || Date.now(), time: false, clear: false, title: 'Orders of one day' }); if (v) { V.d = 'day'; V.day = new Date(v).setHours(0, 0, 0, 0); syncWhen(); drawList(); } } }]);
      }
    });
    const syncWhen = () => AX.set($('oc-when'), h`${icon('calendar', 16)} <span>${V.d === 'day' && V.day ? fmt.day(V.day) : D_LABEL[V.d]}</span>${icon('chevD', 15)}`);
    $('oc-q').addEventListener('input', AX.u.debounce(e => { V.q = e.target.value; V.limit = 40; drawList(); }, 160));
    const off = AX.on('orders:changed', async (x) => { if (!ctx.alive()) return off(); if (!(x && x.soft)) await S.load(false); if (ctx.alive()) paint(); });
    paint();
    if (ctx.q.open) S.openOrder(ctx.q.open);
    function csv() {
      const D = S.cur; if (!D) return;
      const L = V.seg === 'req' ? [] : listOf(D);
      AX.u.csvDownload('orders-' + V.seg + '.csv', [['Ordered', 'Order', 'Name', 'Mobile', 'Series', 'Amount', 'Status', 'Paid from', 'UTR', 'Details sent', 'Contacted', 'Note'],
        ...L.map(o => [new Date(ms(o.created_at)).toLocaleString('en-IN'), o.code, o.name, o.mobile, o.item_title, o.amount, (SEG_PILL[S.seg(o)] || [''])[0], o.payer || '', o.utr || '', o.paid_at ? new Date(ms(o.paid_at)).toLocaleString('en-IN') : '', o.contact_n || 0, o.note || ''])]);
    }
  },
  async search(q) {
    const r = await AX.data.store(); if (!r || !r.ok) return [];
    return (r.orders || []).filter(o => [o.code, o.mobile, o.name, o.utr, o.payer].join(' ').toLowerCase().includes(q)).slice(0, 8)
      .map(o => { const p = SEG_PILL[S.seg(o)]; return { g: 'Orders', title: (o.name || 'Student') + ' · ' + o.code, sub: (o.item_title || '') + ' · ' + fmt.inr(o.amount) + (o.utr ? ' · UTR ' + o.utr : ''), icon: 'cart', tag: p[0].split(' ·')[0], tone: p[1], go: '#/orders/all?open=' + encodeURIComponent(o.code), run: () => S.openOrder(o.code) }; });
  },
  async attention() {
    const r = await AX.data.store(); if (!r || !r.ok) return [];
    const ver = (r.orders || []).filter(o => S.seg(o) === 'verify');
    const out = [{ title: 'Payments to verify', sub: fmt.inr(ver.reduce((s, o) => s + (Number(o.amount) || 0), 0)) + ' waiting · check the UTR and approve', count: ver.length, go: '#/orders/verify', icon: 'wallet', tone: 'bad', badge: true }];
    if (AX.can('students')) { const st = await AX.data.students(); if (st && st.ok) out.push({ title: 'Access requests', sub: 'New students waiting for an access code', count: (st.students || []).filter(s => s.status === 'pending').length, go: '#/orders/req', icon: 'userPlus', tone: 'gold', badge: true }); }
    return out;
  }
});
AX.actions.push({ label: 'Payments to verify', icon: 'wallet', perm: ['store'], run: () => AX.go('orders/verify') });
AX.actions.push({ label: 'Access requests', icon: 'userPlus', perm: ['store'], run: () => AX.go('orders/req') });

AX.css('orders', `
.oc-kpis .kpi{border-radius:var(--r-lg)}
.oc-kpis .kpi.on{border-color:var(--pri-line);box-shadow:var(--shadow),0 0 0 1px var(--pri-line) inset}
.oc-segs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px;margin:0 -2px}
.oc-segs::-webkit-scrollbar{display:none}
.oc-segs .chip{flex:none}
.oc-segs .chip .ax-ic{width:15px;height:15px}
.oc-tools{display:flex;gap:10px;align-items:center;margin:12px 0 14px;min-width:0}
.oc-tools .search .inp{border-radius:var(--r-pill)}
.oc-hint{margin-bottom:14px}
.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr));gap:14px;align-items:start}
.oc{position:relative;display:flex;flex-direction:column;gap:12px;padding:16px 16px 14px;overflow:hidden}
.oc::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--oc,var(--line-2))}
.oc.s-verify{--oc:var(--gold)}.oc.s-done{--oc:var(--ok)}.oc.s-rej{--oc:var(--bad)}.oc.s-req{--oc:var(--info)}.oc.s-unpaid{--oc:var(--faint)}
.oc-name{display:block;border:0;background:none;padding:0;font-weight:750;font-size:15px;color:var(--tx);text-align:left;cursor:pointer;max-width:100%}
.oc-name:hover{color:var(--pri)}
.oc-item{display:flex;align-items:flex-end;gap:12px;padding:12px 14px;border-radius:var(--r-md);background:var(--solid-2);border:1px solid var(--line);min-width:0}
.oc-item .ax-ic{width:13px;height:13px;vertical-align:-2px}
.oc-t{display:block;margin-top:2px;line-height:1.35;overflow-wrap:anywhere}
.oc-amt{font-family:var(--font-display);font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1;white-space:nowrap;font-variant-numeric:lining-nums tabular-nums}
.oc-pay{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:12px;padding:0 2px}
.oc-pay .k{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:2px}
.oc-pay .v{font-weight:650;overflow-wrap:anywhere;min-width:0}
.oc-fol{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--tx-2);padding:10px 12px;border-radius:var(--r-md);background:var(--gold-soft)}
.oc-fol .ax-ic{width:14px;height:14px;color:var(--gold);margin-top:2px}
.oc-note{white-space:pre-wrap;overflow-wrap:anywhere}
.oc-f{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line);margin-top:auto}
.oc-con{display:flex;gap:6px}
.oc-con .ibtn{width:36px;height:36px}
.oc-act{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.ibtn.ic-wa{color:#1fae55}.ibtn.ic-tg{color:#229ed9}
.oc-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px;border-radius:var(--r-md);border:1px solid var(--line-2);background:var(--solid-2);color:var(--tx);transition:border-color var(--fast),background var(--fast)}
.oc-opt:hover{border-color:var(--pri-line);background:var(--pri-soft)}
.oc-oi{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri);flex:none}
.oc-opt.warn .oc-oi{background:var(--warn-soft);color:var(--warn)}
.oc-done{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--ok-soft);color:var(--ok)}
.oc-done.bad{background:var(--warn-soft);color:var(--warn)}
.oc-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.oc-steps li{display:flex;gap:10px;align-items:flex-start;font-weight:650;font-size:14px}
.oc-steps li .ax-ic{margin-top:2px;color:var(--ok)}
.oc-steps li.bad{color:var(--warn)}.oc-steps li.bad .ax-ic{color:var(--warn)}
.oc-msg{white-space:pre-wrap;font-size:13.5px;line-height:1.55;max-height:260px;overflow:auto;overflow-wrap:anywhere}
@media (max-width:560px){
  .oc-tools #oc-when span{max-width:84px;overflow:hidden;text-overflow:ellipsis}
  .oc-con{width:100%}
  .oc-con .ibtn{flex:1;width:auto;height:42px}
  .oc-act{width:100%;margin-left:0}
  .oc-act .btn{flex:1;--h:40px}
  .oc-amt{font-size:22px}
}
`);
})();
