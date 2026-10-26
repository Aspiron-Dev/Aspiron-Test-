# Aspiron Control — admin console (`cx/`)

The admin page `cp-dt764twzf54s5m.html` loads, in order: `config.js`, `parser.js`, `cx/core.js`, `cx/ui.js`,
every `cx/m-*.js` module, then `cx/shell.js` (which boots the app on DOMContentLoaded).
No build step, no framework. Each module is one classic script wrapped in an IIFE that calls `AX.mod({...})`.
The old panel stays reachable as `cp-dt764twzf54s5m-old.html` (backup only).

## Rules for every module
- **Never build HTML by string concatenation of data.** Use the tagged template `AX.h\`...\`` — every `${value}` is
  HTML-escaped. Nest `AX.h` results freely; use `AX.join(list, fn)` for lists and `AX.raw(str)` only for trusted
  markup (icons, your own constants). Put HTML into the page with `AX.set(el, h\`...\`)`.
- **No inline `onclick`.** Give elements `data-act="name"` and wire them with `AX.act(root, {name(el, ev){…}})`
  (one delegated listener; use `AX.act(root, map, 'input' | 'change')` for inputs). Extra data goes in `data-*`.
- **No `alert/confirm/prompt`** (blocked in in-app browsers). Use `await AX.ui.confirm({...})`, `await AX.ui.prompt({...})`.
- **Dates/times:** never `<input type="date|time|datetime-local">`. Use `AX.ui.dtField({name, label, value: ms, time:true})`
  in forms (call `AX.ui.wire(formEl)` once after rendering) or `await AX.ui.pickDateTime({value})` → ms | null | undefined.
  The server mostly stores **milliseconds** (check the inventory for each field).
- **Permissions:** the server enforces them (supabase_v35). The UI must also hide/disable what the user cannot do:
  `AX.can('students')` (view) / `AX.can('students','manage')` (change). Show `AX.ui.noAccess()` instead of a broken page.
  Module keys: students, payments, content, results, integrity, store, promotions, messaging, reviews (owner can do all).
- **Every server call** returns `{ok:false, error}` on failure; show it with `AX.ui.err(r)` (toast) or `AX.ui.errorBox(r)`
  (with a `data-act="retry"` button). `error:'forbidden'` = no permission; `'missing'` = SQL not installed.
- **Loading / empty / error states** everywhere: `AX.ui.skeleton(n)`, `AX.ui.empty({icon,title,text,action})`, `AX.ui.errorBox(r)`.
- **After a change**, drop the caches you affected (`AX.cache.drop('students')`), and `AX.emit('data:changed')` so the
  bell/badges refresh. Re-render the visible view (do not leave stale numbers — this was a real bug in the old panel).
- Mobile first: the page must work at 390 px wide with no horizontal scroll. Tables: wrap in `.tbl-wrap` and offer a
  card/list layout on phones, or keep columns few. Bottom bar covers the last 90 px on phones (the page already pads).
- Glass (`.glass`) only for chrome and KPI cards; data lives on solid `.card`s. Use the design tokens/classes in `cx.css`.
- English UI text, short and friendly (the owner reads Hinglish/Hindi; keep sentences simple). Keep exact message
  templates sent to students as they are in the inventory (they are known to work).

## AX.mod
```js
AX.mod({
  id: 'students',            // route #/students/...
  title: 'Students', short: 'Students', icon: 'users',      // icon = key of AX.ICONS (cx/core.js)
  group: 'People',           // '', 'People', 'Academics', 'Commerce', 'Engagement', 'Workspace'
  order: 10, perm: 'students',   // module key needed to SEE it ('any' = everyone, 'owner' = owner only)
  sub: 'One-line page subtitle',
  async render(ctx) { ... },
  async search(q) { return [{g:'Students', title, sub, icon, go:'#/students/<id>', tag, tone}] },  // optional, q is lower-case
  async attention() { return [{title, sub, count, go, icon, tone:'bad'|'gold'|'pri', badge:true}] }   // optional: bell + nav badge
});
AX.creates.push({label:'Student', icon:'userPlus', perm:['students','manage'], run(){...}});   // the "+" menu
AX.actions.push({label:'Export students CSV', icon:'download', perm:['students'], run(){...}}); // command palette
```
`ctx`: `ctx.el` (page body element), `ctx.parts` (path parts after the module id), `ctx.q` (query object),
`ctx.head({title, sub, actions: h\`buttons\`, tabs:[{id,title,icon,count,href?}], tab, crumb})`, `ctx.alive()`
(false once the user navigated away — check after every await), `ctx.reload()`.
Header buttons live in `#ax-ph`: wire them with `AX.act(document.getElementById('ax-ph'), {...})` (it is recreated per route).
Navigate with `AX.go('students/123', {q:'x'})` or links `href="#/students/123"`.

