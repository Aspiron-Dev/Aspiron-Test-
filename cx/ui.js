/* =====================================================================
   Aspiron Control — UI components
   toast · modal / sheet · drawer · confirm · prompt · menu · date-time picker · form helpers
   kpi · states (empty / error / no access / skeleton) · avatar · pill · charts
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join } = AX;
const UI = AX.ui = {};
const isPhone = () => matchMedia('(max-width:759px)').matches;
UI.isPhone = isPhone;

/* ---------- toast ---------- */
UI.toast = (msg, opt = {}) => {
  let box = document.getElementById('ax-toasts');
  if (!box) { box = document.createElement('div'); box.id = 'ax-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const tone = opt.tone || (opt.bad ? 'bad' : 'ok');
  const t = document.createElement('div');
  t.className = 'toast ' + tone;
  t.innerHTML = AX.html(h`<span class="ti">${icon(tone === 'bad' ? 'alert' : tone === 'warn' ? 'info' : 'check', 16)}</span><div class="tb">${msg}</div>${opt.action ? h`<button class="ta">${opt.action.label}</button>` : ''}`);
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  if (opt.action) t.querySelector('.ta').onclick = () => { close(); opt.action.fn(); };
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(close, opt.ms || (opt.action ? 6000 : 3200));
  return close;
};
UI.err = (r, what) => UI.toast(AX.errText(r, what), { tone: 'bad', ms: 5000 });

/* ---------- overlay stack ---------- */
const stack = [];
function overlay(cls, inner, opt) {
  const ov = document.createElement('div');
  ov.className = 'ov ' + (cls || '');
  ov.innerHTML = AX.html(inner);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const item = { ov, opt, close: null };
  const close = (v) => {
    if (item.closed) return; item.closed = true;
    const i = stack.indexOf(item); if (i >= 0) stack.splice(i, 1);
    ov.classList.add('out'); setTimeout(() => ov.remove(), 160);
    if (!stack.length) document.body.style.overflow = '';
    if (opt && opt.onClose) opt.onClose(v);
    if (item.focus && item.focus.focus) try { item.focus.focus(); } catch (e) {}
  };
  item.close = close; item.focus = document.activeElement;
  ov.addEventListener('mousedown', e => { if (e.target === ov && !(opt && opt.sticky)) close(); });
  ov.addEventListener('click', e => { const b = e.target.closest('[data-close]'); if (b && ov.contains(b)) close(); });
  stack.push(item);
  setTimeout(() => { const f = ov.querySelector('[autofocus],input:not([type=hidden]):not([disabled]),select,textarea,button.pri'); if (f && !isPhone()) f.focus(); }, 60);
  return item;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (!(top.opt && top.opt.sticky)) { e.preventDefault(); top.close(); } }
});
UI.closeAll = () => stack.slice().forEach(s => s.close());
UI.top = () => stack[stack.length - 1] || null;

/* ---------- modal: UI.modal({title, sub, body, foot, size:'wide'|'xwide'|'narrow', sheet:true, sticky, onOpen(el, close), onClose}) ---------- */
UI.modal = (o) => {
  const foot = o.foot === undefined ? h`<span class="sp"></span><button class="btn ghost" data-close>Close</button>` : o.foot;
  const inner = h`<div class="modal ${o.size || ''}" role="dialog" aria-modal="true" aria-label="${o.title || ''}">
    ${o.title != null ? h`<div class="m-h"><div class="grow">${o.icon ? h`<div class="row gap6">${o.icon}<h2>${o.title}</h2></div>` : h`<h2>${o.title}</h2>`}${o.sub ? h`<div class="m-s">${o.sub}</div>` : ''}</div><button class="ibtn sm" data-close aria-label="Close">${icon('x')}</button></div>` : ''}
    <div class="m-b">${o.body || ''}</div>${foot ? h`<div class="m-f">${foot}</div>` : ''}</div>`;
  const it = overlay(o.sheet === false ? '' : 'sheetable', inner, o);
  const el = it.ov.querySelector('.modal');
  const api = { el, body: el.querySelector('.m-b'), close: it.close, set(body) { AX.set(api.body, body); }, foot(f) { const x = el.querySelector('.m-f'); if (x) AX.set(x, f); } };
  if (o.onOpen) o.onOpen(el, it.close, api);
  return api;
};
/* ---------- drawer (right side; full screen on phones) ---------- */
UI.drawer = (o) => {
  const inner = h`<div class="drawer ${o.size || ''}" role="dialog" aria-modal="true" aria-label="${o.title || ''}">
    <div class="m-h"><div class="grow">${o.head || h`<h2>${o.title}</h2>${o.sub ? h`<div class="m-s">${o.sub}</div>` : ''}`}</div><button class="ibtn sm" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="m-b">${o.body || ''}</div>${o.foot ? h`<div class="m-f">${o.foot}</div>` : ''}</div>`;
  const it = overlay('drawer-ov', inner, o);
  const el = it.ov.querySelector('.drawer');
  const api = { el, body: el.querySelector('.m-b'), close: it.close, set(body) { AX.set(api.body, body); }, head(x) { AX.set(el.querySelector('.m-h .grow'), x); } };
  if (o.onOpen) o.onOpen(el, it.close, api);
  return api;
};

