/* =====================================================================
   Live monitor: pick a live / recent test and watch who is writing, who submitted, who has not started
   and whose time is over. Refreshes every 15 s while the page is visible and open; countdowns tick every
   second on the server clock (skew = server now − local now). Links: #/live/<testId>.
   Server: cbt_admin3 live_tests / live (base v8 setup), cbt_admin student_devices_reset.
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const LV = { id: null, tests: [], data: null, seg: 'writing', skew: 0, q: '', at: 0, busy: false, seq: 0, timers: [] };
const now = () => Date.now() + LV.skew;
const mmss = s => { s = Math.max(0, Math.round(s)); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (hh ? hh + ':' : '') + String(m).padStart(hh ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
const pct = x => x.max ? Math.round(x.score * 100 / x.max) : 0;
const tone = p => p >= 60 ? 'ok' : p >= 35 ? 'warn' : 'bad';
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const stuLink = () => /^https:\/\//.test(AX.cfg.SHORT_URL || '') ? AX.cfg.SHORT_URL : siteUrl();
const cq = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const isOpen = t => Number(t.open_now) > 0;
const SEGS = [
  { k: 'writing', t: 'Writing now', short: 'Writing', icon: 'pulse', tone: 'pri' },
  { k: 'done', t: 'Submitted', short: 'Submitted', icon: 'checkCircle', tone: 'ok' },
  { k: 'waiting', t: 'Not started', short: 'Not started', icon: 'clock', tone: 'mut' },
  { k: 'expired', t: 'Time over, not submitted', short: 'Time over', icon: 'alert', tone: 'warn' }
];
const EMPTY = { writing: 'Nobody is writing this test right now.', done: 'No submissions yet.', waiting: 'Everyone has started 🎉', expired: 'None.' };
const stop = () => { LV.timers.forEach(t => clearInterval(t)); LV.timers = []; };
const list = k => (LV.data && LV.data[k]) || [];

AX.openLive = id => AX.go('live' + (id ? '/' + encodeURIComponent(id) : ''));

AX.mod({
  id: 'live', title: 'Live monitor', short: 'Live', icon: 'live', group: 'Academics', order: 30, perm: 'results',
  sub: 'See who is writing, who submitted and who has not started — updates every 15 seconds.',
  async render(ctx) {
    stop();
    if (ctx.parts[0] && ctx.parts[0] !== LV.id) { LV.id = ctx.parts[0]; LV.seg = 'writing'; LV.q = ''; }
    ctx.head({ title: 'Live monitor', sub: 'See who is writing, who submitted and who has not started — updates every 15 seconds.',
      actions: h`<button class="btn sm" data-act="refresh">${icon('refresh', 15)} Refresh</button>` });
    AX.set(ctx.el, h`${UI.skeleton(1)}<div class="mt16">${UI.skeleton(4, 'kpi')}</div><div class="mt16">${UI.skeleton(5)}</div>`);
    const r = await AX.api.call('cbt_admin3', 'live_tests');
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing' ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v8_update.sql in Supabase → SQL Editor once, then refresh this page.' })}</div>` : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    LV.tests = r.tests || [];
    if (!LV.tests.length) { LV.data = null; return AX.set(ctx.el, h`<div class="card">${UI.empty({ icon: 'live', title: 'No tests yet.', text: 'Live and recent tests show here so you can watch them as students write.' })}</div>`); }
    if (!LV.id || !LV.tests.some(t => t.id === LV.id)) { LV.id = (LV.tests.find(isOpen) || LV.tests[0]).id; LV.seg = 'writing'; LV.q = ''; }
    AX.set(ctx.el, h`<div class="lv-pick"><label class="lbl" for="lv-sel">Test</label><div class="lv-selw">${icon('live', 17)}<select class="inp" id="lv-sel" data-act="pick">${join(LV.tests, t => h`<option value="${t.id}" ${t.id === LV.id ? raw('selected') : ''}>${isOpen(t) ? '● ' : ''}${t.title}${t.series ? ' — ' + t.series : ''}</option>`)}</select></div>
        <span class="xs mut lv-legend"><span class="live-dot"></span> ● = open now</span></div>
      <div id="lv-sum" class="mt16"></div>
      <div class="lv-tools mt16"><div id="lv-seg" class="lv-segw"></div><div class="inp-wrap search lv-q">${icon('search', 16)}<input class="inp sm" type="search" data-act="q" placeholder="Search name or mobile" value="${LV.q}" aria-label="Search name or mobile" autocomplete="off"></div><span id="lv-csv"></span></div>
      <div id="lv-list" class="mt12"></div>`);
    const fetchLive = async (quiet) => {
      if (!ctx.alive() || (quiet && LV.busy)) return;
      const id = LV.id, seq = ++LV.seq, btn = document.querySelector('#ax-ph [data-act=refresh]');
      LV.busy = true;
      if (btn && !quiet) btn.classList.add('busy');
      const x = await AX.api.call('cbt_admin3', 'live', { id });
      if (seq !== LV.seq) return;   // a newer request is on its way
      LV.busy = false;
      if (btn) btn.classList.remove('busy');
      if (!ctx.alive() || id !== LV.id) return;
      if (!x.ok) {
        if (!quiet) UI.toast(x.error === 'missing' ? AX.errText(x, 'supabase_v8_update.sql') : 'Could not load', { tone: 'bad' });
        if (!LV.data) { AX.set('#lv-sum', UI.errorBox(x, 'supabase_v8_update.sql')); AX.set('#lv-list', ''); }
        return;
      }
      LV.data = x; LV.at = Date.now(); LV.skew = (Number(x.now) || Date.now()) - Date.now();
      draw();
    };
    const draw = () => {
      if (!ctx.alive() || !LV.data) return;
      const d = LV.data, t = d.test || {}, n = {};
      SEGS.forEach(s => { n[s.k] = list(s.k).length; });
      const el = Math.max(Number(d.eligible) || 0, n.writing + n.done + n.waiting + n.expired);
      const w = k => el ? n[k] * 100 / el : 0;
      const opens = Number(t.opens_at) || null;
      const sched = !opens ? h`<span>Open any time</span>` : opens > now() ? h`<span>Opens ${fmt.dt(opens)} · <b class="lv-cd" data-open="${opens}">in ${mmss((opens - now()) / 1000)}</b></span>` : h`<span>Opened ${fmt.dt(opens)}</span>`;
      AX.set('#lv-sum', h`<div class="lv-board glass">
          <div class="lv-bh"><div class="grow"><h3 class="ell">${t.title || 'Test'}</h3><div class="row wrap gap6 mt4 xs mut"><span class="pill">${t.questions || 0} Q · ${t.duration || 0} min · max ${t.max || 0}</span>${t.active === false ? UI.pill('Hidden', 'bad') : UI.pill('Visible', 'ok')}${sched}</div></div>
            ${n.writing ? h`<span class="pill ok lv-now"><span class="live-dot"></span> ${n.writing} writing</span>` : ''}</div>
          <div class="lv-stats">${join(SEGS, s => h`<button type="button" class="lv-stat ${s.tone} ${LV.seg === s.k ? 'on' : ''}" data-act="seg" data-k="${s.k}"><span class="k-l">${icon(s.icon, 15)}<span>${s.t}</span></span><span class="k-v">${fmt.num(n[s.k])}</span><span class="k-f">${el ? Math.round(n[s.k] * 100 / el) + '% of ' + fmt.num(el) : '—'}</span></button>`)}</div>
          <div class="lv-bar" role="img" aria-label="${n.done} submitted, ${n.writing} writing, ${n.expired} time over, ${n.waiting} not started"><i class="done" style="width:${w('done')}%"></i><i class="writing" style="width:${w('writing')}%"></i><i class="expired" style="width:${w('expired')}%"></i></div>
          <div class="row wrap lv-cap"><div class="legend"><span><i style="background:var(--ok)"></i>Submitted</span><span><i style="background:var(--pri)"></i>Writing</span><span><i style="background:var(--warn)"></i>Time over</span><span><i style="background:var(--hover);border:1px solid var(--line-2)"></i>Not started</span></div><span class="grow"></span>
            <span class="xs mut">${fmt.plural(el, 'student')} can take this test · updated ${new Date(now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span></div></div>`);
      AX.set('#lv-seg', h`<div class="seg" role="tablist">${join(SEGS, s => h`<button type="button" class="${LV.seg === s.k ? 'on' : ''}" data-act="seg" data-k="${s.k}">${s.short} <b class="lv-sc">${n[s.k]}</b></button>`)}</div>`);
      AX.set('#lv-csv', LV.seg === 'done' && n.done ? h`<button class="btn sm" data-act="csv">${icon('download', 15)} Download CSV</button>` : '');
      rows();
    };
    const rows = () => {
      const d = LV.data, t = d.test || {}, site = stuLink(), q = LV.q.trim().toLowerCase(), k = LV.seg;
      const all = list(k), L = all.map((x, i) => [x, i]).filter(([x]) => !q || String(x.name || '').toLowerCase().includes(q) || String(x.mobile || '').includes(q));
      if (!all.length) return AX.set('#lv-list', h`<div class="card">${UI.empty({ icon: k === 'waiting' ? 'checkCircle' : k === 'done' ? 'inbox' : k === 'expired' ? 'checkCircle' : 'pulse', title: EMPTY[k] })}</div>`);
      if (!L.length) return AX.set('#lv-list', h`<div class="card">${UI.empty({ icon: 'search', title: 'No student matches', text: 'Try another name or mobile number.' })}</div>`);
      const V = L.slice(0, 300), canReset = AX.can('students', 'manage'), tn = now();
      const who = x => h`${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><div class="t ell">${x.name}</div>`;
      const wa = (m, text) => h`<a class="btn sm soft lv-wa" href="${AX.u.wa(m, text)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${icon('whatsapp', 15)}<span>WhatsApp</span></a>`;
      const row = ([x, i]) => {
        if (k === 'writing') {
          const left = (x.ends - tn) / 1000, span = Math.max(1, x.ends - x.started), f = Math.max(0, Math.min(100, (x.ends - tn) * 100 / span));
          return h`<div class="li lv-w ${left < 300 ? 'low' : ''}" data-row>${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · started ${fmt.time(x.started)}</div>
            <div class="lv-tb"><i data-tb="${x.started}|${x.ends}" style="width:${f}%"></i></div></div><div class="lv-left"><b class="num" data-te="${x.ends}">${mmss(left)}</b><span class="xs mut">left</span></div></div>`;
        }
        if (k === 'done') {
          const p = pct(x);
          return h`<div class="li"><span class="lv-rk">${i + 1}</span>${who(x)}<div class="s"><span class="num">✓${x.correct} ✗${x.wrong} –${x.skipped}</span> · ${Math.round((x.used || 0) / 60)} min · ${fmt.time(x.at)}</div></div>
            ${x.late ? UI.pill('late', 'warn') : ''}<div class="lv-sc2"><b class="num">${x.score}<span class="mut">/${x.max}</span></b><span class="lv-p ${tone(p)}">${p}%</span></div></div>`;
        }
        if (k === 'waiting') {
          const full = (x.devices || 0) >= (x.max_devices || 0) && x.max_devices != null;
          return h`<div class="li lv-ww">${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · seen ${fmt.ago(x.seen)} · <span class="${full ? 't-bad' : ''}">devices ${x.devices || 0}/${x.max_devices}</span></div></div>
            <div class="lv-acts">${full && canReset ? h`<button class="btn sm" data-act="reset" data-id="${x.id}" data-busy="Resetting" title="All device slots are used — reset so the student can sign in">${icon('smartphone', 15)}<span>Reset devices</span></button>` : ''}${wa(x.mobile, `Hi ${x.name}, "${t.title}" is live now. Open ${site} and start your test. All the best!`)}</div></div>`;
        }
        return h`<div class="li lv-ww">${who(x)}<div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · ended ${fmt.ago(x.ends)} · answers may still arrive when their phone is back online</div></div>
          <div class="lv-acts">${wa(x.mobile, `Hi ${x.name}, your time for "${t.title}" is over. Please open ${site} once with internet so your answers are submitted.`)}</div></div>`;
      };
      AX.set('#lv-list', h`<div class="card pad0 list lv-list">${join(V, row)}</div>${L.length > V.length ? h`<div class="xs mut mt8">Showing ${V.length} of ${L.length}. Search to find someone.</div>` : ''}`);
    };
    const tick = () => {
      if (!ctx.alive()) return stop();
      const tn = now();
      document.querySelectorAll('#lv-list [data-te]').forEach(e => { const s = (Number(e.dataset.te) - tn) / 1000; e.textContent = mmss(s); const r = e.closest('[data-row]'); if (r) r.classList.toggle('low', s < 300); });
      document.querySelectorAll('#lv-list [data-tb]').forEach(e => { const [a, b] = e.dataset.tb.split('|').map(Number); e.style.width = Math.max(0, Math.min(100, (b - tn) * 100 / Math.max(1, b - a))) + '%'; });
      document.querySelectorAll('#lv-sum [data-open]').forEach(e => { const s = (Number(e.dataset.open) - tn) / 1000; e.textContent = s > 0 ? 'in ' + mmss(s) : 'now'; });
    };
    const csv = () => {
      const d = LV.data, rowsC = [['Rank', 'Name', 'Mobile', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Minutes', 'Late', 'Submitted at'],
        ...list('done').map((x, i) => [i + 1, x.name, x.mobile, x.score, x.max, x.correct, x.wrong, x.skipped, Math.round(x.used / 60), x.late ? 'yes' : '', new Date(x.at).toLocaleString('en-IN')])];
      AX.u.download(String((d.test && d.test.title) || 'test').replace(/[^\w ]+/g, '') + '-live-results.csv', '﻿' + rowsC.map(r => r.map(cq).join(',')).join('\n'), 'text/csv;charset=utf-8');
      UI.toast('Downloaded');
    };
    AX.act(ctx.el, {
      retry: () => fetchLive(false),
      seg(b) { LV.seg = b.dataset.k; draw(); },
      csv,
      async reset(b) {
        await UI.busy(b, async () => {
          const x = await AX.api.admin('student_devices_reset', { id: b.dataset.id });
          if (!x.ok) return UI.err(x);
          AX.cache.drop('students'); AX.emit('data:changed');
          UI.toast('Devices reset — student can sign in now');
        });
        fetchLive(true);
      }
    });
    AX.act(ctx.el, { pick(s) { LV.id = s.value; LV.seg = 'writing'; LV.q = ''; LV.data = null; const qi = ctx.el.querySelector('[data-act=q]'); if (qi) qi.value = '';
      try { history.replaceState(null, '', '#/live/' + encodeURIComponent(LV.id)); } catch (e) {}
      AX.set('#lv-sum', UI.skeleton(4, 'kpi')); AX.set('#lv-seg', ''); AX.set('#lv-csv', ''); AX.set('#lv-list', UI.skeleton(4)); fetchLive(false); } }, 'change');
    AX.act(ctx.el, { q: AX.u.debounce(el => { LV.q = el.value; if (LV.data) rows(); }, 150) }, 'input');
    const ph = document.getElementById('ax-ph');
    if (ph) AX.act(ph, { refresh: () => fetchLive(false) });
    if (LV.data && LV.data.test && LV.tests.some(t => t.id === LV.id) && Date.now() - LV.at < 60000) draw();   // show the last numbers at once while fresh ones load
    await fetchLive(false);
    if (!ctx.alive()) return;
    LV.timers.push(setInterval(() => { if (!ctx.alive()) return stop(); if (!document.hidden) fetchLive(true); }, 15000));
    LV.timers.push(setInterval(tick, 1000));
    const vis = () => { if (!ctx.alive()) return document.removeEventListener('visibilitychange', vis); if (!document.hidden && Date.now() - LV.at > 15000) fetchLive(true); };
    document.addEventListener('visibilitychange', vis);
  }
});

AX.css('live', `
.lv-pick{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.lv-pick .lbl{flex:none}
.lv-selw{position:relative;flex:1;min-width:0;max-width:560px;display:flex;align-items:center}
.lv-selw>.ax-ic{position:absolute;left:13px;color:var(--pri);pointer-events:none}
.lv-selw .inp{padding-left:40px;font-weight:650}
.lv-legend{display:inline-flex;align-items:center;gap:8px}
.lv-board{border-radius:var(--r-xl);padding:18px 18px 14px}
.lv-bh{display:flex;align-items:flex-start;gap:12px;min-width:0}
.lv-bh h3{font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:-.015em}
.lv-cd{color:var(--pri);font-variant-numeric:tabular-nums}
.lv-now{flex:none}
.lv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
.lv-stat{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 14px;border-radius:var(--r-lg);border:1px solid var(--line);background:color-mix(in srgb,var(--solid) 55%,transparent);text-align:left;color:var(--tx);min-width:0;transition:border-color var(--fast),background var(--fast),transform var(--fast)}
.lv-stat:hover{border-color:var(--line-2);transform:translateY(-1px)}
.lv-stat .k-l{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--mut);min-width:0;max-width:100%}
.lv-stat .k-l span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lv-stat .k-v{font-family:var(--font-display);font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-top:4px;font-variant-numeric:lining-nums tabular-nums}
.lv-stat .k-f{font-size:11.5px;color:var(--faint);font-weight:650}
.lv-stat.pri .k-l .ax-ic{color:var(--pri)}.lv-stat.ok .k-l .ax-ic{color:var(--ok)}.lv-stat.warn .k-l .ax-ic{color:var(--warn)}.lv-stat.mut .k-l .ax-ic{color:var(--mut)}
.lv-stat.on{border-color:var(--pri-line);background:var(--pri-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--pri) 12%,transparent)}
.lv-stat.on.ok{border-color:color-mix(in srgb,var(--ok) 40%,transparent);background:var(--ok-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 12%,transparent)}
.lv-stat.on.warn{border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:var(--warn-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--warn) 12%,transparent)}
.lv-stat.on.mut{border-color:var(--line-2);background:var(--hover);box-shadow:0 0 0 3px var(--hover)}
.lv-bar{display:flex;height:10px;border-radius:6px;background:var(--hover);overflow:hidden;margin-top:16px;border:1px solid var(--line)}
.lv-bar i{display:block;height:100%;transition:width .6s var(--ease)}
.lv-bar .done{background:var(--ok)}.lv-bar .writing{background:var(--grad-pri)}.lv-bar .expired{background:var(--warn)}
.lv-cap{margin-top:10px;gap:8px 14px}
.lv-cap .legend{font-size:12px;gap:12px}
.lv-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lv-segw{min-width:0;max-width:100%}
.lv-q{width:min(260px,100%);margin-left:auto}
.lv-sc{display:inline-grid;place-items:center;min-width:20px;height:18px;padding:0 5px;margin-left:4px;border-radius:9px;background:var(--hover);font-size:11px;font-weight:800}
.seg button.on .lv-sc{background:var(--pri-soft);color:var(--pri)}
.lv-list .li{gap:12px}
.lv-list .grow .s{white-space:normal}
.lv-tb{height:5px;border-radius:3px;background:var(--hover);overflow:hidden;margin-top:7px;max-width:320px}
.lv-tb i{display:block;height:100%;border-radius:3px;background:var(--grad-pri);transition:width 1s linear}
.lv-w.low .lv-tb i{background:var(--bad)}
.lv-left{display:flex;flex-direction:column;align-items:flex-end;flex:none;min-width:64px}
.lv-left b{font-size:17px;font-weight:800;letter-spacing:.01em}
.lv-w.low .lv-left b{color:var(--bad)}
.lv-rk{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;font-weight:800;font-size:12.5px;background:var(--hover);color:var(--tx-2);font-variant-numeric:tabular-nums}
.lv-sc2{display:flex;flex-direction:column;align-items:flex-end;flex:none;gap:2px}
.lv-p{font-size:12px;font-weight:800}.lv-p.ok{color:var(--ok)}.lv-p.warn{color:var(--warn)}.lv-p.bad{color:var(--bad)}
.lv-acts{display:flex;gap:8px;flex:none;align-items:center}
.t-bad{color:var(--bad)}
@media (max-width:900px){.lv-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:759px){
  .lv-board{padding:16px 14px 12px}
  .lv-bh h3{font-size:19px}
  .lv-stat{padding:10px 12px}.lv-stat .k-v{font-size:26px}
  .lv-q{width:100%;margin-left:0}
  .lv-legend{display:none}
  .lv-selw{max-width:none}
  .lv-ww{flex-wrap:wrap}
  .lv-ww .lv-acts{width:100%;justify-content:flex-end;padding-left:42px}
  .lv-wa span,.lv-acts .btn span{display:inline}
}
`);
})();
