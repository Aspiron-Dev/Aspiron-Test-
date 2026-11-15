/* ===== xguard.js: a LIVE test is a closed-book screen =====
   Strict only for a live-window attempt: a test that is not practice and whose result time (or "Live ends" when there is
   no result time) has not come yet. Practice tests, and re-attempts after the result time, are not restricted.

   While a strict test runs:
   - the page goes to the background (another app, home button, a call, the screen locking, a reload) -> the test is submitted
     at once with the answers on the phone (a keepalive request that outlives the page); when the student is back they see the result
     or "result later" page and a short notice.
   - the window loses focus for 2.5 s (a floating or split-screen app) -> a "come back" countdown, then the same submit.
   - Back (button or gesture) -> a small "Leave test?" popup first: Stay or Submit.
   - copy, cut, paste, select, drag, long-press menu, print and the usual copy / save / print keys are blocked; links do not open.
   - a faint watermark with the student's name and masked number is drawn over the screen (a screenshot cannot be blocked by a
     web page or an installed web app, but a leaked one can be traced).
   - the screen is kept awake (Wake Lock) so the phone does not lock while the student reads.
   Nothing here changes the server: it uses the same cbt_submit (safe to send twice: the client id returns the same result). */
(function(){
'use strict';
const XG={on:false,hi:false,wl:null,blurT:0,blurC:0,popup:false,show:false,it:null,reason:''};
window.XG=XG;
const liveEnd=t=>t?(t.result_at||t.closes_at||0):0;
// is this attempt a live-window attempt? (decided once when it starts, then kept with the attempt)
function isStrict(){
  try{
    if(!P||!T||T.practice)return false;
    if(typeof P.strict==='boolean')return P.strict;
    const t=(typeof CAT!=='undefined'&&CAT&&CAT.tests||[]).find(x=>x.id===P.tid),e=liveEnd(t);
    const s=!!(t&&!t.practice&&e&&srvNow()<e);
    P.strict=s;try{saveProg()}catch(x){}
    return s;
  }catch(e){return false}
}

/* ---------- styles ---------- */
const css=document.createElement('style');
css.textContent=`
body.xg-on #app,body.xg-on #app *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
body.xg-on img{-webkit-user-drag:none;user-drag:none}
@media print{body.xg-on{display:none!important}}
#xgWm{position:fixed;inset:0;z-index:35;pointer-events:none;opacity:.09;background-repeat:repeat}
#xgBlur{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:rgba(12,14,20,.92);color:#fff;font-family:inherit}
#xgBlur div{max-width:320px}
#xgBlur b{display:block;font-size:22px;margin-bottom:8px}
#xgBlur p{margin:0 0 14px;font-size:15px;line-height:1.5;opacity:.85}
#xgBlur i{font-style:normal;display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;font-size:30px;font-weight:800;background:#ef2d3c}
.xgp h2{margin:0 0 4px}.xgp p{margin:0 0 14px}
`;
document.head.appendChild(css);

/* ---------- start / stop ---------- */
function watermark(){
  try{
    const nm=String((AUTH&&AUTH.name)||'').replace(/[<>&"']/g,'').slice(0,24),mb=String((AUTH&&AUTH.mobile)||'').replace(/\D/g,''),m=mb?mb.slice(0,2)+'xxxxxx'+mb.slice(-2):'';
    const tx=(nm+' '+m).trim();if(!tx)return;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><text x="20" y="90" transform="rotate(-24 120 70)" font-family="sans-serif" font-size="15" font-weight="700" fill="#808080">${tx}</text></svg>`;
    const d=document.createElement('div');d.id='xgWm';d.style.backgroundImage='url("data:image/svg+xml;utf8,'+encodeURIComponent(svg)+'")';document.body.appendChild(d);
  }catch(e){}
}
async function wake(){try{if('wakeLock' in navigator){XG.wl=await navigator.wakeLock.request('screen')}}catch(e){}}
function unwake(){try{if(XG.wl){XG.wl.release();XG.wl=null}}catch(e){}}
function xgStart(){
  if(!isStrict()){xgStop();return}
  if(XG.on)return;
  XG.on=true;XG.hi=(T&&T.lang==='hi');XG.popup=false;
  document.body.classList.add('xg-on');watermark();wake();
  try{history.pushState({xg:1},'',location.href)}catch(e){}   // one guard entry: Back lands on it first
}
function xgStop(){
  XG.on=false;document.body.classList.remove('xg-on');
  const w=document.getElementById('xgWm');if(w)w.remove();
  clearBlur();unwake();
}
window.xgStrictNow=()=>XG.on;

/* ---------- leaving: submit at once ---------- */
function xgLeave(reason){
  if(!XG.on||!INTEST||!P)return;
  XG.on=false;
  try{flushT()}catch(e){}
  const it={tid:P.tid,cid:P.cid,ans:P.ans,times:P.times||{},title:(T&&T.title)||P.title,ts:Date.now()};
  const hi=XG.hi;
  try{addPend(it)}catch(e){}
  try{   // the same request the page makes, sent so that it outlives the page
    fetch(API+'/rest/v1/rpc/cbt_submit',{method:'POST',keepalive:true,headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_mobile:AUTH.mobile,p_code:AUTH.code,p_device:DEV,p_test:it.tid,p_answers:subAns(it),p_client_id:it.cid})});
  }catch(e){}
  try{LS.del(progKey(it.tid));LS.del(tdKey(it.tid))}catch(e){}
  try{clearInterval(timer);window.onbeforeunload=null}catch(e){}
  INTEST=false;P=null;T=null;document.body.classList.remove('intest');
  xgStop();
  XG.it=it;XG.reason=reason;XG.hi=hi;XG.suppress=(reason!=='blur');   // the 'please stay' warning would only repeat the notice
  if(document.hidden)XG.show=true;else xgShow();
}
async function xgShow(){
  const it=XG.it;if(!it)return;XG.it=null;XG.show=false;
  const hi=XG.hi;
  XG.noRev=true;
  try{await sendPending(it)}catch(e){}
  setTimeout(()=>{XG.noRev=false},4000);
  try{closeModal()}catch(e){}
  modal(`<div class="xgp"><div class="logo" style="background:var(--warn,#e8750a)">${ic('info',24)}</div>
    <h2>${hi?'टेस्ट submit हो गया':'Test submitted'}</h2>
    <p class="mut">${hi?'आप टेस्ट स्क्रीन से बाहर गए, इसलिए आपका टेस्ट अपने आप submit हो गया।':'You left the test screen, so your test was submitted automatically.'}</p>
    <button class="btn block" onclick="closeModal()">OK</button></div>`);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(XG.on)xgLeave('hidden')}
  else if(XG.show){XG.show=false;xgShow()}
});
addEventListener('pagehide',()=>{if(XG.on)xgLeave('pagehide')});

/* ---------- a floating or split-screen app: the window is not in focus ---------- */
function clearBlur(){clearInterval(XG.blurT);XG.blurT=0;const o=document.getElementById('xgBlur');if(o)o.remove()}
addEventListener('blur',()=>{
  if(!XG.on||document.hidden||XG.blurT)return;
  const hi=XG.hi;let n=3;
  const o=document.createElement('div');o.id='xgBlur';
  o.innerHTML=`<div><b>${hi?'टेस्ट पर वापस आएँ':'Come back to the test'}</b><p>${hi?'दूसरी विंडो बंद करें, नहीं तो टेस्ट submit हो जाएगा।':'Close the other window or the test will be submitted.'}</p><i id="xgN">${n}</i></div>`;
  document.body.appendChild(o);
  XG.blurT=setInterval(()=>{n--;const e=document.getElementById('xgN');if(e)e.textContent=Math.max(0,n);if(n<=0){clearBlur();xgLeave('blur')}},1000);
});
addEventListener('focus',()=>{if(XG.blurT)clearBlur()});

/* ---------- Back: a small popup first ---------- */
addEventListener('popstate',()=>{
  if(!XG.on||!INTEST)return;
  try{history.pushState({xg:1},'',location.href)}catch(e){}   // keep the guard in place
  if(XG.popup)return;XG.popup=true;
  const hi=XG.hi;
  modal(`<div class="xgp"><h2>${hi?'टेस्ट छोड़ें?':'Leave test?'}</h2><p class="mut">${hi?'छोड़ने पर टेस्ट submit हो जाएगा।':'Leaving submits your test.'}</p>
    <div class="row"><button class="btn" style="flex:1" onclick="xgStay()">${hi?'रुकें':'Stay'}</button><button class="btn danger" style="flex:1" onclick="xgSubmitNow()">${hi?'Submit करें':'Submit'}</button></div></div>`);
});
window.xgStay=()=>{XG.popup=false;closeModal()};
window.xgSubmitNow=()=>{XG.popup=false;closeModal();xgStop();finish(false)};

/* ---------- no copying, selecting, printing, opening links ---------- */
const stop=e=>{if(XG.on){e.preventDefault();e.stopPropagation()}};
['copy','cut','paste','contextmenu','selectstart','dragstart'].forEach(ev=>document.addEventListener(ev,stop,true));
document.addEventListener('keydown',e=>{
  if(!XG.on)return;
  const k=(e.key||'').toLowerCase(),c=e.ctrlKey||e.metaKey;
  if(c&&['c','x','a','p','s','u','v'].includes(k)||e.key==='F12'||(c&&e.shiftKey&&['i','j','c','s'].includes(k))||e.key==='PrintScreen'){e.preventDefault();e.stopPropagation()}
},true);
document.addEventListener('keyup',e=>{if(XG.on&&e.key==='PrintScreen'){try{navigator.clipboard.writeText(' ')}catch(x){}}},true);
document.addEventListener('click',e=>{if(!XG.on)return;const a=e.target.closest&&e.target.closest('a[href]');if(a){e.preventDefault();e.stopPropagation()}},true);

/* ---------- hooks into the exam ---------- */
{const _run=run;run=function(){const r=_run.apply(this,arguments);xgStart();return r}}
{const _fin=finish;finish=function(){xgStop();return _fin.apply(this,arguments)}}
{const _lw=leaveWarn;leaveWarn=function(){if(XG.suppress){XG.suppress=false;return}return _lw.apply(this,arguments)}}
})();
