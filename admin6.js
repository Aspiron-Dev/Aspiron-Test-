/* ================= v9 admin: Home banners (promo slider on the student Home page) ================= */
async function AB(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_banners',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.banners='<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 15l5-5 4 4 3-3 8 8"/><circle cx="16" cy="9" r="1.5"/>';
NAVX.splice(NAVX.findIndex(x=>x[0]==='notices')+1,0,['banners','Home banners']);
XTRA.push('banners');TTL.banners='Home banners';
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='banners')return loadBanners();return r}}
{const _m=openMore;openMore=function(){_m();const g=document.querySelector('#layer .mgrid2');if(g&&!g.querySelector('[data-bn]'))g.insertAdjacentHTML('afterbegin',`<button class="mitem" data-bn onclick="closeModal();tab('banners')">${ai('banners',20)}<span>Home banners</span><em class="nb"></em></button>`)}}

let BNL=[],BNIMG;
async function loadBanners(){
  const p=$('#pn_banners');if(!p)return;
  if(!p.querySelector('#bnbox'))p.innerHTML=`<div class="phead"><div><h1>Home banners</h1><p class="sm mut">These slide automatically at the top of every student's Home page. Tap a banner and it opens its link — your test series, a WhatsApp group, a partner website, anything.</p></div></div><div id="bnbox"><div class="card"><div class="sk" style="width:50%"></div></div></div>`;
  const r=await AB('list');const box=$('#bnbox');if(!box)return;
  if(!r.ok){box.innerHTML=`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Open Supabase → SQL Editor, paste the file <b>supabase_v9_banners.sql</b> and press Run once. Then refresh this page.':'Check your internet and try again.'}</p></div>`;return}
  BNL=r.items||[];drawBanners();
}
function drawBanners(){
  const box=$('#bnbox');if(!box)return;
  box.innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;gap:10px"><p class="sm mut" style="margin:0;flex:1">Best image size: <b>1200 × 560 px</b> (wide). If no banner is live, students see the default banners.</p><button class="btn" onclick="bnModal()">+ New banner</button></div>
   ${BNL.length?BNL.map((x,i)=>`<div class="annr bnr ${x.active?'':'off'}">${x.img?`<img src="${x.img}" alt="">`:`<div class="bnph">${esc(x.title||'Text banner')}</div>`}<div class="grow"><b>${esc(x.title||'(no title)')}</b>
     <div class="sm mut" style="word-break:break-all">${x.link?esc(x.link):'No link'}</div>
     <div class="chips" style="margin-top:6px"><span class="chip">#${i+1}</span>${x.active?'<span class="chip ok">Live</span>':'<span class="chip">Hidden</span>'}</div>
     <div class="acts"><button class="btn ghost sm" ${i?'':'disabled'} onclick="bnMove(${i},-1)">↑</button><button class="btn ghost sm" ${i<BNL.length-1?'':'disabled'} onclick="bnMove(${i},1)">↓</button><button class="btn ghost sm" onclick="bnModal('${x.id}')">Edit</button><button class="btn ghost sm" onclick="bnToggle('${x.id}',${!x.active})">${x.active?'Hide':'Show'}</button><button class="btn danger sm" onclick="bnDel('${x.id}')">Delete</button></div></div></div>`).join('')
   :`<div class="sm mut" style="padding:18px 4px;text-align:center">No banners yet. Add your first one — e.g. your All India Test Series, your WhatsApp channel, or a partner's course.</div>`}</div>`;
}
function bnModal(id){
  const x=id?BNL.find(v=>v.id===id):null;BNIMG=undefined;
  modal(`<h2>${x?'Edit':'New'} banner</h2>
   <label class="l">Banner image</label><div id="bnprev" style="margin-bottom:8px">${x&&x.img?`<img src="${x.img}" style="width:100%;border-radius:12px">`:''}</div>
   <div class="row"><label class="btn soft sm" style="cursor:pointer">📷 Choose image<input type="file" accept="image/*" style="display:none" onchange="bnPick(this)"></label><button class="btn ghost sm" id="bnrm" style="${x&&x.img?'':'display:none'}" onclick="BNIMG='';$('#bnprev').innerHTML='';this.style.display='none'">Remove image</button></div>
   <p class="sm mut" style="margin:6px 0 0">No image? Students see a coloured card with the title and text below.</p>
   <label class="l">Title</label><input type="text" id="bnt" maxlength="60" value="${esc(x?x.title:'')}" placeholder="e.g. AITS 2027 — Join now">
   <label class="l">Short text (for banners without image)</label><input type="text" id="bnx" maxlength="120" value="${esc(x?x.text||'':'')}" placeholder="e.g. Real NEET pattern · All-India rank">
   <label class="l">Link when tapped</label><input type="text" inputmode="url" id="bnl" value="${esc(x?x.link:'')}" placeholder="https://… or https://wa.me/91… or #/series">
   <label class="chk" style="margin-top:12px"><input type="checkbox" id="bna" ${!x||x.active?'checked':''}><span>Show to students</span></label>
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="bnsv" onclick="bnSave('${id||''}')">${x?'Save':'Publish'}</button></div>`,true);
}
async function bnPick(inp){
  const f=inp.files[0];if(!f)return;
  try{const d=await compressDataUrl(await fileToUrl(f),1200,.82);if(!d)throw 0;BNIMG=d;$('#bnprev').innerHTML=`<img src="${d}" style="width:100%;border-radius:12px">`;$('#bnrm').style.display=''}catch(e){toast('Could not use this image')}
}
async function bnSave(id){
  const b=$('#bnsv'),data={id:id||null,title:$('#bnt').value.trim(),text:$('#bnx').value.trim(),link:$('#bnl').value.trim(),active:$('#bna').checked};
  if(BNIMG!==undefined)data.image=BNIMG;
  const hasImg=BNIMG?true:(BNIMG===undefined&&id&&(BNL.find(v=>v.id===id)||{}).img);
  if(!hasImg&&!data.title)return toast('Add an image or a title');
  if(data.link&&!/^(https?:\/\/|#\/)/i.test(data.link))return toast('Link must start with https:// (or #/ for a page in the app)');
  b.disabled=true;b.textContent='Saving…';
  const r=await AB('save',data);
  if(!r.ok){b.disabled=false;b.textContent=id?'Save':'Publish';return toast(r.error==='link'?'That link does not look right':r.error==='image'?'Image is too big':r.error==='limit'?'Too many banners (20). Delete some.':'Could not save')}
  closeModal();toast(id?'Banner saved':'Banner published');loadBanners();
}
async function bnToggle(id,on){const r=await AB('toggle',{id,active:on});if(r.ok){toast(on?'Banner is live':'Banner hidden');loadBanners()}else toast('Could not update')}
async function bnDel(id){if(!confirm('Delete this banner?'))return;const r=await AB('delete',{id});if(r.ok){toast('Deleted');loadBanners()}else toast('Could not delete')}
async function bnMove(i,d){
  const j=i+d;if(j<0||j>=BNL.length)return;[BNL[i],BNL[j]]=[BNL[j],BNL[i]];drawBanners();
  const r=await AB('order',{ids:BNL.map(x=>x.id)});if(!r.ok){toast('Could not save order');loadBanners()}
}

/* ---------- share links for each series ---------- */
function shareSeriesAdm(id){
  const s=CA.series.find(x=>x.id===id);if(!s)return;
  const url=siteUrl()+'#/s/'+id,msg=`${s.title}\n${s.description?s.description+'\n':''}\nOpen: ${url}`;
  modal(`<h2>Share “${esc(s.title)}”</h2><p class="sm mut" style="margin:4px 0 10px">Send this link anywhere — WhatsApp, Telegram, Instagram bio, banners. It opens this series directly. New students can tap “Request access” and you approve them.</p>
   <div class="row"><input type="text" readonly value="${esc(url)}" style="flex:1" onclick="this.select()"><button class="btn sm" onclick="copyText('${esc(url)}')">Copy</button></div>
   <div class="row" style="margin-top:12px"><a class="btn soft" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ai('wa',16)} WhatsApp</a><a class="btn soft" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(s.title)}">Telegram</a></div>
   <p class="sm mut" style="margin:12px 0 0">Tip: use <b>#/s/${id}</b> as the link of a Home banner to open this series from the banner.</p>
   <button class="btn ghost block" style="margin-top:12px" onclick="closeModal()">Done</button>`);
}
{const _rc=renderContent;renderContent=async function(){
  const r=await _rc.apply(this,arguments);
  CA.series.forEach(s=>{const row=document.querySelector(`#acc_${s.id} .bd .row`);if(row&&!row.querySelector('.shs'))row.insertAdjacentHTML('beforeend',`<button class="btn soft sm shs" onclick="shareSeriesAdm('${s.id}')">🔗 Share link</button>`)});
  const top=document.querySelector('#pn_content > .row');
  if(top&&!document.getElementById('sitelink'))top.insertAdjacentHTML('afterend',`<div class="card" id="sitelink" style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div class="grow" style="min-width:180px"><b>Website link</b><div class="sm mut" style="word-break:break-all">${esc(siteUrl())}</div></div><button class="btn soft sm" onclick="copyText('${esc(siteUrl())}')">Copy</button><a class="btn soft sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent((CFG.SITE_NAME||'Test series')+'\n'+siteUrl())}">${ai('wa',14)} WhatsApp</a></div>`);
  return r;
}}

