/* =====================================================================
   Storage + Billing & costs (owner only). Server: cbt_admin_ops (supabase_v70_ops.sql).
   Rules: every number has a source. "Live" = read from our database now. "Plan limit" = the provider's published
   free-plan limit (editable: check your plan). Bills are "Manual" (typed by the owner). Anything the database
   cannot see is shown as "Not available from provider" — never guessed. No provider key ever reaches the browser.
   ===================================================================== */
(function () {
'use strict';
const { h, icon, join, ui: UI, fmt } = AX;
const MB = 1048576, GB = 1073741824;
const NA = 'Not available from provider';
const ops = (a, d) => AX.api.call('cbt_admin_ops', a, d);
const loadStorage = force => AX.cache.get('ops_storage', () => ops('storage'), 60000, force);
const loadCosts = force => AX.cache.get('ops_costs', () => ops('costs'), 60000, force);
const month = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
const prevMonth = () => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - 1); return month(t); };

// Connected services: found in this repository's code/config (evidence = the file). Free-plan limits are the providers'
// published numbers (2026); 'live' = this panel measures it, otherwise usage is not available without a provider key.
const SERVICES = [
  { id: 'Supabase', cat: 'Database · Storage · Functions', ev: 'config.js (SUPABASE_URL), supabase_v*.sql, supabase/functions/send-push',
    on: () => !!AX.url, limits: [{ k: 'Database size', max: 500 * MB, live: 'db' }, { k: 'File storage', max: 1 * GB, live: 'files' },
      { k: 'Egress (bandwidth) / month', max: 5 * GB }, { k: 'Edge Function calls / month', max: 500000, n: true }] },
  { id: 'GitHub Pages', cat: 'Hosting · CDN', ev: 'CNAME, _config.yml', on: () => true,
    limits: [{ k: 'Published site size', max: 1 * GB }, { k: 'Bandwidth / month (soft)', max: 100 * GB }] },
  { id: 'GitHub Actions', cat: 'Backups · security tests', ev: '.github/workflows/*.yml', on: () => true,
    limits: [{ k: 'Minutes / month (private repo, Free plan)', max: 2000, n: true }] },
  { id: 'Web Push', cat: 'Phone notifications', ev: 'config.js (VAPID_PUBLIC), sw.js', on: () => !!AX.cfg.VAPID_PUBLIC, limits: [] },
  { id: 'Telegram bot', cat: 'Security alerts', ev: 'supabase_v63_telegram_alerts.sql', on: () => true, limits: [] },
  { id: 'Google Fonts / jsDelivr', cat: 'Fonts · OCR files', ev: 'cp-dt764twzf54s5m.html (CSP)', on: () => true, limits: [] }
];

AX.css('ops', `.bar-meter.warn i{background:var(--warn)}.bar-meter.bad i{background:var(--bad)}
.ops-src{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
.ops-svc{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.ops-lim{display:grid;gap:4px;margin-top:10px}.ops-lim .row{justify-content:space-between}`);

const pctTone = p => p >= 100 ? 'bad' : p >= 80 ? 'warn' : '';
const meter = (used, max) => { const p = max ? Math.min(100, Math.round(used * 100 / max)) : 0; return h`<div class="bar-meter ${pctTone(used * 100 / max)}" role="meter" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(2, p)}%"></i></div>`; };
const src = t => h`<span class="ops-src">${t}</span>`;
const errOut = (ctx, r) => { AX.set(ctx.el, UI.errorBox(r, 'supabase_v70_ops.sql')); AX.act(ctx.el, { retry: () => ctx.reload() }); };

