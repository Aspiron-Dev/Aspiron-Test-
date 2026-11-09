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
const AUTHCSS=`<style id="authcss">.lgo{display:flex;align-items:center;justify-content:center;gap:10px;background:var(--surface);color:var(--tx);border:1px solid var(--bd)}
.lgo:hover{border-color:var(--pri)}.lpw{position:relative}.lpw input{padding-right:64px}.lpw button{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--pri);font-weight:600;font-size:13px;padding:8px;cursor:pointer}
.llink{background:none;border:0;color:var(--pri);font-weight:600;font-size:14px;padding:6px 0;cursor:pointer}.lrow{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px}
.lmail{background:var(--priSoft);color:var(--pri);border-radius:12px;padding:10px 12px;margin:12px 0 4px;font-weight:600;word-break:break-all}
.lsec{border-top:1px solid var(--bd);margin-top:18px;padding-top:6px}</style>`;
const pwBox=(id,ph,ac)=>`<div class="lpw"><input type="password" id="${id}" autocomplete="${ac}" maxlength="72" placeholder="${ph}"><button type="button" onclick="const i=$('#${id}');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'Show':'Hide'">Show</button></div>`;
const authBusy=(b,t)=>{if(!b)return;b.dataset.t=b.dataset.t||b.innerHTML;b.disabled=!!t;b.innerHTML=t||b.dataset.t};
const authEr=t=>{const e=$('#er');if(e)e.textContent=t||''};
const okMail=e=>/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

