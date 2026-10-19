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
  SS=Object.assign(SS,{settings:r.settings||{},items:r.items||[],orders:r.orders||[]});
  SS.sched={};try{const q=await fetch(API+'/rest/v1/rpc/cbt_store_schedules',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:'{}'});if(q.ok){const j=await q.json();(j.items||[]).forEach(x=>SS.sched[x.id]=x)}else SS.sched=null}catch(e){}
  stoDraw();navBadges();
  if(SS.items.length&&!('image' in SS.items[0]))stoNeedFix('Photos are switched off in the database.');
}
function stoDraw(){
  const b=$('#stobody');if(!b)return;const s=SS.settings,O=SS.orders,pend=O.filter(o=>o.status==='pending').length;
  const OL=O.filter(o=>SS.of==='all'||o.status===SS.of);
  const paid=O.filter(o=>o.status==='paid'),m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);
  const mon=paid.filter(o=>new Date(o.created_at)>=m0).reduce((a,o)=>a+(o.amount||0),0);
  b.innerHTML=`<div class="sstats" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px"><div class="sbox"><b>${SS.items.filter(x=>x.active).length}</b><span>On store</span></div><div class="sbox"><b>${pend}</b><span>To check</span></div><div class="sbox"><b>${paid.length}</b><span>Paid</span></div><div class="sbox"><b>₹${mon.toLocaleString('en-IN')}</b><span>This month</span></div></div>
   <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:0"><b>Store link</b><div class="sm mut" style="word-break:break-all">${esc(stoUrl())}</div></div>
     <button class="btn ghost sm" onclick="copyText(stoUrl())">Copy link</button><a class="btn sm" style="text-decoration:none" href="store.html" target="_blank" rel="noopener">Open</a></div>
   <div class="h2s">🧾 Orders to check <span class="n">${pend}</span></div>
   <div class="card"><p class="sm mut" style="margin-top:0">Check the payment screenshot on Telegram: <b>order code</b>, <b>amount</b>, <b>paid-from name</b> and <b>UTR</b> must match your bank / UPI app. Then tap <b>✅ Approve &amp; unlock</b> — it creates the student, makes the access code, unlocks the series and marks the order paid.</p>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${[['pending','Pending'],['paid','Paid'],['rejected','Rejected'],['all','All']].map(([k,l])=>`<button class="btn ${SS.of===k?'':'ghost'} sm" onclick="SS.of='${k}';stoDraw()">${l}</button>`).join('')}
     <input type="search" id="stoq" placeholder="Search code / mobile / name" style="flex:1;min-width:160px" oninput="stoFilter(this.value)"></div>
    <div id="stol">${OL.length?OL.map(stoOrd).join(''):'<p class="sm mut">No orders here.</p>'}</div></div>
   <div class="h2s">📦 Test series on the store <span class="n">${SS.items.length}</span></div>
   ${SS.items.map((x,i)=>`<div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:10px">${x.image?`<img src="${esc(x.image)}" alt="" style="width:64px;height:40px;object-fit:cover;border-radius:8px;flex:none">`:''}<div style="flex:1;min-width:0"><b>${esc(x.title)}</b> ${x.active?'':'<span class="chip">Hidden</span>'}
     <div class="sm mut">₹${x.price}${x.mrp?` <s>₹${x.mrp}</s>`:''} · ${(x.features||[]).length} features${SS.sched&&SS.sched[x.id]?' · 📅 schedule':''}${x.series_id?' · unlocks: '+esc((CA.series.find(z=>z.id===x.series_id)||{}).title||'series'):''}</div></div>
     <button class="btn ghost sm" onclick="stoEdit(${i})">Edit</button></div>`).join('')}
   <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="stoPick()">⚡ Add from your series</button><button class="btn ghost" onclick="stoEdit(-1)">➕ Add manually</button>${SS.items.some(x=>x.series_id)?'<button class="btn ghost" id="stors" onclick="stoResync(this)">🔄 Update all from series</button>':''}</div>
   <div class="h2s">💳 Payment details</div>
   <div class="card"><p class="sm mut" style="margin-top:0">Shown on the store page. Only this panel (admin password) can change them.</p>
    <div class="g2"><div><label class="l">UPI ID</label><input type="text" id="s_upi" value="${esc(s.upi||'')}" autocapitalize="off" spellcheck="false"></div>
     <div><label class="l">Name shown in UPI apps</label><input type="text" id="s_payee" value="${esc(s.payee||'')}"></div>
     <div><label class="l">Telegram username (not used: the store uses SUPPORT_URL in config.js)</label><input type="text" id="s_tg" value="${esc(s.telegram||'')}" autocapitalize="off" spellcheck="false"></div>
     <div><label class="l">Small note (optional)</label><input type="text" id="s_note" value="${esc(s.note||'')}" placeholder="e.g. Unlocked within 2 hours (9 am – 9 pm)"></div></div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn" onclick="stoSaveSet(this)">Save payment details</button><button class="btn ghost" onclick="stoAudit()">🕑 Change history</button></div></div>`;
}
function stoOrd(o){
  const t=new Date(o.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  const st={pending:'<span class="chip warn">Pending</span>',paid:'<span class="chip ok">Paid</span>',rejected:'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Rejected</span>'}[o.status]||'';
  const dup=o.utr&&SS.orders.some(x=>x.code!==o.code&&x.utr===o.utr);
  const pay=o.payer||o.utr?`<div class="sm" style="margin-top:3px;background:var(--surface2);border-radius:8px;padding:5px 8px">💳 Paid from: <b>${esc(o.payer||'—')}</b>${o.utr?` · UTR <b style="font-family:monospace">${esc(o.utr)}</b>`:''}${dup?' <span class="chip" style="background:var(--badSoft);color:var(--bad)">⚠️ UTR used in another order</span>':''}</div>`
    :(o.status==='pending'?'<div class="sm mut" style="margin-top:3px">Waiting for the student to pay</div>':'');
  return `<div class="stoo" data-k="${esc((o.code+' '+o.mobile+' '+o.name+' '+(o.payer||'')+' '+(o.utr||'')).toLowerCase())}" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--bd);flex-wrap:wrap">
   <div style="flex:1;min-width:200px"><b style="font-family:monospace;letter-spacing:.5px">${esc(o.code)}</b> ${st}<div class="sm"><b>${esc(o.name)}</b> · ${esc(o.mobile)}</div><div class="sm mut">${esc(o.item_title)} · ₹${o.amount} · ${t}</div>${pay}</div>
   <div class="row" style="gap:6px;flex-wrap:wrap">${o.status!=='paid'?`<button class="btn sm" onclick="stoApprove('${esc(o.code)}',this)" title="Create / approve the student, make the access code, unlock the series and mark paid">✅ Approve &amp; unlock</button>`:''}<button class="btn ghost sm" onclick="stoUnlock('${esc(o.mobile)}')" title="Open this student">👤 Student</button><button class="btn ghost sm" onclick="stoReply('${esc(o.code)}')" title="Copy a reply with the website link">📋 Reply</button>${o.status==='pending'?`<button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','rejected')">Reject</button>`:''}${o.status!=='pending'?`<button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','pending')">Undo</button>`:''}</div></div>`;
}
function stoFilter(q){q=q.trim().toLowerCase();document.querySelectorAll('#stol .stoo').forEach(e=>e.style.display=!q||e.dataset.k.includes(q)?'':'none')}
async function stoSt(code,status){
  const r=await ASTO('order_status',{code,status});if(!r.ok)return toast('Could not save');
  const o=SS.orders.find(x=>x.code===code);if(o)o.status=status;navBadges();toast(status==='paid'?'Marked paid ✓ — unlock the series in Students':'Saved');stoDraw();
}
async function stoSaveSet(b){
  const d={upi:$('#s_upi').value.trim(),payee:$('#s_payee').value.trim(),telegram:$('#s_tg').value.trim(),note:$('#s_note').value.trim()};
  if(!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(d.upi))return toast('Enter a valid UPI ID, e.g. name@bank');
  d.telegram=d.telegram.replace(/^(https?:\/\/)?(t\.me\/)?@?/,'');
  if(!/^[A-Za-z0-9_]{0,40}$/.test(d.telegram))return toast('Telegram username: only letters, numbers and _');
  if(/[<>"`]/.test(d.payee))return toast('Remove < > " ` from the name');
  if(!confirm(`Change payment details?\n\nUPI: ${d.upi}\nName: ${d.payee}\nTelegram: ${d.telegram}\n\nStudents will pay to this UPI ID.`))return;
  b.disabled=true;const r=await ASTO('save_settings',d);b.disabled=false;
  if(!r.ok)return toast(r.error==='upi'?'Enter a valid UPI ID':'Could not save');
  SS.settings=Object.assign(SS.settings,d,{telegram:d.telegram.replace(/^(https?:\/\/)?(t\.me\/)?@?/,'')});toast('Saved ✓');stoDraw();
}
function stoEdit(i){
  const x=i>=0?SS.items[i]:{title:'',subtitle:'',price:'',mrp:'',badge:'',features:[],color:'blue',series_id:'',active:true,sort_order:SS.items.length};
  STOIMG=x.image||'';STOFILE=null;
  modal(`<div class="stohd"><h2>${i>=0?'Edit':'Add'} test series</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div><p class="sm mut" style="margin:2px 0 10px">Preview — this is how students see it on the store:</p><div id="p_prev"></div>
   <label class="l">Name</label><input type="text" id="p_t" maxlength="80" value="${esc(x.title)}" placeholder="e.g. NEET 2027 All India Test Series">
   <label class="l">Short line (optional)</label><input type="text" id="p_s" maxlength="200" value="${esc(x.subtitle)}" placeholder="e.g. 30 full tests · Oct to April">
   <div class="g2"><div><label class="l">Price ₹</label><input type="number" id="p_p" min="1" value="${esc(x.price)}"></div><div><label class="l">MRP ₹ (optional, shown struck)</label><input type="number" id="p_m" min="0" value="${esc(x.mrp==null?'':x.mrp)}"></div>
    <div><label class="l">Badge (optional)</label><input type="text" id="p_b" maxlength="24" value="${esc(x.badge)}" placeholder="e.g. Bestseller"></div>
    <div><label class="l">Card colour</label><select id="p_c">${SCOL.map(([k,l])=>`<option value="${k}" ${x.color===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label class="l">Unlocks which series <a href="#" onclick="event.preventDefault();stoFill()" style="color:var(--pri);font-weight:700;text-transform:none;letter-spacing:0">· fill from series</a></label><select id="p_ser"><option value="">—</option>${CA.series.map(s=>`<option value="${esc(s.id)}" ${x.series_id===s.id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
    <div><label class="l">Order on page</label><input type="number" id="p_o" value="${esc(x.sort_order||0)}"></div></div>
   <label class="l">Photo on the store card</label><div class="row" style="gap:8px;align-items:center"><div id="p_img">${stoImgHtml()}</div>
    <label class="btn soft sm" style="cursor:pointer">📷 Upload<input type="file" accept="image/*" style="display:none" onchange="stoImgUp(this)"></label><button class="btn ghost sm" onclick="stoImgSet('')">Remove</button></div>
      <label class="l">Schedule for students (PDF or photo, up to 5 MB)</label><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><div id="p_sch" class="sm" style="flex:1;min-width:140px">${stoSchHtml(x.id)}</div>
    <label class="btn soft sm" style="cursor:pointer">📅 Upload<input type="file" accept="application/pdf,image/*" style="display:none" onchange="stoSchUp(this,'${x.id||''}')"></label>${SS.sched&&SS.sched[x.id]?`<button class="btn ghost sm" onclick="stoSchDel('${x.id}')">Remove</button>`:''}</div>
   <label class="l">Features (one per line)</label><textarea id="p_f" style="min-height:130px" placeholder="30 full-length NEET mock tests&#10;All-India rank after every test&#10;Detailed solutions">${esc((x.features||[]).join('\n'))}</textarea>
   <label class="chk"><input type="checkbox" id="p_a" ${x.active?'checked':''}><span>Show on the store page</span></label>
   <div class="row stofoot">${i>=0?`<button class="btn danger" onclick="stoDel(${i})">Delete</button>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="p_go" onclick="stoSave(${i})">Save</button></div>`);
  stoSheet();
  stoPrev();if(!window.__stoPB){window.__stoPB=1;document.addEventListener('input',e=>{if(e.target.closest('#layer'))stoPrev()})}
}
async function stoSave(i){
  const d={id:i>=0?SS.items[i].id:'',title:$('#p_t').value.trim(),subtitle:$('#p_s').value.trim(),price:parseInt($('#p_p').value,10),mrp:$('#p_m').value?parseInt($('#p_m').value,10):'',
    badge:$('#p_b').value.trim(),color:$('#p_c').value,series_id:$('#p_ser').value,sort_order:parseInt($('#p_o').value,10)||0,active:$('#p_a').checked,
    features:$('#p_f').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,20),image:STOIMG};
  if(!d.title)return toast('Enter the name');if(!(d.price>0))return toast('Enter the price');
  const b=$('#p_go');b.disabled=true;b.textContent='Saving…';
  if(d.image&&d.image.length>700000){try{d.image=await compressDataUrl(d.image,800,.7)||d.image}catch(e){}}
  const r=await ASTO('save_item',d);b.disabled=false;b.textContent='Save';
  if(!r.ok)return toast('Could not save');
  if(STOFILE&&(r.id||d.id)){const q=await stoSchSend(r.id||d.id,STOFILE.data,STOFILE.name);if(!q.ok)toast(q.msg)}
  closeModal();await loadStore();
  // make sure the photo really reached the database
  const it=SS.items.find(x=>x.id===(r.id||d.id));
  if(d.image&&it&&!it.image)stoNeedFix('The photo was not saved.');else toast('Saved ✓');
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
  modal(`<div class="stohd"><h2>Add from your series</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div><p class="sm mut" style="margin:4px 0 12px">Name, description, number of tests and cover photo are taken from the series. Check the price, then add.</p>
   ${L.map(s=>{const a=stoAuto(s),n=CA.tests.filter(t=>t.series_id===s.id).length;return `<div class="arow" style="align-items:center;gap:10px"><label class="chk" style="padding:0;flex:1;min-width:0"><input type="checkbox" class="spk" value="${esc(s.id)}" ${s.is_free?'':'checked'}><span><b>${esc(s.title)}</b><br><span class="sm mut">${n} tests${s.is_free?' · free series':''}${s.has_cover?' · has photo':''}</span>${a.subtitle?`<br><span class="sm">“${esc(a.subtitle)}”</span>`:''}<br><span class="sm mut">${esc(a.features.slice(0,3).join(' · '))}</span></span></label>
     <input type="number" min="1" class="spp" data-id="${esc(s.id)}" value="${esc(a.price)}" placeholder="₹ price" style="width:96px;flex:none"></div>`}).join('')}
   <div class="row stofoot"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="spgo" onclick="stoPickGo()">Add selected</button></div>`);
  stoSheet();
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
function stoSheet(){const b=document.querySelector('#layer .box');if(b)b.classList.add('stoform')}
async function stoUnlock(mobile){
  SF.q=mobile;await tab('students');
  const st=(ST||[]).find(x=>x.mobile===mobile);
  if(st)manage(st.id);else toast('No student with '+mobile+' yet — ask them to tap “Request access” on the website');
}
function stoReply(code){
  const o=SS.orders.find(x=>x.code===code);if(!o)return;
  copyText(stuMsg({name:o.name,title:o.item_title,order:o.code,mobile:o.mobile}));
}
// Store in the bottom bar (phone), with the number of orders to check
DOCKX.splice(DOCKX.indexOf('content')+1,0,'store');
{const _dh=dockHtml;dockHtml=function(){return _dh().replace(/(data-k="store"[^>]*>[\s\S]*?<span>)[^<]*(<\/span>)/,'$1Store$2')}}
{const _b=badgeOf;badgeOf=function(k){return k==='store'?(SS.orders||[]).filter(o=>o.status==='pending').length:_b(k)}}
{const _nb=navBadges;navBadges=function(){_nb();const n=badgeOf('store');for(const id of ['nb_store','nd_store']){const e=document.getElementById(id);if(e){e.textContent=n?(n>99?'99+':n):'';e.classList.toggle('on',!!n)}}}}
{const d=document.getElementById('adock');if(d)d.innerHTML=dockHtml()}
setTimeout(async()=>{if(!PW||SS.orders.length)return;const r=await ASTO('get');if(r.ok){SS=Object.assign(SS,{settings:r.settings||{},items:r.items||[],orders:r.orders||[]});navBadges()}},4000);
function stoNeedFix(why){
  const b=$('#stobody');if(!b||$('#stofix'))return;
  b.insertAdjacentHTML('afterbegin',`<div class="card" id="stofix" style="border:2px solid var(--warn);background:var(--warnSoft)"><b>⚠️ ${esc(why)} One-time fix needed</b>
   <p class="sm" style="margin:6px 0 0">Open Supabase → SQL Editor → New query, paste the file <b>supabase_v17_store_fix.sql</b> and press Run. Then refresh this page and save the photo again.</p></div>`);
  b.scrollIntoView({behavior:'smooth',block:'start'});
}
/* ---------- schedule file (PDF / photo) for a store item ---------- */
let STOFILE=null;
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
function stoSchHtml(id){
  if(STOFILE)return `📎 <b>${esc(STOFILE.name)}</b> · ${kb(STOFILE.size)} <span class="mut">(saved with the series)</span>`;
  if(SS.sched===null)return '<span class="mut">Run supabase_v18_store_schedule.sql once to turn this on</span>';
  const f=SS.sched&&SS.sched[id];return f?`📎 <b>${esc(f.name)}</b> · ${kb(f.size)}`:'<span class="mut">No schedule yet</span>';
}
async function stoSchSend(id,data,name){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_store_schedule',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_item:id,p_data:data,p_name:name})});
    if(!r.ok)return{ok:false,msg:r.status===404?'Run supabase_v18_store_schedule.sql once in Supabase':'Could not save the schedule'};
    const j=await r.json();return j.ok?{ok:true}:{ok:false,msg:j.error==='size'?'File is too big (max 5 MB)':j.error==='type'?'Use a PDF or a photo':'Could not save the schedule'};
  }catch(e){return{ok:false,msg:'No internet'}}
}
async function stoSchUp(inp,id){
  const f=inp.files[0];if(!f)return;
  if(f.size>5*1048576)return toast('File is too big (max 5 MB)');
  const isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);if(!isPdf&&!/^image\//.test(f.type))return toast('Use a PDF or a photo');
  const box=$('#p_sch');if(box)box.innerHTML='Uploading…';
  let data=await fileToUrl(f);
  if(isPdf)data=data.replace(/^data:[^;]*;/,'data:application/pdf;');
  else{try{data=await compressDataUrl(data,1600,.82)||data}catch(e){}}
  const name=f.name.replace(/\.[a-z0-9]+$/i,'').slice(0,80)||'Schedule';
  if(!id){STOFILE={data,name,size:Math.round(data.length*3/4)};if(box)box.innerHTML=stoSchHtml('');return}
  const r=await stoSchSend(id,data,name);
  if(!r.ok){if(box)box.innerHTML=stoSchHtml(id);return toast(r.msg)}
  SS.sched=SS.sched||{};SS.sched[id]={id,name,size:Math.round(data.length*3/4)};if(box)box.innerHTML=stoSchHtml(id);toast('Schedule saved ✓');stoDraw();
}
async function stoSchDel(id){
  if(!confirm('Remove the schedule from this series?'))return;
  const r=await stoSchSend(id,'','');if(!r.ok)return toast(r.msg);
  if(SS.sched)delete SS.sched[id];const box=$('#p_sch');if(box)box.innerHTML=stoSchHtml(id);toast('Schedule removed');stoDraw();
}
async function stoAudit(){
  let r;try{const q=await fetch(API+'/rest/v1/rpc/cbt_admin_store_audit',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW})});r=q.ok?await q.json():{ok:false,error:q.status===404?'missing':'server'}}catch(e){r={ok:false}}
  if(!r.ok)return toast(r.error==='missing'?'Run supabase_v19_store_security.sql once in Supabase':'Could not load');
  modal(`<div class="stohd"><h2>Payment details history</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut">Every change of UPI ID, name or Telegram is recorded here. If you see a change you did not make, change your admin password at once.</p>
   ${(r.items||[]).length?r.items.map(x=>`<div class="arow"><div class="grow"><b>${esc(x.upi)}</b> · ${esc(x.payee)}<div class="sm mut">Telegram: ${esc(x.telegram||'—')} · ${new Date(x.at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})}</div></div></div>`).join(''):'<p class="sm mut">No changes yet.</p>'}
   <div class="row stofoot"><button class="btn ghost" style="flex:1" onclick="closeModal()">Close</button></div>`);
  stoSheet();
}
/* ---------- one tap: student + access code + series unlock + mark paid ---------- */
async function stoApprove(code,btn){
  const o=SS.orders.find(x=>x.code===code);if(!o)return;
  const it=SS.items.find(x=>x.id===o.item_id),sid=it&&it.series_id,ser=sid&&CA.series.find(x=>x.id===sid);
  if(!sid&&!confirm(`"${o.item_title}" is not linked to a series in the store settings, so no series can be unlocked.\n\nContinue and only create the student + access code?`))return;
  if(o.utr&&SS.orders.some(x=>x.code!==o.code&&x.utr===o.utr)&&!confirm('⚠️ This UTR is also used in another order. Check the payment carefully.\n\nContinue anyway?'))return;
  if(btn){btn.disabled=true;btn.textContent='Working…'}
  const done=[],fail=m=>{if(btn){btn.disabled=false;btn.innerHTML='✅ Approve &amp; unlock'}toast(m)};
  let r=await A('students');if(!r.ok)return fail('Could not load students');
  let st=(r.students||[]).find(x=>x.mobile===o.mobile),acc=null;
  if(st&&st.status==='blocked')return fail('This student is blocked. Unblock them in Students first.');
  if(!st){
    r=await A('student_add',{name:o.name,mobile:o.mobile});if(!r.ok)return fail('Could not create the student');
    acc=r.code;done.push('New student created');
    const l=await A('students');st=l.ok?(l.students||[]).find(x=>x.mobile===o.mobile):null;
  }else if(st.status==='pending'){
    r=await A('student_approve',{id:st.id});if(!r.ok)return fail('Could not approve the student');acc=r.code;done.push('Request approved');
  }else if(confirm(`${st.name} already has an account and an access code.\n\nOK = keep their current code (recommended — they stay signed in)\nCancel = make a NEW code (they are signed out on all phones)`)){
    done.push('Existing account (current code kept)');
  }else{
    r=await A('student_code',{id:st.id});if(r.ok){acc=r.code;done.push('New access code made')}
  }
  if(sid&&st){
    r=await A('grant',{student_id:st.id,series_id:sid,on:true});if(!r.ok)return fail('Could not unlock the series');
    done.push(`Unlocked: ${ser?ser.title:o.item_title}`);
  }
  r=await ASTO('order_status',{code,status:'paid'});if(r.ok){o.status='paid';done.push('Order marked paid')}
  {const l=await A('students');if(l.ok)ST=l.students}
  navBadges();stoDraw();
  const c=acc?acc.slice(0,4)+'-'+acc.slice(4):'';
  const msg=stuMsg({name:o.name,title:o.item_title,order:o.code,mobile:o.mobile,code:acc,keep:!acc});
  window._stoMsg=msg;
  modal(`<div class="stohd"><h2>✅ Done</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <div class="sm mut">${esc(o.name)} · ${esc(o.mobile)} · ${esc(o.code)}</div>
   <div style="margin:10px 0">${done.map(d=>`<div class="sm">✓ ${esc(d)}</div>`).join('')}</div>
   ${acc?`<div class="big-code">${esc(c)}</div><p class="sm mut" style="margin:0 0 10px">Send this code now — for safety it cannot be shown again.</p>`:''}
   <label class="l">Message for the student</label><div class="sm" style="white-space:pre-wrap;background:var(--surface2);border-radius:12px;padding:10px">${msgHtml(msg)}</div>
   <div class="row stofoot"><button class="btn" style="flex:1" onclick="copyText(window._stoMsg)">📋 Copy message</button><a class="btn soft" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/91${esc(o.mobile)}?text=${encodeURIComponent(msg)}">WhatsApp</a><a class="btn tgsend" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="https://t.me/+91${esc(o.mobile)}" onclick="copyText(window._stoMsg)">Telegram</a></div>
   <p class="sm mut" style="margin:8px 0 0">Telegram: the message is copied first — paste it in the chat that opens.</p>`);
  stoSheet();
}
;(window.__p=window.__p||{})['admin12']=1;
