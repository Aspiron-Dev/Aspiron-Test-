/* ===== Admin: Promotions — one tracking link per influencer or campaign (Store → Promotions).
   Clicks, real leads, paid students, commission owed, profit, payouts. Students who open store.html?ref=CODE are counted here.
   Server: supabase_v30_promotions.sql (cbt_admin_promos, cbt_store_orders.promo_*) ===== */
async function PRX(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_promos',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.promos='<path d="M3 11v2a2 2 0 002 2h2l5 4V5L7 9H5a2 2 0 00-2 2z"/><path d="M16 8.5a5 5 0 010 7M19 6a9 9 0 010 12"/>';
XTRA.push('promos');TTL.promos='Promotions';
HUBS.store.tabs.push(['promos','Promotions']);MKNOWN.add('promos');
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='promos')return loadPromos();return r}}

/* ---------- data ---------- */
const PRM={ok:false,missing:false,links:[],payouts:[],at:0};
const PRF={seg:'all',q:''};
const PRSEG=[['all','All'],['on','Active'],['off','Paused']];
const prInr=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const prDay=d=>new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const prToday=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
const prUrl=code=>siteUrl()+'store.html?ref='+encodeURIComponent(code);
const prErr=e=>({name:'Enter a name (at least 2 letters).',code:'Code: 3–30 letters, numbers or dashes, starting and ending with a letter or number.',exists:'This code is already used. Choose another.',commission:'Commission must be a whole number, for example 25.',claimed:'Claimed must be a whole number, or empty.',amount:'Enter an amount above 0.',date:'Check the date.',link:'Link not found. Refresh the page.',payout:'Payout not found. Refresh the page.',order:'Order not found. Refresh the page.',missing:'Run supabase_v30_promotions.sql in Supabase first.',network:'No internet. Try again.'})[e]||'Could not save. Try again.';
async function prData(force){
  if(!force&&PRM.at&&Date.now()-PRM.at<20000)return{ok:true};
  const r=await PRX('get');
  if(r.ok){PRM.links=r.links||[];PRM.payouts=r.payouts||[];PRM.ok=true;PRM.missing=false;PRM.at=Date.now()}
  else if(r.error==='missing'){PRM.missing=true;PRM.at=Date.now()}
  return r;
}
// numbers for one link: owed = commission earned - paid out, conversion = paid / clicks, cost per lead = commission / leads
function prCalc(l){
  const owed=Math.max(0,(l.earned||0)-(l.paid_out||0));
  return{owed,conv:l.clicks?Math.round(l.paid_n/l.clicks*1000)/10:null,cpl:l.leads?Math.round(l.earned/l.leads):null,profit:(l.revenue||0)-(l.earned||0)};
}
const prFull=l=>({id:l.id,name:l.name,contact:l.contact,note:l.note,commission:String(l.commission),claimed:l.claimed==null?'':String(l.claimed),active:l.active});

