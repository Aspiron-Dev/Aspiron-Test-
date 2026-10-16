/* ===== v20: improved Test series list + series page + test rows ===== */
const liveIds=()=>{try{return new Set(liveTests().map(t=>t.id))}catch(e){return new Set()}};
function serInfo(s){
  const ts=CAT.tests.filter(t=>t.series_id===s.id),done=ts.filter(t=>t.attempts>0);
  const sc=done.filter(t=>t.best_max).map(t=>pct(t.best,t.best_max));
  const L=liveIds(),live=ts.filter(t=>L.has(t.id));
  const nxt=ts.filter(t=>isWait(t)).sort((a,b)=>a.opens_at-b.opens_at)[0];
  return{ts,n:ts.length,done:done.length,p:ts.length?Math.round(done.length*100/ts.length):0,avg:sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):null,best:sc.length?Math.max(...sc):null,
    live,nxt,prog:ts.filter(t=>t.in_progress).length,folders:CAT.folders.filter(f=>f.series_id===s.id).length};
}

/* ---------- series list ---------- */
let SLF='all';
function seriesList(){
  const S=CAT.series,tot=CAT.tests.length,done=CAT.tests.filter(t=>t.attempts>0).length;
  if(!S.length)return `<div class="card empty">No test series have been added yet.</div>`;
  const cnt={all:S.length,free:S.filter(s=>s.is_free).length,prem:S.filter(s=>!s.is_free).length,mine:S.filter(s=>serInfo(s).done>0).length};
  const fb=(k,t)=>cnt[k]||k==='all'?`<button class="chip ${SLF===k?'pri':''}" onclick="SLF='${k}';slDraw()">${t} <small>${cnt[k]}</small></button>`:'';
  return `<div class="slhead"><div><h1 class="slt">Test series</h1><div class="sm mut">${S.length} series · ${tot} tests · ${done} attempted</div></div><div class="slring">${ring(tot?Math.round(done*100/tot):0,58,6,'var(--pri)')}<span>${tot?Math.round(done*100/tot):0}%</span></div></div>
   <div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search test series…" oninput="filterSeries(this.value)"></div>
   <div class="chiprow">${fb('all','All')}${fb('mine','My series')}${fb('free','Free')}${fb('prem','Premium')}</div>
   <div id="sllist">${slList()}</div>`;
}
function slList(){
  const S=CAT.series.filter(s=>SLF==='all'||(SLF==='free'?s.is_free:SLF==='prem'?!s.is_free:serInfo(s).done>0));
  return S.length?`<div class="sgrid2">${S.map(seriesCard).join('')}</div>`:`<div class="card empty sm">No series here yet.</div>`;
}
function filterSeries(v){v=v.trim().toLowerCase();document.querySelectorAll('.scard2').forEach(c=>{c.style.display=!v||c.textContent.toLowerCase().includes(v)?'':'none'})}
function slDraw(){const l=$('#sllist');if(l)l.innerHTML=slList();document.querySelectorAll('.chiprow .chip').forEach(b=>b.classList.toggle('pri',b.getAttribute('onclick').includes(`'${SLF}'`)));loadCovers()}
function seriesCard(s){
  const I=serInfo(s),open=s.is_free||s.unlocked;
  const sub=I.live.length?`<div class="scnext live"><span class="liveb"><i></i>LIVE</span>${esc(I.live[0].title)} · attempt now</div>`
    :I.prog?`<div class="scnext prog">${ic('play',14)} ${I.prog} test in progress — resume</div>`
    :I.nxt?`<div class="scnext">${ic('calendar',14)} Next: <b>${esc(I.nxt.title)}</b> · ${esc(fmtWhen(I.nxt.opens_at))}</div>`:'';
  return `<div class="card scard2" onclick="location.hash='#/s/${s.id}'">
   <div class="cover sc2c" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div>${tag(s)}</div>
   <div class="sc2b"><h3>${esc(s.title)}</h3>${s.description?`<div class="mut sm clamp2">${esc(s.description)}</div>`:''}
    <div class="sc2s"><span>${ic('file',14)} ${I.n} test${I.n===1?'':'s'}</span>${I.folders?`<span>${ic('folder',14)} ${I.folders}</span>`:''}${(s.files||[]).length?`<span>${ic('calendar',14)} Schedule</span>`:''}${I.avg!=null?`<span>${ic('target',14)} Avg ${I.avg}%</span>`:''}</div>
    ${sub}
    <div class="sc2f">${I.n?`<div class="grow"><div class="row sm" style="justify-content:space-between;margin-bottom:5px"><span class="mut">Progress</span><b>${I.done}/${I.n}</b></div><div class="bar"><i style="width:${I.p}%"></i></div></div>`:'<div class="grow sm mut">Tests coming soon</div>'}
    <span class="btn sm ${open?'':'ghost'}">${open?(I.done?'Continue':'Open'):'View'} ${ic('right',14)}</span></div></div></div>`;
}