// the old screens (access code, request) stay; login() and login('<screen>') show the new ones
{const _lg=login;login=function(mode){
  if(mode==='request'||!cloud)return _lg(mode);
  const err=LOGINERR;
  const r=_lg();   // runs every other wrapper (deep-link note, website layout, new design)
  const card=document.querySelector('#app .card.login');if(!card)return r;
  if(!$('#authcss'))document.head.insertAdjacentHTML('beforeend',AUTHCSS);
  if(mode==='code'){
    card.insertAdjacentHTML('beforeend',`<button class="btn ghost block" style="margin-top:10px" onclick="login()">${ic('back')} Other ways to sign in</button>`);
    if(err)authEr(err);
    return r;
  }
  const note=card.querySelector('#afterNote');
  authScreen(card,mode,err);
  if(note)card.insertAdjacentElement('afterbegin',note);
  return r;
}}
function authScreen(card,mode,err){
  const sb=sbGet();
  if(!mode&&sb){
    if(sb.err){sbSet(null);err=/expired|invalid/i.test(sb.err+sb.errc)?'This link has expired or was already used. Please try again.':sb.err}
    else if(sb.at&&sb.type==='recovery')mode='newpw';
    else if(sb.at)mode='go';
  }
  const top=(t,s)=>`<div class="logo">${ic('user',26)}</div><h1 style="font-size:26px">${t}</h1><p class="mut" style="margin:6px 0 0">${s}</p>`;
  const erBox=`<div id="er" class="sm err" style="min-height:22px;margin-top:8px">${esc(err||'')}</div>`;
  if(mode==='go'){card.innerHTML=`<div class="loading" style="min-height:160px"><div><div class="spin"></div>Signing you in…</div></div>`;authGo();return}
  if(mode==='signup'){
    card.innerHTML=`${top('Create account','Use your own email. You will get a link to confirm it.')}
     <label class="l">Email</label><input type="email" id="em" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com">
     <label class="l">Password</label>${pwBox('pw','At least 8 characters','new-password')}
     ${erBox}<button class="btn block" id="abtn" onclick="authSignup()">Create account ${ic('right')}</button>
     <div class="lrow" style="justify-content:center"><span class="sm mut">Have an account?</span><button class="llink" onclick="login()">Sign in</button></div>`;
  }else if(mode==='forgot'){
    card.innerHTML=`${top('Forgot password','Enter your email. We will send you a link to set a new password.')}
     <label class="l">Email</label><input type="email" id="em" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com">
     ${erBox}<button class="btn block" id="abtn" onclick="authForgot()">Send link</button>
     <button class="btn ghost block" style="margin-top:10px" onclick="login()">${ic('back')} Back to sign in</button>`;
  }else if(mode==='newpw'){
    card.innerHTML=`${top('Set a new password','Choose a new password for your account.')}
     <label class="l">New password</label>${pwBox('pw','At least 8 characters','new-password')}
     ${erBox}<button class="btn block" id="abtn" onclick="authNewPw()">Save password</button>`;
  }else if(mode==='link'){
    card.innerHTML=`${top('One last step','Join this login to your student account.')}<div class="lmail">${esc(sbEmail()||'Signed in')}</div>
     ${erBox}<h3 style="margin:8px 0 0">Already a student?</h3><p class="sm mut" style="margin:4px 0 0">Enter your mobile number and access code once. After this, the login is enough.</p>
     <label class="l">Mobile number</label><input type="tel" id="ph" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number">
     <label class="l">Access code</label><input type="text" id="cd" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" placeholder="e.g. A1B2-C3D4">
     <button class="btn block" id="abtn" style="margin-top:12px" onclick="authLink()">Join my account ${ic('right')}</button>
     <div class="lsec"><h3 style="margin:8px 0 0">New student?</h3><p class="sm mut" style="margin:4px 0 0">Send a request. Once the admin approves it, you can sign in with this login.</p>
     <label class="l">Full name</label><input type="text" id="rn" autocomplete="name" maxlength="60" placeholder="e.g. Rahul Sharma">
     <label class="l">Mobile number</label><input type="tel" id="rp" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number">
     <button class="btn soft block" id="rbtn" style="margin-top:12px" onclick="authRequest()">Send request</button></div>
     <button class="btn ghost block" style="margin-top:14px" onclick="authSwitch()">Use a different account</button>`;
  }else if(mode==='wait'){
    card.innerHTML=`<div class="logo" style="background:var(--ok)">${ic('check',26)}</div><h2>Request received ✓</h2>
     <div class="lmail">${esc(sbEmail()||'')}</div>
     <p class="mut">If this mobile number is new, the admin will review your request. After approval, sign in with this same login. If the number already has an account, sign in and join it with your access code.</p>
     <button class="btn soft block" style="margin:8px 0" onclick="supportSheet('Hi, I have requested access with my email login.')">${ic('msg')} Message support</button>
     <button class="btn block" onclick="login('go')">I am approved: sign in</button>
     <button class="btn ghost block" style="margin-top:10px" onclick="authSwitch()">Use a different account</button>`;
  }else if(mode==='mail'){
    card.innerHTML=`<div class="logo" style="background:var(--ok)">${ic('mail',26)}</div><h2>Check your email</h2>
     <p class="mut">${esc(AUTHMSG)}</p><p class="sm mut">No email? Look in Spam / Promotions, or wait a minute and send it again.</p>
     ${erBox}${AUTHMAIL?`<button class="btn soft block" id="abtn" onclick="authResend()">Send the email again</button>`:''}
     <button class="btn block" style="margin-top:10px" onclick="login()">Back to sign in</button>`;
  }else{
    card.innerHTML=`${top('Sign in','Sign in to your tests, results and study material.')}
     <button class="btn block lgo" style="margin-top:18px" onclick="authGoogle()">${gIcon} Continue with Google</button>
     <div class="divider">or with email</div>
     <label class="l" style="margin-top:0">Email</label><input type="email" id="em" autocomplete="username" inputmode="email" maxlength="254" placeholder="you@example.com">
     <label class="l">Password</label>${pwBox('pw','Your password','current-password')}
     <div class="lrow"><span></span><button class="llink" onclick="login('forgot')">Forgot password?</button></div>
     ${erBox}<button class="btn block" id="abtn" onclick="authPass()">Sign in ${ic('right')}</button>
     <div class="lrow" style="justify-content:center"><span class="sm mut">New here?</span><button class="llink" onclick="login('signup')">Create account</button></div>
     <div class="divider">Have an access code?</div>
     <button class="btn ghost block" onclick="login('code')">${ic('key')} Sign in with access code</button>`;
  }
  card.querySelectorAll('input').forEach(i=>i.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const b=i.closest('.lsec')?$('#rbtn'):$('#abtn');b&&b.click()}));
}
let AUTHMSG='',AUTHMAIL='';
function authGoogle(){location.href=API+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(sbBack())}
async function authPass(){
  const e=$('#em').value.trim().toLowerCase(),p=$('#pw').value;
  if(!okMail(e))return authEr('Please enter a valid email address.');
  if(!p)return authEr('Please enter your password.');
  const b=$('#abtn');authBusy(b,'Checking…');authEr('');
  const r=await sbApi('token?grant_type=password',{email:e,password:p});
  if(!r.ok||!r.d.access_token){authBusy(b);authEr(sbErr(r));
    if(r.code==='email_not_confirmed'&&!$('#rsnd')){AUTHMAIL=e;$('#er').insertAdjacentHTML('afterend',`<button id="rsnd" class="btn soft block" style="margin-bottom:10px" onclick="authResend(this)">Send the confirm email again</button>`)}
    return}
  sbSet(sbKeep(r.d));authGo();
}
async function authSignup(){
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
  if(!$('#er')||$('.card.login .loading')){LOGINERR=e;return login(sbHas()&&r.error!=='blocked'?'link':'')}
  authEr(e);
  if(r.error==='device_limit'&&!$('#devhelp'))$('#er').insertAdjacentHTML('afterend',`<button id="devhelp" class="btn soft block" style="margin-bottom:10px" onclick="supportSheet('Hi, please reset the devices on my account (email login).')">📱 Ask for device reset</button>`);
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