/* ---------- confirm: await UI.confirm({title, text, yes, tone:'danger', reason:'optional'|'required', typeWord:'DELETE'}) → false | {reason} ---------- */
UI.confirm = (o) => new Promise(res => {
  let done = false;
  const m = UI.modal({
    title: o.title, size: 'narrow', icon: o.tone === 'danger' ? h`<span class="pill bad" style="height:28px;width:28px;padding:0;justify-content:center">${icon('alert', 15)}</span>` : null,
    body: h`${o.text ? h`<p class="tx2" style="line-height:1.6">${o.text}</p>` : ''}
      ${o.reason ? h`<div class="fld mt16"><label>${o.reasonLabel || 'Reason'}${o.reason === 'optional' ? ' (optional)' : ''}</label><textarea class="inp" id="cf-reason" rows="3" maxlength="300" placeholder="${o.reasonPh || ''}"></textarea></div>` : ''}
      ${o.typeWord ? h`<div class="fld mt16"><label>Type <b class="mono">${o.typeWord}</b> to confirm</label><input class="inp" id="cf-word" autocomplete="off"></div>` : ''}`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>${o.no || 'Cancel'}</button><button class="btn ${o.tone === 'danger' ? 'danger solid' : 'pri'}" id="cf-yes">${o.yes || 'Confirm'}</button>`,
    onClose() { if (!done) res(false); },
    onOpen(el, close) {
      const yes = el.querySelector('#cf-yes'), word = el.querySelector('#cf-word'), rs = el.querySelector('#cf-reason');
      const check = () => { yes.disabled = (word && word.value.trim().toUpperCase() !== String(o.typeWord).toUpperCase()) || (o.reason === 'required' && rs && !rs.value.trim()); };
      if (word) word.addEventListener('input', check); if (rs) rs.addEventListener('input', check); check();
      yes.onclick = () => { done = true; res({ reason: rs ? rs.value.trim() : '' }); close(true); };
    }
  });
});
/* ---------- prompt: await UI.prompt({title, label, value, type, placeholder, hint, required}) → string | null ---------- */
UI.prompt = (o) => new Promise(res => {
  let done = false;
  UI.modal({
    title: o.title, size: 'narrow',
    body: h`<div class="fld"><label for="pr-in">${o.label || ''}</label>${o.multiline ? h`<textarea class="inp" id="pr-in" rows="4" placeholder="${o.placeholder || ''}">${o.value || ''}</textarea>` : h`<input class="inp" id="pr-in" type="${o.type || 'text'}" value="${o.value == null ? '' : o.value}" placeholder="${o.placeholder || ''}" ${o.max ? raw('maxlength="' + Number(o.max) + '"') : ''}>`}${o.hint ? h`<div class="hint">${o.hint}</div>` : ''}</div>`,
    foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" id="pr-ok">${o.yes || 'Save'}</button>`,
    onClose() { if (!done) res(null); },
    onOpen(el, close) {
      const i = el.querySelector('#pr-in'), go = () => { const v = i.value.trim(); if (o.required !== false && !v) { i.classList.add('bad'); i.focus(); return; } done = true; res(v); close(true); };
      el.querySelector('#pr-ok').onclick = go;
      if (!o.multiline) i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      setTimeout(() => { i.focus(); if (i.select) i.select(); }, 80);
    }
  });
});