/* ---------------- Storage ---------------- */
AX.mod({
  id: 'storage', title: 'Storage', icon: 'db', group: 'Content & storage', order: 10, perm: 'owner',
  sub: 'How much space the database and files use, and where.',
  async render(ctx) {
    AX.set(ctx.el, UI.skeleton(4, 'kpi'));
    const r = await loadStorage(true);
    if (!ctx.alive()) return;
    ctx.head({ title: 'Storage', sub: 'Live sizes read from the database now. Plan limits are Supabase Free plan numbers.',
      actions: h`<button class="btn sm" data-act="csv">${icon('download', 15)} Export CSV</button><button class="btn sm" data-act="ref">${icon('refresh', 15)} Refresh</button>` });
    AX.act(document.getElementById('ax-ph'), { ref: () => ctx.reload(), csv: () => r.ok && AX.u.csvDownload('aspiron-storage.csv', [['Kind', 'Name', 'Rows/files', 'Bytes'],
      ...r.tables.map(t => ['table', t.schema + '.' + t.table, t.rows, t.bytes]), ...r.buckets.map(b => ['bucket', b.bucket, b.files, b.bytes]), ...r.largest.map(f => ['file', f.bucket + '/' + f.name, 1, f.bytes])]) });
    if (!r.ok) return errOut(ctx, r);
    const hist = r.history || [], first = hist[0], days = first ? Math.max(1, (Date.parse(hist[hist.length - 1].day) - Date.parse(first.day)) / 864e5) : 0;
    const grow = hist.length > 1 && days >= 1 ? (r.db_bytes + r.file_bytes - first.db - first.files) / days : null;
    const tot = r.types.reduce((s, x) => s + x.bytes, 0), COL = { PDFs: '#2563eb', Images: '#0ea5e9', Videos: '#8b5cf6', Backups: '#f59e0b', Other: '#94a3b8' };
    AX.set(ctx.el, h`<div class="kpis">
        ${UI.kpi({ label: 'Database', icon: 'db', value: fmt.bytes(r.db_bytes), foot: fmt.pct(r.db_bytes, 500 * MB) + ' of 500 MB free plan', tone: pctTone(r.db_bytes * 100 / (500 * MB)) || 'info' })}
        ${UI.kpi({ label: 'Files (Supabase Storage)', icon: 'folder', value: r.storage ? fmt.bytes(r.file_bytes) : '—', foot: r.storage ? fmt.pct(r.file_bytes, GB) + ' of 1 GB free plan' : 'Storage is not used', tone: 'vio' })}
        ${UI.kpi({ label: 'Growth per day', icon: 'activity', value: grow == null ? '—' : fmt.bytes(Math.max(0, grow)), foot: grow == null ? 'Shown after 2 days of snapshots' : 'Average over ' + fmt.plural(Math.round(days), 'day'), tone: 'ok' })}
        ${UI.kpi({ label: 'Bandwidth (egress)', icon: 'globe', value: '—', foot: NA, tone: 'gold' })}
      </div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-h"><h3>Free plan usage</h3><span class="grow"></span>${src('Live')}</div>
          <div class="col gap16"><div><div class="row sm"><b class="grow">Database</b><span class="num">${fmt.bytes(r.db_bytes)} / 500 MB</span></div>${meter(r.db_bytes, 500 * MB)}</div>
          <div><div class="row sm"><b class="grow">File storage</b><span class="num">${fmt.bytes(r.file_bytes)} / 1 GB</span></div>${meter(r.file_bytes, GB)}</div>
          <p class="xs mut">A warning shows in the bell at 80%. Supabase Free pauses the project after a week without use, and refuses writes when the database is over its limit.</p></div></div>
        <div class="card"><div class="card-h"><h3>Files by type</h3><span class="grow"></span>${src('Live')}</div>
          ${tot ? h`<div class="row gap16 wrap">${UI.chart.donut(r.types.map(x => ({ label: x.type, value: x.bytes, color: COL[x.type] || '#94a3b8' })), { center: fmt.bytes(tot), sub: 'files' })}
            <div class="col gap6 grow">${join(r.types, x => h`<div class="row sm"><span style="width:10px;height:10px;border-radius:3px;background:${COL[x.type] || '#94a3b8'}"></span><span class="grow">${x.type}</span><span class="mut">${fmt.num(x.files)} · ${fmt.bytes(x.bytes)}</span></div>`)}</div></div>`
            : UI.empty({ icon: 'folder', title: 'No files in Supabase Storage', text: 'Test PDFs and images are kept inside database tables (see the list below).' })}</div>
      </div>
      ${hist.length > 1 ? h`<div class="card mt16"><div class="card-h"><h3>Size over time</h3><span class="grow"></span>${src('Daily snapshot')}</div>${UI.chart.area(hist.map(x => ({ label: x.day.slice(5), value: Math.round((x.db + x.files) / MB) })), { label: 'MB used per day' })}<p class="xs mut">MB (database + files). One snapshot is saved each day this page is opened.</p></div>` : ''}
      <div class="grid g2 mt16">
        <div class="card pad0"><div class="card-h" style="padding:16px 16px 0"><h3>Biggest tables</h3><span class="grow"></span>${src('Live')}</div>
          <div class="list">${join(r.tables, t => h`<div class="li"><span class="grow ell mono sm">${t.table}</span>${t.rows > 0 ? h`<span class="xs mut">≈ ${fmt.num(t.rows)} rows</span>` : ''}<b class="num sm">${fmt.bytes(t.bytes)}</b></div>`)}</div></div>
        <div class="card pad0"><div class="card-h" style="padding:16px 16px 0"><h3>Largest files</h3><span class="grow"></span>${src('Live')}</div>
          <div class="list">${r.largest.length ? join(r.largest, f => h`<div class="li"><span class="grow ell sm" title="${f.bucket}/${f.name}">${f.name}<span class="xs mut" style="display:block">${f.bucket} · ${fmt.ago(f.at)}</span></span><b class="num sm">${fmt.bytes(f.bytes)}</b></div>`)
            : UI.empty({ icon: 'inbox', title: 'No files' })}</div></div>
      </div>`);
  },
  async attention() {
    const r = await loadStorage(); if (!r.ok) return [];
    const p = Math.max(r.db_bytes * 100 / (500 * MB), r.file_bytes * 100 / GB);
    return p >= 80 ? [{ title: 'Storage near the free plan limit', sub: Math.round(p) + '% used', count: 1, go: '#/storage', icon: 'db', tone: p >= 100 ? 'bad' : 'gold', badge: true }] : [];
  }
});

