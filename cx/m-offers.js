/* =====================================================================
   Coupons & Refer — the store's offers.
   Tabs: Coupons (one coupon per test series: code, % or ₹ off, start / end; the same code on many series with its own
         discount each; remove at any time) · Refer & earn (reward per referred buyer, on / off, every referrer with
         joined / bought / earned / used / wallet balance, wallet changes by hand).
   Server: cbt_admin_coupons (get, set, bulk, remove, remove_code) · cbt_admin_refer (get, detail, settings, adjust)
   SQL: supabase_v52_coupons_refer.sql (then supabase_v35_admin_team.sql again)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const DAY = 864e5;
const O = { tab: 'coupons', c: null, r: null, q: '' };
const can = () => AX.can('store', 'manage');
const SQL = 'supabase_v52_coupons_refer.sql';
const ERR = { code: 'Code: 3–24 letters or numbers (A–Z, 0–9, - or _), e.g. DIWALI.', ends_at: 'Choose an end time in the future (after the start).', item: 'Series not found. Refresh the page.',
  kind: 'Choose % or ₹.', value: 'Discount: 1–100 for %, or ₹1 up to the price for ₹.', reward: 'Reward: a whole number from 0 to 10000.', mobile: 'Enter a valid 10-digit mobile number.',
  amount: 'Amount: a whole number, + to add or − to remove (not 0).', too_much: 'The wallet would go below ₹0.', missing: 'Run ' + SQL + ' in Supabase first (then supabase_v35_admin_team.sql again).', network: 'No internet. Try again.' };
const errText = r => ERR[r && r.error] || AX.errText(r);
const off = (c, price) => c.kind === 'pct' ? Math.floor(price * c.value / 100) : Math.min(c.value, price);
const offTxt = c => c.kind === 'pct' ? c.value + '% off' : fmt.inr(c.value) + ' off';
const state = (c, now) => !c.active ? 'off' : now < c.starts_at ? 'soon' : now >= c.ends_at ? 'ended' : 'live';
const STATE = { live: ['Active', 'ok'], soon: ['Starts later', 'info'], ended: ['Ended', 'warn'], off: ['Off', ''] };
const storeBase = () => (AX.sto && AX.sto.siteBase ? AX.sto.siteBase() : location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, ''));

async function loadC(force) { if (!force && O.c) return { ok: true }; const r = await AX.api.call('cbt_admin_coupons', 'get'); if (r.ok) O.c = r; return r; }
async function loadR(force) {
  if (!force && O.r) return { ok: true };
  const [r, mp] = await Promise.all([AX.api.call('cbt_admin_refer', 'get'), AX.api.call('cbt_admin_refer_min', 'get')]);
  if (r.ok) { O.r = r; O.r.min_paid = mp.ok ? mp.min_paid : null; }   // min_paid: supabase_v53_refer_fixes.sql
  return r;
}
let VIEW = null;
const repaint = async () => { O.c = null; O.r = null; AX.cache.drop('store'); if (VIEW && VIEW.alive()) VIEW.reload(); };

AX.mod({
  id: 'offers', title: 'Coupons & Refer', short: 'Offers', icon: 'gift', group: 'Commerce', order: 25, perm: 'store',
  sub: 'Coupon codes for the store and the Refer & earn wallet.',
  async render(ctx) {
    O.tab = ctx.parts[0] === 'refer' ? 'refer' : 'coupons';
    const m = can();
    ctx.head({ title: 'Coupons & Refer', sub: 'One coupon per test series (e.g. DIWALI) with its own discount and end date, and Refer & earn: wallet money for every new student a student brings.',
      tabs: [{ id: 'coupons', title: 'Coupons', icon: 'tag', href: '#/offers/coupons' }, { id: 'refer', title: 'Refer & earn', icon: 'gift', href: '#/offers/refer' }], tab: O.tab,
      actions: m && O.tab === 'coupons' ? h`<button class="btn pri" data-act="new">${icon('plus', 16)} New coupon</button>` : '' });
    const ph = document.getElementById('ax-ph'); if (ph) AX.act(ph, { new: () => editCode(null) });
    AX.set(ctx.el, UI.skeleton(3));
    const r = O.tab === 'coupons' ? await loadC(true) : await loadR(true);
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Open Supabase → SQL Editor, run ' + SQL + ' once, then run supabase_v35_admin_team.sql again. Then refresh.', action: h`<button class="btn sm" data-act="retry">${icon('refresh', 15)} Try again</button>` })}</div>` : UI.errorBox(r, SQL));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    VIEW = { alive: ctx.alive, reload: () => ctx.reload() };
    if (O.tab === 'coupons') coupons(ctx.el); else refer(ctx.el);
  }
});
AX.creates.push({ label: 'Coupon', icon: 'tag', perm: ['store', 'manage'], async run() { AX.go('offers/coupons'); await loadC(false); setTimeout(() => editCode(null), 300); } });

/* ---------- Coupons ---------- */
function groupsOf(d) {
  const G = new Map();
  for (const c of d.coupons || []) { if (!G.has(c.code)) G.set(c.code, []); G.get(c.code).push(c); }
  return [...G.entries()].map(([code, L]) => ({ code, L, ends: Math.max(...L.map(c => c.ends_at)), starts: Math.min(...L.map(c => c.starts_at)) }))
    .sort((a, b) => b.ends - a.ends);
}
function coupons(el) {
  const d = O.c, now = d.now || Date.now(), m = can();
  const item = id => (d.items || []).find(i => i.id === id) || { title: 'Removed series', price: 0 };
  const G = groupsOf(d), live = (d.coupons || []).filter(c => state(c, now) === 'live');
  const paid = (d.coupons || []).reduce((s, c) => s + (+c.paid || 0), 0), given = (d.coupons || []).reduce((s, c) => s + (+c.off_total || 0), 0);
  const none = (d.items || []).filter(i => !(d.coupons || []).some(c => c.item_id === i.id));
  AX.set(el, h`<div class="card of-sw ${d.on === false ? 'off' : ''}"><span class="of-swi">${icon('tag', 20)}</span><div class="grow"><b>Coupon box on the store</b><div class="xs mut">${d.on === false ? 'Off — students do not see “Have a coupon code?” and no code works.' : 'On — students see “Have a coupon code?” at checkout.'}</div></div>
      ${raw(String(AX.f.switch({ name: 'cpn_on', value: d.on !== false, label: d.on === false ? 'Off' : 'On', disabled: !m })).replace('name="cpn_on"', 'name="cpn_on" data-act="cpnsw" aria-label="Coupon box on the store"'))}</div>
    <div class="kpis mt16">
      ${UI.kpi({ label: 'Coupons working now', value: fmt.num(live.length), icon: 'tag', hero: true, foot: fmt.plural(G.length, 'code') + ' · ' + fmt.plural((d.coupons || []).length, 'series', 'series') })}
      ${UI.kpi({ label: 'Paid with a coupon', value: fmt.num(paid), icon: 'cart', tone: 'ok', foot: 'approved orders' })}
      ${UI.kpi({ label: 'Discount given', value: fmt.inr(given), icon: 'percent', tone: 'gold', foot: 'on approved orders' })}
      ${UI.kpi({ label: 'No coupon', value: fmt.num(none.length), icon: 'layers', tone: 'info', foot: 'series without a coupon' })}
    </div>
    <div class="callout info sm mt16">${icon('info', 16)}<div>Make as many codes as you want. Every code works on every series you put it on, with its own discount. Each code can have a <b>limit</b> (how many orders it is valid for), an end time, and can be edited or deleted any time. Students see <b>how many are left</b> on the store, never the code itself.</div></div>
    ${G.length ? h`<div class="of-grid mt16">${join(G, g => {
      const st = state(g.L[0], now), [lab, tone] = STATE[st];
      return h`<article class="card of-card ${st === 'live' ? '' : 'dim'}">
        <header class="row top"><span class="of-code mono">${g.code}</span><div class="grow"><div class="row gap6 wrap">${UI.pill(lab, tone, st === 'live')}${g.L[0].scratch === false ? UI.pill('Private', 'vio') : ''}<span class="xs mut">${st === 'soon' ? 'from ' + fmt.dt(g.starts) + ' · ' : ''}${st === 'ended' ? 'ended ' : 'till '}${fmt.dt(g.ends)}${st === 'live' ? ' · ' + left(g.ends - now) : ''}</span></div></div>
          ${m ? h`<button class="ibtn sm line" data-act="edit" data-code="${g.code}" title="Edit" aria-label="Edit ${g.code}">${icon('edit', 15)}</button>` : ''}</header>
        <div class="xs mut">${g.L[0].max_uses != null ? h`<b class="tx">${fmt.num(g.L[0].used || 0)}</b> used of ${fmt.num(g.L[0].max_uses)} · <b class="${g.L[0].left ? 'ok' : 'bad'}">${fmt.num(g.L[0].left || 0)} left</b>` : h`${fmt.num(g.L[0].used || 0)} used · no limit`}</div>
        <div class="list of-list">${join(g.L, c => { const it = item(c.item_id); return h`<div class="li"><div class="grow"><b class="ell">${it.title}</b><div class="xs mut">${fmt.inr(it.price)} → <b class="tx">${fmt.inr(Math.max(0, it.price - off(c, it.price)))}</b> · ${offTxt(c)}</div></div>${m ? h`<button class="ibtn sm line" data-act="rmone" data-code="${g.code}" data-item="${c.item_id}" title="Remove this code from this series" aria-label="Remove from ${it.title}">${icon('x', 13)}</button>` : ''}<div class="xs mut of-use">${fmt.plural(+c.used || 0, 'order')}<br>${+c.paid || 0} paid</div></div>`; })}</div>
        <footer class="row gap8 wrap">${UI.copyBtn(g.code, 'Copy code')}<button class="btn xs ghost" data-act="msg" data-code="${g.code}">${icon('msg', 13)} Message</button><span class="sp grow"></span>${m ? h`<button class="btn xs ghost" data-act="rmcode" data-code="${g.code}">${icon('trash', 13)} Remove</button>` : ''}</footer>
      </article>`; })}</div>`
    : h`<div class="card mt16">${UI.empty({ icon: 'tag', title: 'No coupons yet', text: 'Make one for a festival or an offer — e.g. DIWALI: Biology ₹100 off, Chemistry 20% off, till Sunday night.', action: m ? h`<button class="btn pri" data-act="new">${icon('plus', 16)} New coupon</button>` : '' })}</div>`}`);
  AX.act(el, {
    async cpnsw(inp) {
      const on = !!inp.checked;
      if (!on && !(await UI.confirm({ title: 'Turn the coupon box off?', text: 'Students will not see “Have a coupon code?” on the store, and no coupon code works until you turn it on again. Your coupons are kept.', yes: 'Turn off' }))) { inp.checked = true; return; }
      inp.disabled = true;
      const r = await AX.api.call('cbt_admin_coupons', 'switch', { on });
      if (!r.ok) { inp.checked = !on; inp.disabled = false; return UI.toast(r.error === 'action' ? 'Run supabase_v52_coupons_refer.sql again, then supabase_v35_admin_team.sql' : errText(r), { tone: 'bad' }); }
      UI.toast(on ? 'Coupon box is on' : 'Coupon box is off'); repaint();
    }
  }, 'change');
  AX.act(el, {
    new: () => editCode(null),
    edit: b => editCode(b.dataset.code),
    msg: b => {
      const g = G.find(x => x.code === b.dataset.code); if (!g) return;
      const t = `🎉 Use coupon *${g.code}* on our store till ${fmt.dt(g.ends)}:\n` + g.L.map(c => `• ${item(c.item_id).title} — ${offTxt(c)}`).join('\n') + `\n${storeBase()}store`;
      AX.u.copy(t).then(() => UI.toast('Message copied'));
    },
    async rmone(b) {
      const it = (d.items || []).find(x => x.id === b.dataset.item);
      if (!(await UI.confirm({ title: 'Remove ' + b.dataset.code + ' from ' + (it ? it.title : 'this series') + '?', text: 'Only this series. The code keeps working on its other series.', yes: 'Remove', tone: 'danger' }))) return;
      const r = await AX.api.call('cbt_admin_coupons', 'remove_one', { item_id: b.dataset.item, code: b.dataset.code });
      if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
      UI.toast('Removed from ' + (it ? it.title : 'the series')); repaint();
    },
    async rmcode(b) {
      const code = b.dataset.code;
      if (!(await UI.confirm({ title: 'Remove coupon ' + code + '?', text: 'It stops working at once on every series. Orders already made keep their discount.', yes: 'Remove', tone: 'danger' }))) return;
      const r = await AX.api.call('cbt_admin_coupons', 'remove_code', { code });
      if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
      UI.toast('Coupon removed'); repaint();
    }
  });
}
const left = ms => ms > DAY ? Math.ceil(ms / DAY) + ' days left' : Math.max(1, Math.round(ms / 36e5)) + ' h left';

