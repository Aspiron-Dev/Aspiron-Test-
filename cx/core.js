/* =====================================================================
   Aspiron Control — core
   AX.h (safe HTML) · AX.api (Supabase RPC + session) · AX.me / AX.can (permissions)
   AX.mod (modules) · router · AX.cache · events · AX.fmt · AX.u utilities · AX.icon
   Every module file registers itself with AX.mod({...}); see cx/README.md.
   ===================================================================== */
(function () {
'use strict';
const CFG = window.CBT_CONFIG || {};
const AX = window.AX = window.AX || {};
AX.cfg = CFG;
AX.url = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');

/* ---------- safe HTML: AX.h`<b>${name}</b>` escapes every value; AX.raw() / nested AX.h are kept ---------- */
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const esc = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ESC[c]);
const val = v => v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v);
AX.esc = esc;
AX.raw = s => new Safe(String(s == null ? '' : s));
AX.h = (strs, ...vals) => { let o = strs[0]; for (let i = 0; i < vals.length; i++) o += val(vals[i]) + strs[i + 1]; return new Safe(o); };
AX.join = (arr, fn) => new Safe((arr || []).map((x, i) => val(fn ? fn(x, i) : x)).join(''));
AX.isSafe = v => v instanceof Safe;
AX.html = v => val(v);                               // to a string (for innerHTML)
AX.$ = (s, r) => (r || document).querySelector(s);
AX.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
AX.set = (el, v) => { if (typeof el === 'string') el = AX.$(el); if (el) el.innerHTML = val(v); return el; };

/* ---------- events (data-act) ---------- */
// AX.act(root, {save(el, ev){…}, open(el){…}}) — one delegated listener; elements carry data-act="save".
// Use data-act on inputs too with type 'input' / 'change'.
AX.act = (root, map, type = 'click') => {
  if (!root) return;
  root.addEventListener(type, ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = map[el.dataset.act];
    if (!fn) return;
    if (type === 'click' && el.tagName === 'A' && (el.getAttribute('href') || '#') === '#') ev.preventDefault();
    fn(el, ev);
  });
};
const BUS = {};
AX.on = (name, fn) => { (BUS[name] = BUS[name] || []).push(fn); return () => { BUS[name] = BUS[name].filter(f => f !== fn); }; };
AX.emit = (name, data) => { (BUS[name] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } }); };

/* ---------- storage (never throws) ---------- */
AX.ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
AX.ss = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
};

/* ---------- session ---------- */
// token: "as1.…" (v35 session) or, before supabase_v35_admin_team.sql is run, the owner password itself (legacy).
const S = AX.session = {
  token: '', legacy: false, me: null, id: null,
  load() {
    const t = AX.ls.get('cx_tok', null) || AX.ss.get('cx_tok', null);
    if (t && t.token) { S.token = t.token; S.legacy = !!t.legacy; S.me = t.me || null; }
    return !!S.token;
  },
  save(remember) {
    const t = { token: S.token, legacy: S.legacy, me: S.me };
    AX.ls.del('cx_tok'); AX.ss.del('cx_tok');
    // a legacy password is never kept beyond this tab
    // the legacy token IS the admin password: it stays in memory only (a reload asks for it again)
    if (S.legacy) return;
    if (remember) AX.ls.set('cx_tok', t); else AX.ss.set('cx_tok', t);
  },
  clear() { S.token = ''; S.legacy = false; S.me = null; S.id = null; AX.ls.del('cx_tok'); AX.ss.del('cx_tok'); AX.cache.clear(); }
};
AX.MODS = ['students', 'payments', 'content', 'results', 'integrity', 'store', 'promotions', 'messaging', 'reviews'];
AX.MOD_INFO = {
  students:   { t: 'Students',            d: 'Student list, profiles, access codes, devices, series unlocks, access requests' },
  payments:   { t: 'Payments',            d: 'Money received, adding old payments, payment history' },
  content:    { t: 'Tests & content',     d: 'Series, folders, tests, questions, files, PYQ bank, question reports' },
  results:    { t: 'Results & analytics', d: 'Results, live test monitor, test analytics, insights' },
  integrity:  { t: 'Integrity',           d: 'Cheating tags and account suspensions' },
  store:      { t: 'Store & orders',      d: 'Orders, payment verification, store items, layout and settings' },
  promotions: { t: 'Promotions',          d: 'Promotion links, commissions and payouts' },
  messaging:  { t: 'Messaging',           d: 'Banners, notices and phone notifications' },
  reviews:    { t: 'Reviews',             d: 'Ratings and reviews on the store' }
};
// AX.can('students') → may view; AX.can('students','manage') → may change. The owner can do everything.
AX.can = (mod, lvl = 'view') => {
  const me = S.me; if (!me) return false;
  if (me.owner) return true;
  if (mod === 'owner') return false;
  if (mod === 'any') return true;
  const p = (me.perms || {})[mod];
  return p === 'manage' || (p === 'view' && lvl === 'view');
};
AX.isOwner = () => !!(S.me && S.me.owner);

