/* ===== Admin: Students v2 — Payments (approved store orders + payments you add by hand), money on every student,
   a cleaner Students header. Access requests now live in Store → Orders.  Server: supabase_v29_payments.sql ===== */
async function APAY(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_payments',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.edit=AI.edit||'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>';
AI.payments='<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>';
XTRA.push('payments');TTL.payments='Payments';
HUBS.students.tabs.splice(1,0,['payments','Payments']);MKNOWN.add('payments');
for(const g of APPS)if(g[0]==='Students'){const i=g[2].findIndex(x=>x[0]==='students');g[2].splice(i+1,0,['payments','Payments',"tab('payments')"])}
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='payments')return loadPayments();return r}}

/* ---------- data ---------- */
const PAY={ok:false,missing:false,list:[],orders:[],at:0};
async function payData(force){
  if(!force&&PAY.at&&Date.now()-PAY.at<20000)return{ok:true};
  const r=await APAY('get');
  if(r.ok){PAY.list=r.payments||[];PAY.orders=r.orders||[];PAY.ok=true;PAY.missing=false;PAY.at=Date.now()}
  else if(r.error==='missing'){PAY.missing=true;PAY.at=Date.now()}
  return r;
}
const payInr=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const PMETH={upi:'UPI',cash:'Cash',bank:'Bank',free:'Free',other:'Other'};
const payDay=d=>new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const isoDay=t=>{const d=new Date(t);if(isNaN(d))return '';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
function payOf(s){
  const man=PAY.list.filter(p=>p.student_id===s.id),sto=PAY.orders.filter(o=>o.mobile===s.mobile);
  const total=man.reduce((a,p)=>a+(p.amount||0),0)+sto.reduce((a,o)=>a+(o.amount||0),0);
  return{man,sto,total,n:man.length+sto.length,free:man.length>0&&!sto.length&&total===0};
}
// one list for the page: approved store orders + payments added by hand
function payRows(){
  const byM={};(ST||[]).forEach(s=>byM[s.mobile]=s);
  return [...PAY.orders.map(o=>({k:'store',id:o.code,amount:o.amount,at:o.at,name:(byM[o.mobile]||{}).name||o.name,mobile:o.mobile,sid:(byM[o.mobile]||{}).id,what:o.item_title,code:o.code})),
          ...PAY.list.map(p=>({k:p.amount===0||p.method==='free'?'free':'man',id:p.id,amount:p.amount,at:p.paid_on,name:p.name||'Student',mobile:p.mobile||'',sid:p.student_id,what:PMETH[p.method]||p.method,note:p.note}))]
    .sort((a,b)=>new Date(b.at)-new Date(a.at));
}
const activeSt=()=>(ST||[]).filter(s=>s.status!=='pending');

/* ---------- Payments page (Students → Payments) ---------- */
const PF={seg:'all',q:''};
const PSEG=[['all','All'],['store','Store'],['man','Added by you'],['free','Free'],['none','Not recorded']];
async function loadPayments(){
  const p=$('#pn_payments');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Payments</h1><p class="sm mut">Every payment: store orders you approved, and payments you add yourself — e.g. students who joined before the store.</p></div>
   <div class="row" style="gap:8px"><button class="btn ghost sm" onclick="payCsv()">CSV</button><button class="btn sm" onclick="payModal()">＋ Add payment</button></div></div><div id="paybody">${askel()}</div>`;
  const [s]=await Promise.all([A('students'),payData(true)]);if(s.ok)ST=s.students;
  payDraw();
}
function payDraw(){
  const b=$('#paybody');if(!b)return;
  const R=payRows(),m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);
  const total=R.reduce((a,x)=>a+(x.amount||0),0),month=R.filter(x=>new Date(x.at)>=m0).reduce((a,x)=>a+(x.amount||0),0);
  const act=activeSt(),paying=act.filter(s=>payOf(s).total>0).length,none=act.filter(s=>!payOf(s).n);
  const cnt={all:R.length,store:R.filter(x=>x.k==='store').length,man:R.filter(x=>x.k==='man').length,free:R.filter(x=>x.k==='free').length,none:none.length};
  b.innerHTML=`${PAY.missing?`<div class="card" style="border:2px solid var(--warn);background:var(--warnSoft);margin-bottom:12px"><b>⚠️ One-time setup needed to add payments</b><p class="sm" style="margin:6px 0 0">Open Supabase → SQL Editor, paste <b>supabase_v29_payments.sql</b> and press Run once. Then refresh.</p></div>`:''}
   <div class="sdkpi"><div class="sdk sdk-rev"><span>Total collected</span><b>${payInr(total)}</b><small>${R.length} payment${R.length===1?'':'s'}</small></div>
    <div class="sdk"><span>This month</span><b>${payInr(month)}</b><small>${new Date().toLocaleDateString('en-IN',{month:'long'})}</small></div>
    <div class="sdk"><span>Paying students</span><b>${paying}</b><small>of ${act.length} students</small></div>
    <button class="sdk sdk-un" onclick="PF.seg='none';payDraw()"><span>Not recorded</span><b>${none.length}</b><small>Add their old payments</small></button></div>
   <div class="oseg">${PSEG.map(([k,l])=>`<button class="${PF.seg===k?'on':''}${k==='none'?' os-unpaid':''}" onclick="PF.seg='${k}';payDraw()">${l}<em>${cnt[k]}</em></button>`).join('')}</div>
   <div class="otools"><input type="search" placeholder="Search name or mobile…" value="${esc(PF.q)}" oninput="PF.q=this.value;payListDraw()"></div>
   <div id="payl"></div>`;
  payListDraw();
}
function payListDraw(){
  const e=$('#payl');if(!e)return;const q=PF.q.trim().toLowerCase();
  if(PF.seg==='none'){
    const L=activeSt().filter(s=>!payOf(s).n&&(!q||(s.name+' '+s.mobile).toLowerCase().includes(q))).sort((a,b)=>(a.created||0)-(b.created||0));
    e.innerHTML=L.length?`<div class="ohint">These students have no payment recorded yet — mostly students from before the store. Tap an amount to add it (the date is the day their account was made; you can change it with <b>Other…</b>).</div>`+L.map(s=>`<div class="ocard payst"><div class="otop"><span class="oav" style="--c:${oCol(s)}">${esc(oIni(s))}</span>
       <div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)}${s.created?' · joined '+payDay(s.created):''}</div></div></div>
       <div class="oact"><button class="btn sm" onclick="payQuick('${s.id}',250,'upi',this)">₹250</button><button class="btn ghost sm" onclick="payQuick('${s.id}',0,'free',this)">Free</button><button class="btn ghost sm" onclick="payModal('${s.id}')">Other…</button></div></div>`).join('')
      :`<div class="card empty"><p class="sm mut">Every student has a payment recorded. 🎉</p></div>`;
    return;
  }
  const L=payRows().filter(x=>(PF.seg==='all'||x.k===PF.seg)&&(!q||(x.name+' '+x.mobile).toLowerCase().includes(q)));
  e.innerHTML=L.length?`<div class="card" style="padding:4px 14px">${L.map(x=>`<div class="payrow"><span class="oav" style="--c:${oCol(x)}">${esc(oIni(x))}</span>
     <div class="grow" ${x.sid?`onclick="manage('${esc(x.sid)}')" style="cursor:pointer"`:''}><b>${esc(x.name)}</b><div class="sm mut">${esc(x.mobile)} · ${payDay(x.at)}</div>
      <div class="sm"><span class="pchip ${x.k}">${x.k==='store'?'Store':x.k==='free'?'Free':'Added by you'}</span> ${esc(x.what||'')}${x.code?` <span class="mono mut">${esc(x.code)}</span>`:''}${x.note?` · <span class="mut">${esc(x.note)}</span>`:''}</div></div>
     <b class="pamt">${x.amount?payInr(x.amount):'Free'}</b>${x.k!=='store'?`<button class="iconbtn sm" aria-label="Edit payment" onclick="payModal('${esc(x.sid||'')}','${esc(x.id)}')">${ai('edit',15)}</button>`:''}</div>`).join('')}</div>`
    :`<div class="card empty"><p class="sm mut">${q?'No payment matches your search.':'No payments here yet.'}</p></div>`;
}
async function payQuick(sid,amount,method,b){
  const s=(ST||[]).find(x=>x.id===sid);if(!s)return;
  if(b){b.disabled=true}
  const r=await APAY('add',{student_id:sid,amount,method,paid_on:s.created?isoDay(s.created):'',note:'Added later (before the store)'});
  if(!r.ok){if(b)b.disabled=false;return toast(payErr(r))}
  toast(`${amount?payInr(amount):'Free'} added for ${s.name}`);await payData(true);payDraw();stuDecor();
}
const payErr=r=>r.error==='missing'?'Run supabase_v29_payments.sql in Supabase first':r.error==='amount'?'Enter a valid amount':r.error==='date'?'Check the date':r.error==='student'?'Student not found':r.error==='network'?'No internet':'Could not save';

/* ---------- add / edit a payment ---------- */
let PAYSEL=null;
function payModal(sid,pid){
  const p=pid?PAY.list.find(x=>x.id===pid):null,s=(ST||[]).find(x=>x.id===(sid||(p&&p.student_id)));PAYSEL=s?s.id:null;
  const amt=p?p.amount:'',on=p?isoDay(p.paid_on):(s&&s.created?isoDay(s.created):isoDay(Date.now()));
  modal(`<div class="stohd"><h2>${p?'Edit payment':'💰 Add payment'}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <label class="l">Student</label>
   <div id="paysel">${s?paySelHtml(s):`<input type="search" id="payq" placeholder="Type name or mobile…" oninput="payFind(this.value)" autocomplete="off"><div id="payfl"></div>`}</div>
   <label class="l">Amount ₹</label><input type="number" id="pamt" min="0" inputmode="numeric" value="${esc(amt)}" placeholder="e.g. 250">
   <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${[250,199,299,499].map(v=>`<button class="btn ghost sm" onclick="$('#pamt').value=${v}">₹${v}</button>`).join('')}<button class="btn ghost sm" onclick="$('#pamt').value=0;$('#pmeth').value='free'">Free (₹0)</button></div>
   <div class="g2"><div><label class="l">Date paid</label><input type="date" id="pon" value="${esc(on)}" max="${isoDay(Date.now())}"></div>
    <div><label class="l">How</label><select id="pmeth">${Object.entries(PMETH).map(([k,l])=>`<option value="${k}" ${(p?p.method:'upi')===k?'selected':''}>${l==='Free'?'Free / friend':l==='Bank'?'Bank transfer':l}</option>`).join('')}</select></div></div>
   <label class="l">Note (only for you)</label><input type="text" id="pnote" maxlength="300" value="${esc(p?p.note:'')}" placeholder="e.g. Paid in cash at the coaching">
   <div class="row stofoot">${p?`<button class="btn danger" onclick="payDel('${esc(p.id)}')">Delete</button>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="pgo" onclick="paySave('${p?esc(p.id):''}')">Save</button></div>`);
  stoSheet();
}
const paySelHtml=s=>`<div class="arow" style="margin-top:0"><span class="oav" style="--c:${oCol(s)};width:32px;height:32px;font-size:14px">${esc(oIni(s))}</span><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)}</div></div></div>`;
function payFind(q){
  q=q.trim().toLowerCase();const l=$('#payfl');if(!l)return;
  const L=q.length<2?[]:activeSt().filter(s=>s.mobile.includes(q)||String(s.name||'').toLowerCase().includes(q)).slice(0,6);
  l.innerHTML=L.map(s=>`<button class="arow" style="width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit" onclick="payPick('${s.id}')"><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)}</div></div><span class="sm" style="color:var(--pri)">Choose</span></button>`).join('')||(q.length<2?'':'<p class="sm mut">No student found.</p>');
}
function payPick(id){const s=(ST||[]).find(x=>x.id===id);if(!s)return;PAYSEL=id;$('#paysel').innerHTML=paySelHtml(s);const d=$('#pon');if(d&&s.created)d.value=isoDay(s.created)}
async function paySave(pid){
  const amount=$('#pamt').value===''?NaN:parseInt($('#pamt').value,10);
  if(!PAYSEL&&!pid)return toast('Choose the student');if(!(amount>=0))return toast('Enter the amount (0 for free)');
  const d={amount,paid_on:$('#pon').value,method:amount===0?'free':$('#pmeth').value,note:$('#pnote').value.trim()};
  const b=$('#pgo');b.disabled=true;
  const r=pid?await APAY('update',Object.assign({id:pid},d)):await APAY('add',Object.assign({student_id:PAYSEL},d));
  b.disabled=false;if(!r.ok)return toast(payErr(r));
  closeModal();toast('Payment saved ✓');await payData(true);payDraw();stuDecor();
  const s=(ST||[]).find(x=>x.id===PAYSEL);if(s&&CUR==='students'&&!pid)manage(s.id);
}
async function payDel(pid){
  const p=PAY.list.find(x=>x.id===pid);if(!p)return;
  modal(`<h2>Delete this payment?</h2><p class="sm mut">${payInr(p.amount)} · ${payDay(p.paid_on)} · ${esc(p.name||'')}</p>
   <div class="row" style="margin-top:14px;gap:8px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn danger" style="flex:1" id="pdel">Delete</button></div>`);
  $('#pdel').onclick=async()=>{const r=await APAY('delete',{id:pid});closeModal();if(!r.ok)return toast(payErr(r));toast('Deleted');await payData(true);payDraw();stuDecor()};
}
function payCsv(){
  const R=payRows();dl('payments.csv',[['Date','Name','Mobile','Amount','Type','Details','Note'],...R.map(x=>[isoDay(x.at),x.name,x.mobile,x.amount,x.k==='store'?'Store':x.k==='free'?'Free':'Added',x.what||'',x.note||''])]);
}

