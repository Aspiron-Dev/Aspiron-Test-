/* =====================================================================
   Promotions — one link per influencer or campaign: clicks, real leads, paid students, commission, owed, profit.
   Create / edit / pause links, see the orders of a link (count / don't count), record payouts, share the link.
   Server: cbt_admin_promos (get, create, update, orders, set_valid, payout_add, payout_delete) · SQL: supabase_v30_promotions.sql
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const P = { links: [], payouts: [], at: 0, seg: 'all', q: '' };
const ERR = { name: 'Enter a name (at least 2 letters).', code: 'Code: 3–30 letters, numbers or dashes, starting and ending with a letter or number.', exists: 'This code is already used. Choose another.',
  commission: 'Commission must be a whole number, for example 25.', claimed: 'Claimed must be a whole number, or empty.', amount: 'Enter an amount above 0.', date: 'Check the date.',
  link: 'Link not found. Refresh the page.', payout: 'Payout not found. Refresh the page.', order: 'Order not found. Refresh the page.', missing: 'Run supabase_v30_promotions.sql in Supabase first.', network: 'No internet. Try again.' };
const FIELD = { name: 'name', code: 'code', exists: 'code', commission: 'commission', claimed: 'claimed', amount: 'amount', date: 'paid_on' };
const errText = r => ERR[r && r.error] || (r && r.error === 'forbidden' ? AX.errText(r) : 'Could not save. Try again.');
const can = () => AX.can('promotions', 'manage');
const base = () => (AX.sto && AX.sto.siteBase ? AX.sto.siteBase() : location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, ''));
const url = code => base() + 'store.html?ref=' + encodeURIComponent(code);
const ymd = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fromYmd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : AX.fmt.ms(s); };
const suggest = n => String(n || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const calc = l => { const earned = Number(l.earned) || 0, paid = Number(l.paid_out) || 0, rev = Number(l.revenue) || 0;
  return { owed: Math.max(0, earned - paid), conv: l.clicks ? Math.round((l.paid_n || 0) / l.clicks * 1000) / 10 : null, cpl: l.leads ? Math.round(earned / l.leads) : null, profit: rev - earned, earned, paid, rev }; };
const full = l => ({ id: l.id, name: l.name, contact: l.contact || '', note: l.note || '', commission: String(l.commission == null ? 0 : l.commission), claimed: l.claimed == null || l.claimed === '' ? '' : String(l.claimed), active: !!l.active });
const shareMsg = l => `Hi ${String(l.name || '').split(/[\s(]/)[0] || ''} 👋\nHere is your link for ${(AX.cfg || {}).SITE_NAME || 'our test series'}:\n${url(l.code)}\nEvery student who buys through this link is counted for you.`;

async function load(force) {
  if (!force && P.at && Date.now() - P.at < 20000) return { ok: true };
  const r = await AX.api.call('cbt_admin_promos', 'get');
  if (r.ok) { P.links = r.links || []; P.payouts = r.payouts || []; P.at = Date.now(); }
  return r;
}
let VIEW = null;
const repaint = async () => { await load(true); if (VIEW && VIEW.alive()) VIEW.paint(); };

AX.mod({
  id: 'promos', title: 'Promotions', short: 'Promos', icon: 'megaphone', group: 'Commerce', order: 30, perm: 'promotions',
  sub: 'One link per influencer or campaign — clicks, paid students, commission owed and profit.',
  async render(ctx) {
    ctx.head({ title: 'Promotions', sub: 'One link per influencer or campaign. See clicks, real paid students, commission owed and profit. Pause or change any link at any time.',
      actions: can() ? h`<button class="btn pri" data-act="new">${icon('plus', 17)} New link</button>` : '' });
    const ph = document.getElementById('ax-ph'); if (ph) AX.act(ph, { new: () => edit(null) });
    const r = await load(true);
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Open Supabase → SQL Editor, paste supabase_v30_promotions.sql and press Run once. Then refresh.', action: h`<button class="btn sm" data-act="retry">${icon('refresh', 15)} Try again</button>` })}</div>` : UI.errorBox(r, 'supabase_v30_promotions.sql'));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    AX.set(ctx.el, h`<div id="pr-k"></div><div class="row wrap gap16 pr-tools"><label class="inp-wrap search grow">${icon('search', 17)}<input class="inp" id="pr-q" type="search" placeholder="Search name or code" value="${P.q}" aria-label="Search links"></label><div class="seg" id="pr-seg"></div></div><div id="pr-l"></div>`);
    const $ = id => ctx.el.querySelector('#' + id);
    const paint = () => {
      const L = P.links, c = L.map(calc), sum = k => c.reduce((s, x) => s + (x[k] || 0), 0), tot = k => L.reduce((s, l) => s + (Number(l[k]) || 0), 0);
      const profit = sum('profit'), owed = sum('owed');
      AX.set($('pr-k'), h`<div class="kpis pr-kpis">
        ${UI.kpi({ label: 'Revenue', value: fmt.inr(tot('revenue')), icon: 'rupee', hero: true, foot: fmt.plural(tot('paid_n'), 'paid student') })}
        ${UI.kpi({ label: 'Profit', value: fmt.inr(profit), icon: 'trophy', tone: profit >= 0 ? '' : 'bad', foot: 'revenue − commission' })}
        ${UI.kpi({ label: 'Owed now', value: fmt.inr(owed), icon: 'wallet', tone: owed > 0 ? 'warn' : '', foot: fmt.inr(tot('earned')) + ' commission · ' + fmt.inr(tot('paid_out')) + ' paid' })}
        ${UI.kpi({ label: 'Clicks → leads', value: fmt.num(tot('clicks')), icon: 'activity', tone: 'info', foot: fmt.plural(tot('leads'), 'real lead') + ' · ' + (tot('clicks') ? Math.round(tot('paid_n') / tot('clicks') * 1000) / 10 + '% paid' : '—') })}</div>`);
      const n = { all: L.length, on: L.filter(l => l.active).length, off: L.filter(l => !l.active).length };
      AX.set($('pr-seg'), join([['all', 'All'], ['on', 'Active'], ['off', 'Paused']], ([k, t]) => h`<button type="button" class="${P.seg === k ? 'on' : ''}" data-act="seg" data-v="${k}">${t} <span class="mut">${n[k]}</span></button>`));
      list();
    };
    const list = () => {
      const q = P.q.trim().toLowerCase();
      const L = P.links.filter(l => P.seg === 'all' || (P.seg === 'on') === !!l.active).filter(l => !q || (l.name + ' ' + l.code).toLowerCase().includes(q));
      AX.set($('pr-l'), L.length ? h`<div class="pr-grid">${join(L, card)}</div>` : h`<div class="card">${P.links.length ? UI.empty({ icon: 'search', title: 'No link matches', text: 'Try another filter or search.' })
        : UI.empty({ icon: 'megaphone', title: 'No promotion links yet', text: 'Tap “New link”, give the link to an influencer, and every student who buys through it is counted here.', action: can() ? h`<button class="btn pri" data-act="new">${icon('plus', 16)} New link</button>` : '' })}</div>`);
    };
    VIEW = { alive: ctx.alive, paint };
    const byId = id => P.links.find(l => l.id === id);
    AX.act(ctx.el, {
      seg: el => { P.seg = el.dataset.v; paint(); },
      new: () => edit(null),
      edit: el => edit(byId(el.dataset.id)),
      orders: el => orders(byId(el.dataset.id)),
      pay: el => payout(byId(el.dataset.id)),
      toggle: el => UI.busy(el, () => toggle(byId(el.dataset.id))),
      share: el => { const l = byId(el.dataset.id); UI.menu(el, [{ head: 'Share ' + l.code }, { label: 'Copy link', icon: 'copy', fn: () => AX.u.copy(url(l.code)).then(() => UI.toast('Link copied')) }, { label: 'Copy message with link', icon: 'msg', fn: () => AX.u.copy(shareMsg(l)).then(() => UI.toast('Message copied')) }, { label: 'Send on WhatsApp', icon: 'whatsapp', href: 'https://wa.me/?text=' + encodeURIComponent(shareMsg(l)) }, { label: 'Open the link', icon: 'external', href: url(l.code) }]); }
    });
    $('pr-q').addEventListener('input', AX.u.debounce(e => { P.q = e.target.value; list(); }, 150));
    paint();
  },
  search(q) {
    return P.links.filter(l => (l.name + ' ' + l.code).toLowerCase().includes(q)).slice(0, 5).map(l => ({ g: 'Promotions', title: l.name || l.code, sub: l.code + ' · ' + fmt.plural(l.paid_n || 0, 'paid student'), icon: 'megaphone', go: '#/promos', tag: l.active ? 'Active' : 'Paused', tone: l.active ? 'ok' : '' }));
  }
});
AX.creates.push({ label: 'Promotion link', icon: 'megaphone', perm: ['promotions', 'manage'], run() { AX.go('promos'); setTimeout(() => edit(null), 300); } });

function card(l) {
  const c = calc(l), m = can(), claimed = l.claimed != null && l.claimed !== '' ? Number(l.claimed) : null;
  const k = (t, v, tone) => h`<div class="pr-k ${tone || ''}"><span>${t}</span><b>${v}</b></div>`;
  return h`<article class="card pr-card ${l.active ? '' : 'off'}">
    <header class="row top"><span class="av" style="--c:${AX.u.hue(l.code)}">${icon('megaphone', 18)}</span><div class="grow"><div class="row gap6 wrap"><b class="lg ell">${l.name || l.code}</b>${l.active ? h`<span class="pill ok"><span class="d"></span>Active</span>` : UI.pill('Paused', 'warn', true)}</div>
      <div class="xs mut">${l.contact || 'No contact saved'} · ${fmt.inr(l.commission)} per paid student · created ${fmt.date(l.created_at)}</div></div>
      ${m ? h`<button class="ibtn sm line" data-act="edit" data-id="${l.id}" aria-label="Edit ${l.name}" title="Edit">${icon('edit', 15)}</button>` : ''}</header>
    <div class="pr-url"><span class="pill pri mono">${l.code}</span><span class="mono xs ell grow">${url(l.code)}</span><button class="btn xs" data-act="share" data-id="${l.id}">${icon('send', 13)} Share</button></div>
    <div class="pr-ks">${k('Clicks', fmt.num(l.clicks))}${k('Leads', fmt.num(l.leads))}${k('Paid', fmt.num(l.paid_n), 'ok')}${k('Conversion', c.conv == null ? '–' : c.conv + '%')}${k('Revenue', fmt.inr(c.rev))}${k('Commission', fmt.inr(c.earned))}${k('Paid out', fmt.inr(c.paid))}${k('Profit', fmt.inr(c.profit), c.profit >= 0 ? 'ok' : 'bad')}${k('Cost / lead', c.cpl == null ? '–' : fmt.inr(c.cpl))}</div>
    ${claimed != null ? (claimed > (l.paid_n || 0) ? h`<div class="callout bad sm">${icon('alert', 16)}<div>Influencer says <b>${claimed}</b> · system counts <b>${l.paid_n || 0}</b> paid · <b>${claimed - (l.paid_n || 0)}</b> not found</div></div>` : h`<div class="callout ok sm">${icon('checkCircle', 16)}<div>Influencer says <b>${claimed}</b> · system counts <b>${l.paid_n || 0}</b> paid</div></div>`) : ''}
    ${l.note ? h`<p class="xs mut pr-note">${icon('edit', 12)} ${l.note}</p>` : ''}
    <footer class="pr-f"><div class="grow"><div class="xs mut">Owed to influencer</div><b class="pr-owed ${c.owed > 0 ? 'warn' : ''}">${fmt.inr(c.owed)}</b></div>
      <button class="btn sm" data-act="orders" data-id="${l.id}">${icon('cart', 14)} Orders</button>
      ${m ? h`<button class="btn sm" data-act="pay" data-id="${l.id}">${icon('rupee', 14)} Payouts</button><button class="btn sm ghost" data-act="toggle" data-id="${l.id}">${icon(l.active ? 'pause' : 'play', 14)} ${l.active ? 'Pause' : 'Resume'}</button>` : h`<button class="btn sm" data-act="pay" data-id="${l.id}">${icon('rupee', 14)} Payouts</button>`}</footer>
  </article>`;
}
async function toggle(l) {
  if (l.active && !(await UI.confirm({ title: 'Pause ' + (l.name || l.code) + '?', text: 'Students who open this link from now on are not counted. Orders already counted stay.', yes: 'Pause link' }))) return;
  const r = await AX.api.call('cbt_admin_promos', 'update', Object.assign(full(l), { active: !l.active }));
  if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
  UI.toast(l.active ? 'Link paused' : 'Link resumed'); repaint();
}
function edit(l) {
  if (!can()) return UI.toast('You can view promotions but not change them.', { tone: 'warn' });
  const isNew = !l; l = l || { name: '', code: '', commission: 25, claimed: '', contact: '', note: '', active: true };
  UI.modal({ title: isNew ? 'New promotion link' : 'Edit link · ' + l.code, size: 'wide',
    sub: isNew ? 'Give this link to the influencer. Every student who buys through it is counted here.' : 'A new commission applies only to students who pay from now on. Students already counted keep the rate they were counted with.',
    body: h`<form id="pf" class="form-grid" autocomplete="off">
      ${AX.f.input({ name: 'name', label: 'Influencer or campaign name', value: l.name, max: 80, placeholder: 'e.g. Rahul (YouTube)' })}
      ${isNew ? AX.f.input({ name: 'code', label: 'Link code', value: '', max: 30, placeholder: 'rahul-yt', hint: 'Letters, numbers, dash · cannot be changed later', auto: 'off' }) : h`<div class="fld"><label>Link code</label><div class="inp row" style="background:var(--hover)"><span class="mono">${l.code}</span></div><div class="hint">The code cannot be changed.</div></div>`}
      ${AX.f.input({ name: 'commission', label: 'Commission per paid student (₹)', type: 'number', value: l.commission, min: 0, inputmode: 'numeric' })}
      ${AX.f.input({ name: 'claimed', label: 'Claimed by influencer (optional)', type: 'number', value: l.claimed == null ? '' : l.claimed, min: 0, placeholder: 'e.g. 100', inputmode: 'numeric', hint: 'How many paid students they say they sent' })}
      ${AX.f.input({ name: 'contact', label: 'Contact (only your team sees this)', value: l.contact, max: 120, placeholder: 'Telegram, WhatsApp or phone', full: true })}
      ${AX.f.textarea({ name: 'note', label: 'Note', value: l.note, max: 500, rows: 3, full: true })}
      ${isNew ? '' : h`<div class="full">${AX.f.switch({ name: 'active', value: !!l.active, label: 'Link is active', hint: 'Off = students who open it are not counted.' })}</div>`}
      ${isNew ? h`<div class="full well xs mono ell" id="pf-u">${url('your-code')}</div>` : ''}
    </form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save" data-busy="Saving…">${icon('check', 16)} ${isNew ? 'Create link' : 'Save changes'}</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#pf'), ci = f.querySelector('[name=code]');
      if (ci) {
        const show = () => AX.set(el.querySelector('#pf-u'), url(ci.value.trim().toLowerCase() || 'your-code'));
        f.querySelector('[name=name]').addEventListener('input', e => { if (!ci.dataset.t) { ci.value = suggest(e.target.value); show(); } });
        ci.addEventListener('input', () => { ci.dataset.t = '1'; show(); });
      }
      AX.act(el, { async save(btn) {
        AX.f.clearErrors(f); const v = AX.f.read(f);
        const d = { name: v.name.trim(), contact: v.contact.trim(), note: v.note.trim(), commission: String(v.commission).trim(), claimed: String(v.claimed).trim() };
        if (d.name.length < 2) return AX.f.error(f, 'name', ERR.name);
        if (!/^[0-9]{1,6}$/.test(d.commission)) return AX.f.error(f, 'commission', ERR.commission);
        if (d.claimed && !/^[0-9]{1,8}$/.test(d.claimed)) return AX.f.error(f, 'claimed', ERR.claimed);
        if (isNew) { d.code = v.code.trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(d.code)) return AX.f.error(f, 'code', ERR.code); }
        else { d.id = l.id; d.active = !!v.active; }
        await UI.busy(btn, async () => {
          const r = await AX.api.call('cbt_admin_promos', isNew ? 'create' : 'update', d);
          if (!r.ok) return FIELD[r.error] && f.querySelector('[name=' + FIELD[r.error] + ']') ? AX.f.error(f, FIELD[r.error], errText(r)) : UI.toast(errText(r), { tone: 'bad' });
          close(); UI.toast(isNew ? 'Link created: ' + (r.code || d.code) : 'Saved', isNew ? { action: { label: 'Copy link', fn: () => AX.u.copy(url(r.code || d.code)).then(() => UI.toast('Link copied')) } } : {}); repaint();
        });
      } });
    } });
}
function orders(l) {
  const m = can();
  UI.drawer({ title: 'Orders via ' + l.code, sub: l.name, body: UI.skeleton(4),
    async onOpen(el, close, api) {
      let L = [];
      const draw = () => {
        const counted = L.filter(o => o.status === 'paid' && o.valid !== false).length;
        api.set(h`<div class="row wrap gap6" style="margin-bottom:14px">${UI.pill(fmt.plural(L.length, 'order'), '')}${UI.pill(counted + ' paid and counted', 'ok')}${UI.pill(fmt.inr(L.filter(o => o.status === 'paid' && o.valid !== false).reduce((s, o) => s + (Number(o.rate) || 0), 0)) + ' commission', 'gold')}</div>
          ${L.length ? h`<div class="card pad0 list">${join(L, o => h`<div class="li pr-or ${o.valid === false ? 'off' : ''}">${UI.avatar(o.name || 'Student', o.mobile, 'sm')}<div class="grow"><div class="row gap6 wrap"><b class="ell">${o.name || 'Student'}</b>${UI.pill(o.status === 'paid' ? 'Paid' : o.status === 'rejected' ? 'Rejected' : 'Pending', o.status === 'paid' ? 'ok' : o.status === 'rejected' ? 'bad' : '')}${o.valid === false ? UI.pill('Not counted', 'warn') : ''}</div>
              <div class="xs mut">${fmt.mobile(AX.sto ? AX.sto.m10(o.mobile) : o.mobile)} · ${fmt.date(o.at)}${o.code ? ' · ' + o.code : ''}</div>
              <div class="xs tx2">${o.item_title} · ${fmt.inr(o.amount)}${o.status === 'paid' && o.rate != null ? ' · commission ' + fmt.inr(o.rate) : ''}</div>${o.note ? h`<div class="xs mut">Note: ${o.note}</div>` : ''}</div>
            ${m ? h`<button class="btn xs ${o.valid === false ? 'soft' : 'ghost'}" data-act="valid" data-code="${o.code}">${o.valid === false ? h`${icon('check', 13)} Count again` : h`${icon('ban', 13)} Not counted`}</button>` : ''}</div>`)}</div>`
            : UI.empty({ icon: 'cart', title: 'No orders yet', text: 'No student has ordered through this link yet.' })}`);
      };
      const get = async () => { const r = await AX.api.call('cbt_admin_promos', 'orders', { code: l.code }); if (!el.isConnected) return; if (!r.ok) return api.set(h`<div class="callout bad">${icon('alert')}<div>${errText(r)}</div></div>`); L = r.orders || []; draw(); };
      AX.act(api.body, { async valid(b) {
        const o = L.find(x => x.code === b.dataset.code); if (!o) return;
        const valid = o.valid === false; let note = '';
        if (!valid) { const v = await UI.prompt({ title: 'Do not count this order?', label: 'Why? (optional)', placeholder: 'e.g. fake, refunded, duplicate', required: false, yes: 'Do not count', max: 500 }); if (v == null) return; note = v; }
        const r = await AX.api.call('cbt_admin_promos', 'set_valid', { order: o.code, valid, note });
        if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
        UI.toast(valid ? 'Counted again' : 'Not counted'); await get(); repaint();
      } });
      get();
    } });
}
function payout(l) {
  const m = can();
  UI.modal({ title: 'Pay ' + (l.name || l.code), size: '', body: '',
    onOpen(el, close, api) {
      const draw = () => {
        const x = P.links.find(z => z.id === l.id) || l, c = calc(x), H = P.payouts.filter(p => p.link_id === l.id).sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)));
        api.set(h`<div class="pr-ps"><div><span>Commission earned</span><b>${fmt.inr(c.earned)}</b></div><div><span>Already paid</span><b>${fmt.inr(c.paid)}</b></div><div class="${c.owed > 0 ? 'warn' : ''}"><span>Owed now</span><b>${fmt.inr(c.owed)}</b></div></div>
          ${m ? h`<form id="pp" class="form-grid mt16" autocomplete="off">
            ${AX.f.input({ name: 'amount', label: 'Amount paid (₹)', type: 'number', value: c.owed || '', min: 1, inputmode: 'numeric' })}
            ${UI.dtField({ name: 'paid_on', label: 'Date', value: new Date().setHours(12, 0, 0, 0), time: false, clear: false })}
            ${AX.f.input({ name: 'note', label: 'Note (how you paid)', max: 300, placeholder: 'UPI, bank, reference', full: true })}
            <div class="full row end"><button type="button" class="btn pri" data-act="add" data-busy="Saving…">${icon('check', 16)} Save payout</button></div></form>` : ''}
          <div class="section-t">History</div>
          ${H.length ? h`<div class="card flat pad0 list">${join(H, p => h`<div class="li"><span class="av sm" style="--c:#10b981">${icon('rupee', 14)}</span><div class="grow"><b class="num">${fmt.inr(p.amount)}</b><div class="xs mut">${fmt.date(fromYmd(p.paid_on))}${p.note ? ' · ' + p.note : ''}</div></div>${m ? h`<button class="ibtn sm" data-act="del" data-id="${p.id}" aria-label="Remove payout" title="Remove">${icon('trash', 15)}</button>` : ''}</div>`)}</div>` : h`<p class="sm mut">No payouts recorded yet.</p>`}`);
        const f = el.querySelector('#pp'); if (f) UI.wire(f);
      };
      AX.act(el, {
        async add(btn) {
          const f = el.querySelector('#pp'); AX.f.clearErrors(f); const v = AX.f.read(f), amount = String(v.amount).trim();
          if (!/^[0-9]{1,8}$/.test(amount) || +amount < 1) return AX.f.error(f, 'amount', ERR.amount);
          await UI.busy(btn, async () => {
            const r = await AX.api.call('cbt_admin_promos', 'payout_add', { link_id: l.id, amount, paid_on: v.paid_on ? ymd(v.paid_on) : '', note: v.note.trim() });
            if (!r.ok) return FIELD[r.error] === 'amount' ? AX.f.error(f, 'amount', errText(r)) : UI.toast(errText(r), { tone: 'bad' });
            UI.toast('Payout saved'); await repaint(); draw();
          });
        },
        async del(b) {
          if (!(await UI.confirm({ title: 'Remove this payout record?', text: 'The amount owed goes up again.', yes: 'Remove', tone: 'danger' }))) return;
          const r = await AX.api.call('cbt_admin_promos', 'payout_delete', { id: b.dataset.id });
          if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
          UI.toast('Payout removed'); await repaint(); draw();
        }
      });
      draw();
    } });
}

AX.css('promos', `
.pr-tools{margin:16px 0 14px}
.pr-tools .search .inp{border-radius:var(--r-pill)}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr));gap:16px;align-items:start}
.pr-card{display:flex;flex-direction:column;gap:14px}
.pr-card.off{opacity:.78}
.pr-card.off .av{filter:grayscale(1)}
.pr-url{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:var(--r-md);background:var(--solid-2);border:1px solid var(--line);min-width:0}
.pr-url .pill{flex:none}
.pr-ks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border-radius:var(--r-md);overflow:hidden;background:var(--line);border:1px solid var(--line)}
.pr-k{background:var(--solid);padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.pr-k span{font-size:11px;font-weight:700;color:var(--mut);letter-spacing:.02em}
.pr-k b{font-size:15px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-k.ok b{color:var(--ok)}.pr-k.bad b{color:var(--bad)}
.pr-note{display:flex;gap:6px;align-items:flex-start;white-space:pre-wrap;overflow-wrap:anywhere}
.pr-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line)}
.pr-owed{font-family:var(--font-display);font-size:22px;font-weight:600}
.pr-owed.warn{color:var(--warn)}
.pr-or.off{opacity:.65}
.pr-ps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.pr-ps>div{padding:12px;border-radius:var(--r-md);background:var(--solid-2);border:1px solid var(--line);display:flex;flex-direction:column;gap:4px;min-width:0}
.pr-ps span{font-size:11.5px;color:var(--mut);font-weight:700}
.pr-ps b{font-family:var(--font-display);font-size:20px;font-weight:600}
.pr-ps .warn b{color:var(--warn)}
@media (max-width:560px){.pr-f .grow{flex-basis:100%}.pr-f .btn{flex:1}.pr-tools .seg{width:100%}.pr-tools .seg button{flex:1}}
`);
})();
