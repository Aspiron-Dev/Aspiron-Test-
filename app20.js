/* ===== v20: the student edits their own name, email and mobile number (saved online) =====
   Server: supabase_v44_edit_details.sql — cbt_me get | save {name,email} | mobile {mobile}; cbt_moved (a phone whose
   number was changed by the admin finds its new number and stays signed in).
   Before v44 is run, cbt_me is missing: the profile works as before (details saved on this phone only). */

/* ---------- messages ---------- */
{const _et=errText;errText=function(r){switch(r&&r.error){
  case 'rejected':return 'Your request was not accepted. Please contact the admin.';
  case 'taken':return 'This mobile number already has another account. Please contact the admin.';
  case 'mobile_limit':return 'You can change your mobile number only 2 times in 30 days. Please contact the admin.';
  case 'mobile':return 'Please enter a valid 10-digit mobile number.';
  case 'email':return 'Please enter a valid email, or leave it empty.';
  case 'name':return 'Please enter your name.';
  default:return _et(r);
}}}

/* ---------- a new number: move what this phone keeps for the old one ---------- */
function meMoveLocal(old,nw){
  if(!old||!nw||old===nw)return;
  try{
    const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('cbt_')&&(k.endsWith('_'+old)||k.includes('_'+old+'_')))ks.push(k)}
    ks.forEach(k=>{const n=k.replace('_'+old,'_'+nw);if(localStorage.getItem(n)==null)localStorage.setItem(n,localStorage.getItem(k));localStorage.removeItem(k)});
  }catch(e){}
  if(AUTH&&AUTH.mobile===old){AUTH.mobile=nw;LS.set('cbt_auth',AUTH)}
}

/* ---------- the admin changed my number: keep this phone signed in ---------- */
{const _ae=authErr;let mv=0;authErr=function(r){
  if(r&&r.ok===false&&r.error==='invalid'&&AUTH&&isTok(AUTH.code)){
    if(mv)return true;
    mv=1;const a=AUTH;
    rpc('cbt_moved',{p_mobile:a.mobile,p_code:a.code,p_device:DEV},true).then(x=>{
      mv=0;
      if(x&&x.ok&&x.mobile&&AUTH===a){meMoveLocal(a.mobile,x.mobile);CAT=null;toast('Your mobile number is now +91 '+x.mobile);updateHeader();route()}
      else _ae(r);
    }).catch(()=>{mv=0;_ae(r)});
    return true;
  }
  return _ae(r);
}}

/* ---------- my details on the server ---------- */
let ME;   // undefined = not asked yet · null = not available (v44 not installed) · {name, mobile, email, mobile_left}
async function meGet(){
  const r=await rpc('cbt_me',{p_action:'get',p_data:{}});
  if(r&&r.ok){ME=r;return ME}
  if(r&&r.error==='server'&&r.status===404)ME=null;
  else if(authErr(r))return null;
  return ME||null;
}
// once the server keeps the name and email, the profile stops keeping its own copy
function meFields(){if(ME){for(let i=PF_F.length-1;i>=0;i--)if(PF_F[i][0]==='name'||PF_F[i][0]==='email')PF_F.splice(i,1)}}

{const _op=openProfile;openProfile=async function(){
  if(ME===undefined){try{await meGet()}catch(e){}}
  meFields();
  _op();
  if(!ME)return;
  const box=document.querySelector('#layer .bsheet[data-id="prof"] .box');if(!box)return;
  const at=box.querySelector('.eyebrow');
  const d=document.createElement('div');d.className='meacc';
  d.innerHTML=`<div class="eyebrow" style="margin:16px 0 4px">Account details <span style="text-transform:none;letter-spacing:0">(saved online)</span></div>
    <label class="pfl">Full name</label><input class="pfi" id="me_name" type="text" maxlength="60" autocomplete="name" value="${esc(ME.name||AUTH.name||'')}">
    <label class="pfl">Email</label><input class="pfi" id="me_email" type="email" maxlength="120" autocomplete="email" placeholder="name@example.com" value="${esc(ME.email||'')}">
    <label class="pfl">Mobile number</label>
    <div class="row" style="gap:8px;align-items:center"><input class="pfi" type="text" value="+91 ${esc(ME.mobile||AUTH.mobile)}" disabled style="flex:1;margin:0"><button class="btn ghost sm" onclick="meMobileSheet()">${ic('edit',14)} Change</button></div>
    <div id="me_er" class="sm err" style="min-height:18px;margin-top:6px"></div>
    <button class="btn block" id="me_btn" onclick="meSave()">${ic('check')} Save account details</button>
    <div class="sm mut" style="margin:8px 0 0">The admin sees these details too.</div>`;
  if(at)at.parentNode.insertBefore(d,at);else box.appendChild(d);
}}

