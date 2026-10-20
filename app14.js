/* ===== Ratings & reviews: a student rates an unlocked paid series; it shows on the store page =====
   Server: supabase_v23_reviews.sql (cbt_review_mine, cbt_review_save, cbt_review_delete).
   The store shows only the name (e.g. "Rahul S.") and, if chosen, the profile photo — never the mobile number. */
let RVW={};            // series id → my review (null = none yet, undefined = not loaded)
const rvStars=(n,sz)=>`<span class="rvst" aria-label="${n} out of 5 stars">${[1,2,3,4,5].map(i=>`<i class="${i<=n?'on':''}"${sz?` style="font-size:${sz}px"`:''}>★</i>`).join('')}</span>`;
const RVSTAT={shown:['ok','Shown on the store'],pending:['warn','Waiting for approval'],hidden:['bad','Hidden by the admin']};
function rvCard(sid){
  const r=RVW[sid];
  if(r===undefined)return `<div class="card rvc"><div class="sk" style="width:55%"></div></div>`;
  if(r===false)return '';
  if(!r)return `<div class="card rvc"><div class="rvh"><div><b>Rate this series</b><div class="sm mut">Help other students decide — your review shows on the store.</div></div></div>
    <div class="rvpick">${[1,2,3,4,5].map(i=>`<button aria-label="${i} star${i>1?'s':''}" onclick="rvOpen('${sid}',${i})">★</button>`).join('')}</div></div>`;
  const st=RVSTAT[r.status]||RVSTAT.shown;
  return `<div class="card rvc"><div class="rvh"><div><b>Your review</b> <span class="chip ${st[0]}">${st[1]}</span></div><button class="btn ghost sm" onclick="rvOpen('${sid}')">${ic('edit')} Edit</button></div>
    ${rvStars(r.rating,18)}${r.body?`<p class="rvb">${esc(r.body)}</p>`:''}${r.reply?`<div class="rvrep"><b>Reply from the team</b><p>${esc(r.reply)}</p></div>`:''}</div>`;
}
function rvSlot(sid){const e=document.getElementById('rvslot');if(e&&e.dataset.sid===sid)e.innerHTML=rvCard(sid)}
async function rvLoad(sid){
  const r=await rpc('cbt_review_mine',{p_series:sid});
  if(!r.ok){if(authErr(r))return;RVW[sid]=false}   // server not set up yet → no card
  else RVW[sid]=r.review||null;
  rvSlot(sid);
}
{const _vs=viewSeries;viewSeries=function(id){
  _vs(id);
  const s=CAT&&CAT.series.find(x=>x.id===id);if(!s||s.is_free||!s.unlocked)return;
  const at=document.querySelector('#app .wrap');if(!at)return;
  at.insertAdjacentHTML('beforeend',`<div id="rvslot" data-sid="${esc(id)}">${rvCard(id)}</div>`);
  if(RVW[id]===undefined)rvLoad(id);
}}

