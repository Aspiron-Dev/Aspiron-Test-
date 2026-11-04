/* =====================================================================
   Medium (English / हिंदी) — shared bits for the modules. Loaded after cx/ui.js, before the modules.
   A series is 'en' (English only) or 'bi' (English + हिंदी: the store asks the medium at Buy).
   A test has Hindi when every question has Hindi text ("ready") saved after the last change of the English
   questions ("fresh"); otherwise Hindi-medium students get the whole test in English.
   Server: cbt_admin_lang overview | test_get | test_set | test_clear | series_set | student_get | student_set | orders
   (supabase_v41_medium.sql)
   Exposes: AX.lang.load(force) · mode(seriesId) · test(testId) · state(testId) · pill(testId) · NAME · setSeries(id, mode)
   ===================================================================== */
(function () {
'use strict';
const { ui: UI } = AX;
let LAST = { ok: false, series: {}, tests: {} };
const NAME = { en: 'English', hi: 'हिंदी' };

async function load(force) {
  const r = await AX.cache.get('lang', () => AX.api.call('cbt_admin_lang', 'overview'), 60000, force);
  if (r && r.ok) LAST = { ok: true, series: r.series || {}, tests: r.tests || {} };
  else LAST = { ok: false, error: (r && r.error) || 'server', series: {}, tests: {} };
  return LAST;
}
const mode = id => LAST.series[id] === 'bi' ? 'bi' : 'en';
const test = id => LAST.tests[id] || null;
// 'none' | 'ready' | 'partial' | 'stale'
function state(id) {
  const t = test(id);
  if (!t || !t.done) return 'none';
  if (!t.fresh) return 'stale';
  return t.ready && t.done ? 'ready' : 'partial';
}
function pill(id) {
  const t = test(id), s = state(id);
  if (s === 'none') return '';
  if (s === 'ready') return UI.pill('हिंदी ✓', 'ok');
  if (s === 'stale') return UI.pill('हिंदी out of date', 'warn');
  return UI.pill('हिंदी ' + t.done + '/' + t.n, 'warn');
}
async function setSeries(id, m) {
  const r = await AX.api.call('cbt_admin_lang', 'series_set', { id, mode: m });
  if (r.ok) { LAST.series[id] = m; AX.cache.drop('lang'); }
  return r;
}
AX.lang = { load, mode, test, state, pill, setSeries, NAME, last: () => LAST };
AX.langMissing = r => r && (r.error === 'missing' || /cbt_admin_lang/.test(String(r.detail || r.message || '')));
})();