async function meSave(){
  const n=($('#me_name').value||'').trim().replace(/\s+/g,' '),e=($('#me_email').value||'').trim(),er=$('#me_er'),b=$('#me_btn');
  if(n.length<2){er.textContent='Please enter your name.';return}
  if(e&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){er.textContent='Please enter a valid email, or leave it empty.';return}
  er.textContent='';b.disabled=true;
  const r=await rpc('cbt_me',{p_action:'save',p_data:{name:n,email:e}});
  b.disabled=false;
  if(!r||!r.ok){if(!authErr(r))er.textContent=errText(r);return}
  ME.name=r.name;ME.email=r.email;AUTH.name=r.name;LS.set('cbt_auth',AUTH);
  const o=pfGet();delete o.name;delete o.email;pfSave(o);
  updateHeader();toast('Account details saved');
}

function meMobileSheet(){
  const left=ME?ME.mobile_left:2;
  sheet(`<h2 class="sht">Change mobile number</h2><div class="shl"></div>
   <p class="sm mut" style="margin:0 0 6px">Now: <b>+91 ${esc(AUTH.mobile)}</b></p>
   <p class="sm mut" style="margin:0 0 10px">From now on you sign in with the new number. Your access code, tests, results and paid series stay the same, and this phone stays signed in.</p>
   <label class="pfl">New mobile number</label><input class="pfi" id="me_m1" type="tel" inputmode="numeric" maxlength="14" placeholder="10-digit mobile number">
   <label class="pfl">Type it again</label><input class="pfi" id="me_m2" type="tel" inputmode="numeric" maxlength="14" placeholder="10-digit mobile number">
   <div id="me_mer" class="sm err" style="min-height:20px;margin-top:6px"></div>
   ${left<2?`<div class="sm mut" style="margin-bottom:8px">${left?'You can change it 1 more time this month.':'You cannot change it again this month. Please contact the admin.'}</div>`:''}
   <button class="btn block" id="me_mbtn" onclick="meMobileSave()" ${left?'':'disabled'}>${ic('check')} Change number</button>
   <button class="btn ghost block" style="margin-top:8px" onclick="openProfile()">Back</button>`,'mob');
}
async function meMobileSave(){
  const a=($('#me_m1').value||'').replace(/\D/g,'').slice(-10),b=($('#me_m2').value||'').replace(/\D/g,'').slice(-10),er=$('#me_mer'),bt=$('#me_mbtn');
  if(!/^[6-9]\d{9}$/.test(a)){er.textContent='Please enter a valid 10-digit mobile number.';return}
  if(a!==b){er.textContent='The two numbers do not match.';return}
  if(a===AUTH.mobile){er.textContent='This is already your number.';return}
  er.textContent='';bt.disabled=true;bt.textContent='Changing…';
  const old=AUTH.mobile,r=await rpc('cbt_me',{p_action:'mobile',p_data:{mobile:a}});
  if(!r||!r.ok){bt.disabled=false;bt.textContent='Change number';if(!authErr(r))er.textContent=errText(r);return}
  meMoveLocal(old,r.mobile||a);
  if(ME){ME.mobile=r.mobile||a;ME.mobile_left=Math.max(0,(ME.mobile_left||1)-1)}
  CAT=null;updateHeader();toast('Mobile number changed to +91 '+(r.mobile||a));
  openProfile();
}
