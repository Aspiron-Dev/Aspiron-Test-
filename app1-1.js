
const $=s=>document.querySelector(s);
const LS={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=sec=>{sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')};
const uuid=()=>(crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const IC={
 search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
 palette:'<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a2.5 2.5 0 01-.5-4.9c1-.2 1.5-.8 1.5-1.6 0-.9.7-1.5 1.6-1.5H18"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 file:'<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
 right:'<path d="M9 6l6 6-6 6"/>',left:'<path d="M15 6l-6 6 6 6"/>',
 trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
 play:'<path d="M7 4l13 8-13 8z"/>',check:'<path d="M5 12l5 5L20 7"/>',
 lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 back:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
 folder:'<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
 logout:'<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
 book:'<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5V21h16"/>',
 crown:'<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"/>',
 msg:'<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
 wifi:'<path d="M1 1l22 22M16.7 11.1A10.9 10.9 0 0119 12.6M5 12.6a10.9 10.9 0 015.2-2.5M8.5 16.1a6 6 0 016.9 0M12 20h.01"/>',
 eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
 star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
 download:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
 home:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
 x:'<path d="M6 6l12 12M18 6L6 18"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M16 7l3 3M14 9l2 2"/>'
};
const ic=(n,s)=>`<svg class="i" viewBox="0 0 24 24"${s?` style="width:${s}px;height:${s}px"`:''}>${IC[n]}</svg>`;
const L='ABCD';
const CFG=window.CBT_CONFIG||{};
const API=String(CFG.SUPABASE_URL||'').replace(/\/$/,'');
const cloud=!!(API&&CFG.SUPABASE_KEY);

/* ---------- device id ---------- */
function devId(){
  let d=LS.get('cbt_dev',null);
  if(!d||String(d).length<8){
    try{d=Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){d=(Math.random().toString(16).slice(2)+Math.random().toString(16).slice(2)).slice(0,20)}
    LS.set('cbt_dev',d);
  }
  return d;
}
const DEV=devId();

/* ---------- state ---------- */
let AUTH=LS.get('cbt_auth',null);      // {mobile, code, name}
let SOFF=0, BM=new Set(), SEC=null, FILEURL={}, opTimer=null;
let CAT=null, T=null, P=null, timer=null, INTEST=false, palOpen=false, warned=false, RV=null, retryT=null, RET='#/', LOGINERR='';

/* ---------- api ---------- */
async function rpc(fn,args,noAuth){
  const body=noAuth?args:Object.assign({p_mobile:AUTH.mobile,p_code:AUTH.code,p_device:DEV},args||{});
  const ac=new AbortController(),tmo=setTimeout(()=>ac.abort(),25000);
  try{
    const r=await fetch(API+'/rest/v1/rpc/'+fn,{signal:ac.signal,method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)return{ok:false,error:'server',status:r.status};
    return await r.json();
  }catch(e){return{ok:false,error:'network'}}finally{clearTimeout(tmo)}
}
const AUTHERR=['invalid','blocked','pending','device_limit','locked','device'];
function errText(r){
  switch(r&&r.error){
    case 'invalid':return 'Mobile number or access code is incorrect.';
    case 'pending':return 'Your request is waiting for approval. You will receive your access code once the admin approves it.';
    case 'blocked':return 'Your access has been blocked. Please contact the admin.';
    case 'locked':return `Too many wrong attempts. Please try again in ${r.wait||15} minutes.`;
    case 'device_limit':return 'This code is already active on the maximum number of devices. Ask the admin to reset your devices.';
    case 'network':return 'No internet connection. Please check and try again.';
    default:return 'Something went wrong. Please try again.';
  }
}
function authErr(r){
  if(r&&!r.ok&&AUTHERR.includes(r.error)){
    LOGINERR=r.error==='invalid'?'Your session is no longer valid. Please sign in again.':errText(r);
    AUTH=null;LS.del('cbt_auth');CAT=null;INTEST=false;document.body.classList.remove('intest');login();
    return true;
  }
  return false;
}

/* ---------- theme / header / helpers ---------- */
function updateTheme(){$('#thm').innerHTML=ic('palette');syncTheme()}
function themeSwap(fn){try{if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion:reduce)').matches){document.startViewTransition(fn);return}}catch(e){}fn()}
function applyMode(t){const h=document.documentElement;h.dataset.theme=t==='light'?'light':'dark';if(t==='oled')h.dataset.oled='1';else delete h.dataset.oled}
function curMode(){const D=document.documentElement.dataset;return D.theme==='light'?'light':D.oled==='1'?'oled':'dark'}
function setMode(t){LS.set('cbt_theme',t);themeSwap(()=>{applyMode(t);syncTheme();openLook(1)})}
function setAccent(a){LS.set('cbt_accent',a);themeSwap(()=>{document.documentElement.dataset.accent=a;syncTheme();openLook(1)})}
function updateHeader(){
  mnuUpdate();
  {const bl=document.getElementById('bell');if(bl){bl.innerHTML=ic('bell',20);bl.style.display=AUTH?'':'none'}}
  $('#lg').innerHTML=ic('target',20);
  $('#sn').textContent=CFG.SITE_NAME||'CBT Test Series';{const sp=document.getElementById('spn');if(sp)sp.textContent=CFG.SITE_NAME||'CBT Test Series'}document.title=CFG.SITE_NAME||'CBT Test Series';
  pfHdr();
}
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
function modal(h){$('#layer').innerHTML=`<div class="modal" onclick="if(event.target===this)closeModal()"><div class="box">${h}</div></div>`}
function closeModal(){$('#layer').innerHTML=''}
const NAVIT=[['dash','#/','Home','target'],['series','#/series','Tests','book'],['mk','#/m','Mistakes','notebook'],['bm','#/b','Saved','star'],['results','#/r','Results','trophy'],['tr','#/t','Tracker','tracker']];
function setNav(tab){
  const bn=$('#bnav');
  if(!bn.children.length)bn.innerHTML=NAVIT.map(x=>`<button data-k="${x[0]}" onclick="location.hash='${x[1]}'">${ic(x[3],22)}${x[2]}</button>`).join('');
  bn.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.k===tab));
  bn.style.setProperty('--i',Math.max(0,NAVIT.findIndex(x=>x[0]===tab)));
  document.body.classList.add('hasnav');
}
let ROUTING=0,PGDX=0;
let SOFT=0;
function setApp(h){if(!ROUTING&&!SOFT||INTEST||!AUTH)document.body.classList.remove('hasnav');clearInterval(opTimer);opTimer=null;const ap=$('#app');ap.innerHTML=h;if(SOFT){ap.classList.remove('pgf');void ap.offsetWidth;ap.classList.add('pgf')}else{window.scrollTo(0,0);pgAnim(ap)}startOp();loadCovers();countUp($('#app'));hideSplash()}
function loading(m){setApp(`<div class="loading"><div><div class="spin"></div>${esc(m||'Loading…')}</div></div>`)}
const GR=[['#1d6fe8','#12a58a'],['#0e7490','#2563eb'],['#15803d','#0ea5a4'],['#334155','#1d6fe8'],['#0f766e','#16a34a'],['#475569','#0d9488']];
function grad(id){let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;const g=GR[h%GR.length];return `linear-gradient(135deg,${g[0]},${g[1]})`}
const pct=(s,m)=>m?Math.max(0,Math.round(s*100/m)):0;
function ring(p,size,sw,col){
  const r=(size-sw)/2,c=2*Math.PI*r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="${sw}"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col||'var(--pri)'}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-Math.min(100,p)/100)}" style="--c:${c};animation:rg 1s cubic-bezier(.22,.8,.24,1) backwards"/></svg>`;
}
const ringCol=p=>p>=60?'var(--ok)':p>=35?'var(--warn)':'var(--bad)';
function waLink(text){
  const n=String(CFG.CONTACT_WHATSAPP||'').replace(/\D/g,'');
  return n?`https://wa.me/${n}?text=${encodeURIComponent(text)}`:'';
}

