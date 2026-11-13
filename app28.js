/* app28: student login with email + password or Google (Supabase Auth, supabase_v65_auth.sql).
   - The Supabase login is used only once: the database turns it into the usual sign-in token (st1.…), the app keeps
     that in cbt_auth like before, and the Supabase session is ended. Every other screen works as before.
   - A login is joined to one student: an existing student joins it once with mobile number + access code; a new student
     sends a request (name + mobile) and, once approved, the login alone is enough.
   - "Sign in with access code" (the old way) stays as a second option.
   - Supabase sends the student back with the login in the address (#access_token=… / #error=…). It is kept for this
     tab only (sessionStorage) and the address is cleaned at once, before the app reads it. */
const SBK='cbt_sb';
(function(){
  const h=location.hash||'';
  if(!/^#(.*&)?(access_token|error|error_description)=/.test(h))return;
  const q=new URLSearchParams(h.slice(1));
  const v={at:q.get('access_token')||'',rt:q.get('refresh_token')||'',type:q.get('type')||'',
    err:(q.get('error_description')||q.get('error')||'').replace(/\+/g,' ').slice(0,200),errc:q.get('error_code')||'',
    exp:Date.now()+(parseInt(q.get('expires_in'),10)||3600)*1000};
  try{sessionStorage.setItem(SBK,JSON.stringify(v))}catch(e){}
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}
})();
function sbGet(){try{return JSON.parse(sessionStorage.getItem(SBK))||null}catch(e){return null}}
function sbSet(v){try{v?sessionStorage.setItem(SBK,JSON.stringify(v)):sessionStorage.removeItem(SBK)}catch(e){}}
function sbHas(){const v=sbGet();return !!(v&&v.at)}
function sbEmail(){try{const v=sbGet(),p=v.at.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(p)))).email||''}catch(e){return ''}}
const sbBack=()=>location.origin+location.pathname;
const sbKeep=d=>({at:d.access_token,rt:d.refresh_token||'',type:'',exp:Date.now()+(d.expires_in||3600)*1000});
// Supabase Auth API (no library: plain fetch, like rpc())
async function sbApi(path,body,tok,method){
  const ac=new AbortController(),tmo=setTimeout(()=>ac.abort(),25000);
  try{
    const h={apikey:CFG.SUPABASE_KEY,'Content-Type':'application/json'};if(tok)h.Authorization='Bearer '+tok;
    const x=await fetch(API+'/auth/v1/'+path,{signal:ac.signal,method:method||'POST',headers:h,body:body?JSON.stringify(body):undefined});
    const d=await x.json().catch(()=>({}));
    return {ok:x.ok,status:x.status,d,code:d.error_code||d.code||d.error||''};
  }catch(e){return {ok:false,status:0,d:{},code:'network'}}finally{clearTimeout(tmo)}
}
async function sbRefresh(){
  const v=sbGet();if(!v||!v.rt)return false;
  const r=await sbApi('token?grant_type=refresh_token',{refresh_token:v.rt});
  if(r.ok&&r.d.access_token){sbSet(sbKeep(r.d));return true}
  return false;
}
// a database call with the Supabase login (role "authenticated")
async function sbRpc(fn,args,again){
  const v=sbGet();if(!v||!v.at)return {ok:false,error:'auth'};
  if(!again&&v.exp<Date.now()+60000&&await sbRefresh())return sbRpc(fn,args,1);
  const ac=new AbortController(),tmo=setTimeout(()=>ac.abort(),25000);let r;
  try{
    const x=await fetch(API+'/rest/v1/rpc/'+fn,{signal:ac.signal,method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+v.at,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
    if(x.status===401&&!again&&await sbRefresh())return sbRpc(fn,args,1);
    r=x.ok?await x.json():x.status===401?{ok:false,error:'auth'}:{ok:false,error:x.status===429?'busy':'server',status:x.status};
  }catch(e){r={ok:false,error:'network'}}finally{clearTimeout(tmo)}
  return r||{ok:false,error:'server'};
}
// end the Supabase session on this phone only (other phones stay signed in)
function sbOut(){const v=sbGet();sbSet(null);if(v&&v.at)sbApi('logout?scope=local',null,v.at)}

function sbErr(r){
  const c=String(r.code||''),m=String((r.d&&(r.d.msg||r.d.error_description||r.d.message))||'');
  if(c==='network')return 'No internet connection. Please check and try again.';
  if(c==='invalid_credentials'||/invalid login/i.test(m))return 'Email or password is incorrect.';
  if(c==='email_not_confirmed'||/not confirmed/i.test(m))return 'Please confirm your email first: open the link we sent you.';
  if(c==='user_already_exists'||/already registered/i.test(m))return 'This email already has an account. Please sign in.';
  if(c==='weak_password'||/password/i.test(m)&&/weak|least|characters/i.test(m))return 'Please choose a stronger password: at least 8 characters, with letters and numbers.';
  if(r.status===429||/rate limit|too many/i.test(c+' '+m))return 'Too many tries in a short time. Please wait a few minutes and try again.';
  if(/email_address_invalid|invalid.*email/i.test(c+' '+m))return 'Please enter a valid email address.';
  if(/signup_disabled|provider.*disabled|not enabled/i.test(c+' '+m))return 'This way of signing in is not switched on yet. Please use your access code.';
  return 'Something went wrong. Please try again.';
}
const gIcon='<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
// the new design (login.css): graphite hero with the gold mark + a sheet with the form
const fld=(id,type,lab,icon,ac,extra)=>`<div class="au3-f${type==='password'?' pw':''}">${ic(icon)}<input type="${type}" id="${id}" placeholder=" " autocomplete="${ac||'off'}" ${extra||''}><label for="${id}">${lab}</label>${type==='password'?`<button type="button" class="au3-eye" onclick="const i=$('#${id}');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'Show':'Hide'">Show</button>`:''}</div>`;
const F={
  em:(ac)=>fld('em','email','Email address','mail',ac||'email','inputmode="email" maxlength="254" autocapitalize="off" spellcheck="false"'),
  pw:(lab,ac)=>fld('pw','password',lab,'lock',ac,'maxlength="72"'),
  ph:(id)=>fld(id||'ph','tel','Mobile number','phone','tel','inputmode="numeric" maxlength="14"'),
  cd:()=>fld('cd','text','Access code','key','off','autocapitalize="characters" spellcheck="false" maxlength="12"'),
  nm:(id)=>fld(id||'rn','text','Full name','user','name','maxlength="60"')
};
const authBusy=(b,t)=>{if(!b)return;b.dataset.t=b.dataset.t||b.innerHTML;b.disabled=!!t;b.innerHTML=t?`<span class="dot"><i></i><i></i><i></i></span>${t}`:b.dataset.t};
const authEr=t=>{const e=$('#er');if(!e)return;e.textContent='';if(t)requestAnimationFrame(()=>{e.textContent=t})};
const emailOn=()=>CFG.EMAIL_LOGIN===true;   // off: email / Google are shown locked
const okMail=e=>/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
function au3Shell(){
  const chip=(i,t)=>`<span>${ic(i)}${t}</span>`;
  return `<div class="au3" role="main">
   <section class="au3-hero" aria-hidden="true"><i class="au3-orb o1"></i><i class="au3-orb o2"></i><i class="au3-orb o3"></i><i class="au3-grid"></i>
    <i class="au3-spk"></i><i class="au3-spk"></i><i class="au3-spk"></i><i class="au3-spk"></i><i class="au3-spk"></i>
    <div class="au3-mark"><svg viewBox="285 335 510 465"><use href="#bSw"/><use href="#bA"/><use href="#bCap"/><use href="#bArc"/><use href="#bTas"/><use href="#bSt"/></svg></div>
    <div class="au3-word"><svg viewBox="63 821 954.5 130.7"><use href="#bWord"/></svg><i></i></div>
    <div class="au3-edu">EDUCATION</div>
    <p class="au3-tag">Real exam practice for <b>NEET</b> &amp; <b>JEE</b>, with your rank after every test.</p>
    <div class="au3-chips">${chip('play','Live tests')}${chip('trophy','All-India rank')}${chip('target','Deep analysis')}</div>
   </section>
   <section class="au3-sheet"><div class="au3-card" id="au3c"></div>
    <p class="au3-legal">By continuing you agree to our <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.</p></section>
  </div>`;
}
// login() and login('<screen>'): the new design for every screen, also the access code and the request
{const _lg=login;login=function(mode){
  if(!cloud)return _lg(mode);
  let err=LOGINERR;
  if(!$('#app .au3')){
    const r=_lg();   // runs every other wrapper once (deep-link note, website layout, new design off)
    const nt=$('#afterNote');AU3NOTE=nt?nt.textContent:'';
    if(!$('#v3font')){const f=document.createElement('link');f.id='v3font';f.rel='stylesheet';f.href='https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap';document.head.appendChild(f)}
    $('#app').innerHTML=au3Shell();
  }
  LOGINERR='';
  authScreen($('#au3c'),mode,err);
  const sc=$('#app .au3');if(sc&&mode&&mode!=='go'&&innerWidth<900)sc.scrollTo({top:Math.max(0,$('.au3-sheet').offsetTop-20),behavior:'smooth'});
}}
let AU3NOTE='';
function authScreen(card,mode,err){
  if(!emailOn()&&['signup','forgot','mail','newpw','link','wait'].includes(mode))mode='';
  if(mode==='request')mode='buy';   // app29: no access requests any more: buy a test series first, then sign in with the code
  const sb=sbGet();
  if(!mode&&sb){
    if(sb.err){sbSet(null);err=/expired|invalid/i.test(sb.err+sb.errc)?'This link has expired or was already used. Please try again.':sb.err}
    else if(sb.at&&sb.type==='recovery')mode='newpw';
    else if(sb.at)mode='go';
  }
  const top=(t,sub,back)=>`${back?`<button class="au3-back" onclick="${back}">${ic('left')} Back</button>`:''}<h1 class="au3-h">${t}</h1><p class="au3-s">${sub}</p>`;
  const erBox=`<div id="er" class="au3-er" role="alert">${esc(err||'')}</div>`;
  const okIc=i=>`<div class="au3-ok">${ic(i)}</div>`;
  let h='';
  if(mode==='go')h=`<div class="au3-wait"><div class="au3-ring"></div>Signing you in…</div>`;
  else if(mode==='signup')h=`${top('Create your account','Use your own email. We will send you a link to confirm it.',"login()")}
     ${F.em()}${F.pw('Password (8+ characters)','new-password')}
     ${erBox}<button class="au3-btn pri" id="abtn" onclick="authSignup()">Create account ${ic('right')}</button>
     <div class="au3-row c">Already have an account?<button class="au3-link" onclick="login()">Sign in</button></div>`;
  else if(mode==='forgot')h=`${top('Reset password','Enter your email. We will send you a link to set a new password.',"login()")}
     ${F.em()}${erBox}<button class="au3-btn pri" id="abtn" onclick="authForgot()">Send reset link ${ic('right')}</button>`;
  else if(mode==='newpw')h=`${top('Set a new password','Choose a strong password you have not used before.')}
     ${F.pw('New password (8+ characters)','new-password')}${erBox}<button class="au3-btn pri" id="abtn" onclick="authNewPw()">Save and continue ${ic('right')}</button>`;
  else if(mode==='link')h=`${top('One last step','Join this login to your student account.')}<div class="au3-mail">${ic('user')}<span>${esc(sbEmail()||'Signed in')}</span></div>
     ${erBox}<div class="au3-sec" style="margin-top:6px;border:0;padding-top:0"><h3>Already a student?</h3><p>Enter your mobile number and access code once. After this, the login is enough.</p>
     ${F.ph()}${F.cd()}<button class="au3-btn pri" id="abtn" onclick="authLink()">Join my account ${ic('right')}</button></div>
     <div class="au3-sec lsec"><h3>New student?</h3><p>Send a request. Once the admin approves it, sign in with this same login.</p>
     ${F.nm()}${F.ph('rp')}<button class="au3-btn soft" id="rbtn" onclick="authRequest()">Send request</button></div>
     <button class="au3-btn sec" style="margin-top:20px" onclick="authSwitch()">Use a different account</button>`;
  else if(mode==='wait')h=`${okIc('check')}<h1 class="au3-h">Request received</h1><div class="au3-mail">${ic('user')}<span>${esc(sbEmail()||'')}</span></div>
     <p class="au3-s" style="margin-top:12px">If this mobile number is new, the admin will review your request. After approval, sign in with this same login. If the number already has an account, join it with your access code.</p>
     <button class="au3-btn pri" onclick="login('go')">I am approved: sign in ${ic('right')}</button>
     <button class="au3-btn soft" onclick="supportSheet('Hi, I have requested access with my email login.')">${ic('msg')} Message support</button>
     <button class="au3-btn sec" onclick="authSwitch()">Use a different account</button>`;
  else if(mode==='mail')h=`${okIc('mail')}<h1 class="au3-h">Check your email</h1><p class="au3-s">${esc(AUTHMSG)}</p>
     <p class="au3-s" style="font-size:13px">No email? Look in Spam / Promotions, or wait a minute and send it again.</p>
     ${erBox}${AUTHMAIL?`<button class="au3-btn soft" id="abtn" onclick="authResend()">Send the email again</button>`:''}
     <button class="au3-btn pri" onclick="login()">Back to sign in ${ic('right')}</button>`;
  else if(mode==='code')h=`${top('Sign in with access code','Enter your mobile number and the access code given to you.',"login()")}
     ${F.ph()}${F.cd()}${erBox}<button class="au3-btn pri" id="lbtn" onclick="doLogin()">Sign in ${ic('right')}</button>
     <div class="au3-row c">New student?<button class="au3-link" onclick="login('buy')">Buy a test series first</button></div>`;
  else if(mode==='buy')h=`${top('New here? Get your access code','You sign in with a personal access code. You get it after you buy a test series.',"login()")}
     ${AU3BUY?`<div class="au3-note">${esc(AU3BUY)}</div>`:''}
     <ol class="au3-steps">
      <li><i>1</i><div><b>Buy a test series</b><span>Pick your series in the Test Store and pay by UPI.</span></div></li>
      <li><i>2</i><div><b>Verify your payment</b><span>Send the payment screenshot on Telegram or WhatsApp. The Store shows you how.</span></div></li>
      <li><i>3</i><div><b>Get your access code</b><span>Our team checks the payment and sends your personal code.</span></div></li>
      <li><i>4</i><div><b>Sign in</b><span>Enter your mobile number and the access code here.</span></div></li>
     </ol>
     <a class="au3-btn pri" href="store">${ic('bag')} Go to Test Store ${ic('right')}</a>
     <button class="au3-btn sec" onclick="login('code')">${ic('key')} I have my access code</button>
     ${typeof supportSheet==='function'?`<button class="au3-btn soft" onclick="supportSheet('Hi, I want to buy a test series.')">${ic('msg')} Ask our team</button>`:''}`;
  else h=`${top('Student sign in','Enter your mobile number and the access code given to you.')}
     ${F.ph()}${F.cd()}${erBox}<button class="au3-btn pri" id="lbtn" onclick="doLogin()">Sign in ${ic('right')}</button>
     <div class="au3-row c">New student?<button class="au3-link" onclick="login('buy')">Buy a test series first</button></div>
     <div class="au3-or">or</div>
     <button class="au3-btn g lgo" onclick="authGoogleTap()">${gIcon} Continue with Google</button>
     <div class="au3-or">Email sign-in</div>
     <div class="au3-lock" id="au3lock">
      <div class="au3-lockbadge">${ic('lock')}<span>Coming soon</span></div>
      ${F.em('username')}${F.pw('Password','current-password')}
      <div class="au3-row"><span></span><button class="au3-link" tabindex="-1" onclick="login('forgot')">Forgot password?</button></div>
      <button class="au3-btn pri" tabindex="-1" id="abtn" style="margin-top:6px" onclick="authPass()">Sign in ${ic('right')}</button>
      <div class="au3-row c">New here?<button class="au3-link" tabindex="-1" onclick="login('signup')">Create account</button></div>
     </div>`;
  AU3BUY='';
  card.innerHTML=`<div class="au3-pane">${AU3NOTE&&!mode?`<div class="au3-note" id="afterNote">${esc(AU3NOTE)}</div>`:''}${h}</div>`;
  if(!emailOn()){
    const lk=card.querySelector('#au3lock');
    if(lk){lk.setAttribute('aria-disabled','true');lk.querySelectorAll('input,button').forEach(e=>{if(e.classList.contains('lgo'))return;e.disabled=true;e.tabIndex=-1})}
  }
  if(emailOn()){const lk=card.querySelector('#au3lock');if(lk){lk.querySelectorAll('.au3-lockbadge').forEach(b=>b.remove())}}
  card.querySelectorAll('input').forEach(i=>i.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const b=i.closest('.lsec')?$('#rbtn'):$('#abtn')||$('#lbtn')||$('#rbtn');b&&b.click()}));
  if(mode==='go')authGo();
}
let AUTHMSG='',AUTHMAIL='',AU3BUY='';
// Google: while email / Google sign-in is off, the button shows the steps to get an access code (buy → verify → code)
function authGoogleTap(){
  if(emailOn())return authGoogle();
  AU3BUY='Google sign-in is coming soon. For now: buy a test series, verify your payment, then sign in with your access code.';
  login('buy');
}
function authGoogle(){if(!emailOn())return;location.href=API+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(sbBack())}
async function authPass(){
  if(!emailOn())return;
  const e=$('#em').value.trim().toLowerCase(),p=$('#pw').value;
  if(!okMail(e))return authEr('Please enter a valid email address.');
  if(!p)return authEr('Please enter your password.');
  const b=$('#abtn');authBusy(b,'Checking…');authEr('');
  const r=await sbApi('token?grant_type=password',{email:e,password:p});
  if(!r.ok||!r.d.access_token){authBusy(b);authEr(sbErr(r));
    if(r.code==='email_not_confirmed'&&!$('#rsnd')){AUTHMAIL=e;$('#er').insertAdjacentHTML('afterend',`<button id="rsnd" class="au3-btn soft" onclick="authResend(this)">Send the confirm email again</button>`)}
    return}
  sbSet(sbKeep(r.d));authGo();
}
async function authSignup(){
  if(!emailOn())return;
  const e=$('#em').value.trim().toLowerCase(),p=$('#pw').value;
  if(!okMail(e))return authEr('Please enter a valid email address.');
  if(p.length<8||!/[a-z]/i.test(p)||!/\d/.test(p))return authEr('Password: at least 8 characters, with letters and numbers.');
  const b=$('#abtn');authBusy(b,'Creating…');authEr('');
  const r=await sbApi('signup?redirect_to='+encodeURIComponent(sbBack()),{email:e,password:p});
  if(!r.ok){authBusy(b);return authEr(sbErr(r))}
  if(r.d.access_token){sbSet(sbKeep(r.d));return authGo()}   // email confirm is off in Supabase
  AUTHMAIL=e;AUTHMSG=`We sent a link to ${e}. Open it on this phone to confirm your email and continue.`;login('mail');
}
async function authResend(btn){
  if(!AUTHMAIL)return;const b=btn||$('#abtn');authBusy(b,'Sending…');
  const r=await sbApi('resend?redirect_to='+encodeURIComponent(sbBack()),{type:'signup',email:AUTHMAIL});
  authBusy(b);authEr(r.ok?'Sent again. Please check your email.':sbErr(r));
}
async function authForgot(){
  if(!emailOn())return;
  const e=$('#em').value.trim().toLowerCase();
  if(!okMail(e))return authEr('Please enter a valid email address.');
  const b=$('#abtn');authBusy(b,'Sending…');authEr('');
  const r=await sbApi('recover?redirect_to='+encodeURIComponent(sbBack()),{email:e});
  if(!r.ok&&r.code!=='user_not_found'){authBusy(b);return authEr(sbErr(r))}
  // the same answer whether or not the email has an account
  AUTHMAIL='';AUTHMSG=`If ${e} has an account, we sent it a link to set a new password. Open it on this phone.`;login('mail');
}
async function authNewPw(){
  const p=$('#pw').value;
  if(p.length<8||!/[a-z]/i.test(p)||!/\d/.test(p))return authEr('Password: at least 8 characters, with letters and numbers.');
  const b=$('#abtn');authBusy(b,'Saving…');authEr('');
  const v=sbGet();const r=await sbApi('user',{password:p},v&&v.at,'PUT');
  if(!r.ok){authBusy(b);if(r.status===401){sbSet(null);LOGINERR='This link has expired. Please ask for a new one.';return login('forgot')}return authEr(sbErr(r))}
  if(v){v.type='';sbSet(v)}toast('Password saved');authGo();
}
// the Supabase login → the student's sign-in token
async function authGo(){
  const r=await sbRpc('student_signin',{p_device:DEV});
  if(r.ok&&isTok(r.token))return authDone(r);
  if(r.error==='not_linked')return login('link');
  if(r.error==='pending')return login('wait');
  if(r.error==='auth'){sbSet(null);LOGINERR='Please sign in again. If you just signed up, confirm your email first.';return login()}
  authFail(r);
}
function authFail(r){
  const e=r.error==='taken'?'This student account is already joined to another login. Sign in with that login, or ask support to change it.':errText(r);
  if(!$('#er')||$('.au3-wait')){LOGINERR=e;return login(sbHas()&&r.error!=='blocked'?'link':'')}
  authEr(e);
  if(r.error==='device_limit'&&!$('#devhelp'))$('#er').insertAdjacentHTML('afterend',`<button id="devhelp" class="au3-btn soft" onclick="supportSheet('Hi, please reset the devices on my account (email login).')">📱 Ask for device reset</button>`);
}
async function authLink(){
  const m=$('#ph').value.replace(/\D/g,'').slice(-10),c=$('#cd').value.replace(/[^0-9a-zA-Z]/g,'').toUpperCase();
  if(m.length!==10)return authEr('Please enter a valid 10-digit mobile number.');
  if(c.length<4)return authEr('Please enter your access code.');
  const b=$('#abtn');authBusy(b,'Checking…');authEr('');
  const r=await sbRpc('student_link',{p_mobile:m,p_code:c,p_device:DEV});authBusy(b);
  if(r.ok&&isTok(r.token))return authDone(r);
  if(r.error==='auth'){sbSet(null);LOGINERR='Please sign in again.';return login()}
  authFail(r);$('#er').scrollIntoView({block:'center',behavior:'smooth'});
}
async function authRequest(){
  const n=$('#rn').value.trim(),m=$('#rp').value.replace(/\D/g,'').slice(-10);
  if(n.length<2)return authEr('Please enter your name.');
  if(m.length!==10)return authEr('Please enter a valid 10-digit mobile number.');
  const b=$('#rbtn');authBusy(b,'Sending…');authEr('');
  const r=await sbRpc('student_request',{p_name:n,p_mobile:m});authBusy(b);
  if(r.ok)return login('wait');
  if(r.error==='auth'){sbSet(null);LOGINERR='Please sign in again.';return login()}
  authEr(r.error==='busy'?'Too many requests right now. Please try again later.':errText(r));$('#er').scrollIntoView({block:'center',behavior:'smooth'});
}
function authSwitch(){sbOut();login()}
async function authDone(r){
  sbOut();   // the app keeps only its own sign-in token
  AUTH={mobile:r.mobile,code:r.token,name:r.name};LS.set('cbt_auth',AUTH);LS.del('cbt_dping');updateHeader();CAT=null;
  try{await flushPending()}catch(e){}
  const w=LS.get('cbt_after',null);if(w)LS.del('cbt_after');
  if(w&&location.hash!==w){location.hash=w}else if(location.hash&&location.hash!=='#/'){location.hash='#/'}else route();
}
if(!IC.mail)IC.mail='<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>';
;(window.__p=window.__p||{})['app28']=1;
if(!IC.phone)IC.phone='<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/>';
