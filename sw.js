/* Service worker: lets the site be installed like an app.
   It always asks the network first, so new uploads show up at once.
   It never touches the database (Supabase) calls. */
const CACHE='cbt-shell-v2';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  // Pages (index.html, admin page): always the newest copy. The extra ?_sw= makes the hosting CDN skip
  // its own copy too, so one refresh never shows the old design and the next the new one.
  const nav=r.mode==='navigate';
  let net;
  if(nav){const b=new URL(r.url);b.searchParams.set('_sw',Date.now());net=fetch(b.href,{cache:'no-store',credentials:'same-origin'}).then(res=>res.redirected?fetch(r):res)}
  else net=fetch(r,{cache:'no-cache'});
  e.respondWith(net.then(res=>{
    if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp)).catch(()=>{})}
    return res;
  }).catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
// Tap on a phone notification: open (or focus) the app on the Notifications page.
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=new URL('index.html'+((e.notification.data&&e.notification.data.url)||''),self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l){if('focus' in c){c.navigate(url).catch(()=>{});return c.focus()}}
    return clients.openWindow(url);
  }));
});
// Ready for server push (Web Push / FCM) later: shows whatever the server sends.
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||'New notice',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||undefined,data:{url:d.url||'#/n'}}));
});
