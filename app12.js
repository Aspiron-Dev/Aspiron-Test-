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
    return `<div class="card upc ${td?'today':''}" onclick="openTest('${t.id}')"><div class="livet">${td?'<span class="liveb lvtd"><i></i>LIVE TODAY</span>':`<span class="upb">${ic('calendar',12)} SCHEDULED</span>`}<span class="sm mut">${at}</span></div>
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