/* ---------- popover menu: UI.menu(anchor, [{label, icon, fn, tone:'danger', href, sep:true, head:'Title'}]) ---------- */
UI.menu = (anchor, items) => {
  document.querySelectorAll('.pop').forEach(p => p.remove());
  const p = document.createElement('div');
  p.className = 'pop'; p.setAttribute('role', 'menu');
  p.innerHTML = AX.html(join(items.filter(Boolean), (it, i) => it.sep ? raw('<hr>') : it.head ? h`<div class="ph">${it.head}</div>`
    : it.href ? h`<a href="${it.href}" target="${it.target || '_blank'}" rel="noopener" data-i="${i}" class="${it.tone || ''}">${it.icon ? icon(it.icon, 17) : ''}<span class="grow">${it.label}</span></a>`
    : h`<button data-i="${i}" class="${it.tone || ''}" role="menuitem">${it.icon ? icon(it.icon, 17) : ''}<span class="grow">${it.label}</span>${it.hint ? h`<span class="xs faint">${it.hint}</span>` : ''}</button>`));
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
  let x = Math.min(r.right - pw, innerWidth - pw - 12); x = Math.max(12, x);
  let y = r.bottom + 6; if (y + ph > innerHeight - 12) y = Math.max(12, r.top - ph - 6);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  const list = items.filter(Boolean);
  const off = e => { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  p.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = list[+b.dataset.i]; p.remove(); document.removeEventListener('mousedown', off, true); if (it && it.fn) it.fn(); });
  return p;
};