/* ---------- API ---------- */
const AUTH_ERR = ['invalid', 'signed_out', 'expired', 'disabled', 'not_set'];
AX.api = {
  // raw PostgREST RPC. args = the function's named parameters. Adds p_pw unless auth:false.
  async rpc(fn, args, opt = {}) {
    if (!AX.url) return { ok: false, error: 'config' };
    const body = Object.assign({}, args || {});
    if (opt.auth !== false) body.p_pw = S.token;
    let res;
    try {
      res = await fetch(AX.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: CFG.SUPABASE_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) { return { ok: false, error: 'network' }; }
    let j = null;
    try { j = await res.json(); } catch (e) { j = null; }
    if (!res.ok) {
      if (res.status === 404 || (j && j.code === 'PGRST202')) return { ok: false, error: 'missing', fn };
      return { ok: false, error: 'server', status: res.status, detail: j && (j.message || j.hint) || '' };
    }
    if (j == null || typeof j !== 'object') return { ok: true, data: j };
    if (j.ok === false && opt.auth !== false && AUTH_ERR.includes(j.error)) AX.emit('auth:lost', j.error);
    if (j.ok === false && j.error === 'locked' && opt.auth !== false) AX.emit('auth:lost', 'locked');
    return j;
  },
  // cbt_admin-style call: AX.api.call('cbt_admin_store', 'get', {…})
  call(fn, action, data, extra) { return AX.api.rpc(fn, Object.assign({ p_action: action, p_data: data || {} }, extra || {})); },
  // the main admin function
  admin(action, data) { return AX.api.call('cbt_admin', action, data); },
  // phone notification through the send-push Edge Function (the admin session/password is checked there).
  // Sent page by page (limit / after), so a long list of phones is never cut off part-way; onStep(totals) after each page.
  // payload.series = test series ids → only those students (needs the v2 function; refused before anything is sent otherwise).
  async push(payload, onStep) {
    if (payload && payload.series && payload.series.length) {
      const inf = await AX.api.pushInfo();
      if (!inf.ok || inf.v !== 2) return { ok: false, error: inf.error === 'network' ? 'network' : 'old_push' };
    }
    const tot = { ok: true, sent: 0, failed: 0, removed: 0, total: 0, codes: {}, sample: [], hint: '' };
    let after = '';
    for (let page = 0; page < 1000; page++) {
      let r, j = null;
      try {
        r = await fetch(AX.url + '/functions/v1/Send-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY },
          body: JSON.stringify(Object.assign({ pw: S.token }, payload, { limit: 150, after }))
        });
        try { j = await r.json(); } catch (e) {}
      } catch (e) { return page ? Object.assign(tot, { ok: false, partial: true, error: 'network' }) : { ok: false, error: 'network' }; }
      if (!r.ok || !j || j.ok === false) {
        const e = { ok: false, error: r.status === 404 ? 'missing' : (j && j.error) || 'server', detail: j && (j.detail || j.message) };
        return page ? Object.assign(tot, e, { partial: true }) : e;
      }
      tot.sent += j.sent || 0; tot.failed += j.failed || 0; tot.removed += j.removed || 0; tot.total += j.total || 0;
      Object.keys(j.codes || {}).forEach(k => { tot.codes[k] = (tot.codes[k] || 0) + j.codes[k]; });
      (j.sample || []).forEach(s => { if (tot.sample.length < 3) tot.sample.push(s); });
      if (j.hint) tot.hint = j.hint;
      if (onStep) onStep(tot);
      if (j.v !== 2 || j.done !== false || !j.next) return tot;    // an old function sends everything in one call
      after = j.next;
    }
    return tot;
  },
  // is the send-push function the new one (v: 2), and does it use the same key as config.js? (no password needed)
  async pushInfo() {
    try {
      const r = await fetch(AX.url + '/functions/v1/Send-push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY },
        body: JSON.stringify({ mode: 'info', vapid: CFG.VAPID_PUBLIC || '' })
      });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (r.status === 404) return { ok: false, error: 'missing' };
      return j && j.ok ? j : { ok: false, error: 'old' };
    } catch (e) { return { ok: false, error: 'network' }; }
  }
};
// a readable sentence for any error code
AX.errText = (r, what) => {
  const e = r && r.error;
  const map = {
    network: 'No internet connection. Check the connection and try again.',
    forbidden: 'You do not have permission for this. Ask the owner for access.',
    missing: 'This part of the database is not set up yet' + (what ? ' (' + what + ')' : '') + '. Run the SQL file mentioned in README.md.',
    server: 'The server could not do this' + (r && r.detail ? ': ' + r.detail : '.'),
    config: 'The Supabase address is missing in config.js.',
    invalid: 'Wrong password.', locked: 'Too many wrong attempts. Try again in 15 minutes.',
    signed_out: 'You were signed out.', expired: 'Your sign-in expired. Please sign in again.',
    disabled: 'This team account is paused by the owner.', not_set: 'The admin password is not set yet.',
    bad_request: 'The server rejected this request' + (r && r.detail ? ': ' + r.detail : '.')
  };
  return map[e] || (e ? 'Could not save (' + e + ').' : 'Something went wrong.');
};

