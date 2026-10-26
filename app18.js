/* ===== v36: notices for my test series, "Haan, padh liya", phone notifications that keep working =====
   Server: supabase_v36_notice_audience.sql — cbt_notice now sends only the notices meant for this student (by test series),
   each with read / read_at; cbt_ann_read marks them; cbt_push_has / cbt_push_rotate keep this phone on the push list.
   Without v36 the Notifications page looks as before (no read button). */

/* ---------- Notifications page with "Haan, padh liya" ---------- */
let NTSEEN=0;
const annHasRead=()=>(ANN||[]).some(x=>'read' in x);
const ntTime=ms=>new Date(ms).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
function ntRead(x){
  if(!('read' in x))return '';
  return x.read?`<div class="nread done">${ic('check',15)} Padh liya${x.read_at?' · '+esc(ntTime(x.read_at)):''}</div>`
    :`<button class="btn sm nread" data-id="${esc(String(x.id))}" onclick="annMarkRead(this.dataset.id,this)">${ic('check',15)} Haan, padh liya</button>`;
}
function ntCard(x){
  const u=safeUrl(x.link),isNew=x.at>NTSEEN,long=(x.text||'').length>320,un=('read' in x)&&!x.read;
  return `<article class="card ncard${isNew?' isnew':''}${un?' unread':''}" data-nid="${esc(String(x.id))}"><div class="nctop"><span class="nico">${ic('bell',18)}</span><div class="grow"><h3>${esc(x.title||'Announcement')}</h3><div class="nmeta">${fullDate(x.at)}${relT(x.at)?' · '+relT(x.at):''}</div></div>${isNew?'<span class="newb">NEW</span>':''}</div>
   ${x.text?`<div class="nbody${long?' clamp':''}">${linkify(x.text)}</div>${long?`<button class="nmore" onclick="this.previousElementSibling.classList.remove('clamp');this.remove()">Read more</button>`:''}`:''}
   ${x.img?`<div class="annimg" data-ai="${x.id}"><div class="sk" style="height:160px;border-radius:14px;margin-top:12px"></div></div>`:''}
   ${u?`<a class="btn soft sm nlink" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(x.label||'Open link')} ↗</a>`:''}
   <div class="nrow">${ntRead(x)}</div></article>`;
}
function ntHead(){
  const l=ANN||[],nNew=l.filter(x=>x.at>NTSEEN).length,nUn=annHasRead()?l.filter(x=>!x.read).length:0;
  return `<div><h1 class="ntitle">Notifications</h1><div class="sm mut">${l.length?`${l.length} notice${l.length==1?'':'s'}${nNew?` · <b style="color:var(--pri)">${nNew} new</b>`:''}${nUn?` · ${nUn} not read yet`:''}`:'Nothing yet'}</div></div>
   <div class="row" style="gap:8px">${nUn>1?`<button class="btn soft sm" onclick="annMarkRead('all',this)">${ic('check',15)} Sab padh liya</button>`:''}<button class="iconbtn" aria-label="Refresh" onclick="ANNT=0;viewNotices()">${ic('reset',18)}</button></div>`;
}
// phone notifications are off on this phone: one tap to turn them on (they are how test alerts reach a closed app)
function ntPushStrip(){
  if(typeof npOn!=='function'||npOn())return '';
  return `<div class="card npstrip"><span class="nico">${ic('bell',18)}</span><div class="grow"><b>Phone notifications are off</b><div class="sm mut">Turn them on to get test alerts and notices even when the app is closed.</div></div><button class="btn sm" onclick="npToggle().then(()=>{const s=document.querySelector('.npstrip');if(s&&npOn())s.remove()})">Turn on</button></div>`;
}
viewNotices=async function(){
  if(!ANN)setApp(`<div class="wrap"><div class="crumb"><a href="#/">${ic('back',16)} Home</a></div><h1 class="ntitle">Notifications</h1>${[1,2].map(()=>`<div class="card"><div class="sk" style="width:55%"></div><div class="sk" style="width:90%;margin-top:12px"></div><div class="sk" style="width:70%;margin-top:10px"></div></div>`).join('')}</div>`);
  const l=await annLoad(!ANN||Date.now()-ANNT>20000)||[];
  if(location.hash!=='#/n')return;
  NTSEEN=LS.get('cbt_ann_seen',0);
  if(l.length)LS.set('cbt_ann_seen',Math.max(NTSEEN,...l.map(x=>x.at)));
  bellUpdate();
  setApp(`<div class="wrap ntf"><div class="crumb"><a href="#/">${ic('back',16)} Home</a></div>
   <div class="nhead" id="nthead">${ntHead()}</div>${ntPushStrip()}
   ${l.length?l.map(ntCard).join(''):`<div class="card empty"><div style="color:var(--pri)">${ic('bell',34)}</div><h3 style="margin:10px 0 4px;color:var(--tx)">No notifications yet</h3><p class="sm">Notices from your teacher will appear here.</p></div>`}</div>`);
  setNav('dash');
  l.filter(x=>x.img).forEach(async x=>{
    let im=ANNIMG[x.id];
    if(!im){const r=await rpc('cbt_notice_img',{p_id:x.id});im=r.ok?r.image:null;if(im)ANNIMG[x.id]=im}
    const el=document.querySelector(`[data-ai="${x.id}"]`);if(!el)return;
    el.innerHTML=im?`<img class="qi zm nimg" src="${im}" alt="">`:'';
  });
};
async function annMarkRead(id,btn){
  if(btn){btn.disabled=true}
  const r=await rpc('cbt_ann_read',{p_id:String(id),p_on:true});
  if(!r||!r.ok){if(btn)btn.disabled=false;if(!authErr(r))toast(r&&r.error==='notice'?'This notice is no longer here. Refresh the page.':'Could not save. Try again.');return}
  (ANN||[]).forEach(x=>{if(id==='all'||String(x.id)===String(id)){if(!x.read)x.read_at=r.at;x.read=true}});
  if(navigator.vibrate)navigator.vibrate(10);
  document.querySelectorAll('.ncard[data-nid]').forEach(c=>{
    const x=(ANN||[]).find(v=>String(v.id)===c.dataset.nid);if(!x||!x.read)return;
    c.classList.remove('unread');const row=c.querySelector('.nrow');if(row)row.innerHTML=ntRead(x);
  });
  const h=document.getElementById('nthead');if(h)h.innerHTML=ntHead();
  toast(id==='all'?'All notices marked as read ✓':'Marked as read ✓');
}