/* ---------------- Billing & costs ---------------- */
const sumOf = (L, svc, m) => L.filter(c => c.currency === 'INR' && (!svc || c.service === svc) && (typeof m === 'function' ? m(c.month) : c.month === m)).reduce((s, c) => s + Number(c.amount), 0);
AX.mod({
  id: 'billing', title: 'Billing & costs', short: 'Costs', icon: 'rupee', group: 'Costs & integrations', order: 10, perm: 'owner',
  sub: 'Every service the app uses, its free plan, budgets and bills.',
  async render(ctx) {
    const tab = ctx.parts[0] || 'overview';
    AX.set(ctx.el, UI.skeleton(4, 'kpi'));
    const [r, st] = await Promise.all([loadCosts(true), loadStorage()]);
    if (!ctx.alive()) return;
    ctx.head({ title: 'Billing & costs', sub: 'Bills are typed in by you (marked Manual). Usage the database can see is Live; the rest needs the provider\'s own dashboard.',
      tabs: [{ id: 'overview', title: 'Overview', icon: 'chart' }, { id: 'services', title: 'Services & free plans', icon: 'globe' }, { id: 'bills', title: 'Bills', icon: 'fileText' }], tab,
      actions: h`<button class="btn sm pri" data-act="add">${icon('plus', 15)} Add bill</button>` });
    AX.act(document.getElementById('ax-ph'), { add: () => addBill(ctx) });
    if (!r.ok) return errOut(ctx, r);
    const L = r.costs, B = r.budgets || {}, m = month(), pm = prevMonth(), y = m.slice(0, 4);
    const now = Date.now(), soon = L.filter(c => !c.paid && c.due_ms && c.due_ms < now + 7 * 864e5);
    if (tab === 'services') return services(ctx, st);
    if (tab === 'bills') return bills(ctx, L);
    const svcs = [...new Set([...SERVICES.map(s => s.id), ...Object.keys(B), ...L.map(c => c.service)])];
    const bud = Object.values(B).reduce((s, v) => s + Number(v), 0), cur = sumOf(L, null, m);
    AX.set(ctx.el, h`<div class="kpis">
        ${UI.kpi({ label: 'This month', icon: 'rupee', value: fmt.inr(cur), foot: bud ? fmt.pct(cur, bud) + ' of ' + fmt.inr(bud) + ' budget' : 'No budget set', hero: true })}
        ${UI.kpi({ label: 'Last month', icon: 'calendar', value: fmt.inr(sumOf(L, null, pm)), tone: 'info' })}
        ${UI.kpi({ label: 'Year to date', icon: 'chart', value: fmt.inr(sumOf(L, null, x => x.slice(0, 4) === y)), tone: 'vio' })}
        ${UI.kpi({ label: 'Unpaid · due in 7 days', icon: 'clock', value: String(soon.length), foot: soon.length ? fmt.inr(soon.reduce((s, c) => s + Number(c.amount), 0)) : 'Nothing due', tone: soon.length ? 'warn' : 'ok' })}
      </div>
      ${L.some(c => c.currency === 'USD') ? h`<div class="callout info mt16">${icon('info')}<div class="sm">Bills in USD are listed under Bills but not added to the ₹ totals (no exchange rate is guessed).</div></div>` : ''}
      <div class="card pad0 mt16"><div class="card-h" style="padding:16px 16px 0"><h3>Budget per service · ${m}</h3><span class="grow"></span>${src('Manual')}</div>
        <div class="list">${join(svcs, s => { const spent = sumOf(L, s, m), b = Number(B[s] || 0), p = b ? spent * 100 / b : 0;
          return h`<div class="li"><div class="grow"><div class="row sm"><b class="grow">${s}</b>${b ? (p >= 100 ? UI.pill('Over budget', 'bad') : p >= 80 ? UI.pill(Math.round(p) + '% used', 'warn') : UI.pill(Math.round(p) + '%', 'ok')) : ''}<span class="num">${fmt.inr(spent)}${b ? ' / ' + fmt.inr(b) : ''}</span></div>${b ? meter(spent, b) : h`<div class="xs faint">No budget</div>`}</div>
            <button class="btn xs" data-act="budget" data-s="${s}" data-v="${b || ''}">${icon('edit', 13)} Budget</button></div>`; })}</div></div>
      <p class="xs mut mt12">Alerts: a service at 80% of its budget shows in the bell; at 100% it shows in red.</p>`);
    AX.act(ctx.el, {
      async budget(el) {
        const v = await UI.prompt({ title: 'Monthly budget · ' + el.dataset.s, label: 'Amount in ₹ (empty = no budget)', value: el.dataset.v, type: 'number' });
        if (v == null) return;
        const x = await ops('budget_set', { service: el.dataset.s, amount: String(v).trim() });
        if (!x.ok) return UI.err(x);
        UI.toast('Budget saved'); AX.cache.drop('ops_costs'); AX.emit('data:changed'); ctx.reload();
      }
    });
  },
  async attention() {
    const r = await loadCosts(); if (!r.ok) return [];
    const m = month(), B = r.budgets || {}, out = [];
    const over = Object.keys(B).filter(s => sumOf(r.costs, s, m) >= 0.8 * Number(B[s]));
    if (over.length) out.push({ title: 'Budget alert', sub: over.join(', '), count: over.length, go: '#/billing', icon: 'rupee', tone: over.some(s => sumOf(r.costs, s, m) >= Number(B[s])) ? 'bad' : 'gold', badge: true });
    const due = r.costs.filter(c => !c.paid && c.due_ms && c.due_ms < Date.now() + 7 * 864e5).length;
    if (due) out.push({ title: 'Bills due soon', sub: 'Unpaid, due within 7 days', count: due, go: '#/billing/bills', icon: 'clock', tone: 'gold', badge: true });
    return out;
  }
});

