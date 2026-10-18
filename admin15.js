/* ===== Admin: Reviews — every student review of the store's series: show / hide, pin, reply, delete =====
   Server: supabase_v23_reviews.sql (cbt_admin_reviews). Only students whose series is unlocked can write a review. */
async function ARV(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_reviews',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.reviews='<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>';
XTRA.push('reviews');TTL.reviews='Reviews';
HUBS.store.tabs.push(['reviews','Reviews']);MKNOWN.add('reviews');
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='reviews')return loadReviews();return r}}

let RVA={items:[],moderate:false,f:'all',s:'',q:''};
const rvStarsA=n=>`<span style="color:#f5a524;letter-spacing:1px">${'★'.repeat(n)}</span><span style="color:var(--bd);letter-spacing:1px">${'★'.repeat(5-n)}</span>`;
const rvSer=id=>(CA.series.find(z=>z.id===id)||{}).title||'Series';
async function loadReviews(){
  const p=$('#pn_reviews');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Reviews</h1><p class="sm mut">Ratings from students whose series is unlocked. Shown on the store with first name + initial and their photo (if they chose). Mobile numbers are only visible here.</p></div></div><div id="rvbody">${askel()}</div>`;
  if(!CA.series.length)loadCatalog();
  const r=await ARV('get');
  if(!r.ok){$('#rvbody').innerHTML=`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Open Supabase → SQL Editor, paste <b>supabase_v23_reviews.sql</b> and press Run once. Then refresh.':'Check your internet and try again.'}</p></div>`;return}
  RVA.items=r.items||[];RVA.moderate=!!r.moderate;rvDraw();
}
function rvDraw(){
  const b=$('#rvbody');if(!b)return;const I=RVA.items;
  const shown=I.filter(x=>x.status==='shown'),pend=I.filter(x=>x.status==='pending').length,hid=I.filter(x=>x.status==='hidden').length;
  const avg=shown.length?(shown.reduce((a,x)=>a+x.rating,0)/shown.length).toFixed(1):'–';
  const sers=[...new Set(I.map(x=>x.series_id))];
  b.innerHTML=`<div class="sstats" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px"><div class="sbox"><b>${avg}${shown.length?'★':''}</b><span>Average</span></div><div class="sbox"><b>${shown.length}</b><span>Shown</span></div><div class="sbox"><b>${pend}</b><span>Waiting</span></div><div class="sbox"><b>${hid}</b><span>Hidden</span></div></div>
   <div class="card" style="display:flex;gap:12px;align-items:center"><div style="flex:1;min-width:0"><b>Check reviews before they show</b><div class="sm mut">${RVA.moderate?'On — new and edited reviews wait here until you tap Show.':'Off — reviews show on the store straight away. You can still hide or delete any of them.'}</div></div>
    <button class="btn ${RVA.moderate?'':'ghost'} sm" onclick="rvMod(this)">${RVA.moderate?'On':'Off'}</button></div>
   <div class="row" style="gap:6px;flex-wrap:wrap;margin:12px 0 10px">${[['all','All'],['pending','Waiting'],['shown','Shown'],['hidden','Hidden']].map(([k,l])=>`<button class="btn ${RVA.f===k?'':'ghost'} sm" onclick="RVA.f='${k}';rvDraw()">${l}</button>`).join('')}
    ${sers.length>1?`<select onchange="RVA.s=this.value;rvDraw()" style="min-width:140px"><option value="">All series</option>${sers.map(s=>`<option value="${esc(s)}" ${RVA.s===s?'selected':''}>${esc(rvSer(s))}</option>`).join('')}</select>`:''}
    <input type="search" placeholder="Search name / mobile / text" value="${esc(RVA.q)}" style="flex:1;min-width:160px" oninput="RVA.q=this.value;rvList()"></div>
   <div id="rvl"></div>`;
  rvList();
}
function rvList(){
  const e=$('#rvl');if(!e)return;const q=RVA.q.trim().toLowerCase();
  const L=RVA.items.filter(x=>(RVA.f==='all'||x.status===RVA.f)&&(!RVA.s||x.series_id===RVA.s)&&(!q||(x.name+' '+x.mobile+' '+x.body).toLowerCase().includes(q)));
  e.innerHTML=L.length?L.map(rvRow).join(''):`<div class="card empty"><p class="sm mut">${RVA.items.length?'No reviews here.':'No reviews yet. Students see “Rate this series” on an unlocked series in the app.'}</p></div>`;
}
function rvRow(x){
  const st={shown:'<span class="chip ok">Shown</span>',pending:'<span class="chip warn">Waiting</span>',hidden:'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Hidden</span>'}[x.status]||'';
  const t=new Date(x.updated_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  const av=/^data:image\//.test(x.photo||'')?`<img src="${esc(x.photo)}" alt="" style="width:100%;height:100%;object-fit:cover">`:esc((x.name||'S')[0].toUpperCase());
  return `<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:10px;align-items:center">
    <span style="flex:none;width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:700">${av}</span>
    <div style="flex:1;min-width:0"><b>${esc(x.name)}</b> ${st} ${x.pinned?'<span class="chip pri">📌 Pinned</span>':''}<div class="sm mut">${esc(x.mobile)} · ${esc(rvSer(x.series_id))} · ${t}</div></div></div>
   <div style="margin-top:8px">${rvStarsA(x.rating)}</div>${x.body?`<p style="margin:6px 0 0;white-space:pre-wrap;word-break:break-word">${esc(x.body)}</p>`:''}
   ${x.reply?`<div class="sm" style="margin-top:8px;background:var(--surface2);border-radius:10px;padding:7px 10px"><b>Your reply:</b> ${esc(x.reply)}</div>`:''}
   <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">
    ${x.status!=='shown'?`<button class="btn sm" onclick="rvAct('${x.id}','status',{status:'shown'})">✅ Show</button>`:`<button class="btn ghost sm" onclick="rvAct('${x.id}','status',{status:'hidden'})">🙈 Hide</button>`}
    <button class="btn ghost sm" onclick="rvAct('${x.id}','pin',{pinned:${!x.pinned}})">📌 ${x.pinned?'Unpin':'Pin to top'}</button>
    <button class="btn ghost sm" onclick="rvReply('${x.id}')">💬 ${x.reply?'Edit reply':'Reply'}</button>
    ${x.photo?`<button class="btn ghost sm" onclick="rvAct('${x.id}','remove_photo')">Remove photo</button>`:''}
    <button class="btn ghost sm" style="color:var(--bad)" onclick="rvDelA('${x.id}')">🗑 Delete</button></div></div>`;
}
async function rvAct(id,action,data){
  const r=await ARV(action,Object.assign({id},data||{}));
  if(!r.ok){toast('Could not save');return}
  const x=RVA.items.find(z=>z.id===id);
  if(x){if(action==='status')x.status=data.status;else if(action==='pin')x.pinned=data.pinned;else if(action==='remove_photo')x.photo='';else if(action==='reply')x.reply=data.reply}
  toast('Saved');rvDraw();
}
function rvReply(id){
  const x=RVA.items.find(z=>z.id===id);if(!x)return;
  modal(`<h2>Reply to ${esc(x.name)}</h2><p class="sm mut">Shown under the review on the store page. Leave empty to remove the reply.</p>
   <textarea id="rvrt" rows="4" maxlength="400" style="width:100%">${esc(x.reply||'')}</textarea>
   <div class="row" style="margin-top:12px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="rvReplySave('${id}')">Save</button></div>`);
}
function rvReplySave(id){const v=$('#rvrt').value.trim();closeModal();rvAct(id,'reply',{reply:v})}
async function rvDelA(id){
  const x=RVA.items.find(z=>z.id===id);if(!x||!confirm(`Delete the review by ${x.name}? This cannot be undone.`))return;
  const r=await ARV('delete',{id});if(!r.ok){toast('Could not delete');return}
  RVA.items=RVA.items.filter(z=>z.id!==id);toast('Review deleted');rvDraw();
}
async function rvMod(b){
  b.disabled=true;const on=!RVA.moderate,r=await ARV('moderate',{on});b.disabled=false;
  if(!r.ok){toast('Could not save');return}
  RVA.moderate=on;toast(on?'New reviews will wait for you':'Reviews show straight away');rvDraw();
}
// the sidebar may already be drawn: redraw it so Reviews shows under Store
{const s=document.querySelector('.snav');if(s){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}
;(window.__p=window.__p||{})['admin15']=1;