/* ---------- iPhone in Safari (not added to Home Screen): show the Home Screen steps, not the "other app" ones ---------- */
{const _nh=npHelp;npHelp=function(kind){if(kind==='app'&&/iphone|ipad|ipod/i.test(navigator.userAgent)&&!npInApp())kind='ask';return _nh(kind)}}

/* ---------- phone notifications that keep working ----------
   1. a phone that subscribed with an older key gets nothing: subscribe again with the current key;
   2. once a day ask the server if this phone is still on its list (it removes addresses that stopped working) and add it again;
   3. a new sign-in on this phone moves the phone to that student at once; signing out takes it off the list;
   4. if saving fails (no network), try again a minute later. */
let PUSHMOB=null,PUSHTRY=0;
const pushKeyOk=sub=>{try{const k=sub.options&&sub.options.applicationServerKey;if(!k)return true;const a=new Uint8Array(k),b=b64u(CFG.VAPID_PUBLIC);return a.length===b.length&&a.every((v,i)=>v===b[i])}catch(e){return true}};
pushSync=async function(force){
  try{
    if(!AUTH||!CFG.VAPID_PUBLIC||!npSup()||!('PushManager' in window)||Notification.permission!=='granted'||LS.get('cbt_np',0)!==1)return;
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(sub&&!pushKeyOk(sub)){try{await sub.unsubscribe()}catch(e){}sub=null}
    if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(CFG.VAPID_PUBLIC)});force=true}
    const k=AUTH.mobile+'|'+sub.endpoint,last=LS.get('cbt_push_ok',null);
    if(!force&&last&&last.k===k){
      if(Date.now()-last.t<864e5)return;
      const h=await rpc('cbt_push_has',{p_endpoint:sub.endpoint});
      if(h&&h.ok&&h.has){LS.set('cbt_push_ok',{k,t:Date.now()});return}
    }
    const r=await rpc('cbt_push_save',{p_sub:sub.toJSON(),p_on:true});
    if(r&&r.ok){LS.set('cbt_push_ok',{k,t:Date.now()});PUSHTRY=0}
    else if(PUSHTRY++<3)setTimeout(()=>pushSync(true),60000);
  }catch(e){}
};
{const _al=annLoad;annLoad=async function(f){const r=await _al(f);if(AUTH&&PUSHMOB!==AUTH.mobile){PUSHMOB=AUTH.mobile;pushSync()}return r}}
{const _so=doSignOut;doSignOut=function(){
  const a=AUTH;
  if(a&&typeof npSup==='function'&&npSup()&&'PushManager' in window)
    navigator.serviceWorker.ready.then(reg=>reg.pushManager.getSubscription())
      .then(sub=>{if(sub)rpc('cbt_push_save',{p_mobile:a.mobile,p_code:a.code,p_device:DEV,p_sub:sub.toJSON(),p_on:false},true)}).catch(()=>{});
  LS.del('cbt_push_ok');PUSHMOB=null;
  return _so.apply(this,arguments);
}}
;(window.__p=window.__p||{})['app18']=1;