function services(ctx, st) {
  const live = { db: st && st.ok ? st.db_bytes : null, files: st && st.ok ? st.file_bytes : null };
  const val = (l, v) => l.n ? fmt.num(v) : fmt.bytes(v);
  AX.set(ctx.el, h`<div class="callout info">${icon('info')}<div class="sm">Found in this app's code and config (the file is shown on each card). Limits are each provider's published free plan; check your own plan if you upgraded. Usage that only the provider can see needs its dashboard: ${NA.toLowerCase()} here, and no provider key is stored in the browser.</div></div>
    <div class="ops-svc mt16">${join(SERVICES.filter(s => s.on()), s => h`<div class="card"><div class="row"><b class="grow">${s.id}</b>${UI.pill('Connected', 'ok', true)}</div>
      <div class="xs mut">${s.cat}</div><div class="xs faint mt4 mono ell" title="${s.ev}">${s.ev}</div>
      ${s.limits.length ? h`<div class="ops-lim">${join(s.limits, l => { const v = l.live ? live[l.live] : null; return h`<div class="mt8"><div class="row xs"><span class="grow">${l.k}</span><b class="num">${v == null ? NA : val(l, v) + ' / ' + val(l, l.max)}</b></div>${v == null ? '' : meter(v, l.max)}<div>${src(v == null ? 'Plan limit ' + val(l, l.max) : 'Live')}</div></div>`; })}</div>`
        : h`<div class="xs mut mt8">Free · no usage limit to track here.</div>`}</div>`)}</div>`);
}