/* ---------- money on every student: list chip + Manage section ---------- */
function stuDecor(){
  if(!PAY.ok&&!PAY.orders.length)return;
  document.querySelectorAll('#slist .srow3').forEach(row=>{
    const m=(row.querySelector('.av3')||{}).outerHTML,id=m&&(m.match(/manage\('([^']+)'\)/)||[])[1],s=id&&(ST||[]).find(x=>x.id===id),nm=row.querySelector('.nm');
    if(!s||!nm)return;
    nm.querySelectorAll('.tg.pay,.tg.nopay').forEach(e=>e.remove());
    const p=payOf(s);nm.insertAdjacentHTML('beforeend',p.n?`<span class="tg pay">${p.total?payInr(p.total):'FREE'}</span>`:'<span class="tg nopay">NO PAYMENT</span>');
  });
}
{const _dl=drawList;drawList=function(){_dl();try{stuDecor()}catch(e){}}}
{const _ls=loadStudents;loadStudents=async function(){await _ls();await payData(false);stuDecor()}}
{const _mg=manage;manage=function(id){
  _mg(id);
  const s=(ST||[]).find(x=>x.id===id),box=document.querySelector('#layer .box');if(!s||!box)return;
  const add=()=>{if(!document.querySelector('#layer .box')||document.getElementById('paymg'))return;const p=payOf(s);
    const items=[...p.sto.map(o=>`<div class="payrow sm1"><div class="grow"><b>${payInr(o.amount)}</b> <span class="pchip store">Store</span><div class="sm mut">${esc(o.item_title)} · ${payDay(o.at)}</div></div></div>`),
      ...p.man.map(x=>`<div class="payrow sm1"><div class="grow"><b>${x.amount?payInr(x.amount):'Free'}</b> <span class="pchip ${x.amount?'man':'free'}">${PMETH[x.method]||x.method}</span><div class="sm mut">${payDay(x.paid_on)}${x.note?' · '+esc(x.note):''}</div></div><button class="iconbtn sm" aria-label="Edit payment" onclick="payModal('${s.id}','${x.id}')">${ai('edit',15)}</button></div>`)];
    box.insertAdjacentHTML('beforeend',`<div id="paymg" class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;align-items:center"><b>💰 Payments · ${p.total?payInr(p.total):p.n?'Free':'none yet'}</b><button class="btn sm" onclick="payModal('${s.id}')">＋ Add payment</button></div>
     ${items.length?items.join(''):`<p class="sm mut" style="margin:6px 0 0">${PAY.missing?'Run supabase_v29_payments.sql once to add payments.':'No payment recorded. Joined before the store? Add what they paid.'}</p>`}</div>`)};
  payData(false).then(add);
}}

/* ---------- Students page: clean header; access requests moved to Store → Orders ---------- */
{const _rs=renderStudents;renderStudents=function(){
  _rs();
  const p=$('#pn_students');if(!p)return;
  p.querySelectorAll('.reqcard').forEach(e=>e.remove());
  [...p.querySelectorAll('.h2s')].forEach(h=>{if(/Approval requests/.test(h.textContent))h.remove()});
  const st=$('#sstats');if(st)st.style.marginTop='0';
  const pend=(ST||[]).filter(s=>s.status==='pending').length;
  p.insertAdjacentHTML('afterbegin',`<div class="phead stuhead"><div><h1>Students</h1><p class="sm mut">${stuHeadTxt()}</p></div>
    <button class="btn ghost sm" onclick="tab('payments')">${ai('payments',15)} Payments</button></div>
   ${pend?`<button class="card sdreq" onclick="ORDF.seg='req';tab('orders')">🙋 <b>${pend} new access request${pend>1?'s':''}</b><span class="sm mut">Now in Store → Orders ›</span></button>`:''}`);
}}

function stuHeadTxt(){
  const act=activeSt(),tot=PAY.ok?payRows().reduce((a,x)=>a+(x.amount||0),0):null;
  return `${act.length} student${act.length===1?'':'s'}${tot!=null?` · ${payInr(tot)} collected`:''}`;
}

/* ---------- keep the money in step with store orders ----------
   Approve, Undo and Reject change the order on the server. The payments are read again at once, so an order
   that is undone or rejected stops counting everywhere (student chip, Students header, Manage, Payments page). */
{const _as=ASTO;ASTO=async function(action,data){
  const r=await _as(action,data);
  if(r&&r.ok&&action==='order_status'){PAY.at=0;payData(true).then(payRefresh)}
  return r;
}}
function payRefresh(){
  if($('#paybody'))payDraw();
  if($('#slist'))stuDecor();
  const h=document.querySelector('.stuhead p');if(h)h.textContent=stuHeadTxt();
}
// approving a second order for the same series would count the money twice: ask first
{const _ap=stoApprove;stoApprove=function(code,btn){
  const o=SS.orders.find(x=>x.code===code),d=o&&SS.orders.find(x=>x.code!==code&&x.status==='paid'&&x.mobile===o.mobile&&x.item_id===o.item_id);
  if(!d)return _ap(code,btn);
  chAsk('Already approved for this series',`<b>${esc(o.name)}</b> already has an approved order for <b>${esc(o.item_title)}</b> (order ${esc(d.code)} · ${payInr(d.amount)}). Approving this one too counts the money twice. If it is the same payment, tap Cancel and <b>Reject</b> this order.`,'Approve anyway',async()=>{closeModal();await _ap(code,btn)});
}}

/* ---------- apply now (the shell may already be on screen) ---------- */
{const d=document.getElementById('adock');if(d)d.innerHTML=dockHtml()}
{const s=document.querySelector('.snav');if(s){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}
;(window.__p=window.__p||{})['admin18']=1;
