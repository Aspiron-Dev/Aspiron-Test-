/* =====================================================================
   Social media: one link + On / Off per platform. What is On (and has a link) shows on the website footer, the store,
   the Contact page and the student app's menu. Platforms, icons and the link check come from config.js
   (SOCIAL_PLATFORMS, socialIcon, socialUrlOk); the database checks every link again.
   Server: cbt_admin_social (supabase_v57_social.sql) · permission: Broadcasts (view = look, full = save)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const can = () => AX.can('messaging', 'manage');
const PL = () => window.SOCIAL_PLATFORMS || [];
const COLOR = { instagram: '#e1306c', facebook: '#1877f2', youtube: '#ff0000', x: '#64748b', telegram: '#229ed9',
  whatsapp_channel: '#25d366', linkedin: '#0a66c2', pinterest: '#e60023', threads: '#6b7280' };
const sicon = (k, s) => raw(window.socialIcon ? window.socialIcon(k, s || 20) : '');
const ERR = { url: 'This link is not right. Paste the full link of this page, starting with https://', url_needed: 'Paste the link first, or turn this Off', platform: 'Unknown platform' };

AX.mod({
  id: 'social', title: 'Social media', short: 'Social', icon: 'globe', group: 'Communication', order: 30, perm: 'messaging',
  sub: 'Links shown on the website and in the app.',
  async render(ctx) {
    ctx.head({ title: 'Social media', sub: 'Turn a platform On and paste its link: it shows on the website footer, the store, the Contact page and in the student app menu. Off = hidden everywhere.' });
    AX.set(ctx.el, UI.skeleton(4));
    const r = await AX.api.call('cbt_admin_social', 'get');
    if (!ctx.alive()) return;
    if (!r.ok) {
      AX.set(ctx.el, r.error === 'missing'
        ? h`<div class="card">${UI.empty({ tone: 'lock', icon: 'db', title: 'One-time setup needed', text: 'Run supabase_v57_social.sql once in Supabase → SQL Editor, then supabase_v35_admin_team.sql again. Until then the website shows the links written in config.js.' })}</div>`
        : UI.errorBox(r));
      AX.act(ctx.el, { retry: () => ctx.reload() }); return;
    }
    const saved = {}; (r.links || []).forEach(l => { saved[l.platform] = l; });
    const edit = can();
    const card = p => { const s = saved[p.key] || { url: '', shown: false };
      return h`<div class="card"><div class="row" style="gap:12px">
          <span class="av" style="--c:${COLOR[p.key] || '#14b8a6'}">${sicon(p.key)}</span>
          <div class="grow"><b>${p.label}</b><div class="xs mut" data-st="${p.key}">${s.shown && s.url ? 'On — shown' : s.url ? 'Off — hidden' : 'No link yet'}${s.updated_at ? ' · ' + fmt.ago(s.updated_at) : ''}</div></div>
          ${edit ? h`<label class="sw" title="Show on the website"><input type="checkbox" name="on_${p.key}" ${s.shown ? raw('checked') : ''}><i></i></label>` : UI.pill(s.shown ? 'On' : 'Off', s.shown ? 'ok' : '')}</div>
        <div class="row mt12" style="gap:8px;align-items:flex-start"><div class="grow">${AX.f.input({ name: 'url_' + p.key, value: s.url || '', placeholder: p.hint, max: 300, inputmode: 'url', auto: 'off', disabled: !edit })}</div>
          <a class="ibtn" data-open="${p.key}" href="${s.url && window.socialUrlOk && window.socialUrlOk(p.key, s.url) ? s.url : '#'}" target="_blank" rel="noopener" title="Open the link" aria-label="Open the ${p.label} link" ${s.url ? '' : raw('hidden')}>${icon('external', 16)}</a></div></div>`; };
    AX.set(ctx.el, h`<form id="so-f" class="col gap16" autocomplete="off" novalidate>
      <div class="card"><div class="card-h">${icon('eye')}<h3>How the website shows it</h3><span class="grow"></span>${edit ? h`<button type="button" class="btn pri sm" data-act="save">${icon('check', 15)} Save</button>` : UI.pill('View only')}</div>
        <div id="so-prev" class="row wrap" style="gap:10px"></div>
        <p class="xs mut mt8">Only platforms that are On and have a link show. The website and the app pick up a change the next time a page opens.</p></div>
      <div class="grid g2" style="align-items:start">${join(PL(), card)}</div>
      ${edit ? h`<div class="row end"><button type="button" class="btn pri" data-act="save">${icon('check', 16)} Save</button></div>` : ''}</form>`);
    const form = ctx.el.querySelector('#so-f');
    // the preview follows the switches and links as they are typed (before saving)
    const read = () => { const d = AX.f.read(form); return PL().map(p => ({ platform: p.key, url: String(d['url_' + p.key] || '').trim(), shown: !!d['on_' + p.key] })); };
    const preview = () => {
      const on = read().filter(l => l.shown && l.url && window.socialUrlOk && window.socialUrlOk(l.platform, l.url));
      AX.set('#so-prev', on.length
        ? join(on, l => h`<span class="av" style="--c:${COLOR[l.platform] || '#14b8a6'}" title="${(PL().find(p => p.key === l.platform) || {}).label}">${sicon(l.platform, 18)}</span>`)
        : h`<span class="sm mut">Nothing is On — the website shows no social links.</span>`);
      read().forEach(l => { const a = form.querySelector(`[data-open="${l.platform}"]`); if (!a) return;
        const good = l.url && window.socialUrlOk && window.socialUrlOk(l.platform, l.url); a.hidden = !good; a.href = good ? l.url : '#'; });
    };
    preview();
    if (!edit) return;
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', AX.u.debounce(preview, 150));
    form.addEventListener('change', preview);
    AX.act(form, {
      async save(btn) {
        AX.f.clearErrors(form);
        const links = read();
        // the same check as the database, so the owner sees the problem next to the field
        for (const l of links) {
          if (l.url && !(window.socialUrlOk && window.socialUrlOk(l.platform, l.url))) { const p = PL().find(x => x.key === l.platform);
            return AX.f.error(form, 'url_' + l.platform, 'This is not a ' + p.label + ' link. It must start with https:// and be on ' + p.hosts.join(' or ') + '.'); }
          if (l.shown && !l.url) return AX.f.error(form, 'url_' + l.platform, ERR.url_needed);
        }
        await UI.busy(btn, async () => {
          const x = await AX.api.call('cbt_admin_social', 'save', { links });
          if (!x.ok) return x.platform && ERR[x.error] ? AX.f.error(form, 'url_' + x.platform, ERR[x.error]) : UI.err(x);
          UI.toast('Saved. The website shows it the next time a page opens.');
          AX.emit('data:changed');
          ctx.reload();
        });
      }
    });
  },
  async search(q) {
    const words = 'social media instagram facebook youtube twitter telegram whatsapp channel linkedin pinterest threads links follow'.split(' ');
    return q.length >= 3 && words.some(w => w.startsWith(q))
      ? [{ g: 'Pages', title: 'Social media links', sub: 'Instagram, Facebook, YouTube… On / Off', icon: 'globe', go: '#/social' }] : [];
  }
});
AX.actions.push({ label: 'Social media links', icon: 'globe', perm: ['messaging'], run() { AX.go('social'); } });
})();