// one code: start / end + a discount for each series (empty = this code is not on that series)
function editCode(code) {
  if (!can()) return UI.toast('You can view coupons but not change them.', { tone: 'warn' });
  const d = O.c || { items: [], coupons: [] }, mine = (d.coupons || []).filter(c => c.code === code);
  const by = id => mine.find(c => c.item_id === id), other = id => (d.coupons || []).find(c => c.item_id === id && c.code !== code);
  const end0 = mine.length ? Math.max(...mine.map(c => c.ends_at)) : new Date().setHours(23, 59, 0, 0) + 7 * DAY;
  const st0 = mine.length ? Math.min(...mine.map(c => c.starts_at)) : null;
  UI.modal({ title: code ? 'Edit coupon · ' + code : 'New coupon', size: 'wide',
    sub: 'Give a discount on each series that should take this code. Leave a series empty and the code is not on it. Other codes are not changed.',
    body: h`<form id="cf" class="form-grid" autocomplete="off">
      ${code ? h`<div class="fld"><label>Coupon code</label><div class="inp row" style="background:var(--hover)"><span class="mono">${code}</span></div><input type="hidden" name="code" value="${code}"></div>`
        : AX.f.input({ name: 'code', label: 'Coupon code', max: 24, placeholder: 'DIWALI', hint: 'Students type this. Letters and numbers.' })}
      ${UI.dtField({ name: 'starts_at', label: 'Starts (optional)', value: st0 && st0 > Date.now() ? st0 : null, placeholder: 'Now', hint: 'Empty = works from now' })}
      ${UI.dtField({ name: 'ends_at', label: 'Works till', value: end0, clear: false, hint: 'Stops by itself at this time' })}
      <div class="full">${AX.f.switch({ name: 'scratch', value: !mine.length || mine[0].scratch !== false, label: 'Show on the scratch card and the store', hint: 'Off = a private code (e.g. for one promoter): it works only when typed, nobody sees it on the store.' })}</div>
      ${AX.f.input({ name: 'max_uses', label: 'Valid for how many orders?', value: mine.length && mine[0].max_uses != null ? mine[0].max_uses : '', type: 'number', min: 1, inputmode: 'numeric', placeholder: 'Empty = no limit', hint: 'Once this many orders have the code, it is used up' })}
      <div class="fld"><label>Quick end</label><div class="row gap6 wrap">${join([[3, '3 days'], [7, '7 days'], [15, '15 days'], [30, '30 days']], ([n, l]) => h`<button type="button" class="btn xs" data-act="days" data-n="${n}">${l}</button>`)}</div></div>
      <div class="full"><div class="section-t" style="margin-top:4px">Discount on each series</div>
        <div class="card flat pad0 list of-ed">${join(d.items || [], it => { const c = by(it.id), o = other(it.id); return h`<div class="li of-row"><div class="of-t"><b>${it.title}</b><div class="xs mut">${fmt.inr(it.price)}${it.active === false ? ' · hidden' : ''}</div></div>
          <input class="inp of-v" name="v_${it.id}" type="number" min="1" inputmode="numeric" placeholder="—" value="${c ? c.value : ''}" aria-label="Discount for ${it.title}">
          <select class="inp of-k" name="k_${it.id}" aria-label="% or ₹"><option value="flat" ${c && c.kind === 'flat' ? raw('selected') : ''}>₹ off</option><option value="pct" ${!c || c.kind === 'pct' ? raw('selected') : ''}>% off</option></select></div>`; })}</div>
        <div class="err" data-err="items"></div></div>
    </form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save" data-busy="Saving…">${icon('check', 16)} Save coupon</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#cf'); UI.wire(f);
      AX.act(el, {
        days: b => { const btn = f.querySelector('[data-dtf=ends_at]'); UI.setDt(btn, new Date().setHours(23, 59, 0, 0) + (+b.dataset.n - 1) * DAY); },
        async save(btn) {
          AX.f.clearErrors(f); const v = AX.f.read(f), cc = String(v.code || '').trim().toUpperCase();
          if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(cc)) return AX.f.error(f, 'code', ERR.code);
          if (!v.ends_at || v.ends_at <= Date.now() || (v.starts_at && v.ends_at <= v.starts_at)) return UI.toast(ERR.ends_at, { tone: 'bad' });
          const items = [], drop = [], mu = String(v.max_uses || '').trim();
          if (mu && !/^\d{1,7}$/.test(mu) || (mu && +mu < 1)) return AX.f.error(f, 'max_uses', 'Enter a whole number of 1 or more, or leave it empty.');
          for (const it of d.items || []) {
            const val = String(v['v_' + it.id] || '').trim(), kind = v['k_' + it.id];
            if (!val) { if (by(it.id)) drop.push(it.id); continue; }
            const n = +val;
            if (!/^\d+$/.test(val) || n < 1 || (kind === 'pct' && n > 100) || (kind === 'flat' && n > it.price)) { const i = f.querySelector('[name="v_' + it.id + '"]'); if (i) { i.classList.add('bad'); i.focus(); } return AX.f.error(f, 'items', it.title + ': ' + ERR.value); }
            items.push({ item_id: it.id, kind, value: String(n) });
          }
          if (!items.length && !drop.length) return AX.f.error(f, 'items', 'Give a discount on at least one series.');
          await UI.busy(btn, async () => {
            if (items.length) {
              const r = await AX.api.call('cbt_admin_coupons', 'bulk', { code: cc, ends_at: String(v.ends_at), starts_at: v.starts_at ? String(v.starts_at) : '', items, max_uses: mu || '', scratch: !!v.scratch });
              if (!r.ok) return r.error === 'code' ? AX.f.error(f, 'code', ERR.code) : UI.toast(errText(r), { tone: 'bad' });
            }
            for (const id of drop) await AX.api.call('cbt_admin_coupons', 'remove_one', { item_id: id, code: cc });
            close(); UI.toast(items.length ? 'Coupon ' + cc + ' saved on ' + fmt.plural(items.length, 'series', 'series') : 'Coupon removed', { action: items.length ? { label: 'Copy code', fn: () => AX.u.copy(cc) } : undefined });
            repaint();
          });
        }
      });
    } });
}

/* ---------- Refer & earn ---------- */
function refer(el) {
  const d = O.r, s = d.settings || { reward: 25, active: true }, m = can();
  const q = O.q.trim().toLowerCase();
  const L = (d.people || []).filter(p => !q || (p.name + ' ' + p.mobile + ' ' + p.code).toLowerCase().includes(q));
  AX.set(el, h`<div class="kpis">
      ${UI.kpi({ label: 'Reward per new buyer', value: fmt.inr(s.reward), icon: 'gift', hero: true, foot: s.active ? 'Refer & earn is on' : 'Paused — no new rewards' })}
      ${UI.kpi({ label: 'Students joined by a link', value: fmt.num(d.joined), icon: 'userPlus', tone: 'info', foot: fmt.plural(d.codes, 'link') + ' made' })}
      ${UI.kpi({ label: 'Joined and bought', value: fmt.num(d.bought), icon: 'cart', tone: 'ok', foot: (d.joined ? Math.round(d.bought * 100 / d.joined) : 0) + '% of joined' })}
      ${UI.kpi({ label: 'Rewards · used', value: fmt.inr(d.earned), icon: 'wallet', tone: 'gold', foot: fmt.inr(d.spent) + ' used on approved orders' })}
    </div>
    <div class="grid of-2 mt16">
      <div class="card"><div class="card-h">${icon('settings')}<h3 class="grow">Settings</h3></div>
        <form id="rs" class="col gap12" autocomplete="off">
          ${AX.f.input({ name: 'reward', label: 'Reward for each new student who buys (₹)', type: 'number', value: s.reward, min: 0, inputmode: 'numeric', disabled: !m, hint: 'Added to the sharer\'s wallet when the new student\'s first order is approved. A new amount applies from now on.' })}
          ${d.min_paid != null ? AX.f.input({ name: 'min_paid', label: 'Reward only if the new student paid at least (₹ by UPI)', type: 'number', value: d.min_paid, min: 0, inputmode: 'numeric', disabled: !m, hint: 'Stops misuse with a nearly free order (e.g. a big coupon). 0 = any paid amount.' }) : ''}
          ${AX.f.switch({ name: 'active', value: !!s.active, label: 'Refer & earn is on', hint: 'Off = no new rewards. Wallet money already earned can still be used.', disabled: !m })}
          ${m ? h`<div class="row end"><button type="button" class="btn pri" data-act="rsave" data-busy="Saving…">${icon('check', 16)} Save</button></div>` : ''}
        </form></div>
      <div class="card"><div class="card-h">${icon('info')}<h3 class="grow">How it works</h3></div>
        <ol class="of-how"><li>Every student gets a link on the store and in the app (Me → Refer &amp; earn): <span class="mono">store?r=name12345</span> (first name + last 5 digits). It opens the store.</li>
          <li>A <b>new</b> number that orders from the link is counted as <b>joined</b> — no money for joining.</li>
          <li>When you approve that order (paid at least the minimum above), the sharer gets the reward in the wallet. Undo / reject / delete takes it back.</li>
          <li>The wallet is used only by its owner, signed in to the student app. An order never gets approved if the wallet money was already used elsewhere.</li>
          <li>The wallet cannot be withdrawn. It is used at checkout (part or all of the price). Orders paid from the wallet show <b>Wallet</b> in Orders.</li></ol></div>
    </div>
    <div class="row wrap gap16 of-tools mt16"><label class="inp-wrap search grow">${icon('search', 17)}<input class="inp" id="of-q" type="search" placeholder="Search name, mobile or code" value="${O.q}" aria-label="Search referrers"></label></div>
    <div id="of-l">${list(L)}</div>`);
  AX.act(el, {
    async rsave(b) {
      const f = el.querySelector('#rs'), v = AX.f.read(f), rw = String(v.reward).trim();
      if (!/^\d{1,5}$/.test(rw) || +rw > 10000) return AX.f.error(f, 'reward', ERR.reward);
      const mp = v.min_paid == null ? null : String(v.min_paid).trim();
      if (mp != null && !/^\d{1,6}$/.test(mp)) return AX.f.error(f, 'min_paid', 'A whole number of rupees.');
      await UI.busy(b, async () => {
        const r = await AX.api.call('cbt_admin_refer', 'settings', { reward: rw, active: !!v.active }); if (!r.ok) return UI.toast(errText(r), { tone: 'bad' });
        if (mp != null) { const x = await AX.api.call('cbt_admin_refer_min', 'set', { min_paid: mp }); if (!x.ok) return UI.toast(errText(x), { tone: 'bad' }); }
        UI.toast('Saved'); O.r = null; repaint();
      });
    },
    open: b => detail(b.dataset.m),
    adj: b => adjust(b.dataset.m)
  });
  const qi = el.querySelector('#of-q');
  qi.addEventListener('input', AX.u.debounce(e => { O.q = e.target.value; const s2 = O.q.trim().toLowerCase(); AX.set(el.querySelector('#of-l'), list((d.people || []).filter(p => !s2 || (p.name + ' ' + p.mobile + ' ' + p.code).toLowerCase().includes(s2)))); }, 150));
}
function list(L) {
  if (!L.length) return h`<div class="card">${UI.empty({ icon: 'gift', title: O.q ? 'Nobody matches' : 'No referrals yet', text: O.q ? 'Try another search.' : 'When students share their link and friends join or buy, they show here.' })}</div>`;
  return h`<div class="card pad0 list">${join(L, p => h`<div class="li of-p">${UI.avatar(p.name || 'Student', p.mobile, 'sm')}<div class="grow"><div class="row gap6 wrap"><b class="ell">${p.name || 'Student'}</b><span class="pill mono">${p.code}</span></div>
      <div class="xs mut">${fmt.mobile(p.mobile)} · ${fmt.plural(+p.joined || 0, 'joined', 'joined')} · ${+p.bought || 0} bought · earned ${fmt.inr(p.earned)}${+p.adjusted ? ' · by hand ' + fmt.inr(p.adjusted) : ''} · used ${fmt.inr(p.spent)}</div></div>
      <div class="of-bal"><span class="xs mut">Wallet</span><b class="num">${fmt.inr(p.balance)}</b></div>
      <button class="btn xs" data-act="open" data-m="${p.mobile}">${icon('list', 13)} Details</button>${can() ? h`<button class="btn xs ghost" data-act="adj" data-m="${p.mobile}">${icon('rupee', 13)} Wallet</button>` : ''}</div>`)}</div>
    ${can() ? h`<div class="row end mt12"><button class="btn sm ghost" data-act="adj" data-m="">${icon('plus', 14)} Add wallet money to any number</button></div>` : ''}`;
}
function detail(mobile) {
  UI.drawer({ title: 'Refer & earn · ' + fmt.mobile(mobile), body: UI.skeleton(4),
    async onOpen(el, close, api) {
      const r = await AX.api.call('cbt_admin_refer', 'detail', { mobile });
      if (!el.isConnected) return;
      if (!r.ok) return api.set(h`<div class="callout bad">${icon('alert')}<div>${errText(r)}</div></div>`);
      const st = o => UI.pill(o.status === 'paid' ? 'Approved' : o.status === 'rejected' ? 'Rejected' : 'Pending', o.status === 'paid' ? 'ok' : o.status === 'rejected' ? 'bad' : '');
      api.set(h`<div class="row wrap gap6" style="margin-bottom:14px">${UI.pill('Wallet ' + fmt.inr(r.balance), 'gold')}${r.code ? h`<span class="pill mono">${r.code}</span>` : ''}${r.code ? UI.copyBtn(storeBase() + 'store?r=' + r.code, 'Copy link') : ''}</div>
        <div class="section-t">Students who joined (${r.links.length})</div>
        ${r.links.length ? h`<div class="card flat pad0 list">${join(r.links, l => h`<div class="li">${UI.avatar(l.name || 'Student', l.mobile, 'sm')}<div class="grow"><b class="ell">${l.name || 'Student'}</b><div class="xs mut">${fmt.mobile(l.mobile)} · joined ${fmt.date(l.at)}</div></div>${l.bought ? UI.pill('Bought', 'ok') : UI.pill('Not bought yet', '')}</div>`)}</div>` : h`<p class="sm mut">Nobody yet.</p>`}
        <div class="section-t">Wallet money in</div>
        ${r.txns.length ? h`<div class="card flat pad0 list">${join(r.txns, t => h`<div class="li"><span class="av sm" style="--c:${t.amount > 0 ? '#10b981' : '#ef4444'}">${icon(t.kind === 'refer' ? 'gift' : 'edit', 14)}</span><div class="grow"><b class="num">${t.amount > 0 ? '+' : '−'}${fmt.inr(Math.abs(t.amount))}</b><div class="xs mut">${fmt.date(t.at)} · ${t.kind === 'refer' ? 'Reward' + (t.order ? ' · order ' + t.order : '') : 'By ' + (t.who || 'admin')}${t.note ? ' · ' + t.note : ''}</div></div></div>`)}</div>` : h`<p class="sm mut">Nothing yet.</p>`}
        <div class="section-t">Orders paid with the wallet</div>
        ${r.orders.length ? h`<div class="card flat pad0 list">${join(r.orders, o => h`<a class="li" href="#" data-act="ord" data-code="${o.code}"><div class="grow"><b class="ell">${o.item_title}</b><div class="xs mut">${o.code} · ${fmt.date(o.at)} · wallet ${fmt.inr(o.wallet_used)} · UPI ${fmt.inr(o.amount)}</div></div>${st(o)}</a>`)}</div>` : h`<p class="sm mut">None.</p>`}`);
      AX.act(api.body, { ord: (b, e) => { if (e) e.preventDefault(); close(); if (AX.openOrder) AX.openOrder(b.dataset.code); else AX.go('orders'); } });
    } });
}
// "put it in the wallet": an overpayment or a gift, kept for the student's next purchase (never refunded, never withdrawn)
AX.walletPut = (o) => adjust(o && o.mobile ? String(o.mobile).replace(/\D/g, '').slice(-10) : '', o || {});
function adjust(mobile, pre) {
  if (!can()) return;
  pre = pre || {};
  const fromOrder = !!(pre.order || pre.put);   // a put: an extra amount, from an order or the student's page
  UI.modal({ title: fromOrder ? 'Put money in the wallet' : 'Change wallet money', size: 'narrow',
    sub: fromOrder ? `${pre.order ? 'Order ' + pre.order + ' · ' : ''}${pre.name || ''}. The student keeps this money in the wallet for their next test series. It cannot be withdrawn and is not refunded.`
      : 'Add money (e.g. a gift or a correction) or remove it. It shows in the student\'s wallet at once and cannot be withdrawn.',
    body: h`<form id="af" class="form-grid" autocomplete="off">
      ${AX.f.input({ name: 'mobile', label: 'Mobile number', value: mobile || '', type: 'tel', inputmode: 'numeric', max: 14, full: true, readonly: !!mobile })}
      ${AX.f.input({ name: 'amount', label: 'Amount (₹)', value: pre.amount || '', placeholder: fromOrder ? 'e.g. 100' : '50 to add · -50 to remove', inputmode: 'numeric', full: true, hint: fromOrder ? 'The extra amount they paid' : '' })}
      ${AX.f.input({ name: 'public_note', label: 'Line the student sees', value: fromOrder ? 'Extra amount paid for your order, kept in your wallet' : '', max: 120, placeholder: 'e.g. Extra amount kept in your wallet', full: true, hint: 'Shown in their wallet history' })}
      ${AX.f.input({ name: 'note', label: 'Internal note', value: pre.order ? `Extra paid for ${pre.order}` : '', max: 300, placeholder: 'Why (the student does not see this)', full: true })}</form>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="ok" data-busy="Saving…">${icon('check', 16)} Save</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#af');
      AX.act(el, { async ok(b) {
        AX.f.clearErrors(f); const v = AX.f.read(f), mb = String(v.mobile).replace(/\D/g, '').slice(-10), amt = String(v.amount).replace(/\s|₹/g, '').replace('−', '-');
        if (!/^[6-9]\d{9}$/.test(mb)) return AX.f.error(f, 'mobile', ERR.mobile);
        if (!/^-?\d{1,6}$/.test(amt) || +amt === 0) return AX.f.error(f, 'amount', ERR.amount);
        if (fromOrder && +amt <= 0) return AX.f.error(f, 'amount', 'Enter the extra amount (more than 0).');
        await UI.busy(b, async () => {
          const r = fromOrder
            ? await AX.api.call('cbt_admin_refer_put', 'add', { mobile: mb, amount: amt.replace('-', ''), note: v.note.trim(), public_note: v.public_note.trim(), order: pre.order || '' })
            : await AX.api.call('cbt_admin_refer', 'adjust', { mobile: mb, amount: amt, note: v.note.trim() });
          if (!r.ok) return r.error === 'amount' || r.error === 'too_much' ? AX.f.error(f, 'amount', errText(r)) : UI.toast(errText(r), { tone: 'bad' });
          close(); UI.toast('Wallet now ' + fmt.inr(r.balance)); repaint();
        });
      } });
    } });
}