/* ---------- cache: AX.cache.get('students', () => AX.api.admin('students'), 30000) ---------- */
const C = new Map();
AX.cache = {
  async get(key, loader, ttl = 30000, force = false) {
    const c = C.get(key);
    if (!force && c && (Date.now() - c.at < ttl)) return c.p;
    const p = Promise.resolve().then(loader).then(r => { if ((!r || r.ok === false) && C.get(key) && C.get(key).p === p) C.delete(key); return r; });
    C.set(key, { at: Date.now(), p });
    return p;
  },
  peek(key) { const c = C.get(key); return c ? c.p : null; },
  drop(prefix) { [...C.keys()].forEach(k => { if (k === prefix || k.startsWith(prefix + ':')) C.delete(k); }); },
  clear() { C.clear(); }
};
// shared data many modules use
AX.data = {
  catalog(force) {
    return AX.cache.get('catalog', async () => {
      const [r, p] = await Promise.all([AX.api.admin('catalog'), AX.api.call('cbt_admin_practice', 'list')]);
      if (r.ok) r.practice = new Set(((p && p.ok && p.ids) || []).map(String));
      return r;
    }, 60000, force);
  },
  students(force) { return AX.cache.get('students', () => AX.api.admin('students'), 30000, force); },
  results(force) { return AX.cache.get('results', () => AX.api.admin('results'), 30000, force); },
  payments(force) { return AX.cache.get('payments', () => AX.api.call('cbt_admin_payments', 'get'), 30000, force); },
  store(force) { return AX.cache.get('store', () => AX.api.call('cbt_admin_store', 'get'), 30000, force); }
};
// module-specific CSS, injected once: AX.css('orders', '.ocard{…}')
AX.css = (id, text) => { if (document.getElementById('css-' + id)) return; const s = document.createElement('style'); s.id = 'css-' + id; s.textContent = text; document.head.appendChild(s); };

