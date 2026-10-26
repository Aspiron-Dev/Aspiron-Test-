/* =====================================================================
   Command centre — the first 30 seconds: is everything healthy, are students learning,
   is the business doing well, what needs action now. Each block shows only what the user may see.
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const DAY = 864e5;
const greet = () => { const H = new Date().getHours(); return H < 5 ? 'Working late' : H < 12 ? 'Good morning' : H < 17 ? 'Good afternoon' : 'Good evening'; };
const oSeg = o => o.status === 'paid' ? 'done' : o.status === 'rejected' ? 'rej' : (o.payer || o.utr) ? 'verify' : 'unpaid';
const ms = t => AX.fmt.ms(t) || 0;

AX.mod({
  id: 'home', title: 'Command centre', short: 'Home', icon: 'home', group: '', order: 1, perm: 'any',
  async render(ctx) {
    const me = AX.session.me || {};
    const first = String(me.name || 'Owner').split(' ')[0];
    ctx.head({ title: greet() + ', ' + (me.owner ? 'Owner' : first),
      sub: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · here is what needs you today.',
      actions: h`${AX.can('content', 'manage') ? h`<button class="btn" data-act="newTest">${icon('plus', 16)} New test</button>` : ''}${AX.can('store') ? h`<a class="btn pri" href="#/orders">${icon('checkCircle', 16)} Verify payments</a>` : ''}` });
    const ph = document.getElementById('ax-ph');
    AX.act(ph, { newTest() { if (AX.openTest) AX.openTest(null); else AX.go('tests'); } });
    AX.set(ctx.el, h`<div id="hm-live"></div>${UI.skeleton(5, 'kpi')}<div class="grid g2 mt16">${UI.skeleton(5)}${UI.skeleton(5)}</div>`);

    const canStore = AX.can('store'), canRes = AX.can('results');
    const canPay = AX.can('payments') && AX.money;
    const [ov, act, cat, sto, pay] = await Promise.all([
      AX.cache.get('ov', () => AX.api.call('cbt_admin2', 'overview'), 30000),
      AX.cache.get('activity', () => AX.api.call('cbt_admin3', 'activity'), 20000),
      AX.data.catalog(),
      canStore ? AX.data.store() : Promise.resolve(null),
      canPay ? AX.data.payments() : Promise.resolve(null)
    ]);
    if (!ctx.alive()) return;
    const o = ov && ov.ok ? ov : null, a = act && act.ok ? act : null;
    const orders = sto && sto.ok ? (sto.orders || []) : [];
    const now = Date.now();
    const paid = orders.filter(x => x.status === 'paid');
    // all money received (approved orders + payments added by hand) by the day it was paid — same as the Payments page
    const money = pay && pay.ok ? AX.money.build(pay, []).rows().map(x => ({ at: x.at, amount: x.amount })) : paid.map(x => ({ at: ms(x.paid_at || x.created_at), amount: Number(x.amount) || 0 }));
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const today = money.filter(x => x.at >= +t0).reduce((s, x) => s + (x.amount || 0), 0);
    const rev30 = money.filter(x => x.at > now - 30 * DAY).reduce((s, x) => s + (x.amount || 0), 0);
    const revPrev = money.filter(x => x.at <= now - 30 * DAY && x.at > now - 60 * DAY).reduce((s, x) => s + (x.amount || 0), 0);
    const verify = orders.filter(x => oSeg(x) === 'verify');
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(now - i * DAY); d.setHours(0, 0, 0, 0); days.push({ t: d.getTime(), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: 0 }); }
    money.forEach(x => { if (!x.at) return; const t = new Date(x.at); t.setHours(0, 0, 0, 0); const d = days.find(y => y.t === t.getTime()); if (d) d.value += x.amount || 0; });
    // tests: live now / upcoming / waiting for results
    const tests = (cat && cat.ok ? cat.tests : []) || [];
    const liveNow = tests.filter(t => t.active && t.opens_at && ms(t.opens_at) <= now && (!t.closes_at || ms(t.closes_at) > now));
    const soon = tests.filter(t => t.active && t.opens_at && ms(t.opens_at) > now && ms(t.opens_at) < now + 7 * DAY).sort((x, y) => ms(x.opens_at) - ms(y.opens_at));
    const resWait = tests.filter(t => t.result_at && ms(t.result_at) > now && (!t.opens_at || ms(t.opens_at) <= now));
    const att = AX.getAttention ? AX.getAttention() : [];

    const kpis = [];
    if (canStore || canPay) kpis.push(UI.kpi({ label: 'Money received · 30 days', value: fmt.inr(rev30), icon: 'rupee', hero: true, tone: 'gold', go: canPay ? '#/payments' : '#/store', delta: revPrev ? Math.round((rev30 - revPrev) * 100 / revPrev) : null, foot: 'Today ' + fmt.inr(today) + (revPrev ? ' · vs previous 30 days' : '') }));
    if (o) {
      kpis.push(UI.kpi({ label: 'Active students · 7 days', value: fmt.num(o.active7), icon: 'users', go: '#/students', foot: 'of ' + fmt.num(o.students) + ' students' }));
      kpis.push(UI.kpi({ label: 'Attempts today', value: fmt.num(o.today), icon: 'activity', tone: 'info', go: canRes ? '#/results' : null, foot: fmt.num(o.week) + ' this week' }));
      kpis.push(UI.kpi({ label: 'Average score', value: o.avg_pct == null ? '—' : Math.round(o.avg_pct) + '%', icon: 'target', tone: 'vio', foot: 'all attempts' }));
    }
    if (canStore) kpis.push(UI.kpi({ label: 'Payments to verify', value: fmt.num(verify.length), icon: 'checkCircle', tone: verify.length ? 'bad' : '', go: '#/orders', foot: verify.length ? 'oldest ' + fmt.ago(Math.min(...verify.map(x => ms(x.paid_at || x.created_at)))) : 'all clear' }));

    const actIcon = { result: 'trophy', start: 'play', request: 'userPlus', join: 'user', report: 'flag' };
    const actText = it => it.k === 'result' ? h`<b>${it.name}</b> finished <b>${it.title}</b> · ${it.score}/${it.max}${it.late ? ' (late)' : ''}`
      : it.k === 'start' ? h`<b>${it.name}</b> started <b>${it.title}</b>` : it.k === 'request' ? h`<b>${it.name}</b> asked for access`
      : it.k === 'join' ? h`<b>${it.name}</b> joined` : it.k === 'report' ? h`<b>${it.name}</b> reported Q${it.q} in <b>${it.title}</b>` : h`<b>${it.name || ''}</b> ${it.k}`;
    const testRow = (t, kind) => h`<a class="li click" href="#/tests" style="color:var(--tx);text-decoration:none" data-act="test" data-id="${t.id}">
      <span class="av sm" style="--c:${kind === 'live' ? '#10b981' : kind === 'res' ? '#c9a45c' : '#6366f1'}">${icon(kind === 'live' ? 'live' : kind === 'res' ? 'clock' : 'calendar', 15)}</span>
      <div class="grow"><div class="t ell">${t.title}</div><div class="s">${kind === 'live' ? 'Live now' + (t.closes_at ? ' · ends ' + fmt.time(t.closes_at) : '') : kind === 'res' ? 'Result & answer key ' + fmt.dt(t.result_at) : fmt.dt(t.opens_at)}</div></div>
      ${kind === 'live' ? h`<span class="pill ok"><span class="live-dot"></span> Live</span>` : kind === 'res' ? UI.pill('Result pending', 'gold') : UI.pill(fmt.ago(t.opens_at), 'info')}</a>`;

    AX.set(ctx.el, h`
      ${a ? h`<div class="card glass row wrap" style="margin-bottom:16px;gap:18px"><span class="row gap6"><span class="live-dot"></span><b>${fmt.num(a.writing || 0)}</b><span class="mut sm">writing a test now</span></span><span class="row gap6"><b>${fmt.num(a.online || 0)}</b><span class="mut sm">online in the last 10 min</span></span>${liveNow.length ? h`<span class="row gap6"><b>${liveNow.length}</b><span class="mut sm">${liveNow.length === 1 ? 'test' : 'tests'} live</span></span>` : ''}<span class="grow"></span>${canRes ? h`<a class="btn sm" href="#/live">${icon('live', 15)} Live monitor</a>` : ''}</div>` : ''}
      ${kpis.length ? h`<div class="kpis">${kpis}</div>` : ''}
      <div class="grid g2 mt16" style="align-items:start">
        <div class="col gap16">
          <div class="card pad0"><div class="card-h" style="padding:16px 16px 4px">${icon('bell')}<h3>Needs attention</h3><span class="grow"></span><button class="btn xs ghost" data-act="ref">${icon('refresh', 13)}</button></div>
            <div class="list" id="hm-att">${attHtml(att)}</div></div>
          ${canStore || canPay ? h`<div class="card"><div class="card-h">${icon('chart')}<h3>Money received · last 14 days</h3><span class="grow"></span><b class="num">${fmt.inr(days.reduce((s, d) => s + d.value, 0))}</b></div>${UI.chart.area(days, { money: true, label: 'Revenue per day' })}</div>` : ''}
          ${o && (o.top || []).length ? h`<div class="card pad0"><div class="card-h" style="padding:16px 16px 4px">${icon('trophy')}<h3>Most attempted tests</h3></div><div class="list">${join(o.top.slice(0, 5), (t, i) => h`<div class="li ${canRes ? 'click' : ''}" data-act="ana" data-id="${t.id}"><span class="av sm" style="--c:${['#c9a45c', '#94a3b8', '#b45309', '#14b8a6', '#6366f1'][i]}">${i + 1}</span><div class="grow"><div class="t ell">${t.title}</div><div class="s">${fmt.num(t.students)} students · ${fmt.num(t.attempts)} attempts</div></div><div style="width:90px"><div class="bar-meter"><i style="width:${Math.round(t.avg_pct || 0)}%"></i></div><div class="xs mut mt4" style="text-align:right">${t.avg_pct == null ? '—' : Math.round(t.avg_pct) + '% avg'}</div></div></div>`)}</div></div>` : ''}
        </div>
        <div class="col gap16">
          <div class="card pad0"><div class="card-h" style="padding:16px 16px 4px">${icon('calendar')}<h3>Tests: live & coming up</h3><span class="grow"></span>${AX.can('content') ? h`<a class="btn xs ghost" href="#/tests">Studio ${icon('chevR', 13)}</a>` : ''}</div>
            <div class="list">${liveNow.length + soon.length + resWait.length ? h`${join(liveNow, t => testRow(t, 'live'))}${join(resWait.slice(0, 4), t => testRow(t, 'res'))}${join(soon.slice(0, 6), t => testRow(t, 'soon'))}` : UI.empty({ icon: 'calendar', title: 'Nothing scheduled this week', text: 'Scheduled and live tests show up here.' })}</div></div>
          ${o ? h`<div class="card"><div class="card-h">${icon('bars')}<h3>Test attempts · last 7 days</h3><span class="grow"></span><b class="num">${fmt.num((o.days || []).reduce((s, d) => s + (d.n || 0), 0))}</b></div>${UI.chart.bars((o.days || []).map(d => ({ label: d.d, value: d.n })), { label: 'Attempts per day' })}</div>` : ''}
          ${a ? h`<div class="card pad0"><div class="card-h" style="padding:16px 16px 4px">${icon('activity')}<h3>Recent student activity</h3></div><div class="list">${(a.items || []).length ? join(a.items.slice(0, 8), it => h`<div class="li"><span class="av sm" style="--c:${AX.u.hue(it.k)}">${icon(actIcon[it.k] || 'activity', 15)}</span><div class="grow sm">${actText(it)}</div><span class="xs mut" style="white-space:nowrap">${fmt.ago(it.at)}</span></div>`) : UI.empty({ icon: 'activity', title: 'Quiet for now' })}</div></div>` : ''}
        </div>
      </div>
      ${!o && !a && !kpis.length ? h`<div class="card mt16">${UI.empty({ icon: 'lock', tone: 'lock', title: 'Welcome', text: 'Your access is limited. Use the menu to open the parts you can work on.' })}</div>` : ''}`);
    AX.act(ctx.el, {
      async ref(b) { await UI.busy(b, () => AX.refreshAttention()); },
      ana(el) { if (canRes && AX.openAnalytics) AX.openAnalytics(el.dataset.id); else if (canRes) AX.go('results'); },
      test(el, e) { if (AX.openTest && AX.can('content', 'manage')) { e.preventDefault(); AX.openTest(el.dataset.id); } }
    });
    const off = AX.on('attention', list => { if (!ctx.alive()) return off(); const box = document.getElementById('hm-att'); if (box) AX.set(box, attHtml(list)); });
  }
});
function attHtml(att) {
  return att && att.length ? join(att, x => h`<a class="li click" href="${x.go}" style="color:var(--tx);text-decoration:none"><span class="av sm" style="--c:${x.tone === 'bad' ? '#ef4444' : x.tone === 'gold' ? '#c9a45c' : '#14b8a6'}">${icon(x.icon || 'bell', 15)}</span><div class="grow"><div class="t">${x.title}</div>${x.sub ? h`<div class="s">${x.sub}</div>` : ''}</div><span class="pill ${x.tone || 'pri'}">${x.count}</span>${icon('chevR', 16)}</a>`)
    : UI.empty({ icon: 'checkCircle', title: 'All clear', text: 'Payments to verify, access requests and reports will appear here.' });
}
})();
