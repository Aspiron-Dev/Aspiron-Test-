/* =====================================================================
   Results & analytics: every result (search, test / date filters, sort, 🚩 cheating, delete, CSV),
   per-test performance, Insights (activity, score bands, toppers, who needs a push, student look-up)
   and one test's analytics (AX.openAnalytics(testId) → wide drawer; full page at #/results/test/<id>).
   Server: cbt_admin results / result_delete / students (v30), cbt_admin2 analytics. Cheating via AX.integrity.
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const DAY = 864e5;
const canDel = () => AX.can('results', 'manage');
const seeFlags = () => !!AX.integrity && AX.can('integrity');
const canFlag = () => !!AX.integrity && AX.can('integrity', 'manage');
const canQ = () => AX.can('content', 'manage');
// percent of one result: max ? round(score*100/max) : 0 (Insights do not clamp; the Results table clamps at 0)
const pctOf = x => x.max ? Math.round(x.score * 100 / x.max) : 0;
const pctRow = x => Math.max(0, pctOf(x));
const tone = p => p >= 60 ? 'ok' : p >= 35 ? 'warn' : 'bad';
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const mins = s => Math.round((Number(s) || 0) / 60);
const fsec = t => { t = Math.round(t || 0); return t < 60 ? t + 's' : Math.floor(t / 60) + 'm ' + String(t % 60).padStart(2, '0') + 's'; };
const dayK = t => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const avgOf = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null;
const siteUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*\.html$/, '');
const stuLink = () => /^https:\/\//.test(AX.cfg.SHORT_URL || '') ? AX.cfg.SHORT_URL : siteUrl();
// CSV exactly like the old panel: every cell quoted, formula guard except plain numbers, BOM, "\n" line ends
const cq = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const dl = (name, rows) => AX.u.download(name, '﻿' + rows.map(r => typeof r === 'string' ? r : r.map(cq).join(',')).join('\n'), 'text/csv;charset=utf-8');
const waBtn = (m, text, label) => h`<a class="btn sm soft rs-wa" data-act="wa" href="${AX.u.wa(m, text)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${icon('whatsapp', 15)}${label ? h`<span>${label}</span>` : ''}</a>`;
const pctTag = p => h`<span class="rs-pct ${tone(p)}">${p}%</span>`;

/* ---------- shared data ---------- */
const S = {
  cat: null, show: 100,
  f: { q: '', t: '', range: 'all', from: null, to: null, sort: 'new' },
  tt: { q: '', range: 'all', sort: 'n' },
  ins: { range: 30, att: 'weak', q: '' }
};
async function base(force) {
  const [r, c] = await Promise.all([AX.data.results(force), AX.data.catalog()]);
  if (c && c.ok) S.cat = c;
  return r;
}
const catTests = () => (S.cat && S.cat.tests) || [];
const catTest = id => id ? catTests().find(t => t.id === id) || null : null;
const seriesTitle = t => { const s = t && ((S.cat && S.cat.series) || []).find(x => x.id === t.series_id); return s ? s.title : ''; };
const tkey = x => x.test_id || 't:' + (x.title || '');
// the result's test id: from the row, else the only test with this title
const tidOf = x => { if (x.test_id) return x.test_id; const l = catTests().filter(t => t.title === x.title); return l.length === 1 ? l[0].id : null; };
const isFlagged = x => { if (!seeFlags()) return false; const t = tidOf(x); return !!t && AX.integrity.isFlagged(x.mobile, t); };
const flagLoad = () => seeFlags() ? AX.integrity.load().catch(() => null) : Promise.resolve(null);