/* ---------- modules & router ---------- */
// AX.mod({ id, title, icon, group, order, perm, nav:true, tabs:[{id,title,perm?}], render(ctx), search(q), attention(), badge() })
AX.mods = {};
AX.creates = [];   // the "+" menu: {label, icon, perm:[mod, lvl], run()}
AX.actions = [];   // command palette commands: {label, icon, perm:[mod, lvl], run()}
AX.mod = m => { AX.mods[m.id] = Object.assign({ nav: true, order: 50, perm: 'any' }, m); AX.emit('mods:changed'); return AX.mods[m.id]; };
AX.allowed = m => !m.perm || m.perm === 'any' ? true : m.perm === 'owner' ? AX.isOwner() : AX.can(m.perm);
AX.parseHash = () => {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = {}; new URLSearchParams(qs || '').forEach((v, k) => q[k] = v);
  return { mod: parts[0] || 'home', parts: parts.slice(1), q };
};
AX.go = (path, q) => {
  const qs = q ? '?' + new URLSearchParams(q).toString() : '';
  const h = '#/' + String(path || '').replace(/^#?\/?/, '') + qs;
  if (location.hash === h) AX.emit('route'); else location.hash = h;
};
AX.link = (path, q) => '#/' + String(path).replace(/^#?\/?/, '') + (q ? '?' + new URLSearchParams(q).toString() : '');

/* ---------- formatting ---------- */
const IN = 'en-IN';
AX.fmt = {
  inr: n => '₹' + Math.round(Number(n) || 0).toLocaleString(IN),
  num: n => (Number(n) || 0).toLocaleString(IN),
  pct: (a, b) => b ? Math.round(a * 100 / b) + '%' : '—',
  short: n => { n = Number(n) || 0; return n >= 1e7 ? (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); },
  ms: t => t == null || t === '' ? null : typeof t === 'number' ? t : /^\d+$/.test(String(t)) ? Number(t) : Date.parse(t),
  date: t => { t = AX.fmt.ms(t); return t ? new Date(t).toLocaleDateString(IN, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; },
  day: t => { t = AX.fmt.ms(t); return t ? new Date(t).toLocaleDateString(IN, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'; },
  time: t => { t = AX.fmt.ms(t); return t ? new Date(t).toLocaleTimeString(IN, { hour: 'numeric', minute: '2-digit' }) : '—'; },
  dt: t => { t = AX.fmt.ms(t); if (!t) return '—'; const d = new Date(t), y = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString(IN, { weekday: 'short', day: 'numeric', month: 'short', year: y ? 'numeric' : undefined }) + ' · ' + d.toLocaleTimeString(IN, { hour: 'numeric', minute: '2-digit' }); },
  ago: t => {
    t = AX.fmt.ms(t); if (!t) return 'never';
    const s = Math.round((Date.now() - t) / 1000), f = Math.abs(s), fut = s < 0;
    const o = f < 45 ? 'just now' : f < 3600 ? Math.round(f / 60) + ' min' : f < 86400 ? Math.round(f / 3600) + ' h' : f < 86400 * 30 ? Math.round(f / 86400) + ' d' : AX.fmt.date(t);
    return o === 'just now' || o.includes(' ') && /\d{4}/.test(o) ? o : fut ? 'in ' + o : o + ' ago';
  },
  dur: sec => { sec = Math.round(Number(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + 'h ' + m + 'm' : m ? m + 'm ' + (s ? s + 's' : '') : s + 's'; },
  bytes: b => { b = Number(b) || 0; return b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'; },
  plural: (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's')),
  mobile: m => { m = String(m || ''); return m.length === 10 ? m.slice(0, 5) + ' ' + m.slice(5) : m; }
};

/* ---------- utilities ---------- */
AX.u = {
  debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  uid: () => Math.random().toString(36).slice(2, 10),
  initials: n => { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); },
  hue(seed) { let h = 0; for (const c of String(seed || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ['#14b8a6', '#6366f1', '#0ea5e9', '#d946ef', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#0891b2'][h % 10]; },
  async copy(text) {
    try { await navigator.clipboard.writeText(String(text)); return true; } catch (e) {
      const t = document.createElement('textarea'); t.value = String(text); t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok;
    }
  },
  download(name, data, mime = 'text/plain;charset=utf-8') {
    const b = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  },
  // CSV: cells that start with = + - @ (or tab/CR) are prefixed with ' so spreadsheets never run them as formulas
  csv(rows) {
    const cell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  },
  csvDownload(name, rows) { AX.u.download(name, AX.u.csv(rows), 'text/csv;charset=utf-8'); },
  // image → data URL (JPEG/WebP), longest side ≤ max px
  compressImage(file, { max = 1280, quality = 0.82, type = 'image/jpeg' } = {}) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('read'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image'));
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h));
          w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d'); if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
          x.drawImage(img, 0, 0, w, h); resolve(c.toDataURL(type, quality));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  },
  fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read')); r.readAsDataURL(file); }); },
  pickFile(accept, multiple) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; if (multiple) i.multiple = true;
      i.onchange = () => res(multiple ? [...i.files] : i.files[0] || null); i.click();
    });
  },
  // device label for the sessions list, e.g. "Chrome · Android"
  device() {
    const u = navigator.userAgent || '';
    const os = /Android/i.test(u) ? 'Android' : /iPhone|iPad|iPod/i.test(u) ? 'iPhone / iPad' : /Windows/i.test(u) ? 'Windows' : /Mac OS X/i.test(u) ? 'Mac' : /CrOS/i.test(u) ? 'Chromebook' : /Linux/i.test(u) ? 'Linux' : 'Device';
    const br = /EdgA?\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /FBAN|FBAV|Instagram/.test(u) ? 'In-app browser' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
    const app = window.matchMedia && matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
    return br + ' · ' + os + app;
  },
  // links for messaging a student (mobile = 10 digits)
  wa: (mobile, text) => 'https://wa.me/91' + String(mobile || '').replace(/\D/g, '').slice(-10) + (text ? '?text=' + encodeURIComponent(text) : ''),
  tg: mobile => 'https://t.me/+91' + String(mobile || '').replace(/\D/g, '').slice(-10),
  sms: (mobile, text) => 'sms:+91' + String(mobile || '').replace(/\D/g, '').slice(-10) + (text ? '?body=' + encodeURIComponent(text) : ''),
  tel: mobile => 'tel:+91' + String(mobile || '').replace(/\D/g, '').slice(-10),
  site: () => String(CFG.SHORT_URL || '').replace(/\/?$/, '/'),
  storeUrl: () => AX.u.site() + 'store.html'
};

/* ---------- icons (one outline family, 24px grid) ---------- */
const I = AX.ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/><path d="M16 14h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  shieldCheck: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/>',
  store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  megaphone: '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  moreV: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>', chevL: '<path d="m15 18-6-6 6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>', chevU: '<path d="m18 15-6-6-6 6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>', arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2.5"/><path d="M8 21h8M12 17v4"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.6A8 8 0 1 1 21 12z"/>',
  whatsapp: '<path d="M3.5 20.5l1.3-4.3A8.4 8.4 0 1 1 8 19.3z"/><path d="M9.2 8.6c.2 2.3 2 4.3 4.3 4.9l1-1 1.8.8c-.2.9-1 1.5-1.9 1.4A6.3 6.3 0 0 1 8.2 8.4c.1-.9.8-1.6 1.7-1.7l.7 1.8z"/>',
  telegram: '<path d="M21.5 4.5 2.5 11.8l6.2 2.1 2.3 6.6 3.4-4.1 5 3.7z"/><path d="m8.7 13.9 9.3-6.7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 4.1-5M9.9 4.2A9 9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  crown: '<path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  team: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.5"/><circle cx="19" cy="10" r="2.5"/><path d="M7 21v-2a5 5 0 0 1 10 0v2M1 21v-1.5A3.5 3.5 0 0 1 4.5 16M23 21v-1.5a3.5 3.5 0 0 0-3.5-3.5"/>',
  device: '<rect x="2" y="4" width="14" height="10" rx="2"/><rect x="15" y="9" width="7" height="12" rx="2"/><path d="M5 18h7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
  drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 15h1.5a1.5 1.5 0 0 0 0-3H8v5M13 12v5h1a2.5 2.5 0 0 0 0-5zM18 12h-2v5M16 14.5h1.5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3z"/>',
  play: '<path d="M6 4v16l14-8z"/>', pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  rupee: '<path d="M6 3h12M6 8h12M14 21 6 13h3a5 5 0 0 0 0-10"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v4h-3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>'
};
AX.icon = (name, size, cls) => AX.raw('<svg class="ax-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + ' aria-hidden="true">' + (I[name] || I.info) + '</svg>');

/* ---------- theme ---------- */
AX.theme = {
  get() { return document.documentElement.dataset.theme || 'dark'; },
  set(t) { document.documentElement.dataset.theme = t; AX.ls.set('cx_theme', t); const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#060a13' : '#f3f6fa'; AX.emit('theme', t); },
  toggle() { AX.theme.set(AX.theme.get() === 'dark' ? 'light' : 'dark'); }
};
})();
