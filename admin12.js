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
   ${SS.items.map((x,i)=>`<div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><div style="flex:1;min-width:0"><b>${esc(x.title)}</b> ${x.active?'':'<span class="chip">Hidden</span>'}
     <div class="sm mut">₹${x.price}${x.mrp?` <s>₹${x.mrp}</s>`:''} · ${(x.features||[]).length} features${x.series_id?' · unlocks: '+esc((CA.series.find(z=>z.id===x.series_id)||{}).title||'series'):''}</div></div>
     <button class="btn ghost sm" onclick="stoEdit(${i})">Edit</button></div>`).join('')}
   <button class="btn" onclick="stoEdit(-1)">➕ Add test series</button>
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
  modal(`<h2>${i>=0?'Edit':'Add'} test series</h2>
   <label class="l">Name</label><input type="text" id="p_t" maxlength="80" value="${esc(x.title)}" placeholder="e.g. NEET 2027 All India Test Series">
   <label class="l">Short line (optional)</label><input type="text" id="p_s" maxlength="200" value="${esc(x.subtitle)}" placeholder="e.g. 30 full tests · Oct to April">
   <div class="g2"><div><label class="l">Price ₹</label><input type="number" id="p_p" min="1" value="${esc(x.price)}"></div><div><label class="l">MRP ₹ (optional, shown struck)</label><input type="number" id="p_m" min="0" value="${esc(x.mrp==null?'':x.mrp)}"></div>
    <div><label class="l">Badge (optional)</label><input type="text" id="p_b" maxlength="24" value="${esc(x.badge)}" placeholder="e.g. Bestseller"></div>
    <div><label class="l">Card colour</label><select id="p_c">${SCOL.map(([k,l])=>`<option value="${k}" ${x.color===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label class="l">Unlocks which series</label><select id="p_ser"><option value="">—</option>${CA.series.map(s=>`<option value="${esc(s.id)}" ${x.series_id===s.id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
    <div><label class="l">Order on page</label><input type="number" id="p_o" value="${esc(x.sort_order||0)}"></div></div>
   <label class="l">Features (one per line)</label><textarea id="p_f" style="min-height:130px" placeholder="30 full-length NEET mock tests&#10;All-India rank after every test&#10;Detailed solutions">${esc((x.features||[]).join('\n'))}</textarea>
   <label class="chk"><input type="checkbox" id="p_a" ${x.active?'checked':''}><span>Show on the store page</span></label>
   <div class="row" style="margin-top:12px">${i>=0?`<button class="btn danger" onclick="stoDel(${i})">Delete</button>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="p_go" onclick="stoSave(${i})">Save</button></div>`);
}
async function stoSave(i){
  const d={id:i>=0?SS.items[i].id:'',title:$('#p_t').value.trim(),subtitle:$('#p_s').value.trim(),price:parseInt($('#p_p').value,10),mrp:$('#p_m').value?parseInt($('#p_m').value,10):'',
    badge:$('#p_b').value.trim(),color:$('#p_c').value,series_id:$('#p_ser').value,sort_order:parseInt($('#p_o').value,10)||0,active:$('#p_a').checked,
    features:$('#p_f').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,20)};
  if(!d.title)return toast('Enter the name');if(!(d.price>0))return toast('Enter the price');
  const b=$('#p_go');b.disabled=true;const r=await ASTO('save_item',d);b.disabled=false;
  if(!r.ok)return toast('Could not save');closeModal();toast('Saved ✓');loadStore();
}
async function stoDel(i){
  const x=SS.items[i];if(!confirm(`Delete "${x.title}" from the store? Old orders stay.`))return;
  const r=await ASTO('delete_item',{id:x.id});if(!r.ok)return toast('Could not delete');closeModal();toast('Deleted');loadStore();
}
;(window.__p=window.__p||{})['admin12']=1;