/* ---------- student profile (used when the Students module has no AX.openStudent) ---------- */
function people(rs) {
  const by = {};
  rs.forEach(x => { (by[x.mobile] = by[x.mobile] || { mobile: x.mobile, name: x.student, list: [] }).list.push(x); });
  return Object.values(by).map(o => {
    const ps = o.list.map(pctOf); o.n = ps.length; o.avg = avgOf(ps); o.best = Math.max(...ps); o.last = Math.max(...o.list.map(x => x.at));
    const srt = [...o.list].sort((a, b) => a.at - b.at); o.trend = srt.length > 1 ? pctOf(srt[srt.length - 1]) - pctOf(srt[0]) : 0; o.now = pctOf(srt[srt.length - 1]);
    return o;
  });
}
function trendSvg(ps) {
  const w = 280, hh = 70, n = ps.length; if (n < 2) return '';
  const pts = ps.map((v, i) => [i * w / (n - 1), hh - 6 - Math.max(0, Math.min(100, v)) / 100 * (hh - 12)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return raw(`<svg class="chart rs-trend" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" role="img" aria-label="Score trend"><path d="${d} L${w} ${hh} L0 ${hh}Z" fill="var(--pri-soft)"/><path d="${d}" fill="none" stroke="var(--pri)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`);
}
async function profile(mobile) {
  const m = UI.modal({ title: 'Student', size: 'wide', body: UI.skeleton(5) });
  const [st, rr] = await Promise.all([AX.data.students(), AX.data.results()]);
  if (!m.el.isConnected) return;
  const all = (rr.ok && rr.results) || [];
  const s = ((st.ok && st.students) || []).find(x => String(x.mobile) === String(mobile)) || { name: (all.find(x => String(x.mobile) === String(mobile)) || {}).student || 'Student', mobile };
  const L = all.filter(x => String(x.mobile) === String(mobile)).sort((a, b) => a.at - b.at), ps = L.map(pctOf);
  const avg = avgOf(ps), rank = avg == null ? null : people(all).filter(p => p.avg > avg).length + 1;
  const h2 = m.el.querySelector('.m-h h2'); if (h2) h2.textContent = s.name || 'Student';
  const status = s.status === 'blocked' ? UI.pill('Blocked', 'bad') : s.status === 'pending' ? UI.pill('Pending approval', 'warn') : UI.pill('Active', 'ok');
  m.set(h`<div class="row wrap gap6 sm mut"><span class="mono">${fmt.mobile(s.mobile)}</span>${status}<span>seen ${s.last_seen ? fmt.ago(s.last_seen) : 'never'}</span>${s.devices != null ? h`<span>· ${s.devices}/${s.max_devices} devices</span>` : ''}</div>
    <div class="rs-mini mt16">${join([['Tests', L.length], ['Average', avg == null ? '–' : avg + '%'], ['Best', ps.length ? Math.max(...ps) + '%' : '–'], ['Rank', rank ? '#' + rank : '–']], x => h`<div><b>${x[1]}</b><span>${x[0]}</span></div>`)}</div>
    ${ps.length > 1 ? h`<div class="section-t" style="margin-top:18px">Score trend</div><div class="well" style="padding:10px 12px">${trendSvg(ps)}</div>` : ''}
    <div class="section-t" style="margin-top:18px">Tests · ${L.length}</div>
    <div class="card pad0 list rs-plist">${L.length ? join([...L].reverse(), x => h`<div class="li"><div class="grow"><div class="t ell">${x.title}</div><div class="s">${new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ✓${x.correct} ✗${x.wrong} · ${mins(x.used)} min${x.late ? ' · late' : ''}</div></div>${pctTag(pctOf(x))}</div>`) : UI.empty({ icon: 'fileText', title: 'No tests yet' })}</div>`);
  m.foot(h`<a class="btn soft" href="${AX.u.wa(s.mobile, 'Hi ' + first(s.name) + ', ')}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a><a class="btn ghost" href="${AX.u.tel(s.mobile)}">${icon('phone', 16)} Call</a><span class="sp"></span><button class="btn ghost" data-close>Close</button>`);
}
const openStu = (mobile) => { if (AX.openStudent) AX.openStudent(String(mobile)); else profile(mobile); };

/* ---------- Results tab ---------- */
const RANGES = [['all', 'Any date'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom dates…']];
const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['hi', 'Highest score'], ['lo', 'Lowest score'], ['name', 'Name A–Z'], ['fast', 'Fastest']];
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function bounds(f) {
  const now = Date.now();
  if (f.range === 'today') return [startOfDay(now), null];
  if (/^\d+$/.test(f.range)) return [now - Number(f.range) * DAY, null];
  if (f.range === 'custom') return [f.from ? startOfDay(f.from) : null, f.to ? startOfDay(f.to) + DAY : null];
  return [null, null];
}
function filtered(rs) {
  const f = S.f, q = f.q.trim().toLowerCase(), [a, b] = bounds(f);
  const L = rs.filter(x => (!q || String(x.student || '').toLowerCase().includes(q) || String(x.mobile || '').includes(q))
    && (!f.t || tkey(x) === f.t) && (a == null || x.at >= a) && (b == null || x.at < b));
  const by = { new: (x, y) => y.at - x.at, old: (x, y) => x.at - y.at, hi: (x, y) => pctOf(y) - pctOf(x) || y.at - x.at, lo: (x, y) => pctOf(x) - pctOf(y) || y.at - x.at,
    name: (x, y) => String(x.student || '').localeCompare(String(y.student || '')) || y.at - x.at, fast: (x, y) => (x.used || 0) - (y.used || 0) };
  return L.sort(by[f.sort] || by.new);
}
function testOptions(rs) {
  const m = new Map();
  rs.forEach(x => { const k = tkey(x); const o = m.get(k); if (o) o.n++; else { const t = catTest(x.test_id); m.set(k, { k, title: t ? t.title : x.title || 'Test', ser: seriesTitle(t), n: 1 }); } });
  const L = [...m.values()].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
  const dup = new Set(L.filter((o, i) => L.some((p, j) => j !== i && p.title === o.title)).map(o => o.title));
  L.forEach(o => { o.label = o.title + (dup.has(o.title) && o.ser ? ' · ' + o.ser : '') + ' (' + o.n + ')'; });
  return L;
}
function csvResults(L) {
  dl('results.csv', [['Name', 'Mobile', 'Test', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Time(sec)', 'Late', 'Date'],
    ...L.map(x => [x.student, x.mobile, x.title, x.score, x.max, x.correct, x.wrong, x.skipped, x.used, x.late ? 'yes' : '', new Date(x.at).toLocaleString('en-IN')])]);
}
async function tabAll(ctx) {
  AX.set(ctx.el, h`${UI.skeleton(1)}<div class="mt12">${UI.skeleton(8)}</div>`);
  const [r] = await Promise.all([base(), flagLoad()]);
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const rs = r.results || [];
  const opts = testOptions(rs);
  if (S.f.t && !opts.some(o => o.k === S.f.t)) { const t = catTest(S.f.t); opts.unshift({ k: S.f.t, label: (t ? t.title : 'Selected test') + ' (0)' }); }
  const rangeLabel = k => k === 'custom' && S.f.range === 'custom' && (S.f.from || S.f.to) ? (S.f.from ? fmt.date(S.f.from) : 'Start') + ' – ' + (S.f.to ? fmt.date(S.f.to) : 'today') : RANGES.find(x => x[0] === k)[1];
  const sel = (act, list, cur, lbl, cls) => h`<select class="inp sm ${cls || ''}" data-act="${act}" aria-label="${lbl}">${join(list, ([v, l]) => h`<option value="${v}" ${v === cur ? raw('selected') : ''}>${l}</option>`)}</select>`;
  AX.set(ctx.el, h`<div class="rs-tools">
      <div class="inp-wrap search rs-q">${icon('search', 16)}<input class="inp sm" data-act="q" type="search" placeholder="Search student or mobile" value="${S.f.q}" aria-label="Search student or mobile" autocomplete="off"></div>
      ${sel('t', [['', 'All tests'], ...opts.map(o => [o.k, o.label])], S.f.t, 'Test', 'rs-t')}
      ${sel('range', RANGES.map(([k]) => [k, rangeLabel(k)]), S.f.range, 'Date')}
      ${sel('sort', SORTS, S.f.sort, 'Sort')}
    </div><div id="rs-sum" class="mt12"></div><div id="rs-list" class="mt12"></div>`);
  const draw = () => {
    if (!ctx.alive()) return;
    const L = filtered(rs), any = S.f.q || S.f.t || S.f.range !== 'all';
    const ps = L.map(pctRow), stu = new Set(L.map(x => x.mobile)).size, late = L.filter(x => x.late).length, fl = seeFlags() ? L.filter(isFlagged).length : 0;
    AX.set('#rs-sum', rs.length ? h`<div class="rs-sum glass">${join([[fmt.num(L.length), L.length === rs.length ? 'Results' : 'of ' + fmt.num(rs.length) + ' results'], [fmt.num(stu), 'Students'], [ps.length ? avgOf(ps) + '%' : '–', 'Average score'], [fmt.num(late), 'Submitted late' + (fl ? ' · ' + fl + ' 🚩' : '')]], x => h`<div><b>${x[0]}</b><span>${x[1]}</span></div>`)}</div>
      ${any ? h`<div class="row mt8 xs mut"><span>Filtered view — the CSV exports these ${fmt.plural(L.length, 'row')}.</span><button class="btn xs ghost" data-act="clear">${icon('x', 12)} Clear filters</button></div>` : rs.length >= 3000 ? h`<div class="xs mut mt8">The server sends the newest 3,000 results.</div>` : ''}` : '');
    if (!rs.length) return AX.set('#rs-list', h`<div class="card">${UI.empty({ icon: 'fileText', title: 'No results yet', text: 'Results show here as soon as students submit a test.' })}</div>`);
    if (!L.length) return AX.set('#rs-list', h`<div class="card">${UI.empty({ icon: 'search', title: 'No results match', text: 'Try another name, test or date.', action: h`<button class="btn sm" data-act="clear">Clear filters</button>` })}</div>`);
    const V = L.slice(0, S.show), del = canDel(), flg = canFlag();
    const acts = (x, fl) => h`${flg ? h`<button class="ibtn sm rs-fl ${fl ? 'on' : ''}" data-act="flag" data-id="${x.id}" title="${fl ? 'Tagged as cheating' : 'Report cheating'}" aria-label="Report cheating">${icon('flag', 15)}</button>` : ''}${del ? h`<button class="ibtn sm rs-del" data-act="del" data-id="${x.id}" title="Delete result" aria-label="Delete result">${icon('trash', 15)}</button>` : ''}`;
    const ans = x => h`<span class="t-ok">✓ ${x.correct}</span> <span class="t-bad">✗ ${x.wrong}</span> <span class="mut">– ${x.skipped}</span>`;
    const more = L.length > V.length ? h`<div class="row mt12" style="justify-content:center"><button class="btn sm" data-act="more">Show ${Math.min(100, L.length - V.length)} more</button><span class="xs mut">${fmt.num(V.length)} of ${fmt.num(L.length)}</span></div>` : '';
    if (UI.isPhone()) {
      AX.set('#rs-list', h`<div class="card pad0 list">${join(V, x => { const p = pctRow(x), fl = isFlagged(x); return h`<div class="rs-li">
          <div class="row top"><button class="rs-stu grow" data-act="stu" data-m="${x.mobile}">${UI.avatar(x.student, x.mobile, 'sm')}<span class="grow"><b class="ell">${x.student}</b><span class="xs mut mono">${fmt.mobile(x.mobile)}</span></span></button>${pctTag(p)}</div>
          <div class="rs-lt"><span class="ell b">${x.title}</span>${fl ? UI.pill('🚩 Cheating', 'bad') : ''}</div>
          <div class="row"><div class="grow xs mut rs-lm"><span class="num"><b class="tx2">${x.score}</b>/${x.max}</span><span class="num">${ans(x)}</span><span>${mins(x.used)} min</span>${x.late ? UI.pill('Late', 'warn') : ''}<span>${fmt.dt(x.at)}</span></div>${acts(x, fl)}</div></div>`; })}</div>${more}`);
    } else {
      AX.set('#rs-list', h`<div class="tbl-wrap"><table class="tbl rs-tbl"><thead><tr><th>Student</th><th>Test</th><th class="r">Score</th><th>%</th><th>✓ ✗ Skipped</th><th>Time</th><th>Date</th>${del || flg ? h`<th class="r"><span class="sr">Actions</span></th>` : ''}</tr></thead><tbody>
        ${join(V, x => { const p = pctRow(x), fl = isFlagged(x); return h`<tr class="${fl ? 'rs-flagged' : ''}">
          <td><button class="rs-stu" data-act="stu" data-m="${x.mobile}">${UI.avatar(x.student, x.mobile, 'sm')}<span class="grow"><b class="ell">${x.student}</b><span class="xs mut mono">${fmt.mobile(x.mobile)}</span></span></button></td>
          <td class="rs-tc"><div class="ell b6" title="${x.title}">${x.title}</div>${fl ? h`<div class="mt4">${UI.pill('🚩 Cheating', 'bad')}</div>` : ''}</td>
          <td class="r num nowrap"><b>${x.score}</b><span class="mut">/${x.max}</span></td><td>${pctTag(p)}</td>
          <td class="num nowrap">${ans(x)}</td><td class="nowrap">${mins(x.used)} min${x.late ? h` ${UI.pill('Late', 'warn')}` : ''}</td>
          <td class="xs tx2 nowrap">${fmt.dt(x.at)}</td>${del || flg ? h`<td class="r nowrap">${acts(x, fl)}</td>` : ''}</tr>`; })}</tbody></table></div>${more}`);
    }
  };
  draw();
  const find = id => rs.find(x => x.id === id);
  AX.act(ctx.el, {
    retry: () => ctx.reload(),
    more() { S.show += 100; draw(); },
    clear() { S.f = { q: '', t: '', range: 'all', from: null, to: null, sort: S.f.sort }; S.show = 100; ctx.reload(); },
    stu: el => openStu(el.dataset.m),
    flag(el) { const x = find(el.dataset.id); if (x) AX.integrity.report(Object.assign({}, x, { test_id: tidOf(x) })); },
    async del(el) {
      const x = find(el.dataset.id); if (!x) return;
      if (!(await UI.confirm({ title: 'Delete this result?', text: x.student + ' · ' + x.title + ' · ' + x.score + '/' + x.max + '. The student will be able to attempt the test again with a fresh score.', yes: 'Delete', tone: 'danger' }))) return;
      const y = await AX.api.admin('result_delete', { id: x.id });
      if (!y.ok) return UI.err(y);
      const i = rs.indexOf(x); if (i >= 0) rs.splice(i, 1);
      AX.cache.drop('results'); AX.emit('data:changed'); UI.toast('Deleted'); draw();
    }
  });
  AX.act(ctx.el, { q: AX.u.debounce(el => { S.f.q = el.value; S.show = 100; draw(); }, 160) }, 'input');
  AX.act(ctx.el, {
    t(el) { S.f.t = el.value; S.show = 100; draw(); },
    sort(el) { S.f.sort = el.value; draw(); },
    async range(el) {
      if (el.value !== 'custom') { S.f.range = el.value; S.show = 100; return draw(); }
      const from = await UI.pickDateTime({ time: false, title: 'From date', value: S.f.from || startOfDay(Date.now() - 7 * DAY), clear: false });
      if (from == null) { el.value = S.f.range; return; }
      const to = await UI.pickDateTime({ time: false, title: 'To date', value: Math.max(from, S.f.to || Date.now()), min: from, clear: false });
      if (to == null) { el.value = S.f.range; return; }
      Object.assign(S.f, { range: 'custom', from, to }); S.show = 100; ctx.reload();
    }
  }, 'change');
  const mq = matchMedia('(max-width:759px)'), onMq = () => { if (!ctx.alive()) return mq.removeEventListener('change', onMq); draw(); };
  mq.addEventListener('change', onMq);
  const off = AX.on('integrity:changed', () => { if (!ctx.alive()) return off(); flagLoad().then(draw); });
  const ph = document.getElementById('ax-ph');
  if (ph) AX.act(ph, { csv() { const L = filtered(rs); if (!L.length) return UI.toast('Nothing to export', { tone: 'warn' }); csvResults(L); UI.toast('Downloaded ' + fmt.plural(L.length, 'result')); } });
}

/* ---------- per-test stats (grouped by test id; results without one fall back to the title) ---------- */
function testStats(rs, since) {
  const g = new Map();
  rs.forEach(x => {
    if (since && x.at < since) return;
    const k = tkey(x); let t = g.get(k);
    if (!t) { const c = catTest(x.test_id); g.set(k, t = { k, id: tidOf(x), title: c ? c.title : x.title || 'Test', ser: seriesTitle(c || catTest(tidOf(x))), ps: [], stu: new Set(), last: 0 }); }
    t.ps.push(pctOf(x)); t.stu.add(x.mobile); t.last = Math.max(t.last, x.at);
  });
  return [...g.values()].map(t => ({ k: t.k, id: t.id, title: t.title, ser: t.ser, n: t.ps.length, stu: t.stu.size, avg: avgOf(t.ps), hi: Math.max(...t.ps), lo: Math.min(...t.ps), last: t.last })).sort((a, b) => b.n - a.n);
}
const miniBar = p => h`<div class="rs-mbar"><i class="${tone(p)}" style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
function testTable(L, o = {}) {
  if (UI.isPhone()) return h`<div class="card pad0 list">${join(L, t => h`<div class="li ${t.id ? 'click' : ''}" ${t.id ? raw('data-act="ana" data-id="' + AX.esc(t.id) + '"') : ''}>
      <div class="grow"><div class="t ell">${t.title}</div><div class="s">${fmt.plural(t.n, 'attempt')} · ${fmt.plural(t.stu, 'student')} · high ${t.hi}% · low ${t.lo}%</div>${miniBar(t.avg)}</div>
      <div class="col gap4" style="align-items:flex-end">${pctTag(t.avg)}${t.id ? icon('chevR', 16, 'faint') : ''}</div></div>`)}</div>`;
  return h`<div class="tbl-wrap"><table class="tbl rs-tbl"><thead><tr><th>Test</th><th class="r">Attempts</th><th class="r">Students</th><th>Avg</th><th class="r">Highest</th><th class="r">Lowest</th>${o.last ? h`<th>Last attempt</th>` : ''}<th></th></tr></thead><tbody>
    ${join(L, t => h`<tr class="${t.id ? 'click' : ''}" ${t.id ? raw('data-act="ana" data-id="' + AX.esc(t.id) + '"') : ''}><td style="min-width:200px"><b>${t.title}</b>${t.ser ? h`<div class="xs mut ell">${t.ser}</div>` : ''}${miniBar(t.avg)}</td>
      <td class="r num">${fmt.num(t.n)}</td><td class="r num">${fmt.num(t.stu)}</td><td>${pctTag(t.avg)}</td><td class="r num">${t.hi}%</td><td class="r num">${t.lo}%</td>
      ${o.last ? h`<td class="xs tx2 nowrap">${fmt.ago(t.last)}</td>` : ''}<td class="r">${t.id ? h`<span class="btn xs ghost">${icon('chart', 13)} Analytics</span>` : h`<span class="xs faint">—</span>`}</td></tr>`)}</tbody></table></div>`;
}
async function tabTests(ctx) {
  AX.set(ctx.el, UI.skeleton(8));
  const r = await base();
  if (!ctx.alive()) return;
  if (!r.ok) { AX.set(ctx.el, UI.errorBox(r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const rs = r.results || [];
  AX.set(ctx.el, h`<div class="row wrap" style="gap:12px">${AX.f.seg({ name: 'trange', value: S.tt.range, options: [{ value: 'all', label: 'All time' }, { value: '90', label: '90 days' }, { value: '30', label: '30 days' }, { value: '7', label: '7 days' }] })}
      <span class="grow"></span><select class="inp sm" style="width:auto" data-act="tsort" aria-label="Sort">${join([['n', 'Most attempts'], ['new', 'Latest attempt'], ['lo', 'Lowest average'], ['hi', 'Highest average'], ['az', 'Name A–Z']], ([v, l]) => h`<option value="${v}" ${v === S.tt.sort ? raw('selected') : ''}>${l}</option>`)}</select>
      <div class="inp-wrap search rs-tq">${icon('search', 16)}<input class="inp sm" data-act="tq" type="search" placeholder="Search tests" value="${S.tt.q}" aria-label="Search tests" autocomplete="off"></div></div>
    <div id="rs-tt" class="mt16"></div>`);
  const draw = () => {
    if (!ctx.alive()) return;
    const since = S.tt.range === 'all' ? 0 : Date.now() - Number(S.tt.range) * DAY, q = S.tt.q.trim().toLowerCase();
    const all = testStats(rs, since), L = all.filter(t => !q || t.title.toLowerCase().includes(q));
    const by = { n: (a, b) => b.n - a.n, new: (a, b) => b.last - a.last, lo: (a, b) => a.avg - b.avg, hi: (a, b) => b.avg - a.avg, az: (a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }) };
    L.sort(by[S.tt.sort] || by.n);
    const untested = catTests().filter(t => !all.some(x => x.id === t.id)).length;
    AX.set('#rs-tt', !L.length ? h`<div class="card">${UI.empty({ icon: 'bars', title: rs.length ? 'No tests here' : 'No attempts yet', text: rs.length ? 'No attempts in this period, or no test matches the search.' : 'Per-test numbers show here once students submit tests.' })}</div>`
      : h`${testTable(L, { last: true })}<div class="xs mut mt12">${fmt.plural(L.length, 'test')} with attempts${untested && S.tt.range === 'all' ? ' · ' + untested + ' other test' + (untested === 1 ? ' has' : 's have') + ' no attempts yet' : ''}. Tap a test to see its question-by-question analytics.</div>`);
  };
  draw();
  AX.f.wireSeg(ctx.el, (k, v) => { if (k === 'trange') { S.tt.range = v; draw(); } });
  AX.act(ctx.el, { retry: () => ctx.reload(), ana: el => AX.openAnalytics(el.dataset.id) });
  AX.act(ctx.el, { tq: AX.u.debounce(el => { S.tt.q = el.value; draw(); }, 160) }, 'input');
  AX.act(ctx.el, { tsort(el) { S.tt.sort = el.value; draw(); } }, 'change');
  const mq = matchMedia('(max-width:759px)'), onMq = () => { if (!ctx.alive()) return mq.removeEventListener('change', onMq); draw(); };
  mq.addEventListener('change', onMq);
}

/* ---------- Insights ---------- */
function inStats(rs, sts, range) {
  const now = Date.now(), since = now - range * DAY;
  const st = sts.filter(x => x.status !== 'pending'), act = st.filter(x => x.status !== 'blocked');
  const R = rs.filter(x => x.at >= since), P = people(rs);
  const days = []; for (let i = range - 1; i >= 0; i--) { const d = new Date(now - i * DAY); days.push({ k: dayK(d), l: d.getDate(), m: d.toLocaleDateString('en-IN', { month: 'short' }), n: 0 }); }
  const dm = {}; days.forEach(d => { dm[d.k] = d; }); R.forEach(x => { const d = dm[dayK(x.at)]; if (d) d.n++; });
  const dist = Array(10).fill(0); R.forEach(x => { dist[Math.max(0, Math.min(9, Math.floor(pctOf(x) / 10)))]++; });
  const seen = d => act.filter(x => x.last_seen && now - x.last_seen < d * DAY).length;
  const attempted = new Set(R.map(x => x.mobile)).size;
  return { st, act, R, people: P, days, dist, tl: testStats(rs, since), today: rs.filter(x => dayK(x.at) === dayK(now)).length, activeToday: seen(1), active7: seen(7),
    avg: avgOf(R.map(pctOf)), attempted, part: act.length ? Math.round(attempted * 100 / act.length) : 0,
    inactive: act.filter(x => !x.last_seen || now - x.last_seen > 7 * DAY).sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0)),
    never: act.filter(x => !x.attempts),
    weak: P.filter(p => p.n >= 2 && p.avg < 35).sort((a, b) => a.avg - b.avg),
    top: P.filter(p => p.n >= 1).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 10),
    rising: P.filter(p => p.n >= 2 && p.trend >= 10).sort((a, b) => b.trend - a.trend).slice(0, 5) };
}
// bar chart with optional count labels and per-bar tone
const barChart = (data, o = {}) => {
  const mx = Math.max(1, ...data.map(d => d.n));
  return h`<div class="rs-bars ${o.cls || ''} ${o.counts ? 'cnt' : ''}" style="height:${o.height || 160}px" role="img" aria-label="${o.label || 'Bar chart'}">${join(data, d => h`<div class="rs-bc" title="${d.title}"><div class="rs-bt">${o.counts ? h`<span class="rs-bn">${d.n || ''}</span>` : ''}<i class="${d.n ? d.tone || '' : 'z'}" style="height:${d.n ? Math.max(o.min || 4, Math.round(d.n * 100 / mx)) : 2}%"></i></div><span class="rs-bl">${d.label}</span></div>`)}</div>`;
};
const rankTag = i => h`<span class="rs-rk ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span>`;
async function tabInsights(ctx) {
  AX.set(ctx.el, h`${UI.skeleton(8, 'kpi')}<div class="mt16">${UI.skeleton(6)}</div>`);
  const [r, s] = await Promise.all([base(), AX.data.students()]);
  if (!ctx.alive()) return;
  if (!r.ok || !s.ok) { AX.set(ctx.el, UI.errorBox(r.ok ? s : r)); AX.act(ctx.el, { retry: () => ctx.reload() }); return; }
  const rs = r.results || [], sts = s.students || [], I = S.ins;
  let ST = null;
  AX.set(ctx.el, h`<div class="row wrap" style="gap:12px">${AX.f.seg({ name: 'irange', value: String(I.range), options: [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }] })}<span class="xs mut">Tiles, charts and the test table follow this range. Toppers and alerts use all loaded results.</span></div><div id="in-body" class="mt16"></div>`);
  const attnHtml = () => {
    const k = I.att, site = stuLink();
    const bulk = list => list.length > 1 ? h`<div class="row wrap rs-bulk">${UI.copyBtn(list.join(', '), 'Copy ' + list.length + ' numbers')}<span class="xs mut">Paste into a WhatsApp broadcast list</span></div>` : '';
    const prow = (p, lead, end, wa) => h`<div class="li click" data-act="stu" data-m="${p.mobile}">${lead}<div class="grow"><div class="t ell">${p.name}</div><div class="s mono">${fmt.mobile(p.mobile)}</div></div><div class="rs-end">${end}</div>${wa ? waBtn(p.mobile, wa) : ''}</div>`;
    if (k === 'weak') return ST.weak.length ? h`${join(ST.weak, p => prow(p, h`<span class="rs-rk bad">${p.avg}%</span>`, h`<span class="xs mut">${p.n} tests · best ${p.best}%</span>`, `Hi ${first(p.name)}, I saw your recent tests. Don't worry — revise your Mistake Notebook and attempt again. Message me if you need help 🙂 ${site}`))}${bulk(ST.weak.map(p => p.mobile))}`
      : h`<div class="rs-none">Nobody is below 35% average (2+ tests). 🎉</div>`;
    const L = k === 'inactive' ? ST.inactive : ST.never;
    const msg = x => k === 'inactive' ? `Hi ${first(x.name)}, we missed you! New tests are waiting for you. Open ${site} and keep your streak going 🔥` : `Hi ${first(x.name)}, your access is ready but you haven't taken a test yet. Start your first test today: ${site}`;
    return L.length ? h`${join(L.slice(0, 50), x => h`<div class="li click" data-act="stu" data-m="${x.mobile}">${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><div class="t ell">${x.name}</div><div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · ${k === 'inactive' ? 'seen ' + (x.last_seen ? fmt.ago(x.last_seen) : 'never') : 'joined ' + (x.created ? fmt.ago(x.created) : '')}</div></div>${waBtn(x.mobile, msg(x))}</div>`)}
      ${L.length > 50 ? h`<div class="rs-none" style="padding:10px 16px">+${L.length - 50} more</div>` : ''}${bulk(L.map(x => x.mobile))}`
      : h`<div class="rs-none">${k === 'inactive' ? 'Everyone was active in the last 7 days. 🎉' : 'Everyone has attempted at least one test. 🎉'}</div>`;
  };
  const findHtml = () => {
    const q = I.q.trim().toLowerCase();
    if (q.length < 2) return h`<div class="rs-none">Type at least 2 letters or digits.</div>`;
    const L = sts.filter(x => String(x.name || '').toLowerCase().includes(q) || String(x.mobile).includes(q)).slice(0, 12);
    return L.length ? join(L, x => h`<div class="li click" data-act="stu" data-m="${x.mobile}">${UI.avatar(x.name, x.mobile, 'sm')}<div class="grow"><div class="t ell">${x.name}</div><div class="s"><span class="mono">${fmt.mobile(x.mobile)}</span> · ${x.attempts || 0} tests · ${x.status === 'blocked' ? h`<span class="t-bad">blocked</span>` : x.status === 'pending' ? 'pending' : 'seen ' + (x.last_seen ? fmt.ago(x.last_seen) : 'never')}</div></div>${icon('chevR', 16, 'faint')}</div>`) : h`<div class="rs-none">No student found.</div>`;
  };
  const draw = () => {
    if (!ctx.alive()) return;
    ST = inStats(rs, sts, I.range);
    const step = Math.ceil(ST.days.length / 10);
    const days = ST.days.map((d, i) => ({ n: d.n, title: d.l + ' ' + d.m + ': ' + d.n, label: i % step === 0 || i === ST.days.length - 1 ? d.l : '' }));
    const dist = ST.dist.map((n, i) => ({ n, title: i * 10 + '-' + (i * 10 + 10) + '%: ' + n, label: i * 10, tone: i < 4 ? 'bad' : i < 6 ? 'warn' : 'ok' }));
    const k = (label, value, ic, tn, foot) => UI.kpi({ label, value, icon: ic, tone: tn, foot });
    const segs = [['weak', 'Low scores', ST.weak.length], ['inactive', 'Inactive 7+ days', ST.inactive.length], ['never', 'Never attempted', ST.never.length]];
    AX.set('#in-body', h`<div class="grid g4">
        ${k('Students', fmt.num(ST.act.length), 'users', '', 'active, not blocked')}${k('Active today', fmt.num(ST.activeToday), 'pulse', '', 'seen in the last 24 h')}
        ${k('Active 7 days', fmt.num(ST.active7), 'activity', 'info', '')}${k('Attempts today', fmt.num(ST.today), 'zap', 'gold', '')}
        ${k('Attempts (' + I.range + 'd)', fmt.num(ST.R.length), 'fileText', 'info', '')}${k('Students tested', fmt.num(ST.attempted), 'checkCircle', '', 'in ' + I.range + ' days')}
        ${k('Average score', ST.avg == null ? '–' : ST.avg + '%', 'target', 'vio', '')}${k('Participation', ST.part + '%', 'percent', ST.part >= 50 ? '' : 'warn', 'of active students tested')}</div>
      <div class="card mt16"><div class="card-h">${icon('bars')}<h3>Daily attempts</h3><span class="sub">last ${I.range} days</span><span class="grow"></span><span class="xs mut">${fmt.plural(ST.R.length, 'attempt')}</span></div>${barChart(days, { cls: 'd' + I.range, label: 'Daily attempts', min: 6 })}</div>
      <div class="grid rs-two mt16">
        <div class="card"><div class="card-h">${icon('chart')}<h3>Score distribution</h3></div>${barChart(dist, { counts: true, label: 'Score distribution', height: 170, min: 6 })}<div class="xs mut" style="text-align:center;margin-top:8px">% score bands · ${fmt.plural(ST.R.length, 'attempt')}</div></div>
        <div class="card pad0"><div class="card-h" style="padding:16px 18px 4px">${icon('trophy')}<h3>Top students</h3><span class="sub">by average</span></div>
          <div class="list">${ST.top.length ? join(ST.top, (p, i) => h`<div class="li click" data-act="stu" data-m="${p.mobile}">${rankTag(i)}<div class="grow"><div class="t ell">${p.name}</div><div class="s mono">${fmt.mobile(p.mobile)}</div></div><div class="rs-end"><b>${p.avg}%</b><span class="xs mut">${fmt.plural(p.n, 'test')}</span></div></div>`) : h`<div class="rs-none">No attempts yet.</div>`}</div></div></div>
      ${ST.rising.length ? h`<div class="card pad0 mt16"><div class="card-h" style="padding:16px 18px 4px">${icon('sparkle')}<h3>Improving fast</h3><span class="sub">first test → latest test</span></div><div class="list">${join(ST.rising, p => h`<div class="li click" data-act="stu" data-m="${p.mobile}"><span class="rs-rk up">▲</span><div class="grow"><div class="t ell">${p.name}</div><div class="s mono">${fmt.mobile(p.mobile)}</div></div><div class="rs-end"><b class="t-ok">+${p.trend}%</b><span class="xs mut">now ${p.now}%</span></div>${waBtn(p.mobile, `Great progress ${first(p.name)}! Your score went up by ${p.trend}%. Keep it up 💪`)}</div>`)}</div></div>` : ''}
      <div class="card pad0 mt16"><div class="card-h" style="padding:16px 18px 10px">${icon('alert')}<h3>Needs attention</h3><span class="pill ${ST.weak.length + ST.inactive.length + ST.never.length ? 'warn' : ''}">${ST.weak.length + ST.inactive.length + ST.never.length}</span></div>
        <div style="padding:0 16px 10px"><div class="seg" role="tablist">${join(segs, ([v, l, n]) => h`<button type="button" class="${I.att === v ? 'on' : ''}" data-act="att" data-v="${v}">${l} <b class="rs-sc">${n}</b></button>`)}</div></div>
        <div class="list rs-attn" id="in-attn">${attnHtml()}</div></div>
      <div class="section-t">Test-wise performance · ${ST.tl.length}</div>
      ${ST.tl.length ? h`${testTable(ST.tl.slice(0, 10))}${ST.tl.length > 10 ? h`<div class="mt8"><a class="btn xs ghost" href="#/results/tests">See all ${ST.tl.length} tests ${icon('chevR', 13)}</a></div>` : ''}` : h`<div class="card">${UI.empty({ icon: 'bars', title: 'No attempts in this period.' })}</div>`}
      <div class="section-t">Look up a student</div>
      <div class="card pad0"><div style="padding:14px 16px 6px"><div class="inp-wrap search">${icon('search', 16)}<input class="inp sm" data-act="find" type="search" placeholder="Name or mobile number" value="${I.q}" aria-label="Look up a student" autocomplete="off"></div></div><div class="list" id="in-find">${findHtml()}</div></div>`);
  };
  draw();
  AX.f.wireSeg(ctx.el, (k, v) => { if (k === 'irange') { I.range = Number(v); draw(); } });
  AX.act(ctx.el, {
    retry: () => ctx.reload(), wa() {}, stu: el => openStu(el.dataset.m), ana: el => AX.openAnalytics(el.dataset.id),
    att(el) { I.att = el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); AX.set('#in-attn', attnHtml()); }
  });
  AX.act(ctx.el, { find: AX.u.debounce(el => { I.q = el.value; AX.set('#in-find', findHtml()); }, 150) }, 'input');
  const ph = document.getElementById('ax-ph');
  if (ph) AX.act(ph, { incsv() { const P = [...inStats(rs, sts, I.range).people].sort((a, b) => b.avg - a.avg); dl('insights-' + I.range + 'days.csv', [['Name', 'Mobile', 'Tests', 'Average %', 'Best %', 'Change %', 'Last test'], ...P.map(p => [p.name, p.mobile, p.n, p.avg, p.best, p.trend, new Date(p.last).toLocaleDateString('en-IN')])]); UI.toast('Downloaded ' + fmt.plural(P.length, 'student')); } });
}

/* ---------- one test's analytics ---------- */
const LET = 'ABCD';
async function analytics(el, id, o) {
  AX.set(el, h`<div class="an-wrap">${UI.skeleton(6, 'kpi')}<div class="mt16">${UI.skeleton(6)}</div></div>`);
  const [r] = await Promise.all([AX.api.call('cbt_admin2', 'analytics', { id }), AX.data.catalog().then(c => { if (c && c.ok) S.cat = c; })]);
  if (!el.isConnected || (o.ctx && !o.ctx.alive())) return;
  if (!r.ok) {
    const msg = r.error === 'not_found' ? 'Test not found' : r.error === 'missing' ? 'Analytics needs the v6 SQL update' : AX.errText(r);
    if (o.drawer) { o.drawer.close(); UI.toast(msg, { tone: 'bad' }); return; }
    AX.set(el, h`<div class="card">${UI.empty({ tone: 'bad', icon: 'alert', title: msg, text: r.error === 'not_found' ? 'It may have been deleted.' : '', action: h`<a class="btn sm" href="#/results/tests">${icon('arrowL', 15)} All tests</a>` })}</div>`);
    return;
  }
  const t = catTest(id), ser = seriesTitle(t), title = r.title || (t && t.title) || 'Test';
  const A = { sort: 'no', allTop: false };
  const qs = r.questions || [], rows = r.rows || [], sus = qs.filter(q => q.suspect);
  if (o.drawer) o.drawer.head(h`<h2 class="ell">${title}</h2><div class="m-s">Test analytics${ser ? ' · ' + ser : ''}</div>`);
  if (o.onTitle) o.onTitle(title, ser);
  const csv = () => {
    const l = [['Rank', 'Name', 'Mobile', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Time(sec)', 'Attempts'], ...rows.map(x => [x.rank, x.name, x.mobile, x.score, x.max, x.correct, x.wrong, x.skipped, x.used, x.attempts]),
      '', ['Question', 'Text', 'Subject', 'Answered', 'Correct', '% correct', 'A', 'B', 'C', 'D', 'Key'],
      ...qs.map(q => [q.i + 1, q.q, q.sec, q.answered, q.correct, q.answered ? Math.round(q.correct * 100 / q.answered) : 0, ...(q.opts || []), q.key == null ? '' : LET[q.key]])];
    dl((r.title || 'test').replace(/[^\w]+/g, '_') + '_analytics.csv', l); UI.toast('Downloaded');
  };
  const openQ = i => { if (AX.openTest && canQ()) { if (o.drawer) o.drawer.close(); AX.openTest(id, { question: i }); } else UI.toast('Open the test in Test studio to edit this question', { tone: 'warn' }); };
  if (!r.students) {
    AX.set(el, h`<div class="card">${UI.empty({ icon: 'chart', title: 'Nobody has attempted this test yet.', text: 'Question-by-question numbers show here after the first submission.', action: o.drawer ? h`<button class="btn sm" data-close>Close</button>` : h`<a class="btn sm" href="#/results/tests">${icon('arrowL', 15)} All tests</a>` })}</div>`);
    return { csv: () => UI.toast('Nobody has attempted this test yet', { tone: 'warn' }) };
  }
  const avg = r.avg_pct == null ? '–' : Math.round(Number(r.avg_pct) * 10) / 10 + '%';
  const qCard = q => {
    const p = q.answered ? Math.round(q.correct * 100 / q.answered) : 0, op = q.opts || [], mx = Math.max(1, ...op), tot = op.reduce((s, v) => s + (v || 0), 0);
    return h`<div class="an-q ${q.suspect ? 'sus' : ''}">
      <div class="an-qh"><span class="an-n">Q${q.i + 1}</span><div class="grow xs mut rs-lm">${q.sec ? h`<span class="pill">${q.sec}</span>` : ''}<span>${q.answered}/${q.total} answered</span><span>avg ${fsec(q.avg_t)}</span></div><span class="pill ${p >= 60 ? 'ok' : p >= 30 ? 'warn' : 'bad'}">${p}% correct</span></div>
      <p class="an-t" data-act="more" title="Tap to show the full text">${q.q || '(image question)'}</p>
      <div class="an-opts">${join(op, (n, j) => h`<div class="an-o ${q.key === j ? 'key' : ''}"><b>${LET[j] || j + 1}</b><div class="an-bar"><i style="width:${Math.round((n || 0) * 100 / mx)}%"></i></div><span class="num">${n || 0}<span class="faint"> · ${tot ? Math.round((n || 0) * 100 / tot) : 0}%</span></span>${q.key === j ? icon('check', 14) : raw('<span class="an-ck"></span>')}</div>`)}</div>
      <div class="row mt12">${q.suspect ? UI.pill('Check the answer key', 'warn') : q.key == null ? UI.pill('No answer key', 'bad') : ''}<span class="grow"></span>${AX.can('content') ? h`<button class="btn xs ghost" data-act="openq" data-i="${q.i}">${icon('edit', 13)} Open question</button>` : ''}</div></div>`;
  };
  const drawQs = () => {
    const L = [...qs];
    if (A.sort === 'hard') { const v = q => q.answered ? q.correct / q.answered : 2; L.sort((a, b) => v(a) - v(b)); }
    AX.set(el.querySelector('#an-qs'), L.length ? join(L, qCard) : h`<div class="card">${UI.empty({ icon: 'fileText', title: 'No questions' })}</div>`);
  };
  const drawTop = () => {
    const T = A.allTop ? rows : rows.slice(0, 10);
    AX.set(el.querySelector('#an-top'), T.length ? h`${join(T, x => { const pp = x.max ? Math.round(x.score * 100 / x.max) : 0; return h`<div class="li click" data-act="stu" data-m="${x.mobile}">${rankTag((x.rank || 1) - 1)}<div class="grow"><div class="t ell">${x.name}</div><div class="s"><span class="num">✓${x.correct} ✗${x.wrong} –${x.skipped}</span> · ${mins(x.used)} min${x.attempts > 1 ? ' · ' + x.attempts + ' attempts' : ''}</div></div><div class="rs-end"><b class="num">${x.score}<span class="mut" style="font-weight:600">/${x.max}</span></b><span class="xs ${'t-' + tone(pp)}">${pp}%</span></div></div>`; })}
      ${rows.length > 10 ? h`<div style="padding:8px 12px 12px"><button class="btn xs ghost" data-act="alltop">${A.allTop ? 'Show top 10' : 'Show all ' + rows.length}</button></div>` : ''}` : h`<div class="rs-none">No students yet.</div>`);
  };
  AX.set(el, h`<div class="an-wrap">
    <div class="an-tiles">${join([['Students', fmt.num(r.students), 'users', ''], ['Average', avg, 'target', 'vio'], ['Highest', h`${r.high}<small>/${r.max}</small>`, 'trophy', 'gold'], ['Lowest', r.low, 'minus', 'bad'], ['Avg time', fsec(r.avg_time), 'clock', 'info'], ['Attempts', fmt.num(r.attempts), 'fileText', '']], x => UI.kpi({ label: x[0], value: x[1], icon: x[2], tone: x[3] }))}</div>
    ${sus.length ? h`<div class="callout bad mt16">${icon('alert')}<div class="grow"><b>⚠ ${fmt.plural(sus.length, 'question')} may have a wrong answer key</b><div class="sm mt4">Most students picked the same other option. Check:</div><div class="chips mt8">${join(sus, q => h`<button class="chip" data-act="openq" data-i="${q.i}">Q${q.i + 1}</button>`)}</div></div></div>` : ''}
    <div class="an-grid mt16"><div class="an-main">
      <div class="row wrap" style="gap:10px;margin-bottom:12px"><div class="seg" role="tablist"><button type="button" class="on" data-act="sort" data-v="no">By number</button><button type="button" data-act="sort" data-v="hard">Hardest first</button></div><span class="grow"></span>
        <span class="xs mut">${fmt.plural(qs.length, 'question')}</span>${o.drawer ? h`<a class="btn sm ghost" href="#/results/test/${id}" data-act="full">${icon('external', 15)} Full page</a>` : ''}<button class="btn sm" data-act="csv">${icon('download', 15)} Download CSV</button></div>
      <div class="col gap16" id="an-qs"></div></div>
      <aside class="an-side"><div class="card pad0"><div class="card-h" style="padding:16px 18px 4px">${icon('trophy')}<h3>Top students</h3><span class="sub">${fmt.plural(rows.length, 'student')}</span></div><div class="list" id="an-top"></div></div></aside></div></div>`);
  drawQs(); drawTop();
  AX.act(el, {
    sort(b) { A.sort = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawQs(); },
    more(p) { p.classList.toggle('open'); },
    openq: b => openQ(Number(b.dataset.i)),
    alltop() { A.allTop = !A.allTop; drawTop(); },
    stu: b => openStu(b.dataset.m),
    csv, full() { if (o.drawer) o.drawer.close(); }
  });
  return { csv };
}
AX.openAnalytics = (id) => {
  if (!id) return;
  if (!AX.can('results')) return UI.toast('You do not have access to results', { tone: 'warn' });
  UI.drawer({ size: 'wide an-drawer', head: h`<h2>Test analytics</h2><div class="m-s">Loading…</div>`, body: '', onOpen(el, close, api) { analytics(api.body, id, { drawer: api }); } });
};
async function pageAnalytics(ctx, id) {
  const t0 = catTest(id);
  const headFor = (title, ser) => ctx.head({ title: title || 'Test analytics', sub: 'Test analytics' + (ser ? ' · ' + ser : '') + ' — how students answered each question.', crumb: 'Test analytics',
    actions: h`<a class="btn sm ghost" href="#/results/tests">${icon('arrowL', 15)} All tests</a>` });
  headFor(t0 && t0.title, seriesTitle(t0));
  await analytics(ctx.el, id, { ctx, onTitle: headFor });
}

/* ---------- module ---------- */
const SUB = {
  all: 'Every submitted attempt. Search, filter by test or date, report cheating and export.',
  tests: 'How each test went — attempts, averages, highs and lows. Tap a test for question-by-question analytics.',
  insights: 'How your students are doing — activity, scores, who needs a push and who is topping.'
};
AX.mod({
  id: 'results', title: 'Results & analytics', short: 'Results', icon: 'chart', group: 'Academics', order: 20, perm: 'results',
  sub: SUB.all,
  async render(ctx) {
    const p0 = ctx.parts[0] || 'all';
    if (p0 === 'test' && ctx.parts[1]) return pageAnalytics(ctx, ctx.parts[1]);
    const tab = ['all', 'tests', 'insights'].includes(p0) ? p0 : 'all';
    if (tab === 'all') { if (ctx.q.t != null) { S.f.t = ctx.q.t; S.show = 100; } if (ctx.q.q != null) { S.f.q = ctx.q.q; S.show = 100; } }
    const refresh = h`<button class="btn sm ghost" data-act="refresh">${icon('refresh', 15)} Refresh</button>`;
    ctx.head({ title: 'Results & analytics', sub: SUB[tab], tab,
      tabs: [{ id: 'all', title: 'Results', icon: 'list', href: '#/results' }, { id: 'tests', title: 'Tests', icon: 'bars' }, { id: 'insights', title: 'Insights', icon: 'sparkle' }],
      actions: tab === 'all' ? h`${refresh}<button class="btn sm" data-act="csv">${icon('download', 15)} Export CSV</button>` : tab === 'insights' ? h`${refresh}<button class="btn sm" data-act="incsv">${icon('download', 15)} Report CSV</button>` : refresh });
    const ph = document.getElementById('ax-ph');
    if (ph) AX.act(ph, { refresh() { AX.cache.drop('results'); if (tab === 'insights') AX.cache.drop('students'); ctx.reload(); } });
    if (tab === 'tests') return tabTests(ctx);
    if (tab === 'insights') return tabInsights(ctx);
    return tabAll(ctx);
  },
  async search(q) {
    const c = await AX.data.catalog(); if (!c || !c.ok) return [];
    S.cat = c;
    return (c.tests || []).filter(t => String(t.title || '').toLowerCase().includes(q)).slice(0, 5)
      .map(t => ({ g: 'Test analytics', title: t.title, sub: (seriesTitle(t) || 'Test') + ' · question-by-question analytics', icon: 'chart', go: '#/results/test/' + encodeURIComponent(t.id) }));
  }
});
AX.actions.push({ label: 'Export results CSV', icon: 'download', perm: ['results'], async run() {
  const r = await base(); if (!r.ok) return UI.err(r);
  const L = filtered(r.results || []); if (!L.length) return UI.toast('Nothing to export', { tone: 'warn' });
  csvResults(L); UI.toast('Downloaded ' + fmt.plural(L.length, 'result'));
} });

AX.css('results', `
.rs-tools{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,260px) minmax(0,170px) minmax(0,160px);gap:10px;align-items:center}
.rs-tools .inp{width:100%}
.rs-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-radius:var(--r-lg);padding:4px 0}
.rs-sum>div{padding:10px 18px;border-left:1px solid var(--line);min-width:0}
.rs-sum>div:first-child{border-left:0}
.rs-sum b{display:block;font-family:var(--font-display);font-size:23px;font-weight:600;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:lining-nums tabular-nums}
.rs-sum span{display:block;font-size:12px;color:var(--mut);font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rs-tbl td{padding:10px 14px}
.rs-tbl .nowrap,.rs-lm{white-space:nowrap}
.rs-tc{max-width:260px}
.b6{font-weight:650}
.rs-stu{display:flex;align-items:center;gap:10px;border:0;background:none;padding:0;text-align:left;min-width:0;max-width:240px;color:var(--tx)}
.rs-stu .grow{display:flex;flex-direction:column;min-width:0}
.rs-stu:hover b{color:var(--pri)}
.rs-pct{display:inline-flex;align-items:center;justify-content:center;min-width:48px;height:24px;padding:0 8px;border-radius:8px;font-weight:800;font-size:12.5px;font-variant-numeric:tabular-nums}
.rs-pct.ok{background:var(--ok-soft);color:var(--ok)}.rs-pct.warn{background:var(--warn-soft);color:var(--warn)}.rs-pct.bad{background:var(--bad-soft);color:var(--bad)}
.t-ok{color:var(--ok)}.t-bad{color:var(--bad)}.t-warn{color:var(--warn)}
.rs-fl{color:var(--faint)}.rs-fl:hover{color:var(--bad);background:var(--bad-soft)}.rs-fl.on{color:var(--bad);background:var(--bad-soft)}
.rs-del{color:var(--faint)}.rs-del:hover{color:var(--bad);background:var(--bad-soft)}
.rs-flagged td:first-child{box-shadow:inset 3px 0 0 var(--bad)}
.rs-li{padding:12px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px;min-width:0}
.rs-li:first-child{border-top:0}
.rs-lt{display:flex;align-items:center;gap:8px;min-width:0;font-size:13.5px;padding-left:40px}
.rs-li .rs-lm{padding-left:40px}
.rs-lm{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0;white-space:normal}
.rs-mbar{height:5px;border-radius:3px;background:var(--hover);overflow:hidden;margin-top:7px;max-width:240px}
.rs-mbar i{display:block;height:100%;border-radius:3px}
.rs-mbar i.ok{background:var(--ok)}.rs-mbar i.warn{background:var(--warn)}.rs-mbar i.bad{background:var(--bad)}
.rs-tq{width:min(260px,100%)}
.rs-two{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
.rs-bars{display:flex;align-items:stretch;gap:6px}
.rs-bars.d30{gap:3px}.rs-bars.d90{gap:1px}
.rs-bc{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;cursor:default}
.rs-bt{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}
.rs-bt i{display:block;width:100%;max-width:34px;border-radius:7px 7px 3px 3px;background:var(--grad-pri);transition:filter var(--fast)}
.rs-bars.d90 .rs-bt i{border-radius:2px 2px 1px 1px}.rs-bars.d30 .rs-bt i{border-radius:4px 4px 2px 2px}
.rs-bt i.z{background:var(--hover)}
.rs-bt i.bad{background:linear-gradient(180deg,var(--bad),color-mix(in srgb,var(--bad) 70%,transparent))}
.rs-bt i.warn{background:linear-gradient(180deg,var(--warn),color-mix(in srgb,var(--warn) 70%,transparent))}
.rs-bt i.ok{background:linear-gradient(180deg,var(--ok),color-mix(in srgb,var(--ok) 70%,transparent))}
.rs-bc:hover .rs-bt i{filter:brightness(1.15)}
.rs-bars.cnt .rs-bt i{max-height:calc(100% - 15px)}
.rs-bn{font-size:11px;font-weight:800;color:var(--tx-2);font-variant-numeric:tabular-nums;line-height:1}
.rs-bl{height:14px;font-size:10.5px;color:var(--faint);text-align:center;white-space:nowrap;overflow:visible;display:flex;justify-content:center;font-variant-numeric:tabular-nums}
.rs-rk{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;font-weight:800;font-size:12.5px;background:var(--hover);color:var(--tx-2);font-variant-numeric:tabular-nums}
.rs-rk.r1{background:var(--grad-gold);color:#2a1d05}.rs-rk.r2{background:linear-gradient(135deg,#e5e9f0,#a9b4c4);color:#1d2532}.rs-rk.r3{background:linear-gradient(135deg,#e7b48a,#b07045);color:#2b1607}
.rs-rk.up{background:var(--ok-soft);color:var(--ok)}
.rs-rk.bad{width:auto;min-width:44px;padding:0 6px;background:var(--bad-soft);color:var(--bad);font-size:12px}
.rs-end{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex:none;text-align:right;font-variant-numeric:tabular-nums}
.rs-none{padding:16px 18px;color:var(--mut);font-size:13.5px}
.rs-sc{display:inline-grid;place-items:center;min-width:20px;height:18px;padding:0 5px;margin-left:4px;border-radius:9px;background:var(--hover);font-size:11px;font-weight:800}
.seg button.on .rs-sc{background:var(--pri-soft);color:var(--pri)}
.rs-bulk{gap:10px;padding:12px 16px;border-top:1px solid var(--line);background:var(--solid-2)}
.rs-wa{flex:none}
.rs-mini{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.rs-mini>div{padding:12px 14px;border-radius:var(--r-md);background:var(--solid-2);border:1px solid var(--line);min-width:0}
.rs-mini b{display:block;font-family:var(--font-display);font-size:22px;font-weight:600;line-height:1.1;font-variant-numeric:lining-nums tabular-nums}
.rs-mini span{font-size:12px;color:var(--mut);font-weight:650}
.rs-trend{height:76px}
.rs-plist{max-height:300px;overflow:auto}
.an-wrap{container-type:inline-size}
.an-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.an-tiles .kpi{padding:14px 14px 10px}
.an-tiles .kpi .k-v{font-size:26px}
.an-tiles .kpi .k-v small{font-size:14px;color:var(--mut);font-family:var(--font)}
.an-tiles .kpi .k-f{display:none}
.an-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.an-q{border-radius:var(--r-lg);border:1px solid var(--line);background:var(--solid);padding:14px 16px;min-width:0;transition:border-color var(--fast)}
.an-q:hover{border-color:var(--line-2)}
.an-q.sus{border-color:color-mix(in srgb,var(--warn) 55%,transparent);box-shadow:inset 3px 0 0 var(--warn)}
.an-qh{display:flex;align-items:center;gap:10px;min-width:0}
.an-n{min-width:40px;height:30px;padding:0 8px;border-radius:10px;display:grid;place-items:center;background:var(--pri-soft);color:var(--pri);font-weight:800;font-size:12.5px;flex:none}
.an-t{margin:10px 0 2px;line-height:1.55;font-weight:550;overflow-wrap:anywhere;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
.an-t.open{display:block;-webkit-line-clamp:unset}
.an-opts{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin-top:10px}
.an-o{display:grid;grid-template-columns:22px minmax(0,1fr) 74px 16px;align-items:center;gap:10px;font-size:12.5px;padding:5px 8px;border-radius:9px}
.an-o b{color:var(--mut);font-weight:800}
.an-o .num{text-align:right;font-weight:700;white-space:nowrap}
.an-bar{height:8px;border-radius:5px;background:var(--hover);overflow:hidden}
.an-bar i{display:block;height:100%;border-radius:5px;background:color-mix(in srgb,var(--mut) 55%,transparent)}
.an-o.key{background:var(--ok-soft)}
.an-o.key b,.an-o.key .ax-ic{color:var(--ok)}
.an-o.key .an-bar i{background:var(--ok)}
.an-q.sus .an-o:not(.key) .an-bar i{background:color-mix(in srgb,var(--warn) 70%,transparent)}
@container (min-width:640px){.an-opts{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}}
@container (min-width:980px){.an-grid{grid-template-columns:minmax(0,1fr) 320px}.an-side{position:sticky;top:84px}}
@container (max-width:700px){.an-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@container (max-width:420px){.an-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.drawer.an-drawer .m-b{background:var(--canvas-2)}
@media (max-width:1100px){.rs-tools{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.rs-tools .rs-q{grid-column:1/-1}}
@media (max-width:900px){.rs-two{grid-template-columns:minmax(0,1fr)}}
@media (max-width:759px){
  .rs-tools .rs-t{grid-column:1/-1}
  .rs-sum>div{padding:8px 10px}.rs-sum b{font-size:18px}.rs-sum span{font-size:11px}
  .rs-mini{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rs-tq{width:100%}
  .an-o{grid-template-columns:20px minmax(0,1fr) 64px 14px;gap:8px}
}
`);
})();
