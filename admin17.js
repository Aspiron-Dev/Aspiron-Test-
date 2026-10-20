/* ===== Admin: Store hub v2 — Dashboard · Orders · Store setup · Reviews =====
   Orders are split by where the student stopped: payment done (verify + Approve & unlock), not paid yet
   (call / SMS / WhatsApp / Telegram to follow up), approved, rejected. Same data (cbt_admin_store 'get') and the
   same one-tap Approve & unlock (stoApprove) as before. Follow-up count + note: supabase_v28_store_followup.sql */
AI.orders='<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>';
AI.stoedit='<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>';
AI.phone='<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/>';
AI.sms='<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>';
AI.tg='<path d="M21.5 4.5L2.5 11.8l6.2 2.1 2.3 6.6 3.4-4.1 5 3.7z"/><path d="M8.7 13.9l9.3-6.7"/>';
AI.note='<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/>';

/* ---------- sections: Store hub = Dashboard · Orders · Store setup · Reviews; Approvals leaves Students ---------- */
XTRA.push('orders','stoedit');TTL.store='Store dashboard';TTL.orders='Orders';TTL.stoedit='Store setup';
HUBS.store.tabs.splice(0,HUBS.store.tabs.length,['store','Dashboard'],['orders','Orders'],['stoedit','Store setup'],['reviews','Reviews']);
{const i=HUBS.students.tabs.findIndex(x=>x[0]==='approvals');if(i>=0)HUBS.students.tabs.splice(i,1)}
MKNOWN.delete('approvals');['orders','stoedit','reviews'].forEach(k=>MKNOWN.add(k));
for(const g of APPS){
  if(g[0]==='Students'){const i=g[2].findIndex(x=>x[0]==='approvals');if(i>=0)g[2].splice(i,1)}
  if(g[0]==='Store')g[2].splice(0,g[2].length,['store','Dashboard',"tab('store')"],['orders','Orders',"tab('orders')"],['stoedit','Store setup',"tab('stoedit')"],['reviews','Reviews',"tab('reviews')"],['site','Store page',"window.open('store.html','_blank','noopener')"],['link','Copy store link',"copyText(new URL('store.html',location.href).href)"]);
}
{const _t=tab;tab=async function(t){
  if(t==='approvals')t='orders';                     // old saved tab / old links
  const r=await _t(t);if(t==='orders')return loadOrders();if(t==='stoedit')return loadSetup();return r;
}}
creStore=async function(){await tab('stoedit');if(!CA.series.length)await loadCatalog();stoEdit(-1)};

/* ---------- data ---------- */
const oSeg=o=>o.status==='paid'?'done':o.status==='rejected'?'rej':(o.payer||o.utr)?'verify':'unpaid';
const reqL=()=>(ST||[]).filter(s=>s.status==='pending');
const ordN=s=>s==='req'?reqL().length:(SS.orders||[]).filter(o=>oSeg(o)===s).length;
const todoN=()=>ordN('verify')+ordN('req');
const oTime=o=>new Date(o.created_at).getTime();
const oAgo=t=>{const m=Math.round((Date.now()-new Date(t).getTime())/6e4);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'};
const inr=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
let STOAT=0;
async function stoData(force){
  if(!force&&STOAT&&Date.now()-STOAT<20000)return{ok:true};
  const r=await ASTO('get');if(!r.ok)return r;
  SS=Object.assign(SS,{settings:r.settings||{},items:r.items||[],orders:r.orders||[]});STOAT=Date.now();
  await stoNotifyLoad();
  if(!SS.sched){SS.sched={};try{const q=await fetch(API+'/rest/v1/rpc/cbt_store_schedules',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:'{}'});if(q.ok){const j=await q.json();(j.items||[]).forEach(x=>SS.sched[x.id]=x)}else SS.sched=null}catch(e){}}
  navBadges();return r;
}
function pane(k){let p=$('#pn_'+k);if(!p){p=document.createElement('div');p.className='pane';p.id='pn_'+k;$('#root').appendChild(p)}return p}
const stoSetupMsg=r=>`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Open Supabase → SQL Editor, paste <b>supabase_v13_store.sql</b> and press Run once. Then refresh.':'Check your internet and try again.'}</p></div>`;