/* ---------- series page ---------- */
let SVF='all',SVID=null;
const tStat=(t,L)=>t.in_progress?'prog':t.locked?'lock':isWait(t)?'wait':L.has(t.id)?'live':t.attempts?'done':'new';
function viewSeries(id){
  const s=CAT.series.find(x=>x.id===id);if(!s){location.hash='#/';return}
  if(SVID!==id){SVID=id;SVF='all'}
  const I=serInfo(s),folders=CAT.folders.filter(f=>f.series_id===id);
  const hl=I.live[0]||CAT.tests.find(t=>t.series_id===id&&t.in_progress)||I.nxt;
  let o=`<div class="wrap"><div class="crumb"><a href="#/series">${ic('back',14)} Test series</a></div>
  <div class="card shx sv2"><div class="shc cover" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div>
    <button class="shbtn" aria-label="Share" title="Share" onclick="event.stopPropagation();shareSeries('${id}')">${ic('share',18)}</button></div>
   <div class="shb"><div class="ttl"><h1>${esc(s.title)}</h1>${tag(s)}</div>${s.description?`<p class="mut">${esc(s.description)}</p>`:''}
    <div class="svk"><div><b>${I.n}</b><span>Tests</span></div><div><b>${I.done}</b><span>Attempted</span></div><div><b>${I.avg!=null?I.avg+'%':'–'}</b><span>Avg score</span></div><div><b>${I.best!=null?I.best+'%':'–'}</b><span>Best</span></div></div>
    ${I.n?`<div class="row sm" style="justify-content:space-between;margin:12px 0 5px"><span class="mut">Series progress</span><b>${I.p}%</b></div><div class="bar"><i style="width:${I.p}%"></i></div>`:''}</div></div>
  ${lockBanner(s)}`;
  if(hl){const st=tStat(hl,liveIds());
    o+=`<div class="card svhl ${st}"><div class="grow"><div class="svhlk">${st==='live'?'<span class="liveb"><i></i>LIVE NOW</span>':st==='prog'?'<span class="chip warn">In progress</span>':`<span class="chip pri">${ic('calendar',12)} Next test</span>`}</div>
     <b>${esc(hl.title)}</b><div class="sm mut">${hl.questions} questions · ${hl.duration} min${st==='wait'?' · '+esc(fmtWhen(hl.opens_at)):''}</div></div>
     ${st==='wait'?`<button class="btn soft sm" onclick="remindMe('${hl.id}')">${ic('calendar',14)} Remind</button>`:`<button class="btn sm" onclick="openTest('${hl.id}')">${st==='prog'?'Resume':'Start'} ${ic('right',14)}</button>`}</div>`;}
  o+=filesBlock(s);
  if(folders.length){
    o+=`<div class="h2s">${ic('folder',20)} Folders <span class="n">${folders.length}</span></div><div class="fgrid">${folders.map(f=>{
      const ts=CAT.tests.filter(t=>t.folder_id===f.id),d=ts.filter(t=>t.attempts>0).length,p=ts.length?Math.round(d*100/ts.length):0;
      return `<div class="card fcard fc2" onclick="location.hash='#/f/${f.id}'"><div class="fico">${ic('folder',22)}</div><div style="flex:1;min-width:0"><b>${esc(f.title)}</b><span class="sm mut">${ts.length} test${ts.length===1?'':'s'}${ts.length?` · ${d} done`:''}</span>${ts.length?`<div class="bar" style="margin-top:7px"><i style="width:${p}%"></i></div>`:''}</div>${ic('right')}</div>`}).join('')}</div>`;
  }
  const root=CAT.tests.filter(t=>t.series_id===id&&!t.folder_id);
  if(root.length)o+=`<div class="h2s">${ic('file',20)} Tests <span class="n">${root.length}</span></div><div id="svf">${svFilt(root)}</div><div id="svl">${svList(root)}</div>`;
  if(!folders.length&&!root.length)o+=`<div class="card empty" style="margin-top:16px">No tests in this series yet.</div>`;
  setApp(o+'</div>');
}
function svFilt(root){
  const L=liveIds(),c={all:root.length,new:0,done:0,wait:0};root.forEach(t=>{const s=tStat(t,L);if(s==='new'||s==='live'||s==='prog')c.new++;else if(s==='done')c.done++;else if(s==='wait')c.wait++});
  if(root.length<4)return '';
  const b=(k,t)=>c[k]||k==='all'?`<button class="chip ${SVF===k?'pri':''}" onclick="SVF='${k}';svDraw()">${t} <small>${c[k]}</small></button>`:'';
  return `<div class="chiprow">${b('all','All')}${b('new','To attempt')}${b('done','Attempted')}${b('wait','Upcoming')}</div>`;
}
function svList(root){
  const L=liveIds(),l=root.filter(t=>{const s=tStat(t,L);return SVF==='all'||(SVF==='new'?['new','live','prog'].includes(s):SVF===s)});
  return l.length?l.map(t=>testRow(t)).join(''):`<div class="card empty sm">No tests here.</div>`;
}
function svDraw(){const root=CAT.tests.filter(t=>t.series_id===SVID&&!t.folder_id),f=$('#svf'),l=$('#svl');if(f)f.innerHTML=svFilt(root);if(l)l.innerHTML=svList(root)}