function bills(ctx, L) {
  AX.set(ctx.el, h`<div class="row end"><button class="btn sm" data-act="csv">${icon('download', 15)} Export CSV</button></div>
    ${L.length ? h`<div class="tbl-wrap mt12"><table class="tbl"><thead><tr><th>Month</th><th>Service</th><th>Amount</th><th>Kind</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${join(L, c => h`<tr>
      <td class="num">${c.month}</td><td><b>${c.service}</b>${c.note ? h`<div class="xs mut">${c.note}</div>` : ''}</td>
      <td class="num b">${c.currency === 'INR' ? fmt.inr(c.amount) : '$' + Number(c.amount).toFixed(2)}</td>
      <td>${UI.pill(c.kind === 'estimate' ? 'Estimate' : 'Manual bill', c.kind === 'estimate' ? 'info' : '')}</td>
      <td class="sm">${c.due_ms ? fmt.date(c.due_ms) : '—'}</td>
      <td>${c.paid ? UI.pill('Paid', 'ok') : UI.pill('Unpaid', c.due_ms && c.due_ms < Date.now() ? 'bad' : 'warn')}</td>
      <td class="row end gap6"><button class="btn xs" data-act="paid" data-id="${c.id}" data-p="${c.paid ? '' : '1'}">${c.paid ? 'Mark unpaid' : 'Mark paid'}</button><button class="ibtn sm" data-act="del" data-id="${c.id}" aria-label="Delete">${icon('trash', 15)}</button></td></tr>`)}</tbody></table></div>`
      : h`<div class="card mt12">${UI.empty({ icon: 'fileText', title: 'No bills yet', text: 'Everything runs on free plans. When a provider sends a bill, add it here to track the budget.', action: h`<button class="btn sm pri" data-act="add">${icon('plus', 15)} Add bill</button>` })}</div>`}`);
  AX.act(ctx.el, {
    add: () => addBill(ctx),
    csv: () => AX.u.csvDownload('aspiron-bills.csv', [['Month', 'Service', 'Amount', 'Currency', 'Kind', 'Note', 'Due', 'Paid', 'Source', 'Added by'],
      ...L.map(c => [c.month, c.service, c.amount, c.currency, c.kind, c.note, c.due_ms ? fmt.date(c.due_ms) : '', c.paid ? 'yes' : 'no', 'manual', c.by])]),
    async paid(el) { const x = await ops('cost_paid', { id: +el.dataset.id, paid: !!el.dataset.p }); if (!x.ok) return UI.err(x); AX.cache.drop('ops_costs'); AX.emit('data:changed'); ctx.reload(); },
    async del(el) { if (!(await UI.confirm({ title: 'Delete this bill?', yes: 'Delete', tone: 'danger' }))) return; const x = await ops('cost_delete', { id: +el.dataset.id }); if (!x.ok) return UI.err(x); UI.toast('Deleted'); AX.cache.drop('ops_costs'); AX.emit('data:changed'); ctx.reload(); }
  });
}

function addBill(ctx) {
  UI.modal({ title: 'Add a bill', sub: 'Saved as a manual entry, with your name.', size: 'narrow',
    body: h`<form class="col gap16" id="ob">${AX.f.select({ name: 'service', label: 'Service', options: SERVICES.map(s => s.id).concat('Other'), value: 'Supabase' })}
      ${AX.f.input({ name: 'other', label: 'Other service name', placeholder: 'e.g. Razorpay', max: 40 })}
      <div class="grid g2">${AX.f.input({ name: 'month', label: 'Month (YYYY-MM)', value: month(), max: 7 })}${AX.f.select({ name: 'currency', label: 'Currency', options: ['INR', 'USD'], value: 'INR' })}</div>
      ${AX.f.input({ name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01', inputmode: 'decimal' })}
      ${AX.f.seg({ name: 'kind', options: [{ value: 'bill', label: 'Real bill' }, { value: 'estimate', label: 'Estimate' }], value: 'bill' })}
      ${AX.ui.dtField({ name: 'due_ms', label: 'Due date (optional)', value: null })}
      ${AX.f.input({ name: 'note', label: 'Note', placeholder: 'Invoice number, plan …', max: 200 })}
      ${AX.f.check({ name: 'paid', label: 'Already paid' })}</form>`,
    foot: h`<button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="save">Save</button>`,
    onOpen(el, close) {
      const f = el.querySelector('#ob'); UI.wire(f); AX.f.wireSeg(f);
      AX.act(el, { async save(b) {
        AX.f.clearErrors(f); const v = AX.f.read(f), svc = v.service === 'Other' ? v.other.trim() : v.service;
        if (!svc) return AX.f.error(f, 'other', 'Type the service name');
        if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(v.month)) return AX.f.error(f, 'month', 'Use YYYY-MM, e.g. ' + month());
        if (!(Number(v.amount) >= 0) || v.amount === '') return AX.f.error(f, 'amount', 'Enter the amount');
        await UI.busy(b, async () => {
          const x = await ops('cost_add', { service: svc, month: v.month, amount: v.amount, currency: v.currency, kind: v.kind, note: v.note, due_ms: v.due_ms || '', paid: v.paid });
          if (!x.ok) return UI.err(x);
          close(); UI.toast('Bill saved'); AX.cache.drop('ops_costs'); AX.emit('data:changed'); ctx.reload();
        });
      } });
    } });
}
})();