/* ---------- push notifications to students' phones (works even when their app is closed) ---------- */
let PUSHON=true;
async function sendPush(o){
  try{
    const r=await fetch(CFG.SUPABASE_URL+'/functions/v1/send-push',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pw:PW},o))});
    const j=await r.json().catch(()=>({ok:false,error:'server'}));
    if(j.ok)toast(j.total?`📲 Sent to ${j.sent} phone${j.sent==1?'':'s'}`:'📲 No phones have turned on notifications yet');
    else toast(r.status===404?'Phone push is not set up yet (see setup steps)':'Phone push failed: '+(j.error||r.status));
    return j;
  }catch(e){toast('Phone push failed (network)');return{ok:false}}
}
{const _am=annModal;annModal=async function(id){
  const r=_am.apply(this,arguments);
  const chk=document.querySelector('#layer #aa');
  if(chk&&!document.getElementById('apush'))chk.closest('label').insertAdjacentHTML('afterend',`<label class="chk" style="margin-top:8px"><input type="checkbox" id="apush" ${id?'':'checked'} onchange="PUSHON=this.checked"><span>📲 Also send to students' phones (even if the app is closed)</span></label>`);
  PUSHON=!id;return r;
}}
{const _aa=AA;AA=async function(action,data){
  const r=await _aa(action,data);
  if(action==='save'&&r&&r.ok&&data&&data.active&&PUSHON){
    PUSHON=false;
    sendPush({title:(data.title||'').trim()||'New notice',body:(data.text||'').trim().slice(0,180)||'Tap to read',url:'#/n',tag:'ann-'+(r.id||data.id||Date.now())});
  }
  return r;
}}
async function pushCount(){
  try{const r=await fetch(API+'/rest/v1/rpc/cbt_admin_push_count',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW})});return r.ok?await r.json():{ok:false}}catch(e){return{ok:false}}
}
{const _ln=loadNotices;loadNotices=async function(){
  const r=await _ln.apply(this,arguments);
  const box=document.getElementById('annbox');if(!box||document.getElementById('pushc'))return r;
  box.insertAdjacentHTML('beforebegin',`<div class="card" id="pushc" style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div style="font-size:26px">📲</div><div class="grow" style="min-width:180px"><b>Phone notifications</b><div class="sm mut" id="pushn">Checking…</div></div><button class="btn soft sm" onclick="pushTest()">Send a test</button></div>`);
  const c=await pushCount(),e=document.getElementById('pushn');
  if(e)e.innerHTML=c.ok?`<b>${c.students}</b> student${c.students==1?'':'s'} on <b>${c.phones}</b> phone${c.phones==1?'':'s'} will get your notices on their phone, even when the app is closed.`:'Not set up yet — run <b>supabase_v10_push.sql</b> and deploy the <b>send-push</b> function (see setup steps).';
  return r;
}}
function pushTest(){
  modal(`<h2>📲 Send a phone notification</h2><p class="sm mut" style="margin:4px 0 0">Goes to every student who turned on notifications.</p>
   <label class="l">Title</label><input type="text" id="pt" maxlength="60" value="Test notification">
   <label class="l">Message</label><input type="text" id="pb" maxlength="150" value="Notifications are working 🎉">
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="const t=$('#pt').value,b=$('#pb').value;closeModal();sendPush({title:t,body:b,url:'#/n'})">Send</button></div>`);
}
;(window.__p=window.__p||{})['admin6']=1;