AX.css('offers', `
.of-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px;align-items:start}
.of-card{display:flex;flex-direction:column;gap:12px}
.of-sw{display:flex;align-items:center;gap:14px}
.of-sw .sw{flex:none}
.of-swi{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:var(--pri-soft);color:var(--pri)}
.of-sw.off .of-swi{background:var(--hover);color:var(--mut)}
.of-card.dim{opacity:.75}
.of-code{font-size:17px;font-weight:800;letter-spacing:.06em;padding:6px 12px;border-radius:var(--r-md);border:1.5px dashed var(--pri);color:var(--pri);background:var(--pri-soft);flex:none}
.of-list .li{padding:10px 0}
.of-use{text-align:right;flex:none;line-height:1.35}
.of-ed .of-row{display:grid;grid-template-columns:minmax(0,1fr) 100px 110px;align-items:center;gap:10px}
.of-ed .of-t{min-width:0}
.of-ed .of-t b{display:block;overflow-wrap:anywhere;line-height:1.35}
.of-ed .of-v,.of-ed .of-k{width:100%;min-width:0}
@media (max-width:560px){.of-ed .of-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.of-ed .of-t{grid-column:1 / -1}}
.tx-warn{color:var(--warn)}
.of-2{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.of-how{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--tx-2);line-height:1.5}
.of-tools .search .inp{border-radius:var(--r-pill)}
.of-p{flex-wrap:wrap}
.of-bal{display:flex;flex-direction:column;align-items:flex-end;min-width:72px}
.of-bal b{font-size:16px}
@media (max-width:760px){.of-2{grid-template-columns:minmax(0,1fr)}.of-p .grow{flex-basis:calc(100% - 50px)}.of-p .of-bal{margin-right:auto;align-items:flex-start}}
`);
})();
