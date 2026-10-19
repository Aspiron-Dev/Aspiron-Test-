/* ===== Cheating & suspension (student side) =====
   Server: supabase_v24_cheating.sql. A suspended student's login is refused by the database (status "blocked");
   here every "blocked" answer is checked: if it is a suspension, a full-screen notice with a Support button
   covers the app until the admin lifts it (or its time is over). Results the admin marked show a 🚩 tag. */
let SUSP=null,CHEAT=new Set();
{const _rpc=rpc;rpc=async function(fn,args,noAuth){
  const r=await _rpc(fn,args,noAuth);
  if(!r||r.error!=='blocked'||fn==='cbt_suspension')return r;
  const m=noAuth?args&&args.p_mobile:AUTH&&AUTH.mobile,c=noAuth?args&&args.p_code:AUTH&&AUTH.code;
  if(!m||!c)return r;
  const s=await _rpc('cbt_suspension',{p_mobile:m,p_code:c},true);
  if(s.ok&&s.suspended){
    // keep the sign-in, so the notice comes back every time the app is opened
    if(!AUTH||AUTH.mobile!==m){AUTH={mobile:m,code:c,name:(AUTH&&AUTH.name)||''};LS.set('cbt_auth',AUTH)}
    suspShow(s);return{ok:false,error:'suspended'};
  }
  if(s.ok&&s.ended)return _rpc(fn,args,noAuth);     // the time just ran out: try again
  return r;
}}
{const _et=errText;errText=function(r){return r&&r.error==='suspended'?'Your account is suspended. Please contact the support team.':_et(r)}}

function suspShow(s){
  SUSP=s;INTEST=false;document.body.classList.remove('intest');
  const until=s.until?new Date(s.until).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
  const wa=AUTH?`Hello, I am ${AUTH.name||''} (${AUTH.mobile}). My account is suspended. I want to talk about it.`:'';
  let d=document.getElementById('susp');
  if(!d){d=document.createElement('div');d.id='susp';d.setAttribute('role','alertdialog');d.setAttribute('aria-modal','true');document.body.appendChild(d)}
  d.innerHTML=`<div class="spbox"><div class="spic">⚠️</div><h2>Account suspended</h2>
   <p class="spw">You were found <b>cheating in a test</b>. Your ID has been suspended. Talk to the support team within <b>24 hours</b> to solve this matter — until then you cannot use the app or the website.</p>
   ${s.reason?`<div class="spr"><b>Message from the admin</b><p>${esc(s.reason)}</p></div>`:''}
   <div class="spt">${until?`Suspended until <b>${esc(until)}</b>`:'Suspended until the admin removes it'}</div>
   <div class="supgrid sp2">${(SUPMSG=wa,supBtns())}</div>
   <p class="sm mut" style="margin:6px 0 0">Your message is copied — paste it in the chat. Chat only, no calls.</p>
   <button class="btn ghost block" style="margin-top:10px" onclick="suspCheck(this)">↻ Check again</button>
   <button class="spout" onclick="suspOut()">Sign out</button></div>`;
}
async function suspCheck(b){
  if(!AUTH)return;b.disabled=true;b.textContent='Checking…';
  const s=await rpc('cbt_suspension',{p_mobile:AUTH.mobile,p_code:AUTH.code},true);
  b.disabled=false;b.textContent='↻ Check again';
  if(s.ok&&s.suspended){suspShow(s);toast('Still suspended');return}
  if(s.ok){const d=document.getElementById('susp');if(d)d.remove();SUSP=null;CAT=null;toast('Your account is active again ✓');location.hash='#/';route();return}
  toast(errText(s));
}
// while the notice is on screen, check by itself every 20 s and when the app comes back to the front,
// so a lifted suspension disappears without the student having to do anything
let SUSPT=null;
async function suspAuto(){
  if(!SUSP||!AUTH||!document.getElementById('susp'))return;
  const s=await rpc('cbt_suspension',{p_mobile:AUTH.mobile,p_code:AUTH.code},true);
  if(s.ok&&!s.suspended){const d=document.getElementById('susp');if(d)d.remove();SUSP=null;CAT=null;toast('Your account is active again ✓');location.hash='#/';route()}
}
setInterval(()=>{if(SUSP&&!document.hidden)suspAuto()},20000);
document.addEventListener('visibilitychange',()=>{if(SUSP&&!document.hidden)suspAuto()});
function suspOut(){const d=document.getElementById('susp');if(d)d.remove();SUSP=null;AUTH=null;LS.del('cbt_auth');CAT=null;login()}

/* ---------- 🚩 tag on results the admin marked as cheating ---------- */
async function cheatLoad(){
  if(!AUTH)return;const r=await rpc('cbt_my_flags',{});
  if(r.ok)CHEAT=new Set((r.tests||[]).map(String));
}
{const _lc=loadCat;loadCat=async function(silent){const ok=await _lc(silent);if(ok)await cheatLoad().catch(()=>{});return ok}}
const CHBAN=`<div class="card chban">🚩 <div><b>Marked for cheating</b><div class="sm">The admin marked this test as cheating. Your rank in it is moved to the last place.</div></div></div>`;
{const _sr=showResult;showResult=function(){
  const r=_sr.apply(this,arguments);
  if(RV&&RV.result&&CHEAT.has(String(RV.result.test_id))){const h=document.querySelector('#app .rhero');if(h)h.insertAdjacentHTML('beforebegin',CHBAN)}
  return r;
}}
{const _vh=viewHistory;viewHistory=function(key){
  const r=_vh.apply(this,arguments);
  const g=hAttempts(key),t=g&&g.att&&g.att[0]&&g.att[0].test_id;
  if(t&&CHEAT.has(String(t))){const h=document.querySelector('#app h1.tkh');if(h)h.insertAdjacentHTML('afterend',CHBAN)}
  return r;
}}
;(window.__p=window.__p||{})['app15']=1;
