/* ===== Admin: Store — products on store.html, UPI / Telegram settings, orders to verify ===== */
async function ASTO(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_store',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.store='<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M10 20v-5h4v5"/>';
NAVX.splice(NAVX.findIndex(x=>x[0]==='pyq')+1,0,['store','Store']);
XTRA.push('store');TTL.store='Store';
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='store')return loadStore();return r}}
{const _m=openMore;openMore=function(){_m();const g=document.querySelector('#layer .mgrid2');if(g&&!g.querySelector('[data-sto]'))g.insertAdjacentHTML('afterbegin',`<button class="mitem" data-sto onclick="closeModal();tab('store')">${ai('store',20)}<span>Store</span><em class="nb"></em></button>`)}}

let SS={settings:{},items:[],orders:[],of:'pending'};
const stoUrl=()=>new URL('store.html',location.href).href;
const SCOL=[['blue','Blue'],['green','Green'],['purple','Purple'],['orange','Orange'],['red','Red'],['dark','Dark']];
async function loadStore(){
  const p=$('#pn_store');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Store</h1><p class="sm mut">Your public page where students see the paid test series and pay by UPI. Share this link anywhere.</p></div></div><div id="stobody">${askel()}</div>`;
  if(!CA.series.length)loadCatalog();
  const r=await ASTO('get');
  if(!r.ok){$('#stobody').innerHTML=`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Open Supabase → SQL Editor, paste <b>supabase_v13_store.sql</b> and press Run once. Then refresh.':'Check your internet and try again.'}</p></div>`;return}
  SS=Object.assign(SS,{settings:r.settings||{},items:r.items||[],orders:r.orders||[]});stoDraw();
}
function stoDraw(){
  const b=$('#stobody');if(!b)return;const s=SS.settings,O=SS.orders,pend=O.filter(o=>o.status==='pending').length;
  const OL=O.filter(o=>SS.of==='all'||o.status===SS.of);
  b.innerHTML=`<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:0"><b>Store link</b><div class="sm mut" style="word-break:break-all">${esc(stoUrl())}</div></div>
     <button class="btn ghost sm" onclick="copyText(stoUrl())">Copy link</button><a class="btn sm" style="text-decoration:none" href="store.html" target="_blank" rel="noopener">Open</a></div>
   <div class="h2s">🧾 Orders to check <span class="n">${pend}</span></div>
   <div class="card"><p class="sm mut" style="margin-top:0">Match the <b>order code</b> in the student's Telegram message with the payment screenshot (amount and note), then unlock the series for that mobile in <b>Students</b> and mark it paid.</p>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${[['pending','Pending'],['paid','Paid'],['rejected','Rejected'],['all','All']].map(([k,l])=>`<button class="btn ${SS.of===k?'':'ghost'} sm" onclick="SS.of='${k}';stoDraw()">${l}</button>`).join('')}
     <input type="search" id="stoq" placeholder="Search code / mobile / name" style="flex:1;min-width:160px" oninput="stoFilter(this.value)"></div>
    <div id="stol">${OL.length?OL.map(stoOrd).join(''):'<p class="sm mut">No orders here.</p>'}</div></div>
   <div class="h2s">📦 Test series on the store <span class="n">${SS.items.length}</span></div>
   ${SS.items.map((x,i)=>`<div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:10px">${x.image?`<img src="${esc(x.image)}" alt="" style="width:64px;height:40px;object-fit:cover;border-radius:8px;flex:none">`:''}<div style="flex:1;min-width:0"><b>${esc(x.title)}</b> ${x.active?'':'<span class="chip">Hidden</span>'}
     <div class="sm mut">₹${x.price}${x.mrp?` <s>₹${x.mrp}</s>`:''} · ${(x.features||[]).length} features${x.series_id?' · unlocks: '+esc((CA.series.find(z=>z.id===x.series_id)||{}).title||'series'):''}</div></div>
     <button class="btn ghost sm" onclick="stoEdit(${i})">Edit</button></div>`).join('')}
   <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="stoPick()">⚡ Add from your series</button><button class="btn ghost" onclick="stoEdit(-1)">➕ Add manually</button>${SS.items.some(x=>x.series_id)?'<button class="btn ghost" id="stors" onclick="stoResync(this)">🔄 Update all from series</button>':''}</div>
   <div class="h2s">💳 Payment details</div>
   <div class="card"><p class="sm mut" style="margin-top:0">Shown on the store page. Only this panel (admin password) can change them.</p>
    <div class="g2"><div><label class="l">UPI ID</label><input type="text" id="s_upi" value="${esc(s.upi||'')}" autocapitalize="off" spellcheck="false"></div>
     <div><label class="l">Name shown in UPI apps</label><input type="text" id="s_payee" value="${esc(s.payee||'')}"></div>
     <div><label class="l">Telegram username (screenshots)</label><input type="text" id="s_tg" value="${esc(s.telegram||'')}" autocapitalize="off" spellcheck="false"></div>
     <div><label class="l">Small note (optional)</label><input type="text" id="s_note" value="${esc(s.note||'')}" placeholder="e.g. Unlocked within 2 hours (9 am – 9 pm)"></div></div>
    <button class="btn" style="margin-top:12px" onclick="stoSaveSet(this)">Save payment details</button></div>`;
}
function stoOrd(o){
  const t=new Date(o.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  const st={pending:'<span class="chip warn">Pending</span>',paid:'<span class="chip ok">Paid</span>',rejected:'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Rejected</span>'}[o.status]||'';
  return `<div class="stoo" data-k="${esc((o.code+' '+o.mobile+' '+o.name).toLowerCase())}" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--bd);flex-wrap:wrap">
   <div style="flex:1;min-width:180px"><b style="font-family:monospace;letter-spacing:.5px">${esc(o.code)}</b> ${st}<div class="sm"><b>${esc(o.name)}</b> · ${esc(o.mobile)}</div><div class="sm mut">${esc(o.item_title)} · ₹${o.amount} · ${t}</div></div>
   <div class="row" style="gap:6px">${o.status!=='paid'?`<button class="btn sm" onclick="stoSt('${esc(o.code)}','paid')">✓ Paid</button>`:''}${o.status==='pending'?`<button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','rejected')">Reject</button>`:''}${o.status!=='pending'?`<button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','pending')">Undo</button>`:''}</div></div>`;
}
function stoFilter(q){q=q.trim().toLowerCase();document.querySelectorAll('#stol .stoo').forEach(e=>e.style.display=!q||e.dataset.k.includes(q)?'':'none')}
async function stoSt(code,status){
  const r=await ASTO('order_status',{code,status});if(!r.ok)return toast('Could not save');
  const o=SS.orders.find(x=>x.code===code);if(o)o.status=status;toast(status==='paid'?'Marked paid ✓ — unlock the series in Students':'Saved');stoDraw();
}
async function stoSaveSet(b){
  const d={upi:$('#s_upi').value.trim(),payee:$('#s_payee').value.trim(),telegram:$('#s_tg').value.trim(),note:$('#s_note').value.trim()};
  if(!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(d.upi))return toast('Enter a valid UPI ID, e.g. name@bank');
  b.disabled=true;const r=await ASTO('save_settings',d);b.disabled=false;
  if(!r.ok)return toast(r.error==='upi'?'Enter a valid UPI ID':'Could not save');
  SS.settings=Object.assign(SS.settings,d,{telegram:d.telegram.replace(/^(https?:\/\/)?(t\.me\/)?@?/,'')});toast('Saved ✓');stoDraw();
}
function stoEdit(i){
  const x=i>=0?SS.items[i]:{title:'',subtitle:'',price:'',mrp:'',badge:'',features:[],color:'blue',series_id:'',active:true,sort_order:SS.items.length};
  STOIMG=x.image||'';
  modal(`<h2>${i>=0?'Edit':'Add'} test series</h2><p class="sm mut" style="margin:2px 0 10px">Preview — this is how students see it on the store:</p><div id="p_prev"></div>
   <label class="l">Name</label><input type="text" id="p_t" maxlength="80" value="${esc(x.title)}" placeholder="e.g. NEET 2027 All India Test Series">
   <label class="l">Short line (optional)</label><input type="text" id="p_s" maxlength="200" value="${esc(x.subtitle)}" placeholder="e.g. 30 full tests · Oct to April">
   <div class="g2"><div><label class="l">Price ₹</label><input type="number" id="p_p" min="1" value="${esc(x.price)}"></div><div><label class="l">MRP ₹ (optional, shown struck)</label><input type="number" id="p_m" min="0" value="${esc(x.mrp==null?'':x.mrp)}"></div>
    <div><label class="l">Badge (optional)</label><input type="text" id="p_b" maxlength="24" value="${esc(x.badge)}" placeholder="e.g. Bestseller"></div>
    <div><label class="l">Card colour</label><select id="p_c">${SCOL.map(([k,l])=>`<option value="${k}" ${x.color===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label class="l">Unlocks which series <a href="#" onclick="event.preventDefault();stoFill()" style="color:var(--pri);font-weight:700;text-transform:none;letter-spacing:0">· fill from series</a></label><select id="p_ser"><option value="">—</option>${CA.series.map(s=>`<option value="${esc(s.id)}" ${x.series_id===s.id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
    <div><label class="l">Order on page</label><input type="number" id="p_o" value="${esc(x.sort_order||0)}"></div></div>
   <label class="l">Photo on the store card</label><div class="row" style="gap:8px;align-items:center"><div id="p_img">${stoImgHtml()}</div>
    <label class="btn soft sm" style="cursor:pointer">📷 Upload<input type="file" accept="image/*" style="display:none" onchange="stoImgUp(this)"></label><button class="btn ghost sm" onclick="stoImgSet('')">Remove</button></div>
      <label class="l">Features (one per line)</label><textarea id="p_f" style="min-height:130px" placeholder="30 full-length NEET mock tests&#10;All-India rank after every test&#10;Detailed solutions">${esc((x.features||[]).join('\n'))}</textarea>
   <label class="chk"><input type="checkbox" id="p_a" ${x.active?'checked':''}><span>Show on the store page</span></label>
   <div class="row" style="margin-top:12px">${i>=0?`<button class="btn danger" onclick="stoDel(${i})">Delete</button>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="p_go" onclick="stoSave(${i})">Save</button></div>`);
  stoPrev();if(!window.__stoPB){window.__stoPB=1;document.addEventListener('input',e=>{if(e.target.closest('#layer'))stoPrev()})}
}
async function stoSave(i){
  const d={id:i>=0?SS.items[i].id:'',title:$('#p_t').value.trim(),subtitle:$('#p_s').value.trim(),price:parseInt($('#p_p').value,10),mrp:$('#p_m').value?parseInt($('#p_m').value,10):'',
    badge:$('#p_b').value.trim(),color:$('#p_c').value,series_id:$('#p_ser').value,sort_order:parseInt($('#p_o').value,10)||0,active:$('#p_a').checked,
    features:$('#p_f').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,20),image:STOIMG};
  if(!d.title)return toast('Enter the name');if(!(d.price>0))return toast('Enter the price');
  const b=$('#p_go');b.disabled=true;const r=await ASTO('save_item',d);b.disabled=false;
  if(!r.ok)return toast('Could not save');closeModal();toast('Saved ✓');loadStore();
}
async function stoDel(i){
  const x=SS.items[i];if(!confirm(`Delete "${x.title}" from the store? Old orders stay.`))return;
  const r=await ASTO('delete_item',{id:x.id});if(!r.ok)return toast('Could not delete');closeModal();toast('Deleted');loadStore();
}

/* ---------- fill store items from the series you already have ---------- */
let STOIMG='';
const stoImgHtml=()=>STOIMG?`<img src="${esc(STOIMG)}" alt="" style="width:96px;height:56px;object-fit:cover;border-radius:10px;display:block">`:'<span class="sm mut">No photo</span>';
function stoImgSet(d){STOIMG=d||'';const e=$('#p_img');if(e)e.innerHTML=stoImgHtml();stoPrev()}
async function stoImgUp(inp){
  const f=inp.files[0];if(!f)return;
  try{const d=await compressDataUrl(await fileToUrl(f),900,.78);if(!d)throw 0;stoImgSet(d)}catch(e){toast('Could not read the photo')}
}
async function stoCover(sid){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_series_cover',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_series:sid})});
    if(r.ok){const j=await r.json();if(j.ok&&j.cover)return j.cover}
  }catch(e){}
  const r=await ASTO('series_cover',{id:sid});return r.ok?r.cover:'';
}
function stoAuto(s){
  const n=CA.tests.filter(t=>t.series_id===s.id).length,d=String(s.description||'').replace(/\r/g,'').trim();
  // split the description into short points: lines, bullets, | ; and sentences
  let parts=d.replace(/([.!?])\s+(?=[A-Z0-9₹])/g,'$1\n').split(/\n+|[•\u2022|;]/).map(x=>x.replace(/^[\s\-*–>✓✔]+/,'').replace(/\s+/g,' ').replace(/\.$/,'').trim()).filter(x=>x.length>1);
  parts=parts.map(x=>x.length>110?x.slice(0,107).replace(/\s\S*$/,'')+'…':x);
  const isList=/^[\s•\u2022\-*✓✔]/.test(d),sub=!isList&&parts.length?parts.shift():'',f=[];
  // the description's own number of tests wins over how many are uploaded so far
  if(n&&!/\d+\s*(\+\s*)?(full[- ]?(length|syllabus)?\s*|mock\s*|chapter[- ]?wise\s*|part\s*|unit\s*)?tests?\b/i.test(d))f.push(`${n} test${n>1?'s':''} in this series`);
  for(const l of parts)if(f.length<6&&!f.some(x=>x.toLowerCase()===l.toLowerCase()))f.push(l);
  for(const l of ['All-India rank after every test','Detailed solutions & analysis'])if(f.length<8)f.push(l);
  const pm=String(s.price_label||'').replace(/,/g,'').match(/\d+/);
  return{title:s.title,subtitle:sub.slice(0,200),price:pm?parseInt(pm[0],10):'',features:f,series_id:s.id};
}
async function stoFill(){
  const sid=$('#p_ser').value,s=CA.series.find(x=>x.id===sid);if(!s)return toast('Choose the series first');
  const a=stoAuto(s);$('#p_t').value=a.title;$('#p_s').value=a.subtitle;if(a.price)$('#p_p').value=a.price;$('#p_f').value=a.features.join('\n');
  const c=await stoCover(sid);if(c){stoImgSet(c);toast('Filled ✓')}else toast('Filled ✓ (no cover photo on this series)');
}
function stoPick(){
  if(!CA.series.length)return toast('No series yet. Create one in Tests first.');
  const used=new Set(SS.items.map(x=>x.series_id).filter(Boolean));
  const L=CA.series.filter(s=>!used.has(s.id));
  if(!L.length)return toast('All your series are already on the store');
  modal(`<h2>Add from your series</h2><p class="sm mut" style="margin:4px 0 12px">Name, description, number of tests and cover photo are taken from the series. Check the price, then add.</p>
   ${L.map(s=>{const a=stoAuto(s),n=CA.tests.filter(t=>t.series_id===s.id).length;return `<div class="arow" style="align-items:center;gap:10px"><label class="chk" style="padding:0;flex:1;min-width:0"><input type="checkbox" class="spk" value="${esc(s.id)}" ${s.is_free?'':'checked'}><span><b>${esc(s.title)}</b><br><span class="sm mut">${n} tests${s.is_free?' · free series':''}${s.has_cover?' · has photo':''}</span>${a.subtitle?`<br><span class="sm">“${esc(a.subtitle)}”</span>`:''}<br><span class="sm mut">${esc(a.features.slice(0,3).join(' · '))}</span></span></label>
     <input type="number" min="1" class="spp" data-id="${esc(s.id)}" value="${esc(a.price)}" placeholder="₹ price" style="width:96px;flex:none"></div>`}).join('')}
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="spgo" onclick="stoPickGo()">Add selected</button></div>`);
}
async function stoPickGo(){
  const ids=[...document.querySelectorAll('.spk:checked')].map(e=>e.value);if(!ids.length)return toast('Select at least one series');
  const pr={};document.querySelectorAll('.spp').forEach(e=>pr[e.dataset.id]=parseInt(e.value,10));
  const miss=ids.filter(id=>!(pr[id]>0));if(miss.length)return toast('Enter the price for every selected series');
  const b=$('#spgo');b.disabled=true;let n=0,ord=SS.items.length;
  for(const id of ids){
    const s=CA.series.find(x=>x.id===id);b.textContent=`Adding ${++n}/${ids.length}…`;
    const a=stoAuto(s),image=await stoCover(id);
    const r=await ASTO('save_item',{title:a.title,subtitle:a.subtitle,price:pr[id],mrp:'',badge:'',color:SCOL[(ord)%SCOL.length][0],series_id:id,sort_order:ord++,active:true,features:a.features,image});
    if(!r.ok){b.disabled=false;b.textContent='Try again';return toast('Could not add '+s.title)}
  }
  closeModal();toast(`✓ ${ids.length} series added to the store`);loadStore();
}
// re-fill name, description, features and photo of every store item linked to a series (price, MRP, badge, colour stay)
async function stoResync(b){
  if(!CA.series.length)await loadCatalog();
  const L=SS.items.filter(x=>x.series_id&&CA.series.some(s=>s.id===x.series_id));if(!L.length)return toast('No store item is linked to a series');
  b.disabled=true;let n=0,img=0;
  for(const x of L){
    b.textContent=`Updating ${++n}/${L.length}…`;const s=CA.series.find(z=>z.id===x.series_id),a=stoAuto(s),c=await stoCover(s.id);if(c)img++;
    const r=await ASTO('save_item',{id:x.id,title:a.title,subtitle:a.subtitle,price:x.price,mrp:x.mrp==null?'':x.mrp,badge:x.badge||'',color:x.color||'blue',series_id:x.series_id,sort_order:x.sort_order||0,active:x.active!==false,features:a.features,image:c||x.image||''});
    if(!r.ok){b.disabled=false;b.textContent='Try again';return toast('Could not update '+x.title)}
  }
  toast(`✓ ${L.length} updated · photos found for ${img}`+(img<L.length?' — upload the rest in Edit':''));loadStore();
}
// live preview of the store card inside the edit form
function stoPrev(){
  const box=$('#p_prev');if(!box)return;const v=id=>{const e=$(id);return e?e.value:''};
  const price=parseInt(v('#p_p'),10)||0,mrp=parseInt(v('#p_m'),10)||0,off=mrp>price&&price?Math.round((1-price/mrp)*100):0;
  const F=v('#p_f').split('\n').map(x=>x.trim()).filter(Boolean),col={blue:'#1d6fe8,#3b9bff',green:'#0f9d6b,#12a58a',purple:'#6d3fe0,#a855f7',orange:'#e8590c,#f59f00',red:'#d6336c,#f03e3e',dark:'#1e293b,#475569'}[v('#p_c')]||'#1d6fe8,#3b9bff';
  box.innerHTML=`<div style="border-radius:16px;overflow:hidden;box-shadow:var(--shadow);background:var(--surface);max-width:340px;margin-bottom:6px">
   <div style="position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,${col});color:#fff;display:flex;align-items:flex-end;padding:12px">
    ${STOIMG?`<img src="${esc(STOIMG)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`:`<b style="font-size:17px">${esc(v('#p_t')||'Series name')}</b>`}
    ${v('#p_b')?`<span style="position:absolute;top:8px;left:8px;background:#fff;color:#111;font-size:10px;font-weight:800;border-radius:99px;padding:3px 8px">${esc(v('#p_b'))}</span>`:''}
    ${off?`<span style="position:absolute;top:8px;right:8px;background:#12945f;color:#fff;font-size:11px;font-weight:800;border-radius:8px;padding:3px 7px">${off}% OFF</span>`:''}</div>
   <div style="padding:10px 12px 12px"><b style="font-size:15px">${esc(v('#p_t')||'Series name')}</b>${v('#p_s')?`<div class="sm mut">${esc(v('#p_s'))}</div>`:''}
    <div style="margin:6px 0"><b style="font-size:20px">₹${price||'—'}</b> ${off?`<s class="sm mut">₹${mrp}</s>`:''}</div>
    ${F.slice(0,4).map(f=>`<div class="sm">✓ ${esc(f)}</div>`).join('')}${F.length>4?`<div class="sm" style="color:var(--pri)">+ ${F.length-4} more</div>`:''}</div></div>`;
}
// whenever a series cover is uploaded or removed, keep the store's copy (and the store cards of that series) in sync
async function stoCoverSync(sid,img){
  try{await fetch(API+'/rest/v1/rpc/cbt_admin_series_cover',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_series:sid,p_set:img})})}catch(e){}
}
uploadCover=async function(sid,inp){
  const f=inp.files[0];if(!f)return;
  try{
    const d=await compressDataUrl(await fileToUrl(f),900,.78);if(!d)throw new Error('image');
    const r=await A('series_cover',{id:sid,cover:d});if(!r.ok)throw new Error(r.error);
    stoCoverSync(sid,d);toast('Cover saved');await loadCatalog();renderContent();mediaModal(sid);
  }catch(e){toast('Could not save the photo')}
};
{const _rc=removeCover;removeCover=async function(sid){await _rc(sid);stoCoverSync(sid,'')}}
;(window.__p=window.__p||{})['admin12']=1;