// every screen of the hub redraws from the same data after any action (approve, reject, save …)
stoDraw=function(){try{dashDraw()}catch(e){}try{ordDraw()}catch(e){}try{setDraw()}catch(e){}};
loadStore=async function(){
  const p=pane('store');
  p.innerHTML=`<div class="phead"><div><h1>Store dashboard</h1><p class="sm mut">Sales, payments to verify and students to follow up — at a glance.</p></div><a class="btn ghost sm" style="text-decoration:none" href="store.html" target="_blank" rel="noopener">${ai('site',15)} Open store</a></div><div id="stobody">${askel()}</div>`;
  if(!CA.series.length)loadCatalog();
  const [r,s]=await Promise.all([stoData(true),(ST||[]).length?null:A('students')]);if(s&&s.ok)ST=s.students;
  if(!r.ok){$('#stobody').innerHTML=stoSetupMsg(r);return}
  stoDraw();
  if(SS.items.length&&!('image' in SS.items[0]))stoNeedFix('Photos are switched off in the database.');
};
stoNeedFix=function(why){
  const b=$('#sebody')||$('#stobody');if(!b||$('#stofix'))return;
  b.insertAdjacentHTML('afterbegin',`<div class="card" id="stofix" style="border:2px solid var(--warn);background:var(--warnSoft)"><b>⚠️ ${esc(why)} One-time fix needed</b>
   <p class="sm" style="margin:6px 0 0">Open Supabase → SQL Editor → New query, paste the file <b>supabase_v17_store_fix.sql</b> and press Run. Then refresh this page and save the photo again.</p></div>`);
};

/* ---------- badges: Store = payments to verify; Students = access requests only ---------- */
// access requests moved here too, so Students has no approvals badge any more
{const _b=badgeOf;badgeOf=function(k){return k==='store'||k==='orders'?todoN():k==='approvals'?0:_b(k)}}
{const _hc=hubCounts;hubCounts=function(){const c=_hc();c.approvals=c.students=0;c.store=c.orders=todoN();return c}}