/* ---------- login / request ---------- */
function login(mode){
  INTEST=false;document.body.classList.remove('intest');clearTimeout(retryT);updateHeader();
  if(!cloud){setApp(`<div class="wrap"><div class="card empty"><b>Website is not connected yet.</b><p class="sm">The admin needs to fill in config.js.</p></div></div>`);return}
  if(mode==='request')return requestView();
  const wa=waLink('Hi, I would like to get access to '+(CFG.SITE_NAME||'the test series')+'.');
  setApp(`<div class="wrap"><div class="card login">
   <div class="logo">${ic('key',26)}</div>
   <h1 style="font-size:26px">Student login</h1>
   <p class="mut" style="margin:6px 0 0">Enter your mobile number and the access code given to you.</p>
   <label class="l">Mobile number</label><input type="tel" id="ph" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number">
   <label class="l">Access code</label><input type="text" id="cd" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" placeholder="e.g. A1B2-C3D4">
   <div id="er" class="sm err" style="min-height:22px;margin-top:8px">${esc(LOGINERR)}</div>
   <button class="btn block" id="lbtn" onclick="doLogin()">Sign in ${ic('right')}</button>
   <div class="divider">New student?</div>
   <button class="btn ghost block" onclick="login('request')">Request access</button>
   ${wa?`<a class="btn soft block" style="margin-top:10px;text-decoration:none" href="${wa}" target="_blank" rel="noopener">${ic('msg')} Contact on WhatsApp</a>`:''}
  </div></div>`);
  LOGINERR='';
  ['ph','cd'].forEach(id=>$('#'+id).addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()}));
}
async function doLogin(){
  const m=$('#ph').value.replace(/\D/g,'').slice(-10),c=$('#cd').value.replace(/[^0-9a-zA-Z]/g,'').toUpperCase();
  if(m.length!==10){$('#er').textContent='Please enter a valid 10-digit mobile number.';return}
  if(c.length<4){$('#er').textContent='Please enter your access code.';return}
  const b=$('#lbtn');b.disabled=true;b.textContent='Checking…';$('#er').textContent='';
  const r=await rpc('cbt_login',{p_mobile:m,p_code:c,p_device:DEV},true);
  if(!r.ok){$('#er').textContent=errText(r);b.disabled=false;b.innerHTML='Sign in '+ic('right');return}
  AUTH={mobile:m,code:c,name:r.name};LS.set('cbt_auth',AUTH);updateHeader();CAT=null;
  await flushPending();
  location.hash='#/';route();
}
function requestView(){
  setApp(`<div class="wrap"><div class="card login" id="rq">
   <button class="btn ghost sm" onclick="login()">${ic('back')} Back</button>
   <h1 style="font-size:24px;margin-top:16px">Request access</h1>
   <p class="mut" style="margin:6px 0 0">Send your details. Once the admin approves you, you will get a personal access code.</p>
   <label class="l">Full name</label><input type="text" id="rn" autocomplete="name" placeholder="e.g. Rahul Sharma">
   <label class="l">Mobile number</label><input type="tel" id="rp" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number">
   <div id="er" class="sm err" style="min-height:22px;margin-top:8px"></div>
   <button class="btn block" id="rbtn" onclick="doRequest()">Send request</button>
  </div></div>`);
}
async function doRequest(){
  const n=$('#rn').value.trim(),m=$('#rp').value.replace(/\D/g,'').slice(-10);
  if(n.length<2){$('#er').textContent='Please enter your name.';return}
  if(m.length!==10){$('#er').textContent='Please enter a valid 10-digit mobile number.';return}
  const b=$('#rbtn');b.disabled=true;b.textContent='Sending…';
  const r=await rpc('cbt_request_access',{p_name:n,p_mobile:m},true);
  if(!r.ok){$('#er').textContent=r.error==='blocked'?'Your access has been blocked. Please contact the admin.':r.error==='busy'?'Too many pending requests right now. Please try again later.':errText(r);b.disabled=false;b.textContent='Send request';return}
  const wa=waLink(`Hi, I am ${n} (${m}). I have requested access to ${CFG.SITE_NAME||'the test series'}.`);
  const msg=r.status==='approved'?`<h2>You are already approved</h2><p class="mut">Go back and sign in with your access code. If you lost your code, ask the admin for a new one.</p>`
    :`<h2>Request sent ✓</h2><p class="mut">The admin will review your request. After approval you will receive an access code on your mobile. Then come back here and sign in.</p>`;
  $('#rq').innerHTML=`<div class="logo" style="background:var(--ok)">${ic('check',26)}</div>${msg}
    ${wa?`<a class="btn soft block" style="margin:8px 0;text-decoration:none" href="${wa}" target="_blank" rel="noopener">${ic('msg')} Message the admin</a>`:''}
    <button class="btn block" onclick="login()">Back to sign in</button>`;
}
function signOut(){
  modal(`<h2>Sign out?</h2><p class="mut">You will need your access code to sign in again. Tests in progress stay saved on this device.</p>
  <div class="row"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn danger" style="flex:1" onclick="doSignOut()">Sign out</button></div>`);
}
function doSignOut(){closeModal();MKC=null;BMC=null;PREF=0;AUTH=null;ANN=null;LS.del('cbt_auth');CAT=null;login()}