let RVF=null;          // the review being written
function rvOpen(sid,stars){
  const s=CAT.series.find(x=>x.id===sid);if(!s)return;
  const r=RVW[sid]||null,ph=pfGet().photo;
  RVF={sid,rating:stars||(r&&r.rating)||0,photo:r?!!r.photo:!!ph};
  sheet(`<h2 class="sht">${r?'Edit your review':'Rate this series'}</h2><div class="shl"></div>
   <div class="sm mut" style="margin-bottom:10px">${esc(s.title)}</div>
   <div class="rvpick big" id="rvpk">${[1,2,3,4,5].map(i=>`<button aria-label="${i} star${i>1?'s':''}" onclick="rvSet(${i})">★</button>`).join('')}</div>
   <div class="sm mut" id="rvlbl" style="text-align:center;min-height:20px"></div>
   <label class="pfl">Your review <span class="mut">(optional)</span></label>
   <textarea class="pfi" id="rvtx" rows="4" maxlength="600" placeholder="What did you like? How did the tests help you?">${esc(r?r.body:'')}</textarea>
   ${ph?`<label class="rvph"><input type="checkbox" id="rvpc" ${RVF.photo?'checked':''}> <span class="bigav" style="width:34px;height:34px">${pfInner('')}</span> Show my profile photo</label>`:''}
   <div class="rvpriv">${ic('lock',14)}<span>Shown on the store as <b>${esc(rvName())}</b>${ph?' with your photo if you tick the box.':/\.$/.test(rvName())?'':'.'} Your mobile number and other details are never shown.</span></div>
   <div class="err" id="rver" style="color:var(--bad);font-size:13px;min-height:18px"></div>
   <button class="btn block" id="rvgo" onclick="rvSave()">${ic('check')} ${r?'Save changes':'Post review'}</button>
   ${r?`<button class="btn ghost block" style="margin-top:10px;color:var(--bad)" onclick="rvDel('${sid}')">Delete my review</button>`:''}`,'review');
  rvSet(RVF.rating);
}
// same rule as the server: first name + initial of the last name
function rvName(){const w=String(AUTH.name||'').replace(/[^A-Za-zऀ-ॿ\s]/g,'').trim().split(/\s+/).filter(Boolean);
  const cap=x=>x.charAt(0).toUpperCase()+x.slice(1).toLowerCase();
  return !w.length?'Student':w.length===1?cap(w[0]):cap(w[0])+' '+w[w.length-1].charAt(0).toUpperCase()+'.'}
const RVL=['','Poor','Okay','Good','Very good','Excellent'];
function rvSet(n){
  if(!RVF)return;RVF.rating=n;
  document.querySelectorAll('#rvpk button').forEach((b,i)=>b.classList.toggle('on',i<n));
  const l=document.getElementById('rvlbl');if(l)l.textContent=n?RVL[n]:'Tap a star to rate';
}
// small square copy of the profile photo (a few KB) — the full photo never leaves the phone
function rvThumb(src){
  return new Promise(res=>{const im=new Image();im.onload=()=>{try{
    const c=document.createElement('canvas'),z=96,m=Math.min(im.width,im.height);c.width=c.height=z;
    c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,z,z);
    const d=c.toDataURL('image/jpeg',.72);res(d.length<=30000?d:'');
  }catch(e){res('')}};im.onerror=()=>res('');im.src=src});
}
async function rvSave(){
  if(!RVF)return;const er=document.getElementById('rver');
  if(!RVF.rating){er.textContent='Please tap the stars to give a rating.';return}
  const b=document.getElementById('rvgo');b.disabled=true;er.textContent='';
  const pc=document.getElementById('rvpc'),ph=pfGet().photo;
  const photo=pc&&pc.checked&&ph?await rvThumb(ph):'';
  const r=await rpc('cbt_review_save',{p_series:RVF.sid,p_rating:RVF.rating,p_body:document.getElementById('rvtx').value.trim(),p_photo:photo});
  b.disabled=false;
  if(!r.ok){
    if(authErr(r))return;
    er.textContent=r.error==='not_unlocked'?'You can review a series once it is unlocked for you.':r.error==='busy'?'Please wait a few seconds and try again.':r.error==='network'?'No internet. Please try again.':'Could not save. Please try again.';
    return;
  }
  const sid=RVF.sid;RVF=null;closeModal();
  toast(r.status==='pending'?'Thanks! Your review will show after a quick check.':r.status==='hidden'?'Saved.':'Thanks for your review! ⭐');
  await rvLoad(sid);
}
async function rvDel(sid){
  if(!confirm('Delete your review? It will be removed from the store.'))return;
  const r=await rpc('cbt_review_delete',{p_series:sid});
  if(!r.ok){if(!authErr(r))toast('Could not delete. Please try again.');return}
  closeModal();RVW[sid]=null;rvSlot(sid);toast('Review deleted');
}
;(window.__p=window.__p||{})['app14']=1;