/* ---------- page ---------- */
function loadPromos(){
  const p=$('#pn_promos');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Promotions</h1><p class="sm mut">One link per influencer or campaign. See clicks, real paid students, commission owed and profit. Pause or change any link at any time.</p></div>
   <button class="btn" onclick="prModal()">＋ New link</button></div>
   <div id="prmiss"></div><div id="prsum"></div>
   <div class="row" style="gap:8px;margin:14px 0 10px;flex-wrap:wrap"><div style="flex:1;min-width:180px"><input type="search" id="prq" placeholder="Search name or code" autocomplete="off" value="${esc(PRF.q)}" oninput="PRF.q=this.value;prList()"></div><div class="seg" id="prseg"></div></div>
   <div id="prlist">${askel()}</div>`;
  prData(true).then(()=>prDraw());
}
const prBox=(l,v,c)=>`<div class="sbox"><b style="${c?'color:'+c:''}">${v}</b><span>${l}</span></div>`;
function prDraw(){
  if(!$('#prlist'))return;
  $('#prmiss').innerHTML=PRM.missing?`<div class="card" style="border:2px solid var(--warn);background:var(--warnSoft);margin-bottom:12px"><b>⚠️ One-time setup needed</b><p class="sm" style="margin:6px 0 0">Open Supabase → SQL Editor, paste <b>supabase_v30_promotions.sql</b> and press Run once. Then refresh.</p></div>`:'';
  const T=PRM.links.reduce((a,l)=>{const k=prCalc(l);return{rev:a.rev+(l.revenue||0),earn:a.earn+(l.earned||0),owed:a.owed+k.owed,paid:a.paid+(l.paid_n||0),leads:a.leads+(l.leads||0),clicks:a.clicks+(l.clicks||0),profit:a.profit+k.profit}},{rev:0,earn:0,owed:0,paid:0,leads:0,clicks:0,profit:0});
  $('#prsum').innerHTML=`<div class="prsum">${prBox('Clicks',T.clicks)}${prBox('Real leads',T.leads)}${prBox('Paid students',T.paid,'var(--ok)')}${prBox('Revenue',prInr(T.rev))}${prBox('Commission',prInr(T.earn))}${prBox('Owed now',prInr(T.owed),T.owed?'var(--warn)':'')}${prBox('Profit',prInr(T.profit),T.profit>=0?'var(--ok)':'var(--bad)')}</div>`;
  prList();
}
function prList(){
  if(!$('#prlist'))return;
  const cnt={all:PRM.links.length,on:PRM.links.filter(l=>l.active).length,off:PRM.links.filter(l=>!l.active).length};
  $('#prseg').innerHTML=PRSEG.map(([k,t])=>`<button class="${PRF.seg===k?'on':''}" onclick="PRF.seg='${k}';prList()">${t} <span class="mut">${cnt[k]}</span></button>`).join('');
  const q=PRF.q.trim().toLowerCase();
  const shown=PRM.links.filter(l=>(PRF.seg==='all'||(PRF.seg==='on')===!!l.active)&&(!q||(String(l.name)+' '+l.code).toLowerCase().includes(q)));
  $('#prlist').innerHTML=shown.length?shown.map(prCard).join('')
    :`<div class="card sempty">${ai('promos',30)}<b>${PRM.links.length?'No link matches':'No promotion links yet'}</b><span class="sm mut">${PRM.links.length?'Try another filter or search.':'Tap “New link”, give the link to an influencer, and every student who buys through it is counted here.'}</span></div>`;
}
function prCard(l){
  const k=prCalc(l),kpi=(n,t,c)=>`<div><b${c?` style="color:${c}"`:''}>${n}</b><span>${t}</span></div>`;
  const claim=l.claimed==null?'':l.claimed>l.paid_n
    ?`<div class="prclaim bad">Influencer says <b>${l.claimed}</b> · system counts <b>${l.paid_n}</b> paid · <b>${l.claimed-l.paid_n}</b> not found</div>`
    :`<div class="prclaim ok">Influencer says <b>${l.claimed}</b> · system counts <b>${l.paid_n}</b> paid</div>`;
  return `<article class="card prcard ${l.active?'':'off'}">
   <div class="prtop"><div class="grow"><div class="nm"><b>${esc(l.name||l.code)}</b><span class="prcode">${esc(l.code)}</span><span class="tg ${l.active?'paid':''}">${l.active?'ACTIVE':'PAUSED'}</span></div>
     <div class="sm mut">${esc(l.contact||'No contact saved')} · ${prInr(l.commission)} per paid student · created ${prDay(l.created_at)}</div></div>
     <div class="prbtns"><button class="btn ghost sm" onclick="copyText('${prUrl(l.code)}')">Copy link</button><button class="btn ghost sm" onclick="prOrders('${l.code}')">Orders</button><button class="btn ghost sm" onclick="prModal('${l.id}')">Edit</button></div></div>
   <div class="prurl"><code>${esc(prUrl(l.code))}</code></div>
   <div class="prkpi">${kpi(l.clicks,'Clicks')}${kpi(l.leads,'Leads')}${kpi(l.paid_n,'Paid','var(--ok)')}${kpi(k.conv==null?'–':k.conv+'%','Conversion')}${kpi(prInr(l.revenue),'Revenue')}${kpi(prInr(l.earned),'Commission')}${kpi(prInr(l.paid_out),'Paid out')}${kpi(prInr(k.profit),'Profit',k.profit>=0?'var(--ok)':'var(--bad)')}${kpi(k.cpl==null?'–':prInr(k.cpl),'Cost / lead')}</div>
   ${claim}
   <div class="prfoot"><span>Owed to influencer: <b class="${k.owed?'warn':''}">${prInr(k.owed)}</b></span><div class="prbtns"><button class="btn soft sm" onclick="prPay('${l.id}')">Record payout</button><button class="btn ghost sm" onclick="prToggle('${l.id}',${l.active?'false':'true'})">${l.active?'Pause':'Resume'}</button></div></div>
  </article>`;
}

/* ---------- create / edit ---------- */
function prSuggest(){const c=$('#pc');if(c&&!c.dataset.t)c.value=$('#pn').value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)}
function prModal(id){
  const l=id?PRM.links.find(x=>x.id===id):null;
  modal(`<div class="mhead stuhd"><div class="grow"><h2>${l?'Edit link':'New promotion link'}</h2></div><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin:0 0 12px">${l?'A new commission applies only to students who pay from now on. Students already counted keep the rate they were counted with.':'Give this link to the influencer. Every student who buys through it is counted here.'}</p>
   <label class="l">Influencer or campaign name</label><input type="text" id="pn" maxlength="80" value="${esc(l?l.name:'')}" placeholder="e.g. Rahul (YouTube)" ${l?'':'oninput="prSuggest()"'}>
   ${l?'':`<label class="l">Link code <span class="mut">letters, numbers, dash · cannot be changed later</span></label><input type="text" id="pc" maxlength="30" placeholder="rahul-yt" autocomplete="off" oninput="this.dataset.t=1">`}
   <div class="g2" style="margin-top:4px"><div><label class="l">Commission per paid student (₹)</label><input type="number" id="pm" min="0" max="100000" value="${l?l.commission:25}"></div>
   <div><label class="l">Claimed by influencer (optional)</label><input type="number" id="pcl" min="0" value="${l&&l.claimed!=null?l.claimed:''}" placeholder="e.g. 100"></div></div>
   <label class="l">Contact (only you see this)</label><input type="text" id="pct" maxlength="120" value="${esc(l?l.contact:'')}" placeholder="Telegram, WhatsApp or phone">
   <label class="l">Note</label><textarea id="pno" maxlength="500" style="min-height:60px">${esc(l?l.note:'')}</textarea>
   ${l?`<label class="chk" style="margin-top:10px"><input type="checkbox" id="pac" ${l.active?'checked':''}><span><b>Link is active</b> <span class="mut sm">Off = students who open it are not counted.</span></span></label>`:''}
   <div id="per" class="sm err" style="min-height:20px;margin-top:6px"></div>
   <button class="btn block" onclick="prSave(${l?`'${l.id}'`:'null'})">${l?'Save changes':'Create link'}</button>`,true);
}
async function prSave(id){
  const d={name:$('#pn').value.trim(),contact:$('#pct').value.trim(),note:$('#pno').value.trim(),commission:$('#pm').value.trim(),claimed:$('#pcl').value.trim()};
  if(id){d.id=id;d.active=$('#pac').checked}else d.code=$('#pc').value.trim().toLowerCase();
  const r=await PRX(id?'update':'create',d);
  if(!r.ok)return $('#per').textContent=prErr(r.error);
  closeModal();toast(id?'Saved':'Link created: '+d.code);await prData(true);prDraw();
}
async function prToggle(id,on){
  const l=PRM.links.find(x=>x.id===id);if(!l)return;
  const r=await PRX('update',{...prFull(l),active:on});
  if(!r.ok)return toast(prErr(r.error));
  toast(on?'Link resumed':'Link paused');await prData(true);prDraw();
}

/* ---------- orders from one link: check each one, and take out fake or refunded ones ---------- */
async function prOrders(code){
  modal(`<div class="mhead stuhd"><div class="grow"><h2>Orders via ${esc(code)}</h2><span class="sm mut" id="prosum">Loading…</span></div><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div><div id="prolist">${askel()}</div>`,true);
  const r=await PRX('orders',{code});
  if(!$('#prolist'))return;
  if(!r.ok)return $('#prolist').innerHTML=`<p class="err">${esc(prErr(r.error))}</p>`;
  const L=r.orders||[];
  $('#prosum').textContent=`${L.length} order${L.length===1?'':'s'} · ${L.filter(o=>o.status==='paid'&&o.valid).length} paid and counted`;
  $('#prolist').innerHTML=L.length?`<div class="prot">${L.map(o=>`<div class="prorow ${o.valid?'':'off'}"><div class="grow"><b>${esc(o.name||'Student')}</b> <span class="sm mut">${esc(o.mobile)} · ${prDay(o.at)}</span>
     <div class="sm mut">${esc(o.item_title||'')} · ${prInr(o.amount)} · <span class="ost ${esc(o.status)}">${esc(o.status)}</span>${o.status==='paid'?` · commission ${prInr(o.rate||0)}`:''}${o.valid?'':' · <b>not counted</b>'}</div>${o.note?`<div class="sm mut">Note: ${esc(o.note)}</div>`:''}</div>
     <button class="btn ${o.valid?'ghost':'soft'} sm" onclick="prValid('${esc(o.code)}',${o.valid?'false':'true'},'${esc(code)}')">${o.valid?'Not counted':'Count again'}</button></div>`).join('')}</div>`
    :'<p class="sm mut">No student has ordered through this link yet.</p>';
}
async function prValid(order,valid,code){
  let note='';
  if(!valid){note=prompt('Why is this order not counted? For example: fake, refunded, duplicate.','');if(note===null)return}
  const r=await PRX('set_valid',{order,valid,note});
  if(!r.ok)return toast(prErr(r.error));
  toast(valid?'Counted again':'Not counted');await prData(true);prDraw();prOrders(code);
}

/* ---------- payouts: record what you paid each influencer ---------- */
function prPay(id){
  const l=PRM.links.find(x=>x.id===id);if(!l)return;
  const k=prCalc(l),hist=PRM.payouts.filter(p=>p.link_id===id);
  modal(`<div class="mhead stuhd"><div class="grow"><h2>Pay ${esc(l.name||l.code)}</h2></div><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin:0 0 12px">Commission earned <b>${prInr(l.earned)}</b> · already paid <b>${prInr(l.paid_out)}</b> · owed now <b>${prInr(k.owed)}</b></p>
   <div class="g2"><div><label class="l">Amount paid (₹)</label><input type="number" id="ppa" min="1" value="${k.owed||''}"></div><div><label class="l">Date</label><input type="date" id="ppd" value="${prToday()}"></div></div>
   <label class="l">Note (how you paid)</label><input type="text" id="ppn" maxlength="300" placeholder="UPI, bank, reference">
   <div id="ppe" class="sm err" style="min-height:20px;margin-top:6px"></div>
   <button class="btn block" onclick="prPaySave('${id}')">Save payout</button>
   <div class="h2s">History</div>${hist.length?hist.map(p=>`<div class="prpay"><span>${prInr(p.amount)} · ${prDay(p.paid_on)}${p.note?' · '+esc(p.note):''}</span><button class="iconbtn sm" aria-label="Remove payout" onclick="prPayDel('${p.id}','${id}')">${ai('x',14)}</button></div>`).join(''):'<p class="mut sm">No payouts recorded yet.</p>'}`);
}
async function prPaySave(id){
  const r=await PRX('payout_add',{link_id:id,amount:$('#ppa').value.trim(),paid_on:$('#ppd').value,note:$('#ppn').value.trim()});
  if(!r.ok)return $('#ppe').textContent=prErr(r.error);
  toast('Payout saved');await prData(true);prDraw();prPay(id);
}
async function prPayDel(pid,lid){
  if(!confirm('Remove this payout record? The amount owed goes up again.'))return;
  const r=await PRX('payout_delete',{id:pid});
  if(!r.ok)return toast(prErr(r.error));
  toast('Payout removed');await prData(true);prDraw();prPay(lid);
}
