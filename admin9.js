/* ================= v12 admin security: auto-lock, privacy screen, strong password ================= */
const LOCK_MIN=15;
let LASTACT=Date.now();
['pointerdown','keydown','scroll','touchstart'].forEach(e=>addEventListener(e,()=>{LASTACT=Date.now()},{passive:true}));
setInterval(()=>{if(PW&&Date.now()-LASTACT>LOCK_MIN*60e3)admLock('Locked after '+LOCK_MIN+' minutes without use')},30e3);
function admLock(msg){
  if(!PW)return;
  PW='';try{sessionStorage.removeItem('adm_pw')}catch(e){}
  try{lvStop()}catch(e){}
  closeModal();gate();if(msg)toast('🔒 '+msg);
}
/* privacy screen: hides the panel in the phone's recent-apps view and when you switch away */
(function(){const d=document.createElement('div');d.id='lockv';d.innerHTML='<div style="font-size:42px">🔒</div>';document.body.appendChild(d)})();
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('privacy',document.hidden&&!!PW);if(!document.hidden)LASTACT=Math.min(LASTACT,Date.now())});
addEventListener('blur',()=>{if(PW)document.body.classList.add('privacy')});addEventListener('focus',()=>document.body.classList.remove('privacy'));

/* stronger admin password */
function pwScore(p){let s=0;if(p.length>=10)s++;if(p.length>=14)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;if(/(.)\1\1|1234|abcd|password|qwerty|admin/i.test(p))s=Math.max(0,s-2);return s}
const PWL=['Very weak','Weak','Okay','Good','Strong','Very strong'],PWC=['#e11d48','#f97316','#f59e0b','#84cc16','#22c55e','#16a34a'];
{const _st=settings;settings=async function(){
  await _st.apply(this,arguments);
  const np=$('#np');if(!np)return;
  const lbl=np.previousElementSibling;if(lbl)lbl.textContent='New password (min 10 characters, use A-z, 0-9 and a symbol)';
  np.insertAdjacentHTML('afterend','<div class="pwm"><i id="pwmi" style="width:0"></i></div><div class="sm mut" id="pwml" style="margin-top:4px"></div>');
  np.oninput=()=>{const s=pwScore(np.value);$('#pwmi').style.width=(np.value?Math.max(8,s*20):0)+'%';$('#pwmi').style.background=PWC[s];$('#pwml').textContent=np.value?PWL[s]:''};
  const so=[...document.querySelectorAll('#layer .btn.ghost.block')].pop();
  if(so)so.insertAdjacentHTML('beforebegin',`<div class="sm mut" style="margin-top:14px">🔒 The panel locks itself after ${LOCK_MIN} minutes without use and hides when you switch apps.</div>`);
}}
async function changePw(){
  const np=$('#np').value,s=pwScore(np);
  if(np.length<10){$('#ner').textContent='Use at least 10 characters.';return}
  if(s<3){$('#ner').textContent='Too easy to guess — mix CAPITAL and small letters, numbers and a symbol.';return}
  const r=await A('set_password',{new_pw:np});
  if(r.ok){PW=np;try{sessionStorage.setItem('adm_pw',np)}catch(e){}closeModal();toast('Password changed ✓')}
  else $('#ner').textContent='Could not change the password.';
}
;(window.__p=window.__p||{})['admin9']=1;