/* ---------- date & time picker ----------
   await UI.pickDateTime({value: ms|null, title, date:true, time:true, min: ms, presets:[{label, ms}]}) → ms | null (cleared) | undefined (cancel)
   Field helper: UI.dtField({name, value, label, placeholder, time:true, clear:true}) inside a form; after render call UI.wire(root).
   Read the value with AX.f.read(form)[name] → ms number or null. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
UI.pickDateTime = (o = {}) => new Promise(res => {
  const wantTime = o.time !== false, wantDate = o.date !== false;
  const now = new Date();
  let cur = o.value ? new Date(o.value) : null;
  let sel = cur ? new Date(cur) : (() => { const d = new Date(); d.setSeconds(0, 0); if (wantTime) { d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); } else d.setHours(0, 0, 0, 0); return d; })();
  let view = new Date(sel.getFullYear(), sel.getMonth(), 1);
  let done = false;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const summary = () => h`${icon(wantTime ? 'clock' : 'calendar', 18)}<div class="grow"><div class="xs mut">Selected</div><b>${wantTime ? AX.fmt.dt(sel.getTime()) : AX.fmt.day(sel.getTime()) + ', ' + sel.getFullYear()}</b></div>`;
  const calHtml = () => {
    const y = view.getFullYear(), m = view.getMonth(), first = new Date(y, m, 1), start = (first.getDay() + 6) % 7;
    const days = []; const d0 = new Date(y, m, 1 - start);
    for (let i = 0; i < 42; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); days.push(d); }
    const minDay = o.min ? new Date(new Date(o.min).setHours(0, 0, 0, 0)) : null;
    return h`<div class="cal-h"><b>${MONTHS[m]} ${y}</b><button class="ibtn sm line" data-nav="-1" aria-label="Previous month">${icon('chevL', 16)}</button><button class="ibtn sm line" data-nav="1" aria-label="Next month">${icon('chevR', 16)}</button></div>
      <div class="cal-g">${join(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], x => h`<span class="dw">${x}</span>`)}${join(days, d => h`<button type="button" data-day="${d.getTime()}" class="${d.getMonth() !== m ? 'o' : ''} ${sameDay(d, now) ? 'td' : ''} ${sameDay(d, sel) ? 'on' : ''}" ${minDay && d < minDay ? raw('disabled') : ''}>${d.getDate()}</button>`)}</div>`;
  };
  const timeHtml = () => {
    const H = sel.getHours(), hh = H % 12 || 12, mm = sel.getMinutes(), ap = H >= 12 ? 'PM' : 'AM';
    const mins = []; for (let i = 0; i < 60; i += 5) mins.push(i); if (!mins.includes(mm)) { mins.push(mm); mins.sort((a, b) => a - b); }
    return h`<div class="tl">Time</div><div class="cols">
      <div class="cl" data-col="h">${join([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], x => h`<button type="button" data-h="${x}" class="${x === hh ? 'on' : ''}">${x}</button>`)}</div>
      <div class="cl" data-col="m">${join(mins, x => h`<button type="button" data-m="${x}" class="${x === mm ? 'on' : ''}">${String(x).padStart(2, '0')}</button>`)}</div>
      <div class="cl" data-col="a">${join(['AM', 'PM'], x => h`<button type="button" data-a="${x}" class="${x === ap ? 'on' : ''}">${x}</button>`)}</div></div>`;
  };
  const presets = o.presets || (wantTime ? (() => {
    const at = (dd, H, M) => { const d = new Date(); d.setDate(d.getDate() + dd); d.setHours(H, M, 0, 0); return d.getTime(); };
    return [{ label: 'Now', ms: Date.now() }, { label: 'Today 9 PM', ms: at(0, 21, 0) }, { label: 'Tomorrow 9 AM', ms: at(1, 9, 0) }, { label: 'Tomorrow 6 PM', ms: at(1, 18, 0) }, { label: 'Next week', ms: at(7, 9, 0) }];
  })() : (() => { const at = dd => { const d = new Date(); d.setDate(d.getDate() + dd); d.setHours(0, 0, 0, 0); return d.getTime(); }; return [{ label: 'Today', ms: at(0) }, { label: 'Tomorrow', ms: at(1) }, { label: 'In a week', ms: at(7) }, { label: 'In a month', ms: at(30) }]; })());
  const m = UI.modal({
    title: o.title || (wantTime ? 'Choose date & time' : 'Choose a date'), size: wantTime ? 'wide' : 'narrow',
    body: h`<div class="dtp-sum" id="dsum">${summary()}</div>
      <div class="dtp" style="${wantTime ? '' : 'grid-template-columns:minmax(0,1fr)'}"><div class="cal" id="dcal">${wantDate ? calHtml() : ''}</div>${wantTime ? h`<div class="tim" id="dtim">${timeHtml()}</div>` : ''}</div>
      <div class="dtp-q">${join(presets, (p, i) => h`<button type="button" data-p="${i}">${p.label}</button>`)}</div>`,
    foot: h`${o.clear !== false && cur ? h`<button class="btn ghost danger" id="dclr">${icon('trash', 15)} Clear</button>` : ''}<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" id="dok">${icon('check', 16)} Set</button>`,
    onClose() { if (!done) res(undefined); },
    onOpen(el, close) {
      const redraw = (scroll) => {
        AX.set(el.querySelector('#dsum'), summary());
        if (wantDate) AX.set(el.querySelector('#dcal'), calHtml());
        if (wantTime) { AX.set(el.querySelector('#dtim'), timeHtml()); if (scroll) el.querySelectorAll('.cl .on').forEach(b => b.scrollIntoView({ block: 'center' })); }
      };
      el.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.nav) { view.setMonth(view.getMonth() + Number(t.dataset.nav)); redraw(false); return; }
        if (t.dataset.day) { const d = new Date(Number(t.dataset.day)); sel.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); if (d.getMonth() !== view.getMonth()) view = new Date(d.getFullYear(), d.getMonth(), 1); redraw(false); return; }
        if (t.dataset.h) { const pm = sel.getHours() >= 12; let x = Number(t.dataset.h) % 12; sel.setHours(x + (pm ? 12 : 0)); redraw(false); return; }
        if (t.dataset.m) { sel.setMinutes(Number(t.dataset.m)); redraw(false); return; }
        if (t.dataset.a) { const H = sel.getHours(); if (t.dataset.a === 'PM' && H < 12) sel.setHours(H + 12); if (t.dataset.a === 'AM' && H >= 12) sel.setHours(H - 12); redraw(false); return; }
        if (t.dataset.p) { sel = new Date(presets[+t.dataset.p].ms); if (wantTime) sel.setSeconds(0, 0); view = new Date(sel.getFullYear(), sel.getMonth(), 1); redraw(true); return; }
      });
      el.querySelector('#dok').onclick = () => { done = true; res(sel.getTime()); close(true); };
      const c = el.querySelector('#dclr'); if (c) c.onclick = () => { done = true; res(null); close(true); };
      setTimeout(() => el.querySelectorAll('.cl .on').forEach(b => b.scrollIntoView({ block: 'center' })), 30);
    }
  });
});
UI.dtField = (o) => h`<div class="fld ${o.full ? 'full' : ''}">${o.label ? h`<label>${o.label}</label>` : ''}
  <button type="button" class="dtf" data-dtf="${o.name}" data-time="${o.time === false ? '0' : '1'}" data-clear="${o.clear === false ? '0' : '1'}" data-title="${o.title || ''}" data-ph="${o.placeholder || 'Not set'}" data-min="${o.min || ''}">
    ${icon(o.time === false ? 'calendar' : 'clock')}<span class="v ${o.value ? '' : 'ph'}">${o.value ? (o.time === false ? AX.fmt.day(o.value) + ', ' + new Date(Number(o.value)).getFullYear() : AX.fmt.dt(o.value)) : (o.placeholder || 'Not set')}</span>
    <span class="x ${o.value && o.clear !== false ? '' : 'hide'}" data-x="1" title="Clear">${icon('x', 14)}</span></button>
  <input type="hidden" name="${o.name}" value="${o.value || ''}">${o.hint ? h`<div class="hint">${o.hint}</div>` : ''}</div>`;
UI.setDt = (btn, ms) => {
  const inp = btn.parentElement.querySelector('input[name="' + btn.dataset.dtf + '"]');
  inp.value = ms ? String(ms) : '';
  const v = btn.querySelector('.v'), time = btn.dataset.time !== '0';
  v.textContent = ms ? (time ? AX.fmt.dt(ms) : AX.fmt.day(ms) + ', ' + new Date(ms).getFullYear()) : btn.dataset.ph;
  v.classList.toggle('ph', !ms);
  btn.querySelector('.x').classList.toggle('hide', !(ms && btn.dataset.clear !== '0'));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
};
// enhance fields inside root (date pickers, password eyes)
UI.wire = (root) => {
  if (!root || root.__wired) return; root.__wired = true;
  root.addEventListener('click', async e => {
    const x = e.target.closest('.dtf [data-x]');
    if (x) { e.preventDefault(); e.stopPropagation(); UI.setDt(x.closest('.dtf'), null); return; }
    const b = e.target.closest('.dtf'); if (b) {
      e.preventDefault();
      const cur = b.parentElement.querySelector('input[type=hidden]').value;
      const v = await UI.pickDateTime({ value: cur ? Number(cur) : null, time: b.dataset.time !== '0', clear: b.dataset.clear !== '0', title: b.dataset.title || undefined, min: b.dataset.min ? Number(b.dataset.min) : undefined });
      if (v !== undefined) UI.setDt(b, v);
      return;
    }
    const eye = e.target.closest('[data-eye]'); if (eye) { const i = eye.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; AX.set(eye, icon(i.type === 'password' ? 'eye' : 'eyeOff', 17)); }
  });
};

/* ---------- form helpers ---------- */
const F = AX.f = {};
const attrs = o => raw([o.required ? 'required' : '', o.max ? 'maxlength="' + Number(o.max) + '"' : '', o.min != null && o.type === 'number' ? 'min="' + Number(o.min) + '"' : '', o.step ? 'step="' + AX.esc(o.step) + '"' : '', o.inputmode ? 'inputmode="' + AX.esc(o.inputmode) + '"' : '', o.auto ? 'autocomplete="' + AX.esc(o.auto) + '"' : '', o.disabled ? 'disabled' : '', o.readonly ? 'readonly' : '', o.pattern ? 'pattern="' + AX.esc(o.pattern) + '"' : ''].filter(Boolean).join(' '));
F.input = o => h`<div class="fld ${o.full ? 'full' : ''}">${o.label ? h`<label for="f-${o.name}">${o.label}</label>` : ''}${o.type === 'password' ? h`<div class="inp-wrap"><input class="inp" id="f-${o.name}" name="${o.name}" type="password" value="${o.value == null ? '' : o.value}" placeholder="${o.placeholder || ''}" ${attrs(o)} style="padding-right:46px"><button type="button" class="ibtn sm suffix" data-eye aria-label="Show password">${icon('eye', 17)}</button></div>` : h`<input class="inp" id="f-${o.name}" name="${o.name}" type="${o.type || 'text'}" value="${o.value == null ? '' : o.value}" placeholder="${o.placeholder || ''}" ${attrs(o)}>`}${o.hint ? h`<div class="hint">${o.hint}</div>` : ''}<div class="err" data-err="${o.name}"></div></div>`;
F.textarea = o => h`<div class="fld ${o.full ? 'full' : ''}">${o.label ? h`<label for="f-${o.name}">${o.label}</label>` : ''}<textarea class="inp" id="f-${o.name}" name="${o.name}" rows="${o.rows || 4}" placeholder="${o.placeholder || ''}" ${attrs(o)}>${o.value == null ? '' : o.value}</textarea>${o.hint ? h`<div class="hint">${o.hint}</div>` : ''}<div class="err" data-err="${o.name}"></div></div>`;
F.select = o => h`<div class="fld ${o.full ? 'full' : ''}">${o.label ? h`<label for="f-${o.name}">${o.label}</label>` : ''}<select class="inp" id="f-${o.name}" name="${o.name}" ${attrs(o)}>${join(o.options, x => { const v = typeof x === 'object' ? x.value : x, l = typeof x === 'object' ? x.label : x; return h`<option value="${v}" ${String(v) === String(o.value == null ? '' : o.value) ? raw('selected') : ''}>${l}</option>`; })}</select>${o.hint ? h`<div class="hint">${o.hint}</div>` : ''}<div class="err" data-err="${o.name}"></div></div>`;
F.switch = o => h`<label class="sw ${o.full ? 'full' : ''}"><input type="checkbox" name="${o.name}" ${o.value ? raw('checked') : ''} ${o.disabled ? raw('disabled') : ''}><i></i><span>${o.label}${o.hint ? h`<span class="xs mut" style="display:block">${o.hint}</span>` : ''}</span></label>`;
F.check = o => h`<label class="check ${o.full ? 'full' : ''}"><input type="checkbox" name="${o.name}" ${o.value ? raw('checked') : ''}><span>${o.label}${o.hint ? h`<span class="xs mut" style="display:block">${o.hint}</span>` : ''}</span></label>`;
F.seg = o => h`<div class="seg" data-seg="${o.name}" role="tablist">${join(o.options, x => { const v = typeof x === 'object' ? x.value : x, l = typeof x === 'object' ? x.label : x; return h`<button type="button" class="${String(v) === String(o.value) ? 'on' : ''}" data-v="${v}">${l}</button>`; })}<input type="hidden" name="${o.name}" value="${o.value == null ? '' : o.value}"></div>`;
// read every named field of a form/element → object (numbers stay strings, except date fields → ms or null; checkboxes → bool)
F.read = (root) => {
  const o = {};
  root.querySelectorAll('[name]').forEach(el => {
    const n = el.name; if (!n) return;
    if (el.type === 'checkbox') o[n] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[n] = el.value; }
    else if (el.type === 'hidden' && el.parentElement && el.parentElement.querySelector('.dtf')) o[n] = el.value ? Number(el.value) : null;
    else o[n] = el.value;
  });
  return o;
};
F.error = (root, name, msg) => {
  const e = root.querySelector('[data-err="' + name + '"]'), i = root.querySelector('[name="' + name + '"]');
  if (e) e.textContent = msg || '';
  if (i) { i.classList.toggle('bad', !!msg); if (msg) i.focus(); }
};
F.clearErrors = root => root.querySelectorAll('[data-err]').forEach(e => { e.textContent = ''; const i = root.querySelector('[name="' + e.dataset.err + '"]'); if (i) i.classList.remove('bad'); });
// segmented controls inside root
F.wireSeg = (root, onChange) => root.addEventListener('click', e => {
  const b = e.target.closest('.seg[data-seg] button'); if (!b) return;
  const s = b.parentElement; s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  const i = s.querySelector('input[type=hidden]'); if (i) i.value = b.dataset.v;
  if (onChange) onChange(s.dataset.seg, b.dataset.v);
});
// a button that shows a spinner while the promise runs
UI.busy = async (btn, fn) => {
  if (!btn) return fn();
  const old = btn.innerHTML; btn.classList.add('busy'); btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>' + (btn.dataset.busy ? '<span>' + AX.esc(btn.dataset.busy) + '</span>' : '');
  try { return await fn(); } finally { if (btn.isConnected) { btn.innerHTML = old; btn.classList.remove('busy'); btn.disabled = false; } }
};

