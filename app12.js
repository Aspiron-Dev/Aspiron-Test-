/* ===== v23: Home — scheduled tests show under the countdown as soon as they are scheduled ===== */
// Upcoming → "Scheduled" card with date and a running timer; on the day it opens → "LIVE TODAY" animation; once open → the LIVE card.
function upTests(){
  const now=srvNow(),W=30*864e5;
  return CAT.tests.filter(t=>!t.locked&&!t.attempts&&!t.in_progress&&!t.practice&&isWait(t)&&t.opens_at-now<W&&CAT.series.some(s=>s.id===t.series_id))
    .sort((a,b)=>a.opens_at-b.opens_at).slice(0,2);
}
const upToday=t=>new Date(t.opens_at).toDateString()===new Date(srvNow()).toDateString();
function upLeft(ms){
  if(ms<=0)return 'Starting…';
  const s=Math.floor(ms/1e3),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60,p=n=>String(n).padStart(2,'0');
  return d?`${d}d ${p(h)}h ${p(m)}m ${p(x)}s`:`${p(h)}:${p(m)}:${p(x)}`;
}
function upHtml(){
  return upTests().map(t=>{const s=CAT.series.find(x=>x.id===t.series_id)||{},td=upToday(t),when=new Date(t.opens_at);
    const at=td?'Today, '+when.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):when.toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
    return `<div class="card upc ${td?'today':''}" onclick="openTest('${t.id}')"><div class="livet">${td?'<span class="liveb lvtd"><i></i>LIVE TODAY</span>':`<span class="upb">${ic('calendar',12)} SCHEDULED</span>`}<span class="sm mut grow">${at}</span>${alBtn(t.id,0)}</div>
     <b class="livett">${esc(t.title)}</b><div class="sm mut">${esc(s.title||'')}${s.title?' · ':''}${t.questions} questions · ${t.duration} min</div>
     <div class="upt"><span>Starts in</span><b data-up="${t.opens_at}">${upLeft(t.opens_at-srvNow())}</b></div></div>`}).join('');
}
let upIv=null;
function upTick(){
  clearInterval(upIv);upIv=null;
  if(!document.querySelector('[data-up]'))return;
  upIv=setInterval(()=>{
    const L=document.querySelectorAll('[data-up]');if(!L.length){clearInterval(upIv);upIv=null;return}
    let open=0;L.forEach(e=>{const ms=+e.dataset.up-srvNow();e.textContent=upLeft(ms);if(ms<=0)open=1});
    // the moment a test opens, redraw home so it turns into the LIVE card
    if(open){clearInterval(upIv);upIv=null;setTimeout(()=>{if(document.querySelector('.home2'))viewHome('dash')},1200)}
  },1000);
}
{const _lh=liveHtml;liveHtml=function(){setTimeout(upTick,0);return _lh()+upHtml()}}
;(window.__p=window.__p||{})['app12']=1;

/* ===== Test alerts: tap 🔔 on a scheduled test → phone notification the moment it goes LIVE ===== */
// The server (Supabase cron + "test-alerts" function) sends it, so it arrives even when the app is closed.
IC.bellon='<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z" fill="currentColor"/><path d="M13.7 21a2 2 0 01-3.4 0"/>';
const alKey=()=>'cbt_al_'+AUTH.mobile;
const alGet=()=>LS.get(alKey(),{})||{};
const alOn=id=>!!alGet()[id];
function alBtn(id,big){
  const on=alOn(id);
  return `<button class="btn ${on?'':'soft'} sm albtn ${on?'on':''}" data-al="${id}" onclick="event.stopPropagation();alertToggle('${id}')" title="${on?'Alert is on':'Notify me when it goes live'}">${ic(on?'bellon':'bell',15)}${big===0?'':`<span>${on?'Alert on':'Notify me'}</span>`}</button>`;
}
function alPaint(){document.querySelectorAll('[data-al]').forEach(b=>{const t=document.createElement('div');t.innerHTML=alBtn(b.dataset.al,b.querySelector('span')?1:0);b.replaceWith(t.firstElementChild)})}
let alBusy=0;
async function alertToggle(id){
  if(alBusy)return;const t=CAT.tests.find(x=>x.id===id);if(!t)return;
  const on=alOn(id);
  if(!on){
    if(!t.opens_at||t.opens_at<=srvNow())return toast('This test is already live — open it now');
    if(!npSup()||npInApp())return npHelp('app');
    let p=Notification.permission;
    if(p==='default'){try{p=await Notification.requestPermission()}catch(e){p=Notification.permission}}
    if(p!=='granted')return npHelp('blocked');
    if(!npOn())npEnable();else await pushSync(true);
  }
  alBusy=1;
  const r=await rpc('cbt_alert_set',{p_test:id,p_on:!on});alBusy=0;
  if(!r||!r.ok){
    if(r&&r.error==='already_live')return toast('This test is already live — open it now');
    return toast(r&&r.status===404?'Test alerts are not set up yet. Please tell your teacher.':r&&r.error==='network'?'No internet. Try again.':'Could not save. Try again.');
  }
  const m=alGet();if(on)delete m[id];else m[id]=t.opens_at;LS.set(alKey(),m);alPaint();
  toast(on?'Alert off':'🔔 Done! We will notify you when "'+t.title+'" goes live');
}
// keep the bells in sync with the server, and re-save alerts whose test time was changed by the teacher
let alSynced=0;
async function alSync(){
  if(alSynced||!AUTH||!CAT||!CAT.tests)return;alSynced=1;
  const r=await rpc('cbt_alert_list',{});if(!r||!r.ok)return;
  const srv=new Set(r.items||[]),m={},old=alGet();
  for(const id of srv){const t=CAT.tests.find(x=>x.id===id);if(!t)continue;m[id]=t.opens_at;
    if(old[id]&&t.opens_at&&old[id]!==t.opens_at&&t.opens_at>srvNow())rpc('cbt_alert_set',{p_test:id,p_on:true})}
  LS.set(alKey(),m);alPaint();
}
remindMe=id=>alertToggle(id);
{const _up=upHtml;upHtml=function(){setTimeout(alSync,0);return _up()}}