/* ---------- catalog / routing ---------- */
let CATAT=0;
async function loadCat(silent){
  const r=await rpc('cbt_catalog',{});
  if(!r.ok){
    if(authErr(r))return false;
    if(!silent)setApp(`<div class="wrap"><div class="card empty">${ic('wifi',30)}<h3 style="margin:10px 0 4px">Could not load</h3><p class="sm">${esc(errText(r))}</p><button class="btn" onclick="route()">Try again</button></div></div>`);
    return false;
  }
  CAT=r;CATAT=Date.now();SOFF=r.now-Date.now();BM=new Set((r.bookmarks||[]).map(b=>b.t+':'+b.i));if(r.name&&AUTH&&AUTH.name!==r.name){AUTH.name=r.name;LS.set('cbt_auth',AUTH);updateHeader()}
  return true;
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&AUTH&&!INTEST&&CAT&&Date.now()-CATAT>30000)route()});
const navTab=h=>/^#\/(s|f)\//.test(h)||h==='#/series'?'series':/^#\/h\//.test(h)||h==='#/r'?'results':h==='#/m'?'mk':h==='#/b'?'bm':h==='#/t'?'tr':'dash';
const NAVRK=h=>{const t=NAVIT.findIndex(x=>x[0]===navTab(h));return /^#\/(s|f|h)\//.test(h)?t+0.5:t};
let LASTRK=null;
function pgAnim(ap){
  if(!PGDX){ap.classList.remove('pg');return}
  const d=PGDX;PGDX=0;ap.style.setProperty('--dx',(d>0?18:-18)+'px');
  ap.classList.remove('pg');void ap.offsetWidth;ap.classList.add('pg');
  clearTimeout(ap._pt);ap._pt=setTimeout(()=>ap.classList.remove('pg'),360);
}
const RMOT=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
async function route(){
  if(INTEST||!AUTH)return;
  const h0=location.hash||'#/',rk=NAVRK(h0);let dir=0;
  if(LASTRK!==null&&rk!==LASTRK)dir=rk>LASTRK?1:-1;
  LASTRK=rk;
  ROUTING++;
  try{
    setNav(navTab(h0));
    if(CAT&&Date.now()-CATAT>30000){await loadCat(true);if(!AUTH||INTEST)return}
    let p=null;
    if(dir&&CAT&&document.startViewTransition&&!RMOT()){
      const H=document.documentElement;H.dataset.vt=dir>0?'f':'b';
      try{
        const vt=document.startViewTransition(()=>{p=route0();return Promise.race([p,new Promise(r=>setTimeout(r,40))])});
        vt.finished.then(()=>{delete H.dataset.vt},()=>{delete H.dataset.vt});
        await vt.updateCallbackDone.catch(()=>{});
      }catch(e){delete H.dataset.vt}
    }
    if(!p){if(dir)PGDX=dir;p=route0()}
    await p;
  }finally{ROUTING--}
}
async function route0(){
  annLoad();
  if(!CAT){skelPage();if(!(await loadCat()))return}
  else if(Date.now()-CATAT>30000){await loadCat(true);if(!AUTH||INTEST)return}
  const h=location.hash||'#/';let m;
  if((m=h.match(/^#\/s\/(.+)$/)))return viewSeries(m[1]);
  if((m=h.match(/^#\/f\/(.+)$/)))return viewFolder(m[1]);
  if(h==='#/r')return viewHome('results');
  if(h==='#/b')return viewBookmarks();
  if(h==='#/m')return viewMistakes();
  if(h==='#/t')return viewTracker();
  if((m=h.match(/^#\/h\/(.+)$/)))return viewHistory(decodeURIComponent(m[1]));
  if(h==='#/series')return viewHome('series');
  return viewHome('dash');
}
window.addEventListener('hashchange',()=>{if(!INTEST)route()});


/* ---------- time helpers / schedule ---------- */
const srvNow=()=>Date.now()+SOFF;
const fmtWhen=ms=>new Date(ms).toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
const fmtCd=sec=>{sec=Math.max(0,Math.floor(sec));const d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60;
  if(d)return d+'d '+h+'h '+m+'m';
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')};
const isWait=t=>t.opens_at&&t.opens_at>srvNow();
let opFired=false;
function startOp(){
  opFired=false;
  if(!document.querySelector('[data-op]'))return;
  const f=()=>{
    let fire=false;
    document.querySelectorAll('[data-op]').forEach(e=>{const left=(+e.dataset.op-srvNow())/1000;if(left<=0)fire=true;else e.textContent=fmtCd(left)});
    if(fire&&!opFired&&!INTEST){opFired=true;clearInterval(opTimer);CAT=null;route()}
  };
  f();opTimer=setInterval(f,1000);
}

/* ---------- covers ---------- */
const COVQ={};
async function loadCovers(){
  document.querySelectorAll('[data-cov]').forEach(async el=>{
    const id=el.dataset.cov,v=+el.dataset.v;if(!id||!v)return;
    let d=null;
    try{const c=JSON.parse(localStorage.getItem('cbt_cov_'+id)||'null');if(c&&c.v===v)d=c.d}catch(e){}
    if(!d){
      if(!COVQ[id])COVQ[id]=rpc('cbt_cover',{p_series:id});
      const r=await COVQ[id];delete COVQ[id];
      if(r&&r.ok&&r.cover){d=r.cover;try{localStorage.setItem('cbt_cov_'+id,JSON.stringify({v:r.v,d}))}catch(e){}}
    }
    if(d)el.style.backgroundImage=`url(${d})`,el.classList.add('hascov');
  });
}

/* ---------- progress stats / profile ---------- */
const dkey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()};
function pstats(R){
  const days=new Set(R.map(x=>dkey(x.at)));
  let streak=0,d=new Date();
  if(!days.has(dkey(d)))d.setDate(d.getDate()-1);
  while(days.has(dkey(d))){streak++;d.setDate(d.getDate()-1)}
  const week=[];
  for(let i=6;i>=0;i--){const e=new Date();e.setDate(e.getDate()-i);const k=dkey(e);
    week.push({l:e.toLocaleDateString('en-IN',{weekday:'short'}).slice(0,2),n:R.filter(x=>dkey(x.at)===k).length})}
  const tot=R.reduce((a,x)=>a+x.correct+x.wrong,0),cor=R.reduce((a,x)=>a+x.correct,0);
  const best=R.length?Math.max(...R.map(x=>pct(x.score,x.max))):0;
  const avg=R.length?Math.round(R.reduce((a,x)=>a+pct(x.score,x.max),0)/R.length):0;
  const n=R.length,lvl=n>=25?'Champion':n>=10?'Achiever':n>=3?'Learner':'Beginner';
  const badges=[
    {i:'🚀',t:'First test',on:n>=1},{i:'📚',t:'5 tests done',on:n>=5},{i:'🏅',t:'20 tests done',on:n>=20},
    {i:'🎯',t:'Score 70%+',on:best>=70},{i:'🔥',t:'3-day streak',on:streak>=3},{i:'⭐',t:'10 bookmarks',on:BM.size>=10}];
  return{streak,week,tot,cor,acc:tot?Math.round(cor*100/tot):0,best,avg,n,lvl,badges,secs:R.reduce((a,x)=>a+(x.used||0),0)};
}
const maskMob=m=>{m=String(m||'');return m.length>=10?m.slice(0,2)+'••••••'+m.slice(-2):m};
/* ---------- home / dashboard ---------- */
function spark(vals){
  if(vals.length<2)return '';
  const w=220,h=54,mx=Math.max(100,...vals),pts=vals.map((v,i)=>[i*(w/(vals.length-1)),h-4-(v/mx)*(h-10)]);
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="currentColor"/>`).join('')}</svg>`;
}
;(window.__p=window.__p||{})['app1']=1;