/* ---------- display pieces ---------- */
UI.avatar = (name, seed, cls) => h`<span class="av ${cls || ''}" style="--c:${AX.u.hue(seed || name)}" aria-hidden="true">${AX.u.initials(name)}</span>`;
UI.pill = (text, tone, dot) => h`<span class="pill ${tone || ''}">${dot ? raw('<span class="d"></span>') : ''}${text}</span>`;
UI.kpi = o => {
  const tag = o.go ? 'a' : 'div';
  const inner = h`<div class="k-l">${o.icon ? icon(o.icon, 16) : ''}<span>${o.label}</span></div><div class="k-v">${o.value}</div><div class="k-f">${o.delta != null ? h`<span class="${o.delta >= 0 ? 'up' : 'down'}">${o.delta >= 0 ? '▲' : '▼'} ${Math.abs(o.delta)}${o.deltaUnit || '%'}</span>` : ''}<span>${o.foot || ''}</span></div>`;
  return tag === 'a' ? h`<a class="kpi glass ${o.tone || ''} ${o.hero ? 'hero' : ''}" href="${o.go}">${inner}</a>` : h`<div class="kpi glass ${o.tone || ''} ${o.hero ? 'hero' : ''}">${inner}</div>`;
};
UI.empty = o => h`<div class="empty ${o.tone || ''}"><div class="e-ic">${icon(o.icon || 'inbox', 26)}</div><h4>${o.title}</h4>${o.text ? h`<p class="sm" style="max-width:46ch">${o.text}</p>` : ''}${o.action || ''}</div>`;
UI.errorBox = (r, what) => h`<div class="card">${UI.empty({ tone: 'bad', icon: 'alert', title: r && r.error === 'forbidden' ? 'No access' : 'Could not load', text: AX.errText(r, what), action: h`<button class="btn sm" data-act="retry">${icon('refresh', 15)} Try again</button>` })}</div>`;
UI.noAccess = (what) => h`<div class="card">${UI.empty({ tone: 'lock', icon: 'lock', title: 'No access', text: 'Your team account cannot open ' + (what || 'this part') + '. Ask the owner to give you access.' })}</div>`;
UI.skeleton = (n = 4, kind = 'line') => kind === 'kpi' ? h`<div class="kpis">${join(Array(n).fill(0), () => raw('<div class="skel box"></div>'))}</div>` : h`<div class="card">${join(Array(n).fill(0), (x, i) => raw('<div class="skel line" style="width:' + (92 - (i * 13) % 40) + '%"></div>'))}</div>`;
UI.copyBtn = (text, label) => h`<button class="btn xs ghost" data-copy="${text}" title="Copy">${icon('copy', 13)}${label ? h`<span>${label}</span>` : ''}</button>`;
document.addEventListener('click', async e => { const b = e.target.closest('[data-copy]'); if (!b) return; e.preventDefault(); if (await AX.u.copy(b.dataset.copy)) UI.toast('Copied'); });

