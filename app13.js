/* ===== Devices: on a 3rd phone, show the 2 signed-in phones and let the student sign one out =====
   Server: supabase_v21_devices.sql (cbt_devices, cbt_device_swap, cbt_device_ping). The limit stays 2. */
IC.devices='<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>';
function devLabel(){
  const ua=String(navigator.userAgent||'');
  const os=/iphone/i.test(ua)?'iPhone':/ipad/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'iPad':/android/i.test(ua)?'Android':/windows/i.test(ua)?'Windows':/mac os/i.test(ua)?'Mac':/linux/i.test(ua)?'Linux':'Device';
  const br=/edg\//i.test(ua)?'Edge':/samsungbrowser/i.test(ua)?'Samsung Internet':/opr\//i.test(ua)?'Opera':/firefox|fxios/i.test(ua)?'Firefox':/crios|chrome/i.test(ua)?'Chrome':/safari/i.test(ua)?'Safari':'Browser';
  const app=(window.matchMedia&&matchMedia('(display-mode:standalone)').matches)||navigator.standalone?' app':'';
  const model=(ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build[^;)]*)?[;)]/i)||[])[1]||'';
  return (os+(model&&model.length>1&&model!=='K'?' ('+model.trim()+')':'')+' · '+br+app).slice(0,60);
}
const devAgo=ms=>{if(!ms)return 'not used yet';const m=Math.round((Date.now()-ms)/6e4);return m<2?'active now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'};
let DEVC=null;   // {m,c,login} — credentials kept only while the popup is open

/* sign-in on a 3rd phone → list the phones (app1 doLogin calls this on 'device_limit') */
async function devPick(m,c,login){
  DEVC={m,c,login:login!==false};
  const r=await rpc('cbt_devices',{p_mobile:m,p_code:c,p_device:DEV,p_label:devLabel()},true);
  if(!r||!r.ok){
    if(r&&(r.status===404||r.error==='server'))return false;   // server not updated yet → old message
    if(r&&r.error)toast(errText(r));
    return true;
  }
  devSheet(r);return true;
}
function devSheet(r){
  const L=r.items||[],left=r.swaps_left,login=DEVC&&DEVC.login;
  sheet(`<div class="devx"><div class="devhd">${ic('devices',26)}</div>
   <h2>${login?`Already signed in on ${L.length} phone${L.length==1?'':'s'}`:'Your devices'}</h2>
   <p class="mut sm" style="margin:4px 0 14px">${login?`Your code works on ${r.max||2} phones. To sign in here, sign out one of these phones.`:`Your code works on ${r.max||2} phones. Signing out a phone frees its place.`}</p>
   ${L.map(d=>`<div class="devrow ${d.this?'this':''}"><span class="devic">${ic('devices',20)}</span><div class="grow"><b>${esc(d.label)}</b><div class="sm mut">${d.this?'This phone':devAgo(d.last)}</div></div>
     ${d.this?'<span class="chip ok">This phone</span>':`<button class="btn ${login?'':'ghost'} sm" ${left?'':'disabled'} onclick="devAsk('${esc(d.key)}','${esc(d.label).replace(/'/g,'&#39;')}')">${login?'Sign out & use here':'Sign out'}</button>`}</div>`).join('')||'<p class="sm mut">No phones signed in.</p>'}
   <p class="sm ${left?'mut':''}" style="margin-top:12px;${left?'':'color:var(--bad)'}">${left?`You can change phones ${left} more time${left==1?'':'s'} today.`:'You have changed phones 2 times today. Try again tomorrow, or ask us for help.'}</p>
   ${left?'':'<a class="btn soft block" style="margin-top:8px;text-decoration:none" target="_blank" rel="noopener" href="https://t.me/StudentsHelpCentreBot">Ask for help</a>'}</div>`,'dev');
}
function devAsk(key,label){
  const login=DEVC&&DEVC.login;
  askYes({icon:'📱',title:`Sign out “${label}”?`,msg:login?'That phone will be signed out, and you will be signed in on this phone.':'That phone will be signed out. You stay signed in here.',ok:login?'Yes, sign out & continue':'Yes, sign out',no:'Cancel',danger:1,yes:()=>devSwap(key)});
}
async function devSwap(key){
  if(!DEVC)return;const {m,c,login}=DEVC;
  const r=await rpc('cbt_device_swap',{p_mobile:m,p_code:c,p_device:DEV,p_remove:key,p_label:devLabel()},true);
  if(!r||!r.ok){
    toast(r&&r.error==='swap_limit'?'You have changed phones 2 times today. Try again tomorrow.':r&&r.error==='not_found'?'That phone is already signed out.':errText(r));
    return devPick(m,c,login);
  }
  DEVC=null;
  if(login){
    AUTH={mobile:m,code:c,name:r.name};LS.set('cbt_auth',AUTH);LS.set('cbt_dping',Date.now());updateHeader();CAT=null;
    try{await flushPending()}catch(e){}
    location.hash='#/';route();toast('✓ Signed in on this phone');
  }else toast('✓ That phone is signed out');
}
/* logged in: Settings → My devices */
function myDevices(){if(!AUTH)return;closeModal();devPick(AUTH.mobile,AUTH.code,false)}
{const _os=openSettings;openSettings=function(){_os.apply(this,arguments);
  const b=document.querySelector('#layer .strow:nth-of-type(3)')||document.querySelector('#layer .strow');
  if(b&&!document.getElementById('devrowbtn'))b.insertAdjacentHTML('afterend',`<button class="strow" id="devrowbtn" onclick="myDevices()"><span class="stic">${ic('devices',20)}</span><span class="grow"><b>My devices</b><small>Phones signed in with your code</small></span>${ic('right',16)}</button>`);
}}
/* tell the server this phone's name, after sign-in and once a day */
async function devPing(){
  if(!AUTH||Date.now()-(LS.get('cbt_dping',0)||0)<864e5)return;
  const r=await rpc('cbt_device_ping',{p_label:devLabel()});if(r&&r.ok)LS.set('cbt_dping',Date.now());
}
setTimeout(devPing,6000);addEventListener('hashchange',()=>setTimeout(devPing,1500));
;(window.__p=window.__p||{})['app13']=1;