/* ---------- test rows: status stripe + LIVE badge ---------- */
{const _tr=testRow;testRow=function(t){
  const st=tStat(t,liveIds());
  let h=_tr(t).replace('class="card trow"',`class="card trow st-${st}"`);
  if(st==='live')h=h.replace('<span class="chip pri">New</span>','<span class="liveb"><i></i>LIVE</span>');
  return h;
}}

/* ---------- phone notifications: one-tap switch, friendly help when the browser has blocked them ---------- */
const npInApp=()=>/FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|; wv\)|\bwv\b/i.test(navigator.userAgent);
function npSw(){const w=document.getElementById('npsw');if(w){w.classList.toggle('on',npOn());const sm=w.parentElement.querySelector('small');if(sm)sm.textContent=npOn()?'On · new notices appear on your phone':'Get new notices in your phone’s notification bar'}}
function npEnable(){LS.set('cbt_np',1);LS.set('cbt_np_last',Math.max(LS.get('cbt_np_last',0),...(ANN||[]).map(x=>x.at),Date.now()-6e4));npSw();toast('Phone notifications on 🔔')}
async function npToggle(){
  if(npOn()){LS.set('cbt_np',0);npSw();toast('Phone notifications off');return}
  if(!npSup()||npInApp())return npHelp('app');
  let r=Notification.permission;
  if(r==='default'){try{r=await Notification.requestPermission()}catch(e){r=Notification.permission}}
  if(r==='granted')return npEnable();
  npHelp(r==='denied'?'blocked':'ask');
}
function npHelp(kind){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent),url=location.href.split('#')[0];
  const chrome=/android/i.test(navigator.userAgent)?`intent://${url.replace(/^https?:\/\//,'')}#Intent;scheme=https;package=com.android.chrome;end`:url;
  const steps=kind==='app'?(ios?[['Tap <b>⋯</b> or the share button at the top'],['Choose <b>Open in Safari</b>'],['Add the site to your Home Screen, open it from there and turn notifications on']]
      :[['Tap <b>⋮</b> at the top right'],['Choose <b>Open in Chrome</b> (or "Open in browser")'],['Open Settings there and turn notifications on']])
    :ios?[['Add this site to your <b>Home Screen</b> (Share → Add to Home Screen)'],['Open it from the Home Screen icon'],['Turn on Phone Notifications again and tap <b>Allow</b>']]
    :[['Tap the <b>🔒 lock / ⓘ icon</b> next to the website address at the top'],['Tap <b>Permissions</b> → <b>Notifications</b>'],['Choose <b>Allow</b>, then come back here — it switches on by itself']];
  sheet(`<h2 class="sht">${ic('bell',20)} Turn on notifications</h2><div class="shl"></div>
   <p class="sm mut" style="margin:0 0 12px">${kind==='app'?'You opened the site inside another app (like WhatsApp or Telegram). Notifications only work in your phone’s browser.':kind==='blocked'?'Notifications were blocked for this site earlier. Your phone only lets <b>you</b> unblock them — it takes 10 seconds:':'Tap <b>Allow</b> when your phone asks. If no question appeared, do this once:'}</p>
   <ol class="isteps">${steps.map((x,i)=>`<li><b class="n">${i+1}</b><span>${x[0]}</span></li>`).join('')}</ol>
   ${kind==='app'?`<a class="btn block" style="text-decoration:none" href="${esc(chrome)}">${ic('right',16)} Open in Chrome</a>`:`<button class="btn block" onclick="npRetry()">${ic('check',16)} I have allowed it — check again</button>`}
   <p class="sm mut" style="margin:12px 0 0;text-align:center">Notices will always appear on the 🔔 bell inside the app too.</p>`,'nphelp');
}
async function npRetry(){
  let r=npSup()?Notification.permission:'denied';
  if(r==='default'){try{r=await Notification.requestPermission()}catch(e){}}
  if(r==='granted'){closeModal();npEnable();openSettings()}else toast('Still blocked — follow the steps above')
}
if(npSup()&&navigator.permissions&&navigator.permissions.query)navigator.permissions.query({name:'notifications'}).then(p=>{p.onchange=()=>{
  if(p.state==='granted'&&LS.get('cbt_np',0)!==1&&AUTH){npEnable();const h=document.querySelector('#layer .bsheet[data-id="nphelp"]');if(h)closeModal()}}}).catch(()=>{});