/* ---------- charts (SVG, no library) ---------- */
UI.chart = {
  // bars([{label, value, title}], {money:true, height})
  bars(data, o = {}) {
    const max = Math.max(1, ...data.map(d => d.value || 0));
    // o.pick: bars are buttons (data-pick="<index>", wire with AX.act(root, {pick(el){…}})); o.sel: index shown as selected
    return h`<div class="bars ${o.pick ? 'pickable' : ''}" style="height:${o.height || 150}px" ${o.pick ? '' : raw('role="img"')} aria-label="${o.label || 'Bar chart'}">${join(data, (d, i) => { const t = d.title || (d.label + ': ' + (o.money ? AX.fmt.inr(d.value) : AX.fmt.num(d.value))); const inner = h`<div class="bv ${d.value ? '' : 'zero'}" style="height:${d.value ? Math.max(4, Math.round(d.value * 100 / max)) : 3}%"></div><span class="bl">${d.label}</span>`;
      return o.pick ? h`<button type="button" class="bc ${o.sel === i ? 'sel' : ''}" data-act="pick" data-pick="${i}" title="${t}" aria-label="${t}" aria-pressed="${o.sel === i ? 'true' : 'false'}">${inner}</button>` : h`<div class="bc" title="${t}">${inner}</div>`; })}</div>`;
  },
  // spark([numbers], {w,h,color})
  spark(vals, o = {}) {
    const w = o.w || 120, hh = o.h || 36, n = vals.length; if (!n) return '';
    const mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
    const pts = vals.map((v, i) => [n === 1 ? w : i * w / (n - 1), hh - 3 - (v - mn) * (hh - 6) / rg]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return raw(`<svg class="chart" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w} ${hh} L0 ${hh}Z" fill="${o.fill || 'var(--pri-soft)'}"/><path d="${d}" fill="none" stroke="${o.color || 'var(--pri)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  },
  // area chart with axis labels: area([{label, value}], {money})
  area(data, o = {}) {
    const w = 640, hh = o.height || 180, pad = 26, n = data.length; if (!n) return '';
    const mx = Math.max(1, ...data.map(d => d.value || 0));
    const x = i => pad + (n === 1 ? (w - pad * 2) / 2 : i * (w - pad * 2) / (n - 1)), y = v => hh - 22 - (v || 0) * (hh - 40) / mx;
    const line = data.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.value).toFixed(1)).join(' ');
    const step = Math.ceil(n / 7);
    const id = 'g' + AX.u.uid();
    return raw(`<svg class="chart" viewBox="0 0 ${w} ${hh}" role="img" aria-label="${AX.esc(o.label || 'Chart')}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pri)" stop-opacity=".32"/><stop offset="1" stop-color="var(--pri)" stop-opacity="0"/></linearGradient></defs>`
      + [0, .5, 1].map(f => `<line class="axis" x1="${pad}" x2="${w - pad}" y1="${(hh - 22 - f * (hh - 40)).toFixed(1)}" y2="${(hh - 22 - f * (hh - 40)).toFixed(1)}" stroke-dasharray="${f ? '3 4' : ''}"/>`).join('')
      + `<path d="${line} L${x(n - 1).toFixed(1)} ${hh - 22} L${x(0).toFixed(1)} ${hh - 22}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="var(--pri)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
      + data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.2" fill="var(--solid)" stroke="var(--pri)" stroke-width="2"><title>${AX.esc(d.label)}: ${AX.esc(o.money ? AX.fmt.inr(d.value) : AX.fmt.num(d.value))}</title></circle>`).join('')
      + data.map((d, i) => i % step === 0 || i === n - 1 ? `<text x="${x(i).toFixed(1)}" y="${hh - 4}" text-anchor="middle">${AX.esc(d.label)}</text>` : '').join('')
      + `<text x="${pad}" y="12">${AX.esc(o.money ? AX.fmt.inr(mx) : AX.fmt.num(mx))}</text></svg>`);
  },
  // donut([{label, value, color}], {size, center})
  donut(parts, o = {}) {
    const s = o.size || 132, r = s / 2 - 10, c = 2 * Math.PI * r, tot = parts.reduce((a, p) => a + (p.value || 0), 0);
    let off = 0;
    const segs = tot ? parts.filter(p => p.value).map(p => { const len = p.value / tot * c; const el = `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="14" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${s / 2} ${s / 2})"><title>${AX.esc(p.label)}: ${p.value}</title></circle>`; off += len; return el; }).join('') : '';
    return raw(`<svg class="chart" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" role="img" aria-label="${AX.esc(o.label || 'Breakdown')}"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--hover)" stroke-width="14"/>${segs}<text x="50%" y="48%" text-anchor="middle" style="font-family:var(--font-display);font-size:24px;font-weight:600;fill:var(--tx)">${AX.esc(o.center != null ? o.center : tot)}</text><text x="50%" y="64%" text-anchor="middle" style="font-size:11px">${AX.esc(o.sub || '')}</text></svg>`);
  }
};
})();