/* ---------- Dashboard ---------- */
SS.dp=SS.dp||'30';
const DP=[['1','Today'],['7','7 days'],['30','30 days'],['all','All time']];
function dpFrom(){if(SS.dp==='all')return 0;const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(+SS.dp-1));return d.getTime()}
function dashDraw(){
  const b=$('#stobody');if(!b||!SS.orders)return;
  const from=dpFrom(),O=SS.orders.filter(o=>oTime(o)>=from);
  const done=O.filter(o=>oSeg(o)==='done'),paidStep=O.filter(o=>oSeg(o)!=='unpaid'),rev=done.reduce((a,o)=>a+(o.amount||0),0);
  const ver=SS.orders.filter(o=>oSeg(o)==='verify').sort((a,c)=>new Date(c.paid_at||c.created_at)-new Date(a.paid_at||a.created_at));
  const un=O.filter(o=>oSeg(o)==='unpaid').sort((a,c)=>oTime(c)-oTime(a));
  const pct=(a,c)=>c?Math.round(a*100/c):0;
  // revenue of approved orders per day, last 14 days (by order date)
  const days=[...Array(14)].map((_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-13+i);return{t:d.getTime(),v:0,n:0}});
  for(const o of SS.orders)if(oSeg(o)==='done'){const t=new Date(o.created_at);t.setHours(0,0,0,0);const d=days.find(x=>x.t===t.getTime());if(d){d.v+=o.amount||0;d.n++}}
  const mx=Math.max(1,...days.map(d=>d.v)),tot14=days.reduce((a,d)=>a+d.v,0);
  // by series (in the chosen period)
  const byS={};for(const o of O){const k=o.item_title||'—',s=byS[k]=byS[k]||{t:k,n:0,p:0,v:0};s.n++;if(oSeg(o)==='done'){s.p++;s.v+=o.amount||0}}
  const SER=Object.values(byS).sort((a,c)=>c.v-a.v||c.n-a.n);
  const rq=reqL().length;
  b.innerHTML=`${rq?`<button class="card sdreq" onclick="ORDF.seg='req';tab('orders')">🙋 <b>${rq} new access request${rq>1?'s':''}</b><span class="sm mut">Approve &amp; give the access code ›</span></button>`:''}<div class="sdchips">${DP.map(([k,l])=>`<button class="${SS.dp===k?'on':''}" onclick="SS.dp='${k}';dashDraw()">${l}</button>`).join('')}</div>
   <div class="sdkpi">
    <div class="sdk sdk-rev"><span>Revenue</span><b>${inr(rev)}</b><small>${done.length} approved order${done.length===1?'':'s'}</small></div>
    <button class="sdk sdk-ver" onclick="ORDF.seg='verify';tab('orders')"><span>To verify</span><b>${ver.length}</b><small>${ver.length?'Payment done · tap to check':'All checked ✓'}</small></button>
    <button class="sdk sdk-un" onclick="ORDF.seg='unpaid';tab('orders')"><span>Not paid yet</span><b>${un.length}</b><small>Follow up · counselling</small></button>
    <div class="sdk"><span>Orders</span><b>${O.length}</b><small>${pct(done.length,O.length)}% became paid</small></div></div>
   <div class="card sdfun"><div class="sdh"><b>Where students stop</b><span class="sm mut">${DP.find(x=>x[0]===SS.dp)[1]}</span></div>
    ${[['Tapped Buy now',O.length,O.length],['Paid + sent UTR',paidStep.length,O.length],['Approved & unlocked',done.length,O.length]].map(([l,n,t],i)=>`<div class="sdfr"><span class="sdfl">${l}</span><span class="sdfb"><i style="width:${t?Math.max(n?3:0,pct(n,t)):0}%"></i></span><b>${n}</b><small>${i?pct(n,t)+'%':''}</small></div>`).join('')}</div>
   <div class="card"><div class="sdh"><b>Revenue · last 14 days</b><span class="sm mut" id="sdread">${inr(tot14)} total</span></div>
    <div class="sdbars" role="img" aria-label="Revenue of approved orders per day for the last 14 days">${days.map(d=>{const lab=new Date(d.t).toLocaleDateString('en-IN',{day:'numeric',month:'short'});return `<button class="sdbar" style="--h:${d.v?Math.max(4,Math.round(d.v*100/mx)):0}%" data-l="${lab}: ${inr(d.v)} · ${d.n} order${d.n===1?'':'s'}" aria-label="${lab}: ${inr(d.v)}" onmouseenter="sdRead(this)" onfocus="sdRead(this)" onclick="sdRead(this)"><i></i></button>`}).join('')}</div>
    <div class="sdaxis"><span>${new Date(days[0].t).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span><span>Today</span></div></div>
   <div class="sdcols">
    <div class="card"><div class="sdh"><b>✅ Payments to verify</b><button class="lnk" onclick="ORDF.seg='verify';tab('orders')">See all ›</button></div>
     ${ver.length?ver.slice(0,3).map(o=>`<div class="sdrow"><span class="oav" style="--c:${oCol(o)}">${esc(oIni(o))}</span><div class="grow"><b>${esc(o.name)}</b><div class="sm mut">${esc(o.item_title)} · ${inr(o.amount)} · UTR ${esc(o.utr||'—')}</div></div><button class="btn sm" onclick="stoApprove('${esc(o.code)}',this)">Approve</button></div>`).join(''):'<p class="sm mut">Nothing to verify. 🎉</p>'}</div>
    <div class="card"><div class="sdh"><b>📞 Follow up</b><button class="lnk" onclick="ORDF.seg='unpaid';tab('orders')">See all ›</button></div>
     ${un.length?un.slice(0,3).map(o=>`<div class="sdrow"><span class="oav" style="--c:${oCol(o)}">${esc(oIni(o))}</span><div class="grow"><b>${esc(o.name)}</b><div class="sm mut">${esc(o.item_title)} · ${oAgo(o.created_at)}${o.contact_n?` · contacted ${o.contact_n}×`:''}</div></div>${ordWa(o,true)}</div>`).join(''):'<p class="sm mut">Everyone who ordered has paid.</p>'}</div></div>
   <div class="card"><div class="sdh"><b>By test series</b><span class="sm mut">${DP.find(x=>x[0]===SS.dp)[1]}</span></div>
    ${SER.length?`<div class="sdtbl"><div class="sdtr sdth"><span>Series</span><span>Orders</span><span>Paid</span><span>Revenue</span></div>${SER.map(s=>`<div class="sdtr"><span>${esc(s.t)}</span><span>${s.n}</span><span>${s.p} <small>${pct(s.p,s.n)}%</small></span><b>${inr(s.v)}</b></div>`).join('')}</div>`:'<p class="sm mut">No orders in this period.</p>'}</div>
   <div class="card sdlink"><div class="grow"><b>Store link</b><div class="sm mut" style="word-break:break-all">${esc(stoUrl())}</div></div>
    <button class="btn ghost sm" onclick="copyText(stoUrl())">Copy</button><button class="btn ghost sm" onclick="tab('stoedit')">${ai('stoedit',14)} Store setup</button></div>`;
}
function sdRead(el){const r=$('#sdread');if(r)r.textContent=el.dataset.l;document.querySelectorAll('.sdbar.on').forEach(x=>x.classList.remove('on'));el.classList.add('on')}