## AX.api
- `AX.api.admin(action, data)` → `cbt_admin`
- `AX.api.call(fn, action, data, extra)` → any `p_pw, p_action, p_data` function, e.g. `AX.api.call('cbt_admin_store','get')`
- `AX.api.rpc(fn, {p_code:'X', p_action:'note', p_data:{}})` → any other signature (p_pw is added).
- `AX.api.push({title, body, url, tag})` → the send-push Edge Function.
- Shared cached data: `await AX.data.catalog()` (series/folders/tests + `practice` Set), `await AX.data.students()`.
- `AX.cache.get(key, loader, ttlMs, force)`, `AX.cache.drop(prefix)`.

## AX.ui (cx/ui.js)
toast(msg,{tone:'bad'|'warn', action:{label,fn}}) · err(r) · modal({title,sub,body,foot,size:'wide'|'xwide'|'narrow',onOpen(el,close,api)})
· drawer({title,sub,head,body,foot,size:'wide',onOpen}) · confirm({title,text,yes,tone:'danger',reason:'optional'|'required',typeWord})
· prompt({title,label,value,type,multiline,hint}) · menu(anchorEl,[{label,icon,fn,tone,href,sep,head}]) · pickDateTime · dtField · wire(root)
· busy(btn, asyncFn) · avatar(name, seed, 'sm'|'lg') · pill(text, tone) · kpi({label,value,icon,foot,tone,go,hero,delta})
· empty · errorBox · noAccess · skeleton(n,'kpi') · copyBtn(text,label) · chart.bars/area/spark/donut.
Forms: `AX.f.input/textarea/select/switch/check/seg({name,label,value,...})`, `AX.f.read(form)`, `AX.f.error(form,name,msg)`,
`AX.f.clearErrors(form)`, `AX.f.wireSeg(root,onChange)`.
Format: `AX.fmt.inr/num/pct/short/date/day/time/dt/ago/dur/bytes/plural/mobile`. Utils: `AX.u.copy/download/csv/csvDownload
(formula-safe)/compressImage/fileToDataURL/pickFile/wa/tg/sms/tel/storeUrl/site/initials/hue/debounce`.

## Testing
`/tmp/claude-0/…/scratchpad/cx-test/harness.js` opens the console with a stateful mock of every RPC (`mock/*.js`).
Add a `mock/NN-<area>.js` for your RPCs (exports `seed(state)` and `handlers`). Test at 1280 px and 390 px, light and dark,
check `errors` is empty, `H.unknown` lists no unexpected calls, and `H.overflow(page)` is empty on phones.

## Module map (ids, files, nav) — keep these exact so links between modules work
| id | file | title | group / order | perm |
|---|---|---|---|---|
| home | m-home.js | Command centre | '' / 1 | any |
| students | m-students.js | Students | People / 10 | students |
| payments | m-payments.js | Payments | People / 20 | payments |
| tests | m-tests.js (+ m-builder.js, m-import.js) | Test studio | Academics / 10 | content |
| results | m-results.js | Results & analytics | Academics / 20 | results |
| live | m-live.js | Live monitor | Academics / 30 | results |
| reports | m-reports.js | Question reports | Academics / 40 | content |
| integrity | m-integrity.js | Integrity | Academics / 50 | integrity |
| pyq | m-pyq.js | PYQ bank | Academics / 60 | content |
| orders | m-orders.js | Orders | Commerce / 10 | store |
| store | m-store.js | Store | Commerce / 20 | store |
| promos | m-promos.js | Promotions | Commerce / 30 | promotions |
| messages | m-messaging.js | Broadcasts | Engagement / 10 | messaging |
| reviews | m-reviews.js | Reviews | Engagement / 20 | reviews |
| team | m-team.js | Team & access | Workspace / 10 | any (owner tabs) |
| settings | m-settings.js | Settings | Workspace / 20 | any |

Cross-module hooks (define in your module, call others defensively: `AX.openStudent ? AX.openStudent(x) : AX.go('students/'+id)`):
- `AX.openStudent(idOrMobile)` — Students: opens the student 360° drawer.
- `AX.openTest(testId | null, {seriesId, folderId})` — Test studio: opens the test builder (null = new test).
- `AX.openAnalytics(testId)` — Results: opens one test's analytics.
- `AX.openOrder(code)` — Orders: opens one order.
- `AX.addPayment({studentId})` — Payments: opens the add-payment form.

Shared cache keys (use the helpers, drop them after changes): `AX.data.catalog()` 'catalog', `AX.data.students()` 'students',
`AX.data.results()` 'results', `AX.data.payments()` 'payments' (cbt_admin_payments get), `AX.data.store()` 'store' (cbt_admin_store get).
After an order is approved / undone / rejected: drop 'store', 'payments', 'students' and `AX.emit('data:changed')` — payments shown
anywhere must follow the order status at once. Module CSS: `AX.css('<module>', '…css…')` once at load (use the tokens from cx.css).