/* ---------- one-time "turn on notifications" popup for new users ---------- */
let NPASKT=null;
function npAskMaybe(){
  clearTimeout(NPASKT);
  if(!AUTH||INTEST||!npSup()||npInApp())return;
  const k='cbt_npask_'+AUTH.mobile;if(LS.get(k,0))return;
  if(Notification.permission==='granted'){if(LS.get('cbt_np',0)!==1)npEnable();LS.set(k,1);return}
  if(Notification.permission==='denied'){LS.set(k,1);return}
  NPASKT=setTimeout(()=>{
    if(INTEST||location.hash.replace('#','').replace('/','')!==''||$('#layer').innerHTML)return;
    LS.set(k,1);
    sheet(`<div class="npask"><div class="npbell">${ic('bell',34)}<i></i></div>
     <h2>Never miss an update</h2><p class="mut">Turn on notifications to know instantly when a new test goes live, results are out or your teacher posts a notice.</p>
     <div class="npli"><span>🔴 New test is live</span><span>📊 Results &amp; ranks</span><span>📢 Important notices</span></div>
     <button class="btn block" onclick="npAskYes()">${ic('bell',16)} Allow notifications</button>
     <button class="btn ghost block" style="margin-top:8px" onclick="closeModal()">Not now</button>
     <p class="sm mut" style="margin:10px 0 0">You can change this any time in ☰ Menu → Settings.</p></div>`,'npask');
  },2500);
}
async function npAskYes(){
  let r=Notification.permission;
  if(r==='default'){try{r=await Notification.requestPermission()}catch(e){r=Notification.permission}}
  closeModal();
  if(r==='granted')npEnable();else if(r==='denied')npHelp('blocked');
}
{const _vh2=viewHome;viewHome=function(tab){const r=_vh2.apply(this,arguments);if(tab==='dash')npAskMaybe();return r}}

/* ---------- Web Push: lets notices reach the phone even when the app is closed ---------- */
const b64u=s=>{const p='='.repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,c=>c.charCodeAt(0))};
async function pushSync(force){
  try{
    if(!AUTH||!CFG.VAPID_PUBLIC||!npSup()||!('PushManager' in window)||Notification.permission!=='granted'||LS.get('cbt_np',0)!==1)return;
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(CFG.VAPID_PUBLIC)});
    const k=AUTH.mobile+'|'+sub.endpoint,last=LS.get('cbt_push_ok',null);
    if(!force&&last&&last.k===k&&Date.now()-last.t<3*864e5)return;
    const r=await rpc('cbt_push_save',{p_sub:sub.toJSON(),p_on:true});
    if(r&&r.ok)LS.set('cbt_push_ok',{k,t:Date.now()});
  }catch(e){}
}
async function pushOff(){
  try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(sub){await rpc('cbt_push_save',{p_sub:sub.toJSON(),p_on:false});await sub.unsubscribe()}LS.del('cbt_push_ok')}catch(e){}
}
{const _en=npEnable;npEnable=function(){_en();pushSync(true)}}
{const _tg=npToggle;npToggle=async function(){const was=npOn();await _tg();if(was&&!npOn())pushOff()}}
setTimeout(()=>pushSync(),4000);
;(window.__p=window.__p||{})['app9']=1;