/* ---------- Orders ---------- */
const ORDF={seg:'verify',q:'',d:'all'};
const OSEG=[['verify','Payment done','Verify the UTR, then Approve & unlock'],['unpaid','Not paid yet','Tapped Buy now, did not finish — follow up'],['req','Access requests','Asked for access on the website — approve to give an access code'],['done','Approved','Paid and unlocked'],['rej','Rejected','Payment could not be matched'],['all','All','Every order']];
const OCOL=['#2563eb','#0d9488','#7c3aed','#db2777','#ea580c','#0891b2','#65a30d','#4f46e5'];
const oIni=o=>(String(o.name||'?').trim()[0]||'?').toUpperCase();
const oCol=o=>{let h=0;for(const c of String(o.mobile||o.code))h=(h*31+c.charCodeAt(0))>>>0;return OCOL[h%OCOL.length]};
async function loadOrders(){
  const p=pane('orders');
  p.innerHTML=`<div class="phead"><div><h1>Orders</h1><p class="sm mut">Everyone who tapped Buy now on the store. Verify payments, and call or message students who did not pay.</p></div><button class="btn ghost sm" onclick="loadOrders()">↻ Refresh</button></div><div id="ordbody">${askel()}</div>`;
  if(!CA.series.length)loadCatalog();
  const [r,s]=await Promise.all([stoData(true),A('students')]);if(s&&s.ok)ST=s.students;
  if(!r.ok){$('#ordbody').innerHTML=stoSetupMsg(r);return}
  ordDraw();navBadges();
}
function ordList(){
  const q=ORDF.q.trim().toLowerCase(),from=ORDF.d==='all'?0:Date.now()-(+ORDF.d)*864e5;
  return (SS.orders||[]).filter(o=>(ORDF.seg==='all'||oSeg(o)===ORDF.seg)&&oTime(o)>=from&&(!q||(o.code+' '+o.mobile+' '+o.name+' '+(o.payer||'')+' '+(o.utr||'')+' '+o.item_title).toLowerCase().includes(q)))
    .sort((a,c)=>ORDF.seg==='verify'?new Date(c.paid_at||c.created_at)-new Date(a.paid_at||a.created_at):oTime(c)-oTime(a));
}
function ordDraw(){
  const b=$('#ordbody');if(!b||!SS.orders)return;
  const cur=OSEG.find(x=>x[0]===ORDF.seg)||OSEG[0];
  b.innerHTML=`<div class="oseg" role="tablist">${OSEG.map(([k,l])=>`<button role="tab" aria-selected="${ORDF.seg===k}" class="${ORDF.seg===k?'on':''} os-${k}" onclick="ORDF.seg='${k}';ordDraw()">${l}<em>${k==='all'?SS.orders.length:ordN(k)}</em></button>`).join('')}</div>
   <div class="ohint">${ORDF.seg==='verify'?'✅ Match the <b>amount</b>, <b>paid-from name</b> and <b>UTR</b> with your bank / UPI app and the screenshot on Telegram, then tap <b>Approve &amp; unlock</b> — it creates the student, makes the access code, unlocks the series and marks the order paid.':ORDF.seg==='unpaid'?'📞 These students chose a series but did not pay. Call or message them to help — the message is written for you, and every contact is counted.':ORDF.seg==='req'?'🙋 New students who tapped “Request access” on the website. <b>Approve &amp; get code</b> makes their access code; give the paid series from Store orders or the student’s page.':esc(cur[2])}</div>
   <div class="otools"><input type="search" id="ordq" placeholder="Search name, mobile, code, UTR…" value="${esc(ORDF.q)}" oninput="ORDF.q=this.value;ordListDraw()">
    <select onchange="ORDF.d=this.value;ordListDraw()" aria-label="Period">${[['all','All time'],['1','Last 24 h'],['7','Last 7 days'],['30','Last 30 days']].map(([k,l])=>`<option value="${k}" ${ORDF.d===k?'selected':''}>${l}</option>`).join('')}</select></div>
   <div id="ordl"></div>`;
  ordListDraw();
}
function ordListDraw(){
  const e=$('#ordl');if(!e)return;
  if(ORDF.seg==='req'){const q=ORDF.q.trim().toLowerCase(),R=reqL().filter(s=>!q||(s.name+' '+s.mobile).toLowerCase().includes(q)).sort((a,c)=>new Date(c.created||0)-new Date(a.created||0));
    e.innerHTML=R.length?R.map(reqCard).join(''):`<div class="card empty"><p class="sm mut">No new access requests.</p></div>`;return}
  const L=ordList();
  e.innerHTML=L.length?L.map(ordCard).join(''):`<div class="card empty"><p class="sm mut">${ORDF.q?'No order matches your search.':ORDF.seg==='verify'?'No payments waiting. 🎉':ORDF.seg==='unpaid'?'Nobody is waiting — everyone who ordered has paid.':'No orders here.'}</p></div>`;
}
function ordCard(o){
  const s=oSeg(o),dup=o.utr&&SS.orders.some(x=>x.code!==o.code&&x.utr===o.utr);
  const chip={verify:'<span class="ochip os-verify">Payment done · verify</span>',unpaid:'<span class="ochip os-unpaid">Not paid</span>',done:'<span class="ochip os-done">Approved</span>',rej:'<span class="ochip os-rej">Rejected</span>'}[s];
  const pay=o.payer||o.utr?`<div class="opay"><div><span>Paid from</span><b>${esc(o.payer||'—')}</b></div><div><span>UTR</span><b class="mono">${esc(o.utr||'—')}</b>${o.utr?`<button class="lnk" onclick="copyText('${esc(o.utr)}')">Copy</button>`:''}</div>${dup?'<div class="owarn">⚠️ This UTR is also in another order — check carefully</div>':''}</div>`:'';
  const fol=o.contact_n||o.note?`<div class="ofol">${o.contact_n?`📞 Contacted ${o.contact_n}× · last ${oAgo(o.contacted_at)}`:''}${o.note?`<div class="onote">📝 ${esc(o.note)}</div>`:''}</div>`:'';
  const act=s==='verify'?`<button class="btn sm" onclick="stoApprove('${esc(o.code)}',this)">✅ Approve &amp; unlock</button><button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','rejected')">Reject</button>`
    :s==='unpaid'?`<button class="btn ghost sm" onclick="stoApprove('${esc(o.code)}',this)" title="Use only if the payment reached you another way">Approve anyway</button><button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','rejected')">Remove</button>`
    :s==='done'?`<button class="btn ghost sm" onclick="stoUnlock('${esc(o.mobile)}')">👤 Student</button><button class="btn ghost sm" onclick="stoReply('${esc(o.code)}')">📋 Login message</button><button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','pending')">Undo</button>`
    :`<button class="btn ghost sm" onclick="stoSt('${esc(o.code)}','pending')">Undo</button>`;
  return `<div class="ocard os-${s}"><div class="otop"><span class="oav" style="--c:${oCol(o)}">${esc(oIni(o))}</span>
    <div class="grow"><b>${esc(o.name)}</b><div class="sm mut">${esc(o.mobile)} · ${oAgo(o.created_at)}</div></div>${chip}</div>
   <div class="oitem"><span>${esc(o.item_title)}</span><b>${inr(o.amount)}</b></div>
   <div class="sm mut">Order <b class="mono" style="color:var(--tx)">${esc(o.code)}</b>${o.paid_at?` · details sent ${oAgo(o.paid_at)}`:''}</div>
   ${pay}${fol}
   <div class="ocon">${ordContacts(o)}<button class="ocb" onclick="ordNote('${esc(o.code)}')" aria-label="Note">${ai('note',17)}<span>Note</span></button></div>
   <div class="oact">${act}</div></div>`;
}

/* ---------- contact: call, SMS, WhatsApp, Telegram — with a message written for the order ---------- */
const SITE=()=>CFG.SITE_NAME||'our test series';
function ordMsg(o){
  const f=String(o.name||'').trim().split(/\s+/)[0]||'there',s=oSeg(o);
  if(s==='done')return stuMsg({name:o.name,title:o.item_title,order:o.code,mobile:o.mobile});
  if(s==='verify')return `Hi ${f} 👋\nWe have received your payment details for "${o.item_title}" (order ${o.code}).\nWe are checking it now and will send your login details shortly. 🙏`;
  if(s==='rej')return `Hi ${f}, we could not match your payment for "${o.item_title}" (order ${o.code}).\nPlease send the payment screenshot and the UTR number again, and we will check it at once.`;
  return `Hi ${f} 👋\nYou started buying "${o.item_title}" (${inr(o.amount)}) on ${SITE()}, but the payment is not complete yet.\nAny doubt about the series or the payment? Just reply here — we are happy to help. 😊\nComplete it here: ${stoUrl()}#p=${o.item_id||''}\nOrder code: ${o.code}`;
}
const ordM=o=>String(o.mobile||'').replace(/\D/g,'').slice(-10);
function ordWa(o,small){return `<a class="ocb wa${small?' sm1':''}" href="https://wa.me/91${ordM(o)}?text=${encodeURIComponent(ordMsg(o))}" target="_blank" rel="noopener" onclick="ordContact('${esc(o.code)}')" aria-label="WhatsApp">${ai('wa',17)}${small?'':'<span>WhatsApp</span>'}</a>`}
function ordContacts(o){
  const m=ordM(o),t=encodeURIComponent(ordMsg(o));
  return `<a class="ocb" href="tel:+91${m}" onclick="ordContact('${esc(o.code)}')" aria-label="Call">${ai('phone',17)}<span>Call</span></a>
   <a class="ocb" href="sms:+91${m}?&body=${t}" onclick="ordContact('${esc(o.code)}')" aria-label="Text message">${ai('sms',17)}<span>SMS</span></a>
   ${ordWa(o)}
   <a class="ocb tg" href="https://t.me/+91${m}" target="_blank" rel="noopener" onclick="ordTg('${esc(o.code)}')" aria-label="Telegram">${ai('tg',17)}<span>Telegram</span></a>`;
}
// access request (a student, not an order): same contact buttons, no counting
const reqMsg=s=>`Hi ${String(s.name||'').trim().split(/\s+/)[0]||'there'} 👋\nWe received your request to join ${SITE()}. Which test series would you like? Reply here and we will help you get started.`;
function reqCard(s){
  const m=ordM(s),t=encodeURIComponent(reqMsg(s)),ord=(SS.orders||[]).find(o=>o.mobile===s.mobile&&o.status!=='rejected');
  return `<div class="ocard os-req"><div class="otop"><span class="oav" style="--c:${oCol(s)}">${esc(oIni(s))}</span>
    <div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)}${s.created?' · asked '+oAgo(s.created):''}</div></div><span class="ochip os-req">Access request</span></div>
   ${ord?`<div class="sm" style="margin-top:8px">🛒 Also has a store order: <b>${esc(ord.item_title)}</b> · ${inr(ord.amount)} · ${{verify:'payment done',unpaid:'not paid',done:'approved'}[oSeg(ord)]||''}</div>`:''}
   <div class="ocon" style="grid-template-columns:repeat(4,1fr)"><a class="ocb" href="tel:+91${m}" aria-label="Call">${ai('phone',17)}<span>Call</span></a><a class="ocb" href="sms:+91${m}?&body=${t}" aria-label="Text message">${ai('sms',17)}<span>SMS</span></a>
    <a class="ocb wa" href="https://wa.me/91${m}?text=${t}" target="_blank" rel="noopener" aria-label="WhatsApp">${ai('wa',17)}<span>WhatsApp</span></a><a class="ocb tg" href="https://t.me/+91${m}" target="_blank" rel="noopener" onclick="reqTg('${esc(s.id)}')" aria-label="Telegram">${ai('tg',17)}<span>Telegram</span></a></div>
   <div class="oact"><button class="btn sm" onclick="approve('${esc(s.id)}')">✓ Approve &amp; get code</button><button class="btn ghost sm" onclick="reject('${esc(s.id)}')">Reject</button></div></div>`;
}
function reqTg(id){const s=(ST||[]).find(x=>x.id===id);if(s){try{navigator.clipboard.writeText(reqMsg(s));toast('Message copied — paste it in Telegram')}catch(e){}}}
{const _ap=approve;approve=async function(id){await _ap(id);ordDraw();navBadges()}}
{const _rj=reject;reject=async function(id){await _rj(id);setTimeout(()=>{ordDraw();navBadges()},700)}}
// Telegram cannot fill in the text from a phone link, so the message is copied first
function ordTg(code){const o=SS.orders.find(x=>x.code===code);if(o){try{navigator.clipboard.writeText(ordMsg(o));toast('Message copied — paste it in Telegram')}catch(e){}}ordContact(code)}
async function ASTO2(code,action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_store_order',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_code:code,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
let FOLWARN=0;
async function ordContact(code){
  const o=SS.orders.find(x=>x.code===code);if(!o)return;
  const r=await ASTO2(code,'contacted');
  if(r.ok){o.contact_n=r.contact_n;o.contacted_at=r.contacted_at;setTimeout(()=>{ordListDraw();dashDraw()},400)}
  else if(r.error==='missing'&&!FOLWARN++)toast('To count follow-ups, run supabase_v28_store_followup.sql once in Supabase');
}
function ordNote(code){
  const o=SS.orders.find(x=>x.code===code);if(!o)return;
  modal(`<div class="stohd"><h2>📝 Note · ${esc(o.name)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin:2px 0 8px">Only you see this. e.g. “Will pay after 6 pm”, “Wants the schedule first”.</p>
   <textarea id="onote" maxlength="500" style="width:100%;min-height:110px">${esc(o.note||'')}</textarea>
   <div class="row stofoot"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="ordNoteSave('${esc(o.code)}',this)">Save note</button></div>`);
  stoSheet();
}
async function ordNoteSave(code,b){
  const v=$('#onote').value.trim();b.disabled=true;
  const r=await ASTO2(code,'note',{note:v});b.disabled=false;
  if(!r.ok)return toast(r.error==='missing'?'Run supabase_v28_store_followup.sql once in Supabase first':'Could not save');
  const o=SS.orders.find(x=>x.code===code);if(o)o.note=r.note;closeModal();toast('Note saved ✓');ordListDraw();
}

/* ---------- Store setup: the series on the store, payment details, link ---------- */
async function loadSetup(){
  const p=pane('stoedit');
  p.innerHTML=`<div class="phead"><div><h1>Store setup</h1><p class="sm mut">What students see on the store page: test series, prices, photos, schedules and your payment details.</p></div><a class="btn ghost sm" style="text-decoration:none" href="store.html" target="_blank" rel="noopener">${ai('site',15)} Preview store</a></div><div id="sebody">${askel()}</div>`;
  if(!CA.series.length)await loadCatalog();
  const r=await stoData(false);if(!r.ok){$('#sebody').innerHTML=stoSetupMsg(r);return}
  setDraw();
}
function setDraw(){
  const b=$('#sebody');if(!b||!SS.items)return;const s=SS.settings||{},on=SS.items.filter(x=>x.active).length;
  b.innerHTML=`<div class="card sdlink"><div class="grow"><b>Store link</b><div class="sm mut" style="word-break:break-all">${esc(stoUrl())}</div></div>
    <button class="btn ghost sm" onclick="copyText(stoUrl())">Copy link</button><a class="btn sm" style="text-decoration:none" href="store.html" target="_blank" rel="noopener">Open</a></div>
   <div class="h2s">📦 Test series on the store <span class="n">${on} shown${SS.items.length>on?` · ${SS.items.length-on} hidden`:''}</span></div>
   ${SS.items.length?SS.items.map((x,i)=>{const sold=(SS.orders||[]).filter(o=>o.item_id===x.id&&oSeg(o)==='done').length;return `<div class="card seit${x.active?'':' off'}">
     ${x.image?`<img src="${esc(x.image)}" alt="">`:`<span class="seph c-${esc(x.color||'blue')}">${esc((x.title||'?')[0])}</span>`}
     <div class="grow"><b>${esc(x.title)}</b> ${x.active?'':'<span class="chip">Hidden</span>'}${x.buy_on===false?' <span class="chip warn">🔔 Coming soon</span>':''}${x.badge?` <span class="chip">${esc(x.badge)}</span>`:''}
      <div class="sm mut">${inr(x.price)}${x.mrp?` <s>${inr(x.mrp)}</s>`:''} · ${(x.features||[]).length} features${SS.sched&&SS.sched[x.id]?' · 📅 schedule':''} · ${sold} sold</div>
      <div class="sm mut">${x.series_id?'Unlocks: '+esc((CA.series.find(z=>z.id===x.series_id)||{}).title||'series'):'<span style="color:var(--warn)">⚠️ Not linked to a series — Approve can’t unlock it</span>'}</div></div>
     ${(()=>{const n=((SS.notify||{})[x.id]||[]).length;return x.buy_on===false||n?`<button class="btn ghost sm" onclick="stoNotify('${x.id}')">🔔 ${n} waiting</button>`:''})()}<button class="btn ghost sm" onclick="stoEdit(${i})">Edit</button></div>`}).join(''):'<div class="card empty"><p class="sm mut">No test series on the store yet.</p></div>'}
   <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px"><button class="btn" onclick="stoPick()">⚡ Add from your series</button><button class="btn ghost" onclick="stoEdit(-1)">➕ Add manually</button>${SS.items.some(x=>x.series_id)?'<button class="btn ghost" id="stors" onclick="stoResync(this)">🔄 Update all from series</button>':''}</div>
   <div class="h2s">💳 Payment details</div>
   <div class="card"><p class="sm mut" style="margin-top:0">Shown on the store page. Only this panel (admin password) can change them. Every change is recorded.</p>
    <div class="g2"><div><label class="l">UPI ID</label><input type="text" id="s_upi" value="${esc(s.upi||'')}" autocapitalize="off" spellcheck="false"></div>
     <div><label class="l">Name shown in UPI apps</label><input type="text" id="s_payee" value="${esc(s.payee||'')}"></div>
     <div><label class="l">Small note on the payment step (optional)</label><input type="text" id="s_note" value="${esc(s.note||'')}" placeholder="e.g. Unlocked within 2 hours (9 am – 9 pm)"></div>
     <div><label class="l">Telegram (not used — support is SUPPORT_URL in config.js)</label><input type="text" id="s_tg" value="${esc(s.telegram||'')}" autocapitalize="off" spellcheck="false"></div></div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn" onclick="stoSaveSet(this)">Save payment details</button><button class="btn ghost" onclick="stoAudit()">🕑 Change history</button></div></div>`;
}

/* ---------- Coming soon: students who tapped "Notify me" (supabase_v31_store_soon.sql) ----------
   WhatsApp opens the launch message for one student and logs them as notified. */
async function stoNotifyLoad(){
  const r=await ALN('get');
  if(!r.ok){if(r.error==='missing')SS.notify=null;return}
  const m={};(r.notify||[]).forEach(x=>(m[x.item_id]=m[x.item_id]||[]).push(x));SS.notify=m;
}
function stoNotify(id){
  const x=SS.items.find(i=>i.id===id);if(!x)return;
  if(SS.notify===null)return toast('Run supabase_v31_store_soon.sql once in Supabase first');
  const L=(SS.notify||{})[id]||[],left=L.filter(r=>!r.notified_at).length;
  const msg=r=>`Hi ${String(r.name||'').split(' ')[0]||'there'}! 🎉 ${x.title} is now live on ${CFG.SITE_NAME||'our store'}. See it and buy here: ${stoUrl()}#x=${x.id}`;
  modal(`<div class="stohd"><h2>🔔 Waiting for ${esc(x.title)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin:2px 0 10px">${x.buy_on===false?'Buy now is <b>off</b> — students see “Coming soon”. When you launch, turn Buy now on in Edit, then message everyone here.':'Buy now is <b>on</b> — the series is live. Message everyone who is not notified yet.'}
    Tap WhatsApp: the launch message opens and the student is logged as notified.</p>
   ${L.length?L.map(r=>`<div class="arow" style="align-items:center;gap:10px"><div class="grow" style="min-width:0"><b>${esc(r.name)}</b> · ${esc(r.mobile)}
     <div class="sm mut">Asked ${oAgo(r.created_at)}${r.notified_at?` · <span style="color:var(--ok)">✓ notified ${oAgo(r.notified_at)}</span>`:''}</div></div>
     <a class="btn ${r.notified_at?'ghost':''} sm" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(waTo(r.mobile,msg(r)))}" onclick="stoNotified('${x.id}','${esc(r.mobile)}')">WhatsApp</a></div>`).join('')
    :'<p class="sm mut">Nobody has tapped “Notify me” yet.</p>'}
   ${L.length?`<div class="row stofoot"><button class="btn ghost" style="flex:1" onclick="copyText('${L.map(r=>r.mobile).join(', ')}')">📋 Copy ${L.length} number${L.length>1?'s':''}</button>${left?`<button class="btn" style="flex:1" onclick="stoNotified('${x.id}','',this)">✓ Mark ${left} as notified</button>`:''}</div>`:''}`);
  stoSheet();
}
// log as notified: one student (mobile) or everyone not notified yet (no mobile)
async function stoNotified(id,mobile,btn){
  if(btn){if(!confirm('Mark everyone who is not notified yet as notified?'))return;btn.disabled=true}
  const r=await ALN('notified',{item:id,mobile});if(btn)btn.disabled=false;
  if(!r.ok)return toast('Could not save');
  const now=new Date().toISOString();((SS.notify||{})[id]||[]).forEach(x=>{if(mobile?x.mobile===mobile:!x.notified_at)x.notified_at=now});
  if($('#layer .stohd'))stoNotify(id);setDraw();
}

/* ---------- apply now (the shell may already be on screen) ---------- */
{const d=document.getElementById('adock');if(d)d.innerHTML=dockHtml()}
{const s=document.querySelector('.snav');if(s){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}
setTimeout(async()=>{if(!PW)return;if(!(SS.orders||[]).length)await stoData(true);navBadges()},3000);
;(window.__p=window.__p||{})['admin17']=1;
